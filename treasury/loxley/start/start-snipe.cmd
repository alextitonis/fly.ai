@echo off
rem loxley · the sniper on paper: every fire is imagined, every mark is real. nothing is signed.
rem            for the live sniper open a terminal here and run:  node bin\loxley.js snipe --live
call "%~dp0_common.cmd" || exit /b 1
title loxley snipe (paper)
node bin\loxley.js snipe %*
echo.
pause
