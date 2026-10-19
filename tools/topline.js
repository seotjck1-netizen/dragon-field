#!/usr/bin/env node
/**
 * **천장 몸** — 끝까지 키운 사람이 보스를 얼마나 쉽게 잡는가.
 *
 *   node tools/topline.js              지금 표로 잰다
 *   node tools/topline.js sheets       아직 안 넣은 sheets/*.csv 로 미리 잰다
 *   node tools/topline.js --n 60       표본을 늘린다(느리지만 정확)
 *
 * ── 왜 따로 있나 ──────────────────────────────────────────
 *
 * tools/balance.js 는 **바닥값**을 잰다 — 그 문 앞에 겨우 다다른 사람이다.
 * 의뢰 보상을 안 입히고, 스킬도 그 레벨에 받은 점수만 찍고, 강화는 +7~+10 이다.
 * 그 자는 "여기서 막히지는 않는가" 를 재기에 좋다.
 *
 * 그런데 **막히는지**만 재고 있으면 반대쪽이 안 보인다. 0.70.7 에 사람이
 * 세 계정(t00 용사 · t01 사냥꾼 · t02 마법사)으로 재 보니 **셋 다 30분 만에
 * 고룡 2단계까지 잡았다.** 용린 세트도 없이. 그런데 balance.js 는 같은 표를 두고
 * "지하감옥 5층 0%" 라고 말하고 있었다 — 도구가 **다른 사람**을 재고 있었던 것이다.
 *
 * 그래서 반대쪽 끝을 재는 자를 따로 둔다. 이 자가 재는 사람은:
 *   · 만렙 (formulas.BALANCE.MAX_LEVEL)
 *   · 특성·스킬을 **효율이 가장 좋은 것만** 최대치까지 (아래 TOP_PLAN)
 *   · 부위마다 그 직업이 들 수 있는 **가장 좋은 장비**
 *   · 강화 +10 · 초월까지 (ENHANCE_MAX / TRANSCEND_MAX)
 *
 * 보스의 목표 승률은 이제 **두 값 사이**로 읽는다.
 *   바닥값(balance.js)  "여기서 막히지 않는가"     — 너무 낮으면 벽
 *   천장 몸(이 도구)    "끝까지 키워도 값어치가 있는가" — 100% 면 할 일이 없다
 * 끝 보스는 천장 몸으로도 70% 를 넘지 않는 것이 좋다. 그래야 장비를 더 모을 이유가 남는다.
 */
const path = require('path');
const { loadFrom, statsOf, PLANS } = require('./balance.js');

/**
 * 천장 몸이 들고 다니는 회복약 — **가장 센 것을 넉넉히.**
 *
 * ⚠ 0.70.10 — 여기가 틀려서 용사를 통째로 잘못 재고 있었다.
 *   balance.js 의 potionsOf(20) 은 '희귀 회복약 30병'(한 병 210) 을 준다.
 *   그런데 사람이 실제로 갖고 다니는 것은 **거대 회복약 518병**(한 병 700) 이다.
 *   용사는 물약 회복량이 2배인 직업이라 이 차이가 그대로 생사로 이어진다 —
 *   같은 t00 이 5층 주인을 **100%** 로 잡는데 이 도구는 **0%** 라고 말하고 있었다.
 *   천장을 잰다면서 가방만 바닥값이었던 셈이다.
 */
function topPotions(G) {
  const items = G['items.json'];
  let best = null;
  for (const [id, d] of Object.entries(items)) {
    if (!d || !d.use || !d.use.hp) continue;
    if (!best || d.use.hp > best.heal) best = { id, name: d.name, heal: d.use.hp };
  }
  return { stock: best ? [{ ...best, count: 99 }] : [], threshold: 0.7, cooldownMs: 2000 };
}

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const where = args.includes('sheets') ? 'sheets' : 'src';
const nAt = args.indexOf('--n');
const SAMPLES = nAt >= 0 ? Number(args[nAt + 1]) || 40 : 40;

/**
 * 효율이 가장 좋은 순서. **최대치까지 채운다.**
 *
 * 무엇이 '가장 좋은가' 는 사람이 정하는 것이 아니라 재 봐서 정한다 —
 * 아래 순서는 balance.js 의 PLANS 후보들을 다 돌려 본 뒤 가장 잘 버티는 것을
 * 고르는 방식(bestWinRate)과 같은 뜻이다. 여기서는 만렙이라 점수가 넉넉해
 * 결국 **전부 찍힌다.** 순서는 포인트가 모자랄 때만 뜻이 있다.
 */
function topSkills(G, cls) {
  const tree = G['skills.json'].tree;
  const out = {};
  for (const id of (G['classes.json'].list[cls].skills || [])) {
    if (tree[id]) out[id] = tree[id].max;
  }
  return out;
}

/**
 * 그 직업이 쓸 무기 갈래.
 *
 * ⚠ **게임에는 무기 직업 제한이 없다.** 마법사가 용살자를 들 수 있다(0.70.8 확인).
 *   그러니 "그 직업이 낄 수 있는" 이 아니라 "그 직업이 들 법한" 을 골라야 한다.
 *   기준은 appearance.json 의 무기 모양이다 — 검·몽둥이는 용사, 활은 사냥꾼,
 *   지팡이는 마법사. (이 규칙을 안 두면 셋 다 '세계수 지팡이' 를 들게 된다)
 */
const WEAPON_SHAPE = { warrior: ['club', 'sword', 'greatsword'], ranger: ['bow'], mage: ['staff'] };
function weaponFits(G, cls, id) {
  const shape = ((G['appearance.json'] || {}).weapon || {})[id];
  if (!shape || !shape.shape) return false;
  return (WEAPON_SHAPE[cls] || []).includes(shape.shape);
}

/** 그 직업이 들 법한, 부위마다 가장 좋은 장비 한 벌. */
function topGear(G, cls) {
  const items = G['items.json'];
  const best = {};
  for (const [id, def] of Object.entries(items)) {
    if (!def || !def.slot || !def.stats) continue;
    if (def.slot === 'weapon' && !weaponFits(G, cls, id)) continue;
    const st = def.stats;
    // '좋다' 의 잣대 — 공격·방어·체력·치명타를 거칠게 합친다.
    // (정확한 전투력은 전투를 돌려 봐야 알지만, 부위별 최고를 고르는 데는 충분하다)
    const score = (st.atk || 0) * 3 + (st.def || 0) * 2 + (st.hp || 0) * 0.3
      + (st.crit || 0) * 400 + (st.critDmg || 0) * 300 + (def.skillPower || 0) * 200;
    if (!best[def.slot] || score > best[def.slot].score) best[def.slot] = { id, score };
  }
  const wear = [];
  let weapon = null;
  for (const [slot, b] of Object.entries(best)) {
    if (slot === 'weapon') { weapon = b.id; continue; }
    wear.push(b.id);
    if (slot === 'ring') wear.push(b.id); // 반지는 두 칸
  }
  return { [cls]: weapon, wear };
}

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const F = await import('../src/data/formulas.js');
  const B = F.BALANCE;
  const G = loadFrom(where);
  const maps = G['maps.json'].maps;

  // 재 볼 상대 — 끝 구간만. [몬스터, 맵, 이름, 천장 몸 목표]
  const BOSSES = [
    ['elite_demon_general', 'field_20', '20단계 보스 · 강화된 발가르', 95],
    ['dungeon_lord', 'dungeon_5', '지하감옥 5층 · 감옥의 주인', 70],
    ['great_dragon', 'west_cliff', '고룡 1단계 · 카르나크', 50],
    ['elder_dragon', 'dragon_lair', '고룡 2단계 · 아그라모스', 30],
  ];

  const CLASSES = ['warrior', 'ranger', 'mage'];
  const NAME = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };

  // 천장 몸의 장비·스킬을 balance.js 의 statsOf 에 끼워 넣는다.
  // (statsOf 는 gearOverride 와 PLANS 를 받는다 — 스킬은 계획을 최대치로 바꿔 준다)
  const savedPlans = {};
  const gearOf = {};
  for (const cls of CLASSES) {
    gearOf[cls] = topGear(G, cls);
    savedPlans[cls] = PLANS[cls];
    // 만렙이면 포인트가 넉넉하므로 순서는 결과를 바꾸지 않는다. 전부 찍히도록 한 줄로.
    PLANS[cls] = [Object.keys(topSkills(G, cls))];
  }

  // 보석은 **한 가지로 통일해 박는다.** 끝까지 키운 사람은 아무거나 안 박는다.
  //   용사·사냥꾼 → 루비(공격력 %)  ·  마법사 → 루비(마법 피해도 공격력을 탄다)
  // t00 의 실제 장비도 열세 칸 중 아홉 칸이 루비였다.
  const GEM = { warrior: 'mods.atkPct', ranger: 'mods.atkPct', mage: 'mods.atkPct' };
  const body = {};
  for (const cls of CLASSES) {
    body[cls] = statsOf(G, cls, B.MAX_LEVEL, B.TRANSCEND_MAX, 20, gearOf[cls], 0, GEM[cls]);
  }

  const line = (s, n) => {
    const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
    return String(s) + ' '.repeat(Math.max(0, n - w));
  };
  const lineR = (s, n) => {
    const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
    return ' '.repeat(Math.max(0, n - w)) + String(s);
  };

  console.log('');
  console.log(`  천장 몸 — Lv.${B.MAX_LEVEL} · 강화 +${B.TRANSCEND_MAX} · 특성·스킬 전부 최대 · 홈은 전부 루비`);
  console.log(`  가방에는 ${topPotions(G).stock.map((x) => `${x.name}(${x.heal}) 99병`).join('') || '약 없음'}`);
  console.log('  ' + '─'.repeat(74));
  for (const cls of CLASSES) {
    const { stats, mods } = body[cls];
    console.log(`  ${line(NAME[cls], 8)} hp ${lineR(stats.hp.toLocaleString('en-US'), 7)}` +
      ` · atk ${lineR(stats.atk.toLocaleString('en-US'), 6)} · def ${lineR(stats.def.toLocaleString('en-US'), 6)}` +
      ` · 치명 ${(stats.crit * 100).toFixed(0)}% · 치명피해 +${Math.round((mods.critMult || 0) * 100)}%` +
      ` · 전투력 ${F.combatPower(stats, mods).toLocaleString('en-US')}`);
    console.log(`           ${gearOf[cls][cls]} + ${gearOf[cls].wear.length}점`);
  }

  console.log('');
  console.log('  이 몸으로 보스를 잡을 확률');
  console.log('  ' + '─'.repeat(74));
  console.log(`  ${line('상대', 30)}${lineR('용사', 7)}${lineR('사냥꾼', 8)}${lineR('마법사', 8)}   목표`);

  const rows = [];
  for (const [monId, mapId, label, target] of BOSSES) {
    const base = G['monsters.json'][monId];
    const mapDef = maps[mapId] || {};
    const power = mapDef.power || 1;
    const m = {
      ...base,
      stats: {
        ...base.stats,
        hp: Math.round(base.stats.hp * power),
        atk: Math.round(base.stats.atk * power),
        def: Math.round(base.stats.def * power),
        spd: +(base.stats.spd * (1 + (power - 1) * 0.25)).toFixed(2),
      },
    };
    const isBoss = !!(base.boss || mapDef.boss === monId);
    const magicPart = isBoss && mapDef.bossMagicPart != null
      ? mapDef.bossMagicPart : mapDef.magicPart || 0;

    const got = {};
    for (const cls of CLASSES) {
      const { stats, mods, weaponShape } = body[cls];
      const potions = topPotions(G);
      let win = 0;
      let turns = 0;
      for (let seed = 1; seed <= SAMPLES; seed++) {
        const r = simulateBattle({
          player: { name: 'p', level: B.MAX_LEVEL, ...stats, maxHp: stats.hp, weaponShape },
          monster: {
            name: m.name, level: m.level, ...m.stats, maxHp: m.stats.hp, magicPart,
            rage: Number(m.rage) > 0 ? Number(m.rage) : 0,
            school: m.school || 'physical',
          },
          seed,
          playerMods: mods,
          playerTraits: G['classes.json'].list[cls].combat,
          potions,
        });
        if (r.winner === 'player') win++;
        turns += (r.turns || []).length;
      }
      got[cls] = { rate: Math.round((win / SAMPLES) * 100), turns: Math.round(turns / SAMPLES) };
    }
    const avg = Math.round((got.warrior.rate + got.ranger.rate + got.mage.rate) / 3);
    const gap = avg - target;
    const mark = Math.abs(gap) <= 10 ? '✓' : (gap > 0 ? `너무 쉬움 +${gap}%p` : `너무 어려움 ${gap}%p`);
    rows.push({ label, target, got, avg, mark });
    console.log(`  ${line(label, 30)}${lineR(got.warrior.rate + '%', 7)}` +
      `${lineR(got.ranger.rate + '%', 8)}${lineR(got.mage.rate + '%', 8)}   목표 ${target}% ${mark}`);
  }

  // ── 고룡은 **승률로 재면 안 된다** ──────────────────────────
  //
  //   고룡은 keepHp 다 — 물러나도 깎아 둔 체력이 그대로 남고, 죽어도 벌칙이 없다
  //   (maps.json 의 timedBoss.keepHp · noPenalty). 그러니 "한 판에 이기는가" 는
  //   아무것도 말해 주지 않는다. 사람이 실제로 겪는 것은 **몇 판을 붙어야 눕나**,
  //   그리고 **그게 몇 분인가** 다. 사람이 "30분 만에 2단계까지 다 잡았다" 고 한 것도
  //   승률이 아니라 이 값이다. 그래서 여기서는 그것을 잰다.
  console.log('');
  console.log('  고룡 — 몇 판을 붙어야 눕나 (승률이 아니라 이것이 사람이 겪는 값이다)');
  console.log('  ' + '─'.repeat(74));
  for (const [monId, mapId, label] of BOSSES.filter(([, m]) => maps[m] && maps[m].timedBoss)) {
    const base = G['monsters.json'][monId];
    const mapDef = maps[mapId];
    const power = mapDef.power || 1;
    const full = Math.round(base.stats.hp * power);
    const magicPart = mapDef.bossMagicPart != null ? mapDef.bossMagicPart : mapDef.magicPart || 0;
    const cells = [];
    for (const cls of CLASSES) {
      const { stats, mods, weaponShape } = body[cls];
      // 한 판에 이 사람이 고룡에게 넣는 피해의 중앙값을 잰다.
      const dealt = [];
      for (let seed = 1; seed <= Math.min(12, SAMPLES); seed++) {
        const r = simulateBattle({
          player: { name: 'p', level: B.MAX_LEVEL, ...stats, maxHp: stats.hp, weaponShape },
          monster: {
            name: base.name, level: base.level,
            ...base.stats, hp: full, maxHp: full,
            atk: Math.round(base.stats.atk * power), def: Math.round(base.stats.def * power),
            magicPart, rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
            school: base.school || 'physical',
          },
          seed,
          playerMods: mods,
          playerTraits: G['classes.json'].list[cls].combat,
          potions: topPotions(G),
        });
        const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : full;
        dealt.push(Math.max(0, full - left));
      }
      dealt.sort((a, c) => a - c);
      const per = dealt[Math.floor(dealt.length / 2)] || 0;
      const fights = per > 0 ? Math.ceil(full / per) : Infinity;
      // 한 판은 대략 1분(들어가고 · 싸우고 · 회복하고 다시 붙기까지)으로 본다.
      cells.push({ per, fights });
    }
    console.log(`  ${line(label, 30)} 체력 ${full.toLocaleString('en-US')}`);
    for (const [i, cls] of CLASSES.entries()) {
      const c = cells[i];
      const t = c.fights === Infinity ? '못 눕힌다' : `${c.fights}판 (≈${c.fights}분)`;
      console.log(`    ${line(NAME[cls], 8)} 한 판에 ${lineR(c.per.toLocaleString('en-US'), 9)} 깎음 → ${t}`);
    }
  }

  console.log('');
  console.log('  한 판에 걸리는 수(판이 짧을수록 상대가 약하다는 뜻)');
  console.log('  ' + '─'.repeat(74));
  for (const [i, [, , label]] of BOSSES.entries()) {
    const g = rows[i].got;
    console.log(`  ${line(label, 30)}${lineR(g.warrior.turns, 7)}${lineR(g.ranger.turns, 8)}${lineR(g.mage.turns, 8)}`);
  }

  console.log('');
  console.log('  읽는 법 — 이 표는 **끝까지 키운 사람**의 자리입니다.');
  console.log('    · 끝 보스가 100% 로 뜨면 더 모을 이유가 없어집니다(0.70.7 이 그랬습니다).');
  console.log('    · 직업 격차가 30%p 를 넘으면 한 직업이 정답이 됩니다.');
  console.log('    · 바닥값은 node tools/balance.js 로 따로 봅니다 — 둘 다 봐야 구간이 잡힙니다.');
  console.log('');

  for (const cls of CLASSES) PLANS[cls] = savedPlans[cls];
})();
