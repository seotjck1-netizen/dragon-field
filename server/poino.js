/**
 * 포이노(poinolunch) 주말의 게임 — 기록을 포이노의 Firebase 에 올린다 (0.80.27).
 *
 * 사용자(2026-11-22): 「주말의 게임으로 등록, 첫 주엔 5단계 보스 타임어택, 2주는 20레벨, 3주는 탑 최고층」.
 * 포이노는 토·일에 드래곤필드를 '주말의 게임'으로 띄우고, 이 서버가 쓴 기록으로 순위를 매겨 다음 평일에 정산한다.
 * 어느 주말에 무엇을 겨루는지는 포이노가 정한다(src/beta/plans.js weekendMetric) — 여기서는 **주말 동안 생긴 세 기록을 다** 올린다.
 *
 *   leaderboards/dragonfield_weekend/{토요일 YYYY-MM-DD}/{boss5 | lv20 | tower}/{포이노 닉네임}
 *     boss5  { ms, at, cls, level }   악마 정찰대장(5단계 보스)을 처음 눕히기까지 — 접속해 있던 시간(playclock)
 *     lv20   { ms, at, cls, level }   캐릭터를 만들고 처음 Lv.20 이 되기까지 — 접속해 있던 시간
 *     tower  { floor, at, cls, level } 주말 동안 끝없는 탑에서 오른 가장 높은 층
 *
 * ── 믿음 ────────────────────────────────────────────────
 * 값은 **이 서버가 잰 것**만 올린다(시간은 playclock, 층은 tower.clear 가 받아 준 층). 브라우저가 Firebase 에 직접 쓰면
 * 콘솔 한 줄로 1초 기록이 올라간다 — 그래서 포이노 규칙은 이 칸을 이 서버의 이메일 계정에만 열어 둔다(database.rules.json).
 * 운영자는 오르지 않는다. 포이노 닉네임은 게임 안에서 한 번 물어 계정에 적은 것(/api/poino/link)만 쓴다.
 *
 * ── 켜기 ────────────────────────────────────────────────
 * 환경변수 넷이 다 있어야 켜진다(없으면 아무것도 안 한다 — 게임은 그대로):
 *   POINO_FB_API_KEY · POINO_FB_EMAIL · POINO_FB_PASSWORD · POINO_FB_DB_URL
 *   (시험용) POINO_FB_AUTH_URL — identitytoolkit 대신 가짜 서버 · POINO_CLOCK_SHIFT_MS — 주말 판단에 쓰는 시계를 민다
 * 실패해도 게임 요청은 막지 않는다 — 로그만 남긴다.
 */
const KST = 9 * 3600 * 1000;
const DAY = 86400000;

/** 그 순간이 한국 시각 토 · 일이면 그 주말의 토요일(YYYY-MM-DD), 아니면 null. */
function weekendSatOf(now) {
  const k = new Date(now + KST);
  const dow = k.getUTCDay();
  if (dow !== 6 && dow !== 0) return null;
  return new Date(now + KST - (dow === 0 ? DAY : 0)).toISOString().slice(0, 10);
}

/** 포이노 닉네임으로 쓸 수 있는가 — Firebase 키에 못 쓰는 글자(. $ # [ ] /)와 길이. */
function cleanName(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 20) return null;
  if (/[.$#[\]/\u0000-\u001f\u007f]/.test(s)) return null;
  return s;
}

const BETTER = {
  boss5: (a, b) => a.ms < b.ms,
  lv20: (a, b) => a.ms < b.ms,
  tower: (a, b) => a.floor > b.floor,
};

/**
 * @param {{store:object, env?:object, fetchImpl?:Function, now?:()=>number, log?:Function}} opts
 */
function createPoino({ store, env = process.env, fetchImpl = globalThis.fetch, now = null, log = console.log } = {}) {
  // 0.80.28 — 앞뒤 빈칸 · 줄바꿈은 지운다(Render 화면에 붙여 넣다 딸려 오면 로그인이 안 된다)
  const KEY = String(env.POINO_FB_API_KEY || '').trim();
  const EMAIL = String(env.POINO_FB_EMAIL || '').trim();
  const PASS = String(env.POINO_FB_PASSWORD || '').trim();
  const DB = String(env.POINO_FB_DB_URL || '').trim().replace(/\/+$/, '');
  const AUTH = String(env.POINO_FB_AUTH_URL || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');
  const shift = Number(env.POINO_CLOCK_SHIFT_MS) || 0;
  const clock = now || (() => Date.now() + shift);
  const enabled = !!(KEY && EMAIL && PASS && DB && fetchImpl);
  let token = null;
  let tokenUntil = 0;

  async function idToken() {
    if (token && clock() < tokenUntil) return token;
    const r = await fetchImpl(`${AUTH}/v1/accounts:signInWithPassword?key=${encodeURIComponent(KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASS, returnSecureToken: true }),
    });
    if (!r.ok) throw new Error(`포이노 로그인 실패 ${r.status}${await why(r)}`);
    const j = await r.json();
    token = j.idToken;
    tokenUntil = clock() + Math.max(60, (Number(j.expiresIn) || 3600) - 120) * 1000;
    return token;
  }

  /**
   * 기록 하나. 주말이 아니거나 · 연결이 없거나 · 더 나은 기록이 이미 있으면 올리지 않는다.
   * @param {object} acct  계정(poino · save · name)
   * @param {'boss5'|'lv20'|'tower'} metric
   * @param {object} rec   { ms } 또는 { floor }
   */
  async function record(acct, metric, rec) {
    if (!enabled || !acct || !BETTER[metric]) return { ok: false, skipped: 'off' };
    const name = cleanName(acct.poino);
    if (!name) return { ok: false, skipped: 'nolink' };
    const at = clock();
    const sat = weekendSatOf(at);
    if (!sat) return { ok: false, skipped: 'weekday' };
    const save = acct.save || {};
    const row = { ...rec, at, cls: String(save.classId || ''), level: Math.max(1, Math.floor(Number(save.level) || 1)) };
    // 더 나은 것만 — 서버가 올린 것을 따로 적어 두고 견준다(포이노를 다시 읽지 않는다)
    const docKey = `poinowk:${sat}`;
    const doc = (await store.getDoc(docKey)) || {};
    const prev = doc[metric] && doc[metric][name];
    if (prev && !BETTER[metric](row, prev)) return { ok: true, kept: true, sat };
    const t = await idToken();
    const url = `${DB}/leaderboards/dragonfield_weekend/${sat}/${metric}/${encodeURIComponent(name)}.json?auth=${encodeURIComponent(t)}`;
    const r = await fetchImpl(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
    if (!r.ok) throw new Error(`포이노에 못 썼습니다 ${r.status}${await why(r)}`);
    doc[metric] = { ...(doc[metric] || {}), [name]: row };
    await store.setDoc(docKey, doc);
    log(`✓ 포이노 주말 기록 — ${name} ${metric} ${rec.ms != null ? `${Math.round(rec.ms / 1000)}초` : `${rec.floor}층`} (${sat})`);
    return { ok: true, sat, row };
  }

  /** 기다리지 않고 올린다 — 실패해도 게임 요청은 그대로 끝난다. */
  function fire(acct, metric, rec) {
    if (!enabled) return;
    record(acct, metric, rec).catch((err) => log(`⚠ 포이노 주말 기록 — ${err.message}`));
  }

  /**
   * 운영자 창 「포이노 연결 시험」(0.80.28) — 주말이 아니어도 환경변수 · 로그인 · DB 쓰기를 확인한다.
   * leaderboards/dragonfield_weekend/_test 에 시각 하나를 썼다가 바로 지운다(포이노는 날짜 칸만 읽는다).
   * @returns {Promise<{ok:boolean, message:string}>}
   */
  async function test() {
    const missing = Object.entries({ POINO_FB_API_KEY: KEY, POINO_FB_EMAIL: EMAIL, POINO_FB_PASSWORD: PASS, POINO_FB_DB_URL: DB })
      .filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) return { ok: false, message: `Render 환경변수가 비어 있습니다 — ${missing.join(' · ')}` };
    if (!fetchImpl) return { ok: false, message: '이 서버의 Node 에 fetch 가 없습니다(Node 18 이상).' };
    token = null; // 들고 있던 열쇠 말고 지금 값으로 새로 로그인해 본다
    try {
      await idToken();
    } catch (err) {
      const m = err.message;
      const hint = /API key|API_KEY/i.test(m) ? 'POINO_FB_API_KEY(웹 API 키)를 확인하세요.'
        : /referer|blocked|403/i.test(m) ? 'Google Cloud 에서 이 API 키를 웹사이트 주소로 제한해 두었습니다.'
          : /DISABLED|NOT_ALLOWED/i.test(m) ? 'Firebase Authentication 에서 이메일/비밀번호 로그인을 켜 주세요.'
            : /fetch failed|ENOTFOUND|ECONN/i.test(m) ? '서버가 Google 로그인 주소에 닿지 못했습니다.'
              : 'POINO_FB_EMAIL · POINO_FB_PASSWORD 가 Firebase 에 만든 사용자와 같은지 확인하세요.';
      return { ok: false, message: `${m} — ${hint}` };
    }
    const url = `${DB}/leaderboards/dragonfield_weekend/_test.json?auth=${encodeURIComponent(token)}`;
    try {
      const w = await fetchImpl(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ at: clock() }) });
      if (!w.ok) {
        const hint = w.status === 401 || w.status === 403
          ? `DB 규칙의 이메일이 POINO_FB_EMAIL(${EMAIL})과 같은지, 규칙을 게시했는지 확인하세요.`
          : 'POINO_FB_DB_URL(Realtime Database 주소)을 확인하세요.';
        return { ok: false, message: `로그인은 됐지만 DB 에 못 썼습니다 ${w.status}${await why(w)} — ${hint}` };
      }
      await fetchImpl(url, { method: 'DELETE' }).catch(() => null);
    } catch (err) {
      return { ok: false, message: `로그인은 됐지만 DB 주소에 닿지 못했습니다(${err.message}) — POINO_FB_DB_URL 을 확인하세요.` };
    }
    return { ok: true, message: `연결됐습니다 — ${EMAIL} 로 로그인해 포이노 DB 에 시험 기록을 썼다 지웠습니다. 주말 기록이 올라갑니다.` };
  }

  return { enabled, record, fire, test, weekendSatOf, cleanName };
}

/** Firebase 가 돌려준 실패 까닭(있으면) — 「 (INVALID_LOGIN_CREDENTIALS)」 처럼 붙인다. 비밀번호 · 열쇠는 들어 있지 않다. */
async function why(r) {
  try {
    const j = await r.json();
    const m = j && j.error && (j.error.message || j.error);
    return m ? ` (${String(m).slice(0, 120)})` : '';
  } catch { return ''; }
}

module.exports = { createPoino, weekendSatOf, cleanName };
