@echo off
setlocal
title CCNU Radar ngrok sharing
cd /d "%~dp0"
if not exist "tools\ngrok.exe" (
  echo tools\ngrok.exe was not found. Download the official Windows ngrok tool first.
  pause
  exit /b 1
)
if not exist ".ngrok.local.yml" (
  node configure-ngrok.js
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Building CCNU Radar...
call npm --prefix "%~dp0.." run build
if errorlevel 1 (
  pause
  exit /b 1
)
echo Starting sharing. Keep this window open. Press Ctrl+C to stop.
node share-ngrok.js
pause
