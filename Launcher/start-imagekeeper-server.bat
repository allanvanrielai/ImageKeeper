@echo off
rem Image Keeper local server. Serves ONLY the app folder, on this computer only (127.0.0.1), on a fixed port.
rem Usage: start-imagekeeper-server.bat [port]     (default 47614 - do not change it: saved images belong to this exact address)
set PORT=%1
if "%PORT%"=="" set PORT=47614
set APPDIR=%~dp0..\app
rem If something already answers on the port (for example Image Keeper is already running) there is nothing to do.
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', %PORT%); $c.Close(); exit 0 } catch { exit 1 }"
if %ERRORLEVEL% EQU 0 exit /b 0
python "%~dp0serve.py" %PORT% "%APPDIR%"
