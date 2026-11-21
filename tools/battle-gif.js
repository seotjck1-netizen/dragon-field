#!/usr/bin/env node
/**
 * 전투 동작을 움직이는 그림(GIF)으로 뽑는다.
 *
 *   node tools/battle-gif.js                       세 직업을 각각 한 장씩
 *   node tools/battle-gif.js --class mage          한 직업만
 *   node tools/battle-gif.js --foes 3 --seconds 6  잡몹 셋 · 6초
 *   node tools/battle-gif.js --hp 100              상대를 더 두껍게(더 오래 싸운다)
 *   node tools/battle-gif.js --scale 0.5 --fps 12  작게 · 촘촘하게
 *   node tools/battle-gif.js --port 8787           다른 포트의 서버를 본다
 *   node tools/battle-gif.js --out /tmp            다른 곳에 뽑는다
 *   node tools/battle-gif.js --no-trail            달릴 때 잔상 없이 찍는다(견주기용)
 *
 * 나오는 곳: docs/battle-<직업>.gif
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 0.54 에서 전투에 동작을 넣었다(검을 휘두르고 · 마법과 화살이 날아가고 ·
 * 회피 · 부활 고리 · 보호막 오로라). 그런데 **정지 화면으로는 이걸 볼 수가 없다.**
 * 빠르기가 맞는지, 이펙트가 제때 터지는지는 움직여 봐야 안다.
 * 그래서 화면을 그대로 받아 GIF 로 굽는다. 파일 하나면 누구에게든 보여 줄 수 있다.
 *
 * 서버가 안 떠 있으면 `npm start` 로 먼저 띄우세요(기본 8787).
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { encodeGif } = require('./gif.js');
const { readPng } = require('./pngread.js');

const ROOT = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d;
};

const PORT = Number(arg('--port', 8787));
const SECONDS = Number(arg('--seconds', 7));
const FPS = Number(arg('--fps', 10));
const SCALE = Number(arg('--scale', 0.75));
const FOES = Number(arg('--foes', 3));
const HP_MULT = Number(arg('--hp', 60)); // 상대를 몇 배로 두껍게 할까(녹화 내내 싸우게)
const OUT_DIR = arg('--out', path.join(ROOT, 'docs'));
const TRAIL = argv.includes('--no-trail') ? false : null; // 잔상 끄고 찍어 견주기
const ONLY = arg('--class', null);
const CLASSES = ONLY ? [ONLY] : ['warrior', 'ranger', 'mage'];
const BASE = `http://localhost:${PORT}`;

/** 새 계정을 만들고 게임이 뜰 때까지 기다린다. */
async function newGame(page, cls) {
  await page.goto(`${BASE}/index.html`);
  await page.waitForTimeout(1600);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', 'gif' + Math.floor(Math.random() * 900000));
  for (const el of await page.$$('input[type="password"]')) await el.fill('test1234');
  for (const btn of await page.$$('[data-class]')) {
    if ((await btn.getAttribute('data-class')) === cls) { await btn.click(); break; }
  }
  for (const btn of await page.$$('button')) {
    const t = (await btn.innerText()).trim();
    if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
  }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
}

/**
 * 찍을 자리 — 게임 화면(stage) 하나.
 *
 * ⚠ 캔버스 픽셀만 퍼 오면 안 된다. 체력 막대 · 피해 숫자 · 전투 기록은
 *   캔버스가 아니라 **그 위에 얹힌 HTML** 이라, 캔버스만 찍으면 통째로 빠진다.
 *   그래서 브라우저에게 화면을 통째로 찍게 하고(PNG), 여기서 푼다(tools/pngread.js).
 */
async function stageBox(page) {
  const box = await page.evaluate(() => {
    const el = document.getElementById('stage');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  return {
    x: Math.round(box.x), y: Math.round(box.y),
    width: Math.round(box.width), height: Math.round(box.height),
  };
}

/** 크기를 줄인다 — 가장 가까운 픽셀을 집는다(GIF 라 부드럽게 할 이유가 없다). */
function shrink(src, sw, sh, dw, dh) {
  if (dw === sw && dh === sh) return src;
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(sh - 1, Math.round((y * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(sw - 1, Math.round((x * sw) / dw));
      const s = (sy * sw + sx) * 4;
      const d = (y * dw + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = 255;
    }
  }
  return out;
}

(async () => {
  // 서버가 살아 있는지 먼저 본다 — 안 그러면 이유 없이 타임아웃만 난다.
  try {
    const res = await fetch(`${BASE}/index.html`);
    if (!res.ok) throw new Error(String(res.status));
  } catch (e) {
    console.error(`\n  ${BASE} 에 서버가 없습니다. \`npm start\` 로 먼저 띄우세요.\n`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const outDir = OUT_DIR;
  fs.mkdirSync(outDir, { recursive: true });

  for (const cls of CLASSES) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await newGame(page, cls);

    // 싸울 자리로 옮기고, 잡몹 몇을 첫 놈 옆에 붙여 놓는다(광역·다대일을 보기 위해).
    //
    // ⚠ 상대를 두껍게 만든다. 그러지 않으면 Lv.20 이 슬라임을 두 대에 눕히고,
    //   찍히는 것은 **끝난 화면 예순 장**이다(실제로 그렇게 나왔다).
    //   동작을 보려는 것이므로 주고받는 장면이 녹화 내내 이어져야 한다.
    await page.evaluate(({ foes, hpMult, trail }) => {
      const g = window.__game;
      g.changeMap('field_1', 5, 5);
      const s = g.store.state;
      s.player.level = 16;
      for (const m of Object.values(s.db.monsters)) {
        if (m && m.stats && !m._gifBumped) { m.stats.hp = Math.round(m.stats.hp * hpMult); m._gifBumped = 1; }
      }
      const alive = s.monsters.filter((m) => m.alive).slice(0, Math.max(1, foes));
      const first = alive[0];
      alive.slice(1).forEach((m, i) => {
        m.tx = first.tx + 1;
        m.ty = first.ty + i;
        m.px = m.tx * 32; m.py = m.ty * 32;
      });
      if (trail === false) g.battleScene.trail = false;
      g.bus.emit('battle:request', { monsterUid: first.uid });
    }, { foes: FOES, hpMult: HP_MULT, trail: TRAIL });

    const frames = [];
    const step = Math.round(1000 / FPS);
    const total = Math.round(SECONDS * FPS);
    // 들어가는 연출(INTRO)이 끝나고 첫 합이 오갈 때부터 찍는다.
    await page.waitForTimeout(600);
    const clip = await stageBox(page);
    const dw = Math.round(clip.width * SCALE);
    const dh = Math.round(clip.height * SCALE);
    for (let i = 0; i < total; i++) {
      const png = readPng(await page.screenshot({ clip }));
      frames.push(shrink(png.data, png.width, png.height, dw, dh));
      await page.waitForTimeout(step);
    }

    const size = { w: dw, h: dh };
    const out = path.join(outDir, `battle-${cls}.gif`);
    fs.writeFileSync(out, encodeGif(frames, size.w, size.h, { delayMs: step }));
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`  ✓ ${path.relative(ROOT, out)}  ${size.w}×${size.h} · ${frames.length}장 · ${kb}KB`
      + (errs.length ? `  ⚠ 오류 ${errs.length}건` : ''));
    if (errs.length) console.log('    ' + errs[0].split('\n')[0]);
    await page.close();
  }

  await browser.close();
  console.log('');
})();
