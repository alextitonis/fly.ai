@echo off
rem loxley · every pons v2 launch as it lands, read and scored. reads only, never signs.
call "%~dp0_common.cmd" || exit /b 1
title loxley hunt
node bin\loxley.js hunt %*
echo.
pause
