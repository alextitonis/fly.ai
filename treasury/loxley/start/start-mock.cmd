@echo off
rem loxley · the mock chain on http://127.0.0.1:4699 for a rehearsal without real ETH.
rem            in a second window: set RPC_URL=http://127.0.0.1:4699 and run any command.
call "%~dp0_common.cmd" || exit /b 1
title loxley mock chain
set PORT=4699
node test\mock-chain.js
pause
