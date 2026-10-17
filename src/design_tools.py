"""Revisioned design decisions per Roblox place, never a forced global theme."""
import json
import time
from workspace_tools import spec

SCOPE = {'type': 'string', 'description': 'Stable game scope: place:<PlaceId>; for unpublished games use a local project id. Never reuse one theme for unrelated games.'}
DESIGN_TOOLS = [
    spec('design_profile_get', 'Read the design profile for this specific Roblox game. A missing profile returns a draft with no invented colors/fonts. Global constraints are English game text, preserve existing systems and manual playtesting only.', {'namespace': SCOPE}, ['namespace']),
    spec('design_profile_set', 'Persist a game-specific design profile: direction, palette, typography, spacing, components, motion and references. Merge the supplied fields. Read the profile first and pass expected_revision to avoid overwriting concurrent edits. Mark approved only when the user actually approved it; different games may use completely different styles.',
         {'namespace': SCOPE, 'name': {'type': 'string'}, 'profile': {'type': 'object', 'additionalProperties': True}, 'expected_revision': {'type': 'integer', 'minimum': 0}, 'status': {'type': 'string', 'enum': ['draft', 'approved']}}, ['namespace', 'profile', 'expected_revision'], readonly=False),
    spec('design_profile_list', 'List game-specific design profiles and revision/status without loading every profile body.', {'limit': {'type': 'integer', 'maximum': 100}}),
]

CONSTRAINTS = {'game_text_language': 'English', 'playtests': 'manual_only', 'preserve_existing_systems': True,
               'style_policy': 'Choose per game from the current request, existing art direction and supplied references; no universal aesthetic.'}


class DesignTools:
    def __init__(self, workspace):
        self.workspace = workspace

    def _db(self):
        db = self.workspace._db()
        db.execute('CREATE TABLE IF NOT EXISTS design_profiles(namespace TEXT PRIMARY KEY,name TEXT NOT NULL,profile TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL,updated REAL NOT NULL)')
        db.commit()
        return db

    def _namespace(self, args):
        value = self.workspace._text(args.get('namespace'), 'namespace', 200)
        if value.lower() in {'global', 'all', '*'}:
            raise ValueError('Design profiles belong to a specific game, not a global theme. Use place:<PlaceId> or a local project id.')
        return value

    def get(self, args):
        namespace = self._namespace(args)
        with self.workspace.lock:
            db = self._db()
            try:
                row = db.execute('SELECT * FROM design_profiles WHERE namespace=?', (namespace,)).fetchone()
            finally:
                db.close()
        if not row:
            return {'namespace': namespace, 'exists': False, 'status': 'draft', 'revision': 0,
                    'profile': {'direction': None, 'palette': {}, 'typography': {}, 'spacing': {}, 'components': {}, 'motion': {}, 'references': []},
                    'constraints': CONSTRAINTS,
                    'next_step': 'Inspect this game and the user references. Save a fitting profile; never invent a user-approved aesthetic.'}
        return {**dict(row), 'profile': json.loads(row['profile']), 'exists': True, 'constraints': CONSTRAINTS}

    @staticmethod
    def merge(previous, patch):
        output = dict(previous)
        for key, value in patch.items():
            output[key] = DesignTools.merge(output[key], value) if isinstance(value, dict) and isinstance(output.get(key), dict) else value
        return output

    def set(self, args):
        namespace = self._namespace(args)
        patch = args.get('profile')
        if not isinstance(patch, dict):
            raise ValueError('profile must be an object')
        if len(json.dumps(patch, allow_nan=False).encode()) > 65536:
            raise ValueError('Keep the design profile below 64 KiB; store reference paths instead of whole libraries')
        status = args.get('status', 'draft')
        if status not in {'draft', 'approved'}:
            raise ValueError('status must be draft or approved')
        expected = args.get('expected_revision')
        if not isinstance(expected, int) or isinstance(expected, bool) or expected < 0:
            raise ValueError('expected_revision must be the revision returned by design_profile_get')
        with self.workspace.lock:
            db = self._db()
            try:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT * FROM design_profiles WHERE namespace=?', (namespace,)).fetchone()
                actual = row['revision'] if row else 0
                if expected != actual:
                    raise ValueError('Design profile changed; read the latest revision before updating')
                profile = self.merge(json.loads(row['profile']) if row else {}, patch)
                encoded = json.dumps(profile, ensure_ascii=False, allow_nan=False)
                if len(encoded.encode()) > 65536:
                    raise ValueError('Merged design profile exceeds 64 KiB')
                name = self.workspace._text(args.get('name') or (row['name'] if row else namespace), 'name', 200)
                with db:
                    db.execute('INSERT INTO design_profiles VALUES(?,?,?,?,?,?) ON CONFLICT(namespace) DO UPDATE SET name=excluded.name,profile=excluded.profile,status=excluded.status,revision=excluded.revision,updated=excluded.updated',
                               (namespace, name, encoded, status, actual + 1, time.time()))
            finally:
                db.close()
        return self.get({'namespace': namespace})

    def list(self, args):
        limit = max(1, min(100, int(args.get('limit', 30))))
        with self.workspace.lock:
            db = self._db()
            try:
                rows = [dict(row) for row in db.execute('SELECT namespace,name,status,revision,updated FROM design_profiles ORDER BY updated DESC LIMIT ?', (limit,))]
            finally:
                db.close()
        return {'profiles': rows, 'constraints': CONSTRAINTS}

    def handlers(self):
        return {'design_profile_get': self.get, 'design_profile_set': self.set, 'design_profile_list': self.list}
