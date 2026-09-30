#!/usr/bin/env node
/**
 * 접속 화면 로고 (0.70.27) — 금빛 "드래곤 필드" + DRAGON FIELD, 뒤에 용 날개와 검.
 *
 *   node tools/title-logo.js          →  assets/ui/title/logo.webp (투명 바탕)
 *                                        art/preview/title-logo.png (어두운 바탕 미리보기)
 *
 * ── 왜 글자를 그림으로 굽나 ────────────────────────────────
 * 한 장짜리 html 은 인터넷 없이 돈다. 웹 글꼴을 부를 수 없고, 사람마다 깔린 글꼴이 달라
 * "드래곤 필드" 가 어떤 기기에서는 굴림체로 나온다. 로고는 게임의 얼굴이라 그러면 안 된다.
 * 그래서 여기서 한 번 크로미움으로 그려 그림으로 박는다.
 *
 * 글꼴: Noto Serif CJK KR Black(시스템) · Cinzel Bold(art/fonts, SIL OFL).
 * 크로미움의 SVG 필터(feSpecularLighting)로 금속의 볼록한 빛을 낸다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/ui/title/logo.png');
const PREVIEW = path.join(ROOT, 'art/preview/title-logo.png');
const W = 1200;
const H = 470;

const font = (f) => `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'art/fonts', f)).toString('base64')}`;

/** 오른쪽 날개 — 가운데(600)에서 바깥으로. 왼쪽은 뒤집어 쓴다. */
function wingPath() {
  // 어깨(글자 뒤 가운데 근처) → 손목(위로 솟은 꼭짓점) → 손가락 끝 넷, 끝 사이는 안으로 파인 막
  const sh = [640, 250];
  const wr = [860, 70];
  const tips = [[1130, 34], [1176, 150], [1134, 262], [1030, 322]];
  const root = [760, 300];
  const q = (a, b, k) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    return [mx + (wr[0] - mx) * k, my + (wr[1] - my) * k];
  };
  let d = `M${sh} Q${[700, 120]} ${wr} L${tips[0]}`;
  const chain = [...tips.slice(1), root];
  let prev = tips[0];
  for (const t of chain) {
    const c = q(prev, t, t === root ? 0.15 : 0.3);
    d += ` Q${c} ${t}`;
    prev = t;
  }
  d += ' Z';
  const bones = tips.map((t) => {
    const mx = (wr[0] + t[0]) / 2;
    const my = (wr[1] + t[1]) / 2;
    const vx = t[0] - wr[0];
    const vy = t[1] - wr[1];
    return `M${wr} Q${[mx + vy * 0.06, my - vx * 0.06]} ${t}`;
  });
  const arm = `M${sh} Q${[700, 120]} ${wr}`;
  return { d, bones, arm, wr };
}

function svg() {
  const w = wingPath();
  const wing = (flip) => `
    <g ${flip ? `transform="translate(${W} 0) scale(-1 1)"` : ''}>
      <path d="${w.d}" fill="url(#wingFill)" stroke="url(#goldLine)" stroke-width="3.2" stroke-linejoin="round"/>
      ${w.bones.map((b) => `<path d="${b}" fill="none" stroke="url(#goldLine)" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>`).join('')}
      <path d="${w.arm}" fill="none" stroke="url(#goldLine)" stroke-width="6" stroke-linecap="round"/>
      <path d="M${w.wr[0] - 4},${w.wr[1] + 6} l-22,-22 l30,6 z" fill="url(#goldFill)"/>
    </g>`;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'LogoCinzel'; src: url(${font('cinzel-latin-700-normal.woff2')}) format('woff2'); font-weight: 700; }
      .ko { font-family: 'Noto Serif CJK KR', 'Noto Serif KR', serif; font-weight: 900; }
      .en { font-family: 'LogoCinzel', serif; font-weight: 700; }
    </style>
    <!-- 금: 위는 밝은 상아빛, 가운데 한 번 어두운 띠(금속의 반사), 아래는 다시 밝게 -->
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffbe6"/>
      <stop offset="0.28" stop-color="#ffe28a"/>
      <stop offset="0.5" stop-color="#e0a93a"/>
      <stop offset="0.56" stop-color="#8f5c14"/>
      <stop offset="0.66" stop-color="#c98b25"/>
      <stop offset="0.85" stop-color="#ffd978"/>
      <stop offset="1" stop-color="#fff2c0"/>
    </linearGradient>
    <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a6"/>
      <stop offset="1" stop-color="#b07a22"/>
    </linearGradient>
    <linearGradient id="goldLine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffe7a0"/>
      <stop offset="0.5" stop-color="#c9962e"/>
      <stop offset="1" stop-color="#7a5212"/>
    </linearGradient>
    <linearGradient id="wingFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3a2410" stop-opacity="0.96"/>
      <stop offset="1" stop-color="#140a04" stop-opacity="0.9"/>
    </linearGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#e6d6a8"/>
      <stop offset="0.55" stop-color="#a8864a"/>
      <stop offset="1" stop-color="#f3e2b0"/>
    </linearGradient>
    <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8d99b3"/>
      <stop offset="0.48" stop-color="#eef3ff"/>
      <stop offset="0.52" stop-color="#6d7894"/>
      <stop offset="1" stop-color="#3b4459"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#d9b45a" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffe7a0"/>
      <stop offset="1" stop-color="#d9b45a" stop-opacity="0"/>
    </linearGradient>
    <!-- 볼록한 금속: 글자 모양을 흐려 높이로 삼고 왼쪽 위에서 빛을 비춘다 -->
    <filter id="bevel" x="-10%" y="-20%" width="120%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.7" result="b"/>
      <feSpecularLighting in="b" surfaceScale="3" specularConstant="0.85" specularExponent="30"
                          lighting-color="#fff6d8" result="spec">
        <feDistantLight azimuth="235" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.6" k4="0"/>
    </filter>
    <filter id="shadow" x="-10%" y="-20%" width="120%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9"/>
      <feOffset dy="8" result="o"/>
      <feFlood flood-color="#000" flood-opacity="0.85"/>
      <feComposite in2="o" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="g"/>
      <feFlood flood-color="#ff9a2e" flood-opacity="0.55"/>
      <feComposite in2="g" operator="in"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 뒤: 용 날개 한 쌍과 아래로 꽂힌 검 -->
  <g filter="url(#shadow)" opacity="0.97">
    ${wing(false)}
    ${wing(true)}
    <g>
      <path d="M600,96 L618,118 L616,296 L600,334 L584,296 L582,118 Z" fill="url(#blade)" stroke="#20283a" stroke-width="2"/>
      <path d="M600,120 L600,318" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.4"/>
      <path d="M512,96 Q560,84 600,92 Q640,84 688,96 Q700,100 690,108 Q640,100 600,110 Q560,100 510,108 Q500,100 512,96 Z"
            fill="url(#goldFill)" stroke="#4a300a" stroke-width="2"/>
      <rect x="592" y="36" width="16" height="58" rx="5" fill="#3a2410" stroke="url(#goldLine)" stroke-width="2.5"/>
      <circle cx="600" cy="30" r="12" fill="url(#goldFill)" stroke="#4a300a" stroke-width="2"/>
      <circle cx="600" cy="103" r="7" fill="#d8322a" stroke="#4a0c08" stroke-width="1.5"/>
      <circle cx="598" cy="101" r="2.2" fill="#ffc0b0"/>
    </g>
  </g>

  <!-- 제목: 두꺼운 검은 테 → 짙은 금 테 → 금빛 면(볼록) -->
  <g filter="url(#glow)">
    <text x="600" y="296" text-anchor="middle" class="ko" font-size="150" letter-spacing="-2"
          fill="none" stroke="#150b03" stroke-width="22" stroke-linejoin="round">드래곤 필드</text>
  </g>
  <g filter="url(#shadow)">
    <text x="600" y="296" text-anchor="middle" class="ko" font-size="150" letter-spacing="-2"
          fill="none" stroke="#6b4611" stroke-width="10" stroke-linejoin="round">드래곤 필드</text>
  </g>
  <text x="600" y="296" text-anchor="middle" class="ko" font-size="150" letter-spacing="-2"
        fill="url(#gold)" filter="url(#bevel)" stroke="#ffe9a8" stroke-width="1.2">드래곤 필드</text>

  <!-- 영문 부제: 양옆 실선 + 마름모 -->
  <g filter="url(#shadow)">
    <rect x="150" y="355" width="220" height="2.2" fill="url(#rule)"/>
    <rect x="830" y="355" width="220" height="2.2" fill="url(#rule)"/>
    <path d="M364,356 l8,-8 l8,8 l-8,8 z" fill="url(#goldFill)"/>
    <path d="M820,356 l8,-8 l8,8 l-8,8 z" fill="url(#goldFill)"/>
    <text x="600" y="367" text-anchor="middle" class="en" font-size="34" letter-spacing="12"
          fill="url(#silver)" stroke="#2a1a06" stroke-width="0.8">DRAGON FIELD</text>
  </g>
</svg>`;
}

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg()}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await (await p.$('svg')).screenshot({ path: OUT, omitBackground: true });
  // 미리보기 — 밤하늘 바탕
  fs.mkdirSync(path.dirname(PREVIEW), { recursive: true });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:radial-gradient(circle at 50% 60%,#26305e,#070a18)">${svg()}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: PREVIEW });
  await b.close();
  console.log(`✓ ${path.relative(ROOT, OUT)}`);
})();
