#!/usr/bin/env node
/**
 * **지하감옥 5층 주인만 따로 잰다** — 사람이 정한 기준 몸으로.
 *
 *   node tools/dungeon-boss.js              룬 한 벌 +12 / +13 · 루비 세 알
 *   node tools/dungeon-boss.js --gems 5     루비 알 수를 바꾼다
 *   node tools/dungeon-boss.js --enh 12,13  강화 수치를 바꾼다
 *   node tools/dungeon-boss.js --n 80       표본 수(기본 48)
 *
 * ── 왜 따로 재나 ───────────────────────────────────────────
 * tools/balance.js 는 5층 주인을 **룬 한 벌 +10 · 홈 평균 보석**으로 잰다.
 * 그 몸으로는 세 직업 모두 0% 다. 0% 는 "조금 모자란다" 와 "아득하다" 를
 * 구별하지 못하므로, 이 자리를 고칠 때 무엇을 얼마나 움직여야 하는지 알 수가 없다.
 *
 * 여기서는 사람이 실제로 그 문 앞에 설 때의 몸으로 잰다 —
 * **룬 한 벌 +12~+13(12.5강 자리) · 루비 세 알**.
 *
 * ── 왜 '루비 세 알' 인가 ────────────────────────────────────
 * 홈을 전부 채운 몸은 "끝까지 모은 사람" 이다. 지하 5층에 처음 내려가는 사람은
 * 그 앞이 아니다 — 보석 몇 알을 겨우 박아 둔 몸이다. 그래서 홈은 비워 두고
 * **루비 세 알 값(공격력 +8% × 3)만** 얹는다. 알 수는 --gems 로 바꾼다.
 */
const B = require('./balance.js');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 48)) || 48;
const LEVEL = Number(opt('lv', 50)) || 50;
const GEMS = Number(opt('gems', 3));
const ENHS = String(opt('enh', '12,13')).split(',').map(Number).filter((x) => x > 0);

// 룬 한 벌 — balance.js 의 GEAR[20] 과 같은 벌.
const GEAR = {
  warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
  wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots',
         'rune_belt', 'rune_amulet', 'dragon_ring'],
};

const PLACES = [
  ['dungeon_lord', 'dungeon_5', '5층 보스 · 감옥의 주인'],
  ['dungeon_golem', 'dungeon_5', '5층 잡몹 · 감옥 석상'],
];

const CLASSES = [['warrior', '용사'], ['ranger', '사냥꾼'], ['mage', '마법사']];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const maps = G['maps.json'].maps;

  // 루비 한 알이 주는 값은 표에서 읽는다(표를 고치면 여기도 따라 바뀐다).
  const gemRow = ((G['affixes.json'] || {})['보석'] || []).find((r) => r[0] === 'gem_ruby');
  const gemKey = gemRow ? String(gemRow[2]).split('.')[1] : 'atkPct';
  const gemVal = gemRow ? Number(gemRow[3]) : 0.08;

  function run(cls, enh, monId, mapId) {
    const base = G['monsters.json'][monId];
    const map = maps[mapId] || {};
    const pw = map.power || 1;
    const full = Math.round(base.stats.hp * pw);
    // 홈은 비운 몸('none')으로 세우고, 그 위에 루비 알 수만큼만 얹는다.
    const { stats, mods, weaponShape } = B.statsOf(G, cls, LEVEL, enh, 20, GEAR, 0, 'none');
    const m = { ...mods };
    m[gemKey] = (m[gemKey] || 0) + gemVal * GEMS;
    // ⚠ atkPct 는 StatBlock 이 **스탯에** 곱하는 값이다(전투 보정이 아니다).
    //   그래서 여기서 직접 공격력에 곱해 줘야 실제와 같은 몸이 된다.
    const st = { ...stats };
    if (gemKey === 'atkPct') { st.atk = Math.round(st.atk * (1 + gemVal * GEMS)); delete m.atkPct; }
    if (gemKey === 'hpPct') { st.hp = Math.round(st.hp * (1 + gemVal * GEMS)); delete m.hpPct; }

    const potions = B.potionsOf(G, 20);
    const magicPart = map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0);
    const dealt = [];
    let win = 0;
    const turns = [];
    for (let seed = 1; seed <= SAMPLES; seed++) {
      const r = simulateBattle({
        player: { name: 'p', level: LEVEL, ...st, maxHp: st.hp, weaponShape },
        monster: {
          name: base.name, level: base.level, hp: full, maxHp: full,
          atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
          spd: base.stats.spd, crit: base.stats.crit, magicPart,
          rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
          magicResist: Number(base.magicResist) > 0 ? Number(base.magicResist) : 0,
          school: base.school || 'physical',
        },
        seed,
        playerMods: m,
        playerTraits: G['classes.json'].list[cls].combat,
        potions,
      });
      if (r.winner === 'player') win++;
      const born = (r.snapshot && r.snapshot.monsters && r.snapshot.monsters[0]
        && r.snapshot.monsters[0].maxHp) || full;
      const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : born;
      dealt.push(Math.max(0, born - left));
      turns.push((r.turns || []).length);
    }
    dealt.sort((a, b) => a - b);
    turns.sort((a, b) => a - b);
    const per = dealt[Math.floor(dealt.length / 2)] || 0;
    return {
      rate: Math.round((win / SAMPLES) * 100),
      per, full,
      cut: Math.round((per / full) * 100),
      turns: turns[Math.floor(turns.length / 2)],
      atk: Math.round(st.atk), hp: Math.round(st.hp), def: Math.round(st.def),
    };
  }

  console.log('');
  console.log(`  지하감옥 5층 — 룬 한 벌 · Lv.${LEVEL} · 루비 ${GEMS}알 · 판마다 ${SAMPLES}번`);
  console.log(`  (감옥의 주인은 한 판에 눕히는 상대다 — 승률이 곧 답이다)`);
  for (const [monId, mapId, name] of PLACES) {
    const base = G['monsters.json'][monId];
    const pw = maps[mapId].power || 1;
    console.log('');
    console.log(`  ── ${name} ──`);
    console.log(`  체력 ${Math.round(base.stats.hp * pw).toLocaleString('en-US')}`
      + ` · 공격 ${Math.round(base.stats.atk * pw).toLocaleString('en-US')}`
      + ` · 방어 ${Math.round(base.stats.def * pw).toLocaleString('en-US')} (×${pw.toFixed(1)})`);
    console.log('  ' + pad('강화', 8) + pad('직업', 10) + padL('공격력', 8) + padL('체력', 9)
      + padL('방어', 8) + padL('한 판에', 10) + padL('승률', 8) + padL('수', 6));
    for (const enh of ENHS) {
      for (const [cls, kname] of CLASSES) {
        const r = run(cls, enh, monId, mapId);
        console.log('  ' + pad('+' + enh, 8) + pad(kname, 10)
          + padL(r.atk.toLocaleString('en-US'), 8)
          + padL(r.hp.toLocaleString('en-US'), 9)
          + padL(r.def.toLocaleString('en-US'), 8)
          + padL(r.cut + '%', 10) + padL(r.rate + '%', 8) + padL(r.turns, 6));
      }
    }
  }
  console.log('');
  console.log('  보스는 "몇 번 도전하면 이긴다" 가 좋은 자리입니다 — 20~70%.');
  console.log('');
})();
