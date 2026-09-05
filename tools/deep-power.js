#!/usr/bin/env node
/**
 * 심층(11~20단계) 몬스터를 목표 전투력에 맞춰 되돌려 계산한다.
 *
 *   node tools/deep-power.js            지금 상태를 보여만 준다
 *   node tools/deep-power.js --write    sheets/monsters.csv 와 DEEP_POWER 를 고친다
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 11단계 잡몹이 10단계 보스보다 약했다. 강화된 슬라임의 공격력이 121 인데
 * 바로 앞 단계 보스인 발가르가 246 이었으니, "강화된 땅"에 들어섰는데
 * 오히려 편해지는 이상한 구간이 있었다.
 *
 * 원인은 두 가지였다.
 *   ① 심층 몬스터의 밑값이 원래 몬스터에서 그대로 불려 온 것이라
 *      체력만 크고 공격력이 따라오지 않았다(체력 2330 에 공격 121).
 *   ② 단계 배율(DEEP_POWER)이 1.0 에서 시작해서, 11단계가 곧 "배율 없음"이었다.
 *
 * 그래서 여기서는 두 가지를 함께 푼다.
 *   · 밑값의 공격/체력 비율을 다시 잡는다(공격을 크게, 체력은 덜)
 *   · 목표 전투력 곡선에 맞도록 단계 배율을 역산한다
 *
 * ── 목표 곡선 ──────────────────────────────────────────────
 * 11단계에서 2500, 한 단계마다 RATIO 배. 20단계에서 약 15000 이 된다.
 * 그 구간의 캐릭터 전투력이 대략 1300 → 9300 이므로, 처음부터 끝까지
 * "나보다 1.6~1.9배 센 놈"이라는 감각이 이어진다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const F = require(path.join(ROOT, 'src/data/formulas.js'));

const START = 2500; // 11단계 목표 전투력
const RATIO = 1.22; // 한 단계마다
const STAGES = 10; // 11~20

/** 목표 전투력 — [11단계, …, 20단계] */
const TARGET = Array.from({ length: STAGES }, (_, i) => Math.round(START * Math.pow(RATIO, i)));

/**
 * 심층 잡몹의 새 밑값.
 *
 * 공격력을 크게 올리고 체력은 덜 올린다 — 예전에는 체력만 커서
 * "안 죽는데 아프지도 않은" 놈이었다. 맞으면 아파야 강화된 땅답다.
 * 방어력도 같이 올려 두면 전투력 숫자가 커지는 데 견주어 실제 피해가
 * 덜 늘어나므로, 방어는 완만하게만 올린다.
 */
const ELITE = {
  //                     hp,   atk,  def,  spd
  elite_slime: [3200, 300, 150, 16.2],
  elite_bat: [3300, 315, 155, 35.1],
  elite_mushroom: [3600, 340, 168, 13.5],
  elite_wolf: [3800, 360, 178, 45.9],
  elite_imp: [3950, 380, 186, 40.5],
  elite_skeleton: [4200, 405, 198, 32.4],
  elite_demon_soldier: [4500, 435, 212, 48.6],
};

/** 이 몬스터가 그 배율에서 보이는 전투력. */
function powerOf(stats, mult) {
  return F.combatPower(F.scaleMonsterStats(stats, mult));
}

function main() {
  const monsters = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/monsters.json'), 'utf8'));
  const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/maps.json'), 'utf8')).maps;

  // 새 밑값을 얹은 표(파일은 아직 안 건드린다)
  const next = {};
  for (const [id, [hp, atk, def, spd]] of Object.entries(ELITE)) {
    const old = monsters[id];
    if (!old) continue;
    next[id] = { ...old.stats, hp, atk, def, spd };
  }

  // 단계마다 "그 단계에 사는 놈들의 평균 전투력"이 목표에 닿는 배율을 찾는다.
  const powers = [];
  const report = [];
  for (let i = 0; i < STAGES; i++) {
    const n = 11 + i;
    const map = maps[`field_${n}`];
    if (!map) continue;
    const ids = (map.monsters || []).filter((m) => next[m]);
    if (!ids.length) {
      powers.push(1);
      continue;
    }
    // 전투력은 배율에 비례하지 않는다 — 방어력이 실효 체력을 부풀리는 항이
    // 배율과 함께 커지므로 위로 휜다. 그래서 나눗셈이 아니라 이분 탐색으로 찾는다.
    // (예전에 비례한다고 보고 나눴더니 19단계가 목표의 1.8배로 나왔다)
    const avgAt = (k) => ids.reduce((a, id) => a + powerOf(next[id], k), 0) / ids.length;
    let lo = 0.2;
    let hi = 12;
    for (let t = 0; t < 40; t++) {
      const k = (lo + hi) / 2;
      if (avgAt(k) < TARGET[i]) lo = k;
      else hi = k;
    }
    const mult = +((lo + hi) / 2).toFixed(3);
    powers.push(mult);

    const each = ids.map((id) => {
      const s = F.scaleMonsterStats(next[id], mult);
      return `${monsters[id].name} 전투력${powerOf(next[id], mult)}(공${s.atk}/체${s.hp})`;
    });
    report.push(
      `  ${String(n).padStart(2)}단계  목표 ${String(TARGET[i]).padStart(6)}  배율 ${String(mult).padEnd(6)}  ${each.join(', ')}`
    );
  }

  console.log('');
  console.log(`  심층 전투력 곡선 — 11단계 ${START}, 한 단계마다 ×${RATIO}`);
  console.log('  ' + '─'.repeat(76));
  console.log(report.join('\n'));
  console.log('');
  console.log('  DEEP_POWER = [' + powers.join(', ') + '];');
  console.log('');

  // 견줄 자리: 바로 앞 단계 보스보다 세야 한다.
  const boss10 = maps.field_10;
  const bp = powerOf(monsters[boss10.boss].stats, boss10.power);
  const ba = Math.round(monsters[boss10.boss].stats.atk * boss10.power);
  const first = maps.field_11.monsters.filter((m) => next[m]);
  const fp = Math.round(
    first.reduce((a, id) => a + powerOf(next[id], powers[0]), 0) / first.length
  );
  const fa = Math.round(
    first.reduce((a, id) => a + F.scaleMonsterStats(next[id], powers[0]).atk, 0) / first.length
  );
  console.log(`  10단계 보스  전투력 ${bp} · 공격 ${ba}`);
  console.log(`  11단계 잡몹  전투력 ${fp} · 공격 ${fa}   ` +
    (fp > bp && fa > ba ? '✓ 보스보다 세다' : '✗ 아직 약하다'));
  console.log('');

  if (!process.argv.includes('--write')) {
    console.log('  넣으려면 --write 를 붙이세요.');
    console.log('');
    return;
  }

  // ① sheets/monsters.csv 의 밑값을 고친다(시트가 표의 주인이다)
  const csvPath = path.join(ROOT, 'sheets/monsters.csv');
  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  let changed = 0;
  const out = lines.map((line) => {
    const c = line.split(',');
    const id = c[0].replace(/^﻿/, '');
    if (!ELITE[id]) return line;
    const [hp, atk, def, spd] = ELITE[id];
    c[3] = hp; c[4] = atk; c[5] = def; c[6] = spd;
    changed++;
    return c.join(',');
  });
  fs.writeFileSync(csvPath, out.join('\n'));

  // ② gen-maps.js 의 단계 배율을 고친다
  const genPath = path.join(ROOT, 'tools/gen-maps.js');
  let gen = fs.readFileSync(genPath, 'utf8');
  gen = gen.replace(
    /const DEEP_POWER = \[[^\]]*\];/,
    `const DEEP_POWER = [${powers.join(', ')}];`
  );
  fs.writeFileSync(genPath, gen);

  console.log(`  ✓ sheets/monsters.csv ${changed}줄 · tools/gen-maps.js 의 DEEP_POWER`);
  console.log('    이어서: node tools/sheets.js import && npm run maps');
  console.log('');
}

main();
