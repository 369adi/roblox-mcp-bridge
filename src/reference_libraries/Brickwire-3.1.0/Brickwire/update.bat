@echo off
setlocal
title Brickwire - update
cd /d "%~dp0"
call stop.bat
if exist ".git" (
  echo [i] Updating from git...
  git pull --ff-only || goto :fail
  call npm install || goto :fail
  call npm run build || goto :fail
  echo [OK] Updated and rebuilt. Reload the extension in chrome://extensions, run start.bat and restart Roblox Studio (plugin updates itself).
) else (
  echo [i] This is a release folder ^(no .git^).
  echo     1. Download the new release.zip
  echo     2. Extract it over this folder ^(your .env and data\ folder are kept^)
  echo     3. Reload the extension in chrome://extensions, run start.bat and restart Roblox Studio (plugin updates itself).
)
pause
exit /b 0
:fail
echo [X] Update failed.
pause
exit /b 1
