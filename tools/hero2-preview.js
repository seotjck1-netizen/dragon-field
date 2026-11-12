#!/usr/bin/env node
/**
 * 새 용사 그림 미리보기 (0.70.26).
 *
 *   node tools/hero2-preview.js
 *     → art/preview/hero2/warrior_full.png   768×1024 (그린 그대로)
 *     → art/preview/hero2/warrior.png        96×128   (게임이 굽는 크기 — 48×64 의 2배)
 *     → art/preview/hero2-compare.png        준 그림 · 새 그림 · 게임 크기 · 지금 용사
 *
 * 게임 그림(assets/)은 건드리지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { WARRIOR_SVG } = require('./art-hero2.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'art', 'preview', 'hero2');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();

  // ① 그린 그대로
  await p.setViewportSize({ width: 768, height: 1024 });
  await p.setContent(`<body style="margin:0;background:transparent">${WARRIOR_SVG}</body>`);
  await (await p.$('svg')).screenshot({ path: path.join(OUT, 'warrior_full.png'), omitBackground: true });

  // ② 게임이 굽는 크기 — 96×128 (다른 그림처럼 2배로 구워 48×64 로 그린다)
  await p.setViewportSize({ width: 192, height: 256 });
  await p.setContent(`<body style="margin:0;background:transparent">
    ${WARRIOR_SVG.replace('width="768" height="1024"', 'width="192" height="256"')}</body>`);
  await (await p.$('svg')).screenshot({ path: path.join(OUT, 'warrior.png'), omitBackground: true });

  // ③ 비교 장 — A(준 그림을 그대로 줄인 것) · B(부품으로 새로 그린 것) · 지금
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const ref = path.join(ROOT, 'art', 'reference', 'warrior_ref_cut.png');
  const cur = path.join(ROOT, man.chr_hero_field.src);
  const A = path.join(OUT, 'warrior_from_ref.png');
  const B = path.join(OUT, 'warrior.png');
  const trio = (w, h, cls = '') => `<div class="row ${cls}">
      <div class="c"><img src="${img(cur)}" style="width:${w}px;height:${h}px">지금</div>
      <div class="c"><img src="${img(A)}" style="width:${w}px;height:${h}px">A 그대로</div>
      <div class="c"><img src="${img(B)}" style="width:${w}px;height:${h}px">B 새로 그림</div>
    </div>`;
  await p.setViewportSize({ width: 1500, height: 900 });
  await p.setContent(`<style>
      body{margin:0;background:#2f5a30;font:600 13px system-ui,sans-serif;color:#f4f1e6;padding:10px}
      .row{display:flex;gap:16px;align-items:flex-end}
      .c{text-align:center} .c img{display:block;margin:0 auto 4px}
      .px img{image-rendering:pixelated}
      h2{font-size:14px;margin:4px 0 8px}
    </style>
    <div class="row" style="align-items:flex-start;gap:30px">
      <div>
        <h2>크게 — 준 그림 · B(새로 그린 것)</h2>
        <div class="row">
          <div class="c"><img src="${img(ref)}" style="width:360px;height:480px">준 그림</div>
          <div class="c"><img src="${img(path.join(OUT, 'warrior_full.png'))}" style="width:360px;height:480px">B 새로 그린 것</div>
        </div>
      </div>
      <div>
        <h2>게임 크기 1배 (48×64 — 실제로 보이는 크기)</h2>${trio(48, 64)}
        <h2 style="margin-top:16px">2배</h2>${trio(96, 128)}
        <h2 style="margin-top:16px">4배 (점 하나하나)</h2>${trio(192, 256, 'px')}
      </div>
    </div>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(ROOT, 'art', 'preview', 'hero2-compare.png'), fullPage: true });

  // ④ B 는 A 와 같은 틀(192×256)로도 굽는다 — 게임 그림과 같은 크기
  await p.setViewportSize({ width: 192, height: 256 });
  await p.setContent(`<body style="margin:0;background:transparent">
    ${WARRIOR_SVG.replace('width="768" height="1024"', 'width="192" height="256"')}</body>`);
  await (await p.$('svg')).screenshot({ path: B, omitBackground: true });
  await b.close();
  console.log('✓ art/preview/hero2-compare.png');
})();
