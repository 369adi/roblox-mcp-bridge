"""Updater staging, integrity and real PowerShell file-swap tests in a disposable folder."""
import hashlib
import io
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path
from auto_update import AutoUpdater


def run_update_checks():
    origin = '369adi/roblox-mcp-bridge'
    files = {'PC-MCP-Bridge.exe': b'new-bridge-fixture', '_internal/example.txt': b'new-internal-fixture'}
    manifest = {'version':'5.6.0','repository':origin,'files':{k:hashlib.sha256(v).hexdigest() for k,v in files.items()}}
    stream = io.BytesIO()
    with zipfile.ZipFile(stream,'w') as archive:
        for name,data in files.items(): archive.writestr(name,data)
        archive.writestr('release-manifest.json',json.dumps(manifest))
    payload = stream.getvalue()
    name = 'PC-MCP-Bridge-v5.6.0-windows-x64.zip'
    base = 'https://github.com/'+origin+'/releases/download/v5.6.0/'
    release = json.dumps({'tag_name':'v5.6.0','assets':[{'name':n,'browser_download_url':base+n} for n in (name,name+'.sha256')]}).encode()
    responses = {'https://api.github.com/repos/'+origin+'/releases/latest':release,base+name:payload,
                 base+name+'.sha256':hashlib.sha256(payload).hexdigest().encode()}
    with tempfile.TemporaryDirectory(prefix='bridge-update-check-') as folder:
        root=Path(folder)
        updater=AutoUpdater('5.5.0',root,lambda *_:None,origin)
        updater.fetch=lambda url,maximum: responses[url]
        assert updater.check()['status']=='staged'
        install=root/'install'; install.mkdir()
        (install/'PC-MCP-Bridge.exe').write_bytes(b'old-fixture')
        job={'root':str(install),'payload':updater.pending['payload'],'pid':99999999,'files':manifest['files']}
        job_path=Path(updater.pending['folder'])/'job.json'; job_path.write_text(json.dumps(job),encoding='utf-8')
        helper=Path(__file__).with_name('apply_update.ps1')
        # In a frozen build the helper is bundled at the runtime root.
        import sys
        if not helper.is_file(): helper=Path(sys._MEIPASS)/'apply_update.ps1'
        process=subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(helper),'-JobPath',str(job_path),'-NoRestart'],
                               capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=30)
        error_file=Path(updater.pending['folder'])/'update-error.txt'
        assert process.returncode==0, error_file.read_text(errors='replace') if error_file.exists() else process.stderr.decode(errors='replace')
        assert (install/'PC-MCP-Bridge.exe').read_bytes()==files['PC-MCP-Bridge.exe']
        assert (Path(updater.pending['folder'])/'backup/PC-MCP-Bridge.exe').read_bytes()==b'old-fixture'
        corrupt=AutoUpdater('5.5.0',root/'corrupt',lambda *_:None,origin)
        corrupt.fetch=lambda url,maximum: b'0'*64 if url.endswith('.sha256') else responses[url]
        try:
            corrupt.check()
            raise AssertionError('Corrupt update accepted')
        except ValueError:
            pass
    return ['Release manifest/checksum validation and actual file-swap/backup helper verified in isolated fixture; corrupt archive rejected']
