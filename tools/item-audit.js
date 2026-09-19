#!/usr/bin/env node
/**
 * 장비 감사(監査) 도구 — "하위 단계보다 약한 장비"를 찾아낸다.
 *
 *   node tools/item-audit.js            부위별 진행표 + 역전 경고
 *   node tools/item-audit.js --enh 9    +9 강화 기준으로 본다
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 아이템은 숫자가 여러 칸(공격·방어·HP·속도·치명)이라 눈으로 보면
 * "이게 저것보다 센가"를 알 수 없다. 실제로 지팡이 한 자루가 앞 단계보다
 * 약한 채로 몇 판을 나갔다. 그래서 전투력 공식(formulas.js 의 combatPower)
 * 하나로 환산해 한 줄로 세운다.
 *
 * 장비 하나만으로는 전투력을 낼 수 없으므로(HP 0 이면 0),
 * "그 단계의 표준 캐릭터"에 그 장비만 갈아 끼우고 전투력 차이를 잰다.
 * 이 차이가 곧 그 장비의 값어치다.
 *
 * ── 이 도구가 답하지 않는 것 ────────────────────────────────
 * 계열끼리의 비교(지팡이가 검보다 센가)는 여기서 판단하지 않는다.
 * 전투력 공식은 마법 학파도, 직업마다 다른 치명타 확률도 모른다 —
 * 그래서 지팡이의 "치명타 피해"는 여기서 과대평가되고 실제 전투에서는 덜 오른다.
 * 계열 사이의 균형은 실제 전투를 돌리는 tools/balance.js 가 정답이다.
 * 여기서 보는 것은 한 계열 안에서 단계가 거꾸로 가지 않는가, 그 하나다.
 */
const path = require('path');
const { loadFrom } = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const G = loadFrom(path.join(ROOT, 'src', 'data'));

const BAL = {
  DEF_WEIGHT: 0.55,
  SPD_WEIGHT: 0.004,
  SCALE: 1.6,
  CRIT_MULTIPLIER: 1.75,
};

// 등급별 강화 배율(formulas.js 와 같은 값을 읽는다)
const formulasSrc = require('fs').readFileSync(
  path.join(ROOT, 'src', 'data', 'formulas.js'),
  'utf8'
);
function readNumber(name, fallback) {
  const m = new RegExp(`${name}:\\s*([0-9.]+)`).exec(formulasSrc);
  return m ? Number(m[1]) : fallback;
}
const ENH_BASE = readNumber('ENHANCE_BONUS_PER_LEVEL', 0.16);
const RARITY_RATE = (() => {
  const m = /ENHANCE_BONUS_BY_RARITY:\s*\{([^}]*)\}/.exec(formulasSrc);
  const out = { common: 1, uncommon: 1, rare: 1, epic: 1, legendary: 1 };
  if (!m) return out;
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*([0-9.]+)/g)) out[k] = Number(v);
  return out;
})();

/** 강화가 붙은 장비 스탯. formulas.enhancedStats 와 같은 규칙. */
function enhanced(stats, enh, rarity) {
  const rate = ENH_BASE * (RARITY_RATE[rarity] != null ? RARITY_RATE[rarity] : 1);
  const mult = 1 + rate * enh;
  const out = {};
  for (const [k, v] of Object.entries(stats || {})) {
    out[k] = k === 'crit' || k === 'critDmg' ? +(v * mult).toFixed(4) : Math.round(v * mult);
  }
  return out;
}

function power(s, mods) {
  const m = mods || {};
  const ehp = s.hp * (1 + (s.def * BAL.DEF_WEIGHT) / 100) * (1 + (m.dmgReduction || 0));
  const critMult = BAL.CRIT_MULTIPLIER + (m.critMult || 0);
  const edmg =
    s.atk *
    (1 + (s.crit || 0) * (critMult - 1)) *
    (1 + (m.doubleHit || 0)) *
    (1 + (m.magicPower || 0) * 0.5);
  const raw = Math.sqrt(Math.max(1, ehp) * Math.max(1, edmg));
  return Math.max(1, Math.round(raw * BAL.SCALE * (1 + (s.spd || 0) * BAL.SPD_WEIGHT)));
}

// 부위별 "표준 캐릭터" — 장비 값어치를 재는 저울이다.
// 이 값 자체는 중요하지 않다(모든 장비를 같은 저울에 올리기만 하면 된다).
const BENCH = { hp: 700, atk: 160, def: 90, spd: 22, crit: 0.08 };

/** 이 장비 하나가 표준 캐릭터에게 더해 주는 전투력. */
function worth(def, enh) {
  const st = enhanced(def.stats, enh, def.rarity);
  const base = power(BENCH, {});
  const with_ = power(
    {
      hp: BENCH.hp + (st.hp || 0),
      atk: BENCH.atk + (st.atk || 0),
      def: BENCH.def + (st.def || 0),
      spd: BENCH.spd + (st.spd || 0),
      crit: BENCH.crit + (st.crit || 0),
    },
    { critMult: st.critDmg || 0 }
  );
  return with_ - base;
}

// 무기는 계열이 셋이라 부위(slot)만으로는 못 나눈다.
const LINE_OF = {
  club: '무기·검', wooden_sword: '무기·검', iron_sword: '무기·검',
  flame_sword: '무기·검', demon_blade: '무기·검', frost_blade: '무기·검',
  dragonslayer: '무기·검',
  short_bow: '무기·활', hunting_bow: '무기·활', elven_bow: '무기·활', storm_bow: '무기·활',
  skypiercer: '무기·활',
  gnarled_staff: '무기·지팡이', apprentice_staff: '무기·지팡이',
  archmage_staff: '무기·지팡이', ember_staff: '무기·지팡이',
  worldtree_staff: '무기·지팡이',
};

// 전설 장비는 골드로 살 수 없어서 가격이 0 이다.
// 가격순으로 줄을 세우면 맨 앞으로 와서 "천 옷보다 약하다"는 거짓 경고가 난다.
// 실제로는 사다리의 맨 끝이므로, 줄 세울 때만 아주 큰 값으로 친다.
const PRICELESS = 9_000_000;
const SLOT_NAME = {
  armor: '갑옷', shoulder: '어깨', gloves: '장갑', boots: '신발',
  ring: '반지', necklace: '목걸이', belt: '허리띠',
};
const RARITY_NAME = { common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설' };
const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

function main() {
  const argEnh = process.argv.indexOf('--enh');
  const enh = argEnh > 0 ? Number(process.argv[argEnh + 1]) : 0;

  const items = G['items.json'];
  const lines = new Map();
  for (const [id, def] of Object.entries(items)) {
    if (!def.slot) continue;
    const line = LINE_OF[id] || SLOT_NAME[def.slot] || def.slot;
    if (!lines.has(line)) lines.set(line, []);
    const price = def.rarity === 'legendary' ? PRICELESS : def.price || 0;
    lines.get(line).push({ id, def, worth: worth(def, enh), price });
  }

  console.log(`\n장비 감사 — 강화 +${enh} 기준 (값 = 표준 캐릭터에게 더해 주는 전투력)\n`);
  const problems = [];

  for (const [line, list] of [...lines.entries()].sort()) {
    // 가격을 "단계"로 본다. 비싼 것이 뒤에 오는 것이 정상이다.
    list.sort((a, b) => a.price - b.price || RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity]);
    console.log(`── ${line}`);
    let prev = null;
    for (const it of list) {
      const st = it.def.stats || {};
      const parts = Object.entries(st).map(([k, v]) =>
        k === 'crit' || k === 'critDmg' ? `${k} ${(v * 100).toFixed(0)}%` : `${k} ${v}`
      );
      let flag = '';
      if (prev && it.worth < prev.worth) {
        flag = `  ⚠ ${prev.def.name}(${prev.worth}) 보다 약하다`;
        problems.push({ line, item: it, prev });
      }
      console.log(
        `   ${String(it.worth).padStart(5)}  ${it.def.name.padEnd(12)} ` +
          `${(RARITY_NAME[it.def.rarity] || '?').padEnd(3)} ${
            it.price === PRICELESS ? '   징표' : `${String(it.price).padStart(6)}g`
          }  ` +
          `${parts.join(' · ')}${flag}`
      );
      prev = it;
    }
    console.log('');
  }

  if (problems.length) {
    console.log(`\n❌ 역전 ${problems.length} 건`);
    for (const p of problems) {
      console.log(`   ${p.line}: ${p.item.def.name} (${p.item.worth}) < ${p.prev.def.name} (${p.prev.worth})`);
    }
  } else {
    console.log('\n✅ 역전 없음 — 모든 계열이 단계마다 세진다.');
  }
  console.log('');
  return problems.length;
}

if (require.main === module) process.exitCode = main() ? 1 : 0;
module.exports = { worth, enhanced, power };
