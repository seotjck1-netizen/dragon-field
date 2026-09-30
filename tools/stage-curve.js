#!/usr/bin/env node
/**
 * 단계 사다리 검사 — "다음 땅이 정말 더 어려운가".
 *
 *   node tools/stage-curve.js              지금 상태를 본다
 *   node tools/stage-curve.js --n 40       표본 수를 바꾼다
 *
 * ── 무엇을 보는가 ──────────────────────────────────────────
 * 사람이 겪는 것은 "전투력 숫자"가 아니라 **승률**이다.
 * 같은 몸으로 6단계에 갔더니 5단계보다 잘 이긴다면, 그 사람에게 6단계는 더 쉬운 땅이다.
 * 그래서 **장비를 고정해 두고** 1~20단계를 차례로 걸어가며 승률을 잰다.
 * 승률이 한 번이라도 올라가면 그 자리가 사다리가 꺼진 곳이다.
 *
 * 화면에 뜨는 **레벨**도 함께 본다. 몬스터 레벨이 앞 단계보다 낮게 찍히면,
 * 실제로 세든 약하든 사람은 "여기가 더 쉬운 곳"이라고 읽는다.
 * (레벨 = 몬스터의 제 레벨 + 그 맵의 levelBonus)
 */
const path = require('path');
const { loadFrom, winRate } = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = arg('n', 40);

/**
 * 재는 몸. **한 구간을 걷는 동안은 장비를 갈아입지 않는다** —
 * 그래야 "같은 장비로 다음 땅에 갔을 때" 를 볼 수 있다.
 * 구간이 바뀌는 자리(6·11·16)에서는 그 문턱을 넘은 사람으로 갈아탄다.
 */
const WALKERS = [
  { label: '1~5단계를 걷는 몸', stages: [1, 2, 3, 4, 5], level: 8, enh: 2, tier: 5 },
  { label: '6~10단계를 걷는 몸', stages: [6, 7, 8, 9, 10], level: 17, enh: 5, tier: 10 },
  { label: '11~15단계를 걷는 몸', stages: [11, 12, 13, 14, 15], level: 27, enh: 7, tier: 20 },
  { label: '16~20단계를 걷는 몸', stages: [16, 17, 18, 19, 20], level: 38, enh: 9, tier: 20 },
];

const CLASSES = ['warrior', 'ranger', 'mage'];

function stageInfo(G, stage) {
  const maps = G['maps.json'].maps;
  const entry = Object.entries(maps).find(([, m]) => m.stage === stage && !m.dark);
  if (!entry) return null;
  const [id, m] = entry;
  const mons = G['monsters.json'];
  const bonus = m.levelBonus || 0;
  const list = (m.monsters || []).map((mid) => ({
    id: mid,
    name: (mons[mid] || {}).name || mid,
    level: ((mons[mid] || {}).level || 0) + bonus,
  }));
  return { id, name: m.name, power: m.power || 1, list, boss: m.boss || null, bonus };
}

(async () => {
  const G = loadFrom(path.join(ROOT, 'src', 'data'));
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');

  console.log('');
  console.log(`  단계 사다리 — 같은 몸으로 다음 땅에 갔을 때  · 표본 ${SAMPLES}판`);
  console.log('  ' + '─'.repeat(76));

  let broken = 0;
  for (const w of WALKERS) {
    console.log('');
    console.log(`  ${w.label}  (Lv.${w.level} · +${w.enh})`);
    console.log('  ' + '-'.repeat(76));
    console.log(
      '  ' + '단계'.padEnd(6) + '땅'.padEnd(20) + '레벨'.padEnd(10) +
      '승률(용사/사냥꾼/마법사)'.padEnd(26) + '평균'
    );

    let prevAvg = null;
    let prevMinLv = null;
    for (const stage of w.stages) {
      const info = stageInfo(G, stage);
      if (!info) continue;
      // 그 땅에서 가장 센 놈으로 잰다 — 사람이 기억하는 것은 제일 아팠던 놈이다.
      let worst = null;
      for (const mon of info.list) {
        const rates = [];
        for (const c of CLASSES) {
          const r = await winRate(simulateBattle, G, c, w.level, w.enh, w.tier, mon.id, SAMPLES, info.id);
          rates.push(r ? r.rate : 0);
        }
        const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
        if (!worst || avg < worst.avg) worst = { mon, rates, avg };
      }
      if (!worst) continue;

      const lvs = info.list.map((m) => m.level);
      const minLv = Math.min(...lvs);
      const lvText = lvs.length > 1 ? `${Math.min(...lvs)}~${Math.max(...lvs)}` : String(lvs[0]);

      const easier = prevAvg != null && worst.avg > prevAvg + 0.5;
      const lvDrop = prevMinLv != null && minLv < prevMinLv;
      if (easier || lvDrop) broken++;

      console.log(
        '  ' + String(stage).padEnd(6) + String(info.name).padEnd(20) +
        (lvText + (lvDrop ? ' ↓' : '')).padEnd(10) +
        `${worst.rates.map((r) => `${r}%`).join(' / ')}`.padEnd(26) +
        `${worst.avg.toFixed(1)}%` +
        (easier ? '  ← 앞 단계보다 쉬워졌다' : '') +
        (lvDrop && !easier ? '  ← 레벨이 내려간다' : '')
      );
      prevAvg = worst.avg;
      prevMinLv = minLv;
    }
  }

  console.log('');
  if (broken) {
    console.log(`  ⚠ 사다리가 꺼진 곳 ${broken}군데. 위의 ← 표시를 보세요.`);
  } else {
    console.log('  ✓ 어느 구간에서도 다음 땅이 앞 땅보다 쉬워지지 않습니다.');
  }
  console.log('');
  // 회귀 실행(/tmp/runall.sh)이 성패를 알 수 있도록 종료 코드를 남긴다.
  process.exit(broken ? 1 : 0);
})();
