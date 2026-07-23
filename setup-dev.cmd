@echo off
setlocal
cd /d "%~dp0"

set "UV_CACHE_DIR=%~dp0.uv-cache"
set "UV_PYTHON_INSTALL_DIR=%~dp0.uv-python"
set "UV_ENVIRONMENT=%~dp0.venv-lada"
set "npm_config_cache=%~dp0.npm-cache"
set "ELECTRON_CACHE=%~dp0.electron-cache"
set "ELECTRON_BUILDER_CACHE=%~dp0.electron-builder-cache"

where uv >nul 2>nul
if errorlevel 1 (
  echo [Demask ROI] uv is required.
  echo Install it from https://docs.astral.sh/uv/getting-started/installation/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [Demask ROI] Node.js and npm are required.
  echo Install the current Node.js LTS release from https://nodejs.org/
  pause
  exit /b 1
)

echo [Demask ROI] Installing Python 3.12 on this drive...
uv python install 3.12
if errorlevel 1 exit /b 1

if not exist ".venv-lada\Scripts\python.exe" (
  echo [Demask ROI] Creating the Python environment...
  uv venv --python 3.12 ".venv-lada"
  if errorlevel 1 exit /b 1
)

echo [Demask ROI] Installing PyTorch CUDA 12.6...
uv pip install --python ".venv-lada\Scripts\python.exe" ^
  "torch==2.8.0+cu126" "torchvision==0.23.0+cu126" ^
  --extra-index-url "https://download.pytorch.org/whl/cu126"
if errorlevel 1 exit /b 1

echo [Demask ROI] Installing worker dependencies...
uv pip install --python ".venv-lada\Scripts\python.exe" -r requirements-worker.txt
if errorlevel 1 exit /b 1

echo [Demask ROI] Installing Electron dependencies...
call npm ci
if errorlevel 1 exit /b 1

call download-model.cmd
if errorlevel 1 exit /b 1

echo.
echo [Demask ROI] Development environment is ready.
echo Run start-roi.cmd to launch the application.
pause
