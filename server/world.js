// 책임: 계정 하나로는 답할 수 없는 것들 — 우편함 · 랭킹 · 고룡 · 이벤트.
// 금지: HTTP 처리(server.js 가 한다), 비밀번호 처리(auth.js 가 한다).
//
// ── 왜 서버에 두는가 ────────────────────────────────────────
// 이 넷은 전부 "여러 사람이 같은 것을 본다"가 핵심이다.
//   · 고룡  — 여럿이 같은 놈을 때려야 기여도 순위가 뜻을 갖는다
//   · 랭킹  — 남과 견주는 것이 전부다
//   · 우편  — 서버가 보내 주는 것이다
//   · 이벤트 — 한 번 적어 두면 모두가 받아야 한다
// 세이브 안에 두면 사람마다 다른 세상을 보게 되므로 여기 있어야 한다.
//
// ── 저장 모양 ──────────────────────────────────────────────
//   doc 'mail:<id>'   [{ mid, from, subject, body, items, at, taken }]
//   doc 'events'      [{ eid, from, subject, body, items, at }]   — 전체 발송
//   doc 'rank'        { [bossId]: [{ id, name, ms, at }] }        — 빠른 순 5명
//   doc 'dragon'      { since, hp, maxHp, damage:{id:합계}, downedAt, rewarded }
//
// 이벤트를 "모두의 우편함에 한 통씩" 넣지 않는 이유: 계정이 늘수록 발송이 비싸지고,
// 아직 안 만든 계정은 받을 수도 없다. 대신 한 곳에 적어 두고, 각자 접속할 때
// "내가 마지막으로 본 시각" 뒤의 것만 골라 간다. 계정 수와 무관하게 값이 같다.

const MAIL_MAX = 60; // 한 사람의 우편함에 남기는 최대 통수
const RANK_SHOW = 5; // 화면에 보여 주는 등수
// 표에는 전부 남긴다. 5위까지만 남기면 "나는 몇 위인가"에 답할 수가 없다 —
// 12위인 사람에게 "5위 안에 없습니다"만 보여 주면 목표가 생기지 않는다.
// 다만 끝없이 불어나면 안 되므로 상한을 둔다(이 서버는 계정 500개가 상한이다).
const RANK_MAX = 600;
const EVENT_KEEP = 40;

/** 겹치지 않는 짧은 번호. */
function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** 우편이 저절로 사라지기까지의 기본 날수. */
const MAIL_DAYS_DEFAULT = 7;
const MAIL_DAYS_MAX = 365;
const DAY_MS = 86400000;

/**
 * 기한이 지난 우편을 걸러 낸다.
 *
 * 왜 지우나: 우편함은 계정마다 한 문서다. 이벤트를 몇 번 뿌리고 고룡을 몇 번 잡으면
 * 안 읽은 우편이 쌓여 정작 새로 온 것이 위쪽에서 밀려난다(MAIL_MAX).
 * 기한을 두면 그런 일이 없고, 사람도 "언제까지 받아야 하는지"를 알 수 있다.
 *
 * **받은(taken) 우편도 함께 지운다** — 이미 값어치를 가져갔으므로 남길 이유가 없다.
 */
function dropExpired(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter((m) => !(m && m.expiresAt > 0 && m.expiresAt <= now));
}

/** 우편 한 통을 다듬는다. 바깥에서 들어온 값을 그대로 믿지 않는다. */
function sanitizeMail(raw) {
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter((it) => it && typeof it.id === 'string')
        .slice(0, 12)
        .map((it) => ({ id: it.id.slice(0, 40), count: Math.max(1, Math.min(999, Number(it.count) || 1)) }))
    : [];
  const num = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
  return {
    mid: raw.mid || newId('m'),
    from: String(raw.from || '포이노').slice(0, 24),
    subject: String(raw.subject || '(제목 없음)').slice(0, 60),
    body: String(raw.body || '').slice(0, 600),
    items,
    // 경험치·골드도 우편으로 보낼 수 있다.
    // 고룡은 아무것도 떨구지 않으므로(바닥에 흘리면 마지막 일격을 넣은 사람이
    // 독차지한다), 잡은 값어치는 전부 이 우편으로만 나간다.
    exp: num(raw.exp, 100000000),
    gold: num(raw.gold, 100000000),
    at: raw.at || Date.now(),
    // 유효기간. 아무 말이 없으면 7일이고, 보낼 때 날수를 정해 바꿀 수 있다.
    // 0(또는 음수) 을 주면 **영영 안 사라지는** 우편이 된다 — 운영자가 일부러 그럴 때만.
    expiresAt: (() => {
      if (raw.expiresAt != null) return Math.max(0, Math.round(Number(raw.expiresAt) || 0));
      const at = raw.at || Date.now();
      const d = raw.days == null ? MAIL_DAYS_DEFAULT : Number(raw.days);
      if (!Number.isFinite(d) || d <= 0) return 0;
      return at + Math.min(MAIL_DAYS_MAX, d) * DAY_MS;
    })(),
    taken: false,
  };
}

function createWorld(store) {
  // ── 우편함 ────────────────────────────────────────────────

  /**
   * 우편함을 읽는다. **읽을 때마다 기한 지난 것을 치운다.**
   *
   * 따로 청소 시계를 두지 않는 이유: 계정이 수백 개라도 우편함을 여는 것은
   * 그 사람이 접속했을 때뿐이다. 그때 치우면 충분하고, 아무도 안 오는 계정의
   * 우편을 지우려고 서버가 주기적으로 전체를 훑을 이유가 없다.
   */
  async function mailbox(id) {
    const raw = await store.getDoc(`mail:${id}`);
    const list = Array.isArray(raw) ? raw : [];
    const kept = dropExpired(list);
    if (kept.length !== list.length) await store.setDoc(`mail:${id}`, kept);
    return kept;
  }

  async function sendMail(id, mail) {
    const list = await mailbox(id);
    const next = [sanitizeMail(mail), ...list].slice(0, MAIL_MAX);
    await store.setDoc(`mail:${id}`, next);
    return next;
  }

  /**
   * 아직 안 받은 것 중 이 번호의 우편을 "받음"으로 바꾸고 내용물을 돌려준다.
   * 실제로 소지품에 넣는 것은 클라이언트가 한다 — 서버는 두 번 받는 것만 막는다.
   */
  async function claimMail(id, mid) {
    const list = await mailbox(id);
    const found = list.find((m) => m.mid === mid);
    if (!found) return { ok: false, reason: '없는 우편입니다.' };
    if (found.taken) return { ok: false, reason: '이미 받은 우편입니다.' };
    found.taken = true;
    await store.setDoc(`mail:${id}`, list);
    return { ok: true, mail: found };
  }

  async function deleteMail(id, mid) {
    const list = await mailbox(id);
    const next = list.filter((m) => m.mid !== mid || !m.taken);
    await store.setDoc(`mail:${id}`, next);
    return next;
  }

  /**
   * **여태 보낸 우편을 전부 지운다** (0.45).
   *
   * 두 곳을 함께 비워야 한다. 하나만 비우면 지운 우편이 되살아난다:
   *   · 계정마다의 우편함 (`mail:<id>`)  — 이미 배달된 것
   *   · 이벤트 통 (`events`)            — 아직 안 들어온 사람에게 배달을 기다리는 것
   * 우편함만 비우면, 다음에 그 사람이 접속할 때 이벤트 통에서 **똑같은 우편이 다시**
   * 들어온다. 지웠는데 도로 생기는 것만큼 나쁜 것이 없다.
   *
   * 받은 것도 안 받은 것도 가리지 않고 지운다 — "여태 보낸 모든 우편" 이라는 말 그대로다.
   * 이미 받아서 소지품에 들어간 물건은 **그대로 남는다.** 지우는 것은 편지지 뿐이다.
   *
   * @returns {{ok:boolean, accounts:number, mails:number, events:number}}
   */
  async function clearAllMail() {
    const evs = await store.getDoc('events');
    const eventCount = Array.isArray(evs) ? evs.length : 0;
    await store.setDoc('events', []);

    let accounts = 0;
    let mails = 0;
    const ids = typeof store.ids === 'function' ? await store.ids() : [];
    for (const id of ids) {
      const raw = await store.getDoc(`mail:${id}`);
      const list = Array.isArray(raw) ? raw : [];
      if (!list.length) continue;
      mails += list.length;
      accounts++;
      await store.setDoc(`mail:${id}`, []);
    }
    return { ok: true, accounts, mails, events: eventCount };
  }

  /**
   * **계정 하나를 통째로 지운다** (0.46).
   *
   * 지우는 것을 빠짐없이 적는다. 하나라도 남으면 "지웠는데 흔적이 남는" 상태가 된다:
   *   · 계정 자체(아이디·비밀번호·세이브)  — store.del
   *   · 우편함                              — mail:<id>
   *   · 랭킹에 올라간 기록                  — 모든 보스 표에서 그 사람 줄을 뺀다
   *
   * 랭킹을 빼먹으면 **주인 없는 1위**가 표에 남는다. 그 이름으로 다시 가입해도
   * 남의 기록이 되고, 지운 사람이 계속 순위표에 보인다.
   *
   * 지운 아이디는 **다시 만들 수 있다.** 같은 아이디로 새로 가입하면 새 사람이다.
   *
   * @param {string} id
   * @returns {{ok:boolean, reason?:string, id?:string, name?:string, mail?:boolean, ranks?:string[]}}
   */
  async function deleteAccount(id) {
    const acct = await store.get(id);
    if (!acct) return { ok: false, reason: '없는 계정입니다.' };

    // ① 랭킹에서 뺀다 — 계정을 먼저 지우면 이름을 알 수 없게 된다.
    const table = await ranks();
    const touched = [];
    for (const [boss, list] of Object.entries(table)) {
      if (!Array.isArray(list)) continue;
      const next = list.filter((r) => r && r.id !== id);
      if (next.length === list.length) continue;
      table[boss] = next;
      touched.push(boss);
    }
    if (touched.length) await store.setDoc('rank', table);

    // 지난 시즌 표에서도 뺀다 — 거기 남아 있으면 '지난 시즌' 탭에 계속 보인다.
    const prev = await prevRanks();
    let prevTouched = false;
    for (const [boss, list] of Object.entries(prev)) {
      if (!Array.isArray(list)) continue;
      const next = list.filter((r) => r && r.id !== id);
      if (next.length === list.length) continue;
      prev[boss] = next;
      prevTouched = true;
    }
    if (prevTouched) await store.setDoc('rank:prev', prev);

    // ② 우편함
    let mail = false;
    if (typeof store.delDoc === 'function') {
      mail = await store.delDoc(`mail:${id}`);
    } else {
      await store.setDoc(`mail:${id}`, []);
      mail = true;
    }

    // ③ 계정
    if (typeof store.del !== 'function') {
      return { ok: false, reason: '이 저장소는 계정을 지울 수 없습니다.' };
    }
    await store.del(id);

    return { ok: true, id, name: acct.name || id, mail, ranks: touched };
  }

  // ── 이벤트(전체 발송) ─────────────────────────────────────

  async function events() {
    const list = await store.getDoc('events');
    // 기한이 지난 이벤트는 나눠 주지 않는다 — 지금 접속한 사람에게만 뒤늦게
    // 죽은 우편이 배달되면, 열어 봐야 이미 사라질 것이다.
    return dropExpired(Array.isArray(list) ? list : []);
  }

  async function addEvent(mail) {
    const list = await events();
    const item = { ...sanitizeMail(mail), eid: newId('e') };
    const next = [item, ...list].slice(0, EVENT_KEEP);
    await store.setDoc('events', next);
    return item;
  }

  /**
   * 이 사람이 아직 안 가져간 이벤트를 우편함에 넣어 준다.
   * @param {number} since 마지막으로 가져간 시각(ms)
   */
  async function pullEvents(id, since = 0) {
    const list = await events();
    const fresh = list.filter((e) => e.at > (Number(since) || 0));
    if (!fresh.length) return { added: 0, at: since || 0 };

    const box = await mailbox(id);
    const have = new Set(box.map((m) => m.mid));
    const add = fresh
      .filter((e) => !have.has(e.eid))
      // 이벤트의 eid 를 그대로 우편 번호로 쓴다 — 두 번 들어오는 일을 막는다.
      .map((e) => ({ ...sanitizeMail(e), mid: e.eid }));
    if (add.length) {
      await store.setDoc(`mail:${id}`, [...add, ...box].slice(0, MAIL_MAX));
    }
    return { added: add.length, at: Math.max(...fresh.map((e) => e.at), Number(since) || 0) };
  }

  // ── 랭킹(타임어택) ────────────────────────────────────────

  async function ranks() {
    const table = await store.getDoc('rank');
    return table && typeof table === 'object' ? table : {};
  }

  /** 지난 시즌의 표. 초기화할 때 지금 표를 통째로 여기로 옮겨 둔다. */
  async function prevRanks() {
    const table = await store.getDoc('rank:prev');
    return table && typeof table === 'object' ? table : {};
  }

  /**
   * 지금이 몇 번째 시즌이고, 언제 시작했나.
   *
   * 시즌 번호가 없으면 1로 본다 — 이 기능이 생기기 전부터 돌던 서버가
   * '0 시즌'으로 보이면 이상하다.
   *
   * `locked` 는 **시즌 고정**(0.45). 켜 두면 아무리 초기화해도 번호가 안 올라간다.
   * 아직 시험 중인 서버에서 초기화를 몇 번씩 하다 보면 시즌만 5, 6 으로 올라가
   * "1 시즌 기록" 이 영영 안 남는다. 그걸 막는 스위치다.
   */
  async function season() {
    const m = await store.getDoc('rank:meta');
    const meta = m && typeof m === 'object' ? m : {};
    return {
      season: Math.max(1, Math.round(Number(meta.season) || 1)),
      startedAt: Number(meta.startedAt) || 0,
      prevSeason: meta.prevSeason ? Math.round(Number(meta.prevSeason)) : null,
      prevStartedAt: Number(meta.prevStartedAt) || 0,
      prevEndedAt: Number(meta.prevEndedAt) || 0,
      locked: !!meta.locked,
    };
  }

  /**
   * 시즌 고정을 켜고 끈다.
   *
   * 켜져 있는 동안에는 **어떤 초기화도 시즌을 넘기지 않는다** — 기록과 세이브만
   * 지워지고 번호는 그 자리에 머문다. 켜고 끄는 것 자체는 아무것도 안 지운다.
   *
   * @param {boolean} on
   */
  async function lockSeason(on) {
    const m = await store.getDoc('rank:meta');
    const meta = m && typeof m === 'object' ? m : {};
    await store.setDoc('rank:meta', { ...meta, locked: !!on });
    return { ok: true, locked: !!on, season: (await season()).season };
  }

  /**
   * 시즌 번호를 **직접 정한다** — 대개 1 로 되돌릴 때 쓴다.
   *
   * 번호만 바꾸면 안 된다. 되돌리는 사람이 원하는 것은 "1 시즌으로 돌아간 상태"이지
   * "2 시즌이라고 적힌 종이만 1 로 고친 상태" 가 아니다. 그래서 함께 지운다:
   *   · 지난 시즌 표와 그 기간 — 있지도 않았던 과거가 랭킹 창에 남으면 안 된다
   *   · 아직 안 본 시즌 알림 — 접속하자마자 "3 시즌이 시작되었습니다" 가 뜨면 안 된다
   *
   * 지금 시즌의 기록·세이브는 **건드리지 않는다.** 그건 초기화가 할 일이고,
   * 이건 번호를 되돌리는 일이다. 둘을 한 단추에 묶으면 되돌릴 수 없는 단추가 된다.
   *
   * @param {number} n 새 시즌 번호(1 이상)
   */
  async function setSeason(n) {
    const want = Math.max(1, Math.round(Number(n) || 1));
    const m = await store.getDoc('rank:meta');
    const meta = m && typeof m === 'object' ? m : {};
    const before = Math.max(1, Math.round(Number(meta.season) || 1));

    await store.setDoc('rank:meta', {
      season: want,
      startedAt: Date.now(),
      prevSeason: null,
      prevStartedAt: 0,
      prevEndedAt: 0,
      locked: !!meta.locked,
    });
    await store.setDoc('rank:prev', {});

    // 못 본 알림 치우기 — 안 그러면 자고 있던 사람이 들어와 옛 번호를 본다.
    let cleared = 0;
    const ids = typeof store.ids === 'function' ? await store.ids() : [];
    for (const id of ids) {
      const acct = await store.get(id);
      if (!acct || !acct.seasonNotice) continue;
      const next = { ...acct };
      delete next.seasonNotice;
      await store.set(id, next);
      cleared++;
    }
    return { ok: true, from: before, season: want, notices: cleared };
  }

  /**
   * 보스 하나를 잡기까지 걸린 시간을 올린다.
   *
   * ⚠ 걸린 시간은 **서버가 잰다**. 게임 쪽이 보낸 숫자는 아예 쓰지 않는다.
   *   랭킹은 남과 견주는 표라서, 브라우저 콘솔에서 "1초 만에 잡았다"고
   *   보내면 그만인 값이면 표 자체가 뜻을 잃는다.
   *   잣대는 계정을 만든 시각(register 때 서버가 찍은 것) 하나뿐이다.
   *
   * 첫 기록만 센다 — 다 키운 캐릭터로 다시 잡아 기록을 갈아 치우면
   * "얼마 만에 여기까지 왔나"라는 물음이 사라진다. 이것도 서버가 막는다.
   *
   * @param {number} bornMs 계정을 만든 시각(ms). 없으면 잴 수가 없다.
   * @returns {{ok:boolean, rank:number|null, list:Array, ms:number, reason?:string}}
   */
  async function submitRank(bossId, { id, name, bornMs, already }, now = Date.now()) {
    if (!bornMs) {
      return { ok: false, reason: '계정을 만든 시각을 알 수 없어 기록을 남기지 못했습니다.' };
    }
    const table = await ranks();
    const list = Array.isArray(table[bossId]) ? table[bossId] : [];

    // 이미 이 보스로 기록이 있으면 그대로 둔다(처음 잡은 기록만 센다).
    if (already) {
      const at = list.findIndex((r) => r.id === id);
      return {
        ok: true, first: false, ms: already,
        rank: at >= 0 ? at + 1 : null, total: list.length,
        list: list.slice(0, RANK_SHOW),
      };
    }

    const ms = Math.max(1, now - bornMs);
    const next = list
      .filter((r) => r.id !== id)
      .concat([{ id, name: String(name || id).slice(0, 12), ms, at: now }])
      .sort((a, b) => a.ms - b.ms)
      .slice(0, RANK_MAX);

    table[bossId] = next;
    await store.setDoc('rank', table);
    const at = next.findIndex((r) => r.id === id);
    return {
      ok: true, first: true, ms,
      rank: at >= 0 ? at + 1 : null, total: next.length,
      list: next.slice(0, RANK_SHOW),
    };
  }

  /**
   * 화면에 뿌릴 랭킹표.
   *
   * 보여 주는 것은 5위까지지만, 내 기록은 몇 위든 함께 준다 —
   * 12위인 사람에게 "5위 안에 없습니다"만 보여 주면 다음에 뭘 해야 할지 알 수 없다.
   *
   * @param {string} [me] 내 계정 id. 있으면 mine 에 내 자리를 담아 준다.
   * @returns {{table:object, mine:object, total:object}}
   */
  /** 표 하나를 화면에 뿌릴 모양으로 (상위 몇 명 + 내 줄). */
  function shape(all, me) {
    const table = {};
    const mine = {};
    const total = {};
    for (const [bossId, list] of Object.entries(all || {})) {
      if (!Array.isArray(list)) continue;
      table[bossId] = list.slice(0, RANK_SHOW);
      total[bossId] = list.length;
      if (!me) continue;
      const at = list.findIndex((r) => r.id === me);
      if (at >= 0) mine[bossId] = { ...list[at], rank: at + 1, total: list.length };
    }
    return { table, mine, total };
  }

  /**
   * 랭킹표. **이번 시즌과 지난 시즌을 함께** 돌려준다.
   *
   * 초기화를 하면 지금 표가 지난 시즌으로 넘어간다. 그냥 지워 버리면
   * "내가 1등이었는데" 를 확인할 길이 사라지고, 초기화 자체를 아무도 반기지 않게 된다.
   */
  async function board(me = null) {
    const cur = shape(await ranks(), me);
    const prev = shape(await prevRanks(), me);
    const meta = await season();
    return {
      table: cur.table, mine: cur.mine, total: cur.total,
      prev: { table: prev.table, mine: prev.mine, total: prev.total },
      season: meta,
    };
  }

  // ── 고룡 ──────────────────────────────────────────────────
  //
  // 체력을 서버가 들고 있다. 세이브 안에 두면 사람마다 다른 용을 잡게 되어
  // "누가 제일 많이 때렸나"를 물을 수가 없다.

  /** 이번 주기의 시작 시각. 시계에 맞춰 계산하므로 모두가 같은 값을 본다. */
  function cycleStart(now, everyMs) {
    return Math.floor(now / everyMs) * everyMs;
  }

  async function dragonState(cfg, now = Date.now()) {
    const everyMs = cfg.everyMs;
    const stayMs = Math.min(cfg.stayMs || everyMs, everyMs);
    const since = cycleStart(now, everyMs);
    const endsAt = since + stayMs;

    let doc = await store.getDoc('dragon');
    // 주기가 바뀌었으면 새 용이다 — 온전한 몸으로, 기여도는 백지에서 시작한다.
    if (!doc || doc.since !== since) {
      doc = { since, hp: cfg.maxHp, maxHp: cfg.maxHp, damage: {}, downedAt: 0, rewarded: false };
      await store.setDoc('dragon', doc);
    }
    const present = now < endsAt && !doc.downedAt && doc.hp > 0;
    return { ...doc, present, endsAt, nextAt: since + everyMs, stayMs };
  }

  /**
   * 고룡에게 준 피해를 더한다.
   *
   * @returns {{ok, hp, maxHp, present, downed, top, endsAt, nextAt}}
   *   downed 가 true 면 이번 타격으로 눕은 것이다(보상은 여기서 한 번만 나간다).
   */
  async function hitDragon(cfg, id, name, damage, now = Date.now()) {
    const at = await dragonState(cfg, now);
    if (!at.present) {
      return { ok: false, reason: '지금은 고룡이 없습니다.', ...at, top: topDamage(at.damage) };
    }
    const dmg = Math.max(0, Math.min(at.maxHp, Math.round(Number(damage) || 0)));

    const doc = {
      since: at.since,
      hp: Math.max(0, at.hp - dmg),
      maxHp: at.maxHp,
      damage: { ...at.damage },
      downedAt: at.downedAt,
      rewarded: at.rewarded,
      names: { ...(at.names || {}) },
    };
    if (dmg > 0) {
      doc.damage[id] = (doc.damage[id] || 0) + dmg;
      doc.names[id] = String(name || id).slice(0, 12);
    }

    let downed = false;
    let rewards = [];
    if (doc.hp <= 0 && !doc.downedAt) {
      doc.downedAt = now;
      downed = true;
      rewards = shareRewards(doc.damage, cfg.reward, doc.names);
      doc.rewarded = true;
    }
    await store.setDoc('dragon', doc);

    // 눕혔으면 기여한 사람 모두에게 우편을 보낸다.
    //
    // 고룡은 바닥에 아무것도 흘리지 않는다. 흘리면 마지막 일격을 넣은 사람이
    // 다 가져가고, 열 번을 함께 두들긴 사람은 빈손이 된다.
    // 그래서 값어치는 전부 여기서 기여도에 따라 갈라 우편으로 보낸다.
    if (downed) {
      const totalDmg = rewards.reduce((a, r) => a + r.damage, 0) || 1;
      for (const r of rewards) {
        const share = r.damage / totalDmg;
        const exp = Math.round((cfg.reward.exp || 0) * share);
        const gold = Math.round((cfg.reward.gold || 0) * share);
        const lines = [`용의 징표 ${r.count}개`];
        if (exp) lines.push(`경험치 ${exp.toLocaleString()}`);
        if (gold) lines.push(`골드 ${gold.toLocaleString()}`);
        await sendMail(r.id, {
          from: '포이노 서쪽 절벽',
          subject: `고룡 카르나크 토벌 — ${r.rank}등`,
          body:
            `고룡이 쓰러졌습니다.\n` +
            `당신이 입힌 피해 ${r.damage.toLocaleString()} — ` +
            `참여한 ${rewards.length}명 중 ${r.rank}등(전체의 ${Math.round(share * 100)}%)입니다.\n` +
            `몫으로 ${lines.join(' · ')} 을(를) 보냅니다.`,
          items: [{ id: cfg.reward.item, count: r.count }],
          exp,
          gold,
        });
      }
    }

    return {
      ok: true,
      hp: doc.hp,
      maxHp: doc.maxHp,
      present: doc.hp > 0 && now < at.endsAt,
      downed,
      rewards,
      endsAt: at.endsAt,
      nextAt: at.nextAt,
      top: topDamage(doc.damage, doc.names),
    };
  }

  /**
   * 랭킹을 통째로 지운다 — 새 시즌을 연다.
   *
   * ⚠ 표만 지워서는 안 된다. "처음 잡은 것만 센다" 는 규칙 때문에 각 계정에
   *   firstKill 이 적혀 있고, 그게 남아 있으면 이미 잡아 본 사람은 **다시는
   *   기록을 올릴 수 없다.** 표는 비었는데 아무도 못 채우는 상태가 된다.
   *   그래서 계정마다의 firstKill 도 함께 지운다.
   *
   * 캐릭터·소지품·레벨은 건드리지 않는다. 지우는 것은 '기록' 뿐이다.
   *
   * @param {string[]} [bosses] 이 보스들만 지운다. 비우면 전부.
   * @returns {{ok:boolean, cleared:string[], accounts:number}}
   */
  async function resetRanks(bosses = null) {
    const only = Array.isArray(bosses) && bosses.length ? new Set(bosses) : null;
    const table = await ranks();
    const cleared = [];
    if (only) {
      // 표 몇 개만 지우는 것은 **시즌을 넘기는 게 아니다.** 잘못 올라간 기록을
      // 지우는 손질이므로 시즌 번호도 지난 시즌 표도 건드리지 않는다.
      for (const b of only) if (table[b]) { delete table[b]; cleared.push(b); }
      await store.setDoc('rank', table);
    } else {
      cleared.push(...Object.keys(table));
      const meta = await season();
      const now = Date.now();
      if (meta.locked) {
        // 시즌 고정 — **번호를 안 올린다.** 표만 비우고 지난 시즌도 안 만든다.
        // 있지도 않았던 '지난 시즌' 을 남기면 랭킹 창이 거짓말을 한다.
        await store.setDoc('rank:meta', { ...meta, startedAt: now });
        await store.setDoc('rank', {});
      } else {
        // 전체 초기화 = **시즌 넘기기.** 지금 표를 지난 시즌으로 옮기고 번호를 올린다.
        await store.setDoc('rank:prev', table);
        await store.setDoc('rank:meta', {
          season: meta.season + 1,
          startedAt: now,
          prevSeason: meta.season,
          prevStartedAt: meta.startedAt,
          prevEndedAt: now,
          locked: false,
        });
        await store.setDoc('rank', {});
      }
    }

    // 계정마다 적힌 '처음 잡은 시각'도 함께 지운다.
    let touched = 0;
    const ids = typeof store.ids === 'function' ? await store.ids() : [];
    for (const id of ids) {
      const acct = await store.get(id);
      if (!acct || !acct.firstKill || typeof acct.firstKill !== 'object') continue;
      const next = { ...acct.firstKill };
      let changed = false;
      for (const b of Object.keys(next)) {
        if (only && !only.has(b)) continue;
        delete next[b];
        changed = true;
      }
      if (!changed) continue;
      await store.set(id, { ...acct, firstKill: next });
      touched++;
    }
    const after = await season();
    return { ok: true, cleared, accounts: touched, season: after.season, locked: after.locked };
  }

  /**
   * 새 시즌 — **모든 사람을 캐릭터를 갓 만든 상태로 되돌린다.**
   *
   * 지우는 것과 남기는 것을 분명히 한다.
   *   지운다  세이브(레벨·소지품·장비·퀘스트) · 우편함 · 처음 잡은 기록
   *   남긴다  계정 자체(아이디·비밀번호·이름). 다시 만들 필요가 없어야 한다.
   *
   * 되돌린 계정에는 `seasonNotice` 를 적어 둔다. 지금 접속 중인 사람은 서버가
   * 바로 알려 주지만, 자고 있던 사람은 다음에 들어올 때 이 표시를 보고
   * "다음 시즌이 시작되었습니다" 를 읽는다 — 그 사람에게는 그때가 시즌의 시작이다.
   *
   * @returns {{ok:boolean, accounts:number, season:number}}
   */
  async function resetAllSaves() {
    const meta = await season();
    const ids = typeof store.ids === 'function' ? await store.ids() : [];
    let touched = 0;
    for (const id of ids) {
      const acct = await store.get(id);
      if (!acct) continue;
      await store.set(id, {
        ...acct,
        save: null,
        mail: [],
        firstKill: {},
        seasonNotice: meta.season,
      });
      touched++;
    }
    return { ok: true, accounts: touched, season: meta.season, locked: meta.locked };
  }

  /** 이 사람이 아직 못 본 시즌 알림이 있으면 알려 주고, 지운다(한 번만 보여 준다). */
  async function takeSeasonNotice(id) {
    const acct = await store.get(id);
    if (!acct || !acct.seasonNotice) return null;
    const n = acct.seasonNotice;
    const next = { ...acct };
    delete next.seasonNotice;
    await store.set(id, next);
    return n;
  }

  return {
    mailbox, sendMail, claimMail, deleteMail, clearAllMail, deleteAccount,
    events, addEvent, pullEvents,
    ranks, prevRanks, season, submitRank, board, resetRanks, setSeason, lockSeason,
    resetAllSaves, takeSeasonNotice,
    dragonState, hitDragon,
  };
}

/** 피해를 많이 준 순서. 화면에 그대로 뿌릴 수 있는 모양으로. */
function topDamage(damage, names = {}, limit = 5) {
  return Object.entries(damage || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, dmg], i) => ({ rank: i + 1, id, name: names[id] || id, damage: dmg }));
}

/**
 * 기여도에 따라 몫을 나눈다.
 *   1등 3개 · 2등 2개 · 나머지 1개.
 * 한 대라도 때린 사람은 빈손으로 돌아가지 않는다 — 그래야 여럿이 달려든다.
 *
 * @param {object} names { id: 화면에 쓸 이름 } — 없으면 id 를 그대로 쓴다.
 *   토벌 결과창이 이 이름을 그대로 뿌리므로, 빠뜨리면 "undefined 1등"이 뜬다.
 */
function shareRewards(damage, reward, names = {}) {
  const { first = 3, second = 2, rest = 1 } = reward || {};
  return Object.entries(damage || {})
    .filter(([, dmg]) => dmg > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id, dmg], i) => ({
      id,
      name: names[id] || id,
      rank: i + 1,
      damage: dmg,
      count: i === 0 ? first : i === 1 ? second : rest,
    }));
}

module.exports = { createWorld, topDamage, shareRewards, sanitizeMail, RANK_SHOW, RANK_MAX, MAIL_MAX };
