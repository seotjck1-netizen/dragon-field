// 책임: 장비 장착/해제 + 강화 판정.
// 규칙: 강화 "비용 소모"는 여기서 하지 않는다. canEnhance()로 비용을 알려주고,
//       실제 골드/재료 차감은 오케스트레이터(main.js)가 InventorySystem을 통해 한다.
//       (system끼리 서로 import 하지 않기 위한 설계)
// 금지: DOM 접근.

import {
  enhanceChance, enhanceCost, enhanceMaterial, transcendChance, transcendMaterial, BALANCE,
} from '../data/formulas.js';
import { onEnhanced } from './AffixSystem.js';

// ─────────────────────────────────────────────────────────────
// 장비 슬롯 정의. 새 부위를 늘리고 싶으면 여기 세 곳만 고치면 된다.
//   SLOT_GROUPS : 분류(캐릭터창 왼쪽/오른쪽 배치와 상점 필터에 쓰인다)
//   SLOT_LABEL  : 화면에 보일 이름
//   RING_SLOTS  : items.json 의 slot:"ring" 이 실제로 들어갈 자리들
// items.json 의 slot 값은 여기 이름과 같아야 한다(반지만 예외).
// ─────────────────────────────────────────────────────────────
export const SLOT_GROUPS = {
  무기: ['weapon'],
  // 투구는 0.35 에서 새로 생겼다(용린 세트).
  // 옛 세이브에는 이 칸이 없지만 emptyEquipment 가 null 로 채워 주므로 그냥 빈 칸이 된다.
  방어구: ['helmet', 'shoulder', 'armor', 'gloves', 'boots'],
  장신구: ['belt', 'necklace', 'ring1', 'ring2'],
};

export const SLOTS = Object.values(SLOT_GROUPS).flat();

export const SLOT_LABEL = {
  weapon: '무기',
  helmet: '투구',
  shoulder: '어깨',
  armor: '갑옷',
  gloves: '장갑',
  boots: '신발',
  belt: '벨트',
  necklace: '목걸이',
  ring1: '반지 1',
  ring2: '반지 2',
};

/** 반지는 두 칸. 빈 칸 우선, 둘 다 차 있으면 첫 칸을 교체한다. */
export const RING_SLOTS = ['ring1', 'ring2'];

/** 전부 비어 있는 장비 객체. 새 캐릭터/불러오기의 기준값. */
export function emptyEquipment() {
  const eq = {};
  for (const s of SLOTS) eq[s] = null;
  return eq;
}

/**
 * 예전 저장(무기/갑옷/장신구 3칸)을 9칸으로 옮긴다. 모르는 키는 버린다.
 * 예전 accessory 는 반지 1번 칸으로 간다.
 */
export function migrateEquipment(saved) {
  const eq = emptyEquipment();
  if (!saved) return eq;
  for (const [key, uid] of Object.entries(saved)) {
    if (!uid) continue;
    if (SLOTS.includes(key)) eq[key] = uid;
    else if (key === 'accessory' || key === 'ring') eq[eq.ring1 ? 'ring2' : 'ring1'] = uid;
  }
  return eq;
}

/**
 * 장착 칸이 "지금 가방에 있는, 그 칸에 맞는 물건"을 가리키는지 확인하고 아니면 비운다.
 *
 * 세이브를 되살린 뒤에 부른다. 어긋날 수 있는 경우가 둘 있다.
 *   · 가방에 없는 uid 를 가리킨다 (아이템 표에서 사라졌거나 세이브가 상했을 때)
 *   · 목걸이 칸이 갑옷을 가리킨다 (예전 아이템 번호 겹침 버그의 흔적)
 * 어느 쪽이든 그대로 두면 "장착 표시가 엉뚱한 물건에 붙는" 증상이 이어진다.
 *
 * @returns {{cleared:string[]}} 비운 칸 이름들
 */
export function pruneEquipment(state) {
  const eq = state.player.equipment || {};
  const cleared = [];
  for (const slot of SLOTS) {
    const uid = eq[slot];
    if (!uid) continue;
    const inst = state.inventory.find((i) => i.uid === uid);
    const def = inst && state.db.items[inst.id];
    if (!def || !slotsForItem(def).includes(slot)) {
      eq[slot] = null;
      cleared.push(slot);
    }
  }
  return { cleared };
}

/** 슬롯이 속한 분류(무기/방어구/장신구)를 돌려준다. */
export function groupOf(slot) {
  for (const [group, slots] of Object.entries(SLOT_GROUPS)) {
    if (slots.includes(slot)) return group;
  }
  return null;
}

/** 아이템 정의가 들어갈 수 있는 슬롯 후보. 장착 불가면 빈 배열. */
export function slotsForItem(def) {
  if (!def || !def.slot) return [];
  if (def.slot === 'ring') return [...RING_SLOTS];
  return SLOTS.includes(def.slot) ? [def.slot] : [];
}

export function isEquipped(state, uid) {
  return SLOTS.some((s) => state.player.equipment[s] === uid);
}

export function equippedSlotOf(state, uid) {
  return SLOTS.find((s) => state.player.equipment[s] === uid) || null;
}

/**
 * @param {string} [prefer] 이 슬롯에 넣고 싶다고 지정(반지 칸 고르기용)
 * @returns {{ok:boolean, reason?:string, slot?:string, replacedUid?:string|null}}
 */
export function equip(state, uid, prefer = null) {
  const inst = state.inventory.find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const def = state.db.items[inst.id];
  const candidates = slotsForItem(def);
  if (!candidates.length) return { ok: false, reason: '장착할 수 없는 아이템입니다.' };

  // 이미 다른 칸에 끼고 있던 것이면 그 칸을 먼저 비운다(반지 옮겨 끼기).
  const already = equippedSlotOf(state, uid);
  if (already) state.player.equipment[already] = null;

  let slot = prefer && candidates.includes(prefer) ? prefer : null;
  if (!slot) slot = candidates.find((s) => !state.player.equipment[s]) || candidates[0];

  const replacedUid = state.player.equipment[slot] || null;
  state.player.equipment[slot] = uid;
  return { ok: true, slot, replacedUid };
}

export function unequip(state, slot) {
  if (!SLOTS.includes(slot)) return { ok: false, reason: '알 수 없는 슬롯입니다.' };
  const uid = state.player.equipment[slot];
  if (!uid) return { ok: false, reason: '비어 있는 슬롯입니다.' };
  state.player.equipment[slot] = null;
  return { ok: true, uid };
}

/**
 * 강화 가능 여부와 비용을 알려준다(상태를 바꾸지 않는다).
 * @returns {{ok:boolean, reason?:string, level?:number, chance?:number,
 *            gold?:number, material?:{id:string,count:number}}}
 */
export function canEnhance(state, uid) {
  const inst = state.inventory.find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const def = state.db.items[inst.id];
  if (!def || !def.enhanceable) return { ok: false, reason: '강화할 수 없는 아이템입니다.' };

  const level = inst.enhance || 0;
  if (level >= BALANCE.ENHANCE_MAX) {
    return { ok: false, reason: `최대 강화 단계(+${BALANCE.ENHANCE_MAX})입니다.` };
  }

  const gold = enhanceCost(level);
  // 재료는 장비 등급이 정한다 — 일반=약초, 희귀=마력석, 영웅=악마의 핵.
  const material = enhanceMaterial(level, def.rarity || 'common');
  return { ok: true, level, chance: enhanceChance(level), gold, material };
}

/**
 * 초월 강화를 걸 수 있는가. (+10 부터 +15 까지, **성 안 왕실 대장간**)
 *
 * 0.40 — 값은 보석 한 개다. 부위마다 다른 보석을 쓴다(무기 루비 · 방어구 에메랄드 ·
 * 장신구 오닉스). 예전의 용의 징표는 쓰지 않는다 — 고룡을 먼저 잡아야 +11 을 볼 수
 * 있었고, 그 벽 때문에 +10 에서 그만두는 사람이 많았다.
 *
 * @returns {{ok:boolean, reason?:string, level?:number, chance?:number, material?:{id,count,group}}}
 */
export function canTranscend(state, uid) {
  const inst = state.inventory.find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  const def = state.db.items[inst.id];
  if (!def || !def.enhanceable) return { ok: false, reason: '강화할 수 없는 아이템입니다.' };

  const level = inst.enhance || 0;
  if (level < BALANCE.ENHANCE_MAX) {
    return { ok: false, reason: `초월 강화는 +${BALANCE.ENHANCE_MAX} 부터 걸 수 있습니다. (지금 +${level})` };
  }
  if (level >= BALANCE.TRANSCEND_MAX) {
    return { ok: false, reason: `더 오를 곳이 없습니다. (+${BALANCE.TRANSCEND_MAX})` };
  }
  return {
    ok: true,
    level,
    chance: transcendChance(level),
    material: transcendMaterial(def.slot),
  };
}

/**
 * 초월 강화 판정. 값은 이미 치렀다고 본다.
 *
 * 대장간의 +1~+10 과 달리 **실패해도 부서지지 않고, 내려가지도 않는다.**
 * 보석만 사라지고 그 자리에 그대로 있는다.
 *
 * 왜 안 내려가나: +10 밑으로 떨어지면 보석 홈이 사라지고, 홈에 박아 둔 보석은
 * 다음 접속 때 조용히 없어진다 — 사람 눈에는 "초월을 걸었더니 보석이 증발했다"로
 * 보인다. 한 단계 잃는 벌보다 그 사고가 훨씬 나쁘다.
 *
 * @returns {{ok:boolean, success:boolean, from:number, level:number, chance:number}}
 */
export function applyTranscend(state, uid, rng) {
  const check = canTranscend(state, uid);
  if (!check.ok) return { ok: false, reason: check.reason };

  const inst = state.inventory.find((i) => i.uid === uid);
  const from = inst.enhance || 0;
  const chance = check.chance;
  const success = rng.chance ? rng.chance(chance) : rng() < chance;
  if (success) inst.enhance = Math.min(BALANCE.TRANSCEND_MAX, from + 1);

  return { ok: true, success, from, level: inst.enhance, chance };
}

/**
 * 강화 판정을 실행한다. 비용은 이미 차감되었다고 가정한다.
 *
 * +7·+8·+9 에 올라서면 그 자리에서 무작위 옵션을 하나 굴린다(AffixSystem).
 * +10 이면 보석 홈이 생긴다.
 *
 * @returns {{ok:boolean, success:boolean, level:number, chance:number,
 *            affix?:object|null, sockets?:number}}
 */
export function applyEnhance(state, uid, rng) {
  const check = canEnhance(state, uid);
  if (!check.ok) return { ok: false, success: false, level: 0, chance: 0, reason: check.reason };

  const inst = state.inventory.find((i) => i.uid === uid);
  const success = rng.chance(check.chance);
  let affix = null;
  let sockets = 0;
  if (success) {
    inst.enhance = (inst.enhance || 0) + 1;
    const def = state.db.items[inst.id];
    const res = onEnhanced(state.db, inst, def, rng);
    affix = res.affix;
    sockets = res.sockets;
  }

  // TODO(확장): 실패 시 강화 단계 하락 / 파괴 규칙을 넣고 싶으면 여기서 처리한다.
  return { ok: true, success, level: inst.enhance || 0, chance: check.chance, affix, sockets };
}
