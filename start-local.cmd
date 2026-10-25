@echo off
setlocal
title CCNU Radar - Website and Backend
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 first, then reopen this window.
  pause
  exit /b 1
)
if not exist "node_modules\vite" (
  call npm ci
  if errorlevel 1 goto failed
)
if not exist "server\node_modules\express" (
  call npm --prefix server ci
  if errorlevel 1 goto failed
)
call npm run build
if errorlevel 1 goto failed
call npm start
if errorlevel 1 goto failed
exit /b 0
:failed
echo Startup failed. Read the message above; your saved data has not been deleted.
pause
exit /b 1
