"""Full-PC UI fixture tests: never inject input into the real desktop."""
import json
import tempfile
import time
from types import SimpleNamespace
from unittest.mock import patch
from desktop_ui import DesktopUI, DESKTOP_UI_TOOLS
from studio_ui_checks import FakeWindow


def run_desktop_ui_checks(bridge):
    class FakeDesktop(FakeWindow):
        def __init__(self):
            super().__init__()
            self.record.update(window_id=1,exe='fixture/AnyApplication.exe',foreground_window=33)
        def info(self,hwnd):
            if hwnd!=1: raise ValueError('Invalid desktop fixture')
            return {**self.record,'rect':list(self.record['rect']),'client':list(self.record['client'])}
    def reject(fn):
        try: fn()
        except (ValueError,RuntimeError): return
        raise AssertionError('Desktop consent/freshness guard did not reject')
    fake=FakeDesktop(); emergency=SimpleNamespace(hotkey_ready=True)
    with tempfile.TemporaryDirectory() as folder:
        ui=DesktopUI(folder,emergency,backend=fake)
        reject(lambda:ui.capture({}))
        reject(lambda:ui.windows({}))
        assert not bridge.desktop_ui.status({})['armed']
        ui.arm()
        def shot():
            result=ui.capture({})
            meta=json.loads(result['content'][-1]['text'])
            assert meta['scope']=='full_desktop' and meta['source_size']==[1280,720]
            return {'capture_id':meta['capture_id']}
        args=shot(); ui.mouse({**args,'x':400,'y':300,'action':'left_click'})
        reject(lambda:ui.mouse({**args,'x':400,'y':300,'action':'left_click'}))
        ui.hotkey({**shot(),'keys':['win','r']})
        ui.hotkey({**shot(),'keys':['alt','tab']})
        ui.type({**shot(),'text':'Fixture only'})
        ui.drag({**shot(),'from_x':400,'from_y':300,'to_x':500,'to_y':350,'duration':.15})
        ui.scroll({**shot(),'x':400,'y':300,'steps':2})
        reject(lambda:ui.hotkey({**shot(),'keys':['ctrl','alt','delete']}))
        reject(lambda:ui.hotkey({**shot(),'keys':['ctrl','alt','f12']}))
        args=shot(); fake.record['foreground_window']=44
        reject(lambda:ui.type({**args,'text':'wrong focus'}))
        args=shot(); ui.observed[args['capture_id']]['time']=time.monotonic()-31
        reject(lambda:ui.hotkey({**args,'keys':['enter']}))
        emergency.hotkey_ready=False
        reject(lambda:ui.capture({}))
        emergency.hotkey_ready=True; ui.stop()
        reject(lambda:ui.capture({}))
        bridge.desktop_ui.cancelled.clear()
        bridge.studio_ui.stop()
        assert bridge.desktop_ui.cancelled.is_set()
        assert not any(t['name']=='desktop_arm' for t in DESKTOP_UI_TOOLS)
        image={'content':[{'type':'image','mimeType':'image/jpeg','data':'fixture'}]}
        with patch.object(bridge.desktop_ui,'capture',return_value=image):
            for name,args in [('desktop_capture',{}),('tool_call',{'name':'desktop_capture'})]:
                result=bridge.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}})
                assert result['result']==image  # Native image block, never base64 inside JSON text.
    return ['Full-PC UI: all-app fixture capture/input, Win+R/Alt+Tab, fresh observations, focus-change rejection, local consent and shared emergency stop; no real desktop input sent']
