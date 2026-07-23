@echo off
setlocal

set "RUNTIME_TEMP=%~dp0.runtime-temp"
if not exist "%RUNTIME_TEMP%" mkdir "%RUNTIME_TEMP%"

set "PORTABLE_EXE="
for /f "delims=" %%F in ('dir /b /a:-d /o:-n "%~dp0dist\Demask-ROI-*-portable.exe" 2^>nul') do (
  if not defined PORTABLE_EXE set "PORTABLE_EXE=%~dp0dist\%%F"
)

if not defined PORTABLE_EXE (
  echo [Demask ROI] No portable executable was found in dist.
  pause
  exit /b 1
)

set "TEMP=%RUNTIME_TEMP%"
set "TMP=%RUNTIME_TEMP%"
start "" "%PORTABLE_EXE%"

endlocal
