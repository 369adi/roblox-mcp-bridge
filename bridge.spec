from pathlib import Path
import shutil
root = Path(SPECPATH)
node = shutil.which('node')
if not node:
    raise RuntimeError('Node.js is required')
a = Analysis([str(root / 'src/bridge_server.py')], pathex=[str(root / 'src')],
    binaries=[(node, '.')], datas=[
        (str(root / 'rea-runtime/node_modules'), 'rea-runtime/node_modules'),
        (str(root / 'src/starter_skills'), 'starter_skills'),
        (str(root / 'src/reference_libraries'), 'reference_libraries'),
        (str(root / 'src/apply_update.ps1'), '.'),
        (str(root / 'node-LICENSE'), '.'), (str(root / 'THIRD-PARTY-NOTICES.txt'), '.')],
    hiddenimports=[], hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz,a.scripts,[],exclude_binaries=True,name='PC-MCP-Bridge',console=False,upx=False)
bundle = COLLECT(exe,a.binaries,a.datas,name='PC-MCP-Bridge',upx=False)
