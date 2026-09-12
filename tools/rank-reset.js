#!/usr/bin/env node
/**
 * 랭킹(타임어택) 초기화 — 새 시즌을 연다.
 *
 *   node tools/rank-reset.js                 전부 지운다
 *   node tools/rank-reset.js imp_captain     그 보스 표만 지운다
 *
 * ── 무엇이 지워지나 ────────────────────────────────────────
 * 지우는 것은 **기록뿐**이다. 캐릭터·레벨·골드·소지품은 손대지 않는다.
 *
 * 표만 지워서는 안 된다. "처음 잡은 것만 센다" 는 규칙 때문에 계정마다
 * '처음 잡은 시각'이 적혀 있고, 그게 남아 있으면 이미 잡아 본 사람은
 * 다시는 기록을 올릴 수 없다 — 표는 비었는데 아무도 못 채우는 상태가 된다.
 * 그래서 계정의 그 기록도 함께 지운다.
 *
 * ── 열쇠 ──────────────────────────────────────────────────
 * 이벤트 우편과 같은 ADMIN_KEY 를 쓴다. 비어 있으면 경로 자체가 잠겨 있다.
 *
 *   ADMIN_KEY=아무거나 node tools/rank-reset.js
 *   SERVER=https://내서버.onrender.com ADMIN_KEY=... node tools/rank-reset.js
 *
 * ⚠ 되돌릴 수 없다. 지운 기록은 돌아오지 않는다.
 */
const SERVER = (process.env.SERVER || 'http://localhost:8787').replace(/\/+$/, '');
const KEY = process.env.ADMIN_KEY || '';

async function post(path, body) {
  const res = await fetch(SERVER + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 그대로 둔다 */
  }
  if (!res.ok || (json && json.error)) {
    throw new Error((json && json.error) || `${res.status} ${text.slice(0, 120)}`);
  }
  return json;
}

(async () => {
  if (!KEY) {
    console.error('\n  ADMIN_KEY 가 없습니다.\n');
    console.error('    ADMIN_KEY=내열쇠 node tools/rank-reset.js\n');
    process.exit(1);
  }
  const bosses = process.argv.slice(2).filter((a) => !a.startsWith('-'));

  // 지우기 전에 지금 표를 보여 준다 — 무엇이 사라지는지 알고 지워야 한다.
  let before = {};
  try {
    const r = await post('/api/rank', {});
    before = (r && r.rank) || {};
  } catch {
    /* 못 봐도 지우는 데는 지장 없다 */
  }
  const names = Object.keys(before);
  console.log('');
  console.log(`  서버: ${SERVER}`);
  if (names.length) {
    console.log('  지금 남아 있는 표:');
    for (const b of names) {
      const list = before[b] || [];
      const top = list[0];
      console.log(
        `    ${b.padEnd(24)} ${String(list.length).padStart(3)}명` +
          (top ? `  1위 ${top.name} ${(top.ms / 60000).toFixed(1)}분` : '')
      );
    }
  } else {
    console.log('  (지금 표가 비어 있거나 읽지 못했습니다)');
  }

  const res = await post('/api/rank/reset', { key: KEY, boss: bosses.length ? bosses : null });
  console.log('');
  console.log(`  ✓ 지웠습니다 — 표 ${res.cleared.length}개 · 계정 ${res.accounts}개의 기록`);
  if (res.cleared.length) console.log(`    ${res.cleared.join(', ')}`);
  console.log('    이제 모두 처음부터 다시 도전할 수 있습니다.');
  console.log('');
})().catch((err) => {
  console.error('\n  실패:', err.message, '\n');
  process.exit(1);
});
