// 책임: 구글 시트의 **계정** 탭을 보고, 거기서 사라진 줄의 계정을 나중에 지운다 (0.64).
// 금지: 게임 규칙, 표(items/monsters/…) 처리 → 그건 server/sheetsync.js 의 몫이다.
//
// ── 무엇을 하나 ────────────────────────────────────────────
// 시트 '계정' 탭에서 줄을 지운다  →  24시간 뒤에 그 계정이 실제로 지워진다.
// 그 사이에 줄을 되돌려 놓거나 운영자 창에서 취소하면 없던 일이 된다.
// 지운 뒤에도 휴지통(world.js)에 30일 남는다.
//
// ── 왜 곧바로 안 지우나 ────────────────────────────────────
// 시트는 사람이 손으로 만지는 문서다. 줄을 잘못 지우는 일, 정렬하다 날리는 일,
// 실행 취소를 안 누르고 닫는 일이 다 일어난다. 계정 삭제는 **되돌릴 수 없다** —
// 세이브도, 우편함도, 랭킹 기록도 함께 사라진다.
// 그래서 시트가 하는 말은 '지워라' 가 아니라 **'지울 예정으로 적어 둬라'** 로만 받는다.
// 24시간은 "다음 날 열어 보면 아직 되돌릴 수 있는" 길이다.
//
// ── 안전장치 (전부 있어야 한 줄이라도 지워진다) ─────────────
//   ① SHEET_ACCOUNT_DELETE=1 을 넣어야 돈다. **기본은 꺼져 있다.**
//      시트를 연결했다는 것이 "계정도 지워도 된다" 는 뜻일 리 없다.
//   ② ADMIN_KEY 가 있어야 돈다. 계정을 지우는 다른 모든 길과 같은 자물쇠다.
//   ③ '계정' 탭이 없거나 · 비었거나 · 제목 줄이 다르면 **아무 일도 안 한다.**
//      받다 만 문서를 "전원 삭제" 로 읽는 일이 없어야 한다.
//   ④ 시트에 남은 계정이 서버가 아는 계정의 절반도 안 되면 멈춘다.
//      한꺼번에 그만큼 지우는 것은 사람의 뜻이 아니라 사고다.
//   ⑤ **한 번이라도 시트에서 본 적 있는 아이디만** 예약한다.
//      '지웠다' 는 "있었는데 없어졌다" 이다. 시트에 올린 적 없는 계정
//      (방금 가입한 사람)은 애초에 없어진 것이 아니다.
//   ⑥ 운영자 계정은 절대 안 지운다.
//   ⑦ 한 번에 최대 20개까지만 예약한다.
//   ⑧ **경고 우편이 나간 지 유예만큼 지나야** 지운다. 기한 계산이 망가져도
//      우편 없이 사라지는 일은 없다.
//
// 실제로 지우는 일은 world.deleteAccount 가 한다 — 운영자 창이 쓰는 것과 같은 함수라
// 랭킹·우편함까지 같은 방식으로 정리된다.

const HEAD_FIRST = '아이디'; // '계정' 탭의 첫 칸. 이게 아니면 그 탭이 아니다.
const TAB = '계정';

/** 예약해 두고 기다리는 시간. **24시간.** */
const GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * 아무리 짧게 잡아도 이보다는 기다린다. 1시간.
 *
 * 왜 바닥을 두나 (0.64.2 — 실제로 사고가 났다):
 *   유예를 **밀리초**로 받았다. 그래서 `SHEET_ACCOUNT_GRACE_MS=24` 라고 적으면
 *   "24시간" 이 아니라 **24밀리초**가 된다. 다음 확인(5분 뒤)에 그대로 지워졌다.
 *   사람이 적는 값의 단위를 틀리는 것은 막을 수 없다 — 그렇다면 **틀려도
 *   되돌릴 수 있는 시간**은 남아야 한다. 그보다 짧게 적히면 잘라 내고 크게 알린다.
 */
const MIN_GRACE_MS = 60 * 60 * 1000;

/** 한 번에 예약할 수 있는 최대 개수. 이보다 많으면 사고로 본다. */
const MAX_PER_PASS = 20;

/** 시트에 남은 계정이 서버 계정의 이 비율보다 적으면 멈춘다. */
const MIN_KEEP_RATIO = 0.5;

/** 예약과 '전에 본 아이디' 를 함께 담아 두는 store 문서 이름. */
const DOC = 'acctsync';

/**
 * 유예 시간을 정한다.
 *
 * 이제 **시간(hour)** 으로 받는다 — `SHEET_ACCOUNT_GRACE_HOURS=24`.
 * 밀리초로 적던 옛 이름(`SHEET_ACCOUNT_GRACE_MS`)도 계속 읽지만,
 * 둘 다 **바닥(1시간) 밑으로는 안 내려간다.**
 *
 * @returns {{ms:number, clamped:boolean, raw:string}}
 */
function graceOf(env) {
  const hours = String(env.SHEET_ACCOUNT_GRACE_HOURS ?? '').trim();
  const ms = String(env.SHEET_ACCOUNT_GRACE_MS ?? '').trim();
  let want = GRACE_MS;
  let raw = '';
  if (hours) { want = Number(hours) * 3600000; raw = `SHEET_ACCOUNT_GRACE_HOURS=${hours}`; }
  else if (ms) { want = Number(ms); raw = `SHEET_ACCOUNT_GRACE_MS=${ms}`; }
  if (!Number.isFinite(want) || want <= 0) return { ms: GRACE_MS, clamped: !!raw, raw };
  if (want < MIN_GRACE_MS) return { ms: MIN_GRACE_MS, clamped: true, raw };
  return { ms: want, clamped: false, raw };
}

function config(env = process.env) {
  const g = graceOf(env);
  return {
    on: /^(1|on|true|yes|예)$/i.test(String(env.SHEET_ACCOUNT_DELETE || '').trim()),
    adminKey: String(env.ADMIN_KEY || '').trim(),
    graceMs: g.ms,
    // 적어 준 값이 너무 짧아 잘라 냈는가 — 서버 시작 로그가 이걸 크게 알린다.
    graceClamped: g.clamped,
    graceRaw: g.raw,
  };
}

/** 켜져 있고 자물쇠도 있는가. 둘 다여야 한 줄이라도 움직인다. */
function enabled(env = process.env) {
  const c = config(env);
  return c.on && !!c.adminKey;
}

/**
 * '계정' 탭에서 아이디만 뽑는다.
 * @returns {{ok:true, ids:Set<string>}|{ok:false, why:string}}
 */
function idsFromTab(rows) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return { ok: false, why: `'${TAB}' 탭이 없거나 비어 있습니다.` };
  }
  const head = String((rows[0] || [])[0] || '').replace(/^﻿/, '').trim();
  if (head !== HEAD_FIRST) {
    return { ok: false, why: `'${TAB}' 탭의 첫 칸이 '${HEAD_FIRST}' 가 아닙니다(지금 '${head}').` };
  }
  const ids = new Set();
  for (const row of rows.slice(1)) {
    const id = String((row || [])[0] == null ? '' : row[0]).trim();
    if (id) ids.add(id);
  }
  return { ok: true, ids };
}

/** store 에 적어 둔 것 — { seen: string[], pending: { id: dueAtMs } } */
async function readDoc(store) {
  let doc = null;
  try {
    doc = await store.getDoc(DOC);
  } catch {
    doc = null;
  }
  return {
    seen: Array.isArray(doc && doc.seen) ? doc.seen.map(String) : [],
    pending: (doc && doc.pending && typeof doc.pending === 'object') ? { ...doc.pending } : {},
    // 언제 경고 우편을 보냈나. 지우기 전의 두 번째 브레이크다(runOnce ⑧ 참고).
    warned: (doc && doc.warned && typeof doc.warned === 'object') ? { ...doc.warned } : {},
  };
}

async function writeDoc(store, doc) {
  await store.setDoc(DOC, doc);
}

/** 지금 예약되어 있는 것들 — 운영자 창이 보여 줄 모양으로. */
async function pendingList(store, now = Date.now()) {
  const doc = await readDoc(store);
  return Object.entries(doc.pending)
    .map(([id, dueAt]) => ({ id, dueAt: Number(dueAt) || 0, leftMs: (Number(dueAt) || 0) - now }))
    .sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * 예약을 손으로 푼다(운영자 창). 지워진 것은 못 되돌린다 — 예약만 푼다.
 *
 * ⚠ 푼 것은 **다음 확인에 되살아나지 않는다.** 시트에는 여전히 그 줄이 없지만,
 *   ⑤('전에 시트에서 본 적 있는 것만') 의 목록에서도 이미 빠졌기 때문이다.
 *   이건 사고가 아니라 뜻한 바다 — 5분 뒤에 다시 걸릴 예약이면 '되돌리기' 는
 *   유예가 아니라 눈속임이다. 정말 지우려면 시트에 넣었다 다시 빼거나,
 *   운영자 창 → 계정 에서 곧바로 지운다.
 *   (/tmp/acctsync.js 가 이 성질을 재고 있다 — 바꾸려면 그 시험부터 고칠 것)
 */
async function cancel(store, ids) {
  const doc = await readDoc(store);
  const gone = [];
  for (const raw of ids || []) {
    const id = String(raw || '').trim();
    if (!id || doc.pending[id] == null) continue;
    delete doc.pending[id];
    gone.push(id);
  }
  if (gone.length) await writeDoc(store, doc);
  return gone;
}

/** 몇 시간 남았는지 사람이 읽는 말로. */
function leftText(ms) {
  const h = Math.round(Math.max(0, ms) / 3600000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return h % 24 ? `${d}일 ${h % 24}시간` : `${d}일`;
  }
  return h > 0 ? `${h}시간` : '곧';
}

/**
 * 지울 예정이라고 **당사자에게 알린다** (0.64.2).
 *
 * 왜 필요한가: 계정이 사라진 사람은 무슨 일이 있었는지 알 길이 없다.
 * 접속해 보니 없더라, 가 전부다. 적어도 "언제, 왜, 어떻게 하면 되는지" 는
 * 미리 손에 쥐고 있어야 한다.
 *
 * 겸해서 이 우편은 **두 번째 브레이크**다 — 이게 나간 지 유예만큼 지나야
 * 실제로 지워진다(runOnce ⑧). 기한 계산이 어떤 이유로 망가져도,
 * 우편 없이 사라지는 일은 없다.
 *
 * @returns {Promise<boolean>} 실제로 보냈는가
 */
async function warn(world, id, dueAt, now) {
  if (!world || typeof world.sendMail !== 'function') return false;
  try {
    await world.sendMail(id, {
      from: '운영자',
      subject: '이 계정이 삭제될 예정입니다',
      body:
        '운영자의 계정 목록에서 이 아이디가 빠졌습니다.\n'
        + `${leftText(dueAt - now)} 뒤에 계정이 지워집니다 — 캐릭터·소지품·우편·랭킹 기록까지 함께 사라집니다.\n\n`
        + '잘못된 것이라면 운영자에게 알려 주세요. 지워지기 전이라면 되돌릴 수 있습니다.',
      days: 30,
    });
    return true;
  } catch {
    // 우편을 못 넣었다고 해서 이 확인 전체가 멈출 이유는 없다.
    // 다만 **안 보냈으면 안 지운다** — 그건 runOnce ⑧ 이 지킨다.
    return false;
  }
}

// 휴지통은 **world 가 들고 있다** (0.64.3).
//   지우는 함수(world.deleteAccount)가 한 곳뿐이므로 되돌릴 거리도 거기서 챙긴다.
//   여기서 따로 챙기면 운영자 창에서 지운 것은 빠진다 — 0.64.2 에 실제로 그랬다.

/**
 * 시트를 한 번 보고, 예약을 걸거나 풀거나 실행한다.
 *
 * @param {object} deps
 *   store    계정 저장소 (ids/get/getDoc/setDoc)
 *   world    world.deleteAccount 를 가진 것
 *   fetchTab '계정' 탭 줄들을 돌려주는 함수 (통합문서를 이미 받아 뒀으면 그걸 준다)
 *   adminId  운영자 아이디 — 절대 안 지운다
 *   env      환경변수
 *   now      지금 시각(시험에서 옮겨 끼운다)
 * @returns {Promise<object>} 무슨 일이 있었는지
 */
async function runOnce({ store, world, fetchTab, adminId = 'admin', env = process.env, now = Date.now() }) {
  const cfg = config(env);
  if (!cfg.on) return { ok: false, skipped: 'off', why: 'SHEET_ACCOUNT_DELETE 가 꺼져 있습니다.' };
  if (!cfg.adminKey) return { ok: false, skipped: 'no-key', why: 'ADMIN_KEY 가 없습니다.' };
  if (typeof store.ids !== 'function') {
    return { ok: false, skipped: 'no-ids', why: '이 저장소는 계정 목록을 셀 수 없습니다.' };
  }

  let rows;
  try {
    rows = await fetchTab();
  } catch (err) {
    return { ok: false, skipped: 'fetch', why: err.message };
  }

  const parsed = idsFromTab(rows);
  if (!parsed.ok) return { ok: false, skipped: 'tab', why: parsed.why };
  const sheetIds = parsed.ids;

  const serverIds = (await store.ids()).map(String);
  // ④ 시트가 서버 계정의 절반도 안 담고 있으면 멈춘다.
  //    ("계정 탭을 아직 안 올렸다" 와 "다 지웠다" 는 시트만 봐서는 구별되지 않는다)
  const kept = serverIds.filter((id) => sheetIds.has(id)).length;
  if (serverIds.length && kept < serverIds.length * MIN_KEEP_RATIO) {
    return {
      ok: false,
      skipped: 'too-few',
      why: `시트에 서버 계정 ${serverIds.length}개 중 ${kept}개만 있습니다. `
        + '계정 탭을 새로 떠서 올린 뒤 다시 보겠습니다(아무것도 지우지 않았습니다).',
    };
  }

  const doc = await readDoc(store);
  const seen = new Set(doc.seen);

  const scheduled = [];
  const cancelled = [];
  const deleted = [];
  const failed = [];
  /** 기한을 못 읽어서 새로 잡아 준 것들. 있으면 로그에 남긴다 — 조용하면 안 된다. */
  const repaired = [];

  // ── 예약 걸기 ──
  // ⑤ 전에 시트에서 본 적 있는 아이디만. 방금 가입한 사람은 '없어진' 것이 아니다.
  const missing = serverIds.filter(
    (id) => id !== adminId && !sheetIds.has(id) && seen.has(id) && doc.pending[id] == null
  );
  if (missing.length > MAX_PER_PASS) {
    return {
      ok: false,
      skipped: 'too-many',
      why: `한 번에 ${missing.length}개가 사라졌습니다(최대 ${MAX_PER_PASS}). `
        + '사고로 보고 아무것도 예약하지 않았습니다.',
    };
  }
  for (const id of missing) {
    doc.pending[id] = now + cfg.graceMs;
    scheduled.push({ id, dueAt: doc.pending[id] });
    // 당사자에게 알린다. **이 우편이 곧 두 번째 브레이크다** — 아래 참고.
    const sent = await warn(world, id, doc.pending[id], now);
    if (!doc.warned) doc.warned = {};
    if (sent) doc.warned[id] = now;
  }

  // ── 예약 풀기 — 줄이 돌아왔거나, 계정이 이미 없어졌다 ──
  for (const id of Object.keys(doc.pending)) {
    if (sheetIds.has(id) || !serverIds.includes(id)) {
      delete doc.pending[id];
      // 알림 기록도 함께 지운다. 안 그러면 나중에 다시 예약됐을 때
      // **옛날 우편**을 근거로 유예 없이 지워질 수 있다.
      if (doc.warned) delete doc.warned[id];
      cancelled.push(id);
    }
  }

  // ── 때가 된 것만 실제로 지운다 ──
  //
  // ⚠ **모르는 값은 '기다린다' 로 읽는다** (0.64.2 — 실제로 사고가 났다).
  //   예전에는 `now < (Number(dueAt) || 0)` 이었다. dueAt 이 숫자가 아니면
  //   (빈 칸 · 'NaN' · 객체 — 저장소를 오가며 얼마든지 생긴다) `|| 0` 이 0 으로
  //   만들었고, `now < 0` 은 거짓이라 **그 자리에서 지웠다.**
  //   기한을 모르는 것은 '지금이 그때다' 가 아니라 '아직 모른다' 이다.
  //   모르면 기한을 새로 잡아 두고, 이번에는 넘어간다.
  for (const [id, dueAt] of Object.entries(doc.pending)) {
    const due = Number(dueAt);
    if (!Number.isFinite(due) || due <= 0) {
      doc.pending[id] = now + cfg.graceMs;
      repaired.push(id);
      continue;
    }
    if (now < due) continue;
    if (id === adminId) { delete doc.pending[id]; continue; } // ⑥ 두 번 막는다

    // ⑧ **알리지 않았으면 안 지운다** (0.64.2).
    //
    //   기한 하나만 보고 지우면, 그 기한을 잘못 만든 어떤 사고든 곧바로
    //   삭제가 된다(실제로 그렇게 두 계정이 날아갔다). 그래서 서로 다른 곳에서
    //   오는 브레이크를 하나 더 둔다 — **"경고 우편이 나간 지 유예만큼 지났는가."**
    //   우편은 예약을 걸 때 보내지므로, 이 둘이 다 지나려면 진짜로 시간이 흘러야 한다.
    //   우편을 아직 못 보냈으면(우편함이 막혔든 뭐든) 이번엔 보내고 넘어간다.
    const warnedAt = Number((doc.warned || {})[id]);
    if (!Number.isFinite(warnedAt) || warnedAt <= 0) {
      const sent = await warn(world, id, due, now);
      if (!doc.warned) doc.warned = {};
      if (sent) doc.warned[id] = now;
      repaired.push(id);
      continue;
    }
    if (now - warnedAt < cfg.graceMs) continue;
    let res;
    try {
      // 되돌릴 거리는 world.deleteAccount 가 챙긴다(휴지통).
      res = await world.deleteAccount(id);
    } catch (err) {
      failed.push({ id, reason: err.message });
      continue;
    }
    delete doc.pending[id];
    if (doc.warned) delete doc.warned[id];
    if (res && res.ok) deleted.push({ id: res.id, name: res.name });
    else failed.push({ id, reason: (res && res.reason) || '알 수 없음' });
  }

  // 이번에 시트에서 본 아이디를 '본 적 있음' 에 더한다.
  // 서버에 없는 아이디는 굳이 안 들고 있는다 — 끝없이 늘어날 이유가 없다.
  const nextSeen = new Set([...sheetIds].filter((id) => serverIds.includes(id)));
  doc.seen = [...nextSeen];

  await writeDoc(store, doc);

  return {
    ok: true,
    sheetCount: sheetIds.size,
    serverCount: serverIds.length,
    graceMs: cfg.graceMs,
    scheduled,
    cancelled,
    deleted,
    failed,
    repaired,
    pending: Object.entries(doc.pending).map(([id, dueAt]) => ({ id, dueAt: Number(dueAt) || 0 })),
  };
}

module.exports = {
  TAB, GRACE_MS, MIN_GRACE_MS, MAX_PER_PASS, MIN_KEEP_RATIO,
  config, enabled, idsFromTab, runOnce, pendingList, cancel, leftText,
};
