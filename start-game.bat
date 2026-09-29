@echo off
rem Double-clic : lance le serveur de dev et ouvre le jeu dans le navigateur par defaut.
rem   start-game.bat         partie solo
rem   start-game.bat host    cree une salle en ligne (le code s'affiche dans le jeu)
rem   start-game.bat auto    rejoint une salle publique, sinon en cree une
rem Ferme cette fenetre (ou Ctrl+C) pour arreter le serveur.
cd /d "%~dp0"
set "PAGE=/"
if /i "%~1"=="host" set "PAGE=/?net=host"
if /i "%~1"=="auto" set "PAGE=/?net=auto"
call npm.cmd run dev -w @xiao/swarm-attack -- --open "%PAGE%"
pause
