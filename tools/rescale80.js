#!/usr/bin/env node
/**
 * 0.80.20 몬스터 배율 다시 풀기 — "그 사냥터에 서는 몸이, 새 장비 규칙으로도 지금과 같은 승률 · 처치 시간을 내게".
 *
 *   OLD_ROOT=/path/to/0.80.03 node tools/rescale80.js            풀어서 보여 준다
 *   OLD_ROOT=/path/to/0.80.03 node tools/rescale80.js --write    maps.json 의 mult · bossMult 에 적는다
 *
 * docs/SPEC-0.80.md 「몬스터 수정표」와 같은 방법이다. 다만 수정안은 0.70.39 몸(옛 스킬)에서 풀었고,
 * 그 뒤 스킬 트리가 0.80.03(와우식)으로 바뀌었다 — 그래서 **0.80.03 몸 → 0.80.20 몸**으로 다시 푼다.
 *
 *   ① 옛 판(OLD_ROOT — 0.80.03 의 저장소 사본)에서 balance-dash 를 돌려 둔 표로 성장 흉내를 돌리고,
 *      사냥터(단계)마다 직업별로 그곳을 사냥하던 몸(레벨 · 한 벌 · 강화)을 고른다(그 단계를 사냥한 분들의 가운데).
 *   ② 그 몸을 옛 규칙(옛 tools/balance.js · 옛 표 · 옛 전투 계산기)과 새 규칙(지금 저장소)으로 각각 세운다.
 *      새 몸의 강화는 C 규칙의 흔한 강화(15단계까지 +8, 그 뒤 +9)에서 멈춘다.
 *   ③ 몸의 공격력 비 kA · 체력 비 kH 로 몬스터 HP · 방어력 × kA·c, 공격력 × kH·c 를 걸고,
 *      옛 승률(2~98% 면)이나 옛 처치 시간(그 밖)과 같아지는 c 를 반으로 나누어 찾는다.
 *      박자는 같게 잰다(시간은 둘 다 전투 화면 박자로, 승률은 새 몸은 필드 박자 — 물약 간격이 박자에 걸리므로).
 *
 * 먼저 OLD_ROOT 에서 `node tools/balance-dash.js` 를 돌려 dist/balance 를 만들어 둔다.
 */
const fs = require('fs');
const path = require('path');

const OLD = process.env.OLD_ROOT;
if (!OLD || !fs.existsSync(path.join(OLD, 'tools', 'balance.js'))) {
  console.error('OLD_ROOT 에 옛 판(0.80.03) 저장소 사본을 주세요. 예: git worktree add /tmp/old80 <옛 커밋>');
  process.exit(1);
}
const WRITE = process.argv.includes('--write');
const NS = 24;

const SETS = [
  { weapon: { warrior: 'club', ranger: 'short_bow', mage: 'gnarled_staff' }, wear: ['cloth_armor', 'cloth_gloves', 'leather_boots'], pots: [['potion', 10]] },
  { weapon: { warrior: 'iron_sword', ranger: 'hunting_bow', mage: 'apprentice_staff' }, wear: ['leather_armor', 'leather_pauldron', 'cloth_gloves', 'leather_boots', 'leather_belt', 'wood_amulet'], pots: [['potion', 20]] },
  { weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' }, wear: ['knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'swift_ring'], pots: [['greater_potion', 20]] },
  { weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' }, wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'power_ring'], pots: [['greater_potion', 30]] },
  { weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' }, wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'power_ring'], pots: [['mega_potion', 20]] },
  { weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' }, wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'], pots: [['mega_potion', 20]] },
];

(async () => {
  const BN = require('./balance.js');
  const BO = require(path.join(OLD, 'tools', 'balance.js'));
  const GN = BN.loadFrom('src');
  const GO = BO.loadFrom('src');
  const CSN = await import(path.join(__dirname, '..', 'src', 'systems', 'CombatSystem.js'));
  const CSO = await import(path.join(OLD, 'src', 'systems', 'CombatSystem.js'));
  const FN = await import(path.join(__dirname, '..', 'src', 'data', 'formulas.js'));
  const sim = require(path.join(OLD, 'tools', 'balance-page', 'sim.js'));
  const D = path.join(OLD, 'dist', 'balance');
  const R = (n) => JSON.parse(fs.readFileSync(path.join(D, n + '.json'), 'utf8'));
  const rows = sim(R('battle'), R('targets'), R('tdrops'), R('sets'), R('items'), R('quests'), R('consts'));
  const classes = ['warrior', 'ranger', 'mage'];

  // ── ① 사냥터마다 그곳에 선 몸 ─────────────────────────────
  const refs = {};
  for (const cls of classes) {
    const mine = rows.filter((r) => r.class === cls && r.stage);
    for (const st of [...new Set(mine.map((r) => r.stage))]) {
      const at = mine.filter((r) => r.stage === st);
      const mid = at[Math.floor(at.length / 2)];
      (refs[st] ||= []).push({ cls, L: mid.level, set: mid.set, enh: Math.round(mid.enh) });
    }
  }

  // ── 사냥감(바탕 배율 power 만 — mult 는 여기서 푼다) ─────────
  const maps = GN['maps.json'].maps;
  const mons = GN['monsters.json'];
  const stageMaps = Object.entries(maps).filter(([, m]) => m.stage > 0).sort((a, b) => a[1].stage - b[1].stage);
  const targets = [];
  for (const [id, m] of stageMaps) {
    const list = [...(m.monsters || []).map((mid) => ['trash', mid]), ...(m.boss ? [['boss', m.boss]] : [])];
    for (const [kind, mid] of list) {
      const d = mons[mid];
      if (!d) continue;
      targets.push({ map: id, stage: m.stage, kind, name: d.name, def: d, mapDef: m, stats: FN.scaleMonsterStats(d.stats, m.power || 1) });
    }
  }
  const foeOf = (t, k = { hp: 1, def: 1, atk: 1 }) => {
    const hp = Math.max(1, Math.round(t.stats.hp * k.hp));
    const magicPart = t.kind === 'boss' && t.mapDef.bossMagicPart != null ? t.mapDef.bossMagicPart : t.mapDef.magicPart || 0;
    return {
      name: t.name, level: t.def.level + (t.mapDef.levelBonus || 0), ...t.stats, hp, maxHp: hp,
      def: Math.round(t.stats.def * k.def), atk: Math.max(1, Math.round(t.stats.atk * k.atk)),
      magicPart, rage: Number(t.def.rage) > 0 ? Number(t.def.rage) : 0,
      magicResist: Number(t.def.magicResist) > 0 ? Number(t.def.magicResist) : 0, school: t.def.school || 'physical',
    };
  };
  const potionsOf = (G, si) => {
    const items = G['items.json'];
    return { stock: SETS[si].pots.filter(([id]) => items[id] && items[id].use).map(([id, count]) => ({ id, name: id, heal: items[id].use.hp, count })), threshold: 0.7, cooldownMs: 2000 };
  };
  const fight = (CS, G, body, cls, L, si, foe, n, gapMs) => {
    const traits = G['classes.json'].list[cls].combat;
    let w = 0, ms = 0;
    for (let seed = 1; seed <= n; seed++) {
      const r = CS.simulateBattle({ player: { name: 'p', level: L, ...body.stats, maxHp: body.stats.hp, weaponShape: body.weaponShape },
        monster: foe, seed, playerMods: body.mods, playerTraits: traits, potions: potionsOf(G, si), ...(gapMs ? { gapMs } : {}) });
      if (r.winner === 'player') w++;
      ms += r.duration || 0;
    }
    return { w: w / n, ms: ms / n };
  };
  const bestBody = (B, G, CS, cls, L, si, enh, ts, gapMs) => {
    const s = SETS[si];
    const gear = { ...s.weapon, wear: s.wear };
    let best = null;
    for (let pi = 0; pi < Math.max(1, (B.PLANS[cls] || []).length); pi++) {
      const b = B.statsOf(G, cls, L, enh, null, gear, pi);
      let w = 0;
      for (const t of ts) w += fight(CS, G, b, cls, L, si, foeOf(t), 8, gapMs).w;
      if (!best || w > best.w) best = { w, b };
    }
    return best.b;
  };
  const enhC = (stage, e) => Math.min(e, stage <= 15 ? 8 : 9);
  const FIELD = FN.BALANCE.FIELD.ACTION_GAP;

  // ── ②③ 풀기 ─────────────────────────────────────────────
  const out = [];
  for (const s of [...new Set(targets.map((t) => t.stage))]) {
    const ts = targets.filter((t) => t.stage === s);
    const rs = refs[s] || [];
    if (!rs.length) { console.log(`${s}단계 — 옛 흉내에서 아무도 이곳을 사냥하지 않았다(건너뜀)`); continue; }
    const bs = rs.map((r) => ({
      ...r, e: enhC(s, r.enh),
      ob: bestBody(BO, GO, CSO, r.cls, r.L, r.set, r.enh, ts, null),
      nb: bestBody(BN, GN, CSN, r.cls, r.L, r.set, enhC(s, r.enh), ts, FIELD),
    }));
    const gm = (a) => Math.exp(a.reduce((x, v) => x + Math.log(v), 0) / a.length);
    const kA = gm(bs.map((b) => b.nb.stats.atk / b.ob.stats.atk));
    const kH = gm(bs.map((b) => b.nb.stats.hp / b.ob.stats.hp));
    for (const kind of ['trash', 'boss']) {
      const g = ts.filter((t) => t.kind === kind);
      if (!g.length) continue;
      const gap = kind === 'boss' ? null : FIELD;
      let ow = 0, oms = 0, n = 0;
      for (const b of bs) for (const t of g) { const r = fight(CSO, GO, b.ob, b.cls, b.L, b.set, foeOf(t), NS, null); ow += r.w; oms += r.ms; n++; }
      ow /= n; oms /= n;
      const byWin = ow > 0.02 && ow < 0.98;
      const evalC = (c) => {
        let w = 0, ms = 0;
        const k = { hp: kA * c, def: kA * c, atk: kH * c };
        for (const b of bs) for (const t of g) {
          const r = fight(CSN, GN, b.nb, b.cls, b.L, b.set, foeOf(t, k), NS, byWin ? gap : null);
          w += r.w; ms += r.ms;
        }
        return { w: w / n, ms: ms / n };
      };
      let lo = Math.log(0.1), hi = Math.log(10), c = 1, got = null;
      for (let it = 0; it < 16; it++) {
        const mid = (lo + hi) / 2;
        const r = evalC(Math.exp(mid));
        if (byWin ? r.w > ow : r.ms < oms) lo = mid; else hi = mid;
        c = Math.exp(mid); got = r;
      }
      const f = { stage: s, kind, map: g[0].map, names: g.map((t) => t.name).join(' · '), kA: +kA.toFixed(3), kH: +kH.toFixed(3), c: +c.toFixed(3),
        hp: +(kA * c).toFixed(3), def: +(kA * c).toFixed(3), atk: +(kH * c).toFixed(3),
        win_old: +ow.toFixed(3), win_new: +got.w.toFixed(3), ms_old: Math.round(oms), ms_new: Math.round(got.ms), by: byWin ? 'win' : 'time',
        bodies: bs.map((b) => `${b.cls[0]}L${b.L}s${b.set}+${b.enh}→+${b.e}`).join(' ') };
      out.push(f);
      console.log(`${String(s).padStart(2)} ${kind.padEnd(5)} ${f.names.slice(0, 20).padEnd(20)} kA ${f.kA} kH ${f.kH} c ${f.c} → hp×${f.hp} atk×${f.atk}`
        + `  승률 ${Math.round(ow * 100)}→${Math.round(got.w * 100)}  시간 ${(oms / 1000).toFixed(1)}→${(got.ms / 1000).toFixed(1)}s (${f.by})  ${f.bodies}`);
    }
  }
  const dest = path.join(__dirname, '..', 'dist', 'balance', 'rescale80.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`✓ ${path.relative(process.cwd(), dest)}`);
  if (WRITE) {
    const p = path.join(__dirname, '..', 'src', 'data', 'maps.json');
    const M = JSON.parse(fs.readFileSync(p, 'utf8'));
    const r3 = (v) => Math.round(v * 1000) / 1000;
    for (const f of out) {
      const m = M.maps[f.map];
      const v = { hp: r3(f.hp), def: r3(f.def), atk: r3(f.atk) };
      if (f.kind === 'boss') m.bossMult = v; else m.mult = v;
    }
    fs.writeFileSync(p, JSON.stringify(M, null, 2) + '\n');
    console.log('✓ src/data/maps.json 의 mult · bossMult 에 적었습니다 — server/content/maps.json 도 같게 하세요');
  }
})();
