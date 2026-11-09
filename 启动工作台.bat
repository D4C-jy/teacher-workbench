@echo off
setlocal
cd /d "%~dp0"
title Teacher Workbench

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js not found.
  echo  Please install Node.js 22 or newer from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  First run: installing dependencies, this may take a few minutes...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Check your network and try again.
    echo.
    pause
    exit /b 1
  )
)

echo.
echo  Starting Teacher Workbench...
echo  The browser will open automatically in a few seconds.
echo  Keep this window open while using the app. Close it to stop.
echo.

call npm run dev

echo.
echo  Server stopped.
pause
