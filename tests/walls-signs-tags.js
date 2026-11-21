// 0.70.24 — 벽의 되풀이 · 표지판의 말 · 이름표 겹침.
//
// 무엇을 지키려는 시험인가:
//   · **넓게 깔리는 것은 한 장으로 덮지 않는다.** 성벽·지하감옥 벽·집 벽·잿더미를
//     한 장으로 깔아 두면 32px 마다 똑같은 무늬가 되풀이되어, 쌓은 벽이 아니라
//     **찍어 낸 벽지**로 보인다. 장을 늘려서 고친다(풀 네 장·마른 땅 다섯 장과 같은 규칙).
//   · **집 창은 드물어야 한다.** 칸마다 창이 있으면 집이 아니라 창 진열장이다.
//     그렇다고 없애면 고친 것이 아니다 — 드물게, 그러나 있게.
//   · **표지판은 말을 한다.** 길목에 세워 놓고 아무 말도 안 하면 서 있을 까닭이 없다.
//   · **이름표는 겹치지 않는다.** 몰릴수록 안 읽히면 경고가 아니다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('b24');

  // ══ 1. 벽·바닥이 여러 장이다 ═══════════════════════════
  const sets = await page.evaluate(async () => {
    const g = window.__game;
    const F = await import('/src/scenes/FieldScene.js');
    const has = (k) => g.renderer.assets.has(k);
    const man = g.store.state.db.manifest;
    const out = {};
    for (const [base, list] of Object.entries(F.VARIANTS_FOR_TEST || {})) {
      out[base] = { n: list.length, loaded: list.every(has),
                    inManifest: list.every((k) => !!man[k]) };
    }
    out._grounds = {};
    for (const [k, list] of Object.entries(F.GROUNDS)) {
      out._grounds[k] = { n: list.length, loaded: list.every(has) };
    }
    return out;
  });
  for (const base of ['tile_castle_wall', 'tile_dungeon_wall', 'tile_house_wall']) {
    const v = sets[base];
    check(`${base} 이 여러 장이다`, v && v.n >= 3, v ? `${v.n}장` : '없음');
    check(`${base} 그림이 다 읽혔다`, v && v.loaded === true);
    check(`${base} 이 다 표에 있다`, v && v.inManifest === true);
  }
  check('잿더미가 다섯 장이다', sets._grounds.ash.n === 5, `${sets._grounds.ash.n}장`);
  check('잿더미 그림이 다 읽혔다', sets._grounds.ash.loaded === true);

  // ══ 2. 장끼리 실제로 다르다 ════════════════════════════
  //
  // 목록에 이름만 여럿 적어 놓고 **같은 그림**을 가리키면 아무것도 안 고친 것이다.
  // 그림을 직접 읽어 픽셀이 얼마나 다른지 잰다.
  const same = await page.evaluate(() => {
    const g = window.__game;
    const read = (key) => {
      const a = g.renderer.assets.get(key);
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(a.image, 0, 0, 32, 32);
      return cx.getImageData(0, 0, 32, 32).data;
    };
    const groups = {
      성벽: ['tile_castle_wall', 'tile_castle_wall2', 'tile_castle_wall3'],
      지하감옥벽: ['tile_dungeon_wall', 'tile_dungeon_wall2', 'tile_dungeon_wall3'],
      집벽: ['tile_house_wall', 'tile_house_wall2', 'tile_house_wall3'],
      잿더미: ['tile_ash', 'tile_ash2', 'tile_ash3', 'tile_ash4', 'tile_ash5'],
    };
    const out = {};
    for (const [name, keys] of Object.entries(groups)) {
      const pix = keys.map(read);
      let worst = 1e9;
      for (let i = 0; i < pix.length; i++) for (let j = i + 1; j < pix.length; j++) {
        let n = 0;
        for (let k = 0; k < 32 * 32; k++) {
          if (Math.abs(pix[i][k * 4] - pix[j][k * 4]) > 6) n++;
        }
        worst = Math.min(worst, n);
      }
      out[name] = worst;
    }
    return out;
  });
  for (const [name, n] of Object.entries(same)) {
    // 1024칸 가운데 적어도 60칸은 달라야 '다른 장' 이다.
    check(`${name} 장끼리 서로 다르다`, n >= 60, `가장 닮은 두 장이 ${n}칸 다름`);
  }

  // ══ 3. 집 창은 드물지만 있다 ═══════════════════════════
  //
  // 양쪽으로 다 틀릴 수 있는 것이라 **위아래를 함께** 잰다:
  // 너무 흔하면 창 진열장이고, 아예 없으면 고친 것이 아니다.
  const win = await page.evaluate(async () => {
    const g = window.__game;
    const F = await import('/src/scenes/FieldScene.js');
    const maps = g.store.state.db.maps;
    const ts = maps.tileset;
    const list = F.VARIANTS_FOR_TEST.tile_house_wall;
    const n = {};
    let total = 0;
    for (const m of Object.values(maps.maps)) {
      for (let y = 0; y < (m.grid || []).length; y++) {
        for (let x = 0; x < m.grid[y].length; x++) {
          const t = ts[m.grid[y][x]];
          if (!t) continue;
          if (t.sprite !== 'tile_house_wall' && t.under !== 'tile_house_wall') continue;
          const k = F.pickVariantForTest(list, x, y);
          n[k] = (n[k] || 0) + 1; total++;
        }
      }
    }
    return { n, total };
  });
  const winN = win.n.tile_house_wall || 0;
  check('집 벽을 여러 칸 쟀다', win.total >= 20, `${win.total}칸`);
  check('창이 있기는 하다', winN > 0, `${winN}칸`);
  check('창이 칸마다 있지는 않다', winN / win.total < 0.4,
    `${winN}/${win.total} = ${Math.round((winN / win.total) * 100)}%`);

  // ══ 4. 표지판이 말을 한다 ══════════════════════════════
  const signs = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const ids = Object.keys(s.db.maps.maps).filter((k) => s.db.maps.maps[k].generate);
    let withLabel = 0, fields = 0, bad = [];
    const seen = [];
    for (const id of ids) {
      g.changeMap(id, 2, 15);
      await new Promise((r) => setTimeout(r, 110));
      const m = s.map;
      const sg = m.signs || [];
      fields++;
      if (sg.length) withLabel++;
      for (const one of sg) {
        seen.push(one.label);
        // 그 자리에 실제로 표지판이 서 있어야 한다
        const t = m.tileset[m.grid[one.y][one.x]];
        if (!t || t.sprite !== 'tile_signpost') bad.push(`${id}@${one.x},${one.y}`);
        if (!one.label) bad.push(`${id} 빈 글자`);
      }
    }
    return { withLabel, fields, bad, kinds: [...new Set(seen)] };
  });
  check('들판마다 말하는 표지판이 있다', signs.withLabel === signs.fields,
    `${signs.withLabel} / ${signs.fields}`);
  check('적힌 자리에 표지판이 실제로 서 있다', signs.bad.length === 0, signs.bad.join(' '));
  check('여러 갈래 이름이 나온다', signs.kinds.length >= 2, signs.kinds.join(' · '));

  // ══ 5. 화살표가 길목 쪽을 가리킨다 ═════════════════════
  //
  // 처음에 거리로만 쟀더니 서쪽 출구 표지판에 "↓" 가 붙었다. 길목의 한 칸 위에
  // 서 있어서 가로·세로 거리가 같았던 것이다. 판 가장자리의 출구는 그 가장자리 쪽이다.
  const arrows = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const out = {};
    for (const id of ['field_1', 'poino']) {
      g.changeMap(id, 3, 15);
      await new Promise((r) => setTimeout(r, 300));
      out[id] = s.map.signs.map((q) => `${q.arrow}${q.label}`);
    }
    return out;
  });
  check('들판 서쪽 표지판은 ← 이다', arrows.field_1.includes('←포이노 마을'), arrows.field_1.join(' '));
  check('들판 동쪽 표지판은 → 이다', arrows.field_1.some((a) => a.startsWith('→')), arrows.field_1.join(' '));
  check('마을 성문 표지판은 ↑ 이다', arrows.poino.includes('↑포이노 성'), arrows.poino.join(' '));
  check('마을에도 표지판이 셋 있다', arrows.poino.length === 3, arrows.poino.join(' '));

  // ══ 6. 글씨가 **판 안에** 다 들어간다 ═══════════════════
  //
  // 판에 새긴 글자색(#35200f) 픽셀을 찾아, 그것이 전부 판의 네모 안에 있는지 본다.
  // 판 밖에서 하나라도 나오면 글자가 삐져나온 것이다. 가장 긴 이름으로 잰다.
  const inside = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    const ids = Object.keys(s.db.maps.maps).filter((k) => s.db.maps.maps[k].generate);
    let longest = null;
    for (const id of ids) {
      g.changeMap(id, 3, 15);
      await new Promise((r) => setTimeout(r, 60));
      for (const q of s.map.signs) if (!longest || q.label.length > longest.label.length) longest = { id, ...q };
    }
    g.changeMap(longest.id, 3, 15);
    await new Promise((r) => setTimeout(r, 500));
    const sg = s.map.signs.find((q) => q.label === longest.label);
    const pl = s.player;
    pl.tx = pl.fromTx = sg.x + (sg.x < 5 ? 2 : -2); pl.ty = pl.fromTy = sg.y + 2;
    pl.px = pl.tx * T + T / 2; pl.py = pl.ty * T + T; pl.moving = false;
    // 몬스터는 치운다 — 이름표 글자가 끼어들면 잘못 센다
    for (const m of s.monsters) m.alive = false;
    g.scenes.render(g.renderer);
    const fs = g.fieldScene;
    const q = fs._ground.props.find((x) => x.sign && x.sign.label === longest.label);
    const r = fs._signRect(s.map, q, g.renderer.ctx);
    const c = g.renderer.ctx.canvas;
    const d = g.renderer.ctx.getImageData(0, 0, c.width, c.height).data;
    // 0.70.28 — 글자만 센다: 글씨를 지우고 한 번 더 그려서 **달라진 자리**만 본다.
    //   소품에 짙은 테두리가 생기자 표지판 기둥 · 나무 테두리의 번진 가장자리가
    //   글자색(#35200f)과 가까워져 "판 밖의 글자" 로 잘못 세였다.
    const keep = q.sign.label;
    q.sign.label = '';
    g.scenes.render(g.renderer);
    const d0 = g.renderer.ctx.getImageData(0, 0, c.width, c.height).data;
    q.sign.label = keep;
    g.scenes.render(g.renderer);
    const X0 = r.x0 - g.renderer.camera.x, X1 = r.x1 - g.renderer.camera.x;
    const Y0 = r.y0 - g.renderer.camera.y, Y1 = r.y1 - g.renderer.camera.y;
    let inBox = 0, outBox = 0;
    for (let y = Math.round(Y0 - 12); y <= Math.round(Y1 + 12); y++) {
      for (let x = Math.max(0, Math.round(X0 - 40)); x <= Math.min(c.width - 1, Math.round(X1 + 40)); x++) {
        const i = (y * c.width + x) * 4;
        const hit = Math.abs(d[i] - 0x35) < 14 && Math.abs(d[i + 1] - 0x20) < 14 && Math.abs(d[i + 2] - 0x0f) < 14;
        if (!hit) continue;
        if (Math.abs(d[i] - d0[i]) + Math.abs(d[i + 1] - d0[i + 1]) + Math.abs(d[i + 2] - d0[i + 2]) < 24) continue; // 글씨가 아닌 것
        if (x >= X0 && x <= X1 && y >= Y0 && y <= Y1) inBox++; else outBox++;
      }
    }
    const mapW = s.map.w * T;
    return { label: longest.label, inBox, outBox, x0: r.x0, x1: r.x1, mapW };
  });
  check('가장 긴 표지판 글씨가 판 안에 다 들어간다', inside.inBox > 40 && inside.outBox === 0,
    `「${inside.label}」 안 ${inside.inBox} · 밖 ${inside.outBox}`);
  check('판이 지도 밖으로 안 나간다', inside.x0 >= 0 && inside.x1 <= inside.mapW,
    `${Math.round(inside.x0)}~${Math.round(inside.x1)} / ${inside.mapW}`);

  // ══ 6-2. 판이 **실제로 보인다** — 양끝을 따로 ══════════
  //
  // 0.70.24 에 나무가 앞머리를 덮어 "포이노 마을" 이 "노 마을" 이 됐다.
  // 잘리는 것은 언제나 한쪽 끝이라 **양끝을 따로** 센다(합으로 세면 못 잡는다 — 실제로 놓쳤다).
  const seen = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('field_1', 3, 15);
    await new Promise((r) => setTimeout(r, 600));
    for (const m of s.monsters) m.alive = false;
    const sg = s.map.signs.find((q) => q.x < 5);
    const pl = s.player;
    pl.tx = pl.fromTx = sg.x + 2; pl.ty = pl.fromTy = sg.y + 2;
    pl.px = pl.tx * T + T / 2; pl.py = pl.ty * T + T; pl.moving = false;
    const shot = () => {
      g.scenes.render(g.renderer);
      const c = g.renderer.ctx.canvas;
      return { d: g.renderer.ctx.getImageData(0, 0, c.width, c.height).data, w: c.width };
    };
    const withIt = shot();
    const fs = g.fieldScene;
    const q = fs._ground.props.find((x) => x.sign === sg);
    const r = fs._signRect(s.map, q, g.renderer.ctx);
    const cx = g.renderer.camera.x, cy = g.renderer.camera.y;
    const keep = fs._ground.props;
    fs._ground.props = keep.filter((x) => x !== q);   // 판만 지우고 같은 자리를 다시 그린다
    const without = shot();
    fs._ground.props = keep;
    const half = (x0, x1) => {
      let n = 0;
      for (let y = Math.round(r.y0 - cy); y <= Math.round(r.y1 - cy); y++) {
        for (let x = Math.round(x0 - cx); x <= Math.round(x1 - cx); x++) {
          const i = (y * withIt.w + x) * 4;
          if (Math.abs(withIt.d[i] - without.d[i]) > 10) n++;
        }
      }
      return n;
    };
    const mid = (r.x0 + r.x1) / 2;
    return { left: half(r.x0, mid), right: half(mid, r.x1), label: sg.label };
  });
  check('표지판 판의 왼쪽이 보인다', seen.left > 150, `${seen.label} — 왼쪽 ${seen.left}`);
  check('표지판 판의 오른쪽이 보인다', seen.right > 150, `${seen.label} — 오른쪽 ${seen.right}`);

  // ══ 6-3. 누르면 그 길을 알려 준다 ══════════════════════
  //
  // 실제 마우스로 판 한가운데를 누른다. 성문 표지판을 고른 까닭 — 옆에 위병이
  // 서 있고 위병을 누르는 자리(60×80)가 판을 덮는다. 처음에 판을 눌렀더니
  // 위병이 "멈춰라" 했다.
  const clickAt = async (mapId, pick) => {
    const at = await page.evaluate(async ([mapId, pick]) => {
      const g = window.__game, s = g.store.state, T = 32;
      g.changeMap(mapId, 3, 15);
      await new Promise((r) => setTimeout(r, 600));
      const sg = s.map.signs.find((q) => q.label === pick) || s.map.signs[0];
      const pl = s.player;
      pl.tx = pl.fromTx = sg.x - 1; pl.ty = pl.fromTy = sg.y + 1;
      pl.px = pl.tx * T + T / 2; pl.py = pl.ty * T + T; pl.moving = false;
      g.scenes.render(g.renderer);
      const fs = g.fieldScene;
      const q = fs._ground.props.find((x) => x.sign === sg);
      const r = fs._signRect(s.map, q, g.renderer.ctx);
      const c = g.renderer.ctx.canvas.getBoundingClientRect();
      const kx = c.width / g.renderer.width, ky = c.height / g.renderer.height;
      return { x: c.left + ((r.x0 + r.x1) / 2 - g.renderer.camera.x) * kx,
               y: c.top + ((r.y0 + r.y1) / 2 - g.renderer.camera.y) * ky };
    }, [mapId, pick]);
    await page.mouse.move(at.x, at.y);
    await page.waitForTimeout(120);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(2600);   // 한 글자씩 찍히는 동안 기다린다
    const txt = await page.evaluate(() => {
      const el = document.querySelector('.dlg-text');
      const who = document.querySelector('.dlg-name, [data-speaker]');
      return { text: el ? el.innerText : '', who: who ? who.innerText : '' };
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { try { window.__game.bus.emit('dialogue:skip'); } catch (e) {} });
    await page.waitForTimeout(300);
    return txt;
  };
  const gateSign = await clickAt('poino', '포이노 성');
  check('성문 표지판을 누르면 표지판이 말한다(위병이 아니라)',
    gateSign.text.includes('이 길로 가면') && !gateSign.text.includes('멈춰라'),
    JSON.stringify(gateSign.text.slice(0, 40)));
  check('들어갈 조건도 먼저 알려 준다', gateSign.text.includes('레벨 25'),
    JSON.stringify(gateSign.text.split('\n').slice(-1)[0]));
  const bossSign = await page.evaluate(async () => {
    // 5단계(보스가 있는 들판)로 가는 표지판의 말 — 주인 이름이 나와야 한다
    const g = window.__game, s = g.store.state;
    g.changeMap('field_4', 3, 15);
    await new Promise((r) => setTimeout(r, 400));
    return s.map.signs.map((q) => q.to);
  });
  check('보스 들판으로 가는 표지판이 있다', bossSign.includes('field_5'), bossSign.join(' '));

  // ══ 7. 같은 이름은 묶는다 ══════════════════════════════
  //
  // 몬스터를 한자리에 세우고 **곧바로** 그린다(기다리면 걸어가 버린다).
  // 그리는 쪽이 실제로 쓴 값을 엿들어 잰다 — 규칙을 다시 계산하면 시험이
  // 규칙의 사본이 될 뿐이다.
  const tagRun = (names) => page.evaluate(async (names) => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('field_1', 3, 15);
    await new Promise((r) => setTimeout(r, 500));
    const cx = 20, cy = 16;
    const pl = s.player;
    pl.tx = pl.fromTx = cx; pl.ty = pl.fromTy = cy + 4;
    pl.px = cx * T + T / 2; pl.py = (cy + 4) * T + T; pl.moving = false;
    s.monsters.forEach((m, i) => {
      if (i >= names.length) { m.alive = false; return; }
      const x = cx + (i % 3) - 1, y = cy + Math.floor(i / 3);
      m.alive = true; m.moving = false; m.alerted = false;
      m.tx = m.fromTx = x; m.ty = m.fromTy = y;
      m.px = x * T + T / 2; m.py = y * T + T;
      m.name = names[i];
    });
    const fs = g.fieldScene;
    const put = [];
    const real = fs._drawMonsterTag.bind(fs);
    fs._drawMonsterTag = (r, st, actor, atY, count = 1) => {
      put.push({ text: fs._tagText(st, actor, count), y: atY, x: actor.px,
                 w: fs._tagWidth(r, st, actor, count), front: actor.py });
      return real(r, st, actor, atY, count);
    };
    g.scenes.render(g.renderer);
    fs._drawMonsterTag = real;
    return put;
  }, names);

  const six = await tagRun(['슬라임', '슬라임', '슬라임', '슬라임', '슬라임', '슬라임']);
  check('같은 이름 여섯은 이름표 한 장이다', six.length === 1, six.map((t) => t.text).join(' | '));
  check('묶인 이름표에 ×6 이 붙는다', six.length === 1 && / ×6$/.test(six[0].text),
    six.map((t) => t.text).join(' | '));

  // ══ 8. 이름이 다르면 조금 겹쳐서 편다 ══════════════════
  const mix = await tagRun(['슬라임', '늑대', '박쥐', '슬라임', '버섯', '늑대']);
  const texts = mix.map((t) => t.text);
  check('다른 이름은 따로, 같은 이름은 묶인다(넷)', mix.length === 4, texts.join(' | '));
  check('섞여도 같은 이름끼리는 ×2', texts.filter((t) => / ×2$/.test(t)).length === 2, texts.join(' | '));
  // 가로로 겹치는 짝끼리는 **같은 높이에 놓이지 않는다**(층이 진다) — 다만 13px(글자 키)
  // 만큼 떨어뜨리지는 않는다. 조금 겹쳐서 탑을 쌓지 않는 것이 0.70.25 의 뜻이다.
  let stacked = 0, sameRow = 0;
  for (let i = 0; i < mix.length; i++) for (let j = i + 1; j < mix.length; j++) {
    const a = mix[i], b = mix[j];
    const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2;
    if (!overlapX) continue;
    const dy = Math.abs(a.y - b.y);
    if (dy < 1) sameRow++;
    else if (dy < 13) stacked++;
  }
  check('가로로 겹치는 이름표가 같은 높이에 포개지지 않는다', sameRow === 0, `포갠 짝 ${sameRow}`);
  check('층은 지되 글자 키보다 좁게 — 조금 겹친다', stacked > 0, `좁게 층진 짝 ${stacked}`);
  const ys = mix.map((t) => t.y);
  check('이름표 탑이 높이 쌓이지 않는다(세 층 이하)',
    Math.max(...ys) - Math.min(...ys) <= 10 * 3 + 32,
    `맨 위와 맨 아래 차이 ${Math.round(Math.max(...ys) - Math.min(...ys))}px`);
  // 가장 앞에 선 놈의 이름표가 **마지막에** 그려져야 겹친 자리에서 위로 온다.
  const lastFront = mix[mix.length - 1].front === Math.max(...mix.map((t) => t.front));
  check('가장 앞 이름표를 맨 위에 그린다', lastFront, mix.map((t) => `${t.text}@${t.front}`).join(' | '));

  // ══ 9. 성 안에는 풀이 안 돋는다 ═══════════════════════
  //
  // 길가 풀 술은 흙길이 **풀밭과** 맞닿은 변에만 얹는다. 그런데 얹는 그림(양탄자·창)
  // 옆이면 무조건 풀밭으로 쳐서, 알현실 한가운데 풀이 돋았다(0.70.25 에 고침).
  // 바닥 판을 새로 구우면서 무엇을 찍는지 엿들어 센다.
  const grass = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const out = {};
    for (const id of ['throne', 'castle', 'field_1', 'poino']) {
      g.changeMap(id, 5, 10);
      await new Promise((r) => setTimeout(r, 300));
      const fs = g.fieldScene;
      fs._ground = null;
      let n = 0;
      const real = g.renderer.intoCanvas.bind(g.renderer);
      g.renderer.intoCanvas = (ctx) => {
        const b = real(ctx);
        const draw = b.drawSprite.bind(b);
        b.drawSprite = (k, ...a) => { if (/^tile_edge_grass/.test(k)) n++; return draw(k, ...a); };
        return b;
      };
      fs._groundLayer(g.renderer, s.map, 32);
      g.renderer.intoCanvas = real;
      out[id] = n;
    }
    return out;
  });
  check('알현실에 풀 술이 안 돋는다', grass.throne === 0, `${grass.throne}장`);
  check('성 입구에도 안 돋는다', grass.castle === 0, `${grass.castle}장`);
  check('들판 길가에는 여전히 돋는다', grass.field_1 > 20, `${grass.field_1}장`);

  // ══ 10. 성벽이 바닥 위에 **서 있다** ═══════════════════
  //
  // 벽이 바닥 앞에서 칼로 자른 듯 끝나면 서 있는 돌담이 아니라 바닥에 칠한 무늬다.
  // 벽 바로 아래 바닥 칸의 **윗줄이 아랫줄보다 어두운지**(그림자) 픽셀로 본다.
  const edge = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state, T = 32;
    g.changeMap('castle', 5, 10);
    await new Promise((r) => setTimeout(r, 400));
    g.fieldScene._ground = null;
    const L = g.fieldScene._groundLayer(g.renderer, s.map, T);
    const cx = L.canvas.getContext('2d');
    const m = s.map, ts = m.tileset;
    const lum = (x, y) => { const d = cx.getImageData(x, y, 1, 1).data; return d[0] * 0.3 + d[1] * 0.59 + d[2] * 0.11; };
    const rowLum = (X, y) => { let t = 0; for (let x = X + 2; x < X + T - 2; x++) t += lum(x, y); return t / (T - 4); };
    let checked = 0, shaded = 0, side = 0, sideShaded = 0;
    for (let y = 0; y < m.h - 1; y++) for (let x = 0; x < m.w; x++) {
      const a = ts[m.grid[y][x]], b = ts[m.grid[y + 1][x]];
      if (!a || !b || !a.solid || b.solid) continue;
      if (!/^tile_castle_wall|^tile_castle_top/.test(a.sprite)) continue;
      if (b.over) continue;   // 양탄자 위는 무늬가 섞여 못 잰다
      // 성문은 지나다녀도 **벽의 일부**다 — 그림자를 드리울 바닥이 아니다.
      // (처음에 이것까지 셌다가 어두운 문 그림 때문에 '그림자 없음' 으로 잡혔다)
      if (!/floor|brick|path|grass/.test(b.sprite)) continue;
      checked++;
      const top = rowLum(x * T, (y + 1) * T + 1), bot = rowLum(x * T, (y + 1) * T + T - 2);
      if (top < bot - 4) shaded++;
    }
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w - 1; x++) {
      const a = ts[m.grid[y][x]], b = ts[m.grid[y][x + 1]];
      if (!a || !b || !a.solid || b.solid || b.over) continue;
      if (!/^tile_castle_wall/.test(a.sprite)) continue;
      if (!/floor|brick|path|grass/.test(b.sprite)) continue;
      side++;
      let near = 0, far = 0;
      for (let yy = y * T + 4; yy < y * T + T - 4; yy++) { near += lum((x + 1) * T + 1, yy); far += lum((x + 1) * T + T - 3, yy); }
      if (near < far - 4 * (T - 8)) sideShaded++;
    }
    return { checked, shaded, side, sideShaded };
  });
  check('성벽 아래 바닥에 그림자가 진다', edge.checked > 5 && edge.shaded === edge.checked,
    `${edge.shaded}/${edge.checked}칸`);
  check('성벽 오른쪽 바닥에도 그림자가 진다', edge.side > 5 && edge.sideShaded === edge.side,
    `${edge.sideShaded}/${edge.side}칸`);

  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
