// 결투장 (0.80.24).
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   싸움(DuelSystem — 서버와 게임이 같은 코드)
//   · 같은 씨앗이면 같은 판 · 받는 쪽도 제 직업 특성을 쓴다(사냥꾼 회피 · 마법사 보호막 · 용사 반격)
//   · 끝없이 안 끝나면 상한에서 무승부 · 점수: 센 상대를 이기면 더 오르고, 받는 쪽은 절반만 움직인다
//   서버(창구를 직접 두드린다)
//   · 몸을 올린 사람이 상대 후보가 된다 · 보여 준 상대 가운데서만 걸 수 있다 · 하루 5판
//   · 싸움은 서버가 계산하고 두 사람의 점수 · 기록이 바뀐다 · 표의 레벨 · 직업은 서버 세이브에서
//   · 운영자는 후보에도 표에도 없다 · 주가 바뀌면 건 사람 가운데 1 ~ 5위에게 우편 한 번
//   게임(서버를 띄워 브라우저로)
//   · 관리인이 마을에 있다 · 창이 열리고 상대를 받는다 · 걸면 전투 화면에서 상대가 마주 서고(뒤집힌 그림)
//     결과창에 점수가 나온다 · 결투는 진짜 HP 를 깎지 않는다
const { startServer, hashPw } = require('./lib/server.js');
const { tally } = require('./lib/harness.js');
const { check, done } = tally();
const { createArena } = require('../server/arena.js');
const { weekOf, weekStart } = require('../server/tower.js');
const { chromium } = require('playwright');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const D = await import('../src/systems/DuelSystem.js');

  // ══ 1. 싸움 ══════════════════════════════════════════════
  const body = (cls, over = {}) => D.sanitizeSnapshot({
    name: cls, level: 40, classId: cls,
    stats: { hp: 3000, atk: 600, def: 400, spd: 20, crit: 0.1, ...(over.stats || {}) },
    mods: over.mods || {},
    traits: over.traits || {},
    weaponShape: over.shape || null,
  });
  const W = body('warrior', { traits: { counter: 0.5, counterPower: 0.6, lastStand: 0.5 } });
  const Rg = body('ranger', { traits: { evade: 0.3, evadeAfterHit: 1, opener: 1, openerPower: 1.5, openerWeapon: 'bow' }, shape: 'bow' });
  const M = body('mage', { traits: { shieldOnFatal: 1, shieldTurns: 2, school: 'magic', duelReduction: 0.2 } });
  const r1 = D.simulateDuel({ a: W, b: Rg, seed: 7 });
  const r2 = D.simulateDuel({ a: W, b: Rg, seed: 7 });
  check('같은 씨앗이면 같은 판', JSON.stringify(r1) === JSON.stringify(r2) && r1.turns.length > 3);
  let defEvade = 0, defShield = 0, defCounter = 0, atkOpen = 0;
  for (let s = 1; s <= 40; s++) {
    const a = D.simulateDuel({ a: W, b: Rg, seed: s });
    defEvade += a.turns.filter((t) => t.type === 'miss' && t.target === 'monster').length;
    const b = D.simulateDuel({ a: W, b: M, seed: s });
    defShield += b.turns.filter((t) => t.shielded && t.target === 'monster').length;
    const c = D.simulateDuel({ a: Rg, b: W, seed: s });
    defCounter += c.turns.filter((t) => t.tag === 'counter' && t.actor === 'monster').length;
    atkOpen += c.turns.filter((t) => t.tag === 'opener' && t.actor === 'player').length;
  }
  check('받는 쪽도 제 직업 특성을 쓴다(회피 · 보호막 · 반격) · 거는 사냥꾼은 선제 사격', defEvade > 0 && defShield > 0 && defCounter > 0 && atkOpen > 0,
    JSON.stringify({ defEvade, defShield, defCounter, atkOpen }));
  const wall = body('x', { stats: { hp: 1e8, atk: 1, def: 1e6, spd: 10, crit: 0 } });
  const stuck = D.simulateDuel({ a: wall, b: wall, seed: 1 });
  check('끝나지 않는 판은 상한에서 무승부', stuck.winner === 'draw');
  const up = D.ratingDelta(1000, 1200, 'a');
  const even = D.ratingDelta(1000, 1000, 'a');
  check('센 상대를 이기면 더 오르고, 받는 쪽은 절반만 잃는다', up.a > even.a && even.a === 16 && even.b === -8, JSON.stringify({ up, even }));

  // ══ 2. 서버 창구 ═════════════════════════════════════════
  const srv = await startServer();
  const { call } = srv;
  const mk = async (id, name, cls, level) => {
    const r = await call('/api/register', { id, hash: hashPw(id, 'pw1234'), name });
    await call('/api/save', { id, token: r.token, save: { v: 3, epoch: '0.80.20', name, classId: cls, level, hp: 10, mapId: 'poino', tx: 1, ty: 1, dir: 'down', equipment: {}, stats: {} } });
    return r.token;
  };
  let browser = null;
  try {
    const pid = process.pid % 10000;
    const a = 'ara' + pid, b = 'arb' + pid, c = 'arc' + pid;
    const ta = await mk(a, '가람', 'warrior', 33);
    const tb = await mk(b, '나래', 'mage', 35);
    const tc = await mk(c, '다온', 'ranger', 10);
    const snap = (cls, lv) => ({ name: '거짓 이름', level: 99, classId: 'mage', stats: { hp: 2500, atk: 500, def: 300, spd: 20, crit: 0.1 }, mods: {}, traits: {} });
    const low = await call('/api/arena/snapshot', { id: c, token: tc, snapshot: snap() });
    check('레벨이 모자라면 몸을 못 올린다(레벨은 서버 세이브에서)', low.ok === false, JSON.stringify(low));
    await call('/api/arena/snapshot', { id: b, token: tb, snapshot: snap() });
    const off = await call('/api/arena/offer', { id: a, token: ta });
    check('몸을 올린 사람이 상대 후보가 된다', off.ok && off.list.some((x) => x.name === '나래'), JSON.stringify(off).slice(0, 160));
    const rogue = await call('/api/arena/fight', { id: a, token: ta, target: c, snapshot: snap() });
    check('보여 주지 않은 상대에게는 못 건다', rogue.ok === false, JSON.stringify(rogue));
    const f1 = await call('/api/arena/fight', { id: a, token: ta, target: b, snapshot: snap() });
    check('싸움은 서버가 계산해 돌려준다', f1.ok && f1.result && Array.isArray(f1.result.turns) && ['a', 'b', 'draw'].includes(f1.result.winner),
      JSON.stringify({ ok: f1.ok, w: f1.result && f1.result.winner, n: f1.result && f1.result.turns.length }));
    check('점수가 바뀌고 오늘 남은 판이 준다', f1.rating === 1000 + f1.delta && f1.left === 4, JSON.stringify({ r: f1.rating, d: f1.delta, left: f1.left }));
    const again = await call('/api/arena/fight', { id: a, token: ta, target: b, snapshot: snap() });
    check('건 판마다 상대를 새로 받아야 한다', again.ok === false && again.stale === true, JSON.stringify(again));
    for (let i = 0; i < 4; i++) {
      await call('/api/arena/offer', { id: a, token: ta });
      await call('/api/arena/fight', { id: a, token: ta, target: b, snapshot: snap() });
    }
    await call('/api/arena/offer', { id: a, token: ta });
    const sixth = await call('/api/arena/fight', { id: a, token: ta, target: b, snapshot: snap() });
    check('하루 5판', sixth.ok === false && sixth.left === 0, JSON.stringify(sixth));
    const boardA = await call('/api/arena', { id: a, token: ta });
    const rowA = (boardA.top || []).find((x) => x.name === '가람');
    check('표의 레벨 · 직업 · 이름은 서버 세이브에서', rowA && rowA.level === 33 && rowA.cls === 'warrior', JSON.stringify(rowA));
    const boardB = await call('/api/arena', { id: b, token: tb });
    check('받은 쪽에도 기록이 남는다(막았다)', (boardB.log || []).length === 5 && boardB.log.every((x) => x.role === 'defend'),
      JSON.stringify((boardB.log || []).slice(0, 2)));
    check('한 판도 안 건 사람은 표에 안 오른다', !(boardA.top || []).some((x) => x.name === '나래'));
    const admin = await call('/api/login', { id: 'admin', hash: hashPw('admin', '@2222') });
    await call('/api/save', { id: 'admin', token: admin.token, save: { v: 3, epoch: '0.80.20', name: '운영자', classId: 'mage', level: 50, hp: 10, mapId: 'poino', tx: 1, ty: 1, dir: 'down', equipment: {}, stats: {} } });
    await call('/api/arena/snapshot', { id: 'admin', token: admin.token, snapshot: snap() });
    const off2 = await call('/api/arena/offer', { id: b, token: tb });
    check('운영자는 상대 후보에 없다', off2.ok && !off2.list.some((x) => x.id === 'admin'), JSON.stringify(off2.list.map((x) => x.id)));
    const aoff = await call('/api/arena/offer', { id: 'admin', token: admin.token });
    const af = await call('/api/arena/fight', { id: 'admin', token: admin.token, target: aoff.list[0] && aoff.list[0].id, snapshot: snap() });
    const boardAfter = await call('/api/arena', {});
    check('운영자의 판은 점수에 안 들어간다', af.ok && af.admin === true && af.delta === 0 && !(boardAfter.top || []).some((x) => x.name === '운영자'),
      JSON.stringify({ ok: af.ok, admin: af.admin, d: af.delta }));

    // ══ 3. 주가 바뀔 때(서버 모듈을 직접, 가짜 시계로) ═══════
    {
      const docs = {};
      const store = { getDoc: async (k) => (k in docs ? docs[k] : null), setDoc: async (k, v) => { docs[k] = v; } };
      const mails = [];
      let n = 0;
      const ar = createArena(store, { duel: D, sendMail: async (to, m) => { mails.push({ to, ...m }); }, rules: { dailyFights: 99, offerCount: 3, unlockLevel: 1, weekly: [{ gold: 5 }, { gold: 3 }] }, rng: () => ((n = (n * 9301 + 49297) % 233280) / 233280) });
      const w0 = weekOf(Date.UTC(2026, 10, 12, 3));
      let t = weekStart(w0) + 3600000;
      const strong = { name: 's', level: 50, stats: { hp: 99999, atk: 9999, def: 999, spd: 99, crit: 0 }, mods: {}, traits: {} };
      const weak = { name: 'w', level: 50, stats: { hp: 10, atk: 1, def: 0, spd: 1, crit: 0 }, mods: {}, traits: {} };
      const acc = (nm) => ({ name: nm, save: { level: 50, classId: 'warrior' } });
      for (const p of ['p1', 'p2', 'p3']) await ar.putSnapshot(p, acc(p), weak, t);
      await ar.putSnapshot('champ', acc('champ'), strong, t);
      for (let i = 0; i < 3; i++) {
        t += 1000;
        const o = await ar.offer('champ', acc('champ'), t);
        await ar.fight('champ', acc('champ'), o.list[0].id, strong, t);
      }
      const next = weekStart(w0 + 1) + 60000;
      const s1 = await ar.settle(next);
      const s2 = await ar.settle(next + 1000);
      check('주가 바뀌면 건 사람 가운데 순위대로 우편 한 번', mails.length === 1 && mails[0].to === 'champ' && s1.length === 1 && s2.length === 0,
        JSON.stringify(mails.map((m) => [m.to, m.gold])));
      const b2 = await ar.board('champ', next);
      check('새 주의 점수는 처음부터', b2.me.rating === 1000 && b2.prev.mine && b2.prev.mine.rating > 1000, JSON.stringify({ now: b2.me, prev: b2.prev.mine }));
    }

    // ══ 4. 게임(서버를 띄워 브라우저로) ═════════════════════
    browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(srv.base + '/index.html');
    await page.waitForTimeout(1500);
    await page.getByText('새 계정', { exact: true }).click();
    await page.fill('input[name="id"]', 'arg' + pid);
    for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
    for (const btn of await page.$$('button')) {
      const tx = (await btn.innerText()).trim();
      if (tx.includes('만들') || tx.includes('시작')) { await btn.click(); break; }
    }
    await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
    await page.waitForTimeout(2500);
    const g = await page.evaluate(async () => {
      const gm = window.__game, s = gm.store.state;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      if (gm.panels.classPickPanel && gm.panels.classPickPanel.open) gm.panels.classPickPanel.close();
      const out = {};
      out.npc = s.npcs.some((n) => (n.id || n.defId) === 'arena_master');
      s.player.level = 30;
      gm.store.notify();
      await gm.saveNow();
      const hp0 = s.player.hp;
      gm.bus.emit('ui:arena');
      await sleep(1200);
      out.panel = gm.panels.arenaPanel.open && !!document.querySelector('#arena-panel .arena-panel');
      gm.bus.emit('arena:offer');
      for (let i = 0; i < 30 && !(s.arenaOffer && s.arenaOffer.list); i++) await sleep(100);
      out.offer = (s.arenaOffer && s.arenaOffer.list || []).map((x) => x.name);
      out.btn = document.querySelectorAll('#arena-panel [data-fight]').length;
      const target = s.arenaOffer && s.arenaOffer.list[0] && s.arenaOffer.list[0].id;
      const gold0 = s.player.gold;
      gm.bus.emit('arena:fight', { target });
      for (let i = 0; i < 60 && gm.scenes.current !== gm.battleScene; i++) await sleep(100);
      out.scene = gm.scenes.current === gm.battleScene;
      const mon = gm.battleScene.payload && gm.battleScene.payload.monsters && gm.battleScene.payload.monsters[0];
      out.mirror = !!(mon && mon.mirror) && /_battle$/.test((mon && mon.sprite) || '');
      for (let i = 0; i < 100 && !document.querySelector('.arena-result'); i++) { try { gm.battleScene.skipToEnd(); } catch { /* */ } await sleep(80); }
      const card = document.querySelector('.arena-result');
      out.card = card ? card.innerText.replace(/\s+/g, ' ') : '';
      out.goldUp = s.player.gold - gold0;
      gm.bus.emit('battle:confirm');
      await sleep(500);
      out.back = gm.panels.arenaPanel.open && gm.scenes.current !== gm.battleScene;
      out.hpSame = s.player.hp === hp0;
      return out;
    });
    check('결투장 관리인이 마을에 있다', g.npc);
    check('창이 열리고 상대를 받는다', g.panel && g.offer.length >= 1 && g.btn >= 1, JSON.stringify({ offer: g.offer, btn: g.btn }));
    check('걸면 전투 화면 — 상대는 사람 그림을 뒤집어 마주 세운다', g.scene && g.mirror);
    check('결과창에 점수가 나온다', /점수/.test(g.card) && /오늘 남은 판 4/.test(g.card), g.card.slice(0, 80));
    check('이기면 골드 · 결과창을 닫으면 결투장 창으로', (/승리/.test(g.card) ? g.goldUp > 0 : g.goldUp === 0) && g.back, JSON.stringify({ gold: g.goldUp, back: g.back }));
    check('결투는 진짜 HP 를 깎지 않는다', g.hpSame);
    check('오류 없음', errs.length === 0, errs.join(' / '));
  } finally {
    if (browser) await browser.close();
    srv.stop();
  }
  done();
})();
