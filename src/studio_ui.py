"""Opt-in Win32 Studio-window capture/input. Not a full-PC security sandbox."""
import base64
import ctypes as C
from ctypes import wintypes as W
import io
import json
import math
import os
from pathlib import Path
import queue
import secrets
import threading
import time
from collections import OrderedDict
from PIL import Image
from capture_tools import StudioCaptures
from workspace_tools import spec
from pc_mcp_bridge import result_text

WINDOW={'type':'integer','minimum':1}
OBS={'window_id':WINDOW,'capture_id':{'type':'string','description':'Fresh studio_window_capture id; coordinates are in that image.'}}
XY={'x':{'type':'integer'},'y':{'type':'integer'}}
STUDIO_UI_TOOLS=[
 spec('studio_ui_status','Show local Studio UI arm state and Ctrl+Alt+F12 emergency stop availability. Remote clients cannot arm it.'),
 spec('studio_windows','List visible verified Roblox Studio top-level/plugin windows only; no other app titles.'),
 spec('studio_window_capture','Capture one verified Studio window including Eclipse/docked plugin UI using PrintWindow, never desktop pixels. Requires local Enable Studio UI. Returns image/capture_id, image-coordinate dimensions, window position and client bounds. Native render failure returns error, no desktop fallback.',
      {'window_id':WINDOW,'width':{'type':'integer','maximum':1920},'height':{'type':'integer','maximum':1080},'quality':{'type':'integer'},'format':{'type':'string','enum':['jpeg','png','webp']}},['window_id']),
 spec('studio_focus','Bring a verified Studio window to front, subject to Windows focus restrictions. Locally armed only; take a fresh window capture afterward.',{'window_id':WINDOW},['window_id'],readonly=False),
 spec('studio_mouse','Move or click inside the captured Studio client area. Refuses stale/moved windows, other foreground apps and occluded points. Fresh capture after each action. Never click Studio Play.',
      {**OBS,**XY,'action':{'type':'string','enum':['move','left_click','right_click','double_click']}},['window_id','capture_id','x','y','action'],readonly=False),
 spec('studio_drag','Drag within the captured Studio client area, checking focus/occlusion/stop during movement. Intended for plugin timeline/keyframes, not Studio Play.',
      {**OBS,'from_x':{'type':'integer'},'from_y':{'type':'integer'},'to_x':{'type':'integer'},'to_y':{'type':'integer'},'duration':{'type':'number','minimum':0.15,'maximum':3}},['window_id','capture_id','from_x','from_y','to_x','to_y'],readonly=False),
 spec('studio_scroll','Scroll at a captured Studio point. Positive steps scroll up; optional horizontal wheel.',
      {**OBS,**XY,'steps':{'type':'integer','minimum':-20,'maximum':20},'horizontal':{'type':'boolean'}},['window_id','capture_id','x','y','steps'],readonly=False),
 spec('studio_type','Type up to 1000 Unicode characters into focused Studio. No clipboard. Focus must already be on the intended plugin text field; capture first.',
      {**OBS,'text':{'type':'string','maxLength':1000}},['window_id','capture_id','text'],readonly=False),
 spec('studio_hotkey','Studio-only bounded key combination, e.g. ctrl+z or space. Windows/shell-switch shortcuts and F5-F8 Play controls are blocked. Do not start/stop game Play through clicks or code.',
      {**OBS,'keys':{'type':'array','items':{'type':'string'},'maxItems':4}},['window_id','capture_id','keys'],readonly=False),
 spec('studio_ui_stop','Immediately disarm Studio UI. Re-enabling requires the local bridge button.',readonly=False),
]


class MOUSEINPUT(C.Structure):
    _fields_=[('dx',W.LONG),('dy',W.LONG),('mouseData',W.DWORD),('dwFlags',W.DWORD),('time',W.DWORD),('dwExtraInfo',C.c_size_t)]
class KEYBDINPUT(C.Structure):
    _fields_=[('wVk',W.WORD),('wScan',W.WORD),('dwFlags',W.DWORD),('time',W.DWORD),('dwExtraInfo',C.c_size_t)]
class INPUTUNION(C.Union):
    _fields_=[('mi',MOUSEINPUT),('ki',KEYBDINPUT)]
class INPUT(C.Structure):
    _fields_=[('type',W.DWORD),('data',INPUTUNION)]
class BITMAPINFOHEADER(C.Structure):
    _fields_=[('biSize',W.DWORD),('biWidth',W.LONG),('biHeight',W.LONG),('biPlanes',W.WORD),('biBitCount',W.WORD),('biCompression',W.DWORD),('biSizeImage',W.DWORD),('biXPelsPerMeter',W.LONG),('biYPelsPerMeter',W.LONG),('biClrUsed',W.DWORD),('biClrImportant',W.DWORD)]


class WinStudio:
    def __init__(self):
        self.u=C.WinDLL('user32',use_last_error=True); self.g=C.WinDLL('gdi32',use_last_error=True); self.k=C.WinDLL('kernel32',use_last_error=True)
        signatures=[(self.u,'GetWindowThreadProcessId',[W.HWND,C.POINTER(W.DWORD)],W.DWORD),
          (self.u,'GetWindowRect',[W.HWND,C.POINTER(W.RECT)],W.BOOL),(self.u,'GetClientRect',[W.HWND,C.POINTER(W.RECT)],W.BOOL),
          (self.u,'ClientToScreen',[W.HWND,C.POINTER(W.POINT)],W.BOOL),(self.u,'GetAncestor',[W.HWND,W.UINT],W.HWND),
          (self.u,'GetForegroundWindow',[],W.HWND),(self.u,'WindowFromPoint',[W.POINT],W.HWND),
          (self.u,'IsWindowVisible',[W.HWND],W.BOOL),(self.u,'IsIconic',[W.HWND],W.BOOL),
          (self.u,'GetWindowTextW',[W.HWND,W.LPWSTR,C.c_int],C.c_int),(self.u,'GetClassNameW',[W.HWND,W.LPWSTR,C.c_int],C.c_int),
          (self.u,'SetForegroundWindow',[W.HWND],W.BOOL),(self.u,'SendInput',[W.UINT,C.POINTER(INPUT),C.c_int],W.UINT),
          (self.u,'SetThreadDpiAwarenessContext',[C.c_void_p],C.c_void_p),
          (self.u,'GetSystemMetrics',[C.c_int],C.c_int),(self.u,'GetAsyncKeyState',[C.c_int],W.SHORT),
          (self.u,'GetWindowDC',[W.HWND],W.HDC),(self.u,'ReleaseDC',[W.HWND,W.HDC],C.c_int),
          (self.u,'PrintWindow',[W.HWND,W.HDC,W.UINT],W.BOOL),
          (self.k,'OpenProcess',[W.DWORD,W.BOOL,W.DWORD],W.HANDLE),
          (self.k,'QueryFullProcessImageNameW',[W.HANDLE,W.DWORD,W.LPWSTR,C.POINTER(W.DWORD)],W.BOOL),
          (self.k,'CloseHandle',[W.HANDLE],W.BOOL),
          (self.g,'CreateCompatibleDC',[W.HDC],W.HDC),(self.g,'CreateCompatibleBitmap',[W.HDC,C.c_int,C.c_int],W.HBITMAP),
          (self.g,'SelectObject',[W.HDC,W.HGDIOBJ],W.HGDIOBJ),(self.g,'DeleteObject',[W.HGDIOBJ],W.BOOL),
          (self.g,'DeleteDC',[W.HDC],W.BOOL),(self.g,'PatBlt',[W.HDC,C.c_int,C.c_int,C.c_int,C.c_int,W.DWORD],W.BOOL),
          (self.g,'GetDIBits',[W.HDC,W.HBITMAP,W.UINT,W.UINT,C.c_void_p,C.c_void_p,W.UINT],C.c_int)]
        for dll,name,args,result in signatures:
            fn=getattr(dll,name); fn.argtypes=args; fn.restype=result
        self.callback=C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
        self.u.EnumWindows.argtypes=[self.callback,W.LPARAM]; self.u.EnumWindows.restype=W.BOOL

    def info(self,hwnd):
        # Use physical coordinates on mixed-DPI monitors, including negative origins.
        if not self.u.SetThreadDpiAwarenessContext(C.c_void_p(-4)):
            raise ValueError('Per-monitor DPI context unavailable; refusing ambiguous UI coordinates')
        if isinstance(hwnd,bool) or not isinstance(hwnd,int) or hwnd<=0 or self.u.GetAncestor(hwnd,2)!=hwnd or not self.u.IsWindowVisible(hwnd):
            raise ValueError('Choose a visible top-level Studio window from studio_windows')
        pid=W.DWORD(); self.u.GetWindowThreadProcessId(hwnd,C.byref(pid))
        process=self.k.OpenProcess(0x1000,False,pid.value)
        if not process: raise ValueError('Cannot verify window owner process')
        try:
            name=C.create_unicode_buffer(32768); length=W.DWORD(len(name))
            if not self.k.QueryFullProcessImageNameW(process,0,name,C.byref(length)): raise ValueError('Cannot verify Studio executable')
            path=Path(name.value).resolve()
        finally: self.k.CloseHandle(process)
        roots=[Path(os.environ[key])/'Roblox'/'Versions' for key in ('LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)') if os.environ.get(key)]
        if path.name.lower()!='robloxstudiobeta.exe' or not any(path.is_relative_to(root.resolve()) for root in roots) or not (path.parent/'StudioMCP.exe').is_file():
            raise ValueError('Window is not a verified installed Roblox Studio process')
        cls=C.create_unicode_buffer(256); self.u.GetClassNameW(hwnd,cls,len(cls))
        if cls.value=='#32770': raise ValueError('Operating-system dialogs are not Studio plugin windows')
        rect=W.RECT(); client=W.RECT(); origin=W.POINT()
        if not self.u.GetWindowRect(hwnd,C.byref(rect)) or not self.u.GetClientRect(hwnd,C.byref(client)) or not self.u.ClientToScreen(hwnd,C.byref(origin)):
            raise ValueError('Cannot read Studio window bounds')
        title=C.create_unicode_buffer(512); self.u.GetWindowTextW(hwnd,title,len(title))
        return {'window_id':hwnd,'pid':pid.value,'exe':str(path),'title':title.value,'class':cls.value,
                'rect':[rect.left,rect.top,rect.right,rect.bottom],
                'client':[origin.x,origin.y,origin.x+client.right,origin.y+client.bottom], 'minimized':bool(self.u.IsIconic(hwnd))}

    def windows(self):
        result=[]
        @self.callback
        def found(hwnd,_):
            try: result.append(self.info(hwnd))
            except (ValueError,OSError): pass
            return True
        self.u.EnumWindows(found,0)
        return result[:20]

    def foreground(self,hwnd):
        return self.u.GetAncestor(self.u.GetForegroundWindow(),2)==hwnd

    def point_visible(self,hwnd,x,y):
        return self.u.GetAncestor(self.u.WindowFromPoint(W.POINT(x,y)),2)==hwnd

    def focus(self,hwnd):
        if not self.u.SetForegroundWindow(hwnd) or not self.foreground(hwnd):
            raise ValueError('Windows refused focus. Activate Studio manually; no focus/security bypass.')

    def modifiers_down(self):
        return any(self.u.GetAsyncKeyState(key)&0x8000 for key in (0x10,0x11,0x12,0x5b,0x5c))

    def send(self,events):
        array=(INPUT*len(events))(*events)
        if self.u.SendInput(len(events),array,C.sizeof(INPUT))!=len(events):
            raise RuntimeError('Windows input injection failed (possibly integrity/UIPI); no elevation or bypass attempted')

    def mouse(self,x,y,flags=0,data=0):
        left,top=self.u.GetSystemMetrics(76),self.u.GetSystemMetrics(77)
        width,height=self.u.GetSystemMetrics(78),self.u.GetSystemMetrics(79)
        if width<2 or height<2: raise ValueError('No interactive display')
        parts=[flags]
        if flags&6==6: parts=[flags&~4,flags&~2]
        elif flags&24==24: parts=[flags&~16,flags&~8]
        events=[]
        for part in parts:
            event=INPUT(); event.type=0
            event.data.mi=MOUSEINPUT(round((x-left)*65535/(width-1)),round((y-top)*65535/(height-1)),data&0xffffffff,part|0xc001,0,0)
            events.append(event)
        try:
            self.send(events)
        except Exception:
            if len(parts)==2:
                # Recover our own button release if a click batch was partially inserted.
                release=INPUT(); release.type=0
                release.data.mi=MOUSEINPUT(0,0,0,4 if flags&6==6 else 16,0,0)
                try: self.send([release])
                except Exception: pass
            raise

    def key_event(self,key,up=False,unicode=False):
        event=INPUT(); event.type=1
        event.data.ki=KEYBDINPUT(0 if unicode else key,key if unicode else 0,(4 if unicode else 0)|(2 if up else 0),0,0)
        return event

    def capture(self,hwnd):
        info=self.info(hwnd)
        if info['minimized']: raise ValueError('Studio window is minimized; restore it manually')
        l,t,r,b=info['rect']; width,height=r-l,b-t
        if width<32 or height<32 or width*height>40000000: raise ValueError('Invalid or excessive window dimensions')
        dc=self.u.GetWindowDC(hwnd); mem=self.g.CreateCompatibleDC(dc) if dc else None
        bitmap=self.g.CreateCompatibleBitmap(dc,width,height) if mem else None
        if not bitmap:
            if mem: self.g.DeleteDC(mem)
            if dc: self.u.ReleaseDC(hwnd,dc)
            raise OSError('Cannot allocate Studio capture')
        old=self.g.SelectObject(mem,bitmap)
        try:
            self.g.PatBlt(mem,0,0,width,height,0x42)  # Initialize; never copy desktop/DC pixels.
            if not self.u.PrintWindow(hwnd,mem,2): raise RuntimeError('Studio PrintWindow failed; no desktop fallback')
            self.g.SelectObject(mem,old); old=None
            header=BITMAPINFOHEADER(); header.biSize=C.sizeof(header); header.biWidth=width; header.biHeight=-height; header.biPlanes=1; header.biBitCount=32
            buffer=C.create_string_buffer(width*height*4)
            if self.g.GetDIBits(mem,bitmap,0,height,buffer,C.byref(header),0)!=height: raise RuntimeError('Studio window pixels unavailable')
            image=Image.frombytes('RGB',(width,height),buffer.raw,'raw','BGRX')
            if not image.getbbox(): raise RuntimeError('Studio returned a black frame; no desktop fallback')
            return image
        finally:
            if old: self.g.SelectObject(mem,old)
            self.g.DeleteObject(bitmap); self.g.DeleteDC(mem); self.u.ReleaseDC(hwnd,dc)


class StudioUI:
    def __init__(self,data_dir,emit=lambda *_:None,backend=None,listen=False):
        self.backend=backend or WinStudio(); self.folder=Path(data_dir)/'studio-window-captures'; self.emit=emit
        self.cancelled=threading.Event(); self.cancelled.set(); self.closed=threading.Event()
        self.deadline=0; self.hotkey_ready=False; self.observed=OrderedDict(); self.lock=threading.Lock()
        self.capture_slots=threading.BoundedSemaphore(2)
        if listen: threading.Thread(target=self._hotkey,daemon=True).start()

    def _hotkey(self):
        u=self.backend.u; ident=0xB079
        if not u.RegisterHotKey(None,ident,0x4003,0x7b):
            self.emit('log','Studio UI disabled: Ctrl+Alt+F12 emergency hotkey unavailable.'); return
        self.hotkey_ready=True
        try:
            msg=W.MSG()
            while not self.closed.wait(.02):
                while u.PeekMessageW(C.byref(msg),None,0,0,1):
                    if msg.message==0x312 and msg.wParam==ident: self.stop()
        finally:
            self.hotkey_ready=False; u.UnregisterHotKey(None,ident)

    def arm(self):
        if not self.hotkey_ready: raise ValueError('Emergency hotkey unavailable; cannot enable Studio UI')
        self.deadline=float('inf'); self.cancelled.clear(); self.emit('log','Studio UI enabled locally until STOP UI, Ctrl+Alt+F12 or app close. No time limit.')

    def stop(self,*_):
        self.cancelled.set(); self.deadline=0; self.emit('log','Studio UI disarmed. Re-enable only with the local bridge button.')
        return self.status({})

    def close(self):
        self.stop(); self.closed.set()

    def status(self,_):
        return {'armed':not self.cancelled.is_set() and time.monotonic()<self.deadline,'seconds_left':None if self.deadline==float('inf') else max(0,int(self.deadline-time.monotonic())),
                'authorization_duration':'Until STOP UI, Ctrl+Alt+F12 or app close; no timer',
                'hotkey_available':self.hotkey_ready,'emergency_stop':'Ctrl+Alt+F12','scope':'Verified Roblox Studio windows only; other full-PC bridge tools are NOT sandboxed.'}

    def guard(self,info,foreground=False,point=None):
        if self.cancelled.is_set() or time.monotonic()>=self.deadline: raise ValueError('Studio UI is off/expired. Enable Studio UI locally in the bridge.')
        current=self.backend.info(info['window_id'])
        if any(current[k]!=info[k] for k in ('pid','exe','rect','client')) or current['minimized']:
            raise ValueError('Studio window moved, resized, minimized or changed owner; capture again')
        if foreground and not self.backend.foreground(info['window_id']): raise ValueError('Studio is not foreground. Focus it and take a fresh capture.')
        if point and not self.backend.point_visible(info['window_id'],*point): raise ValueError('Studio point is occluded by another window; input refused')

    def windows(self,_): return {'windows':self.backend.windows(),'armed':self.status({})['armed']}

    def capture(self,args):
        info=self.backend.info(args.get('window_id')); self.guard(info)
        if not self.capture_slots.acquire(False): raise ValueError('Studio capture is busy/unresponsive; no additional capture threads started')
        result=queue.Queue(maxsize=1)
        def run():
            try: result.put((True,self.backend.capture(info['window_id'])))
            except Exception as exc: result.put((False,exc))
            finally: self.capture_slots.release()
        threading.Thread(target=run,daemon=True).start()
        try: ok,value=result.get(timeout=8)
        except queue.Empty: raise TimeoutError('Studio window capture did not respond in 8 seconds; no desktop fallback') from None
        if not ok: raise value
        self.guard(info)
        image,data,fmt,quality=StudioCaptures.encode(value,args)
        ident='StudioUI_'+secrets.token_hex(16); self.folder.mkdir(parents=True,exist_ok=True)
        path=self.folder/(ident+'.png'); value.save(path,format='PNG')
        with self.lock:
            self.observed[ident]={'info':info,'time':time.monotonic(),'size':image.size}
            while len(self.observed)>32: self.observed.popitem(last=False)
        meta={'capture_id':ident,'window_id':info['window_id'],'pid':info['pid'],'title':info['title'],
              'window_rect':info['rect'],'client_screen_rect':info['client'],'source_size':list(value.size),
              'image_size':list(image.size),'coordinates':'image pixels; input is mapped to the same verified Studio window',
              'path':str(path),'local_only':True,'quality':quality,'desktop_fallback':False}
        return {'content':[{'type':'image','mimeType':'image/'+fmt,'data':base64.b64encode(data).decode()},{'type':'text','text':json.dumps(meta)}]}

    def observation(self,args):
        obs=self.observed.get(args.get('capture_id'))
        if not obs or args.get('window_id')!=obs['info']['window_id'] or time.monotonic()-obs['time']>30:
            raise ValueError('A matching Studio window capture less than 30 seconds old is required')
        self.guard(obs['info'],True)
        return obs

    def point(self,obs,x,y):
        width,height=obs['size']
        if any(isinstance(v,bool) or not isinstance(v,int) for v in (x,y)) or not 0<=x<width or not 0<=y<height:
            raise ValueError('Coordinates must be inside the returned Studio image')
        l,t,r,b=obs['info']['rect']; px=l+round(x*(r-l)/width); py=t+round(y*(b-t)/height)
        cl,ct,cr,cb=obs['info']['client']
        if not cl<=px<cr or not ct<=py<cb: raise ValueError('Input outside Studio client/plugin area is forbidden')
        self.guard(obs['info'],True,(px,py))
        return px,py

    def invalidate(self,args): self.observed.pop(args.get('capture_id'),None)
    def done(self): return {'completed':True,'fresh_capture_required':True}

    def focus(self,args):
        info=self.backend.info(args.get('window_id')); self.guard(info); self.backend.focus(info['window_id']); self.guard(info,True)
        self.observed.clear(); return self.done()

    def mouse(self,args):
        action=args.get('action')
        if action not in ('move','left_click','right_click','double_click'): raise ValueError('Unknown Studio mouse action')
        with self.lock:
            obs=self.observation(args); point=self.point(obs,args.get('x'),args.get('y'))
            if action=='move': self.backend.mouse(*point)
            else:
                down,up=(8,16) if action=='right_click' else (2,4)
                try:
                    for _ in range(2 if action=='double_click' else 1):
                        self.guard(obs['info'],True,point); self.backend.mouse(*point,down|up)
                        if action=='double_click': time.sleep(.06)
                finally: self.invalidate(args)
            self.invalidate(args); return self.done()

    def drag(self,args):
        duration=args.get('duration',.6)
        if isinstance(duration,bool) or not isinstance(duration,(float,int)) or not math.isfinite(duration) or not .15<=duration<=3: raise ValueError('duration must be .15..3 seconds')
        with self.lock:
            obs=self.observation(args); start=self.point(obs,args.get('from_x'),args.get('from_y')); end=self.point(obs,args.get('to_x'),args.get('to_y'))
            last=start; pressed=False
            try:
                self.backend.mouse(*start,2); pressed=True
                steps=max(8,round(duration*40))
                for step in range(1,steps+1):
                    point=tuple(round(start[i]+(end[i]-start[i])*step/steps) for i in (0,1))
                    self.guard(obs['info'],True,point); self.backend.mouse(*point); last=point
                    if self.cancelled.wait(duration/steps): raise ValueError('Studio drag stopped by emergency/local stop')
            finally:
                if pressed: self.backend.mouse(*last,4)  # Always release our held button, even when disarmed.
                self.invalidate(args)
            return self.done()

    def scroll(self,args):
        steps=args.get('steps')
        if isinstance(steps,bool) or not isinstance(steps,int) or not -20<=steps<=20: raise ValueError('steps must be -20..20')
        with self.lock:
            obs=self.observation(args); point=self.point(obs,args.get('x'),args.get('y'))
            self.backend.mouse(*point,0x1000 if args.get('horizontal') else 0x800,steps*120)
            self.invalidate(args); return self.done()

    def type(self,args):
        text=args.get('text')
        if not isinstance(text,str) or not 1<=len(text)<=1000 or '\x00' in text: raise ValueError('text must be 1..1000 non-NUL Unicode characters')
        with self.lock:
            obs=self.observation(args)
            if self.backend.modifiers_down(): raise ValueError('Release physical modifier keys before typing')
            try:
                units=text.encode('utf-16-le')
                for index in range(0,len(units),2):
                    self.guard(obs['info'],True); key=int.from_bytes(units[index:index+2],'little')
                    self.backend.send([self.backend.key_event(key,unicode=True),self.backend.key_event(key,up=True,unicode=True)])
            finally: self.invalidate(args)
            return self.done()

    def hotkey(self,args):
        keys=args.get('keys')
        if not isinstance(keys,list) or not 1<=len(keys)<=4 or not all(isinstance(k,str) for k in keys): raise ValueError('keys must be 1..4 key names')
        keys=[k.lower() for k in keys]
        if len(set(keys))!=len(keys): raise ValueError('Duplicate key')
        modifiers={'ctrl':0x11,'shift':0x10,'alt':0x12}
        named={'space':0x20,'enter':0x0d,'escape':0x1b,'tab':9,'backspace':8,'delete':0x2e,'left':0x25,'up':0x26,'right':0x27,'down':0x28,'home':0x24,'end':0x23}
        primary=[key for key in keys if key not in modifiers]
        if len(primary)!=1: raise ValueError('Exactly one primary key required; no Windows/shell/Play function keys')
        key=primary[0]
        if key not in named and not (len(key)==1 and key.isascii() and key.isalnum()): raise ValueError('Key not allowed; Windows and Play function keys are disabled')
        if ('alt' in keys and key in ('tab','escape','space')) or ('ctrl' in keys and key=='escape') or ('ctrl' in keys and 'alt' in keys and key=='delete'):
            raise ValueError('Shell-switch/system shortcuts are forbidden')
        codes=[modifiers[k] for k in keys if k in modifiers]+[named[key] if key in named else ord(key.upper())]
        with self.lock:
            obs=self.observation(args)
            if self.backend.modifiers_down(): raise ValueError('Release physical modifier keys before shortcuts')
            self.guard(obs['info'],True)
            events=[self.backend.key_event(code) for code in codes]+[self.backend.key_event(code,up=True) for code in reversed(codes)]
            try: self.backend.send(events)
            except Exception:
                try: self.backend.send([self.backend.key_event(code,up=True) for code in reversed(codes)])
                except Exception: pass
                raise
            finally: self.invalidate(args)
            return self.done()

    def handlers(self):
        return {'studio_ui_status':self.status,'studio_windows':self.windows,'studio_window_capture':self.capture,
                'studio_focus':self.focus,'studio_mouse':self.mouse,'studio_drag':self.drag,'studio_scroll':self.scroll,
                'studio_type':self.type,'studio_hotkey':self.hotkey,'studio_ui_stop':self.stop}
