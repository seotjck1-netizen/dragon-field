// 벗은 몸 — 기본 티셔츠 · 바지 · 맨팔 · 헝겊신 (0.70.26 미리보기)
//
// 준 그림(art/reference/<직업>_ref.png)과 **같은 좌표**(768×1024)에 그린다.
// 장비를 하나도 안 걸친 모습이 이것이고, 그 위에 준 그림에서 오려 낸 장비 층을 얹는다
// (tools/ref-parts.py). 그래서 여기서 지킬 것은 둘이다.
//
//   ① **장비보다 작게** — 티는 튜닉보다, 맨팔은 소매보다, 헝겊신은 장화보다 안쪽에 있어야
//      장비를 얹었을 때 밑이 삐져나오지 않는다.
//   ② **자세는 준 그림 그대로** — 손은 준 그림의 손 자리에 온다(칼·활·지팡이를 쥔 손).
//      손 그림 자체는 준 그림의 손을 살색으로 다시 칠해 쓴다(ref-parts.py) — 여기서는
//      팔만 손목까지 그린다.
//
// 머리·얼굴은 여기 없다 — 준 그림의 것을 늘 그대로 쓴다.

const OL = '#1a1210';
const LW = 5;
const C = {
  skin: '#fbd2ad', skinMid: '#f3bb92', skinDark: '#d6906c',
  tee: '#ece2cb', teeLit: '#f8f2e4', teeDark: '#c9b692', teeLine: '#a8946f',
  pants: '#6b543e', pantsLit: '#86694c', pantsDark: '#4a3828',
  shoe: '#5a3d29', shoeLit: '#80593c', shoeDark: '#382518', sole: '#2b1d14',
};

const P = (d, fill, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${OL}" stroke-width="${LW}" stroke-linejoin="round" ${extra}/>`;
const F = (d, fill, op = 1) => `<path d="${d}" fill="${fill}" opacity="${op}"/>`;
const L = (d, color, w = 3, op = 1) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;

const pts = (a) => a.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');

/** 팔 — 어깨 → 팔꿈치 → 손목을 잇는 굵은 관. 테두리를 먼저 굵게, 살을 가늘게 겹친다. */
function arm(path, w, shadeSide = 1) {
  const d = pts(path);
  const [x0, y0] = path[0];
  const [x1, y1] = path[path.length - 1];
  return `
    <path d="${d}" fill="none" stroke="${OL}" stroke-width="${w + 2 * LW}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${d}" fill="none" stroke="${C.skin}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(${shadeSide * w * 0.28} 0)">
      <path d="${d}" fill="none" stroke="${C.skinMid}" stroke-width="${w * 0.36}" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
    </g>`;
}

/** 헝겊신 — 발목(x0..x1, y0)에서 땅(y1)까지. toe 는 발끝이 나가는 쪽(-1 왼쪽, +1 오른쪽). */
function shoe(x0, x1, y0, y1, toe, reach) {
  const inX = toe < 0 ? x1 : x0;         // 발뒤꿈치 쪽
  const outX = toe < 0 ? x0 : x1;
  const tip = outX + toe * reach;
  const mid = (y0 + y1) / 2;
  const d = `M${inX} ${y0} L${outX} ${y0} C${outX + toe * 4} ${mid - 6} ${tip - toe * 10} ${mid - 2} ${tip} ${y1 - 18}
             C${tip - toe * 4} ${y1 - 4} ${tip - toe * 14} ${y1} ${tip - toe * 30} ${y1} L${inX} ${y1} Z`;
  const lit = `M${outX} ${y0 + 4} C${outX + toe * 4} ${mid - 4} ${tip - toe * 12} ${mid} ${tip - toe * 6} ${y1 - 16}
               C${tip - toe * 20} ${y1 - 18} ${outX} ${mid + 2} ${outX - toe * 6} ${y0 + 4} Z`;
  return `
    ${P(d, C.shoe)}
    ${F(lit, C.shoeLit, 0.7)}
    ${F(`M${inX} ${y0 + 3} L${inX - toe * 16} ${y0 + 3} L${inX - toe * 16} ${y1 - 6} L${inX} ${y1 - 6} Z`, C.shoeDark, 0.7)}
    ${L(`M${tip - toe * 30} ${y1 - 7} L${inX} ${y1 - 7}`, C.sole, 7)}
    ${L(`M${Math.min(inX, outX) + 6} ${y0 + 3} L${Math.max(inX, outX) - 6} ${y0 + 3}`, OL, 4)}`;
}

// ─────────────────────────────────────────────────────────────
// 직업별 자세 — 준 그림에서 잰 자리 (ref 좌표)
// ─────────────────────────────────────────────────────────────
const POSE = {
  warrior: {
    cx: 384,
    shoulderY: 428, hemY: 690, waistL: 252, waistR: 518, shoulderL: 244, shoulderR: 526,
    sleeveL: [[244, 430], [200, 500], [252, 512]], sleeveR: [[526, 430], [566, 500], [516, 512]],
    armL: [[228, 470], [224, 580], [222, 652]], armR: [[538, 470], [546, 590], [526, 692]], armW: 46,
    crotchY: 772, legL: [262, 364], legR: [404, 506], kneeY: 845, ankleY: 918, groundY: 976,
    shoeL: [270, 362, -1, 36], shoeR: [406, 498, 1, 40],
  },
  ranger: {
    cx: 384,
    shoulderY: 430, hemY: 700, waistL: 254, waistR: 514, shoulderL: 244, shoulderR: 524,
    pinch: [556, 298, 474], hemL: 272, hemR: 494,
    sleeveL: [[244, 432], [202, 500], [252, 512]], sleeveR: [[524, 432], [562, 500], [514, 512]],
    armL: [[228, 470], [224, 580], [222, 660]], armR: [[536, 470], [532, 560], [592, 622]], armW: 44,
    crotchY: 772, legL: [270, 364], legR: [402, 500], kneeY: 845, ankleY: 912, groundY: 972,
    shoeL: [272, 362, -1, 34], shoeR: [404, 494, 1, 40],
  },
  mage: {
    cx: 384,
    shoulderY: 430, hemY: 690, waistL: 256, waistR: 512, shoulderL: 246, shoulderR: 522,
    sleeveL: [[246, 432], [204, 500], [254, 512]], sleeveR: [[522, 432], [562, 498], [512, 510]],
    armL: [[230, 470], [224, 580], [220, 650]], armR: [[532, 470], [546, 556], [584, 524]], armW: 42,
    crotchY: 780, legL: [268, 360], legR: [410, 500], kneeY: 850, ankleY: 924, groundY: 972,
    shoeL: [256, 318, -1, 22], shoeR: [452, 512, 1, 20],
  },
};

function tee(p) {
  const { cx, shoulderY: sy, hemY, waistL, waistR, shoulderL, shoulderR } = p;
  const neckL = cx - 44, neckR = cx + 44;
  // 허리 — 준 그림의 몸통이 팔과 떨어지는 곳(사냥꾼)은 티도 그만큼 좁혀야 **몸 밖으로 안 나간다**
  const [pinchY, pinchL, pinchR] = p.pinch || [sy + 150, waistL, waistR];
  const hemL = p.hemL ?? waistL, hemR = p.hemR ?? waistR;
  const body = `M${neckL} ${sy - 26} C${neckL - 40} ${sy - 18} ${shoulderL + 20} ${sy - 10} ${shoulderL} ${sy + 4}
      L${waistL - 2} ${sy + 60} C${waistL} ${sy + 90} ${pinchL} ${pinchY - 30} ${pinchL} ${pinchY}
      C${pinchL} ${pinchY + 40} ${hemL} ${hemY - 40} ${hemL - 4} ${hemY}
      C${cx - 80} ${hemY + 8} ${cx + 80} ${hemY + 8} ${hemR + 4} ${hemY}
      C${hemR} ${hemY - 40} ${pinchR} ${pinchY + 40} ${pinchR} ${pinchY}
      C${pinchR} ${pinchY - 30} ${waistR} ${sy + 90} ${waistR + 2} ${sy + 60}
      L${shoulderR} ${sy + 4} C${shoulderR - 20} ${sy - 10} ${neckR + 40} ${sy - 18} ${neckR} ${sy - 26}
      C${cx + 24} ${sy - 2} ${cx - 24} ${sy - 2} ${neckL} ${sy - 26} Z`;
  const shadeR = `M${cx + 60} ${sy + 20} C${cx + 90} ${sy + 60} ${cx + 100} ${hemY - 80} ${cx + 96} ${hemY + 10}
      L${cx + 300} ${hemY + 10} L${cx + 300} ${sy - 40} L${neckR} ${sy - 40} Z`;
  const litL = `M${neckL - 6} ${sy - 20} C${neckL - 40} ${sy - 10} ${shoulderL + 24} ${sy - 2} ${shoulderL + 14} ${sy + 12}
      L${Math.max(waistL, pinchL) + 16} ${sy + 60} C${pinchL + 20} ${pinchY - 20} ${hemL + 18} ${hemY - 60} ${hemL + 16} ${hemY - 4}
      L${hemL + 42} ${hemY - 2} C${pinchL + 44} ${hemY - 100} ${pinchL + 40} ${sy + 60} ${neckL - 6} ${sy - 20} Z`;
  const clip = `tee-${p.id}`;
  const [a0, a1, a2] = p.sleeveL;
  const [b0, b1, b2] = p.sleeveR;
  const sleeveL = `M${a0[0] + 8} ${a0[1] - 6} C${a0[0] - 22} ${a0[1] + 4} ${a1[0] + 2} ${a1[1] - 40} ${a1[0]} ${a1[1]}
      C${(a1[0] + a2[0]) / 2} ${a1[1] + 12} ${a2[0] - 10} ${a2[1] + 4} ${a2[0]} ${a2[1]} L${a2[0] + 4} ${a0[1] + 40} Z`;
  const sleeveR = `M${b0[0] - 8} ${b0[1] - 6} C${b0[0] + 22} ${b0[1] + 4} ${b1[0] - 2} ${b1[1] - 40} ${b1[0]} ${b1[1]}
      C${(b1[0] + b2[0]) / 2} ${b1[1] + 12} ${b2[0] + 10} ${b2[1] + 4} ${b2[0]} ${b2[1]} L${b2[0] - 4} ${b0[1] + 40} Z`;
  return `
    <clipPath id="${clip}"><path d="${body}"/></clipPath>
    ${P(body, C.tee)}
    <g clip-path="url(#${clip})">
    ${F(litL, C.teeLit, 0.8)}
    ${F(shadeR, C.teeDark, 0.75)}
    ${L(`M${neckL + 4} ${sy - 22} C${cx - 20} ${sy + 4} ${cx + 20} ${sy + 4} ${neckR - 4} ${sy - 22}`, C.teeLine, 7)}
    ${L(`M${cx - 70} ${sy + 110} C${cx - 64} ${sy + 150} ${cx - 66} ${hemY - 60} ${cx - 72} ${hemY - 16}
         M${cx + 44} ${sy + 120} C${cx + 50} ${sy + 170} ${cx + 48} ${hemY - 60} ${cx + 40} ${hemY - 12}`, C.teeLine, 3, 0.8)}
    ${L(`M${hemL + 8} ${hemY - 10} C${cx - 80} ${hemY - 2} ${cx + 80} ${hemY - 2} ${hemR - 8} ${hemY - 10}`, C.teeLine, 3, 0.7)}
    </g>
    ${L(body, OL, LW)}
    ${P(sleeveL, C.tee)}
    ${F(`M${a1[0] + 4} ${a1[1] - 6} C${(a1[0] + a2[0]) / 2} ${a1[1] + 4} ${a2[0] - 10} ${a2[1] - 4} ${a2[0] - 2} ${a2[1] - 8} L${a2[0]} ${a2[1] - 20} C${a2[0] - 20} ${a2[1] - 16} ${a1[0] + 16} ${a1[1] - 14} ${a1[0] + 8} ${a1[1] - 20} Z`, C.teeDark, 0.7)}
    ${P(sleeveR, C.tee)}
    ${F(`M${b1[0] - 4} ${b1[1] - 6} C${(b1[0] + b2[0]) / 2} ${b1[1] + 4} ${b2[0] + 10} ${b2[1] - 4} ${b2[0] + 2} ${b2[1] - 8} L${b2[0]} ${b2[1] - 36} C${b2[0] + 20} ${b2[1] - 30} ${b1[0] - 8} ${b1[1] - 30} ${b1[0] - 8} ${b1[1] - 30} Z`, C.teeDark, 0.8)}`;
}

function pants(p) {
  const { cx, hemY, waistL, waistR, crotchY, legL, legR, kneeY, ankleY } = p;
  const top = hemY - 30;
  const d = `M${waistL + 2} ${top} L${waistR - 2} ${top}
      C${waistR} ${top + 40} ${legR[1] + 2} ${crotchY - 20} ${legR[1]} ${crotchY}
      L${legR[1] - 4} ${kneeY} L${legR[1] - 6} ${ankleY} L${legR[0] + 2} ${ankleY} L${legR[0]} ${kneeY}
      L${legR[0] - 4} ${crotchY} L${cx} ${crotchY - 16} L${legL[1] + 4} ${crotchY}
      L${legL[1]} ${kneeY} L${legL[1] - 2} ${ankleY} L${legL[0] + 6} ${ankleY} L${legL[0] + 4} ${kneeY}
      L${legL[0]} ${crotchY} C${legL[0] - 2} ${crotchY - 20} ${waistL} ${top + 40} ${waistL + 2} ${top} Z`;
  const shadeL = `M${legL[1] - 22} ${crotchY - 10} L${legL[1] + 4} ${crotchY} L${legL[1]} ${kneeY} L${legL[1] - 2} ${ankleY}
      L${legL[1] - 24} ${ankleY} L${legL[1] - 22} ${kneeY} Z`;
  const shadeR = `M${legR[1] - 26} ${crotchY - 20} C${legR[1] - 4} ${crotchY - 30} ${legR[1] + 2} ${crotchY - 20} ${legR[1]} ${crotchY}
      L${legR[1] - 4} ${kneeY} L${legR[1] - 6} ${ankleY} L${legR[1] - 30} ${ankleY} L${legR[1] - 28} ${kneeY} Z`;
  const litL = `M${legL[0] + 8} ${crotchY - 20} L${legL[0] + 24} ${crotchY - 20} L${legL[0] + 26} ${ankleY - 6}
      L${legL[0] + 12} ${ankleY - 6} Z`;
  const cuff = (a, b) => P(`M${a - 2} ${ankleY - 20} L${b + 2} ${ankleY - 20} L${b} ${ankleY + 2} L${a} ${ankleY + 2} Z`, C.pantsDark);
  return `
    ${P(d, C.pants)}
    ${F(litL, C.pantsLit, 0.6)}
    ${F(shadeL, C.pantsDark, 0.7)}
    ${F(shadeR, C.pantsDark, 0.75)}
    ${L(`M${cx} ${crotchY - 16} L${cx} ${top + 10}`, C.pantsDark, 3, 0.9)}
    ${L(`M${legL[0] + 20} ${kneeY - 8} C${legL[0] + 40} ${kneeY - 2} ${legL[1] - 30} ${kneeY - 2} ${legL[1] - 12} ${kneeY - 10}
         M${legR[0] + 12} ${kneeY - 10} C${legR[0] + 30} ${kneeY - 2} ${legR[1] - 40} ${kneeY - 2} ${legR[1] - 20} ${kneeY - 8}`, C.pantsDark, 3, 0.8)}
    ${cuff(legL[0] + 6, legL[1] - 2)}
    ${cuff(legR[0] + 2, legR[1] - 6)}`;
}

function neck(p) {
  const { cx, shoulderY: sy } = p;
  return `${P(`M${cx - 34} ${sy - 80} L${cx + 34} ${sy - 80} L${cx + 36} ${sy - 12} L${cx - 36} ${sy - 12} Z`, C.skin)}
    ${F(`M${cx - 34} ${sy - 62} C${cx - 10} ${sy - 44} ${cx + 10} ${sy - 44} ${cx + 34} ${sy - 62} L${cx + 34} ${sy - 80} L${cx - 34} ${sy - 80} Z`, C.skinDark, 0.8)}`;
}

/** 직업 하나의 벗은 몸 SVG (768×1024). 손은 없다 — ref-parts.py 가 준 그림의 손을 살색으로 칠해 얹는다. */
function baseSVG(cls, { arms = true } = {}) {
  const p = { ...POSE[cls], id: cls };
  const [l0, l1, l2, l3] = p.shoeL;
  const [r0, r1, r2, r3] = p.shoeR;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024">
    ${pants(p)}
    ${shoe(l0, l1, p.ankleY - 4, p.groundY, l2, l3)}
    ${shoe(r0, r1, p.ankleY - 4, p.groundY, r2, r3)}
    ${neck(p)}
    ${arms ? arm(p.armL, p.armW, 1) : ''}
    ${arms ? arm(p.armR, p.armW, -1) : ''}
    ${tee(p)}
  </svg>`;
}

module.exports = { baseSVG, POSE, C };
