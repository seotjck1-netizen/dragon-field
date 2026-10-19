// 뒷모습 · 옆모습 · 남의 달리기 · 몬스터 움츠림/맞기/쓰러짐 · 바닥 타일 · 파일 크기 (0.70.29 · 여덟 방향 0.70.30).
// 0.70.30 — 여덟 방향(docs/CHARACTER-VIEWS.md): 옆 · 앞대각 = 앞모습 그대로 눈동자만, 무기는 언제나 오른손(뒤집지 않음).
//
// ⚠ 성질을 잰다: "위로 걸으면 뒷모습", "뒷모습에서는 망토가 몸 위", "타일은 이음새가 없다",
//   "그림을 다 합쳐도 한 장짜리 html 이 20MB 를 안 넘는다". 픽셀 값을 적어 두지 않는다.
const fs = require('fs');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.resolve(__dirname, '..');

(async () => {
  // ① 파일 크기 — 한 장짜리 html 은 그림을 글자(base64, ×1.33)로 박는다.
  //   manifest 의 그림 + 음악이 15MB 를 넘으면 html 이 20MB 를 넘는다.
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));
  const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/audio.json'), 'utf8'));
  const seen = new Set();
  let bytes = 0;
  const missing = [];
  for (const d of Object.values(man)) {
    if (!d.src || seen.has(d.src)) continue;
    seen.add(d.src);
    const f = path.join(ROOT, d.src);
    if (fs.existsSync(f)) bytes += fs.statSync(f).size; else missing.push(d.src);
  }
  for (const d of Object.values(audio['곡'] || {})) {
    if (d && d.src && fs.existsSync(path.join(ROOT, d.src))) bytes += fs.statSync(path.join(ROOT, d.src)).size;
  }
  check('그림 + 음악이 15MB 안(한 장짜리 html 20MB 안)', bytes < 15e6, `${(bytes / 1e6).toFixed(2)}MB`);
  check('manifest 가 가리키는 그림이 다 있다', missing.length === 0, missing.slice(0, 4).join(' '));

  const { browser, page, errs } = await boot('views');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.store.state;
    const bl = g.bodyLook;
    const body = s.player.body;
    const fs_ = g.fieldScene;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const pix = (a) => {
      const c = document.createElement('canvas');
      c.width = a.srcW || a.image.width; c.height = a.srcH || a.image.height;
      const x = c.getContext('2d');
      x.drawImage(a.image, 0, 0, c.width, c.height);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 3] - b[i + 3]) > 40) n++; return n; };
    const out = {};
    const walker = (dir, extra = {}) => ({ moving: true, stepMs: 170, walkT: 0, body, dir, ...extra });
    out.phase = {
      down: fs_._walkPhase(walker('down')),
      up: fs_._walkPhase(walker('up')),
      left: fs_._walkPhase(walker('left')),
      right: fs_._walkPhase(walker('right')),
      // 대각선은 네 방향(dir)이 좌우 쪽이다(FACING_OF) — 그림만 face8 을 본다
      downright: fs_._walkPhase(walker('right', { face8: 'downright' })),
      downleft: fs_._walkPhase(walker('left', { face8: 'downleft' })),
      upright: fs_._walkPhase(walker('right', { face8: 'upright' })),
      upleft: fs_._walkPhase(walker('left', { face8: 'upleft' })),
      rightRun: fs_._walkPhase(walker('right', { stepMs: 110 })),
      upStand: fs_._walkPhase({ moving: false, body, dir: 'up' }),
      upRun: fs_._walkPhase(walker('up', { stepMs: 110 })),
    };
    const shot = async (scene, look) => { await bl.prefetch(body, look); await wait(150); return pix(bl.get(body, scene, look)); };
    const front = await shot('stand', {});
    out.backDiff = diff(front, await shot('stand_b', {}));
    // 옆 · 앞대각은 앞모습과 **눈 둘레만** 다르다 — 다른 칸이 머리 위쪽 좁은 띠 안에 모인다
    // ⚠ 그림은 webp(손실 압축)라 같은 그림도 조각 가장자리 · 테두리 몇 점이 조금씩 다르다.
    //   그래서 **둘 다 불투명한 자리**에서 크게(빛깔 합 150 넘게) 다른 점만 센다 —
    //   눈동자를 옮긴 자리는 흰자 ↔ 눈동자라 그보다 훨씬 크게 다르다.
    const where = (a, b, w) => { let n = 0, y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1; for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 200 && b[i + 3] > 200 && Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 150) { n++; const q = i / 4, x = q % w, y = Math.floor(q / w); y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { n, h: y1 - y0, w: x1 - x0 }; };
    const side = await shot('stand_s', {});
    out.sideDiff = diff(front, side);
    out.glance = {};
    for (const sc of ['stand_s', 'stand_fs', 'stand_sl', 'stand_fsl', 'walk1_s', 'walk1_sl']) {
      out.glance[sc] = where(sc.startsWith('walk1') ? await shot('walk1', {}) : front, await shot(sc, {}), 160);
    }
    // 무기는 언제나 오른손 — 칼을 든 채로 앞 · 옆(오른 · 왼) · 뒤의 칼 층이 같은 쪽(화면 오른쪽)에 있다
    const armed = { weapon: 'iron_sword' };
    out.swordSide = {};
    for (const sc of ['stand', 'stand_s', 'stand_sl', 'stand_b']) {
      const keys = bl.layerKeys(body, sc, armed);
      const wk = keys.find((k) => k.startsWith('weapon_'));
      const r = wk && bl.rectOf(bl.data.bodies[body].layers[wk], sc);
      out.swordSide[sc] = r ? r[4] + r[2] / 2 : null;       // 장면 안에서 칼 조각의 가운데 x
    }
    // 뒷모습에서 망토는 몸 위(뒤에서 등을 덮는다), 앞모습에서는 몸 뒤
    const cloak = { shoulder: 'rune_pauldron' };
    const kf = bl.layerKeys(body, 'stand', cloak), kb = bl.layerKeys(body, 'stand_b', cloak);
    out.capeFront = kf.indexOf(kf.find((k) => k.startsWith('cape_'))) < kf.indexOf('base');
    out.capeBack = kb.indexOf(kb.find((k) => k.startsWith('cape_'))) > kb.indexOf('base');
    out.keys = [kf.join(','), kb.join(',')];
    // 남의 달리기 — 보내는 소식에 걸음 시간이 들어가고, 짧으면 받는 쪽이 달리는 그림을 쓴다
    const sent = [];
    const oldSelf = g.net.self, oldSend = g.net._send.bind(g.net);
    g.net.self = { id: 'tester' };
    g.net._send = (m) => sent.push(m);
    g.net._acc = 1e9;
    // 질주 물약을 마신 것처럼 — 걸음 시간은 매 프레임 버프에서 다시 계산된다
    const B = await import('/src/systems/BuffSystem.js');
    B.addBuff(s, { id: 'haste', name: '질주', icon: '💨', durationMs: 60000, effects: { speedMult: 1.5 }, desc: '' });
    await wait(300);
    g.net.self = oldSelf;
    g.net._send = oldSend;
    B.removeBuff(s, 'haste');
    const st = sent.filter((m) => m.t === 'state').pop();
    out.sentStep = st ? st.stepMs : null;
    out.peerRun = fs_._walkPhase({ moving: true, stepMs: out.sentStep, body: 'f2', dir: 'down' });
    // 몬스터 — 모든 몬스터에 움츠림 · 맞기 · 쓰러짐 그림
    const miss = [];
    const lying = {};
    for (const [id, m] of Object.entries(s.db.monsters)) {
      if (!m || !m.battleSprite) continue;
      for (const k of ['_windup', '_hurt', '_down']) {
        const key = m.battleSprite.replace(/_battle$/, k);
        const a = g.assets.get(key);
        if (!(a && a.ok)) miss.push(key);
      }
    }
    for (const id of ['wolf', 'skeleton', 'demon_soldier']) {
      const d = pix(g.assets.get(`mon_${id}_down`)), up = pix(g.assets.get(`mon_${id}_battle`));
      const box = (p) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; const w = 512; for (let i = 3; i < p.length; i += 4) if (p[i] > 40) { const q = (i - 3) / 4, x = q % w, y = Math.floor(q / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { w: x1 - x0, h: y1 - y0, bottom: y1 }; };
      lying[id] = { down: box(d), up: box(up) };
    }
    out.monMiss = miss;
    // 0.70.30 — 몬스터 · 걷는 마을 사람은 위로 걸으면 뒷모습(그림 · 고르는 것 둘 다)
    const backMiss = [];
    for (const [id, m] of Object.entries(s.db.monsters)) {
      if (!m || !m.sprite) continue;
      const stem = m.sprite.replace(/_field$/, '');
      if (!g.assets.has(`${stem}_back`)) backMiss.push(id);
    }
    out.monBackMiss = backMiss;
    const anyMon = Object.values(s.db.monsters).find((m) => m && m.sprite && g.assets.has(m.sprite.replace(/_field$/, '') + '_back'));
    out.monUp = anyMon ? fs_._walkKey(g.renderer, { sprite: anyMon.sprite, kind: 'monster', dir: 'up', moving: false }) : null;
    out.monDown = anyMon ? fs_._walkKey(g.renderer, { sprite: anyMon.sprite, kind: 'monster', dir: 'down', moving: false }) : null;
    out.npcUp = fs_._walkKey(g.renderer, { sprite: 'npc_elder', kind: 'npc', dir: 'up', moving: true, stepMs: 170, walkT: 0 });
    out.lying = lying;
    // 바닥 타일 — 이음새가 없다: 오른쪽 끝 → 왼쪽 끝(이어 붙인 자리)의 차이가 안쪽 이웃 줄의 차이만큼 작다
    const seam = {};
    for (const n of ['grass', 'path', 'water', 'brick', 'castle_wall', 'dungeon_floor', 'ash', 'waste']) {
      const a = g.assets.get(`tile_${n}`);
      const c = document.createElement('canvas'); c.width = a.image.width; c.height = a.image.height;
      const x = c.getContext('2d'); x.drawImage(a.image, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, W = c.width, H = c.height;
      const col = (i) => { const v = []; for (let y = 0; y < H; y++) { const k = (y * W + i) * 4; v.push(d[k] + d[k + 1] + d[k + 2]); } return v; };
      const dist = (p, q) => p.reduce((s_, v, i) => s_ + Math.abs(v - q[i]), 0) / p.length;
      let inner = 0;
      for (let i = 1; i < W; i++) inner += dist(col(i - 1), col(i));
      inner /= W - 1;
      seam[n] = { seam: dist(col(W - 1), col(0)), inner };
    }
    out.seam = seam;
    out.groundPainted = !!(g.assets.get('tile_grass') || {}).ok;
    return out;
  });

  check('아래로 걸으면 앞모습 · 위(뒤대각)로 걸으면 뒷모습 · 옆 · 앞대각은 그쪽을 보는 눈동자',
    r.phase.down === 'walk1' && r.phase.up === 'walk1_b' && r.phase.left === 'walk1_sl' && r.phase.right === 'walk1_s'
      && r.phase.downright === 'walk1_fs' && r.phase.downleft === 'walk1_fsl'
      && r.phase.upright === 'walk1_b' && r.phase.upleft === 'walk1_b',
    JSON.stringify(r.phase));
  check('옆으로 달리면 앞모습 달리기 그림(몸이 앞모습과 같다)', /^run_/.test(r.phase.rightRun), r.phase.rightRun);
  const gl = Object.entries(r.glance);
  check('옆 · 앞대각은 앞모습과 눈 둘레만 다르다(몸 · 얼굴 · 팔다리는 그대로)',
    gl.every(([, v]) => v.n > 0 && v.n < 60 && v.h <= 6 && v.w <= 24), JSON.stringify(r.glance));
  const sw = Object.values(r.swordSide);
  check('무기는 어느 방향이든 오른손(화면 오른쪽)', sw.every((x) => x != null && x > 80), JSON.stringify(r.swordSide));
  check('위를 보고 서 있으면 뒷모습으로 선다 · 위로 달리면 뒷모습 걷기', r.phase.upStand === 'stand_b' && /_b$/.test(r.phase.upRun), `${r.phase.upStand} ${r.phase.upRun}`);
  check('뒷모습 그림은 앞모습과 다르다', r.backDiff > 300, `${r.backDiff} ${r.sideDiff}`);
  check('망토는 앞모습에서 몸 뒤, 뒷모습에서 몸 위', r.capeFront && r.capeBack, r.keys.join(' | '));
  check('내 걸음 시간을 남에게 보낸다', Number.isFinite(r.sentStep) && r.sentStep > 0 && r.sentStep < 170, String(r.sentStep));
  check('걸음이 짧은 접속자는 남의 화면에서도 달린다', /^run_/.test(r.peerRun), r.peerRun);
  check('모든 몬스터에 움츠림 · 맞기 · 쓰러짐 그림', r.monMiss.length === 0, r.monMiss.slice(0, 4).join(' '));
  check('모든 몬스터에 뒷모습 그림', r.monBackMiss.length === 0, r.monBackMiss.slice(0, 4).join(' '));
  check('몬스터 · 걷는 마을 사람은 위로 가면 뒷모습', /_back$/.test(r.monUp || '') && !/_back/.test(r.monDown || '') && /_back_walk1$/.test(r.npcUp || ''),
    `${r.monUp} · ${r.monDown} · ${r.npcUp}`);
  check('쓰러진 몬스터는 누워 있다(선 모습보다 낮다) · 바닥에 붙어 있다',
    Object.values(r.lying).every((v) => v.down.h < v.up.h * 0.85 && v.down.bottom > 440), JSON.stringify(r.lying));
  const bad = Object.entries(r.seam).filter(([, v]) => v.seam > v.inner * 2.2 + 6);
  check('바닥 · 벽 타일은 이어 붙인 자리가 안 보인다', bad.length === 0,
    bad.map(([k, v]) => `${k} ${v.seam.toFixed(1)}/${v.inner.toFixed(1)}`).join(' ') || JSON.stringify(Object.fromEntries(Object.entries(r.seam).map(([k, v]) => [k, +v.seam.toFixed(1)]))));
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
