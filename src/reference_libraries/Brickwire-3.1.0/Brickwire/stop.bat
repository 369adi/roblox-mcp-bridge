@echo off
setlocal
cd /d "%~dp0"
set PORT=47821
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    if /i "%%a"=="BRICKWIRE_PORT" set PORT=%%b
  )
)
curl -s -m 3 -X POST http://127.0.0.1:%PORT%/api/shutdown >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:%PORT%/api/shutdown -TimeoutSec 3 | Out-Null } catch { exit 1 }"
)
if errorlevel 1 (
  echo [i] Bridge was not running on port %PORT%.
) else (
  echo [OK] Bridge stopped.
)
timeout /t 2 /nobreak >nul
