@echo off
rem loxley · the wallet: shows it, or walks you through an import into the encrypted keystore
call "%~dp0_common.cmd" || exit /b 1
title loxley wallet
node bin\loxley.js wallet %*
echo.
echo   loxley wallet import   paste a private key or a seed phrase (hidden), encrypted with a passphrase
echo   loxley wallet new      a fresh burner for the sniper
echo.
pause
