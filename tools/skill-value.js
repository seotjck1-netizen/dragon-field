#!/usr/bin/env node
/**
 * 스킬 한 점의 값 — 같은 잣대로 57칸을 잰다 (0.80.29).
 *
 *   node tools/skill-value.js                 직업 셋 — 칸마다 한 점의 값 · 단(1 · 2 · 3단)마다의 비
 *   node tools/skill-value.js warrior         한 직업만
 *   node tools/skill-value.js --n 24          싸움마다 몇 판(기본 16)
 *   node tools/skill-value.js --json out.json
 *
 * 사용자(2026-11-22): 「굳센 몸(3단)이 위의 불굴의 심장(1단)보다 안 좋다 — 스킬 밸런스가 엉망」 → 「57개 전부 다시 짜기」.
 * 규칙(PROJECT-RULES 7): 같은 갈래에서 **깊은 단일수록 한 점이 세다** — 1단 1 · 2단 1.25 · 3단 1.5 · 궁극(1점) 4 · 숙련 1.25 · 뿌리 1.
 *
 * ── 무엇을 재나 ────────────────────────────────────────────
 * 몸: Lv.50 · 끝 한 벌(룬 +10, synergy.js 와 같은 물건) · 공용 특성은 공격 먼저 · 물약 없음.
 * 상대: 끝 무렵(17단계부터) 잡몹 한 마리 · 같은 잡몹 둘(애드 — 광역이 값을 갖는다) · 끝 보스.
 * 세기 = **반반으로 이길 수 있는 상대의 세기 k** — 상대의 공격력 · HP 를 함께 k 배로 키워 가며(나눠 찾기)
 *   승률이 50% 가 되는 k. 공격이 두 배여도 방어가 두 배여도 k 가 비슷하게 오르고, 상대도 함께 세지므로
 *   방어가 어느 선을 넘어 피해가 0 이 되는 문턱(그러면 값이 끝없이 커진다)에 걸리지 않는다.
 *   아슬아슬한 싸움이라 「HP 50% 이하」 · 「상대 HP 30% 이하」 칸도 켜진다. 물약 없음.
 *   (먼저 「한 목숨에 몇 마리」로 재 봤다 — 방어 문턱 때문에 0.1 ~ 1000 마리로 튀어 쓸 수 없었다.)
 * 사냥 = 보통 잡몹(키우지 않은 것 — 한 마리 · 둘)의 HP 를 1초에 깎는 양. 레벨업 빠르기를 정한다.
 * 직업의 세기 = √(버티기 k 의 기하평균 × 사냥의 기하평균) — 공격 칸은 둘 다에, 방어 칸은 버티기에 값이 잡힌다.
 *
 * 한 칸의 값 = ln 세기(그 갈래 전부 + 뿌리) − ln 세기(그 칸만 뺀 것) — 갈래 안의 짝(반격 확률 × 반격 피해)까지 들어간다.
 * 뿌리의 값은 갈래 셋에서 잰 것의 평균. 한 점의 값 = 칸의 값 ÷ 그 칸의 점수.
 * 씨앗이 정해져 있으므로 같은 표에서는 늘 같은 결과가 나온다.
 */
const fs = require('fs');
const B = require('./balance.js');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const N = Number(arg('n', 16));
const LEVEL = 50;
const ENH = 10;
const JSON_OUT = arg('json', null);
const ONLY = ['warrior', 'ranger', 'mage'].filter((c) => process.argv.includes(c));
const NAME = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };
// 단마다 한 점의 무게(규칙) — tier: 0 뿌리 · 1 · 2 · 3 · 4 궁극 · 5 숙련
const WEIGHT = { 0: 1, 1: 1, 2: 1.25, 3: 1.5, 4: 4, 5: 1.25 };

// synergy.js 의 끝 한 벌과 같은 물건
const SET = {
  weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' },
  wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'power_ring'],
};

/**
 * 세기를 재는 연장을 만든다 — { strength(cls, ranks) , skills }.
 * @param {string} where 표를 읽을 곳('src' — balance.js loadFrom)
 */
async function makeMeter(where = 'src', overrideSkills = null) {
  const G = B.loadFrom(where);
  if (overrideSkills) G['skills.json'] = overrideSkills;
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const F = await import('../src/data/formulas.js');
  const mons = G['monsters.json'];
  const maps = G['maps.json'].maps;
  const scaled = (mid, m, boss = false) => {
    const d = mons[mid];
    return { ...d, level: d.level + (m.levelBonus || 0), stats: F.scaleMonsterStats(d.stats, m.power || 1, F.stageMult(m, boss)) };
  };
  const foeOf = (s, m, boss) => {
    const magicPart = boss && m.bossMagicPart != null ? m.bossMagicPart : m.magicPart || 0;
    return { name: s.name, level: s.level, ...s.stats, maxHp: s.stats.hp, magicPart,
      rage: Number(s.rage) > 0 ? Number(s.rage) : 0, magicResist: Number(s.magicResist) > 0 ? Number(s.magicResist) : 0, school: s.school || 'physical' };
  };
  // 상대 — 17단계부터의 땅마다: 잡몹 하나 · 잡몹 둘 · 보스
  const groups = [];
  for (const [id, m] of Object.entries(maps)) {
    if (!(m.stage >= 17)) continue;
    const trash = (m.monsters || []).filter((mid) => mons[mid]);
    if (trash.length) {
      const t = foeOf(scaled(trash[0], m), m, false);
      groups.push({ map: id, kind: 'one', foes: [t], gap: F.BALANCE.FIELD.ACTION_GAP });
      groups.push({ map: id, kind: 'two', foes: [t, { ...t }], gap: F.BALANCE.FIELD.ACTION_GAP });
    }
    if (m.boss && mons[m.boss]) groups.push({ map: id, kind: 'boss', foes: [foeOf(scaled(m.boss, m, true), m, true)], gap: null });
  }
  const traits = B.commonRanks(G, LEVEL, 0);
  const playerTraitsOf = (cls) => G['classes.json'].list[cls].combat;
  const gear = { ...SET.weapon, wear: SET.wear };
  const cache = new Map();
  /**
   * 상대를 k 배(공격력 · HP)로 키웠을 때의 승률 — 씨앗은 늘 같다(같은 씨앗끼리 견주어야 흔들림이 적다).
   */
  function winAt(cls, ranks, g, k) {
    const { stats, mods, weaponShape } = B.statsOf(G, cls, LEVEL, ENH, null, gear, { ranks, traits });
    const player = { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape };
    const foes = g.foes.map((f) => ({ ...f, atk: f.atk * k, hp: f.hp * k, maxHp: f.maxHp * k }));
    let win = 0;
    for (let seed = 1; seed <= N; seed++) {
      const opts = { player, seed, playerMods: mods, playerTraits: playerTraitsOf(cls), gapMs: g.gap };
      const r = foes.length > 1
        ? simulateBattle({ ...opts, monsters: foes.map((f) => ({ ...f })) })
        : simulateBattle({ ...opts, monster: { ...foes[0] } });
      if (r.winner === 'player') win++;
    }
    return win / N;
  }

  /** 반반으로 이기는 k — 넓혀서 사이에 가둔 뒤 로그 눈금으로 나눠 찾고, 마지막 두 점 사이를 곧게 잇는다. */
  function breakEven(cls, ranks, g) {
    let lo = 1, hi = 1, wLo = winAt(cls, ranks, g, 1), wHi = wLo;
    if (wLo >= 0.5) {
      for (let i = 0; i < 24 && wHi >= 0.5; i++) { lo = hi; wLo = wHi; hi *= 2; wHi = winAt(cls, ranks, g, hi); }
    } else {
      for (let i = 0; i < 24 && wLo < 0.5; i++) { hi = lo; wHi = wLo; lo /= 2; wLo = winAt(cls, ranks, g, lo); }
    }
    for (let i = 0; i < 7; i++) {
      const mid = Math.sqrt(lo * hi);
      const w = winAt(cls, ranks, g, mid);
      if (w >= 0.5) { lo = mid; wLo = w; } else { hi = mid; wHi = w; }
    }
    const t = wLo === wHi ? 0.5 : (wLo - 0.5) / (wLo - wHi);
    return Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo)));
  }

  /** 사냥 빠르기 — 보통 잡몹(키우지 않은 것)의 HP 를 1초에 얼마나 깎나(한 마리 · 둘) */
  function huntSpeed(cls, ranks, g) {
    const { stats, mods, weaponShape } = B.statsOf(G, cls, LEVEL, ENH, null, gear, { ranks, traits });
    const player = { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape };
    const foeHp = g.foes.reduce((a, f) => a + f.maxHp, 0);
    let lost = 0, time = 0;
    for (let seed = 1; seed <= N; seed++) {
      const opts = { player, seed, playerMods: mods, playerTraits: playerTraitsOf(cls), gapMs: g.gap };
      const r = g.foes.length > 1
        ? simulateBattle({ ...opts, monsters: g.foes.map((f) => ({ ...f })) })
        : simulateBattle({ ...opts, monster: { ...g.foes[0] } });
      const left = (r.monstersHp && r.monstersHp.length ? r.monstersHp : [r.finalHp.monster]).reduce((a, h) => a + Math.max(0, h), 0);
      lost += foeHp - left;
      time += Math.max(1, r.duration || 1);
    }
    return lost / time;
  }

  /**
   * 찍기 하나의 세기 — 버티기(반반으로 이기는 k 의 기하평균)와 사냥(잡몹을 깎는 빠르기의 기하평균)을 반반.
   * 공격 칸은 둘 다에, 방어 칸은 버티기에 값이 잡힌다. 레벨업은 사냥, 보스 · 탑은 버티기가 정한다.
   */
  function strength(cls, ranks) {
    const key = cls + JSON.stringify(ranks);
    if (cache.has(key)) return cache.get(key);
    let lk = 0, lh = 0, nh = 0;
    const per = [];
    for (const g of groups) {
      const p = breakEven(cls, ranks, g);
      per.push({ map: g.map, kind: g.kind, p });
      lk += Math.log(p);
      if (g.kind !== 'boss') { lh += Math.log(huntSpeed(cls, ranks, g)); nh++; }
    }
    const k = Math.exp(lk / groups.length), hunt = Math.exp(lh / nh);
    const out = { s: Math.sqrt(k * hunt), k, hunt, per };
    cache.set(key, out);
    return out;
  }
  return { G, strength, skills: G['skills.json'], groups };
}

/** 갈래의 칸들(단 차례) */
function branchIds(skills, cls, branch) {
  const order = (skills.classTrees[cls] && G_ORDER(skills, cls)) || [];
  return order.filter((id) => skills.tree[id] && skills.tree[id].branch === branch);
}
/** 그 직업의 칸(skills.json 의 _직업 표식 다음부터 다음 표식 전까지) */
function G_ORDER(skills, cls) {
  const mark = '_' + NAME[cls];
  const keys = Object.keys(skills.tree);
  const i = keys.indexOf(mark);
  if (i < 0) return [];
  const out = [];
  for (let k = i + 1; k < keys.length && !keys[k].startsWith('_'); k++) out.push(keys[k]);
  return out;
}

/**
 * 직업 하나의 칸마다 값.
 * @returns {{cls, rows:[{id,name,branch,tier,max,v,per,ratio}], branches:{A,B,C: 갈래 전부의 ln 세기 − 뿌리만}}}
 */
function valuesOf(meter, cls) {
  const { skills, strength } = meter;
  const ct = skills.classTrees[cls];
  const root = ct.root;
  const maxOf = (id) => skills.tree[id].max;
  const ln = (ranks) => Math.log(strength(cls, ranks).s);
  const rows = [];
  const rootVals = [];
  const branches = {};
  const bare = ln({});
  for (const b of ct.branches.map((x) => x.id)) {
    const ids = branchIds(skills, cls, b);
    const full = { [root]: maxOf(root) };
    for (const id of ids) full[id] = maxOf(id);
    const lf = ln(full);
    branches[b] = { total: lf - bare, rootOnly: ln({ [root]: maxOf(root) }) - bare };
    for (const id of ids) {
      const minus = { ...full };
      delete minus[id];
      const v = lf - ln(minus);
      const d = skills.tree[id];
      rows.push({ id, name: d.name, branch: b, tier: d.tier, max: d.max, v, per: v / d.max });
    }
    const noRoot = { ...full };
    delete noRoot[root];
    rootVals.push(lf - ln(noRoot));
  }
  const rv = rootVals.reduce((a, x) => a + x, 0) / rootVals.length;
  rows.unshift({ id: root, name: skills.tree[root].name, branch: 'root', tier: 0, max: maxOf(root), v: rv, per: rv / maxOf(root) });
  // 단마다의 비 — 그 갈래 1단 두 칸 한 점 값의 평균을 1 로
  for (const r of rows) {
    if (r.branch === 'root') { r.ratio = null; continue; }
    const t1 = rows.filter((x) => x.branch === r.branch && x.tier === 1);
    const base = t1.reduce((a, x) => a + x.per, 0) / (t1.length || 1);
    r.ratio = base > 0 ? r.per / base : null;
  }
  return { cls, rows, branches };
}

async function main() {
  const meter = await makeMeter('src');
  const out = {};
  for (const cls of ONLY.length ? ONLY : ['warrior', 'ranger', 'mage']) {
    const t0 = Date.now();
    const r = valuesOf(meter, cls);
    out[cls] = r;
    console.log(`\n== ${NAME[cls]}  (Lv.${LEVEL} · 룬 한 벌 +${ENH} · 상대 ${meter.groups.length}묶음 · ${N}판 · ${Math.round((Date.now() - t0) / 1000)}초)`);
    console.log('  갈래  단  칸                점  칸의 값   한 점    1단 대비  규칙');
    for (const x of r.rows) {
      const want = WEIGHT[x.tier];
      console.log(`  ${String(x.branch).padEnd(4)}  ${x.tier}   ${x.name.padEnd(12, ' ')}  ${x.max}  ${x.v.toFixed(4).padStart(7)}  ${x.per.toFixed(4).padStart(7)}  ${x.ratio == null ? '   -  ' : x.ratio.toFixed(2).padStart(6)}  ${want}`);
    }
    for (const [b, v] of Object.entries(r.branches)) console.log(`  갈래 ${b} 전부(뿌리 포함): ln 세기 +${v.total.toFixed(3)} (뿌리만 +${v.rootOnly.toFixed(3)})`);
  }
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { makeMeter, valuesOf, branchIds, WEIGHT, NAME };
