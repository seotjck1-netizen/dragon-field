#!/usr/bin/env node
/**
 * 예전 판으로 되돌리기 (0.70.40).
 *
 *   node tools/rollback.js 0.70.39     그 판의 파일로 이 폴더를 되돌린다
 *   node tools/rollback.js --list      되돌릴 수 있는 판을 보여 준다
 *   (윈도우에서는 rollback.bat 을 더블클릭하면 판 번호를 묻는다)
 *
 * ── 무엇을 하나 ──────────────────────────────────────────────
 * 깃에 남아 있는 그 판의 파일을 폴더에 그대로 깐다. **올리지는 않는다.**
 * 올리는 길은 하나(upload.bat)만 둔다 — 되돌린 뒤 upload.bat 을 누르면
 * 그 판이 다시 깃허브와 Render 에 올라간다.
 *
 * 판을 찾는 차례
 *   ① 태그 v<판>          upload.bat 이 0.70.40 부터 올릴 때마다 붙인다
 *   ② 커밋 글 "Update <판>"  그 전에 올린 판(upload.bat 의 커밋 글이 늘 이 모양이었다)
 *   ③ 폴더에 둔 묶음 파일 dragon-field-<판>.bundle   (Claude 가 건넨 백업)
 *
 * ── 건드리지 않는 것 ──────────────────────────────────────────
 *   server/data/(계정 · 세이브) · .env · node_modules · sheets/accounts.csv
 *   — 깃이 모르는 파일(.gitignore)이라 그대로 남는다. 계정이 되돌아가지는 않는다.
 *
 * 그 판에 없던 파일(뒤에 새로 생긴 것)은 지운다. 그래야 그 판과 똑같아진다.
 * 아직 올리지 않은 고침이 있으면 먼저 묻는다.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const git = (args, opt = {}) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', opt.quiet ? 'ignore' : 'pipe'] }).trim();
const tryGit = (args) => { try { return git(args, { quiet: true }); } catch { return null; } };
const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); res(a.trim()); });
});
const VER = /^\d+\.\d+\.\d+$/;

function versions() {
  const out = new Map();
  for (const t of (tryGit(['tag', '--list', 'v*']) || '').split('\n').filter(Boolean)) {
    if (VER.test(t.slice(1))) out.set(t.slice(1), `태그 ${t}`);
  }
  for (const line of (tryGit(['log', '--all', '--format=%H%x09%s']) || '').split('\n').filter(Boolean)) {
    const [h, s] = line.split('\t');
    const m = /^Update (\d+\.\d+\.\d+)$/.exec(s || '');
    if (m && !out.has(m[1])) out.set(m[1], `커밋 ${h.slice(0, 7)}`);
  }
  for (const f of fs.readdirSync(ROOT)) {
    const m = /^dragon-field-(\d+\.\d+\.\d+)\.bundle$/.exec(f);
    if (m && !out.has(m[1])) out.set(m[1], `묶음 ${f}`);
  }
  return [...out.entries()].sort((a, b) => b[0].localeCompare(a[0], 'en', { numeric: true }));
}

function findRef(ver) {
  if (tryGit(['rev-parse', '-q', '--verify', `refs/tags/v${ver}^{commit}`])) return `v${ver}`;
  for (const line of (tryGit(['log', '--all', '--format=%H%x09%s']) || '').split('\n').filter(Boolean)) {
    const [h, s] = line.split('\t');
    if (s === `Update ${ver}`) return h;
  }
  const bundle = path.join(ROOT, `dragon-field-${ver}.bundle`);
  if (fs.existsSync(bundle) && tryGit(['fetch', '-q', bundle, `refs/tags/v${ver}:refs/tags/v${ver}`]) != null) return `v${ver}`;
  return null;
}

(async () => {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    console.log('\n  ! 이 폴더에는 깃 기록이 없습니다. upload.bat 을 한 번이라도 돌린 폴더에서 쓰세요.');
    console.log('    (깃 없이 되돌리려면: 그 판의 zip 을 새 폴더에 풀고 server/data 와 .env 만 옮겨 오면 됩니다)\n');
    process.exit(1);
  }
  const arg = process.argv[2];
  if (arg === '--list' || arg === '-l') {
    const v = versions();
    console.log(v.length ? '\n  되돌릴 수 있는 판\n' + v.map(([k, w]) => `    ${k.padEnd(10)} ${w}`).join('\n') + '\n' : '\n  되돌릴 수 있는 판이 없습니다.\n');
    return;
  }
  // 깃허브에 있는 태그도 받아 둔다(인터넷이 안 되면 그냥 넘어간다)
  tryGit(['fetch', '-q', 'origin', '--tags']);
  let ver = arg;
  if (!ver) {
    const v = versions();
    if (v.length) console.log('\n  되돌릴 수 있는 판: ' + v.slice(0, 8).map(([k]) => k).join(' · '));
    ver = await ask('  되돌릴 판 번호(예: 0.70.39): ');
  }
  ver = String(ver || '').replace(/^v/, '');
  if (!VER.test(ver)) { console.log(`\n  ! 판 번호 모양이 아닙니다: "${ver}"  (예: 0.70.39)\n`); process.exit(1); }
  const ref = findRef(ver);
  if (!ref) {
    console.log(`\n  ! ${ver} 을(를) 찾지 못했습니다. node tools/rollback.js --list 로 있는 판을 보세요.`);
    console.log(`    Claude 가 건넨 dragon-field-${ver}.bundle 이 있으면 이 폴더에 넣고 다시 하세요.\n`);
    process.exit(1);
  }
  const dirty = tryGit(['status', '--porcelain', '--untracked-files=no']);
  if (dirty) {
    console.log('\n  아직 올리지 않은 고침이 있습니다(되돌리면 사라집니다):');
    console.log(dirty.split('\n').slice(0, 12).map((l) => '    ' + l).join('\n') + (dirty.split('\n').length > 12 ? '\n    …' : ''));
    const ok = await ask('  그래도 되돌릴까요? (y/N): ');
    if (!/^y(es)?$/i.test(ok)) { console.log('  그만뒀습니다.\n'); return; }
  }
  // 되돌리기 도구 자신은 남긴다 — 그 판에 없던 도구라도(0.70.39 에는 없다) 지우면 다시 앞뒤로 오갈 수 없다
  const keep = ['rollback.bat', path.join('tools', 'rollback.js')]
    .map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]);
  git(['restore', `--source=${ref}`, '--staged', '--worktree', '--', '.']);
  for (const [f, buf] of keep) {
    if (buf && !fs.existsSync(path.join(ROOT, f))) { fs.mkdirSync(path.dirname(path.join(ROOT, f)), { recursive: true }); fs.writeFileSync(path.join(ROOT, f), buf); }
  }
  let now = '?';
  try { now = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch {}
  console.log(`\n  > ${ver} 로 되돌렸습니다 (${ref.length > 12 ? ref.slice(0, 7) : ref}). package.json 판 번호: ${now}`);
  console.log('  > 계정 · 세이브(server/data)와 .env 는 그대로입니다.');
  console.log('  > 이제 upload.bat 을 누르면 이 판이 깃허브와 Render 에 다시 올라갑니다.\n');
})();
