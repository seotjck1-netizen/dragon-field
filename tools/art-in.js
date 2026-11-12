#!/usr/bin/env node
/**
 * **바깥에서 받아 온 그림을 게임이 쓰는 모양으로 되돌린다.**
 *
 *   node tools/art-in.js            art/in/ 의 그림을 전부 받아 assets/ 에 넣는다
 *   node tools/art-in.js --dry      넣지 않고 검사만 한다
 *   node tools/art-in.js --only tile_grass,item_potion
 *   node tools/art-in.js --keep 40  초록 빼기 너그러움(기본 60). 초록이 덜 빠지면 올린다
 *
 * ── 왜 이 자가 필요한가 ────────────────────────────────────
 * 그림 도구가 내주는 것과 게임이 먹는 것 사이에 네 가지 틈이 있다.
 *
 *   ① **크기가 다르다.** 도구는 1024, 2048 같은 것만 내준다. 우리는 64×64 가 필요하다.
 *   ② **배경이 있다.** 투명하게 내주는 도구는 드물다. 그래서 주문서가 초록 배경을
 *      시키고, 그 초록을 여기서 뺀다. (도구의 '배경 지우개' 를 써서 이미 투명하면
 *      이 자는 알아서 건너뛴다)
 *   ③ **여백이 제각각이다.** 발끝이 아래 끝에 닿아야 하는데 도구는 가운데에 띄운다.
 *   ④ **깔리는 타일은 이음새가 맞아야 한다.** 이건 고칠 수 없고, **재도록** 한다.
 *      한쪽으로 쏠린 밝기가 있으면 깔았을 때 가로줄이 생긴다 — 그 전에 잡아야 한다.
 *
 * 이름 맞추기: art/in/ 에 넣는 파일 이름은 **manifest 의 키**(tile_grass.png) 거나
 * **지금 파일 이름**(grass.png) 이면 된다. 둘 다 아니면 건너뛰고 알려 준다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const IN = path.join(ROOT, 'art/in');
const manifest = require(path.join(ROOT, 'src/data/manifest.json'));

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const DRY = has('--dry');
const TOL = Number(opt('--keep', 60)) || 60;
const ONLY = opt('--only', null) ? new Set(opt('--only', '').split(',')) : null;

/** 붙이는 자리: 가운데 띄우나, 바닥에 세우나, 칸을 꽉 채우나. */
const FIT = {
  fill: new Set(),   // 아래에서 채운다
  bottom: new Set(),
  center: new Set(),
};
// gen-assets 의 갈래와 같은 기준으로 나눈다(art-prompts.js 와 짝).
const GROUND = new Set([
  'grass', 'grass2', 'grass3', 'grass4', 'path', 'path2', 'water', 'water2', 'brick', 'brick2',
  'castle_floor', 'castle_floor2', 'dungeon_floor', 'dungeon_floor2', 'ash', 'ash_path',
  'charred', 'basalt', 'magma', 'ember', 'waste', 'waste2', 'waste3', 'room_floor',
  'house_wall', 'house_roof', 'castle_wall', 'castle_top', 'dungeon_wall', 'room_wall',
]);
function kindOf(key, v) {
  const base = path.basename(v.src, '.png');
  if (key.startsWith('bg_')) return 'fill';
  if (key.startsWith('tile_')) {
    if (v.w === 32 && v.h === 32) {
      if (/^tile_(edge_|shore_|crust_)/.test(key)) return 'fill';
      if (GROUND.has(base)) return 'fill';
      return 'center';
    }
    return 'bottom';               // 키 큰 타일
  }
  if (/_(field|battle|attack|stance)$/.test(key) || key.startsWith('npc_')) return 'bottom';
  return 'center';                 // 물건 · 효과 · 표식
}

/** manifest 를 이름 두 가지로 찾을 수 있게 편다. */
const byName = new Map();
for (const [key, v] of Object.entries(manifest)) {
  byName.set(key, { key, ...v });
  byName.set(path.basename(v.src, '.png'), { key, ...v });
}

if (!fs.existsSync(IN)) {
  console.log(`\n  art/in/ 가 없습니다. 만들고 그림을 넣어 주세요:\n    mkdir -p art/in\n`);
  process.exit(0);
}
const files = fs.readdirSync(IN).filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));
if (!files.length) {
  console.log('\n  art/in/ 이 비어 있습니다.\n');
  process.exit(0);
}

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));

/**
 * 브라우저 안에서 도는 일꾼. 여기가 실제로 그림을 만지는 곳이다.
 *
 * 초록 빼기를 **가장자리에서 번져 들어가며** 한다. 그림 안에 있는 초록
 * (풀·에메랄드·독)은 가장자리와 이어져 있지 않으니 살아남는다.
 * 통째로 "초록이면 지운다" 로 하면 에메랄드가 구멍이 난다 — 그래서 이렇게 한다.
 */
const WORKER = `(async (dataUrl, W, H, kind, tol) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const im = g.getImageData(0, 0, sw, sh);
  const d = im.data;
  const at = (x, y) => (y * sw + x) * 4;

  // ① 배경이 이미 투명한가? 네 귀퉁이를 본다.
  const corners = [[0,0],[sw-1,0],[0,sh-1],[sw-1,sh-1]].map(([x,y]) => at(x,y));
  const alreadyClear = corners.every((i) => d[i+3] < 8);
  let keyed = 0;

  // ⚠ 꽉 채우는 갈래(바닥 타일·전투 배경)는 **배경을 빼면 안 된다.**
  //   풀 타일은 그림 전체가 초록이라, 가장자리에서 번져 들어가면 통째로 지워진다.
  //   실제로 그렇게 나왔다(tile_grass 가 100% 투명이 됐다). 채우는 것은 배경이 없다.
  if (!alreadyClear && kind !== 'fill') {
    // 귀퉁이 평균을 배경색으로 본다.
    let br=0, bg2=0, bb=0;
    for (const i of corners) { br += d[i]; bg2 += d[i+1]; bb += d[i+2]; }
    br/=4; bg2/=4; bb/=4;
    const near = (i) => {
      const dr = d[i]-br, dg = d[i+1]-bg2, db = d[i+2]-bb;
      return Math.sqrt(dr*dr + dg*dg + db*db) <= tol;
    };
    // ② 가장자리에서 번져 들어간다(폭넓이 우선).
    const seen = new Uint8Array(sw*sh);
    const q = [];
    for (let x=0; x<sw; x++) { q.push(x, 0); q.push(x, sh-1); }
    for (let y=0; y<sh; y++) { q.push(0, y); q.push(sw-1, y); }
    while (q.length) {
      const y = q.pop(), x = q.pop();
      if (x<0||y<0||x>=sw||y>=sh) continue;
      const p = y*sw+x;
      if (seen[p]) continue;
      const i = p*4;
      if (!near(i)) continue;
      seen[p] = 1;
      q.push(x+1,y); q.push(x-1,y); q.push(x,y+1); q.push(x,y-1);
    }
    for (let p=0; p<sw*sh; p++) if (seen[p]) { d[p*4+3] = 0; keyed++; }

    // ③ 초록 테두리 걷기(despill) — 남은 가장자리 픽셀의 초록 기운을 눌러 준다.
    for (let y=0; y<sh; y++) for (let x=0; x<sw; x++) {
      const p = y*sw+x;
      if (seen[p] || d[p*4+3] < 8) continue;
      let edge = false;
      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx, ny=y+dy;
        if (nx<0||ny<0||nx>=sw||ny>=sh) continue;
        if (seen[ny*sw+nx]) { edge = true; break; }
      }
      if (!edge) continue;
      const i = p*4;
      const lim = (d[i] + d[i+2]) / 2;
      if (d[i+1] > lim) d[i+1] = lim;
    }
    g.putImageData(im, 0, 0);
  }

  // ④ 빈 여백 잘라내기 — 꽉 채우는 갈래는 건드리지 않는다.
  let x0=0, y0=0, x1=sw, y1=sh;
  if (kind !== 'fill') {
    x0=sw; y0=sh; x1=0; y1=0;
    for (let y=0; y<sh; y++) for (let x=0; x<sw; x++) {
      if (d[at(x,y)+3] > 8) {
        if (x<x0) x0=x; if (x>x1) x1=x;
        if (y<y0) y0=y; if (y>y1) y1=y;
      }
    }
    if (x1 < x0) { x0=0; y0=0; x1=sw-1; y1=sh-1; }  // 통째로 비었으면 그대로
    x1++; y1++;
  }
  const cw = x1-x0, ch = y1-y0;

  // ⑤ 낼 칸에 앉힌다.
  const o = document.createElement('canvas');
  o.width = W; o.height = H;
  const og = o.getContext('2d', { willReadFrequently: true });
  og.imageSmoothingEnabled = true;
  og.imageSmoothingQuality = 'high';
  if (kind === 'fill') {
    og.drawImage(c, 0, 0, sw, sh, 0, 0, W, H);
  } else {
    const margin = kind === 'center' ? 0.92 : 1;
    const s = Math.min((W*margin)/cw, (H*margin)/ch);
    const dw = Math.round(cw*s), dh = Math.round(ch*s);
    const dx = Math.round((W-dw)/2);
    const dy = kind === 'bottom' ? (H-dh) : Math.round((H-dh)/2);
    og.drawImage(c, x0, y0, cw, ch, dx, dy, dw, dh);
  }

  // ⑥ 재기 — 깔리는 타일의 이음새와 쏠린 밝기.
  const oi = og.getImageData(0,0,W,H).data;
  const luma = (i) => 0.299*oi[i] + 0.587*oi[i+1] + 0.114*oi[i+2];
  let seamX=0, seamY=0;
  for (let y=0; y<H; y++) seamX += Math.abs(luma((y*W)*4) - luma((y*W + W-1)*4));
  for (let x=0; x<W; x++) seamY += Math.abs(luma(x*4) - luma(((H-1)*W + x)*4));
  seamX/=H; seamY/=W;
  let top=0, bot=0, n=Math.max(1, Math.floor(H/4));
  for (let y=0; y<n; y++) for (let x=0; x<W; x++) top += luma((y*W+x)*4);
  for (let y=H-n; y<H; y++) for (let x=0; x<W; x++) bot += luma((y*W+x)*4);
  top/=(n*W); bot/=(n*W);

  let clear=0;
  for (let p=0; p<W*H; p++) if (oi[p*4+3] < 8) clear++;

  return {
    url: o.toDataURL('image/png'),
    src: sw+'x'+sh, keyed, alreadyClear,
    seam: Math.max(seamX, seamY), tilt: Math.abs(top-bot),
    clearPct: Math.round(clear/(W*H)*100),
  };
})`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<body></body>');

  const done = [];
  const warn = [];
  const skip = [];

  for (const f of files) {
    const stem = path.basename(f).replace(/\.(png|jpg|jpeg|webp)$/i, '');
    const m = byName.get(stem);
    if (!m) { skip.push(`${f} — manifest 에 없는 이름입니다`); continue; }
    if (ONLY && !ONLY.has(m.key)) continue;

    const dest = path.join(ROOT, m.src);
    const cur = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
    // 지금 파일 크기가 '구울 크기' 다. 없으면 그릴 크기의 2배로 본다.
    const W = cur ? cur.readUInt32BE(16) : m.w * 2;
    const H = cur ? cur.readUInt32BE(20) : m.h * 2;
    const kind = kindOf(m.key, m);

    const buf = fs.readFileSync(path.join(IN, f));
    const mime = /\.png$/i.test(f) ? 'image/png' : /\.webp$/i.test(f) ? 'image/webp' : 'image/jpeg';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;

    const r = await page.evaluate(
      ([fn, url, ww, hh, k, t]) => eval(fn)(url, ww, hh, k, t),
      [WORKER, dataUrl, W, H, kind, TOL]
    );

    // ── 재서 나온 것에 말 붙이기 ──
    const isGround = kind === 'fill' && m.w === 32 && m.h === 32;
    if (isGround && r.seam > 12) {
      warn.push(`${m.key} — 이음새가 ${r.seam.toFixed(1)} 만큼 튑니다. 깔면 칸 경계가 보입니다.`);
    }
    if (isGround && r.tilt > 6) {
      warn.push(`${m.key} — 위아래 밝기가 ${r.tilt.toFixed(1)} 차이납니다(쏠린 빛). 깔면 가로줄이 생깁니다.`);
    }
    if (kind !== 'fill' && r.clearPct < 3) {
      warn.push(`${m.key} — 투명한 자리가 ${r.clearPct}% 뿐입니다. 배경이 안 빠졌을 수 있습니다(--keep 를 올려 보세요).`);
    }
    if (kind === 'fill' && r.clearPct > 5) {
      warn.push(`${m.key} — 꽉 채워야 하는데 ${r.clearPct}% 가 비어 있습니다.`);
    }

    if (!DRY) {
      const out = Buffer.from(r.url.split(',')[1], 'base64');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, out);
    }
    done.push({ key: m.key, src: m.src, from: r.src, to: `${W}x${H}`, kind,
      keyed: r.alreadyClear ? '이미 투명' : `${Math.round(r.keyed / (parseInt(r.src) * parseInt(r.src.split('x')[1])) * 100)}% 뺌`,
      clear: r.clearPct });
  }

  await browser.close();

  console.log('');
  console.log(`  ${DRY ? '검사만 함' : 'assets/ 에 넣음'} — ${done.length}장`);
  console.log('  ' + pad('키', 28) + pad('받은 크기', 14) + pad('넣은 크기', 14) + pad('자리', 8) + '배경');
  for (const d of done) {
    console.log('  ' + pad(d.key, 28) + pad(d.from, 14) + pad(d.to, 14)
      + pad({ fill: '꽉', bottom: '바닥', center: '가운데' }[d.kind], 8) + d.keyed);
  }
  if (skip.length) {
    console.log('');
    console.log('  건너뜀 —');
    for (const s of skip) console.log('     · ' + s);
  }
  if (warn.length) {
    console.log('');
    console.log('  ⚠ 다시 봐야 할 것 —');
    for (const s of warn) console.log('     · ' + s);
  } else if (done.length) {
    console.log('');
    console.log('  ✓ 걸리는 것 없음.');
  }
  console.log('');
  if (!DRY && done.length) {
    console.log('  다음: node tools/build-single-file.js 로 한 장짜리 HTML 을 다시 굽습니다.');
    console.log('');
  }
})();
