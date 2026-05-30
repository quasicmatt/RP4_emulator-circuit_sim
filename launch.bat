@echo off
title RPi Circuit Sim

:: Try to find electron.exe - check common locations
set "SCRIPT_DIR=%~dp0"
set "ELECTRON_EXE="

:: Check if electron is in node_modules
if exist "%SCRIPT_DIR%node_modules\electron\dist\electron.exe" (
    set "ELECTRON_EXE=%SCRIPT_DIR%node_modules\electron\dist\electron.exe"
    goto :found
)

:: Check Downloads folder (common manual install location)
for /d %%D in ("%USERPROFILE%\Downloads\electron-*-win32-x64") do (
    if exist "%%D\electron.exe" (
        set "ELECTRON_EXE=%%D\electron.exe"
        goto :found
    )
)

:: Not found - ask user
echo Could not find electron.exe automatically.
echo.
set /p ELECTRON_EXE="Paste the full path to electron.exe and press Enter: "

:found
echo Launching RPi Circuit Sim...
echo Using Electron: %ELECTRON_EXE%
cd /d "%SCRIPT_DIR%"
start "" "%ELECTRON_EXE%" .
