#!/usr/bin/env node
/**
 * 0.80.26 — 감옥의 주인(지하감옥 5층 보스)을 **Lv.50 +9 에 열에 일곱쯤**으로 다시 맞춘다(사용자 답 — 0.80.23 과 같은 자리).
 *
 *   node tools/lordfit26.js            찾아서 보여 준다
 *   node tools/lordfit26.js --write    maps.json(src · server/content) 의 dungeon_5.bossMult 에 적는다
 *
 * 몸은 tools/balance.js 의 bestWinRate(Lv.50 · 룬 한 벌 + 용의 인장 · 강화 +9 · 직업마다 가장 잘 이기는 트리) — 0.80.23 과 같은 잣대.
 * bossMult 의 **HP 만** 배율 s 로 곱해(방어 · 공격은 tools/rescale26.js 가 몸의 비로 맞춘 그대로) 세 직업 평균이 WANT 가 되는 s 를 반으로 나누어 찾는다.
 * 공격까지 올리면 몸이 가장 가벼운 사냥꾼만 홀로 무너지고(+9 에 27%), 방어까지 올리면 공격력이 가장 낮은 사냥꾼의
 * 한 대가 제곱으로 줄어 손 수 상한에 걸린다(+9 에 25% — 무승부가 열에 일곱).
 */
const fs = require('fs');
const path = require('path');
const B = require('./balance.js');
const WANT = Number(process.env.WANT || 75);
const WRITE = process.argv.includes('--write');
(async () => {
  process.chdir(path.join(__dirname, '..'));
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const base = { ...G['maps.json'].maps.dungeon_5.bossMult };
  const at = async (s, enh) => {
    G['maps.json'].maps.dungeon_5.bossMult = { hp: base.hp * s, def: base.def, atk: base.atk };
    const r = [];
    for (const c of ['warrior', 'ranger', 'mage']) r.push((await B.bestWinRate(simulateBattle, G, c, 50, enh, 20, 'dungeon_lord', 60, 'dungeon_5')).rate);
    return r;
  };
  let lo = Math.log(0.5), hi = Math.log(4);
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const r = await at(Math.exp(mid), 9);
    const avg = r.reduce((a, b) => a + b) / 3;
    if (avg > WANT) lo = mid; else hi = mid;
  }
  const s = Math.exp((lo + hi) / 2);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const mult = { hp: r3(base.hp * s), def: r3(base.def), atk: r3(base.atk) };
  for (const enh of [8, 9, 10]) {
    const r = await at(s, enh);
    console.log(`+${enh}: ${r.join(' / ')}  평균 ${Math.round(r.reduce((a, b) => a + b) / 3)}`);
  }
  console.log(`배율 ×${s.toFixed(3)} → bossMult ${JSON.stringify(mult)} (전: ${JSON.stringify(base)})`);
  if (WRITE) {
    for (const p of ['src/data/maps.json', 'server/content/maps.json']) {
      const M = JSON.parse(fs.readFileSync(p, 'utf8'));
      M.maps.dungeon_5.bossMult = mult;
      fs.writeFileSync(p, JSON.stringify(M, null, 2) + '\n');
      console.log(`✓ ${p}`);
    }
  }
})();
