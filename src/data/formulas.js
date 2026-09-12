// 책임: 게임 밸런스 수치와 공식의 유일한 보관소.
// 규칙: 시스템 코드 안에 매직넘버를 쓰지 마라. 숫자를 바꾸고 싶으면 이 파일만 연다.
// 금지: 상태 접근, DOM 접근. 전부 순수 함수여야 한다.

export const BALANCE = {
  // 레벨
  MAX_LEVEL: 50,
  EXP_BASE: 12,
  EXP_GROWTH: 1.38,

  // 레벨업 시 성장치
  GROWTH_PER_LEVEL: { hp: 6, atk: 2, def: 1.4, spd: 0.8, crit: 0.004 },

  // 전투
  DAMAGE_VARIANCE: 0.18, // ±18%
  MIN_DAMAGE: 1,
  CRIT_MULTIPLIER: 1.75,

  // 치명타 확률의 천장과, 그 위로 넘친 몫의 행방.
  //
  // 확률은 85% 에서 멈춘다 — 100% 가 되면 "치명타"라는 말이 뜻을 잃고,
  // 그 위로 올리는 장비가 아무 값도 없는 죽은 옵션이 된다.
  // 그래서 넘친 몫은 버리지 않고 **치명타 피해로 바꿔 준다**.
  //   85% 를 넘긴 1%p 마다 치명타 피해 +10%p (0.01 × 10 = 0.1)
  // 확률을 끝까지 올린 사람의 다음 한 장이 헛되지 않게 하는 장치다.
  CRIT_CAP: 0.85,
  CRIT_OVERFLOW_TO_DMG: 10,

  // 레벨업마다 오르는 스탯이 두 배가 될 확률(힘·민첩·지능).
  STAT_DOUBLE_CHANCE: 0.2,

  // 몬스터 "기세" — 판마다 컨디션이 다르다.
  //
  // 이게 없으면 전투는 순수한 계산 경주여서, 능력치가 조금만 넘으면 100%,
  // 조금만 모자라면 0% 가 된다. 그 사이가 없으니 "다섯 번 도전해서 한 번 이기는
  // 보스" 같은 자리를 만들 수가 없다. 판마다 상대의 체력·공격력을 이만큼
  // 흔들어 주면 아슬아슬한 싸움이 생기고, 같은 보스도 다시 붙어 볼 맛이 난다.
  MONSTER_MOOD: 0.35, // ±35%
  MONSTER_MOOD_SHOW: 0.08, // 이보다 크게 치우친 판만 전투 기록에 적는다

  DEFENSE_SOFTNESS: 0.55, // 방어력 체감 계수
  // 무한 루프 방지용 상한. 여기에 걸리면 무승부다.
  // 보스는 HP 가 커서 60 으로는 "이길 수 있는데 시간이 모자라" 무승부가 났다.
  MAX_BATTLE_ACTIONS: 140,

  // 전투 연출 타이밍(ms) — CombatSystem이 타임라인 t를 찍을 때 쓴다
  TIMING: {
    INTRO: 500,
    ACTION_GAP: 620,
    OUTRO: 700,
  },

  // 강화
  ENHANCE_MAX: 10,
  // 단계별 성공 확률. index = 현재 강화 수치(0이면 +1 시도).
  // +5 까지는 넉넉하게, 그 위부터 본격적으로 어려워진다.
  ENHANCE_CHANCE_TABLE: [0.97, 0.94, 0.9, 0.86, 0.82, 0.68, 0.58, 0.48, 0.38, 0.28],
  ENHANCE_MIN_CHANCE: 0.28,
  ENHANCE_BONUS_PER_LEVEL: 0.16, // +1당 장비 스탯 16% 증가 (영웅 등급 기준 = 100%)

  // 강화가 붙는 정도는 등급마다 다르다.
  //
  // 예전에는 모든 등급이 똑같이 +1당 16% 였다. 그래서 흔한 일반 장비를 +9까지
  // 올리면 구하기 어려운 영웅 장비를 그대로 따라잡았고, 좋은 장비를 찾을 이유가
  // 사라졌다. 이제 같은 +9라도 등급이 낮으면 덜 오른다 —
  // 영웅을 100 이라 할 때 희귀는 80, 일반·고급은 65 만큼만 오른다.
  //
  // 실제 +1당 증가율 = ENHANCE_BONUS_PER_LEVEL × 아래 비율
  //   영웅/전설 16%  ·  희귀 12.8%  ·  일반·고급 10.4%
  ENHANCE_BONUS_BY_RARITY: {
    common: 0.65,
    uncommon: 0.65,
    rare: 0.8,
    epic: 1,
    legendary: 1,
  },

  // +7 부터 한 단계마다 특수 효과가 하나씩 붙는다(누적).
  // +7·+8·+9 에 붙는 것은 이제 고정이 아니다 — src/data/affixes.json 의 통에서
  // 무작위로 뽑고 수치도 그 자리에서 굴린다(systems/AffixSystem.js).
  // +10 은 보석 홈이 열린다.
  ENHANCE_COST_BASE: 14,
  ENHANCE_COST_GROWTH: 1.75,
  // 강화 재료는 "장비 등급" 하나로 고정된다.
  // 3단계마다 재료가 바뀌면 무엇을 모아야 할지 알기 어려워서,
  // 일반 장비는 끝까지 약초만, 희귀는 마력석만, 영웅은 악마의 핵만 쓴다.
  // 필요한 "개수"만 강화 단계에 따라 늘어난다.
  ENHANCE_MATERIAL_BY_RARITY: {
    common: 'herb',
    uncommon: 'herb', // 고급도 초반 장비이므로 약초 쪽에 둔다
    rare: 'magic_stone',
    epic: 'demon_core',
    legendary: 'demon_core',
  },
  // 개수 = countBase + floor(현재 강화 단계 / perLevels)
  ENHANCE_MATERIAL_COUNT: { base: 1, perLevels: 2 },

  // ── 초월 강화 (+10 → +15) — 성 안 왕실 대장간 ────────────
  //
  // 0.40 에서 규칙이 통째로 바뀌었다.
  //
  // 예전에는 마을 마녀가 용의 징표를 받고 걸어 주었고, 실패하면 **한 단계
  // 내려갔다.** 기댓값이 한 번에 +0.1 단계라 +15 까지 쉰 번쯤 걸어야 했는데,
  // 그 앞에 고룡을 몇 번씩 잡아 징표를 모으는 일이 또 있었다. 그래서 +10 에서
  // 멈춘 사람이 "여기가 끝인가" 하고 그대로 접었다 — 실제로 그런 이야기를 들었다.
  //
  // 지금은 성 안 왕실 대장간에서 **보석 한 개**로 건다.
  //   · 확률은 단계마다 90 · 80 · 70 · 60 · 50%
  //   · 실패해도 **내려가지 않는다.** 보석만 사라진다.
  //   · 부위마다 쓰는 보석이 다르다 — 무기는 루비, 방어구는 에메랄드, 장신구는 오닉스.
  // 다섯 단계를 다 올리는 데 드는 보석의 기댓값은 1/0.9+1/0.8+…+1/0.5 ≒ 8.2개다.
  // 운이 나빠도 앞으로만 가므로, 남은 것은 시간이지 운이 아니다.
  TRANSCEND_MAX: 15,
  // index = 지금 강화 수치 - ENHANCE_MAX. [+10→11, +11→12, +12→13, +13→14, +14→15]
  TRANSCEND_CHANCE: [0.9, 0.8, 0.7, 0.6, 0.5],
  // 부위별 재료. 값은 items.json 의 아이템 id.
  TRANSCEND_GEM: {
    weapon: 'gem_ruby',
    armor: 'gem_emerald',      // 투구 · 갑옷 · 어깨 · 장갑 · 신발
    accessory: 'gem_onyx',     // 반지 · 목걸이 · 허리띠
  },
  TRANSCEND_GEM_COUNT: 1,

  // ── 각인 장비 ──────────────────────────────────────────
  //
  // 바닥에서 줍거나 상점에서 산 장비 열 개 중 하나는 "각인"이 되어 나온다.
  // 각인은 강화(+N)와 아무 상관이 없다 — 처음부터 그렇게 생겨난 물건이고,
  // 그 부위에 붙을 수 있는 옵션 하나를 더 달고 있다.
  //
  // 값은 굴리지 않는다. 그 옵션이 가질 수 있는 범위의 한가운데(50%)로 고정이다.
  // 강화 +7~+9 의 무작위 옵션은 "굴려서 나오는 값"이고, 각인은 "덤으로 붙는
  // 한 줄"이라 최고치가 나오면 강화를 굴릴 이유가 사라진다.
  BONUS_AFFIX_CHANCE: 0.1, // 열에 하나
  BONUS_AFFIX_ROLL: 0.5, // 범위의 한가운데

  // 무작위 옵션 다시 굴리기(리롤).
  //
  // 마음에 안 드는 옵션 하나만 골라 다시 굴린다. 강화 단계는 그대로다 —
  // 떨어질 위험이 없으므로 마음 편히 굴릴 수 있고, 대신 값이 비싸다.
  // 굴린 결과가 더 나쁠 수도 있다(그게 도박의 전부다).
  REROLL_COST_BASE: 900,
  REROLL_COST_GROWTH: 1.45, // 붙은 옵션이 많을수록(=강화가 높을수록) 비싸진다
  REROLL_MATERIAL_COUNT: 3, // 장비 등급이 정하는 재료를 이만큼

  // 상점 / 여관
  SELL_RATE: 0.4,
  INN_COST: 20,
  INN_BUFF: {
    id: 'inn_rest',
    name: '푹 쉰 기운',
    icon: '🛏',
    durationMs: 300000, // 5분
    effects: { regen: 5, speedMult: 1.5 },
    desc: '초당 HP 5 회복 · 이동속도 1.5배',
  },

  // 단축키
  QUICKSLOT_COUNT: 4,
  // 전투 중 물약은 사람이 누르지 않고 자동으로 마신다. 이 값은 그 간격이다.
  QUICKSLOT_BATTLE_COOLDOWN_MS: 2000,
  QUICKSLOT_FIELD_COOLDOWN_MS: 400,

  // 시전 시간(ms) — 이 시간 동안 제자리에 서 있어야 발동한다.
  RETURN_CAST_MS: 1000,

  // 특성/스킬 초기화 비용(골드). 찍은 포인트가 많을수록 비싸진다.
  //   비용 = BASE + PER_POINT × 쓴 포인트 + PER_LEVEL × 레벨
  RESET_COST: { BASE: 200, PER_POINT: 120, PER_LEVEL: 30 },

  // 보상
  GOLD_VARIANCE: 0.25,
};

/**
 * 이 강화에 필요한 재료. 재료 종류는 "장비 등급"이 정한다(단계마다 바뀌지 않는다).
 * @param {number} currentLevel 지금 강화 수치(0이면 +1 시도)
 * @param {string} rarity 장비 등급 — common | rare | epic | legendary
 */
export function enhanceMaterial(currentLevel, rarity = 'common') {
  const table = BALANCE.ENHANCE_MATERIAL_BY_RARITY;
  const id = table[rarity] || table.common;
  const c = BALANCE.ENHANCE_MATERIAL_COUNT;
  const count = c.base + Math.floor(Math.max(0, currentLevel) / c.perLevels);
  return { id, count };
}

/**
 * 옵션 하나를 다시 굴리는 값.
 * @param {number} affixIndex 몇 번째 옵션인가(0부터). 뒤쪽 옵션일수록 비싸다.
 */
export function rerollCost(affixIndex = 0) {
  return Math.floor(
    BALANCE.REROLL_COST_BASE * Math.pow(BALANCE.REROLL_COST_GROWTH, Math.max(0, affixIndex))
  );
}

/**
 * 초월 강화 성공 확률. +10→11 이 90%, 한 단계 오를 때마다 10%p 씩 내려간다.
 * @param {number} currentLevel 지금 강화 수치(+10 이상)
 */
export function transcendChance(currentLevel) {
  const table = BALANCE.TRANSCEND_CHANCE;
  const i = Math.max(0, currentLevel - BALANCE.ENHANCE_MAX);
  return table[Math.min(i, table.length - 1)];
}

/**
 * 이 부위의 초월 강화에 쓰는 보석.
 *
 * 무기는 루비, 방어구는 에메랄드, 장신구는 오닉스.
 * 부위를 셋으로 묶는 자리가 여기 하나뿐이어야, 화면과 판정이 다른 말을 하지 않는다.
 *
 * @param {string} slot items.json 의 slot
 * @returns {{id:string, count:number, group:string}}
 */
export function transcendMaterial(slot) {
  const g = BALANCE.TRANSCEND_GEM;
  const group = slot === 'weapon' ? 'weapon'
    : (slot === 'ring' || slot === 'necklace' || slot === 'belt') ? 'accessory'
      : 'armor';
  return { id: g[group], count: BALANCE.TRANSCEND_GEM_COUNT, group };
}

/**
 * 상점 판매가(플레이어가 팔 때 받는 금액).
 * @param {number} goldFind 골드 획득 증가(특성 '골드 획득 증가' + 사냥꾼 패시브). 0.3 = +30%
 */
export function sellPrice(itemDef, enhanceLevel = 0, goldFind = 0) {
  const base = (itemDef.price || 1) * BALANCE.SELL_RATE;
  return Math.max(1, Math.floor(base * (1 + enhanceLevel * 0.25) * (1 + Math.max(0, goldFind))));
}

/** 상점 구매가. */
export function buyPrice(itemDef) {
  return Math.max(1, Math.floor(itemDef.price || 1));
}

/** 필드 단계 보정이 적용된 몬스터 스탯. */
export function scaleMonsterStats(stats, power = 1) {
  return {
    hp: Math.round(stats.hp * power),
    atk: Math.round(stats.atk * power),
    def: Math.round(stats.def * power),
    spd: +(stats.spd * (1 + (power - 1) * 0.25)).toFixed(2),
    crit: stats.crit,
  };
}

/** 다음 레벨까지 필요한 누적 경험치. */
export function expToNext(level) {
  if (level >= BALANCE.MAX_LEVEL) return Infinity;
  return Math.floor(BALANCE.EXP_BASE * Math.pow(BALANCE.EXP_GROWTH, level - 1));
}

/** 레벨에 따른 기본 스탯. base/growth 는 직업(classes.json)에서 온다. */
export function statsAtLevel(base, level, growth = null) {
  const g = growth || BALANCE.GROWTH_PER_LEVEL;
  const n = level - 1;
  return {
    hp: Math.floor(base.hp + g.hp * n),
    atk: Math.floor(base.atk + g.atk * n),
    def: Math.floor(base.def + g.def * n),
    spd: +(base.spd + g.spd * n).toFixed(2),
    crit: +(base.crit + g.crit * n).toFixed(4),
  };
}

/** 소수점 그대로 두어야 하는 스탯(비율). 나머지는 정수로 반올림한다. */
const RATIO_STATS = new Set(['crit', 'critDmg']);

/** 이 등급의 "+1당 증가율". 등급이 낮을수록 덜 오른다. */
export function enhanceRate(rarity = 'common') {
  const table = BALANCE.ENHANCE_BONUS_BY_RARITY;
  const k = table[rarity] != null ? table[rarity] : table.common;
  return BALANCE.ENHANCE_BONUS_PER_LEVEL * k;
}

/**
 * 장비 1개가 실제로 주는 스탯(강화 보정 포함).
 * @param {object} itemStats items.json 의 stats
 * @param {number} enhanceLevel 강화 수치
 * @param {string} rarity 등급 — 강화가 얼마나 붙는지를 정한다
 */
export function enhancedStats(itemStats, enhanceLevel, rarity = 'epic') {
  const mult = 1 + enhanceRate(rarity) * enhanceLevel;
  const out = {};
  for (const [k, v] of Object.entries(itemStats || {})) {
    out[k] = RATIO_STATS.has(k) ? +(v * mult).toFixed(4) : Math.round(v * mult);
  }
  return out;
}

/** 강화 성공 확률. 표에서 바로 꺼낸다. */
export function enhanceChance(currentLevel) {
  const table = BALANCE.ENHANCE_CHANCE_TABLE;
  const c = table[currentLevel] ?? table[table.length - 1];
  return Math.max(BALANCE.ENHANCE_MIN_CHANCE, c);
}

/**
 * 특성/스킬 초기화 비용.
 * @param {number} spentPoints 되돌릴 포인트 수
 * @param {number} level 캐릭터 레벨
 */
export function resetCost(spentPoints, level) {
  const c = BALANCE.RESET_COST;
  if (!spentPoints) return 0;
  return Math.floor(c.BASE + c.PER_POINT * spentPoints + c.PER_LEVEL * level);
}

/** 강화 비용(골드). */
export function enhanceCost(currentLevel) {
  return Math.floor(
    BALANCE.ENHANCE_COST_BASE * Math.pow(BALANCE.ENHANCE_COST_GROWTH, currentLevel)
  );
}

/**
 * 한 대 때렸을 때의 데미지. rand는 0~1 난수.
 * @param {number} critMultBonus 스킬/강화로 늘어난 치명타 배율(0.12 = +12%)
 */
export function damage(atk, def, rand, isCrit, critMultBonus = 0) {
  const mitigated = atk * (atk / (atk + Math.max(0, def) * BALANCE.DEFENSE_SOFTNESS));
  const variance = 1 + (rand * 2 - 1) * BALANCE.DAMAGE_VARIANCE;
  let dmg = mitigated * variance;
  if (isCrit) dmg *= BALANCE.CRIT_MULTIPLIER + critMultBonus;
  return Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg));
}

// ── 전투력 ──────────────────────────────────────────────
// "이 녀석이 나보다 센가?"를 숫자 하나로 답하기 위한 값.
// 실제 전투 계산에는 절대 쓰지 않는다 — 순전히 보여 주기용 잣대다.
//
// 만드는 방법: 버티는 힘(HP × 방어 보정)과 때리는 힘(공격 × 치명타 기대치)을 곱한 뒤
// 제곱근을 취한다. 곱해야 "HP만 높고 공격이 없는 것"이 세 보이지 않고,
// 제곱근을 씌워야 숫자가 백만 단위로 튀지 않는다.
export const POWER = {
  DEF_WEIGHT: 0.55, // 방어력이 실효 체력을 늘리는 정도(damage() 의 체감 계수와 같은 뜻)
  SPD_WEIGHT: 0.004, // 속도는 선공에만 관여하므로 아주 조금만
  SCALE: 1.6, // 보기 좋은 자릿수로 맞추는 배수
  // 관통을 셈에 넣기 위한 "보통 상대" 의 단단함 — (상대 방어 × 0.9) ÷ 내 공격.
  //
  // 관통은 상대 방어력을 깎는 값이라, 상대가 얼마나 단단한지를 모르면
  // 값어치를 말할 수 없다(물렁한 상대에게는 거의 0 이다). 전투력은 상대를
  // 모르는 잣대이므로, 보스 다섯 자리에서 실제로 잰 값(0.9~2.5)의 가운데를 쓴다.
  // 이 값이면 다이아몬드 한 알(관통 +10%)이 전투력을 +7% 올린다 —
  // 실제로 잰 평균 피해 상승(+6.9%)과 같은 자리다.
  // 재는 도구: node tools/pierce-check.js
  PIERCE_REF: 2.0,
};

/**
 * 전투력 한 수치.
 * @param {{hp:number, atk:number, def:number, spd:number, crit:number}} s
 * @param {object} [mods] 있으면 치명타 피해·피해 감소까지 반영한다
 */
export function combatPower(s, mods = null) {
  const m = mods || {};
  // 실효 체력 — 방어력이 높을수록 같은 HP 가 더 오래 간다.
  const ehp = s.hp * (1 + (s.def * POWER.DEF_WEIGHT) / 100) * (1 + (m.dmgReduction || 0));
  // 실효 공격 — 치명타가 터지는 만큼 평균 피해가 오른다.
  const critMult = BALANCE.CRIT_MULTIPLIER + (m.critMult || 0);
  // 관통 — 상대 방어력을 그만큼 없는 셈 치므로 피해가 이 배로 늘어난다.
  //   피해 ∝ 1 / (1 + 방어×0.55/공격)  이고, 관통 p 는 그 방어를 (1-p) 로 줄인다.
  // (0.54 까지 전투력에 아예 안 들어가 있어서, 다이아몬드를 박아도 숫자가 그대로였다)
  const pierce = Math.min(0.95, Math.max(0, m.pierce || 0));
  const pierceGain = (1 + POWER.PIERCE_REF) / (1 + POWER.PIERCE_REF * (1 - pierce));
  const edmg =
    s.atk *
    (1 + (s.crit || 0) * (critMult - 1)) *
    (1 + (m.doubleHit || 0)) *
    (1 + (m.magicPower || 0) * 0.5) *
    pierceGain;

  const raw = Math.sqrt(Math.max(1, ehp) * Math.max(1, edmg));
  return Math.max(1, Math.round(raw * POWER.SCALE * (1 + (s.spd || 0) * POWER.SPD_WEIGHT)));
}

/**
 * 내 전투력 대비 상대의 전투력이 어느 정도인가.
 * @returns {{ratio:number, tier:'easy'|'even'|'hard'|'deadly', label:string}}
 */
// 경계값은 눈대중이 아니라 **실제 전투 시뮬레이션에 맞춰** 잡았다.
// 맞는지는 `node tools/stage-color.js` 가 스무 단계 전부에서 색과 실제 승률을
// 나란히 재어 확인한다. 고쳤으면 반드시 그 도구를 다시 돌린다.
//
// ── 0.36 에서 통째로 다시 잡았다 ────────────────────────────
// 예전 경계는 "알맞은 캐릭터 vs 그 단계 잡몹이 0.45~0.60" 이라는 전제로 잡혀 있었다.
// 그 전제가 오래전에 무너져 있었다 — 실제로 재 보니 **스무 단계 가운데 열아홉이**
// 배수 1.2~1.9 에 몰려 전부 주황(버거움)으로 떴다. 그런데 그 싸움들의 실제 승률은
// 64~97% 였다. 사람이 이길 수 있는 땅을 한결같이 "버거움"으로 보고 있었던 것이다.
// 색이 늘 같은 말을 하면 색이 없는 것과 같다.
//
// 지금 경계는 아래 승률 띠에 맞춰 놓았다(tools/stage-color.js 의 tierForRate).
//   회색 95%~ · 초록 80~95% · 노랑 60~80% · 주황 35~60% · 빨강 ~35%
// 전투력은 직업 궁합도 물약도 스킬도 모르는 잣대라 완벽히 맞지는 않는다.
// 스무 자리 가운데 열일곱이 맞고, 어긋나는 셋도 한 칸 차이다 — 잣대 하나로는 여기까지다.
export function powerTier(mine, theirs) {
  const ratio = theirs / Math.max(1, mine);
  if (ratio <= 0.9) return { ratio, tier: 'trivial', label: '한 수 아래' };
  if (ratio <= 1.3) return { ratio, tier: 'easy', label: '쉬움' };
  if (ratio <= 2.05) return { ratio, tier: 'even', label: '비슷' };
  if (ratio <= 2.45) return { ratio, tier: 'hard', label: '버거움' };
  return { ratio, tier: 'deadly', label: '위험' };
}

/** 몬스터 처치 경험치. */
export function expReward(monster, playerLevel) {
  const gap = Math.max(0.35, 1 - (playerLevel - monster.level) * 0.12);
  return Math.max(1, Math.round(monster.exp * gap));
}

/**
 * 몬스터 처치 골드. rand는 0~1 난수.
 * @param {number} goldFind 골드 획득 증가. 0.3 = +30%
 */
export function goldReward(monster, rand, goldFind = 0) {
  const v = 1 + (rand * 2 - 1) * BALANCE.GOLD_VARIANCE;
  return Math.max(0, Math.round(monster.gold * v * (1 + Math.max(0, goldFind))));
}
