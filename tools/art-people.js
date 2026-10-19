// 사람 그림 — 새 판 (0.70.25 미리보기).
//
// ── 왜 새로 그리나 ─────────────────────────────────────────
// 지금 사람들은 **머리가 키의 절반 가까이**(약 2.3등신)다. 팔은 몸통 옆에 붙은
// 막대이고, 어깨도 허리도 무릎도 없다. 멀리서는 귀엽지만 가까이 보면 종이 인형이다.
//
// 그래서 **한 벌의 몸**을 새로 짠다:
//   · 약 3.3등신 — 얼굴이 아직 읽히는 크기에서 멈춘다(60×80 에서 머리 19px)
//   · 어깨·허리·골반·팔꿈치·무릎이 있다
//   · 빛은 왼쪽 위에서 온다(다른 그림과 같은 방향). 면마다 밝음·중간·그늘 세 단
//   · 검은 선은 **바깥 테두리에만** 두른다. 안쪽 경계는 어두운 같은 색으로 나눈다
//     (그림 주문서의 "NO black outlines" 와 풀밭 위 가독성 사이의 절충)
//
// ── 모두 같은 몸에서 나온다 ────────────────────────────────
// 열일곱 명을 따로 그리면 반드시 어깨 높이·발 위치가 제각각이 된다.
// 여기서는 `person(cfg)` 하나가 몸을 짓고, 사람마다 **옷·머리·소품만** 다르다.
//
// ⚠ 아직 게임에 넣지 않는다. 직업 그림에는 장비가 **정해진 자리에** 얹힌다
//   (core/Appearance.js · data/appearance.json — 손·머리·어깨의 좌표). 몸의 비율이
//   바뀌면 그 좌표를 전부 다시 맞춰야 한다. 미리보기로 먼저 보고 정한다.
//
// 좌표: viewBox 0 0 120 160 (게임에서는 60×80, 직업은 48×64 로 그린다 — 둘 다 3:4)
//       발바닥 y=154, 가운데 x=60.

const W = 120, H = 160, CX = 60, FEET = 154;

/**
 * 머리를 목을 축으로 조금 키운다 (0.70.25).
 *
 * 처음에 3.3등신으로 그렸더니, 게임 크기(60×80)에서 **얼굴이 너무 작아져**
 * 표정이 안 읽혔다. 사람다움과 귀여움 사이에서 약 3등신으로 물린다.
 * 몸을 다시 그리지 않고 머리만 키우므로 어깨·손 자리는 그대로다.
 */
const HEAD_K = 1.14, HEAD_PIVOT = 60;

// ─────────────────────────────────────────────────────────────
// 작은 연장
// ─────────────────────────────────────────────────────────────

/** 색을 밝게/어둡게 (#rrggbb, -1..1) */
function tone(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = k > 0 ? 255 : 0, a = Math.abs(k);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/**
 * 색조를 지키며 밝게 (HSL 명도만 올린다).
 * `tone(+)` 는 흰색 쪽으로 섞어서, 어두운 갈색 머리에 쓰면 **회색**이 된다.
 * 머리 윤기처럼 "같은 색의 밝은 쪽" 이 필요할 때 쓴다.
 */
function lighten(hex, dl) {
  const n = parseInt(hex.slice(1), 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, sat = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = Math.min(0.92, l + dl);
  sat = Math.min(1, sat * 1.1 + 0.05);
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? pp + (q - pp) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? pp + (q - pp) * (2 / 3 - t) * 6 : pp; };
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + to(f(h + 1 / 3)) + to(f(h)) + to(f(h - 1 / 3));
}

let UID = 0;
/**
 * 면 하나를 세 단으로 칠한다.
 *   바탕 → 오른쪽(그늘) → 왼쪽 위(밝음)
 * 그늘·밝음은 **그 면 안에서만** 보이게 잘라 낸다(clipPath). 안 자르면 옆 면을 물들인다.
 */
function shade(d, base, { bbox, dark = 0.28, lit = 0.22, cut = 0.58, rim = true, soft = 1.6 } = {}) {
  const id = `s${++UID}`;
  const [x0, y0, x1, y1] = bbox;
  const w = x1 - x0, h = y1 - y0;
  const sx = x0 + w * cut;
  // ⚠ 그늘 경계를 **흐린다** (0.70.25 첫 미리보기에서 고침).
  //   처음에는 날카로운 경계였는데, 얼굴·몸통이 콧날을 따라 **반으로 갈라져**
  //   두 색 탈을 쓴 것처럼 보였다. 흐린 그늘을 면 안에서만 보이게 자른다.
  return `
  <clipPath id="${id}"><path d="${d}"/></clipPath>
  <path d="${d}" fill="${base}"/>
  <g clip-path="url(#${id})">
    <path d="M${sx} ${y0 - 2} Q${sx - w * 0.12} ${y0 + h * 0.5} ${sx + w * 0.04} ${y1 + 2} L${x1 + 4} ${y1 + 2} L${x1 + 4} ${y0 - 2}Z"
          fill="${tone(base, -dark)}" ${soft ? `filter="url(#soft${soft > 2 ? 2 : 1})"` : ''}/>
    ${rim ? `<ellipse cx="${x0 + w * 0.2}" cy="${y0 + h * 0.16}" rx="${w * 0.26}" ry="${h * 0.3}"
          fill="${tone(base, lit)}" opacity="0.4" filter="url(#soft2)"/>` : ''}
  </g>`;
}

// ─────────────────────────────────────────────────────────────
// 몸의 뼈대 — 체격마다 조금씩 다르다
// ─────────────────────────────────────────────────────────────

const BUILDS = {
  //          어깨 반폭 · 허리 반폭 · 골반 반폭 · 다리 간격
  slim:   { sh: 17.5, wa: 11.5, hp: 14,   leg: 7.2 },
  normal: { sh: 19.5, wa: 13.5, hp: 15.5, leg: 7.8 },
  broad:  { sh: 22,   wa: 16,   hp: 16.5, leg: 8.4 },
  stout:  { sh: 21.5, wa: 19,   hp: 18.5, leg: 8.6 },
};

// 세로 자리(모든 체격 공통)
const Y = {
  headCy: 41, neck0: 58, shoulder: 71, chest: 80, waist: 94, hip: 104,
  knee: 127, ankle: 146,
};

// ─────────────────────────────────────────────────────────────
// 부위
// ─────────────────────────────────────────────────────────────

function legs(B, c) {
  const L = CX - B.leg, R = CX + B.leg;
  const leg = (x, flip) => {
    const o = flip ? -1 : 1;
    // 허벅지 → 무릎 → 종아리. 안쪽 선은 곧고 바깥 선이 부푼다.
    const d = `M${x - 6 * o} ${Y.hip - 3} C${x - 7.2 * o} ${Y.knee - 10} ${x - 5.4 * o} ${Y.knee} ${x - 5 * o} ${Y.knee + 3}
      C${x - 5.6 * o} ${Y.knee + 10} ${x - 4.4 * o} ${Y.ankle - 4} ${x - 3.8 * o} ${Y.ankle}
      L${x + 3.8 * o} ${Y.ankle} C${x + 4.2 * o} ${Y.ankle - 8} ${x + 4.8 * o} ${Y.knee + 6} ${x + 4.6 * o} ${Y.knee}
      C${x + 5.2 * o} ${Y.knee - 10} ${x + 5.6 * o} ${Y.hip} ${x + 5.4 * o} ${Y.hip - 3}Z`;
    return d;
  };
  const bb = (x) => [x - 7.5, Y.hip - 4, x + 7.5, Y.ankle];
  return shade(leg(L, false), c.pants, { bbox: bb(L), dark: 0.3 })
       + shade(leg(R, true), c.pants, { bbox: bb(R), dark: 0.34 });
}

function boots(B, c, { tall = true } = {}) {
  const L = CX - B.leg, R = CX + B.leg;
  const top = tall ? Y.knee + 4 : Y.ankle - 4;
  const one = (x) => {
    const d = `M${x - 5.2} ${top} L${x + 5} ${top} L${x + 5.2} ${FEET - 6}
      C${x + 6.4} ${FEET - 4} ${x + 6.2} ${FEET} ${x + 3} ${FEET} L${x - 4.6} ${FEET}
      C${x - 6.6} ${FEET} ${x - 6.6} ${FEET - 4} ${x - 5.4} ${FEET - 6}Z`;
    return shade(d, c.boots, { bbox: [x - 6.6, top, x + 6.4, FEET], dark: 0.32 })
      + `<path d="M${x - 5.6} ${FEET - 1.6} L${x + 5.4} ${FEET - 1.6}" stroke="${tone(c.boots, -0.45)}" stroke-width="1.4"/>`
      + (tall ? `<path d="M${x - 5.2} ${top + 2} L${x + 5} ${top + 2}" stroke="${tone(c.boots, 0.18)}" stroke-width="1.6"/>` : '');
  };
  return one(L) + one(R);
}

/** 상체의 바깥선 — 옷이 이 선을 따라 입혀진다. */
function torsoPath(B, { flare = 0, down = Y.hip + 2 } = {}) {
  const s = B.sh, w = B.wa, h = B.hp + flare;
  return `M${CX - s + 1} ${Y.shoulder + 1}
    C${CX - s + 4} ${Y.shoulder - 4} ${CX - 8} ${Y.shoulder - 5} ${CX} ${Y.shoulder - 5}
    C${CX + 8} ${Y.shoulder - 5} ${CX + s - 4} ${Y.shoulder - 4} ${CX + s - 1} ${Y.shoulder + 1}
    C${CX + s - 1} ${Y.chest + 4} ${CX + w + 1} ${Y.waist - 5} ${CX + w} ${Y.waist}
    C${CX + w + 1} ${Y.waist + 5} ${CX + h} ${down - 6} ${CX + h} ${down}
    L${CX - h} ${down}
    C${CX - h} ${down - 6} ${CX - w - 1} ${Y.waist + 5} ${CX - w} ${Y.waist}
    C${CX - w - 1} ${Y.waist - 5} ${CX - s + 1} ${Y.chest + 4} ${CX - s + 1} ${Y.shoulder + 1}Z`;
}

/** 팔 하나. side=-1 왼쪽(화면), +1 오른쪽. pose 로 손 자리를 옮길 수 있다. */
function armGeom(B, side, pose = {}) {
  const sx = CX + side * (B.sh - 2.5);
  const ex = CX + side * (B.sh + (pose.elbowOut ?? 1.5));
  const ey = Y.waist - 3 + (pose.elbowDY ?? 0);
  const hx = CX + side * (B.sh - 0.5) + (pose.handDX ?? 0) * side;
  const hy = Y.hip + 5 + (pose.handDY ?? 0);
  return { sx, sy: Y.shoulder + 2, ex, ey, hx, hy };
}

/**
 * 팔 — 어깨·팔꿈치·손목을 잇는 **두 마디 막대**로 그린다.
 *
 * ⚠ 처음에는 네 점을 이은 면으로 칠했다. 왼팔은 좌우가 뒤집혀 선이 팔꿈치에서
 *   꼬였고, **뾰족한 날개**가 튀어나왔다. 굵은 선에 둥근 이음을 쓰면
 *   팔꿈치가 저절로 둥글게 굽는다.
 *
 * 그늘은 선 두 겹으로 낸다 — 어두운 선을 깔고, 밝은 선을 빛 쪽(왼쪽)으로
 * 조금 비켜 얹으면 반대쪽에 그늘 테가 남는다. 면을 자르지 않아도 된다.
 */
function arm(B, side, c, pose = {}) {
  const g = armGeom(B, side, pose);
  const base = c.sleeve || c.top;
  const far = side > 0;                      // 빛(왼쪽 위)에서 먼 팔은 한 단 어둡게
  const mid = far ? tone(base, -0.1) : base;
  const pts = `M${g.sx} ${g.sy + 1} L${g.ex} ${g.ey} L${g.hx} ${g.hy - 4}`;
  let out = `<path d="${pts}" stroke="${tone(mid, -0.3)}" stroke-width="10.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${pts}" transform="translate(-1.3 -0.4)" stroke="${mid}" stroke-width="7.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M${g.sx - 1.6} ${g.sy + 2} L${g.ex - 1.8} ${g.ey}" stroke="${tone(mid, 0.18)}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.6"/>`;
  if (c.cuff) out += `<path d="M${g.hx - 4.8} ${g.hy - 5} L${g.hx + 4.8} ${g.hy - 5}" stroke="${c.cuff}" stroke-width="2.8" stroke-linecap="round"/>`;
  return out;
}

function hand(B, side, c, pose = {}) {
  const g = armGeom(B, side, pose);
  // ⚠ 가장 밝은 살색을 쓰면 손이 **흰 공**으로 보인다. 중간 색이 살이다.
  const glove = c.gloves || c.skin[1];
  return `<ellipse cx="${g.hx}" cy="${g.hy}" rx="4.6" ry="4.4" fill="${glove}"/>
    <ellipse cx="${g.hx + side * 1.4}" cy="${g.hy + 0.8}" rx="2.6" ry="3" fill="${tone(glove, -0.2)}" opacity="0.8"/>
    <path d="M${g.hx - 2.8} ${g.hy + 2.6} q2.8 1.6 5.6 0" stroke="${tone(glove, -0.35)}" stroke-width="0.8" fill="none"/>`;
}

function neck(c) {
  const [lit, mid, dark] = c.skin;
  return `<path d="M${CX - 5.4} ${Y.neck0} L${CX + 5.4} ${Y.neck0} L${CX + 6} ${Y.shoulder - 2} L${CX - 6} ${Y.shoulder - 2}Z" fill="${mid}"/>
    <path d="M${CX - 5.4} ${Y.neck0} L${CX + 5.4} ${Y.neck0} L${CX + 5.6} ${Y.neck0 + 6} Q${CX} ${Y.neck0 + 9} ${CX - 5.6} ${Y.neck0 + 6}Z" fill="${dark}" opacity="0.75"/>`;
}

// ─────────────────────────────────────────────────────────────
// 얼굴
// ─────────────────────────────────────────────────────────────

const FACE = `M42 37 C42 21 78 21 78 37 C78.5 50 71 60.5 60 61.5 C49 60.5 41.5 50 42 37Z`;

function head(c) {
  const [lit, mid, dark] = c.skin;
  const f = c.face || {};
  const eye = c.eyes || '#5a3b24';
  const brow = f.brow || tone(c.hair.color, -0.25);
  const ey = 43.5 + (f.eyeDY || 0);
  const oneEye = (x, side) => {
    const lash = f.lashes ? `<path d="M${x + side * 3.4} ${ey - 2.6} l${side * 1.6} -1.2" stroke="#2a1a14" stroke-width="1.1" stroke-linecap="round"/>` : '';
    if (f.closed) {
      return `<path d="M${x - 3.4} ${ey + 0.4} q3.4 2.4 6.8 0" stroke="#3a241a" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    }
    if (f.patch && side > 0) {
      return `<path d="M${x - 5} ${ey - 5.5} L${x + 5} ${ey - 4} L${x + 4} ${ey + 4.5} L${x - 4.5} ${ey + 3.6}Z" fill="#1f1a18"/>
        <path d="M${x - 5} ${ey - 5} L${CX + 19} ${ey - 9}" stroke="#1f1a18" stroke-width="1.2"/>`;
    }
    const narrow = f.narrow ? 0.62 : 1;
    return `<ellipse cx="${x}" cy="${ey}" rx="3.5" ry="${4.1 * narrow}" fill="#fbf7f2"/>
      <ellipse cx="${x + side * 0.3}" cy="${ey + 0.5}" rx="2.7" ry="${3.4 * narrow}" fill="${eye}"/>
      <ellipse cx="${x + side * 0.3}" cy="${ey + 1.4}" rx="2.4" ry="${2 * narrow}" fill="${tone(eye, 0.28)}" opacity="0.6"/>
      <ellipse cx="${x + side * 0.3}" cy="${ey + 0.3}" rx="1.35" ry="${1.8 * narrow}" fill="#1c120e"/>
      <circle cx="${x - 1}" cy="${ey - 1.2 * narrow}" r="1.05" fill="#fff"/>
      <circle cx="${x + 1.2}" cy="${ey + 1.6 * narrow}" r="0.5" fill="#fff" opacity="0.8"/>
      <path d="M${x - 3.9} ${ey - 2.6 * narrow} Q${x} ${ey - 5.4 * narrow} ${x + 3.9} ${ey - 2.4 * narrow}"
            stroke="#2a1a14" stroke-width="1.35" fill="none" stroke-linecap="round"/>
      ${lash}`;
  };
  const browY = 37.2 + (f.browDY || 0);
  const browTilt = f.stern ? 1.4 : f.worried ? -1.2 : 0;
  const mouth = f.mouth === 'flat'
    ? `<path d="M56.8 54.6 L63.2 54.6" stroke="#8a4a3a" stroke-width="1.2" stroke-linecap="round"/>`
    : f.mouth === 'grin'
    ? `<path d="M55.4 53.4 Q60 58.6 64.6 53.4Z" fill="#8a3a30"/><path d="M56.4 53.8 L63.6 53.8" stroke="#fff" stroke-width="1.1"/>`
    : f.mouth === 'smirk'
    ? `<path d="M56.4 55 Q60.5 56.6 64 53.4" stroke="#8a4a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
    : `<path d="M56.6 54.2 Q60 57 63.4 54.2" stroke="#8a4a3a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const lips = f.lips ? `<path d="M57.2 54.4 Q60 56.4 62.8 54.4 Q60 55.4 57.2 54.4Z" fill="${f.lips}" opacity="0.85"/>` : '';
  const wrinkles = f.old ? `
    <path d="M47 50 q2 1.6 4 0.6M73 50 q-2 1.6 -4 0.6" stroke="${dark}" stroke-width="0.8" fill="none"/>
    <path d="M50 33.6 q10 -1.6 20 0" stroke="${dark}" stroke-width="0.7" fill="none" opacity="0.6"/>` : '';
  // 얼굴은 옆 그늘을 거의 안 준다 — 작은 얼굴에 그늘이 크면 멍든 것처럼 보인다.
  // 대신 **앞머리 밑**과 **턱 밑**에 그늘을 두어 입체를 낸다(그림 그리는 사람들이 쓰는 방법).
  const faceShade = shade(FACE, mid, { bbox: [42, 21, 78, 61.5], dark: 0.08, lit: 0.12, cut: 0.74, rim: false, soft: 3 })
    + `<clipPath id="fc"><path d="${FACE}"/></clipPath>
       <g clip-path="url(#fc)">
         <ellipse cx="60" cy="29" rx="20" ry="6" fill="${dark}" opacity="0.28" filter="url(#soft1)"/>
       </g>`;
  return `
    <ellipse cx="41.8" cy="44" rx="3.2" ry="4.6" fill="${mid}"/><ellipse cx="42.2" cy="44.4" rx="1.6" ry="2.6" fill="${dark}" opacity="0.6"/>
    <ellipse cx="78.2" cy="44" rx="3.2" ry="4.6" fill="${tone(mid, -0.08)}"/><ellipse cx="77.8" cy="44.4" rx="1.6" ry="2.6" fill="${dark}" opacity="0.6"/>
    ${faceShade}
    <ellipse cx="53" cy="33" rx="9" ry="6" fill="${lit}" opacity="0.45"/>
    ${wrinkles}
    <ellipse cx="49.4" cy="50.4" rx="3.4" ry="1.9" fill="#ff7f7a" opacity="${f.blush ?? 0.26}"/>
    <ellipse cx="70.6" cy="50.4" rx="3.4" ry="1.9" fill="#ff7f7a" opacity="${f.blush ?? 0.26}"/>
    <path d="M${48.6} ${browY + browTilt * -0.5} Q${52} ${browY - 2.2} ${55.6} ${browY + browTilt}" stroke="${brow}" stroke-width="${f.thickBrow ? 2.2 : 1.6}" fill="none" stroke-linecap="round"/>
    <path d="M${64.4} ${browY + browTilt} Q${68} ${browY - 2.2} ${71.4} ${browY + browTilt * -0.5}" stroke="${brow}" stroke-width="${f.thickBrow ? 2.2 : 1.6}" fill="none" stroke-linecap="round"/>
    ${oneEye(52, -1)}${oneEye(68, 1)}
    <path d="M61.2 46.6 Q62.6 49.8 60.4 51" stroke="${dark}" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    ${mouth}${lips}`;
}

// ─────────────────────────────────────────────────────────────
// 머리카락 — 뒤(얼굴보다 먼저) · 앞(얼굴 다음)
// ─────────────────────────────────────────────────────────────

function hairBack(h) {
  const c = h.color, sh = tone(c, -0.3);
  switch (h.style) {
    case 'long':
      return `<path d="M39 34 C36 58 38 88 44 104 L76 104 C82 88 84 58 81 34 C80 16 40 16 39 34Z" fill="${sh}"/>
        <path d="M41 36 C39 60 41 86 46 100 L52 100 C48 80 47 58 48 38Z" fill="${c}" opacity="0.8"/>`;
    case 'ponytail':
      return `<path d="M74 30 C90 34 90 58 84 76 C82 82 78 84 77 78 C82 62 82 46 72 38Z" fill="${sh}"/>
        <path d="M76 34 C86 40 85 56 81 70" stroke="${tone(c, 0.15)}" stroke-width="1.6" fill="none" opacity="0.7"/>`;
    case 'bun':
      return `<circle cx="60" cy="17" r="9" fill="${c}"/><circle cx="60" cy="17" r="9" fill="${sh}" opacity="0.35"/>
        <path d="M53 14 q7 -6 14 0" stroke="${tone(c, 0.25)}" stroke-width="1.6" fill="none"/>`;
    case 'bob':
      return `<path d="M39.5 36 C38 50 40 58 44 60 L76 60 C80 58 82 50 80.5 36 C80 17 40 17 39.5 36Z" fill="${sh}"/>`;
    default:
      return '';
  }
}

function hairFront(h) {
  const c = h.color, sh = tone(c, -0.28), hi = lighten(c, 0.2);
  const cap = `M40.5 38 C38 14 82 14 79.5 38 C79 31 75 26 70 25 C64 27 56 27 50 25 C45 26 41 31 40.5 38Z`;
  // ⚠ 윤기는 **띠 하나**로 (0.70.25 첫 미리보기에서 고침).
  //   면 전체를 밝히는 둥근 빛을 얹었더니, 검은 머리 정수리가 **회색 털모자**가 됐다.
  //   어두운 색을 흰색 쪽으로 섞으면 회색이 된다. 좁은 띠로만 둔다.
  const base = shade(cap, c, { bbox: [38, 14, 82, 38], dark: 0.24, cut: 0.62, rim: false });
  // 윤기 띠는 정수리 **가장자리가 아니라 안쪽**에 둔다. 가장자리에 두면 윤곽선과
  // 나란히 서서 머리 위에 **따로 얹은 모자 테**처럼 보였다.
  const shine = `<path d="M46.6 26.4 Q53 21.8 62 22.4" stroke="${hi}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M48.4 29 Q51.6 27 55 26.8" stroke="${hi}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.5"/>`;
  switch (h.style) {
    case 'messy':
      return base + `<path d="M42 32 L44 22 L48 30 L51 20 L55 29 L60 19 L63 29 L68 20 L70 30 L75 22 L78 33 C74 27 66 28 60 28 C53 28 46 27 42 32Z" fill="${c}"/>
        <path d="M51 20 L55 29 L60 19" stroke="${sh}" stroke-width="1" fill="none"/>` + shine;
    case 'swept':
      return base + `<path d="M41 36 C42 26 50 21 62 22 C70 23 77 27 79 34 C74 29 67 28 58 30 C51 31 45 33 41 36Z" fill="${c}"/>
        <path d="M44 32 C52 26 62 25 72 28" stroke="${sh}" stroke-width="1.1" fill="none"/>` + shine;
    case 'long':
      return base + `<path d="M41 40 C41 28 48 22 58 22 C54 28 50 33 47 42 C45 50 44 56 43 62 C41 56 40.5 48 41 40Z" fill="${c}"/>
        <path d="M79 40 C79 28 72 22 62 22 C68 27 72 33 74 42 C76 50 76.5 56 77 62 C79 56 79.5 48 79 40Z" fill="${sh}"/>
        <path d="M50 24 C56 29 62 30 70 27" stroke="${sh}" stroke-width="1" fill="none"/>` + shine;
    case 'ponytail':
    case 'bun':
      return base + `<path d="M41.5 34 C45 26 53 23 60 24 C67 23 75 26 78.5 34 C72 29 66 28 60 29 C54 28 47 29 41.5 34Z" fill="${c}"/>
        <path d="M60 24 L60 29" stroke="${sh}" stroke-width="1"/>` + shine;
    case 'bob':
      return base + `<path d="M41 44 C40 30 48 22 60 22 C72 22 80 30 79 44 C77 36 74 31 70 30 C64 32 56 32 50 30 C46 31 43 36 41 44Z" fill="${c}"/>` + shine;
    case 'bald':
      // 옆머리만 남은 머리 — 귀 위를 감싸는 **말굽** 두 쪽.
      // ⚠ 처음에는 관자놀이에 네모 덩어리를 붙였더니 **회색 얼룩**으로 보였다.
      //   머리 둘레를 따라 부풀려 감싸야 머리카락으로 읽힌다.
      return `<path d="M42.6 48 C38.6 44 38.8 34 42.4 29.6 C43.4 33 45.6 35 46.4 38 C45 40 44.4 44 44.8 48Z" fill="${c}"/>
        <path d="M77.4 48 C81.4 44 81.2 34 77.6 29.6 C76.6 33 74.4 35 73.6 38 C75 40 75.6 44 75.2 48Z" fill="${sh}"/>
        <path d="M41 36 q1.4 -3 2.6 -4.4M79 36 q-1.4 -3 -2.6 -4.4" stroke="${tone(c, 0.3)}" stroke-width="0.9" fill="none"/>
        <ellipse cx="53" cy="25" rx="5.6" ry="2.2" fill="#fff" opacity="0.32" filter="url(#soft1)"/>`;
    default: // short
      return base + `<path d="M41 34 C44 25 52 22 60 22.5 C69 22 76 25 79 34 C75 29 70 27.5 65 28.4 L62 25.6 L58 28.6 C52 28 45 29 41 34Z" fill="${c}"/>` + shine;
  }
}

function beard(b) {
  if (!b) return '';
  const c = b.color, sh = tone(c, -0.25), hi = tone(c, 0.25);
  if (b.style === 'long') {
    return `<path d="M44 46 C44 60 50 82 60 92 C70 82 76 60 76 46 C74 54 68 58 60 58 C52 58 46 54 44 46Z" fill="${c}"/>
      <path d="M60 92 C66 82 72 64 76 46 C74 60 70 76 60 92Z" fill="${sh}"/>
      <path d="M52 64 q4 12 7 20M58 62 q2 12 2 24M65 63 q-2 12 -4 21" stroke="${sh}" stroke-width="0.9" fill="none"/>
      <path d="M53 55.6 q7 -3.4 14 0" stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M50 60 q3 6 5 10" stroke="${hi}" stroke-width="1.1" fill="none" opacity="0.7"/>`;
  }
  // full — 턱을 덮는 짧은 수염
  return `<path d="M43.5 44 C43 56 50 64 60 65 C70 64 77 56 76.5 44 C74 52 68 57 60 57.4 C52 57 46 52 43.5 44Z" fill="${c}"/>
    <path d="M60 65 C70 64 77 56 76.5 44 C75 55 70 61 60 65Z" fill="${sh}"/>
    <path d="M53.4 54.2 q6.6 -3 13.2 0" stroke="${c}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M47 52 q2 5 5 7" stroke="${hi}" stroke-width="1" fill="none" opacity="0.6"/>`;
}

// ─────────────────────────────────────────────────────────────
// 옷
// ─────────────────────────────────────────────────────────────

function outfit(B, c) {
  const o = c.outfit;
  const t = torsoPath(B, { flare: o.flare || 0, down: o.down || Y.hip + 2 });
  const bb = [CX - B.hp - 4, Y.shoulder - 6, CX + B.hp + 4, o.down || Y.hip + 2];
  let s = '';
  // 치마·옷자락(몸통보다 먼저 — 허리에서 아래로 퍼진다)
  if (o.skirt) {
    const top = Y.waist - 2, bot = o.skirt.to;
    const wTop = B.wa + 1, wBot = o.skirt.wide;
    const d = `M${CX - wTop} ${top} L${CX + wTop} ${top}
      C${CX + wTop + 4} ${top + (bot - top) * 0.4} ${CX + wBot - 2} ${bot - 8} ${CX + wBot} ${bot}
      Q${CX + wBot * 0.5} ${bot + 3} ${CX} ${bot + 1} Q${CX - wBot * 0.5} ${bot + 3} ${CX - wBot} ${bot}
      C${CX - wBot + 2} ${bot - 8} ${CX - wTop - 4} ${top + (bot - top) * 0.4} ${CX - wTop} ${top}Z`;
    s += shade(d, o.skirt.color || o.color, { bbox: [CX - wBot, top, CX + wBot, bot + 3], dark: 0.3 });
    // 주름 — 세로 몇 줄
    const fold = tone(o.skirt.color || o.color, -0.22);
    for (const k of [-0.55, -0.15, 0.3, 0.65]) {
      s += `<path d="M${CX + wTop * k} ${top + 6} Q${CX + wBot * k * 0.9} ${(top + bot) / 2} ${CX + wBot * k} ${bot - 1}" stroke="${fold}" stroke-width="0.9" fill="none" opacity="0.7"/>`;
    }
    if (o.skirt.hem) s += `<path d="M${CX - wBot} ${bot} Q${CX - wBot * 0.5} ${bot + 3} ${CX} ${bot + 1} Q${CX + wBot * 0.5} ${bot + 3} ${CX + wBot} ${bot}" stroke="${o.skirt.hem}" stroke-width="2.4" fill="none"/>`;
  }
  s += shade(t, o.color, { bbox: bb, dark: 0.3 });
  // 목둘레
  if (o.neck === 'v') {
    s += `<path d="M${CX - 6.4} ${Y.shoulder - 4.6} L${CX} ${Y.shoulder + 6} L${CX + 6.4} ${Y.shoulder - 4.6}Z" fill="${c.skin[1]}"/>
      <path d="M${CX - 6.8} ${Y.shoulder - 4.8} L${CX} ${Y.shoulder + 6.6} L${CX + 6.8} ${Y.shoulder - 4.8}" stroke="${o.trim || tone(o.color, -0.3)}" stroke-width="1.6" fill="none"/>`;
  } else if (o.neck === 'collar') {
    s += `<path d="M${CX - 8} ${Y.shoulder - 4} Q${CX} ${Y.shoulder + 3} ${CX + 8} ${Y.shoulder - 4} L${CX + 6} ${Y.shoulder - 6} Q${CX} ${Y.shoulder - 1} ${CX - 6} ${Y.shoulder - 6}Z" fill="${o.trim || tone(o.color, 0.3)}"/>`;
  } else {
    s += `<path d="M${CX - 6.6} ${Y.shoulder - 4.8} Q${CX} ${Y.shoulder + 0.6} ${CX + 6.6} ${Y.shoulder - 4.8}" stroke="${o.trim || tone(o.color, -0.3)}" stroke-width="1.6" fill="${c.skin[1]}"/>`;
  }
  // 가운데 여밈
  if (o.placket) {
    s += `<path d="M${CX} ${Y.shoulder + 2} L${CX} ${o.down || Y.hip}" stroke="${tone(o.color, -0.28)}" stroke-width="1"/>`;
    for (let y = Y.shoulder + 6; y < Y.waist; y += 7) s += `<circle cx="${CX + 1.6}" cy="${y}" r="1" fill="${o.button || '#e8c56a'}"/>`;
  }
  // 허리띠
  if (o.belt) {
    s += `<path d="M${CX - B.wa - 0.8} ${Y.waist - 2} Q${CX} ${Y.waist + 0.6} ${CX + B.wa + 0.8} ${Y.waist - 2}
      L${CX + B.wa + 1} ${Y.waist + 2.6} Q${CX} ${Y.waist + 5} ${CX - B.wa - 1} ${Y.waist + 2.6}Z" fill="${o.belt}"/>
      <rect x="${CX - 2.8}" y="${Y.waist - 1.8}" width="5.6" height="5" rx="1" fill="none" stroke="${o.buckle || '#e2c064'}" stroke-width="1.3"/>`;
  }
  // 앞치마
  if (o.apron) {
    const a = o.apron;
    s += shade(`M${CX - B.wa + 1} ${Y.chest} L${CX + B.wa - 1} ${Y.chest} L${CX + B.wa + 2} ${a.to} Q${CX} ${a.to + 2.6} ${CX - B.wa - 2} ${a.to}Z`,
      a.color, { bbox: [CX - B.wa - 2, Y.chest, CX + B.wa + 2, a.to + 2], dark: 0.18 });
    s += `<path d="M${CX - B.wa + 1} ${Y.chest} L${CX - B.sh + 5} ${Y.shoulder - 2}M${CX + B.wa - 1} ${Y.chest} L${CX + B.sh - 5} ${Y.shoulder - 2}" stroke="${a.color}" stroke-width="2"/>`;
    if (a.pocket) s += `<rect x="${CX - 6}" y="${Y.waist + 4}" width="12" height="7" rx="1.4" fill="none" stroke="${tone(a.color, -0.25)}" stroke-width="1"/>`;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────
// 한 사람
// ─────────────────────────────────────────────────────────────

/**
 * @param cfg.skin    [밝음, 중간, 그늘]
 * @param cfg.hair    { style, color }
 * @param cfg.build   slim | normal | broad | stout
 * @param cfg.outfit  { color, trim, neck, belt, placket, apron, skirt, flare, down }
 * @param cfg.behind  몸보다 뒤에 그릴 것(망토·등에 멘 활)
 * @param cfg.front   손에 든 것(손보다 앞)
 * @param cfg.hat     머리 위에 얹는 것
 * @param cfg.scale   어린이는 0.8 — 발을 기준으로 줄인다
 */
function person(cfg) {
  UID = 0;
  const B = BUILDS[cfg.build || 'normal'];
  const c = { ...cfg, top: cfg.outfit.color, sleeve: cfg.sleeve || cfg.outfit.sleeve || cfg.outfit.color };
  const poseL = cfg.poseL || {}, poseR = cfg.poseR || {};
  const legsHidden = cfg.outfit.skirt && cfg.outfit.skirt.to >= Y.ankle - 2;

  const body = `
    ${cfg.behind || ''}
    <g transform="translate(${CX} ${HEAD_PIVOT}) scale(${HEAD_K}) translate(${-CX} ${-HEAD_PIVOT})">${hairBack(cfg.hair)}</g>
    ${legsHidden ? '' : legs(B, c)}
    ${boots(B, c, { tall: cfg.tallBoots !== false && !legsHidden })}
    ${cfg.underArms || ''}
    ${arm(B, -1, c, poseL)}${arm(B, 1, c, poseR)}
    ${outfit(B, c)}
    ${cfg.overTorso || ''}
    ${neck(c)}
    ${cfg.pauldrons || ''}
    <g transform="translate(${CX} ${HEAD_PIVOT}) scale(${HEAD_K}) translate(${-CX} ${-HEAD_PIVOT})">
    ${head(c)}
    ${beard(cfg.beard)}
    ${hairFront(cfg.hair)}
    ${cfg.hat || ''}
    </g>
    ${hand(B, -1, c, poseL)}
    ${cfg.front || ''}
    ${hand(B, 1, c, poseR)}
    ${cfg.frontTop || ''}`;

  const s = cfg.scale || 1;
  const fit = s !== 1
    ? `transform="translate(${CX} ${FEET}) scale(${s}) translate(${-CX} ${-FEET})"`
    : '';
  // 바깥 테두리만 — 알파를 부풀려 어두운 색으로 칠하고, 그 위에 원래 그림을 얹는다.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="soft1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="soft2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="ol" x="-10%" y="-10%" width="120%" height="120%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.15" result="fat"/>
      <feFlood flood-color="#23160f" flood-opacity="0.92"/>
      <feComposite in2="fat" operator="in" result="line"/>
      <feMerge><feMergeNode in="line"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <ellipse cx="${CX}" cy="${FEET}" rx="${22 * s}" ry="${4.6 * s}" fill="#000" opacity="0.26"/>
  ${cfg.ground || ''}
  <g filter="url(#ol)" ${fit}>${body}</g>
</svg>`;
}

// ─────────────────────────────────────────────────────────────
// 소품
// ─────────────────────────────────────────────────────────────

const PROP = {
  /** 세로로 쥔 막대(지팡이·창). x,y = 손 자리 */
  pole(x, y, { top = 20, bot = FEET - 2, color = '#8a5a2e', w = 2.8 } = {}) {
    return `<path d="M${x} ${top} L${x} ${bot}" stroke="${tone(color, -0.3)}" stroke-width="${w + 1}" stroke-linecap="round"/>
      <path d="M${x - 0.5} ${top} L${x - 0.5} ${bot}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>
      <path d="M${x - 1.2} ${top + 2} L${x - 1.2} ${bot - 4}" stroke="${tone(color, 0.3)}" stroke-width="0.8" opacity="0.8"/>`;
  },
  spearHead(x, y) {
    return `<path d="M${x} ${y - 13} L${x + 4} ${y} L${x} ${y + 3} L${x - 4} ${y}Z" fill="#d7dde8"/>
      <path d="M${x} ${y - 13} L${x + 4} ${y} L${x} ${y + 3}Z" fill="#9aa3b4"/>
      <rect x="${x - 3}" y="${y + 3}" width="6" height="3" rx="1" fill="#b89040"/>`;
  },
  orb(x, y, color, r = 5) {
    return `<circle cx="${x}" cy="${y}" r="${r + 3}" fill="${color}" opacity="0.22"/>
      <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
      <circle cx="${x + r * 0.35}" cy="${y + r * 0.3}" r="${r * 0.55}" fill="${tone(color, -0.3)}" opacity="0.6"/>
      <circle cx="${x - r * 0.35}" cy="${y - r * 0.4}" r="${r * 0.32}" fill="#fff" opacity="0.9"/>`;
  },
  club(x, y) {
    return `<g transform="rotate(-18 ${x} ${y})">
      <path d="M${x - 2} ${y + 4} L${x - 3} ${y - 22} C${x - 4} ${y - 32} ${x + 6} ${y - 34} ${x + 5} ${y - 22} L${x + 2} ${y + 4}Z" fill="#7a4e2a"/>
      <path d="M${x + 1} ${y - 30} C${x + 6} ${y - 30} ${x + 5} ${y - 22} ${x + 3} ${y - 10} L${x + 2} ${y + 4}" fill="#5c3a1e"/>
      <circle cx="${x - 0.6}" cy="${y - 20}" r="1.2" fill="#4a2e16"/><circle cx="${x + 1.6}" cy="${y - 26}" r="1" fill="#4a2e16"/>
      <path d="M${x - 1.6} ${y - 28} C${x - 2} ${y - 20} ${x - 1.4} ${y - 8} ${x - 1} ${y}" stroke="#a87444" stroke-width="1" fill="none"/></g>`;
  },
  hammerOnShoulder(x, y) {
    return `<g transform="rotate(38 ${x} ${y})">
      <rect x="${x - 1.6}" y="${y - 30}" width="3.4" height="32" rx="1.4" fill="#7a4e2a"/>
      <rect x="${x - 8}" y="${y - 36}" width="16" height="9" rx="1.6" fill="#6d7483"/>
      <rect x="${x - 8}" y="${y - 36}" width="16" height="3" rx="1.2" fill="#a3aab8"/>
      <rect x="${x + 5}" y="${y - 36}" width="3" height="9" fill="#50566a"/></g>`;
  },
};

// ─────────────────────────────────────────────────────────────
// 사람들
// ─────────────────────────────────────────────────────────────

const SKIN = {
  fair:  ['#ffe3cf', '#f6cdb0', '#e0a988'],
  warm:  ['#fbd6b6', '#eebc97', '#d49b74'],
  tan:   ['#e8b48a', '#d49a6c', '#b27a50'],
  deep:  ['#b9805a', '#9c6644', '#7c4d30'],
  pale:  ['#f8ece6', '#ecd8cf', '#cfb2a6'],
};

const PEOPLE = {};

// ── 직업 ────────────────────────────────────────────────────

PEOPLE.hero = person({
  skin: SKIN.warm, eyes: '#3f6fb4',
  hair: { style: 'messy', color: '#8a5a2c' },
  face: { stern: false, mouth: 'smile' },
  build: 'broad',
  outfit: { color: '#3f7fc4', trim: '#274f80', neck: 'v', belt: '#6b4526', flare: 1,
            skirt: { to: Y.hip + 10, wide: 20, color: '#3a74b4', hem: '#274f80' } },
  sleeve: '#3f7fc4', cuff: '#e0c89c',
  pants: '#6b5238', boots: '#6a4428',
  poseR: { handDX: 1, handDY: -2 },
  front: PROP.club(80, 107),
  hat: `<path d="M42 30 Q60 21 78 30" stroke="#c9a14a" stroke-width="2.4" fill="none"/>
        <circle cx="60" cy="25.4" r="2.2" fill="#e7c95e"/><circle cx="60" cy="25.4" r="1" fill="#c0392b"/>`,
});

PEOPLE.ranger = person({
  skin: SKIN.tan, eyes: '#3d7a3a',
  hair: { style: 'ponytail', color: '#3b2618' },
  face: { lashes: true, mouth: 'smile', lips: '#c46a5a' },
  build: 'slim',
  behind: `<g transform="rotate(14 60 90)">
      <path d="M78 58 Q98 90 80 124" stroke="#6b4526" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M78 58 L80 124" stroke="#e9e1cc" stroke-width="0.8"/></g>
    <rect x="36" y="62" width="9" height="30" rx="3" fill="#6b4526" transform="rotate(-22 40 77)"/>
    <g transform="rotate(-22 40 77)"><path d="M37 60 l2 -8 l2 8M41 60 l2 -9 l2 9" stroke="#d8c7a0" stroke-width="1.2" fill="#b33a2e"/></g>`,
  outfit: { color: '#5a7a3a', trim: '#3a5226', neck: 'v', belt: '#5a3a20',
            skirt: { to: Y.hip + 8, wide: 17, color: '#4f6c33' } },
  overTorso: `<path d="M${CX - 16} ${Y.shoulder} L${CX + 12} ${Y.waist - 2}" stroke="#6b4526" stroke-width="3.2"/>`,
  sleeve: '#6f8f4a', gloves: '#6b4526',
  pants: '#6e5a40', boots: '#5a3a20',
});

PEOPLE.mage = person({
  skin: SKIN.fair, eyes: '#6a5bd0',
  hair: { style: 'long', color: '#e9ecf6' },
  face: { lashes: true, mouth: 'smile', lips: '#d98a8a', blush: 0.32 },
  build: 'slim',
  outfit: { color: '#3b5fb0', trim: '#e8d7a0', neck: 'collar',
            skirt: { to: FEET - 3, wide: 22, color: '#34539c', hem: '#e8d7a0' } },
  sleeve: '#4a6fc2', cuff: '#e8d7a0',
  pants: '#34539c', boots: '#4a3a5a', tallBoots: false,
  poseR: { handDX: 2, handDY: -8, elbowOut: 3 },
  front: PROP.pole(82, 100, { top: 36, bot: FEET - 4, color: '#7a5a3a' })
       + `<path d="M82 38 q-7 -6 -3 -14 q4 4 3 14M82 38 q7 -6 3 -14 q-4 4 -3 14" fill="#6b4a2a"/>`
       + PROP.orb(82, 30, '#7fb4ff', 4.4),
  overTorso: `<path d="M${CX - 11} ${Y.waist - 1} Q${CX} ${Y.waist + 3} ${CX + 11} ${Y.waist - 1}" stroke="#e8d7a0" stroke-width="2" fill="none"/>`,
});

PEOPLE.admin = person({
  skin: SKIN.pale, eyes: '#4a86c8',
  hair: { style: 'swept', color: '#f3f1ea' },
  face: { mouth: 'flat', stern: true },
  build: 'broad',
  behind: `<path d="M44 74 C20 60 10 80 14 100 C22 92 30 92 40 96Z" fill="#dfe9ff" opacity="0.9"/>
    <path d="M76 74 C100 60 110 80 106 100 C98 92 90 92 80 96Z" fill="#dfe9ff" opacity="0.9"/>
    <path d="M20 78 q10 4 18 12M100 78 q-10 4 -18 12" stroke="#a9bde8" stroke-width="1.2" fill="none"/>
    <ellipse cx="60" cy="8" rx="13" ry="3.6" fill="none" stroke="#ffe27a" stroke-width="2.4"/>
    <ellipse cx="60" cy="8" rx="13" ry="3.6" fill="none" stroke="#fff7cf" stroke-width="0.9"/>`,
  outfit: { color: '#eef1f7', trim: '#c9a64a', neck: 'collar', belt: '#c9a64a', buckle: '#fff2b0',
            skirt: { to: Y.hip + 12, wide: 20, color: '#e4e8f0', hem: '#c9a64a' } },
  sleeve: '#e4e8f0', gloves: '#dfe3ec', cuff: '#c9a64a',
  pants: '#d6dbe5', boots: '#c9ceda',
  pauldrons: `<ellipse cx="${CX - 21}" cy="${Y.shoulder + 1}" rx="8" ry="5.4" fill="#f4f6fb"/>
    <ellipse cx="${CX + 21}" cy="${Y.shoulder + 1}" rx="8" ry="5.4" fill="#d9deea"/>
    <path d="M${CX - 28} ${Y.shoulder + 2} q7 4 14 0M${CX + 14} ${Y.shoulder + 2} q7 4 14 0" stroke="#c9a64a" stroke-width="1.2" fill="none"/>`,
  overTorso: `<path d="M${CX} ${Y.chest - 4} l3.4 5 l-3.4 5 l-3.4 -5Z" fill="#6aa8ff"/>`,
  poseR: { handDY: -3 },
  front: `<path d="M81 76 L81 118" stroke="#c9a64a" stroke-width="2.2"/><path d="M76 108 L86 108" stroke="#c9a64a" stroke-width="2.6"/>
    <path d="M81 76 L83 70 L81 60 L79 70Z" fill="#f4f6fb"/>`,
});

// ── 마을 사람 ───────────────────────────────────────────────

PEOPLE.shopkeeper = person({
  skin: SKIN.warm, eyes: '#5a3b24',
  hair: { style: 'short', color: '#c0502e' },
  face: { mouth: 'grin', blush: 0.34 },
  build: 'normal',
  outfit: { color: '#5d9a4a', trim: '#3c6a30', neck: 'round', belt: '#6b4526',
            apron: { color: '#f1e6cc', to: Y.hip + 16, pocket: true } },
  pants: '#5a4a3a', boots: '#5a3a20', tallBoots: false,
  hat: `<path d="M41 30 C44 14 76 14 79 30 Q60 24 41 30Z" fill="#c43d32"/><path d="M76 26 q10 -2 14 4 q-8 0 -14 -1Z" fill="#c43d32"/>`,
  poseL: { handDX: 8, handDY: -10, elbowOut: -1 }, poseR: { handDX: 8, handDY: -10, elbowOut: -1 },
  front: `<path d="M44 96 L76 96 L73 112 L47 112Z" fill="#b8844a"/>
    <path d="M44 96 L76 96" stroke="#8a5a2e" stroke-width="2"/>
    <path d="M46 100 L74 100M47 105 L73 105" stroke="#8a5a2e" stroke-width="0.9" opacity="0.8"/>
    <circle cx="52" cy="92" r="4.4" fill="#d83a2e"/><circle cx="51" cy="90.6" r="1.4" fill="#ff9a8a"/>
    <circle cx="61" cy="91" r="4.6" fill="#e04a30"/><circle cx="60" cy="89.4" r="1.4" fill="#ffa090"/>
    <ellipse cx="69" cy="92" rx="5" ry="3.6" fill="#e9b45a"/><path d="M66 91 q3 -2 6 0" stroke="#b9843a" stroke-width="0.8" fill="none"/>`,
});

PEOPLE.blacksmith = person({
  skin: SKIN.tan, eyes: '#3a2a1c',
  hair: { style: 'short', color: '#2a1a12' },
  face: { stern: true, thickBrow: true, mouth: 'flat' },
  beard: { style: 'full', color: '#2e1c12' },
  build: 'stout',
  outfit: { color: '#8a3a2a', trim: '#5a2418', neck: 'round', belt: '#3a2618',
            apron: { color: '#5a3a24', to: Y.hip + 18 } },
  sleeve: '#d49a6c',
  pants: '#4a3a2e', boots: '#3a2618',
  hat: `<path d="M41 31 C42 18 78 18 79 31 Q60 26 41 31Z" fill="#b83a2e"/><path d="M78 27 q8 4 6 12 q-4 -6 -8 -9Z" fill="#b83a2e"/>`,
  front: PROP.hammerOnShoulder(84, 114),
});

PEOPLE.innkeeper = person({
  skin: SKIN.fair, eyes: '#4a8a5a',
  hair: { style: 'bun', color: '#e2b04a' },
  face: { lashes: true, mouth: 'smile', lips: '#d27a74', blush: 0.34 },
  build: 'normal',
  outfit: { color: '#7a4ab4', trim: '#4e2c7a', neck: 'v',
            skirt: { to: FEET - 6, wide: 22, color: '#6a3ea0' },
            apron: { color: '#fbf6ea', to: Y.hip + 22, pocket: true } },
  sleeve: '#f4ecdc', cuff: '#7a4ab4',
  pants: '#6a3ea0', boots: '#4a2e1c', tallBoots: false,
  poseL: { handDX: 9, handDY: -12, elbowOut: -1 }, poseR: { handDX: 9, handDY: -12, elbowOut: -1 },
  front: `<ellipse cx="60" cy="96" rx="17" ry="4" fill="#b8844a"/><ellipse cx="60" cy="95" rx="17" ry="3.4" fill="#d6a468"/>
    <rect x="47" y="84" width="8" height="10" rx="1.6" fill="#d9a24a"/><rect x="47" y="84" width="8" height="3" rx="1.4" fill="#fff6e0"/>
    <path d="M55 86 q3 0 3 3 q0 3 -3 3" stroke="#b8844a" stroke-width="1.4" fill="none"/>
    <ellipse cx="67" cy="91" rx="6" ry="3.4" fill="#e3a95a"/><path d="M63 90 q4 -2.6 8 0" stroke="#a8743a" stroke-width="0.9" fill="none"/>`,
});

PEOPLE.villager = person({
  skin: SKIN.warm, eyes: '#5a3b24',
  hair: { style: 'short', color: '#3a2618' },
  face: { mouth: 'smile' },
  build: 'normal',
  outfit: { color: '#c9a04a', trim: '#8f6c2a', neck: 'round', belt: '#6b4526', placket: true, button: '#8f6c2a',
            skirt: { to: Y.hip + 8, wide: 18, color: '#b8903e' } },
  pants: '#5d6a7a', boots: '#5a3a20',
});

PEOPLE.elder = person({
  skin: SKIN.fair, eyes: '#6a7a8a',
  hair: { style: 'bald', color: '#e8e8e8' },
  face: { old: true, mouth: 'smile', eyeDY: 0.4, brow: '#e8e8e8', thickBrow: true },
  beard: { style: 'long', color: '#f2f2f0' },
  build: 'slim',
  outfit: { color: '#6a5a4a', trim: '#4a3e32', neck: 'round',
            skirt: { to: FEET - 3, wide: 20, color: '#5e5040', hem: '#3e342a' } },
  sleeve: '#6a5a4a',
  pants: '#5e5040', boots: '#3e342a', tallBoots: false,
  poseR: { handDX: 3, handDY: -6 },
  front: PROP.pole(83, 104, { top: 26, color: '#8a5a2e', w: 3.2 }) + PROP.orb(83, 22, '#5aa8e8', 4.6),
});

PEOPLE.gambler = person({
  skin: SKIN.warm, eyes: '#8a4ab8',
  hair: { style: 'swept', color: '#1e1620' },
  face: { mouth: 'smirk', narrow: true },
  build: 'slim',
  outfit: { color: '#5a2e6a', trim: '#d4af37', neck: 'collar', placket: true, button: '#d4af37', belt: '#2a1a2e',
            skirt: { to: Y.hip + 8, wide: 16, color: '#4e2860' } },
  sleeve: '#5a2e6a', cuff: '#d4af37',
  pants: '#2e2238', boots: '#1e1620',
  hat: `<path d="M40 30 C40 18 80 18 80 30 Q60 24 40 30Z" fill="#3a1e46"/><path d="M38 31 Q60 26 82 31" stroke="#d4af37" stroke-width="2" fill="none"/>
        <circle cx="72" cy="22" r="2.2" fill="#e8434b"/>`,
  poseL: { handDX: 9, handDY: -11, elbowOut: -1 }, poseR: { handDX: 9, handDY: -11, elbowOut: -1 },
  front: `<rect x="43" y="93" width="34" height="8" rx="1.6" fill="#4a2a18"/><rect x="43" y="93" width="34" height="2.6" rx="1.2" fill="#6b4226"/>
    <path d="M49 91 l3 -4 l3 4 l-3 3Z" fill="#e8434b"/><path d="M58 91 l3 -4 l3 4 l-3 3Z" fill="#4aa0e8"/><path d="M67 91 l3 -4 l3 4 l-3 3Z" fill="#f2f2f2"/>`,
});

PEOPLE.kid = person({
  skin: SKIN.warm, eyes: '#5a3b24',
  hair: { style: 'bob', color: '#c07a3a' },
  face: { mouth: 'grin', blush: 0.4, eyeDY: 0.6 },
  build: 'slim', scale: 0.8,
  outfit: { color: '#6aa8d8', trim: '#3a78a8', neck: 'round', belt: '#6b4526',
            skirt: { to: Y.hip + 6, wide: 16, color: '#5a98c8' } },
  pants: '#6a5a4a', boots: '#6a4428', tallBoots: false,
  poseR: { handDX: 2, handDY: -2 },
  front: `<path d="M81 110 L94 64" stroke="#7a4e2a" stroke-width="3" stroke-linecap="round"/><path d="M88 80 l5 -3" stroke="#7a4e2a" stroke-width="1.6" stroke-linecap="round"/>`,
});

PEOPLE.guard = person({
  skin: SKIN.warm, eyes: '#3a4a5a',
  hair: { style: 'short', color: '#4a3020' },
  face: { stern: true, mouth: 'flat' },
  build: 'broad',
  outfit: { color: '#9aa3b4', trim: '#5a6274', neck: 'collar', belt: '#5a3a20',
            skirt: { to: Y.hip + 10, wide: 19, color: '#3a5a9a', hem: '#d4af37' } },
  sleeve: '#8a93a4', gloves: '#6a4a2a',
  pants: '#4a4e5a', boots: '#3e3a3a',
  overTorso: `<path d="M${CX - 9} ${Y.chest - 2} L${CX + 9} ${Y.chest - 2} L${CX + 9} ${Y.chest + 9} Q${CX} ${Y.chest + 15} ${CX - 9} ${Y.chest + 9}Z" fill="#3a5a9a"/>
    <path d="M${CX} ${Y.chest} l0 11M${CX - 5} ${Y.chest + 4} l10 0" stroke="#d4af37" stroke-width="1.6"/>
    <path d="M${CX - 12} ${Y.shoulder + 2} Q${CX} ${Y.shoulder + 8} ${CX + 12} ${Y.shoulder + 2}" stroke="#c4ccd9" stroke-width="1.4" fill="none"/>`,
  pauldrons: `<ellipse cx="${CX - 21}" cy="${Y.shoulder + 1}" rx="7.6" ry="5.4" fill="#b8c0cf"/>
    <ellipse cx="${CX + 21}" cy="${Y.shoulder + 1}" rx="7.6" ry="5.4" fill="#8a93a4"/>`,
  hat: `<path d="M40 38 C38 16 82 16 80 38 L77 38 C76 28 44 28 43 38Z" fill="#aab2c2"/>
    <path d="M40 38 C38 16 60 14 60 16 C50 18 44 26 43 38Z" fill="#d2d8e3"/>
    <path d="M40 37 L80 37" stroke="#6a7284" stroke-width="2.2"/>
    <path d="M60 17 C58 8 62 2 66 4 C64 8 64 12 62 17Z" fill="#d23a2e"/><path d="M60 17 C56 10 58 4 60 3" stroke="#a82a20" stroke-width="1.2" fill="none"/>`,
  poseR: { handDX: 3, handDY: -6 },
  front: PROP.pole(83, 104, { top: 20, color: '#7a4e2a', w: 3 }) + PROP.spearHead(83, 18),
});

PEOPLE.king = person({
  skin: SKIN.fair, eyes: '#5a6a8a',
  hair: { style: 'short', color: '#eeeae0' },
  face: { old: true, mouth: 'smile', brow: '#eeeae0', thickBrow: true },
  beard: { style: 'long', color: '#f4f1e8' },
  build: 'broad',
  behind: `<path d="M38 74 C28 100 30 130 34 ${FEET - 2} L86 ${FEET - 2} C90 130 92 100 82 74Z" fill="#8a1e2a"/>
    <path d="M82 74 C92 100 90 130 86 ${FEET - 2} L74 ${FEET - 2} C80 120 80 96 76 76Z" fill="#6a1420"/>`,
  outfit: { color: '#6a3ab4', trim: '#f4f1e8', neck: 'collar', belt: '#d4af37', buckle: '#fff2b0',
            skirt: { to: FEET - 4, wide: 22, color: '#5a2ea0', hem: '#f4f1e8' } },
  sleeve: '#6a3ab4', cuff: '#f4f1e8',
  pants: '#5a2ea0', boots: '#3a2a4a', tallBoots: false,
  pauldrons: `<path d="M${CX - 24} ${Y.shoulder + 6} Q${CX} ${Y.shoulder + 16} ${CX + 24} ${Y.shoulder + 6} L${CX + 22} ${Y.shoulder - 3} Q${CX} ${Y.shoulder + 5} ${CX - 22} ${Y.shoulder - 3}Z" fill="#f4f1e8"/>
    ${[-18, -10, -2, 6, 14].map((dx) => `<path d="M${CX + dx} ${Y.shoulder + 4} l1.2 3 l-1.2 1 l-1.2 -1Z" fill="#2a2a2a"/>`).join('')}`,
  hat: `<path d="M44 26 L46 12 L52 20 L60 8 L68 20 L74 12 L76 26Z" fill="#e8c24a"/>
    <path d="M44 26 L76 26 L76 30 L44 30Z" fill="#c99a2a"/>
    <circle cx="60" cy="14" r="2.4" fill="#e8434b"/><circle cx="50" cy="23" r="1.6" fill="#4aa0e8"/><circle cx="70" cy="23" r="1.6" fill="#4aa0e8"/>
    <path d="M47 24 L60 11" stroke="#fff5b0" stroke-width="1" opacity="0.7"/>`,
  poseR: { handDX: 3, handDY: -8 },
  front: PROP.pole(83, 100, { top: 50, bot: 128, color: '#d4af37', w: 2.8 }) + PROP.orb(83, 46, '#5ab4ff', 5),
});

PEOPLE.alchemist = person({
  skin: SKIN.fair, eyes: '#3a8a7a',
  hair: { style: 'bob', color: '#5a3a6a' },
  face: { mouth: 'smile', lashes: true, blush: 0.3 },
  build: 'slim',
  outfit: { color: '#2e7a74', trim: '#1e5450', neck: 'collar', placket: true, button: '#c9a64a', belt: '#5a3a20',
            skirt: { to: Y.ankle - 6, wide: 20, color: '#28706a' } },
  sleeve: '#2e7a74', cuff: '#c9a64a',
  pants: '#3a3a4a', boots: '#3a2a20', tallBoots: false,
  overTorso: `${[-8, -2.5, 3].map((dx, i) => `<rect x="${CX + dx}" y="${Y.waist - 1}" width="4" height="7" rx="1.6" fill="${['#e8434b', '#6ad86a', '#6aa8ff'][i]}"/>`).join('')}`,
  hat: `<rect x="44" y="25" width="32" height="4.6" rx="2" fill="#4a3a2a"/>
    <circle cx="52" cy="26" r="5" fill="#8a6a3a"/><circle cx="52" cy="26" r="3.6" fill="#9fe8d8"/><circle cx="51" cy="25" r="1.2" fill="#fff"/>
    <circle cx="68" cy="26" r="5" fill="#8a6a3a"/><circle cx="68" cy="26" r="3.6" fill="#9fe8d8"/><circle cx="67" cy="25" r="1.2" fill="#fff"/>`,
  poseR: { handDX: 1, handDY: -14, elbowOut: 2 },
  front: `<path d="M77 82 L83 82 L83 88 L88 97 Q80 103 72 97 L77 88Z" fill="#c8f0ff" opacity="0.85"/>
    <path d="M73.6 95 Q80 100 86.6 95 L88 97 Q80 103 72 97Z" fill="#7ae87a"/>
    <rect x="76.6" y="79" width="6.8" height="3.4" rx="1" fill="#8a5a2e"/>
    <circle cx="78" cy="91" r="1" fill="#fff"/>`,
});

PEOPLE.gate_merchant = person({
  skin: SKIN.tan, eyes: '#3a2a1c',
  hair: { style: 'short', color: '#3a2618' },
  face: { mouth: 'smirk', patch: true },
  beard: { style: 'full', color: '#4a2e1a' },
  build: 'broad',
  behind: `<rect x="80" y="84" width="20" height="18" rx="2" fill="#8a5a2e"/><rect x="80" y="84" width="20" height="4" rx="1.6" fill="#a87444"/>
    <path d="M90 84 L90 102" stroke="#5a3a1e" stroke-width="1"/>`,
  outfit: { color: '#2e3e6a', trim: '#c9a64a', neck: 'v', belt: '#5a3a20', placket: true, button: '#c9a64a',
            skirt: { to: Y.knee + 6, wide: 21, color: '#28365e', hem: '#c9a64a' } },
  sleeve: '#2e3e6a', cuff: '#c9a64a', gloves: '#5a3a20',
  pants: '#4a3a2e', boots: '#3a2618',
  hat: `<path d="M34 32 Q60 20 86 32 Q80 36 60 34 Q40 36 34 32Z" fill="#3a2a1e"/>
    <path d="M44 32 C44 16 76 16 76 32Z" fill="#4a3624"/><path d="M44 30 L76 30" stroke="#c9a64a" stroke-width="2.2"/>
    <path d="M70 22 q8 -8 12 -4 q-6 2 -8 8Z" fill="#c43d32"/>`,
  poseL: { handDX: 2, handDY: -2 },
  front: `<g transform="rotate(-32 40 110)"><rect x="38.6" y="112" width="2.8" height="30" fill="#c8d0dc"/>
    <path d="M38.6 142 L40 147 L41.4 142Z" fill="#c8d0dc"/><rect x="34" y="109" width="12" height="3" rx="1" fill="#c9a64a"/>
    <rect x="38.4" y="101" width="3.2" height="8" fill="#5a3a20"/></g>`,
});

PEOPLE.witch = person({
  skin: SKIN.pale, eyes: '#7ae8a0',
  hair: { style: 'long', color: '#3a2a4e' },
  face: { lashes: true, mouth: 'smirk', lips: '#8a3a6a', narrow: true, blush: 0.14 },
  build: 'slim',
  outfit: { color: '#3e2658', trim: '#7a4ab4', neck: 'v',
            skirt: { to: FEET - 2, wide: 24, color: '#34204c', hem: '#7a4ab4' } },
  sleeve: '#3e2658', cuff: '#7a4ab4',
  pants: '#34204c', boots: '#241830', tallBoots: false,
  hat: `<path d="M32 30 Q60 22 88 30 Q84 35 60 33 Q36 35 32 30Z" fill="#2a1a3e"/>
    <path d="M42 30 C46 20 56 12 72 8 C67 14 72 20 76 30Z" fill="#34204c"/>
    <path d="M72 8 C67 14 72 20 76 30 L70 30 C68 20 67 14 72 8Z" fill="#241830"/>
    <path d="M43 28.4 Q60 24 76 28.4" stroke="#7a4ab4" stroke-width="2.2" fill="none"/>
    <path d="M62 26 l2 -3 l2 3" stroke="#c9f06a" stroke-width="1.2" fill="none"/>`,
  poseR: { handDX: 3, handDY: -7 },
  front: PROP.pole(83, 102, { top: 34, color: '#4a3a2a', w: 2.6 }) + PROP.orb(83, 30, '#6ae88a', 4.6),
  ground: `<path d="M18 138 Q16 152 30 154 Q44 152 42 138Z" fill="#2a2a32"/><ellipse cx="30" cy="138" rx="12" ry="3.4" fill="#3a3a44"/>
    <ellipse cx="30" cy="138" rx="10" ry="2.6" fill="#6ae88a"/><circle cx="26" cy="132" r="2" fill="#9af0b0" opacity="0.8"/><circle cx="33" cy="128" r="1.4" fill="#9af0b0" opacity="0.6"/>`,
});

PEOPLE.royal_smith = person({
  skin: SKIN.deep, eyes: '#2a1c12',
  hair: { style: 'short', color: '#1e1410' },
  face: { stern: true, thickBrow: true, mouth: 'flat' },
  beard: { style: 'full', color: '#241810' },
  build: 'stout',
  outfit: { color: '#243a6a', trim: '#d4af37', neck: 'collar', placket: true, button: '#d4af37', belt: '#3a2618',
            skirt: { to: Y.hip + 12, wide: 22, color: '#1e3260', hem: '#d4af37' } },
  sleeve: '#243a6a', cuff: '#d4af37', gloves: '#5a3a20',
  pants: '#3a3030', boots: '#241c18',
  hat: `<path d="M42 30 C42 16 78 16 78 30Z" fill="#1e3260"/><path d="M40 31 Q60 26 80 31" stroke="#d4af37" stroke-width="2.4" fill="none"/>
    <circle cx="60" cy="19" r="2.4" fill="#d4af37"/>`,
  front: PROP.hammerOnShoulder(86, 114),
});

module.exports = { PEOPLE, person, SKIN, PROP, tone };
