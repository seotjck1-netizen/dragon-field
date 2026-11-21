#!/usr/bin/env node
/**
 * 이름표 색이 거짓말을 하는지 본다.
 *
 *   node tools/stage-color.js
 *
 * 화면에서 몬스터 이름 위에 뜨는 색(초록·노랑·주황·빨강)은 formulas.powerTier 가
 * "내 전투력 대비 저 놈의 전투력"으로 정한다. 그런데 전투력은 **보여 주기용 잣대**라
 * 실제 승률과 어긋날 수 있다. 어긋나면 사람은 이길 수 있는 땅을 빨강으로 보고 돌아선다.
 *
 * 그래서 여기서는 단계마다 **그 자리에 서 있을 법한 몸**(tools/stage-solve.js 와 같은 몸)을
 * 세워 두고, 그 땅에서 가장 센 놈의 색이 무엇으로 뜨는지 늘어놓는다.
 * 색이 단계를 따라 초록에서 빨강으로 **차례대로** 넘어가면 정직한 것이다.
 */
const path = require('path');
const { loadFrom, statsOf, winRate } = require('./balance.js');

const argN = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = argN('n', 24);

const ROOT = path.resolve(__dirname, '..');

// tools/stage-solve.js 의 기준 몸과 같아야 한다. 한쪽만 고치면 두 도구가 다른 말을 한다.
const REF = [
  [1, 3, 0, 1], [2, 5, 0, 1], [3, 7, 0, 1], [4, 9, 2, 5], [5, 12, 2, 5],
  [6, 16, 5, 10], [7, 18, 5, 10], [8, 20, 5, 10], [9, 22, 5, 10], [10, 24, 5, 10],
  [11, 26, 7, 20], [12, 27, 7, 20], [13, 28, 7, 20], [14, 29, 7, 20], [15, 30, 7, 20],
  [16, 33, 9, 20], [17, 35, 9, 20], [18, 37, 9, 20], [19, 39, 9, 20], [20, 40, 9, 20],
];

const CLASSES = ['warrior', 'ranger', 'mage'];
const KO = { trivial: '회색', easy: '초록', even: '노랑', hard: '주황', deadly: '빨강' };
const ORDER = ['trivial', 'easy', 'even', 'hard', 'deadly'];

/**
 * 색이 **뜻해야 하는 것** — 이 승률이면 이 색이어야 한다.
 *
 * 사람이 이름표 색에서 알고 싶은 것은 전투력 배수가 아니라 "이길 수 있나" 하나다.
 * 그래서 여기가 기준이고, formulas.js 의 powerTier 경계값은 이것을 맞추려고 있다.
 * 둘이 어긋나면 색이 거짓말을 하는 것이다.
 */
function tierForRate(rate) {
  if (rate >= 95) return 'trivial';
  if (rate >= 80) return 'easy';
  if (rate >= 60) return 'even';
  if (rate >= 35) return 'hard';
  return 'deadly';
}

(async () => {
  const G = loadFrom(path.join(ROOT, 'src', 'data'));
  const F = await import('../src/data/formulas.js');
  const { computeMonsterStats } = await import('../src/entities/StatBlock.js');
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');

  const maps = G['maps.json'].maps;
  const stageEntry = (n) =>
    Object.entries(maps).find(([id, m]) => m.stage === n && m.monsters && id.startsWith('field_'));

  console.log('');
  console.log(`  이름표 색 — 그 자리에 서 있을 법한 몸이 보는 색 · 표본 ${SAMPLES}판`);
  console.log('  ' + '─'.repeat(74));
  console.log('  단계   가장 센 놈            배수    색     실제 승률   맞나');

  const seen = [];
  let bad = 0;
  let lied = 0;
  let near = 0;
  for (const [stage, level, enh, tier] of REF) {
    const found = stageEntry(stage);
    if (!found) continue;
    const map = found[1];

    // 세 직업 전투력의 평균을 내 기준으로 삼는다.
    let mine = 0;
    for (const c of CLASSES) {
      const { stats, mods } = statsOf(G, c, level, enh, tier);
      mine += F.combatPower(stats, mods);
    }
    mine /= CLASSES.length;

    let worst = 0;
    let worstId = null;
    for (const id of map.monsters) {
      const p = F.combatPower(F.scaleMonsterStats(computeMonsterStats(G['monsters.json'][id]), map.power || 1));
      if (p > worst) { worst = p; worstId = id; }
    }

    const t = F.powerTier(mine, worst);
    seen.push(t.tier);

    // 색이 정말 맞는지는 **실제로 싸워 봐야** 안다. 전투력은 직업 궁합도,
    // 물약도, 스킬도 모르는 잣대라 혼자 두면 조용히 어긋난다.
    let rate = 0;
    for (const c of CLASSES) {
      const r = await winRate(simulateBattle, G, c, level, enh, tier, worstId, SAMPLES, map.power || 1);
      rate += r ? r.rate : 0;
    }
    rate /= CLASSES.length;

    // 전투력 하나로는 **한 칸까지가 한계**다 — 직업 궁합도, 물약도, 스킬도 모르는
    // 잣대이기 때문이다. 같은 배수 1.49 가 78% 이기도 하고 91% 이기도 하다.
    // 그래서 한 칸 어긋난 것은 적어 두기만 하고, 두 칸부터를 거짓말로 본다.
    const want = tierForRate(rate);
    const off = Math.abs(ORDER.indexOf(want) - ORDER.indexOf(t.tier));
    const okColor = off === 0;
    if (off >= 2) lied += 1;
    else if (off === 1) near += 1;

    const name = (G['monsters.json'][worstId] || {}).name || worstId;
    console.log(
      `  ${String(stage).padStart(3)}   ${String(name).padEnd(20)}` +
        `x${t.ratio.toFixed(2).padStart(6)}  ${KO[t.tier].padEnd(4)}` +
        `${String(Math.round(rate)).padStart(6)}%     ` +
        (okColor ? '✓' : off === 1 ? `△ ${KO[want]} 쪽` : `✗ ${KO[want]} 이어야`)
    );
  }

  // 색이 뒤로 갈수록 순해지면(빨강 → 초록) 그건 거짓말이다.
  for (let i = 1; i < seen.length; i++) {
    if (ORDER.indexOf(seen[i]) < ORDER.indexOf(seen[i - 1]) - 1) {
      console.log(`  ✗ ${i}단계(${KO[seen[i - 1]]}) → ${i + 1}단계(${KO[seen[i]]}) 색이 거꾸로 갑니다.`);
      bad += 1;
    }
  }
  console.log('');
  if (bad) console.log(`  ✗ ${bad}군데에서 색이 거꾸로 갑니다.`);
  else console.log('  ✓ 색이 단계를 따라 차례대로 짙어집니다.');
  if (lied) {
    console.log(`  ✗ ${lied}군데에서 색이 실제 승률과 두 칸 넘게 어긋납니다 — formulas.js 의 powerTier 경계값을 보세요.`);
  } else {
    console.log(`  ✓ 색이 실제 승률과 맞습니다. (한 칸 차이 ${near}군데 — 잣대 하나의 한계)`);
  }
  console.log('');
  process.exit(bad || lied ? 1 : 0);
})();
