@echo off
rem loxley · the browser desk on http://127.0.0.1:4664
call "%~dp0_common.cmd" || exit /b 1
title loxley desk
node bin\loxley.js desk %*
echo.
pause
