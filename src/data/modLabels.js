// 책임: 보정(mods) 키를 사람이 읽는 이름으로 바꾸는 표 하나.
// 금지: 상태 접근, DOM, 계산.
//
// 왜 data/ 에 두는가: 이 표는 계산(systems/)과 화면(ui/) 양쪽이 다 본다.
//   - 보석 설명("루비 · 공격력 +8%")은 AffixSystem 이 만든다.
//   - 특성·스킬·세트 설명은 CharacterPanel 이 만든다.
// 표가 두 곳에 있으면 새 보정을 넣을 때 한쪽을 빠뜨려서 'atkPct' 같은
// 날글자가 그대로 화면에 나온다. 그래서 한 곳에만 둔다.

export const MOD_LABEL = {
  atkPct: '공격력',
  defPct: '방어력',
  hpPct: '최대 HP',
  crit: '치명타',
  critMult: '치명타 피해',
  doubleHit: '2회 공격',
  lifesteal: '흡혈',
  pierce: '관통',
  dmgReduction: '피해 감소',
  hpMult: '최대 HP',
  magicPower: '마법 피해',
  magicResist: '받는 마법 피해 감소',
  thorns: '가시 반사',
  defToAtk: '방어력 → 공격력',
  lowHpCritMult: '위기의 치명타 피해',
  shieldBonusTurns: '보호막 횟수',
  evadeBonus: '회피',
  openerBonus: '선제 사격',
  cleaveBonus: '광역 여파',
  chargeBonus: '충전 폭발',
  atkMult: '공격력(곱연산)',
  defMult: '방어력(곱연산)',
  potionMult: '회복약 효과',
  goldFind: '골드 획득',
  materialDouble: '재료 두 배 확률',
  engraveBonus: '각인 확률',
  absorbChance: '마력 흡수 확률',
  atk: '공격력',
  def: '방어력',
  spd: '속도',
  hp: 'HP',
  critDmg: '치명타 피해',
};

/** 모르는 키는 키 그대로 돌려준다(표를 늘리지 않아도 화면이 깨지지 않게). */
export function modLabel(key) {
  return MOD_LABEL[key] || key;
}
