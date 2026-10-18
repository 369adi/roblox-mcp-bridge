"""Fixture input tests only. Never click, type, focus or drag in the real Studio."""
import json
import tempfile
import time
from PIL import Image
from studio_ui import StudioUI, STUDIO_UI_TOOLS


class FakeWindow:
    def __init__(self):
        self.record={'window_id':11,'pid':22,'exe':'fixture/RobloxStudioBeta.exe','title':'Fixture Studio','rect':[100,100,1380,820],'client':[100,130,1380,820],'minimized':False}
        self.events=[]; self.visible=True; self.is_foreground=True; self.on_move=None
    def info(self,hwnd):
        if hwnd!=11: raise ValueError('Not a Studio window')
        return {**self.record,'rect':list(self.record['rect']),'client':list(self.record['client'])}
    def windows(self): return [self.info(11)]
    def foreground(self,hwnd): return self.is_foreground
    def point_visible(self,*_): return self.visible
    def focus(self,hwnd): self.events.append(('focus',hwnd)); self.is_foreground=True
    def modifiers_down(self): return False
    def mouse(self,*args):
        self.events.append(('mouse',args))
        if self.on_move: self.on_move(args)
    def send(self,events): self.events.append(('keys',events))
    def key_event(self,key,up=False,unicode=False): return (key,up,unicode)
    def capture(self,hwnd): return Image.new('RGB',(1280,720),'#223355')


def run_studio_ui_checks(bridge):
    def rejects(function):
        try: function()
        except (ValueError,RuntimeError): return
        raise AssertionError('Studio scope/arming guard did not reject')
    fake=FakeWindow()
    with tempfile.TemporaryDirectory() as folder:
        ui=StudioUI(folder,backend=fake)
        rejects(lambda:ui.capture({'window_id':11}))
        rejects(ui.arm)
        ui.hotkey_ready=True; ui.arm()
        def shot():
            result=ui.capture({'window_id':11})
            assert result['content'][0]['type']=='image'
            meta=json.loads(result['content'][-1]['text'])
            assert meta['image_size']==[1280,720] and not meta['desktop_fallback']
            return {'window_id':11,'capture_id':meta['capture_id']}
        obs=shot(); rejects(lambda:ui.mouse({**obs,'window_id':99,'x':100,'y':100,'action':'left_click'}))
        rejects(lambda:ui.mouse({**obs,'x':-1,'y':100,'action':'left_click'}))
        rejects(lambda:ui.mouse({**obs,'x':100,'y':5,'action':'left_click'}))
        fake.visible=False; rejects(lambda:ui.mouse({**obs,'x':100,'y':100,'action':'left_click'})); fake.visible=True
        fake.is_foreground=False; rejects(lambda:ui.mouse({**obs,'x':100,'y':100,'action':'left_click'})); fake.is_foreground=True
        fake.record['rect'][0]+=1; rejects(lambda:ui.mouse({**obs,'x':100,'y':100,'action':'left_click'})); fake.record['rect'][0]-=1
        assert not fake.events
        ui.mouse({**obs,'x':100,'y':100,'action':'double_click'}); assert len(fake.events)==2
        rejects(lambda:ui.mouse({**obs,'x':100,'y':100,'action':'left_click'}))
        obs=shot(); ui.observed[obs['capture_id']]['time']=time.monotonic()-31
        rejects(lambda:ui.type({**obs,'text':'hello'}))
        obs=shot()
        for keys in (['alt','tab'],['ctrl','escape'],['ctrl','alt','delete'],['win','r'],['f5'],['shift','f5'],['f8']):
            rejects(lambda:ui.hotkey({**obs,'keys':keys}))
        ui.hotkey({**obs,'keys':['ctrl','z']})
        obs=shot(); ui.type({**obs,'text':'Hello 🎮'})
        obs=shot(); ui.scroll({**obs,'x':100,'y':100,'steps':-2})
        obs=shot()
        def panic(args):
            if len(fake.events)>0 and len(args)>=3 and args[2]==2: ui.stop()
        fake.on_move=panic
        rejects(lambda:ui.drag({**obs,'from_x':100,'from_y':100,'to_x':200,'to_y':200,'duration':.15}))
        assert fake.events[-1][0]=='mouse' and fake.events[-1][1][2]==4
        assert not ui.status({})['armed']
        rejects(lambda:ui.capture({'window_id':11}))
        ui.close()
    assert not bridge.studio_ui.status({})['armed']
    listed=bridge.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/list'})['result']['tools']
    assert not {'mouse_action','keyboard_type','keyboard_hotkey'}&{tool['name'] for tool in listed}
    for legacy in ('mouse_action','keyboard_type','keyboard_hotkey'):
        assert 'error' in bridge.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':legacy,'arguments':{}}})
    names={t['name'] for t in STUDIO_UI_TOOLS}
    assert {'studio_drag','studio_window_capture','studio_hotkey','studio_ui_stop'}<=names
    return ['Studio UI local-arm, stale/moved/occluded/foreign window guards and emergency drag release verified with fixtures; no real input sent']
