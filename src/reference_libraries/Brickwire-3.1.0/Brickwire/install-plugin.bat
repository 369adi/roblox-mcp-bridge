@echo off
rem Installs / updates only the Brickwire AI Chat plugin for Roblox Studio.
cd /d "%~dp0"
if not exist "%LOCALAPPDATA%\Roblox\Plugins" mkdir "%LOCALAPPDATA%\Roblox\Plugins"
del /q "%LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.rbxmx" 2>nul
copy /y "plugin\BrickwireChat.plugin.lua" "%LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.lua" >nul
if errorlevel 1 (
  echo [ERROR] Could not copy the plugin. Install manually: drag plugin\BrickwireChat.rbxmx into Studio, right-click it ^> Save as Local Plugin.
) else (
  echo [OK] Installed: %LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.lua
  echo      Fully close and reopen Roblox Studio, then: Plugins tab ^> Brickwire ^> AI Chat
  echo      If it does not appear: View ^> Output and look for lines starting with [Brickwire].
)
pause
