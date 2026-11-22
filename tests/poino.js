// 포이노(poinolunch) 주말의 게임 (0.80.27).
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   모듈(server/poino.js — 가짜 fetch · 시계)
//   · 꺼져 있으면(환경변수 없음) 아무것도 안 한다 · 평일 · 연결 없음이면 안 올린다
//   · 주말이면 그 주말 토요일 자리에 올린다 · 더 나은 기록만(시간은 짧게, 층은 높게) · 이름은 Firebase 키에 쓸 수 있는 것만
//   서버(가짜 Firebase 를 띄우고 창구를 두드린다)
//   · 로그인한 계정을 포이노 닉네임과 잇는다 · 한 이름에는 한 계정만 · 로그인 응답에 이어 둔 이름이 온다
//   · Lv.20 에 처음 닿으면 · 5단계 보스를 처음 눕히면 · 탑 층을 오르면 그 주말 자리에 올라간다(서버가 잰 값)
//   · 운영자는 잇지 못한다
const http = require('http');
const { startServer, hashPw } = require('./lib/server.js');
const { tally } = require('./lib/harness.js');
const { createPoino, weekendSatOf, cleanName } = require('../server/poino.js');
const { check, done } = tally();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 가짜 Firebase — identitytoolkit 로그인 + 실시간 DB REST(PUT · GET). 받은 것을 tree 에 쌓는다. */
function fakeFirebase() {
  const tree = {};
  const puts = [];
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      res.setHeader('Content-Type', 'application/json');
      if (u.pathname.endsWith('accounts:signInWithPassword')) {
        const b = JSON.parse(raw || '{}');
        if (b.email !== 'df@test' || b.password !== 'pw') { res.statusCode = 400; return res.end('{}'); }
        return res.end(JSON.stringify({ idToken: 'tok-1', expiresIn: '3600' }));
      }
      const m = /^\/(.*)\.json$/.exec(u.pathname);
      if (!m) { res.statusCode = 404; return res.end('{}'); }
      const keys = m[1].split('/').filter(Boolean).map(decodeURIComponent);
      if (req.method === 'PUT') {
        if (u.searchParams.get('auth') !== 'tok-1') { res.statusCode = 401; return res.end('{}'); }
        let at = tree;
        for (const k of keys.slice(0, -1)) at = at[k] = at[k] || {};
        at[keys[keys.length - 1]] = JSON.parse(raw);
        puts.push({ path: keys.join('/'), body: JSON.parse(raw) });
        return res.end(raw);
      }
      let at = tree;
      for (const k of keys) at = at && at[k];
      return res.end(JSON.stringify(at == null ? null : at));
    });
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ srv, tree, puts, url: `http://127.0.0.1:${srv.address().port}` })));
}

(async () => {
  // ══ 1. 모듈 ══════════════════════════════════════════════
  {
    const SAT = Date.UTC(2026, 10, 28, 3);      // 2026-11-28(토) 12:00 KST
    const SUN_LATE = Date.UTC(2026, 10, 29, 14, 59); // 일 23:59 KST
    const MON = Date.UTC(2026, 10, 30, 3);
    check('주말 판단 — 토 · 일은 그 토요일, 월요일은 아니다',
      weekendSatOf(SAT) === '2026-11-28' && weekendSatOf(SUN_LATE) === '2026-11-28' && weekendSatOf(MON) === null);
    check('포이노 이름 — Firebase 키에 못 쓰는 글자 · 너무 긴 이름은 받지 않는다',
      cleanName('김치찌개') === '김치찌개' && !cleanName('a.b') && !cleanName('a/b') && !cleanName('') && !cleanName('x'.repeat(21)));
    const docs = {};
    const store = { getDoc: async (k) => docs[k] || null, setDoc: async (k, v) => { docs[k] = v; } };
    const calls = [];
    const fetchImpl = async (url, opt) => {
      calls.push({ url, method: opt.method, body: opt.body });
      if (url.includes('signInWithPassword')) return { ok: true, json: async () => ({ idToken: 'T', expiresIn: '3600' }) };
      return { ok: true, json: async () => ({}) };
    };
    const env = { POINO_FB_API_KEY: 'k', POINO_FB_EMAIL: 'e', POINO_FB_PASSWORD: 'p', POINO_FB_DB_URL: 'https://db.example' };
    const off = createPoino({ store, env: {}, fetchImpl, now: () => SAT });
    const acct = { poino: '김치찌개', save: { classId: 'warrior', level: 12 } };
    const r0 = await off.record(acct, 'boss5', { ms: 300000 });
    let t = MON;
    const p = createPoino({ store, env, fetchImpl, now: () => t, log: () => {} });
    const r1 = await p.record(acct, 'boss5', { ms: 300000 });
    t = SAT;
    const r2 = await p.record({ save: {} }, 'boss5', { ms: 1000 });
    const r3 = await p.record(acct, 'boss5', { ms: 300000 });
    const r4 = await p.record(acct, 'boss5', { ms: 400000 });
    const r5 = await p.record(acct, 'boss5', { ms: 250000 });
    await p.record(acct, 'tower', { floor: 9 });
    const r6 = await p.record(acct, 'tower', { floor: 7 });
    const r7 = await p.record(acct, 'tower', { floor: 12 });
    const puts = calls.filter((c) => c.method === 'PUT');
    check('환경변수가 없으면 꺼져 있다 · 평일 · 연결 없음이면 안 올린다',
      !off.enabled && r0.skipped === 'off' && r1.skipped === 'weekday' && r2.skipped === 'nolink',
      JSON.stringify([r0, r1, r2]));
    check('주말이면 그 토요일 자리에 올린다(닉네임 · 직업 · 레벨 · 시각)',
      r3.ok && puts[0] && puts[0].url.startsWith('https://db.example/leaderboards/dragonfield_weekend/2026-11-28/boss5/' + encodeURIComponent('김치찌개') + '.json?auth=T')
        && JSON.parse(puts[0].body).ms === 300000 && JSON.parse(puts[0].body).cls === 'warrior' && JSON.parse(puts[0].body).level === 12,
      puts[0] && puts[0].url);
    check('더 나은 기록만 — 시간은 짧아질 때만, 층은 높아질 때만',
      r4.kept && r5.ok && !r5.kept && r6.kept && r7.ok && puts.length === 4,
      JSON.stringify({ r4, r6, n: puts.length }));
  }

  // ══ 2. 서버 ══════════════════════════════════════════════
  const fb = await fakeFirebase();
  // 주말 판단에 쓰는 시계만 이번 주(또는 다음) 토요일 12:00 KST 로 민다
  const KST = 9 * 3600e3;
  const k = new Date(Date.now() + KST);
  const toSat = ((6 - k.getUTCDay()) + 7) % 7;
  const satNoon = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate() + toSat, 3);
  const satKey = new Date(satNoon + KST).toISOString().slice(0, 10);
  const srv = await startServer({
    POINO_FB_API_KEY: 'k', POINO_FB_EMAIL: 'df@test', POINO_FB_PASSWORD: 'pw',
    POINO_FB_DB_URL: fb.url, POINO_FB_AUTH_URL: fb.url, POINO_CLOCK_SHIFT_MS: String(satNoon - Date.now()),
  });
  const { call } = srv;
  try {
    const mk = async (id, name, cls, level) => {
      const r = await call('/api/register', { id, hash: hashPw(id, 'pw1234'), name });
      await call('/api/save', { id, token: r.token, save: { v: 3, epoch: '0.80.20', name, classId: cls, level, hp: 10, mapId: 'poino', tx: 1, ty: 1, dir: 'down', equipment: {}, stats: {} } });
      return r.token;
    };
    const save = (id, token, cls, level) => call('/api/save', { id, token, save: { v: 3, epoch: '0.80.20', name: id, classId: cls, level, hp: 10, mapId: 'poino', tx: 1, ty: 1, dir: 'down', equipment: {}, stats: {} } });
    const t1 = await mk('pnA', '김씨', 'warrior', 18);
    const t2 = await mk('pnB', '라씨', 'mage', 10);
    const l1 = await call('/api/poino/link', { id: 'pnA', token: t1, name: '김치찌개' });
    const l2 = await call('/api/poino/link', { id: 'pnB', token: t2, name: '김치찌개' });
    const l3 = await call('/api/poino/link', { id: 'pnB', token: t2, name: '라면왕' });
    const bad = await call('/api/poino/link', { id: 'pnB', token: t2, name: 'a/b' });
    const relog = await call('/api/login', { id: 'pnA', hash: hashPw('pnA', 'pw1234') });
    check('로그인한 계정을 포이노 닉네임과 잇는다 · 한 이름에는 한 계정만 · 못 쓰는 이름은 거절',
      l1.ok && l1.name === '김치찌개' && !l2.ok && /이미 다른/.test(l2.reason) && l3.ok && !bad.ok, JSON.stringify({ l2, bad }));
    check('로그인 응답에 이어 둔 이름이 온다(게임이 다시 묻지 않게)', relog.poino === '김치찌개', String(relog.poino));

    // Lv.20 — 처음 닿을 때 한 번(시계가 조금 흐르게 1초 쉬고 저장)
    await wait(1100);
    await save('pnA', t1, 'warrior', 20);
    await save('pnA', t1, 'warrior', 21);
    // 5단계 보스(악마 정찰대장) — 처음 눕힐 때
    await wait(1100);
    await save('pnB', t2, 'mage', 12);
    const rk = await call('/api/rank/submit', { id: 'pnB', token: t2, boss: 'imp_captain', where: 'field_5' });
    // 탑 — 층을 오르면
    const st = await call('/api/tower/start', { id: 'pnA', token: t1, start: 1 });
    await wait(700);
    const c1 = await call('/api/tower/clear', { id: 'pnA', token: t1, runId: st.runId, floor: 1 });
    await wait(700);
    const c2 = await call('/api/tower/clear', { id: 'pnA', token: t1, runId: st.runId, floor: 2 });
    await wait(500);
    const W = fb.tree.leaderboards && fb.tree.leaderboards.dragonfield_weekend && fb.tree.leaderboards.dragonfield_weekend[satKey];
    const lv20 = W && W.lv20 && W.lv20['김치찌개'];
    const boss5 = W && W.boss5 && W.boss5['라면왕'];
    const tower = W && W.tower && W.tower['김치찌개'];
    check('Lv.20 에 처음 닿으면 그 주말 자리에 올라간다(서버가 잰 시간 · 한 번만)',
      lv20 && lv20.ms >= 1000 && lv20.level === 20 && lv20.cls === 'warrior' && fb.puts.filter((p) => p.path.endsWith('/lv20/김치찌개')).length === 1,
      JSON.stringify(lv20));
    check('5단계 보스를 처음 눕히면 올라간다', rk && boss5 && boss5.ms >= 1000 && boss5.cls === 'mage', JSON.stringify({ rk: rk && (rk.ok || rk.reason), boss5 }));
    check('탑 층을 오르면 가장 높은 층이 올라간다', c1.ok && c2.ok && tower && tower.floor === 2, JSON.stringify({ c1: c1.ok, c2: c2.ok, tower }));

    // 게임 — 포이노에서 #poino=닉네임 을 달고 들어오면 로그인 뒤 한 번 묻고, '연결' 이면 서버에 이어진다
    {
      const { chromium } = require('playwright');
      const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
      try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
        const errs = [];
        page.on('pageerror', (e) => errs.push(e.message));
        await page.goto(srv.base + '/index.html#poino=' + encodeURIComponent('제육덮밥'));
        await page.waitForTimeout(1500);
        const hashGone = await page.evaluate(() => !/poino/.test(location.hash));
        await page.getByText('새 계정', { exact: true }).click();
        const gid = 'pnG' + (process.pid % 100000);
        await page.fill('input[name="id"]', gid);
        for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
        for (const btn of await page.$$('button')) {
          const tx = (await btn.innerText()).trim();
          if (tx.includes('만들') || tx.includes('시작')) { await btn.click(); break; }
        }
        await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
        // 새 계정은 직업부터 고른다 — 닫으면 묻는 창이 뜬다
        await page.waitForTimeout(1500);
        await page.evaluate(() => {
          const p = window.__game.panels.classPickPanel;
          window.__game.store.state.needClassPick = 0;
          if (p && p.open) p.close();
        });
        let asked = false;
        for (let i = 0; i < 40 && !asked; i++) { await wait(250); asked = await page.evaluate(() => !!document.querySelector('.poino-ask')); }
        const text = asked ? await page.evaluate(() => document.querySelector('.poino-ask').innerText) : '';
        if (asked) await page.click('.poino-ask [data-yes]');
        await wait(1200);
        const me = await call('/api/login', { id: gid, hash: hashPw(gid, '2222test') });
        check('포이노에서 오면 주소의 이름표는 바로 지운다', hashGone);
        check('로그인 뒤 한 번 묻는다(포이노 닉네임이 보인다)', asked && /제육덮밥/.test(text), text.slice(0, 60));
        check("'연결' 을 누르면 서버에 이어진다", me.poino === '제육덮밥', String(me.poino));
        check('게임 오류 없음', errs.length === 0, errs.join(' / '));
      } finally { await browser.close(); }
    }

    // 운영자는 잇지 못한다
    const adm = await call('/api/login', { id: 'admin', hash: hashPw('admin', '@2222') }).catch(() => null);
    if (adm && adm.token) {
      const la = await call('/api/poino/link', { id: 'admin', token: adm.token, name: '관리자' });
      check('운영자는 포이노와 잇지 못한다', !la.ok, la.reason);
    }
  } finally {
    srv.stop();
    fb.srv.close();
  }
  done();
})();
