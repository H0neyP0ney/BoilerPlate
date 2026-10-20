@echo off
rem Rapport d'equilibrage en un clic : lit les parties enregistrees en dev (docs/bench/runs) et ouvre docs/bench/report.html dans le navigateur.
rem   report.bat                 -> toutes les parties de docs/bench/runs
rem   report.bat <dossier>       -> les parties d'un autre dossier
rem   report.bat --no-open       -> genere sans ouvrir le navigateur
cd /d "%~dp0"
call npm run sim:report -- %*
if errorlevel 1 (
  echo.
  echo La generation du rapport a echoue : voir le message ci-dessus.
  echo.
  pause
  exit /b 1
)
