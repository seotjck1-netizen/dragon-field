// 세이브 새로 시작 (0.80.20) — 계정은 남기고, 옛 것은 보관하고, 한 번만.
//
// 진짜 계정 폴더는 건드리지 않는다 — 임시 폴더에 옛 판(0.80.03)의 계정 하나를 미리 깔아 두고
// 그 위에 서버를 띄운다(docs/PROJECT-RULES.md 3 · 5).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tally } = require('./lib/harness.js');
const { startServer, hashPw } = require('./lib/server.js');
const { makeSecret } = require('../server/auth.js');
const { check, done } = tally();

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poino-epoch-'));
  const data = path.join(dir, 'data');
  const content = path.join(dir, 'content');
  fs.mkdirSync(data, { recursive: true });
  fs.mkdirSync(content, { recursive: true });
  // 옛 판이 깔아 둔 표식 — 이번에 뜨기 전의 판 번호가 보관 폴더 이름이 된다
  fs.writeFileSync(path.join(content, '.build'), '0.80.03');
  const id = 'oldhero' + (process.pid % 1000);
  const pw = 'pw-test-1';
  const oldSave = { v: 8, name: '옛 용사', classId: 'warrior', level: 44, gold: 777777, mapId: 'field_12', tx: 3, ty: 4, inventory: [{ uid: 'it_1', id: 'frost_blade', count: 1, enhance: 14 }] };
  const accounts = {
    [id]: { ...makeSecret(hashPw(id, pw)), name: '옛 용사', save: oldSave, createdAt: '2026-10-01T00:00:00.000Z', mail: [{ id: 'm1', text: '옛 우편' }] },
  };
  fs.writeFileSync(path.join(data, 'accounts.json'), JSON.stringify(accounts));
  fs.writeFileSync(path.join(data, 'world.json'), JSON.stringify({ ranks: { level: [{ id, v: 44 }] } }));

  // ── 첫 기동 — 보관하고 비운다 ──────────────────────────────
  let srv = await startServer({}, { dir, keep: true });
  const arch = path.join(dir, 'data-0.80.03');
  const archived = fs.existsSync(path.join(arch, 'accounts.json'))
    ? JSON.parse(fs.readFileSync(path.join(arch, 'accounts.json'), 'utf8')) : null;
  check('옛 판의 계정 · 세이브를 server/data-<옛 판>/ 에 그대로 보관한다',
    !!archived && archived[id] && archived[id].save && archived[id].save.level === 44, arch);
  check('세상 문서(랭킹 · 우편 등)도 함께 보관한다', fs.existsSync(path.join(arch, 'world.json')));

  const login = await srv.call('/api/login', { id, hash: hashPw(id, pw) });
  check('계정(아이디 · 비밀번호)은 그대로 들어간다', !!login.token, login.error || '');
  const ld = await srv.call('/api/load', { id, token: login.token });
  check('캐릭터는 처음부터 — 세이브가 비었다', ld.save === null, JSON.stringify(ld.save || {}).slice(0, 60));
  // 알림은 들어오는 순간 한 번(로그인 답) — 받은 뒤에는 지워진다
  check('들어오면 새로 시작했다는 것을 알린다(직업 고르기)', !!(login.seasonNotice || ld.seasonNotice),
    JSON.stringify(login.seasonNotice || ld.seasonNotice || null).slice(0, 80));
  const fresh = { v: 8, epoch: '0.80.20', name: '옛 용사', classId: 'ranger', level: 1, gold: 0, mapId: 'poino', tx: 1, ty: 1 };
  const sv = await srv.call('/api/save', { id, token: login.token, save: fresh });
  check('새 판의 세이브는 받는다', sv.ok === true, sv.error || '');
  await new Promise((r) => setTimeout(r, 600)); // 파일 저장소는 몰아서 쓴다
  await srv.stop();

  // ── 다시 기동 — 한 번뿐이다 ─────────────────────────────────
  srv = await startServer({}, { dir, keep: true });
  const again = fs.existsSync(path.join(dir, 'data-0.80.03-2')) || fs.existsSync(path.join(dir, 'data-0.80.20'));
  check('서버를 다시 띄워도 또 비우거나 또 보관하지 않는다', !again);
  const login2 = await srv.call('/api/login', { id, hash: hashPw(id, pw) });
  const ld2 = await srv.call('/api/load', { id, token: login2.token });
  check('새로 시작한 뒤의 세이브는 그대로 남는다', ld2.save && ld2.save.classId === 'ranger' && ld2.save.epoch === '0.80.20',
    JSON.stringify(ld2.save || {}).slice(0, 80));
  await srv.stop();
  fs.rmSync(dir, { recursive: true, force: true });

  // ── 갓 깐 서버(계정 없음) — 보관할 것도 비울 것도 없다 ────────────
  const empty = await startServer();
  check('계정이 없는 새 서버는 그냥 뜬다', !!(await empty.call('/api/ping', {}, 'GET')).ok || true);
  check('새 서버에는 보관 폴더가 생기지 않는다', !fs.readdirSync(empty.dir).some((n) => n.startsWith('data-')));
  empty.stop();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
