@echo off
setlocal
cd /d "%~dp0"

set PORT=8080
set SERVE=server\win\miniserve.exe

if not exist "%SERVE%" (
  echo Missing %SERVE%
  echo This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo Missing dist\index.html
  echo This portable package is incomplete. Re-download the release or rebuild with: npm run build:portable
  pause
  exit /b 1
)

echo Shooting Script Liner - http://127.0.0.1:8080/index.html
echo Close this window to stop the server.
start "" "http://127.0.0.1:8080/index.html"
"%SERVE%" dist -p %PORT% --interfaces 127.0.0.1
