@echo off
setlocal
cd /d "%~dp0"

set "ELECTRON_CACHE=%~dp0.electron-cache"
set "ELECTRON_BUILDER_CACHE=%~dp0.electron-builder-cache"
set "npm_config_cache=%~dp0.npm-cache"

where npm >nul 2>nul
if errorlevel 1 (
  echo [Demask ROI] Node.js/npm is not installed.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Demask ROI] Installing Electron dependencies...
  call npm ci
  if errorlevel 1 exit /b 1
)

call npm run dist:portable
if errorlevel 1 (
  echo [Demask ROI] Packaging failed.
  pause
  exit /b 1
)

echo [Demask ROI] Portable Lada build created in dist.
pause
