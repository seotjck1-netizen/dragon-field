#!/usr/bin/env node
/**
 * 두 번째 고룡(아그라모스)이 잡을 수 있는 상대인지 본다.
 *
 *   node tools/dragon2.js [--n 30]
 *
 * ── 왜 따로 도구가 필요한가 ────────────────────────────────
 * tools/balance.js 는 **평소 사냥**을 재는 도구다. 그래서 조건부 세트 효과
 * (용린 4세트 — 고룡과 싸울 때만 힘·민첩·지능 +100 · 피해 2배)를 일부러 끈다.
 * 그런데 이 싸움은 **그 효과를 켜고 하는 싸움**이다. 끈 채로 재면 0% 가 나오고,
 * "잡을 수 없는 상대" 라는 잘못된 결론이 난다.
 *
 * 여기서는 용린 한 벌을 갖춘 몸으로, 그 효과를 켜고 잰다.
 * 함께 재는 것:
 *   · 용린을 안 갖춘 몸(룬 한 벌)으로도 붙어 보게 — 세트가 정말 필요한지
 *   · 지하감옥 5층 보스와의 전투력 비율 — "두 배" 가 지켜지는지
 */
const path = require('path');
const { loadFrom, statsOf, potionsOf } = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const argN = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const SAMPLES = argN('n', 30);
const CLASSES = ['warrior', 'ranger', 'mage'];

// 용린 한 벌을 갖춘 만렙. 무기는 직업마다 다르다(검·활·지팡이).
const DRAGON_WEAPON = {
  warrior: 'dragon_knight_sword',
  ranger: 'dragon_knight_bow',
  mage: 'dragon_knight_staff',
};
const DRAGON_WEAR = ['dragon_helm', 'dragon_mail', 'dragon_pauldron',
  'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'];

// 만렙에서 직업이 갖는 힘·민첩·지능. 배율을 걸려면 "지금 몇 점인가" 를 알아야 한다.
// (tools/balance.js 의 buildStatRanks 가 만드는 값과 같다)
let RANKS = {};

(async () => {
  const G = loadFrom(path.join(ROOT, 'src', 'data'));
  {
    const growth = G['classes.json'].list;
    for (const c of CLASSES) {
      const g = (growth[c] || {}).statGrowth || {};
      const r = {};
      for (const [name, every] of Object.entries(g)) {
        r[name] = every > 0 ? Math.floor(50 / every) : 0;
      }
      RANKS[c] = r;
    }
  }
  const F = await import('../src/data/formulas.js');
  const { computeMonsterStats } = await import('../src/entities/StatBlock.js');
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const { createRng } = await import('../src/core/Rng.js');

  const maps = G['maps.json'].maps;
  const mons = G['monsters.json'];
  const pw = (id, mapId) =>
    F.combatPower(F.scaleMonsterStats(computeMonsterStats(mons[id]), maps[mapId].power || 1));

  const lord = pw('dungeon_lord', 'dungeon_5');
  const elder = pw('elder_dragon', 'dragon_lair');
  const karnak = pw('great_dragon', 'west_cliff');

  console.log('');
  console.log('  두 번째 고룡 — 잡을 수 있는 상대인가');
  console.log('  ' + '─'.repeat(70));
  console.log(`  지하감옥 5층 보스   ${lord.toLocaleString().padStart(12)}`);
  console.log(`  고룡 카르나크       ${karnak.toLocaleString().padStart(12)}  (${(karnak / lord).toFixed(2)}배)`);
  console.log(`  아그라모스          ${elder.toLocaleString().padStart(12)}  (${(elder / lord).toFixed(2)}배 · 목표 2배)`);
  console.log('');

  /** 한 판에 상대의 체력을 몇 % 깎는가(세트 효과를 켜고/끄고). */
  const chip = async (cls, gear, withSet) => {
    const { stats, mods } = statsOf(G, cls, 50, 10, 20, gear);
    const m = { ...mods };
    if (withSet) {
      // 용린 4세트 — 고룡과 싸울 때만 켜지는 몫.
      // affixes.json 의 그 줄과 같은 값이어야 한다(한쪽만 고치면 이 도구가 거짓말을 한다).
      // ⚠ **이 상대에게 걸리는 줄**을 골라야 한다.
      //    0.38 부터 고룡마다 줄이 따로 있다(카르나크는 +100 점, 아그라모스는 +200%).
      //    그냥 첫 줄을 쓰면 카르나크의 값으로 아그라모스를 재게 되어,
      //    "200% 로 올렸는데 왜 그대로지" 라는 잘못된 결론이 난다.
      const table = (G['affixes.json'] || {})['세트'] || {};
      const step = ((table.dragonscale || {})['효과'] || []).find(
        (r) => !Array.isArray(r) && Array.isArray(r['상대']) && r['상대'].includes('elder_dragon')
      );
      if (step) {
        for (const [k, v] of Object.entries(step['보정'] || {})) m[k] = (m[k] || 0) + v;
        const nodes = (G['stats.json'] || {}).nodes || {};
        // 힘·민첩·지능이 몇 점이 되는지 먼저 셈한 뒤, 그 차이만큼만 얹는다.
        // (SkillSystem 의 effectiveTraits 와 같은 순서 — 더하기가 끝난 뒤에 곱한다)
        const base = { ...(RANKS[cls] || {}) };
        const after = { ...base };
        for (const [name, n] of Object.entries(step['특성'] || {})) {
          after[name] = (after[name] || 0) + n;
        }
        for (const [name, mul] of Object.entries(step['특성배율'] || {})) {
          after[name] = Math.round((after[name] || 0) * (1 + mul));
        }
        for (const name of Object.keys(after)) {
          const node = nodes[name];
          const d = (after[name] || 0) - (base[name] || 0);
          if (!node || !d) continue;
          for (const [k, v] of Object.entries(node.per || {})) stats[k] = (stats[k] || 0) + v * d;
          for (const [k, v] of Object.entries(node.mods || {})) m[k] = (m[k] || 0) + v * d;
        }
      }
    }
    const def = mons.elder_dragon;
    const foe = F.scaleMonsterStats(computeMonsterStats(def), maps.dragon_lair.power || 1);
    const cls0 = G['classes.json'].list[cls];
    let cut = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const res = simulateBattle({
        player: { name: '나', side: 'player', ...stats, maxHp: stats.hp },
        monsters: [{
          name: def.name, defId: 'elder_dragon', ...foe, maxHp: foe.hp,
          mood: 1, school: def.school || 'physical', rage: def.rage || 0,
        }],
        seed: 5000 + i,
        playerMods: m,
        playerTraits: cls0.combat || {},
        potions: potionsOf(G, 20),
      });
      const left = Math.max(0, (res.monstersHp || [foe.hp])[0] ?? 0);
      cut += ((foe.hp - left) / foe.hp) * 100;
    }
    return cut / SAMPLES;
  };

  // ── 한 판에 몇 % 를 깎나 ────────────────────────────────
  //
  // 이 상대는 **한 판에 눕히는 상대가 아니다.** 상처가 남으므로(bossKeepHp),
  // 물어야 할 것은 "이기나"가 아니라 "몇 번 물어뜯으면 눕나" 다.
  // 서쪽 절벽의 카르나크와 같은 방식이다.
  const full = computeMonsterStats(mons.elder_dragon).hp * (maps.dragon_lair.power || 1);
  console.log(`  한 판에 얼마나 깎이나 · 표본 ${SAMPLES}판 (체력 ${Math.round(full).toLocaleString()})`);
  const tries = [];
  for (const c of CLASSES) {
    const gear = { [c]: DRAGON_WEAPON[c], wear: DRAGON_WEAR };
    const cut = await chip(c, gear, true);
    const n = cut > 0 ? Math.ceil(100 / cut) : Infinity;
    tries.push(n);
    console.log(`    ${c.padEnd(8)} 한 판에 ${cut.toFixed(1).padStart(5)}%  →  ${
      Number.isFinite(n) ? `${n}번쯤 물어뜯으면 눕는다` : '아무리 해도 안 눕는다'}`);
  }

  console.log('');
  console.log('  용린 없이 룬 한 벌로 붙었을 때 (세트 효과 없음)');
  const bare = [];
  for (const c of CLASSES) {
    const gear = { [c]: c === 'warrior' ? 'frost_blade' : c === 'ranger' ? 'storm_bow' : 'ember_staff',
      wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'] };
    const cut = await chip(c, gear, false);
    const n = cut > 0 ? Math.ceil(100 / cut) : Infinity;
    bare.push(Number.isFinite(n) ? n : 99);
    console.log(`    ${c.padEnd(8)} 한 판에 ${cut.toFixed(1).padStart(5)}%  →  ${
      Number.isFinite(n) ? `${n}번` : '안 눕는다'}`);
  }

  const worst = Math.max(...tries);
  const worstBare = Math.max(...bare);
  console.log('');

  // ── 무엇을 지켜야 하나 ──────────────────────────────────
  //
  // 0.37 에서는 "3~20번" 을 지켰다. 0.38 에서 요청이 바뀌었다 —
  // 용린 4세트가 고룡2 앞에서 힘·민첩·지능을 +100 한 뒤 다시 200% 올려 주므로
  // **한두 판이면 눕는다.** 그게 요청("빨리 잡게 해줘")이고, 일부러 그렇게 두었다.
  //
  // 그래서 여기서 지키는 것은 판 수가 아니라 **대비**다.
  //   · 용린을 갖추면 한 시간 안에 눕는다
  //   · 용린이 없으면 사실상 못 눕힌다  ← 이 세트를 갖추라고 있는 상대이므로
  // 앞의 값이 헐해 보이더라도, 이 자리에 오기까지 치르는 것은 전투 시간이 아니라
  // 징표 열 개와 열쇠와 한 벌이다. 문턱은 준비물이지 싸움의 길이가 아니다.
  if (!Number.isFinite(worst)) {
    console.log('  ✗ 용린을 다 갖춰도 한 판에 아무것도 못 깎습니다 — 갈 수 없는 자리입니다.');
  } else if (worst > 20) {
    console.log(`  ✗ ${worst}번을 물어뜯어야 합니다 — 한 시간 안에 눕히기 어렵습니다.`);
  } else if (worstBare <= 6) {
    console.log(`  ✗ 용린 없이도 ${worstBare}번이면 눕습니다 — 세트를 갖출 이유가 없습니다.`);
  } else {
    console.log(`  ✓ 용린을 갖추면 ${Math.min(...tries)}~${worst}번, 없으면 ${
      Math.min(...bare)}~${worstBare}번. 세트가 이 싸움을 가릅니다.`);
  }
  console.log('');
  process.exit(!Number.isFinite(worst) || worst > 20 || worstBare <= 6 ? 1 : 0);
})();
