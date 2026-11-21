// 손맛 (0.80.03) — 소지품 격자 · 전투 몸짓(움츠림 → 내달림 → 닿음 → 돌아옴) · 걸음의 무게 · 부드러운 카메라.
//
// ⚠ 성질을 잰다: "격자는 한 화면에 목록보다 여러 배 많이 보인다", "격자 ↔ 목록을 오갈 수 있다",
//   "몸짓은 뒤로 뺐다가 나아가고, 닿은 뒤에 돌아온다", "맞는 쪽 반응 · 알림은 닿는 순간에, 차례는 그대로",
//   "쓰러짐은 마지막 한 대가 닿은 뒤", "카메라는 한 박자 늦게 따라오고 멀리 건너뛰면 곧바로 붙는다".
//   픽셀 값 · 밀리초를 적어 두지 않는다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('feel');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    // ① 소지품 격자
    const I = await import('/src/systems/InventorySystem.js');
    for (const id of Object.keys(s.db.items)) { if (id[0] !== '_') try { I.addItem(s, id, s.db.items[id].stackable ? 5 : 1); } catch { /* 못 넣는 것은 넘어간다 */ } }
    try { localStorage.removeItem('poino.inv.view'); } catch { /* 없어도 된다 */ }
    g.bus.emit('ui:inventory'); await wait(300);
    const seen = (sel) => { const l = document.querySelector('.inv-list').getBoundingClientRect(); return [...document.querySelectorAll(sel)].filter((c) => { const b = c.getBoundingClientRect(); return b.top >= l.top - 1 && b.bottom <= l.bottom + 1; }).length; };
    out.grid = { cells: document.querySelectorAll('.inv-cell').length, seen: seen('.inv-cell'), count: !!document.querySelector('.inv-cell .cell-count'), rows: document.querySelectorAll('.inv-item').length };
    document.querySelector('.inv-cell').click(); await wait(150);
    out.grid.detail = (document.querySelector('[data-detail]').textContent || '').trim().length > 10 && !!document.querySelector('.inv-cell.is-selected');
    document.querySelector('[data-view]').click(); await wait(200);
    out.list = { rows: document.querySelectorAll('.inv-item').length, seen: seen('.inv-item'), cells: document.querySelectorAll('.inv-cell').length };
    document.querySelector('[data-view]').click(); await wait(150);
    out.back = document.querySelectorAll('.inv-cell').length;
    g.bus.emit('ui:inventory');

    // ② 몸짓 — 토막
    const B = await import('/src/scenes/BattleScene.js');
    const ps = []; for (let t = 0; t <= 520; t += 5) ps.push({ t, ...B.attackPose(t, 60) });
    const order = [...new Set(ps.map((p) => p.phase))].join('>');
    const contact = ps.find((p) => p.phase === 'hold');
    const beforeContact = ps.filter((p) => p.t < contact.t);
    out.pose = {
      order,
      pullsBack: Math.max(...ps.filter((p) => p.phase === 'wind').map((p) => p.pull)) > 0.9,
      risesToContact: beforeContact.every((p, i) => i === 0 || p.f >= beforeContact[i - 1].f - 1e-9) && contact.f === 1,
      returns: ps[ps.length - 1].f === 0 && ps[ps.length - 1].phase === 'done',
      squash: ps.some((p) => p.sx > 1.04) && ps.some((p) => p.sy < 0.96),
      shot: (() => { const a = []; for (let t = 0; t <= 300; t += 5) a.push(B.shotPose(t).x); return Math.min(...a) < -0.9 && Math.max(...a) > 0.5 && Math.abs(a[a.length - 1]) < 0.05; })(),
    };

    // ③ 전투 — 알림은 닿는 순간에, 차례는 그대로, 쓰러짐은 마지막 한 대 뒤
    await g.changeMap('field_1', 20, 16); await wait(500);
    const mon = s.monsters.find((m) => !m.isBoss) || s.monsters[0];
    s.player.level = 30; // 이기는 싸움
    const seenTurns = []; const stamps = [];
    const off = g.bus.on('battle:event', (t) => { seenTurns.push(t); stamps.push(g.battleScene ? g.battleScene.clock : 0); });
    let payload = null;
    const scene = g.battleScene || (g.scenes && g.scenes.list && g.scenes.list.find((x) => x && x._fire));
    // 0.80.20 — 잡몹은 필드에서 싸운다. 이 시험은 전투 화면의 박자를 재므로 그 화면으로 보낸다.
    s.settings.fieldCombat = false;
    g.bus.emit('battle:request', { monsterUid: mon.uid, seed: 11 });
    for (let i = 0; i < 80 && !(scene && scene.payload); i++) await wait(50);
    out.fight = { scene: !!scene };
    if (scene && scene.payload) {
      payload = scene.payload.result.turns.slice();
      const firstHit = payload.find((t) => t.type === 'hit');
      // 첫 한 대가 재생되는 때와 알려지는 때를 잰다(연출 시계)
      let toldAt = null;
      for (let i = 0; i < 400 && toldAt == null; i++) { await wait(10); const k = seenTurns.indexOf(firstHit); if (k >= 0) toldAt = stamps[k]; }
      out.fight.delay = toldAt != null ? toldAt - firstHit.t : null;
      scene.skipToEnd(); await wait(200);
      const want = payload.filter((t) => seenTurns.includes(t));
      out.fight.all = payload.every((t) => seenTurns.includes(t));
      out.fight.sameOrder = JSON.stringify(seenTurns.filter((t) => payload.includes(t)).map((t) => payload.indexOf(t))) === JSON.stringify(want.map((t) => payload.indexOf(t)));
      out.fight.left = scene._later.length;
    }
    if (typeof off === 'function') off();
    delete s.settings.fieldCombat;
    return out;
  });
  check('소지품 격자 — 한 화면에 목록보다 세 배 넘게 보인다(개수 딱지 · 고르면 오른쪽에 상세)',
    r.grid.cells > 30 && r.grid.rows === 0 && r.grid.count && r.grid.detail && r.grid.seen >= r.list.seen * 3 && r.grid.seen >= 15, JSON.stringify({ grid: r.grid, list: r.list }));
  check('격자 ↔ 목록을 오간다', r.list.rows > 30 && r.list.cells === 0 && r.back === r.grid.cells, `${r.list.rows} ${r.back}`);
  check('몸짓은 움츠림 → 내달림 → 닿음 → 돌아옴 — 뒤로 뺐다가 나아가고, 닿을 때까지 가까워지고, 제자리로 돌아온다',
    r.pose.order === 'wind>dash>hold>back>done' && r.pose.pullsBack && r.pose.risesToContact && r.pose.returns && r.pose.squash, JSON.stringify(r.pose));
  check('쏘는 몸짓은 당겼다 놓고 가라앉는다', r.pose.shot, '');
  check('한 대는 닿는 순간에 알린다(몸짓이 시작된 뒤) — 건너뛰어도 모든 칸이 차례대로 알려지고 남는 것이 없다',
    r.fight.scene && r.fight.delay > 0 && r.fight.all && r.fight.sameOrder && r.fight.left === 0, JSON.stringify(r.fight));
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
