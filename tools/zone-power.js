#!/usr/bin/env node
/**
 * 구간 문턱 검사 — "보스를 넘으면 그 다음 땅이 더 세야 한다".
 *
 *   node tools/zone-power.js
 *
 * 보스가 있는 단계의 문을 지나면 다음 구간이 시작된다. 그 첫 땅의 잡몹이
 * 방금 잡은 보스보다 약하면, 힘들게 문을 연 보람이 없고 난이도가 한 번 푹 꺼진다.
 * 여기서는 그 두 수치를 나란히 찍어 문턱이 살아 있는지 본다.
 */
const path = require('path');
const { loadFrom } = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const G = loadFrom(path.join(ROOT, 'src', 'data'));

const POWER = { DEF_WEIGHT: 0.55, SPD_WEIGHT: 0.004, SCALE: 1.6, CRIT: 1.75 };

function combatPower(s) {
  const ehp = s.hp * (1 + (s.def * POWER.DEF_WEIGHT) / 100);
  const edmg = s.atk * (1 + (s.crit || 0) * (POWER.CRIT - 1));
  const raw = Math.sqrt(Math.max(1, ehp) * Math.max(1, edmg));
  return Math.max(1, Math.round(raw * POWER.SCALE * (1 + (s.spd || 0) * POWER.SPD_WEIGHT)));
}

/** 맵 배율이 적용된 몬스터 스탯. formulas.scaleMonsterStats 와 같은 규칙. */
function scaled(stats, power) {
  return {
    hp: Math.round(stats.hp * power),
    atk: Math.round(stats.atk * power),
    def: Math.round(stats.def * power),
    spd: +(stats.spd * (1 + (power - 1) * 0.25)).toFixed(2),
    crit: stats.crit,
  };
}

const maps = G['maps.json'].maps;
const mons = G['monsters.json'];

function powerOf(mapId, monId) {
  const m = maps[mapId];
  const d = mons[monId];
  if (!m || !d) return null;
  return combatPower(scaled(d.stats, m.power || 1));
}

function main() {
  const rows = [];
  for (let n = 1; n <= 20; n++) {
    const id = `field_${n}`;
    const m = maps[id];
    if (!m || !m.boss) continue;
    const nextId = `field_${n + 1}`;
    if (!maps[nextId]) continue;

    const boss = { id: m.boss, power: powerOf(id, m.boss), name: mons[m.boss].name };
    const trash = (maps[nextId].monsters || []).map((mid) => ({
      id: mid,
      name: mons[mid].name,
      power: powerOf(nextId, mid),
    }));
    rows.push({ n, boss, nextId, nextName: maps[nextId].name, trash });
  }

  console.log('\n구간 문턱 — 보스 전투력 vs 그 다음 땅의 잡몹\n');
  let bad = 0;
  for (const r of rows) {
    // "지역의 전투력"은 그 땅에 사는 놈들의 평균으로 본다.
    // 한 마리만 유독 약한 종이 섞여 있다고 해서 그 땅이 약한 것은 아니다.
    const avg = Math.round(r.trash.reduce((a, b) => a + b.power, 0) / r.trash.length);
    r.avg = avg;
    const ok = avg > r.boss.power;
    if (!ok) bad++;
    console.log(
      `  ${r.n}단계 보스 ${r.boss.name} ${String(r.boss.power).padStart(6)}` +
        `  →  ${r.nextName}`
    );
    for (const t of r.trash) {
      console.log(
        `      ${t.name.padEnd(14)} ${String(t.power).padStart(6)}` +
          `  (보스 대비 ${(t.power / r.boss.power).toFixed(2)}배)`
      );
    }
    console.log(ok ? '      ✓ 문턱이 살아 있다\n' : '      ❌ 다음 땅이 더 약하다 — 난이도가 꺼진다\n');
  }
  if (!rows.length) console.log('  검사할 구간이 없습니다.\n');
  return bad;
}

if (require.main === module) process.exitCode = main() ? 1 : 0;
module.exports = { combatPower, scaled };
