#!/usr/bin/env node
/**
 * SVG 여러 장을 한 번에 PNG 로 굽는다 (투명 바탕).
 *
 *   node tools/svg-bake.js list.json
 *     list.json = [{ "svg": "파일.svg", "out": "파일.png", "w": 768, "h": 1024 }, ...]
 *
 * tools/gear-art.py 가 목록을 만들고 이것을 부른다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch();
  const p = await b.newPage();
  let n = 0;
  for (const it of list) {
    const svg = fs.readFileSync(it.svg, 'utf8');
    await p.setViewportSize({ width: it.w, height: it.h });
    await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    fs.mkdirSync(path.dirname(it.out), { recursive: true });
    await (await p.$('svg')).screenshot({ path: it.out, omitBackground: true });
    n++;
  }
  await b.close();
  console.log(`✓ svg ${n}장`);
})();
