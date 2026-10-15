#!/usr/bin/env node
/**
 * 단계 배율 풀이 — "다음 땅에 가면 승률이 반드시 떨어지게".
 *
 *   node tools/stage-solve.js           얼마로 바꿔야 하는지 보여만 준다
 *   node tools/stage-solve.js --write   tools/gen-maps.js 의 배율표를 고친다
 *   node tools/stage-solve.js --n 40    표본 수(기본 30)
 *
 * ── 왜 전투력이 아니라 승률로 푸나 ─────────────────────────
 * zone-solve.js 는 "이 단계의 전투력이 얼마여야 하나"로 푼다. 그건 몬스터끼리의
 * 잣대라 사람이 겪는 것과 어긋날 수 있다 — 전투력이 올라도 그 사람의 장비·스킬과
 * 맞물리는 방식에 따라 오히려 잘 이겨질 수 있기 때문이다.
 *
 * 여기서는 **장비를 고정한 사람**으로 실제 전투를 돌려 승률을 재고,
 * 그 승률이 목표 곡선을 그리도록 맵 배율을 이분 탐색으로 찾는다.
 * 사람이 말하는 "6단계가 5단계보다 쉽다"는 곧 승률 이야기이므로, 승률로 푸는 것이 맞다.
 *
 * ⚠ 배율을 바꾸면 그 맵의 **보스도 함께 세진다.** 이 도구를 돌린 뒤에는 반드시
 *   node tools/balance.js --solve 로 보스를 다시 잡아야 한다.
 */
const fs = require('fs');
const path = require('path');
const { loadFrom, winRate } = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'tools', 'gen-maps.js');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const SAMPLES = arg('n', 30);
const WRITE = process.argv.includes('--write');

/**
 * 단계마다 "거기 서 있을 법한 몸"과 목표 승률.
 *
 * ── 왜 단계마다 다른 몸으로 재나 ───────────────────────────
 * 한 구간을 통째로 같은 몸으로 재면, 그 몸을 앞 단계에 맞추면 뒤가 불가능해지고
 * 뒤에 맞추면 앞이 공짜가 된다. 실제로 그렇게 풀었더니 **1단계 슬라임의 배율이
 * 1.3 에서 16 으로 튀었다** — Lv.8 이 이기기 어려운 슬라임은 Lv.3 에게는 벽이다.
 * 사람은 걸어가면서 레벨이 오르므로, 재는 몸도 함께 올라가야 한다.
 *
 * ── 그러면 "같은 장비로 다음 땅" 은 누가 보장하나 ──────────
 * 레벨이 **오르는데도** 승률이 떨어지도록 맞추면, 레벨이 안 오른 사람에게는
 * 더 크게 떨어진다. 그래서 이 목표를 지키면 그 성질은 저절로 따라온다.
 * 확인은 tools/stage-curve.js 가 장비를 고정한 몸으로 따로 한다.
 *
 * want = 그 단계에서 **가장 어려운 잡몹** 상대 평균 승률(세 직업).
 */
const ZONES = [
  {
    name: '1구간',
    // [단계, 레벨, 강화, 장비단계, 목표승률]
    //
    // ── 1~3단계의 고비는 **여기서 만들지 않는다** (0.36) ────────
    //
    // 1~4 구간에도 약간의 고비가 있어야 한다는 것은 맞다. 그런데 그것을 이 표에서
    // 만들면 안 된다. **배율은 경험치·골드도 같은 배수로 올리기 때문이다**
    // (main.js 의 exp: baseDef.exp * power).
    //
    // 실제로 한 번 그렇게 풀어 봤다. 1단계를 95% 로 두려면 배율이 1.327 → 5.163 이
    // 되어야 했고, 그러면 슬라임 한 마리가 9exp 에서 46exp 가 된다.
    // 첫 들판을 한 바퀴 돌면 **Lv.9** 가 된다 — 4단계를 걷는 몸이다.
    // 고비를 만들려다 2·3단계를 통째로 공짜로 만드는 셈이다.
    //
    // 그래서 얕은 땅의 고비는 **몬스터 자신의 능력치**로 만든다.
    //   node tools/balance.js --trash --solve --n 60
    // 이 길은 경험치·골드를 건드리지 않으므로 초반 성장 속도가 그대로 남는다.
    // 목표 승률은 tools/balance.js 의 TRASH 표(1·2·3단계 줄)에 적혀 있다.
    rows: [[1, 3, 0, 1, null], [2, 5, 0, 1, null], [3, 7, 0, 1, null], [4, 9, 2, 5, 82], [5, 12, 2, 5, 70]],
  },
  // ── 0.50 — 여기 적힌 몸을 **사람이 실제로 그 땅에 설 때의 몸**으로 내렸다 ──
  //
  // 예전에는 10단계를 Lv.24 · +5 · 여덟 점으로, 15단계를 Lv.30 · 룬 한 벌로 잡고
  // 배율을 풀었다. 그런데 사람이 직접 재 보니 그 문 앞에 서는 몸은
  // **Lv.14 · +7 · 세 점**, **Lv.20 · +7 · 여섯 점**, **Lv.27 · +7 · 룬 한 벌** 이었다.
  // 상상한 사람이 실제보다 훨씬 세면, 그 사람에 맞춰 푼 배율은 실제 사람에게
  // 그대로 벽이 된다. 재는 사람을 먼저 실제와 맞추고 나서 배율을 푼다.
  //
  // ⚠ 여기와 tools/balance.js 의 MATCHES 는 **같은 사람**이어야 한다.
  {
    name: '2구간',
    rows: [[6, 10, 7, 'play10', 88], [7, 11, 7, 'play10', 82], [8, 12, 7, 'play10', 76],
           [9, 13, 7, 'play10', 70], [10, 14, 7, 'play10', 64]],
  },
  {
    name: '3구간',
    rows: [[11, 16, 7, 'play15', 88], [12, 17, 7, 'play15', 82], [13, 18, 7, 'play15', 76],
           [14, 19, 7, 'play15', 70], [15, 20, 7, 'play15', 64]],
  },
  {
    name: '4구간',
    rows: [[16, 22, 7, 'play20', 88], [17, 23, 7, 'play20', 82], [18, 25, 7, 'play20', 76],
           [19, 26, 7, 'play20', 70], [20, 27, 7, 'play20', 64]],
  },
];

// ⚠ **한 구간의 마지막 땅(보스가 있는 곳)도 60% 대로 둔다.**
//
// 예전에는 50% 였는데, 그러면 그 땅의 보스 목표(40%·30%·20%)와의 사이가 너무 좁아
// "보스가 제 땅의 잡몹보다 약한" 상태를 피할 수가 없다. 잡몹을 64% 로 두면
// 보스가 그 아래로 내려갈 자리가 넉넉해진다.

// ⚠ **한 구간 안에서는 강화 수치를 올리지 않는다.**
//
// 예전에는 구간 안에서 +9 → +10 처럼 한 칸을 올려 두었는데, 그러면 그 자리에서
// 배율이 40% 씩 뛰고, 강화를 아직 못 한 사람에게는 승률이 75% 에서 11% 로 떨어졌다.
// 사다리가 아니라 절벽이다. 구간 안에서 달라지는 것은 **레벨뿐**이라고 두면,
// 장비를 그대로 둔 사람도 완만하게 어려워지는 것을 느낀다.

const CLASSES = ['warrior', 'ranger', 'mage'];

function stageMap(G, stage) {
  const maps = G['maps.json'].maps;
  const entry = Object.entries(maps).find(([id, m]) => m.stage === stage && id.startsWith('field_'));
  return entry ? { id: entry[0], def: entry[1] } : null;
}

(async () => {
  const G = loadFrom(path.join(ROOT, 'src', 'data'));
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');

  /** 이 배율에서 그 땅의 **가장 어려운 놈** 상대 평균 승률. */
  const rateAt = async (who, mapDef, power) => {
    let worst = 100;
    for (const monId of mapDef.monsters || []) {
      let sum = 0;
      for (const c of CLASSES) {
        const r = await winRate(simulateBattle, G, c, who.level, who.enh, who.tier, monId, SAMPLES, power);
        sum += r ? r.rate : 0;
      }
      worst = Math.min(worst, sum / CLASSES.length);
    }
    return worst;
  };

  console.log('');
  console.log(`  단계 배율 풀이 — 목표 승률에 맞춘다 · 표본 ${SAMPLES}판`);
  console.log('  ' + '─'.repeat(72));

  const solved = {};
  for (const zone of ZONES) {
    console.log('');
    console.log(`  ${zone.name}`);
    let prevPower = 0;
    let prevFoes = null;
    for (const [stage, level, enh, tier, want] of zone.rows) {
      const found = stageMap(G, stage);
      if (!found) continue;
      const who = { level, enh, tier };
      const was = found.def.power;

      let power;
      if (want == null) {
        power = was; // 목표를 안 준 단계는 지금 값을 그대로 둔다
      } else {
        // 배율이 오르면 승률은 내려간다 — 단조롭다. 그래서 이분 탐색이 통한다.
        let lo = 0.5;
        let hi = 60;
        for (let k = 0; k < 11; k++) {
          const mid = (lo + hi) / 2;
          const rate = await rateAt(who, found.def, mid);
          if (rate > want) lo = mid;
          else hi = mid;
        }
        power = +((lo + hi) / 2).toFixed(3);
      }

      // 배율은 **몬스터가 같을 때만** 내려가면 안 된다.
      //
      // 더 센 놈이 새로 나오는 땅에서는 배율이 낮아져도 실제로는 더 어렵다
      // (8단계에 악마 병사가 처음 나온다 — 해골만 있던 7단계보다 배율이 낮아도 더 세다).
      // 그걸 모르고 무조건 올려 두면 승률이 목표를 한참 밑돌아 절벽이 된다.
      const sameFoes = prevFoes && prevFoes === (found.def.monsters || []).join(',');
      if (sameFoes && power < prevPower) power = +(prevPower * 1.05).toFixed(3);
      prevPower = power;
      prevFoes = (found.def.monsters || []).join(',');

      const got = await rateAt(who, found.def, power);
      solved[stage] = power;
      console.log(
        `    ${String(stage).padStart(2)}단계  Lv.${String(level).padStart(2)} +${enh}  ` +
          `${String(was).padStart(7)} → ${String(power).padEnd(8)}` +
          `승률 ${got.toFixed(0).padStart(3)}%  (목표 ${want == null ? '그대로' : want + '%'})`
      );
    }
  }

  if (!WRITE) {
    console.log('');
    console.log('  --write 를 붙이면 tools/gen-maps.js 의 배율표를 고칩니다.');
    console.log('  고친 뒤에는 npm run maps → node tools/balance.js --solve 를 이어서 하세요.');
    console.log('');
    return;
  }

  let src = fs.readFileSync(GEN, 'utf8');
  // 1~10단계 — STAGES 표의 power 를 차례대로 바꾼다.
  let n = 0;
  src = src.replace(/(\{ name: '[^']+', monsters: \[[^\]]*\], count: \d+, power: )([\d.]+)/g, (m, head) => {
    n += 1;
    const p = solved[n];
    return p ? head + p : m;
  });
  // 11~20단계 — DEEP_POWER 배열.
  const deep = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((s) => solved[s]);
  if (deep.every((v) => v != null)) {
    src = src.replace(/const DEEP_POWER = \[[^\]]*\];/, `const DEEP_POWER = [${deep.join(', ')}];`);
  }
  fs.writeFileSync(GEN, src);
  console.log('');
  console.log('  ✓ tools/gen-maps.js 를 고쳤습니다.');
  console.log('    이어서: npm run maps  →  node tools/balance.js --solve  →  node tools/stage-curve.js');
  console.log('');
})();
