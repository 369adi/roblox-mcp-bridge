"""Design/runtime integration checks; never starts/stops a Studio playtest."""
import json
import time
from design_tools import DesignTools
from brickwire_runtime import BrickwireRuntime, literal


class FakeGateway:
    def __init__(self, mode='Edit'):
        self.mode = mode
        self.calls = []

    def state(self, args):
        self.calls.append(('state', args))
        return {'content': [{'type': 'text', 'text': '- Current Studio Mode: ' + self.mode}]}

    def call(self, args):
        self.calls.append(('call', args))
        return {'content': [{'type': 'text', 'text': 'fixture executed'}]}


def run_creative_checks(bridge, request):
    def call(name, args, error=False):
        status, result = request(bridge.local_url, {'jsonrpc': '2.0', 'id': 93, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}, bridge.token)
        assert status == 200, result
        output = result['result']
        assert bool(output.get('isError')) == error, output
        return output if error else json.loads(output['content'][0]['text'])

    first = call('design_profile_get', {'namespace': 'place:111'})
    assert first['revision'] == 0 and not first['profile']['palette']
    call('design_profile_set', {'namespace': 'place:111', 'profile': {'palette': {'accent': '#22AAFF', 'background': '#111111'}}, 'expected_revision': 0})
    call('design_profile_set', {'namespace': 'place:222', 'profile': {'palette': {'accent': '#FF8822'}}, 'expected_revision': 0})
    updated = call('design_profile_set', {'namespace': 'place:111', 'profile': {'palette': {'accent': '#00AA77'}}, 'expected_revision': 1})
    assert updated['revision'] == 2 and updated['profile']['palette']['background'] == '#111111'
    assert updated['status'] == 'draft'
    assert call('design_profile_get', {'namespace': 'place:222'})['profile']['palette']['accent'] == '#FF8822'
    assert DesignTools(bridge.workspace).get({'namespace': 'place:111'})['revision'] == 2
    call('design_profile_set', {'namespace': 'place:111', 'profile': {}, 'expected_revision': 1}, error=True)
    call('design_profile_get', {'namespace': 'global'}, error=True)
    assert len(call('design_profile_list', {})['profiles']) >= 2
    call('roblox_call_tool', {'name': 'start_stop_play', 'arguments': {}}, error=True)

    def rejects(function):
        try:
            function()
        except ValueError:
            return
        raise AssertionError('Unsafe/invalid runtime action accepted')

    fake = FakeGateway()
    runtime = BrickwireRuntime(bridge.libraries, fake)
    plan = runtime.prepare({'studio_id': 'fixture-studio', 'code': 'return {part=type(BW.part),kit=type(BW.kit),asset=type(BW.asset)}'})
    assert len(plan['sources']) == 3 and not fake.calls and not plan['executed']
    rejects(lambda: runtime.execute({'plan_id': plan['plan_id'], 'sha256': plan['sha256'], 'confirm': False}))
    rejects(lambda: runtime.execute({'plan_id': plan['plan_id'], 'sha256': 'wrong', 'confirm': True}))
    result = runtime.execute({'plan_id': plan['plan_id'], 'sha256': plan['sha256'], 'confirm': True})
    assert result['content'][0]['text'] == 'fixture executed'
    assert fake.calls[-1][1]['arguments']['datamodel_type'] == 'Edit'
    assert fake.calls[-1][1]['arguments']['studio_id'] == 'fixture-studio'
    assert 'local BW = {}' in fake.calls[-1][1]['arguments']['code']
    rejects(lambda: runtime.execute({'plan_id': plan['plan_id'], 'sha256': plan['sha256'], 'confirm': True}))
    asset = runtime.prepare({'studio_id': 'fixture-studio', 'code': "return BW.assetInfo('vfx/ground_smash_crown_8')"})
    assert asset['assets'][0]['id'] == 'vfx/ground_smash_crown_8'
    assert 'BW.__assetData[' in runtime.plans[asset['plan_id']]['compiled']
    rejects(lambda: runtime.prepare({'studio_id': 'fixture-studio', 'code': 'return true', 'assets': ['../../bad']}))
    rejects(lambda: runtime.prepare({'studio_id': 'fixture-studio', 'code': "return BW.asset('vfx/not_a_real_asset')"}))
    scripted = BrickwireRuntime(bridge.libraries, FakeGateway())
    scripted.asset = lambda ident: ({'d': {'c': 'Script', 'n': 'Fixture', 'p': {'Source': 'return true'}}, 'k': 'model', 's': [1, 1, 1]}, {'id': ident, 'embedded_scripts': 1})
    rejects(lambda: scripted.prepare({'studio_id': 'fixture-studio', 'code': 'return true', 'assets': ['test/script']}))
    allowed = scripted.prepare({'studio_id': 'fixture-studio', 'code': 'return true', 'assets': ['test/script'], 'allow_embedded_scripts': True})
    assert allowed['assets'][0]['embedded_scripts'] == 1 and not scripted.gateway.calls
    playing = FakeGateway('Play')
    blocked = BrickwireRuntime(bridge.libraries, playing)
    pending = blocked.prepare({'studio_id': 'fixture-studio', 'code': 'return type(BW.part)'})
    rejects(lambda: blocked.execute({'plan_id': pending['plan_id'], 'sha256': pending['sha256'], 'confirm': True}))
    assert all(kind != 'call' for kind, _ in playing.calls)
    expired = runtime.prepare({'studio_id': 'fixture-studio', 'code': 'return true'})
    runtime.plans[expired['plan_id']]['expires'] = time.time() - 1
    rejects(lambda: runtime.execute({'plan_id': expired['plan_id'], 'sha256': expired['sha256'], 'confirm': True}))
    assert literal('quote"\n\x00é') == '"quote\\"\\n\\000é"'
    for ident in ('roblox-rules',):
        assert call('memory_search', {'namespace': 'global', 'id': ident})['notes']
    return ['Per-game design profiles persist, isolate styles, merge fields and reject stale revisions/global themes',
            'Real Brickwire runtime sources and selected asset data stage without execution; reviewed hash/confirmation, single use, expiry and Edit-only execution enforced',
            'Manual playtest preference persists; automatic start_stop_play is blocked through the bridge']
