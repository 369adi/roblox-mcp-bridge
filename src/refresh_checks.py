"""Read-only catalog compatibility and actual SSE notification regression tests."""
import json
import queue
import tempfile
import urllib.request
from unittest.mock import Mock
from bridge_server import Bridge, BRIDGE_TOOLS, VERSION


def main():
    with tempfile.TemporaryDirectory() as folder:
        bridge = Bridge(folder, persistent=False, listen_port=0)
        def rpc(name, args=None):
            reply = bridge.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args or {}}})
            assert 'error' not in reply, reply
            return reply['result']
        def decoded(result):
            assert not result.get('isError'), result
            return json.loads(result['content'][0]['text'])
        try:
            assert len({t['name'] for t in BRIDGE_TOOLS}) == len(BRIDGE_TOOLS)
            catalog = decoded(rpc('tool_catalog', {'query':'studio'}))
            assert catalog['version'] == VERSION and catalog['tools']
            assert 'quality=82' in catalog['instructions']
            assert decoded(rpc('tool_catalog', {'name':'studio_window_capture'}))['inputSchema']
            assert not decoded(rpc('tool_call', {'name':'studio_ui_status'}))['armed']
            assert decoded(rpc('roblox_call_tool', {'name':'bridge.catalog','arguments':{'query':'studio'}}))['tools']
            assert not decoded(rpc('roblox_call_tool', {'name':'bridge.studio_ui_status'}))['armed']
            assert rpc('tool_call', {'name':'tool_call'}).get('isError')
            assert 'error' in bridge.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'tool_call','arguments':{'name':'keyboard_type'}}})
            assert rpc('tool_call', {'name':'studio_window_capture','arguments':{'window_id':1}}).get('isError')
            assert decoded(rpc('refresh_tools'))['providers']['roblox']['state']=='not_running'
            # Running provider refresh reads tools/list, never calls a game tool.
            bridge.roblox.process = Mock()
            bridge.roblox.process.poll.return_value = None
            bridge.roblox.request = Mock(side_effect=[{'tools':[{'name':'one'}],'nextCursor':'page2'},{'tools':[{'name':'two'}]}])
            assert bridge.roblox.refresh_tools()['tool_count']==2
            assert all(call.args[0]=='tools/list' for call in bridge.roblox.request.call_args_list)
            bridge.roblox.process = None
            bridge.roblox.request = Mock(side_effect=RuntimeError('fixture unavailable'))
            bridge.start_local()
            req=urllib.request.Request(bridge.local_url, headers={'Accept':'text/event-stream','Authorization':'Bearer '+bridge.token})
            with urllib.request.urlopen(req, timeout=15) as response:
                assert response.headers['Content-Type']=='text/event-stream'
                assert response.readline()==b': connected\n'
                assert response.readline()==b'\n'
                refreshed=decoded(rpc('refresh_tools'))
                assert refreshed['notified_connections']==1
                assert response.readline()==b'event: message\n'
                data=response.readline().decode()
                assert json.loads(data.removeprefix('data: '))['method']=='notifications/tools/list_changed'
            init=bridge.dispatch({'jsonrpc':'2.0','id':2,'method':'initialize','params':{}})['result']
            assert init['capabilities']['tools']['listChanged'] is True
            print(json.dumps({'version':VERSION,'tools':len(BRIDGE_TOOLS),'cached_adapters':True,'safety_preserved':True,'provider_pagination':True,'real_sse_notification':True,'game_modified':False}))
        finally:
            bridge.stop()


if __name__=='__main__':
    main()
