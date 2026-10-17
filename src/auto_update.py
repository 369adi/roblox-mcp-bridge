"""Pinned GitHub Releases updater; stage checksummed bundles, apply at normal exit."""
import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath
from update_config import UPDATE_REPOSITORY


def version_tuple(value):
    if not re.fullmatch(r'v?\d+\.\d+\.\d+', value):
        raise ValueError('Release must use a stable semantic version')
    return tuple(int(p) for p in value.lstrip('v').split('.'))


def safe_member(name):
    path = PurePosixPath(name)
    if not name or '\\' in name or ':' in name or path.is_absolute() or '..' in path.parts:
        raise ValueError('Unsafe update archive path')
    if len(path.parts) == 1 and name in ('PC-MCP-Bridge.exe', 'release-manifest.json'):
        return name
    if len(path.parts) > 1 and path.parts[0] == '_internal':
        return path.as_posix()
    raise ValueError('Unexpected update file: ' + name)


class AutoUpdater:
    def __init__(self, version, data_dir, emit, repository=UPDATE_REPOSITORY):
        self.version, self.data_dir, self.emit, self.repository = version, Path(data_dir), emit, repository
        self.pending = None
        self.lock = threading.Lock()

    def fetch(self, url, maximum):
        # GitHub may redirect release assets to its dedicated CDN, never another vendor.
        from urllib.parse import urlsplit
        def allowed(target):
            parsed = urlsplit(target)
            return parsed.scheme == 'https' and parsed.hostname in ('api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com')
        if not allowed(url):
            raise ValueError('Untrusted update URL')
        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if not allowed(newurl):
                    raise ValueError('Untrusted release redirect')
                return super().redirect_request(req, fp, code, msg, headers, newurl)
        request = urllib.request.Request(url, headers={'User-Agent': 'Roblox-MCP-Bridge-Updater', 'Accept': 'application/vnd.github+json'})
        with urllib.request.build_opener(Redirect()).open(request, timeout=45) as response:
            data = response.read(maximum + 1)
        if len(data) > maximum:
            raise ValueError('Release file exceeds size limit')
        return data

    def check(self):
        if not self.repository:
            return {'status': 'not_configured', 'reason': 'Public repository owner not yet verified'}
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/roblox-mcp-bridge', self.repository):
            raise ValueError('Invalid pinned repository')
        with self.lock:
            if self.pending:
                return {'status': 'staged', 'version': self.pending['version']}
            release = json.loads(self.fetch('https://api.github.com/repos/' + self.repository + '/releases/latest', 1000000))
            latest = release.get('tag_name', '')
            if release.get('draft') or release.get('prerelease') or version_tuple(latest) <= version_tuple(self.version):
                return {'status': 'up_to_date'}
            assets = {a['name']: a for a in release.get('assets', [])}
            archive_name = 'PC-MCP-Bridge-' + latest + '-windows-x64.zip'
            def asset_url(name):
                url = assets[name]['browser_download_url']
                prefix = 'https://github.com/' + self.repository + '/releases/download/' + latest + '/'
                if not url.startswith(prefix) or url[len(prefix):] != name:
                    raise ValueError('Release asset does not belong to the pinned repository')
                return url
            checksum = self.fetch(asset_url(archive_name + '.sha256'), 500).decode('ascii').split()[0]
            if not re.fullmatch('[0-9a-fA-F]{64}', checksum):
                raise ValueError('Missing SHA-256 checksum')
            payload = self.fetch(asset_url(archive_name), 700 * 1024 * 1024)
            if hashlib.sha256(payload).hexdigest() != checksum.lower():
                raise ValueError('Update checksum mismatch')
            folder = self.data_dir / 'updates' / (latest + '-' + os.urandom(6).hex())
            folder.mkdir(parents=True, exist_ok=False)
            archive = folder / 'release.zip'
            archive.write_bytes(payload)
            del payload
            extracted = folder / 'payload'
            with zipfile.ZipFile(archive) as bundle:
                files = [f for f in bundle.infolist() if not f.is_dir()]
                if len(files) > 50000 or sum(f.file_size for f in files) > 2 * 1024**3:
                    raise ValueError('Update archive exceeds extraction limits')
                names = [safe_member(f.filename) for f in files]
                if len({n.casefold() for n in names}) != len(names):
                    raise ValueError('Duplicate update paths')
                for f in files:
                    if (f.external_attr >> 16) & 0o170000 == 0o120000:
                        raise ValueError('Symlink in update archive')
                bundle.extractall(extracted)
            manifest = json.loads((extracted / 'release-manifest.json').read_text('utf-8'))
            if manifest['version'] != latest.lstrip('v') or manifest['repository'] != self.repository:
                raise ValueError('Manifest origin/version mismatch')
            if set(manifest['files']) != set(names) - {'release-manifest.json'}:
                raise ValueError('Manifest file set mismatch')
            if 'PC-MCP-Bridge.exe' not in manifest['files']:
                raise ValueError('Bridge executable missing')
            for name, digest in manifest['files'].items():
                if hashlib.sha256((extracted / safe_member(name)).read_bytes()).hexdigest() != digest:
                    raise ValueError('Extracted file checksum mismatch')
            self.pending = {'folder': str(folder), 'payload': str(extracted), 'version': latest.lstrip('v'), 'manifest': manifest}
            return {'status': 'staged', 'version': latest.lstrip('v'), 'install': 'On normal app close; bridge restarts afterward'}

    def background(self):
        def run():
            try:
                result = self.check()
                self.emit('log', 'Updater: ' + json.dumps(result))
            except Exception as exc:
                self.emit('log', 'Update check failed; installed version unchanged: ' + type(exc).__name__)
        threading.Thread(target=run, daemon=True).start()

    def apply_on_exit(self):
        if not self.pending or not getattr(sys, 'frozen', False):
            return False
        # Separate updater process waits for the current EXE to exit. It never touches AppData identity/memory.
        root = Path(sys.executable).resolve().parent
        folder = Path(self.pending['folder'])
        job = {'root': str(root), 'payload': self.pending['payload'], 'pid': os.getpid(), 'files': self.pending['manifest']['files']}
        job_path = folder / 'job.json'
        job_path.write_text(json.dumps(job), encoding='utf-8')
        helper = Path(getattr(sys, '_MEIPASS')) / 'apply_update.ps1'
        subprocess.Popen(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(helper), '-JobPath', str(job_path)],
                         creationflags=subprocess.CREATE_NO_WINDOW)
        return True
