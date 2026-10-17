"""End-to-end HTTP reference and skill checks, with temporary user libraries."""
import json
import tempfile
from pathlib import Path
from PIL import Image
from library_tools import LibraryTools
from workspace_tools import WorkspaceTools


def run_library_checks(bridge, request):
    def raw(name, args, error=False):
        status, response = request(bridge.local_url, {'jsonrpc': '2.0', 'id': 87, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, bridge.token)
        assert status == 200, response
        result = response['result']
        assert bool(result.get('isError')) == error, result
        return result

    def call(name, args):
        return json.loads(raw(name, args)['content'][0]['text'])

    libraries = call('library_list', {})['libraries']
    assert {'brickwire', 'builtin-roblox'} <= {row['library'] for row in libraries}
    skills = call('skills_list', {'library': 'brickwire', 'limit': 100})['skills']
    assert len(skills) == 50, len(skills)
    profile = call('skill_read', {'library': 'builtin-roblox', 'path': 'roblox-probuilder/SKILL.md'})
    assert profile['name'] == 'roblox-probuilder' and profile['content']
    for ident in ('roblox-rules',):
        assert call('memory_search', {'namespace': 'global', 'id': ident})['notes']
    fresh_store = WorkspaceTools(bridge.workspace.data_dir)
    assert fresh_store.recall({'namespace': 'global', 'id': 'roblox-rules'})['notes']
    assert any(row['name'] == 'roblox-probuilder' for row in call('skills_list', {'query': 'ProBuilder'})['skills'])
    selected = call('skill_read', {'library': 'brickwire', 'path': skills[0]['path']})
    assert selected['content'] and selected['sha256'] and selected['resolved_references']
    # Some upstream skill links use a wrong ../../_shared path. Preserve the
    # upstream text honestly; the actual shared rules remain independently readable.
    call('library_read', {'library': 'brickwire', 'path': 'bridge/skills/packs/brickwire-50/_shared/GLOBAL_RULES.md'})
    assert call('brickwire_guide', {})['asset_count'] == 2370
    assert call('brickwire_guide', {})['kit_count'] == 101
    assert call('brickwire_catalog', {'id': 'cottage'})['matches'][0]['kind'] == 'build'
    assert call('brickwire_catalog', {'query': 'forcefield', 'limit': 2})['total_matches'] > 2
    raw('library_read', {'library': 'brickwire', 'path': '../../bridge_server.py'}, error=True)
    raw('library_remove', {'library': 'brickwire'}, error=True)
    with tempfile.TemporaryDirectory(prefix='bridge-library-test-') as directory:
        root = Path(directory)
        (root / 'Example.luau').write_text('return {ReferenceWidget = true}', encoding='utf-8')
        Image.new('RGB', (20, 10), 'blue').save(root / 'Reference.png')
        entry = call('library_add', {'path': directory, 'name': 'Test reference'})
        ident = entry['library']
        reopened = LibraryTools(WorkspaceTools(bridge.workspace.data_dir))
        assert any(e['library'] == ident for e in reopened.entries()['libraries'])
        assert call('library_search', {'library': ident, 'query': 'ReferenceWidget'})['matches']
        assert raw('library_read', {'library': ident, 'path': 'Reference.png'})['content'][0]['type'] == 'image'
        assert call('library_remove', {'library': ident})['source_files_preserved']
        assert (root / 'Example.luau').exists()
    assert call('memory_search', {'namespace': 'global', 'id': 'roblox-rules'})['notes']
    assert call('memory_search', {'namespace': 'global', 'id': 'roblox-rules'})['notes']
    assert call('memory_search', {'namespace': 'global', 'id': 'roblox-rules'})['notes']
    assert call('memory_search', {'namespace': 'global', 'id': 'roblox-rules'})['notes']
    return ['ProBuilder profile and persistent Eclipse Animator / screenshot / quality preferences accessible through authenticated MCP',
            'Brickwire bundled: 50 discoverable skills, 101 kits, 2370 searchable asset entries and source references',
            'reference library registry persistence, bounded search/read, image forwarding, traversal rejection and non-destructive unregister']
