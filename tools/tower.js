#!/usr/bin/env node
/**
 * 끝없는 탑 — 몸마다 몇 층까지 오르나 (0.80.22).
 *
 *   node tools/tower.js            직업 셋 × 몸 다섯, 몸마다 24번 올라 본다
 *   node tools/tower.js --n 60     더 많이(느리다)
 *
 * 게임과 같은 것을 쓴다: 층 짜기는 src/systems/TowerSystem.js, 전투는 CombatSystem,
 * 몸은 tools/balance.js 의 statsOf(사람이 짤 법한 트리 · 장비). 층 사이 HP 는 이어 가고
 * 보스 층을 깨면 다 채운다. 물약은 도전 내내 한 주머니(potionsOf)를 나눠 쓴다.
 *
 * ── 어떻게 읽나 ────────────────────────────────────────────
 * 25층 = 지하감옥 주인(그 땅 그대로). 그 위는 한 층마다 6% 씩 세진다.
 * 막 만렙을 찍은 몸이 20층대, 다 갖춘 몸이 30층대 — 그 위는 겨루는 자리.
 */
const path = require('path');
const B = require('./balance.js');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const RUNS = arg('--n', 24);

const BODIES = [
  { label: 'Lv.20 · +7 · 희귀 여섯', level: 20, enh: 7, tier: 'play15' },
  { label: 'Lv.30 · +7 · 룬', level: 30, enh: 7, tier: 20 },
  { label: 'Lv.40 · +8 · 룬', level: 40, enh: 8, tier: 20 },
  { label: 'Lv.50 · +9 · 룬', level: 50, enh: 9, tier: 20 },
  { label: 'Lv.50 · +10 · 룬(전설)', level: 50, enh: 10, tier: 20, grade: 'legendary' },
];

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const T = await import('../src/systems/TowerSystem.js');
  const G = B.loadFrom('src');
  const db = {
    maps: G['maps.json'],
    monsters: G['monsters.json'],
    items: G['items.json'],
    tower: require(path.join(__dirname, '..', 'src', 'data', 'tower.json')),
  };
  // 0.80.25 — --plain 이면 보스 특성을 빼고 잰다(특성이 얼마나 세게 만드나 견주기)
  if (args.includes('--plain')) db.tower = { ...db.tower, floors: db.tower.floors.map((r) => ({ ...r, affixes: 0 })) };
  const R = T.rules(db);
  // 0.80.25 — 보스 특성은 주마다 바뀐다. 오를 때마다 다른 주를 고른다(--week 로 한 주에 묶을 수 있다).
  const fixedWeek = args.includes('--week') ? arg('--week', T.weekOf()) : null;

  function climb(cls, body, seed0, planIdx = 0) {
    const { stats, mods, weaponShape } = B.statsOf(G, cls, body.level, body.enh, body.tier, null, planIdx, null, null, body.grade || null);
    const pot = B.potionsOf(G, body.tier);
    const stock = pot.stock.map((s) => ({ ...s }));
    let hp = stats.hp;
    let floor = 0;
    for (let f = 1; f <= 120; f++) {
      const plan = T.floorPlan(db, f, fixedWeek != null ? fixedWeek : 2900 + seed0);
      const monsters = plan.members.map((m) => ({
        name: m.def.name, level: m.def.level, ...m.def.stats, maxHp: m.def.stats.hp,
        magicPart: plan.magicPart || 0,
        rage: Number(m.def.rage) > 0 ? Number(m.def.rage) : 0,
        magicResist: Number(m.def.magicResist) > 0 ? Number(m.def.magicResist) : 0,
        school: m.def.school || 'physical',
        ...(m.aff ? { aff: { ...m.aff } } : {}), // 0.80.25 — 보스 특성
      }));
      const r = simulateBattle({
        player: { name: 'p', level: body.level, ...stats, maxHp: stats.hp, hp, weaponShape },
        monsters,
        seed: seed0 * 1000 + f,
        playerMods: mods,
        playerTraits: G['classes.json'].list[cls].combat,
        potions: { ...pot, stock },
      });
      for (const u of r.potionsUsed || []) {
        const s = stock.find((x) => x.id === u.id);
        if (s) s.count = Math.max(0, s.count - u.count);
      }
      if (r.winner !== 'player') break;
      floor = f;
      hp = Math.max(1, r.finalHp.player);
      if (plan.heal) hp = stats.hp;
    }
    return floor;
  }

  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
  console.log(`\n끝없는 탑 — 몸마다 ${RUNS}번 올라 본 층 (가운데값 · 위 1/4 · 가장 높이)   growth ${R.growth} · 보스 ${R.bossEvery}층마다\n`);
  console.log(pad('몸', 30) + ['warrior', 'ranger', 'mage'].map((c) => pad(c, 18)).join(''));
  for (const body of BODIES) {
    const cells = [];
    for (const cls of ['warrior', 'ranger', 'mage']) {
      // 사람은 몇 번 해 보고 잘 되는 트리로 찍는다 — 트리 후보마다 올라 보고 가운데값이 가장 높은 것
      let list = null;
      const plans = Math.max(1, (B.PLANS[cls] || []).length);
      for (let p = 0; p < plans; p++) {
        const l = [];
        for (let i = 1; i <= RUNS; i++) l.push(climb(cls, body, i, p));
        l.sort((a, b) => a - b);
        if (!list || l[Math.floor(l.length / 2)] > list[Math.floor(list.length / 2)]) list = l;
      }
      const med = list[Math.floor(list.length / 2)];
      const q3 = list[Math.floor(list.length * 0.75)];
      cells.push(pad(`${med} · ${q3} · ${list[list.length - 1]}`, 18));
    }
    console.log(pad(body.label, 30) + cells.join(''));
  }
  console.log('');
})();
