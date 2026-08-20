@echo off
setlocal
title Centro de Custos - Teste ChatGPT
cd /d "%~dp0"

echo.
echo ================================================================
echo   CENTRO DE CUSTOS - VERSAO DE TESTE CHATGPT
echo ================================================================
echo.
echo Esta copia usa uma porta e um banco separados da versao principal.
echo Nenhum dado real sera alterado por este inicializador.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS pelo site oficial e execute este arquivo novamente.
  echo.
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)

if not exist ".env" (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-test-chatgpt.ps1"
  if errorlevel 1 (
    echo.
    echo A configuracao de teste nao foi concluida.
    pause
    exit /b 1
  )
)

if not exist "node_modules\@electric-sql\pglite" (
  echo.
  echo Instalando os componentes. Isto pode demorar alguns minutos...
  echo A internet e necessaria somente nesta primeira instalacao.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo Nao foi possivel instalar os componentes.
    echo Verifique a internet e tente novamente.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando a versao de teste...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-test-chatgpt.ps1"
if errorlevel 1 (
  echo.
  echo O sistema nao conseguiu iniciar.
  echo Consulte servidor-chatgpt-erro.log dentro desta pasta.
  pause
  exit /b 1
)

echo.
echo O sistema foi aberto em http://localhost:3334
echo Para encerrar, use o arquivo PARAR-TESTE-CHATGPT.bat.
echo.
pause
