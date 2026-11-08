// 책임: 보석 노인의 규칙 — "셋을 주고 하나를 고른다" 와 "돈으로 한 알 뽑는다".
// 금지: DOM 접근, 화면 문구 조립. 여기는 규칙과 판정만 한다.
// 금지: Math.random() 직접 호출 — 무작위는 호출부가 넘긴 rng 로만 굴린다.
//
// ── 왜 이 규칙인가 ─────────────────────────────────────────
// 보석은 지하감옥에서 아주 드물게 나온다. 그래서 "쓸 데 없는 보석만 쌓이고
// 정작 필요한 한 알이 없는" 자리가 오래 이어졌다 — 다이아몬드가 필요한 사람에게
// 자수정 다섯 알은 아무것도 아니다.
//
// 노인은 그 사이를 이어 준다.
//   · 아무 보석이든 **세 알**을 내놓으면 **원하는 한 알**을 준다 (3 → 1)
//   · 돈만 있으면 **한 알을 무작위로** 뽑아 준다 (BALANCE.GEM_GAMBLE_PRICE)
// 셋을 하나로 줄이는 값이라, 보석의 총량은 늘지 않는다. 늘어나는 것은
// **고를 수 있다**는 것 하나뿐이다.

import { BALANCE } from '../data/formulas.js';
import { gemDefs } from './AffixSystem.js';

/** 한 번 바꾸는 데 내놓아야 하는 보석 알 수. */
export const TRADE_COST = 3;

/** 가진 보석 목록. [{ id, name, effect, count }] — 개수가 0 인 것은 빼고 준다. */
export function ownedGems(state) {
  const bag = state.inventory || [];
  return gemDefs(state.db)
    .map((g) => {
      const rows = bag.filter((i) => i.id === g.id);
      const count = rows.reduce((a, i) => a + (i.count || 1), 0);
      return { ...g, count };
    })
    .filter((g) => g.count > 0);
}

/** 이 사람이 가진 보석을 다 합치면 몇 알인가. */
export function gemTotal(state) {
  return ownedGems(state).reduce((a, g) => a + g.count, 0);
}

/**
 * 내놓을 보석을 고른 것이 규칙에 맞는가.
 *
 * @param {Record<string, number>} picks 보석 id → 내놓을 개수
 * @returns {{ok:boolean, reason?:string, total?:number}}
 */
export function canTrade(state, picks, wantId) {
  const want = (gemDefs(state.db) || []).find((g) => g.id === wantId);
  if (!want) return { ok: false, reason: '받을 보석을 고르세요.' };

  const owned = Object.fromEntries(ownedGems(state).map((g) => [g.id, g.count]));
  let total = 0;
  for (const [id, n] of Object.entries(picks || {})) {
    const k = Math.max(0, Math.floor(Number(n) || 0));
    if (!k) continue;
    if (!owned[id]) return { ok: false, reason: '가지고 있지 않은 보석입니다.' };
    if (k > owned[id]) return { ok: false, reason: '가진 것보다 많이 내놓을 수 없습니다.' };
    total += k;
  }
  if (total !== TRADE_COST) {
    return { ok: false, reason: `보석을 정확히 ${TRADE_COST}알 골라야 합니다. (지금 ${total}알)`, total };
  }
  return { ok: true, total, want };
}

/**
 * 보석 셋을 내놓고 원하는 하나를 받는다.
 *
 * ⚠ 소지품에서 덜어 내고 넣는 일은 **호출부**가 한다(InventorySystem 을 여기서
 *   부르지 않는다 — systems 끼리 서로를 부르지 않는 것이 이 저장소의 규칙이다).
 *   여기서는 "무엇을 몇 개 빼고 무엇을 하나 넣어야 하는가" 만 돌려준다.
 *
 * @returns {{ok:boolean, reason?:string, take?:Array<[string,number]>, give?:string}}
 */
export function planTrade(state, picks, wantId) {
  const check = canTrade(state, picks, wantId);
  if (!check.ok) return check;
  const take = Object.entries(picks || {})
    .map(([id, n]) => [id, Math.max(0, Math.floor(Number(n) || 0))])
    .filter(([, n]) => n > 0);
  return { ok: true, take, give: wantId, want: check.want };
}

/** 무작위 한 알을 살 수 있는가. */
export function canBuy(state) {
  const price = BALANCE.GEM_GAMBLE_PRICE;
  const gold = (state.player && state.player.gold) || 0;
  if (gold < price) {
    return { ok: false, reason: `골드가 부족합니다. (${price.toLocaleString('ko-KR')} 필요)`, price };
  }
  if (!gemDefs(state.db).length) return { ok: false, reason: '팔 보석이 없습니다.', price };
  return { ok: true, price };
}

/**
 * 무작위 한 알을 뽑는다. **어느 보석이든 똑같은 확률**이다.
 *
 * 값을 매기지 않는 이유: 보석마다 값어치가 다르지만(다이아몬드는 귀하고
 * 자수정은 흔하다), 확률까지 기울이면 "무엇이 나올지 모른다" 가 사실은
 * "싼 것만 나온다" 가 된다. 그러면 100만 골드를 낼 이유가 사라진다.
 * 고를 수 없다는 것 하나로 이미 충분한 값이다.
 *
 * @param {() => number} rng 0~1 난수
 */
export function rollGem(state, rng) {
  const all = gemDefs(state.db);
  if (!all.length) return null;
  return all[Math.min(all.length - 1, Math.floor(rng() * all.length))];
}
