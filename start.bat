@echo off
setlocal
cd /d "%~dp0"
title Taipao Mahjong Server

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Node.js was not found.
    echo Please install Node.js 18 or newer from https://nodejs.org/
    pause
    exit /b 1
  )
)

echo Starting or connecting to Taipao Mahjong...
echo.
set "PORT=3005"
"%NODE_EXE%" start-local.js
set "TAIPAO_EXIT_CODE=%ERRORLEVEL%"
cd /d "%TEMP%"
if not "%TAIPAO_EXIT_CODE%"=="0" (
  echo.
  echo Startup failed. See the message above.
  pause
)
exit /b %TAIPAO_EXIT_CODE%
