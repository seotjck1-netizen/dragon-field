// 대화창 얼굴 (0.70.33) — 대화창 왼쪽에 뜨는 얼굴은 **따로 구운 흉상**(tools/portrait-art.py)이다.
//
// ⚠ 성질을 잰다: "대화창에 얼굴을 넘기는 모든 사람 · 물건에 흉상이 있다", "흉상이 있으면 큰 칸에 꽉 채운다",
//   "흉상이 없는 그림은 예전처럼 들판 그림으로 뜬다". 픽셀 값을 적어 두지 않는다.
const fs = require('fs');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  const man = JSON.parse(read('src/data/manifest.json'));
  const npcs = JSON.parse(read('src/data/npcs.json'));
  // quests.json 은 읽기만 한다(되쓰지 않는다)
  const quests = JSON.parse(read('src/data/quests.json'));
  const main = read('src/main.js');

  // ── ① 대화창에 얼굴을 넘기는 모든 그림 ─────────────────────
  //   마을 사람(npcs.json 의 sprite) · 의뢰 게시판(quests.json) · main.js 가 직접 넘기는 것(위병 · 표지판)
  const keys = new Set(Object.values(npcs).map((d) => d && d.sprite).filter(Boolean));
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (k === 'sprite' && typeof v === 'string' && v.startsWith('npc_')) keys.add(v); else walk(v); } };
  walk(quests);
  for (const m of main.matchAll(/portrait:\s*'([\w]+)'/g)) keys.add(m[1]);
  const noBust = [...keys].filter((k) => !man[`portrait_${k}`]);
  check('대화창에 얼굴이 뜨는 모든 사람 · 물건에 흉상이 있다', keys.size >= 15 && noBust.length === 0, `${keys.size}개 · 없음: ${noBust.join(' ')}`);
  const missingFile = Object.entries(man).filter(([k, v]) => k.startsWith('portrait_') && !fs.existsSync(path.join(ROOT, v.src))).map(([k]) => k);
  check('흉상 파일이 다 있다', missingFile.length === 0, missingFile.join(' '));
  const sizes = Object.entries(man).filter(([k]) => k.startsWith('portrait_')).map(([, v]) => `${v.w}x${v.h}`);
  check('흉상은 화면 132×165 의 두 배로 구웠다(고해상도 화면에서도 선명)', sizes.every((s) => s === '132x165'), [...new Set(sizes)].join(' '));
  const bytes = Object.entries(man).filter(([k]) => k.startsWith('portrait_')).reduce((s, [, v]) => s + fs.statSync(path.join(ROOT, v.src)).size, 0);
  check('흉상을 다 합쳐도 가볍다(400KB 안 — 한 장짜리 html 크기)', bytes < 400e3, `${(bytes / 1024).toFixed(0)}KB`);

  // ── ② 게임 안 ──────────────────────────────────────────
  const { browser, page, errs } = await boot('dlg');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const el = () => document.querySelector('.dlg-portrait');
    const shot = async (portrait) => {
      g.bus.emit('dialogue:line', { speaker: '시험', text: '안녕', portrait });
      await wait(400);
      const p = el(), img = p && p.querySelector('img'), rc = p && p.getBoundingClientRect();
      const ir = img && img.getBoundingClientRect();
      return { bust: !!(p && p.classList.contains('is-bust')), hidden: !!(p && p.hidden), w: rc && rc.width, h: rc && rc.height,
        nw: img && img.naturalWidth, nh: img && img.naturalHeight, fill: ir && rc ? (ir.width * ir.height) / (rc.width * rc.height) : 0 };
    };
    const out = {};
    out.king = await shot('npc_king');
    out.sign = await shot('tile_signpost');
    out.board = await shot('npc_quest_board');
    // 흉상이 없는 그림(몬스터)은 예전처럼 들판 그림으로 — 깨지지 않는다
    out.plain = await shot('mon_slime_field');
    g.bus.emit('dialogue:closed');
    await wait(100);
    out.closedHidden = document.querySelector('#dialogue').hidden;
    return out;
  });
  check('흉상은 큰 칸(120×150 안팎)에 뜬다', r.king.bust && r.king.w >= 110 && r.king.h >= 140, JSON.stringify(r.king));
  check('흉상 그림은 고해상도(가로 264 · 세로 330)', r.king.nw >= 264 && r.king.nh >= 330, `${r.king.nw}×${r.king.nh}`);
  check('흉상이 칸을 꽉 채운다', r.king.fill > 0.9, r.king.fill.toFixed(2));
  check('표지판 · 의뢰 게시판도 흉상', r.sign.bust && r.board.bust, `${r.sign.bust} ${r.board.bust}`);
  check('흉상이 없는 그림은 예전 칸 그대로(깨지지 않는다)', !r.plain.bust && !r.plain.hidden && r.plain.w < 100, JSON.stringify(r.plain));
  check('대화가 닫히면 대화창이 사라진다', r.closedHidden === true);
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
