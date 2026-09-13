@echo off
rem loxley · shared by the start-*.cmd launchers. double-click one of them, not this file.
rem the terminal prints utf-8: the wordmark is drawn out of quadrant blocks and every separator is a middle dot.
rem a console left on the machine's own codepage turns all of it into mojibake, so ask for utf-8 first. windows
rem terminal is already there and ignores this; the old console needs it.
chcp 65001 >nul 2>nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   loxley needs node 18 or newer. https://nodejs.org/en/download  ^(LTS^), then run this file again.
  echo.
  pause
  exit /b 1
)
exit /b 0
