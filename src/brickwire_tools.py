"""Search the imported Brickwire catalog without running its application."""
import json
import re
import threading
from workspace_tools import spec

BRICKWIRE_TOOLS = [
    spec('brickwire_catalog', 'Search bundled Brickwire UI/gameplay/build/VFX kits and asset-pack metadata by words or exact id. Returns real ids, options, source paths and credits, not invented assets. Read matching source with library_read. Does not install BW helpers or place anything in Studio.',
         {'query': {'type': 'string'}, 'kind': {'type': 'string'}, 'id': {'type': 'string'}, 'offset': {'type': 'integer'}, 'limit': {'type': 'integer', 'maximum': 100}}),
    spec('brickwire_guide', 'Get the imported Brickwire feature map and precise reference entry points. These are reference sources; app services, plugins and executable helpers are not installed automatically.'),
]


class BrickwireTools:
    def __init__(self, libraries):
        self.libraries = libraries
        self.lock = threading.Lock()
        self.rows = None

    def _catalog(self):
        with self.lock:
            if self.rows is not None:
                return self.rows
            root = self.libraries.brickwire
            rows = []
            source = 'shared/src/library/catalog.ts'
            text = (root / source).read_text(encoding='utf-8')
            # Parse only literal catalog declarations. Never evaluate TypeScript.
            for match in re.finditer(r'^\s*k\(((?:"(?:\\.|[^"\\])*"\s*,?\s*)+)\),?\s*$', text, re.M):
                values = [json.loads(s) for s in re.findall(r'"(?:\\.|[^"\\])*"', match[1])]
                if len(values) >= 5:
                    ident, kind, name, _, desc, *options = values
                    rows.append({'id': ident, 'kind': kind, 'name': name, 'description': desc,
                                 'options': options[0] if options else '', 'tags': options[1] if len(options) > 1 else '',
                                 'source': source, 'implementation': 'shared/src/library/bw-library.luau', 'type': 'kit'})
            for path in sorted((root / 'packs/built').glob('*.json')):
                data = json.loads(path.read_text(encoding='utf-8'))
                index = data.get('index') if isinstance(data, dict) else None
                if not isinstance(index, dict):
                    continue
                for item in index.get('items', []):
                    rows.append({**{key: item[key] for key in ('id', 'name', 'kind', 'category', 'tags', 'size', 'className', 'scripts') if key in item},
                                 'type': 'asset', 'pack': index.get('id'), 'source': path.relative_to(root).as_posix(),
                                 'credits': str(index.get('credits', 'See source pack credits'))[:400]})
            if not rows:
                raise ValueError('Bundled Brickwire catalog is missing')
            self.rows = rows
            return rows

    def catalog(self, args):
        words = str(args.get('query', '')).casefold().split()
        kind, ident = args.get('kind'), args.get('id')
        limit = max(1, min(100, int(args.get('limit', 20))))
        offset = max(0, int(args.get('offset', 0)))
        matches = [row for row in self._catalog()
                   if (not kind or row.get('kind') == kind) and (not ident or row['id'] == ident)
                   and all(word in json.dumps({k: v for k, v in row.items() if k != 'credits'}, ensure_ascii=False).casefold() for word in words)]
        return {'library': 'brickwire', 'matches': matches[offset:offset + limit], 'total_matches': len(matches),
                'next_offset': offset + limit if len(matches) > offset + limit else None,
                'reference_only': True, 'warning': 'BW.* requires the Brickwire runtime, not just this reference import. Asset availability and third-party permissions are not independently verified. Inspect scripts before inserting models.'}

    def guide(self, _):
        rows = self._catalog()
        return {'library': 'brickwire', 'version': '3.1.0', 'kit_count': sum(row['type'] == 'kit' for row in rows),
                'asset_count': sum(row['type'] == 'asset' for row in rows),
                'references': {'library_api': 'docs/LIBRARY.md', 'asset_packs': 'docs/PACKS.md',
                    'helpers': 'shared/src/bw-luau.ts', 'kits': 'shared/src/library/bw-library.luau',
                    'assets_runtime': 'shared/src/library/bw-assets.luau', 'catalog': 'shared/src/library/catalog.ts',
                    'skills': 'bridge/skills/packs/brickwire-50', 'studio_tools': 'bridge/src/studio2-tools.ts',
                    'composites': 'bridge/src/composites.ts', 'license': 'LICENSE'},
                'workflow': ['Use cached context; load a selected reference only when needed, not before every task.',
                    'For genuine design only, load this game profile once per chat if needed; skip for repairs/systems/FAST.',
                    'For real BW calls, use brickwire_prepare with the selected studio_id/code/assets, review the returned plan/hash, then brickwire_execute with confirm=true within the requested task. Helpers/assets are prepended to that call, not installed globally.',
                    'Search brickwire_catalog for real kit/asset ids. Inspect implementation and docs before using it.',
                    'Use official roblox_* tools for Studio access and screen_capture(studio_id) for Studio-rendered images only; desktop/window/region fallback is forbidden.',
                    'Preserve existing project systems; all game text must be English. Inspect Edit-mode results; the user handles playtests manually.',
                    'Save project decisions in memory_put. Do not store tokens, passwords or entire codebases.'],
                'not_enabled': ['Brickwire app services, provider credentials, installers and plugins',
                                'Automatic BW runtime injection or automatic asset insertion',
                                'Automatic execution of imported skills/scripts or publishing games']}

    def handlers(self):
        return {'brickwire_catalog': self.catalog, 'brickwire_guide': self.guide}
