// 책임: 끝없는 탑의 **주간 기록** — 도전을 열고, 층을 하나씩 받아 적고, 주가 바뀌면 상위 다섯에게 우편을 보낸다.
// 금지: 전투 계산. 싸움은 게임이 한다(다른 전투와 같다). 여기는 "말이 되는 순서로 올랐나" 만 지킨다.
//
// 0.80.22 — 처음 만든 판.
//
// 무엇을 지키나:
//   · 층은 **하나씩만** 오른다(도전을 열 때 정한 시작 층에서 1, 2, 3 …). 건너뛴 층은 받지 않는다
//   · 층과 층 사이가 너무 짧으면(minFloorMs) 받지 않는다 — 손으로 치는 속도가 아니다
//   · 시작 층은 **이번 주에 이미 오른 곳까지의 체크포인트**(1 · 11 · 21 …)만 고를 수 있다
//   · 주가 바뀌면 열려 있던 도전은 끝난다(지난 주 표에 적지 않는다)
//   · 운영자는 표에 오르지 않는다(게임 쪽에서도 안 보내지만, 자물쇠는 여기다)
//   · 레벨 · 직업 · 이름은 **서버가 가진 세이브**에서 읽는다
//
// 문서:
//   tower:<주>        { week, entries: { id: { id, name, cls, level, best, at } }, settled }
//   towerrun:<id>     { runId, week, floor, start, lastAt } — 지금 열려 있는 도전(사람마다 하나)
//   tower:meta        { settledUpTo } — 어느 주까지 우편을 보냈나
//
// 한 주 = 월요일 0시(한국 시각). 게임의 src/systems/TowerSystem.js weekOf 와 **같은 셈**이어야 한다.

const path = require('path');
const fs = require('fs');

const WEEK_MS = 7 * 86400000;
const WEEK_ZERO = 3 * 86400000 + 15 * 3600000;
const SHOW = 10;

function weekOf(now = Date.now()) {
  return Math.floor((now - WEEK_ZERO) / WEEK_MS);
}
function weekStart(week) {
  return WEEK_ZERO + week * WEEK_MS;
}

/**
 * 표(tower.json)를 읽는다. 서버와 게임이 같은 파일을 본다.
 * 0.80.25 — 구글 시트(tower 탭)에서 고칠 수 있게 되어 server/content 의 것을 먼저 본다(없으면 src/data).
 */
function loadRules(file = null) {
  const list = file ? [file] : [
    path.join(process.env.POINO_CONTENT_DIR ? path.resolve(process.env.POINO_CONTENT_DIR) : path.join(__dirname, 'content'), 'tower.json'),
    path.join(__dirname, '..', 'src', 'data', 'tower.json'),
  ];
  for (const f of list) {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      /* 다음 것 */
    }
  }
  return {};
}

function newRunId() {
  return `t_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 높이 오른 사람이 위, 같은 층이면 먼저 오른 사람이 위. */
function byBest(a, b) {
  return (b.best - a.best) || (a.at - b.at) || String(a.id).localeCompare(String(b.id));
}

/**
 * @param {object} store  server/store.js 의 저장소(getDoc · setDoc · get)
 * @param {{sendMail:Function, isAdmin:(id:string)=>boolean, rules?:object}} opts
 */
function createTower(store, { sendMail, isAdmin = () => false, rules = null } = {}) {
  // 표를 고치면(시트 반영) 다음 요청부터 그 값 — 시험은 고정된 표를 넘긴다
  const R = () => (typeof rules === 'function' ? rules() : rules) || loadRules();

  async function weekDoc(week) {
    const raw = await store.getDoc(`tower:${week}`);
    const doc = raw && typeof raw === 'object' ? raw : {};
    return { week, entries: doc.entries && typeof doc.entries === 'object' ? doc.entries : {}, settled: !!doc.settled };
  }

  function sorted(doc) {
    return Object.values(doc.entries).filter((e) => e && e.best > 0).sort(byBest);
  }

  function shape(list, me) {
    const top = list.slice(0, SHOW).map((e, i) => ({ rank: i + 1, name: e.name, cls: e.cls, level: e.level, best: e.best, at: e.at }));
    let mine = null;
    if (me) {
      const i = list.findIndex((e) => e.id === me);
      if (i >= 0) mine = { rank: i + 1, best: list[i].best, at: list[i].at };
    }
    return { top, mine, total: list.length };
  }

  /** 지난 주들 가운데 아직 우편을 안 보낸 주를 정리한다. 여러 번 불려도 한 번만 보낸다. */
  async function settle(now = Date.now()) {
    const cur = weekOf(now);
    const meta = (await store.getDoc('tower:meta')) || {};
    let upTo = Number.isFinite(meta.settledUpTo) ? meta.settledUpTo : cur - 1;
    const sent = [];
    // 서버가 몇 주 꺼져 있었어도 빠짐없이, 그러나 끝없이 거슬러 가지는 않는다
    for (let w = Math.max(upTo + 1, cur - 8); w < cur; w++) {
      const doc = await weekDoc(w);
      if (!doc.settled) {
        const list = sorted(doc);
        const rr = R();
        const prizes = Array.isArray(rr.weekly) ? rr.weekly : [];
        for (let i = 0; i < Math.min(prizes.length, list.length); i++) {
          const e = list[i];
          const p = prizes[i] || {};
          if (sendMail) {
            await sendMail(e.id, {
              from: '탑지기',
              subject: `끝없는 탑 주간 ${i + 1}위`,
              body: `지난 주 끝없는 탑 ${e.best}층 — ${i + 1}위입니다. 수고하셨습니다.`,
              gold: p.gold || 0,
              items: p.items || [],
              days: 14,
            });
          }
          sent.push({ week: w, rank: i + 1, id: e.id });
        }
        await store.setDoc(`tower:${w}`, { ...doc, settled: true });
      }
      upTo = w;
    }
    if (upTo !== meta.settledUpTo) await store.setDoc('tower:meta', { ...meta, settledUpTo: upTo });
    return sent;
  }

  async function board(me = null, now = Date.now()) {
    await settle(now);
    const week = weekOf(now);
    const doc = await weekDoc(week);
    const prev = await weekDoc(week - 1);
    const cur = shape(sorted(doc), me);
    return {
      week,
      startsAt: weekStart(week),
      endsAt: weekStart(week + 1),
      ...cur,
      prev: { week: week - 1, ...shape(sorted(prev), me) },
    };
  }

  /** 도전을 연다. 시작 층은 이번 주 체크포인트만. */
  async function start(id, acct, startFloor = 1, now = Date.now()) {
    await settle(now);
    const week = weekOf(now);
    const doc = await weekDoc(week);
    const best = (doc.entries[id] && doc.entries[id].best) || 0;
    const f = Math.max(1, Math.floor(Number(startFloor) || 1));
    const step = Math.max(1, R().checkpointEvery || 10);
    if ((f - 1) % step !== 0 || f - 1 > best) {
      return { ok: false, reason: `${f}층부터는 시작할 수 없습니다 — 이번 주에 오른 곳까지의 체크포인트(1 · ${step + 1} · ${step * 2 + 1} …층)만 고를 수 있습니다.`, best };
    }
    const run = { runId: newRunId(), week, floor: f - 1, start: f, lastAt: now };
    await store.setDoc(`towerrun:${id}`, run);
    return { ok: true, runId: run.runId, week, start: f, best, endsAt: weekStart(week + 1) };
  }

  /** 한 층을 깼다. */
  async function clear(id, acct, runId, floor, now = Date.now()) {
    const run = await store.getDoc(`towerrun:${id}`);
    if (!run || run.runId !== runId) return { ok: false, reason: '열려 있는 도전이 아닙니다. 다시 시작하세요.', ended: true };
    const week = weekOf(now);
    if (run.week !== week) {
      await store.setDoc(`towerrun:${id}`, null);
      return { ok: false, reason: '주가 바뀌었습니다 — 새 주의 탑을 처음부터 오르세요.', ended: true };
    }
    const f = Math.floor(Number(floor) || 0);
    if (f !== run.floor + 1) return { ok: false, reason: `${run.floor + 1}층 차례입니다.`, expect: run.floor + 1 };
    const minMs = Math.max(0, Number(R().minFloorMs) || 0);
    if (now - run.lastAt < minMs) return { ok: false, reason: '너무 빨리 올랐습니다.', tooFast: true };

    run.floor = f;
    run.lastAt = now;
    await store.setDoc(`towerrun:${id}`, run);

    const doc = await weekDoc(week);
    const before = (doc.entries[id] && doc.entries[id].best) || 0;
    const first = f > before;
    // 운영자는 표에 안 오른다 — 도전은 할 수 있고 층도 오르지만 적지 않는다
    if (isAdmin(id)) return { ok: true, floor: f, best: before, first: false, admin: true };
    if (first) {
      const save = (acct && acct.save) || {};
      doc.entries[id] = {
        id,
        name: String((acct && acct.name) || save.name || id).slice(0, 24),
        cls: String(save.classId || '').slice(0, 20),
        level: Math.max(1, Math.floor(Number(save.level) || 1)),
        best: f,
        at: now,
      };
      await store.setDoc(`tower:${week}`, doc);
    }
    const list = sorted(doc);
    const rank = list.findIndex((e) => e.id === id) + 1;
    return { ok: true, floor: f, best: Math.max(before, f), first, rank: rank || null };
  }

  /** 도전을 끝낸다(졌거나 그만 오름). 기록은 이미 층마다 적혔다. */
  async function end(id) {
    await store.setDoc(`towerrun:${id}`, null);
    return { ok: true };
  }

  /** 계정을 지울 때 이번 주 · 지난 주 표에서도 뺀다. */
  async function forget(id, now = Date.now()) {
    const week = weekOf(now);
    for (const w of [week, week - 1]) {
      const doc = await weekDoc(w);
      if (doc.entries[id]) {
        delete doc.entries[id];
        await store.setDoc(`tower:${w}`, doc);
      }
    }
    await store.setDoc(`towerrun:${id}`, null);
  }

  return { board, start, clear, end, settle, forget, weekOf, weekStart };
}

module.exports = { createTower, weekOf, weekStart, WEEK_MS, WEEK_ZERO, loadRules };
