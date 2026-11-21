// 미리보기 바탕 — 진짜 게임 들판을 찍되 주인공 · 몬스터는 치운다
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8899/index.html');
  await page.waitForTimeout(1200);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', 'bg' + (process.pid % 100000));
  for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
  for (const btn of await page.$$('button')) { const t = (await btn.innerText()).trim(); if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; } }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(async ([map, x, y]) => {
    const g = window.__game;
    g.changeMap(map, x, y);
    await new Promise((r) => setTimeout(r, 600));
    const st = g.store.state, p = st.player;
    for (const o of st.monsters) { o.tx += 60; o.fromTx = o.tx; o.px += 60 * 32; o.thinkTimer = 1e9; }
    g.encounter.startCooldown(1e9);
    p.body = null; p.rawSprite = true; p.sprite = '__none__';
    const draw = g.renderer.drawSprite.bind(g.renderer);
    g.renderer.drawSprite = (key, ...rest) => { if (key === '__none__') return; return draw(key, ...rest); };
    const shadow = g.renderer.drawShadow.bind(g.renderer);
    g.renderer.drawShadow = (x, y, w, o) => { if (Math.abs(x - p.px) < 2 && Math.abs(y - (p.py - 3)) < 2) return; shadow(x, y, w, o); };
    await new Promise((r) => setTimeout(r, 3000));
    const c = document.querySelector('#game-canvas').getBoundingClientRect();
    return { cam: { ...g.renderer.camera }, p: { px: p.px, py: p.py }, canvas: { x: c.x, y: c.y, w: c.width, h: c.height } };
  }, [process.env.MAP || 'field_1', +(process.env.PX || 20), +(process.env.PY || 15)]);
  const c = info.canvas;
  await page.screenshot({ path: __dirname + '/bg/field.png', clip: { x: c.x, y: c.y, width: c.w, height: c.h } });
  require('fs').writeFileSync(__dirname + '/bg/field.json', JSON.stringify(info));
  console.log(JSON.stringify(info));
  await browser.close();
})();
