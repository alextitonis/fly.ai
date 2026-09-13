@echo off
rem loxley · the whole desk in one command, against the mock chain in this folder.
rem no wallet, no ether, no network: the chain runs inside the same process and is closed when it ends.
call "%~dp0_common.cmd" || exit /b 1
title loxley tour
node bin\loxley.js tour %*
echo.
pause
