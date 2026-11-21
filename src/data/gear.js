// 0.80.20 — 장비 셋(무기 · 방어구 · 장신구)을 한 규칙으로 묶는다.
//
// 이 파일은 **숫자와 계산만** 둔다(다른 모듈을 부르지 않는다). 굴림은 AffixSystem,
// 몸에 더하는 일은 StatBlock 이 한다. 원문: docs/SPEC-0.80.md 「장비 — 등급과 기본값」.
//
//   무기 대미지 = 단계 기본값 × 등급 배율 + 등급 덤(태어날 때 굴림) + 강화(+10 끝)
//     → 몸 공격력 + 대미지(고정 공격력) 를 더한 뒤 × (1 + 대미지 × 4%)
//   방어구 방어 = 같은 식. 다섯 부위(투구 · 어깨 · 갑옷 · 장갑 · 신발)를 더해
//     → 방어력 × (1 + 합 × 2.2%) · 최대 HP × (1 + 합 × 3%)
//
// 0.80.26 — 사용자 답(2026-11-13): "무기를 바꿔도, 등급이 높아도 차이가 작다" → **무기 계단 + 등급 배율**.
//   디아블로 2 의 노멀 → 익셉셔널 → 엘리트처럼 물건마다 **단계**(items.json 의 tier, 1 ~ 5)가 있고
//   단계가 오를수록 기본값이 크게 오른다(W_TIER · A_TIER). 같은 물건도 등급이 높을수록 그 기본값에
//   배율이 붙는다(GRADES.mult — 일반 1.0 … 전설 1.75). 예전(0.80.20 ~ 0.80.25)은 어느 물건이든 기본 5 였다.
//   무기 대미지는 **고정 공격력으로도** 더해진다(W_FLAT) — 몸이 약한 초반에 한 자루가 확 세게 느껴지게.
//   장신구(반지 · 목걸이 · 허리띠)는 기본값이 없고 옵션 줄만 있다. 강화 한 단계마다 줄 값 +5%.
//
// 등급(일반 · 고급 · 희귀 · 영웅 · 전설)은 **물건마다** 굴린다(inst.grade).
// 같은 이름의 물건이라도 등급 · 덤 · 줄이 다르다. 표의 rarity 는 "굴리지 않았을 때의 기본"이다.
//
// 저장 형태(소지품 한 칸):
//   { uid, id, count:1, enhance, grade:'epic', plus:3, affixes:[{a,v}…], special:'keen', ups:[0.021,…], gems, bonus }
//   plus     등급 덤(무기 · 방어구만, 장신구는 0)
//   affixes  등급이 정한 옵션 줄(예전에는 +7~+9 에 붙던 자리 — 다시 굴리기 · 표시를 그대로 쓴다)
//   special  전설 특수효과 id(아래 SPECIALS)
//   ups      +7 부터 올라설 때마다 굴린 덤(무기 치명타 · 방어구 받는 피해). 길이 = max(0, 강화 - 6)
//   bonus    각인(예전 그대로)

export const GEAR = {
  BASE: 5, // 0.80.25 까지의 기본값(단계가 없는 물건 · 옛 계산 비교용)
  // 0.80.26 — 단계(1 ~ 5)마다의 기본값. [0] 은 비워 둔다.
  //   무기  1 목검 · 낡은 활 · 옹이 지팡이 / 2 강철 · 사냥용 / 3 화염 · 장궁 · 대마법사 · 마검
  //         4 서리 · 뇌전 · 성염 · 용린 기사 / 5 용살자 · 천공궁 · 세계수
  //   방어구 1 천 / 2 가죽 / 3 기사 · 강철 / 4 용린 · 룬 / 5 용비늘 성갑
  W_TIER: [0, 4, 8, 13, 19, 26],
  A_TIER: [0, 2, 4, 6, 9, 12],
  // 강화 한 단계가 더하는 값(단계가 높은 물건일수록 한 단계가 크다 — 기본값이 커진 만큼 강화도 같이 값을 한다)
  ENH_TIER: [0, 1, 1.5, 2, 2, 2.5],
  // 무기 대미지 1 마다 더하는 고정 공격력(몸에 % 배율이 붙기 전에 더한다)
  W_FLAT: 1,
  W_ATK: 0.04,
  DEF_K: 0.012,
  HP_K: 0.03,
  ACC_ENH: 0.05,
  ENH_MAX: 10,
  // +7 · +8 · +9 · +10 에 올라설 때마다 덤 하나를 굴린다.
  ROLL_FROM: 7,
  // [최소, 최대, 끊는 단위]
  W_CRIT: [0.01, 0.03, 0.001],
  A_DR: [0.005, 0.015, 0.001],
  // 이 단계로 올리려다 실패하면 한 단계 내려간다(C 규칙). +7 까지는 그 자리.
  FALL_FROM: 8,
};

// mult — 0.80.26: 단계 기본값에 곱하는 등급 배율(같은 물건이라도 등급이 높으면 그만큼 세다)
export const GRADES = {
  common: { name: '일반', bonus: [0, 0], lines: 0, special: false, mult: 1 },
  uncommon: { name: '고급', bonus: [1, 2], lines: 1, special: false, mult: 1.15 },
  rare: { name: '희귀', bonus: [1, 3], lines: 2, special: false, mult: 1.3 },
  epic: { name: '영웅', bonus: [1, 4], lines: 3, special: false, mult: 1.5 },
  legendary: { name: '전설', bonus: [1, 5], lines: 3, special: true, mult: 1.75 },
};

export const GRADE_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** 무기 갈래 고유 옵션(등급 · 강화와 상관없음). 갈래는 appearance.json 의 무기 모양에서 읽는다. */
export const INNATE = {
  sword: { mods: { crit: 0.06 }, stats: {}, label: '검 — 치명타 확률 +6%' },
  bow: { mods: { pierce: 0.1 }, stats: { spd: 8 }, label: '활 — 방어 관통 +10% · 속도 +8' },
  staff: { mods: { critMult: 0.15 }, stats: {}, label: '지팡이 — 치명타 피해 +15%' },
};
const SHAPE_TO_INNATE = { sword: 'sword', greatsword: 'sword', club: 'sword', bow: 'bow', staff: 'staff' };

export function innateOf(shape) {
  const k = SHAPE_TO_INNATE[shape];
  return k ? INNATE[k] : null;
}

/**
 * 전설 특수효과. 부위 무리마다 따로 있다. 같은 효과가 여러 부위에 붙으면 겹친다
 * (받는 피해 감소 75% 같은 천장은 그대로). '재주 메아리'(skillPower)는 가장 큰 하나만 센다.
 */
export const SPECIALS = {
  weapon: [
    { id: 'twin', name: '쌍격', desc: '30% 확률로 한 번 더 친다', mods: { doubleHit: 0.3 } },
    { id: 'thirst', name: '피의 갈증', desc: '준 피해의 5%만큼 HP 회복', mods: { lifesteal: 0.05 } },
    { id: 'pierce', name: '꿰뚫음', desc: '상대 방어력 20% 무시', mods: { pierce: 0.2 } },
    {
      id: 'fury', name: '벼랑 끝', desc: '내 HP 50% 이하면 모든 공격이 치명타 · 치명타 피해 +150%',
      mods: { lowHpCrit: 1, lowHpCritMult: 1.5, lowHpThreshold: 0.5 },
    },
    { id: 'aegis', name: '수호', desc: '받는 피해 -6% · 받는 마법 피해 -10%', mods: { dmgReduction: 0.06, magicResist: 0.1 } },
    { id: 'echo', name: '재주 메아리', desc: '찍어 둔 스킬 효과 +40%(겹치지 않음)', mods: { skillPower: 0.4 } },
    // 0.80.20 — 갈래 시너지(스킬 트리와 맞물린다). 직업을 가리지 않는다 — 찍은 모양을 본다.
    { id: 'resonance', name: '공명', desc: '가장 많이 찍은 갈래의 효과 +25%', mods: { mainBranchPower: 0.25 } },
  ],
  armor: [
    { id: 'spikewall', name: '가시 장벽', desc: '맞으면 방어력의 60%를 되돌린다', mods: { thorns: 0.6 } },
    { id: 'lifeplate', name: '생명의 갑주', desc: '최대 HP +25%', mods: { hpMult: 0.25 } },
    { id: 'warding', name: '마법 방벽', desc: '받는 마법 피해 -30%', mods: { magicResist: 0.3 } },
    { id: 'bulwark', name: '굳건함', desc: '받는 피해 -12%', mods: { dmgReduction: 0.12 } },
    { id: 'rooted', name: '뿌리 깊음', desc: '뿌리 칸 효과 +50%', mods: { rootPower: 0.5 } },
  ],
  accessory: [
    { id: 'midas', name: '황금 손', desc: '골드 획득 +50%', mods: { goldFind: 0.5 } },
    { id: 'alchemy', name: '연금술', desc: '물약 효과 +80%', mods: { potionMult: 0.8 } },
    { id: 'keen', name: '매서운 눈', desc: '치명타 확률 +10% · 치명타 피해 +40%', mods: { crit: 0.1, critMult: 0.4 } },
    { id: 'offshoot', name: '곁가지', desc: '두 번째로 많이 찍은 갈래의 효과 +40%(1.5갈래)', mods: { subBranchPower: 0.4 } },
  ],
};

export function specialDef(id) {
  if (!id) return null;
  for (const list of Object.values(SPECIALS)) {
    const hit = list.find((s) => s.id === id);
    if (hit) return hit;
  }
  return null;
}

const ARMOR_SLOTS = new Set(['helmet', 'shoulder', 'armor', 'gloves', 'boots']);
const ACC_SLOTS = new Set(['ring', 'ring1', 'ring2', 'necklace', 'belt']);

/** 부위 → 무리('weapon' | 'armor' | 'accessory' | null). */
export function slotGroup(slot) {
  if (slot === 'weapon') return 'weapon';
  if (ARMOR_SLOTS.has(slot)) return 'armor';
  if (ACC_SLOTS.has(slot)) return 'accessory';
  return null;
}

/** 이 물건의 등급. 굴리지 않은 물건은 표의 rarity 를 쓴다. */
export function gradeOf(inst, def) {
  const g = (inst && inst.grade) || (def && def.rarity) || 'common';
  return GRADES[g] ? g : 'common';
}

export function gradeName(g) {
  return (GRADES[g] || GRADES.common).name;
}

/** 강화 단계(+10 에서 멈춘다 — 옛 세이브의 +11~+15 도 +10 으로 본다). */
export function enhanceOf(inst) {
  return Math.max(0, Math.min(GEAR.ENH_MAX, (inst && inst.enhance) || 0));
}

/** 0.80.26 — 물건의 단계(1 ~ 5). 표(items.json 의 tier)에 없으면 1. */
export function tierOf(def) {
  const t = Math.floor(Number(def && def.tier) || 0);
  return t >= 1 && t <= 5 ? t : 1;
}

/** 0.80.26 — 단계 기본값 × 등급 배율(덤 · 강화 전). */
export function tierBase(inst, def) {
  const grp = slotGroup(def && def.slot);
  if (grp !== 'weapon' && grp !== 'armor') return 0;
  const table = grp === 'weapon' ? GEAR.W_TIER : GEAR.A_TIER;
  const g = GRADES[gradeOf(inst, def)] || GRADES.common;
  return Math.round(table[tierOf(def)] * (g.mult || 1) * 10) / 10;
}

/** 0.80.26 — 강화 한 단계가 더하는 값(물건 단계마다 · GEAR.ENH_TIER). */
export function enhStep(def) {
  return GEAR.ENH_TIER[tierOf(def)] || 1;
}

/** 무기 대미지 · 방어구 방어 = 단계 기본값 × 등급 배율 + 덤 + 강화 × 단계마다의 한 걸음. 장신구 · 장비가 아닌 것은 0. */
export function gearBase(inst, def) {
  const grp = slotGroup(def && def.slot);
  if (grp !== 'weapon' && grp !== 'armor') return 0;
  return Math.round((tierBase(inst, def) + Math.max(0, (inst && inst.plus) || 0) + enhanceOf(inst) * enhStep(def)) * 10) / 10;
}

/** 장신구 옵션 줄의 강화 배율(+5% 씩). 다른 부위는 1. */
export function lineMult(inst, def) {
  return slotGroup(def && def.slot) === 'accessory' ? 1 + GEAR.ACC_ENH * enhanceOf(inst) : 1;
}

/** +7 부터의 덤 — 무기는 치명타 확률, 방어구는 받는 피해 감소. 그 밖은 null. */
export function upKind(def) {
  const grp = slotGroup(def && def.slot);
  if (grp === 'weapon') return { prop: 'crit', range: GEAR.W_CRIT, label: '치명타' };
  if (grp === 'armor') return { prop: 'dmgReduction', range: GEAR.A_DR, label: '받는 피해' };
  return null;
}

/** 이 강화에서 ups 가 몇 개여야 하는가. */
export function upsWanted(level) {
  return Math.max(0, Math.min(GEAR.ENH_MAX, level) - (GEAR.ROLL_FROM - 1));
}

/** 강화가 실패하면 어디로 가는가(C 규칙). 지금 단계 → 실패 뒤 단계. */
export function enhanceFailTo(level) {
  return level + 1 >= GEAR.FALL_FROM ? Math.max(0, level - 1) : level;
}
