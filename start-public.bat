@echo off
cd /d "%~dp0"
title Taipao Mahjong - Public Internet
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-public.ps1"
echo.
echo The launcher has stopped. Press any key to close this window.
pause >nul

