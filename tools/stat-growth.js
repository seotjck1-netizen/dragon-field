#!/usr/bin/env node
// 다 키우고 나면 힘·민첩·지능이 정말 3:2:1 인가.
//
// 왜 따로 재나: 표에는 1·2·3 이라고 적혀 있는데, 0.41 까지는 그 숫자를
// "몇 레벨마다 한 점" 으로 읽었다. 1/1 : 1/2 : 1/3 은 **6:3:2** 라
// 50 레벨 용사가 힘 50 · 민첩 25 · 지능 16 이 되었다. 적힌 것과 자란 것이 달랐다.
//
// 0.42 부터는 같은 숫자를 **차례**로 읽고 몫을 3:2:1 로 나눈다.
// 여기서는 실제로 레벨을 1 부터 만렙까지 올려 보며 그 비율이 지켜지는지 잰다.
// '운이 좋으면 두 배' 가 비율을 흔들지 않는지도 여러 번 굴려서 함께 본다.
//
//   node tools/stat-growth.js            표로 본다
//   node tools/stat-growth.js --n 400    몇 명을 키워 보나(기본 200)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
const padL = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return ' '.repeat(Math.max(0, n - w)) + String(s);
};

(async () => {
  const argv = process.argv.slice(2);
  const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? Number(argv[i + 1]) : d; };
  const people = flag('n', 200);

  const P = await import('../src/systems/ProgressionSystem.js');
  const F = await import('../src/data/formulas.js');
  const classes = read('classes.json');
  const stats = read('stats.json');
  const maxLevel = F.BALANCE.MAX_LEVEL;

  const db = { classes, stats: read('stats.json'), items: {}, monsters: {} };
  const NAME = { strength: '힘', agility: '민첩', intellect: '지능' };

  console.log(`\n  스탯 성장 — 1 레벨부터 ${maxLevel} 레벨까지 ${people}명 키워 본 결과\n`);
  console.log('  ' + pad('직업', 10) + pad('차례', 18)
    + padL('힘', 8) + padL('민첩', 8) + padL('지능', 8)
    + padL('비율', 22) + padL('운 없이', 12));
  console.log('  ' + '─'.repeat(80));

  let bad = 0;
  for (const [id, cls] of Object.entries(classes.list)) {
    const ranks = cls.statGrowth || {};
    const order = Object.entries(ranks).sort((a, b) => a[1] - b[1])
      .map(([k, v]) => `${NAME[k] || k}${v}`).join(' ');

    // ── ① 운을 뺀 값 — 규칙이 정한 몫 그대로 ──
    const pure = P.statsFromGrowth(ranks, maxLevel);

    // ── ② 실제로 키워 본다. 운(두 배)이 섞인다 ──
    const sum = {};
    for (let n = 0; n < people; n++) {
      const state = {
        db,
        player: { classId: id, level: 1, stats: {} },
      };
      P.growStats(state, 1, maxLevel);
      for (const [k, v] of Object.entries(state.player.stats)) sum[k] = (sum[k] || 0) + v;
    }
    const avg = {};
    for (const [k, v] of Object.entries(sum)) avg[k] = v / people;

    // ── ③ 비율 — 가장 낮은 것을 1 로 놓고 견준다 ──
    const ids = ['strength', 'agility', 'intellect'];
    const base = Math.min(...ids.map((k) => avg[k] || 0));
    const ratio = ids.map((k) => ((avg[k] || 0) / base).toFixed(2)).join(' : ');
    const want = ids.map((k) => (4 - Math.round(Number(ranks[k]))));  // 1등 3 · 2등 2 · 3등 1
    const wantRatio = want.map((w) => (w / Math.min(...want)).toFixed(2));
    const off = ids.map((k, i) => Math.abs((avg[k] || 0) / base - Number(wantRatio[i])));
    const worst = Math.max(...off);
    if (worst > 0.12) bad += 1;

    console.log('  ' + pad(cls.name || id, 10) + pad(order, 18)
      + padL(avg.strength.toFixed(1), 8) + padL(avg.agility.toFixed(1), 8)
      + padL(avg.intellect.toFixed(1), 8)
      + padL(ratio, 22)
      + padL(ids.map((k) => pure[k]).join('/'), 12)
      + (worst > 0.12 ? `   ← ${wantRatio.join(':')} 이어야 한다` : ''));
  }

  console.log('');
  console.log(`  · 한 레벨에 나눠 주는 총량 ${P.STAT_PER_LEVEL.toFixed(3)}점`
    + ` — ${maxLevel} 레벨이면 ${Math.round(P.STAT_PER_LEVEL * maxLevel)}점`);
  console.log(`  · 점수를 줄 때마다 ${Math.round(F.BALANCE.STAT_DOUBLE_CHANCE * 100)}% 로 한 점 더`
    + ' (세 스탯 모두 같은 확률이라 비율은 안 흔들린다)');
  console.log('');
  if (bad) {
    console.log(`  ⚠ ${bad}개 직업에서 비율이 어긋납니다.`);
    process.exitCode = 1;
  } else {
    console.log('  ✓ 직업마다 적힌 차례대로 3:2:1 이 지켜집니다.');
  }
})();
