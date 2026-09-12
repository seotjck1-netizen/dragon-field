// 얼굴 부품 — 눈·눈썹·귀·머리띠·뾰족머리처럼 **여러 직업이 같이 쓰는 조각**.
//
// 왜 따로 있나: 0.70.7 에 용사·사냥꾼 얼굴을 드퀘풍으로 다시 그리면서, 같은 눈과
// 같은 머리띠를 두 직업이 쓰게 됐다. 그림(art-class.js)과 시안판(face-options.js)
// 양쪽에 같은 코드를 두면 한쪽만 고쳐진 채로 "시안과 게임이 다른" 상태가 된다.
// 그래서 조각은 여기 한 곳에만 둔다.
//
// ⚠ **자리(높이)를 먼저 정하고 그린다.** 시안 1차에서 띠를 y25~30 에 두르고
//   눈썹을 26.8 에 두었더니 띠가 눈썹을 통째로 덮었다. 드퀘풍 얼굴은
//   **이마가 보이는 것**이 핵심이라 층을 미리 갈라 둔다:
//     앞머리 끝 ≈19.5 · 머리띠 20.6~26.2 · 눈썹 28.4 · 눈 중심 39.6 · 코 47 · 입 52.6 · 턱 58.8
// ⚠ 눈썹과 눈 사이는 **2칸은 비운다.** 속눈썹 한 획이 눈 위로 ry 만큼 솟기 때문에
//   눈썹을 눈 중심에서 ry+2 보다 가깝게 두면 둘이 붙어 한 덩어리로 보인다.
// ⚠ **두 눈 사이는 눈 하나 너비만큼 벌린다.** 시안 2차에서 눈을 키우면서 자리를
//   그대로 두었더니 가운데로 몰려 사팔뜨기처럼 보였다. 눈을 키우면 반드시 벌린다.
// ⚠ 머리띠는 **머리 위가 아니라 이마 선**에 두른다 — 투구를 끼면 덮여야 한다.

const BROW_Y = 28.4;
const EYE_CY = 39.6;
const EYE_L = 39;   // 두 눈 중심
const EYE_R = 57;

// ── 아니메 눈 한 짝 ──────────────────────────────────────────
//
// 드퀘풍 얼굴에서 가장 크게 달라지는 것은 **눈**이다. 실사풍 눈은 가로로 길고
// 흰자가 좁은데, 아니메 눈은 세로로 크고 홍채가 눈을 거의 채우며 위쪽 속눈썹이
// 굵은 한 획으로 눌러 준다. 빛점을 **두 개**(큰 것 위, 작은 것 아래) 넣어야
// 눈이 젖어 보이고, 하나만 넣으면 유리구슬처럼 보인다.
//
// @param {number} cx,cy  눈 중심
// @param {number} rx,ry  흰자 반지름 (ry 를 키우면 어려 보인다)
// @param {string} iris   홍채색
// @param {number} dir    -1=왼눈 1=오른눈 (빛점과 눈꼬리 방향)
// @param {number} tilt   눈꼬리를 올리는 정도. 0=순함, 2.5=사납다
const eye = (cx, cy, rx, ry, iris, dir, tilt = 0) => {
  const pr = rx * 0.72;            // 홍채
  const pp = rx * 0.34;            // 동공
  const hi = cx - dir * rx * 0.34; // 큰 빛점
  return `
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fffdf6"/>
  <ellipse cx="${cx + dir * rx * 0.06}" cy="${cy + ry * 0.08}" rx="${pr}" ry="${ry * 0.86}" fill="${iris}"/>
  <ellipse cx="${cx + dir * rx * 0.06}" cy="${cy + ry * 0.08}" rx="${pr * 0.55}" ry="${ry * 0.55}" fill="#0e141f" opacity="0.55"/>
  <ellipse cx="${cx + dir * rx * 0.06}" cy="${cy + ry * 0.16}" rx="${pp}" ry="${ry * 0.44}" fill="#0b1018"/>
  <circle cx="${hi}" cy="${cy - ry * 0.42}" r="${rx * 0.33}" fill="#fff"/>
  <circle cx="${cx + dir * rx * 0.42}" cy="${cy + ry * 0.44}" r="${rx * 0.17}" fill="#fff" opacity="0.75"/>
  <!-- 위 속눈썹 — 굵은 한 획. 이게 없으면 눈이 그냥 동그라미가 된다 -->
  <path d="M${cx - rx * 1.06} ${cy - ry * 0.5}
           Q${cx} ${cy - ry * 1.46} ${cx + rx * 1.06} ${cy - ry * 0.5 - tilt}"
        stroke="#2a1a10" stroke-width="${rx * 0.4}" fill="none" stroke-linecap="round"/>
  <!-- 눈꼬리 한 획 -->
  <path d="M${cx + dir * rx * 1.0} ${cy - ry * 0.48} l${dir * rx * 0.46} ${-rx * 0.34 - tilt}"
        stroke="#2a1a10" stroke-width="${rx * 0.28}" fill="none" stroke-linecap="round"/>
  <!-- 아래 눈꺼풀 — 가늘게. 굵으면 화장한 얼굴이 된다 -->
  <path d="M${cx - rx * 0.8} ${cy + ry * 0.9} Q${cx} ${cy + ry * 1.1} ${cx + rx * 0.8} ${cy + ry * 0.88}"
        stroke="#a8703f" stroke-width="${rx * 0.16}" fill="none" stroke-linecap="round" opacity="0.7"/>`;
};

// 귀 — 드퀘풍 얼굴은 귀가 보인다. 얼굴 옆선(x 30 / 66)에 반쯤 붙인다.
const ears = (mid, dark) => `
  <path d="M30.6 35.4 q-3.4 -0.8 -3.2 3.4 q0.2 4.2 3.6 4.6 Z" fill="${mid}"/>
  <path d="M65.4 35.4 q3.4 -0.8 3.2 3.4 q-0.2 4.2 -3.6 4.6 Z" fill="${mid}"/>
  <path d="M29.6 37.6 q-0.6 1.8 0.6 3.4" stroke="${dark}" stroke-width="0.9" fill="none" opacity="0.7"/>
  <path d="M66.4 37.6 q0.6 1.8 -0.6 3.4" stroke="${dark}" stroke-width="0.9" fill="none" opacity="0.7"/>`;

// ── 금 문장 머리띠 ───────────────────────────────────────────
//
// ⚠ **머리 위가 아니라 이마 선에 두른다.** 투구를 끼면 덮여야 하기 때문이다
//   (사냥꾼의 가죽 띠와 같은 규칙 — art-class.js 주석 참고).
const band = (tone = 'leather', emblem = 'sun') => {
  const [a, b] = tone === 'red'
    ? ['#8f2b2b', '#c14a43']
    : tone === 'gold'
      ? ['#a8801f', '#e0b64a']
      : ['#5d4327', '#87643a'];
  const marks = {
    sun: `<circle cx="48" cy="23.0" r="3.2" fill="#f2c14e"/>
          <circle cx="48" cy="23.0" r="1.8" fill="#ffe9a8"/>
          <path d="M48 18.2 l0 -1.6M48 27.8 l0 1.6M43.2 23 l-1.6 0M52.8 23 l1.6 0
                   M44.7 19.7 l-1.1 -1.1M51.3 26.3 l1.1 1.1M51.3 19.7 l1.1 -1.1M44.7 26.3 l-1.1 1.1"
                stroke="#f2c14e" stroke-width="1.15" stroke-linecap="round"/>`,
    gem: `<path d="M48 19 l4 4 -4 4.4 -4 -4.4 Z" fill="#f2c14e"/>
          <path d="M48 19 l4 4 -4 0 Z" fill="#ffe9a8"/>
          <circle cx="46.8" cy="22.4" r="0.8" fill="#fff" opacity="0.9"/>`,
    wing: `<path d="M48 19.2 q5.4 0.6 8 4 q-5 -1.4 -8 -1.4 q-3 0 -8 1.4 q2.6 -3.4 8 -4 Z" fill="#f2c14e"/>
           <path d="M48 20.8 l0 5.4" stroke="#ffe9a8" stroke-width="1.7" stroke-linecap="round"/>`,
  }[emblem];
  return `
  <path d="M28.8 20.6 Q48 15.8 67.2 20.6 L66.6 26.2 Q48 21 29.4 26.2 Z" fill="${a}"/>
  <path d="M28.8 20.6 Q48 15.8 67.2 20.6 Q48 18.1 28.8 20.6 Z" fill="${b}"/>
  <path d="M33.8 22 l0 3.4M39.8 20.3 l0 3.6M56.2 20.3 l0 3.6M62.2 22 l0 3.4"
        stroke="#000" stroke-width="0.9" stroke-linecap="round" opacity="0.18"/>
  ${marks}`;
};

// ── 뾰족뾰족한 갈색 머리 ─────────────────────────────────────
//
// ⚠ 갈래 길이를 **모두 다르게** 한다. 똑같이 그으면 왕관이 된다
//   (art-class.js 에 같은 실수 기록이 있다).
// ⚠ 갈래 끝은 y≈22 에서 멎는다 — 그 아래가 이마이고, 머리띠 자리다.
//   양 끝(x 27 / 69)만 y 28 까지 내려와 관자놀이를 감싼다.
// @param {number} spike 갈래가 내려오는 깊이. 클수록 거칠다
// @param {number} top   정수리 높이. 작을수록 머리가 크고 어려 보인다
const spikes = (spike = 1, top = 7.6) => {
  const d = (base) => 13.2 + (base - 13.2) * spike; // 13.2 을 기준으로 갈래 길이를 늘린다
  return `M27 28 Q26 ${top + 1} 48 ${top} Q70 ${top + 1} 69 28`
    + ' Q68.2 20 66 15.4'
    + ` Q65 18 63.4 ${d(19.8)} Q62.2 15.8 60.8 13.2`
    + ` Q59.8 16.8 58 ${d(18.6)} Q56.8 14.6 55.4 12.4`
    + ` Q54 16 52.2 ${d(17.8)} Q50.8 13.8 49.4 12`
    + ` Q48.2 17.2 46.4 ${d(20.2)} Q45 14.8 43.6 12.4`
    + ` Q42.4 16 40.8 ${d(18)} Q39.4 14 38 12.6`
    + ` Q36.8 17 35 ${d(19.2)} Q33.6 14.8 32.2 13`
    + ` Q30.8 16 29.4 ${d(18)} Q28 16.6 27 28 Z`;
};

// 머릿결 — 갈래를 따라 흐르는 밝은 선. 통짜 갈색을 머리카락으로 만든다.
const hairFlow = (lit = '#b9854a', dark = '#5b3518') => `
  <path d="M46 10 Q40.5 12 37.5 16.5" stroke="${dark}" stroke-width="1.7" fill="none" opacity="0.5" stroke-linecap="round"/>
  <path d="M50 10 Q53 12.5 54.5 17" stroke="${dark}" stroke-width="1.7" fill="none" opacity="0.5" stroke-linecap="round"/>
  <path d="M43.5 11 Q38 13.5 34 17.5" stroke="${lit}" stroke-width="1.7" fill="none" opacity="0.7" stroke-linecap="round"/>
  <path d="M53.5 11 Q59.5 12.5 62.5 16" stroke="${lit}" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>
  <!-- 정수리 광택 한 줄 — 아니메 머리의 표시 -->
  <path d="M36 12.6 Q48 8.8 60 12.6" stroke="#e0b277" stroke-width="2.2" fill="none"
        opacity="0.45" stroke-linecap="round"/>`;

// 붉은 망토 — 어깨 뒤로 넘어간다. behind 에 넣어 몸보다 먼저 그린다.
const redCape = `
  <path d="M30 50 Q16 64 14 100 Q30 108 48 106 Q66 108 82 100 Q80 64 66 50
           Q58 56 48 56 Q38 56 30 50 Z" fill="#8d1f22"/>
  <path d="M30 50 Q18 64 16 98 Q30 104 48 102 Q66 104 80 98 Q78 64 66 50
           Q58 55 48 55 Q38 55 30 50 Z" fill="#b02a2a"/>
  <path d="M34 58 Q30 78 30 96M62 58 Q66 78 66 96" stroke="#7a1a1d" stroke-width="1.6"
        fill="none" opacity="0.6"/>
  <path d="M40 56 Q38 78 39 98" stroke="#cf4a42" stroke-width="1.4" fill="none" opacity="0.5"/>`;
// ════════════════════════════════════════════════════════════
//  공통 얼굴 조각
// ════════════════════════════════════════════════════════════

const jawRound =
  'M30 32 Q30 46 34 51.4 Q39 57.2 48 58.2 Q57 57.2 62 51.4 Q66 46 66 32 Q66 14 48 14 Q30 14 30 32 Z';
const jawSoft =
  'M30.6 32.4 Q30.6 46.6 35.6 52 Q41 58 48 58.8 Q55 58 60.4 52 Q65.4 46.6 65.4 32.4 Q65.4 14 48 14 Q30.6 14 30.6 32.4 Z';
const jawSquare =
  'M29.5 31 Q29.5 44.6 32.5 50.4 Q37 56.4 48 57.4 Q59 56.4 63.5 50.4 Q66.5 44.6 66.5 31 Q66.5 14.6 48 14.6 Q29.5 14.6 29.5 31 Z';

const noseSmall = `
  <path d="M47.2 45.6 Q49.2 48 47.4 49.2" stroke="#cd8f61" stroke-width="1.5" fill="none"
        stroke-linecap="round" opacity="0.75"/>`;
const noseStraight = `
  <path d="M47.6 44 L47 48.2" stroke="#cd8f61" stroke-width="2.3" fill="none" stroke-linecap="round" opacity="0.5"/>
  <path d="M45.9 48.8 q2.1 1.4 4.2 0" stroke="#a86a40" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;

const mouthFirm = `
  <path d="M43 52.8 L53 52.8" stroke="#8f4f36" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M44 54.2 q4 0.8 8 0" stroke="#c98a5c" stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.45"/>`;
const mouthSmile = `
  <path d="M43.4 52.2 q4.6 3 9.2 0" stroke="#8f4f36" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M43.4 52.2 q4.6 3 9.2 0 q-4.6 1 -9.2 0 Z" fill="#7a3c2a" opacity="0.35"/>`;

const brow = (c = '#3a2010', w = 2.7, y = BROW_Y, drop = 1.6) => `
  <path d="M33.8 ${y} L44.6 ${y + drop}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
  <path d="M62.2 ${y} L51.4 ${y + drop}" stroke="${c}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

const cheekShade = (c = '#c98a5c') => `
  <path d="M32 38 Q34.6 46.4 40 51" stroke="${c}" stroke-width="3" fill="none" opacity="0.22" stroke-linecap="round"/>
  <path d="M64 38 Q61.4 46.4 56 51" stroke="${c}" stroke-width="3" fill="none" opacity="0.22" stroke-linecap="round"/>`;

// 눈썹 위 흉터 — 지금 용사의 표식. 머리띠를 두르면 그 위로 올라간다.
const SCAR = `
  <path d="M63.2 30.4 l-2.6 -6.2" stroke="#e0a87c" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M61 26.6 l2.8 1.1" stroke="#e0a87c" stroke-width="1.3" stroke-linecap="round"/>`;
const SCAR_HIGH = `
  <path d="M64 22.4 l-2.6 -5.4" stroke="#e0a87c" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M62 19.2 l2.8 1.1" stroke="#e0a87c" stroke-width="1.2" stroke-linecap="round"/>`;

const RANGER_JAW =
  'M48 13 Q66 15 68 31 Q68 41 60 48 Q54 55 48 56 Q42 55 36 48 Q28 41 28 31 Q30 15 48 13 Z';
const RANGER_JAW_SOFT =
  'M48 13.6 Q66.4 16 67.4 33 Q67.4 44 60 50 Q54 56.6 48 57.6 Q42 56.6 36 50 Q28.6 44 28.6 33 Q29.6 16 48 13.6 Z';

const rangerCheek = `
  <path d="M32.6 37 Q36 45 42 49" stroke="#8d5528" stroke-width="3.2" fill="none" opacity="0.26" stroke-linecap="round"/>
  <path d="M63.4 37 Q60 45 54 49" stroke="#8d5528" stroke-width="3.2" fill="none" opacity="0.26" stroke-linecap="round"/>`;

// 얼굴 문양 — 사냥꾼을 한눈에 알아보게 하는 표식. 시안마다 양을 달리 준다.
const warPaintFull = `
  <path d="M33.4 33.6 l0 11" stroke="#7a2f2f" stroke-width="2.1" stroke-linecap="round" opacity="0.85"/>
  <path d="M36.6 35 l0 8" stroke="#7a2f2f" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
  <path d="M62.6 33.6 l0 11" stroke="#7a2f2f" stroke-width="2.1" stroke-linecap="round" opacity="0.85"/>
  <path d="M59.4 35 l0 8" stroke="#7a2f2f" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>`;
const warPaintCheek = `
  <path d="M32.8 45.6 q4 1.6 7.6 0.6" stroke="#7a2f2f" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
  <path d="M63.2 45.6 q-4 1.6 -7.6 0.6" stroke="#7a2f2f" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`;

const rangerMouth = `
  <path d="M42.8 53 q5.2 1.5 10.4 0" stroke="#7a4030" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
const rangerNose = `
  <path d="M47.6 45 Q50 48 48.8 49.6" stroke="#b0713c" stroke-width="1.8" fill="none"
        stroke-linecap="round" opacity="0.6"/>
  <path d="M45.8 50 q2.4 1.8 4.6 0.2" stroke="#8d5528" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;

const rangerSideHair =
  ' M29.6 28 Q28.6 33 30.1 37 Q31.6 32 31.6 27 Z M66.4 28 Q67.4 33 65.9 37 Q64.4 32 64.4 27 Z';
// 옆을 밀고 위만 남긴 머리 — 지금 사냥꾼의 머리. 이마 선이 y≈21 에서 멎게 올렸다.
const rangerShort =
  'M29.6 28 Q30.6 11 48 10 Q65.4 11 66.4 28 Q63.4 19.6 57 17.4 Q52 19.6 48 18.6 Q44 19.6 39 17.4 Q32.6 19.6 29.6 28 Z'
  + rangerSideHair;

const FEATHERS = `
  <path d="M28.6 26 Q21.6 32 19.6 42 Q25.6 37 29.6 30 Z" fill="#a8452f"/>
  <path d="M28.6 26 Q23.6 32 21.6 40" stroke="#d6785c" stroke-width="1" fill="none" opacity="0.9"/>
  <path d="M30.1 29 Q24.6 35 23.6 44 Q28.6 39 31.6 33 Z" fill="#e8eef7" opacity="0.85"/>
  <path d="M30.1 29 Q26.1 35 25.1 42" stroke="#aebccf" stroke-width="0.9" fill="none"/>`;

module.exports = {
  BROW_Y, EYE_CY, EYE_L, EYE_R,
  eye, ears, band, spikes, hairFlow, redCape,
  jawRound, jawSoft, jawSquare,
  noseSmall, noseStraight, mouthFirm, mouthSmile, brow, cheekShade, SCAR, SCAR_HIGH,
  RANGER_JAW, RANGER_JAW_SOFT, rangerCheek, warPaintFull, warPaintCheek,
  rangerMouth, rangerNose, rangerSideHair, rangerShort, FEATHERS,
};
