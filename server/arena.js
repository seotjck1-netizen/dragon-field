// 책임: 결투장 — 몸(스냅샷)을 받아 두고, 비슷한 상대를 골라 주고, **싸움을 서버가 계산**해 점수를 적는다.
// 금지: 몸을 서버가 다시 계산하는 일. 몸은 게임이 만들어 올린다(세이브와 같은 믿음 — 게임이 적은 값).
//        서버가 지키는 것은 **싸움의 결과**와 점수 · 횟수 · 순서다.
//
// 0.80.24 — 처음 만든 판. 사용자 답(2026-11-13): 점수제 · 비슷한 상대 셋 · 하루 5번 · 직업 보정 없음 ·
//   주간 1 ~ 5위 우편 + 이기면 조금.
//
// 문서:
//   arena:<주>        { entries: { id: { id, name, cls, level, rating, wins, losses, attacks, at } }, settled }
//   arena:pool        { id: { name, cls, level, power, at } } — 몸을 올린 사람(상대 후보)
//   arenasnap:<id>    몸(DuelSystem.sanitizeSnapshot 모양) + at
//   arenaday:<id>     { day, used } — 오늘(한국 0시) 건 판 수
//   arenaoffer:<id>   { ids:[…], at } — 보여 준 상대(이 가운데서만 걸 수 있다)
//   arenalog:<id>     최근 12판 [{ at, role:'attack'|'defend', vs, cls, win, draw, delta }]
//   arena:meta        { settledUpTo }
//
// 한 주 = 월요일 0시(한국) — server/tower.js 와 같은 셈.

const path = require('path');
const fs = require('fs');
const { weekOf, weekStart } = require('./tower.js');

const DAY_MS = 86400000;
const KST = 9 * 3600000;
const SHOW = 10;
const LOG_MAX = 12;
const SNAP_STALE_MS = 14 * DAY_MS; // 두 주 넘게 몸을 안 올린 사람은 상대 후보에서 뺀다

function dayOf(now = Date.now()) {
  return Math.floor((now + KST) / DAY_MS);
}

function loadRules(file = path.join(__dirname, '..', 'src', 'data', 'arena.json')) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

/** 점수가 높은 사람이 위, 같으면 이긴 판이 많은 사람, 그래도 같으면 먼저 그 점수에 닿은 사람. */
function byRating(a, b) {
  return (b.rating - a.rating) || (b.wins - a.wins) || (a.at - b.at) || String(a.id).localeCompare(String(b.id));
}

/**
 * @param {object} store
 * @param {{duel:{simulateDuel:Function, sanitizeSnapshot:Function, ratingDelta:Function}, sendMail?:Function,
 *          isAdmin?:(id:string)=>boolean, rules?:object, rng?:()=>number}} opts
 */
function createArena(store, { duel, sendMail, isAdmin = () => false, rules = null, rng = Math.random } = {}) {
  const R = rules || loadRules();
  const START = R.start || 1000;
  const K = R.k || 32;
  const DEFEND = R.defend == null ? 0.5 : R.defend;
  const DAILY = Math.max(1, R.dailyFights || 5);
  const OFFER = Math.max(1, R.offerCount || 3);
  const UNLOCK = R.unlockLevel || 20;

  async function weekDoc(week) {
    const raw = await store.getDoc(`arena:${week}`);
    const doc = raw && typeof raw === 'object' ? raw : {};
    return { week, entries: doc.entries && typeof doc.entries === 'object' ? doc.entries : {}, settled: !!doc.settled };
  }
  async function pool() {
    const raw = await store.getDoc('arena:pool');
    return raw && typeof raw === 'object' ? raw : {};
  }
  function entryOf(doc, id, info = {}) {
    const e = doc.entries[id] || { id, rating: START, wins: 0, losses: 0, draws: 0, attacks: 0, at: 0 };
    if (info.name) e.name = info.name;
    if (info.cls) e.cls = info.cls;
    if (info.level) e.level = info.level;
    doc.entries[id] = e;
    return e;
  }
  const ranked = (doc) => Object.values(doc.entries).filter((e) => e && e.attacks > 0).sort(byRating);
  function shape(list, me) {
    const top = list.slice(0, SHOW).map((e, i) => ({
      rank: i + 1, name: e.name, cls: e.cls, level: e.level, rating: e.rating, wins: e.wins, losses: e.losses,
    }));
    let mine = null;
    if (me) {
      const i = list.findIndex((e) => e.id === me);
      if (i >= 0) mine = { rank: i + 1, rating: list[i].rating, wins: list[i].wins, losses: list[i].losses };
    }
    return { top, mine, total: list.length };
  }

  async function usedToday(id, now) {
    const d = await store.getDoc(`arenaday:${id}`);
    return d && d.day === dayOf(now) ? d.used || 0 : 0;
  }

  async function log(id, row) {
    const raw = await store.getDoc(`arenalog:${id}`);
    const list = Array.isArray(raw) ? raw : [];
    await store.setDoc(`arenalog:${id}`, [row, ...list].slice(0, LOG_MAX));
  }

  /** 지난 주들 정산 — 한 판이라도 건 사람 가운데 1 ~ 5위에게 우편. 여러 번 불려도 한 번. */
  async function settle(now = Date.now()) {
    const cur = weekOf(now);
    const meta = (await store.getDoc('arena:meta')) || {};
    let upTo = Number.isFinite(meta.settledUpTo) ? meta.settledUpTo : cur - 1;
    const sent = [];
    for (let w = Math.max(upTo + 1, cur - 8); w < cur; w++) {
      const doc = await weekDoc(w);
      if (!doc.settled) {
        const list = ranked(doc);
        const prizes = Array.isArray(R.weekly) ? R.weekly : [];
        for (let i = 0; i < Math.min(prizes.length, list.length); i++) {
          const e = list[i];
          const p = prizes[i] || {};
          if (sendMail) {
            await sendMail(e.id, {
              from: '결투장 관리인',
              subject: `결투장 주간 ${i + 1}위`,
              body: `지난 주 결투장 점수 ${e.rating}(${e.wins}승 ${e.losses}패) — ${i + 1}위입니다.`,
              gold: p.gold || 0,
              items: p.items || [],
              days: 14,
            });
          }
          sent.push({ week: w, rank: i + 1, id: e.id });
        }
        await store.setDoc(`arena:${w}`, { ...doc, settled: true });
      }
      upTo = w;
    }
    if (upTo !== meta.settledUpTo) await store.setDoc('arena:meta', { ...meta, settledUpTo: upTo });
    return sent;
  }

  async function board(me = null, now = Date.now()) {
    await settle(now);
    const week = weekOf(now);
    const doc = await weekDoc(week);
    const prev = await weekDoc(week - 1);
    const out = {
      week,
      endsAt: weekStart(week + 1),
      daily: DAILY,
      unlockLevel: UNLOCK,
      ...shape(ranked(doc), me),
      prev: { week: week - 1, ...shape(ranked(prev), me) },
    };
    if (me) {
      const e = doc.entries[me];
      out.me = { rating: e ? e.rating : START, wins: e ? e.wins : 0, losses: e ? e.losses : 0, left: Math.max(0, DAILY - await usedToday(me, now)) };
      const lg = await store.getDoc(`arenalog:${me}`);
      out.log = Array.isArray(lg) ? lg : [];
      const snap = await store.getDoc(`arenasnap:${me}`);
      out.hasSnap = !!snap;
    }
    return out;
  }

  /** 몸을 올린다. 레벨 · 직업 · 이름은 서버가 가진 세이브로 맞춘다. */
  function stamp(id, acct, raw) {
    const save = (acct && acct.save) || {};
    const snap = duel.sanitizeSnapshot(raw);
    snap.level = Math.max(1, Math.floor(Number(save.level) || snap.level || 1));
    if (save.classId) snap.classId = String(save.classId).slice(0, 20);
    snap.name = String((acct && acct.name) || save.name || snap.name).slice(0, 24);
    return snap;
  }

  async function putSnapshot(id, acct, raw, now = Date.now()) {
    const snap = stamp(id, acct, raw);
    if (snap.level < UNLOCK) return { ok: false, reason: `결투장은 Lv.${UNLOCK} 부터입니다.` };
    await store.setDoc(`arenasnap:${id}`, { ...snap, at: now });
    if (!isAdmin(id)) {
      const p = await pool();
      p[id] = { name: snap.name, cls: snap.classId, level: snap.level, power: snap.power, at: now };
      await store.setDoc('arena:pool', p);
    }
    return { ok: true, snap };
  }

  /** 내 점수 근처의 상대 셋(위 · 비슷 · 아래가 섞이게). */
  async function offer(id, acct, now = Date.now()) {
    await settle(now);
    const week = weekOf(now);
    const doc = await weekDoc(week);
    const mine = (doc.entries[id] && doc.entries[id].rating) || START;
    const p = await pool();
    const cands = Object.entries(p)
      .filter(([pid, v]) => pid !== id && !isAdmin(pid) && v && now - (v.at || 0) < SNAP_STALE_MS)
      .map(([pid, v]) => ({ id: pid, ...v, rating: (doc.entries[pid] && doc.entries[pid].rating) || START }));
    // 점수 차가 작은 순 — 같은 차이면 섞는다(늘 같은 셋이 나오지 않게)
    const keyed = cands.map((c) => ({ c, k: Math.abs(c.rating - mine) + rng() * 40 }));
    keyed.sort((x, y) => x.k - y.k);
    const near = keyed.slice(0, Math.max(OFFER * 3, OFFER)).map((x) => x.c);
    // 가까운 아홉 가운데 셋 — 위 하나 · 아래 하나 · 나머지 가까운 것
    const up = near.filter((c) => c.rating >= mine);
    const down = near.filter((c) => c.rating < mine);
    const pick = [];
    const take = (arr) => { const c = arr.find((x) => !pick.includes(x)); if (c) pick.push(c); };
    take(up); take(down);
    for (const c of near) { if (pick.length >= OFFER) break; if (!pick.includes(c)) pick.push(c); }
    const list = pick.slice(0, OFFER).sort((x, y) => y.rating - x.rating);
    await store.setDoc(`arenaoffer:${id}`, { ids: list.map((c) => c.id), at: now });
    return {
      ok: true,
      rating: mine,
      left: Math.max(0, DAILY - await usedToday(id, now)),
      list: list.map((c) => ({
        id: c.id, name: c.name, cls: c.cls, level: c.level, power: c.power, rating: c.rating,
        // 이기면 · 지면 몇 점인가(미리 보여 준다)
        win: duel.ratingDelta(mine, c.rating, 'a', K, DEFEND).a,
        lose: duel.ratingDelta(mine, c.rating, 'b', K, DEFEND).a,
      })),
    };
  }

  /** 건다. 몸을 새로 올리고, 서버가 싸움을 계산해 점수를 적는다. */
  async function fight(id, acct, target, rawSnap, now = Date.now(), seed = null) {
    await settle(now);
    if (!target || target === id) return { ok: false, reason: '상대를 고르세요.' };
    const off = await store.getDoc(`arenaoffer:${id}`);
    if (!off || !Array.isArray(off.ids) || !off.ids.includes(target)) {
      return { ok: false, reason: '보여 준 상대 가운데서만 걸 수 있습니다. 상대를 다시 받으세요.', stale: true };
    }
    const used = await usedToday(id, now);
    if (used >= DAILY) return { ok: false, reason: `오늘은 다 걸었습니다(하루 ${DAILY}판). 한국 시각 0시에 다시 열립니다.`, left: 0 };

    const put = await putSnapshot(id, acct, rawSnap, now);
    if (!put.ok) return put;
    const theirs = await store.getDoc(`arenasnap:${target}`);
    if (!theirs) return { ok: false, reason: '그 상대는 지금 결투장에 몸이 없습니다.', stale: true };

    const s = Number.isFinite(seed) ? seed : Math.floor(rng() * 0xffffffff) >>> 0;
    const res = duel.simulateDuel({ a: put.snap, b: duel.sanitizeSnapshot(theirs), seed: s });

    const week = weekOf(now);
    const doc = await weekDoc(week);
    const admin = isAdmin(id);
    const me = entryOf(doc, id, { name: put.snap.name, cls: put.snap.classId, level: put.snap.level });
    const them = entryOf(doc, target, { name: theirs.name, cls: theirs.classId, level: theirs.level });
    const delta = admin ? { a: 0, b: 0 } : duel.ratingDelta(me.rating, them.rating, res.winner, K, DEFEND);
    if (!admin) {
      me.rating += delta.a;
      them.rating += delta.b;
      me.attacks += 1;
      if (res.winner === 'a') { me.wins++; them.losses++; } else if (res.winner === 'b') { me.losses++; them.wins++; } else { me.draws = (me.draws || 0) + 1; them.draws = (them.draws || 0) + 1; }
      me.at = now;
      them.at = them.at || now;
      await store.setDoc(`arena:${week}`, doc);
      await store.setDoc(`arenaday:${id}`, { day: dayOf(now), used: used + 1 });
    }
    // 같은 상대를 연달아 못 고르게 — 건 판마다 상대를 새로 받는다
    await store.setDoc(`arenaoffer:${id}`, null);
    const win = res.winner === 'a';
    const draw = res.winner === 'draw';
    await log(id, { at: now, role: 'attack', vs: theirs.name, cls: theirs.classId, win, draw, delta: delta.a });
    if (!admin) await log(target, { at: now, role: 'defend', vs: put.snap.name, cls: put.snap.classId, win: res.winner === 'b', draw, delta: delta.b });
    const gold = win && !admin ? Math.max(0, Math.round((R.winGoldPerLevel || 0) * put.snap.level)) : 0;
    const list = ranked(doc);
    const rank = list.findIndex((e) => e.id === id) + 1;
    return {
      ok: true,
      admin,
      result: res,
      seed: s,
      foe: { name: theirs.name, cls: theirs.classId, level: theirs.level, sprite: theirs.sprite, body: theirs.body || null },
      delta: delta.a,
      rating: me.rating,
      rank: rank || null,
      left: Math.max(0, DAILY - (used + (admin ? 0 : 1))),
      reward: { gold },
    };
  }

  /** 계정을 지울 때 — 후보 · 이번 주 · 지난 주 표에서 뺀다. */
  async function forget(id, now = Date.now()) {
    const p = await pool();
    if (p[id]) { delete p[id]; await store.setDoc('arena:pool', p); }
    const week = weekOf(now);
    for (const w of [week, week - 1]) {
      const doc = await weekDoc(w);
      if (doc.entries[id]) { delete doc.entries[id]; await store.setDoc(`arena:${w}`, doc); }
    }
    await store.setDoc(`arenasnap:${id}`, null);
  }

  return { board, putSnapshot, offer, fight, settle, forget, dayOf };
}

module.exports = { createArena, dayOf, loadRules };
