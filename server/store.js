// 책임: 계정을 "어디에" 둘지 감춘다. 서버 나머지는 get/set 만 알면 된다.
// 금지: 게임 규칙, 비밀번호 처리(server/auth.js 가 한다).
//
// 두 가지 백엔드가 있다.
//
//   file     server/data/accounts.json — 집이나 사내망에서 내 컴퓨터로 돌릴 때.
//   upstash  Upstash Redis(REST) — 무료 호스팅에 올릴 때.
//
// 무료 호스팅(Render 등)은 15분간 접속이 없으면 서버를 재우고, 깨어날 때
// 파일 시스템을 처음 상태로 되돌린다. 그래서 파일에 저장하면 캐릭터가 통째로 사라진다.
// 바깥 데이터베이스에 두어야 그 문제가 없다.
//
// Upstash 는 REST(그냥 https 요청)로 쓸 수 있어서 라이브러리를 들이지 않아도 된다.
// 이 프로젝트의 "의존성 0개" 원칙을 그대로 지킬 수 있는 이유다.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const WORLD_FILE = path.join(DATA_DIR, 'world.json');
const KEY_PREFIX = 'poino:acct:';
const INDEX_KEY = 'poino:accounts';
const DOC_PREFIX = 'poino:doc:';

// ─────────────────────────────────────────────────────────────
// 파일 백엔드
// ─────────────────────────────────────────────────────────────
function fileStore() {
  let accounts = {};
  try {
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch {
    accounts = {};
  }

  // 계정이 아닌 "세상 전체가 함께 보는 것"들 — 우편함·랭킹·고룡·이벤트.
  // 계정 파일과 섞지 않는다: 계정은 사람마다 하나씩이고 이건 하나뿐이라,
  // 한 파일에 두면 누군가 저장할 때마다 세상 전체를 같이 쓰게 된다.
  let docs = {};
  try {
    docs = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8'));
  } catch {
    docs = {};
  }

  // 쓰기를 몰아서 한다(연속 저장 때 디스크를 계속 두드리지 않게).
  let timer = null;
  function flush() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
      } catch (err) {
        console.error('[store] 계정 파일을 쓰지 못했습니다:', err.message);
      }
    }, 250);
  }

  let docTimer = null;
  function flushDocs() {
    clearTimeout(docTimer);
    docTimer = setTimeout(() => {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(WORLD_FILE, JSON.stringify(docs, null, 2));
      } catch (err) {
        console.error('[store] 세상 파일을 쓰지 못했습니다:', err.message);
      }
    }, 250);
  }

  return {
    kind: 'file',
    durable: true, // 이 컴퓨터가 살아 있는 한
    where: ACCOUNTS_FILE,
    async init() {},
    async get(id) {
      return accounts[id] || null;
    },
    async set(id, record) {
      accounts[id] = record;
      flush();
    },
    /** 계정 한 건을 지운다. 없으면 조용히 false. */
    async del(id) {
      if (!(id in accounts)) return false;
      delete accounts[id];
      flush();
      return true;
    },
    async count() {
      return Object.keys(accounts).length;
    },
    async ids() {
      return Object.keys(accounts);
    },
    async getDoc(name) {
      return docs[name] === undefined ? null : docs[name];
    },
    async setDoc(name, value) {
      docs[name] = value;
      flushDocs();
    },
    async delDoc(name) {
      if (!(name in docs)) return false;
      delete docs[name];
      flushDocs();
      return true;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Upstash Redis 백엔드 (REST)
// ─────────────────────────────────────────────────────────────
function upstashStore(url, token) {
  const base = url.replace(/\/+$/, '');

  /**
   * Redis 명령 하나를 REST 로 보낸다.
   * 값을 주소(path)가 아니라 본문(body)에 실으므로 세이브가 아무리 커도 안전하다.
   */
  async function cmd(args) {
    const res = await fetch(base, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(`Upstash 오류: ${data.error || res.status}`);
    }
    return data.result;
  }

  return {
    kind: 'upstash',
    durable: true,
    where: base.replace(/^https?:\/\//, '').split('.')[0] + '… (Upstash)',
    async init() {
      // 시작할 때 한 번 두드려 본다 — 주소나 토큰이 틀렸으면 여기서 바로 안다.
      await cmd(['PING']);
    },
    async get(id) {
      const raw = await cmd(['GET', KEY_PREFIX + id]);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async set(id, record) {
      await cmd(['SET', KEY_PREFIX + id, JSON.stringify(record)]);
      await cmd(['SADD', INDEX_KEY, id]);
    },
    /**
     * 계정 한 건을 지운다.
     * ⚠ 목록(SET)에서도 빼야 한다. 값만 지우면 ids() 가 계속 그 아이디를 돌려주고,
     *   그걸 get 하면 null 이 나와 "있는데 없는 계정" 이 된다.
     */
    async del(id) {
      const n = await cmd(['DEL', KEY_PREFIX + id]);
      await cmd(['SREM', INDEX_KEY, id]);
      return Number(n) > 0;
    },
    async count() {
      const n = await cmd(['SCARD', INDEX_KEY]);
      return Number(n) || 0;
    },
    async ids() {
      const list = await cmd(['SMEMBERS', INDEX_KEY]);
      return Array.isArray(list) ? list : [];
    },
    async getDoc(name) {
      const raw = await cmd(['GET', DOC_PREFIX + name]);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    async setDoc(name, value) {
      await cmd(['SET', DOC_PREFIX + name, JSON.stringify(value)]);
    },
    async delDoc(name) {
      const n = await cmd(['DEL', DOC_PREFIX + name]);
      return Number(n) > 0;
    },
  };
}

// ─────────────────────────────────────────────────────────────

/**
 * 환경변수를 보고 알맞은 저장소를 고른다.
 *   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN → Upstash
 *   없으면 → 파일
 */
function createStore(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    if (typeof fetch !== 'function') {
      throw new Error(
        'Upstash 를 쓰려면 Node 18 이상이 필요합니다(fetch 내장). 지금 버전: ' + process.version
      );
    }
    return upstashStore(url, token);
  }
  return fileStore();
}

module.exports = { createStore, ACCOUNTS_FILE, WORLD_FILE };
