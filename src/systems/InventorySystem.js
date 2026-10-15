// 책임: 소지품 배열(state.inventory)의 추가/제거/조회.
// 규칙: 스택 가능 아이템은 {id, count} 한 줄로 합치고,
//       장비처럼 개별 강화 수치를 갖는 아이템은 인스턴스마다 uid를 부여해 따로 보관한다.
// 금지: DOM 접근, 다른 system import.

// uid 는 "이 가방 안에서만" 유일하면 된다. 그런데 이 카운터는 모듈 전역이라
// 페이지를 새로 열면 1 로 돌아간다. 세이브는 예전 uid(it_1…)를 그대로 되살리므로,
// 그 뒤에 주운 물건이 이미 있는 uid 를 다시 받아 버렸다.
//
// 그러면 uid 로 찾는 모든 곳이 엉뚱한 물건을 집는다:
//   · isEquipped(목걸이) 가 갑옷의 장착 정보를 보고 true 를 돌려준다
//   · 상세창의 find(uid) 가 먼저 있는 갑옷을 집어 온다
// 실제로 "장착도 안 한 목걸이가 갑옷으로 보이는" 증상이 여기서 나왔다.
//
// 그래서 두 겹으로 막는다.
//   ① 세이브를 되살릴 때 카운터를 가장 큰 번호 뒤로 밀어 둔다 (seedUids)
//   ② 그래도 겹치면 addItem 이 빈 번호를 찾을 때까지 넘긴다 (newUid 가 state 를 본다)
// ② 만 있어도 충분하지만, ① 이 있어야 번호가 쓸데없이 뒤엉키지 않는다.
let _seq = 1;

/** 이 가방에 없는 새 uid. state 를 보고 겹치지 않을 때까지 번호를 넘긴다. */
function newUid(state) {
  const taken = state && state.inventory;
  for (;;) {
    const uid = `it_${_seq++}`;
    if (!taken || !taken.some((i) => i.uid === uid)) return uid;
  }
}

/**
 * 세이브를 되살린 직후에 부른다 — 카운터를 이미 쓰인 번호 뒤로 민다.
 * @param {Array<{uid:string}>} inventory
 */
export function seedUids(inventory) {
  for (const inst of inventory || []) {
    const m = /^it_(\d+)$/.exec(inst.uid || '');
    if (m) _seq = Math.max(_seq, Number(m[1]) + 1);
  }
  return _seq;
}

/**
 * 이미 겹쳐 버린 세이브를 고친다.
 *
 * 먼저 있는 쪽의 uid 를 그대로 두고, 뒤에 온 것에만 새 번호를 준다.
 * 앞쪽이 세이브에서 되살아난 물건이므로 장착 정보(equipment)가 가리키는 것도 그쪽이다.
 * 그래서 장착 칸은 손대지 않아도 맞는 물건을 계속 가리킨다.
 *
 * @returns {{fixed:number, changes:Array<{id:string, from:string, to:string}>}}
 */
export function repairUids(state) {
  const seen = new Set();
  const changes = [];
  for (const inst of state.inventory || []) {
    if (!inst.uid || seen.has(inst.uid)) {
      const from = inst.uid;
      inst.uid = newUid(state);
      changes.push({ id: inst.id, from, to: inst.uid });
    }
    seen.add(inst.uid);
  }
  return { fixed: changes.length, changes };
}

/** @returns {Array<{uid:string,id:string,count:number,enhance:number,new:boolean}>} 추가된 엔트리들 */
export function addItem(state, itemId, count = 1) {
  const def = state.db.items[itemId];
  if (!def) {
    console.warn(`[InventorySystem] 알 수 없는 아이템 id: ${itemId}`);
    return [];
  }

  if (def.stackable) {
    let entry = state.inventory.find((i) => i.id === itemId);
    if (entry) {
      entry.count += count;
      return [entry];
    }
    entry = { uid: newUid(state), id: itemId, count, enhance: 0 };
    state.inventory.push(entry);
    return [entry];
  }

  const added = [];
  for (let i = 0; i < count; i++) {
    const entry = { uid: newUid(state), id: itemId, count: 1, enhance: 0 };
    state.inventory.push(entry);
    added.push(entry);
  }
  return added;
}

export function addItems(state, list) {
  const out = [];
  for (const { id, count } of list || []) out.push(...addItem(state, id, count));
  return out;
}

/** 스택 아이템을 id 기준으로 소비한다. 수량이 모자라면 아무것도 하지 않고 false. */
export function removeItem(state, itemId, count = 1) {
  if (countOf(state, itemId) < count) return false;
  let left = count;
  for (let i = state.inventory.length - 1; i >= 0 && left > 0; i--) {
    const entry = state.inventory[i];
    if (entry.id !== itemId) continue;
    const take = Math.min(entry.count, left);
    entry.count -= take;
    left -= take;
    if (entry.count <= 0) state.inventory.splice(i, 1);
  }
  return true;
}

/** 개별 인스턴스를 통째로 제거한다. */
export function removeByUid(state, uid) {
  const idx = state.inventory.findIndex((i) => i.uid === uid);
  if (idx < 0) return false;
  state.inventory.splice(idx, 1);
  return true;
}

export function countOf(state, itemId) {
  return state.inventory
    .filter((i) => i.id === itemId)
    .reduce((sum, i) => sum + i.count, 0);
}

export function getInstance(state, uid) {
  return state.inventory.find((i) => i.uid === uid) || null;
}

/** UI 표시에 쓸 수 있게 정의(def)와 인스턴스를 합쳐서 돌려준다. */
export function listWithDefs(state) {
  return state.inventory
    .map((inst) => ({ inst, def: state.db.items[inst.id] }))
    .filter((x) => !!x.def);
}

// ── 분류 탭 ────────────────────────────────────────────────
// items.json 의 type 값을 사람이 읽는 묶음으로 정리한다.
// 새 분류를 넣고 싶으면 여기 한 줄만 추가하면 소지품 창 탭이 늘어난다.
export const CATEGORIES = [
  { id: 'all', label: '전체', types: null },
  { id: 'gear', label: '장비', types: ['weapon', 'armor', 'accessory'] },
  { id: 'consumable', label: '소모품', types: ['consumable'] },
  { id: 'material', label: '재료', types: ['material'] },
];

/**
 * 아이템 정의가 어느 분류에 속하는지.
 *
 * type 이 분류 이름이 아니면(예: 슬롯 이름을 잘못 적어 "shoulder" 라고 써 둔 경우)
 * slot 을 보고 장비로 잡아 준다. 이 안전망이 없으면 그런 아이템은 소지품의
 * 어느 탭에도 잡히지 않아 "가방에 있는데 고를 수가 없다"가 된다 — 실제로 겪은 일이다.
 * use 가 있으면 소모품으로 본다. 그래도 모르면 재료로 둔다(어디에도 안 뜨는 것보다 낫다).
 */
export function categoryOf(def) {
  if (!def) return 'material';
  const hit = CATEGORIES.find((c) => c.types && c.types.includes(def.type));
  if (hit) return hit.id;
  if (def.slot) return 'gear';
  if (def.use) return 'consumable';
  return 'material';
}

/** 분류로 거른 목록. categoryId 가 'all' 이거나 없으면 전부 돌려준다. */
export function filterByCategory(entries, categoryId) {
  if (!categoryId || categoryId === 'all') return entries;
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (!cat || !cat.types) return entries;
  return entries.filter((e) => categoryOf(e.def) === categoryId);
}

/** 분류별 개수(탭에 숫자를 붙이기 위함). 합계는 반드시 전체와 같아야 한다. */
export function countByCategory(entries) {
  const out = { all: entries.length };
  for (const c of CATEGORIES) {
    if (!c.types) continue;
    out[c.id] = entries.filter((e) => categoryOf(e.def) === c.id).length;
  }
  return out;
}

// TODO(확장): 소지 한도, 정렬 규칙, 아이템 판매·사용(소모품) 처리를 여기에 추가한다.
