#!/usr/bin/env node
/**
 * 스킬 트리 시너지 — 빌드 모양마다 가장 센 찍기와 그 세기를 잰다 (0.80.03).
 *
 *   node tools/synergy.js                   직업 셋 · 올인 3 + 1.5갈래 6 — 모양마다 가장 센 찍기
 *   node tools/synergy.js warrior           한 직업만
 *   node tools/synergy.js --free            모양을 정하지 않고 가장 센 찍기를 찾는다(한 점씩 옮겨 보기)
 *   node tools/synergy.js --n 30            빌드마다 사냥감 하나에 몇 판(기본 24)
 *   node tools/synergy.js --json dist/synergy.json
 *   node tools/synergy.js --level 50 --set 4 --enh 10      재는 몸(기본: Lv.50 · 룬 한 벌 +10)
 *
 * ── 무엇을 재나 ────────────────────────────────────────────
 * 직업 포인트 25점으로 고를 수 있는 것은 둘이다 — 한 갈래 **올인**(뿌리 5 + 갈래 20, 숙련까지) 과
 * **1.5갈래**(뿌리 5 + 궁극까지 13 + 옆 갈래 7). 올인은 셋, 1.5갈래는 (본 갈래 × 옆 갈래) 여섯.
 * 1.5갈래는 본 갈래에서 뺄 세 점과 옆 갈래 일곱 점을 어디에 둘지가 여럿이라 **다 돌려 보고** 가장 센 것을 적는다.
 *
 * 세기는 게임의 진짜 전투 계산기(src/systems/CombatSystem.js)로 잰다:
 *   사냥  끝 무렵 잡몹들 가운데 가장 잘 벌리는 곳의 초당 경험치
 *         = 경험치 × 승률 ÷ (한 판 시간 ÷ 4배속 + 걷기 5초 + 질 확률 × 30초)   — 승률 80% 넘는 곳만(대시보드 흉내와 같다)
 *   보스  끝 보스들(20단계 · 지하감옥 5층)의 평균 승률
 *   종합  사냥 · 보스를 그 직업의 가장 센 빌드 = 100 으로 놓고 반반 더한 값
 * 공용 포인트(9점)는 공격 먼저 · 방어 먼저 둘 다 돌려 더 나은 쪽을 쓴다.
 *
 * 씨앗이 정해져 있으므로 같은 표에서는 늘 같은 결과가 나온다.
 */
const fs = require('fs');
const path = require('path');
const B = require('./balance.js');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const N = Number(arg('n', 24));
const LEVEL = Number(arg('level', 50));
const SET = Number(arg('set', 4));
const ENH = Number(arg('enh', 10));
const FREE = process.argv.includes('--free');
const QUIET = process.argv.includes('--quiet');
const JSON_OUT = arg('json', null);
const ONLY = ['warrior', 'ranger', 'mage'].filter((c) => process.argv.includes(c));

// balance-dash.js 의 한 벌 사다리와 같은 물건(끝 두 벌만)
const SETS = {
  2: { weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' },
    wear: ['knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'swift_ring'], pots: [['greater_potion', 20]] },
  4: { weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' },
    wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'power_ring'], pots: [['mega_potion', 20]] },
};

async function main() {
  const G = B.loadFrom('src');
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const F = await import('../src/data/formulas.js');
  const skills = G['skills.json'];
  const mons = G['monsters.json'];
  const maps = G['maps.json'].maps;
  const items = G['items.json'];
  const set = SETS[SET] || SETS[4];

  // ── 사냥감 — 끝 무렵 잡몹과 끝 보스 ──
  // 0.80.20 — 땅의 몬스터 배율(mult · bossMult)까지 — 게임과 같은 셈(formulas.stageMult)
  const scaled = (mid, m, boss = false) => {
    const d = mons[mid];
    return { ...d, level: d.level + (m.levelBonus || 0), stats: F.scaleMonsterStats(d.stats, m.power || 1, F.stageMult(m, boss)), exp: Math.round(d.exp * (m.power || 1)) };
  };
  const stageMaps = Object.entries(maps).filter(([, m]) => m.stage > 0).sort((a, b) => a[1].stage - b[1].stage);
  const minStage = LEVEL >= 45 ? 17 : LEVEL >= 30 ? 9 : 4;
  const maxStage = LEVEL >= 45 ? 99 : LEVEL >= 30 ? 15 : 8;
  const foes = [];
  for (const [id, m] of stageMaps) {
    if (m.stage < minStage || m.stage > maxStage) continue;
    const list = [...(m.monsters || []).map((mid) => ['trash', mid]), ...(m.boss ? [['boss', m.boss]] : [])];
    for (const [kind, mid] of list) {
      if (!mons[mid]) continue;
      const s = scaled(mid, m, kind === 'boss');
      const magicPart = kind === 'boss' && m.bossMagicPart != null ? m.bossMagicPart : m.magicPart || 0;
      foes.push({ kind, map: id, mapName: m.name, id: mid, exp: s.exp,
        monster: { name: s.name, level: s.level, ...s.stats, maxHp: s.stats.hp, magicPart,
          rage: Number(s.rage) > 0 ? Number(s.rage) : 0, magicResist: Number(s.magicResist) > 0 ? Number(s.magicResist) : 0, school: s.school || 'physical' } });
    }
  }
  const potions = {
    stock: set.pots.filter(([id]) => items[id] && items[id].use && items[id].use.hp).map(([id, count]) => ({ id, name: items[id].name, heal: items[id].use.hp, count })),
    threshold: 0.7, cooldownMs: 2000,
  };

  /** 찍기 하나를 잰다 → { hunt, boss, rows } */
  const cache = new Map();
  function measure(cls, ranks, traits, n) {
    const key = cls + JSON.stringify(ranks) + JSON.stringify(traits) + n;
    if (cache.has(key)) return cache.get(key);
    const gear = { warrior: set.weapon.warrior, ranger: set.weapon.ranger, mage: set.weapon.mage, wear: set.wear };
    const { stats, mods, weaponShape } = B.statsOf(G, cls, LEVEL, ENH, null, gear, { ranks, traits });
    const playerTraits = G['classes.json'].list[cls].combat;
    let hunt = 0, bossSum = 0, bossN = 0, where = '';
    const rows = [];
    for (const f of foes) {
      let win = 0, dur = 0;
      // 0.80.20 — 잡몹은 필드(350ms · 1배속), 보스는 전투 화면(620ms · Shift 4배) — 대시보드 흉내와 같다
      const boss = f.kind === 'boss';
      for (let seed = 1; seed <= n; seed++) {
        const r = simulateBattle({ player: { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape }, monster: f.monster, seed, playerMods: mods, playerTraits, potions,
          gapMs: boss ? null : F.BALANCE.FIELD.ACTION_GAP });
        if (r.winner === 'player') win++;
        dur += r.duration || 0;
      }
      const w = win / n, d = dur / n;
      rows.push({ id: f.id, kind: f.kind, w, d });
      if (boss) { bossSum += w; bossN++; }
      else if (w >= 0.8) {
        const e = (f.exp * w) / (d / 1000 + 5 / F.BALANCE.MOVE_SPEED_BASE + (1 - w) * 30);
        if (e > hunt) { hunt = e; where = f.monster.name; }
      }
    }
    const out = { hunt, boss: bossN ? bossSum / bossN : 0, where, rows, cp: F.combatPower(stats, mods), atk: Math.round(stats.atk), hp: Math.round(stats.hp), def: Math.round(stats.def) };
    cache.set(key, out);
    return out;
  }
  /** 공용 순서 둘 가운데 더 나은 쪽 */
  function best(cls, ranks, n, norm) {
    let top = null;
    for (const ci of [0, 1]) {
      const traits = B.commonRanks(G, LEVEL, ci);
      const m = measure(cls, ranks, traits, n);
      const s = score(m, norm);
      if (!top || s > top.s) top = { ...m, s, common: ci, traits };
    }
    return top;
  }
  const score = (m, norm) => (norm ? 50 * (m.hunt / (norm.hunt || 1)) + 50 * (m.boss / (norm.boss || 1)) : m.hunt * (0.2 + m.boss));

  // ── 찍기 만들기 ──
  const pts = B.treePoints(G, LEVEL);
  /** caps 칸들에 total 점을 나눠 담는 모든 길(문턱: 2단 3 · 3단 6 — 칸 차례는 [1단, 1단, 2단, 3단]) */
  function splits(caps, total) {
    const out = [];
    const g2 = Number(skills.gates[2]) || 0, g3 = Number(skills.gates[3]) || 0;
    for (let a = 0; a <= caps[0]; a++) for (let b = 0; b <= caps[1]; b++) for (let c = 0; c <= caps[2]; c++) {
      const d = total - a - b - c;
      if (d < 0 || d > caps[3]) continue;
      if (c > 0 && a + b < g2) continue;
      if (d > 0 && a + b + c < g3) continue;
      out.push([a, b, c, d]);
    }
    return out;
  }
  function shapeAllocs(cls, shape) {
    const ct = skills.classTrees[cls];
    const max = (id) => skills.tree[id].max;
    const flat = (n) => [...(n[1] || []), ...(n[2] || []), ...(n[3] || [])];
    const m = B.branchNodes(G, cls, shape.main);
    const base = { [ct.root]: Math.min(max(ct.root), pts) };
    if (!shape.sub) {
      const r = { ...base };
      for (const tier of [1, 2, 3, 4, 5]) for (const id of m[tier] || []) r[id] = max(id);
      return [{ ranks: r, pick: null }];
    }
    const mf = flat(m), sf = flat(B.branchNodes(G, cls, shape.sub));
    const capGate = Number(skills.gates[4]) || 12;
    const left = pts - base[ct.root] - capGate - 1;
    const out = [];
    for (const mp of splits(mf.map(max), capGate)) {
      for (const sp of splits(sf.map(max), left)) {
        const r = { ...base };
        mf.forEach((id, i) => { if (mp[i]) r[id] = mp[i]; });
        for (const id of m[4] || []) r[id] = 1;
        sf.forEach((id, i) => { if (sp[i]) r[id] = sp[i]; });
        out.push({ ranks: r, pick: { main: mp, sub: sp } });
      }
    }
    return out;
  }
  const nameOf = (ranks) => Object.entries(ranks).filter(([, r]) => r).map(([id, r]) => `${skills.tree[id].name}${r}`).join(' ');

  const result = { level: LEVEL, set: SET, enh: ENH, n: N, foes: foes.map((f) => ({ id: f.id, kind: f.kind, name: f.monster.name, level: f.monster.level })), classes: {} };
  for (const cls of ONLY.length ? ONLY : ['warrior', 'ranger', 'mage']) {
    const t0 = Date.now();
    const rowsOut = [];
    for (let bi = 0; bi < B.TREE_BUILDS.length; bi++) {
      const shape = B.TREE_BUILDS[bi];
      const allocs = shapeAllocs(cls, shape);
      // ① 적은 판으로 다 돌려 보고 ② 윗줄 몇을 많은 판으로 다시 잰다
      let cand = allocs;
      if (allocs.length > 1) {
        const quick = allocs.map((a) => ({ a, m: best(cls, a.ranks, Math.max(6, Math.round(N / 4))) }));
        quick.sort((x, y) => y.m.s - x.m.s);
        cand = quick.slice(0, 6).map((x) => x.a);
      }
      let top = null;
      for (const a of cand) {
        const m = best(cls, a.ranks, N);
        if (!top || m.s > top.m.s) top = { a, m };
      }
      rowsOut.push({ shape, name: B.shapeName(G, cls, shape), ranks: top.a.ranks, pick: top.a.pick, tried: allocs.length, ...top.m });
    }
    const norm = { hunt: Math.max(...rowsOut.map((r) => r.hunt)), boss: Math.max(...rowsOut.map((r) => r.boss)) };
    for (const r of rowsOut) r.total = +score(r, norm).toFixed(1);
    let free = null;
    if (FREE) {
      // 가장 센 모양에서 시작해 한 점씩 옮겨 본다(문턱을 지키는 한). 더 나아지지 않을 때까지.
      const ids = G['classes.json'].list[cls].skills;
      let cur = { ...rowsOut.slice().sort((a, b) => b.total - a.total)[0].ranks };
      let curS = score(best(cls, cur, N), norm);
      for (let round = 0; round < 40; round++) {
        let better = null;
        for (const from of ids) {
          if (!(cur[from] > 0)) continue;
          for (const to of ids) {
            if (to === from || (cur[to] || 0) >= skills.tree[to].max) continue;
            const next = { ...cur, [from]: cur[from] - 1, [to]: (cur[to] || 0) + 1 };
            if (!B.validRanks(G, cls, next, LEVEL)) continue;
            const q = score(best(cls, next, Math.max(6, Math.round(N / 3))), norm);
            if (q <= curS * 1.01) continue;
            const s2 = score(best(cls, next, N), norm);
            if (s2 > curS * 1.005 && (!better || s2 > better.s)) better = { next, s: s2 };
          }
        }
        if (!better) break;
        cur = better.next; curS = better.s;
      }
      const m = best(cls, cur, N);
      free = { ranks: cur, total: +score(m, norm).toFixed(1), hunt: m.hunt, boss: m.boss };
    }
    result.classes[cls] = { norm, rows: rowsOut.map((r) => ({ name: r.name, main: r.shape.main, sub: r.shape.sub, total: r.total, hunt: +r.hunt.toFixed(1), boss: +r.boss.toFixed(3), where: r.where, cp: r.cp, common: r.common, pick: r.pick, tried: r.tried, ranks: r.ranks, detail: r.rows.map((x) => ({ id: x.id, kind: x.kind, w: +x.w.toFixed(2), d: Math.round(x.d) })) })), free };
    if (!QUIET) {
      console.log(`\n== ${G['classes.json'].list[cls].name}  (Lv.${LEVEL} · 한 벌 ${SET} +${ENH} · ${N}판 · ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
      console.log('  빌드            종합   사냥(초당 경험치 · 어디)        보스 승률  전투력   공용   찍기');
      for (const r of rowsOut.slice().sort((a, b) => b.total - a.total)) {
        console.log(`  ${r.name.padEnd(10)} ${String(r.total).padStart(6)}  ${r.hunt.toFixed(1).padStart(7)} ${String(r.where).padEnd(12)}  ${(r.boss * 100).toFixed(0).padStart(4)}%  ${String(r.cp).padStart(7)}  ${r.common ? '방어' : '공격'}  ${r.pick ? `본 ${r.pick.main.join('')} 옆 ${r.pick.sub.join('')}  ` : ''}${nameOf(r.ranks)}`);
      }
      const all = rowsOut.filter((r) => !r.shape.sub), hyb = rowsOut.filter((r) => r.shape.sub);
      const mx = (a) => Math.max(...a.map((r) => r.total));
      console.log(`  → 올인 최고 ${mx(all)} · 1.5갈래 최고 ${mx(hyb)} · 차이 ${(mx(all) - mx(hyb)).toFixed(1)}`);
      if (free) console.log(`  → 모양 없이 찾은 최고 ${free.total}: ${nameOf(free.ranks)}`);
    }
  }
  if (JSON_OUT) {
    fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true });
    fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 1));
    if (!QUIET) console.log(`\n→ ${JSON_OUT}`);
  }
  return result;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { main };
