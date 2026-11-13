// 끝없는 탑 (0.80.22).
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   서버(창구를 직접 두드린다)
//   · 층은 하나씩만 오른다 — 건너뛴 층 · 남의 도전 번호 · 너무 빠른 층은 받지 않는다
//   · 시작 층은 이번 주에 오른 곳까지의 체크포인트만(1 · 11 · 21 …)
//   · 표의 레벨 · 직업은 서버가 가진 세이브에서 · 운영자는 표에 안 오른다
//   · 주가 바뀌면 지난 주 1 ~ 5위에게 우편 **한 번만** · 열려 있던 도전은 끝난다
//   게임(브라우저, 서버 없이)
//   · 탑지기가 마을에 있고 창이 열린다 · 층마다 전투 화면 한 판
//   · HP 는 층 사이에 이어 가고(여관에 다녀와도 그대로) 보스 층을 깨면 다 채운다
//   · 보상은 이번 주에 처음 깬 층만 · 지면 값 없이 끝나고 HP 를 채운다 · Esc 는 그만 오르기
//   · 세이브에 남는다 · 탑 업적
const { startServer, hashPw } = require('./lib/server.js');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const { createTower, weekOf, weekStart } = require('../server/tower.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ══ 1. 서버 창구 ══════════════════════════════════════════
  const srv = await startServer();
  const { call } = srv;
  try {
    const id = 'tw' + (process.pid % 10000);
    const reg = await call('/api/register', { id, hash: hashPw(id, 'pw1234'), name: '탑꾼' });
    const tok = reg.token;
    await call('/api/save', { id, token: tok, save: { v: 3, epoch: '0.80.20', name: '탑꾼', classId: 'ranger', level: 41, hp: 10, mapId: 'poino', tx: 1, ty: 1, dir: 'down', equipment: {}, stats: {} } });

    const bad11 = await call('/api/tower/start', { id, token: tok, start: 11 });
    check('이번 주에 안 오른 체크포인트로는 시작 못 한다', bad11.ok === false, JSON.stringify(bad11).slice(0, 90));
    const st = await call('/api/tower/start', { id, token: tok, start: 1 });
    check('1층부터 도전을 연다', st.ok === true && !!st.runId, JSON.stringify(st).slice(0, 90));
    await wait(700);
    const c1 = await call('/api/tower/clear', { id, token: tok, runId: st.runId, floor: 1 });
    check('1층을 받는다(처음 깬 층)', c1.ok && c1.first === true && c1.best === 1, JSON.stringify(c1));
    const skip = await call('/api/tower/clear', { id, token: tok, runId: st.runId, floor: 3 });
    check('층을 건너뛰면 받지 않는다', skip.ok === false && skip.expect === 2, JSON.stringify(skip));
    const fast = await call('/api/tower/clear', { id, token: tok, runId: st.runId, floor: 2 });
    check('너무 빨리 오른 층은 받지 않는다', fast.ok === false && fast.tooFast === true, JSON.stringify(fast));
    const forged = await call('/api/tower/clear', { id, token: tok, runId: 't_forged', floor: 2 });
    check('남의(지어낸) 도전 번호는 받지 않는다', forged.ok === false, JSON.stringify(forged));
    for (let f = 2; f <= 11; f++) { await wait(650); await call('/api/tower/clear', { id, token: tok, runId: st.runId, floor: f }); }
    const st11 = await call('/api/tower/start', { id, token: tok, start: 11 });
    check('10층을 넘으면 11층부터 시작할 수 있다', st11.ok === true, JSON.stringify(st11).slice(0, 90));
    await wait(700);
    const again = await call('/api/tower/clear', { id, token: tok, runId: st11.runId, floor: 11 });
    check('이미 깬 층은 다시 깨도 "처음" 이 아니다', again.ok && again.first === false, JSON.stringify(again));
    const old = await call('/api/tower/clear', { id, token: tok, runId: st.runId, floor: 12 });
    check('새 도전을 열면 옛 도전 번호는 끝난다', old.ok === false, JSON.stringify(old));

    const admin = await call('/api/login', { id: 'admin', hash: hashPw('admin', '@2222') });
    const ast = await call('/api/tower/start', { id: 'admin', token: admin.token, start: 1 });
    await wait(700);
    const ac = await call('/api/tower/clear', { id: 'admin', token: admin.token, runId: ast.runId, floor: 1 });
    const board = await call('/api/tower', { id, token: tok });
    const row = (board.top || []).find((r) => r.name === '탑꾼');
    check('표의 레벨 · 직업은 서버의 세이브에서', row && row.level === 41 && row.cls === 'ranger' && row.best === 11, JSON.stringify(row));
    check('운영자는 표에 안 오른다', ac.ok && ac.admin === true && !(board.top || []).some((r) => r.name === 'admin' || r.name === '운영자'),
      JSON.stringify({ ac, n: (board.top || []).length }));
    check('내 순위가 함께 온다', board.mine && board.mine.rank === 1 && board.mine.best === 11, JSON.stringify(board.mine));
    const guest = await call('/api/tower', {});
    check('표는 로그인 없이도 본다', Array.isArray(guest.top) && !guest.mine);
  } finally {
    srv.stop();
  }

  // ══ 2. 주가 바뀔 때(서버 모듈을 직접, 가짜 시계로) ═══════════
  {
    const docs = {};
    const store = { getDoc: async (k) => (k in docs ? docs[k] : null), setDoc: async (k, v) => { docs[k] = v; } };
    const mails = [];
    const T = createTower(store, {
      sendMail: async (to, m) => { mails.push({ to, ...m }); },
      isAdmin: (x) => x === 'admin',
      rules: { checkpointEvery: 10, minFloorMs: 0, weekly: [{ gold: 5 }, { gold: 3 }, { gold: 2 }, { gold: 1 }, { gold: 1 }] },
    });
    const w0 = weekOf(Date.UTC(2026, 10, 12, 3));
    const t0 = weekStart(w0) + 3600000;
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const reach = { a: 3, b: 7, c: 5, d: 7, e: 1, f: 2, g: 4 };
    let t = t0;
    for (const p of players) {
      const s = await T.start(p, { name: p, save: { level: 30, classId: 'mage' } }, 1, t);
      for (let f = 1; f <= reach[p]; f++) { t += 1000; await T.clear(p, { name: p, save: { level: 30, classId: 'mage' } }, s.runId, f, t); }
    }
    const open = await T.start('a', { name: 'a', save: {} }, 1, t);
    const next = weekStart(w0 + 1) + 60000;
    const late = await T.clear('a', { name: 'a', save: {} }, open.runId, 1, next);
    check('주가 바뀌면 열려 있던 도전은 끝난다', late.ok === false && late.ended === true, JSON.stringify(late));
    const sent1 = await T.settle(next);
    const sent2 = await T.settle(next + 5000);
    const order = mails.map((m) => m.to).join('');
    check('지난 주 1 ~ 5위에게 우편(같은 층이면 먼저 오른 사람이 위)', mails.length === 5 && order === 'bdcga',
      `${order} · ${mails.map((m) => m.gold).join(',')}`);
    check('우편은 한 번만 간다', sent1.length === 5 && sent2.length === 0, `${sent1.length} / ${sent2.length}`);
    const b = await T.board('b', next);
    check('새 주의 표는 비고, 지난 주 표가 남는다', b.top.length === 0 && b.prev.top.length === 7 && b.prev.mine.rank === 1,
      JSON.stringify({ now: b.top.length, prev: b.prev.top.length, mine: b.prev.mine }));
  }

  // ══ 3. 게임(서버 없이) ═══════════════════════════════════════
  const { browser, page, errs } = await boot('tower');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const Tw = await import('/src/systems/TowerSystem.js');
    const Acc = await import('/src/systems/AccountSystem.js');
    const St = await import('/src/entities/StatBlock.js');
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    const card = () => document.querySelector('.tower-result');
    const finish = async () => {
      for (let k = 0; k < 150 && !card(); k++) { try { g.battleScene.skipToEnd(); } catch { /* */ } await sleep(80); }
      return card() ? card().innerText.replace(/\s+/g, ' ') : '';
    };

    out.keeper = s.npcs.some((n) => (n.id || n.defId) === 'tower_keeper');
    // 레벨이 모자라면 못 오른다
    s.player.level = 5; g.store.notify();
    g.bus.emit('tower:start', { start: 1 }); await sleep(150);
    out.locked = !s.towerRun;

    // 같은 주 · 같은 층이면 같은 상대(순위가 공평하다)
    const p1 = Tw.floorPlan(s.db, 13, 2966).members.map((m) => m.defId).join();
    const p2 = Tw.floorPlan(s.db, 13, 2966).members.map((m) => m.defId).join();
    out.same = p1 === p2 && Tw.isBossFloor(s.db, 5) && !Tw.isBossFloor(s.db, 4);

    // 아주 센 몸으로 오른다(층 사이의 HP · 보스 층 회복을 보려고) — Lv.50 · 부위마다 가장 비싼 전설 +10
    const Eq = await import('/src/systems/EquipmentSystem.js');
    const Inv = await import('/src/systems/InventorySystem.js');
    s.player.level = 50;
    // 무기는 든 것을 그대로 키운다(대미지 = 5 + 덤 + 강화라 생김새와 상관없다) · 나머지 부위는 가장 비싼 것을 입힌다
    const wUid = s.player.equipment.weapon;
    const w = s.inventory.find((i) => i.uid === wUid);
    if (w) { w.grade = 'legendary'; w.plus = 5; w.enhance = 10; }
    const bySlot = {};
    for (const [id, d] of Object.entries(s.db.items)) {
      if (!d || !d.slot || d.slot === 'weapon' || d.type === 'consumable' || d.type === 'material') continue;
      if (!bySlot[d.slot] || (d.price || 0) > (s.db.items[bySlot[d.slot]].price || 0)) bySlot[d.slot] = id;
    }
    for (const id of Object.values(bySlot)) {
      const made = Inv.addItem(s, id, 1, { grade: 'legendary' });
      if (made[0]) { made[0].enhance = 10; made[0].plus = 5; Eq.equip(s, made[0].uid); }
    }
    g.store.notify();
    const hpMax = () => St.computePlayerStats(s).hp;
    g.bus.emit('ui:tower'); await sleep(150);
    out.panel = !!document.querySelector('#tower-panel .tower-panel') && !!document.querySelector('.tower-preview');
    const gold0 = s.player.gold;
    g.bus.emit('tower:start', { start: 1 }); await sleep(250);
    out.started = !!s.towerRun && g.scenes.current === g.battleScene && !g.panels.towerPanel.open;
    const t1 = await finish();
    out.first = { text: t1.slice(0, 60), gold: s.player.gold - gold0 };
    // 층 사이에 몸을 채워도(여관 · 물약) 탑 안의 몸은 그대로
    g.bus.emit('battle:confirm'); await sleep(400);
    out.carry = { runHp: s.towerRun && s.towerRun.hp, max: hpMax() };
    const t2 = await finish();
    out.floor2 = t2.slice(0, 40);
    // 4층까지 깬 뒤 5층(보스)을 깨면 HP 를 다 채운다
    let last = t2;
    for (let i = 0; i < 3 && s.towerRun; i++) { g.bus.emit('battle:confirm'); await sleep(400); last = await finish(); }
    out.boss = { text: last.slice(0, 80), hp: s.player.hp, max: hpMax(), floor: s.towerRun && s.towerRun.floor };
    // Esc — 그만 오르기
    g.bus.emit('tower:leave'); await sleep(300);
    out.left = !s.towerRun && g.scenes.current !== g.battleScene && g.panels.towerPanel.open;
    out.rec = { ...s.tower };

    // 다시 1층부터 — 이미 깬 층은 보상 없음
    const goldA = s.player.gold;
    g.bus.emit('tower:start', { start: 1 }); await sleep(250);
    const again = await finish();
    out.repeat = { text: again.slice(0, 40), gold: s.player.gold - goldA };
    g.bus.emit('tower:leave'); await sleep(300);

    // 지면 — 값 없이 끝나고 HP 를 채운다
    s.player.level = 15; g.store.notify();
    // 장비를 다 벗는다
    for (const k of Object.keys(s.player.equipment)) s.player.equipment[k] = null;
    s.inventory = s.inventory.filter((i) => !(s.db.items[i.id] || {}).use);
    g.store.notify();
    s.tower.best = 0;
    // 25층(감옥의 주인)에서 시작하는 것처럼 도전을 꾸민다
    s.towerRun = { runId: null, week: Tw.weekOf(), start: 25, floor: 24, hp: 50, mapId: s.map.id };
    const goldL = s.player.gold;
    g.bus.emit('tower:next'); await sleep(250);
    const lost = await finish();
    out.lose = { text: lost.slice(0, 60), gold: s.player.gold - goldL, hp: s.player.hp, max: hpMax(), run: !!s.towerRun };
    g.bus.emit('battle:confirm'); await sleep(300);
    out.lose.panel = g.panels.towerPanel.open;

    // 세이브에 남는다 · 업적
    s.tower.bestEver = 12; g.store.notify(); await sleep(80);
    const save = JSON.parse(JSON.stringify(Acc.serializeSave(s)));
    out.save = save.tower && save.tower.bestEver === 12 && Tw.normalize(save.tower).bestEver === 12;
    out.oldWeek = Tw.normalize({ week: 1, best: 30, bestEver: 30 }).best === 0;
    out.ach = !!s.codex.done.tower_10 && !s.codex.done.tower_25;
    return out;
  });

  check('탑지기가 마을에 있다', r.keeper);
  check('레벨이 모자라면 못 오른다', r.locked);
  check('같은 주 · 같은 층이면 같은 상대 · 5층마다 보스', r.same);
  check('탑지기 창이 열리고 다음 층을 미리 보여 준다', r.panel);
  check('오르면 창이 닫히고 전투 화면이 열린다', r.started);
  check('1층 — 처음 깬 층의 보상', /1층 돌파/.test(r.first.text) && r.first.gold > 0, JSON.stringify(r.first));
  check('층 사이의 HP 는 도전이 기억한다', r.carry.runHp > 0 && r.carry.runHp <= r.carry.max, JSON.stringify(r.carry));
  check('5층(보스)을 깨면 HP 를 다 채운다', /5층 돌파/.test(r.boss.text) && /HP 를 다 채웠다/.test(r.boss.text) && r.boss.hp === r.boss.max,
    JSON.stringify(r.boss));
  check('그만 오르기 — 도전이 끝나고 탑 창으로', r.left && r.rec.best >= 5, JSON.stringify(r.rec));
  check('이미 깬 층은 보상이 없다', /이미 깬 층/.test(r.repeat.text) && r.repeat.gold === 0, JSON.stringify(r.repeat));
  check('지면 값 없이 끝나고 HP 를 채운 채 탑 창으로', /쓰러졌다/.test(r.lose.text) && r.lose.gold === 0 && r.lose.hp === r.lose.max && !r.lose.run && r.lose.panel,
    JSON.stringify(r.lose));
  check('세이브에 남고, 지난 주 기록은 이번 주로 안 넘어온다', r.save && r.oldWeek);
  check('탑 업적(10층)', r.ach);
  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
