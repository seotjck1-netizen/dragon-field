#!/usr/bin/env node
/**
 * 포이노 오픈 필드 서버 — 의존성 0개(순수 Node 18+).
 *
 *   node server/server.js            # http://localhost:8787
 *   PORT=9000 node server/server.js
 *
 * 하는 일 네 가지
 *   1) 게임 파일을 그대로 서빙한다(브라우저에서 바로 열 수 있게).
 *   2) 계정/세이브 API.
 *   3) WebSocket 중계 — 접속자들의 위치와 몬스터 처치를 서로에게 전달.
 *   4) 콘텐츠 배포 — server/content/ 의 표(아이템·드랍·퀘스트 등)를 버전과 함께 내려 준다.
 *      그 폴더의 파일을 고치면 검사 후 버전이 오르고 접속자에게 즉시 알림이 간다.
 *
 * ── 공개 인터넷에 올릴 때 ──────────────────────────────────
 * 예전에는 "집에서만 쓰라"고 적어 두었지만, 지금은 공개 배포를 견디도록 손봤다.
 *   · 비밀번호는 소금과 함께 굳혀서 보관한다(server/auth.js). 받은 해시를 그대로 두지 않는다.
 *   · 세션 토큰은 비밀번호와 무관하게 따로 발급하고 서버 비밀키로 서명한다.
 *   · 가입·로그인·저장에 횟수 제한을 둔다.
 *   · server/ 폴더는 정적 파일로 절대 내주지 않는다(계정 파일이 그대로 노출되던 구멍).
 *
 * 그래도 이 계정은 "세이브 슬롯 구분"용이다. 은행 계정이 아니다.
 * 다른 곳에서 쓰는 비밀번호를 재사용하지 말라고 접속 화면에서 계속 안내한다.
 *
 * 환경변수
 *   PORT                       듣는 포트(호스팅이 알아서 넣어 준다)
 *   SESSION_SECRET             토큰 서명 키. 없으면 매번 새로 만들어 재시작 때 모두 재접속해야 한다.
 *   UPSTASH_REDIS_REST_URL     있으면 계정을 Upstash 에 둔다(무료 호스팅용).
 *   UPSTASH_REDIS_REST_TOKEN
 *   MAX_ACCOUNTS               계정 수 상한(기본 500)
 *   REGISTER_LIMIT             한 IP 에서 시간당 만들 수 있는 계정 수(기본 5)
 *   ADMIN_KEY                  이벤트 우편 발송 열쇠. 비어 있으면 발송이 막힌다
 *   DRAGON_EVERY_MS/STAY_MS/HP 서쪽 절벽 고룡의 주기·체류·체력
 *   SHEET_ID                   구글 시트 주소·아이디. 넣으면 표를 거기서 읽어 온다(SHEETS.md).
 *                              안 넣으면 저장소의 sheets/SOURCE.txt 에 적힌 문서를 쓴다.
 *   SHEET_POLL_MIN             몇 분마다 시트를 확인할지(기본 0 = 안 함)
 *   ADMIN_KEY                  POST /api/content/pull 로 즉시 반영할 때 쓰는 열쇠
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const content = require('./content.js');
const sheetsync = require('./sheetsync.js');
const { createStore } = require('./store.js');
const { createWorld } = require('./world.js');
const { makeSecret, verifySecret, tokenFactory, rateLimiter } = require('./auth.js');

const ROOT = path.resolve(__dirname, '..');

/**
 * 서버가 내려 주는 게임의 판 번호.
 *
 * **클라이언트와 같은 곳(src/config.js)에서 읽는다.** package.json 을 읽으면
 * 둘이 어긋났을 때 조용히 다른 값을 말하게 되는데, 이 값은 "접속을 막을지"를
 * 정하는 값이라 어긋나면 아무도 못 들어오거나 아무나 들어온다.
 */
const GAME_VERSION = (() => {
  try {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
    const m = /GAME_VERSION\s*=\s*'([^']+)'/.exec(src);
    return m ? m[1] : '';
  } catch {
    return '';
  }
})();
const PORT = Number(process.env.PORT || 8787);
const MAX_ACCOUNTS = Number(process.env.MAX_ACCOUNTS || 500);
// 한 IP 에서 시간당 만들 수 있는 계정 수. 같은 공유기 아래에서 여럿이 만들 때 올린다.
const REGISTER_LIMIT = Number(process.env.REGISTER_LIMIT || 5);

// 정적 파일로 절대 내주지 않을 곳. 여기에 계정 파일과 배포용 표가 들어 있다.
const NEVER_SERVE = ['server', 'node_modules', '.git', '.env'];

const store = createStore();
const world = createWorld(store);

// 서쪽 절벽의 고룡 — 서버가 체력을 들고 있다.
// 여럿이 같은 놈을 때려야 "누가 제일 많이 때렸나"를 물을 수 있기 때문이다.
// 수치는 src/data 와 맞춰 두어야 한다(maps.json 의 timedBoss, monsters.json 의 great_dragon).
const DRAGON = {
  everyMs: Number(process.env.DRAGON_EVERY_MS || 1800000), // 30분마다 온다
  stayMs: Number(process.env.DRAGON_STAY_MS || 1500000), // 25분 머물다 사라진다
  maxHp: Number(process.env.DRAGON_HP || 700000),
  // 징표는 등수대로(1등 3 · 2등 2 · 나머지 1), 경험치와 골드는 기여한 비율대로 나눈다.
  // 고룡은 바닥에 아무것도 흘리지 않으므로 이 우편이 유일한 보상이다.
  reward: {
    item: 'dragon_token',
    first: 3,
    second: 2,
    rest: 1,
    exp: Number(process.env.DRAGON_EXP || 400000),
    gold: Number(process.env.DRAGON_GOLD || 300000),
  },
};

// 운영자 열쇠. 이벤트 우편을 보낼 때만 쓴다.
// 비워 두면 이벤트 발송이 아예 막힌다 — 열어 둔 채로 배포되는 일이 없게.
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// 운영자 계정의 아이디. 이 아이디로 접속하면 게임 안에 운영자 창이 뜬다.
// 계정 자체는 보통 계정과 똑같다 — 다른 점은 이 아이디인지 서버가 알아본다는 것뿐이다.
const ADMIN_ID = String(process.env.ADMIN_ID || 'admin').trim();

/** 로그인한 사람만 지나갈 수 있는 문. */
async function authed(body) {
  const id = checkId(body.id);
  const auth = tokens.verify(body.token, id);
  if (!auth.ok) throw new Error(auth.reason);
  const acct = await store.get(id);
  if (!acct) throw new Error('없는 계정입니다.');
  return { id, acct };
}

/**
 * 운영자만 부를 수 있는 창구.
 *
 * ── 왜 이렇게 두 겹인가 ────────────────────────────────────
 * ① ADMIN_KEY 가 비어 있으면 **아무것도 안 된다.** 예전부터 지켜 온 규칙이고,
 *    열쇠를 안 정한 서버는 "운영 기능을 안 쓰겠다"는 뜻으로 본다.
 * ② 그 위에 **접속한 계정이 운영자 계정인지**를 본다.
 *
 * 열쇠(ADMIN_KEY)는 절대 브라우저로 내려보내지 않는다. 화면이 보내는 것은
 * 제 세션 토큰뿐이고, 그 토큰이 운영자 계정의 것인지는 여기서만 판단한다.
 * 예전처럼 열쇠를 직접 들고 부르는 길(tools/event.js)도 그대로 둔다.
 */
async function adminOnly(body) {
  if (!ADMIN_KEY) {
    throw new Error('이 서버는 운영 기능이 꺼져 있습니다. ADMIN_KEY 를 정하세요.');
  }
  const { id, acct } = await authed(body);
  if (id !== ADMIN_ID) throw new Error('운영자만 할 수 있습니다.');
  return { id, acct };
}

// 토큰 서명 키. 없으면 임시로 만들어 쓰되, 재시작 때 모두 다시 접속해야 한다고 알린다.
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('base64');
const EPHEMERAL_SECRET = !process.env.SESSION_SECRET;
const tokens = tokenFactory(SESSION_SECRET);
const limiter = rateLimiter();
setInterval(() => limiter.sweep(), 600000).unref?.();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------------- 계정 검증 도우미 ----------------
// 아이디 규칙은 클라이언트(systems/AccountSystem.js)와 같아야 한다.
// 클라이언트를 못 믿는 게 아니라, 서버는 아무나 호출할 수 있기 때문이다.
const ID_RE = /^[A-Za-z0-9_가-힣]{3,16}$/;

function checkId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new Error('아이디는 3~16자의 한글·영문·숫자여야 합니다.');
  }
  return id;
}

function checkHash(hash) {
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('비밀번호 형식이 올바르지 않습니다.');
  }
  return hash;
}

/** 요청을 보낸 곳. 호스팅은 프록시 뒤에 있으므로 X-Forwarded-For 를 먼저 본다. */
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function limit(req, action, max, windowMs) {
  const r = limiter.check(`${clientIp(req)}:${action}`, max, windowMs);
  if (!r.ok) throw new Error(`잠시 뒤에 다시 시도하세요. (${r.retryAfterSec}초)`);
}

// ---------------- HTTP ----------------
function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 512 * 1024) {
        reject(new Error('본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON 형식이 아닙니다.'));
      }
    });
    req.on('error', reject);
  });
}

const api = {
  '/api/ping': async () => ({
    ok: true,
    name: 'poino-server',
    version: 2,
    // 접속 화면이 "내 파일이 최신인가" 를 견주는 값.
    // 다르면 브라우저가 옛 파일을 캐시에서 붙잡고 있는 것이므로 접속을 막는다.
    gameVersion: GAME_VERSION,
    contentVersion: content.readVersion().version,
    players: clients.size,
    // 계정이 어디에 저장되는지 — 접속 화면이 "이 기기에만" 인지 알려 줄 때 쓴다.
    storage: store.kind,
  }),

  // ---- 콘텐츠 배포 ----
  // 클라이언트는 시작할 때 이걸 받아 자기 표 대신 쓴다.
  '/api/content': async () => {
    const { files, errors } = content.readAll();
    if (errors.length) throw new Error(errors.join(' / '));
    return { ...content.readVersion(), files };
  },

  // 구글 시트를 지금 당장 읽어 반영한다(자동 확인을 기다리기 싫을 때).
  // 아무나 부르면 안 되므로 ADMIN_KEY 를 요구한다.
  '/api/content/pull': async (body, req) => {
    const cfg = sheetsync.config();
    if (!cfg.enabled) throw new Error(sheetsync.NO_SHEET_MSG);
    if (!cfg.adminKey) throw new Error('ADMIN_KEY 가 설정되어 있지 않아 잠겨 있습니다.');
    limit(req, 'pull', 10, 60000);
    const given = String((body && body.key) || '');
    const want = Buffer.from(cfg.adminKey);
    const got = Buffer.from(given);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      throw new Error('열쇠가 다릅니다.');
    }
    const r = await sheetsync.pullOnce(
      process.env,
      (body && body.note) || '수동 반영',
      pauseContentWatch // 감시자가 겹쳐 배포하지 않게
    );
    if (!r.ok) throw new Error((r.errors || ['알 수 없는 오류']).join(' / '));
    if (r.skipped) return { ok: true, changed: [], message: '시트와 서버 내용이 같습니다.' };
    announceContent(r.version, '구글 시트');
    return { ok: true, version: r.version, changed: r.changed, warnings: r.warnings || [] };
  },

  // 새 버전이 나왔는지만 가볍게 확인(폴링용). WebSocket 알림이 막힌 환경 대비.
  '/api/content-version': async () => content.readVersion(),

  '/api/register': async (body, req) => {
    // 계정 만들기는 가장 값싼 공격 대상이다.
    // 다만 5개/시간은 "친구 여럿이 한자리에서 같이 만들기"에도 걸린다(같은 IP 로 나간다).
    // 공개 서버면 기본값을 그대로 두고, 집에서 같이 놀 때만 REGISTER_LIMIT 을 올린다.
    limit(req, 'register', REGISTER_LIMIT, 3600000);

    const id = checkId(body.id);
    const hash = checkHash(body.hash);
    if (await store.get(id)) throw new Error('이미 있는 아이디입니다.');

    if ((await store.count()) >= MAX_ACCOUNTS) {
      throw new Error('이 서버의 계정이 가득 찼습니다. 관리자에게 알려 주세요.');
    }

    const record = {
      ...makeSecret(hash),
      name: String(body.name || id).slice(0, 12) || id,
      save: null,
      createdAt: new Date().toISOString(),
      // 만들자마자 들어가는 것이므로 마지막 접속도 지금이다 (0.48).
      // 안 적어 두면 갓 만든 계정이 "한 번도 안 들어옴" 으로 보인다.
      lastLoginAt: new Date().toISOString(),
    };
    await store.set(id, record);
    return { token: tokens.issue(id), save: null };
  },

  '/api/login': async (body, req) => {
    limit(req, 'login', 20, 600000);

    const id = checkId(body.id);
    const hash = checkHash(body.hash);
    const acct = await store.get(id);
    // 있는 아이디인지 아닌지를 굳이 알려 주지 않는다(계정 목록을 긁어 가지 못하게).
    const check = verifySecret(acct, hash);
    if (!check.ok) throw new Error('아이디 또는 비밀번호가 다릅니다.');

    // 마지막으로 들어온 때를 적어 둔다 (0.48).
    // 운영자 창의 계정 목록이 "오래 안 들어온 사람" 을 가리는 데 쓴다.
    //
    // ⚠ **접속할 때만** 적는다. 저장(/api/save)마다 적으면 놀고 있는 사람 때문에
    //   몇 초마다 계정을 다시 쓰게 되고, Upstash 요청이 그만큼 늘어난다.
    //   "마지막 접속" 은 놀던 시각이 아니라 들어온 시각이라 이걸로 충분하다.
    const upgraded = check.upgrade
      ? (() => { const { hash: _drop, ...rest } = acct; return { ...rest, ...check.upgrade }; })()
      : acct;
    await store.set(id, { ...upgraded, lastLoginAt: new Date().toISOString() });
    // 시즌이 넘어가 초기화된 사람에게는 접속하는 그 자리에서 알려 준다.
    // (그때 접속 중이던 사람은 방송으로 이미 봤고, 자고 있던 사람은 여기서 본다)
    // ⚠ 적혀 있는 값이 **보여 줄 번호 그대로**다. 예전에는 여기서 +1 을 했는데,
    //   그 사이 순서가 바뀌어(랭킹 초기화가 먼저 번호를 올린다) 한 살씩 더 먹었다 —
    //   랭킹 창은 2 시즌인데 알림만 "3 시즌" 이라고 말하고 있었다.
    const notice = await world.takeSeasonNotice(id);
    return {
      token: tokens.issue(id),
      save: acct.save || null,
      ...(notice ? { seasonNotice: notice } : {}),
    };
  },

  '/api/save': async (body, req) => {
    limit(req, 'save', 90, 60000);

    const id = checkId(body.id);
    const auth = tokens.verify(body.token, id);
    if (!auth.ok) throw new Error(auth.reason);

    const acct = await store.get(id);
    if (!acct) throw new Error('없는 계정입니다.');
    if (!body.save || typeof body.save !== 'object') throw new Error('저장할 내용이 없습니다.');

    // 타임어택의 출발 신호 — 첫 캐릭터가 실제로 만들어진 순간.
    //
    // 예전에는 계정을 만든 시각(createdAt)부터 쟀는데, 아이디만 미리 만들어 두고
    // 며칠 뒤에 시작하면 그 며칠이 그대로 기록에 얹혔다. 첫 저장은 곧 첫 캐릭터가
    // 세상에 나온 순간이므로, 그때를 출발선으로 삼는다.
    // 한 번 찍히면 다시 쓰지 않는다 — 캐릭터를 새로 만들어도 시계는 되감기지 않는다.
    const born = acct.bornAt ? {} : { bornAt: new Date().toISOString() };

    await store.set(id, {
      ...acct,
      ...born,
      save: { ...body.save, savedAt: new Date().toISOString() },
    });
    return { ok: true };
  },

  '/api/load': async (body, req) => {
    limit(req, 'load', 60, 60000);

    const id = checkId(body.id);
    const auth = tokens.verify(body.token, id);
    if (!auth.ok) throw new Error(auth.reason);

    const acct = await store.get(id);
    if (!acct) throw new Error('없는 계정입니다.');
    // 시즌이 넘어가 초기화된 사람에게는 그 사실을 한 번 알려 준다.
    // (접속 중이던 사람은 이미 알림을 받았고, 자고 있던 사람은 여기서 처음 본다)
    const notice = await world.takeSeasonNotice(id); // 적힌 값이 곧 보여 줄 번호다(위 참고)
    return { save: acct.save || null, ...(notice ? { seasonNotice: notice } : {}) };
  },

  // ---- 우편함 ----
  //
  // 접속할 때 한 번 부른다. 아직 안 가져간 이벤트도 이때 우편함으로 옮겨 준다.
  '/api/mail': async (body, req) => {
    limit(req, 'mail', 120, 60000);
    const { id, acct } = await authed(body);
    const pulled = await world.pullEvents(id, acct.eventsAt || 0);
    if (pulled.added) await store.set(id, { ...acct, eventsAt: pulled.at });
    return { mail: await world.mailbox(id), pulled: pulled.added };
  },

  // 우편 한 통을 받는다. 서버는 "두 번 받기"만 막고, 소지품에 넣는 것은 게임이 한다.
  '/api/mail/claim': async (body, req) => {
    limit(req, 'mailclaim', 120, 60000);
    const { id } = await authed(body);
    const res = await world.claimMail(id, String(body.mid || ''));
    if (!res.ok) throw new Error(res.reason);
    return { ok: true, mail: res.mail };
  },

  '/api/mail/delete': async (body, req) => {
    limit(req, 'maildel', 120, 60000);
    const { id } = await authed(body);
    return { ok: true, mail: await world.deleteMail(id, String(body.mid || '')) };
  },

  // ---- 타임어택 랭킹 ----
  //
  // 보여 주는 것은 5위까지지만, 로그인한 사람에게는 "내 기록과 몇 위인지"를 함께 준다.
  // 열쇠가 없거나 틀려도 표는 준다 — 랭킹은 원래 누구나 보는 것이다.
  '/api/rank': async (body, req) => {
    limit(req, 'rank', 120, 60000);
    let me = null;
    if (body && body.id && body.token) {
      const id = checkId(body.id);
      if (tokens.verify(body.token, id).ok) me = id;
    }
    const res = await world.board(me);
    return {
      rank: res.table, mine: res.mine, total: res.total,
      prev: res.prev, season: res.season,
    };
  },

  // 게임 쪽은 "이 보스를 잡았다"만 알린다. 걸린 시간은 서버가 잰다.
  //
  // 예전에는 게임이 잰 시간을 그대로 받아 적었다. 브라우저 콘솔에서
  // 한 줄만 치면 1초 기록이 올라가는 표였다는 뜻이라, 견줄 값이 못 됐다.
  // 지금 잣대는 계정을 만들 때 서버가 찍어 둔 시각 하나뿐이다.
  '/api/rank/submit': async (body, req) => {
    limit(req, 'ranksub', 60, 60000);
    const { id, acct } = await authed(body);
    const bossId = String(body.boss || '').slice(0, 40);
    if (!bossId) throw new Error('어떤 보스인지 알 수 없습니다.');

    // 출발선은 첫 캐릭터가 만들어진 때(bornAt). 아직 없으면(옛 계정) 계정을 만든 때로.
    const bornMs = Date.parse(acct.bornAt || acct.createdAt || '') || 0;
    const firstKill = acct.firstKill && typeof acct.firstKill === 'object' ? acct.firstKill : {};
    const res = await world.submitRank(bossId, {
      id,
      name: acct.name || id,
      bornMs,
      already: firstKill[bossId] || 0,
    });
    if (!res.ok) return res;

    // 처음 잡은 것이면 계정에도 적어 둔다 — 두 번째부터는 기록이 바뀌지 않는다.
    if (res.first) {
      await store.set(id, { ...acct, firstKill: { ...firstKill, [bossId]: res.ms } });
    }
    return res;
  },

  // ---- 고룡 ----
  '/api/dragon': async (body, req) => {
    limit(req, 'dragon', 180, 60000);
    const at = await world.dragonState(DRAGON);
    return {
      since: at.since, hp: at.hp, maxHp: at.maxHp,
      present: at.present, endsAt: at.endsAt, nextAt: at.nextAt,
      downedAt: at.downedAt,
      top: require('./world.js').topDamage(at.damage, at.names),
    };
  },

  // 한 판 싸운 뒤 "이만큼 깎았다"를 알린다. 체력은 서버가 들고 있으므로
  // 여기서만 줄어들고, 0 이 되는 순간 기여도대로 우편이 나간다.
  '/api/dragon/hit': async (body, req) => {
    limit(req, 'draghit', 60, 60000);
    const { id, acct } = await authed(body);
    return world.hitDragon(DRAGON, id, acct.name || id, body.damage);
  },

  // ---- 이벤트(운영자) ----
  //
  // ADMIN_KEY 를 비워 두면 아예 막힌다. 열쇠 없이 열려 있는 발송 경로는
  // 누구든 전 유저에게 아이템을 뿌릴 수 있다는 뜻이라, 없느니만 못하다.
  '/api/event/send': async (body, req) => {
    limit(req, 'event', 20, 3600000);
    if (!ADMIN_KEY) throw new Error('이 서버는 이벤트 발송이 꺼져 있습니다. ADMIN_KEY 를 정하세요.');
    if (String(body.key || '') !== ADMIN_KEY) throw new Error('열쇠가 다릅니다.');
    const item = await world.addEvent({
      from: body.from || '운영자',
      subject: body.subject,
      body: body.body,
      items: body.items,
      exp: body.exp,
      gold: body.gold,
      // 며칠 뒤에 사라질지. 안 주면 7일. 0 을 주면 안 사라진다.
      days: body.days,
      at: Date.now(),
    });
    return { ok: true, event: item };
  },

  // 랭킹 초기화(운영자). 이벤트 발송과 같은 열쇠를 쓴다.
  //
  // boss 를 주면 그 보스만, 안 주면 전부 지운다.
  // 계정의 '처음 잡은 시각'도 함께 지우므로, 지운 뒤에는 다들 다시 도전할 수 있다.
  '/api/rank/reset': async (body, req) => {
    limit(req, 'rankreset', 10, 3600000);
    if (!ADMIN_KEY) throw new Error('이 서버는 랭킹 초기화가 꺼져 있습니다. ADMIN_KEY 를 정하세요.');
    if (String(body.key || '') !== ADMIN_KEY) throw new Error('열쇠가 다릅니다.');
    const bosses = Array.isArray(body.boss) ? body.boss : body.boss ? [String(body.boss)] : null;
    const res = await world.resetRanks(bosses);
    console.log(`✓ 랭킹 초기화 — ${res.cleared.length}개 표 · 계정 ${res.accounts}개`);
    return res;
  },

  '/api/event/list': async (body, req) => {
    limit(req, 'eventlist', 60, 60000);
    return { events: await world.events() };
  },

  // ---------------- 운영자 창 ----------------
  // 게임 안에서 부르는 창구다. 열쇠 대신 **운영자 계정의 세션**으로 잠근다
  // (adminOnly 참고 — 열쇠는 브라우저로 내려가지 않는다).

  /** 나는 운영자인가. 접속 직후 한 번 물어보고, 맞으면 HUD 에 버튼이 생긴다. */
  '/api/admin/me': async (body, req) => {
    limit(req, 'adminme', 60, 60000);
    const { id } = await authed(body);
    return {
      admin: !!ADMIN_KEY && id === ADMIN_ID,
      // 열쇠가 없어서 못 쓰는 것인지, 계정이 달라서인지 화면이 구분해 말할 수 있게.
      reason: !ADMIN_KEY ? 'no-key' : id === ADMIN_ID ? '' : 'not-admin',
      sheet: sheetsync.config().enabled,
    };
  },

  /** 계정 목록. 우편을 특정 사람에게 보낼 때 고르라고 내려 준다. */
  '/api/admin/accounts': async (body, req) => {
    limit(req, 'adminlist', 60, 60000);
    await adminOnly(body);
    if (typeof store.ids !== 'function') {
      throw new Error('이 저장소는 계정 목록을 셀 수 없습니다.');
    }
    const ids = await store.ids();
    const out = [];
    for (const id of ids.slice(0, 500)) {
      const acct = await store.get(id);
      if (!acct) continue;
      out.push({
        id,
        name: acct.name || id,
        level: (acct.save && acct.save.player && acct.save.player.level) || null,
        // 언제 만든 계정인가 (0.47). 시험 계정을 골라 지울 때 이것이 가장 쓸모 있다 —
        // 아이디만 보고는 어제 만든 것과 오늘 만든 것을 가릴 수 없다.
        // 옛 계정에는 이 값이 없을 수 있다(그 시절에는 안 적었다). 그때는 null.
        createdAt: acct.createdAt || null,
        // 마지막으로 들어온 때 (0.48). '만든 때' 와 다른 것을 본다 —
        // 만든 지 오래됐어도 어제 들어왔으면 살아 있는 사람이고,
        // 오늘 만들었어도 그 뒤로 안 들어왔으면 버려진 계정이다.
        lastLoginAt: acct.lastLoginAt || null,
        // 운영자 자신 — 지우기 목록에서 빼기 위해 표시해 둔다(0.46).
        // 지우면 그 순간 이 창을 열 사람이 없어진다.
        self: id === ADMIN_ID,
      });
    }
    // 새로 만든 것이 위로. 방금 만든 시험 계정을 찾는 것이 가장 잦은 일이다.
    // 만든 때를 모르는 옛 계정은 맨 아래로 보내고 아이디순으로 둔다.
    out.sort((a, b) => {
      const at = a.createdAt ? Date.parse(a.createdAt) : NaN;
      const bt = b.createdAt ? Date.parse(b.createdAt) : NaN;
      const aOk = Number.isFinite(at);
      const bOk = Number.isFinite(bt);
      if (aOk && bOk && at !== bt) return bt - at;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return a.id.localeCompare(b.id);
    });
    return { accounts: out };
  },

  /**
   * 우편 보내기 — 전체 또는 고른 사람들에게.
   *
   * `to` 가 비어 있으면 **전체**(기본). 그때는 이벤트로 넣어 두었다가 각자 접속할 때
   * 우편함으로 옮겨 준다 — 지금 접속 안 한 사람에게도 나중에 도착한다.
   * `to` 에 아이디를 적으면 그 사람들의 우편함에 **바로** 넣는다.
   */
  '/api/admin/mail': async (body, req) => {
    limit(req, 'adminmail', 30, 3600000);
    await adminOnly(body);
    const mail = {
      from: String(body.from || '운영자').slice(0, 24),
      subject: body.subject,
      body: body.body,
      items: body.items,
      exp: body.exp,
      gold: body.gold,
      days: body.days,
      at: Date.now(),
    };

    const to = Array.isArray(body.to) ? body.to.map((x) => String(x || '').trim()).filter(Boolean) : [];
    if (!to.length) {
      const item = await world.addEvent(mail);
      console.log(`✓ 운영자 우편(전체) — "${item.subject}" (아이템 ${item.items.length}종)`);
      return { ok: true, mode: 'all', event: item, sent: null };
    }

    if (to.length > 200) throw new Error('한 번에 200명까지 보낼 수 있습니다.');
    const sent = [];
    const missing = [];
    for (const id of to) {
      // 없는 아이디는 조용히 넘기지 않는다 — 오타 하나로 아무에게도 안 갈 수 있다.
      const acct = await store.get(id).catch(() => null);
      if (!acct) { missing.push(id); continue; }
      await world.sendMail(id, mail);
      sent.push(id);
    }
    if (!sent.length) throw new Error(`보낼 사람을 못 찾았습니다: ${missing.join(', ')}`);
    console.log(`✓ 운영자 우편(${sent.length}명) — "${mail.subject}"`);
    return { ok: true, mode: 'some', sent, missing };
  },

  /**
   * 랭킹 초기화 = 시즌 넘기기. 지금 표는 '지난 시즌' 으로 옮겨진다.
   * **시즌 고정이 켜져 있으면 번호는 그대로**이고 표만 비워진다(0.45).
   */
  '/api/admin/rank-reset': async (body, req) => {
    limit(req, 'adminrank', 10, 3600000);
    await adminOnly(body);
    const bosses = Array.isArray(body.boss) ? body.boss : body.boss ? [String(body.boss)] : null;
    const res = await world.resetRanks(bosses);
    console.log(`✓ 운영자 랭킹 초기화 — ${res.cleared.length}개 표 · 계정 ${res.accounts}개`
      + (res.locked ? ` (시즌 고정 — ${res.season} 시즌 그대로)` : ` → ${res.season} 시즌`));
    return res;
  },

  /**
   * 고른 계정을 지운다 (0.46).
   *
   * 시험 중에 만든 계정이 쌓이면 우편 고르기 목록도, 랭킹도 그것들로 찬다.
   * 전체 초기화는 **모두를 되돌릴 뿐 계정을 없애지는 않으므로** 따로 필요하다.
   *
   * ⚠ 운영자 자신은 못 지운다. 지우면 그 순간 이 창을 열 사람이 없어진다.
   */
  '/api/admin/account-delete': async (body, req) => {
    limit(req, 'adminacctdel', 60, 3600000);
    await adminOnly(body);
    const list = Array.isArray(body.ids) ? body.ids : body.target ? [String(body.target)] : [];
    if (!list.length) throw new Error('지울 계정을 고르세요.');

    const deleted = [];
    const failed = [];
    for (const raw of list.slice(0, 100)) {
      const target = String(raw || '').trim();
      if (!target) continue;
      if (target === ADMIN_ID) {
        failed.push({ id: target, reason: '운영자 계정은 지울 수 없습니다.' });
        continue;
      }
      const res = await world.deleteAccount(target);
      if (res.ok) deleted.push({ id: res.id, name: res.name, ranks: res.ranks.length });
      else failed.push({ id: target, reason: res.reason });
    }
    console.log(`✓ 운영자 계정 삭제 — ${deleted.length}개${failed.length ? ` (실패 ${failed.length})` : ''}`
      + (deleted.length ? `: ${deleted.map((d) => d.id).join(', ')}` : ''));
    return { ok: true, deleted, failed };
  },

  /**
   * 여태 보낸 우편을 전부 지운다 (0.45).
   *
   * 계정 우편함과 **이벤트 통**을 함께 비운다. 우편함만 비우면 아직 안 들어온
   * 사람이 접속할 때 같은 우편이 다시 배달된다.
   */
  '/api/admin/mail-clear': async (body, req) => {
    limit(req, 'adminmailclear', 10, 3600000);
    await adminOnly(body);
    const res = await world.clearAllMail();
    console.log(`✓ 운영자 우편 전체 삭제 — 계정 ${res.accounts}개 · 우편 ${res.mails}통 · 대기 ${res.events}건`);
    return res;
  },

  /**
   * 시즌 고정 — 켜 두면 어떤 초기화도 시즌을 넘기지 않는다 (0.45).
   *
   * 아직 시험 중인 서버에서 초기화를 몇 번 하다 보면 시즌만 5, 6 으로 올라가고
   * "1 시즌 기록" 은 영영 안 남는다. 이 스위치가 그걸 막는다.
   */
  '/api/admin/season-lock': async (body, req) => {
    limit(req, 'adminlock', 30, 3600000);
    await adminOnly(body);
    const res = await world.lockSeason(!!body.locked);
    console.log(`✓ 운영자 시즌 고정 ${res.locked ? '켬' : '끔'} — 지금 ${res.season} 시즌`);
    return res;
  },

  /**
   * 시즌 번호를 직접 정한다 — 대개 **1 로 되돌릴 때** 쓴다 (0.45).
   *
   * 번호와 '지난 시즌' 기록만 되돌린다. 지금 시즌의 기록·세이브는 안 건드린다 —
   * 지우는 것은 초기화가 할 일이고, 이건 번호를 되돌리는 일이다.
   */
  '/api/admin/season-set': async (body, req) => {
    limit(req, 'adminseasonset', 20, 3600000);
    await adminOnly(body);
    const res = await world.setSeason(body.season);
    console.log(`✓ 운영자 시즌 되돌리기 — ${res.from} → ${res.season} 시즌`
      + (res.notices ? ` · 못 본 알림 ${res.notices}개 치움` : ''));
    return res;
  },

  /**
   * 새 시즌 — 전체 유저 초기화.
   *
   * 랭킹 초기화(시즌 넘기기)까지 함께 한다. 둘을 따로 두면 "표만 넘기고 사람은
   * 그대로" 같은 어중간한 상태가 생기는데, 그건 아무도 원하지 않는 상태다.
   *
   * 접속 중인 사람에게는 곧바로 알린다 — 그대로 두면 그 사람의 브라우저가
   * 옛 세이브를 다시 저장해 버려서, 한 명만 초기화가 안 되는 일이 생긴다.
   */
  '/api/admin/season-reset': async (body, req) => {
    limit(req, 'adminseason', 5, 3600000);
    await adminOnly(body);
    const ranksRes = await world.resetRanks(null);
    // ⚠ resetRanks 가 **먼저** 번호를 올린다. 그래서 여기서 읽는 res.season 은
    //   이미 새 시즌 번호다 — 여기에 다시 +1 을 하면 한 살을 더 먹는다(예전 버그).
    const res = await world.resetAllSaves();
    const text = res.locked
      ? `${res.season} 시즌이 다시 시작되었습니다`
      : '다음 시즌이 시작되었습니다';
    console.log(`✓ 운영자 시즌 초기화 — 계정 ${res.accounts}개 · 랭킹 표 ${ranksRes.cleared.length}개`
      + (res.locked ? ` (시즌 고정 — ${res.season} 시즌 그대로)` : ` → ${res.season} 시즌`));
    broadcast({ t: 'season', season: res.season, text });
    return {
      ok: true, accounts: res.accounts, cleared: ranksRes.cleared,
      season: res.season, locked: res.locked,
    };
  },

  /**
   * 지금 어느 문서를 보고 있나 (0.51).
   * 운영자 창 표 단이 이걸 띄워 준다 — "왜 안 읽히지" 의 답이 거의 언제나 여기 있다.
   */
  '/api/admin/sheet-info': async (body, req) => {
    limit(req, 'adminsheet', 30, 60000);
    await adminOnly(body);
    const cfg = sheetsync.config();
    return {
      ok: true,
      id: cfg.id || '',
      from: cfg.from,          // 'saved' | 'env' | 'file' | null
      pollMin: cfg.pollMs ? cfg.pollMs / 60000 : 0,
    };
  },

  /**
   * 볼 문서를 바꾼다 (0.51).
   *
   * 왜 필요한가: 시트를 새로 만들어 올리면 **문서 아이디가 바뀐다.** 예전에는
   * 그때마다 저장소의 sheets/SOURCE.txt 를 고치고 다시 배포해야 했고, 그 사이
   * 서버는 없어진 문서를 두드리며 401 만 돌려받았다. 다섯 판 연속으로 그랬다.
   * 이제 살아 있는 서버에 주소를 붙여 넣으면 그때부터 그 문서를 본다.
   *
   * 빈 값을 보내면 지워지고, 환경변수 → sheets/SOURCE.txt 순서로 되돌아간다.
   */
  '/api/admin/sheet-set': async (body, req) => {
    limit(req, 'adminsheet', 20, 60000);
    await adminOnly(body);
    const raw = String(body.url || '').trim();
    if (raw) {
      const id = sheetsync.idFromAny(raw);
      if (!id) throw new Error('구글 시트 주소나 문서 아이디를 붙여 넣어 주세요.');
      sheetsync.setSavedId(id);
      await store.setDoc('sheetId', id);
    } else {
      sheetsync.setSavedId('');
      await store.setDoc('sheetId', '');
    }
    const cfg = sheetsync.config();
    return { ok: true, id: cfg.id || '', from: cfg.from };
  },

  /** 구글 시트를 지금 읽는다. 자동 확인을 기다리기 싫을 때. */
  '/api/admin/sheet-pull': async (body, req) => {
    limit(req, 'adminpull', 10, 60000);
    await adminOnly(body);
    if (!sheetsync.config().enabled) throw new Error(sheetsync.NO_SHEET_MSG);
    const r = await sheetsync.pullOnce(process.env, '운영자 창에서 반영', pauseContentWatch);
    if (!r.ok) throw new Error((r.errors || ['알 수 없는 오류']).join(' / '));
    if (r.skipped) return { ok: true, changed: [], message: '시트와 서버 내용이 같습니다.' };
    announceContent(r.version, '구글 시트');
    return { ok: true, version: r.version, changed: r.changed, warnings: r.warnings || [] };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (api[url.pathname]) {
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      return send(res, 200, await api[url.pathname](body, req));
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  // 정적 파일
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);

  // 폴더 밖으로 나가는 경로는 막는다(../../etc/passwd 같은 것).
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    return send(res, 403, { error: 'forbidden' });
  }
  // server/ 안에는 계정 파일이 있다. 정적 파일로 절대 내주면 안 된다.
  // (예전에는 /server/data/accounts.json 을 주소창에 치면 그대로 받아 갈 수 있었다)
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (NEVER_SERVE.includes(top)) return send(res, 403, { error: 'forbidden' });

  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

// ---------------- 콘텐츠 감시 ----------------
// server/content/ 안의 표가 바뀌면 검사 → 버전 올리기 → 접속자에게 알림.
// 저장 중간 상태를 읽지 않도록 잠깐 모아서 처리한다.
let watchTimer = null;
let lastPublishError = null;

// 시트에서 당길 때는 그쪽이 직접 배포하고 알린다. 그 사이 감시자가 또 배포하면
// 한 번 고쳤는데 판이 두 개 올라가고 알림 띠가 두 번 뜬다. 당기는 동안은 쉰다.
let suppressWatchUntil = 0;
function pauseContentWatch(ms = 4000) {
  suppressWatchUntil = Date.now() + ms;
}

function onContentChanged() {
  if (Date.now() < suppressWatchUntil) return;
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    const result = content.publish('파일 수정 감지');
    if (!result.ok) {
      lastPublishError = result.errors;
      console.log('\n⚠ 콘텐츠에 문제가 있어 배포하지 않았습니다:');
      for (const e of result.errors) console.log('   ·', e);
      console.log('   고치면 자동으로 다시 시도합니다.\n');
      return;
    }
    lastPublishError = null;
    for (const w of result.warnings || []) console.log('   (참고)', w);
    announceContent(result.version, '파일 수정');
  }, 350);
}

/** 새 콘텐츠가 배포됐다고 접속자 모두에게 알린다. */
function announceContent(version, why = '') {
  console.log(`✓ 콘텐츠 v${version} 배포${why ? ` (${why})` : ''} — 접속자 ${clients.size}명에게 알림`);
  broadcast({ t: 'content', version });
}

function watchContent() {
  try {
    fs.watch(content.CONTENT_DIR, { persistent: false }, (_e, name) => {
      if (name && content.CONTENT_FILES.includes(name)) onContentChanged();
    });
  } catch (err) {
    console.log('(콘텐츠 자동 감시를 쓸 수 없습니다:', err.message, ')');
  }
}

// ---------------- WebSocket (직접 구현, 라이브러리 없음) ----------------
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const clients = new Set();

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) return socket.destroy();

  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const client = { socket, buffer: Buffer.alloc(0), id: null, name: null, alive: true };
  clients.add(client);

  socket.on('data', (chunk) => {
    client.alive = true; // 뭐라도 왔으면 살아 있는 것이다
    client.buffer = Buffer.concat([client.buffer, chunk]);
    let frame;
    while ((frame = readFrame(client.buffer))) {
      client.buffer = client.buffer.slice(frame.size);
      if (frame.opcode === 0x8) return closeClient(client);      // close
      if (frame.opcode === 0x9) { socket.write(makeFrame(frame.payload, 0xa)); continue; } // ping
      if (frame.opcode !== 0x1) continue;                        // 텍스트만 다룬다
      handleMessage(client, frame.payload.toString('utf8'));
    }
  });

  socket.on('error', () => closeClient(client));
  socket.on('close', () => closeClient(client));
});

function closeClient(client) {
  if (!clients.has(client)) return;
  clients.delete(client);
  try {
    client.socket.destroy();
  } catch {
    /* 무시 */
  }
  if (client.id) broadcast({ t: 'bye', id: client.id }, client);
}

function handleMessage(client, raw) {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object') return;
  if (msg.t === 'hello') {
    client.id = String(msg.id || '').slice(0, 32);
    client.name = String(msg.name || '').slice(0, 24);
  }
  broadcast(msg, client);
}

// 중계기(무료 호스팅 앞단)는 한동안 오가는 것이 없는 연결을 말없이 끊는다.
// 주기적으로 ping 을 보내 연결을 살려 두고, 대답 없는 쪽은 정리한다.
const WS_PING_MS = 25000;
const pinger = setInterval(() => {
  for (const c of [...clients]) {
    if (c.alive === false) {
      closeClient(c);
      continue;
    }
    c.alive = false;
    try {
      c.socket.write(makeFrame(Buffer.alloc(0), 0x9));
    } catch {
      closeClient(c);
    }
  }
}, WS_PING_MS);
if (pinger.unref) pinger.unref();

function broadcast(msg, except) {
  const frame = makeFrame(Buffer.from(JSON.stringify(msg), 'utf8'));
  for (const c of clients) {
    if (c === except) continue;
    try {
      c.socket.write(frame);
    } catch {
      closeClient(c);
    }
  }
}

/** 클라이언트가 보낸 프레임 하나를 읽는다(마스크 해제 포함). 부족하면 null. */
function readFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) === 0x80;
  let len = buf[1] & 0x7f;
  let offset = 2;

  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  let mask = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4);
    offset += 4;
  }
  if (buf.length < offset + len) return null;

  const payload = Buffer.from(buf.slice(offset, offset + len));
  if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

  return { opcode, payload, size: offset + len };
}

/** 서버 → 클라이언트 프레임(마스크 없음). */
function makeFrame(payload, opcode = 0x1) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// 콘텐츠 폴더가 비어 있으면 src/data 에서 한 번 복사해 온다.
const copied = content.initFromSource();
const first = content.inspect();
if (!first.ok) {
  console.log('⚠ 콘텐츠 표에 문제가 있습니다:');
  for (const e of first.errors) console.log('   ·', e);
}
watchContent();

/** 같은 와이파이의 다른 기기(폰 등)에서 칠 주소들. */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' && n.family !== 4) continue;
      if (n.internal) continue;
      out.push(n.address);
    }
  }
  return out;
}

/** 공개 호스팅 위에서 도는 중인가(대략 추정). 경고 문구를 고르는 데만 쓴다. */
function looksHosted() {
  return !!(process.env.RENDER || process.env.FLY_APP_NAME || process.env.RAILWAY_ENVIRONMENT ||
            process.env.KOYEB_APP_NAME || process.env.PUBLIC_HOST);
}

/** 지금 설정으로 공개 배포했을 때 문제가 될 것들. 있으면 시작할 때 크게 알린다. */
function startupWarnings() {
  const out = [];
  if (store.kind === 'file') {
    out.push([
      '계정이 이 서버의 파일에 저장됩니다.',
      '무료 호스팅은 접속이 없으면 서버를 재우고, 깨어날 때 파일을 지웁니다.',
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 을 넣으면 캐릭터가 보존됩니다.',
    ]);
  }
  if (EPHEMERAL_SECRET) {
    out.push([
      'SESSION_SECRET 이 없어 서명 키를 임시로 만들었습니다.',
      '서버가 재시작될 때마다 모두 다시 접속해야 합니다.',
      '아무 긴 문자열이나 SESSION_SECRET 으로 넣어 두세요.',
    ]);
  }
  return out;
}

/**
 * 운영자 계정이 없으면 만들어 둔다.
 *
 * ── 왜 서버가 만드나 ──────────────────────────────────────
 * 운영자 창은 "이 아이디로 접속했는가"로 열린다. 그 계정이 없으면 아무도 못 연다.
 * 배포할 때마다 사람이 손으로 만들게 하면 잊어버리기 쉽다.
 *
 * ── 규칙 ───────────────────────────────────────────────────
 * · **ADMIN_KEY 가 있을 때만** 만든다. 열쇠를 안 정한 서버는 운영 기능이 통째로
 *   꺼져 있으므로, 있으나 마나 한 계정을 만들어 둘 이유가 없다.
 * · **이미 있으면 손대지 않는다.** 비밀번호를 바꿔 두었는데 다시 뜨면 안 된다.
 * · 비밀번호는 ADMIN_PW 로 바꿀 수 있다. 안 정하면 @2222 로 만든다.
 *
 * ⚠ 기본 비밀번호는 짧고, 어디에나 적혀 있다. 공개 서버라면 **반드시 바꾸세요.**
 *   이 계정은 전 유저에게 우편을 뿌리고 랭킹을 지울 수 있습니다.
 */
async function ensureAdminAccount() {
  if (!ADMIN_KEY) return { made: false, why: 'ADMIN_KEY 가 없어 운영자 계정을 만들지 않았습니다.' };
  const existing = await store.get(ADMIN_ID);
  if (existing) return { made: false, why: '' };

  const pw = String(process.env.ADMIN_PW || '@2222');
  // 브라우저가 보내는 것과 **똑같은 방식**으로 해시한다
  // (src/systems/AccountSystem.js 의 hashPassword — 바꾸면 여기도 같이 바꿔야 한다).
  const clientHash = crypto
    .createHash('sha256')
    .update(`poino/v1/${ADMIN_ID.toLowerCase()}/${pw}`)
    .digest('hex');

  await store.set(ADMIN_ID, {
    ...makeSecret(clientHash),
    name: '운영자',
    save: null,
    createdAt: new Date().toISOString(),
    admin: true,
  });
  return { made: true, pw, why: '' };
}

async function start() {
  try {
    await store.init();
  } catch (err) {
    console.error('\n✗ 계정 저장소에 연결하지 못했습니다:', err.message);
    console.error('  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 을 확인하세요.\n');
    process.exit(1);
  }

  let adminSeed = { made: false, why: '' };
  try {
    adminSeed = await ensureAdminAccount();
  } catch (err) {
    console.log('(운영자 계정을 준비하지 못했습니다:', err.message, ')');
  }

  server.listen(PORT, () => {
    const v = content.readVersion();
    const lan = lanAddresses();
    const hosted = looksHosted();

    console.log('');
    console.log('  포이노 서버 준비 완료');
    console.log('  ─────────────────────────────────────────────');

    if (hosted) {
      console.log(`  공개 호스팅에서 실행 중 (포트 ${PORT})`);
      console.log('  접속 주소는 호스팅이 알려 주는 주소를 쓰세요.');
    } else {
      console.log(`  이 컴퓨터에서 : http://localhost:${PORT}`);
      if (lan.length) {
        console.log('');
        console.log('  📱 폰·태블릿에서는 아래 주소를 주소창에 그대로 치세요');
        console.log('     (같은 와이파이에 연결되어 있어야 합니다)');
        for (const ip of lan) console.log(`       http://${ip}:${PORT}`);
      }
    }

    console.log('  ─────────────────────────────────────────────');
    console.log(`  계정 저장    : ${store.kind === 'upstash' ? 'Upstash (바깥 데이터베이스)' : store.where}`);
    console.log(`  세션 서명 키 : ${EPHEMERAL_SECRET ? '임시 (재시작하면 재접속 필요)' : '환경변수에서 읽음'}`);
    console.log(`  콘텐츠 v${v.version} : ${content.CONTENT_DIR}${copied ? ` (${copied}개 복사됨)` : ''}`);
    console.log('  → 그 폴더의 표를 고치고 저장하면 검사 후 자동으로 새 버전이 배포됩니다.');

    // 운영자 창에서 정해 둔 문서가 있으면 그것부터 되살린다(0.51).
    // 이걸 빼먹으면 서버가 자다 깨어날 때마다 옛 문서로 돌아간다.
    // (여기는 async 가 아니라 then 으로 받는다. 되살아나기 전에 한 번쯤 옛 문서를
    //  보더라도, 다음 확인부터는 새 문서를 본다 — 시작을 늦추지 않는 편이 낫다)
    Promise.resolve(store.getDoc('sheetId'))
      .then((saved) => { if (saved) sheetsync.setSavedId(saved); })
      .catch(() => { /* 못 읽어도 환경변수·SOURCE.txt 로 굴러간다 */ });

    const sheetCfg = sheetsync.config();
    if (sheetCfg.enabled) {
      console.log(
        `  구글 시트   : 연결됨${
          sheetCfg.from === 'file' ? ' (sheets/SOURCE.txt)'
            : sheetCfg.from === 'saved' ? ' (운영자 창에서 정한 문서)' : ''
        }${
          sheetCfg.pollMs
            ? ` — ${sheetCfg.pollMs / 60000}분마다 확인${sheetCfg.pollDefaulted ? ' (기본값)' : ''}`
            : ' — 자동 확인 꺼짐(SHEET_POLL_MIN=0)'
        }`
      );
      if (!sheetCfg.pollMs) {
        console.log('  ⚠ 시트를 고쳐도 서버가 읽지 않습니다. 관리자 창의 "시트 지금 읽기" 로만 반영됩니다.');
      }
      sheetsync.startPolling(
        process.env,
        (r) => announceContent(r.version, '구글 시트'),
        pauseContentWatch
      );
    } else {
      // 조용히 넘어가면 "왜 시트가 반영이 안 되지" 를 로그에서 알 수 없다.
      console.log('  구글 시트   : 안 씀 — SHEET_ID 도 sheets/SOURCE.txt 도 없습니다');
    }

    if (ADMIN_KEY) {
      console.log(`  운영자 계정 : ${ADMIN_ID}${adminSeed.made ? ' (지금 만들었습니다)' : ''}`);
      if (adminSeed.made && !process.env.ADMIN_PW) {
        console.log(`  ⚠ 비밀번호가 기본값(${adminSeed.pw}) 입니다. 공개 서버라면 바꾸세요`);
        console.log('     — ADMIN_PW 를 정하고 계정을 지운 뒤 다시 켜면 새 비밀번호로 만들어집니다.');
      }
    }

    const warn = startupWarnings();
    if (warn.length) {
      console.log('');
      console.log('  ⚠ 확인하세요');
      for (const lines of warn) {
        console.log(`     · ${lines[0]}`);
        for (const extra of lines.slice(1)) console.log(`       ${extra}`);
      }
    }
    console.log('');
  });
}

start();
