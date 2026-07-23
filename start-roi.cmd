@echo off
setlocal
cd /d "%~dp0"

set "npm_config_cache=%~dp0.npm-cache"
set "ELECTRON_CACHE=%~dp0.electron-cache"

if not exist ".venv-lada\Scripts\python.exe" (
  echo [Demask ROI] Lada Python/CUDA environment is missing.
  echo Run setup-dev.cmd first.
  pause
  exit /b 1
)

if not exist "models\lada_mosaic_restoration_model_generic_v1.2.pth" (
  echo [Demask ROI] Lada v1.2 model weight is missing.
  echo Run download-model.cmd first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Demask ROI] Node.js/npm is not installed.
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [Demask ROI] Installing Electron dependencies...
  call npm install
  if errorlevel 1 (
    echo [Demask ROI] Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm start
if errorlevel 1 pause
