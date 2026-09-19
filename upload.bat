@echo off
chcp 65001 > nul
REM ============================================================
REM  드래곤 필드 — 깃허브에 올리기 (윈도우)
REM
REM  쓰는 법: 이 파일이 있는 폴더에서 **더블클릭**하거나,
REM           명령 프롬프트에서  upload.bat  이라고 칩니다.
REM
REM  ⚠ 이 파일은 rpg-game 폴더 **안**에 있습니다. 그래서 폴더를 옮겨
REM    다니지 않습니다 — 예전 스크립트의 `cd rpg-game` 은, 이미 그 안에서
REM    돌리면 "폴더를 찾을 수 없습니다" 로 끝나 버렸습니다.
REM
REM  ⚠ 커밋 글의 판 번호는 package.json 에서 그대로 읽습니다.
REM    손으로 적으면 언젠가 0.44.0 인 채로 0.51 을 올리게 됩니다(실제로 그랬습니다).
REM ============================================================

cd /d "%~dp0"

REM ── 판 번호 읽기 ────────────────────────────────────────────
set VER=
for /f "usebackq tokens=*" %%v in (`node -p "require('./package.json').version" 2^>nul`) do set VER=%%v
if "%VER%"=="" set VER=unknown

echo.
echo   드래곤 필드 %VER% 을(를) 깃허브에 올립니다.
echo   대상: https://github.com/seotjck1-netizen/dragon-field.git
echo.

REM ── 처음 한 번만 — 깃 준비 ──────────────────────────────────
if not exist ".git" (
  git init
  git branch -M main
)
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin https://github.com/seotjck1-netizen/dragon-field.git
)

REM ── 올리면 안 되는 것 막기 ──────────────────────────────────
REM  server/data 에는 계정과 비밀번호가 들어 있습니다. 절대 올리지 않습니다.
if not exist ".gitignore" (
  > .gitignore echo node_modules/
  >> .gitignore echo server/data/
  >> .gitignore echo server/content/
  >> .gitignore echo .env
  >> .gitignore echo *.zip
  >> .gitignore echo sheets/inbox/
)

git add .
git commit -m "Update %VER%"
git branch -M main
git push -u origin main --force

echo.
if errorlevel 1 (
  echo   ! 올리지 못했습니다. 위의 메시지를 읽어 보세요.
) else (
  echo   ^> 올렸습니다. Render 가 알아서 다시 배포합니다 ^(2~3분^).
  echo   ^> 접속 화면 아래 판 번호가 v%VER% 로 바뀌면 끝입니다.
)
echo.
pause
