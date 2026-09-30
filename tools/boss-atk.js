#!/usr/bin/env node
// 보스들이 **실제로 몇 대씩 때리는가** 를 잰다.
//
// 왜 따로 있나: monsters 표의 `atk` 은 맵 배율(maps.json 의 power)을 타기 전 숫자다.
// 그래서 표만 보면 고룡(1050)이 감옥의 주인(208)보다 다섯 배 세 보이지만,
// 감옥의 주인은 5층 배율 18.6 을 먹어 실제로는 세 배 넘게 더 때린다.
// "누가 더 센가" 는 표가 아니라 **한 대 맞으면 얼마나 아픈가** 로 재야 한다.
//
//   node tools/boss-atk.js              사다리를 표로 본다
//   node tools/boss-atk.js --n 60       표본 수(기본 40)
//
// 재는 몸: 지금 사람이 실제로 지하감옥과 고룡을 보러 갈 때의 차림 —
// 레벨 50, 룬 한 벌 +10. 그 몸에게 한 대가 얼마나 아픈지가 곧 체감이다.

const path = require('path');
const balance = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');

// 재는 것들. `boss` 인 줄은 **보스 사다리**로 따로 이어서 본다 —
// 층의 쫄과 그 층 보스를 한 줄로 세우면 "4층 보스가 5층 쫄보다 세다" 가 잘못으로 잡힌다.
// 그건 잘못이 아니다. 봐야 할 것은 두 가지다:
//   ① 같은 층 안에서 보스가 쫄보다 센가   ② 보스끼리 뒤로 갈수록 센가
const LADDER = [
  { map: 'dungeon_4', mon: 'dungeon_golem', label: '4층 쫄 · 감옥 석상', floor: 4 },
  { map: 'dungeon_4', mon: 'dungeon_general', label: '4층 보스 · 봉인된 장군', floor: 4, boss: true },
  { map: 'dungeon_5', mon: 'dungeon_golem', label: '5층 쫄 · 감옥 석상', floor: 5 },
  { map: 'dungeon_5', mon: 'dungeon_lord', label: '5층 보스 · 감옥의 주인', floor: 5, boss: true },
  { map: 'west_cliff', mon: 'great_dragon', label: '고룡 카르나크', floor: 6, boss: true },
  // 아그라모스는 **용린 4세트를 갖춘 몸**으로만 만나는 상대다. 여기서는 세트 없이 재므로
  // 숫자가 낮게 나온다 — 실제 세기는 tools/dragon2.js 가 세트를 입혀 따로 잰다.
  { map: 'dragon_lair', mon: 'elder_dragon', label: '아그라모스 (세트 없이 잰 값)', floor: 7, boss: true },
];

const CLASSES = ['warrior', 'ranger', 'mage'];
const LEVEL = 50;
const TIER = 20;   // 룬 한 벌
const ENH = 10;

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
const padL = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return ' '.repeat(Math.max(0, n - w)) + String(s);
};

(async () => {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf('--' + n);
    return i >= 0 ? Number(argv[i + 1]) : d;
  };
  const samples = flag('n', 40);

  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = balance.loadFrom('src');
  const maps = G['maps.json'].maps;

  const rows = [];
  for (const step of LADDER) {
    const monId = G['monsters.json'][step.mon] ? step.mon : step.fallback;
    if (!monId || !G['monsters.json'][monId]) continue;
    const base = G['monsters.json'][monId];
    const map = maps[step.map] || {};
    const power = map.power || 1;
    const eff = Math.round(base.stats.atk * power);

    // 한 대가 얼마나 아픈가 — 실제 전투를 돌려 몬스터가 준 피해의 중앙값을 본다.
    const hits = [];
    for (const cls of CLASSES) {
      const { stats, mods } = balance.statsOf(G, cls, LEVEL, ENH, TIER);
      const isBoss = !!(base.boss || map.boss === monId
        || (map.timedBoss && map.timedBoss.monster === monId));
      const magicPart = isBoss && map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0);
      const m = {
        ...base,
        stats: {
          hp: Math.round(base.stats.hp * power),
          atk: Math.round(base.stats.atk * power),
          def: Math.round(base.stats.def * power),
          spd: +(base.stats.spd * (1 + (power - 1) * 0.25)).toFixed(2),
          crit: base.stats.crit,
        },
      };
      for (let seed = 1; seed <= samples; seed++) {
        const r = simulateBattle({
          player: { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp },
          monster: { name: base.name, level: base.level, ...m.stats, maxHp: m.stats.hp, magicPart },
          seed,
          playerMods: mods,
          playerTraits: G['classes.json'].list[cls].combat,
        });
        for (const t of r.turns || []) {
          if (t.actor === 'monster' && t.damage > 0) hits.push(t.damage);
        }
      }
    }
    hits.sort((a, b) => a - b);
    const mid = hits.length ? hits[Math.floor(hits.length / 2)] : 0;
    rows.push({
      label: step.label, mon: monId, base: base.stats.atk, power, eff, hit: mid,
      floor: step.floor, boss: !!step.boss,
    });
  }

  console.log('\n  보스 공격력 사다리 — 레벨 50 · 룬 한 벌 +10 인 몸이 한 대에 받는 피해\n');
  console.log('  ' + pad('상대', 30) + padL('표의 공격력', 12) + padL('맵 배율', 9)
    + padL('실효 공격력', 13) + padL('한 대', 9));
  console.log('  ' + '─'.repeat(74));
  for (const r of rows) {
    console.log('  ' + pad(r.boss ? '★ ' + r.label : '   ' + r.label, 30)
      + padL(r.base.toLocaleString(), 12)
      + padL('×' + r.power, 9) + padL(r.eff.toLocaleString(), 13)
      + padL(r.hit.toLocaleString(), 9));
  }

  const bad = [];
  // ① 같은 층 — 보스가 쫄보다 세게 때리는가
  for (const b of rows.filter((r) => r.boss)) {
    for (const t of rows.filter((r) => !r.boss && r.floor === b.floor)) {
      if (b.hit <= t.hit) bad.push(`${b.label} 이 같은 층의 ${t.label} 보다 약합니다`);
    }
  }
  // ② 보스끼리 — 뒤로 갈수록 세지는가
  const bosses = rows.filter((r) => r.boss).sort((a, b) => a.floor - b.floor);
  for (let i = 1; i < bosses.length; i++) {
    if (bosses[i].hit <= bosses[i - 1].hit) {
      bad.push(`${bosses[i].label} 이 앞선 ${bosses[i - 1].label} 보다 약합니다`);
    }
  }

  console.log('');
  if (bad.length) {
    for (const b of bad) console.log('  ⚠ ' + b);
    process.exitCode = 1;
  } else {
    console.log('  ✓ 층마다 보스가 쫄보다 세고, 보스끼리도 뒤로 갈수록 세집니다.');
  }
})();
