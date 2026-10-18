"""High-detail regression: a hard byte cap must never create tiny images."""
import base64
import io
import json
import tempfile
from pathlib import Path
from PIL import Image
from capture_tools import StudioCaptures
from roblox_gateway import RobloxGateway


def run_quality_checks(bridge):
    noisy=Image.effect_noise((1280,720),100).convert('RGB')
    full,data,fmt,quality=StudioCaptures.encode(noisy,{})
    assert full.size==(1280,720) and quality>=70 and len(data)>6000
    try:
        StudioCaptures.encode(noisy,{'max_bytes':6000})
        raise AssertionError('Tiny byte cap silently accepted')
    except ValueError as exc:
        assert 'no automatic shrinking' in str(exc)
    same,*_=StudioCaptures.encode(noisy,{'max_tokens':4000})
    assert same.size==(1280,720)
    preview,*_=StudioCaptures.encode(noisy,{},preview=True)
    assert preview.size==(640,360)
    studio=RobloxGateway(lambda *_:None)
    raw=io.BytesIO(); noisy.save(raw,format='PNG')
    camera_calls=[]
    def provider(params):
        camera_calls.append(params)
        return {'content':[{'type':'image','mimeType':'image/png','data':base64.b64encode(raw.getvalue()).decode()}]}
    studio._capture_provider=provider
    studio._capture_scene=lambda *_:{'center':[0,0,0],'size':[2,2,2],'camera':[0,0,0,1,0,0,0,1,0,0,0,1],'fov':70}
    with tempfile.TemporaryDirectory() as folder:
        studio.capture_dir=Path(folder)
        result=studio.capture({'studio_id':'fixture','max_bytes':6000})
        assert result['isError']
        meta=json.loads(result['content'][0]['text'])
        assert meta['status']=='image_budget_exceeded' and Path(meta['path']).is_file()
        assert set(camera_calls[-1])=={'studio_id','capture_id'}
        detail=studio.capture_get({'capture_id':meta['capture_id'],'view':0,'crop':[0,0,800,600]})
        assert not detail.get('isError')
        image=Image.open(io.BytesIO(base64.b64decode(detail['content'][0]['data'])))
        assert image.size==(800,600)
    route=bridge.ultracode.route({'query':'UI shop menu plus Luau remote fix and map arena','limit':3})
    assert len(route['methods'])==3 and not route['execution'] and not route['model_changed']
    assert all(m['reference']['available'] for m in route['methods'])
    assert len(json.dumps(route))<4000
    assert (bridge.libraries.syphodev/'LICENSE.txt').is_file()
    assert (bridge.libraries.syphodev/'ATTRIBUTION.md').is_file()
    return ['1280x720 detail retained; tiny explicit caps fail without shrinking or camera zoom; originals/crops recoverable',
            'Independent bounded UltraCode method routing and separately credited on-demand text references verified']
