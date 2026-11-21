#!/usr/bin/env node
/**
 * 0.80.26 몬스터 배율 다시 풀기 — 무기 계단 · 등급 배율 · 고정 공격력 · 물약 % 로 몸이 바뀐 만큼.
 *
 *   OLD_ROOT=/path/to/0.80.25 node tools/rescale26.js            풀어서 보여 준다
 *   OLD_ROOT=/path/to/0.80.25 node tools/rescale26.js --write    maps.json 의 mult · bossMult 에 적는다(src · server/content)
 *
 * 사용자 답(2026-11-13): **끝은 지금 세기를 지키고, 초 · 중반은 빨라지게.**
 *
 *   ① 옛 판(OLD_ROOT — 0.80.25 저장소 사본, dist/balance 를 만들어 둔 것)의 성장 흉내에서
 *      사냥터(단계)마다 직업별로 그곳을 사냥하던 몸(레벨 · 한 벌 · 강화)을 고른다. 흉내가 들르지 않은 단계는 앞뒤에서 잇는다.
 *   ② 그 몸을 옛 규칙(옛 tools/balance.js · 옛 표 · 옛 전투 계산기)과 새 규칙(지금 저장소)으로 세운다.
 *   ③ 몸의 공격력 비 kA · 체력 비 kH 로 몬스터 HP · 방어력 × kA·c, 공격력 × kH·c 를 **옛 배율 위에** 걸고,
 *      목표와 같아지는 c 를 반으로 나누어 찾는다. 목표는 단계마다(EASE):
 *        잡몹  처치 시간 = 옛 시간 × f(단계)        — 1 ~ 10단계 0.7, 11 ~ 14단계 0.8, 15 ~ 19단계 0.85 → 0.93, 20단계부터 1(그대로)
 *              (그 몸이 열에 하나 넘게 지는 땅이면 승률로 — 아래 보스와 같게)
 *        보스  승률 = 옛 승률 + (1 − 옛 승률) × g(단계) — 1 ~ 10단계 0.4, 11 ~ 14단계 0.5, 15 ~ 19단계 0.2 → 0.08, 20단계부터 0
 *              (늘 이기거나 늘 지면 시간으로)
 *      한 대에 눕는 상대는 더 빨리 잡을 수 없으므로, 시간 목표는 닿을 수 있는 가장 짧은 시간 × 1.03 아래로 내리지 않는다.
 *      감옥의 주인은 따로 맞춘다(Lv.50 +9 에 70% 쯤 — tools/lordfit26.js).
 *
 * 고룡(땅 단계 0)은 여기서 풀지 않는다 — tools/dragon2.js 로 따로 본다.
 */
const fs = require('fs');
const path = require('path');

const OLD = process.env.OLD_ROOT;
if (!OLD || !fs.existsSync(path.join(OLD, 'tools', 'balance.js'))) {
  console.error('OLD_ROOT 에 옛 판(0.80.25) 저장소 사본을 주세요. 예: git worktree add /tmp/old825 <옛 커밋> 하고 그 안에서 node tools/balance-dash.js');
  process.exit(1);
}
const WRITE = process.argv.includes('--write');
const NS = Number(process.env.NS || 24);

const SETS = [
  { weapon: { warrior: 'club', ranger: 'short_bow', mage: 'gnarled_staff' }, wear: ['cloth_armor', 'cloth_gloves', 'leather_boots'], pots: [['potion', 10]] },
  { weapon: { warrior: 'iron_sword', ranger: 'hunting_bow', mage: 'apprentice_staff' }, wear: ['leather_armor', 'leather_pauldron', 'cloth_gloves', 'leather_boots', 'leather_belt', 'wood_amulet'], pots: [['potion', 20]] },
  { weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' }, wear: ['knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'swift_ring'], pots: [['greater_potion', 20]] },
  { weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' }, wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'power_ring'], pots: [['greater_potion', 30]] },
  { weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' }, wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'power_ring'], pots: [['mega_potion', 20]] },
  { weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' }, wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'], pots: [['mega_potion', 20]] },
];

/** 단계마다 얼마나 쉽게(잡몹 처치 시간 배율 f · 보스 승률을 남은 몫의 g 만큼 올린다). */
function EASE(stage) {
  if (stage <= 10) return { f: 0.7, g: 0.4 };
  // 11 ~ 14단계 — 옛 흉내에서 가장 오래 막히던 벽(발가르 뒤 강화된 들판). 승률을 남은 몫의 절반만큼 올린다
  if (stage <= 14) return { f: 0.8, g: 0.5 };
  if (stage < 20) {
    const k = (stage - 15) / 5; // 15 → 0 … 19 → 0.8
    return { f: 0.85 + 0.1 * k, g: 0.2 - 0.15 * k };
  }
  return { f: 1, g: 0 };
}

(async () => {
  const BN = require('./balance.js');
  const BO = require(path.join(OLD, 'tools', 'balance.js'));
  const here = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  const GN = BN.loadFrom('src');
  process.chdir(OLD);
  const GO = BO.loadFrom('src');
  process.chdir(here);
  const CSN = await import(path.join(__dirname, '..', 'src', 'systems', 'CombatSystem.js'));
  const CSO = await import(path.join(OLD, 'src', 'systems', 'CombatSystem.js'));
  const FN = await import(path.join(__dirname, '..', 'src', 'data', 'formulas.js'));
  const sim = require(path.join(OLD, 'tools', 'balance-page', 'sim.js'));
  const D = path.join(OLD, 'dist', 'balance');
  const R = (n) => JSON.parse(fs.readFileSync(path.join(D, n + '.json'), 'utf8'));
  const rows = sim(R('battle'), R('targets'), R('tdrops'), R('sets'), R('items'), R('quests'), R('consts'));
  const classes = ['warrior', 'ranger', 'mage'];

  // ── ① 사냥터마다 그곳에 선 몸(흉내가 안 들른 단계는 앞뒤에서 잇는다) ─────
  const refs = {};
  for (const cls of classes) {
    const mine = rows.filter((r) => r.class === cls && r.act_stage);
    const seen = {};
    for (const st of [...new Set(mine.map((r) => r.act_stage))]) {
      const at = mine.filter((r) => r.act_stage === st);
      const mid = at[Math.floor(at.length / 2)];
      seen[st] = { L: mid.level, set: mid.set, enh: Math.round(mid.enh) };
    }
    const known = Object.keys(seen).map(Number).sort((a, b) => a - b);
    for (let st = 1; st <= 25; st++) {
      let ref = seen[st];
      if (!ref) {
        const lo = known.filter((k) => k < st).pop();
        const hi = known.find((k) => k > st);
        const a = seen[lo] || seen[hi];
        const b = seen[hi] || seen[lo];
        const t = lo != null && hi != null ? (st - lo) / (hi - lo) : 0;
        ref = { L: Math.round(a.L + (b.L - a.L) * t), set: a.set, enh: a.enh };
      }
      (refs[st] ||= []).push({ cls, ...ref });
    }
  }

  // ── 사냥감(옛 배율 그대로가 출발점) ─────────────────────
  const mapsO = GO['maps.json'].maps;
  const mons = GN['monsters.json'];
  const stageMaps = Object.entries(mapsO).filter(([, m]) => m.stage > 0).sort((a, b) => a[1].stage - b[1].stage);
  const targets = [];
  for (const [id, m] of stageMaps) {
    const list = [...(m.monsters || []).map((mid) => ['trash', mid]), ...(m.boss ? [['boss', m.boss]] : [])];
    for (const [kind, mid] of list) {
      const d = mons[mid];
      if (!d) continue;
      const mult = FN.stageMult(m, kind === 'boss') || { hp: 1, def: 1, atk: 1 };
      targets.push({ map: id, stage: m.stage, kind, name: d.name, def: d, mapDef: m, mult, stats: FN.scaleMonsterStats(d.stats, m.power || 1, mult) });
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
    return {
      stock: SETS[si].pots.filter(([id]) => items[id] && items[id].use)
        .map(([id, count]) => ({ id, name: id, heal: items[id].use.hp || 0, healPct: items[id].use.hpPct || 0, healMax: items[id].use.hpMax || 0, count })),
      threshold: 0.7, cooldownMs: 2000,
    };
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
  const FIELD = FN.BALANCE.FIELD.ACTION_GAP;

  // ── ②③ 풀기 ─────────────────────────────────────────────
  const out = [];
  for (const s of [...new Set(targets.map((t) => t.stage))]) {
    const ts = targets.filter((t) => t.stage === s);
    const rs = refs[s] || [];
    const bs = rs.map((r) => ({
      ...r,
      ob: bestBody(BO, GO, CSO, r.cls, r.L, r.set, r.enh, ts, FIELD),
      nb: bestBody(BN, GN, CSN, r.cls, r.L, r.set, r.enh, ts, FIELD),
    }));
    const gm = (a) => Math.exp(a.reduce((x, v) => x + Math.log(v), 0) / a.length);
    const kA = gm(bs.map((b) => b.nb.stats.atk / b.ob.stats.atk));
    const kH = gm(bs.map((b) => b.nb.stats.hp / b.ob.stats.hp));
    const ease = EASE(s);
    for (const kind of ['trash', 'boss']) {
      const g = ts.filter((t) => t.kind === kind);
      if (!g.length) continue;
      const gap = kind === 'boss' ? null : FIELD;
      let ow = 0, oms = 0, n = 0;
      for (const b of bs) for (const t of g) { const r = fight(CSO, GO, b.ob, b.cls, b.L, b.set, foeOf(t), NS, gap); ow += r.w; oms += r.ms; n++; }
      ow /= n; oms /= n;
      // 보스는 승률로(늘 이기면 시간으로), 잡몹은 시간으로(자주 지는 땅이면 승률로)
      const byWin = kind === 'boss' ? ow > 0.02 && ow < 0.98 : ow < 0.9;
      const wantW = Math.min(0.99, ow + (1 - ow) * ease.g);
      let wantMs = oms * ease.f;
      const evalC = (c) => {
        let w = 0, ms = 0;
        const k = { hp: kA * c, def: kA * c, atk: kH * c };
        for (const b of bs) for (const t of g) {
          const r = fight(CSN, GN, b.nb, b.cls, b.L, b.set, foeOf(t, k), NS, gap);
          w += r.w; ms += r.ms;
        }
        return { w: w / n, ms: ms / n };
      };
      // 한 대에 눕는 상대는 더 빨리 잡을 수 없다 — 닿을 수 있는 가장 짧은 시간보다 조금 길게 잡는다
      //   (안 그러면 c 가 바닥까지 내려가 몬스터가 종이가 된다)
      if (!byWin) {
        const floor = evalC(0.05).ms; // 가장 약하게 만들었을 때의 시간(그보다 빨리는 못 잡는다)
        if (wantMs < floor * 1.03) wantMs = floor * 1.03;
      }
      let lo = Math.log(0.05), hi = Math.log(10), c = 1, got = null;
      for (let it = 0; it < 16; it++) {
        const mid = (lo + hi) / 2;
        const r = evalC(Math.exp(mid));
        // 시간으로 맞출 때도 **지면 안 된다** — 몬스터가 너무 세져 내가 빨리 쓰러지면 판이 짧아져 '빠르다' 로 읽힌다
        const easier = byWin ? r.w > wantW : r.ms < wantMs && r.w >= Math.min(0.9, ow - 0.05);
        if (easier) lo = mid; else hi = mid;
      }
      c = Math.exp(lo);
      got = evalC(c);
      const m0 = g[0].mult;
      const f = {
        stage: s, kind, map: g[0].map, names: g.map((t) => t.name).join(' · '), kA: +kA.toFixed(3), kH: +kH.toFixed(3), c: +c.toFixed(3),
        hp: +(m0.hp * kA * c).toFixed(3), def: +(m0.def * kA * c).toFixed(3), atk: +(m0.atk * kH * c).toFixed(3),
        old: { hp: m0.hp, def: m0.def, atk: m0.atk },
        win_old: +ow.toFixed(3), win_want: +wantW.toFixed(3), win_new: +got.w.toFixed(3),
        ms_old: Math.round(oms), ms_want: Math.round(wantMs), ms_new: Math.round(got.ms), by: byWin ? 'win' : 'time',
        bodies: bs.map((b) => `${b.cls[0]}L${b.L}s${b.set}+${b.enh}`).join(' '),
      };
      out.push(f);
      console.log(`${String(s).padStart(2)} ${kind.padEnd(5)} ${f.names.slice(0, 18).padEnd(18)} kA ${f.kA} kH ${f.kH} c ${f.c} → hp×${f.hp}(${m0.hp}) atk×${f.atk}(${m0.atk})`
        + `  승률 ${Math.round(ow * 100)}→${Math.round(got.w * 100)}(목표 ${Math.round(wantW * 100)})  시간 ${(oms / 1000).toFixed(1)}→${(got.ms / 1000).toFixed(1)}s(목표 ${(wantMs / 1000).toFixed(1)}) (${f.by})  ${f.bodies}`);
    }
  }
  const dest = path.join(__dirname, '..', 'dist', 'balance', 'rescale26.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 1));
  console.log(`✓ ${path.relative(process.cwd(), dest)}`);
  if (WRITE) {
    const r3 = (v) => Math.round(v * 1000) / 1000;
    for (const p of [path.join(__dirname, '..', 'src', 'data', 'maps.json'), path.join(__dirname, '..', 'server', 'content', 'maps.json')]) {
      if (!fs.existsSync(p)) continue;
      let text = fs.readFileSync(p, 'utf8');
      const M = JSON.parse(text);
      for (const f of out) {
        const m = M.maps[f.map];
        if (!m) continue;
        const v = { hp: r3(f.hp), def: r3(f.def), atk: r3(f.atk) };
        if (f.kind === 'boss') m.bossMult = v; else m.mult = v;
      }
      fs.writeFileSync(p, JSON.stringify(M, null, 2) + '\n');
      console.log(`✓ ${path.relative(path.join(__dirname, '..'), p)} 의 mult · bossMult 에 적었습니다`);
    }
  }
})();
