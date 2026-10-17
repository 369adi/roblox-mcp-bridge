@echo off
setlocal EnableDelayedExpansion
title Brickwire - install
cd /d "%~dp0"
echo.
echo  === Brickwire installer ===
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js not found. Trying to install Node.js LTS with winget...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo [X] winget is not available. Install Node.js 20+ from https://nodejs.org and run install.bat again.
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo [i] Node.js installed. CLOSE this window and run install.bat again so PATH is refreshed.
  pause
  exit /b 0
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAJOR=%%v
if !NODEMAJOR! LSS 20 (
  echo [X] Node.js !NODEMAJOR! is too old. Brickwire needs Node.js 20 or newer.
  pause
  exit /b 1
)
echo [OK] Node.js found:
node -v

if not exist "bridge\dist\bridge.mjs" (
  echo [i] bridge\dist\bridge.mjs missing - building from source...
  call npm install || goto :fail
  call npm run build || goto :fail
)
if not exist ".env" (
  copy /y ".env.example" ".env" >nul
  echo [OK] Created .env from .env.example
)

set EXT=%~dp0extension
if exist "%~dp0extension\dist\manifest.json" set EXT=%~dp0extension\dist

if exist "%LOCALAPPDATA%\Roblox\mcp.bat" (
  echo [OK] Roblox Studio MCP launcher found: %LOCALAPPDATA%\Roblox\mcp.bat
) else (
  echo [!] %LOCALAPPDATA%\Roblox\mcp.bat not found yet.
  echo     Open Roblox Studio ^> Assistant ^> ... ^> Manage MCP Servers ^> enable "Enable Studio as MCP server".
)

if exist "%LOCALAPPDATA%\Roblox" (
  if not exist "%LOCALAPPDATA%\Roblox\Plugins" mkdir "%LOCALAPPDATA%\Roblox\Plugins"
  copy /y "plugin\BrickwireChat.plugin.lua" "%LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.lua" >nul && echo [OK] Studio plugin installed: Plugins tab ^> Brickwire ^> AI Chat ^(restart Studio^)
)
echo.
echo  Next steps:
echo   1. Open chrome://extensions  (or edge://extensions)
echo   2. Enable "Developer mode"
echo   3. Click "Load unpacked" and select:
echo        %EXT%
echo   4. Run start.bat
echo   5. Open Roblox Studio with a place
echo   6. Open https://chat.deepseek.com  (other sites are experimental)
echo   7. When start.bat shows READY, click "Start Agent" in the panel
echo.
explorer "%EXT%"
pause
exit /b 0

:fail
echo [X] Build failed. See messages above.
pause
exit /b 1
