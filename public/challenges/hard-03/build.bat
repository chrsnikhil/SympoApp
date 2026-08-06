@echo off
setlocal
pushd "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
set RC=%ERRORLEVEL%
popd
exit /b %RC%
