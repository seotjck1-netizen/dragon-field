#!/usr/bin/env node
/**
 * 쓰개(투구·두건·가죽모자) 대조표를 그림 한 장으로 뽑는다.
 *
 *   node tools/helmet-sheet.js [--port 8899] [--out docs/helmets.png]
 *
 * 왜 필요한가:
 * 숫자로 "정수리가 덮였다"(batch43)는 증명이 되지만, **보기 좋은지**는 증명이 안 된다.
 * 투구를 조금 올리면 눈을 덮고, 조금 내리면 머리가 뚫린다. 그 사이를 눈으로 고르려면
 * 세 직업 × 모든 쓰개를 한 화면에 늘어놓고 봐야 한다. 그걸 뽑는 도구다.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const PORT = arg('--port', '8899');
const OUT = path.resolve(__dirname, '..', arg('--out', 'docs/helmets.png'));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  await p.goto(`http://localhost:${PORT}/index.html`);
  await p.waitForTimeout(1600);
  await p.getByText('새 계정', { exact: true }).click();
  await p.fill('input[name="id"]', 'hs' + process.pid);
  for (const el of await p.$$('input[type="password"]')) await el.fill('test1234');
  await p.click('[data-submit]');
  await p.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await p.waitForTimeout(2500);

  const dataUrl = await p.evaluate(() => {
    const g = window.__game;
    const HELMETS = [null, 'cloth_hood', 'leather_cap', 'knight_helm', 'magic_helm',
                     'rune_helm', 'dragon_helm', 'dragonscale_helm'];
    const ROWS = [['chr_hero_stance', '용사'], ['chr_ranger_stance', '사냥꾼'], ['chr_mage_stance', '마법사']];
    const CW = 118, CH = 168, PAD = 78, TOP = 34;

    const c = document.createElement('canvas');
    c.width = PAD + HELMETS.length * CW;
    c.height = TOP + ROWS.length * CH;
    const x = c.getContext('2d');
    x.fillStyle = '#1b2030'; x.fillRect(0, 0, c.width, c.height);
    x.font = '13px sans-serif'; x.textAlign = 'center'; x.fillStyle = '#cfd8e6';
    HELMETS.forEach((h, i) => x.fillText(h || '(맨머리)', PAD + i * CW + CW / 2, 22));

    ROWS.forEach(([sprite, name], r) => {
      x.textAlign = 'right'; x.fillStyle = '#cfd8e6';
      x.fillText(name, PAD - 10, TOP + r * CH + CH / 2);
      HELMETS.forEach((h, i) => {
        const img = g.appearance.get(sprite, { armor: null, helmet: h });
        if (!img || !img.image) return;
        // 머리만 크게 — 위 45% 만 잘라 2배로 키운다.
        const sh = Math.floor(img.srcH * 0.5);
        x.drawImage(img.image, 0, 0, img.srcW, sh,
          PAD + i * CW + 4, TOP + r * CH + 4, CW - 8, (CW - 8) * sh / img.srcW);
        x.strokeStyle = 'rgba(255,255,255,0.09)';
        x.strokeRect(PAD + i * CW + 4, TOP + r * CH + 4, CW - 8, CH - 8);
      });
    });
    return c.toDataURL('image/png');
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await b.close();
  console.log('  →', OUT, fs.statSync(OUT).size, 'bytes');
})();
