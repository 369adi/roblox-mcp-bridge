"""Temporary-camera success/error/timeout fixtures; never move a real Studio camera."""
import base64
import io
import json
import tempfile
from pathlib import Path
from PIL import Image
from roblox_gateway import RobloxGateway
from capture_tools import StudioCaptures
from pc_mcp_bridge import result_text


def run_camera_restore_checks(bridge):
    studio=RobloxGateway(lambda *_:None)
    snapshot={'center':[12,5,8],'size':[4,6,8],'camera':[0,20,40,1,0,0,0,1,0,0,0,1],
              'focus':[0,5,0,1,0,0,0,1,0,0,0,1],'fov':70,'camera_type':'Fixed'}
    studio._capture_scene=lambda *_:snapshot
    data=io.BytesIO(); Image.new('RGB',(1280,720),'#22aacc').save(data,format='PNG')
    state={'moved':False,'fail':None,'restores':0,'params':None}
    def provider(params):
        state['params']=params; state['moved']=True
        if state['fail']=='error': return result_text('Fixture renderer failed',is_error=True)
        if state['fail']=='timeout': raise TimeoutError('Fixture renderer timed out')
        return {'content':[{'type':'image','mimeType':'image/png','data':base64.b64encode(data.getvalue()).decode()}]}
    def execute(args):
        assert args['visual'] is False and args['arguments']['datamodel_type']=='Edit'
        code=args['arguments']['code']
        assert 'cam.CFrame=cf' in code and 'cam.Focus=focus' in code and 'cam.CameraType' in code
        assert 'IsEdit' in code and 'HumanoidRootPart' not in code
        state['restores']+=1; state['moved']=False
        return result_text('restored')
    studio._capture_provider=provider; studio.call=execute
    with tempfile.TemporaryDirectory() as folder:
        studio.capture_dir=Path(folder)
        captured=studio.capture({'studio_id':'fixture','target':'Workspace.NewModel'})
        meta=json.loads(captured['content'][-1]['text'])
        assert meta['camera_restore']=='verified_after_temporary_views' and not state['moved']
        assert state['params']['look_at_position']==snapshot['center'] and state['restores']==1
        for failure in ('error','timeout'):
            state['fail']=failure
            try: studio.capture({'studio_id':'fixture','target':'Workspace.NewModel'})
            except (RuntimeError,TimeoutError): pass
            else: raise AssertionError('Failed render accepted')
            assert not state['moved']
        assert state['restores']==3
        state['fail']=None
        studio.call=lambda _:result_text('Studio disconnected during cleanup',is_error=True)
        try: studio.capture({'studio_id':'fixture','target':'Workspace.NewModel'})
        except RuntimeError as exc: assert 'camera_restore_failed' in str(exc)
        else: raise AssertionError('Restoration failure was silently accepted')
    return ['Target-camera framing restores and verifies CFrame/Focus/FOV/type on success, render failure and timeout; recovery failure reported; no avatar/Play changes (fixtures)']
