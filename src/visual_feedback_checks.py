"""Auto-observation regression fixtures; no real game changes or desktop input."""
import json
from unittest.mock import patch
from pc_mcp_bridge import result_text
from rea_gateway import REAGateway
from roblox_gateway import RobloxGateway
from builder_tools import BuilderTools
from visual_feedback import attach_capture


def run_visual_feedback_checks(bridge):
    image={'content':[{'type':'image','mimeType':'image/jpeg','data':'fixture'},{'type':'text','text':'{"capture_id":"new-observation"}'}]}
    gateway=RobloxGateway(lambda *_:None)
    args={'name':'execute_luau','arguments':{'studio_id':'fixture','code':'return true'}}
    with patch.object(REAGateway,'call',return_value=result_text('built')) as action, patch.object(gateway,'capture',return_value=image) as capture:
        result=gateway.call(args)
        assert action.call_count==1 and capture.call_count==1
        assert any(c.get('type')=='image' for c in result['content'])
        assert capture.call_args.args[0]['studio_id']=='fixture'
        BuilderTools(gateway).run({'studio_id':'fixture','code':'return true','target':'Workspace.NewModel'})
        assert capture.call_count==2
        assert capture.call_args.args[0]['target']=='Workspace.NewModel'
        BuilderTools(gateway).summary({'studio_id':'fixture','path':'Workspace.Model'})
        assert capture.call_count==2
        gateway.call({**args,'visual':False})
        assert capture.call_count==2
        action.return_value=result_text('partial failure',is_error=True)
        assert gateway.call(args)['isError'] and capture.call_count==2
        action.return_value=result_text('built')
        capture.side_effect=TimeoutError('fixture render unavailable')
        result=gateway.call(args)
        assert not result.get('isError') and 'capture_failed' in result['content'][-1]['text']
        assert action.call_count==6  # Capture failure never replays the mutation.
    result=attach_capture(result_text('done'),lambda:result_text('no renderer',is_error=True))
    assert not result.get('isError') and 'Do NOT rerun' in result['content'][-1]['text']
    with patch.object(bridge.desktop_ui,'mouse',return_value={'completed':True}) as mouse, patch.object(bridge.desktop_ui,'capture',return_value=image) as capture:
        reply=bridge.dispatch({'jsonrpc':'2.0','id':99,'method':'tools/call','params':{'name':'tool_call','arguments':{'name':'desktop_mouse','arguments':{}}}})
        assert any(c.get('type')=='image' for c in reply['result']['content'])
        assert mouse.call_count==1 and capture.call_count==1
    return ['Automatic builder/raw Luau and post-UI images preserved as native MCP blocks; read-only helpers skip capture; errors never replay actions; no real game/desktop mutation']
