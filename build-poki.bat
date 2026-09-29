@echo off
rem Double-clic : build de production Poki (verifications + build + zip).
rem Utilise le bash de Git for Windows. Option : build-poki.bat --fast
cd /d "%~dp0"
"C:\Program Files\Git\bin\bash.exe" scripts/build-poki.sh %*
echo.
pause
