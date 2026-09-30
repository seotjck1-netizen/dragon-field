#!/usr/bin/env node
/**
 * **용린 세트가 고룡의 갈림길인가** — 판수로 잰다.
 *
 *   node tools/dragon-gate.js            룬 한 벌 ↔ 용린 한 벌을 견준다
 *   node tools/dragon-gate.js --n 80     표본 수(기본 48)
 *   node tools/dragon-gate.js --lv 45    레벨(기본 50)
 *
 * ── 설계가 말하는 자리 ─────────────────────────────────────
 *   · 룬 한 벌  +10 → **20판 넘게** 걸리거나 아예 못 잡는다
 *   · 용린 한 벌 +10 → **5판 안에** 잡는다
 * 고룡은 체력이 이어진다(timedBoss 의 keepHp). 그래서 "이겼나"가 아니라
 * **한 판에 얼마나 깎나 → 몇 판이면 눕나**가 실제로 사람이 겪는 값이다.
 *
 * ── 왜 판수인가 ────────────────────────────────────────────
 * 승률로 재면 0% 가 두 가지를 뜻한다 — "스무 판 걸린다" 와 "영영 못 잡는다".
 * 사람에게는 전혀 다른 자리인데 숫자가 같다. 판수로 재면 갈라진다.
 *
 * ⚠ 용린 4세트의 '고룡전 한정' 줄(힘·민첩·지능 +100 · 피해 2배)은 **여기서만**
 *   켠다. balance.js 의 다른 자리는 그 줄을 꺼 둔다 — 평소 사냥을 재는 자리에서
 *   켜면 있지도 않은 힘으로 재게 되기 때문이다(statsOf 의 foes 인자).
 */
const path = require('path');
const B = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 48)) || 48;
const LEVEL = Number(opt('lv', 50)) || 50;
const ENH = Number(opt('enh', 10)) || 10;
// 홈에 박을 보석. --gem ruby 를 주면 "끝까지 모은 사람"(천장 몸)으로 잰다.
const GEM = opt('gem', null) ? `gem_${opt('gem', null)}` : null;

// 재 볼 상대. [몬스터id, 맵, 이름]
const DRAGONS = [
  ['great_dragon', 'west_cliff', '고룡 1단계 · 카르나크'],
  ['elder_dragon', 'dragon_lair', '고룡 2단계 · 아그라모스'],
];

// 견줄 두 벌.
//
// ⚠ 용린은 **네 부위**를 다 갖춰야 세트가 완성된다 — 투구·갑옷·어깨 + 직업 무기.
//   balance.js 의 GEAR[15] 는 무기가 화염검/장궁이라 3/4 뿐이다. 그 몸으로 재면
//   "용린을 입어도 별것 없다" 는 잘못된 답이 나온다. 그래서 여기서 따로 짠다.
const SETS = [
  {
    key: 'rune',
    label: '룬 한 벌 +' + ENH,
    gear: {
      warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
      wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'],
    },
    want: '20판 넘게 걸리거나 못 잡는다',
  },
  {
    key: 'dragonscale',
    label: '용린 한 벌 +' + ENH + ' (4/4)',
    gear: {
      warrior: 'dragon_knight_sword', ranger: 'dragon_knight_bow', mage: 'dragon_knight_staff',
      wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'],
    },
    want: '5판 안에 잡는다',
  },
];

const CLASSES = [['warrior', '용사'], ['ranger', '사냥꾼'], ['mage', '마법사']];

/**
 * 용린 4세트(고룡전 한정) 값을 **표를 고치지 않고** 그 자리에서 바꿔 재 본다.
 *
 *   --try 0/0.5/0.75/0.2    특성+0 · 피해+50% · 관통+75% · 마법저항+20%
 *   --try 0/0.5/0.75/0.2,0/1/0.75/0.3   여러 벌을 한 번에
 *
 * 값을 표에 적기 전에 몇 벌을 훑어 보려고 있는 것이다 — 표를 고쳐 가며 재면
 * 어느 값으로 잰 표인지 금세 헷갈린다(실제로 그랬다).
 */
function parseTry(text) {
  return String(text).split(',').map((one) => {
    const [t, d, p, mr] = one.split('/').map(Number);
    return { trait: t || 0, damageMult: d || 0, pierce: p || 0, magicResist: mr || 0,
             label: `특성+${t || 0} · 피해+${Math.round((d || 0) * 100)}%`
               + ` · 관통+${Math.round((p || 0) * 100)}% · 마법저항+${Math.round((mr || 0) * 100)}%` };
  });
}

/** 표의 용린 4세트 줄을 이 값으로 갈아 끼운다(메모리 안에서만). */
function applyTry(G, t) {
  const set = (G['affixes.json'] || {})['세트'].dragonscale;
  set['효과'] = (set['효과'] || []).filter((r) => Array.isArray(r)); // 2·3세트 줄만 남긴다
  set['효과'].push({
    '개수': 4,
    '글': `고룡 앞에서 용린이 깨어난다 — 주는 피해 +${Math.round(t.damageMult * 100)}% · 방어 관통 +${Math.round(t.pierce * 100)}%`,
    '상대': ['great_dragon', 'elder_dragon'],
    '특성': { strength: t.trait, agility: t.trait, intellect: t.trait },
    '보정': { damageMult: t.damageMult, pierce: t.pierce, magicResist: t.magicResist },
  });
}

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const maps = G['maps.json'].maps;
  const TRY = opt('try', null) ? parseTry(opt('try', null)) : [null];

  /** 한 판에 얼마나 깎나 → 몇 판이면 눕나. */
  function fight(cls, set, monId, mapId) {
    const base = G['monsters.json'][monId];
    const map = maps[mapId] || {};
    const pw = map.power || 1;
    const full = Math.round(base.stats.hp * pw);
    // 고룡전이므로 '상대' 가 붙은 세트 줄을 켠다.
    const { stats, mods, weaponShape } = B.statsOf(G, cls, LEVEL, ENH, 20, set.gear, 0, GEM, [monId]);
    const potions = B.potionsOf(G, 20);
    const magicPart = map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0);
    const dealt = [];
    let win = 0;
    for (let seed = 1; seed <= SAMPLES; seed++) {
      const r = simulateBattle({
        player: { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape },
        monster: {
          name: base.name, level: base.level,
          hp: full, maxHp: full,
          atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
          spd: base.stats.spd, crit: base.stats.crit,
          magicPart,
          rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
          // 표의 '마법저항' 칸 — 안 실어 보내면 게임과 다른 상대를 재게 된다.
          magicResist: Number(base.magicResist) > 0 ? Number(base.magicResist) : 0,
          school: base.school || 'physical',
        },
        seed,
        playerMods: mods,
        playerTraits: G['classes.json'].list[cls].combat,
        potions,
      });
      if (r.winner === 'player') win++;
      // ⚠ 깎은 양은 **그 판의 몸**에서 뺀다. 기세(MONSTER_MOOD)가 판마다 체력을
      //   ±35% 흔들기 때문에, 표에 적힌 체력에서 빼면 기세가 센 판은 깎은 양이
      //   0 으로 찍힌다(실제로 룬 한 벌이 '못 잡음' 으로 나왔다 — 사실은 깎고 있었다).
      const born = (r.snapshot && r.snapshot.monsters && r.snapshot.monsters[0]
        && r.snapshot.monsters[0].maxHp) || full;
      const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : born;
      dealt.push(Math.max(0, born - left));
    }
    dealt.sort((a, b) => a - b);
    const per = dealt[Math.floor(dealt.length / 2)] || 0;
    return {
      full, per,
      // 한 판에 한 대도 못 깎으면 영영 못 잡는다.
      fights: per > 0 ? Math.ceil(full / per) : null,
      rate: Math.round((win / SAMPLES) * 100),
      pierce: +(mods.pierce || 0).toFixed(3),
      magicResist: +(mods.magicResist || 0).toFixed(3),
      atk: Math.round(stats.atk),
    };
  }

  console.log('');
  console.log(`  용린 세트가 갈림길인가 — Lv.${LEVEL} · +${ENH}`
    + (GEM ? ` · 홈 전부 ${GEM.replace('gem_', '')}` : '') + ` · 판마다 ${SAMPLES}번`);
  for (const t of TRY) {
  if (t) { applyTry(G, t); console.log(''); console.log(`  ▶ 시험값 — ${t.label}`); }
  for (const [id, mapId, name] of DRAGONS) {
    console.log('');
    console.log(`  ── ${name} ──`);
    console.log('  ' + pad('장비', 22) + pad('직업', 10) + padL('공격력', 8)
      + padL('관통', 7) + padL('마법저항', 9) + padL('한 판에', 12) + padL('판수', 8) + padL('승률', 7));
    for (const set of SETS) {
      for (const [cls, kname] of CLASSES) {
        const r = fight(cls, set, id, mapId);
        console.log('  ' + pad(set.label, 22) + pad(kname, 10)
          + padL(r.atk.toLocaleString('en-US'), 8)
          + padL(Math.round(r.pierce * 100) + '%', 7)
          + padL(Math.round(r.magicResist * 100) + '%', 9)
          + padL(r.per.toLocaleString('en-US'), 12)
          + padL(r.fights == null ? '못 잡음' : r.fights + '판', 8)
          + padL(r.rate + '%', 7));
      }
    }
    console.log(`  (체력 ${Math.round((G['monsters.json'][id].stats.hp) * (maps[mapId].power || 1)).toLocaleString('en-US')} — 판마다 이어집니다)`);
  }
  }
  console.log('');
  console.log('  바라는 자리 — 룬: 20판 넘게 걸리거나 못 잡음 · 용린: 5판 안에');
  console.log('');
})();
