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
  // 0.63 — 참이면 **재료를 안 가져간다.** 보여 주기만 하고 돌려받는다.
  //   '쓸모를 잃은 무기' 가 그렇다 — 10만짜리 검을 가져가 버리면 다시 사야 한다.
  keep: 13,
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

/**
 * 대상 칸을 쪼갠다 — `a+b` 면 **둘 다** 잡아야 하는 사냥 의뢰다 (0.64).
 *
 * 왜 `+` 인가: 이 값은 CSV 한 칸에 들어간다. 쉼표를 쓰면 따옴표로 감싸이면서
 * 시트에서 눈으로 보기 어려워진다. `+` 는 감싸이지 않고, '와' 로 읽힌다.
 *
 * 개수는 **대상마다** 센다. `elite_demon_soldier+elite_skeleton` 에 20 이면
 * 20 마리씩 모두 40 이다 — 합쳐서 20 이 아니다.
 */
function splitTargets(raw) {
  return String(raw == null ? '' : raw)
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 표의 한 줄 → 다루기 쉬운 객체. */
export function parseQuests(db) {
  return (db.quests['표'] || []).map((row, index) => ({
    index,
    id: row[COL.id],
    title: row[COL.title],
    type: row[COL.type], // collect | hunt | reach
    target: row[COL.target],
    // 사냥 의뢰만 여럿일 수 있다. 나머지는 언제나 한 칸이라 [target] 과 같다.
    targets: splitTargets(row[COL.target]),
    count: Number(row[COL.count]) || 1,
    exp: Number(row[COL.exp]) || 0,
    gold: Number(row[COL.gold]) || 0,
    rewardItem: row[COL.rewardItem] || null,
    rewardCount: Number(row[COL.rewardCount]) || 0,
    desc: row[COL.desc] || '',
    reqLevel: Number(row[COL.reqLevel]) || 0,
    choices: Array.isArray(row[COL.choices]) ? row[COL.choices].filter(Boolean) : [],
    unlock: parseUnlock(row[COL.unlock]),
    keep: !!row[COL.keep],
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
  // starts — 사냥 의뢰를 **받은 순간의 눈금**. 아래 openQuest 참고.
  return { index: 0, kills: {}, reached: {}, done: [], met: {}, starts: {} };
}

// ── 사냥 의뢰는 받은 뒤에 잡은 것만 센다 (0.59) ──────────────
//
// 무엇이 잘못돼 있었나:
//   qs.kills 는 **평생 누적**이다. 한 번도 줄어들지 않는다. 그래서 8단계에서
//   해골을 40마리 잡아 둔 사람에게 나중에 '해골 15마리' 의뢰가 열리면 그 자리에서
//   이미 40/15 다 — 게시판에서 완료를 누르는 것만으로 보상이 나온다.
//   그리고 그 보상으로 다음 줄이 열리면 그것도 이미 채워져 있어서, 의뢰 서너 개가
//   **연달아 저절로 끝난다.** 사냥은 없고 단추만 누르는 구간이 생긴다.
//
// 어떻게 고쳤나:
//   kills 를 0 으로 되돌리지 않는다 — 그 값은 다른 의뢰도 같이 본다(같은 몬스터를
//   두 의뢰가 요구할 수 있다). 대신 의뢰가 **열리는 순간의 눈금**을 적어 두고,
//   진행도는 그 눈금부터 센다. 눈금은 저장본에 남으므로 접속을 다시 해도 그대로다.
//
// 재료 모으기(collect)는 그대로 둔다 — 창고에 있는 것을 내미는 일이라
// "미리 갖고 있었다" 가 곧 정상이다. 단계 도달(reach)도 그대로다.
//
// 옛 저장본: 눈금이 없으면 **불러오는 그 순간의 값**을 찍는다(syncOpenQuests).
// 그러면 예전에 쌓아 둔 사냥 수는 지금 열린 의뢰에 안 얹힌다.

/** 이 의뢰가 열렸다고 적어 둔다. 이미 적혀 있으면 그대로 둔다. */
export function openQuest(state, quest) {
  if (!quest || quest.type !== 'hunt') return false;
  const qs = state.quests || (state.quests = emptyQuestState());
  if (!qs.starts) qs.starts = {};
  if (qs.starts[quest.id] != null) return false;
  const targets = quest.targets && quest.targets.length ? quest.targets : [quest.target];
  // 대상이 하나면 예전처럼 **숫자 하나**로 적는다. 세이브 모양을 괜히 바꾸지 않는다 —
  // 옛 저장본과 새 저장본이 같은 자리에서 같은 모양이면 나중에 볼 때 헷갈릴 일이 없다.
  qs.starts[quest.id] = targets.length > 1
    ? Object.fromEntries(targets.map((t) => [t, qs.kills[t] || 0]))
    : (qs.kills[targets[0]] || 0);
  return true;
}

/**
 * 그 대상의 **눈금**(의뢰를 받은 순간 이미 잡아 둔 수).
 *
 * 옛 저장본은 숫자 하나만 들고 있다 — 그때는 대상도 하나였으므로
 * 첫 대상에만 얹고 나머지는 0 으로 본다.
 */
function startOf(qs, quest, target) {
  const v = (qs.starts || {})[quest.id];
  if (v == null) return 0;
  if (typeof v === 'number') return quest.targets[0] === target ? v : 0;
  return Number(v[target]) || 0;
}

/**
 * 지금 열려 있는 의뢰(차례의 것 + 특별 의뢰)에 눈금이 없으면 지금 값으로 찍는다.
 * 게임을 불러온 직후와, 특별 의뢰가 새로 열렸을 때 부른다.
 */
export function syncOpenQuests(state) {
  openQuest(state, currentQuest(state));
  for (const q of specialQuests(state)) openQuest(state, q);
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

/**
 * @returns {{have:number, need:number, done:boolean, label:string,
 *            parts?:Array<{target:string,label:string,have:number,need:number,done:boolean}>}}
 *
 * `parts` 는 **대상이 둘 이상인 사냥 의뢰에만** 붙는다. 화면은 그때 줄을 나눠 그린다 —
 * 합쳐서 '27/40' 만 보이면 어느 쪽이 모자란지 알 수가 없다.
 */
export function progressOf(state, quest) {
  if (!quest) return { have: 0, need: 0, done: false, label: '' };
  const qs = state.quests || emptyQuestState();
  let have = 0;
  let label = '';

  if (quest.type === 'hunt') {
    // 받은 뒤에 잡은 것만 센다(위 openQuest 참고).
    const parts = quest.targets.map((t) => {
      const raw = Math.max(0, (qs.kills[t] || 0) - startOf(qs, quest, t));
      return {
        target: t,
        label: state.db.monsters[t]?.name || t,
        // 대상마다 먼저 자른다. 자르지 않고 더하면 한쪽만 실컷 잡아도 막대가 꽉 차
        // '다 됐는데 왜 안 되지' 가 된다.
        have: Math.min(raw, quest.count),
        need: quest.count,
        done: raw >= quest.count,
      };
    });
    return {
      have: parts.reduce((s, x) => s + x.have, 0),
      need: quest.count * Math.max(1, parts.length),
      done: parts.length > 0 && parts.every((x) => x.done),
      label: parts.map((x) => x.label).join(' · '),
      parts: parts.length > 1 ? parts : undefined,
    };
  }

  if (quest.type === 'collect') {
    have = countOf(state, quest.target);
    label = state.db.items[quest.target]?.name || quest.target;
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
    // 재료 모으기는 낼 것을 가져간다 — **keep 이 켜진 줄만 빼고**(0.63).
    // 보여 주기만 하고 돌려받는 의뢰가 하나 있다: '쓸모를 잃은 무기'.
    // 그 검은 보석을 박으면 용기사 무기로 변신하는 물건이라, 가져가면
    // 10만 골드를 주고 다시 사야 했다.
    consume: quest.type === 'collect' && !quest.keep
      ? [{ id: quest.target, count: quest.count }]
      : [],
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
  // 다음 의뢰가 **여기서** 열린다. 눈금은 바로 지금 찍어야 한다 —
  // 나중에 찍으면 그 사이에 잡은 것이 얹혀서 또 저절로 끝난다.
  const next = currentQuest(state);
  openQuest(state, next);
  return next;
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
