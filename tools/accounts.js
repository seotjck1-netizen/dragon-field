#!/usr/bin/env node
/**
 * 서버에 있는 계정 목록을 받아 `sheets/accounts.csv` 로 적는다 (0.59).
 * 그 다음 `npm run sheets` 를 돌리면 통합문서에 **계정** 탭으로 붙는다.
 *
 *   node tools/accounts.js --server https://내서버 --pw 운영자비밀번호
 *   node tools/accounts.js --server http://localhost:8787          (비밀번호를 물어본다)
 *
 * ─────────────────────────────────────────────────────────────
 * 이 탭은 **보기만 하는 사진**이다. 왜 그런가:
 *
 *   서버가 구글 시트를 읽는 길은 "링크가 있는 모든 사용자 — 뷰어" 공개다.
 *   쓰는 길은 없다(쓰려면 구글 자격증명이 필요하고, 그건 지켜야 할 비밀이 하나 더
 *   느는 일이다). 그래서 서버가 스스로 시트에 계정을 적어 넣지는 못한다 —
 *   사람이 이 도구로 떠서 올린다.
 *
 *   반대 방향(시트에서 줄을 지우면 계정이 지워진다)은 0.64 에 생겼다 —
 *   다만 **켜야 켜지고, 켜도 12시간을 기다린다.** 자세한 것은 server/accountsync.js
 *   맨 위 설명을 보라. 요약하면:
 *     · SHEET_ACCOUNT_DELETE=1 을 넣은 서버에서만 돈다(기본은 꺼져 있다)
 *     · ADMIN_KEY 가 없으면 아예 안 돈다
 *     · 줄이 사라진 것을 보고 **12시간 예약**만 걸고, 그동안 되돌릴 수 있다
 *     · 줄을 다시 넣으면 예약이 풀린다
 *   급히 지울 때는 예전처럼 **운영자 창 → 계정** 을 쓴다(그쪽은 즉시다).
 *   (지우면 그 아이디는 곧바로 다시 만들 수 있고, 새로 만든 계정은 레벨 1부터다 —
 *    /tmp/batch46.js 가 그것을 잰다.)
 * ─────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'sheets', 'accounts.csv');

const arg = (k, d = null) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const SERVER = (arg('--server', process.env.DF_SERVER || 'http://localhost:8787') || '').replace(/\/$/, '');
const ADMIN_ID = arg('--id', process.env.ADMIN_ID || 'admin');

/** 브라우저와 **똑같은** 방식으로 해시한다(원문 비밀번호는 서버로 안 나간다). */
function hashPassword(id, pw) {
  return crypto.createHash('sha256').update(`poino/v1/${id.toLowerCase()}/${pw}`, 'utf8').digest('hex');
}

function ask(question) {
  return new Promise((done) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); done(a.trim()); });
  });
}

async function post(pathname, body) {
  const res = await fetch(SERVER + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* 그대로 둔다 */ }
  if (!res.ok) throw new Error(json.error || `${res.status} ${text.slice(0, 200)}`);
  return json;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};

(async () => {
  const pw = arg('--pw', process.env.ADMIN_PW) || (await ask('운영자 비밀번호: '));
  if (!pw) { console.error('비밀번호가 없습니다.'); process.exit(1); }

  console.log(`  ${SERVER} 에 ${ADMIN_ID} 로 들어갑니다…`);
  const login = await post('/api/login', { id: ADMIN_ID, hash: hashPassword(ADMIN_ID, pw) });
  if (!login.token) throw new Error('토큰을 못 받았습니다.');

  const r = await post('/api/admin/accounts', { id: ADMIN_ID, token: login.token });
  const list = r.accounts || [];

  // **만든 시간 오름차순** — 먼저 만든 계정이 위 (0.64).
  //
  // 서버는 최신순으로 준다(운영자 창에서 방금 만든 시험 계정을 찾는 일이 잦아서다).
  // 시트는 반대가 낫다: 줄이 아래로만 늘어나므로 한 번 자리를 잡은 줄이
  // 다음에 떠도 같은 자리에 있다. 지울 줄을 고를 때 그 안정감이 중요하다.
  // 만든 때를 모르는 옛 계정은 맨 위로 보낸다(누구보다 먼저 있던 것들이다).
  const ordered = [...list].sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const bt = b.createdAt ? Date.parse(b.createdAt) : NaN;
    const aOk = Number.isFinite(at);
    const bOk = Number.isFinite(bt);
    if (aOk && bOk && at !== bt) return at - bt;
    if (aOk !== bOk) return aOk ? 1 : -1;
    return a.id.localeCompare(b.id);
  });

  const rows = [['아이디', '이름', '레벨', '만든 때', '마지막 접속', '운영자']];
  for (const a of ordered) {
    rows.push([a.id, a.name || a.id, a.level == null ? '' : a.level,
      when(a.createdAt), when(a.lastLoginAt), a.self ? 'O' : '']);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, '﻿' + rows.map((r2) => r2.map(csvCell).join(',')).join('\n') + '\n');

  console.log(`  ✓ 계정 ${list.length}개 → ${path.relative(ROOT, OUT)}  (만든 시간 오름차순)`);
  console.log('    이제 `npm run sheets` 를 돌리면 통합문서에 **계정** 탭으로 붙습니다.');
  console.log('    · SHEET_ACCOUNT_DELETE 를 안 켰으면 이 탭은 보기만 하는 사진입니다.');
  console.log('    · 켠 서버에서는 이 탭에서 줄을 지우면 12시간 뒤에 계정이 지워집니다');
  console.log('      (그 전에 줄을 되돌려 놓으면 취소됩니다. 운영자 창 → 계정 에서도 취소할 수 있습니다).');
})().catch((e) => {
  console.error('  ✗', e.message);
  console.error('    · 서버가 떠 있는지, ADMIN_KEY 가 정해져 있는지 확인하세요.');
  console.error('    · 주소는 --server 로 줍니다 (예: --server https://내서버.onrender.com)');
  process.exit(1);
});
