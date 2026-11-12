// 그래픽 다듬기 (0.70.39) — 화면에서 겹치던 것 · 잘리던 것 · 줄 맞춰 찍히던 것.
//
// ① 오른쪽 아래 「지금 있는 곳」 판이 단축칸 · 이모티콘 단추와 안 겹친다(긴 이름도 두 줄로)
// ② 맵 이름판이 떠 있는 동안 알림은 그 아래로 내려간다
// ③ 전투 기록이 주인공 · 내 HP 판과 안 겹친다
// ④ 쓰러진 순간부터 누운 몸 — 결과창보다 먼저
// ⑤ 화산 들판의 바위 무더기는 잿더미 위에 선 바위(현무암 바닥 칸이 아니다) · 무더기 넷이 다 같은 그림이 아니다
// ⑥ 나란한 탁자 두 칸은 긴 탁자 한 장
// ⑦ 굳은 용암 길은 여러 장 · 잿더미 가장자리 그림이 있다
// ⑧ 칸보다 큰 그림은 바닥을 다 깐 뒤에 굽는다(오른쪽이 다음 칸 바닥에 잘리지 않게)
//
// ⚠ 성질을 잰다 — 좌표 · 픽셀 값을 적어 두지 않는다.
const fs = require('fs');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  const field = read('src/scenes/FieldScene.js');
  // ⑧ 코드 — 큰 것은 바닥 칸을 도는 동안 모아 두었다가 다 깐 뒤에 굽는다
  const loopAt = field.indexOf('for (let ty = 0; ty < map.h; ty++) {', field.indexOf('const grown = [];'));
  const lateAt = field.indexOf('for (const g of grown) bake.drawSprite');
  check('큰 그림(GROWN)은 바닥을 다 깐 뒤에 굽는다', loopAt > 0 && lateAt > loopAt
    && !/GROWN\.has\(tile\.sprite\)\)\s*\{\s*bake\.drawSprite/.test(field));

  const { browser, page, errs } = await boot('polish');
  const wait = (ms) => page.waitForTimeout(ms);
  const rect = (sel) => page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e || e.hidden || !e.getClientRects().length) return null;
    const r = e.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
  const meet = (a, b) => !!a && !!b && a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;

  // ① 오른쪽 아래 판 — 이름이 긴 곳들
  const bad1 = [];
  let cut = [];
  for (const id of ['dungeon_3', 'field_12', 'castle', 'dungeon_5', 'poino']) {
    await page.evaluate((id) => window.__game.changeMap(id, 10, 10), id);
    await wait(500);
    const place = await rect('#hud .hud-place');
    const qs = await rect('.qs-root');
    const emo = await rect('.emote-root');
    if (meet(place, qs) || meet(place, emo)) bad1.push(id);
    cut = cut.concat(await page.evaluate(() => [...document.querySelectorAll('#hud .hp-where-a')]
      .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)));
  }
  check('「지금 있는 곳」 판이 단축칸 · 이모티콘 단추와 안 겹친다', bad1.length === 0, bad1.join(' '));
  check('윗줄(단계 · 층)이 잘리지 않는다', cut.length === 0, cut.join(' '));
  const lines = await page.evaluate(() => {
    window.__game.changeMap('dungeon_3', 10, 10);
    return [...document.querySelectorAll('#hud .hp-where > span')].map((e) => e.textContent);
  });
  check('긴 이름은 「단계 / 이름」 두 줄', lines.length === 2 && lines[0] === '지하감옥 3층' && lines[1] === '석상의 방', lines.join(' | '));

  // ② 이름판(캔버스 위 26~70px)이 떠 있는 동안 알림은 그 아래
  await page.evaluate(() => { window.__game.changeMap('poino', 19, 10); window.__game.bus.emit('toast', { text: '시험 알림' }); });
  await wait(400);
  const t2 = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const k = st.width / 640;
    const toast = document.querySelector('#toast-root .toast');
    const r = toast.getBoundingClientRect();
    return { top: (r.top - st.top) / k, banner: !!window.__game.fieldScene.banner };
  });
  check('이름판이 떠 있는 동안 알림은 이름판 아래(70px 밑)에 뜬다', t2.banner && t2.top >= 70, `top ${Math.round(t2.top)}`);
  await wait(3000);
  const t3 = await page.evaluate(() => document.getElementById('ui-layer').classList.contains('has-banner'));
  check('이름판이 사라지면 알림 자리도 돌아온다', !t3);

  // ③ · ④ 전투 — Lv.1 로 12단계 몬스터(반드시 진다)
  await page.evaluate(() => window.__game.changeMap('field_12', 20, 16));
  await wait(600);
  await page.evaluate(() => {
    const s = window.__game.store.state;
    const m = s.monsters.find((a) => !a.isBoss);
    window.__game.bus.emit('battle:request', { monsterUid: m.uid });
  });
  await wait(1300);
  const b3 = await page.evaluate(() => {
    const g = window.__game, st = document.getElementById('stage').getBoundingClientRect(), k = st.width / 640;
    const toStage = (r) => ({ l: (r.left - st.left) / k, r: (r.right - st.left) / k, t: (r.top - st.top) / k, b: (r.bottom - st.top) / k });
    const log = toStage(document.querySelector('.battle-log').getBoundingClientRect());
    const ply = toStage(document.querySelector('.fighter--player').getBoundingClientRect());
    const p = g.battleScene._slots.player;           // 몸 가운데(발에서 46px 위)
    const feet = p.y + 46;
    // 주인공 그림의 자리 — 발에서 위로 150px, 좌우 40px(그림보다 좁게 잡는다)
    const hero = { l: p.x - 40, r: p.x + 40, t: feet - 150, b: feet };
    return { log, ply, hero };
  });
  check('전투 기록이 주인공과 안 겹친다', !meet(b3.log, b3.hero), JSON.stringify(b3));
  check('전투 기록이 내 HP 판과 안 겹친다', !meet(b3.log, b3.ply));
  // 쓰러지는 순간을 기다린다 — 누운 몸이 결과창보다 먼저
  const b4 = await page.evaluate(async () => {
    const bs = window.__game.battleScene;
    const t0 = performance.now();
    while (!bs.playerDown && !bs.finished && performance.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 30));
    const downFirst = bs.playerDown && !bs.finished;
    const t1 = performance.now();
    while (!bs.finished && performance.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 30));
    return { downFirst, held: Math.round(performance.now() - t1), down: !!(bs.payload && bs.payload.player.downSprite) };
  });
  check('쓰러진 순간부터 누운 몸 — 결과창보다 먼저', b4.downFirst, JSON.stringify(b4));
  check('누운 몸을 잠깐(0.5초 넘게) 보여 준 뒤 결과창', b4.held >= 500, `${b4.held}ms`);
  check('주인공에게 누운 그림이 있다', b4.down);
  await page.evaluate(() => window.__game.bus.emit('battle:confirm'));
  await wait(600);

  // ⑤ · ⑥ · ⑦ 지도 그림
  const r5 = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const FS = await import('/src/scenes/FieldScene.js');
    const out = {};
    // grownLook 이 없으면(0.70.38) 자리마다 제 그림 그대로 — 그때의 동작으로 잰다
    const grown = FS.grownLook || ((map, t, x, y) => ({ key: t.sprite, x, y }));
    const look = (map, x, y) => grown(map, map.tileset[map.grid[y][x]], x, y, 32);
    for (const id of ['field_5', 'field_10', 'field_15', 'field_20', 'field_7', 'field_17']) {
      g.changeMap(id, 20, 16);
      await new Promise((r) => setTimeout(r, 150));
      const m = s.map;
      const sprites = new Set();
      let clusters = 0, same = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const t = m.tileset[m.grid[y][x]];
        if (t) sprites.add(t.sprite);
      }
      for (let y = 0; y < m.h - 1; y++) for (let x = 0; x < m.w - 1; x++) {
        const sp = (m.tileset[m.grid[y][x]] || {}).sprite;
        if (sp !== 'tile_rock' && sp !== 'tile_basalt_rock') continue;
        const four = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
        if (!four.every(([a, b]) => (m.tileset[m.grid[b][a]] || {}).sprite === sp)) continue;
        if ((m.tileset[m.grid[y][x - 1]] || {}).sprite === sp || (m.tileset[(m.grid[y - 1] || '')[x]] || {}).sprite === sp) continue;
        clusters++;
        const keys = new Set(four.map(([a, b]) => { const l = look(m, a, b); return `${l.key}:${l.flipX}`; }));
        if (keys.size === 1) same++;
      }
      out[id] = { basaltFloor: sprites.has('tile_basalt'), boulder: sprites.has('tile_basalt_rock') || sprites.has('tile_rock'), clusters, same };
    }
    // 탁자 — 여관 · 연금술사의 집
    const tables = {};
    for (const id of ['poino_inn', 'poino_alchemy']) {
      g.changeMap(id, 7, 8);
      await new Promise((r) => setTimeout(r, 150));
      const m = s.map;
      let pairs = 0, longs = 0, skipped = 0;
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const t = m.tileset[m.grid[y][x]];
        if (!t || t.sprite !== 'tile_table') continue;
        const l = grown(m, t, x, y, 32);
        if (!l) skipped++;
        else if (l.key === 'tile_table_long') longs++;
        if ((m.tileset[m.grid[y][x + 1]] || {}).sprite === 'tile_table' && (m.tileset[m.grid[y][x - 1]] || {}).sprite !== 'tile_table') pairs++;
      }
      tables[id] = { pairs, longs, skipped };
    }
    const A = g.renderer.assets;
    const art = ['tile_ash_path2', 'tile_ash_path3', 'tile_ash_path4', 'tile_edge_ash_n', 'tile_edge_ash_e', 'tile_edge_ash_s', 'tile_edge_ash_w',
      'tile_rock2', 'tile_rock3', 'tile_basalt_rock', 'tile_basalt_rock2', 'tile_basalt_rock3', 'tile_table_long'].filter((k) => !A.has(k));
    return { out, tables, art };
  });
  const volc = ['field_5', 'field_10', 'field_15', 'field_20'];
  check('화산 들판에 현무암 바닥 칸(네모 바탕) 바위가 없다', volc.every((id) => !r5.out[id].basaltFloor), JSON.stringify(r5.out));
  check('화산 들판의 바위 무더기는 잿더미 위에 선 바위', volc.every((id) => r5.out[id].boulder));
  const all = Object.values(r5.out);
  check('바위 무더기(2×2)를 찾았다', all.reduce((a, o) => a + o.clusters, 0) >= 6, String(all.reduce((a, o) => a + o.clusters, 0)));
  check('바위 무더기 넷이 다 같은 그림인 곳이 없다', all.every((o) => o.same === 0));
  const tb = Object.values(r5.tables);
  check('나란한 탁자 두 칸은 긴 탁자 한 장', tb.every((o) => o.pairs > 0 && o.longs === o.pairs && o.skipped === o.pairs), JSON.stringify(r5.tables));
  check('새 그림(용암 길 넷 · 잿더미 가장자리 · 바위 · 긴 탁자)이 다 실렸다', r5.art.length === 0, r5.art.join(' '));

  check('콘솔 오류 없음', errs.length === 0, errs.slice(0, 3).join(' | '));
  await browser.close();
  done();
})();
