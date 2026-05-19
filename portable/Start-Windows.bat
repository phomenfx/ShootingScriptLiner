@echo off
setlocal
cd /d "%~dp0"

set PORT=8080
set SERVE=server\win\miniserve.exe

if not exist "%SERVE%" (
  echo Missing %SERVE%
  echo Run from project root: npm run build:portable
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Missing dist\index.html
  echo Run from project root: npm run build:portable
  echo Or double-click Start-Windows.bat in the parent folder.
  pause
  exit /b 1
)

echo Shooting Script Liner - http://127.0.0.1:%PORT%
echo Close this window to stop the server.
start "" "http://127.0.0.1:%PORT%"
"%SERVE%" dist -p %PORT% --interfaces 127.0.0.1
