#!/usr/bin/env node
/**
 * 이벤트 우편 보내기 — 접속한 모두에게 한 통씩.
 *
 *   node tools/event.js "제목" "내용" [아이템id:개수 ...]
 *
 * 예)
 *   node tools/event.js "추석 선물" "즐거운 명절 보내세요!" potion:20 dragon_token:2
 *   node tools/event.js "점검 보상" "기다려 주셔서 고맙습니다." greater_potion:5
 *
 * ── 어디로 가나 ────────────────────────────────────────────
 * 계정마다 한 통씩 넣지 않는다. 한 곳에 적어 두고, 각자 접속할 때
 * "내가 마지막으로 가져간 시각" 뒤의 것만 우편함으로 옮겨 간다.
 * 그래서 아직 안 만든 계정도 나중에 접속하면 받아 간다.
 *
 * ── 열쇠 ──────────────────────────────────────────────────
 * 서버에 ADMIN_KEY 를 정해 두어야 한다. 비어 있으면 발송 경로 자체가 막힌다 —
 * 열쇠 없이 열려 있으면 누구든 전 유저에게 아이템을 뿌릴 수 있기 때문이다.
 *
 *   로컬:  ADMIN_KEY=아무거나 npm start
 *   Render: 환경변수에 ADMIN_KEY 를 넣는다
 *
 * 보낼 때도 같은 값을 준다.
 *   ADMIN_KEY=아무거나 node tools/event.js "제목" "내용"
 *   SERVER=https://내서버.onrender.com ADMIN_KEY=... node tools/event.js ...
 */
const fs = require('fs');
const path = require('path');

const SERVER = (process.env.SERVER || 'http://localhost:8787').replace(/\/+$/, '');
const KEY = process.env.ADMIN_KEY || '';

function parseItems(args) {
  const out = [];
  for (const a of args) {
    const [id, n] = String(a).split(':');
    if (!id) continue;
    out.push({ id, count: Math.max(1, Number(n) || 1) });
  }
  return out;
}

/** 보내기 전에 "그런 아이템이 있기는 한가"를 우리 표로 확인한다. */
function checkItems(items) {
  const file = path.resolve(__dirname, '../src/data/items.json');
  let db = {};
  try {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return []; // 표를 못 읽으면 검사를 건너뛴다(서버가 다시 볼 것이다)
  }
  return items.filter((it) => !db[it.id]).map((it) => it.id);
}

(async () => {
  const [subject, body, ...rest] = process.argv.slice(2);

  if (!subject) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''));
    process.exit(1);
  }
  if (!KEY) {
    console.error('\n  ADMIN_KEY 가 없습니다.');
    console.error('  서버를 켤 때 정한 값과 같은 값을 주세요.\n');
    console.error('    ADMIN_KEY=아무거나 node tools/event.js "제목" "내용"\n');
    process.exit(1);
  }

  const items = parseItems(rest);
  const unknown = checkItems(items);
  if (unknown.length) {
    console.error(`\n  표에 없는 아이템입니다: ${unknown.join(', ')}`);
    console.error('  src/data/items.json 의 id 를 확인하세요.\n');
    process.exit(1);
  }

  const res = await fetch(`${SERVER}/api/event/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: KEY, from: '운영자', subject, body: body || '', items }),
  }).catch((err) => {
    console.error(`\n  서버에 닿지 못했습니다 (${SERVER})`);
    console.error(`  ${err.message}\n`);
    process.exit(1);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    console.error(`\n  보내지 못했습니다: ${data.error || res.status}\n`);
    process.exit(1);
  }

  console.log('');
  console.log(`  ✓ 이벤트 우편을 걸어 두었습니다 — ${SERVER}`);
  console.log(`    제목  ${subject}`);
  if (body) console.log(`    내용  ${body.split('\n')[0]}`);
  if (items.length) {
    console.log(`    선물  ${items.map((i) => `${i.id} ×${i.count}`).join(', ')}`);
  }
  console.log('');
  console.log('  접속해 있는 사람은 우편함을 열면 바로, 나머지는 다음 접속 때 받습니다.');
  console.log('');
})();
