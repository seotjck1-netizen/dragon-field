#!/usr/bin/env node
/**
 * **전투력 수식을 재서 맞춘다.** 눈대중으로 가중치를 적지 않는다.
 *
 *   node tools/power-fit.js            지금 수식이 실제와 얼마나 맞는지 본다
 *   node tools/power-fit.js --fit      각 보정의 값어치를 재서 새 가중치를 제안한다
 *   node tools/power-fit.js --n 24     표본 수 (기본 16)
 *
 * ── 왜 필요한가 ───────────────────────────────────────────
 *
 * 전투력은 "이 사람이 얼마나 센가" 를 한 숫자로 말하는 잣대다. 그런데 0.70.10 에
 * 사람이 보낸 세 세이브를 재 보니 그 숫자가 **거꾸로** 가 있었다:
 *
 *   t00 용사   전투력 765,692  →  아그라모스 30%
 *   t02 마법사 전투력  59,736  →  아그라모스 63%
 *
 * 열세 배 차이인데 약한 쪽이 더 잘 잡는다. 같은 일이 보석에서도 났다 —
 * 홈을 전부 루비로 바꾸면 실제 피해는 +16% 인데 전투력은 **22% 내려갔다.**
 * 관통·치명타 피해의 가중치가 실제 기여보다 훨씬 컸기 때문이다.
 *
 * 그 가중치들은 사람이 손으로 적은 값이다. 그래서 여기서는 **재서** 정한다.
 *   ① 기준 몸을 하나 세운다
 *   ② 보정을 하나씩 조금 올려 보고, **실제 전투에서** 무엇이 얼마나 달라지는지 잰다
 *      (한 판에 넣는 피해 × 버틴 수 = 그 몸이 실제로 해내는 일)
 *   ③ 그 비율이 곧 가중치다
 *
 * 잣대(score): 한 판에 **넣은 피해**와 **버틴 턴 수**의 기하평균.
 *   공격만 세면 물몸이 최고가 되고, 버티기만 세면 아무것도 못 죽이는 몸이 최고가 된다.
 *   둘을 곱해야 "실제로 보스를 눕히는 힘" 에 가깝다. (전투력 수식도 √(실효체력 × 실효공격)
 *   이므로 같은 모양이다 — 그래서 여기서 잰 비율을 그대로 가중치로 쓸 수 있다)
 */
const path = require('path');
const { loadFrom } = require('./balance.js');

const args = process.argv.slice(2);
const where = args.includes('sheets') ? 'sheets' : 'src';
const FIT = args.includes('--fit');
const nAt = args.indexOf('--n');
const SAMPLES = nAt >= 0 ? Number(args[nAt + 1]) || 16 : 16;

// 잴 때 상대할 놈들.
//
// ⚠ **물리와 마법을 섞는다.** 처음에는 끝 보스 넷만 썼는데 그중 셋이 마법이라,
//   '받는 마법 피해 감소' 가 +32.6% 로 나와 모든 것을 삼켰다. 전투력은 들판의
//   이름표 색에도 쓰이는 잣대이므로, 평소에 만나는 물리 잡몹도 함께 재야 한다.
const FOES = [
  ['elite_skeleton', 'field_17'],        // 물리 잡몹
  ['elite_demon_soldier', 'field_19'],   // 물리 잡몹
  ['dungeon_golem', 'dungeon_3'],        // 물리, 아주 단단함
  ['elite_demon_general', 'field_20'],   // 마법 보스
  ['dungeon_lord', 'dungeon_5'],         // 마법 보스, 아주 단단함
  ['great_dragon', 'west_cliff'],        // 마법 보스
  ['elder_dragon', 'dragon_lair'],       // 마법 보스
];

// 재 볼 보정들. [키, 한 걸음, 화면에 쓸 이름]
//   '한 걸음' 은 실제로 장비 한 점에서 나올 만한 크기로 잡는다 —
//   너무 작으면 잡음에 묻히고, 너무 크면 수확 체감이 섞여 값어치가 낮게 나온다.
//
// ⚠ atkPct·hpPct·defPct 는 **여기 없다.** 그 셋은 전투에 들어가기 전에
//   StatBlock 이 공격력·체력·방어력에 이미 곱해 둔 값이라, 전투 계산기에
//   따로 넘겨 봐야 아무 일도 일어나지 않는다(처음에 넣었다가 전부 0.0% 로 나왔다).
//   그 셋의 값어치는 아래 '스탯을 올렸을 때' 에서 잰다.
const KNOBS = [
  ['critMult', 0.5, '치명타 피해 +50%'],
  ['pierce', 0.3, '방어 관통 +30% (다이아 세 알)'],
  ['doubleHit', 0.2, '연속 공격 +20%'],
  ['lifesteal', 0.2, '흡혈 +20%'],
  ['dmgReduction', 0.15, '받는 피해 -15%'],
  ['magicResist', 0.3, '받는 마법 피해 -30%'],
  ['crit', 0.15, '치명타 확률 +15%p'],
];

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
const padL = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return ' '.repeat(Math.max(0, n - w)) + String(s);
};

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const F = await import('../src/data/formulas.js');
  const G = loadFrom(where);
  const maps = G['maps.json'].maps;
  const items = G['items.json'];

  // 가장 센 회복약을 넉넉히 — 실제 사람이 그렇게 다닌다.
  let potion = null;
  for (const [id, d] of Object.entries(items)) {
    if (!d || !d.use || !d.use.hp) continue;
    if (!potion || d.use.hp > potion.heal) potion = { id, name: d.name, heal: d.use.hp, count: 99 };
  }
  const potions = { stock: potion ? [potion] : [], threshold: 0.7, cooldownMs: 2000 };

  /**
   * 기준 몸 — 사람이 보낸 세 세이브의 가운데쯤.
   * (t00 hp 21,528/atk 3,970/def 3,818 · t01 6,485/2,195/1,087 · t02 5,476/1,317/756)
   */
  const BASE = { hp: 9000, atk: 2400, def: 1800, spd: 150, crit: 0.6 };
  const BASE_MODS = { critMult: 2.0, pierce: 0.2, doubleHit: 0.3, lifesteal: 0.1 };

  /** 한 몸이 실제로 해내는 일 = √(넣은 피해 × 버틴 턴). */
  function score(stats, mods) {
    let dmgSum = 0;
    let turnSum = 0;
    let n = 0;
    for (const [monId, mapId] of FOES) {
      const base = G['monsters.json'][monId];
      const map = maps[mapId] || {};
      const pw = map.power || 1;
      const full = Math.round(base.stats.hp * pw);
      for (let seed = 1; seed <= SAMPLES; seed++) {
        const r = simulateBattle({
          player: { name: 'p', level: 50, ...stats, maxHp: stats.hp },
          monster: {
            name: base.name, level: base.level, hp: full, maxHp: full,
            atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
            spd: base.stats.spd, crit: base.stats.crit,
            magicPart: map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0),
            rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
            school: base.school || 'physical',
          },
          seed, playerMods: mods, playerTraits: {}, potions,
        });
        const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : full;
        // 피해는 **상대 체력 대비**로 잰다 — 체력이 제각각인 넷을 그냥 더하면
        // 체력 큰 상대 하나가 결론을 통째로 정한다.
        dmgSum += Math.max(0, full - left) / full;
        turnSum += (r.turns || []).length;
        n++;
      }
    }
    const dmg = dmgSum / n;
    const turns = turnSum / n;
    return Math.sqrt(Math.max(1e-6, dmg) * Math.max(1, turns));
  }

  const baseScore = score(BASE, BASE_MODS);

  console.log('');
  console.log(`  전투력 수식 재기 — 기준 몸 hp ${BASE.hp.toLocaleString('en-US')}`
    + ` · atk ${BASE.atk.toLocaleString('en-US')} · def ${BASE.def.toLocaleString('en-US')}`
    + ` · 치명 ${(BASE.crit * 100).toFixed(0)}%`);
  console.log(`  상대 ${FOES.length}종 × 씨앗 ${SAMPLES}개 = 한 칸마다 ${FOES.length * SAMPLES}판`);
  console.log('  ' + '─'.repeat(76));
  console.log(`  ${pad('무엇을 올렸나', 32)}${padL('실제', 8)}${padL('전투력', 9)}   어긋남`);

  const measured = [];
  for (const [key, step, label] of KNOBS) {
    // crit 은 스탯 칸에 있다(mods.crit 은 전투 계산기가 안 읽는다).
    const stats = key === 'crit' ? { ...BASE, crit: BASE.crit + step } : BASE;
    const mods = key === 'crit' ? { ...BASE_MODS } : { ...BASE_MODS, [key]: (BASE_MODS[key] || 0) + step };
    const real = score(stats, mods) / baseScore - 1;      // 실제로 얼마나 세졌나
    const said = F.combatPower(stats, mods) / F.combatPower(BASE, BASE_MODS) - 1; // 수식이 말하는 값
    measured.push({ key, step, label, real, said });
    const gap = said - real;
    const mark = Math.abs(gap) < 0.03 ? '✓'
      : (gap > 0 ? `과대평가 +${(gap * 100).toFixed(0)}%p` : `과소평가 ${(gap * 100).toFixed(0)}%p`);
    console.log(`  ${pad(label, 32)}${padL(`${(real * 100).toFixed(1)}%`, 8)}`
      + `${padL(`${(said * 100).toFixed(1)}%`, 9)}   ${mark}`);
  }

  // 스탯(hp·atk·def) 도 같은 방식으로 잰다 — 수식의 뼈대가 맞는지 보려면 필요하다.
  console.log('');
  console.log(`  ${pad('스탯을 올렸을 때', 32)}${padL('실제', 8)}${padL('전투력', 9)}   어긋남`);
  const statFit = [];
  for (const [k, mul, label] of [['atk', 1.3, '공격력 ×1.3'], ['hp', 1.3, '최대 HP ×1.3'], ['def', 1.3, '방어력 ×1.3']]) {
    const st = { ...BASE, [k]: Math.round(BASE[k] * mul) };
    const real = score(st, BASE_MODS) / baseScore - 1;
    const said = F.combatPower(st, BASE_MODS) / F.combatPower(BASE, BASE_MODS) - 1;
    const gap = said - real;
    const mark = Math.abs(gap) < 0.03 ? '✓'
      : (gap > 0 ? `과대평가 +${(gap * 100).toFixed(0)}%p` : `과소평가 ${(gap * 100).toFixed(0)}%p`);
    console.log(`  ${pad(label, 32)}${padL(`${(real * 100).toFixed(1)}%`, 8)}`
      + `${padL(`${(said * 100).toFixed(1)}%`, 9)}   ${mark}`);
    statFit.push({ k, mul, real });
  }

  if (FIT) {
    console.log('');
    console.log('  잰 값으로 뽑은 가중치 (formulas.js 의 POWER 에 넣을 값)');
    console.log('  ' + '─'.repeat(76));
    console.log('  전투력은 √(실효체력 × 실효공격) 이므로, 한 칸을 올렸을 때');
    console.log('  전투력이 r 배가 되려면 그 칸이 붙는 쪽이 r² 배가 되어야 한다.');
    console.log('');
    // (1+x)^C 꼴로 적으면 지수 C 가 곧 가중치다.
    //   한 걸음에 실제로 r 배가 됐다면  (1+x_after)/(1+x_before) 의 C 제곱이 r 이어야 한다.
    for (const m of measured) {
      const before = m.key === 'crit' ? BASE.crit : (BASE_MODS[m.key] || 0);
      const ratio = (1 + before + m.step) / (1 + before);
      const C = Math.log(1 + m.real) / Math.log(ratio);
      console.log(`  ${pad(m.key, 16)} 한 걸음 ${padL(m.step, 5)} → 실제 ${padL(`${(m.real * 100).toFixed(1)}%`, 7)}`
        + ` · 지수 ${C.toFixed(3)}`);
    }
    console.log('');
    console.log('  스탯의 지수 (power = … × hp^A × atk^B 꼴)');
    for (const f of statFit) {
      const C = Math.log(1 + f.real) / Math.log(f.mul);
      console.log(`  ${pad(f.k, 16)} ×${f.mul} → 실제 ${padL(`${(f.real * 100).toFixed(1)}%`, 7)} · 지수 ${C.toFixed(3)}`);
    }
    console.log('');
    console.log('  ⚠ 계수는 **이 기준 몸과 이 상대들** 에서 잰 값이다. 몸이 달라지면 조금 달라진다.');
    console.log('     그래도 손으로 적은 값보다는 낫다 — 적어도 부호와 자릿수는 맞는다.');
  }
  console.log('');
})();
