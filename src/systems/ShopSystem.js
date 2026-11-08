// 책임: 상점 가격 계산과 거래 가능 여부 판단(순수 함수).
// 규칙: 실제 인벤토리/골드 변경은 하지 않는다. 오케스트레이터가 결과를 받아 적용한다.
//       (system끼리 서로 import 하지 않기 위한 설계)
// 금지: DOM 접근.

import { buyPrice, sellPrice } from '../data/formulas.js';

/** 상점 진열 목록. npcs.json 의 stock 배열을 화면용 데이터로 바꾼다. */
export function buildStock(state, ids) {
  return (ids || [])
    .map((id) => {
      const def = state.db.items[id];
      if (!def) return null;
      return { id, def, price: buyPrice(def) };
    })
    .filter(Boolean);
}

/**
 * 플레이어가 팔 수 있는 목록(장착 중인 것은 제외).
 * @param {number} [goldFind] 골드 획득 증가. 파는 값에도 그대로 붙는다.
 *   (system 끼리 import 하지 않기로 했으므로 호출부가 계산해서 넣어 준다)
 */
export function buildSellList(state, equippedUids, goldFind = 0) {
  return state.inventory
    .filter((inst) => !equippedUids.includes(inst.uid))
    .map((inst) => {
      const def = state.db.items[inst.id];
      if (!def) return null;
      return { inst, def, price: sellPrice(def, inst.enhance || 0, goldFind) };
    })
    .filter(Boolean);
}

/**
 * @param {number} [qty] 한 번에 살 개수(물약을 10개씩 사는 용도)
 * @returns {{ok:boolean, reason?:string, price?:number, qty?:number, unit?:number}}
 */
export function canBuy(state, itemId, qty = 1) {
  const def = state.db.items[itemId];
  if (!def) return { ok: false, reason: '취급하지 않는 물건입니다.' };
  const n = Math.max(1, Math.floor(qty));
  if (n > 1 && !def.stackable) {
    return { ok: false, reason: '이 물건은 한 번에 하나씩만 살 수 있습니다.' };
  }
  const unit = buyPrice(def);
  const price = unit * n;
  if (state.player.gold < price) {
    return { ok: false, reason: `골드가 부족합니다. (${n}개에 🪙 ${price})`, price, qty: n, unit };
  }
  return { ok: true, price, qty: n, unit };
}

/**
 * @param {number} [qty] 한 번에 팔 개수(뭉치 아이템만 2 이상 가능)
 * @returns {{ok:boolean, reason?:string, price?:number, qty?:number, unit?:number}}
 */
export function canSell(state, uid, equippedUids, qty = 1, goldFind = 0) {
  const inst = state.inventory.find((i) => i.uid === uid);
  if (!inst) return { ok: false, reason: '없는 아이템입니다.' };
  if (equippedUids.includes(uid)) return { ok: false, reason: '장착 중인 장비는 팔 수 없습니다.' };
  const def = state.db.items[inst.id];
  const n = Math.max(1, Math.min(Math.floor(qty), inst.count || 1));
  const unit = sellPrice(def, inst.enhance || 0, goldFind);
  return { ok: true, price: unit * n, qty: n, unit };
}

/**
 * 여러 개를 한 번에 팔 때의 합계. 실제로 팔지는 않는다(순수 계산).
 * @param {{uid:string, count:number}[]} picks
 * @returns {{lines:object[], total:number, count:number, blocked:object[]}}
 */
export function quoteSell(state, picks, equippedUids, goldFind = 0) {
  const lines = [];
  const blocked = [];
  let total = 0;
  let count = 0;
  for (const pick of picks || []) {
    const check = canSell(state, pick.uid, equippedUids, pick.count, goldFind);
    if (!check.ok) {
      blocked.push({ uid: pick.uid, reason: check.reason });
      continue;
    }
    const inst = state.inventory.find((i) => i.uid === pick.uid);
    const def = state.db.items[inst.id];
    lines.push({ uid: pick.uid, name: def.name, qty: check.qty, price: check.price });
    total += check.price;
    count += check.qty;
  }
  return { lines, total, count, blocked };
}
