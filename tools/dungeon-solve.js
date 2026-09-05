#!/usr/bin/env node
// 지하감옥 층별 배율을 되찾는다 — "강화된 발가르 대비 몇 %인가" 를 기준으로.
//
// 왜 배율로 푸나:
//   요청은 "체력만 올리지 말고 공격력·마법 피해·방어력도 함께 올려라" 였다.
//   맵 배율(maps.json 의 power)이 정확히 그 일을 한다 —
//   formulas.scaleMonsterStats 가 hp·atk·def 를 함께 밀고 속도도 조금 올린다.
//   몬스터가 마법 속성이면 그 atk 이 곧 마법 피해이므로 함께 오른다.
//   경험치·골드도 같은 배율로 오르니(main.js fieldMonsterDef) 보상도 따라온다.
//
// ⚠ 전투력은 배율에 **선형이 아니다**. 셋을 같이 밀면 실효 체력이 배율의 제곱에
//   가깝게 커진다. 그래서 나누기로 구하면 한참 빗나간다 — 이분 탐색으로 찾는다.
//
//   node tools/dungeon-solve.js            지금 상태와 목표를 견줘 본다
//   node tools/dungeon-solve.js --write    tools/gen-maps.js 의 배율표를 고친다

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));
const FORMULAS = fs.readFileSync(path.join(ROOT, 'src/data/formulas.js'), 'utf8');

const num = (re, d) => {
  const m = re.exec(FORMULAS);
  return m ? Number(m[1]) : d;
};
const DEF_WEIGHT = num(/DEF_WEIGHT:\s*([0-9.]+)/, 0);
const SCALE = num(/SCALE:\s*([0-9.]+)/, 1.6);
const SPD_WEIGHT = num(/SPD_WEIGHT:\s*([0-9.]+)/, 0.004);
const CRIT_MULT = num(/CRIT_MULTIPLIER:\s*([0-9.]+)/, 1.5);

/** formulas.combatPower 와 같은 식(장비 보정 없는 몬스터용). */
function power(s) {
  const ehp = s.hp * (1 + (s.def * DEF_WEIGHT) / 100);
  const edmg = s.atk * (1 + (s.crit || 0) * (CRIT_MULT - 1));
  return Math.max(
    1,
    Math.round(Math.sqrt(Math.max(1, ehp) * Math.max(1, edmg)) * SCALE * (1 + (s.spd || 0) * SPD_WEIGHT))
  );
}

/** formulas.scaleMonsterStats 와 같은 식. */
const scale = (s, p) => ({
  hp: Math.round(s.hp * p),
  atk: Math.round(s.atk * p),
  def: Math.round(s.def * p),
  spd: +(s.spd * (1 + (p - 1) * 0.25)).toFixed(2),
  crit: s.crit,
});

// 층마다 실제로 서 있는 잡몹(보스는 따로 잡는다).
const FLOOR_MONSTERS = {
  dungeon_1: ['elite_skeleton', 'elite_demon_soldier'],
  dungeon_2: ['elite_demon_soldier', 'dungeon_wraith'],
  dungeon_3: ['dungeon_wraith', 'dungeon_golem'],
  dungeon_4: ['dungeon_golem', 'elite_demon_general'],
  dungeon_5: ['dungeon_golem'],
};

// 기준 대비 목표(%). 1층이 요청받은 130% 이고, 그 위로 한 층씩 올라간다.
// 5층 잡몹(217%)이 보스(274%)를 넘지 않게 두는 것이 중요하다 —
// 잡몹이 보스보다 세면 보스방까지 가는 길이 보스보다 어려워진다.
const TARGET_PCT = {
  dungeon_1: 130,
  dungeon_2: 148,
  dungeon_3: 168,
  dungeon_4: 191,
  dungeon_5: 217,
};

// ─────────────────────────────────────────────────────────────
// 승률로 푸는 길 (--rate)
//
// 위의 "기준 대비 몇 %" 는 **몬스터끼리의 잣대**다. 기준(20단계 보스)이 세지면
// 목표도 같이 올라가는데, 그 사이 사람의 몸은 그대로라 실제 승률이 조용히 어긋난다.
// 실제로 보스 체력을 다시 잡은 뒤 2·3층이 목표보다 +18%p·+28%p 쉬워져 있었다.
//
// 그래서 tools/stage-solve.js 와 같은 방식을 하나 더 둔다 —
// **그 자리에 서 있을 법한 몸**으로 실제 전투를 돌려 승률이 목표에 닿게 배율을 찾는다.
// 지하감옥 앞층은 파밍하는 곳이므로 목표는 tools/balance.js 의 TRASH 표와 같은 70% 다.
// ─────────────────────────────────────────────────────────────

// [맵, 레벨, 강화, 장비단계, 목표승률]  — balance.js 의 TRASH 표와 같은 몸이어야 한다.
const RATE_REF = [
  ['dungeon_1', 42, 10, 20, 78],
  ['dungeon_2', 45, 10, 20, 70],
  ['dungeon_3', 50, 10, 20, 70],
  ['dungeon_4', 50, 10, 20, 62],
  ['dungeon_5', 50, 10, 20, 55],
];
const CLASSES = ['warrior', 'ranger', 'mage'];

async function solveByRate(write) {
  const { loadFrom, winRate } = require('./balance.js');
  const G = loadFrom(path.join(ROOT, 'src', 'data'));
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const i = process.argv.indexOf('--n');
  const samples = i >= 0 ? Number(process.argv[i + 1]) : 24;

  console.log('');
  console.log(`  지하감옥 배율 — 실제 승률로 푼다 · 표본 ${samples}판`);
  console.log('  ' + '─'.repeat(74));

  const solved = {};
  for (const [map, level, enh, tier, want] of RATE_REF) {
    const ids = FLOOR_MONSTERS[map] || [];
    // 그 층에서 **가장 어려운 놈** 상대 승률로 잰다.
    const rateAt = async (p) => {
      let worst = 100;
      for (const id of ids) {
        let sum = 0;
        for (const c of CLASSES) {
          const r = await winRate(simulateBattle, G, c, level, enh, tier, id, samples, p);
          sum += r ? r.rate : 0;
        }
        worst = Math.min(worst, sum / CLASSES.length);
      }
      return worst;
    };
    let lo = 1;
    let hi = 80;
    for (let k = 0; k < 11; k++) {
      const mid = (lo + hi) / 2;
      if ((await rateAt(mid)) > want) lo = mid;
      else hi = mid;
    }
    const p = +((lo + hi) / 2).toFixed(3);
    solved[map] = p;
    const got = await rateAt(p);
    const was = G['maps.json'].maps[map].power;
    console.log(
      '  ' + map.replace('dungeon_', '').padEnd(6) +
      `${was} → ${p}`.padEnd(22) +
      `승률 ${String(Math.round(got)).padStart(3)}%  (목표 ${want}%)`
    );
  }
  if (write) writeBack(solved);
  else {
    console.log('');
    console.log('  --write 를 붙이면 tools/gen-dungeon.js 의 배율표를 고칩니다.');
    console.log('');
  }
}

function main() {
  if (process.argv.includes('--rate')) {
    return solveByRate(process.argv.includes('--write'));
  }
  const monsters = read('monsters.json');
  const maps = read('maps.json').maps;
  const write = process.argv.includes('--write');

  const refStats = scale(monsters.elite_demon_general.stats, maps.field_20.power);
  const ref = power(refStats);

  console.log('');
  console.log(`  기준 — 강화된 발가르 @ 20단계 필드 · 전투력 ${ref.toLocaleString()}`);
  console.log('  ' + '─'.repeat(74));
  console.log(
    '  ' + '층'.padEnd(8) + '배율'.padEnd(20) + '가장 센 놈'.padEnd(22) + '기준 대비'
  );

  const solved = {};
  for (const [map, ids] of Object.entries(FLOOR_MONSTERS)) {
    const want = (ref * TARGET_PCT[map]) / 100;
    // 그 층에서 가장 센 놈이 목표에 닿게 맞춘다.
    const hardest = (p) => {
      let best = null;
      for (const id of ids) {
        const st = monsters[id];
        if (!st) continue;
        const v = power(scale(st.stats, p));
        if (!best || v > best.v) best = { id, v, name: st.name };
      }
      return best;
    };

    let lo = 0.1;
    let hi = 400;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (hardest(mid).v < want) lo = mid;
      else hi = mid;
    }
    const p = +((lo + hi) / 2).toFixed(3);
    const h = hardest(p);
    solved[map] = p;

    const was = maps[map].power;
    console.log(
      '  ' +
        map.replace('dungeon_', '').padEnd(8) +
        `${was} → ${p}`.padEnd(20) +
        `${h.name}`.padEnd(22) +
        `${Math.round((h.v / ref) * 100)}%  (목표 ${TARGET_PCT[map]}%)`
    );
    for (const id of ids) {
      const st = monsters[id];
      if (!st || id === h.id) continue;
      const v = power(scale(st.stats, p));
      console.log('  ' + ' '.repeat(28) + `${st.name}`.padEnd(22) + `${Math.round((v / ref) * 100)}%`);
    }
  }

  // 보스는 배율을 그대로 받는다 — 5층 배율이 바뀌면 보스도 함께 세진다.
  const bossP = power(scale(monsters.dungeon_lord.stats, solved.dungeon_5));
  console.log('');
  console.log(
    `  5층 보스 · ${monsters.dungeon_lord.name} → ${Math.round((bossP / ref) * 100)}% ` +
      `(잡몹 ${TARGET_PCT.dungeon_5}% 위에 서 있어야 한다)`
  );

  if (!write) {
    console.log('');
    console.log('  --write 를 붙이면 tools/gen-maps.js 의 배율표를 고칩니다.');
    console.log('');
    return;
  }

  writeBack(solved);
}

/** 푼 배율을 tools/gen-dungeon.js 에 적는다. 두 푸는 방식이 함께 쓴다. */
function writeBack(solved) {
  const genPath = path.join(ROOT, 'tools/gen-dungeon.js');
  let src = fs.readFileSync(genPath, 'utf8');
  let changed = 0;
  for (const [map, p] of Object.entries(solved)) {
    const floor = Number(map.replace('dungeon_', ''));
    // "power: 1.9" 형태를 층 순서대로 갈아 끼운다.
    const re = new RegExp(`(floor:\\s*${floor}[\\s\\S]{0,200}?power:\\s*)([0-9.]+)`);
    if (re.test(src)) {
      src = src.replace(re, `$1${p}`);
      changed++;
    }
  }
  if (changed) {
    fs.writeFileSync(genPath, src);
    console.log(`\n  ✓ tools/gen-dungeon.js 의 배율 ${changed}개를 고쳤습니다. \`npm run maps\` 로 반영하세요.\n`);
  } else {
    console.log('\n  ⚠ gen-dungeon.js 에서 배율표를 찾지 못했습니다. 손으로 고쳐야 합니다:');
    console.log('    ' + JSON.stringify(solved) + '\n');
  }
}

main();
