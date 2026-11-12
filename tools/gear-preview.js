#!/usr/bin/env node
/**
 * 장비를 하나씩 입혀 보는 미리보기 (0.70.26).
 *
 *   python3 tools/ref-cut.py            # 준 그림의 체크무늬 배경을 걷는다
 *   node tools/base-bake.js             # 벗은 몸(티·바지)을 굽는다
 *   python3 tools/ref-compose.py        # 준 그림을 칸별로 갈라 하나씩 입힌 그림을 만든다
 *   node tools/gear-preview.js          # → art/preview/gear-<직업>.png · art/preview/gear-all.png
 *
 * 게임 그림(assets/)은 건드리지 않는다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PARTS = path.join(ROOT, 'art', 'parts');
const OUT = path.join(ROOT, 'art', 'preview');
const meta = JSON.parse(fs.readFileSync(path.join(PARTS, 'states.json'), 'utf8'));
const NAME = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };
const PROG = [0, 1, 2, 3, 4, 5, 6];       // 기본 → … → +무기
const SOLO = [7, 8, 9, 10];               // 한 칸만

const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const big = (c, i) => img(path.join(PARTS, c, `state_${i}.png`));
const small = (c, i) => img(path.join(PARTS, c, `state_${i}_s.png`));
const label = (c, i) => meta[c].states[i].label;

const CSS = `
  body{margin:0;background:#1d2a1f;font:600 13px system-ui,'Noto Sans KR',sans-serif;color:#f1ecdf;padding:14px}
  h1{font-size:17px;margin:0 0 4px} h2{font-size:13px;margin:14px 0 6px;color:#cfe3c4;font-weight:600}
  .note{font-weight:400;color:#b8c7b0;font-size:12px;margin:0 0 8px}
  .row{display:flex;gap:10px;align-items:flex-end}
  .c{text-align:center;font-size:12px}
  .c img{display:block;margin:0 auto 4px}
  .grass{background:#4f8a3e;border-radius:6px;padding:6px}
  .px img{image-rendering:pixelated}
  .arrow{align-self:center;color:#8fae84;font-size:18px}
  .ref{outline:2px dashed #e6c35c;outline-offset:3px}
`;

function classPage(c) {
  const ref = img(path.join(ROOT, 'art', 'reference', `${c}_ref_cut.png`));
  const cells = (list, w, h, src, cls = '', arrows = true) => list.map((i, k) => `
      ${k && arrows ? '<div class="arrow">›</div>' : ''}
      <div class="c ${cls}"><div class="grass"><img src="${src(c, i)}" style="width:${w}px;height:${h}px"></div>${label(c, i)}</div>`).join('');
  return `<style>${CSS}</style>
    <h1>${NAME[c]} — 벗은 몸에서 장비를 하나씩</h1>
    <p class="note">왼쪽부터 칸을 하나씩 더 입힌다. 마지막(+무기)은 준 그림과 점 하나 다르지 않다.</p>
    <div class="row">${cells(PROG, 150, 200, big)}
      <div class="arrow">=</div>
      <div class="c ref"><div class="grass"><img src="${ref}" style="width:150px;height:200px"></div>준 그림</div>
    </div>
    <h2>게임 크기 1배 (48×64 — 실제로 보이는 크기)</h2>
    <div class="row">${cells(PROG, 48, 64, small)}</div>
    <h2>2배</h2>
    <div class="row">${cells(PROG, 96, 128, small)}</div>
    <h2>4배 (점 하나하나 — 192×256 파일 그대로)</h2>
    <div class="row px">${cells(PROG, 192, 256, small)}</div>
    <h2>한 칸만 걸쳤을 때 — 칸끼리 서로 기대지 않는지 본다</h2>
    <div class="row" style="gap:18px">${cells(SOLO, 120, 160, big, '', false)}</div>`;
}

function allPage() {
  const row = (c, w, h) => `<div class="row">${PROG.map((i) =>
    `<div class="c"><img src="${small(c, i)}" style="width:${w}px;height:${h}px">${w > 60 ? label(c, i) : ''}</div>`).join('')}</div>`;
  return `<style>${CSS} .grass2{background:#4f8a3e;padding:10px;border-radius:6px;display:inline-block}</style>
    <h1>세 직업 — 기본 → 갑옷 → 어깨 → 장갑 → 신발 → 벨트 → 무기</h1>
    <h2>게임 크기 1배</h2>
    <div class="grass2">${['warrior', 'ranger', 'mage'].map((c) => row(c, 48, 64)).join('<div style="height:6px"></div>')}</div>
    <h2>2배</h2>
    <div class="grass2">${['warrior', 'ranger', 'mage'].map((c) => row(c, 96, 128)).join('<div style="height:6px"></div>')}</div>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1660, height: 900 } });
  for (const c of ['warrior', 'ranger', 'mage']) {
    await p.setContent(classPage(c));
    await p.waitForTimeout(200);
    const f = path.join(OUT, `gear-${c}.png`);
    await p.screenshot({ path: f, fullPage: true });
    console.log('✓', path.relative(ROOT, f));
  }
  await p.setViewportSize({ width: 820, height: 600 });
  await p.setContent(allPage());
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(OUT, 'gear-all.png'), fullPage: true });
  console.log('✓ art/preview/gear-all.png');
  await b.close();
})();
