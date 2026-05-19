@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set PORT=8080
set APP=portable\dist
set SERVE=portable\server\win\miniserve.exe

call :EnsurePortable || exit /b 1

echo.
echo Shooting Script Liner - http://127.0.0.1:%PORT%
echo Close this window to stop the server.
start "" "http://127.0.0.1:%PORT%"
"%SERVE%" "%APP%" -p %PORT% --interfaces 127.0.0.1
exit /b 0

:EnsurePortable
if exist "%APP%\index.html" if exist "%SERVE%" exit /b 0

echo.
echo  The offline app is not ready yet.
echo.

if not exist "%SERVE%" (
  echo  Missing: %SERVE%
  echo.
)

if not exist "%APP%\index.html" (
  echo  Missing: %APP%\index.html
  echo.
  where npm >nul 2>&1
  if not errorlevel 1 (
    if exist "package.json" (
      echo  Node.js found — building portable package now...
      echo  This may take a minute.
      echo.
      call npm run build:portable
      if exist "%APP%\index.html" if exist "%SERVE%" exit /b 0
    )
  )
)

echo  To fix:
echo    1. Get a full copy that includes the portable\dist folder, OR
echo    2. Install Node.js from https://nodejs.org then run:
echo         npm install
echo         npm run build:portable
echo.
echo  Developers: you can also double-click portable\Start-Windows.bat
echo  after building.
echo.
pause
exit /b 1
