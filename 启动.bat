@echo off
chcp 65001 >nul
title wallpaper player
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Node.js not found.
  echo   Install Node.js 18+ from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM GitHub作者主页 github.com/xdedmmc2
node server.mjs --auto-exit
if errorlevel 1 (
  echo.
  echo   Server exited. Press any key to close.
  pause >nul
)
