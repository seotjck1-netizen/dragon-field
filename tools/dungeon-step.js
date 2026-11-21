#!/usr/bin/env node
/**
 * **지하감옥에 들어서는 문턱이 실제로 있는가** — 같은 몸으로 견준다.
 *
 *   node tools/dungeon-step.js          룬 한 벌 +10 Lv.50 으로 20단계 ↔ 지하 1~5층
 *   node tools/dungeon-step.js --n 80   표본 수(기본 48)
 *   node tools/dungeon-step.js --enh 8  강화 수치
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * tools/balance.js 는 자리마다 **다른 몸**으로 잰다(그 문 앞에 설 사람의 몸).
 * 그래서 "20단계와 지하 1층 중 어디가 더 센가" 를 물으면 답을 못 준다 —
 * 서로 다른 두 사람을 재 놓고 견주는 꼴이기 때문이다.
 *
 * 여기서는 **한 사람**을 세워 두고 땅만 바꿔 걷게 한다. 그러면 사다리가 보인다.
 * 지하감옥은 20단계를 넘은 사람이 들어서는 곳이므로, 그 사람이 들고 있는
 * 룬 한 벌 +10 을 기준으로 삼는다(balance.js 의 지하 5층 기준과 같은 몸).
 */
const B = require('./balance.js');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 48)) || 48;
const LEVEL = Number(opt('lv', 50)) || 50;
const ENH = Number(opt('enh', 10)) || 10;

// 걸어 볼 자리. [몬스터, 맵, 이름]
// 각 땅에서 **실제로 마주치는 것 중 가장 버거운 놈**을 세운다.
const PLACES = [
  ['elite_demon_soldier', 'field_20', '20단계 잡몹 · 강화된 악마 병사'],
  ['elite_demon_general', 'field_20', '20단계 보스 · 강화된 발가르'],
  ['elite_skeleton', 'dungeon_1', '지하 1층 · 강화된 해골 병사'],
  ['elite_demon_soldier', 'dungeon_2', '지하 2층 · 강화된 악마 병사'],
  ['dungeon_wraith', 'dungeon_2', '지하 2층 · 지하의 망령'],
  ['dungeon_golem', 'dungeon_3', '지하 3층 · 감옥 석상'],
  ['dungeon_general', 'dungeon_4', '지하 4층 · 봉인된 장군'],
  ['dungeon_golem', 'dungeon_5', '지하 5층 · 감옥 석상'],
  ['dungeon_lord', 'dungeon_5', '지하 5층 보스 · 감옥의 주인'],
];

const CLASSES = [['warrior', '용사'], ['ranger', '사냥꾼'], ['mage', '마법사']];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

// 층마다 "그 층에서 가장 버거운 자리" 의 세 직업 평균 승률이 이쯤이면 좋겠다.
//
// 1층이 20단계 보스(66%)보다 **확실히 아래**여야 지하감옥이 새 땅으로 느껴진다.
// 그 아래로는 한 층에 10%p 남짓씩 내려가게 둔다 — 0.70.13 이전에는
// 1층 76% 에서 2층 15% 로 한 번에 떨어져, 문턱이 없다가 갑자기 벽이었다.
const TARGET = { dungeon_1: 45, dungeon_2: 32, dungeon_3: 22, dungeon_4: 14, dungeon_5: 8 };

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const maps = G['maps.json'].maps;

  /** 그 땅에서 가장 버거운 자리의 세 직업 평균 승률. */
  async function hardest(mapId, power) {
    const keep = maps[mapId].power;
    if (power != null) maps[mapId].power = power;
    let worst = 100;
    for (const [mon, map] of PLACES) {
      if (map !== mapId) continue;
      if (G['maps.json'].maps[map].boss === mon) continue; // 보스는 따로 잰다
      const rates = [];
      for (const [cls] of CLASSES) {
        const r = await B.winRate(simulateBattle, G, cls, LEVEL, ENH, 20, mon, SAMPLES, map);
        rates.push(r ? r.rate : 0);
      }
      const avg = Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
      if (avg < worst) worst = avg;
    }
    maps[mapId].power = keep;
    return worst;
  }

  // ── --solve : 층마다 목표 승률에 닿는 배율을 이분 탐색으로 찾는다 ──
  //
  // 배율과 승률은 선형이 아니다(hp·atk·def 를 함께 밀므로 실효 체력이 제곱에
  // 가깝게 커진다). 그래서 나누기로 구하면 한참 빗나간다 — 재면서 좁힌다.
  if (args.includes('--solve')) {
    console.log('');
    console.log(`  층마다 목표 승률에 닿는 배율 찾기 — 룬 한 벌 +${ENH} · Lv.${LEVEL} · 판마다 ${SAMPLES}번`);
    console.log('  ' + '─'.repeat(64));
    for (const [mapId, want] of Object.entries(TARGET)) {
      const now = maps[mapId].power || 1;
      let lo = 1;
      let hi = 40;
      let best = now;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        const got = await hardest(mapId, mid);
        if (got > want) lo = mid; else hi = mid;   // 쉬우면 배율을 올린다
        best = mid;
      }
      const got = await hardest(mapId, best);
      console.log('  ' + pad(mapId.replace('dungeon_', '') + '층', 8)
        + padL(now.toFixed(3), 9) + ' → ' + padL(best.toFixed(3), 9)
        + padL(`목표 ${want}%`, 12) + padL(`실제 ${got}%`, 12));
    }
    console.log('');
    console.log('  이 값을 tools/gen-dungeon.js 의 층 표(power)에 적고 `npm run maps` 를 돌리세요.');
    console.log('');
    return;
  }

  console.log('');
  console.log(`  한 사람으로 걸어 보기 — 룬 한 벌 +${ENH} · Lv.${LEVEL} · 판마다 ${SAMPLES}번`);
  console.log('  ' + '─'.repeat(72));
  console.log('  ' + pad('자리', 34) + padL('배율', 7)
    + CLASSES.map(([, n]) => padL(n, 8)).join('') + padL('평균', 8));

  const rows = [];
  for (const [mon, map, label] of PLACES) {
    const rates = [];
    for (const [cls] of CLASSES) {
      const r = await B.winRate(simulateBattle, G, cls, LEVEL, ENH, 20, mon, SAMPLES, map);
      rates.push(r ? r.rate : null);
    }
    const avg = Math.round(rates.reduce((a, b) => a + (b || 0), 0) / rates.length);
    rows.push({ label, map, avg, rates });
    console.log('  ' + pad(label, 34) + padL((maps[map].power || 1).toFixed(1), 7)
      + rates.map((x) => padL(x == null ? '-' : x + '%', 8)).join('') + padL(avg + '%', 8));
  }

  // 문턱이 있는가 — 20단계의 가장 버거운 자리와 지하 1층을 견준다.
  const f20 = Math.min(...rows.filter((r) => r.map === 'field_20').map((r) => r.avg));
  const d1 = rows.find((r) => r.map === 'dungeon_1').avg;
  console.log('');
  console.log(`  20단계에서 가장 버거운 자리 ${f20}%  →  지하 1층 ${d1}%`);
  console.log(d1 + 12 <= f20
    ? '  ✓ 지하감옥에 들어서는 순간 확실히 달라집니다.'
    : `  ✗ 문턱이 없습니다 — 지하 1층이 20단계와 거의 같습니다(차이 ${f20 - d1}%p).`);

  // 층마다 내려갈수록 어려워지는가 (한 층이라도 거꾸로면 사다리가 무너진 것)
  const floors = rows.filter((r) => r.map.startsWith('dungeon'));
  const worst = new Map();
  for (const r of floors) {
    const f = r.map;
    if (!worst.has(f) || r.avg < worst.get(f)) worst.set(f, r.avg);
  }
  const order = [...worst.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  console.log('');
  console.log('  층마다 가장 버거운 자리: '
    + order.map(([f, v]) => `${f.replace('dungeon_', '')}층 ${v}%`).join(' → '));
  const back = order.filter(([, v], i) => i > 0 && v > order[i - 1][1] + 5);
  console.log(back.length
    ? `  ✗ ${back.map(([f]) => f.replace('dungeon_', '') + '층').join(', ')} 에서 오히려 쉬워집니다.`
    : '  ✓ 내려갈수록 어려워집니다.');
  console.log('');
})();
