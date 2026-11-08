@echo off
REM ============================================================
REM  Dragon Field - roll this folder back to an older version (Windows).
REM  Double-click and type a version (e.g. 0.70.39). Then run upload.bat.
REM  The real work is in tools\rollback.js. It never uploads by itself,
REM  and never touches server\data (accounts, saves) or .env.
REM
REM  KEEP THIS FILE ASCII-ONLY WITH CRLF LINE ENDINGS (see upload.bat).
REM ============================================================
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   [!] Node.js not found. Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
node tools\rollback.js %*
echo.
pause
