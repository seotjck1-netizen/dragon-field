#!/usr/bin/env node
/**
 * 결투장 시뮬 (0.80.27) — 매칭 · 승률 · 한 판 길이. 결투장은 지금 '준비 중'(arena.json open: false)이고,
 * 다시 열 때 규칙 · 배율을 정하려고 남겨 둔 도구다. 결과와 지금까지 정한 것은 docs/ARENA-SIM.md.
 *
 *   node tools/arena-sim.js [--json OUT]                                    지금 규칙(번갈아 · 배율 없음)
 *   SCALE=5,0.2 node tools/arena-sim.js                                     체력 ×5 · 피해 ×1/5
 *   SCALE=5,0.2 SPEEDK=1 node tools/arena-sim.js                            + 각자 따로(공속 비례)
 *   SCALE=5,0.2 SPEEDK=1 SCX='{"magicIgnoreDef":true,"classDmg":{"mage":2},"classSpd":{"ranger":1.2}}' node tools/arena-sim.js
 *
 * 사람 모임 20명(Lv.20 ~ 50 · 직업 고르게)을 만들고 Lv.10 · 20 · 30 이 받는 상대 셋과 이길 확률(각 200판)을
 * ① 지금 규칙(점수만) ② 레벨 띠 ±5 + 점수 ③ 전투력 근처로 견준다. 몸은 tools/balance.js 의 '그 레벨에 흔히 갖춘 몸'.
 * 같은 레벨 직업 상성(Lv.10 · 20 · 30 · 50)과 한 판 길이(손 수 · 초 · 무승부)도 낸다. 저장소 맨 위에서 돌린다.
 */
const path = require('path');
const ROOT = process.cwd();
const B = require(path.join(ROOT, 'tools/balance.js'));
const G = B.loadFrom('src');
const CLASSES = require(path.join(ROOT, 'src/data/classes.json')).list;
const SC = process.env.SCALE ? (([h, d]) => ({ hp: +h, dmg: +d, speedK: +(process.env.SPEEDK || 0), ...JSON.parse(process.env.SCX || '{}') }))(process.env.SCALE.split(',')) : null;
const NAME = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };

function bodyAt(level) {
  if (level < 14) return { enh: 5, tier: 5 };
  if (level < 20) return { enh: 7, tier: 'play10' };
  if (level < 27) return { enh: 7, tier: 'play15' };
  if (level < 40) return { enh: 7, tier: 'play20' };
  if (level < 50) return { enh: 8, tier: 20 };
  return { enh: 9, tier: 20 };
}

(async () => {
  const D = await import(path.join(ROOT, 'src/systems/DuelSystem.js'));
  const { combatPower } = await import(path.join(ROOT, 'src/data/formulas.js'));
  const cache = new Map();
  const snap = (cls, level, name) => {
    const k = `${cls}|${level}`;
    if (!cache.has(k)) {
      const b = bodyAt(level);
      const s = B.statsOf(G, cls, level, b.enh, b.tier, null, 0);
      cache.set(k, D.sanitizeSnapshot({
        name: name || `${NAME[cls]} Lv.${level}`, level, classId: cls, weaponShape: s.weaponShape, power: combatPower(s.stats, s.mods),
        stats: s.stats, mods: s.mods, traits: CLASSES[cls].combat || {},
      }));
    }
    return { ...cache.get(k), name: name || cache.get(k).name };
  };
  const LEN = { n: 0, acts: 0, ms: 0, draw: 0 };
  const winRate = (a, b, n = 200) => {
    let w = 0;
    for (let i = 0; i < n; i++) {
      const r = D.simulateDuel({ a, b, seed: 1000 + i, scale: SC });
      LEN.n++; LEN.acts += r.turns.length; LEN.ms += r.duration;
      if (r.winner === 'a') w++;
      else if (r.winner === 'draw') { w += 0.5; LEN.draw++; }
    }
    return w / n;
  };

  // 사람 모임 — 결투장(Lv.20 ~)에 몸을 올려 둔 사람들. 레벨이 높을수록 결투장에 오래 머문다고 보고 고르게 깐다.
  const LEVELS = [20, 21, 23, 24, 26, 28, 30, 31, 33, 35, 36, 38, 40, 42, 44, 45, 47, 49, 50, 50];
  const cls3 = ['warrior', 'ranger', 'mage'];
  const pool = LEVELS.map((lv, i) => ({ id: `p${i}`, level: lv, cls: cls3[i % 3], ...snapTag(lv, cls3[i % 3], i) }));
  function snapTag(lv, cls, i) { return { name: `${NAME[cls]}${i + 1}` }; }

  // 점수 — ① 주 첫날(모두 1000) ② 주 중반(지금 규칙으로 하루 다섯 판씩 사흘 — 센 몸이 위로)
  const rng = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32); })();
  const ratings0 = Object.fromEntries(pool.map((p) => [p.id, 1000]));
  const ratingsMid = { ...ratings0 };
  for (let day = 0; day < 3; day++) {
    for (const me of pool) {
      for (let f = 0; f < 5; f++) {
        const offers = offerByRating(me, ratingsMid);
        const t = offers[Math.floor(rng() * offers.length)];
        const r = D.simulateDuel({ a: snap(me.cls, me.level), b: snap(t.cls, t.level), seed: Math.floor(rng() * 1e9), scale: SC });
        const d = D.ratingDelta(ratingsMid[me.id], ratingsMid[t.id], r.winner, 32, 0.5);
        ratingsMid[me.id] += d.a;
        ratingsMid[t.id] += d.b;
      }
    }
  }

  function offerByRating(me, R, mine = R[me.id] ?? 1000) {
    const keyed = pool.filter((p) => p.id !== me.id).map((c) => ({ c, k: Math.abs(R[c.id] - mine) + rng() * 40 }));
    keyed.sort((x, y) => x.k - y.k);
    const near = keyed.slice(0, 9).map((x) => x.c);
    const up = near.filter((c) => R[c.id] >= mine), down = near.filter((c) => R[c.id] < mine);
    const pick = [];
    const take = (arr) => { const c = arr.find((x) => !pick.includes(x)); if (c) pick.push(c); };
    take(up); take(down);
    for (const c of near) { if (pick.length >= 3) break; if (!pick.includes(c)) pick.push(c); }
    return pick.slice(0, 3);
  }
  // 전투력이 가까운 순(점수는 같은 전투력 안에서 가르는 데만) — ±15% 안이 여섯이 안 되면 넓힌다
  function offerByPower(me, R, _b, mine = R[me.id] ?? 1000) {
    const pw = (p) => snap(p.cls, p.level).power;
    const my = pw(me);
    let band = 0.15, cands = [];
    while (cands.length < 6 && band < 3) {
      cands = pool.filter((p) => p.id !== me.id && Math.abs(pw(p) - my) <= my * band);
      band += 0.1;
    }
    const keyed = cands.map((c) => ({ c, k: Math.abs(pw(c) - my) / my * 400 + Math.abs(R[c.id] - mine) * 0.5 + rng() * 20 }));
    keyed.sort((x, y) => x.k - y.k);
    return keyed.slice(0, 3).map((x) => x.c);
  }
  function offerByBand(me, R, band = 5, mine = R[me.id] ?? 1000) {
    let b = band, cands = [];
    while (cands.length < 6 && b <= 50) {
      cands = pool.filter((p) => p.id !== me.id && Math.abs(p.level - me.level) <= b);
      b += 3;
    }
    const keyed = cands.map((c) => ({ c, k: Math.abs(R[c.id] - mine) + rng() * 40 }));
    keyed.sort((x, y) => x.k - y.k);
    return keyed.slice(0, 3).map((x) => x.c);
  }

  const out = { scenarios: [] };
  for (const [sname, R] of [['주 첫날(모두 1000점)', ratings0], ['주 중반(사흘 지난 뒤)', ratingsMid]]) {
    const sc = { name: sname, rows: [] };
    for (const lv of [10, 20, 30]) {
      for (const cls of cls3) {
        const me = { id: `me${lv}${cls}`, level: lv, cls };
        const mine = 1000;
        const row = { level: lv, cls: NAME[cls], power: snap(cls, lv).power, rule: {} };
        for (const [rname, fn] of [['지금(점수만)', offerByRating], ['레벨 띠 ±5 + 점수', offerByBand], ['전투력 근처', offerByPower]]) {
          const offers = fn(me, R, rname === '지금(점수만)' ? undefined : 5, mine).filter(Boolean);
          row.rule[rname] = offers.map((o) => ({
            name: o.name, level: o.level, cls: NAME[o.cls], rating: R[o.id], power: snap(o.cls, o.level).power,
            win: Math.round(winRate(snap(cls, lv), snap(o.cls, o.level)) * 100),
          }));
        }
        sc.rows.push(row);
      }
    }
    out.scenarios.push(sc);
  }
  // 같은 레벨끼리 직업 상성(보정 없음) — 참고
  out.mirror = {};
  for (const lv of [10, 20, 30, 50]) {
    out.mirror[lv] = {};
    for (const a of cls3) for (const b of cls3) out.mirror[lv][`${NAME[a]}→${NAME[b]}`] = Math.round(winRate(snap(a, lv), snap(b, lv)) * 100);
  }
  // 몸(전투력 대신 HP · 공격)
  out.bodies = {};
  for (const lv of [10, 20, 30, 40, 50]) for (const c of cls3) { const s = snap(c, lv); out.bodies[`${NAME[c]} Lv.${lv}`] = { hp: s.stats.hp, atk: s.stats.atk, def: s.stats.def }; }
  // 같은 레벨끼리 한 판 길이(손 수 · 초) · 무승부
  const L2 = { n: 0, acts: 0, ms: 0, draw: 0 };
  for (const lv of [20, 30, 50]) for (const a of cls3) for (const b of cls3) for (let i = 0; i < 60; i++) {
    const r = D.simulateDuel({ a: snap(a, lv), b: snap(b, lv), seed: 5000 + i, scale: SC });
    L2.n++; L2.acts += r.turns.length; L2.ms += r.duration; if (r.winner === 'draw') L2.draw++;
  }
  out.length = { acts: +(L2.acts / L2.n).toFixed(1), sec: +(L2.ms / L2.n / 1000).toFixed(1), drawPct: +(L2.draw / L2.n * 100).toFixed(1) };
  out.scale = SC;
  const i = process.argv.indexOf('--json');
  if (i > 0) require('fs').writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
  for (const sc of out.scenarios) {
    console.log(`\n== ${sc.name}`);
    for (const r of sc.rows) {
      for (const [rn, list] of Object.entries(r.rule)) {
        console.log(`  Lv.${r.level} ${r.cls} [${rn}] ` + list.map((o) => `${o.cls} Lv.${o.level}(${o.rating}) ${o.win}%`).join(' · '));
      }
    }
  }
  console.log('\n같은 레벨 상성', JSON.stringify(out.mirror));
  console.log('한 판 길이(같은 레벨)', JSON.stringify(out.length));
})();
