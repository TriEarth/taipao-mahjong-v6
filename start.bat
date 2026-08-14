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

echo Starting Taipao Mahjong server...
echo Keep this window open while playing.
echo.
set "PORT=3005"
"%NODE_EXE%" server.js

echo.
echo Server stopped.
pause
