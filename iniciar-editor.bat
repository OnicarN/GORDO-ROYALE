@echo off
setlocal
cd /d "%~dp0"
"%~dp0tools\Godot_v4.7.2\Godot_v4.7.2-stable_win64.exe" --editor --path "%~dp0"
