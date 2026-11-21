// 시험을 띄우고 재는 데 쓰는 공용 연장.
//
// ⚠ **이 폴더는 저장소 안에 있어야 한다** (0.70.24).
//   0.70.23 까지 시험 122개가 `/tmp` 에만 있었다. 작업 공간이 비워지자
//   게임 코드는 zip 으로 살아남았는데 **시험만 통째로 사라졌다.**
//   저장소 밖에 둔 것은 없는 것이나 같다 — 여기 둔다.
const { chromium } = require('playwright');

// ⚠ 이 그릇에는 크로미움이 **미리 깔려 있다**(/opt/pw-browsers, 판 1194).
//   playwright 는 제 판에 맞는 크로미움만 찾으므로, **playwright 쪽을 맞춘다**
//   (`npm install playwright@1.56.0` — 1.56 이 1194 를 쓴다).
//   판이 안 맞으면 "Executable doesn't exist ... chromium-1243" 이 뜬다.
//   그때 크로미움을 새로 내려받지 말고 playwright 판을 맞춰라 —
//   내려받기는 이 그릇에서 막혀 있고, 맞추면 다른 연장(gen-assets)도 함께 산다.
const CHROME = process.env.PW_CHROME || null;

const PORT = process.env.STATIC_PORT || 8899;
const BASE = `http://localhost:${PORT}`;

/** 시험 하나의 채점표. */
function tally() {
  const ok = [], bad = [];
  return {
    check(name, cond, extra = '') {
      (cond ? ok : bad).push(name + (extra ? ` — ${extra}` : ''));
    },
    done() {
      console.log('');
      for (const s of ok) console.log('  ✓', s);
      for (const s of bad) console.log('  ✗', s);
      console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
      process.exit(bad.length ? 1 : 0);
    },
  };
}

/** 게임을 띄우고 새 계정으로 들어간다. `window.__game` 이 설 때까지 기다린다. */
async function boot(tag, opts = {}) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1000, height: 760 },
  });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/index.html`);
  await page.waitForTimeout(1400);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', tag + process.pid);
  for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
  for (const btn of await page.$$('button')) {
    const t = (await btn.innerText()).trim();
    if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
  }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await page.waitForTimeout(2500);
  return { browser, page, errs };
}

/**
 * 화면을 픽셀로 재는 연장을 페이지에 심는다.
 *
 * ⚠ 자리를 재기 **전에 반드시 shot() 을 한 번** 한다. 카메라는 render() 안에서
 *   제자리를 잡는다. 그리기 전에 재면 앞 지도의 카메라로 상자를 잡아 화면 밖에
 *   걸리고, 차이가 0 으로 나온다 — 가려진 것처럼 보이지만 **안 잰 것**이다.
 *   0.70.23 에 실제로 여기에 속았다(docs/DEPTH.md).
 */
async function installProbe(page) {
  await page.evaluate(() => {
    const g = window.__game;
    window.__occ = {
      shot() {
        g.scenes.render(g.renderer);
        const c = g.renderer.ctx.canvas;
        return { d: g.renderer.ctx.getImageData(0, 0, c.width, c.height).data, w: c.width };
      },
      box(px, py) {
        const cx = px - g.renderer.camera.x, cy = py - g.renderer.camera.y;
        return { x0: Math.round(cx - 14), x1: Math.round(cx + 14),
                 y0: Math.round(cy - 46), y1: Math.round(cy - 4) };
      },
      tagbox(px, py) {
        const cx = px - g.renderer.camera.x, cy = py - g.renderer.camera.y;
        return { x0: Math.round(cx - 45), x1: Math.round(cx + 45),
                 y0: Math.round(cy - 54), y1: Math.round(cy - 38) };
      },
      diff(a, b, r) {
        let n = 0;
        for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
          const i = (y * a.w + x) * 4;
          if (Math.abs(a.d[i] - b.d[i]) > 10) n++;
        }
        return n;
      },
    };
  });
}

/** 구운 그림 한 장을 읽어 픽셀로 돌려준다(브라우저 안에서 쓴다). */
const READ_TILE = `(key, size) => {
  const a = window.__game.renderer.assets.get(key);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  cx.drawImage(a.image, 0, 0, size, size);
  return cx.getImageData(0, 0, size, size).data;
}`;

module.exports = { chromium, CHROME, BASE, tally, boot, installProbe, READ_TILE };
