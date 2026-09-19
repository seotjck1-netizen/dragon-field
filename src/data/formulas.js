// 책임: 게임 밸런스 수치와 공식의 유일한 보관소.
// 규칙: 시스템 코드 안에 매직넘버를 쓰지 마라. 숫자를 바꾸고 싶으면 이 파일만 연다.
// 금지: 상태 접근, DOM 접근. 전부 순수 함수여야 한다.

export const BALANCE = {
  // 레벨
  MAX_LEVEL: 50,
  EXP_BASE: 12,
  EXP_GROWTH: 1.38,

  // 얻는 경험치의 눈금 (0.70.18 — 사람이 정한 값).
  //
  //   EXP_GAIN        몬스터를 잡아 얻는 몫. 1 이 예전 값이다.
  //   QUEST_EXP_GAIN  의뢰를 마쳐 얻는 몫.
  //
  // 표(monsters.json · quests.json)의 값은 그대로 두고 여기서만 곱한다.
  // 표를 고쳐 버리면 원래 값을 다시 알 수 없고, 다음에 또 조절할 때
  // 소수점이 겹겹이 쌓인다. 눈금은 한 곳에만 둔다.
  //
  // ⚠ 우편으로 오는 경험치(운영자가 보내는 선물)에는 안 건다.
  //   그건 사람이 직접 적어 보내는 숫자라, 여기서 깎으면 보낸 값과 받은 값이 달라진다.
  EXP_GAIN: 0.7,
  QUEST_EXP_GAIN: 0.5,

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
  // 넘친 몫으로 얻을 수 있는 치명타 피해의 **천장** (0.70.8).
  //
  // 0.70.7 의 만렙 용사는 치명타 확률이 1.28 이었다 — 넘친 0.43 이 ×10 을 타고
  // **치명타 피해 +434%p** 가 됐다. "남은 한 장을 살려 주는" 장치가 주력
  // 피해원이 되어 버린 것이다. 확률이 강화로 안 오르게 고쳤으니 넘침 자체가
  // 줄지만, 천장이 없으면 같은 일이 언제든 다시 난다.
  CRIT_OVERFLOW_CAP: 1.0, // 치명타 피해 +100%p 까지만

  // 받는 피해 감소의 천장 (0.70.8).
  //
  // ⚠ 이게 없어서 **무적**이 만들어졌다. 불굴 5·강철 의지 5 에 전설 장비의
  //   '스킬 효과 배가'가 겹치면 dmgReduction 이 1.26 — 즉 126% 감소였다.
  //   CombatSystem 은 dmg×(1-1.26) 을 MIN_DAMAGE 로 끌어올리므로,
  //   **무엇에 맞아도 1 데미지**가 된다. 고룡 2단계가 30분 만에 죽은 이유다.
  DMG_REDUCTION_CAP: 0.75,

  // 방어력을 공격력으로 바꾸는 비율의 천장 (용사 '전투 본능').
  // 5단계 × 8% = 40% 가 설계값이다. 전설 장비 배가가 얹혀도 여기서 멎는다.
  DEF_TO_ATK_CAP: 0.4,

  // 전설 장비의 '스킬 효과 배가'는 **겹치지 않는다** — 가장 큰 것 하나만 센다.
  // (두 장을 끼면 ×3 이 되어 있었다. 아래 SKILL_POWER_CAP 이 그 위의 천장이다)
  SKILL_POWER_CAP: 1,

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

  // 마법은 갑옷을 얼마나 무시하는가 (0.70.12).
  //
  // 방어력은 "두꺼운 것으로 막는 것"이다. 칼은 갑옷이 막지만 불길과 저주는
  // 갑옷 사이로 스며든다 — 마법 피해가 방어력을 그대로 맞고 깎이면
  // **마법사라는 직업이 성립하지 않는다.** 실제로 0.70.11 에서 고룡의 방어력을
  // 12,000/20,000 으로 올리자, 관통이 0 인 마법사(t02)는 두 고룡 모두 0% 가 됐다.
  // 관통 보석을 사라는 답이 있긴 하지만, 그건 "마법사만 장비로 메워야 하는 빚"이다.
  //
  // 그래서 **마법으로 때리는 몫만큼 방어력을 무시한다.**
  //   실제 관통 = 장비 관통 + MAGIC_PIERCE × 마법 몫(magicShare)
  // 마법 몫은 CombatSystem.magicShare() 가 정한다 — 통째로 마법인 상대는 1,
  // 마법이 섞인 땅의 물리 몬스터는 그 비율(maps.json 의 magicPart)만큼만.
  //
  // ⚠ 이 규칙은 **양쪽에 똑같이** 걸린다. 고룡도 school:'magic' 이므로 사람의
  //   방어력을 이만큼 무시한다. 일부러 그렇게 뒀다 — 마법을 막는 것은 방어력이
  //   아니라 **마법 저항**(용린 세트)이라는 0.70.11 의 설계를 그대로 잇기 때문이다.
  //   한쪽에만 걸면 같은 이름의 규칙이 두 개가 되고, 사람이 규칙을 배울 수 없다.
  //
  // 숫자는 tools/magic-pierce.js 로 **재서** 정했다(추측이 아니다).
  MAGIC_PIERCE: 0.4,
  // 관통의 천장 — 방어력을 100% 무시하면 방어력이라는 값 자체가 죽는다.
  PIERCE_CAP: 0.9,
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

  // 보석 노인 — 무작위 한 알의 값 (0.70.14).
  //
  // 왜 100만인가: 지하감옥 5층 주인이 한 번에 10만 남짓을 준다. 열 번쯤 잡아야
  // 한 알을 뽑을 수 있는 값이라, "돈이 남아서 사는 것" 이 아니라
  // **깊은 곳을 몇 번 다녀와서 사는 것**이 된다.
  // 셋을 하나로 바꾸는 쪽(GambleSystem.TRADE_COST)은 값이 보석 그 자체라 공짜다.
  GEM_GAMBLE_PRICE: 1000000,

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
const RATIO_STATS = new Set(['crit', 'critDmg', 'pierce']);

/**
 * **강화로 오르지 않는** 스탯. 적힌 값 그대로 쓴다. (0.70.8)
 *
 * 왜 치명타 확률인가: 이것만은 **천장이 있는 값**이다(CRIT_CAP 85%).
 * 다른 스탯은 강화로 세 배가 되면 세 배만큼 세지지만, 확률은 85% 에서 멎는다.
 * 그런데 강화 배율은 확률에도 똑같이 걸려 있었다 —
 *   천공궁 치명타 18% → +15 강화면 **61%**, +20 초월이면 **76%**.
 * 반지 둘·허리띠까지 더하면 혼자서 100% 를 훌쩍 넘는다. 그래서
 *   · 치명타 확률이 **남아돌고** (무엇을 껴도 85%)
 *   · 넘친 몫이 치명타 피해로 바뀌는 장치(CRIT_OVERFLOW_TO_DMG)가
 *     원래 "한두 장 남은 몫을 살려 주는" 자리였는데 **주력 피해원**이 됐다.
 * 확률은 아이템에 적힌 값 그대로 두고, 강화는 공격력·방어력·체력만 올린다.
 *
 * 0.70.9 — **치명타 피해(critDmg)도 여기 넣었다.** 같은 종류의 값이다:
 *   룬 목걸이 0.3 → +20 초월이면 1.26. 만렙 몸의 치명타 피해가 +322~568% 였고
 *   그중 대부분이 이 길로 들어왔다. 치명타는 85% 확률로 터지므로 사실상
 *   **상시 배율**이다 — 상시 배율을 강화로 네 배 늘리면 다른 스탯이 뜻을 잃는다.
 *
 * 0.70.13 — **관통(pierce)도 여기 넣었다.** 활의 기본 옵션이 치명타에서 관통으로
 *   바뀌면서 같은 문제를 그대로 물려받기 때문이다. 관통은 "상대 방어력을 이만큼
 *   없는 셈 친다"이고 천장이 있다(PIERCE_CAP 90%). 강화 배율이 걸리면
 *   천공궁 관통 18% 가 +15 에서 61% 가 되어, 활 한 자루로 천장에 닿는다.
 *   적힌 값 그대로 쓰고, 강화는 공격력·속도·체력만 올린다.
 */
const FIXED_STATS = new Set(['crit', 'critDmg', 'pierce']);

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
    if (FIXED_STATS.has(k)) { out[k] = v; continue; } // 강화해도 그대로 (위 주석 참고)
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
  // ── 이 숫자들은 **재서 정한 것**이다 (0.70.11) ──────────────
  //
  // node tools/power-fit.js --fit 이 기준 몸 하나를 세우고, 칸을 하나씩 올려 가며
  // **실제 전투**(물리 잡몹 3 + 마법 보스 4, 칸마다 112판)에서 얼마나 세지는지 잰다.
  // 아래 지수는 그 측정값이다. 손으로 적은 값이 아니다.
  //
  // 왜 다시 잡았나: 예전 수식은 √(실효체력 × 실효공격) 한 덩어리였고
  // 가중치를 사람이 눈대중으로 적었다. 그래서 사람이 보낸 세 세이브에서 **거꾸로**
  // 나왔다 — t00 용사 765,692 인데 아그라모스 30%, t02 마법사 59,736 인데 63%.
  // 재 보니 원인이 또렷했다:
  //   · 흡혈           실제 +14.6%  ↔  수식 0%     (아예 안 세고 있었다)
  //   · 받는 마법 피해 실제 +15.2%  ↔  수식 0%     (아예 안 세고 있었다)
  //   · 방어 관통      실제  +2.3%  ↔  수식 +14%   (여섯 배 부풀려 세고 있었다)
  //   · 방어력 ×1.3    실제  +4.7%  ↔  수식 +12.8%
  // 보석을 전부 루비로 바꾸면 피해가 +16% 오르는데 전투력이 22% 내려간 것도 이 때문이다.
  //
  // ⚠ 표(몬스터 능력치·스킬·특성)를 크게 고쳤으면 **다시 재라**:
  //     node tools/power-fit.js --fit
  //   그리고 지수를 바꿨으면 반드시 node tools/stage-color.js 로 경계값을 다시 본다.

  // ⚠ 0.70.12 에 다시 쟀다. 마법이 갑옷을 40% 무시하게 되면서 **방어력의 값이
  //   실제로 떨어졌기 때문**이다(DEF 0.175 → 0.119). 수식을 안 고쳤으면
  //   전투력만 옛날 세상을 가리켰을 것이다.

  // 스탯의 지수 — power ∝ hp^HP × atk^ATK × (1+def)^DEF
  HP: 0.564,   // 체력 ×1.3 → 실제 +15.9%
  ATK: 0.284,  // 공격력 ×1.3 → 실제 +7.7%  (체력의 절반쯤)
  DEF: 0.119,  // 방어력 ×1.3 → 실제 +3.2%  — 마법 관통이 생기며 값이 내렸다

  // 보정의 지수 — 전부 (1 + 값)^지수 꼴
  CRIT: 0.295,          // 치명타 확률
  CRIT_MULT: 0.141,     // 치명타 피해
  PIERCE: 0.104,        // 방어 관통 (다이아몬드)
  DOUBLE_HIT: 0.613,    // 연속 공격
  LIFESTEAL: 0.649,     // 흡혈 — 0.70.11 에는 0.817 로 과대평가하고 있었다
  DMG_REDUCTION: 0.783, // 받는 피해 감소
  MAGIC_RESIST: 0.514,  // 받는 마법 피해 감소
  MAGIC_POWER: 0.2,     // 마법 피해 증가 — 마법으로 때리는 몸에만 붙는다(재지 않음, 보수적으로)

  SPD_WEIGHT: 0.004, // 속도는 선공에만 관여하므로 아주 조금만
  // 보기 좋은 자릿수로 맞추는 배수. 지수를 바꾸면 자릿수가 통째로 달라지므로
  // 여기서 되돌린다 — 사람이 기억하는 숫자대(수만~수십만)를 지키려는 것뿐이다.
  SCALE: 33,
};

/**
 * 전투력 한 수치.
 *
 * 모양: SCALE × hp^HP × atk^ATK × (1+def)^DEF × Π(1 + 보정)^지수
 * 지수는 전부 tools/power-fit.js 가 실제 전투에서 잰 값이다(위 POWER 주석 참고).
 *
 * @param {{hp:number, atk:number, def:number, spd:number, crit:number}} s
 * @param {object} [mods] 있으면 치명타 피해·흡혈·마법 저항까지 반영한다
 */
export function combatPower(s, mods = null) {
  const m = mods || {};
  const P = POWER;
  const pos = (x) => Math.max(0, x || 0);

  let v = P.SCALE
    * Math.pow(Math.max(1, s.hp || 1), P.HP)
    * Math.pow(Math.max(1, s.atk || 1), P.ATK)
    * Math.pow(1 + pos(s.def), P.DEF);

  // 치명타 — 확률과 피해는 서로 곱해져 돌아가지만, 잴 때는 따로 재도 같은 값이 나왔다
  // (확률 지수 0.295 · 피해 지수 0.141). 그래서 따로 곱한다.
  v *= Math.pow(1 + pos(s.crit), P.CRIT);
  v *= Math.pow(1 + pos(m.critMult), P.CRIT_MULT);

  v *= Math.pow(1 + pos(m.doubleHit), P.DOUBLE_HIT);
  v *= Math.pow(1 + pos(m.lifesteal), P.LIFESTEAL);
  v *= Math.pow(1 + Math.min(BALANCE.DMG_REDUCTION_CAP, pos(m.dmgReduction)), P.DMG_REDUCTION);
  // 받는 마법 피해 감소는 전투에서 80% 에서 멎는다(CombatSystem 의 strike).
  // 전투력만 천장 없이 세면, 용린 4세트처럼 105%·120% 가 찍히는 몸에서
  // 있지도 않은 힘을 세게 된다.
  v *= Math.pow(1 + Math.min(0.8, pos(m.magicResist)), P.MAGIC_RESIST);
  // 관통 — 장비에서 온 것과 **마법이 타고난 것**(magicPierce)을 합쳐서 센다.
  // 마법사는 관통 보석이 하나도 없어도 방어력을 무시하고 때리므로,
  // 그 몫을 빼고 재면 전투력이 실제보다 낮게 찍힌다(0.70.11 의 t02 가 그랬다).
  v *= Math.pow(1 + Math.min(BALANCE.PIERCE_CAP, pos(m.pierce) + pos(m.magicPierce)), P.PIERCE);
  v *= Math.pow(1 + pos(m.magicPower), P.MAGIC_POWER);

  v *= 1 + pos(s.spd) * P.SPD_WEIGHT;
  return Math.max(1, Math.round(v));
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
  // ⚠ 0.70.11 — **경계를 통째로 다시 잡았다.**
  //   전투력 수식이 바뀌면서 배수의 폭이 좁아졌다(예전 0.6~2.5 → 지금 0.67~2.03).
  //   옛 경계를 그대로 두면 스무 단계 가운데 열여섯이 '비슷'(노랑) 한 색으로
  //   뭉개진다 — 20단계 승률 8% 짜리까지 노랑이었다.
  //   아래 값은 node tools/stage-color.js 가 스무 단계에서 잰 실제 승률에
  //   맞춰 고른 것이다. 수식을 또 고치면 **반드시 그 도구를 다시 돌린다.**
  // 0.70.12 — 마법 관통이 생기며 방어력의 값이 내렸고(POWER.DEF 0.175 → 0.119)
  // 배수의 눈금이 다시 밀렸다. stage-color.js 가 잰 실제 승률로는
  // '버거움'(주황)이 배수 1.21~1.82 를 통째로 덮는다 — 넓어 보이지만,
  // 사람이 "몇 번 도전하면 이기는" 구간이 실제로 그만큼 넓다는 뜻이다.
  if (ratio <= 1.05) return { ratio, tier: 'trivial', label: '한 수 아래' };
  if (ratio <= 1.15) return { ratio, tier: 'easy', label: '쉬움' };
  if (ratio <= 1.21) return { ratio, tier: 'even', label: '비슷' };
  if (ratio <= 1.82) return { ratio, tier: 'hard', label: '버거움' };
  return { ratio, tier: 'deadly', label: '위험' };
}

/**
 * 몬스터 처치 경험치.
 *
 * ⚠ 표(monsters.json)의 exp 는 **손대지 않는다.** 여기서 배수만 건다 —
 *   표를 통째로 0.7배로 고쳐 버리면 "원래 얼마였나" 를 다시 알 수 없고,
 *   다음에 또 조절할 때 소수점이 겹겹이 쌓인다. 눈금은 한 곳(BALANCE)에만 둔다.
 */
export function expReward(monster, playerLevel) {
  const gap = Math.max(0.35, 1 - (playerLevel - monster.level) * 0.12);
  return Math.max(1, Math.round(monster.exp * gap * BALANCE.EXP_GAIN));
}

/**
 * 의뢰 보상 경험치.
 *
 * 몬스터보다 더 깎는다(0.5 대 0.7). 의뢰는 한 번 받고 끝나는 덩어리라,
 * 같은 비율로 깎으면 "사냥은 느려졌는데 의뢰만 여전히 한 방" 이 된다.
 */
export function questExpReward(exp) {
  return Math.max(0, Math.round((Number(exp) || 0) * BALANCE.QUEST_EXP_GAIN));
}

/**
 * 몬스터 처치 골드. rand는 0~1 난수.
 * @param {number} goldFind 골드 획득 증가. 0.3 = +30%
 */
export function goldReward(monster, rand, goldFind = 0) {
  const v = 1 + (rand * 2 - 1) * BALANCE.GOLD_VARIANCE;
  return Math.max(0, Math.round(monster.gold * v * (1 + Math.max(0, goldFind))));
}
