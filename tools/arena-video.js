#!/usr/bin/env node
/**
 * 결투장 한 판 영상 (0.80.27) — 결투 계산(DuelSystem.simulateDuel, 서버와 같은 코드)으로 낸 판을 게임 전투 화면으로
 * 재생해 영상(webm)으로 찍는다. docs/ARENA-SIM.md 의 영상이 이것으로 찍은 것이다.
 *
 *   (정적 서버를 먼저 띄운다: python3 -m http.server 8899 --bind 127.0.0.1)
 *   node tools/arena-video.js http://localhost:8899 OUT_DIR 태그 거는직업 레벨 받는직업 레벨 씨앗
 *   예) SCALE=5,0.2 SPEEDK=1 node tools/arena-video.js http://localhost:8899 /tmp/v a30 ranger 30 warrior 30 11
 *   SCALE · SPEEDK · SCX 는 tools/arena-sim.js 와 같다. 끝에 영상에서 잘라 쓸 자리(startSec · crop)를 찍는다 —
 *   ffmpeg -ss <startSec> -i OUT/태그.webm -vf crop=640:480:<x>:<y> 로 전투 화면만 잘라 쓴다.
 *   게임 안에서는 시험 캐릭터의 직업 · 레벨 · 장비만 바꾼다(저장하지 않는다). 업적 알림은 가린다.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const ROOT = process.cwd();
const B = require(path.join(ROOT, 'tools/balance.js'));
const G = B.loadFrom('src');
const CLASSES = require(path.join(ROOT, 'src/data/classes.json')).list;
const NAME = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };
const [base, outDir, tag, aCls, aLv, bCls, bLv, seedS] = process.argv.slice(2);

function bodyAt(level) {
  if (level < 14) return { enh: 5, tier: 5 };
  if (level < 20) return { enh: 7, tier: 'play10' };
  if (level < 27) return { enh: 7, tier: 'play15' };
  if (level < 40) return { enh: 7, tier: 'play20' };
  if (level < 50) return { enh: 8, tier: 20 };
  return { enh: 9, tier: 20 };
}
function raw(cls, level, name) {
  const b = bodyAt(level);
  const s = B.statsOf(G, cls, level, b.enh, b.tier, null, 0);
  return { name, level, classId: cls, weaponShape: s.weaponShape, stats: s.stats, mods: s.mods, traits: CLASSES[cls].combat || {},
    sprite: CLASSES[cls].battleSprite };
}
// 장비 겉모습 — 그 레벨에 흔한 무기 · 갑옷(보이는 것만)
const LOOK = {
  play15: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff', wear: ['knight_armor', 'knight_helm', 'steel_pauldron', 'steel_gauntlet', 'swift_boots'] },
  play20: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff', wear: ['rune_mail', 'rune_helm', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt'] },
  20: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff', wear: ['dragonscale_plate', 'rune_helm', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt'] },
};

(async () => {
  const A = raw(aCls, Number(aLv), `${NAME[aCls]} Lv.${aLv}`);
  const Bb = raw(bCls, Number(bLv), `${NAME[bCls]} Lv.${bLv}`);
  const lookTier = bodyAt(Number(aLv)).tier;
  const look = LOOK[lookTier] || LOOK.play15;
  const browser = await chromium.launch();
  const tRec = Date.now();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 720 }, recordVideo: { dir: outDir, size: { width: 960, height: 720 } } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/index.html`);
  await page.waitForTimeout(1400);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', 'dv' + process.pid);
  for (const el of await page.$$('input[type="password"]')) await el.fill('2222test');
  for (const btn of await page.$$('button')) {
    const t = (await btn.innerText()).trim();
    if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
  }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '#toast-root{display:none!important}' });
  const tStart = Date.now();
  const info = await page.evaluate(async ({ A, Bb, aCls, look, seed, scale }) => {
    const g = window.__game;
    const s = g.store.state;
    const D = await import('/src/systems/DuelSystem.js');
    // 내 몸 — 직업 · 레벨 · 겉모습(무기 · 갑옷)
    s.player.classId = aCls;
    s.player.level = A.level;
    s.player.name = A.name;
    const ids = [look[aCls], ...look.wear];
    const slotOf = (id) => (s.db.items[id] || {}).slot;
    ids.forEach((id, i) => {
      const it = s.db.items[id];
      if (!it) return;
      const uid = `dv${i}`;
      s.inventory.push({ uid, id, qty: 1, grade: it.rarity || 'rare', plus: 7 });
      s.player.equipment[slotOf(id)] = uid;
    });
    g.store.notify();
    const a = D.sanitizeSnapshot(A);
    const b = D.sanitizeSnapshot(Bb);
    const r = D.simulateDuel({ a, b, seed, scale });
    const result = {
      winner: r.winner === 'a' ? 'player' : r.winner === 'b' ? 'monster' : 'draw',
      duration: r.duration, seed: r.seed, turns: r.turns,
      finalHp: { player: r.finalHp.a, monster: r.finalHp.b }, monstersHp: [r.finalHp.b],
      defeated: r.winner === 'a' ? [0] : [], potionsUsed: [],
      snapshot: { player: { hp: r.maxHp.a, maxHp: r.maxHp.a }, monsters: [{ hp: r.maxHp.b, maxHp: r.maxHp.b, mood: 1 }] },
    };
    const looks = g.battleLooks(s);
    await new Promise((res) => setTimeout(res, 600));
    const sp = Bb.sprite;
    g.scenes.push(g.battleScene, {
      result, bg: 'bg_battle_field',
      player: { name: A.name, level: A.level, ...g.battleLooks(s), maxHp: r.maxHp.a, hp: r.maxHp.a, scale: 0.62 },
      monsters: [{
        name: Bb.name, level: Bb.level, sprite: sp,
        attackSprite: sp.replace(/_battle$/, '_attack'), windupSprite: sp.replace(/_battle$/, '_windup'),
        hurtSprite: sp.replace(/_battle$/, '_hurt'), downSprite: sp.replace(/_battle$/, '_down'),
        maxHp: r.maxHp.b, hp: r.maxHp.b, mood: 1, scale: 0.62, boss: false, mirror: true,
      }],
    });
    const cv = document.querySelector('canvas').getBoundingClientRect();
    return { winner: r.winner, duration: r.duration, actions: r.turns.length, hp: r.maxHp, fin: r.finalHp, looks: !!looks.sprite,
      crop: [Math.round(cv.x), Math.round(cv.y), Math.round(cv.width), Math.round(cv.height)] };
  }, { A, Bb, aCls, look, seed: Number(seedS), scale: process.env.SCALE ? { hp: +process.env.SCALE.split(',')[0], dmg: +process.env.SCALE.split(',')[1], speedK: +(process.env.SPEEDK || 0), ...JSON.parse(process.env.SCX || '{}') } : null });
  // 판이 끝날 때까지(전투 장면이 바뀌거나 결과 글이 뜰 때까지) + 1.5초
  const end = Date.now() + 180000;
  while (Date.now() < end) {
    const done = await page.evaluate(() => {
      const g = window.__game;
      const bs = g.battleScene;
      return g.scenes.current !== bs || !!(bs && (bs.finished || bs.done || bs.ended));
    }).catch(() => true);
    if (done) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1800);
  const video = page.video();
  await ctx.close();
  const vp = await video.path();
  fs.renameSync(vp, path.join(outDir, `${tag}.webm`));
  console.log(JSON.stringify({ tag, ...info, errs: errs.slice(0, 3), startSec: (tStart - tRec) / 1000 + 0.45 }));
  await browser.close();
})();
