#!/usr/bin/env node
/**
 * **고룡 앞에서 어떤 몸이 어디쯤 서는가** — 빌드를 격자로 훑어 잰다.
 *
 *   node tools/dragon-build.js               표로 본다
 *   node tools/dragon-build.js --json 파일     그래프용 JSON 으로 뱉는다
 *   node tools/dragon-build.js --n 60        표본 수(기본 36)
 *   node tools/dragon-build.js --lv 45       레벨(기본 45)
 *
 * ── 기준 몸 (사람이 정한 자리) ──────────────────────────────
 *   · 레벨 45 · 초월 +15
 *   · 홈(보석)은 **비운 몸**이 기본. 다 채운 몸도 함께 잰다.
 *   · 특성·스킬은 **공격 위주**와 **방어 위주** 두 갈래로 따로 잰다.
 *   · 전설 장비(용살자·용비늘 성갑·천공궁…)는 **넣지 않는다** —
 *     그건 이미 고룡을 잡은 사람이 갖는 물건이라, 고룡의 문턱을 재는 잣대가 될 수 없다.
 *
 * ── 무엇을 보나 ────────────────────────────────────────────
 * 고룡은 체력이 판마다 이어진다(timedBoss 의 keepHp). 그래서 승률이 아니라
 * **몇 판이면 눕나**가 사람이 실제로 겪는 값이다.
 *   룬 한 벌  → 20판 넘게 걸리거나 못 잡는다
 *   용린 한 벌 → 5판 안에 잡는다
 */
const fs = require('fs');
const B = require('./balance.js');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 36)) || 36;
const LEVEL = Number(opt('lv', 45)) || 45;
const ENH = Number(opt('enh', 15)) || 15;
const OUT = opt('json', null);

const DRAGONS = [
  ['great_dragon', 'west_cliff', '고룡 1단계 · 카르나크'],
  ['elder_dragon', 'dragon_lair', '고룡 2단계 · 아그라모스'],
];

// 견줄 장비 한 벌. 전설은 일부러 넣지 않는다(위 주석 참고).
const SETS = [
  {
    key: 'rune', label: '룬 한 벌',
    gear: {
      warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
      wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'],
    },
  },
  {
    key: 'dragonscale', label: '용린 한 벌 (4/4)',
    gear: {
      warrior: 'dragon_knight_sword', ranger: 'dragon_knight_bow', mage: 'dragon_knight_staff',
      wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'],
    },
  },
];

// 홈 상태. 'none' 은 아예 비운 몸.
const SOCKETS = [
  { key: 'empty', label: '홈 빈칸', gem: 'none' },
  { key: 'ruby', label: '홈 루비(공격력)', gem: 'gem_ruby' },
  { key: 'diamond', label: '홈 다이아(관통)', gem: 'gem_diamond' },
];

// 특성·스킬을 어디로 몰았나.
const BUILDS = [
  { key: 'atk', label: '공격 위주', plan: { skill: 0, trait: 0 } },
  { key: 'def', label: '방어 위주', plan: { skill: 1, trait: 1 } },
];

const CLASSES = [['warrior', '용사'], ['ranger', '사냥꾼'], ['mage', '마법사']];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

/**
 * 용린 4세트(고룡전 한정) 값을 표를 고치지 않고 그 자리에서 바꿔 재 본다.
 *   --try 1/0.75/0.25        피해+100% · 관통+75% · 마법저항+25%
 *   --try 2/0.75/0.25,3/0.75/0.25   여러 벌을 한 번에
 */
function parseTry(text) {
  return String(text).split(',').map((one) => {
    const [d, p, mr] = one.split('/').map(Number);
    return { damageMult: d || 0, pierce: p || 0, magicResist: mr || 0,
             label: `피해+${Math.round((d || 0) * 100)}% · 관통+${Math.round((p || 0) * 100)}%`
               + ` · 마법저항+${Math.round((mr || 0) * 100)}%` };
  });
}
function applyTry(G, t) {
  const set = (G['affixes.json'] || {})['세트'].dragonscale;
  set['효과'] = (set['효과'] || []).filter((r) => Array.isArray(r));
  set['효과'].push({
    '개수': 4, '글': '고룡 앞에서 용린이 깨어난다',
    '상대': ['great_dragon', 'elder_dragon'],
    '보정': { damageMult: t.damageMult, pierce: t.pierce, magicResist: t.magicResist },
  });
}

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const G = B.loadFrom('src');
  const maps = G['maps.json'].maps;

  function run(cls, set, sock, build, monId, mapId) {
    const base = G['monsters.json'][monId];
    const map = maps[mapId] || {};
    const pw = map.power || 1;
    const full = Math.round(base.stats.hp * pw);
    // 고룡전이므로 '상대' 가 붙은 세트 줄(용린 4세트)을 켠다.
    const { stats, mods, weaponShape } =
      B.statsOf(G, cls, LEVEL, ENH, 20, set.gear, build.plan, sock.gem, [monId]);
    const potions = B.potionsOf(G, 20);
    const magicPart = map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0);
    const dealt = [];
    let win = 0;
    for (let seed = 1; seed <= SAMPLES; seed++) {
      const r = simulateBattle({
        player: { name: 'p', level: LEVEL, ...stats, maxHp: stats.hp, weaponShape },
        monster: {
          name: base.name, level: base.level, hp: full, maxHp: full,
          atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
          spd: base.stats.spd, crit: base.stats.crit, magicPart,
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
      // 깎은 양은 **그 판의 몸**에서 뺀다 — 기세가 체력을 ±35% 흔들기 때문이다.
      const born = (r.snapshot && r.snapshot.monsters && r.snapshot.monsters[0]
        && r.snapshot.monsters[0].maxHp) || full;
      const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : born;
      dealt.push(Math.max(0, born - left));
    }
    dealt.sort((a, b) => a - b);
    const per = dealt[Math.floor(dealt.length / 2)] || 0;
    return {
      per, full,
      fights: per > 0 ? Math.ceil(full / per) : null,
      rate: Math.round((win / SAMPLES) * 100),
      atk: Math.round(stats.atk), hp: Math.round(stats.hp), def: Math.round(stats.def),
      pierce: +(mods.pierce || 0).toFixed(3),
      magicResist: +(mods.magicResist || 0).toFixed(3),
    };
  }

  // ── --try : 값을 몇 벌 훑어 본다. 홈 빈칸(사람이 정한 기준)만 본다. ──
  if (opt('try', null)) {
    console.log('');
    console.log(`  용린 4세트 값 훑기 — Lv.${LEVEL} · +${ENH} · 홈 빈칸 · 판마다 ${SAMPLES}번`);
    console.log('  ' + '─'.repeat(76));
    console.log('  ' + pad('시험값', 42) + padL('용린 최악', 12) + padL('룬 최악', 12));
    for (const t of parseTry(opt('try', null))) {
      applyTry(G, t);
      const empty = SOCKETS.find((x) => x.key === 'empty');
      let worstSet = 0;
      let worstRune = Infinity;
      for (const [monId, mapId] of DRAGONS) {
        for (const build of BUILDS) {
          for (const [cls] of CLASSES) {
            const a = run(cls, SETS[1], empty, build, monId, mapId);
            const b = run(cls, SETS[0], empty, build, monId, mapId);
            worstSet = Math.max(worstSet, a.fights == null ? 999 : a.fights);
            worstRune = Math.min(worstRune, b.fights == null ? 999 : b.fights);
          }
        }
      }
      console.log('  ' + pad(t.label, 42) + padL(worstSet + '판', 12) + padL(worstRune + '판', 12));
    }
    console.log('');
    console.log('  바라는 자리 — 용린 최악 ≤ 5판 · 룬 최악 ≥ 20판');
    console.log('');
    return;
  }

  const rows = [];
  for (const [monId, mapId, dragon] of DRAGONS) {
    for (const set of SETS) {
      for (const sock of SOCKETS) {
        for (const build of BUILDS) {
          for (const [cls, kname] of CLASSES) {
            const r = run(cls, set, sock, build, monId, mapId);
            rows.push({
              dragon, monId, set: set.key, setLabel: set.label,
              socket: sock.key, socketLabel: sock.label,
              build: build.key, buildLabel: build.label,
              cls, clsName: kname, ...r,
            });
          }
        }
      }
    }
  }

  if (OUT) {
    fs.writeFileSync(OUT, JSON.stringify({
      level: LEVEL, enh: ENH, samples: SAMPLES,
      sets: SETS.map(({ key, label }) => ({ key, label })),
      sockets: SOCKETS.map(({ key, label }) => ({ key, label })),
      builds: BUILDS.map(({ key, label }) => ({ key, label })),
      classes: CLASSES.map(([key, label]) => ({ key, label })),
      dragons: DRAGONS.map(([id, , label]) => ({ id, label })),
      rows,
    }, null, 1));
    console.log(`✓ ${OUT} (${rows.length}칸 · 판마다 ${SAMPLES}번)`);
    return;
  }

  console.log('');
  console.log(`  고룡 앞의 빌드 — Lv.${LEVEL} · 초월 +${ENH} · 전설 장비 없음 · 판마다 ${SAMPLES}번`);
  for (const [, , dragon] of DRAGONS) {
    console.log('');
    console.log(`  ── ${dragon} ──`);
    console.log('  ' + pad('장비 · 홈', 28) + pad('빌드', 12)
      + CLASSES.map(([, n]) => padL(n, 10)).join(''));
    for (const set of SETS) {
      for (const sock of SOCKETS) {
        for (const build of BUILDS) {
          const cells = CLASSES.map(([cls]) => {
            const r = rows.find((x) => x.dragon === dragon && x.set === set.key
              && x.socket === sock.key && x.build === build.key && x.cls === cls);
            return padL(r.fights == null ? '못 잡음' : r.fights + '판', 10);
          }).join('');
          console.log('  ' + pad(`${set.label} · ${sock.label}`, 28) + pad(build.label, 12) + cells);
        }
      }
    }
  }
  console.log('');
  console.log('  바라는 자리 — 룬: 20판 넘게 걸리거나 못 잡음 · 용린: 5판 안에');
  console.log('');
})();
