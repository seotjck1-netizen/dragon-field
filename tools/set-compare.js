#!/usr/bin/env node
/**
 * **어느 한 벌이 어디에서 세야 하는가** — 세 벌을 같은 자리에 세워 견준다.
 *
 *   node tools/set-compare.js           룬 · 용린 · 전설을 자리마다 견준다
 *   node tools/set-compare.js --n 60    표본 수(기본 36)
 *   node tools/set-compare.js --lv 45   레벨(기본 45)
 *
 * ── 설계가 말하는 자리 (사람이 정한 것) ──────────────────────
 *   · **용린은 고룡에게만 세야 한다.** 그래서 세트 덤이 '고룡과 싸울 때' 붙는다.
 *   · 나머지 보스에게는 **룬이나 전설**이 세야 한다.
 *
 * 이 자가 보는 것은 딱 하나다 —
 *   고룡이 아닌 자리에서 용린이 룬·전설보다 세면 **틀린 것**이다.
 *
 * ── 왜 따로 재나 ───────────────────────────────────────────
 * tools/dragon-build.js 는 고룡만 본다. 그런데 용린이 잘못되는 자리는
 * **고룡이 아닌 곳**이다 — 거기서 세면 "고룡용 한 벌" 이 그냥 "제일 좋은 한 벌"이 된다.
 * 상시로 붙는 세트 덤(2개 공격력·3개 마법저항)이 그 길이다.
 */
const B = require('./balance.js');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 36)) || 36;
const LEVEL = Number(opt('lv', 45)) || 45;
const ENH = Number(opt('enh', 15)) || 15;
const GEM = opt('gem', null) ? `gem_${opt('gem', null)}` : 'none';

// 견줄 세 벌. 장신구·장갑·신발은 셋 다 같은 것을 쓴다 —
// 다르면 무엇 때문에 세진 것인지 알 수 없다.
const COMMON = ['rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'];
const SETS = [
  {
    key: 'rune', label: '룬 한 벌',
    gear: {
      warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
      wear: ['rune_helm', 'rune_mail', 'rune_pauldron', ...COMMON],
    },
  },
  {
    key: 'dragonscale', label: '용린 한 벌 (4/4)',
    gear: {
      warrior: 'dragon_knight_sword', ranger: 'dragon_knight_bow', mage: 'dragon_knight_staff',
      wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', ...COMMON],
    },
  },
  {
    key: 'legend', label: '전설 섞은 한 벌',
    gear: {
      warrior: 'dragonslayer', ranger: 'skypiercer', mage: 'worldtree_staff',
      wear: ['rune_helm', 'dragonscale_plate', 'rune_pauldron', ...COMMON],
    },
  },
];

// 걸어 볼 자리. dragon 이 true 면 "용린이 세도 되는 곳" 이다.
const PLACES = [
  ['elite_demon_general', 'field_20', '20단계 보스 · 발가르', false],
  ['dungeon_golem', 'dungeon_3', '지하 3층 · 감옥 석상', false],
  ['dungeon_general', 'dungeon_4', '지하 4층 · 봉인된 장군', false],
  ['dungeon_lord', 'dungeon_5', '지하 5층 보스 · 감옥의 주인', false],
  ['great_dragon', 'west_cliff', '고룡 1단계 · 카르나크', true],
  ['elder_dragon', 'dragon_lair', '고룡 2단계 · 아그라모스', true],
];

const CLASSES = [['warrior', '용사'], ['ranger', '사냥꾼'], ['mage', '마법사']];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const maps = G['maps.json'].maps;

  /** 한 판에 상대 체력의 몇 %를 깎나. 승률이 0% 로 뭉개지는 자리에서도 보인다. */
  function cut(cls, set, monId, mapId, isDragon) {
    const base = G['monsters.json'][monId];
    const map = maps[mapId] || {};
    const pw = map.power || 1;
    const full = Math.round(base.stats.hp * pw);
    // 고룡전에서만 '상대' 가 붙은 세트 줄을 켠다 — 게임이 하는 일과 같다.
    const foes = isDragon ? [monId] : null;
    const { stats, mods, weaponShape } =
      B.statsOf(G, cls, LEVEL, ENH, 20, set.gear, 0, GEM, foes);
    const potions = B.potionsOf(G, 20);
    const magicPart = map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0);
    const got = [];
    let win = 0;
    for (let seed = 1; seed <= SAMPLES; seed++) {
      const r = simulateBattle({
        player: { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape },
        monster: {
          name: base.name, level: base.level, hp: full, maxHp: full,
          atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
          spd: base.stats.spd, crit: base.stats.crit, magicPart,
          rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
          magicResist: Number(base.magicResist) > 0 ? Number(base.magicResist) : 0,
          school: base.school || 'physical',
        },
        seed,
        playerMods: mods,
        playerTraits: G['classes.json'].list[cls].combat,
        potions,
      });
      if (r.winner === 'player') win++;
      const born = (r.snapshot && r.snapshot.monsters && r.snapshot.monsters[0]
        && r.snapshot.monsters[0].maxHp) || full;
      const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : born;
      got.push(Math.max(0, born - left) / born);
    }
    got.sort((a, b) => a - b);
    return {
      cut: got[Math.floor(got.length / 2)] * 100,
      rate: Math.round((win / SAMPLES) * 100),
    };
  }

  console.log('');
  console.log(`  세 벌 견주기 — Lv.${LEVEL} · +${ENH} · 홈 ${GEM === 'none' ? '빈칸' : GEM.replace('gem_', '')}`
    + ` · 판마다 ${SAMPLES}번`);
  console.log('  (숫자는 **한 판에 깎는 몫**. 클수록 센 한 벌이다)');

  const bad = [];
  for (const [monId, mapId, name, isDragon] of PLACES) {
    console.log('');
    console.log(`  ── ${name}${isDragon ? '   ← 용린이 세도 되는 곳' : ''} ──`);
    console.log('  ' + pad('직업', 10) + SETS.map((s) => padL(s.label, 18)).join(''));
    for (const [cls, kname] of CLASSES) {
      const vals = SETS.map((s) => cut(cls, s, monId, mapId, isDragon));
      const best = Math.max(...vals.map((v) => v.cut));
      console.log('  ' + pad(kname, 10) + vals.map((v) => padL(
        `${v.cut.toFixed(1)}%${v.cut === best ? ' ◀' : '  '}`, 18)).join(''));
      // 고룡이 아닌데 용린이 제일 세면 설계와 어긋난다.
      const ds = vals[1].cut;
      const others = Math.max(vals[0].cut, vals[2].cut);
      if (!isDragon && ds > others * 1.02) {
        bad.push(`${name} · ${kname} — 용린 ${ds.toFixed(1)}% > 룬·전설 ${others.toFixed(1)}%`);
      }
    }
  }

  console.log('');
  if (bad.length) {
    console.log('  ✗ 고룡이 아닌 자리에서 용린이 더 셉니다 —');
    for (const b of bad) console.log(`     · ${b}`);
    console.log('     상시로 붙는 세트 덤을 고룡전 한정으로 옮기세요.');
  } else {
    console.log('  ✓ 고룡이 아닌 자리에서는 룬이나 전설이 더 셉니다.');
  }
  console.log('');
})();
