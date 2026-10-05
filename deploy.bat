@echo off
rem Deploiement FTP en un clic : build + envoi dans REMOTE_DIR/<version>/ (voir .env.deploy).
rem   deploy.bat           -> demande quoi faire : [N] version actuelle, [B] bump (nouvelle version), [F] force (ecraser)
rem   deploy.bat --bump    -> incremente la version (patch) avant l'envoi, sans poser la question
rem   deploy.bat --force   -> ecrase la version si elle existe deja sur le serveur, sans poser la question
cd /d "%~dp0"
if not exist ".env.deploy" (
  echo.
  echo Fichier .env.deploy introuvable : copie .env.deploy.example en .env.deploy et remplis tes identifiants FTP.
  echo.
  pause
  exit /b 1
)
call npm run deploy -- %*
echo.
pause
