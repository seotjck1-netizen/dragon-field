#!/usr/bin/env node
/**
 * 밸런스 대시보드의 자료를 만든다 (0.70.39 — 두 번째 판: 보스 · 의뢰 · 장비 · 강화까지 도는 성장 흉내).
 *
 *   node tools/balance-dash.js                 지금 표(src/data)로
 *   node tools/balance-dash.js sheets          sheets/*.csv(구글 시트에서 받아 온 것)로
 *   node tools/balance-dash.js --n 10          칸마다 판 수(기본 12)
 *   node tools/balance-dash.js --quick         시험용 — 레벨 몇 개만
 *   → dist/balance/*.json   (targets · tdrops · sets · items · quests · battle · consts)
 *
 * ── 왜 다시 짰나 ────────────────────────────────────────────
 * 첫 판은 "레벨마다 그쯤 갖췄을 장비" 를 정해 두고 잡몹만 잡게 했다. 그러면 만렙까지 55~139시간이 나왔다.
 * 실제로는 **한 시간이면 Lv.45 · 모든 장비 +10, 두 시간이면 +15 한 벌**이었다(사용자가 0.70.38 에서 직접 잰 값).
 * 빠진 것이 셋이었다(0.70.38 기준):
 *   ① 보스는 1분마다 다시 섰다(MapSystem.BOSS_RESPAWN_MS). 같은 보스를 되풀이해 잡는다.
 *   ② 경험치의 레벨 차 보정(formulas.expReward)에 **위쪽 천장이 없었다** — 나보다 30레벨 높은 놈은 4.6배.
 *   ③ 보스가 떨구는 골드 · 재료 · 보석으로 장비를 사고 강화한다 → 더 센 보스 → 더 많은 경험치.
 * 그래서 이제 **사람을 흉내 낸다**: 1분마다 가장 빨리 크는 사냥(잡몹 · 보스)을 고르고, 번 것으로
 * 장비를 사고 강화 · 초월하고, 의뢰를 차례로 끝낸다. 그 흉내는 tools/balance-page/sim.js 에 있고(대시보드 페이지 안에서도
 * 그대로 돈다), 여기서는 그 흉내가 쓸 **전투 결과 표**를 게임의 진짜 전투 계산기로 만든다.
 * 이 흉내로 재 보고 0.70.39 에서 ① 5분 ② 천장 2배로 묶었다(tests/balance.js 가 못 박는다).
 * 대시보드는 0.70.38 값(OLD_*)으로도 한 번 더 돌려 회색 선으로 겹친다.
 *
 * ── battle 표 ──────────────────────────────────────────────
 * 직업 셋 × 레벨 1~50 × 장비 한 벌 6가지 × 강화 0·4·7·10·12·15 마다, 사냥감(사냥터별 잡몹 · 보스) 전부와
 * n판씩(씨앗 1~n) 싸운 승률 · 한 판 시간(연출 1배속, 0.1초). 그 몸의 전투력 · 공격력 · 체력 · 방어력도 함께 적는다.
 * 몸은 tools/balance.js 의 statsOf(스킬은 직업의 첫 순서), 가방은 그 한 벌을 입을 무렵의 회복약이다.
 * 씨앗이 정해져 있으므로 같은 표에서는 늘 같은 결과가 나온다.
 */
const fs = require('fs');
const path = require('path');
const B = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'balance');
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const N = arg('n', 12);
// 0.80.20 — C 규칙: +10 이 끝이고 +7 부터 가파르다. 흔한 끝은 +9.
const ENH = [0, 4, 7, 8, 9, 10];
// 0.80.20 — 상점은 이제 일반 장비만 판다(장비는 드롭 · 도박 상자로 얻는다). 그래도 흉내는 수정안과 같게
//   "한 벌 사다리를 옛 값으로 산다" 로 둔다 — 드롭 · 상자로 그 한 벌을 갖추는 시점의 근사다
//   (docs/SPEC-0.80.md 「어떻게 쟀나」: 장비를 얻는 시점은 지금 한 벌 사다리를 그대로 썼다).
const LADDER_SHOP = {
  poino: ['wooden_sword', 'short_bow', 'gnarled_staff', 'cloth_armor', 'cloth_hood', 'cloth_gloves', 'leather_boots', 'leather_belt', 'wood_amulet',
    'iron_sword', 'leather_armor', 'leather_cap', 'leather_pauldron', 'hunting_bow', 'apprentice_staff', 'dragon_helm', 'dragon_mail', 'dragon_pauldron'],
  castle: ['magic_helm', 'useless_sword', 'frost_blade', 'storm_bow', 'ember_staff', 'rune_mail', 'rune_helm', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet'],
};
const QUICK = process.argv.includes('--quick');        // 시험용 — 레벨 몇 개만
// 보스 전투 화면에서 Shift(4배)를 누르고 본다고 친다 — 익숙한 사람은 그렇게 본다
const BOSS_SHIFT = 4;

// 장비 한 벌의 사다리 — balance.js 의 GEAR 단계와 같은 물건들
const SETS = [
  { name: '처음 장비', weapon: { warrior: 'club', ranger: 'short_bow', mage: 'gnarled_staff' },
    wear: ['cloth_armor', 'cloth_gloves', 'leather_boots'], pots: [['potion', 10]], potion: '회복약 10' },
  { name: '강철 · 가죽', weapon: { warrior: 'iron_sword', ranger: 'hunting_bow', mage: 'apprentice_staff' },
    wear: ['leather_armor', 'leather_pauldron', 'cloth_gloves', 'leather_boots', 'leather_belt', 'wood_amulet'], pots: [['potion', 20]], potion: '회복약 20' },
  { name: '화염 · 기사', weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' },
    wear: ['knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'swift_ring'], pots: [['greater_potion', 20]], potion: '희귀 회복약 20' },
  { name: '용린', weapon: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff' },
    wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'power_ring'], pots: [['greater_potion', 30]], potion: '희귀 회복약 30' },
  { name: '룬', weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' },
    wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'power_ring'], pots: [['mega_potion', 20]], potion: '거대 회복약 20' },
  { name: '룬 + 용의 인장', weapon: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff' },
    wear: ['rune_helm', 'rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'], pots: [['mega_potion', 20]], potion: '거대 회복약 20' },
];
// 한 벌 말고도 흉내가 값을 알아야 하는 것 — 회복약 · 강화 재료
const EXTRA_ITEMS = ['potion', 'herb', 'magic_stone', 'greater_potion', 'demon_core', 'mega_potion'];

(async () => {
  const t0 = Date.now();
  const G = B.loadFrom(process.argv[2] === 'sheets' ? 'sheets' : 'src');
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const F = await import('../src/data/formulas.js');
  const MS = await import('../src/systems/MapSystem.js');
  const MAXL = F.BALANCE.MAX_LEVEL;
  const mons = G['monsters.json'];
  const maps = G['maps.json'].maps;
  const items = G['items.json'];
  const npcs = G['npcs.json'];
  const classes = Object.entries(G['classes.json'].list).filter(([, c]) => c.available !== false).map(([k]) => k);

  // ── 사냥감 ───────────────────────────────────────────────
  // 들어가는 조건 — 그 맵으로 가는 포탈에 적힌 보스(requireBossOf) · 레벨(requireLevel)
  const gate = {};
  for (const m of Object.values(maps)) {
    for (const p of m.portals || []) {
      if (!p.to || !maps[p.to]) continue;
      const g = gate[p.to] || (gate[p.to] = {});
      if (p.requireBossOf) g.boss = (maps[p.requireBossOf] || {}).boss || null;
      if (p.requireLevel) g.level = Math.max(g.level || 0, p.requireLevel);
    }
  }
  // 게임과 같은 배율(main.js fieldMonsterDef · formulas.scaleMonsterStats)
  const scaled = (mid, m, boss = false) => {
    const d = mons[mid];
    const power = m.power || 1;
    return {
      ...d,
      level: d.level + (m.levelBonus || 0),
      // 0.80.20 — 땅의 몬스터 배율(maps.json 의 mult · bossMult)
      stats: F.scaleMonsterStats(d.stats, power, F.stageMult(m, boss)),
      exp: Math.round(d.exp * power),
      gold: Math.round(d.gold * power),
    };
  };
  const stageMaps = Object.entries(maps).filter(([, m]) => m.stage > 0).sort((a, b) => a[1].stage - b[1].stage);
  const targets = [];
  let dungeonLevel = 0;                        // 지하감옥은 아래층도 들어가는 문(Lv.40)을 그대로 이어받는다
  for (const [id, m] of stageMaps) {
    const g = gate[id] || {};
    let level = g.level || 0;
    if (m.dungeon) { dungeonLevel = Math.max(dungeonLevel, level); level = dungeonLevel; }
    const list = [...(m.monsters || []).map((mid) => ['trash', mid]), ...(m.boss ? [['boss', m.boss]] : [])];
    for (const [kind, mid] of list) {
      if (!mons[mid]) continue;
      const s = scaled(mid, m, kind === 'boss');
      targets.push({
        idx: targets.length, tid: `${id}:${mid}`, kind, map: id, stage: m.stage, map_name: m.name, mon: mid, name: s.name,
        level: s.level, exp: s.exp, gold: s.gold, hp: s.stats.hp, atk: s.stats.atk, def: s.stats.def, cp: F.combatPower(s.stats),
        gate_boss: g.boss || '', gate_level: level,
        // 맵이 따로 정해 둔 보스 되살아남(초)만 적는다. 0 이면 기본값(MapSystem.BOSS_RESPAWN_MS — 대시보드 바꿔 보기 칸)
        dungeon: !!m.dark, respawn_s: kind === 'boss' && m.bossRespawnMs ? m.bossRespawnMs / 1000 : 0,
        _def: s, _mapDef: m,
      });
    }
  }

  // ── 떨어지는 것(한 마리당 기댓값 = 확률 × 평균 개수) ─────────────
  const dropTable = (G['drops.json'] || {})['표'] || {};
  const tdrops = [];
  for (const t of targets) {
    const sum = new Map();
    for (const [item, chance, lo, hi] of dropTable[t.mon] || []) {
      sum.set(item, (sum.get(item) || 0) + chance * (lo + hi) / 2);
    }
    for (const [item, v] of sum) {
      const d = items[item] || {};
      tdrops.push({ tid: t.tid, item, item_name: d.name || item, type: d.type || '', rarity: d.rarity || '', price: d.price || 0, per_kill: +v.toFixed(4) });
    }
  }

  // ── 한 벌 · 물건 · 의뢰 ─────────────────────────────────────
  const sets = SETS.map((s, i) => ({ set: i, name: s.name, weapon_warrior: s.weapon.warrior, weapon_ranger: s.weapon.ranger, weapon_mage: s.weapon.mage, wear: s.wear.join(','), potion: s.potion }));
  const shopOf = (id) => LADDER_SHOP.poino.includes(id) ? 'poino' : LADDER_SHOP.castle.includes(id) ? 'castle' : '';
  const itemIds = [];
  for (const s of SETS) for (const id of [s.weapon.warrior, s.weapon.ranger, s.weapon.mage, ...s.wear]) if (!itemIds.includes(id)) itemIds.push(id);
  for (const id of EXTRA_ITEMS) if (!itemIds.includes(id)) itemIds.push(id);
  const itemRows = itemIds.filter((id) => items[id]).map((id) => {
    const d = items[id];
    return { item: id, name: d.name, type: d.type, slot: d.slot || '', rarity: d.rarity || '', price: d.price || 0, shop: shopOf(id), enhanceable: !!d.enhanceable };
  });
  const qt = (G['quests.json'] || {})['표'] || [];
  const quests = qt.map((r, i) => ({
    order: i, id: r[0], title: r[1], kind: r[2], target: r[3], count: r[4], exp: r[5], gold: r[6], item: r[7] || '', qty: r[8] || 0,
    level: r[10] || 0, picks: (r[11] || []).join(','), open: r[12] || '',
  }));

  // ── 전투 결과 표 ───────────────────────────────────────────
  const levels = QUICK ? [1, 10, 20, 30, 40, 50] : Array.from({ length: MAXL }, (_, i) => i + 1);
  const potionsOf = (si) => ({
    stock: SETS[si].pots.filter(([id]) => items[id] && items[id].use && items[id].use.hp).map(([id, count]) => ({ id, name: items[id].name, heal: items[id].use.hp, count })),
    threshold: 0.7, cooldownMs: 2000,
  });
  const foe = targets.map((t) => {
    const m = t._def, mapDef = t._mapDef;
    const magicPart = t.kind === 'boss' && mapDef.bossMagicPart != null ? mapDef.bossMagicPart : mapDef.magicPart || 0;
    return {
      name: m.name, level: m.level, ...m.stats, maxHp: m.stats.hp, magicPart,
      rage: Number(m.rage) > 0 ? Number(m.rage) : 0,
      magicResist: Number(m.magicResist) > 0 ? Number(m.magicResist) : 0,
      school: m.school || 'physical',
      _boss: t.kind === 'boss',
    };
  });
  // 스킬은 직업마다 **가장 잘 버티는 순서** — 레벨마다 balance.js 의 PLANS 후보를 모두 돌려,
  // 한 벌 여섯 × 강화 여섯 × 사냥감 전부에서 이긴 판이 가장 많은 순서를 쓴다(사람은 해 보고 잘 되는 쪽으로 찍는다).
  const battle = [];
  for (const cls of classes) {
    const traits = G['classes.json'].list[cls].combat;
    const plans = Math.max(1, (B.PLANS[cls] || []).length);
    for (const L of levels) {
      let best = null;
      for (let pi = 0; pi < plans; pi++) {
        const rows = [];
        let wins = 0;
        for (let si = 0; si < SETS.length; si++) {
          const s = SETS[si];
          const gear = { warrior: s.weapon.warrior, ranger: s.weapon.ranger, mage: s.weapon.mage, wear: s.wear };
          const potions = potionsOf(si);
          for (const enh of ENH) {
            const { stats, mods, weaponShape } = B.statsOf(G, cls, L, enh, null, gear, pi);
            const w = [], ms = [];
            for (const monster of foe) {
              let win = 0, dur = 0;
              // 0.80.20 — 잡몹은 필드(350ms 박자 · 빨리 보기 없음), 보스는 전투 화면(620ms · Shift 4배).
              //   표의 시간은 **사람이 실제로 보내는 시간**으로 적는다 — 그래서 BATTLE_SPEED 는 1 이다.
              const isBossFoe = monster._boss;
              for (let seed = 1; seed <= N; seed++) {
                const r = simulateBattle({
                  player: { name: 'p', level: L, ...stats, maxHp: stats.hp, weaponShape },
                  monster, seed, playerMods: mods, playerTraits: traits, potions,
                  gapMs: isBossFoe ? null : F.BALANCE.FIELD.ACTION_GAP,
                });
                if (r.winner === 'player') win++;
                dur += (r.duration || 0) / (isBossFoe ? BOSS_SHIFT : 1);
              }
              wins += win;
              w.push(Math.round((win / N) * 100));
              ms.push(Math.round(dur / N / 100));
            }
            rows.push({
              class: cls, level: L, set: si, enh, cp: F.combatPower(stats, mods),
              atk: Math.round(stats.atk), hp: Math.round(stats.hp), def: Math.round(stats.def),
              gold_find: +(mods.goldFind || 0).toFixed(3), material_double: +(mods.materialDouble || 0).toFixed(3),
              w: w.join(','), ms: ms.join(','),
            });
          }
        }
        if (!best || wins > best.wins) best = { wins, rows };
      }
      battle.push(...best.rows);
    }
  }

  // ── 상수 — 게임의 값과 흉내의 가정(대시보드 '수치 바꿔 보기' 칸이 여기서 시작한다) ──
  const BAL = F.BALANCE;
  const consts = [
    ['EXP_BASE', BAL.EXP_BASE, '1레벨에서 2레벨로 갈 때 필요한 경험치', 'formulas.js'],
    ['EXP_GROWTH', BAL.EXP_GROWTH, '레벨마다 필요 경험치가 몇 배씩 느는가', 'formulas.js'],
    ['EXP_GAIN', BAL.EXP_GAIN, '몬스터 경험치 눈금', 'formulas.js'],
    ['BOSS_EXP_GAIN', BAL.BOSS_EXP_GAIN, '보스 경험치 눈금(EXP_GAIN 위에 곱한다)', 'formulas.js'],
    ['QUEST_EXP_GAIN', BAL.QUEST_EXP_GAIN, '의뢰 경험치 눈금', 'formulas.js'],
    ['GAP_STEP', BAL.EXP_GAP_STEP, '레벨 차 1마다 경험치가 바뀌는 몫(formulas.expReward)', 'formulas.js'],
    ['GAP_MIN', BAL.EXP_GAP_MIN, '나보다 낮은 몬스터 경험치의 바닥 배율', 'formulas.js'],
    ['GAP_MAX', BAL.EXP_GAP_MAX, '나보다 높은 몬스터 경험치의 천장 배율', 'formulas.js'],
    ['MAX_LEVEL', MAXL, '최고 레벨', 'formulas.js'],
    ['BOSS_RESPAWN_S', MS.BOSS_RESPAWN_MS / 1000, '보스가 다시 서기까지(초)', 'MapSystem.js'],
    ['ENH_COST_BASE', BAL.ENHANCE_COST_BASE, '강화 골드 — 시작값', 'formulas.js'],
    ['ENH_COST_GROWTH', BAL.ENHANCE_COST_GROWTH, '강화 골드 — 단계마다 몇 배', 'formulas.js'],
    ['GEM_PRICE', BAL.GEM_GAMBLE_PRICE, '보석 노인 — 무작위 보석 한 알 값', 'formulas.js'],
    ['SELL_RATE', BAL.SELL_RATE, '상점에 팔 때 받는 몫(떨어진 장비를 판다)', 'formulas.js'],
    ['GOLD_MULT', 1, '골드 배율(바꿔 보기)', '대시보드'],
    ['DROP_MULT', 1, '떨어지는 것 배율(바꿔 보기)', '대시보드'],
    ['BATTLE_SPEED', 1, '전투 보는 속도 — 0.80.20 부터 표의 시간이 이미 실제 시간이다(잡몹 필드 350ms · 보스 전투 화면 Shift 4배). 1 그대로', '대시보드'],
    ['TRAVEL_S', +(5 / BAL.MOVE_SPEED_BASE).toFixed(2), '한 마리 잡고 다음 몬스터까지 걷는 시간(초) — 가정(5초 ÷ 이동 1.2배)', '대시보드'],
    ['DEATH_S', 30, '지면 잃는 시간(초) — 가정', '대시보드'],
    ['TOWN_S', 30, '마을에 들러 사고 강화하는 데 드는 시간(초) — 가정', '대시보드'],
    ['TOWN_EVERY', 10, '마을에 들르는 간격(분) — 더 좋은 한 벌을 살 돈이 생기면 곧바로 — 가정', '대시보드'],
    ['WARP_S', 20, '웨이포인트로 다른 사냥터에 다녀오는 한 번(초) — 보스를 기다리는 동안 — 가정', '대시보드'],
    ['MIN_WIN', 0.8, '잡몹 사냥터로 고르는 최소 승률', '대시보드'],
    ['BOSS_MIN_WIN', 0.25, '보스를 되풀이해 잡으러 가는 최소 승률(져도 다시 붙는다 — 진 시간은 셈에 든다)', '대시보드'],
    ['QUEST_MAX_MIN', 8, '의뢰 하나에 따로 들일 수 있는 시간(분) — 넘으면 미룬다', '대시보드'],
    ['START_GOLD', G['player.json'].startGold || 0, '처음 골드', 'player.json'],
    // 사용자가 0.70.38 에서 직접 잰 값 — 흉내와 견주는 눈금. 흉내의 입력이 아니다.
    ['OBS_L45_MIN', 60, '사용자가 잰 값(0.70.38) — Lv.45 이상까지(분)', '사용자'],
    ['OBS_ENH10_MIN', 60, '사용자가 잰 값(0.70.38) — 모든 장비 +10 이상까지(분)', '사용자'],
    ['OBS_ENH15_MIN', 120, '사용자가 잰 값(0.70.38) — +15 한 벌까지(분)', '사용자'],
    // 바꾸기 전(0.70.38) 값 — 대시보드가 지금 값과 나란히 한 번 더 돌려 견준다.
    ['OLD_GAP_MAX', 99, '0.70.38 값 — 레벨 차 경험치 천장(99 = 사실상 없음)', '0.70.38'],
    ['OLD_BOSS_RESPAWN_S', 60, '0.70.38 값 — 보스가 다시 서기까지(초)', '0.70.38'],
    ['SIM_MINUTES', 1440, '흉내 낼 시간(분) — 하루', '대시보드'],
  ].map(([key, value, label, from]) => ({ key, value, label, from }));
  const fixed = [
    ['ENH_STEPS', ENH.join(','), '전투 표를 잰 강화 단계'],
    ['SAMPLES', N, '전투 표 칸마다 판 수'],
    ['ENHANCE_CHANCE', BAL.ENHANCE_CHANCE_TABLE.join(','), '강화 성공 확률(+0→+1 …)'],
    ['TRANSCEND_CHANCE', BAL.TRANSCEND_CHANCE.join(','), '초월 성공 확률(+10→+11 …)'],
    ['ENHANCE_MAX', BAL.ENHANCE_MAX, '강화 최고'],
    ['TRANSCEND_MAX', BAL.TRANSCEND_MAX, '초월 최고(0.80.20 — 강화 최고와 같다 = 초월 없음)'],
    // 0.80.20 C 규칙의 기대 비용 — +e → +e+1 한 단계를 올리는 데 드는 골드 · 재료(+8 부터 실패하면 −1 을 넣어서)
    ['ENH_EXP_GOLD', enhExp((e) => BAL.ENHANCE_COST_BASE * Math.pow(BAL.ENHANCE_COST_GROWTH, e)).join(','), 'C 규칙 기대 골드(+0→+1 …)'],
    ['ENH_EXP_MAT', enhExp((e) => 1 + Math.floor(e / 2)).join(','), 'C 규칙 기대 재료(+0→+1 …)'],
  ].map(([key, value, label]) => ({ key, value, label, from: '표의 눈금' }));

  /** C 규칙 — 한 단계 기대 비용. c[e] = (a[e] + (1 − p) · c[e−1]) / p (내려가는 단계), 아니면 a[e] / p */
  function enhExp(costOf) {
    const out = [];
    for (let e = 0; e < BAL.ENHANCE_MAX; e++) {
      const p = BAL.ENHANCE_CHANCE_TABLE[e] || BAL.ENHANCE_MIN_CHANCE;
      const falls = e + 1 >= 8 && e > 0;
      const c = falls ? (costOf(e) + (1 - p) * out[e - 1]) / p : costOf(e) / p;
      out.push(+c.toFixed(2));
    }
    return out;
  }

  // ── 쓰기 ──────────────────────────────────────────────────
  fs.mkdirSync(OUT, { recursive: true });
  const write = (name, rows) => {
    const text = JSON.stringify(rows);
    fs.writeFileSync(path.join(OUT, name), text);
    console.log(`  ✓ ${name}  ${rows.length}줄 · ${Math.round(Buffer.byteLength(text) / 1024)}KB`);
  };
  write('targets.json', targets.map(({ _def, _mapDef, ...t }) => t));
  write('tdrops.json', tdrops);
  write('sets.json', sets);
  write('items.json', itemRows);
  write('quests.json', quests);
  write('battle.json', battle);
  write('consts.json', [...consts, ...fixed]);
  console.log(`  표본 ${N}판 · ${Math.round((Date.now() - t0) / 1000)}초`);
})();
