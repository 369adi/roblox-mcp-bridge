$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath 'rea-runtime/node_modules/rea-agents/scripts/rea.mjs')) { throw 'Run npm ci inside rea-runtime first' }
    python -m PyInstaller --noconfirm bridge.spec
    if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
} finally { Pop-Location }
