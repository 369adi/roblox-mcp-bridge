"""Bounded Studio renderer images: previews, contact sheets, local retrieval."""
import base64
import hashlib
import io
import json
import math
import secrets
import re
import threading
import time
from collections import OrderedDict
from PIL import Image, ImageDraw, ImageChops
from pc_mcp_bridge import result_text


def integer(args, key, default, minimum, maximum):
    value = args.get(key, default)
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError(f'{key} must be an integer in {minimum}..{maximum}')
    return value


def vector(value):
    if not isinstance(value, list) or len(value) != 3 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in value):
        raise ValueError('Camera vectors require three finite numbers')
    return value


class StudioCaptures:
    def __init__(self, gateway):
        self.gateway = gateway
        self.saved = OrderedDict()
        self.hashes = OrderedDict()
        self.lock = threading.Lock()

    @staticmethod
    def encode(image, args, preview=False):
        width = integer(args, 'width', args.get('max_width', 1280), 64, 1920)
        height = integer(args, 'height', max(36, round(width * 9 / 16)), 36, 1080)
        quality = integer(args, 'quality', 82, 1, 100)
        fmt = args.get('format', 'jpeg')
        if fmt not in ('jpeg', 'png', 'webp'):
            raise ValueError('format must be jpeg, webp or png')
        # Encoded bytes do not predict visual tokens. Never derive resolution from max_tokens.
        if 'max_tokens' in args:
            integer(args, 'max_tokens', 4000, 1, 1000000)  # Deprecated compatibility hint only.
        budget = integer(args, 'max_bytes', 1024 * 1024, 1500, 8 * 1024 * 1024)
        image = image.copy()
        image.thumbnail((min(width, 640) if preview else width, min(height, 360) if preview else height), Image.Resampling.LANCZOS)
        floor = min(quality, 70)
        for _ in range(20):
            stream = io.BytesIO()
            options = {'quality': quality} if fmt in ('jpeg', 'webp') else {'optimize': True}
            image.save(stream, format=fmt.upper(), **options)
            data = stream.getvalue()
            if len(data) <= budget:
                return image, data, fmt, quality
            if fmt != 'png' and quality > floor:
                quality = max(floor, quality - 6)
            else:
                raise ValueError('max_bytes is too small at the requested resolution/quality. Increase it or explicitly request a preview; no automatic shrinking, truncation or camera zoom.')
        raise ValueError('Image budget could not be met; no partial data returned')

    @staticmethod
    def decode(result):
        if result.get('isError'):
            raise RuntimeError('Studio capture failed: ' + ' '.join(c.get('text', '')[:300] for c in result.get('content', [])))
        block = next((c for c in result.get('content', []) if c.get('type') == 'image'), None)
        if not block or len(block.get('data', '')) > 45000000:
            raise ValueError('Studio returned no bounded rendered image; no desktop fallback')
        raw = base64.b64decode(block['data'], validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.width * image.height > 40000000:
                raise ValueError('Studio image exceeds pixel limit')
            return image.convert('RGB')

    def scene(self, studio, target):
        from builder_tools import RESOLVE
        path = 'game.Workspace' if target is None else target
        if not isinstance(path, str) or not path or len(path) > 1000:
            raise ValueError('target must be an exact instance path')
        code = RESOLVE + '\nlocal t=resolve(' + json.dumps(path, ensure_ascii=False) + ''')
local cam=workspace.CurrentCamera
local p,s
if t:IsA('Model') then p,s=t:GetBoundingBox()
elseif t:IsA('BasePart') then p,s=t.CFrame,t.Size
else p,s=CFrame.new(0,0,0),Vector3.new(20,20,20) end
return game:GetService('HttpService'):JSONEncode({center={p.X,p.Y,p.Z},size={s.X,s.Y,s.Z},camera={cam.CFrame:GetComponents()},fov=cam.FieldOfView})
'''
        result = self.gateway.call({'name': 'execute_luau', 'arguments': {'studio_id': studio, 'datamodel_type': 'Edit', 'code': code}})
        if result.get('isError'):
            raise RuntimeError('Cannot read target/camera; no screenshot attempted')
        text = '\n'.join(c.get('text', '') for c in result.get('content', []))
        # Official renderer may prefix Luau's returned string with a label.
        decoder = json.JSONDecoder()
        for index, char in enumerate(text):
            if char == '{':
                try:
                    info, _ = decoder.raw_decode(text[index:])
                    if {'center', 'size', 'camera', 'fov'} <= info.keys():
                        return info
                except (ValueError, TypeError):
                    continue
        raise ValueError('Studio did not provide target bounding box/camera metadata')

    def capture(self, args):
        allowed = {'studio_id','capture_id','camera_position','look_at_position','max_width','width','height','quality','format','max_bytes','max_tokens','return_mode','output','views','target','padding','fov','hide_ui','isolate','radius','neutral_lighting','compare_to','annotate','skip_unchanged'}
        if set(args) - allowed:
            raise ValueError('Unknown/desktop/window/region capture arguments are forbidden')
        studio = args.get('studio_id')
        if not isinstance(studio, str) or not studio.strip() or len(studio) > 200:
            raise ValueError('studio_id required; no desktop fallback')
        requested_id = args.get('capture_id')
        if requested_id is not None and (not isinstance(requested_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', requested_id)):
            raise ValueError('capture_id must contain 1..80 letters, digits, underscores or hyphens')
        if args.get('isolate') or args.get('neutral_lighting') or args.get('annotate'):
            raise ValueError('This Studio renderer has no safe isolation/neutral-lighting/part-overlay API. Options are not silently ignored; no scene changes made.')
        if args.get('fov') is not None:
            raise ValueError('Custom FOV is not supported by the official temporary-camera renderer; current FOV is used and scene is not modified.')
        mode = args.get('return_mode', 'file' if args.get('output') == 'file' else 'inline')
        if mode not in ('preview', 'inline', 'file'):
            raise ValueError('return_mode must be preview/file/inline')
        # Validate output limits before asking Studio to render anything.
        self.encode(Image.new('RGB', (2, 2)), args, mode == 'preview')
        views = args.get('views', [{}])
        if not isinstance(views, list) or not 1 <= len(views) <= 4:
            raise ValueError('views must contain 1..4 views')
        compare = args.get('compare_to')
        with self.lock:
            previous = self.saved.get(compare) if compare else None
            if compare and not previous:
                raise ValueError('compare_to is unknown/expired; capture again')
            if previous and previous['studio_id'] != studio:
                raise ValueError('compare_to belongs to another Studio')
            read_scene = getattr(self.gateway, '_capture_scene', self.scene)
            info = read_scene(studio, args.get('target'))
            rendered, cameras = [], []
            for view in views:
                if isinstance(view, str):
                    view = {'preset': view}
                if not isinstance(view, dict) or set(view) - {'preset','camera_position','look_at_position'}:
                    raise ValueError('Each view is a preset or camera_position/look_at_position pair')
                params = {'studio_id': studio, 'capture_id': requested_id if requested_id and len(views)==1 else 'Studio_' + secrets.token_hex(8)}
                camera = {k: args[k] for k in ('camera_position','look_at_position') if k in args}
                camera.update({k:v for k,v in view.items() if k != 'preset'})
                if 'preset' in view or args.get('target') and not camera:
                    preset = view.get('preset', 'iso')
                    directions = {'front': (0,0,-1),'back':(0,0,1),'left':(-1,0,0),'right':(1,0,0),'top':(0,1,.001),'iso':(1,.7,1)}
                    if preset not in directions:
                        raise ValueError('Unknown camera preset')
                    padding = args.get('padding', 1.2)
                    if isinstance(padding, bool) or not isinstance(padding,(int,float)) or not math.isfinite(padding) or not 1 <= padding <= 5:
                        raise ValueError('padding must be in 1..5')
                    direction = directions[preset]
                    length = math.sqrt(sum(x*x for x in direction))
                    radius = math.sqrt(sum(x*x for x in info['size'])) / 2
                    # Spherical framing respects portrait/narrow viewport too (conservative).
                    distance = max(1, radius * padding / math.sin(math.radians(min(info['fov'], 40))/2))
                    camera = {'camera_position': [info['center'][i]+direction[i]/length*distance for i in range(3)], 'look_at_position': info['center']}
                if camera and set(camera) != {'camera_position','look_at_position'}:
                    raise ValueError('Provide both camera_position and look_at_position')
                for key, value in camera.items():
                    params[key] = vector(value)
                if camera and camera['camera_position'] == camera['look_at_position']:
                    raise ValueError('Camera and target must differ')
                rendered.append(self.decode(self.gateway._capture_provider(params)))
                cameras.append({'position': camera.get('camera_position'), 'look_at': camera.get('look_at_position'),
                                'original_cframe': info['camera'] if info else None, 'fov': info['fov'] if info else None})
            width = integer(args, 'width', args.get('max_width', 1280), 64, 1920)
            height = integer(args, 'height', round(width*9/16), 36, 1080)
            columns = 2 if len(rendered)>1 else 1
            rows = math.ceil(len(rendered)/columns)
            sheet = Image.new('RGB',(width,height),(24,24,24))
            for index, original in enumerate(rendered):
                img=original.copy()
                cell = (width//columns,height//rows)
                img.thumbnail(cell,Image.Resampling.LANCZOS)
                x,y=(index%columns)*cell[0],(index//columns)*cell[1]
                sheet.paste(img,(x+(cell[0]-img.width)//2,y+(cell[1]-img.height)//2))
            if previous:
                old = Image.open(previous['path']).convert('RGB'); old.thumbnail((width//2,height))
                current=sheet.copy(); current.thumbnail((width//2,height))
                pair=Image.new('RGB',(width,height),(24,24,24)); pair.paste(old,(0,0)); pair.paste(current,(width//2,0)); sheet=pair
            digest=hashlib.sha256(sheet.tobytes()+str(sheet.size).encode()).hexdigest()
            key=json.dumps({'studio':studio,'target':args.get('target'),'views':views,'cameras':cameras,'size':sheet.size,'compare':compare},sort_keys=True)
            meta={'studio_id':studio,'hash':digest,'cameras':cameras,'desktop_fallback':False,
                  'camera_restore':'Official renderer uses temporary camera positions; no bridge scene edits',
                  'hide_ui':'Studio renderer only; native UI/gizmo toggles are not exposed',
                  'visual_tokens':'model-dependent; encoded bytes are not image tokens',
                  'automatic_resolution_reduction':False}
            if args.get('skip_unchanged',False) and self.hashes.get(key)==digest:
                previous_id=next((ident for ident,saved in reversed(self.saved.items()) if saved['metadata']['hash']==digest and saved['studio_id']==studio),None)
                return result_text({**meta,'status':'unchanged','capture_id':previous_id,
                                    'next_step':'Use capture_get if this image has not been seen in the current chat.'})
            folder=getattr(self.gateway,'capture_dir',None)
            if folder is None:
                raise ValueError('Capture storage not configured')
            folder.mkdir(parents=True,exist_ok=True)
            ident='Studio_'+secrets.token_hex(12)
            path=folder/(ident+'.png')
            sheet.save(path,format='PNG')
            frames=[]
            for index, frame in enumerate(rendered):
                frame_path=folder/(ident+'_view'+str(index)+'.png')
                frame.save(frame_path,format='PNG')
                frames.append({'path':frame_path,'resolution':list(frame.size)})
            self.saved[ident]={'path':path,'frames':frames,'studio_id':studio,'metadata':meta,'created':time.time()}
            while len(self.saved)>64: self.saved.popitem(last=False)
            meta.update(capture_id=ident,path=str(path),local_only=True,full_resolution=list(sheet.size),
                        source_views=[{'index':i,'resolution':f['resolution']} for i,f in enumerate(frames)])
            if mode=='file':
                self.hashes[key]=digest
                while len(self.hashes)>128: self.hashes.popitem(last=False)
                return result_text({**meta,'width':sheet.width,'height':sheet.height,'format':'png','bytes':path.stat().st_size})
            result = self.reply(sheet,args,meta,mode=='preview')
            if not result.get('isError'):
                self.hashes[key]=digest; self.hashes.move_to_end(key)
                while len(self.hashes)>128: self.hashes.popitem(last=False)
            return result

    def reply(self,image,args,meta,preview=False):
        try:
            image,data,fmt,quality=self.encode(image,args,preview)
        except ValueError as exc:
            return {**result_text({**meta,'status':'image_budget_exceeded','message':str(exc),
                                  'next_step':'capture_get with the capture_id and a larger max_bytes; do not move the camera to compensate.'},is_error=True)}
        meta={**meta,'width':image.width,'height':image.height,'format':fmt,'quality':quality,'bytes':len(data),
              'visual_tokens':'model-dependent; not measured','automatic_resolution_reduction':False}
        return {'content':[{'type':'image','mimeType':'image/'+fmt,'data':base64.b64encode(data).decode()},
                           {'type':'text','text':json.dumps(meta)}]}

    def get(self,args):
        if set(args)-{'capture_id','width','height','crop','quality','format','max_bytes','max_tokens','view','return_mode'}:
            raise ValueError('Unknown capture_get arguments')
        with self.lock:
            saved=self.saved.get(args.get('capture_id'))
            if not saved: raise ValueError('Capture unknown/expired; create a fresh Studio capture')
            source_path=saved['path']
            if 'view' in args:
                index=integer(args,'view',0,0,len(saved['frames'])-1)
                source_path=saved['frames'][index]['path']
            with Image.open(source_path) as source:
                image=source.convert('RGB')
            crop=args.get('crop')
            if crop is not None:
                if not isinstance(crop,list) or len(crop)!=4 or any(isinstance(x,bool) or not isinstance(x,int) for x in crop):
                    raise ValueError('crop is [left,top,right,bottom] in saved image pixels')
                l,t,r,b=crop
                if not (0<=l<r<=image.width and 0<=t<b<=image.height): raise ValueError('Crop outside image')
                image=image.crop(tuple(crop))
            if args.get('return_mode') not in (None,'inline','file','preview'):
                raise ValueError('return_mode must be inline/file/preview')
            meta={**saved['metadata'],'capture_id':args['capture_id'],'crop':crop,'view':args.get('view'),'source_resolution':list(image.size)}
            if args.get('return_mode')=='file':
                return result_text({**meta,'path':str(source_path),'local_only':True,'crop_applied':False})
            return self.reply(image,args,meta,args.get('return_mode')=='preview')
