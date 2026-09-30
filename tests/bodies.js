// 새 몸 그림 (0.70.26) — 직업과 따로 고르는 몸(남·여 × 깨끗한·거친 차림), 희귀도마다 다른 장비 층.
//
// ⚠ 성질을 잰다: "몸을 고르면 그 몸으로 저장된다", "장비를 입으면 그림이 달라진다",
//   "등급이 다르면 그림도 다르다", "무기에 따라 전투 자세가 바뀐다". 픽셀 값을 적어 두지 않는다.
const { tally, boot, BASE, chromium, CHROME } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  // ① 새 계정 화면 — 성별·차림 단추와 직업 칸의 몸 그림
  {
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${BASE}/index.html`);
    await page.waitForTimeout(1400);
    // 0.70.27 — 타이틀 장면: 로고 그림 · 배경 그림 · 영웅 · 용이 실제로 읽혔는가
    await page.waitForTimeout(800);
    const title = await page.evaluate(() => {
      const ok = (sel) => { const im = document.querySelector(sel); return !!(im && im.complete && im.naturalWidth > 0); };
      const bg = getComputedStyle(document.querySelector('.ls-bg')).backgroundImage;
      return { logo: ok('.login-logo img'), heroes: ok('.ls-heroes'), dragon: ok('.ls-dragon'), bg: /url\(/.test(bg) };
    });
    check('접속 화면에 로고 · 배경 · 영웅 · 용 그림이 뜬다', title.logo && title.heroes && title.dragon && title.bg, JSON.stringify(title));
    await page.getByText('새 계정', { exact: true }).click();
    await page.waitForTimeout(300);
    const ui = await page.evaluate(() => ({
      genders: document.querySelectorAll('[data-gender]').length,
      styles: document.querySelectorAll('[data-style]').length,
      previews: document.querySelectorAll('canvas[data-preview-class]').length,
    }));
    check('새 계정 화면에 성별 단추 둘 · 차림 단추 둘', ui.genders === 2 && ui.styles === 2, JSON.stringify(ui));
    check('직업 칸마다 몸 그림(캔버스)', ui.previews >= 3, `${ui.previews}`);
    // 여 · 거친 차림을 고른다
    await page.click('[data-gender="f"]');
    await page.click('[data-style="rugged"]');
    await page.waitForTimeout(1500);
    const painted = await page.evaluate(() => {
      const cv = document.querySelector('canvas[data-preview-class]');
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
      return n / (cv.width * cv.height);
    });
    check('고른 몸이 직업 칸에 그려진다', painted > 0.15, `${(painted * 100).toFixed(0)}%`);
    await page.fill('input[name="id"]', 'bodyf' + process.pid);
    for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
    for (const btn of await page.$$('button')) {
      const t = (await btn.innerText()).trim();
      if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
    }
    await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async () => {
      const Acc = await import('/src/systems/AccountSystem.js');
      const s = window.__game.store.state;
      return { body: s.player.body, saved: Acc.serializeSave(s).body };
    });
    check('고른 몸(여 · 거친)으로 태어난다', r.body === 'f2', r.body);
    check('세이브에 몸이 들어간다', r.saved === 'f2', r.saved);
    check('새 계정 화면에서 오류가 없다', errs.length === 0, errs.join(' | '));
    await browser.close();
  }

  // ② 게임 안 — 들판 그림 · 장비 층 · 전투 그림
  const { browser, page, errs } = await boot('bodies');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.store.state;
    const bl = g.bodyLook;
    const E = await import('/src/systems/EquipmentSystem.js');
    const SB = await import('/src/entities/StatBlock.js');
    const out = { body: s.player.body, bodies: bl.list().map((b) => b.id) };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const pix = (a) => {
      const c = document.createElement('canvas');
      c.width = a.srcW; c.height = a.srcH;
      const x = c.getContext('2d');
      x.drawImage(a.image, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 3] - b[i + 3]) > 30) n++; return n; };
    const opaque = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; };

    // 맨몸 서기
    const bare = bl.get(s.player.body, 'stand', {});
    await bl.prefetch(s.player.body, {});
    await wait(200);
    out.bareOpaque = opaque(pix(bare)) / (bare.srcW * bare.srcH);
    out.bareSize = [bare.w, bare.h, bare.srcW];
    // 들판에서 실제로 그리는 그림이 몸 그림인가
    g.fieldScene.render(g.renderer);
    // 같은 칸의 등급 둘 — 그림이 달라야 한다
    const items = s.db.items;
    const byRar = (slot, rar) => Object.entries(items).find(([, d]) => d.slot === slot && d.rarity === rar);
    const a0 = byRar('armor', 'common'), a4 = byRar('armor', 'legendary') || byRar('armor', 'epic');
    const L0 = { armor: a0[0] }, L4 = { armor: a4[0] };
    await bl.prefetch(s.player.body, L0); await bl.prefetch(s.player.body, L4);
    await wait(200);
    const p0 = pix(bl.get(s.player.body, 'stand', L0)), p4 = pix(bl.get(s.player.body, 'stand', L4));
    const pb = pix(bl.get(s.player.body, 'stand', {}));
    out.armorChanges = diff(pb, p0);
    out.tierDiffers = diff(p0, p4);
    // 무기 — 전투 자세가 무기를 따른다
    const bow = byRar('weapon', 'rare') && Object.entries(items).find(([id, d]) => d.slot === 'weapon' && (s.db.appearance.weapon[id] || {}).shape === 'bow');
    const sword = Object.entries(items).find(([id, d]) => d.slot === 'weapon' && (s.db.appearance.weapon[id] || {}).shape === 'sword');
    out.stanceBow = bl.battleScene('stance', { weapon: bow[0] });
    out.stanceSword = bl.battleScene('stance', { weapon: sword[0] });
    out.stanceFist = bl.battleScene('stance', {});
    // 실제로 입혀 보고 들판 그림이 바뀌는가(computeLook → BodyLook)
    const uid = 't_armor_body';
    s.inventory.push({ uid, id: a0[0], enhance: 0, count: 1 });
    const before = pix(bl.get(s.player.body, 'stand', SB.computeLook(s)));
    const eq = E.equip ? E.equip(s, uid) : null;
    await bl.prefetch(s.player.body, SB.computeLook(s));
    await wait(200);
    const after = pix(bl.get(s.player.body, 'stand', SB.computeLook(s)));
    out.equipOk = !!(eq && eq.ok !== false);
    out.equipChanges = diff(before, after);
    // 몸 바꾸기(캐릭터 창)
    g.bus.emit('ui:setBody', { body: 'f1' });
    out.switched = s.player.body;
    return out;
  });
  check('아무것도 안 누르면 기본 몸(남 · 깨끗)', r.body === 'm1', r.body);
  check('몸이 넷', r.bodies.length === 4, r.bodies.join(','));
  check('맨몸 그림이 비어 있지 않다', r.bareOpaque > 0.08, `${(r.bareOpaque * 100).toFixed(1)}%`);
  check('들판 그림은 2배 파일(160) · 정사각 틀을 조금 키워 그린다(80 이상)', r.bareSize[0] >= 80 && r.bareSize[0] === r.bareSize[1] && r.bareSize[2] === 160, JSON.stringify(r.bareSize));
  check('갑옷을 입으면 그림이 달라진다', r.armorChanges > 300, `${r.armorChanges}`);
  check('같은 칸이라도 등급이 다르면 그림이 다르다', r.tierDiffers > 300, `${r.tierDiffers}`);
  check('활을 들면 활 자세 · 칼을 들면 칼 자세 · 맨손이면 주먹', r.stanceBow === 'stance_bow' && r.stanceSword === 'stance_sword' && r.stanceFist === 'stance_fist',
    `${r.stanceBow} ${r.stanceSword} ${r.stanceFist}`);
  check('실제로 입으면 들판 그림이 바뀐다', r.equipOk && r.equipChanges > 300, `${r.equipOk} ${r.equipChanges}`);
  check('캐릭터 창에서 몸을 바꿀 수 있다', r.switched === 'f1', r.switched);

  // 전투 그림 — 몸 그림 셋(서기 · 자세 · 공격)이 전투에 넘어간다
  const b = await page.evaluate(() => {
    const g = window.__game;
    const a = g.bodyLook.get(g.store.state.player.body, 'bstand', {});
    return { w: a.w, h: a.h, src: a.srcW };
  });
  check('전투 그림은 4배 파일(320) · 몸이 예전 전투 그림(192×256)보다 작지 않다', b.w >= 320 && b.w === b.h && b.src === 320, JSON.stringify(b));
  // 다른 접속자 — 보내온 몸으로 그린다(몸을 안 보내는 옛 판이면 예전 직업 그림)
  const peer = await page.evaluate(() => {
    const g = window.__game;
    const s = g.store.state;
    const calls = [];
    const orig = g.bodyLook.get.bind(g.bodyLook);
    g.bodyLook.get = (body, scene, look) => { calls.push(body); return orig(body, scene, look); };
    const base = { t: 'state', map: s.map.id, tx: s.player.tx + 1, ty: s.player.ty, px: s.player.px + 32, py: s.player.py,
      dir: 'down', level: 5, name: '손님', look: {}, cls: 'ranger' };
    g.net.peers.set('peerA', { ...base, id: 'peerA', body: 'f2', lastSeen: g.net._now, nx: base.px, ny: base.py });
    g.net.peers.set('peerB', { ...base, id: 'peerB', px: base.px + 32, lastSeen: g.net._now, nx: base.px + 32, ny: base.py });
    g.scenes.render(g.renderer);
    g.bodyLook.get = orig;
    g.net.peers.delete('peerA'); g.net.peers.delete('peerB');
    return { f2: calls.filter((c) => c === 'f2').length, total: calls.length };
  });
  check('다른 접속자는 보내온 몸(여 · 거친)으로 그린다', peer.f2 >= 1, JSON.stringify(peer));
  check('몸을 안 보낸 접속자(옛 판)는 몸 그림을 부르지 않는다', peer.total === peer.f2 + 1, JSON.stringify(peer));
  check('게임 안에서 오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
