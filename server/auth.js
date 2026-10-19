// 책임: 비밀번호 보관 방식과 세션 토큰, 그리고 요청 횟수 제한.
// 금지: 저장소 접근(server/store.js), 게임 규칙.
//
// ── 왜 이 파일이 생겼나 ────────────────────────────────────
// 예전에는 브라우저가 보낸 SHA-256 해시를 그대로 저장하고, 그 해시를 세션 토큰으로도 썼다.
// 집에서 친구끼리 돌릴 때는 충분했지만 공개 인터넷에 올리려면 두 가지가 걸린다.
//
//   1. 해시가 곧 열쇠다. 저장된 값이 한 번 새면 그대로 로그인에 쓸 수 있다.
//   2. 사람들은 비밀번호를 재사용한다. 원문을 모르더라도 해시를 그대로 두는 건 좋지 않다.
//
// 그래서 서버는 받은 해시를 "한 번 더" 소금(salt)과 함께 천천히 굳혀서 보관하고,
// 로그인에 성공하면 비밀번호와 무관한 토큰을 따로 발급한다.
//
// ── 토큰을 왜 메모리에 안 두나 ─────────────────────────────
// 무료 호스팅은 접속이 없으면 서버를 재운다. 메모리에 세션을 들고 있으면
// 서버가 잠깐 잠들 때마다 모두 로그아웃되고, 자동 저장이 "인증 실패"로 조용히 실패한다.
// 그래서 토큰은 아무 데도 저장하지 않고, 서버 비밀키로 서명해서 스스로 검증한다.

const crypto = require('crypto');

const PBKDF2_ROUNDS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

// ─────────────────────────────────────────────────────────────
// 비밀번호
// ─────────────────────────────────────────────────────────────

/** 브라우저가 보낸 해시를 소금과 함께 한 번 더 굳힌다. */
function derive(clientHash, salt) {
  return crypto
    .pbkdf2Sync(String(clientHash), salt, PBKDF2_ROUNDS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('base64');
}

/** 새 계정에 저장할 비밀번호 항목. */
function makeSecret(clientHash) {
  const salt = crypto.randomBytes(16).toString('base64');
  return { v: 2, salt, pw: derive(clientHash, salt) };
}

/**
 * 비밀번호가 맞는가.
 * 예전 형식(해시를 그대로 저장한 계정)도 받아 주고, 맞으면 새 형식으로 올려야 한다고 알려 준다.
 * @returns {{ok:boolean, upgrade?:object}}
 */
function verifySecret(record, clientHash) {
  if (!record) return { ok: false };

  // 예전 형식 — 저장된 해시와 그대로 비교한다.
  if (record.hash != null && record.pw == null) {
    const a = Buffer.from(String(record.hash));
    const b = Buffer.from(String(clientHash));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    // 맞았다면 이참에 새 형식으로 바꿔 둔다(다음부터는 해시가 그대로 남지 않는다).
    return ok ? { ok: true, upgrade: makeSecret(clientHash) } : { ok: false };
  }

  if (!record.salt || !record.pw) return { ok: false };
  const want = Buffer.from(record.pw);
  const got = Buffer.from(derive(clientHash, record.salt));
  if (want.length !== got.length) return { ok: false };
  return { ok: crypto.timingSafeEqual(want, got) };
}

// ─────────────────────────────────────────────────────────────
// 세션 토큰 (서명식 — 서버가 아무것도 기억하지 않는다)
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} secret 서버 비밀키. 이 값이 바뀌면 발급된 토큰이 전부 무효가 된다.
 */
function tokenFactory(secret) {
  const key = Buffer.from(String(secret));

  function sign(payload) {
    return crypto.createHmac('sha256', key).update(payload).digest('base64url');
  }

  return {
    /** id 앞으로 토큰 하나. 형식: <아이디>.<만료시각>.<서명> */
    issue(id, now = Date.now()) {
      const body = `${Buffer.from(String(id)).toString('base64url')}.${now + TOKEN_TTL_MS}`;
      return `${body}.${sign(body)}`;
    },

    /**
     * 이 토큰이 정말 이 서버가 이 아이디에게 발급한 것인가.
     * @returns {{ok:boolean, reason?:string}}
     */
    verify(token, id, now = Date.now()) {
      if (typeof token !== 'string') return { ok: false, reason: '토큰이 없습니다.' };
      const parts = token.split('.');
      if (parts.length !== 3) return { ok: false, reason: '토큰 형식이 아닙니다.' };

      const [rawId, expiry, sig] = parts;
      const body = `${rawId}.${expiry}`;
      const want = Buffer.from(sign(body));
      const got = Buffer.from(String(sig));
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
        return { ok: false, reason: '토큰이 올바르지 않습니다.' };
      }
      if (Buffer.from(rawId, 'base64url').toString() !== String(id)) {
        return { ok: false, reason: '다른 계정의 토큰입니다.' };
      }
      if (Number(expiry) < now) return { ok: false, reason: '오래된 토큰입니다. 다시 접속하세요.' };
      return { ok: true };
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 요청 횟수 제한
// ─────────────────────────────────────────────────────────────

/**
 * 아주 단순한 창(window) 방식. 공개 서버에 올리면 누군가는 반드시
 * 비밀번호를 기계로 찍어 보거나 계정을 무한정 만들어 본다. 그것만 막으면 된다.
 *
 * 서버가 재시작되면 기록이 사라지지만, 그건 문제가 아니다 —
 * 이 제한은 "한 사람이 쉬지 않고 두드리는 것"을 막는 용도지 장부가 아니다.
 */
function rateLimiter() {
  const hits = new Map(); // 키 → [시각, …]

  return {
    /**
     * @param {string} key 보통 "아이피:행동"
     * @param {number} max 허용 횟수
     * @param {number} windowMs 그 횟수를 세는 시간
     * @returns {{ok:boolean, retryAfterSec?:number}}
     */
    check(key, max, windowMs, now = Date.now()) {
      const since = now - windowMs;
      const list = (hits.get(key) || []).filter((t) => t > since);
      if (list.length >= max) {
        const wait = Math.ceil((list[0] + windowMs - now) / 1000);
        return { ok: false, retryAfterSec: Math.max(1, wait) };
      }
      list.push(now);
      hits.set(key, list);
      return { ok: true };
    },

    /** 오래된 기록을 버린다(가끔 불러 주면 된다). */
    sweep(now = Date.now(), keepMs = 3600000) {
      for (const [key, list] of hits) {
        const alive = list.filter((t) => t > now - keepMs);
        if (alive.length) hits.set(key, alive);
        else hits.delete(key);
      }
    },

    get size() {
      return hits.size;
    },
  };
}

module.exports = { makeSecret, verifySecret, tokenFactory, rateLimiter, TOKEN_TTL_MS };
