@echo off
setlocal
cd /d "%~dp0"

set "UV_CACHE_DIR=%~dp0.uv-cache"
set "UV_PYTHON_INSTALL_DIR=%~dp0.uv-python"

if not exist ".venv-lada\Scripts\python.exe" (
  echo [Demask ROI] Missing .venv-lada Python environment.
  echo Run setup-dev.cmd before packaging.
  exit /b 1
)

.venv-lada\Scripts\python.exe -c "import PyInstaller" >nul 2>nul
if errorlevel 1 (
  where uv >nul 2>nul
  if errorlevel 1 (
    echo [Demask ROI] uv is not installed or not available on PATH.
    exit /b 1
  )
  echo [Demask ROI] Installing PyInstaller...
  uv pip install --python .venv-lada\Scripts\python.exe pyinstaller==6.21.0
  if errorlevel 1 exit /b 1
)

echo [Demask ROI] Building standalone Lada CUDA worker...
.venv-lada\Scripts\python.exe -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onedir ^
  --name lada-worker ^
  --distpath worker-dist ^
  --workpath .cache\pyinstaller ^
  --specpath .cache\pyinstaller ^
  --paths vendor\lada ^
  --collect-data mmengine ^
  --hidden-import lada.models.basicvsrpp.basicvsrpp_gan ^
  --hidden-import lada.models.basicvsrpp.mmagic.basicvsr_plusplus_net ^
  python\lada_worker.py

if errorlevel 1 exit /b 1
echo [Demask ROI] Lada worker ready: worker-dist\lada-worker\lada-worker.exe
