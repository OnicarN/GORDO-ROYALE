@echo off
title Gordo Royale - Servidor (no cerrar)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js: https://nodejs.org
  pause
  exit /b
)
if not exist node_modules call npm install
node server.js --open
pause
