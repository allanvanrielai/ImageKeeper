@echo off
rem Opens Image Keeper as its own Chrome app window (no tabs, no address bar), always in the Chrome profile "APPS" (folder "Profile 5").
rem The saved images live in that one profile, so opening the app in any other profile would show an empty tray.
rem Starts the server first if it is not running.
wscript "%~dp0start-imagekeeper-hidden.vbs"
timeout /t 2 /nobreak >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --profile-directory="Profile 5" --app=http://localhost:47614/
