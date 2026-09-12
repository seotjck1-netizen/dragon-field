#!/usr/bin/env node
// 지하감옥 1~5층 — 직업 × 레벨 × 장비 승률을 재서 JSON 으로 뱉는다.
//
// 왜 따로 있나: tools/balance.js 는 "이 한 판이 목표 승률에 맞나"를 본다.
// 여기서 알고 싶은 것은 다른 것이다 — **어디까지 키우고 어디까지 맞춰 입어야
// 그 층에 들어갈 만한가**. 그래서 레벨과 장비를 격자로 훑는다.
//
//   node tools/dungeon-sim.js            표로 본다
//   node tools/dungeon-sim.js --json 파일   그래프용 JSON 으로 뱉는다
//   node tools/dungeon-sim.js --n 200    표본 수(기본 120)

const fs = require('fs');
const path = require('path');
const balance = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data', f), 'utf8'));

// 층마다 "그 층에서 실제로 마주치는 것 중 가장 버거운 놈".
// 5층은 잡몹과 보스를 따로 본다 — 보스를 잡으러 가는 층이기 때문이다.
const FLOORS = [
  { floor: 1, map: 'dungeon_1', mon: 'elite_demon_soldier', label: '1층 · 강화된 악마 병사' },
  { floor: 2, map: 'dungeon_2', mon: 'dungeon_wraith', label: '2층 · 지하의 망령' },
  { floor: 3, map: 'dungeon_3', mon: 'dungeon_golem', label: '3층 · 감옥 석상' },
  { floor: 4, map: 'dungeon_4', mon: 'elite_demon_general', label: '4층 · 강화된 발가르' },
  { floor: 5, map: 'dungeon_5', mon: 'dungeon_golem', label: '5층 · 감옥 석상' },
  { floor: 5, map: 'dungeon_5', mon: 'dungeon_lord', label: '5층 보스 · 감옥의 주인', boss: true },
];

// 장비 사다리. 룬 앞은 지금 일부러 노가다 구간으로 두었으므로 그 단계도 넣는다.
const GEAR_STEPS = [
  { key: 'dragon+5', tier: 15, enh: 5, label: '용린 한 벌 +5', short: '용린+5' },
  { key: 'dragon+8', tier: 15, enh: 8, label: '용린 한 벌 +8', short: '용린+8' },
  { key: 'dragon+10', tier: 15, enh: 10, label: '용린 한 벌 +10 (보석 포함)', short: '용린+10' },
  { key: 'rune+8', tier: 20, enh: 8, label: '룬 한 벌 +8', short: '룬+8' },
  { key: 'rune+10', tier: 20, enh: 10, label: '룬 한 벌 +10 (보석 포함)', short: '룬+10' },
];

const LEVELS = [25, 30, 35, 40, 45, 50];
const CLASSES = [
  { id: 'warrior', name: '용사' },
  { id: 'ranger', name: '사냥꾼' },
  { id: 'mage', name: '마법사' },
];

(async () => {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 ? argv[i + 1] : d;
  };
  const samples = Number(flag('n', 120));
  const outFile = flag('json', null);

  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = balance.loadFrom('src');

  const rows = [];
  for (const f of FLOORS) {
    for (const g of GEAR_STEPS) {
      for (const lv of LEVELS) {
        for (const c of CLASSES) {
          const r = await balance.winRate(
            simulateBattle, G, c.id, lv, g.enh, g.tier, f.mon, samples, f.map
          );
          if (!r) continue;
          rows.push({
            floor: f.floor,
            target: f.label,
            boss: !!f.boss,
            gear: g.key,
            gearLabel: g.label,
            gearShort: g.short,
            level: lv,
            cls: c.id,
            clsName: c.name,
            rate: r.rate,
            turns: r.turns,
          });
        }
      }
    }
  }

  if (outFile) {
    fs.writeFileSync(
      outFile,
      JSON.stringify(
        {
          samples,
          levels: LEVELS,
          classes: CLASSES,
          gears: GEAR_STEPS.map(({ key, label, short }) => ({ key, label, short })),
          floors: FLOORS.map((f) => ({ floor: f.floor, label: f.label, boss: !!f.boss })),
          rows,
        },
        null,
        1
      )
    );
    console.log(`✓ ${outFile} (${rows.length}칸 · 표본 ${samples}판)`);
    return;
  }

  // 사람이 읽을 표
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
  const padL = (s, n) => ' '.repeat(Math.max(0, n - String(s).length)) + String(s);
  for (const f of FLOORS) {
    console.log('');
    console.log(`  ── ${f.label} ──`);
    console.log('  ' + pad('장비', 26) + LEVELS.map((l) => padL(`Lv.${l}`, 18)).join(''));
    for (const g of GEAR_STEPS) {
      let line = '  ' + pad(g.label, 26);
      for (const lv of LEVELS) {
        const cell = CLASSES.map((c) => {
          const r = rows.find(
            (x) => x.target === f.label && x.gear === g.key && x.level === lv && x.cls === c.id
          );
          return r ? padL(`${r.rate}%`, 5) : padL('-', 5);
        }).join('');
        line += padL(cell, 18);
      }
      console.log(line);
    }
    console.log('  ' + ' '.repeat(26) + LEVELS.map(() => padL('용사 사냥 법사', 18)).join(''));
  }
  console.log('');
})();
