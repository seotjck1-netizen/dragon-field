#!/usr/bin/env node
/**
 * 구간 배율 풀이 — "이 단계의 평균 전투력이 이만큼이 되려면 맵 배율이 얼마여야 하나".
 *
 *   node tools/zone-solve.js            계산만 하고 보여 준다
 *   node tools/zone-solve.js --write    tools/gen-maps.js 의 배율표를 고친다
 *
 * 나눗셈으로 구할 수 없다. 전투력은 배율에 정비례하지 않는다 —
 * 방어력 항이 체력과 함께 곱해져 배율보다 빠르게 자라기 때문이다.
 * 그래서 한 단계마다 이분 탐색으로 배율을 찾는다.
 */
const fs = require('fs');
const path = require('path');
const { loadFrom } = require('./balance.js');
const { combatPower, scaled } = require('./zone-power.js');

const ROOT = path.resolve(__dirname, '..');
const G = loadFrom(path.join(ROOT, 'src', 'data'));
const maps = G['maps.json'].maps;
const mons = G['monsters.json'];

/**
 * 구간 설계.
 *
 * 규칙은 둘이다.
 *   ① 구간의 첫 땅은 방금 넘어온 보스보다 세다(문턱이 꺼지지 않게).
 *   ② 구간의 마지막 땅은 그 구간의 보스보다 약하다(보스가 보스답게).
 * from/to 는 그 구간 첫 단계와 끝 단계의 "평균 전투력" 목표다.
 */
const ZONES = [
  // 1구간은 게임을 배우는 자리다. 1단계는 그대로 두고(슬라임은 누구나 잡아야 한다)
  // 5단계까지만 완만히 올린다.
  { name: '1구간 (1~5단계)', stages: [1, 2, 3, 4, 5], from: 30, to: 600 },
  { name: '2구간 (6~10단계)', stages: [6, 7, 8, 9, 10], from: 1800, to: 3300 },
  { name: '3구간 (11~15단계)', stages: [11, 12, 13, 14, 15], from: 6000, to: 24000 },
  { name: '4구간 (16~20단계)', stages: [16, 17, 18, 19, 20], from: 58000, to: 330000 },
];

/**
 * 목표를 "그 땅에서 가장 센 놈"에 맞춘다.
 *
 * 한 단계에는 종이 둘 섞여 있고 둘의 세기가 배까지 차이 난다. 평균에 맞추면
 * 센 종이 있는 단계와 없는 단계가 번갈아 나와 난이도가 톱니처럼 오르내린다.
 * 가장 센 놈을 기준으로 잡으면 "이 땅에서 최악의 경우"가 단계마다 꾸준히 오른다.
 */
const AIM = 'max';

/** 그 맵의 잡몹 기준 전투력(배율 p 일 때) — AIM 이 정한다. */
function avgAt(stage, p) {
  const m = maps[`field_${stage}`];
  const list = m.monsters || [];
  const each = list.map((id) => combatPower(scaled(mons[id].stats, p)));
  if (AIM === 'max') return Math.max(...each);
  return each.reduce((a, b) => a + b, 0) / each.length;
}

/** 목표 평균이 나오는 배율. */
function solvePower(stage, target) {
  let lo = 0.2;
  let hi = 60;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (avgAt(stage, mid) < target) lo = mid;
    else hi = mid;
  }
  return +((lo + hi) / 2).toFixed(3);
}

function main() {
  const write = process.argv.includes('--write');
  const found = {};

  console.log('\n구간 배율 풀이\n');
  for (const z of ZONES) {
    const n = z.stages.length;
    const ratio = Math.pow(z.to / z.from, 1 / (n - 1));
    console.log(`── ${z.name}  기준 ${z.from} → ${z.to} (한 단계 ×${ratio.toFixed(3)})`);
    z.stages.forEach((s, i) => {
      const target = z.from * Math.pow(ratio, i);
      const p = solvePower(s, target);
      found[s] = p;
      const m = maps[`field_${s}`];
      const each = (m.monsters || [])
        .map((id) => `${mons[id].name} ${combatPower(scaled(mons[id].stats, p))}`)
        .join(' | ');
      console.log(
        `   ${String(s).padStart(2)}단계  배율 ${String(m.power).padStart(6)} → ${String(p).padStart(6)}` +
          `   기준 ${Math.round(avgAt(s, p))}  (${each})`
      );
    });
    console.log('');
  }

  if (!write) {
    console.log('  --write 를 붙이면 tools/gen-maps.js 의 배율표를 고칩니다.\n');
    return;
  }

  const file = path.join(ROOT, 'tools', 'gen-maps.js');
  let src = fs.readFileSync(file, 'utf8');

  // 1~10단계는 STAGES 표의 power 칸.
  // 이름으로 줄을 찾으면 이름을 고치는 순간 조용히 어긋나므로, 표에 적힌 순서로 센다.
  {
    const sm = /const STAGES = \[\n([\s\S]*?)\n\];/.exec(src);
    if (!sm) throw new Error('STAGES 표를 못 찾았습니다.');
    const rows = sm[1].split('\n');
    if (rows.length !== 10) throw new Error(`STAGES 가 10줄이 아닙니다 (${rows.length}줄).`);
    const fixed = rows.map((row, i) => {
      const p = found[i + 1];
      if (p == null) return row;
      if (!/power: [0-9.]+/.test(row)) throw new Error(`${i + 1}단계 줄에 power 가 없습니다.`);
      return row.replace(/power: [0-9.]+/, `power: ${p}`);
    });
    src = src.replace(sm[0], `const STAGES = [\n${fixed.join('\n')}\n];`);
  }

  // DEEP_POWER (11~20단계)
  const dm = /const DEEP_POWER = \[([^\]]*)\];/.exec(src);
  if (!dm) throw new Error('DEEP_POWER 를 못 찾았습니다.');
  const deep = dm[1].split(',').map((x) => Number(x.trim()));
  for (const [stage, p] of Object.entries(found)) {
    const n = Number(stage);
    if (n >= 11) deep[n - 11] = p;
  }
  src = src.replace(dm[0], `const DEEP_POWER = [${deep.join(', ')}];`);

  fs.writeFileSync(file, src, 'utf8');
  console.log('✓ tools/gen-maps.js 의 배율표를 고쳤습니다. `npm run maps` 로 반영하세요.\n');
}

if (require.main === module) main();
