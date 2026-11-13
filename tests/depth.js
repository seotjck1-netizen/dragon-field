// 앞뒤(깊이) — 누가 누구를 가리는가. 자세한 사정은 docs/DEPTH.md 에 있다.
//
// 0.70.23 까지 `/tmp/batch78.js` · `/tmp/batch79.js` 로 나뉘어 돌던 것을
// 저장소 안으로 합쳐 옮겨 왔다(0.70.24 에 /tmp 의 시험이 통째로 사라졌다).
//
// 지키는 것:
//   · **사람은 물건에 안 가린다.** 물건의 네 방향 어디에 서도 마찬가지다.
//   · **몬스터·NPC 도 마찬가지다.** 몬스터는 싸울 상대다 — 사라지면 안 된다.
//   · 나무 **바로 뒤**는 몸이 가려도 맞다. 다만 **이름표까지 삼키면 안 된다.**
//   · 발밑이 같으면 **사람이 위**다.
const { tally, boot, installProbe } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('dep');
  await installProbe(page);

  // ══ 1. 사람이 물건에 안 가린다 ═════════════════════════
  const me = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('poino_inn', 7, 8);
    await new Promise((r) => setTimeout(r, 800));
    const grid = s.map.grid;
    let bx = -1, by = -1;
    for (let y = 0; y < grid.length && by < 0; y++)
      for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === '~') { bx = x; by = y; break; }
    if (bx < 0) return { noBed: true };

    const put = (tx, ty) => {
      const pl = s.player;
      pl.tx = pl.fromTx = tx; pl.ty = pl.fromTy = ty;
      pl.px = tx * T + T / 2; pl.py = ty * T + T;
      pl.moving = false; pl.hidden = false;
    };
    const out = {};
    for (const [name, dx, dy] of [['위', 0, -1], ['아래', 0, 2], ['왼쪽', -1, 0], ['오른쪽', 1, 0]]) {
      const tx = bx + dx, ty = by + dy;
      if (!grid[ty] || grid[ty][tx] === undefined) { out[name] = -1; continue; }
      put(tx, ty);
      const withMe = window.__occ.shot();     // ⚠ 먼저 그려야 카메라가 제자리다
      const r = window.__occ.box(s.player.px, s.player.py);
      s.player.hidden = true;                 // 내 몸만 지우고 같은 자리를 다시 그린다
      const without = window.__occ.shot();
      s.player.hidden = false;
      out[name] = window.__occ.diff(withMe, without, r);
    }
    // 침대 옆에서 반투명이 되지 않는다 (낮은 물건은 '가림' 겨루기에 안 낀다)
    put(bx - 1, by);
    window.__occ.shot();
    const fs = g.scenes.stack.find((x) => x._hidesPlayer) || g.scenes.current;
    out.fadedBeside = fs._hidesPlayer(g.renderer,
      { sprite: 'tile_bed', px: bx * T + T / 2, py: by * T + T }, s.player);
    return out;
  });
  check('여관에서 침대를 찾았다', !me.noBed);
  for (const dir of ['위', '아래', '왼쪽', '오른쪽']) {
    check(`침대 ${dir}에 서도 사람이 보인다`, me[dir] > 150, `${me[dir]} 픽셀`);
  }
  check('침대 옆에서 반투명이 되지 않는다', me.fadedBeside === false);

  // ══ 2. 몬스터도 물건에 안 가린다 ═══════════════════════
  const mon = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('field_1', 3, 15);
    await new Promise((r) => setTimeout(r, 900));
    const grid = s.map.grid, ts = s.map.tileset;
    // ⚠ **사방이 트인 나무는 들판에 없다** — 0.65 의 규칙이 외톨이 나무를
    //   덤불로 바꿔 놓기 때문이다. 트인 쪽이 가장 많은 나무를 고르고 그쪽만 잰다.
    const isTree = (x, y) => {
      const t = ts[grid[y] && grid[y][x]];
      return !!(t && t.sprite === 'tile_tree');
    };
    const free = (x, y) => {
      const t = ts[grid[y] && grid[y][x]];
      return !!(t && !t.solid);
    };
    const SIDES = [['위', 0, -1], ['아래', 0, 1], ['왼쪽', -1, 0], ['오른쪽', 1, 0]];
    let tx = -1, ty = -1, dirs = [];
    for (let y = 5; y < grid.length - 5; y++) {
      for (let x = 5; x < grid[0].length - 5; x++) {
        if (!isTree(x, y)) continue;
        const open = SIDES.filter(([, dx, dy]) => free(x + dx, y + dy));
        if (open.length > dirs.length) { tx = x; ty = y; dirs = open; }
        if (dirs.length === 4) break;
      }
      if (dirs.length === 4) break;
    }
    if (tx < 0 || dirs.length < 2) return { noTree: true };

    const pl = s.player;
    pl.tx = pl.fromTx = tx; pl.ty = pl.fromTy = ty + 1;
    pl.px = tx * T + T / 2; pl.py = (ty + 1) * T + T; pl.moving = false;
    window.__occ.shot();                      // 카메라를 새 지도에 앉힌다

    const m = s.monsters.find((q) => q.alive) || s.monsters[0];
    if (!m) return { noMonster: true };
    const place = (x, y) => {
      m.tx = m.fromTx = x; m.ty = m.fromTy = y;
      m.px = x * T + T / 2; m.py = y * T + T;
      m.moving = false; m.alive = true;
    };
    const measure = () => {
      const withIt = window.__occ.shot();
      const r = window.__occ.box(m.px, m.py);
      const tr = window.__occ.tagbox(m.px, m.py);
      m.alive = false;                        // 그놈만 지우고 같은 자리를 다시 그린다
      const without = window.__occ.shot();
      m.alive = true;
      return { body: window.__occ.diff(withIt, without, r),
               tag: window.__occ.diff(withIt, without, tr) };
    };
    const out = { dirs: dirs.map(([n]) => n) };
    for (const [name, dx, dy] of dirs) {
      place(tx + dx, ty + dy);
      out[name] = measure().body;
    }
    place(tx, ty - 1);                        // 나무 **바로 뒤**
    const behind = measure();
    out.behindBody = behind.body;
    out.behindTag = behind.tag;
    return out;
  });
  check('들판에서 옆이 트인 나무를 찾았다', !mon.noTree && !mon.noMonster,
    mon.dirs ? mon.dirs.join('·') : '');
  for (const dir of (mon.dirs || [])) {
    check(`나무 ${dir}에 선 몬스터가 보인다`, mon[dir] > 150, `${mon[dir]} 픽셀`);
  }
  // 나무 바로 뒤는 몸이 가려도 맞다 — 그게 나무의 일이다.
  // 다만 **거기 무언가 있다**는 말(이름표)까지 삼키면 안 된다.
  check('나무 뒤에 선 몬스터도 이름표는 보인다', mon.behindTag > 150,
    `몸 ${mon.behindBody} · 이름표 ${mon.behindTag} 픽셀`);

  // ══ 3. NPC 도 마찬가지다 ═══════════════════════════════
  const npc = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('poino_inn', 7, 8);
    await new Promise((r) => setTimeout(r, 900));
    if (!s.npcs.length) return { noNpc: true };
    const n = s.npcs[0];
    const grid = s.map.grid;
    let bx = -1, by = -1;
    for (let y = 0; y < grid.length && by < 0; y++)
      for (let x = 0; x < grid[0].length; x++) if (grid[y][x] === '~') { bx = x; by = y; break; }
    if (bx < 0) return { noBed: true };

    const pl = s.player;
    pl.tx = pl.fromTx = bx; pl.ty = pl.fromTy = by + 3;
    pl.px = bx * T + T / 2; pl.py = (by + 3) * T + T; pl.moving = false;
    window.__occ.shot();

    const out = {};
    const all = s.npcs.slice();
    for (const [name, dx, dy] of [['위', 0, -1], ['아래', 0, 2], ['왼쪽', -1, 0], ['오른쪽', 1, 0]]) {
      const nx = bx + dx, ny = by + dy;
      if (!grid[ny] || grid[ny][nx] === undefined) { out[name] = -1; continue; }
      n.tx = n.fromTx = nx; n.ty = n.fromTy = ny;
      n.px = nx * T + T / 2; n.py = ny * T + T; n.moving = false;
      s.npcs.length = 0; s.npcs.push(n);      // 다른 NPC 가 끼어들지 않게 하나만
      const withIt = window.__occ.shot();
      const r = window.__occ.box(n.px, n.py);
      s.npcs.length = 0;                       // 그 사람만 지운다
      const without = window.__occ.shot();
      s.npcs.length = 0; s.npcs.push(...all);
      out[name] = window.__occ.diff(withIt, without, r);
    }
    return out;
  });
  check('여관에서 NPC 와 침대를 찾았다', !npc.noNpc && !npc.noBed);
  for (const dir of ['위', '아래', '왼쪽', '오른쪽']) {
    check(`침대 ${dir}에 선 NPC 가 보인다`, npc[dir] > 150, `${npc[dir]} 픽셀`);
  }

  // ══ 4. 발밑이 같으면 사람이 위다 ═══════════════════════
  //
  // 규칙 자체를 소스에서 읽어 확인한다. 픽셀 시험이 무언가에 가려 못 잡을 때를
  // 대비한 **두 번째 눈**이다.
  const rule = await page.evaluate(async () => {
    const t = await (await fetch('/src/scenes/FieldScene.js')).text();
    return {
      zOf: /const zOf\s*=\s*\(q\)\s*=>\s*\(q\.kind === 'prop' \? 0 : 1\)/.test(t),
      sort: /actors\.sort\(\(a, b\) => \(a\.py - b\.py\) \|\| \(zOf\(a\) - zOf\(b\)\)\)/.test(t),
    };
  });
  check('발밑이 같을 때의 차례가 정해져 있다', rule.zOf && rule.sort,
    JSON.stringify(rule));

  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
