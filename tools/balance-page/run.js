#!/usr/bin/env node
// 대시보드의 흉내를 터미널에서 돌린다 — 값 묶음마다 직업별 Lv.30/40/45/50 · 룬 +10/+15 · 보스 몫.
//   node tools/balance-page/run.js                       지금 값과 0.70.38 값
//   node tools/balance-page/run.js '{"보스 3분":{"BOSS_RESPAWN_S":180}}'
// 먼저 node tools/balance-dash.js 로 dist/balance/*.json 을 만들어 둔다.
const path = require('path');
const sim = require('./sim.js');
const D = path.join(__dirname, '..', '..', 'dist', 'balance');
const R = (n) => require(path.join(D, n + '.json'));
const consts0 = R('consts');
const v = Object.fromEntries(consts0.map((r) => [r.key, r.value]));
const scen = process.argv[2] ? JSON.parse(process.argv[2]) : { '지금': {}, '0.70.38': { GAP_MAX: v.OLD_GAP_MAX, BOSS_RESPAWN_S: v.OLD_BOSS_RESPAWN_S } };
const fmt = (m) => (m == null ? '  -  ' : m >= 60 ? (m / 60).toFixed(1) + 'h' : m + 'm');
for (const [name, over] of Object.entries(scen)) {
  const consts = consts0.map((r) => (r.key in over ? { ...r, value: over[r.key] } : r));
  const rows = sim(R('battle'), R('targets'), R('tdrops'), R('sets'), R('items'), R('quests'), consts);
  console.log('== ' + name);
  for (const cls of [...new Set(rows.map((r) => r.class))]) {
    const r = rows.filter((x) => x.class === cls);
    const first = (f) => { const x = r.find(f); return x ? x.minute : null; };
    const t = r[r.length - 1];
    const share = t.cum_exp_boss / (t.cum_exp_boss + t.cum_exp_trash + t.cum_exp_quest);
    console.log(`  ${cls.padEnd(8)} L30 ${fmt(first((x) => x.level >= 30))}  L40 ${fmt(first((x) => x.level >= 40))}  L45 ${fmt(first((x) => x.level >= 45))}  L50 ${fmt(first((x) => x.level >= 50))}  룬+10 ${fmt(first((x) => x.set >= 4 && x.enh >= 10))}  룬+15 ${fmt(first((x) => x.set >= 4 && x.enh >= 15))}  보스 몫 ${(share * 100).toFixed(0)}%`);
  }
}
