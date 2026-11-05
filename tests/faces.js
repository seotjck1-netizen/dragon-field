// 마을 사람 얼굴 — 주인공과 다르고, 서로 다르다 (0.70.38).
//
// 0.70.37 까지 마을 사람 13명은 주인공의 몸 넷(m1 · f1 · m2 · f2) 가운데 하나에 머리색 · 모자 · 옷만 바꿔 입혀
// **얼굴이 주인공과 똑같았다**(같은 파란 눈 · 같은 찌푸린 눈썹 · 같은 입). tools/npc-face.py 가 사람마다 새 얼굴을 그린다.
//
// ⚠ 성질을 잰다: 대화창 얼굴(assets/ui/portraits)의 **두 눈 자리**만 잘라
//   ① 주인공 얼굴 넷(tests/fixtures/player-faces.webp — portrait-art.py 가 같은 틀로 그린 것)과 다르다
//   ② 마을 사람끼리도 다르다
//   를 잰다. 바탕 빛 · 머리색 · 모자는 눈 자리 밖이라 셈에 안 든다(머리색만 바꾼 0.70.37 얼굴은 여기서 걸린다).
// ⚠ 0.70.37 의 얼굴로 되돌려 돌려 보면 ①이 4~6, ②가 3 안팎으로 떨어져 **실패한다**(한 번 실패시켜 봤다).
const { chromium } = require('playwright');
const { tally } = require('./lib/harness.js');
const { check, done } = tally();
const BASE = `http://localhost:${process.env.STATIC_PORT || 8899}`;
const npcs = require('../src/data/npcs.json');
const manifest = require('../src/data/manifest.json');

// 흉상(264×330) 안의 두 눈 자리 — portrait-art.py 가 눈 높이(EYE_AT)와 얼굴 가운데에 맞춰 자른다
const EYES = [[88, 146, 38, 22], [140, 146, 38, 22]];
const VS_PLAYER = 20;     // 0.70.37: 4~6 (안경 쓴 연금술사 28 · 작게 그린 아이 50) → 0.70.38: 53 넘게
const VS_EACH = 12;       // 0.70.37: 3 안팎 → 0.70.38: 19 넘게

(async () => {
  const people = Object.entries(npcs)
    .filter(([k, v]) => !k.startsWith('_') && v && v.sprite && manifest[`${v.sprite}_back`])   // 사람 = 뒷모습이 있는 것(돌 · 게시판은 없다)
    .map(([id, v]) => ({ id, sprite: v.sprite }));
  check('마을 사람을 다 찾았다', people.length >= 12, `${people.length}명`);
  const noBust = people.filter((p) => !manifest[`portrait_${p.sprite}`]);
  check('사람마다 대화창 얼굴이 있다', noBust.length === 0, noBust.map((p) => p.id).join(' '));

  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/src/data/manifest.json`);           // 같은 곳(origin)에서 그림을 읽어야 픽셀을 잴 수 있다
  const r = await page.evaluate(async ({ busts, EYES }) => {
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error(src)); im.src = src; });
    const W = 264, H = 330;
    const cut = (im, ox = 0) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.drawImage(im, ox, 0, W, H, 0, 0, W, H);
      const out = [];
      for (const [ex, ey, ew, eh] of EYES) out.push(...x.getImageData(ex, ey, ew, eh).data);
      return out;
    };
    const mad = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; } return s / n; };
    const ref = await load('/tests/fixtures/player-faces.webp');
    const players = [0, 1, 2, 3].map((i) => cut(ref, i * W));
    // 자를 먼저 의심한다 — 주인공 그림의 눈 자리에 정말 눈(흰자 · 짙은 눈동자)이 있나
    const eyeIn = players.map((p) => {
      let white = 0, dark = 0;
      for (let i = 0; i < p.length; i += 4) {
        const l = (p[i] + p[i + 1] + p[i + 2]) / 3;
        if (l > 225) white++;
        if (l < 60) dark++;
      }
      return { white: white / (p.length / 4), dark: dark / (p.length / 4) };
    });
    const faces = {};
    for (const [id, src] of busts) faces[id] = cut(await load('/' + src));
    const vsPlayer = {};
    for (const id of Object.keys(faces)) vsPlayer[id] = Math.min(...players.map((p) => mad(faces[id], p)));
    const ids = Object.keys(faces);
    let worst = { d: Infinity };
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const d = mad(faces[ids[i]], faces[ids[j]]);
      if (d < worst.d) worst = { d, a: ids[i], b: ids[j] };
    }
    return { eyeIn, vsPlayer, worst };
  }, { busts: people.filter((p) => manifest[`portrait_${p.sprite}`]).map((p) => [p.id, manifest[`portrait_${p.sprite}`].src]), EYES });

  check('자 — 주인공 그림의 눈 자리에 흰자와 눈동자가 있다', r.eyeIn.every((e) => e.white > 0.04 && e.dark > 0.04),
    r.eyeIn.map((e) => `흰 ${(e.white * 100).toFixed(0)}% 짙은 ${(e.dark * 100).toFixed(0)}%`).join(' · '));
  const near = Object.entries(r.vsPlayer).filter(([, d]) => d <= VS_PLAYER);
  check(`마을 사람 얼굴이 주인공 얼굴(넷)과 다르다(눈 자리 차이 > ${VS_PLAYER})`, near.length === 0,
    near.map(([id, d]) => `${id} ${d.toFixed(1)}`).join(' · ') || `가장 가까운 ${Math.min(...Object.values(r.vsPlayer)).toFixed(1)}`);
  check(`마을 사람끼리 얼굴이 다르다(눈 자리 차이 > ${VS_EACH})`, r.worst.d > VS_EACH, `가장 닮은 둘 ${r.worst.a} · ${r.worst.b} ${r.worst.d.toFixed(1)}`);
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
