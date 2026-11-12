// 계정 · 우편 · 랭킹 — 돈과 남의 기록이 오가는 자리를 서버 쪽에서 지킨다.
//
// 0.70.24 에 시험 122개를 잃고 제일 먼저 되살린 것이다. 이 자리는 화면이 아니라
// **서버가** 지켜야 하는 규칙이라, 브라우저를 띄우지 않고 창구(API)를 직접 두드린다.
//
// 여기서 지키는 약속 (README · OPERATE.md 에 적힌 것들):
//   · 비밀번호는 서버에 **그대로 안 남는다**(해시의 해시)
//   · 예약된 아이디는 **만들 때만** 막는다 — 들어올 때는 안 막는다
//   · 세이브는 **납작한 한 겹**으로 오간다
//   · 랭킹의 레벨·직업은 **서버가 가진 세이브**에서 읽는다(손님이 보낸 값이 아니라)
//   · 랭킹의 시간은 **서버가 잰다**
//   · **운영자는 랭킹에 안 오른다** — 서버에서 막는다
//   · 우편은 **두 번 못 받는다**
//   · ADMIN_KEY 가 없으면 이벤트 발송 · 랭킹 초기화 · 운영자 창이 **전부 잠긴다**
//   · server/ · .env 는 **파일로 안 내준다**
const fs = require('fs');
const path = require('path');
const { startServer, hashPw } = require('./lib/server.js');

const ok = [], bad = [];
const check = (n, c, x = '') => (c ? ok : bad).push(n + (x ? ` — ${x}` : ''));

(async () => {
  const srv = await startServer();
  const { call } = srv;
  try {
    // ══ 1. 계정 ═══════════════════════════════════════════
    const id = 'tester' + (process.pid % 1000);
    const reg = await call('/api/register', { id, hash: hashPw(id, 'pw1234'), name: '시험꾼' });
    check('계정을 만든다', !!reg.token, reg.error || '');
    const dup = await call('/api/register', { id, hash: hashPw(id, 'other'), name: 'x' });
    check('같은 아이디는 두 번 못 만든다', !!dup.error, dup.error || '(막히지 않음)');
    const login = await call('/api/login', { id, hash: hashPw(id, 'pw1234') });
    check('맞는 비밀번호로 들어간다', !!login.token, login.error || '');
    const wrong = await call('/api/login', { id, hash: hashPw(id, 'nope') });
    check('틀린 비밀번호는 막는다', !wrong.token && !!wrong.error, wrong.error || '(들어가짐)');
    const ghost = await call('/api/login', { id: 'nobody' + process.pid, hash: hashPw('x', 'y') });
    // 있는 아이디인지 없는 아이디인지 알려 주지 않는다 — 계정 목록을 긁어 가지 못하게
    check('없는 아이디도 같은 말로 막는다(있는지 안 알려 준다)', ghost.error === wrong.error,
      `${ghost.error} / ${wrong.error}`);

    // 비밀번호가 파일에 그대로 안 남는다
    // ⚠ 서버는 계정 파일을 **모아서 쓴다**(250ms 늦춰 한 번에). 곧바로 읽으면 파일이
    //   아직 없어서, 아래 "비밀번호가 그대로 안 남는다" 가 **빈 글을 뒤져 통과**했다.
    //   아무것도 안 잰 통과였다 — 파일이 생길 때까지 기다린 뒤 읽는다.
    const file = path.join(srv.dir, 'data', 'accounts.json');
    for (let i = 0; i < 30 && !(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(id)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    check('계정 파일이 시험 폴더에 생긴다(진짜 폴더가 아니라)', raw.includes(id), file);
    check('비밀번호도, 게임이 보낸 해시도 그대로 안 남는다',
      !raw.includes('pw1234') && !raw.includes(hashPw(id, 'pw1234')));

    // ══ 2. 예약된 아이디 ════════════════════════════════════
    for (const bad2 of ['admin', 'Admin', 'adm1n', '운영자', 'gm']) {
      const r = await call('/api/register', { id: bad2, hash: hashPw(bad2, 'x') });
      check(`예약어로는 못 만든다 — ${bad2}`, !r.token && !!r.error, r.error || '(만들어짐)');
    }
    check('gmail 처럼 앞머리만 닮은 것은 만들 수 있다',
      !!(await call('/api/register', { id: 'gmail' + (process.pid % 100), hash: hashPw('g', 'x') })).token);
    // 운영자 계정은 서버가 켜질 때 만든다. 예약어라도 **들어오는 것**은 막으면 안 된다.
    const admin = await call('/api/login', { id: 'admin', hash: hashPw('admin', '@2222') });
    check('예약어 아이디(운영자)도 들어오는 것은 된다', !!admin.token, admin.error || '');

    // ══ 3. 세이브는 납작하게 오간다 ══════════════════════════
    const save = { v: 3, name: '시험꾼', classId: 'mage', level: 37, exp: 5, gold: 1234,
      hp: 90, mapId: 'field_3', tx: 5, ty: 6, dir: 'down', equipment: {}, stats: {} };
    const sv = await call('/api/save', { id, token: login.token, save });
    check('저장된다', sv.ok === true, sv.error || '');
    const ld = await call('/api/load', { id, token: login.token });
    check('되읽힌다 — 납작한 한 겹', ld.save && ld.save.level === 37 && ld.save.classId === 'mage' && !ld.save.player,
      JSON.stringify(ld.save || {}).slice(0, 80));
    const stolen = await call('/api/save', { id, token: 'forged', save: { ...save, gold: 9e9 } });
    check('남의(가짜) 토큰으로는 못 저장한다', !stolen.ok, stolen.error || '(저장됨)');

    // ══ 4. 랭킹 ═══════════════════════════════════════════
    // 손님은 레벨 1·전사·1초라고 **거짓말**을 보낸다. 표에는 서버의 세이브(37·마법사)와
    // 서버가 잰 시간이 올라가야 한다.
    await new Promise((r) => setTimeout(r, 1200));   // 서버 시계가 흐르게
    const sub = await call('/api/rank/submit', {
      id, token: login.token, boss: 'imp_captain', where: '5단계',
      level: 1, cls: 'warrior', ms: 1, playedMs: 1, time: 1,
    });
    check('보스 기록이 오른다', sub.ok === true, sub.reason || sub.error || '');
    const board = await call('/api/rank', { id, token: login.token });
    const rows = (board.rank && board.rank.imp_captain) || [];
    const mine = rows.find((r) => r.id === id || r.name === '시험꾼');
    check('표에서 내 줄을 찾았다', !!mine, JSON.stringify(rows).slice(0, 120));
    if (mine) {
      // 표의 줄은 레벨을 `lv` 로 적는다
      check('레벨은 서버 세이브에서 읽었다(손님이 보낸 1 이 아니라)', mine.lv === 37, `lv=${mine.lv}`);
      check('직업도 서버 세이브에서 읽었다', mine.cls === 'mage', `cls=${mine.cls}`);
      const ms = mine.ms ?? mine.playedMs ?? mine.time;
      check('시간은 서버가 쟀다(손님이 보낸 1ms 가 아니라)', Number(ms) >= 1000, `ms=${ms}`);
    }

    // 운영자는 안 오른다 — 게임이 안 보내는 것은 예의고, 막는 것은 서버다
    const adminSub = await call('/api/rank/submit', { id: 'admin', token: admin.token, boss: 'imp_captain' });
    check('운영자는 랭킹에 안 오른다(서버가 막는다)', adminSub.ok === false && adminSub.admin === true,
      JSON.stringify(adminSub).slice(0, 80));

    // ══ 5. 우편 ═══════════════════════════════════════════
    const noKey = await call('/api/event/send', { key: 'wrong', subject: 'x', items: [{ id: 'potion', n: 1 }] });
    check('틀린 열쇠로는 선물을 못 뿌린다', !noKey.ok && !!noKey.error, noKey.error || '');
    const ev = await call('/api/event/send', {
      key: 'testkey', subject: '시험 선물', body: '받으세요', items: [{ id: 'potion', n: 3 }],
    });
    check('맞는 열쇠로는 선물을 뿌린다', ev.ok === true, ev.error || '');
    const box = await call('/api/mail', { id, token: login.token });
    const gift = (box.mail || []).find((m) => (m.subject || '').includes('시험 선물'));
    check('선물이 우편함에 들어온다', !!gift, JSON.stringify(box.mail || []).slice(0, 100));
    if (gift) {
      const c1 = await call('/api/mail/claim', { id, token: login.token, mid: gift.mid });
      check('한 번은 받는다', c1.ok === true, c1.error || '');
      const c2 = await call('/api/mail/claim', { id, token: login.token, mid: gift.mid });
      check('두 번은 못 받는다', !c2.ok && !!c2.error, c2.error || '(두 번 받아짐)');
      const box2 = await call('/api/mail', { id, token: login.token });
      const dupGift = (box2.mail || []).filter((m) => (m.subject || '').includes('시험 선물'));
      check('다시 열어도 선물이 또 생기지 않는다', dupGift.length === 1, `${dupGift.length}통`);
    }

    // ══ 6. 파일로 안 내주는 것 ═══════════════════════════════
    for (const p of ['/server/server.js', '/server/data/accounts.json', '/.env', '/node_modules/playwright/package.json']) {
      const r = await fetch(srv.base + p);
      check(`${p} 는 안 내준다`, r.status === 403 || r.status === 404, `HTTP ${r.status}`);
    }
    const idx = await fetch(srv.base + '/index.html');
    check('게임 파일은 내준다', idx.status === 200, `HTTP ${idx.status}`);
  } finally {
    srv.stop();
  }

  // ══ 7. 열쇠 없는 서버 — 운영 기능이 **전부** 잠긴다 ═════════
  const bare = await startServer({ ADMIN_KEY: '' });
  try {
    const { call } = bare;
    const ev = await call('/api/event/send', { key: '', subject: 'x', items: [] });
    check('열쇠가 없으면 선물 발송이 잠긴다', !ev.ok && !!ev.error, ev.error || '');
    const rr = await call('/api/rank/reset', { key: '' });
    check('열쇠가 없으면 랭킹 초기화가 잠긴다', !rr.cleared && !!rr.error, rr.error || '');
    const a = await call('/api/login', { id: 'admin', hash: hashPw('admin', '@2222') });
    check('열쇠가 없으면 운영자 계정을 만들지 않는다(@2222 로 못 들어온다)', !a.token, a.error || '(들어가짐)');
    const uid = 'plain' + (process.pid % 1000);
    const r = await call('/api/register', { id: uid, hash: hashPw(uid, 'pw') });
    const me = await call('/api/admin/me', { id: uid, token: r.token });
    check('열쇠가 없으면 운영자 창이 없다', me.admin === false && me.reason === 'no-key', JSON.stringify(me));
    const list = await call('/api/admin/accounts', { id: uid, token: r.token });
    check('열쇠가 없으면 계정 목록도 잠긴다', !list.accounts && !!list.error, list.error || '');
  } finally {
    bare.stop();
  }

  // 진짜 계정 폴더를 안 건드렸다 — 이 시험이 지키려는 것 중 가장 중요하다
  const real = path.join(__dirname, '..', 'server', 'data', 'accounts.json');
  const realNow = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : '';
  check('진짜 계정 파일에 시험 계정이 안 들어갔다', !realNow.includes('tester'), real);

  console.log('');
  for (const s of ok) console.log('  ✓', s);
  for (const s of bad) console.log('  ✗', s);
  console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
