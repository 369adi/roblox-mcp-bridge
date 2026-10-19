"""Isolated Bearer-only restart, URL and retired OAuth endpoint checks."""
import json
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from secure_state import SecureState
from tailscale_gateway import plan
from startup_tools import canonical_executable


def run_restart_checks(bridge_class):
    with tempfile.TemporaryDirectory() as folder:
        first=bridge_class(data_dir=folder,persistent=True,listen_port=0)
        url='https://restart-fixture.example.ts.net/pc-mcp-bridge/mcp'
        first.remember_public_url(url)
        key=first.token
        # Even historical encrypted OAuth data grants no runtime access.
        first.store.set('oauth',{'access':{'legacy':'fixture'}})
        first.stop()
        second=bridge_class(data_dir=folder,persistent=True,listen_port=0)
        assert second.token==key and second.public_url==url and not hasattr(second,'oauth')
        second.start_local()
        def request(path,token=None):
            headers={'Content-Type':'application/json'}
            if token: headers['Authorization']='Bearer '+token
            req=urllib.request.Request(second.local_url.removesuffix('/mcp')+path,json.dumps({'jsonrpc':'2.0','id':1,'method':'ping','params':{}}).encode(),headers)
            try:
                with urllib.request.urlopen(req,timeout=10) as response: return response.status,dict(response.headers)
            except urllib.error.HTTPError as exc: return exc.code,dict(exc.headers)
        assert request('/mcp',key)[0]==200
        status,headers=request('/mcp','legacy-oauth-token')
        assert status==401 and 'resource_metadata' not in str(headers).lower()
        assert request('/mcp')[0]==401
        for path in ('/register','/authorize','/approve','/token','/revoke','/.well-known/oauth-authorization-server'):
            assert request(path,key)[0]==404
        try: second.remember_public_url('https://different.example.ts.net/pc-mcp-bridge/mcp')
        except ValueError: pass
        else: raise AssertionError('URL silently changed')
        second.stop()
        stale=SecureState(Path(folder)); stale.set('unrelated_fixture','value')
        assert SecureState(Path(folder)).get('token')==key
        third=bridge_class(data_dir=folder,persistent=True,listen_port=0)
        assert third.public_url==url and third.token==key
        third.stop()
    config={'Web':{'test.ts.net:443':{'Handlers':{'/':{'Proxy':'http://127.0.0.1:3747'}}}}}
    original=repr(config)
    assert plan(config,'test.ts.net','http://127.0.0.1:8879')==[('/pc-mcp-bridge','http://127.0.0.1:8879')]
    assert repr(config)==original
    with tempfile.TemporaryDirectory() as folder:
        root=Path(folder); install=root/'canonical'; install.mkdir(); (install/'_internal').mkdir()
        target=install/'PC-MCP-Bridge.exe'; target.write_bytes(b'fixture-not-executed')
        (root/'startup-install.json').write_text(json.dumps({'executable':str(target)}),encoding='utf-8')
        assert canonical_executable(root/'download'/'PC-MCP-Bridge.exe',root)==target
        assert canonical_executable(target,root) is None
        (root/'startup-install.json').write_text('{broken',encoding='utf-8')
        assert canonical_executable(target,root) is None
    return ['Bearer key and public URL stable across 3 instances before networking; OAuth routes/tokens disabled; anonymous denied; unrelated Funnel routes preserved']
