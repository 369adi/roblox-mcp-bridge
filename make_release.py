"""Package a tested build for GitHub Releases without identity or user data."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--folder', type=Path, required=True)
parser.add_argument('--repository', required=True)
parser.add_argument('--version', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_.-]+/roblox-mcp-bridge', args.repository) or not re.fullmatch(r'\d+\.\d+\.\d+', args.version):
    raise SystemExit('Use OWNER/roblox-mcp-bridge and a stable x.y.z version')
files = [args.folder / 'PC-MCP-Bridge.exe'] + sorted((args.folder / '_internal').rglob('*'))
files = [p for p in files if p.is_file()]
manifest = {'repository': args.repository, 'version': args.version, 'files': {}}
for path in files:
    if path.is_symlink() or path.suffix in ('.dpapi', '.sqlite3') or path.name == '.env':
        raise SystemExit('Unexpected sensitive file or symlink: ' + str(path))
    manifest['files'][path.relative_to(args.folder).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
args.output.mkdir(parents=True, exist_ok=True)
archive = args.output / ('PC-MCP-Bridge-v' + args.version + '-windows-x64.zip')
with zipfile.ZipFile(archive, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as bundle:
    for path in files:
        bundle.write(path, path.relative_to(args.folder).as_posix())
    bundle.writestr('release-manifest.json', json.dumps(manifest))
archive.with_suffix(archive.suffix + '.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest() + '  ' + archive.name + '\n', encoding='ascii')
print(archive)
