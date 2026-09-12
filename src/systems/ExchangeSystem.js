// 책임: 재료 교환 레시피의 가능 여부 판정(순수 함수).
// 규칙: 실제 인벤토리 변경은 하지 않는다. 오케스트레이터가 결과를 받아 적용한다.
// 금지: DOM 접근, 다른 system import.

/** 레시피 목록을 화면용 데이터로 만든다. */
export function buildRecipes(state, recipes) {
  return (recipes || [])
    .map((recipe, index) => {
      const give = recipe.give
        .map((g) => ({ ...g, def: state.db.items[g.id], have: countOf(state, g.id) }))
        .filter((g) => g.def);
      const getDef = state.db.items[recipe.get.id];
      if (!getDef || give.length !== recipe.give.length) return null;
      return {
        index,
        give,
        get: { ...recipe.get, def: getDef },
        ok: give.every((g) => g.have >= g.count),
        // 지금 가진 재료로 이 교환을 몇 번이나 할 수 있나('전부' 버튼이 쓴다)
        times: maxTimes(state, recipe),
      };
    })
    .filter(Boolean);
}

/**
 * 지금 가진 재료로 이 교환을 몇 번 할 수 있는가.
 *
 * 재료가 여럿이면 **가장 모자란 재료**가 횟수를 정한다 —
 * 젤리 20개와 송곳니 3개를 갖고 "젤리5 + 송곳니3" 를 하면 한 번뿐이다.
 */
export function maxTimes(state, recipe) {
  if (!recipe || !recipe.give || !recipe.give.length) return 0;
  let n = Infinity;
  for (const g of recipe.give) {
    if (!g.count) continue;
    n = Math.min(n, Math.floor(countOf(state, g.id) / g.count));
  }
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function canExchange(state, recipe) {
  if (!recipe) return { ok: false, reason: '없는 교환입니다.' };
  for (const g of recipe.give) {
    if (countOf(state, g.id) < g.count) {
      const name = state.db.items[g.id]?.name || g.id;
      return { ok: false, reason: `${name}이(가) 부족합니다.` };
    }
  }
  return { ok: true };
}

function countOf(state, itemId) {
  return state.inventory
    .filter((i) => i.id === itemId)
    .reduce((sum, i) => sum + i.count, 0);
}
