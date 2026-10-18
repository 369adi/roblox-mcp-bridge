"""Explicitly locally enabled, general Windows desktop observation and input."""
import ctypes as C
from ctypes import wintypes as W
import json
import time
from pathlib import Path
from PIL import ImageGrab
from studio_ui import StudioUI, WinStudio
from workspace_tools import spec

CAP={'capture_id':{'type':'string','description':'Fresh desktop_capture ID; coordinates refer to that returned image.'}}
XY={'x':{'type':'integer'},'y':{'type':'integer'}}
DESKTOP_UI_TOOLS=[
 spec('desktop_status','Check general PC UI local consent and emergency stop. No remote enable.'),
 spec('desktop_windows','List visible top-level windows across all desktop applications. Requires local Enable Full PC UI.'),
 spec('desktop_capture','Capture all monitors/apps of the interactive Windows desktop, not just Roblox/Blender. Requires local Enable Full PC UI. Default readable 1280x720 JPEG; returns image plus original local file and image-coordinate mapping.',{'width':{'type':'integer','maximum':1920},'height':{'type':'integer','maximum':1080},'quality':{'type':'integer'},'format':{'type':'string','enum':['jpeg','png','webp']}}),
 spec('desktop_focus','Focus a window from desktop_windows. Capture again afterward. No elevation/UAC bypass.',{'window_id':{'type':'integer','minimum':1}},['window_id'],readonly=False),
 spec('desktop_mouse','Move/click anywhere on the captured desktop, including non-Studio apps and taskbar. Requires a fresh capture after each action.',{**CAP,**XY,'action':{'type':'string','enum':['move','left_click','right_click','double_click']}},['capture_id','x','y','action'],readonly=False),
 spec('desktop_drag','Drag between points on the captured desktop, across applications.',{**CAP,'from_x':{'type':'integer'},'from_y':{'type':'integer'},'to_x':{'type':'integer'},'to_y':{'type':'integer'},'duration':{'type':'number','minimum':.15,'maximum':3}},['capture_id','from_x','from_y','to_x','to_y'],readonly=False),
 spec('desktop_scroll','Scroll at a point on the captured desktop.',{**CAP,**XY,'steps':{'type':'integer','minimum':-20,'maximum':20},'horizontal':{'type':'boolean'}},['capture_id','x','y','steps'],readonly=False),
 spec('desktop_type','Type Unicode into the observed foreground application. Fresh capture and unchanged focus required; no clipboard.',{**CAP,'text':{'type':'string','maxLength':1000}},['capture_id','text'],readonly=False),
 spec('desktop_hotkey','General PC shortcuts including Win+R, Alt+Tab and function keys. Requires fresh desktop capture. Secure desktop, Ctrl+Alt+Delete and the emergency shortcut are not supported.',{**CAP,'keys':{'type':'array','items':{'type':'string'},'maxItems':5}},['capture_id','keys'],readonly=False),
 spec('desktop_stop','Immediately disable general desktop UI. Local enable required to resume.',readonly=False),
]


class WinDesktop(WinStudio):
    def info(self, hwnd=1):
        if not self.u.SetThreadDpiAwarenessContext(C.c_void_p(-4)):
            raise ValueError('Cannot establish physical desktop coordinates')
        left,top,width,height=[self.u.GetSystemMetrics(i) for i in (76,77,78,79)]
        if width<2 or height<2 or width*height>40000000:
            raise ValueError('No usable interactive desktop or excessive display size')
        foreground=int(self.u.GetForegroundWindow() or 0)
        pid=W.DWORD()
        self.u.GetWindowThreadProcessId(foreground,C.byref(pid))
        return {'window_id':1,'pid':pid.value,'foreground_window':foreground,'exe':'Windows interactive desktop','title':'All monitors',
                'rect':[left,top,left+width,top+height],'client':[left,top,left+width,top+height],'minimized':False}

    def capture(self, hwnd=1):
        info=self.info()
        image=ImageGrab.grab(all_screens=True)
        l,t,r,b=info['rect']
        if image.size!=(r-l,b-t): raise ValueError('Display capture size changed; retry with a fresh capture')
        return image

    def windows(self):
        result=[]
        @self.callback
        def found(hwnd,_):
            if self.u.IsWindowVisible(hwnd):
                title=C.create_unicode_buffer(512); self.u.GetWindowTextW(hwnd,title,len(title))
                if title.value:
                    rect=W.RECT(); pid=W.DWORD()
                    self.u.GetWindowRect(hwnd,C.byref(rect)); self.u.GetWindowThreadProcessId(hwnd,C.byref(pid))
                    result.append({'window_id':int(hwnd),'pid':pid.value,'title':title.value,'rect':[rect.left,rect.top,rect.right,rect.bottom]})
            return True
        self.u.EnumWindows(found,0)
        return result[:100]


class DesktopUI(StudioUI):
    def __init__(self,data_dir,emergency,emit=lambda *_:None,backend=None):
        super().__init__(data_dir,emit,backend=backend or WinDesktop(),listen=False)
        self.emergency=emergency
        self.folder=Path(data_dir)/'desktop-captures'

    def arm(self):
        self.hotkey_ready=self.emergency.hotkey_ready
        if not self.hotkey_ready: raise ValueError('Emergency stop unavailable; cannot enable full PC UI')
        self.deadline=float('inf'); self.cancelled.clear()
        self.emit('log','FULL PC UI enabled locally: all desktop apps and monitors until STOP UI, Ctrl+Alt+F12 or app close.')

    def stop(self,*_):
        self.cancelled.set(); self.deadline=0
        self.emit('log','Full PC UI disabled. Enable locally to resume.')
        return self.status({})

    def status(self,_):
        return {'armed':not self.cancelled.is_set() and self.emergency.hotkey_ready,'hotkey_available':self.emergency.hotkey_ready,
                'scope':'All applications and monitors in the current interactive Windows session; Windows permissions/UIPI still apply.',
                'authorization_duration':'Until local stop, Ctrl+Alt+F12 or app close; no timer','emergency_stop':'Ctrl+Alt+F12'}

    def guard(self,info,foreground=False,point=None):
        if not self.status({})['armed']: raise ValueError('Full PC UI is off. Click Enable Full PC UI locally in the bridge.')
        current=self.backend.info(1)
        if current['rect']!=info['rect']: raise ValueError('Display layout changed; capture again')
        if foreground and current.get('foreground_window')!=info.get('foreground_window'):
            raise ValueError('Foreground application changed; capture again before input')

    def windows(self,_):
        self.guard(self.backend.info(1))
        return {'windows':self.backend.windows(),'armed':True}

    def capture(self,args):
        result=super().capture({**args,'window_id':1})
        meta=json.loads(result['content'][-1]['text'])
        meta.update(scope='full_desktop',coordinates='image pixels mapped across all monitors, including negative monitor origins',desktop_capture=True)
        result['content'][-1]['text']=json.dumps(meta)
        return result

    def observation(self,args):
        obs=self.observed.get(args.get('capture_id'))
        if not obs or time.monotonic()-obs['time']>30:
            raise ValueError('A desktop_capture less than 30 seconds old is required')
        self.guard(obs['info'],True)
        return obs

    def focus(self,args):
        self.guard(self.backend.info(1))
        hwnd=args.get('window_id')
        if isinstance(hwnd,bool) or not isinstance(hwnd,int) or hwnd not in {w['window_id'] for w in self.backend.windows()}:
            raise ValueError('Choose a visible window from desktop_windows')
        self.backend.focus(hwnd); self.observed.clear()
        return self.done()

    def hotkey(self,args):
        keys=args.get('keys')
        if not isinstance(keys,list) or not 1<=len(keys)<=5 or not all(isinstance(k,str) for k in keys): raise ValueError('keys must contain 1..5 names')
        keys=[k.lower() for k in keys]
        if len(set(keys))!=len(keys): raise ValueError('Duplicate keys')
        modifiers={'ctrl':0x11,'shift':0x10,'alt':0x12,'win':0x5b}
        named={'space':0x20,'enter':13,'escape':27,'tab':9,'backspace':8,'delete':46,'left':37,'up':38,'right':39,'down':40,'home':36,'end':35,'pageup':33,'pagedown':34,'insert':45,**{'f'+str(i):0x6f+i for i in range(1,25)}}
        primary=[k for k in keys if k not in modifiers]
        if len(primary)!=1: raise ValueError('Exactly one primary key required')
        key=primary[0]
        if key not in named and not (len(key)==1 and key.isascii() and key.isalnum()): raise ValueError('Unsupported key')
        if 'ctrl' in keys and 'alt' in keys and key in ('delete','f12'): raise ValueError('Secure attention/emergency shortcut cannot be injected')
        codes=[modifiers[k] for k in keys if k in modifiers]+[named[key] if key in named else ord(key.upper())]
        with self.lock:
            obs=self.observation(args)
            if self.backend.modifiers_down(): raise ValueError('Release physical modifier keys first')
            try:
                self.guard(obs['info'],True)
                self.backend.send([self.backend.key_event(code) for code in codes]+[self.backend.key_event(code,up=True) for code in reversed(codes)])
            except Exception:
                try: self.backend.send([self.backend.key_event(code,up=True) for code in reversed(codes)])
                except Exception: pass
                raise
            finally: self.invalidate(args)
            return self.done()

    def handlers(self):
        return {'desktop_status':self.status,'desktop_windows':self.windows,'desktop_capture':self.capture,'desktop_focus':self.focus,
                'desktop_mouse':self.mouse,'desktop_drag':self.drag,'desktop_scroll':self.scroll,'desktop_type':self.type,'desktop_hotkey':self.hotkey,'desktop_stop':self.stop}
