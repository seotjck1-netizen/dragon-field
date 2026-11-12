// 시안③ 맨몸 8방향 (0.80.01) — 진짜로 돌린 그림(tools/paint3d) 을 들판에서 쓴다.
//
// ⚠ 성질을 잰다: "몸 넷 모두 8방향 × 서기 · 걷기 · 달리기 그림이 있다", "맨몸(무기만 쥔 것 포함)이면 새 그림,
//   갑옷 같은 장비가 보이면 예전 그림", "바라보는 쪽대로 방향이 고른다", "걸으면 장이 넘어간다",
//   "무기는 손에 쥐여 그린다(쥔 것과 안 쥔 것이 다르다)", "새 몸 그림이 예전 그림과 키 · 서는 자리가 같다",
//   "필드 전투는 전투 그림, 그 그림이 없을 때만 8방향".
//   픽셀 값을 적어 두지 않는다.
const fs = require('fs');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.resolve(__dirname, '..');

(async () => {
  // ① 표 · 그림 파일
  const d8 = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/dir8.json'), 'utf8'));
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));
  const srv = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/content/manifest.json'), 'utf8'));
  const bodies = ['m1', 'm2', 'f1', 'f2'];
  const yaws = [0, 45, 90, 135, 180, 225, 270, 315];
  const miss = [];
  const outOfSheet = [];
  const noHand = [];
  for (const b of bodies) {
    const B = d8.bodies[b];
    if (!B) { miss.push(b); continue; }
    const m = man[B.image];
    if (!m || !fs.existsSync(path.join(ROOT, m.src))) miss.push(`${b}:그림`);
    for (const [act, n] of Object.entries(d8.actions)) {
      for (let k = 0; k < n; k++) {
        for (const y of yaws) {
          const name = `${act}_${k}_${String(y).padStart(3, '0')}`;
          const f = B.frames[name];
          if (!f) { miss.push(`${b}:${name}`); continue; }
          if (m && (f[0] + f[2] > m.w || f[1] + f[3] > m.h)) outOfSheet.push(`${b}:${name}`);
          if (!B.hand[name] || B.hand[name].length !== 11) noHand.push(`${b}:${name}`);
        }
      }
    }
  }
  check('몸 넷 모두 8방향 × 서기 · 걷기 · 달리기 그림이 있다', miss.length === 0 && d8.actions.idle >= 1 && d8.actions.walk >= 6 && d8.actions.run >= 4,
    `${miss.slice(0, 4).join(' ')} ${JSON.stringify(d8.actions)}`);
  check('조각이 그림 밖으로 나가지 않는다', outOfSheet.length === 0, outOfSheet.slice(0, 4).join(' '));
  check('장마다 오른손 자리 · 무기 방향이 있다', noHand.length === 0, noHand.slice(0, 4).join(' '));
  const wk = Object.keys(d8.bodies.m1.weapons || {});
  check('칼 · 활 · 지팡이 무기 그림마다 쥐는 자리를 잰다', ['sword', 'bow', 'staff'].every((k) => wk.some((x) => x.startsWith(`weapon_${k}_`))), wk.slice(0, 6).join(' '));
  check('서버가 내려주는 그림 표에도 8방향 그림이 있다', bodies.every((b) => srv[`dir8:${b}`]), '');

  // ② 게임 안
  const { browser, page, errs } = await boot('dir8');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.store.state;
    const bl = g.bodyLook;
    const fsn = g.fieldScene;
    const body = s.player.body;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const pix = (a) => {
      const c = document.createElement('canvas');
      c.width = a.srcW; c.height = a.srcH;
      const x = c.getContext('2d');
      x.drawImage(a.image, 0, 0);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const opaque = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) n++; return n; };
    const box = (d, w) => { let y0 = 1e9, y1 = -1, x0 = 1e9, x1 = -1; for (let i = 3; i < d.length; i += 4) if (d[i] > 100) { const q = (i - 3) / 4, x = q % w, y = Math.floor(q / w); y0 = Math.min(y0, y); y1 = Math.max(y1, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); } return { x0, x1, y0, y1 }; };
    const out = { body };
    const bare = {};
    const club = { weapon: 'club' };
    const armored = { weapon: 'club', armor: 'knight_armor' };
    out.has = bl.hasDir8(body);
    out.eligBare = bl.dir8Eligible(body, bare);
    out.eligClub = bl.dir8Eligible(body, club);
    out.eligArmor = bl.dir8Eligible(body, armored);
    // 방향
    const F = (o) => fsn._dir8Frame({ body, stepMs: 170, walkT: 0, ...o });
    out.yaw = {};
    for (const [face, dir] of [['down', 'down'], ['downright', 'right'], ['right', 'right'], ['upright', 'right'], ['up', 'up'], ['upleft', 'left'], ['left', 'left'], ['downleft', 'left']]) {
      const f = F({ moving: true, dir, face8: face });
      out.yaw[face] = f && f.yaw;
    }
    out.standAct = F({ moving: false, dir: 'down' }).action;
    out.walkAct = F({ moving: true, dir: 'down' }).action;
    out.runAct = F({ moving: true, dir: 'down', stepMs: 100 }).action;
    const ks = new Set();
    for (let t = 0; t < 170 * 4; t += 40) ks.add(F({ moving: true, dir: 'right', walkT: t }).k);
    out.walkFrames = ks.size;
    // 그림 — 읽히고 나서 그린다
    await bl.prefetchDir8(body, club);
    await wait(200);
    const front = bl.getDir8(body, 'idle', 0, 0, bare);
    await wait(100);
    const fb = box(pix(front), front.srcW);
    // 예전 맨몸 앞모습과 키 · 서는 자리
    await bl.prefetch(body, bare);
    await wait(200);
    const old = bl.get(body, 'stand', bare);
    const ob = box(pix(old), old.srcW);
    out.footDiff = Math.abs(fb.y1 - ob.y1);
    out.hDiff = Math.abs((fb.y1 - fb.y0) - (ob.y1 - ob.y0));
    out.cxDiff = Math.abs((fb.x0 + fb.x1) / 2 - (ob.x0 + ob.x1) / 2);
    // 방향마다 다른 그림
    const side = pix(bl.getDir8(body, 'idle', 0, 90, bare));
    const back = pix(bl.getDir8(body, 'idle', 0, 180, bare));
    const fp = pix(front);
    let ds = 0, db = 0;
    for (let i = 3; i < fp.length; i += 4) { if ((fp[i] > 100) !== (side[i] > 100)) ds++; if (fp[i] > 100 && back[i] > 100 && Math.abs(fp[i - 3] - back[i - 3]) + Math.abs(fp[i - 2] - back[i - 2]) + Math.abs(fp[i - 1] - back[i - 1]) > 90) db++; }
    out.sideDiff = ds; out.backDiff = db;
    // 무기를 쥐면 그림이 달라진다(옆모습 — 칼이 몸 밖으로 나온다)
    const w0 = opaque(pix(bl.getDir8(body, 'walk', 2, 90, bare)));
    const w1 = opaque(pix(bl.getDir8(body, 'walk', 2, 90, club)));
    out.weaponPx = w1 - w0;
    // 들판에서 실제로 쓰는가 — 지금 내 몸(시작 무기만 쥔 맨몸)
    out.cacheBefore = bl.dir8Cache ? bl.dir8Cache.size : 0;
    g.scenes.render(g.renderer);
    out.cacheAfter = bl.dir8Cache ? bl.dir8Cache.size : 0;
    out.mine = bl.dir8Eligible(body, window.__game && g.store && (await import('/src/entities/StatBlock.js')).computeLook(s));
    // 필드 전투(?field=1) — 전투 그림이 있으면 그것, 없으면(옛 그림 파일) 들판처럼 8방향 그림으로 상대를 본다
    {
      const look = (await import('/src/entities/StatBlock.js')).computeLook(s);
      const actor = s.player;
      const calls = [];
      const og = bl.getDir8.bind(bl), oh = bl.hasScene.bind(bl);
      bl.getDir8 = (...a) => { calls.push(a.slice(1, 4).join('/')); return og(...a); };
      const pose = { x: 0, y: 0, lift: 0, rot: 0, sx: 1, sy: 1, flash: 0, alpha: 1, frame: 'stance', ghosts: [], face: 1 };
      const keep = { face8: actor.face8, dir: actor.dir, moving: actor.moving };
      Object.assign(actor, { face8: 'right', dir: 'right', moving: false });
      try {
        fsn._drawFighter(g.renderer, s, actor, pose, look, 32);
        out.fightStance = calls.length;
        bl.hasScene = (b, sc) => (/^(stance|attack)_/.test(sc) ? false : oh(b, sc));
        fsn._drawFighter(g.renderer, s, actor, pose, look, 32);
        out.fightFallback = calls.slice(out.fightStance);
      } finally { bl.getDir8 = og; bl.hasScene = oh; Object.assign(actor, keep); }
    }
    return out;
  });
  check('몸에 8방향 그림이 있다', r.has, r.body);
  check('맨몸 · 무기만 쥔 몸은 새 그림, 갑옷이 보이면 예전 그림', r.eligBare && r.eligClub && !r.eligArmor, `${r.eligBare} ${r.eligClub} ${r.eligArmor}`);
  check('바라보는 쪽대로 방향을 고른다(아래 0 · 오른쪽 90 · 위 180 · 왼쪽 270, 대각은 그 사이)',
    JSON.stringify(r.yaw) === JSON.stringify({ down: 0, downright: 45, right: 90, upright: 135, up: 180, upleft: 225, left: 270, downleft: 315 }), JSON.stringify(r.yaw));
  check('서면 서기 · 걸으면 걷기 · 빠르면 달리기', r.standAct === 'idle' && r.walkAct === 'walk' && r.runAct === 'run', `${r.standAct} ${r.walkAct} ${r.runAct}`);
  check('걸으면 장이 넘어간다(네 칸에 한 바퀴)', r.walkFrames >= 6, String(r.walkFrames));
  check('예전 맨몸 앞모습과 발바닥 · 키 · 가운데가 맞다', r.footDiff <= 2 && r.hDiff <= 5 && r.cxDiff <= 3, `발 ${r.footDiff} 키 ${r.hDiff} 가운데 ${r.cxDiff}`);
  check('옆모습 · 뒷모습은 앞모습과 다르다(진짜로 돈다)', r.sideDiff > 300 && r.backDiff > 300, `${r.sideDiff} ${r.backDiff}`);
  check('무기를 쥐면 손에 무기가 그려진다', r.weaponPx > 30, String(r.weaponPx));
  check('시작 무기만 쥔 내 몸은 들판에서 새 그림으로 그린다', r.mine && r.cacheAfter >= 1, `${r.mine} ${r.cacheBefore}→${r.cacheAfter}`);
  check('필드 전투는 전투 그림 그대로, 전투 그림이 없으면 8방향 그림으로 상대(오른쪽)를 본다',
    r.fightStance === 0 && r.fightFallback.length === 1 && r.fightFallback[0] === 'idle/0/90', `${r.fightStance} ${JSON.stringify(r.fightFallback)}`);
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
