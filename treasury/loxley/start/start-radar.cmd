@echo off
rem loxley · the launch radar, drawn in the terminal. reads only, never signs.
call "%~dp0_common.cmd" || exit /b 1
title loxley radar
node bin\loxley.js radar %*
echo.
pause
