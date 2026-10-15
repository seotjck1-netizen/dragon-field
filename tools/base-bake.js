#!/usr/bin/env node
// 벗은 몸(tools/art-base.js)을 768×1024 PNG 로 굽는다 → art/parts/<직업>/base.png (0.70.26 미리보기)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { baseSVG, POSE } = require('./art-base.js');

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : ['warrior', 'ranger', 'mage'];
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setViewportSize({ width: 768, height: 1024 });
  for (const n of names) {
    const out = path.join(__dirname, '..', 'art', 'parts', n);
    fs.mkdirSync(out, { recursive: true });
    await p.setContent(`<body style="margin:0;background:transparent">${baseSVG(n)}</body>`);
    await (await p.$('svg')).screenshot({ path: path.join(out, 'base.png'), omitBackground: true });
    // 몸통만(팔 없이) — 허리띠·칼 밑을 갑옷으로 메울 때 **팔까지 메우지 않으려고** 쓴다
    await p.setContent(`<body style="margin:0;background:transparent">${baseSVG(n, { arms: false })}</body>`);
    await (await p.$('svg')).screenshot({ path: path.join(out, 'base_torso.png'), omitBackground: true });
    fs.writeFileSync(path.join(out, 'pose.json'), JSON.stringify(POSE[n]));
    console.log('✓', n);
  }
  await b.close();
})();
