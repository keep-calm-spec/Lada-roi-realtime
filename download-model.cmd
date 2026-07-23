@echo off
setlocal
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\download-model.ps1"
if errorlevel 1 (
  echo [Demask ROI] Model download failed.
  pause
  exit /b 1
)

echo [Demask ROI] Lada model is ready.
