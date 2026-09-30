#!/usr/bin/env node
/**
 * 새 사람 그림 미리보기 (0.70.25).
 *
 *   node tools/people-preview.js            → art/preview/people.png (전·후 비교)
 *   node tools/people-preview.js --only hero,mage
 *
 * 게임에 넣지 않고 **보기만** 한다. 게임 그림(assets/)은 건드리지 않는다.
 * 새 그림은 art/preview/people/<이름>.png 로 따로 굽는다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PEOPLE } = require('./art-people.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'art', 'preview');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));

// 새 그림 이름 → 지금 게임 그림 키
const OLD = {
  hero: 'chr_hero_field', ranger: 'chr_ranger_field', mage: 'chr_mage_field', admin: 'chr_admin_field',
  shopkeeper: 'npc_shopkeeper', blacksmith: 'npc_blacksmith', innkeeper: 'npc_innkeeper',
  villager: 'npc_villager', elder: 'npc_elder', gambler: 'npc_gambler', kid: 'npc_kid',
  guard: 'npc_guard', king: 'npc_king', alchemist: 'npc_alchemist',
  gate_merchant: 'npc_gate_merchant', witch: 'npc_witch', royal_smith: 'npc_royal_smith',
};
const LABEL = {
  hero: '용사', ranger: '사냥꾼', mage: '마법사', admin: '운영자',
  shopkeeper: '잡화상', blacksmith: '대장장이', innkeeper: '여관 주인', villager: '마을 사람',
  elder: '촌장', gambler: '도박사', kid: '아이', guard: '경비병', king: '왕',
  alchemist: '연금술사', gate_merchant: '성문 상인', witch: '마녀', royal_smith: '왕실 대장장이',
};

(async () => {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
    || (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '');
  const names = only ? only.split(',') : Object.keys(PEOPLE);

  fs.mkdirSync(path.join(OUT, 'people'), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });

  // ① 한 장씩 굽는다 (게임과 같은 2배)
  for (const n of names) {
    const svg = PEOPLE[n];
    await p.setViewportSize({ width: 120, height: 160 });
    await p.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    const el = await p.$('svg');
    await el.screenshot({ path: path.join(OUT, 'people', `${n}.png`), omitBackground: true });
  }

  // ② 비교 장 — 위: 지금 / 아래: 새것.  게임에서 그리는 크기(직업 48×64, NPC 60×80)의 2배로.
  const img = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const cell = (n) => {
    const o = man[OLD[n]];
    const hero = ['hero', 'ranger', 'mage', 'admin'].includes(n);
    const w = hero ? 48 : 60, h = hero ? 64 : 80;
    return `<td>
      <div class="lab">${LABEL[n] || n}</div>
      <img src="${img(path.join(ROOT, o.src))}" style="width:${w * 2}px;height:${h * 2}px">
      <img src="${img(path.join(OUT, 'people', `${n}.png`))}" style="width:${w * 2}px;height:${h * 2}px">
    </td>`;
  };
  const rows = [];
  for (let i = 0; i < names.length; i += 9) rows.push(names.slice(i, i + 9));
  await p.setViewportSize({ width: 1260, height: 900 });
  await p.setContent(`<style>
      body{margin:0;background:#2f5a30;font:600 13px system-ui,sans-serif;color:#f4f1e6}
      table{border-collapse:separate;border-spacing:6px 0;margin:10px auto}
      td{text-align:center;vertical-align:bottom;padding:4px 0 10px}
      td img{display:block;margin:0 auto}
      td img+img{margin-top:8px;border-top:1px dashed rgba(255,255,255,.25);padding-top:8px}
      .lab{margin-bottom:4px;text-shadow:0 1px 2px #000}
      h1{font-size:15px;text-align:center;margin:12px 0 0}
      .k{font-size:12px;text-align:center;opacity:.8}
    </style>
    <h1>사람 그림 — 위: 지금 · 아래: 새것 (게임에 그리는 크기의 2배)</h1>
    ${rows.map((r) => `<table><tr>${r.map(cell).join('')}</tr></table>`).join('')}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'people.png'), fullPage: true });

  // ③ 확대 장 — 새것만 크게(얼굴이 어떻게 생겼는지 보라고)
  await p.setViewportSize({ width: 1260, height: 800 });
  await p.setContent(`<style>body{margin:0;background:#2f5a30;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;padding:8px}
      div{text-align:center;color:#f4f1e6;font:600 12px system-ui}</style>
    ${names.map((n) => `<div><img src="${img(path.join(OUT, 'people', `${n}.png`))}" style="width:180px;height:240px"><br>${LABEL[n] || n}</div>`).join('')}`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'people-big.png'), fullPage: true });

  await b.close();
  console.log(`✓ ${names.length}명 → art/preview/people.png · people-big.png`);
})();
