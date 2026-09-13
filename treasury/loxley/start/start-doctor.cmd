@echo off
rem loxley · is the chain there, does the explorer answer, is the wallet in place
call "%~dp0_common.cmd" || exit /b 1
title loxley doctor
node bin\loxley.js doctor %*
echo.
pause
