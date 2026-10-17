@echo off
setlocal
title Brickwire
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js 20+ not found. Install it from https://nodejs.org and run install.bat.
  pause
  exit /b 1
)
if not exist "bridge\dist\bridge.mjs" (
  echo [i] First run: installing and building...
  call install.bat || (pause & exit /b 1)
)
rem Starts the bridge and shows live BRIDGE / MCP / STUDIO status. Keep this window open.
node scripts\start.mjs
pause
