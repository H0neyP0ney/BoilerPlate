@echo off
rem Deploiement FTP en un clic : build + envoi dans REMOTE_DIR/<version>/ (voir .env.deploy).
rem   deploy.bat           -> deploie la version actuelle
rem   deploy.bat --bump    -> incremente la version (patch) avant l'envoi
rem   deploy.bat --force   -> ecrase la version si elle existe deja sur le serveur
cd /d "%~dp0"
if not exist ".env.deploy" (
  echo.
  echo Fichier .env.deploy introuvable : copie .env.deploy.example en .env.deploy et remplis tes identifiants FTP.
  echo.
  pause
  exit /b 1
)
call npm run deploy --bump
echo.
pause
