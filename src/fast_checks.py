"""Deterministic speed/privacy checks; no game mutations or desktop capture."""
import base64
import io
import json
import tempfile
from pathlib import Path
from PIL import Image
from roblox_gateway import RobloxGateway
from roblox_rules import RULES, SERVER_INSTRUCTIONS, LEGACY_RULE_IDS
from builder_tools import BuilderTools
from auto_update import AutoUpdater, safe_member, version_tuple


def run_fast_checks(bridge, request):
    assert len(RULES.splitlines()) <= 25 and len(SERVER_INSTRUCTIONS.splitlines()) <= 30
    notes = bridge.workspace.recall({'namespace': 'global'})['notes']
    assert any(n['id'] == 'roblox-rules' for n in notes)
    assert not any(n['id'] in LEGACY_RULE_IDS for n in notes)
    context = bridge.context
    first = context.get({'chat_id': 'fixture', 'include_skill': True, 'design_namespace': 'place:333'})
    assert set(first['context']) == {'rules', 'skill', 'design'}
    assert len(first['context']['skill'].splitlines()) <= 40
    assert context.get({'chat_id': 'fixture', 'include_skill': True, 'design_namespace': 'place:333'})['skipped']
    assert context.get({'chat_id': 'fast', 'mode': 'FAST', 'include_skill': True})['skipped']
    assert context.get({'chat_id': 'fast', 'include_skill': True})['skipped']
    assert context.get({'chat_id': 'read', 'rules_read': True, 'include_skill': True, 'design_namespace': 'place:333'})['skipped']
    assert context.get({'chat_id': 'read', 'include_skill': True, 'design_namespace': 'place:333'})['skipped']
    assert not context.get({'chat_id': 'separate'})['skipped']
    large = {'content': [{'type': 'text', 'text': 'A' * 6000}, {'type': 'text', 'text': 'B' * 3000}], 'structuredContent': {'dump': 'X' * 10000}, 'isError': True}
    compact = RobloxGateway.compact(large)
    assert compact['isError'] and 'structuredContent' not in compact
    assert sum(len(c['text']) for c in compact['content']) <= 4000
    assert 'gekürzt' in compact['content'][-1]['text'] and len(large['content'][0]['text']) == 6000
    png = io.BytesIO()
    Image.new('RGB', (1920, 1080), '#663399').save(png, format='PNG')
    gateway = RobloxGateway(lambda *_: None)
    calls = []
    def provider(params):
        calls.append(params)
        return {'content': [{'type': 'image', 'mimeType': 'image/png', 'data': base64.b64encode(png.getvalue()).decode()}]}
    gateway._capture_provider = provider
    gateway._capture_scene = lambda *_: {'center':[0,0,0],'size':[10,10,10],'camera':[0,0,10,1,0,0,0,1,0,0,0,1],'fov':70}
    with tempfile.TemporaryDirectory() as directory:
        gateway.capture_dir = Path(directory)
        small = gateway.capture({'studio_id': 'fixture'})
        img = Image.open(io.BytesIO(base64.b64decode(small['content'][0]['data'])))
        assert img.size == (1280, 720) and img.format == 'JPEG'
        assert json.loads(small['content'][-1]['text'])['automatic_resolution_reduction'] is False
        file_result = gateway.capture({'studio_id': 'fixture', 'return_mode': 'file', 'width': 640, 'format': 'png', 'skip_unchanged': False})
        metadata = json.loads(file_result['content'][0]['text'])
        assert metadata['local_only'] and metadata['width'] == 640 and Path(metadata['path']).is_file()
        assert not any(c['type'] == 'image' for c in file_result['content'])
        assert calls[-1].keys() == {'studio_id', 'capture_id'}
        for args in ({'region': {}}, {'studio_id': 'fixture', 'max_width': 0}, {'studio_id': 'fixture', 'quality': True}):
            try:
                gateway.capture(args)
                raise AssertionError('Bad capture accepted')
            except ValueError:
                pass
    class Fake:
        def call(self, args):
            self.last = args
            return {'content': [{'type': 'text', 'text': 'ok'}]}
    fake = Fake()
    builder = BuilderTools(fake)
    builder.run({'studio_id': 'test', 'module': 'Z6', 'code': 'return type(builder)'})
    code = fake.last['arguments']['code']
    assert 'Clone()' in code and 'clone:Destroy()' in code and 'TryBeginRecording' in code and 'FinishRecording' in code
    assert fake.last['arguments']['datamodel_type'] == 'Edit'
    builder.summary({'studio_id': 'test', 'path': 'Workspace.House'})
    assert 'GetBoundingBox' in fake.last['arguments']['code']
    builder.check({'studio_id': 'test', 'path': 'Workspace.House'})
    assert '#examples<10' in fake.last['arguments']['code']
    for name in ('../evil.exe', '_internal/../../evil', 'C:/evil', '_internal\\evil', 'identity.dpapi'):
        try:
            safe_member(name)
            raise AssertionError('Unsafe archive path accepted')
        except ValueError:
            pass
    assert safe_member('_internal/pkg/file.py') and version_tuple('v5.6.0') > version_tuple('5.5.0')
    updater = AutoUpdater('5.5.0', bridge.workspace.data_dir, lambda *_: None, repository='')
    assert updater.check()['status'] == 'not_configured' and not updater.apply_on_exit()
    return ['Compact rules migration, optional once-per-chat bundle and FAST skip verified',
            'Readable 1280x720 JPEG default, full local frames, file-only output and invalid capture arguments verified without OS capture',
            'Luau text/structured payload capped at 4000 characters, errors preserved',
            'Edit-only builder wrapping, compact model helpers and update path guards verified']
