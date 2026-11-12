// 책임: 도감(만난 몬스터 · 얻은 장비)과 업적(achievements.json)의 진행을 적고 판단한다.
//
// 0.80.21 — 도감 · 업적.
//
// 다른 system 을 부르지 않는다(규칙). 보상을 넣는 일 · 알림 · 소리는 main.js 가 한다 —
// evaluate() 가 "방금 해낸 것" 목록을 돌려주면 그걸 받아서 처리한다.
//
// 세이브(state.codex):
//   mon   { 몬스터id: { seen:1, kills:n } }      만난 적이 있으면 도감에 오른다
//   item  { 장비id: 등급 순위(0~4) }             얻은 적이 있는 가장 높은 등급
//   stat  { kills, boss, box, gold }            합계 — 업적이 센다
//   done  { 업적id: 해낸 시각(ms) }              한 번 해내면 다시 잃지 않는다
//
// 무엇을 '지금 상태에서' 읽고, 무엇을 '적어 두나':
//   레벨 · 강화 · 세트 · 의뢰 는 지금 상태에서 읽는다 — 따로 적으면 둘이 어긋날 수 있다.
//   잡은 수 · 상자 · 번 골드 · 만난 것 · 얻은 것 은 지나가면 사라지므로 적어 둔다.
//   (장비는 팔아 버리면 가방에서 사라지니, 가방을 훑을 때마다 도감에 옮겨 적는다.)

import { GRADE_ORDER, slotGroup, enhanceOf } from '../data/gear.js';

export function emptyCodex() {
  return { mon: {}, item: {}, stat: { kills: 0, boss: 0, box: 0, gold: 0 }, done: {} };
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);

/** 세이브에서 읽은 것을 믿을 만한 모양으로 다듬는다(모르는 칸은 버린다). */
export function normalize(raw) {
  const out = emptyCodex();
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, m] of Object.entries(raw.mon || {})) {
    if (!m || typeof m !== 'object') continue;
    out.mon[id] = { seen: 1, kills: num(m.kills) };
  }
  for (const [id, g] of Object.entries(raw.item || {})) {
    const r = Math.min(GRADE_ORDER.length - 1, num(g));
    out.item[id] = r;
  }
  for (const k of Object.keys(out.stat)) out.stat[k] = num(raw.stat && raw.stat[k]);
  for (const [id, t] of Object.entries(raw.done || {})) out.done[id] = num(t) || 1;
  return out;
}

export function ensure(state) {
  if (!state.codex || typeof state.codex !== 'object') state.codex = emptyCodex();
  const c = state.codex;
  c.mon = c.mon || {};
  c.item = c.item || {};
  c.stat = { ...emptyCodex().stat, ...(c.stat || {}) };
  c.done = c.done || {};
  return c;
}

/** 이 몬스터를 만났다(싸움이 열렸다). 처음이면 true. */
export function recordSeen(state, monId) {
  if (!monId) return false;
  const c = ensure(state);
  if (c.mon[monId]) return false;
  c.mon[monId] = { seen: 1, kills: 0 };
  return true;
}

/** 쓰러뜨렸다. 처음 보는 놈이면 도감에도 오른다. */
export function recordKill(state, monId, isBoss = false) {
  if (!monId) return;
  const c = ensure(state);
  recordSeen(state, monId);
  c.mon[monId].kills += 1;
  c.stat.kills += 1;
  if (isBoss) c.stat.boss += 1;
}

export function recordGold(state, amount) {
  const n = num(amount);
  if (n) ensure(state).stat.gold += n;
}

export function recordBox(state) {
  ensure(state).stat.box += 1;
}

const gradeRank = (g) => Math.max(0, GRADE_ORDER.indexOf(g));

/** 장비인가(무기 · 방어구 · 장신구). 도감의 장비 칸은 이것만 센다. */
export function isGear(def) {
  return !!(def && slotGroup(def.slot));
}

/**
 * 가방(장착한 것도 가방에 있다)을 훑어 도감의 장비 칸을 채운다.
 * @returns {Array<{id, grade, first:boolean}>} 새로 오르거나 등급이 오른 것
 */
export function scanItems(state) {
  const c = ensure(state);
  const db = state.db || {};
  const items = db.items || {};
  const out = [];
  for (const inst of state.inventory || []) {
    const def = items[inst.id];
    if (!isGear(def)) continue;
    const r = gradeRank(inst.grade || def.rarity || 'common');
    const had = c.item[inst.id];
    if (had === undefined || r > had) {
      c.item[inst.id] = r;
      out.push({ id: inst.id, grade: GRADE_ORDER[r], first: had === undefined });
    }
  }
  return out;
}

/** 표의 업적들(id 가 있는 줄만). */
export function achievements(db) {
  const list = (db && db.achievements && db.achievements.list) || [];
  return list.filter((a) => a && a.id && a.type);
}

/** 도감에 오를 수 있는 몬스터 · 장비 id 들(표의 순서대로). */
export function monsterIds(db) {
  return Object.keys((db && db.monsters) || {}).filter((k) => !k.startsWith('_'));
}
export function gearIds(db) {
  const items = (db && db.items) || {};
  return Object.keys(items).filter((k) => !k.startsWith('_') && isGear(items[k]));
}

/** 끼고 있는 것 가운데 가장 높은 강화 — 가방의 것도 센다(팔기 전에 닿았으면 해낸 것). */
function bestEnhance(state) {
  let best = 0;
  for (const inst of state.inventory || []) best = Math.max(best, enhanceOf(inst));
  return best;
}

/** 지금 이 세트를 몇 자리 입고 있나. */
function wornOfSet(state, setId) {
  const table = (state.db && state.db.affixes && state.db.affixes['세트']) || {};
  const def = table[setId];
  if (!def || !Array.isArray(def['부위'])) return 0;
  const eq = (state.player && state.player.equipment) || {};
  const byUid = new Map((state.inventory || []).map((i) => [i.uid, i.id]));
  const worn = new Set(Object.values(eq).filter(Boolean).map((uid) => byUid.get(uid)).filter(Boolean));
  return def['부위'].map((x) => (Array.isArray(x) ? x : [x])).filter((slot) => slot.some((id) => worn.has(id))).length;
}

/** 이 업적은 지금 어디까지 왔나. */
export function progress(state, ach) {
  const c = ensure(state);
  const need = Math.max(1, num(ach.count) || 1);
  let have = 0;
  switch (ach.type) {
    case 'kill':
      if (ach.target === 'any' || !ach.target) have = c.stat.kills;
      else if (ach.target === 'boss') have = c.stat.boss;
      else have = (c.mon[ach.target] && c.mon[ach.target].kills) || 0;
      break;
    case 'level':
      have = (state.player && state.player.level) || 0;
      break;
    case 'enhance':
      have = bestEnhance(state);
      break;
    case 'grade': {
      const want = gradeRank(ach.target || 'uncommon');
      have = Object.values(c.item).filter((r) => r >= want).length;
      break;
    }
    case 'set':
      have = wornOfSet(state, ach.target);
      break;
    case 'box':
      have = c.stat.box;
      break;
    case 'quest':
      have = ((state.quests && state.quests.done) || []).length;
      break;
    case 'codexMon':
      have = Object.keys(c.mon).length;
      break;
    case 'codexItem':
      have = Object.keys(c.item).length;
      break;
    case 'gold':
      have = c.stat.gold;
      break;
    case 'tower': // 0.80.22 — 끝없는 탑에서 여태 가장 높이 오른 층
      have = (state.tower && state.tower.bestEver) || 0;
      break;
    default:
      have = 0;
  }
  const done = !!c.done[ach.id] || have >= need;
  return { have: Math.min(have, need), need, done, at: c.done[ach.id] || 0 };
}

/**
 * 새로 해낸 업적을 찾아 표시해 둔다. 보상은 **돌려준 목록을 받은 쪽이** 넣는다.
 * 한 번 표시된 업적은 다시 나오지 않는다(보상이 두 번 들어가지 않는다).
 * @returns {Array<achievement>}
 */
export function evaluate(state, now = Date.now()) {
  const c = ensure(state);
  scanItems(state);
  const fresh = [];
  for (const ach of achievements(state.db)) {
    if (c.done[ach.id]) continue;
    if (progress(state, ach).done) {
      c.done[ach.id] = now;
      fresh.push(ach);
    }
  }
  return fresh;
}

/** 보상을 사람이 읽을 글로. */
export function rewardText(db, reward) {
  if (!reward) return '';
  const parts = [];
  if (num(reward.gold)) parts.push(`🪙 ${num(reward.gold).toLocaleString('ko-KR')}`);
  for (const it of reward.items || []) {
    const name = (db.items && db.items[it.id] && db.items[it.id].name) || it.id;
    parts.push(`${name} ×${num(it.count) || 1}`);
  }
  return parts.join(' · ');
}

/** 창 맨 위에 적을 합계. */
export function totals(state) {
  const c = ensure(state);
  const db = state.db || {};
  const mons = monsterIds(db);
  const gear = gearIds(db);
  const list = achievements(db);
  return {
    mon: { have: mons.filter((id) => c.mon[id]).length, all: mons.length },
    item: { have: gear.filter((id) => c.item[id] !== undefined).length, all: gear.length },
    ach: { have: list.filter((a) => c.done[a.id]).length, all: list.length },
  };
}
