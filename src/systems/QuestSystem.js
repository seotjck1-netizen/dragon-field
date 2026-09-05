// 책임: 퀘스트 표(quests.json)를 읽어 진행 상황을 판단한다.
// 규칙: 보상 지급/재료 회수는 하지 않는다 — 무엇을 해야 하는지 계획만 돌려주고
//       실제 적용은 오케스트레이터(main.js)가 Inventory/Progression 을 통해 한다.
// 금지: DOM 접근, 다른 system import.

const COL = {
  id: 0, title: 1, type: 2, target: 3, count: 4,
  exp: 5, gold: 6, rewardItem: 7, rewardCount: 8, desc: 9,
  // 아래 둘은 없어도 되는 칸이다(예전 줄은 그대로 동작한다).
  reqLevel: 10, // 이 레벨이 되어야 받을 수 있다. 0/빈칸이면 제한 없음
  choices: 11,  // ["아이템id", ...] — 있으면 완료할 때 하나를 골라 받는다(직업 퀘스트)
  unlock: 12,   // "met:great_dragon" — 있으면 **특별 의뢰**다(아래)
};

// ── 특별 의뢰 (0.37) ────────────────────────────────────────
//
// 게시판의 의뢰는 위에서 아래로 한 줄씩 이어진다. 그런데 "고룡을 본 사람에게만"
// 처럼 순서와 상관없이 열려야 하는 것이 있다. 그런 줄은 **차례에서 빼고**
// 조건이 채워졌을 때 따로 연다.
//
// 지금 있는 조건은 하나뿐이다.
//   met:<몬스터id>   그 상대와 한 번이라도 붙어 본 적이 있으면
//
// 새 조건을 늘리려면 여기 unlockMet 옆에 한 줄 더하면 된다.

/** "met:great_dragon" → { kind:'met', target:'great_dragon' } */
function parseUnlock(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const at = raw.indexOf(':');
  if (at < 0) return { kind: raw, target: '' };
  return { kind: raw.slice(0, at).trim(), target: raw.slice(at + 1).trim() };
}

/** 그 조건이 지금 채워졌는가. */
export function isUnlocked(state, quest) {
  if (!quest || !quest.unlock) return true;
  const qs = state.quests || emptyQuestState();
  if (quest.unlock.kind === 'met') return !!(qs.met || {})[quest.unlock.target];
  return false; // 모르는 조건은 안 열린 것으로 본다 — 조용히 열리는 쪽이 더 나쁘다
}

/** 지금 받을 수 있는 특별 의뢰들(아직 안 끝낸 것만). */
export function specialQuests(state) {
  const qs = state.quests || emptyQuestState();
  return parseQuests(state.db)
    .filter((q) => q.unlock && !qs.done.includes(q.id) && isUnlocked(state, q));
}

/** id 로 퀘스트 하나 찾기. 특별 의뢰를 완료할 때 쓴다. */
export function questById(state, id) {
  return parseQuests(state.db).find((q) => q.id === id) || null;
}

/** 상대를 한 번이라도 만났다고 적어 둔다(전투가 시작될 때 부른다). */
export function recordMet(state, monsterDefId) {
  const qs = state.quests || (state.quests = emptyQuestState());
  if (!qs.met) qs.met = {};
  if (qs.met[monsterDefId]) return false;
  qs.met[monsterDefId] = true;
  return true; // 처음 만났다 — 부르는 쪽이 알림을 띄울 수 있게
}

/** 표의 한 줄 → 다루기 쉬운 객체. */
export function parseQuests(db) {
  return (db.quests['표'] || []).map((row, index) => ({
    index,
    id: row[COL.id],
    title: row[COL.title],
    type: row[COL.type], // collect | hunt | reach
    target: row[COL.target],
    count: Number(row[COL.count]) || 1,
    exp: Number(row[COL.exp]) || 0,
    gold: Number(row[COL.gold]) || 0,
    rewardItem: row[COL.rewardItem] || null,
    rewardCount: Number(row[COL.rewardCount]) || 0,
    desc: row[COL.desc] || '',
    reqLevel: Number(row[COL.reqLevel]) || 0,
    choices: Array.isArray(row[COL.choices]) ? row[COL.choices].filter(Boolean) : [],
    unlock: parseUnlock(row[COL.unlock]),
  }));
}

/** 게시판에 차례대로 걸리는 의뢰들 — 특별 의뢰는 빠진다. */
function chainQuests(db) {
  return parseQuests(db).filter((q) => !q.unlock);
}

/** 레벨 제한에 걸려 있는가. */
export function isLocked(state, quest) {
  return !!quest && quest.reqLevel > 0 && state.player.level < quest.reqLevel;
}

export function emptyQuestState() {
  return { index: 0, kills: {}, reached: {}, done: [], met: {} };
}

/** 지금 진행 중인 퀘스트. 전부 끝났으면 null. */
export function currentQuest(state) {
  const list = chainQuests(state.db);
  const q = state.quests || emptyQuestState();
  return list[q.index] || null;
}

/** 게시판 목록 — 차례대로 이어지는 의뢰들. */
export function allQuests(state) {
  return chainQuests(state.db);
}

/** @returns {{have:number, need:number, done:boolean, label:string}} */
export function progressOf(state, quest) {
  if (!quest) return { have: 0, need: 0, done: false, label: '' };
  const qs = state.quests || emptyQuestState();
  let have = 0;
  let label = '';

  if (quest.type === 'collect') {
    have = countOf(state, quest.target);
    label = state.db.items[quest.target]?.name || quest.target;
  } else if (quest.type === 'hunt') {
    have = qs.kills[quest.target] || 0;
    label = state.db.monsters[quest.target]?.name || quest.target;
  } else if (quest.type === 'reach') {
    have = qs.reached[quest.target] ? 1 : 0;
    label = state.db.maps.maps[quest.target]?.name || quest.target;
  }

  return { have: Math.min(have, quest.count), need: quest.count, done: have >= quest.count, label };
}

/**
 * 완료 계획. 오케스트레이터가 이대로 적용하면 된다.
 * 선택 보상이 있는 퀘스트(직업 퀘스트)는 choice 인자로 고른 아이템 id 를 받는다.
 * @param {string|null} choice 고른 보상 아이템 id
 * @returns {{ok:boolean, reason?:string, needChoice?:boolean, choices?:string[],
 *            consume?:Array, exp?:number, gold?:number, item?:object}}
 */
export function completionPlan(state, quest, choice = null) {
  if (!quest) return { ok: false, reason: '진행 중인 퀘스트가 없습니다.' };
  if (quest.unlock && !isUnlocked(state, quest)) {
    return { ok: false, reason: '아직 열리지 않은 의뢰다.' };
  }
  if (isLocked(state, quest)) {
    return { ok: false, reason: `레벨 ${quest.reqLevel}이 되어야 받을 수 있는 의뢰다.` };
  }
  const p = progressOf(state, quest);
  if (!p.done) return { ok: false, reason: `${p.label} ${p.have}/${p.need}` };

  // 직업 퀘스트: 무기냐 방어구냐를 먼저 고르게 한다.
  if (quest.choices.length && !choice) {
    return { ok: false, needChoice: true, choices: quest.choices, reason: '보상을 선택하세요.' };
  }
  if (quest.choices.length && !quest.choices.includes(choice)) {
    return { ok: false, reason: '고를 수 없는 보상입니다.' };
  }

  const rewardId = choice || quest.rewardItem;
  return {
    ok: true,
    consume: quest.type === 'collect' ? [{ id: quest.target, count: quest.count }] : [],
    exp: quest.exp,
    gold: quest.gold,
    item: rewardId ? { id: rewardId, count: choice ? 1 : quest.rewardCount } : null,
  };
}

/** 완료 처리(진행도만). 보상 지급은 오케스트레이터가 한다. */
export function advance(state, quest) {
  const qs = state.quests || (state.quests = emptyQuestState());
  if (!qs.done.includes(quest.id)) qs.done.push(quest.id);
  // 특별 의뢰는 차례에 끼어 있지 않으므로 **줄 번호를 밀지 않는다.**
  // 밀면 게시판의 다음 의뢰 하나가 통째로 건너뛰어진다.
  if (!quest.unlock) {
    qs.index = chainQuests(state.db).findIndex((q) => q.id === quest.id) + 1;
  }
  return currentQuest(state);
}

/** 몬스터를 잡을 때마다 호출한다(hunt 조건용). */
export function recordKill(state, monsterDefId) {
  const qs = state.quests || (state.quests = emptyQuestState());
  qs.kills[monsterDefId] = (qs.kills[monsterDefId] || 0) + 1;
}

/** 맵에 들어설 때마다 호출한다(reach 조건용). */
export function recordVisit(state, mapId) {
  const qs = state.quests || (state.quests = emptyQuestState());
  qs.reached[mapId] = true;
}

function countOf(state, itemId) {
  return state.inventory.filter((i) => i.id === itemId).reduce((s, i) => s + i.count, 0);
}
