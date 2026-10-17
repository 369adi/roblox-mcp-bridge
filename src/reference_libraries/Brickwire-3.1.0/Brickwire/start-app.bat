@echo off
setlocal
title Brickwire Pro
cd /d "%~dp0"
set PORT=47821
for /f "tokens=2 delims==" %%p in ('findstr /b BRICKWIRE_PORT= .env 2^>nul') do set PORT=%%p
rem Starts the bridge in its own window (if it is not running yet) and opens the Brickwire Pro app window.
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 http://127.0.0.1:%PORT%/api/health | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Brickwire bridge" /min cmd /c start.bat
  timeout /t 3 /nobreak >nul
)
set URL=http://127.0.0.1:%PORT%/app
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%URL% --window-size=1200,800
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL% --window-size=1200,800
) else (
  start "" %URL%
)
