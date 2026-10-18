"""Stage upstream BW helpers/assets, execute only an explicitly confirmed plan."""
import hashlib
import json
import math
import re
import secrets
import threading
import time
from workspace_tools import spec

RUNTIME_TOOLS = [
    spec('brickwire_prepare', 'Prepare a reviewed per-call BW runtime for code targeting one Studio instance. Adds original Brickwire helpers and only needed kits/assets; does not execute or install anything. Returns plan id/hash, selected sources, asset/script metadata and the user code. Unknown assets and embedded asset scripts are rejected by default. No playtest is started.',
         {'studio_id': {'type': 'string'}, 'code': {'type': 'string'}, 'target':{'type':'string','description':'Exact model path for automatic temporary-camera framing after execution; original Studio camera is restored.'}, 'assets': {'type': 'array', 'items': {'type': 'string'}}, 'allow_embedded_scripts': {'type': 'boolean'}}, ['studio_id', 'code']),
    spec('brickwire_execute', 'Execute one previously reviewed Brickwire plan once in the bound Studio Edit datamodel. Requires exact plan id/hash and confirm=true within the user-authorized task. Refuses non-Edit mode; never starts/stops playtests. User code may change the game, so inspect it and existing instance names before confirming. No automatic retries or permanent global BW installation.',
         {'plan_id': {'type': 'string'}, 'sha256': {'type': 'string'}, 'confirm': {'type': 'boolean'}}, ['plan_id', 'sha256', 'confirm'], readonly=False),
]


def literal(value, depth=0):
    if depth > 64:
        raise ValueError('Asset data nesting exceeds 64 levels')
    if value is None:
        return 'nil'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            raise ValueError('Non-finite asset number')
        return repr(value)
    if isinstance(value, str):
        escapes = {'\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t'}
        return '"' + ''.join(escapes.get(c, '\\%03d' % ord(c) if ord(c) < 32 or ord(c) == 127 else c) for c in value) + '"'
    if isinstance(value, list):
        return '{' + ','.join(literal(v, depth + 1) for v in value) + '}'
    if isinstance(value, dict):
        return '{' + ','.join('[' + literal(str(k)) + ']=' + literal(v, depth + 1) for k, v in value.items()) + '}'
    raise ValueError('Unsupported asset data type')


class BrickwireRuntime:
    def __init__(self, libraries, gateway):
        self.root = libraries.brickwire
        self.gateway = gateway
        self.lock = threading.RLock()
        self.plans = {}
        self.cache = {}

    def source(self, relative, symbol):
        if relative not in self.cache:
            text = (self.root / relative).read_text(encoding='utf-8')
            marker = re.search(r'export const ' + re.escape(symbol) + r': string\s*=\s*', text)
            if not marker:
                raise ValueError('Upstream runtime export not found: ' + symbol)
            value, end = json.JSONDecoder().raw_decode(text[marker.end():])
            if not isinstance(value, str) or text[marker.end() + end:].strip() != ';':
                raise ValueError('Runtime export must be a literal string; TypeScript is never evaluated')
            self.cache[relative] = value
        return self.cache[relative]

    def asset(self, ident):
        if not isinstance(ident, str) or not re.fullmatch(r'[a-z0-9_]+/[a-z0-9_]+', ident):
            raise ValueError('Use an exact pack/item id from brickwire_catalog')
        pack = ident.split('/')[0]
        path = self.root / 'packs/built' / (pack + '.json')
        if not path.is_file():
            raise ValueError('Unknown asset pack: ' + pack)
        data = json.loads(path.read_text(encoding='utf-8'))
        item = next((item for item in data['index']['items'] if item['id'] == ident), None)
        if not item or ident not in data.get('data', {}):
            raise ValueError('Unknown asset id: ' + ident)
        node = data['data'][ident]

        def scripts(tree):
            return int(tree.get('c') in {'Script', 'LocalScript', 'ModuleScript'}) + sum(scripts(c) for c in tree.get('k', []))

        count = max(int(item.get('scripts', 0)), scripts(node))
        record = {'k': item['kind'], 's': item.get('size', []), 'r': data['index'].get('root', ''), 'path': item.get('path', ''), 'd': node}
        if item.get('merged'):
            record['merged'] = True
        return record, {'id': ident, 'embedded_scripts': count, 'source': path.relative_to(self.root).as_posix(),
                        'credits': str(data['index'].get('credits', 'See pack credits'))[:600]}

    def prepare(self, args):
        studio = args.get('studio_id')
        target=args.get('target')
        if target is not None and (not isinstance(target,str) or not target.strip() or len(target)>1000):
            raise ValueError('target must be an exact model path, at most 1000 characters')
        code = args.get('code')
        if not isinstance(studio, str) or not studio.strip() or len(studio) > 200:
            raise ValueError('studio_id is required')
        if not isinstance(code, str) or not code.strip() or len(code.encode()) > 80_000 or '\x00' in code:
            raise ValueError('Provide non-empty Luau code, at most 80 KiB')
        explicit = args.get('assets', [])
        if not isinstance(explicit, list) or len(explicit) > 20 or any(not isinstance(i, str) for i in explicit):
            raise ValueError('assets must contain at most 20 exact asset ids')
        ids = list(dict.fromkeys(explicit + re.findall(r'\bBW\s*[.:]\s*asset(?:Info)?\s*\(\s*[\"\x27]([a-z0-9_]+/[a-z0-9_]+)[\"\x27]', code)))
        if len(ids) > 20:
            raise ValueError('Split calls with more than 20 distinct assets')
        sources = [('shared/src/bw-helpers.generated.ts', 'BW_HELPERS_LUAU')]
        if re.search(r'\bBW\s*[.:]\s*(?:kit|kits|icon|furnish|style|styles|ui\w*|vfx\w*|cinem\w*|shots|cam\w*|cutscene\w*)\b', code):
            sources.append(('shared/src/library/bw-library.generated.ts', 'BW_LIBRARY_LUAU'))
        if ids or re.search(r'\bBW\s*[.:]\s*asset(?:Info)?\b', code):
            sources.append(('shared/src/library/bw-assets.generated.ts', 'BW_ASSETS_LUAU'))
        with self.lock:
            chunks = [self.source(path, symbol) for path, symbol in sources]
            manifest = [{'path': path, 'sha256': hashlib.sha256(value.encode()).hexdigest()} for (path, _), value in zip(sources, chunks)]
            assets, assignments = [], []
            for ident in ids:
                record, info = self.asset(ident)
                if info['embedded_scripts'] and args.get('allow_embedded_scripts') is not True:
                    raise ValueError('Asset contains embedded scripts; inspect it and explicitly allow only when the user task authorizes them: ' + ident)
                assets.append(info)
                assignments.append('BW.__assetData[' + literal(ident) + ']=' + literal(record))
            injected = '\n'.join(assignments)
            if len(injected.encode()) > 900_000:
                raise ValueError('Selected asset data exceeds 900 KiB; split the operation')
            if injected:
                chunks.append(injected)
            prelude = '\n'.join(chunks)
            compiled = prelude + '\n' + code
            if len(compiled.encode()) > 1_500_000:
                raise ValueError('Prepared call exceeds 1.5 MiB; split the operation')
            now = time.time()
            self.plans = {k: v for k, v in self.plans.items() if v['expires'] > now}
            if len(self.plans) >= 8:
                raise ValueError('Eight staged plans already exist; execute/review one or wait for expiry')
            ident = secrets.token_urlsafe(24)
            sha = hashlib.sha256((studio + '\n' + compiled).encode()).hexdigest()
            report = {'plan_id': ident, 'sha256': sha, 'studio_id': studio, 'expires': now + 600, 'runtime': 'Brickwire 3.1.0 per-call local BW',
                      'sources': manifest, 'assets': assets, 'bytes': len(compiled.encode()), 'prelude_lines': prelude.count('\n') + 1,
                      'user_code': code, 'target':target, 'executed': False, 'playtest': 'never automatically started',
                      'review': 'Review the user code and affected names before confirming. BW runtime is local to this call; BW.kit may create scripts/instances. Existing game systems are not automatically migrated.'}
            self.plans[ident] = {**report, 'compiled': compiled}
            return report

    def execute(self, args):
        if args.get('confirm') is not True:
            raise ValueError('Review the prepared operation, then pass confirm=true within the user-authorized task')
        with self.lock:
            plan = self.plans.get(args.get('plan_id', ''))
            if not plan or plan['expires'] <= time.time():
                raise ValueError('Plan expired or was already executed; prepare a fresh operation')
            if args.get('sha256') != plan['sha256']:
                raise ValueError('Plan hash differs from the reviewed operation')
            # Consume before any gateway call: an uncertain/partial result must
            # never be blindly replayed and duplicate a user's instances.
            del self.plans[plan['plan_id']]
        state = self.gateway.state({'studio_id': plan['studio_id']})
        text = '\n'.join(c.get('text', '') for c in state.get('content', []) if c.get('type') == 'text')
        if state.get('isError') or not re.search(r'Current Studio Mode:\s*Edit\b', text):
            raise ValueError('Studio must already be in Edit mode. Manual playtest policy: no automatic start/stop; plan consumed for safety.')
        result = self.gateway.call({'name': 'execute_luau', 'capture_target':plan.get('target'), 'arguments': {'studio_id': plan['studio_id'], 'datamodel_type': 'Edit', 'code': plan['compiled']}})
        return {**result, 'content': [*result.get('content', []), {'type': 'text', 'text': json.dumps({'brickwire_plan': plan['plan_id'], 'sha256': plan['sha256'], 'prelude_lines': plan['prelude_lines'], 'automatic_playtest': False, 'retry': 'Inspect actual state before preparing any further call.'})}]}

    def handlers(self):
        return {'brickwire_prepare': self.prepare, 'brickwire_execute': self.execute}
