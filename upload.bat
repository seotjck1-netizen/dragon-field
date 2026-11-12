@echo off
REM ============================================================
REM  Dragon Field - upload to GitHub (Windows).
REM  Double-click this file. The real work is in tools\upload.js
REM  (version from package.json, commit "Update <ver>", tag v<ver>, push).
REM
REM  KEEP THIS FILE ASCII-ONLY WITH CRLF LINE ENDINGS.
REM  cmd.exe misreads UTF-8 text (Korean comments) once the console code
REM  page is switched to UTF-8, and runs pieces of it as commands - that is
REM  how 0.70.40 failed to upload. Korean messages are printed by Node instead.
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
node tools\upload.js %*
echo.
pause
