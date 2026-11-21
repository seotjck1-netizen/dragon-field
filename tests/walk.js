// 걸을 수 있는 땅 — 모든 지도 (0.70.35).
//
// ① 보이지 않는 벽이 없다: 막힌 칸인데 **바닥 그림**(돌바닥 · 풀 · 마루 …)만 보이는 칸이 없다.
//    0.70.34 까지 포이노 광장 돌바닥 한가운데에 그런 칸이 여섯 개 있었다 — 분수 · 좌판의 발자리('}')는
//    막혀 있는데, 지도가 한 장짜리 그림(map.buildings)을 넘겨주지 않아 분수 · 좌판이 안 그려졌다.
// ② 갇힌 바닥이 없다: 걸을 수 있는 칸은 모두 입구(포탈 · 시작 자리)에서 걸어서(올라서기 포함) 닿는다.
//    자동으로 만든 들판에 나무에 둘러싸인 한두 칸짜리 풀밭이 여섯 들판에 있었다.
// ③ 몬스터는 닿는 칸에만 선다(갇힌 풀밭에 선 몬스터는 영영 못 잡는다).
//
// ⚠ 성질을 잰다. 지도마다 칸 좌표를 적어 두지 않는다 — 지도를 고쳐도 시험은 그대로 돈다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('walk');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, A = g.renderer.assets, T = 32;
    const MV = await import('/src/systems/MovementSystem.js');
    const FS = await import('/src/scenes/FieldScene.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const alphaOf = (key) => {
      const a = A.get(key);
      if (!a || !a.image) return null;
      const w = a.srcW || a.image.width, h = a.srcH || a.image.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.drawImage(a.image, 0, 0, w, h);
      return { d: x.getImageData(0, 0, w, h).data, w, h, lw: a.w || w, lh: a.h || h };
    };
    const out = {};
    for (const id of Object.keys(s.db.maps.maps)) {
      g.changeMap(id, 1, 1);
      await wait(150);
      const m = s.map, def = s.db.maps.maps[id];
      const floor = new Set();
      for (const t of Object.values(m.tileset)) if (t && !t.solid && !t.over && t.sprite) floor.add(t.sprite);
      for (const list of Object.values(FS.GROUNDS)) for (const k of list) floor.add(k);
      // 한 장짜리 그림이 덮는 칸(그림의 알파가 칸의 절반 넘게)
      const covered = new Set();
      for (const b of m.buildings || []) {
        const im = alphaOf(b.sprite);
        if (!im) continue;
        // FieldScene 과 같은 자리: 발자리 가운데 아래(발자리 아래 변)에 세운다
        const sx = im.w / im.lw, sy = im.h / im.lh;
        const left = (b.x + b.w / 2) * T - im.lw / 2, bottom = (b.y + b.h) * T;
        for (let ty = b.y; ty < b.y + b.h; ty++) for (let tx = b.x; tx < b.x + b.w; tx++) {
          let n = 0, on = 0;
          for (let y = 2; y < T; y += 4) for (let x = 2; x < T; x += 4) {
            const px = (tx * T + x - left) * sx, py = (ty * T + y - (bottom - im.lh)) * sy;
            n++;
            if (px >= 0 && py >= 0 && px < im.w && py < im.h && im.d[(Math.floor(py) * im.w + Math.floor(px)) * 4 + 3] > 128) on++;
          }
          if (on / n > 0.5) covered.add(ty * m.w + tx);
        }
      }
      const invisible = [];
      for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) {
        if (!MV.isSolid(m, tx, ty)) continue;
        const t = m.tileset[m.grid[ty][tx]] || {};
        if (t.over || !floor.has(t.sprite)) continue;              // 제 그림(나무 · 벽 · 물 …)이 있다
        if (covered.has(ty * m.w + tx)) continue;                   // 한 장짜리 그림이 덮는다
        invisible.push(`${tx},${ty}'${m.grid[ty][tx]}'`);
      }
      // 입구에서 닿는가
      const starts = (m.portals || []).map((p) => [p.x, p.y]);
      if (id === s.db.player.startMap) starts.push([s.db.player.startTile.x, s.db.player.startTile.y]);
      const seen = new Uint8Array(m.w * m.h), q = [];
      for (const [x, y] of starts) if (x >= 0 && y >= 0 && x < m.w && y < m.h) { seen[y * m.w + x] = 1; q.push([x, y]); }
      const can = (x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && (!MV.isSolid(m, x, y) || MV.isClimbable(m, x, y));
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (can(nx, ny) && !seen[ny * m.w + nx]) { seen[ny * m.w + nx] = 1; q.push([nx, ny]); }
        }
      }
      const cut = [];
      for (let ty = 0; ty < m.h; ty++) for (let tx = 0; tx < m.w; tx++) if (!MV.isSolid(m, tx, ty) && !seen[ty * m.w + tx]) cut.push(`${tx},${ty}`);
      const lostMon = (m.spawns || []).filter((sp) => !seen[sp.y * m.w + sp.x]).map((sp) => `${sp.monster}@${sp.x},${sp.y}`);
      out[id] = { invisible, cut, lostMon, starts: starts.length, wantBld: (def.buildings || []).length, gotBld: (m.buildings || []).length };
    }
    return out;
  });
  const ids = Object.keys(r);
  check('지도를 다 돌았다', ids.length >= 30, `${ids.length}장`);
  const bld = ids.filter((id) => r[id].wantBld !== r[id].gotBld);
  check('한 장짜리 집 · 분수 · 좌판이 지도에 실린다', bld.length === 0 && r.poino && r.poino.gotBld > 0,
    bld.map((id) => `${id} ${r[id].gotBld}/${r[id].wantBld}`).join(' ') || `포이노 ${r.poino && r.poino.gotBld}채`);
  const inv = ids.filter((id) => r[id].invisible.length);
  check('보이지 않는 벽이 없다(막혔는데 바닥만 보이는 칸)', inv.length === 0, inv.map((id) => `${id}: ${r[id].invisible.slice(0, 6).join(' ')}`).join(' | '));
  const cut = ids.filter((id) => r[id].cut.length);
  check('갇힌 바닥이 없다(걸을 수 있는 칸은 모두 입구에서 닿는다)', cut.length === 0, cut.map((id) => `${id}: ${r[id].cut.slice(0, 6).join(' ')}`).join(' | '));
  const lost = ids.filter((id) => r[id].lostMon.length);
  check('몬스터는 닿는 칸에만 선다', lost.length === 0, lost.map((id) => `${id}: ${r[id].lostMon.join(' ')}`).join(' | '));
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
