"""Independent, bounded Roblox method routing. No extension or provider changes."""
import re
from workspace_tools import spec

ULTRACODE_TOOLS = [spec('ultracode', 'Optional concise task-method router: UI/code/maps/models/animation/VFX/audio. Returns at most 3 relevant methods and exact on-demand reference paths, not a giant injected prompt. No browser extension, execution, auto-Play or model switching.',
    {'query': {'type':'string'}, 'limit': {'type':'integer','minimum':1,'maximum':3}}, ['query'])]

METHODS = [
    ('ui', r'\b(ui|gui|hud|menu|menü|shop|inventory|interface|button|screen)\b', 'roblox-ui',
     'Keep the existing UI framework. Establish hierarchy, contrast, spacing and responsive constraints. Inspect rendered output after changes; use detail crops without moving the camera just to satisfy byte limits.'),
    ('code', r'\b(code|script|luau|remote|datastore|bug|fix|fehler|system|combat|quest)\b', 'roblox-code',
     'Preserve service boundaries. Validate remote types/ranges/ownership/cooldowns on the server. Clean up connections and temporary instances. Handle persistence failures without touching production data for tests.'),
    ('map', r'\b(map|terrain|island|insel|arena|world|welt|level|umgebung)\b', 'roblox-map',
     'Use measured bounds, pivots and routes. Keep deliberate scale and readable landmarks. Avoid duplicate coplanar faces; use varied prop silhouettes while preserving navigation.'),
    ('model', r'\b(model|modell|mesh|3d|prop|haus|house|wand|wall|creature|weapon)\b', 'roblox-3d-model',
     'Build a clear silhouette with named grouped geometry, correct pivots and measured extents. Make 2-3 meaningful variants for new families. No Ball shaping; avoid unintended surface overlaps.'),
    ('animation', r'\b(animation|animate|animieren|rig|pose|eclipse)\b', 'roblox-animation',
     'Use Eclipse Animator when actually accessible. Preserve rigs and existing clips, separate authoring from publishing, and ask before substituting tools. User controls Play.'),
    ('vfx', r'\b(vfx|particle|partikel|effect|effekt|beam|trail)\b', 'roblox-vfx',
     'Separate visual feedback from gameplay authority. Budget particle count/lifetime and clean up effects. Reuse verified asset IDs rather than inventing or publishing them.'),
    ('audio', r'\b(sfx|audio|sound|musik|music|ton)\b', 'roblox-sfx',
     'Use verified assets with suitable permissions. Bound concurrency and distance, preserve mix/readability and clean up playback instances; do not invent asset IDs.'),
    ('texture', r'\b(texture|textur|material|skin)\b', 'roblox-texture-gen',
     'Keep palette/material scale coherent with this game. Verify asset rights and actual tool availability. Avoid creating or uploading paid/generated assets outside the user task.'),
]


class UltraCodeTools:
    def __init__(self, libraries):
        self.libraries = libraries

    def route(self, args):
        query = args.get('query')
        if not isinstance(query,str) or not query.strip() or len(query)>4000:
            raise ValueError('query must be 1..4000 characters')
        limit=args.get('limit',3)
        if isinstance(limit,bool) or not isinstance(limit,int) or not 1<=limit<=3:
            raise ValueError('limit must be 1..3')
        selected=[m for m in METHODS if re.search(m[1],query,re.I)][:limit]
        if not selected: selected=[METHODS[1]]
        root=self.libraries.syphodev
        return {'mode':'ULTRA methods, independently implemented','execution':False,'model_changed':False,
                'methods':[{'topic':m[0],'guidance':m[3],
                    'reference':{'library':'syphodev','path':'skills/'+m[2]+'/SKILL.md',
                                 'available':(root/'skills'/m[2]/'SKILL.md').is_file()}} for m in selected],
                'reference_policy':'Optional text excerpts only; scripts/assets/setup links may be absent. No mandatory loading, auto-Play, uploads or new authority.',
                'limits':'Does not install the PlazCode extension or replicate every PlazCode feature.'}

    def handlers(self):
        return {'ultracode':self.route}
