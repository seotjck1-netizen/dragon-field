// 책임: 강화 +7~+9 에서 붙는 무작위 옵션과, +10 이후의 보석 홈.
// 금지: DOM 접근, 저장. 무엇을 굴릴지·무엇이 붙어 있는지만 계산한다.
//
// ── 왜 무작위인가 ──────────────────────────────────────────
// 예전에는 +7 이면 누구나 '예기', +8 이면 '흡혈' 이었다.
// 강화가 그냥 숫자 올리기였고, 같은 검은 전부 같은 검이었다.
// 지금은 부위에 맞는 통에서 하나를 뽑고 수치도 그 자리에서 굴린다.
// 그래서 "이 검은 흡혈 9.5% 가 떴다" 같은 물건이 생긴다.
//
// ── 저장 형태 ──────────────────────────────────────────────
// 소지품 한 칸에 이렇게 붙는다.
//   { uid, id, count, enhance: 9, affixes: [{ a: 'w_lifesteal', v: 0.095 }, …] }
//   { …, enhance: 10, gems: ['gem_ruby', null] }        // null = 빈 홈
// affixes 는 굴린 순서대로 쌓인다(+7 → +8 → +9).

import { enhancedStats, BALANCE } from '../data/formulas.js';
import { modLabel } from '../data/modLabels.js';

/**
 * 아이템의 "기본 스탯" 중 순수 수치가 아니라 전투 보정으로 가는 것들.
 *
 * hp/atk/def/spd/crit 다섯은 StatBlock 이 그냥 더하면 되지만, 치명타 피해처럼
 * 배율에 해당하는 것은 더할 자리가 없다. 그래서 여기서 mods 로 옮겨 준다.
 * (지팡이는 치명타 "확률" 대신 치명타 "피해"를 기본으로 단다.)
 */
const STAT_TO_MOD = {
  critDmg: { prop: 'critMult', name: '치명타 피해' },
};

/** 부위 → 옵션 통 이름. */
const POOL_OF = {
  weapon: '무기',
  armor: '방어구',
  helmet: '방어구',
  shoulder: '방어구',
  gloves: '방어구',
  boots: '방어구',
  ring: '장신구',
  necklace: '장신구',
  belt: '장신구',
};

/** 이 강화 수치에서 옵션이 붙는가. */
export const AFFIX_LEVELS = [7, 8, 9];

/** 표 한 줄을 다루기 좋은 모양으로. */
function toDef(row) {
  const [id, name, key, min, max, step, show] = row;
  const [kind, prop] = key.split('.');
  return { id, name, kind, prop, min, max, step, show };
}

/**
 * 그 부위에 붙어서는 안 되는 것.
 *
 * 방어구(갑옷·어깨·장갑·신발)에는 치명타 확률도 치명타 피해도 붙지 않는다.
 * 때리는 값은 무기와 장신구가 맡고, 방어구는 버티는 값만 맡는다 —
 * 그래야 "무엇을 입을까"와 "무엇을 들까"가 서로 다른 물음이 된다.
 * 표(affixes.json)에 실수로 적어 넣어도 여기서 걸러지므로 조용히 새지 않는다.
 */
const BANNED_BY_POOL = { 방어구: new Set(['crit', 'critMult']) };

/**
 * 부위를 가리는 효과 — **여기 적힌 자리에서만** 나온다.
 *
 * 흡혈이 그렇다. 예전에는 무기·반지·목걸이·허리띠에 다 붙고 보석으로도 박을 수
 * 있어서, 한 벌을 갖추면 흡혈이 60%를 넘었다. 그러면 때릴 때마다 맞은 것보다
 * 더 많이 차올라 **아예 죽지 않는 캐릭터**가 된다 —
 * 레벨 40 용사가 룬 +10 한 벌로 고룡을 혼자 잡고, 체력이 87% 아래로 내려가지 않았다.
 *
 * 그래서 흡혈은 **무기와 허리띠** 두 자리에서만 나온다.
 * 옵션(강화 +7~+9)과 보석(+10 홈) 양쪽에서 같은 규칙이 걸린다 —
 * 한쪽만 막으면 다른 쪽으로 새기 때문이다.
 */
export const SLOT_ONLY = { lifesteal: new Set(['weapon', 'belt']) };

// 거절 문구에 쓸 부위 이름. EquipmentSystem 의 SLOT_LABEL 을 가져다 쓰고 싶지만
// systems 끼리는 서로 부르지 않기로 했으므로, 여기 쓰는 몇 개만 적어 둔다.
const SLOT_NAME_HERE = { weapon: '무기', belt: '허리띠' };

/** 그 부위에 이 효과가 붙어도 되는가. */
export function allowedOnSlot(prop, slot) {
  const only = SLOT_ONLY[prop];
  return !only || only.has(slot);
}

/** 그 부위가 뽑을 수 있는 옵션 전부. */
export function poolFor(db, itemDef) {
  const pool = POOL_OF[itemDef && itemDef.slot];
  if (!pool) return [];
  const banned = BANNED_BY_POOL[pool];
  const slot = itemDef.slot;
  return ((db.affixes && db.affixes[pool]) || [])
    .map(toDef)
    .filter((d) => !(banned && d.kind === 'mods' && banned.has(d.prop)))
    .filter((d) => d.kind !== 'mods' || allowedOnSlot(d.prop, slot));
}

/** 보석 정의 목록. */
export function gemDefs(db) {
  return ((db.affixes && db.affixes['보석']) || []).map((row) => {
    const [id, name, key, value, show] = row;
    const [kind, prop] = key.split('.');
    // '루비' 만 보여 주면 무엇이 오르는지 알 수가 없다. 한 번 박으면 뺄 수 없으므로
    // **박기 전에** 무엇이 오르는지 글자로 보여야 한다.
    const stat = modLabel(prop);
    const amount = show === 'percent' ? `+${+(value * 100).toFixed(1)}%` : `+${value}`;
    return { id, name, kind, prop, value, show, stat, amount, effect: `${stat} ${amount}` };
  });
}

export function gemDef(db, gemId) {
  return gemDefs(db).find((g) => g.id === gemId) || null;
}

// ─────────────────────────────────────────────────────────────
// 세트 장비
//
// 같은 세트의 장비를 여러 개 맞춰 입으면 덤이 붙는다.
// 표는 affixes.json 의 '세트' 에 있다 — 규칙은 여기, 숫자는 표.
// ─────────────────────────────────────────────────────────────

/**
 * 표의 효과 한 줄을 다루기 좋은 모양으로.
 *
 * 두 가지로 적을 수 있다.
 *   [2, 'atkMult', 0.15, '공격력 +15%']            — 간단한 한 줄
 *   { 개수, 글, 보정:{…}, 특성:{…}, 상대:[…] }      — 여러 개를 한 번에 · 조건부
 *
 * @returns {{need, text, mods:object, traits:object, foes:string[]|null}}
 */
function toStep(row) {
  if (Array.isArray(row)) {
    const [need, prop, value, text] = row;
    return { need, text, mods: { [prop]: value }, traits: {}, foes: null };
  }
  return {
    need: row['개수'],
    text: row['글'] || '',
    mods: row['보정'] || {},
    traits: row['특성'] || {},
    // 특성배율 — 힘·민첩·지능이 **이만큼 더** 오른다. 2 = +200%(즉 세 배).
    // 점수를 더하는 '특성' 과 달리 지금 가진 값에 곱해지므로, 잘 키운 캐릭터일수록 크다.
    traitMult: row['특성배율'] || {},
    foes: Array.isArray(row['상대']) && row['상대'].length ? row['상대'] : null,
  };
}

/** 세트 목록. [{ id, name, parts:[아이템id], steps:[{need, text, mods, traits, foes}] }] */
export function setDefs(db) {
  const table = (db.affixes && db.affixes['세트']) || {};
  const out = [];
  for (const [id, def] of Object.entries(table)) {
    if (id.startsWith('_') || !def || !Array.isArray(def['부위'])) continue;
    // 한 자리를 여러 물건 중 아무거나로 채울 수 있으면 표에 [ ] 로 묶여 있다
    // (용린의 무기 자리 — 검·활·지팡이). 묶인 것은 **한 자리로 센다.**
    // 각각을 한 자리로 세면 다 갖춘 사람에게 '4/6' 이 뜬다 — 무기는 하나만 들 수
    // 있으니 영영 6 이 안 되고, 사람은 못 채운 줄 알고 두 자루를 더 만들러 간다.
    const slots = def['부위'].map((x) => (Array.isArray(x) ? x.slice() : [x]));
    out.push({
      id,
      name: def['이름'] || id,
      slots, // 채워야 할 자리들. 자리마다 들어갈 수 있는 id 목록
      parts: slots.flat(), // "이게 세트 물건인가" 를 볼 때 쓴다
      steps: (def['효과'] || []).map(toStep),
    });
  }
  return out;
}

/** 이 아이템이 속한 세트. 없으면 null. */
export function setOf(db, itemId) {
  return setDefs(db).find((s) => s.parts.includes(itemId)) || null;
}

/**
 * 지금 몇 개를 맞춰 입고 있는가.
 *
 * ⚠ **끼고 있는 것만** 센다. 가방에 세 개가 있어도 입지 않았으면 0 이다.
 *
 * `on` 은 "지금 켜져 있는가", `met` 은 "개수는 채웠는가" 다. 둘을 나눈 이유는
 * 조건부 효과(고룡전 한정) 때문이다 — 네 개를 다 입었지만 지금은 안 켜져 있는 상태를
 * 화면에 그대로 보여 줘야, 사람이 "왜 안 붙지" 하고 헤매지 않는다.
 *
 * @param {string[]} wornIds 지금 장착 중인 아이템 id 들
 * @param {string[]|null} foes 지금 상대하는 몬스터 id 들(없으면 조건부 효과는 꺼진다)
 * @returns {Array<{set, worn:number, steps:Array<{...step, met:boolean, on:boolean}>}>}
 */
export function setProgress(db, wornIds, foes = null) {
  const have = new Set(wornIds);
  const facing = new Set(foes || []);
  return setDefs(db)
    .map((s) => ({ s, worn: s.slots.filter((slot) => slot.some((id) => have.has(id))).length }))
    .filter((x) => x.worn > 0)
    .map(({ s, worn }) => {
      return {
        set: s,
        worn,
        steps: s.steps.map((st) => {
          const met = worn >= st.need;
          const matched = !st.foes || st.foes.some((f) => facing.has(f));
          return { ...st, met, on: met && matched };
        }),
      };
    });
}

// ─────────────────────────────────────────────────────────────
// 변신 — 보석을 정해진 순서로 박으면 다른 물건이 되는 장비
//
// 표는 affixes.json 의 '변신' 에 있다.
// 규칙은 여기 세 줄이 전부다:
//   · 태어날 때부터 홈이 뚫려 있다(강화와 상관없다)
//   · 정해진 차례가 아닌 보석은 **아예 박히지 않는다**
//   · 마지막 보석이 들어가면 그 자리에서 다른 아이템이 된다
//
// 두 번째 규칙이 중요하다. 보석은 한 번 박으면 빠지지 않으므로, 순서를 틀리게
// 두면 10만 골드짜리 검이 되돌릴 수 없이 못 쓰게 된다. 규칙은 지키되
// 사람이 그 규칙 때문에 손해 보지는 않게 한다.
// ─────────────────────────────────────────────────────────────

/**
 * 이 아이템의 변신 조리법. 없으면 null.
 *
 * @param {string|null} classId 손에 쥔 사람의 직업. 결과가 직업마다 다른 조리법이 있다
 *        (쓸모없는 검 — 용사는 검, 사냥꾼은 활, 마법사는 지팡이).
 *        안 주면 '기본' 으로 간다.
 */
export function transmuteOf(db, itemId, classId = null) {
  const table = (db.affixes && db.affixes['변신']) || {};
  const def = table[itemId];
  if (!def || !Array.isArray(def['차례'])) return null;
  const result = def['결과'];
  const into = typeof result === 'string'
    ? result
    : (result && (result[classId] || result['기본'])) || null;
  return {
    id: itemId,
    sockets: def['홈'] || def['차례'].length,
    order: def['차례'],
    into,
    // 화면에서 "직업마다 다른 물건이 된다" 를 알려 줄 때 쓴다.
    byClass: typeof result === 'object' && result ? result : null,
  };
}

/**
 * 지금 몇 개까지 맞게 박혀 있는가. 하나라도 어긋나면 -1.
 * (어긋난 검은 위 규칙 때문에 생길 수 없지만, 옛 세이브를 위해 answer 를 남겨 둔다)
 */
function transmuteProgress(recipe, gems) {
  let n = 0;
  for (let i = 0; i < recipe.order.length; i++) {
    const g = (gems || [])[i];
    if (!g) break;
    if (g !== recipe.order[i]) return -1;
    n++;
  }
  return n;
}

/**
 * 다음에 박아야 할 보석 id. 다 박았으면 null.
 * @returns {{recipe, next:string|null, done:boolean, broken:boolean}|null}
 */
export function transmuteState(db, inst, classId = null) {
  const recipe = transmuteOf(db, inst && inst.id, classId);
  if (!recipe) return null;
  const n = transmuteProgress(recipe, inst.gems);
  if (n < 0) return { recipe, next: null, done: false, broken: true };
  return {
    recipe,
    next: n < recipe.order.length ? recipe.order[n] : null,
    done: n >= recipe.order.length,
    broken: false,
  };
}

/** 이 강화 수치에서 생기는 보석 홈 개수. */
export function socketCount(db, enhanceLevel) {
  const table = (db.affixes && db.affixes['홈']) || {};
  let n = 0;
  for (const [lvl, count] of Object.entries(table)) {
    if (lvl.startsWith('_')) continue;
    if (enhanceLevel >= Number(lvl)) n = Math.max(n, Number(count));
  }
  return n;
}

/** 두 번째 홈을 뚫을 수 있는 부위 — 무기와 악세서리만. */
export const DRILLABLE = new Set(['weapon', 'ring', 'necklace', 'belt']);

/** 한 장비에 있을 수 있는 홈의 최대치. */
export const MAX_SOCKETS = 2;

/**
 * 이 장비에 지금 홈이 몇 개인가.
 *
 * 기본은 강화 수치가 정한다(+10 에서 하나). 거기에 **송곳으로 뚫은 홈**이 더해진다.
 * 뚫는 것은 무기와 악세서리만 되고, 다 합쳐도 두 개를 넘지 않는다.
 */
export function socketsOf(db, inst, itemDef) {
  // 변신 장비는 강화와 상관없이 조리법이 정한 만큼 처음부터 뚫려 있다.
  const recipe = transmuteOf(db, inst && inst.id);
  if (recipe) return Math.min(MAX_SOCKETS, recipe.sockets);

  const base = socketCount(db, (inst && inst.enhance) || 0);
  const drilled = inst && inst.drilled ? 1 : 0;
  const slot = itemDef && itemDef.slot;
  const allowExtra = DRILLABLE.has(slot) ? drilled : 0;
  return Math.min(MAX_SOCKETS, base + allowExtra);
}

/**
 * 옵션 하나를 굴린다.
 * @param {object} db
 * @param {object} itemDef  items.json 의 그 아이템
 * @param {string[]} taken  이미 붙어 있는 옵션 id 들(같은 것을 두 번 주지 않는다)
 * @param {function} rng core/Rng.js 의 createRng() 결과(함수 자체를 부르면 0~1)
 * @returns {{a:string, v:number}|null}
 */
export function rollAffix(db, itemDef, taken, rng, { perfect = false } = {}) {
  const pool = poolFor(db, itemDef).filter((d) => !taken.includes(d.id));
  if (!pool.length) return null;

  const pick = rng.pick ? rng.pick(pool) : pool[Math.floor(rng() * pool.length)];
  // 초월 각인이 붙은 물건은 **무엇이 뽑히든 최대치로** 나온다.
  // 다시 굴려도 마찬가지다 — 그게 초월의 값이다.
  if (perfect) return { a: pick.id, v: +pick.max.toFixed(6) };

  const span = pick.max - pick.min;
  const steps = Math.max(1, Math.round(span / pick.step));
  const n = rng.int ? rng.int(0, steps) : Math.floor(rng() * (steps + 1));
  // 부동소수점 찌꺼기(0.07500000000000001)를 없앤다
  const v = Math.min(pick.max, +(pick.min + n * pick.step).toFixed(6));
  return { a: pick.id, v };
}

// ─────────────────────────────────────────────────────────────
// 각인 — 주울 때 열에 하나꼴로 붙는 덤 한 줄
//
// 값은 **등급이 정한다**(affixes.json 의 '각인'). 예전에는 그 부위 통의
// 한가운데를 썼는데, 그러면 전설 장비의 각인이 일반 장비와 똑같은 7.5% 였다.
// 등급이 높을수록 각인도 세야 좋은 물건을 주울 이유가 생긴다.
// ─────────────────────────────────────────────────────────────

/**
 * affixes.json 의 '각인' 설정. 표가 없으면 예전처럼 굴러가게 기본값을 준다.
 *
 * 0.39 — 등급 줄은 네 칸까지 적을 수 있다: [ 최소, 최대, 붙을확률, 초월확률 ].
 * 뒤 둘이 없으면 표 전체의 '확률' · '초월확률' 을 쓴다(지금까지와 같다).
 * 구글 시트 engrave 탭이 이 네 칸을 그대로 보여 준다.
 */
function engraveCfg(db, rarity) {
  const t = (db.affixes && db.affixes['각인']) || {};
  const bands = t['등급'] || null;
  const band = (bands && bands[rarity || 'common']) || null;
  const base = typeof t['확률'] === 'number' ? t['확률'] : BALANCE.BONUS_AFFIX_CHANCE;
  const basePerfect = typeof t['초월확률'] === 'number' ? t['초월확률'] : 0;
  return {
    chance: band && typeof band[2] === 'number' ? band[2] : base,
    perfectChance: band && typeof band[3] === 'number' ? band[3] : basePerfect,
    bands,
  };
}

/**
 * 그 등급의 각인이 굴러갈 범위를, **그 옵션의 단위로** 바꾼다.
 *
 * 표에는 사람이 읽는 숫자로 적혀 있다(일반 3~5).
 * 비율 옵션이면 3~5% 이므로 0.03~0.05 로, 힘·민첩·지능이면 3~5점 그대로 쓴다.
 */
function engraveRange(db, itemDef, pick) {
  const { bands } = engraveCfg(db, itemDef && itemDef.rarity);
  const band = bands && bands[(itemDef && itemDef.rarity) || 'common'];
  if (!band) return null;
  const unit = pick.show === 'percent' ? 0.01 : 1;
  return [band[0] * unit, band[1] * unit];
}

/**
 * 각인 — 바닥에서 줍거나 상점에서 산 장비에 열에 하나꼴로 붙는 덤 옵션 한 줄.
 *
 * 강화가 굴리는 옵션(+7~+9)과는 저장하는 자리가 다르다(inst.bonus).
 * 같은 배열에 넣으면 강화가 "이미 하나 붙었네" 하고 +7 옵션을 건너뛰어 버린다.
 *
 * @param {object} db
 * @param {object} itemDef items.json 의 그 아이템
 * @param {function} rng createRng() 결과
 * @returns {{a:string, v:number}|null}  붙지 않았으면 null
 */
export function rollBonusAffix(db, itemDef, rng, bonusChance = 0) {
  if (!itemDef || !itemDef.slot) return null; // 장비만
  const cfg = engraveCfg(db, itemDef.rarity);
  // 기본 10% + 마법사 패시브가 얹어 주는 몫(engraveBonus)
  const chance = Math.min(1, cfg.chance + Math.max(0, bonusChance));
  const hit = rng.chance ? rng.chance(chance) : rng() < chance;
  if (!hit) return null;

  const pool = poolFor(db, itemDef);
  if (!pool.length) return null;
  const pick = rng.pick ? rng.pick(pool) : pool[Math.floor(rng() * pool.length)];

  // 열에 하나는 **초월** 로 태어난다 — 이 물건에 붙는 모든 값이 최대치가 된다.
  const perfect = cfg.perfectChance > 0
    && (rng.chance ? rng.chance(cfg.perfectChance) : rng() < cfg.perfectChance);

  const band = engraveRange(db, itemDef, pick);
  if (!band) {
    // 등급 표가 없는 옛 자료 — 예전처럼 통의 한가운데로 굴린다.
    const raw = pick.min + (pick.max - pick.min) * BALANCE.BONUS_AFFIX_ROLL;
    const steps = Math.round((raw - pick.min) / pick.step);
    const v = Math.min(pick.max, +(pick.min + steps * pick.step).toFixed(6));
    return { a: pick.id, v, ...(perfect ? { p: 1 } : {}) };
  }

  const [lo, hi] = band;
  if (perfect) return { a: pick.id, v: +hi.toFixed(6), p: 1 };

  const steps = Math.max(1, Math.round((hi - lo) / pick.step));
  const n = rng.int ? rng.int(0, steps) : Math.floor(rng() * (steps + 1));
  const v = Math.min(hi, +(lo + n * pick.step).toFixed(6));
  return { a: pick.id, v };
}

/** 이 물건이 초월 각인을 달고 태어났는가. */
export function isPerfect(inst) {
  return !!(inst && inst.bonus && inst.bonus.p);
}

/**
 * 전설 장비가 태어날 때 붙는 무작위 옵션 한 줄.
 *
 * 각인(rollBonusAffix)과 저장 자리는 같지만 규칙이 다르다 —
 * 각인은 열에 하나 붙고 값은 등급이 정한 범위 안에서 굴리는데,
 * 전설은 **반드시** 붙고 값도 그 자리에서 굴린다. 같은 용살자라도 서로 다른 물건이 된다.
 */
export function grantRandomBonus(db, itemDef, rng) {
  if (!itemDef || !itemDef.slot) return null;
  return rollAffix(db, itemDef, [], rng);
}

/** 각인이 붙은 물건인가. */
export function isEngraved(inst) {
  return !!(inst && inst.bonus && inst.bonus.a);
}

/**
 * 강화가 성공해서 그 수치가 되었을 때 붙을 것을 붙인다.
 * 이미 그 수치에 해당하는 옵션이 있으면 아무것도 하지 않는다(두 번 굴리지 않게).
 * @returns {{affix:{a,v,name,text}|null, sockets:number}}
 */
export function onEnhanced(db, inst, itemDef, rng) {
  const level = inst.enhance || 0;
  let affix = null;

  if (AFFIX_LEVELS.includes(level)) {
    const have = inst.affixes || [];
    // +7·+8·+9 각각 한 개씩 — 지금 몇 개 있어야 하는가
    const want = AFFIX_LEVELS.filter((l) => l <= level).length;
    if (have.length < want) {
      // 초월 각인이 붙은 물건은 강화로 붙는 옵션도 전부 최대치다.
      const rolled = rollAffix(db, itemDef, have.map((x) => x.a), rng, { perfect: isPerfect(inst) });
      if (rolled) {
        inst.affixes = [...have, rolled];
        affix = { ...rolled, ...describe(db, itemDef, rolled) };
      }
    }
  }

  const sockets = socketsOf(db, inst, db.items[inst.id]);
  if (sockets > 0) {
    const gems = inst.gems || [];
    if (gems.length < sockets) {
      inst.gems = [...gems, ...new Array(sockets - gems.length).fill(null)];
    }
  }
  return { affix, sockets };
}

/** 붙어 있는 옵션 하나를 사람이 읽을 글로. */
export function describe(db, itemDef, entry) {
  const def = poolFor(db, itemDef).find((d) => d.id === entry.a);
  if (!def) return { name: entry.a, text: String(entry.v) };
  const text = def.show === 'percent'
    ? `${def.name} +${+(entry.v * 100).toFixed(1)}%`
    : `${def.name} +${entry.v}`;
  return { name: def.name, text };
}

/** 그 장비에 붙은 것 전부(옵션 + 보석)를 글로. 툴팁·소지품 표시용. */
export function itemExtras(db, inst) {
  const itemDef = db.items[inst && inst.id];
  if (!itemDef) return [];
  const out = [];
  if (isEngraved(inst)) {
    const d = describe(db, itemDef, inst.bonus);
    // 초월 각인은 표시가 다르다 — ✦ 하나가 아니라 **둘**이고, 붉게 뜬다.
    // 한눈에 "이건 다른 물건" 으로 보여야 주운 보람이 있다.
    const perfect = isPerfect(inst);
    out.push({
      kind: perfect ? 'perfect' : 'bonus',
      name: d.name,
      text: perfect ? `✦✦ 초월 각인 · ${d.text}` : `✦ 각인 · ${d.text}`,
    });
  }
  for (const e of inst.affixes || []) {
    out.push({ kind: 'affix', ...describe(db, itemDef, e) });
  }
  (inst.gems || []).forEach((gemId) => {
    if (!gemId) {
      out.push({ kind: 'socket', name: '빈 홈', text: '◇ 빈 홈' });
      return;
    }
    const g = gemDef(db, gemId);
    if (!g) return;
    // 무엇이 오르는지 이름으로 적는다 — '+8%' 만 있으면 무슨 수치인지 알 수 없다.
    out.push({ kind: 'gem', name: g.name, text: `◈ ${g.name} · ${g.effect}` });
  });
  return out;
}

/**
 * 장착 중인 장비의 옵션·보석을 전부 합쳐 전투 보정으로 만든다.
 * @returns {{mods:object, traits:object, sources:Array}}
 *   mods   — EMPTY_MODS 와 같은 키
 *   traits — { strength: n, agility: n, intellect: n } 추가 특성 점수
 */
// 같은 프레임에 여러 곳(스탯·보정·특성)에서 부르므로 한 번만 계산한다.
// 장비나 붙은 옵션이 바뀌면 열쇠가 달라져서 자동으로 다시 계산된다.
let _cache = { key: null, value: null };

function bonusKey(state) {
  const eq = state.player.equipment || {};
  const parts = [];
  for (const slot of Object.keys(eq).sort()) {
    const uid = eq[slot];
    if (!uid) continue;
    const inst = (state.inventory || []).find((i) => i.uid === uid);
    if (!inst) continue;
    parts.push(
      `${uid}:${inst.id}:${inst.enhance || 0}:${JSON.stringify(inst.affixes || 0)}` +
        `:${JSON.stringify(inst.gems || 0)}:${JSON.stringify(inst.bonus || 0)}`
    );
  }
  return parts.join('|');
}

/**
 * @param {string[]|null} foes 지금 상대하는 몬스터 id 들. 조건부 세트 효과가 이걸 본다.
 *                             평소(사냥터를 걸어다닐 때)는 null 이고, 그때는 꺼져 있다.
 */
export function gearBonuses(state, foes = null) {
  // ⚠ 조건도 열쇠에 넣는다. 안 넣으면 고룡전에서 켠 값이 그대로 남아
  //    다음 잡몹 싸움까지 따라온다 — 캐시가 조용히 거짓말을 하는 자리다.
  const key = bonusKey(state) + '#' + (foes && foes.length ? [...foes].sort().join(',') : '');
  if (_cache.key === key && _cache.value) return _cache.value;
  const value = computeGearBonuses(state, foes);
  _cache = { key, value };
  return value;
}

function computeGearBonuses(state, foes = null) {
  const db = state.db;
  const mods = {};
  const traits = {};
  // 힘·민첩·지능에 곱해지는 몫. 더하는 traits 와 따로 모은다 —
  // 곱은 "지금 가진 값" 에 걸리므로 다 더한 뒤에 걸어야 한다(SkillSystem 의 effectiveTraits).
  const traitMult = {};
  const sources = [];

  const add = (kind, prop, value, label) => {
    if (kind === 'trait') traits[prop] = (traits[prop] || 0) + value;
    else mods[prop] = (mods[prop] || 0) + value;
    sources.push({ label, from: 'gear' });
  };

  // 지금 입고 있는 아이템 id — 세트를 세는 데 쓴다.
  const wornIds = [];

  for (const uid of Object.values(state.player.equipment || {})) {
    if (!uid) continue;
    const inst = (state.inventory || []).find((i) => i.uid === uid);
    if (!inst) continue;
    const itemDef = db.items[inst.id];
    if (!itemDef) continue;
    wornIds.push(inst.id);

    // 0) 아이템 자체가 달고 나온 배율(지팡이의 치명타 피해 등). 강화 배율이 함께 붙는다.
    {
      const st = enhancedStats(itemDef.stats, inst.enhance || 0, itemDef.rarity);
      for (const [key, to] of Object.entries(STAT_TO_MOD)) {
        if (!st[key]) continue;
        add('mods', to.prop, st[key], `${itemDef.name} · ${to.name}`);
      }
    }

    // 0-1) 전설 장비의 '스킬 효과 배가'.
    //      강화 배율을 **일부러** 곱하지 않는다 — 두 배는 그 물건의 성질이지
    //      갈고닦아 늘어나는 수치가 아니다(+10 을 만들면 스킬이 열 배가 되어 버린다).
    if (itemDef.skillPower) {
      add('mods', 'skillPower', itemDef.skillPower, `${itemDef.name} · 스킬 효과 배가`);
    }

    // 0-2) 그 물건이 그냥 갖고 나온 보정(매직 투구의 시야·은신 등).
    //      강화 배율을 태우지 않는다 — 갈고닦아 늘어나는 수치가 아니라 성질이다.
    for (const [prop, value] of Object.entries(itemDef.mods || {})) {
      add('mods', prop, value, `${itemDef.name}`);
    }

    const pool = poolFor(db, itemDef);
    // 각인(주울 때 붙은 덤 한 줄) — 강화 옵션과 같은 통에서 왔으므로 같게 다룬다.
    for (const e of [inst.bonus, ...(inst.affixes || [])]) {
      if (!e || !e.a) continue;
      const def = pool.find((d) => d.id === e.a);
      if (!def) continue; // 표에서 사라진 옵션은 조용히 무시한다
      add(def.kind, def.prop, e.v, `${itemDef.name} · ${def.name}`);
    }
    for (const gemId of inst.gems || []) {
      if (!gemId) continue;
      const g = gemDef(db, gemId);
      if (!g) continue;
      add(g.kind, g.prop, g.value, `${itemDef.name} · ${g.name}`);
    }
  }
  // 세트 덤. **강화 배율을 태우지 않는다** — 세트 효과는 몇 개를 맞춰 입었는지로만
  // 정해진다. 강화까지 곱하면 "+10 세 개"가 두 배로 뛰어 손댈 수 없는 값이 된다.
  for (const p of setProgress(db, wornIds, foes)) {
    for (const st of p.steps) {
      if (!st.on) continue;
      const label = `${p.set.name} 세트 ${st.need}${st.text ? ` — ${st.text}` : ''}`;
      for (const [prop, value] of Object.entries(st.mods || {})) add('mods', prop, value, label);
      for (const [prop, value] of Object.entries(st.traits || {})) add('trait', prop, value, label);
      for (const [prop, value] of Object.entries(st.traitMult || {})) {
        traitMult[prop] = (traitMult[prop] || 0) + value;
        sources.push({ label, from: 'gear' });
      }
    }
  }

  return { mods, traits, traitMult, sources };
}

// ─────────────────────────────────────────────────────────────
// 보석 박기
// ─────────────────────────────────────────────────────────────

/** 한글 조사 고르기 — "루비이(가)" 처럼 나오지 않게. */
function josa(word, withFinal, withoutFinal) {
  const last = String(word).charCodeAt(String(word).length - 1);
  if (last < 0xac00 || last > 0xd7a3) return withoutFinal; // 한글이 아니면 그냥
  return (last - 0xac00) % 28 ? withFinal : withoutFinal;
}

/** 홈을 뚫어 주는 아이템의 id. */
export const DRILL_ITEM = 'socket_drill';

/**
 * 이 장비에 홈을 하나 더 뚫을 수 있는가.
 *
 * 무기와 악세서리(반지·목걸이·허리띠)만, +10 부터, 한 장비에 한 번뿐이다.
 * 방어구는 홈이 하나로 끝난다 — 두 개까지 열어 주면 방어구에도 보석을 두 알씩
 * 박게 되어, 한 벌을 갖춘 사람과 아닌 사람의 차이가 지나치게 벌어진다.
 */
export function canDrill(state, uid) {
  const inst = (state.inventory || []).find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const itemDef = state.db.items[inst.id];
  if (!itemDef || !itemDef.slot) return { ok: false, reason: '장비가 아닙니다.' };
  if (!DRILLABLE.has(itemDef.slot)) {
    return { ok: false, reason: '무기와 악세서리에만 뚫을 수 있습니다.' };
  }
  if (socketCount(state.db, inst.enhance || 0) <= 0) {
    return { ok: false, reason: `+10 부터 뚫을 수 있습니다. (지금 +${inst.enhance || 0})` };
  }
  if (inst.drilled) return { ok: false, reason: '이미 홈을 뚫은 장비입니다.' };
  const held = (state.inventory || []).find((i) => i.id === DRILL_ITEM && (i.count || 1) > 0);
  if (!held) {
    // 이름은 표(items.json)에서 읽는다 — 코드에 박아 두면 표를 고쳐도 이 말만 옛 이름으로 남는다.
    const name = ((state.db.items || {})[DRILL_ITEM] || {}).name || '홈을 뚫는 물건';
    return { ok: false, reason: `${name}이(가) 없습니다.` };
  }
  return { ok: true, item: itemDef };
}

/**
 * 홈을 뚫는다. 송곳 하나를 덜어 내는 것은 호출부가 한다.
 * @returns {{ok:boolean, reason?:string, sockets?:number}}
 */
export function drillSocket(state, uid) {
  const check = canDrill(state, uid);
  if (!check.ok) return check;
  const inst = state.inventory.find((i) => i.uid === uid);
  inst.drilled = 1;
  const sockets = socketsOf(state.db, inst, check.item);
  const gems = inst.gems || [];
  if (gems.length < sockets) {
    inst.gems = [...gems, ...new Array(sockets - gems.length).fill(null)];
  }
  return { ok: true, sockets };
}

/** 이 장비에 보석을 박을 수 있는가. */
export function canSocket(state, uid, gemId) {
  const inst = (state.inventory || []).find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const itemDef = state.db.items[inst.id];
  if (!itemDef || !itemDef.slot) return { ok: false, reason: '장비가 아닙니다.' };

  const sockets = socketsOf(state.db, inst, itemDef);
  if (sockets <= 0) {
    return { ok: false, reason: `보석 홈은 +10 부터 생깁니다. (지금 +${inst.enhance || 0})` };
  }
  const gems = inst.gems || [];
  const free = gems.findIndex((g) => !g);
  if (free < 0 && gems.length >= sockets) return { ok: false, reason: '빈 홈이 없습니다.' };

  const g = gemDef(state.db, gemId);
  if (!g) return { ok: false, reason: '보석이 아닙니다.' };

  // 변신 장비는 **차례가 정해져 있다.** 다른 보석은 아예 박히지 않는다.
  //
  // 그냥 박히게 두면 10만 골드짜리 검이 그 자리에서 되돌릴 수 없이 망가진다
  // (보석은 빼지 못한다). 규칙은 "순서대로"가 맞지만, 그 규칙 때문에 사람이
  // 물건을 잃게 두지는 않는다 — 무엇을 박아야 하는지 알려 주고 막는다.
  const tm = transmuteState(state.db, inst, state.player && state.player.classId);
  if (tm && !tm.broken && tm.next && gemId !== tm.next) {
    const wantName = (gemDef(state.db, tm.next) || {}).name || tm.next;
    return {
      ok: false,
      reason: `${itemDef.name}에는 차례가 있습니다. 지금은 ${wantName}${josa(wantName, '을', '를')} 박을 차례입니다.`,
    };
  }

  // 부위를 가리는 효과는 보석으로도 우회할 수 없다(흡혈 = 무기·허리띠만).
  if (g.kind === 'mods' && !allowedOnSlot(g.prop, itemDef.slot)) {
    const where = [...SLOT_ONLY[g.prop]].map((s2) => SLOT_NAME_HERE[s2] || s2).join('·');
    return { ok: false, reason: `${g.name}은(는) ${where} 에만 박을 수 있습니다.` };
  }
  const held = (state.inventory || []).find((i) => i.id === gemId && (i.count || 1) > 0);
  if (!held) return { ok: false, reason: `${g.name}${josa(g.name, '이', '가')} 없습니다.` };

  return { ok: true, slot: free < 0 ? gems.length : free, gem: g };
}

/**
 * 보석을 박는다. 소지품에서 보석 하나를 덜어 내는 것은 호출부가 한다.
 * @returns {{ok:boolean, reason?:string, gem?:object}}
 */
export function socketGem(state, uid, gemId) {
  const check = canSocket(state, uid, gemId);
  if (!check.ok) return check;
  const inst = state.inventory.find((i) => i.uid === uid);
  const sockets = socketsOf(state.db, inst, state.db.items[inst.id]);
  const gems = [...(inst.gems || [])];
  while (gems.length < sockets) gems.push(null);
  gems[check.slot] = gemId;
  inst.gems = gems;

  // 마지막 보석이 들어갔으면 그 자리에서 다른 물건이 된다.
  // 강화 수치와 박아 둔 보석은 그대로 가져간다 — 치른 값이 사라지면 안 된다.
  // 결과는 **손에 쥔 사람의 직업**이 정한다 — 용사는 검, 사냥꾼은 활, 마법사는 지팡이.
  const tm = transmuteState(state.db, inst, state.player && state.player.classId);
  if (tm && tm.done && tm.recipe.into && state.db.items[tm.recipe.into]) {
    const was = state.db.items[inst.id];
    inst.id = tm.recipe.into;
    return { ok: true, gem: check.gem, became: { from: was, to: state.db.items[inst.id] } };
  }
  return { ok: true, gem: check.gem, next: tm && !tm.broken ? tm.next : null };
}

// ─────────────────────────────────────────────────────────────
// 옵션 다시 굴리기 (리롤)
// ─────────────────────────────────────────────────────────────
//
// 강화로 붙은 옵션이 마음에 안 들 때, 그 자리 하나만 다시 굴린다.
// 강화 단계는 건드리지 않는다 — 떨어질 걱정 없이 굴릴 수 있고, 대신 값이 비싸다.
// 나머지 자리에 이미 있는 옵션은 통에서 빼므로 같은 것이 두 번 붙지 않는다.
// 방금 있던 그 옵션 자신은 통에 남겨 둔다 — 같은 옵션이 더 좋은 수치로 뜰 수도 있어야 한다.

/** 그 자리를 다시 굴릴 수 있는가. 비용은 호출부가 formulas.rerollCost 로 구한다. */
export function canReroll(state, uid, index) {
  const inst = (state.inventory || []).find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const itemDef = state.db.items[inst.id];
  if (!itemDef || !itemDef.slot) return { ok: false, reason: '장비가 아닙니다.' };

  const have = inst.affixes || [];
  const entry = have[index];
  if (!entry) return { ok: false, reason: '다시 굴릴 옵션이 없습니다.' };

  // 그 자리를 뺀 나머지가 "피해야 할 것"이다.
  const others = have.filter((_, i) => i !== index).map((e) => e.a);
  const pool = poolFor(state.db, itemDef).filter((d) => !others.includes(d.id));
  if (pool.length <= 1) {
    return { ok: false, reason: '더 나올 수 있는 옵션이 없습니다.' };
  }
  return { ok: true, index, current: entry, choices: pool.length };
}

/**
 * 옵션 하나를 다시 굴린다. 골드·재료 차감은 호출부가 한다.
 * @returns {{ok:boolean, reason?:string, before?:object, after?:object, better?:boolean}}
 */
export function rerollAffix(state, uid, index, rng) {
  const check = canReroll(state, uid, index);
  if (!check.ok) return check;

  const inst = state.inventory.find((i) => i.uid === uid);
  const itemDef = state.db.items[inst.id];
  const have = inst.affixes || [];
  const before = have[index];
  const others = have.filter((_, i) => i !== index).map((e) => e.a);

  // 초월 각인이 붙은 물건은 다시 굴려도 최대치로만 나온다.
  const rolled = rollAffix(state.db, itemDef, others, rng, { perfect: isPerfect(inst) });
  if (!rolled) return { ok: false, reason: '옵션을 굴리지 못했습니다.' };

  const next = [...have];
  next[index] = rolled;
  inst.affixes = next;

  return {
    ok: true,
    before: { ...before, ...describe(state.db, itemDef, before) },
    after: { ...rolled, ...describe(state.db, itemDef, rolled) },
    // "좋아졌나"는 통 안에서의 위치로 본다 — 종류가 다르면 비교할 수 없으므로
    // 같은 옵션일 때만 수치를 견준다.
    better: before.a === rolled.a ? rolled.v > before.v : null,
  };
}

/**
 * 세이브에서 돌아온 옵션·보석을 지금 표에 맞게 정리한다.
 * 표에서 사라진 옵션은 버리고, 홈 개수가 바뀌었으면 맞춘다.
 * @returns {number} 손본 칸 수
 */
export function repairExtras(state) {
  let fixed = 0;
  for (const inst of state.inventory || []) {
    const itemDef = state.db.items[inst.id];
    if (!itemDef) continue;

    if (inst.affixes) {
      const ids = poolFor(state.db, itemDef).map((d) => d.id);
      const kept = inst.affixes.filter((e) => e && ids.includes(e.a));
      if (kept.length !== inst.affixes.length) fixed++;
      if (kept.length) inst.affixes = kept;
      else delete inst.affixes;
    }
    // 각인이 가리키는 옵션이 표에서 사라졌으면 떼어 낸다.
    if (inst.bonus) {
      const ids = poolFor(state.db, itemDef).map((d) => d.id);
      if (!inst.bonus.a || !ids.includes(inst.bonus.a)) {
        delete inst.bonus;
        fixed++;
      }
    }
    if (inst.gems) {
      const known = gemDefs(state.db).map((g) => g.id);
      const sockets = socketsOf(state.db, inst, state.db.items[inst.id]);
      let gems = inst.gems.map((g) => (g && known.includes(g) ? g : null));
      if (gems.length > sockets) gems = gems.slice(0, sockets);
      while (gems.length < sockets) gems.push(null);
      if (JSON.stringify(gems) !== JSON.stringify(inst.gems)) fixed++;
      if (gems.length) inst.gems = gems;
      else delete inst.gems;
    }
  }
  return fixed;
}
