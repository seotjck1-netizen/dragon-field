// 책임: 특성/스킬 포인트 사용 규칙과, 전투에 넘길 "수정자(modifier)" 합산.
//        수정자의 출처는 네 곳 — 스탯(힘·민첩·지능), 특성, 스킬 트리, 장비 옵션·버프.
//
// ── 스탯과 특성은 다른 것이다 ──────────────────────────────
//   스탯(stats.json)  힘·민첩·지능. 포인트로 찍지 않는다. 레벨이 오르면
//                     직업이 알아서 올려 준다(classes.json 의 statGrowth).
//   특성(traits.json) 여섯 갈래. 10레벨당 1점 + 보스 퀘스트마다 1점으로 찍는다.
// 예전에는 힘·민첩·지능을 사람이 포인트로 찍었는데, 자기 직업이 기대는 쪽에
// 몰아 주는 것 말고는 답이 없어 선택이 아니라 절차였다.
// 금지: DOM 접근, 다른 system import.
// 규칙: 어떤 스킬이 무슨 효과인지는 src/data/skills.json 에만 적는다.

import { resetCost } from '../data/formulas.js';
import { gearBonuses } from './AffixSystem.js';

/**
 * 전투/스탯에 얹히는 "비율·확률" 전부. 여기 없는 키는 조용히 버려진다.
 * 새 효과를 만들고 싶으면 여기에 0 으로 한 줄 추가하고, skills.json 에서 쓰면 된다.
 */
export const EMPTY_MODS = {
  // 기본 배율
  atkPct: 0,
  defPct: 0,

  // ── 마지막에 한 번 더 곱하는 배율 (특성 전용) ──
  //
  // atkPct 와 무엇이 다른가: atkPct 는 스킬·장비 옵션이 함께 쓰는 통이라 서로 더해진다.
  // 아래 셋은 그 합계와 **따로 곱해진다**. 그래서 이미 공격력이 오른 빌드일수록
  // 특성 한 점이 더 크게 돌아온다 — 특성이 "덤"이 아니라 "선택"이 되는 자리다.
  atkMult: 0, // 공격력 강화 특성
  defMult: 0, // 방어력 증가 특성
  potionMult: 0, // 물약 사용 능력 특성 — 회복량에 곱한다
  goldFind: 0, // 골드 획득 증가 — 몬스터 골드와 상점 판매가 양쪽에

  // ── 직업 패시브가 여는 확률 ──
  materialDouble: 0, // 사냥에서 나온 '재료'를 두 배로 챙길 확률 (용사)
  engraveBonus: 0, // 각인 장비가 나올 확률에 더해지는 몫 (마법사)

  // 전설 장비 — 찍어 둔 스킬의 효과를 이 비율만큼 더 준다(1 = 두 배).
  // 강화로는 늘지 않는다. AffixSystem 이 강화 배율을 태우지 않고 그대로 넘긴다.
  skillPower: 0,

  hpPct: 0,
  hpMult: 0, // 최대 HP 배율(1.0 = +100%). hpPct 와 따로 두어 "두 배" 를 또렷하게 만든다
  crit: 0,
  critMult: 0,
  doubleHit: 0,
  lifesteal: 0,
  pierce: 0,
  dmgReduction: 0,

  // 마법 — 지능 특성과 마법사 스킬이 쓴다
  magicPower: 0, // 내가 주는 마법 피해 증가
  magicResist: 0, // 내가 받는 마법 피해 감소

  // 내가 주는 피해 전체에 곱하는 배율(0 = 그대로, 1 = 두 배).
  // 물리·마법을 가리지 않고 마지막에 한 번 곱한다. 지금은 조건부 세트 효과만 쓴다
  // (용린 4세트 — 고룡과 싸울 때만). 상시로 주면 다른 모든 선택이 무의미해진다.
  damageMult: 0,

  // 직업 스킬이 여는 특수 규칙
  thorns: 0, // 맞을 때 방어력의 이 비율만큼 되돌려 준다 (용사)
  defToAtk: 0, // 방어력의 이 비율이 공격력에 더해진다 (용사)
  lowHpCritMult: 0, // HP 가 임계 아래일 때 **치명타 피해** 증가 (0.54 — 예전에는 주는 피해였다)
  lowHpThreshold: 0, // 그 임계(0 이면 기본값 0.5 를 쓴다)
  shieldBonusTurns: 0, // 마법사 보호막이 더 막아 내는 **횟수** (0.54 — 예전에는 시간이었다)
  evadeBonus: 0, // 회피 확률 추가 (사냥꾼)
  absorbChance: 0, // 맞은 만큼 되돌려 받을 확률 (마법사)
  openerBonus: 0, // 선제 사격 횟수 추가 (사냥꾼)
  openerPowerBonus: 0, // 선제 공격 위력 추가 (사냥꾼 — 예측공격)
  cleaveBonus: 0, // 광역 여파 비율 추가 (마법사)
  chargeBonus: 0, // 충전 폭발 위력 추가 (마법사)

  // ── 필드에서만 쓰는 것 (전투 계산에는 안 들어간다) ──
  sightBonus: 0, // 어두운 곳에서 보이는 거리(칸). 매직 투구가 준다.
  dungeonStealth: 0, // 1 이상이면 지하감옥 몬스터가 먼저 알아채지 못한다.
};

/**
 * "쌓이면 안 되는" 값들 — 여러 겹 붙어도 가장 큰 것 하나만 쓴다.
 *
 * lowHpThreshold 는 "HP 가 몇 % 아래로 떨어지면"이라는 선(線)이지 양이 아니다.
 * 이걸 그냥 더하면 최후의 불꽃 5랭크에서 0.3×5 = 1.5 가 되어
 * "HP 150% 아래"가 되고, 결국 전투 내내 켜져 있는 상시 피해 증가로 변한다.
 * (마법사가 유독 세 보였던 진짜 이유가 이것이었다.)
 */
const MAX_KEYS = new Set(['lowHpThreshold']);

function addEffects(target, effect, times = 1) {
  for (const [k, v] of Object.entries(effect || {})) {
    if (target[k] === undefined) continue;
    if (MAX_KEYS.has(k)) target[k] = Math.max(target[k], v);
    else target[k] += v * times;
  }
  return target;
}

/** 이 직업이 배울 수 있는 스킬 목록. (표의 "_설명" 같은 주석 줄은 걸러진다) */
export function classSkills(state) {
  const cls = classDef(state);
  const tree = state.db.skills.tree;
  const ids =
    cls.skills && cls.skills.length ? cls.skills : Object.keys(tree).filter((k) => !k.startsWith('_'));
  return ids.filter((id) => tree[id] && typeof tree[id] === 'object').map((id) => ({ id, def: tree[id] }));
}

export function classDef(state) {
  const list = state.db.classes.list;
  return list[state.player.classId] || list[state.db.classes.default];
}

/**
 * 이 스킬을 지금 한 단계 올릴 수 있는가.
 *
 * 단계(트리)도 선행 조건도 없다 — 포인트만 있으면 아무거나 아무 순서로나 찍는다.
 * 포인트가 넉넉하지 않으므로 "무엇을 포기할 것인가"가 곧 빌드가 된다.
 */
export function canLearn(state, skillId) {
  const def = state.db.skills.tree[skillId];
  if (!def) return { ok: false, reason: '없는 스킬입니다.' };
  if (!classSkills(state).some((s) => s.id === skillId)) {
    return { ok: false, reason: '이 직업이 배울 수 없는 스킬입니다.' };
  }

  const rank = state.player.skills[skillId] || 0;
  if (rank >= def.max) return { ok: false, reason: '이미 최대 단계입니다.' };
  if ((state.player.skillPoints || 0) <= 0) return { ok: false, reason: '스킬 포인트가 없습니다.' };
  return { ok: true, rank };
}

export function learnSkill(state, skillId) {
  const check = canLearn(state, skillId);
  if (!check.ok) return check;
  state.player.skills[skillId] = (state.player.skills[skillId] || 0) + 1;
  state.player.skillPoints -= 1;
  return { ok: true, rank: state.player.skills[skillId] };
}

export function canSpendTrait(state, traitId) {
  const def = state.db.traits.nodes[traitId];
  if (!def) return { ok: false, reason: '없는 특성입니다.' };
  const cur = state.player.traits[traitId] || 0;
  if (cur >= def.max) return { ok: false, reason: '이미 최대치입니다.' };
  if ((state.player.traitPoints || 0) <= 0) return { ok: false, reason: '특성 포인트가 없습니다.' };
  return { ok: true, rank: cur };
}

export function spendTrait(state, traitId) {
  const check = canSpendTrait(state, traitId);
  if (!check.ok) return check;
  state.player.traits[traitId] = (state.player.traits[traitId] || 0) + 1;
  state.player.traitPoints -= 1;
  return { ok: true, rank: state.player.traits[traitId] };
}

/**
 * 특성/스킬 초기화 계획을 알려 준다(상태를 바꾸지 않는다).
 * 골드 차감은 오케스트레이터(main.js)가 한다.
 * @param {'trait'|'skill'} kind
 * @returns {{ok:boolean, reason?:string, kind?:string, points?:number, gold?:number}}
 */
export function canReset(state, kind) {
  const p = state.player;
  const ranks = kind === 'trait' ? p.traits : kind === 'skill' ? p.skills : null;
  if (!ranks) return { ok: false, reason: '알 수 없는 초기화입니다.' };

  const points = Object.values(ranks).reduce((a, b) => a + (b || 0), 0);
  if (!points) return { ok: false, reason: '되돌릴 것이 없습니다.' };

  const gold = resetCost(points, p.level);
  if (p.gold < gold) return { ok: false, reason: `골드가 부족합니다. (${gold} 필요)` };
  return { ok: true, kind, points, gold };
}

/** 초기화를 실제로 적용한다. 비용은 이미 차감되었다고 가정한다. */
export function applyReset(state, kind) {
  const p = state.player;
  const key = kind === 'trait' ? 'traits' : 'skills';
  const pointKey = kind === 'trait' ? 'traitPoints' : 'skillPoints';

  let refunded = 0;
  for (const id of Object.keys(p[key] || {})) {
    refunded += p[key][id] || 0;
    p[key][id] = 0;
  }
  p[pointKey] = (p[pointKey] || 0) + refunded;
  return { ok: true, points: refunded };
}

/** 특성 포인트가 더해 주는 순수 스탯(hp/atk/def/spd/crit). */
/**
 * 실제로 적용되는 특성 점수 = 직접 찍은 것 + 장비 옵션·보석이 얹어 준 것.
 * 방어구의 "힘 +7" 은 힘을 7점 더 찍은 것과 똑같이 다룬다 —
 * 그래야 순수 스탯(공격력·방어력)과 비율(치명타 피해 등)이 한꺼번에 맞는다.
 */
export function effectiveTraits(state, foes = null) {
  const out = { ...(state.player.stats || {}) };
  const g = gearBonuses(state, foes);
  for (const [id, n] of Object.entries(g.traits)) out[id] = (out[id] || 0) + n;
  // 배율은 **다 더한 뒤에** 건다. 2 = +200% 이므로 세 배가 된다.
  // 더하기보다 뒤에 두는 이유는, 곱이 "지금 가진 값" 에 걸려야 하기 때문이다 —
  // 앞에 걸면 장비가 얹어 준 몫에는 안 걸려서 같은 표를 두고 값이 달라진다.
  for (const [id, m] of Object.entries(g.traitMult || {})) {
    if (!m) continue;
    out[id] = Math.round((out[id] || 0) * (1 + m));
  }
  return out;
}

/** stats.json 의 정의표. 옛 세이브(스탯 표가 없던 시절)도 조용히 견딘다. */
function statNodes(state) {
  return (state.db.stats && state.db.stats.nodes) || {};
}

/** 힘·민첩·지능이 더해 주는 순수 스탯(hp/atk/def/spd/crit). */
export function traitStats(state, foes = null) {
  const out = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };
  const nodes = statNodes(state);
  for (const [id, rank] of Object.entries(effectiveTraits(state, foes))) {
    const def = nodes[id];
    if (!def || !rank) continue;
    for (const [k, v] of Object.entries(def.per || {})) {
      if (out[k] !== undefined) out[k] += v * rank;
    }
  }
  out.spd = +out.spd.toFixed(2);
  out.crit = +out.crit.toFixed(4);
  return out;
}

/**
 * 힘·민첩·지능이 더해 주는 "비율·확률".
 * 민첩의 치명타 피해나 지능의 마법 피해처럼, 순수 스탯이 아닌 것들이 여기로 온다.
 */
export function traitMods(state, foes = null) {
  const out = { ...EMPTY_MODS };
  const nodes = statNodes(state);
  for (const [id, rank] of Object.entries(effectiveTraits(state, foes))) {
    const def = nodes[id];
    if (!def || !rank) continue;
    addEffects(out, def.mods, rank);
  }
  return out;
}

/** 찍어 둔 특성 여섯 갈래가 더해 주는 비율. */
export function chosenTraitMods(state) {
  const out = { ...EMPTY_MODS };
  const nodes = (state.db.traits && state.db.traits.nodes) || {};
  for (const [id, rank] of Object.entries(state.player.traits || {})) {
    const def = nodes[id];
    if (!def || !rank) continue;
    addEffects(out, def.mods, rank);
  }
  return out;
}

/**
 * 전투/스탯에 적용할 수정자 총합.
 * @returns {typeof EMPTY_MODS & {sources: Array<{label:string, from:string}>}}
 */
export function computeModifiers(state, foes = null) {
  const mods = { ...EMPTY_MODS };
  const sources = [];

  // 0) 스탯(힘/민첩/지능)이 주는 비율
  addEffects(mods, traitMods(state, foes), 1);

  // 0-1) 찍어 둔 특성 여섯 갈래
  {
    const nodes = (state.db.traits && state.db.traits.nodes) || {};
    for (const [id, rank] of Object.entries(state.player.traits || {})) {
      const def = nodes[id];
      if (!def || !rank) continue;
      addEffects(mods, def.mods, rank);
      sources.push({ label: `${def.name} ${rank}`, from: 'trait' });
    }
  }

  // 1) 장비에 붙은 것들을 먼저 센다.
  //    스킬보다 앞에 두는 이유: 전설 장비의 '스킬 효과 배가'(skillPower)를
  //    알아야 스킬을 몇 배로 얹을지 정할 수 있기 때문이다.
  //    (힘·민첩·지능으로 오는 것은 traitMods 가 이미 세었으므로 여기선 빼고 더한다)
  const gear = gearBonuses(state, foes);
  addEffects(mods, gear.mods, 1);
  for (const g of gear.sources) sources.push(g);

  // 2) 스킬. 전설 장비를 들었으면 찍어 둔 단계가 그만큼 더 크게 먹힌다.
  const skillPower = 1 + (gear.mods.skillPower || 0);
  for (const [id, rank] of Object.entries(state.player.skills || {})) {
    const def = state.db.skills.tree[id];
    if (!def || !rank) continue;
    addEffects(mods, def.effect, rank * skillPower);
    sources.push({
      label: `${def.name} ${rank}${skillPower > 1 ? ` ×${skillPower}` : ''}`,
      from: 'skill',
    });
  }

  // 3) 직업 패시브 중 '비율·확률'로 굴러가는 것들.
  //    스킬처럼 찍는 것이 아니라 그 직업이면 그냥 갖는 것이고,
  //    자기 직업이 기대는 스탯이 오를수록 함께 커진다.
  {
    const c = classDef(state).combat || {};
    const st = effectiveTraits(state);
    const add = (key, base, per, statId) => {
      if (!base && !per) return;
      const n = (base || 0) + (per || 0) * (st[statId] || 0);
      if (!n) return;
      mods[key] += n;
      sources.push({ label: `${classDef(state).name} 패시브`, from: 'passive' });
    };
    add('goldFind', c.goldFind, c.goldFindPerAgi, 'agility'); // 사냥꾼 — 골드
    add('materialDouble', c.materialDouble, c.materialDoublePerStr, 'strength'); // 용사 — 재료
    add('engraveBonus', c.engraveBonus, c.engravePerInt, 'intellect'); // 마법사 — 각인
    add('evadeBonus', c.evadePerAgiBase, c.evadePerAgi, 'agility'); // 사냥꾼 — 회피
    add('absorbChance', c.absorbBase, c.absorbPerInt, 'intellect'); // 마법사 — 마력 흡수
  }

  // 4) 버프
  for (const buff of state.buffs || []) {
    addEffects(mods, buff.effects, 1);
  }

  mods.sources = sources;
  return mods;
}

/** 어떤 장비에 무엇이 붙어 있는지(툴팁용) — systems/AffixSystem.js 로 옮겼다. */
export { itemExtras } from './AffixSystem.js';
