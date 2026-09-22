@echo off
cd /d "%~dp0"
title Taipao Mahjong - Public Internet
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public.ps1"
set "TAIPAO_PUBLIC_EXIT_CODE=%ERRORLEVEL%"
cd /d "%TEMP%"
if not "%TAIPAO_PUBLIC_EXIT_CODE%"=="0" (
  echo The launcher has stopped. Press any key to close this window.
  pause >nul
)
exit /b %TAIPAO_PUBLIC_EXIT_CODE%
