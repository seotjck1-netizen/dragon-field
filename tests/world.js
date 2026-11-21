// 지도 빛깔 · 둥근 물 · 둥지와 지하감옥 꾸밈 · 마을 사람 뒷모습 · 여자 몸매와 갑옷 모양 (0.70.31)
// + 둥근 물가 대각선 걷기 · 지하감옥 불빛 · 꾸밈 밝기 (0.70.32).
//
// ⚠ 성질을 잰다: "빛깔이 있는 들판에서는 풀 그림이 바뀐다", "물 덩어리의 모서리는 땅이다",
//   "꾸밈이 길을 막지 않는다", "말을 걸면 돌아본다". 픽셀 값을 적어 두지 않는다.
const fs = require('fs');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  const maps = JSON.parse(read('src/data/maps.json'));
  const man = JSON.parse(read('src/data/manifest.json'));
  const npcs = JSON.parse(read('src/data/npcs.json'));

  // ── ① 지도 빛깔 표 ──────────────────────────────────────
  const tints = maps.tints || {};
  const badTint = Object.entries(maps.maps).filter(([, m]) => m.tint && !tints[m.tint]).map(([id, m]) => `${id}:${m.tint}`);
  check('지도 빛깔 표가 있다', Object.keys(tints).length >= 8, Object.keys(tints).join(' '));
  check('지도가 말하는 빛깔이 다 표에 있다', badTint.length === 0, badTint.join(' '));
  const tinted = Object.entries(maps.maps).filter(([, m]) => m.tint).map(([id]) => id);
  check('여러 들판이 제 빛깔을 가진다', tinted.length >= 10, tinted.join(' '));
  const sane = Object.entries(tints).filter(([, t]) => ['s', 'l', 'gs', 'gl'].some((k) => t[k] != null && !(t[k] > 0 && t[k] < 3))
    || (t.hue != null && !(t.hue >= 0 && t.hue < 360)));
  check('빛깔 값이 말이 된다(채도 · 밝기 0~3배, 색상 0~360°)', sane.length === 0, sane.map(([k]) => k).join(' '));

  // ── ② 꾸밈이 길을 막지 않는다(지하감옥 다섯 층 · 고룡의 둥지) ──────────
  const ts = maps.tileset;
  const reach = (m, from) => {
    const H = m.grid.length, W = m.grid[0].length;
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && ts[m.grid[y][x]] && !ts[m.grid[y][x]].solid;
    const seen = new Set([`${from.x},${from.y}`]);
    const q = [[from.x, from.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (!seen.has(k) && ok(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    return seen;
  };
  const blocked = [];
  const decorCount = {};
  for (const id of ['dungeon_1', 'dungeon_2', 'dungeon_3', 'dungeon_4', 'dungeon_5', 'dragon_lair']) {
    const m = maps.maps[id];
    if (!m || !Array.isArray(m.grid)) { blocked.push(`${id}: 격자 없음`); continue; }
    const p0 = m.portals[0];
    const got = reach(m, p0);
    const must = [...m.portals, ...(m.rooms || [])];
    for (const p of must) if (!got.has(`${p.x},${p.y}`)) blocked.push(`${id}(${p.x},${p.y})`);
    // 밟고 지나가는 바닥은 모두 이어져 있다(꾸밈 때문에 갇힌 바닥이 없다)
    let open = 0;
    m.grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ts[ch] && !ts[ch].solid) open++; }));
    if (got.size < open) blocked.push(`${id}: 닿지 않는 바닥 ${open - got.size}칸`);
    decorCount[id] = m.grid.join('').split('').filter((ch) => /[θικλμνξαβγδεζηο.{]/.test(ch)).length;
  }
  check('꾸밈이 길을 막지 않는다(포탈 · 방 · 모든 바닥이 이어져 있다)', blocked.length === 0, blocked.slice(0, 6).join(' '));
  check('지하감옥 다섯 층 · 둥지가 꾸며져 있다', Object.values(decorCount).every((n) => n >= 8), JSON.stringify(decorCount));

  // ── ③ 마을 사람은 모두 뒷모습이 있다 ─────────────────────
  //   웨이포인트 돌(npc_waypoint)은 사람이 아니라 물건이라 앞뒤가 같다 — 뺀다.
  const npcSprites = new Set(Object.values(npcs).map((d) => d && d.sprite).filter((s) => s && s.startsWith('npc_') && s !== 'npc_waypoint'));
  const noBack = [...npcSprites].filter((s) => !man[`${s}_back`]);
  check('마을 사람은 모두 뒷모습 그림이 있다(서 있는 사람도)', npcSprites.size > 5 && noBack.length === 0,
    `${npcSprites.size}명 · 없음: ${noBack.join(' ')}`);

  // ── ④ 사용자 지정 몸매 · 갑옷 규칙이 도구에 남아 있다 ──────────
  //   여자 몸 = 잘록한 허리 + 엉덩이(body-rig.CINCH), 남녀 갑옷 모양 맞바꿈 = 남자 갑옷 · 옷의 치맛자락이 퍼진다.
  const rig = read('tools/body-rig.py'), gear = read('tools/gear-art.py');
  const cinch = (rig.match(/^CINCH = \{([^}]*)\}/m) || [])[1] || '';
  check('여자 몸(f1 · f2)만 허리를 잘록하게 한다', /'f1'/.test(cinch) && /'f2'/.test(cinch) && !/'m[12]'/.test(cinch), cinch);
  check('갑옷 치맛자락은 남자 쪽이 퍼진다(남녀 갑옷 모양 맞바꿈)', /if not g\.female and flare > 0:/.test(gear));
  check('갑옷은 뒷면 그림(등판)을 따로 쓴다', /'armorB'/.test(gear) && /back_parts/.test(read('tools/body-game.py')));

  // ── ⑥ 둥근 물가를 대각선으로 돈다(걷는 판정 = 그림) — 지도 하나를 손으로 만들어 잰다 ───────
  const { pathToFileURL } = require('url');
  const M = await import(pathToFileURL(path.join(ROOT, 'src/systems/MovementSystem.js')).href);
  const WS = await import(pathToFileURL(path.join(ROOT, 'src/core/WaterShape.js')).href);
  const tileset = { G: { sprite: 'tile_grass', solid: false }, W: { sprite: 'tile_water', solid: true }, T: { sprite: 'tile_tree', solid: true } };
  const tmap = { w: 10, h: 8, tileset, grid: [
    'GGGGGGGGGG',
    'GGGGGGGGGG',
    'GGGWWWGGGG',
    'GGGWWWGGTG',
    'GGGWWWGGGG',
    'GGGGGGGGGG',
    'GWGGGGGGGG',
    'GGWGGGGGGG',
  ] };
  const who = (tx, ty) => ({ tx, ty, px: tx * 32, py: ty * 32, uid: 9, dir: 'down' });
  const stepOk = (tx, ty, dir) => M.tryStep(who(tx, ty), dir, tmap, []);
  check('물의 모양: 가운데는 물 · 곧은 물가는 반 · 바깥 모서리는 땅',
    WS.wetAt(tmap, 4.5 * 32, 3.5 * 32) > 0.9 && Math.abs(WS.wetAt(tmap, 3 * 32, 3.5 * 32) - 0.5) < 0.05 && WS.wetAt(tmap, 3 * 32, 2 * 32) < 0.35,
    [WS.wetAt(tmap, 4.5 * 32, 3.5 * 32), WS.wetAt(tmap, 3 * 32, 3.5 * 32), WS.wetAt(tmap, 3 * 32, 2 * 32)].map((v) => v.toFixed(2)).join(' '));
  check('연못의 둥근 모서리는 대각선으로 돌아간다(네 모서리 모두)',
    stepOk(2, 2, 'upright') && stepOk(6, 2, 'upleft') && stepOk(2, 4, 'downright') && stepOk(6, 4, 'downleft'));
  check('물로 곧장은 못 들어간다 · 나무 모서리는 그대로 못 뚫는다',
    !stepOk(2, 3, 'right') && !stepOk(7, 3, 'upright') && !stepOk(7, 3, 'downright'));
  check('대각선으로 붙은 두 물 칸 사이(물이 이어져 보이는 곳)는 못 지나간다', !stepOk(1, 7, 'upright'));

  // ── ⑤ 게임 안 ──────────────────────────────────────────
  const { browser, page, errs } = await boot('world');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, A = g.renderer.assets;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const pix = (a) => {
      const c = document.createElement('canvas');
      c.width = a.srcW || a.image.width; c.height = a.srcH || a.image.height;
      const x = c.getContext('2d');
      x.drawImage(a.image, 0, 0, c.width, c.height);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) n++; return n; };
    const out = {};
    const go = async (id, x, y) => { g.changeMap(id, x, y); await wait(500); g.scenes.render(g.renderer); await wait(100); g.scenes.render(g.renderer); };

    // 지도 빛깔 — 빛깔 있는 들판에서는 풀이 바뀌고, 물 · 표지판은 그대로, 빛깔 없는 땅에서는 원래 그림
    await go('field_4', 5, 15);
    out.tintId = A.tint && A.tint.id;
    const grassT = A.get('tile_grass'), waterT = A.get('tile_water');
    out.grassKey = grassT.key;
    out.waterKey = waterT.key;
    const raw = A.assets.get('tile_grass');
    out.grassDiff = diff(pix(raw), pix(grassT));
    await go('field_1', 5, 15);
    out.tintOff = A.tint ? A.tint.id : null;
    out.grassKeyOff = A.get('tile_grass').key;

    // 둥근 물 — 물 덩어리의 **바깥 모서리**는 땅빛, 가운데는 물빛(구운 바닥 판에서 잰다)
    const T = 32;
    const findWater = () => {
      const m = s.map;
      const wet = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && (m.tileset[m.grid[y][x]] || {}).sprite === 'tile_water';
      let corner = null, inner = null, n = 0;
      for (let y = 1; y < m.h - 1; y++) for (let x = 1; x < m.w - 1; x++) {
        if (!wet(x, y)) continue;
        n++;
        if (!corner && !wet(x - 1, y) && !wet(x, y - 1) && !wet(x - 1, y - 1) && wet(x + 1, y) && wet(x, y + 1)) corner = [x, y];
        if (!inner && [-1, 0, 1].every((dy) => [-1, 0, 1].every((dx) => wet(x + dx, y + dy)))) inner = [x, y];
      }
      return { corner, inner, n };
    };
    let w = null, wmap = null;
    for (const id of ['poino', 'field_1', 'field_2', 'field_3', 'field_5', 'field_10', 'field_11']) {
      await go(id, 5, 15);
      const f = findWater();
      if (f.corner && f.inner) { w = f; wmap = id; break; }
    }
    out.wmap = wmap;
    if (w) {
      const cv = g.fieldScene._ground && g.fieldScene._ground.canvas;
      const cx = cv.getContext('2d');
      const at = (px, py) => Array.from(cx.getImageData(px, py, 1, 1).data);
      const wm = (() => { const d = pix(A.get('tile_water')); let r = 0, gg = 0, b = 0, k = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; k++; } return [r / k, gg / k, b / k]; })();
      const dist = (p) => Math.abs(p[0] - wm[0]) + Math.abs(p[1] - wm[1]) + Math.abs(p[2] - wm[2]);
      const [cx0, cy0] = w.corner, [ix, iy] = w.inner;
      out.cornerD = dist(at(cx0 * T + 1, cy0 * T + 1));
      out.innerD = dist(at(ix * T + 16, iy * T + 16));
      // 칸 네모가 아니다 — 모서리 칸 안의 물빛 점이 네모(32×32)보다 적다
      let wetPx = 0;
      for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (dist(at(cx0 * T + x, cy0 * T + y)) < 90) wetPx++;
      out.cornerWet = wetPx;
      out.waterSolid = !!(s.map.tileset[s.map.grid[cy0][cx0]] || {}).solid;
    }

    // 마을 사람 — 위에서 말을 걸면 위(내 쪽)를 보고 돌아선다(뒷모습), 대화가 닫히면 원래대로
    await go('poino', 5, 15);
    const npc = s.npcs.find((n) => n.ty > 2 && !n.walks && g.renderer.assets.has(`${n.sprite}_back`)) || s.npcs[0];
    out.npcId = npc && npc.defId;
    if (npc) {
      const home = npc.dir || 'down';
      s.player.tx = npc.tx; s.player.ty = npc.ty - 1;
      g.talkToRef(npc);
      await wait(100);
      out.npcTurned = npc.dir;
      out.npcKey = g.fieldScene._walkKey(g.renderer, { sprite: npc.sprite, kind: 'npc', dir: npc.dir, moving: false });
      g.bus.emit('dialogue:closed');
      await wait(50);
      out.npcBack = npc.dir === home;
      g.fieldScene.resume && g.fieldScene.resume();
    }

    // 둥근 물 — 그린 물빛과 걷는 쪽이 읽는 물 값(WaterShape.wetAt)이 같다
    if (w) {
      const WS = await import('/src/core/WaterShape.js');
      const cv = g.fieldScene._ground.canvas, cx = cv.getContext('2d');
      const wm = (() => { const d = pix(A.get('tile_water')); let r = 0, gg = 0, b = 0, k = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; k++; } return [r / k, gg / k, b / k]; })();
      let agree = 0, n = 0;
      const [cx0, cy0] = w.corner;
      for (let y = (cy0 - 1) * T; y < (cy0 + 2) * T; y += 3) for (let x = (cx0 - 1) * T; x < (cx0 + 2) * T; x += 3) {
        const v = WS.wetAt(s.map, x + 0.5, y + 0.5);
        if (v > 0.4 && v < 0.6) continue;                 // 물가 띠(거품 · 젖은 그늘)는 뺀다
        const p = Array.from(cx.getImageData(x, y, 1, 1).data);
        const isW = Math.abs(p[0] - wm[0]) + Math.abs(p[1] - wm[1]) + Math.abs(p[2] - wm[2]) < 90;
        n++;
        if (isW === (v >= 0.5)) agree++;
      }
      out.waterAgree = n ? agree / n : 0;
      // 실제 지도에서도 둥근 모서리를 대각선으로 돈다(옆 두 칸이 땅일 때)
      const M = await import('/src/systems/MovementSystem.js');
      const land = (x, y) => !M.isSolid(s.map, x, y);
      out.cornerDiag = land(cx0 - 1, cy0) && land(cx0, cy0 - 1) && land(cx0 - 1, cy0 - 1)
        ? M.tryStep({ tx: cx0 - 1, ty: cy0, px: 0, py: 0, uid: 99, dir: 'right' }, 'upright', s.map, []) : 'skip';
    }

    // 지하감옥 불빛 — 횃불 둘레가 밝다 · 그 불빛 안에 선 몬스터는 시야 밖이어도 보인다 · 룬/석상 보석도 빛난다
    {
      const FS = await import('/src/scenes/FieldScene.js');
      const MV = await import('/src/systems/MovementSystem.js');
      // 횃불 하나(아래가 바닥)를 골라, 그 횃불이 화면 안 · 시야 밖(6~7칸)에 오는 자리에 선다
      await go('dungeon_1', 9, 20);
      {
        const m0 = s.map;
        let spot = null;
        for (let ty = 1; ty < m0.h - 1 && !spot; ty++) for (let tx = 1; tx < m0.w - 1 && !spot; tx++) {
          if (!(m0.tileset[m0.grid[ty][tx]] || {}).lit || MV.isSolid(m0, tx, ty + 1)) continue;
          for (const [dx, dy] of [[6, 1], [-6, 1], [6, 3], [-6, 3], [0, 6], [5, 4], [-5, 4], [7, 0], [-7, 0]]) {
            const x = tx + dx, y = ty + 1 + dy;
            if (x > 0 && y > 0 && x < m0.w && y < m0.h && !MV.isSolid(m0, x, y)) { spot = [x, y]; break; }
          }
        }
        if (spot) await go('dungeon_1', spot[0], spot[1]);
      }
      const m = s.map, P = s.player, fs_ = g.fieldScene;
      const sightPx = fs_._sightTiles(s, m) * T;
      const view = { x0: g.renderer.camera.x - T * 2, x1: g.renderer.camera.x + g.renderer.width + T * 2, y0: g.renderer.camera.y - T, y1: g.renderer.camera.y + g.renderer.height + T * 4 };
      const lights = fs_._lights(m, P, sightPx, T, view);
      out.torchLights = lights.length;
      // 시야 밖 · 화면 안 횃불 하나(그 아래 바닥 칸이 걸을 수 있는 곳)
      const M = MV;
      let pick = null;
      for (const L of lights) {
        const tx = Math.floor(L.x / T), ty = Math.floor(L.y / T) + 1;
        const sx = L.x - g.renderer.camera.x, sy = L.y - g.renderer.camera.y + T;
        if (Math.hypot(L.x - P.px, L.y - P.py) > sightPx * 1.5 && sx > 20 && sy > 20 && sx < g.renderer.width - 20 && sy < g.renderer.height - 20 && !M.isSolid(m, tx, ty)) { pick = { L, tx, ty, sx, sy }; break; }
      }
      out.torchPick = !!pick;
      if (pick) {
        const lum = () => { g.scenes.render(g.renderer); const c = g.renderer.ctx.canvas, k = c.width / g.renderer.width; const d = g.renderer.ctx.getImageData(Math.round((pick.sx - 6) * k), Math.round((pick.sy - 6) * k), Math.round(12 * k), Math.round(12 * k)).data; let v = 0; for (let i = 0; i < d.length; i += 4) v += d[i] + d[i + 1] + d[i + 2]; return v / (d.length / 4); };
        s.monsters.forEach((q) => { q.alive = false; });
        const old = fs_._lights;
        fs_._lights = () => [];
        out.lumDark = lum();
        fs_._lights = old;
        out.lumLit = lum();
        out.litAtTorch = FS.litAt(lights, pick.tx * T + T / 2, pick.ty * T);
        out.LIT_SEEN = FS.LIT_SEEN;
        // 몬스터를 그 불빛 안에 세운다 → 그려진다
        const mon = s.monsters[0];
        if (mon) {
          mon.alive = true; mon.tx = pick.tx; mon.ty = pick.ty; mon.px = pick.tx * T + T / 2; mon.py = (pick.ty + 1) * T; mon.moving = false;
          const box = () => { g.scenes.render(g.renderer); const c = g.renderer.ctx.canvas, k = c.width / g.renderer.width; return g.renderer.ctx.getImageData(Math.round((pick.sx - 16) * k), Math.round((pick.sy - 28) * k), Math.round(32 * k), Math.round(40 * k)).data; };
          const withMon = box();
          mon.alive = false;
          const noMon = box();
          out.monInLight = diff(withMon, noMon);
        }
      }
      // 룬(4층) · 석상(3층) 불빛
      await go('dungeon_4', 9, 20);
      const all4 = fs_._lights(s.map, s.player, sightPx, T, { x0: 0, x1: s.map.w * T, y0: 0, y1: s.map.h * T });
      out.runeLights = all4.filter((L) => L.color === FS.LIGHT.rune.color).length;
      await go('dungeon_3', 9, 20);
      const all3 = fs_._lights(s.map, s.player, sightPx, T, { x0: 0, x1: s.map.w * T, y0: 0, y1: s.map.h * T });
      out.gemLights = all3.filter((L) => L.color === FS.LIGHT.gem.color).length;
      // 새 횃불 그림은 배경이 없다(벽 위에 얹는다 — 둘레 빛은 게임이 그린다) · 꾸밈은 벽보다 밝다
      const tp = pix(A.get('tile_dungeon_torch')), tw = Math.sqrt(tp.length / 4);
      out.torchCorners = [0, tw - 1, (tw - 1) * tw, tw * tw - 1].map((q) => tp[q * 4 + 3]);
      const meanLum = (key) => { const d = pix(A.get(key)); let v = 0, k = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { v += (d[i] + d[i + 1] + d[i + 2]) / 3; k++; } return k ? v / k : 0; };
      out.lumWall = meanLum('tile_dungeon_wall');
      out.lumDecor = { chains: meanLum('tile_wall_chains'), bars: meanLum('tile_cell_bars'), rubble: meanLum('tile_floor_rubble') };
    }

    // 여자 몸 · 갑옷 — 몸 그림(바탕 층)과 갑옷 층의 폭을 줄마다 잰다
    const bl = g.bodyLook;
    const rows = (p, W, H) => { const v = []; for (let y = 0; y < H; y++) { let x0 = -1, x1 = -1; for (let x = 0; x < W; x++) if (p[(y * W + x) * 4 + 3] > 100) { if (x0 < 0) x0 = x; x1 = x; } v.push(x0 < 0 ? 0 : x1 - x0 + 1); } return v; };
    out.armor = {};
    for (const body of ['m1', 'f1', 'm2', 'f2']) {
      const data = bl.data && bl.data.bodies && bl.data.bodies[body];
      if (!data) continue;
      const lk = Object.keys(data.layers).find((k) => /^armor_2$/.test(k)) || Object.keys(data.layers).find((k) => k.startsWith('armor_'));
      const front = data.layers[lk] && bl.rectOf(data.layers[lk], 'stand');
      const back = data.layers[lk] && bl.rectOf(data.layers[lk], 'stand_b');
      if (!front) continue;
      // 갑옷 조각을 장면 틀(frame) 안 제자리에 놓고 잰다
      const ak = `body:${body}:${lk}`;
      if (A.loadLazy) await A.loadLazy(ak);
      const img = A.assets.get(ak);
      if (!img || !img.image) { out.armor[body] = { lk, err: 'no image' }; continue; }
      const FW = (bl.data.frame && bl.data.frame.field) || 160, FH = FW;
      const sx = 1;
      const cut = (r) => {
        const c = document.createElement('canvas'); c.width = FW; c.height = FH;
        c.getContext('2d').drawImage(img.image, r[0] * sx, r[1] * sx, r[2] * sx, r[3] * sx, r[4], r[5], r[2], r[3]);
        return { d: c.getContext('2d').getImageData(0, 0, FW, FH).data, w: FW, h: FH };
      };
      const f = cut(front), b = back ? cut(back) : null;
      const wr = rows(f.d, f.w, f.h).filter((n) => n > 0);
      // 치맛자락이 얼마나 퍼지나 = 치맛자락(몸통 아래쪽)의 가장 넓은 폭 ÷ 허리의 가장 좁은 폭
      //   (위 ¼ 은 어깨 · 소매, 아래 ¼ 은 다리 보호대라 뺀다)
      const at = (a, b) => wr.slice(Math.floor(wr.length * a), Math.floor(wr.length * b));
      const waist = Math.min(...at(0.25, 0.5)), skirt = Math.max(...at(0.35, 0.72));
      out.armor[body] = { lk, hemRatio: skirt / waist, backDiff: b ? diff(f.d, b.d) : -1 };
    }
    return out;
  });

  check('빛깔 있는 들판에서는 풀 그림에 그 빛깔이 칠해진다', r.tintId === 'ashen' && /@ashen$/.test(r.grassKey) && r.grassDiff > 200,
    `${r.tintId} ${r.grassKey} ${r.grassDiff}`);
  check('물 · 빛깔 없는 땅은 원래 그림', !/@/.test(r.waterKey) && r.tintOff === null && !/@/.test(r.grassKeyOff),
    `${r.waterKey} ${r.tintOff} ${r.grassKeyOff}`);
  check('물이 있는 지도를 찾았다', !!r.wmap, String(r.wmap));
  if (r.wmap) {
    check('물 덩어리의 바깥 모서리는 땅빛(둥글다) · 가운데는 물빛', r.cornerD > r.innerD + 60 && r.innerD < 90,
      `모서리 ${Math.round(r.cornerD)} · 가운데 ${Math.round(r.innerD)} (${r.wmap})`);
    check('모서리 칸의 물은 네모가 아니다', r.cornerWet < 32 * 32 * 0.85, `${r.cornerWet}/1024`);
    check('물 칸은 여전히 못 지나간다', r.waterSolid);
  }
  if (r.wmap) {
    check('그린 물빛과 걷는 쪽의 물 값이 같다(WaterShape)', r.waterAgree > 0.95, `${(r.waterAgree * 100).toFixed(1)}%`);
    check('실제 지도에서도 둥근 연못 모서리를 대각선으로 돈다', r.cornerDiag === true || r.cornerDiag === 'skip', String(r.cornerDiag));
  }
  check('지하감옥 횃불이 불빛을 낸다', r.torchLights >= 3, String(r.torchLights));
  check('시야 밖 횃불 둘레가 밝다(불빛을 끈 것보다)', r.torchPick && r.lumLit > r.lumDark + 25, `${Math.round(r.lumDark)} → ${Math.round(r.lumLit)}`);
  check('횃불 불빛 안에 선 몬스터는 시야 밖이어도 보인다', r.torchPick && r.litAtTorch >= r.LIT_SEEN && r.monInLight > 30, `빛 ${(r.litAtTorch || 0).toFixed(2)} · 달라진 점 ${r.monInLight}`);
  check('봉인 룬 · 석상의 보석이 은은히 빛난다', r.runeLights > 0 && r.gemLights > 0, `룬 ${r.runeLights} · 보석 ${r.gemLights}`);
  check('새 횃불 그림은 배경이 없다(둘레 빛은 게임이 둥글게 그린다)', (r.torchCorners || []).every((a) => a === 0), JSON.stringify(r.torchCorners));
  check('사슬 · 쇠창살 · 무너진 돌은 벽보다 밝다(어둠 속에서도 읽힌다)', Object.values(r.lumDecor || {}).every((v) => v > r.lumWall + 8),
    `벽 ${Math.round(r.lumWall)} · ${Object.entries(r.lumDecor || {}).map(([k, v]) => `${k} ${Math.round(v)}`).join(' ')}`);
  check('위에서 말을 걸면 마을 사람이 돌아본다(뒷모습)', r.npcTurned === 'up' && /_back$/.test(r.npcKey || ''), `${r.npcId} ${r.npcTurned} ${r.npcKey}`);
  check('대화가 닫히면 원래 보던 쪽으로', r.npcBack === true);
  const ar = r.armor || {};
  const ok4 = ['m1', 'f1', 'm2', 'f2'].every((b) => ar[b] && Number.isFinite(ar[b].hemRatio));
  check('네 몸의 갑옷 층을 읽었다', ok4, JSON.stringify(ar));
  if (ok4) {
    check('남자 갑옷은 치맛자락이 퍼지고 여자 갑옷은 몸에 붙는다(맞바꿈)',
      ar.m1.hemRatio > ar.f1.hemRatio && ar.m2.hemRatio > ar.f2.hemRatio,
      ['m1', 'f1', 'm2', 'f2'].map((b) => `${b} ${ar[b].hemRatio.toFixed(2)}`).join(' · '));
    check('갑옷 뒷면은 앞면과 다른 그림(등판)', ['m1', 'f1', 'm2', 'f2'].every((b) => ar[b].backDiff > 200),
      ['m1', 'f1', 'm2', 'f2'].map((b) => `${b} ${ar[b].backDiff}`).join(' · '));
  }
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
