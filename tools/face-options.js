// 용사·사냥꾼 **얼굴 시안**을 나란히 굽는 도구. (게임에는 들어가지 않는다)
//
// 쓰는 법:  node tools/face-options.js
//   → /tmp/face-options/용사-시안.png, 사냥꾼-시안.png
//
// 왜 따로 굽나: 얼굴은 말로 설명해서는 고를 수가 없다. **같은 몸에 얼굴만**
// 갈아 끼워 나란히 놓고 봐야 무엇이 달라졌는지 보인다. 그래서 art-class.js 의
// heroSvg 와 원래 옵션을 그대로 가져와 face/hairShape/headgear 만 바꾼다.
//
// ⚠ 눈·머리띠 같은 **부품은 여기 없다.** tools/art-face.js 한 곳에 있고, 게임 그림
//   (art-class.js)과 이 시안판이 **같은 조각**을 쓴다. 부품을 여기 베껴 두면
//   한쪽만 고쳐진 채로 "시안과 게임이 다른" 상태가 된다. 자리(높이) 규칙도 그 파일에.
//
// 0.70.7 에 고른 것: **용사 A안 · 사냥꾼 B안.** 그 둘은 이미 art-class.js 로 옮겨져
// 게임에 들어가 있다. 여기 남은 것은 다음에 또 고를 때를 위한 비교판이다.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { heroSvg, WARRIOR_OPTS, RANGER_OPTS } = require('./art-class.js');
const {
  BROW_Y, EYE_CY, EYE_L, EYE_R,
  eye, ears, band, spikes, hairFlow, redCape,
  jawRound, jawSoft, jawSquare,
  noseSmall, noseStraight, mouthFirm, mouthSmile, brow, cheekShade, SCAR, SCAR_HIGH,
  RANGER_JAW, RANGER_JAW_SOFT, rangerCheek, warPaintFull, warPaintCheek,
  rangerMouth, rangerNose, rangerShort, FEATHERS,
} = require('./art-face.js');

const OUT = '/tmp/face-options';

// 갈색 뾰족머리로 바꾸는 시안(사냥꾼 A·D)은 **뒤로 묶은 머리도 같이 갈색**이어야 한다.
// 검은 꽁지머리를 그대로 두면 머리 색이 앞뒤로 다른 사람이 된다(1차에 그렇게 나왔다).
const rangerBehindBrown = RANGER_OPTS.behind
  .replace(/#171009/g, '#4a2c12')
  .replace(/#3a2a1e/g, '#8a5628');


// ════════════════════════════════════════════════════════════
//  용사 시안
// ════════════════════════════════════════════════════════════

const WARRIOR_VARIANTS = [
  {
    key: 'w0',
    name: '지금 얼굴',
    note: '비교용 — 지금 게임에 들어 있는 그림',
    opts: {},
  },
  {
    key: 'w1',
    name: 'A. 정통 드퀘',
    note: '큰 둥근 눈 · 부드러운 턱 · 가죽 띠에 금 태양 문장 · 수염 자국 뺌',
    opts: {
      face: `
  <path d="${jawSoft}" fill="url(#face_w)"/>
  ${ears('#e6a778', '#bd7c50')}
  ${cheekShade()}
  ${brow('#5b3518', 2.4, 28.4, 1.2)}
  ${eye(EYE_L, EYE_CY, 5.7, 6.6, '#3f7fd0', -1, 0)}
  ${eye(EYE_R, EYE_CY, 5.7, 6.6, '#3f7fd0', 1, 0)}
  ${noseSmall}
  ${mouthSmile}
  <ellipse cx="34.8" cy="47.6" rx="3.6" ry="2.2" fill="#ff9a86" opacity="0.3"/>
  <ellipse cx="61.2" cy="47.6" rx="3.6" ry="2.2" fill="#ff9a86" opacity="0.3"/>`,
      hairShape: spikes(1, 7.6),
      headgear: hairFlow() + band('leather', 'sun'),
    },
  },
  {
    key: 'w2',
    name: 'B. 소년 용사',
    note: '눈을 더 키우고 턱을 줄였다 · 붉은 띠에 금 보석 · 씩 웃는 입',
    opts: {
      face: `
  <path d="M31.4 33 Q31.4 46.8 36.4 52.4 Q41.6 58.2 48 59 Q54.4 58.2 59.6 52.4
           Q64.6 46.8 64.6 33 Q64.6 14 48 14 Q31.4 14 31.4 33 Z" fill="url(#face_w)"/>
  ${ears('#e6a778', '#bd7c50')}
  ${cheekShade()}
  ${brow('#6b4020', 2.2, 28, 1)}
  ${eye(38.6, 39.8, 6, 6.9, '#3f8fe0', -1, 0)}
  ${eye(57.4, 39.8, 6, 6.9, '#3f8fe0', 1, 0)}
  ${noseSmall}
  ${mouthSmile}
  <ellipse cx="34.6" cy="48.2" rx="4" ry="2.5" fill="#ff8f78" opacity="0.4"/>
  <ellipse cx="61.4" cy="48.2" rx="4" ry="2.5" fill="#ff8f78" opacity="0.4"/>`,
      hairShape: spikes(1.12, 6.8),
      headgear: hairFlow('#c79155') + band('red', 'gem'),
    },
  },
  {
    key: 'w3',
    name: 'C. 지금 얼굴 + 큰 눈',
    note: '가장 적게 바꾼다 — 각진 턱 · 흉터 · 수염 자국 그대로, 눈만 아니메 · 띠 없음',
    opts: {
      face: `
  <path d="${jawSquare}" fill="url(#face_w)"/>
  ${cheekShade()}
  <path d="M48 54.4 l0 2.4" stroke="#c07f52" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  ${brow('#3a2010', 3, 29.4, 2)}
  ${eye(39.4, 39.2, 5.3, 5.9, '#3f6fa8', -1, 1.4)}
  ${eye(56.6, 39.2, 5.3, 5.9, '#3f6fa8', 1, 1.4)}
  ${noseStraight}
  ${mouthFirm}
  <path d="M36 47.4 Q38 55 48 57 Q58 55 60 47.4 Q57 53 48 54.4 Q39 53 36 47.4 Z"
        fill="#3a2010" opacity="0.14"/>
  ${SCAR}`,
      // ⚠ 머리는 **덮어쓰지 않는다.** C안은 '눈만 바꾼다' 이므로
      //   지금 용사의 앞머리(WARRIOR_OPTS.hairShape)와 머릿결을 그대로 쓴다.
    },
  },
  {
    key: 'w4',
    name: 'D. 날 선 청년',
    note: '큰 눈에 눈꼬리를 세웠다 · 금띠 + 날개 문장 · 흉터 유지 · 붉은 망토',
    opts: {
      face: `
  <path d="${jawRound}" fill="url(#face_w)"/>
  ${ears('#e6a778', '#bd7c50')}
  ${cheekShade()}
  ${brow('#3a2010', 2.7, 28.6, 2)}
  ${eye(39.2, EYE_CY, 5.5, 6.1, '#2f6bb8', -1, 2.2)}
  ${eye(56.8, EYE_CY, 5.5, 6.1, '#2f6bb8', 1, 2.2)}
  ${noseStraight}
  ${mouthFirm}
  ${SCAR_HIGH}`,
      hairShape: spikes(1.16, 7.2),
      headgear: hairFlow('#c08b4e') + band('gold', 'wing'),
      behind: redCape,
    },
  },
];

// ════════════════════════════════════════════════════════════
//  사냥꾼 시안
// ════════════════════════════════════════════════════════════


const RANGER_VARIANTS = [
  {
    key: 'r0',
    name: '지금 얼굴',
    note: '비교용 — 지금 게임에 들어 있는 그림',
    opts: {},
  },
  {
    key: 'r1',
    name: 'A. 정통 드퀘',
    note: '큰 초록 눈 · 갈색 뾰족머리 · 가죽 띠에 금 태양 문장 · 문양은 뺨에만',
    opts: {
      face: `
  <path d="${RANGER_JAW_SOFT}" fill="url(#face_r)"/>
  ${ears('#bd7c44', '#8d5528')}
  ${rangerCheek}
  ${warPaintCheek}
  ${brow('#4a3320', 2.4, 28.4, 1.3)}
  ${eye(39.2, EYE_CY, 5.6, 6.4, '#6b9f3e', -1, 0.6)}
  ${eye(56.8, EYE_CY, 5.6, 6.4, '#6b9f3e', 1, 0.6)}
  ${rangerNose}
  ${rangerMouth}`,
      hair: ['#8a5628', '#3a2010'],
      behind: rangerBehindBrown,
      hairShape: spikes(1, 8),
      headgear: hairFlow() + band('leather', 'sun'),
    },
  },
  {
    key: 'r2',
    name: 'B. 들의 아이',
    note: '눈을 더 키웠다 · 검은 머리 유지 · 깃털 + 금 보석 띠 · 얼굴 문양 그대로',
    opts: {
      face: `
  <path d="${RANGER_JAW_SOFT}" fill="url(#face_r)"/>
  ${ears('#bd7c44', '#8d5528')}
  ${rangerCheek}
  ${warPaintFull}
  ${brow('#171009', 2.3, 28, 1)}
  ${eye(38.8, 39.8, 6, 6.8, '#7ab04a', -1, 0.4)}
  ${eye(57.2, 39.8, 6, 6.8, '#7ab04a', 1, 0.4)}
  ${rangerNose}
  ${rangerMouth}`,
      hairShape: rangerShort,
      headgear: band('leather', 'gem') + FEATHERS,
    },
  },
  {
    key: 'r3',
    name: 'C. 지금 얼굴 + 큰 눈',
    note: '가장 적게 바꾼다 — 마름모 턱 · 매부리코 · 문양 그대로, 눈만 아니메',
    opts: {
      face: `
  <path d="${RANGER_JAW}" fill="url(#face_r)"/>
  ${rangerCheek}
  ${warPaintFull}
  <path d="M46 26.6 l0 3.2M50 26.6 l0 3.2" stroke="#7a2f2f" stroke-width="1.5" stroke-linecap="round" opacity="0.75"/>
  ${brow('#171009', 2.9, 29.4, 2.4)}
  ${eye(39.8, 39.2, 5.1, 5.5, '#6b8f3e', -1, 2.4)}
  ${eye(56.2, 39.2, 5.1, 5.5, '#6b8f3e', 1, 2.4)}
  <path d="M47.6 43 Q50.4 47.6 49.2 50" stroke="#b0713c" stroke-width="2.2" fill="none"
        stroke-linecap="round" opacity="0.55"/>
  <path d="M45.6 50.2 q2.6 2 5 0.2" stroke="#8d5528" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M42.8 54 q5.2 1.4 10.4 0" stroke="#7a4030" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
      // 머리·가죽 띠·깃털은 지금 사냥꾼 것 그대로 (덮어쓰지 않는다)
    },
  },
  {
    key: 'r4',
    name: 'D. 용사와 한 쌍',
    note: '용사 A안과 같은 눈·머릿결 · 갈색 뾰족머리 · 붉은 띠 · 얼굴 문양 뺌',
    opts: {
      face: `
  <path d="${RANGER_JAW_SOFT}" fill="url(#face_r)"/>
  ${ears('#bd7c44', '#8d5528')}
  ${rangerCheek}
  ${brow('#5b3518', 2.4, 28.4, 1.2)}
  ${eye(39.2, EYE_CY, 5.7, 6.6, '#6b9f3e', -1, 0)}
  ${eye(56.8, EYE_CY, 5.7, 6.6, '#6b9f3e', 1, 0)}
  ${rangerNose}
  <path d="M43.4 52.8 q4.6 3 9.2 0" stroke="#7a4030" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M43.4 52.8 q4.6 3 9.2 0 q-4.6 1 -9.2 0 Z" fill="#5e2e22" opacity="0.35"/>
  <ellipse cx="35" cy="47.2" rx="3.6" ry="2.2" fill="#e06a4a" opacity="0.3"/>
  <ellipse cx="61" cy="47.2" rx="3.6" ry="2.2" fill="#e06a4a" opacity="0.3"/>`,
      hair: ['#8a5628', '#3a2010'],
      behind: rangerBehindBrown,
      hairShape: spikes(1.08, 7.8),
      headgear: hairFlow() + band('red', 'wing'),
    },
  },
];

// ── 시안판 굽기 ──────────────────────────────────────────────

function sheet(title, base, variants) {
  const cells = variants.map((v) => {
    const svg = heroSvg({ ...base, ...v.opts });
    // 얼굴만 크게 — 96×128 중 머리(대략 x 17~79, y 2~62)를 잘라 4배로 본다
    const head = svg
      .replace('viewBox="0 0 96 128"', 'viewBox="17 2 62 60"')
      .replace(/width="96" height="128"/, 'width="248" height="240"');
    return `
      <div class="cell">
        <div class="head">${head}</div>
        <div class="body">${svg.replace(/width="96" height="128"/, 'width="120" height="160"')}</div>
        <div class="name">${v.name}</div>
        <div class="note">${v.note}</div>
      </div>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8">
  <style>
    body { margin:0; background:#141a24; color:#e8eef7;
           font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif; }
    h1 { margin:20px 26px 4px; font-size:30px; }
    .sub { margin:0 26px 18px; color:#9fb0c6; font-size:16px; }
    .row { display:flex; gap:14px; padding:0 20px 24px; align-items:flex-start; }
    .cell { width:266px; background:#1d2735; border-radius:12px; padding:10px 8px 12px;
            border:1px solid #2c3a4e; }
    .head { background:#27334a; border-radius:8px; line-height:0; text-align:center; }
    .body { text-align:center; margin-top:8px; line-height:0; }
    .name { margin-top:10px; font-size:19px; font-weight:700; text-align:center; }
    .note { margin-top:5px; font-size:13.5px; line-height:1.5; color:#a9bad0;
            text-align:center; padding:0 4px; }
  </style>
  <h1>${title}</h1>
  <div class="sub">맨 왼쪽이 지금 얼굴. 같은 몸에 <b>얼굴·머리·머리띠만</b> 갈아 끼운 것이다.</div>
  <div class="row">${cells}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  const jobs = [
    ['용사 얼굴 시안', WARRIOR_OPTS, WARRIOR_VARIANTS, '용사-시안.png'],
    ['사냥꾼 얼굴 시안', RANGER_OPTS, RANGER_VARIANTS, '사냥꾼-시안.png'],
  ];
  for (const [title, base, variants, out] of jobs) {
    await page.setContent(sheet(title, base, variants));
    await page.waitForTimeout(150);
    const file = path.join(OUT, out);
    await page.screenshot({ path: file, fullPage: true });
    console.log('✓', file);
  }
  await browser.close();
})();
