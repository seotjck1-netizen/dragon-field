#!/usr/bin/env node
/**
 * 깃허브에 올리기 (0.70.40 — upload.bat 이 하던 일을 그대로 옮겼다).
 *
 *   node tools/upload.js        (윈도우에서는 upload.bat 을 더블클릭)
 *
 * ── 왜 .bat 에서 옮겼나 ─────────────────────────────────────
 * upload.bat 안에 한글 주석 · 한글 echo 가 있었다. 윈도우 명령 창(cmd)은 .bat 을
 * **한 줄씩 다시 읽으며** 실행하는데, 파일이 UTF-8 이고 줄 끝이 LF 뿐이면(리눅스에서 만든 파일)
 * `chcp 65001` 로 글자판을 바꾼 뒤부터 읽는 자리가 어긋난다. 그러면 한글 주석의 **토막**이
 * 명령으로 실행돼 「'zip'은(는) 내부 또는 외부 명령 … 이 아닙니다」 가 줄줄이 뜨고,
 * 정작 git 명령은 건너뛰거나 잘린 채로 돌아 **아무것도 올라가지 않았다**(0.70.40).
 *
 * 그래서 .bat 은 영어(ASCII) 몇 줄 · CRLF 로만 두고 이 파일을 부른다. Node 는 한글을
 * 글자판과 상관없이 바르게 찍는다. 하는 일은 예전 upload.bat 과 같다:
 *   판 번호(package.json) → git add . → commit "Update <판>" → 태그 v<판> → push(main · 태그)
 *
 * ── 올리기 전에 막는 것 ──────────────────────────────────────
 *   server/data/(계정 · 비밀번호 · 세이브) · .env · sheets/accounts.csv 는 절대 올리지 않는다.
 *   .gitignore 에 빠져 있으면 채워 넣고, 이미 깃에 들어가 있으면 **올리지 않고 멈춘다.**
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REPO = 'https://github.com/seotjck1-netizen/dragon-field.git';
// 절대 올리지 않는 것 — .gitignore 에 반드시 있어야 하는 줄
const MUST_IGNORE = ['server/data/', '.env', 'sheets/accounts.csv', 'node_modules/', '*.zip'];
const SECRET = (p) => p.startsWith('server/data/') || p === '.env' || p === 'sheets/accounts.csv';

/** git 을 돌린다. show=true 면 화면에 그대로 보여 준다(밀어 올리는 동안의 진행 · 로그인 창). */
function git(args, { show = false } = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: show ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
  if (r.error) throw r.error;
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function say(s = '') { console.log(s); }

function main() {
  // 깃이 있나
  try { git(['--version']); } catch {
    say('\n  ! git 을 찾을 수 없습니다. https://git-scm.com 에서 깔고 다시 해 보세요.\n');
    return 1;
  }

  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || 'unknown';
  say('');
  say(`  드래곤 필드 ${ver} 을(를) 깃허브에 올립니다.`);

  // ── 처음 한 번만 — 깃 준비 ──
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    git(['init'], { show: true });
    git(['branch', '-M', 'main']);
  }
  if (!git(['remote', 'get-url', 'origin']).ok) git(['remote', 'add', 'origin', REPO]);
  say(`  대상: ${git(['remote', 'get-url', 'origin']).out || REPO}`);
  say('');

  // ── 올리면 안 되는 것 막기 ──
  const gi = path.join(ROOT, '.gitignore');
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const lines = new Set(have.split(/\r?\n/).map((l) => l.trim()));
  const missing = MUST_IGNORE.filter((l) => !lines.has(l));
  if (missing.length) {
    fs.writeFileSync(gi, (have && !have.endsWith('\n') ? have + '\n' : have)
      + '# 절대 올리지 않는 것(tools/upload.js 가 채움)\n' + missing.join('\n') + '\n');
    say(`  · .gitignore 에 ${missing.join(' · ')} 을(를) 넣었습니다.`);
  }
  const tracked = git(['ls-files']).out.split('\n').filter(Boolean).filter(SECRET);
  if (tracked.length) {
    say('\n  ! 계정 · 비밀번호 파일이 깃에 들어가 있습니다 — 올리지 않고 멈춥니다.');
    for (const p of tracked.slice(0, 8)) say(`      ${p}`);
    say('    아래 명령으로 깃에서만 빼고(파일은 그대로 남습니다) 다시 올리세요:');
    say('      git rm -r --cached server/data .env sheets/accounts.csv');
    say('');
    return 1;
  }

  // ── 담고 · 적고 ──
  git(['add', '.'], { show: true });
  const staged = git(['diff', '--cached', '--name-only']).out.split('\n').filter(Boolean);
  if (staged.some(SECRET)) {
    say('\n  ! 계정 · 비밀번호 파일이 올라갈 뻔했습니다 — 멈춥니다.');
    git(['reset', '-q']);
    return 1;
  }
  if (staged.length) {
    const c = git(['commit', '-m', `Update ${ver}`], { show: true });
    if (!c.ok) { say('\n  ! 커밋하지 못했습니다. 위의 메시지를 읽어 보세요.\n'); return 1; }
  } else {
    say('  · 바뀐 파일이 없습니다 — 지금 기록을 그대로 올립니다.');
  }
  // 아직 깃허브에 없는 기록 전부를 본다 — 예전에 한 번이라도 계정 파일을 담은 커밋이 있으면
  // 지금 파일 목록에 없어도 기록째 올라간다(밀어 올리면 기록이 통째로 간다)
  const unpushed = git(['log', '--name-only', '--format=', 'HEAD', '--not', '--remotes=origin']).out
    .split('\n').map((l) => l.trim()).filter(Boolean);
  const leaked = [...new Set(unpushed.filter(SECRET))];
  if (leaked.length) {
    say('\n  ! 아직 올리지 않은 기록 안에 계정 · 비밀번호 파일이 들어 있습니다 — 올리지 않고 멈춥니다.');
    for (const p of leaked.slice(0, 8)) say(`      ${p}`);
    say('    그 커밋을 기록에서 빼야 합니다. Claude 에게 이 메시지를 보여 주세요.');
    say('');
    return 1;
  }
  // 판마다 태그를 붙인다(0.70.40) — rollback.bat 이 이 태그로 예전 판을 찾는다
  git(['tag', '-f', `v${ver}`]);
  git(['branch', '-M', 'main']);

  // ── 올리기 ──
  say('');
  const pushed = git(['push', '-u', 'origin', 'main', '--force'], { show: true }).ok;
  if (pushed) git(['push', 'origin', `v${ver}`, '--force']);

  say('');
  if (!pushed) {
    say('  ! 올리지 못했습니다. 위의 메시지를 읽어 보세요.');
    say('    (처음이면 깃허브 로그인 창이 뜹니다. 로그인한 뒤 다시 해 보세요)');
    return 1;
  }
  say('  > 올렸습니다. Render 가 알아서 다시 배포합니다 (2~3분).');
  say(`  > 접속 화면 아래 판 번호가 v${ver} 로 바뀌면 끝입니다.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  say(`\n  ! 멈췄습니다: ${e && e.message ? e.message : e}\n`);
  process.exitCode = 1;
}
