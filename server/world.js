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
  // ── 휴지통 (0.64.3) ────────────────────────────────────────
  //
  // 지운 계정을 며칠 들고 있다가 비운다. 계정 삭제는 되돌릴 수 없는 일이고,
  // 사람이 손으로 고르는 일이라 잘못 고르는 일이 실제로 일어난다.
  //
  // ⚠ 여기 담긴 것에는 **비밀번호 해시가 그대로 들어 있다.** 그래서 store 문서에만
  //   두고, 화면으로는 아이디·레벨·날짜만 내보낸다(trashList 참고).

  /** 휴지통에 담아 두는 날수. */
  const TRASH_DAYS = 30;
  const TRASH_MAX = 200;

  async function trashDoc() {
    const raw = await store.getDoc('trash');
    return Array.isArray(raw) ? raw : [];
  }

  /** 오래된 것을 비우고 새것을 앞에 넣는다. */
  async function toTrash(id, acct, now = Date.now()) {
    const keep = (await trashDoc())
      .filter((t) => t && t.id && now - (Number(t.at) || 0) < TRASH_DAYS * 86400000)
      .filter((t) => t.id !== id);
    keep.unshift({ id, at: now, acct });
    await store.setDoc('trash', keep.slice(0, TRASH_MAX));
  }

  /** 휴지통 목록 — 알맹이는 안 내보낸다. */
  async function trashList(now = Date.now()) {
    return (await trashDoc())
      .filter((t) => t && t.id)
      .map((t) => ({
        id: t.id,
        at: Number(t.at) || 0,
        // 세이브는 납작하다 — save.level 이다(save.player.level 이 아니다).
        level: (t.acct && t.acct.save && t.acct.save.level) || null,
        leftMs: TRASH_DAYS * 86400000 - (now - (Number(t.at) || 0)),
      }))
      .sort((a, b) => b.at - a.at);
  }

  /**
   * 휴지통에서 되살린다.
   *
   * 계정·비밀번호·캐릭터·소지품·골드는 그대로 돌아온다.
   * **랭킹 기록은 안 돌아온다** — 지울 때 표에서 뺐고, 그 사이 다른 사람의 기록이
   * 그 자리를 채웠을 수 있다. 되살리면서 남의 순위를 밀어내는 쪽이 더 나쁘다.
   */
  async function restoreAccount(ids) {
    const list = await trashDoc();
    const restored = [];
    const failed = [];
    let changed = false;
    for (const raw of ids || []) {
      const id = String(raw || '').trim();
      if (!id) continue;
      const found = list.find((t) => t && t.id === id);
      if (!found || !found.acct) { failed.push({ id, reason: '휴지통에 없습니다.' }); continue; }
      if (await store.get(id)) { failed.push({ id, reason: '같은 아이디가 이미 있습니다.' }); continue; }
      await store.set(id, found.acct);
      restored.push(id);
      changed = true;
    }
    if (changed) {
      await store.setDoc('trash', list.filter((t) => !restored.includes(t.id)));
    }
    return { restored, failed, note: '랭킹 기록은 돌아오지 않습니다.' };
  }

  async function deleteAccount(id) {
    const acct = await store.get(id);
    if (!acct) return { ok: false, reason: '없는 계정입니다.' };

    // ⓪ **지우기 전에 통째로 베껴 둔다** (0.64.3).
    //
    //    왜 여기인가: 계정을 지우는 길은 하나가 아니다(운영자 창에서 고르는 길,
    //    시트에서 줄을 지우는 길, 앞으로 생길 길). 되돌릴 거리를 **부르는 쪽마다**
    //    챙기게 하면 언젠가 한 곳이 빠진다 — 실제로 0.64.2 에서 시트 쪽에만 달아
    //    두었다가, 정작 사람이 쓰는 운영자 창 삭제에는 없었다.
    //    지우는 함수는 여기 하나뿐이므로, 여기에 두면 모든 길이 덮인다.
    await toTrash(id, acct);

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

  /**
   * 순위를 매기는 잣대 (0.69).
   *
   *   ① 걸린 시간이 짧은 쪽 (초 단위로만 적힌다 — submitRank 참고)
   *   ② 같은 초면 **레벨이 낮은 쪽**
   *   ③ 그것도 같으면 먼저 올린 쪽
   *
   * ②가 핵심이다. 같은 시간에 끝냈다면 덜 키우고 끝낸 쪽이 더 어려운 길을
   * 간 것이다. 레벨을 모르는 옛 줄은 아주 높은 값으로 쳐서 뒤로 보낸다 —
   * 모르는 것을 유리하게 쳐 주면 새로 도전하는 사람이 이길 수가 없다.
   */
  function byRank(a, b) {
    if (a.ms !== b.ms) return a.ms - b.ms;
    const la = Number.isFinite(a.lv) ? a.lv : 9999;
    const lb = Number.isFinite(b.lv) ? b.lv : 9999;
    if (la !== lb) return la - lb;
    return (a.at || 0) - (b.at || 0);
  }


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
      // ── 시즌 일정 (0.70.5) ──────────────────────────────
      //   endsAt      이번 시즌이 끝나는 시각. 0 이면 끝을 안 정했다(예전과 같음)
      //   gapDays     끝난 뒤 다음 시즌이 열리기까지의 날수. 0 이면 곧바로 연다
      //   endedAt     실제로 끝난 시각. 0 이 아니면 **지금은 쉬는 중**이다
      //   nextStartsAt 다음 시즌이 열릴 시각(쉬는 중일 때만 뜻이 있다)
      endsAt: Number(meta.endsAt) || 0,
      gapDays: Math.max(0, Number(meta.gapDays) || 0),
      endedAt: Number(meta.endedAt) || 0,
      nextStartsAt: Number(meta.nextStartsAt) || 0,
    };
  }

  /**
   * 시즌 일정을 정한다 (0.70.5) — 운영자 창에서 부른다.
   *
   * ── 왜 두 값인가 ──────────────────────────────────────────
   * "언제 끝나나" 와 "다음은 언제 시작하나" 는 다른 물음이다.
   * 끝나자마자 다시 시작해도 되고(gapDays 0), 며칠 쉬었다 열어도 된다.
   * 쉬는 동안에는 **표가 얼어붙는다** — 기록을 더 못 올리고, 지난 시즌 표로
   * 넘어가지도 않는다. 그래야 "끝났다" 가 실제로 끝난 것이 된다.
   *
   * ⚠ 끝을 새로 정하면 `endedAt` 을 지운다. 안 지우면 이미 끝나 있던 시즌이
   *   "끝났는데 끝이 미래" 인 앞뒤 안 맞는 상태로 남는다.
   *
   * @param {number} endsAt 끝나는 시각(ms). 0 이면 끝을 안 정한다.
   * @param {number} gapDays 끝난 뒤 며칠 쉬고 다음 시즌을 여나(0 = 즉시)
   */
  async function setSeasonSchedule(endsAt, gapDays) {
    const m = await store.getDoc('rank:meta');
    const meta = m && typeof m === 'object' ? m : {};
    const at = Math.max(0, Math.round(Number(endsAt) || 0));
    const gap = Math.max(0, Math.min(365, Number(gapDays) || 0));
    await store.setDoc('rank:meta', {
      ...meta,
      endsAt: at,
      gapDays: gap,
      endedAt: 0,
      nextStartsAt: 0,
    });
    return { ok: true, ...(await season()) };
  }

  /**
   * 시계를 한 번 본다 — 끝날 때가 됐나, 다시 열 때가 됐나 (0.70.5).
   *
   * 서버가 이 함수를 이따금 부른다(server.js 의 시즌 시계). 사람이 아무도
   * 접속해 있지 않아도 시각은 흐르므로, 손님 요청에 기대어 굴리면 안 된다.
   *
   * 두 걸음으로 나뉜다:
   *   ① 끝나는 시각이 지났다 → **얼린다.** 표는 그대로 두고 기록만 못 올리게 한다.
   *      (여기서 바로 밀어 버리면 "끝났다" 를 아무도 못 본 채로 새 시즌이 된다)
   *   ② 다시 열 시각이 지났다 → 부르는 쪽에 'start' 를 알린다.
   *      실제로 넘기는 일(표 옮기기·전원 초기화·방송)은 server.js 가 한다 —
   *      그건 방송이 필요한 일이고, 방송은 여기 책임이 아니다.
   *
   * @returns {{action:'none'|'end'|'start', season:object}}
   */
  async function tickSeason(now = Date.now()) {
    const meta = await season();
    if (meta.endedAt) {
      if (meta.nextStartsAt && now >= meta.nextStartsAt) {
        return { action: 'start', season: meta };
      }
      return { action: 'none', season: meta };
    }
    if (meta.endsAt && now >= meta.endsAt) {
      const m = await store.getDoc('rank:meta');
      const raw = m && typeof m === 'object' ? m : {};
      const nextStartsAt = meta.endsAt + meta.gapDays * DAY_MS;
      await store.setDoc('rank:meta', { ...raw, endedAt: meta.endsAt, nextStartsAt });
      return { action: 'end', season: { ...meta, endedAt: meta.endsAt, nextStartsAt } };
    }
    return { action: 'none', season: meta };
  }

  /** 지금 기록을 받을 수 있나 — 쉬는 중이면 안 받는다. */
  async function rankOpen(now = Date.now()) {
    const meta = await season();
    if (meta.endedAt) return { open: false, meta };
    if (meta.endsAt && now >= meta.endsAt) return { open: false, meta };
    return { open: true, meta };
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
      // 일정도 함께 지운다 (0.70.5) — 되돌린 시즌에 옛 끝이 붙어 있으면
      // 1 시즌으로 돌아가자마자 "이미 끝난 시즌" 이 된다.
      endsAt: 0,
      gapDays: Math.max(0, Number(meta.gapDays) || 0),
      endedAt: 0,
      nextStartsAt: 0,
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
   *   잣대는 서버가 쌓아 둔 **접속해 있던 시간**(playclock.js) 하나뿐이다.
   *
   * ⚠ 0.70.2 — 그 전에는 `지금 − 계정을 만든 시각` 이었다(벽시계).
   *   접속을 끊고 자는 동안에도 흘러서, 이어서 하는 사람은 표에 오를 수가 없었다.
   *
   * 첫 기록만 센다 — 다 키운 캐릭터로 다시 잡아 기록을 갈아 치우면
   * "얼마 만에 여기까지 왔나"라는 물음이 사라진다. 이것도 서버가 막는다.
   *
   * @param {number} playedMs 접속해 있는 동안 쌓인 시간(ms). 없으면 잴 수가 없다.
   * @returns {{ok:boolean, rank:number|null, list:Array, ms:number, reason?:string}}
   */
  async function submitRank(bossId, { id, name, cls, level, playedMs, already }, now = Date.now()) {
    if (!playedMs) {
      return { ok: false, reason: '논 시간을 알 수 없어 기록을 남기지 못했습니다.' };
    }
    // 시즌이 끝났으면 **표를 얼린다** (0.70.5).
    //
    // 끝난 뒤에도 기록이 들어오면 "언제까지" 라는 말이 뜻을 잃는다.
    // 마감 1분 전에 눕힌 사람과 마감 한 시간 뒤에 눕힌 사람이 같은 표에 서게 된다.
    // ⚠ 이 판단은 **서버 시계**로 한다 — 손님 시계는 얼마든지 뒤로 돌릴 수 있다.
    const gate = await rankOpen(now);
    if (!gate.open) {
      return {
        ok: false,
        closed: true,
        reason: gate.meta.nextStartsAt > now
          ? '이번 시즌은 끝났습니다. 다음 시즌이 열리면 다시 겨룹니다.'
          : '이번 시즌은 끝났습니다.',
        season: gate.meta,
      };
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

    // ⚠ **초 아래는 안 적는다** (0.69).
    //
    //   밀리초까지 적으면 같은 초에 끝낸 두 사람의 순서가 **1000분의 1초**로
    //   갈린다. 그건 실력이 아니라 그날 서버가 얼마나 바빴는지다.
    //   초로 자르면 "4분 12초" 가 같은 사람들이 생기는데, 그 안에서는
    //   **레벨이 낮은 쪽이 위**다(아래 정렬) — 덜 키우고 이긴 쪽이 더 어렵다.
    const ms = Math.max(1000, Math.floor(playedMs / 1000) * 1000);
    const lv = Math.max(1, Math.floor(Number(level) || 1));

    // 여러 번 도전한 사람 — **더 나은 쪽만 남긴다** (0.68).
    //
    //   '다시 도전'(restartAccount)이 생기면서 같은 사람이 같은 보스로 두 번
    //   올릴 수 있게 됐다. 그냥 덮어쓰면 **느리게 끝낸 도전이 잘 나온 기록을
    //   지운다.** 그러면 다시 도전하는 것이 손해라, 있으나 마나 한 기능이 된다.
    //   순위표는 '그 사람이 낸 가장 빠른 기록'을 적는 곳이다.
    const before = list.find((r) => r.id === id);
    // '더 나은 쪽' 은 시간이 먼저고, **같은 초면 레벨이 낮은 쪽**이다.
    const better = !before || ms < before.ms || (ms === before.ms && lv < (before.lv || 999));
    const keep = better ? { ms, lv } : { ms: before.ms, lv: before.lv || lv };
    const beat = better;
    const next = list
      .filter((r) => r.id !== id)
      // 이름·직업은 **이번 도전의 것**으로 새로 적는다(기록 시각도).
      // 남는 것은 더 나은 쪽의 시간과 레벨이다.
      .concat([{
        id,
        name: String(name || id).slice(0, 12),
        // 직업 표시 — 화면에 마크로 그린다. 모르면 안 적는다(옛 줄과 같은 모양).
        cls: cls ? String(cls).slice(0, 16) : undefined,
        lv: keep.lv,
        ms: keep.ms,
        at: now,
      }])
      .sort(byRank)
      .slice(0, RANK_MAX);
    const best = keep.ms;

    table[bossId] = next;
    await store.setDoc('rank', table);
    const at = next.findIndex((r) => r.id === id);
    return {
      ok: true, first: true,
      // ms 는 **이번 도전에 걸린 시간**이다(화면에 "이번 기록"으로 보여 준다).
      // best 는 표에 남은 값 — 지난 도전이 더 빨랐으면 그쪽이다.
      ms, best, beat, hadBefore: !!before,
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
      // 읽을 때도 한 번 더 세운다 (0.69).
      //
      // 표는 쓸 때 이미 세워서 넣지만, **0.69 이전에 쌓인 줄**은 시간만 보고
      // 세운 것이라 같은 초에 끝낸 사람들의 순서가 예전 그대로다.
      // 여기서 다시 세우면 옛 기록도 새 잣대(같은 초면 낮은 레벨이 위)로 읽힌다.
      const sorted = list.slice().sort(byRank);
      table[bossId] = sorted.slice(0, RANK_SHOW);
      total[bossId] = sorted.length;
      if (!me) continue;
      const at = sorted.findIndex((r) => r.id === me);
      if (at >= 0) mine[bossId] = { ...sorted[at], rank: at + 1, total: sorted.length };
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
      // ⚠ 새 시즌이 열리면 **지난 일정은 지운다** (0.70.5).
      //   endsAt/endedAt 을 그대로 두면 새 시즌이 열리자마자 "이미 끝난 시즌" 이
      //   되어 첫 기록부터 막힌다. 다음 끝은 운영자가 다시 정한다.
      const clearSchedule = { endsAt: 0, gapDays: meta.gapDays, endedAt: 0, nextStartsAt: 0 };
      if (meta.locked) {
        // 시즌 고정 — **번호를 안 올린다.** 표만 비우고 지난 시즌도 안 만든다.
        // 있지도 않았던 '지난 시즌' 을 남기면 랭킹 창이 거짓말을 한다.
        await store.setDoc('rank:meta', { ...meta, startedAt: now, ...clearSchedule });
        await store.setDoc('rank', {});
      } else {
        // 전체 초기화 = **시즌 넘기기.** 지금 표를 지난 시즌으로 옮기고 번호를 올린다.
        await store.setDoc('rank:prev', table);
        await store.setDoc('rank:meta', {
          season: meta.season + 1,
          startedAt: now,
          prevSeason: meta.season,
          prevStartedAt: meta.startedAt,
          // 끝나는 시각이 정해져 있었다면 **그때** 끝난 것으로 적는다.
          // 서버가 몇 분 늦게 알아챘다고 지난 시즌이 그만큼 길었던 것은 아니다.
          prevEndedAt: meta.endedAt || now,
          locked: false,
          ...clearSchedule,
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
   * **한 사람만** 처음부터 다시 시작한다 — "다시 도전" (0.68).
   *
   * 랭킹이 타임어택(계정이 태어난 순간 → 보스를 눕힌 순간)이라, 한 번 느리게
   * 잡고 나면 그 계정으로는 더 나은 기록을 낼 방법이 없었다. 계정을 새로 만들면
   * 되지만 그러면 아이디가 늘어나고, 지운 계정 자리는 되돌릴 수 없다.
   * 그래서 **계정은 그대로 두고 캐릭터만** 갓 만든 상태로 되돌린다.
   *
   * 되돌리는 것을 빠짐없이 적는다. 하나라도 빠지면 "새로 만든 계정과 같다"가
   * 거짓말이 된다:
   *   · save            — 레벨·소지품·장비·퀘스트·웨이포인트. 통째로 없앤다
   *   · bornAt·playMs   — **시계를 0초로.** 이게 없으면 다시 도전해도 옛 출발선으로 잰다
   *                        (0.70.2 부터 실제로 재는 것은 playMs 다. 둘 다 되돌린다)
   *   · firstKill       — 처음 잡은 기록. 안 지우면 다시 잡아도 기록을 못 올린다
   *   · mail:<id>       — 우편함. 도전 전에 쌓아 둔 물건을 새 캐릭터가 받으면 안 된다
   *   · eventsAt        — 지난 이벤트 선물이 **다시 배달되는 것**을 막는다
   *
   * ⚠ eventsAt 을 빠뜨리면 우편함만 비우는 꼴이 된다. 다음에 우편함을 열 때
   *   이벤트 통(`events`)에서 예전 선물이 통째로 다시 들어온다 —
   *   1레벨 캐릭터가 상급 물약 스무 개를 들고 시작하게 된다.
   *   (clearAllMail 이 같은 이유로 두 곳을 함께 비운다. 같은 함정이다)
   *
   * 남기는 것: 계정 자체(아이디·비밀번호·캐릭터 이름·만든 때)와
   *            **이미 랭킹에 올라간 줄**. 지난 도전의 기록은 그 사람이 낸 것이다.
   *            다음 도전이 더 빠르면 그때 갈아 끼워진다(submitRank 참고).
   *
   * @returns {{ok:boolean, bornAt?:string, restarts?:number, reason?:string}}
   */
  async function restartAccount(id, now = Date.now()) {
    const acct = await store.get(id);
    if (!acct) return { ok: false, reason: '없는 계정입니다.' };

    // 우편함을 비운다. 지우는 쪽이 맞다 — 빈 배열로 두면 기한 청소가 또 돈다.
    if (typeof store.delDoc === 'function') await store.delDoc(`mail:${id}`);
    else await store.setDoc(`mail:${id}`, []);

    // 이벤트 통에서 **지금까지의 것은 이미 받은 것으로** 표시한다.
    // (가장 늦은 이벤트 시각과 지금 중 큰 쪽. 시계가 어긋나도 안전하게)
    const list = await store.getDoc('events');
    const evs = Array.isArray(list) ? list : [];
    const lastAt = evs.reduce((m, e) => Math.max(m, Number(e && e.at) || 0), 0);

    const bornAt = new Date(now).toISOString();
    const next = {
      ...acct,
      save: null,
      bornAt,
      firstKill: {},
      eventsAt: Math.max(lastAt, now),
      restarts: (Number(acct.restarts) || 0) + 1,
      restartedAt: bornAt,
      // 실제로 재는 시계도 0 초로 (0.70.2). bornAt 만 되돌리고 이걸 두면
      // 지난 도전에 쌓아 둔 시간이 그대로 얹힌 채로 다시 시작하게 된다.
      playMs: 0,
      tickAt: bornAt,
    };
    // 시즌 알림이 걸려 있었다면 지운다 — 방금 스스로 되돌렸으니
    // "시즌이 넘어가 초기화되었습니다" 를 또 보여 줄 이유가 없다.
    delete next.seasonNotice;
    await store.set(id, next);
    return { ok: true, bornAt, restarts: next.restarts };
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
    const at = new Date(Date.now()).toISOString();
    for (const id of ids) {
      const acct = await store.get(id);
      if (!acct) continue;
      await store.set(id, {
        ...acct,
        save: null,
        mail: [],
        firstKill: {},
        // 타임어택 시계도 0 초로 (0.70.2).
        //
        // ⚠ 여태 여기서 시계를 안 되돌렸다. "갓 만든 상태로 되돌린다" 고 적어 놓고
        //   시계만 옛 값을 그대로 뒀으니, 새 시즌 첫 기록에 **지난 시즌 내내
        //   놀던 시간이 통째로 얹혔다.** 아무도 눈치채지 못한 것은, 시즌 초기화를
        //   한 번도 진짜로 써 보지 않았기 때문이다.
        bornAt: at,
        playMs: 0,
        tickAt: at,
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
    trashList, restoreAccount, TRASH_DAYS,
    events, addEvent, pullEvents,
    ranks, prevRanks, season, submitRank, board, resetRanks, setSeason, lockSeason,
    setSeasonSchedule, tickSeason, rankOpen,
    resetAllSaves, takeSeasonNotice, restartAccount,
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
