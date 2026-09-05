// 마을 타일 / NPC / 추가 몬스터·보스 / 상위 아이템 아트.
// gen-assets.js 가 이 파일을 읽어 함께 굽는다. (게임 실행과 무관)

const grassBase = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5fbf5a"/><stop offset="1" stop-color="#3d9440"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#g)"/>
  <path d="M4 26q2-5 4 0M12 21q2-5 4 0M22 27q2-5 4 0M26 14q2-5 4 0M8 12q2-5 4 0M17 8q2-5 4 0"
        stroke="#7ad46f" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>`;

const t = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;

// ---------------- 마을/성 타일 ----------------
const TOWN_TILES = {
  brick: t(`
    <rect width="32" height="32" fill="#b9a894"/>
    <g stroke="#9c8b78" stroke-width="1.2">
      <path d="M0 10.5h32M0 21.5h32"/>
      <path d="M8 0v10.5M24 0v10.5M16 10.5V21.5M0 21.5v10.5M16 21.5V32M32 21.5v10.5"/>
    </g>
    <rect x="1" y="1" width="6" height="8" fill="#c9b8a3" opacity="0.5"/>
    <rect x="17" y="12" width="6" height="8" fill="#c9b8a3" opacity="0.4"/>`),

  house_wall: t(`
    <rect width="32" height="32" fill="#e3d3b4"/>
    <rect y="0" width="32" height="3" fill="#c9b795"/>
    <g stroke="#8a6a45" stroke-width="2.4">
      <path d="M4 3v29M28 3v29"/><path d="M4 17h24"/>
    </g>
    <rect x="9" y="6" width="14" height="9" rx="1.5" fill="#6fa8d4" stroke="#8a6a45" stroke-width="2"/>
    <path d="M16 6v9M9 10.5h14" stroke="#8a6a45" stroke-width="1.6"/>`),

  house_roof: t(`
    <rect width="32" height="32" fill="#a8443c"/>
    <g fill="#c2564c">
      <rect x="0" y="0" width="32" height="8" rx="2"/>
      <rect x="0" y="11" width="32" height="8" rx="2"/>
      <rect x="0" y="22" width="32" height="8" rx="2"/>
    </g>
    <g fill="#8c322c" opacity="0.6">
      <rect x="0" y="8" width="32" height="3"/><rect x="0" y="19" width="32" height="3"/>
    </g>`),

  door: t(`
    <rect width="32" height="32" fill="#e3d3b4"/>
    <rect x="5" y="4" width="22" height="28" rx="3" fill="#7a4a22"/>
    <rect x="8" y="7" width="16" height="25" rx="2" fill="#96602d"/>
    <path d="M16 7v25" stroke="#7a4a22" stroke-width="1.6"/>
    <circle cx="21" cy="20" r="1.8" fill="#ffd166"/>`),

  castle_wall: t(`
    <rect width="32" height="32" fill="#8f93a6"/>
    <g stroke="#767b90" stroke-width="1.4">
      <path d="M0 10.5h32M0 21.5h32"/>
      <path d="M10 0v10.5M22 10.5v11M4 21.5v10.5M26 21.5v10.5"/>
    </g>
    <rect x="1" y="1" width="8" height="8.5" fill="#a3a7b8" opacity="0.6"/>
    <rect x="12" y="12" width="9" height="8.5" fill="#a3a7b8" opacity="0.5"/>`),

  castle_top: t(`
    <rect width="32" height="32" fill="#8f93a6"/>
    <rect x="0" y="0" width="7" height="12" fill="#a3a7b8"/>
    <rect x="12" y="0" width="8" height="12" fill="#a3a7b8"/>
    <rect x="25" y="0" width="7" height="12" fill="#a3a7b8"/>
    <rect x="0" y="12" width="32" height="4" fill="#767b90"/>
    <g stroke="#767b90" stroke-width="1.4"><path d="M0 24h32M8 16v8M20 24v8"/></g>`),

  castle_gate: t(`
    <rect width="32" height="32" fill="#8f93a6"/>
    <path d="M6 32V14a10 10 0 0 1 20 0v18Z" fill="#3a2c1e"/>
    <path d="M9 32V15a7 7 0 0 1 14 0v17Z" fill="#5d3f22"/>
    <g stroke="#3a2c1e" stroke-width="1.4">
      <path d="M16 8v24M9 18h14M9 25h14"/>
    </g>
    <circle cx="12" cy="21.5" r="1.4" fill="#ffd166"/>
    <circle cx="20" cy="21.5" r="1.4" fill="#ffd166"/>`),

  castle_floor: t(`
    <rect width="32" height="32" fill="#5b5f74"/>
    <g stroke="#4a4e60" stroke-width="1.4"><path d="M0 16h32M16 0v32"/></g>
    <rect x="2" y="2" width="12" height="12" fill="#686d84" opacity="0.7"/>
    <rect x="18" y="18" width="12" height="12" fill="#686d84" opacity="0.7"/>`),

  fence: t(`
    ${grassBase}
    <g fill="#8b5a2b">
      <rect x="4" y="8" width="4" height="20" rx="1.6"/>
      <rect x="24" y="8" width="4" height="20" rx="1.6"/>
      <rect x="0" y="12" width="32" height="3.4" rx="1.6"/>
      <rect x="0" y="20" width="32" height="3.4" rx="1.6"/>
    </g>
    <g fill="#a3702f" opacity="0.7">
      <rect x="4" y="8" width="1.6" height="20"/><rect x="24" y="8" width="1.6" height="20"/>
    </g>`),

  gate_exit: t(`
    <rect width="32" height="32" fill="#c8a878"/>
    <circle cx="7" cy="9" r="1.6" fill="#b08f60" opacity="0.7"/>
    <circle cx="24" cy="22" r="1.5" fill="#b08f60" opacity="0.6"/>
    <g fill="#6b4423">
      <rect x="2" y="2" width="5" height="28" rx="2"/>
      <rect x="25" y="2" width="5" height="28" rx="2"/>
      <rect x="0" y="1" width="32" height="6" rx="2.5"/>
    </g>
    <path d="M13 12l6 6-6 6" stroke="#ffd166" stroke-width="3" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>`),

  signpost: t(`
    ${grassBase}
    <rect x="14" y="12" width="4" height="18" rx="1.6" fill="#6b4423"/>
    <rect x="3" y="6" width="26" height="11" rx="2.5" fill="#a3702f"/>
    <rect x="5" y="8" width="22" height="7" rx="1.5" fill="#d8b98a"/>
    <g stroke="#6b4423" stroke-width="1.4" stroke-linecap="round">
      <path d="M8 10.5h10M8 13h14"/>
    </g>`),
};

// ---------------- NPC 공통 템플릿 (96x128) ----------------
//
// 예전에는 모두 같은 얼굴에 옷 색만 달랐다. 그래서 누가 누군지 소품으로만 구분됐다.
// 지금은 눈·눈썹·수염·주름·나이를 골라 조합한다 — 얼굴만 봐도 직업이 보이게.
//
//   eyes  : 'round'(순한) | 'sharp'(매서운) | 'narrow'(가늘게 뜬) | 'tired'(피곤한) | 'lash'(속눈썹)
//   age   : 'child' | 'adult' | 'old'
//   beard : 'none' | 'stubble' | 'short' | 'full' | 'long'
//
// 몸 크기는 build 로 조절한다 — 대장장이는 떡 벌어지게, 아이는 작게.

/** 눈 한 쌍. cx 두 개를 받아 좌우 대칭으로 그린다. */
function eyesOf(kind, browColor, eyeColor = '#2a2118', cy = 36) {
  const L = 40;
  const R = 56;
  const white = '#fdf8f0';
  const pair = (fn) => fn(L, 1) + fn(R, -1);

  if (kind === 'sharp') {
    return `
  ${pair((x) => `<path d="M${x - 5} ${cy} q5 -3.4 10 0 q-5 4.4 -10 0 Z" fill="${white}"/>`)}
  ${pair((x) => `<circle cx="${x + 0.4}" cy="${cy + 0.2}" r="2.5" fill="${eyeColor}"/>`)}
  ${pair((x) => `<circle cx="${x - 0.5}" cy="${cy - 0.9}" r="0.9" fill="#fff"/>`)}
  ${pair((x) => `<path d="M${x - 5} ${cy - 0.6} q5 -3.2 10 0" stroke="#3a2c1c" stroke-width="1.5" fill="none" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 6 * s} ${cy - 6} q${6 * s} -3.6 ${12 * s} 0.6" stroke="${browColor}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`)}`;
  }
  if (kind === 'narrow') {
    return `
  ${pair((x) => `<path d="M${x - 4.6} ${cy} q4.6 -2.4 9.2 0 q-4.6 3 -9.2 0 Z" fill="${white}"/>`)}
  ${pair((x) => `<circle cx="${x + 0.3}" cy="${cy}" r="2.2" fill="${eyeColor}"/>`)}
  ${pair((x) => `<circle cx="${x - 0.6}" cy="${cy - 0.8}" r="0.8" fill="#fff"/>`)}
  ${pair((x) => `<path d="M${x - 4.6} ${cy - 0.4} q4.6 -2.6 9.2 0" stroke="#3a2c1c" stroke-width="1.4" fill="none" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 5.6 * s} ${cy - 6.4} q${5.6 * s} -2.6 ${11.2 * s} 0.6" stroke="${browColor}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`)}`;
  }
  if (kind === 'tired') {
    return `
  ${pair((x) => `<ellipse cx="${x}" cy="${cy}" rx="4.4" ry="4.6" fill="${white}"/>`)}
  ${pair((x) => `<circle cx="${x}" cy="${cy + 0.5}" r="2.8" fill="${eyeColor}"/>`)}
  ${pair((x) => `<circle cx="${x - 1}" cy="${cy - 1}" r="1.1" fill="#fff"/>`)}
  ${pair((x) => `<path d="M${x - 4.4} ${cy - 1.6} q4.4 -2.6 8.8 0" stroke="#3a2c1c" stroke-width="1.6" fill="none" stroke-linecap="round"/>`)}
  ${pair((x) => `<path d="M${x - 4} ${cy + 5.4} q4 1.6 8 0" stroke="#a98b6e" stroke-width="1.4" fill="none" opacity="0.85" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 5 * s} ${cy - 7} q${5 * s} -1.6 ${10 * s} 0.4" stroke="${browColor}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`)}`;
  }
  if (kind === 'lash') {
    return `
  ${pair((x) => `<ellipse cx="${x}" cy="${cy}" rx="4.8" ry="5.6" fill="${white}"/>`)}
  ${pair((x) => `<ellipse cx="${x + 0.3}" cy="${cy + 0.3}" rx="3.6" ry="4.5" fill="${eyeColor}"/>`)}
  ${pair((x) => `<ellipse cx="${x + 0.3}" cy="${cy + 0.7}" rx="2" ry="2.7" fill="#241a2e"/>`)}
  ${pair((x) => `<circle cx="${x - 1.2}" cy="${cy - 2}" r="1.6" fill="#fff"/>`)}
  ${pair((x) => `<path d="M${x - 5} ${cy - 2.6} q5 -4.2 10 0" stroke="#4a3242" stroke-width="1.9" fill="none" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 5.2 * s} ${cy - 3} l${-2.2 * s} -1.8" stroke="#4a3242" stroke-width="1.4" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 5.4 * s} ${cy - 7.6} q${5.4 * s} -3.2 ${10.8 * s} -0.4" stroke="${browColor}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`)}`;
  }
  // round — 순하고 둥근 눈 (기본)
  return `
  ${pair((x) => `<ellipse cx="${x}" cy="${cy}" rx="4.4" ry="5" fill="${white}"/>`)}
  ${pair((x) => `<circle cx="${x + 0.2}" cy="${cy + 0.4}" r="3" fill="${eyeColor}"/>`)}
  ${pair((x) => `<circle cx="${x - 1}" cy="${cy - 1.2}" r="1.3" fill="#fff"/>`)}
  ${pair((x) => `<path d="M${x - 4.4} ${cy - 2.4} q4.4 -3.4 8.8 0" stroke="#3a2c1c" stroke-width="1.7" fill="none" stroke-linecap="round"/>`)}
  ${pair((x, s) => `<path d="M${x - 5.2 * s} ${cy - 7.4} q${5.2 * s} -3 ${10.4 * s} 0" stroke="${browColor}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`)}`;
}

/** 수염. 턱을 감싸는 모양이 다르다. */
function beardOf(kind, c1, c2) {
  if (kind === 'stubble') {
    return `<path d="M34 41 Q48 55 62 41 Q61 52 48 54 Q35 52 34 41 Z" fill="${c1}" opacity="0.22"/>`;
  }
  if (kind === 'short') {
    return `
  <path d="M33 41 Q34 54 48 57 Q62 54 63 41 Q59 51 48 52 Q37 51 33 41 Z" fill="${c1}"/>
  <path d="M36 45 Q37 52 48 55 Q59 52 60 45 Q56 51 48 52 Q40 51 36 45 Z" fill="${c2}" opacity="0.9"/>`;
  }
  if (kind === 'full') {
    return `
  <path d="M30 38 Q30 60 48 65 Q66 60 66 38 Q60 51 48 52 Q36 51 30 38 Z" fill="${c1}"/>
  <path d="M33 43 Q34 58 48 62 Q62 58 63 43 Q57 52 48 53 Q39 52 33 43 Z" fill="${c2}" opacity="0.85"/>
  <path d="M38 46 q4 8 10 9 q6 -1 10 -9" stroke="${c1}" stroke-width="1" fill="none" opacity="0.55"/>`;
  }
  if (kind === 'long') {
    return `
  <path d="M29 37 Q28 62 48 76 Q68 62 67 37 Q60 52 48 53 Q36 52 29 37 Z" fill="${c1}"/>
  <path d="M33 42 Q33 60 48 71 Q63 60 63 42 Q57 53 48 54 Q39 53 33 42 Z" fill="${c2}" opacity="0.85"/>
  <path d="M40 50 q4 14 8 20 q4 -6 8 -20" stroke="${c1}" stroke-width="1.2" fill="none" opacity="0.5"/>`;
  }
  return '';
}

/**
 * NPC 한 명.
 * @param {object} o
 * @param {string} o.id        그라디언트 id 충돌 방지
 * @param {'round'|'sharp'|'narrow'|'tired'|'lash'} [o.eyes]
 * @param {'child'|'adult'|'old'} [o.age]
 * @param {'none'|'stubble'|'short'|'full'|'long'} [o.beard]
 * @param {number} [o.build]   몸 폭 배율 (1 = 보통, 1.25 = 떡 벌어짐, 0.8 = 아이)
 * @param {string} [o.moustache] 콧수염 색(주면 그린다)
 * @param {string} [o.mouth]   입 모양 override
 * @param {string} [o.faceMark] 얼굴에 덧그릴 것(검댕·주근깨·고글)
 */
function person({
  id, skin = '#f7cfa6', skinDark = null, hair = '#5e3a17', hair2 = '#8b5a2b',
  top, top2, bottom = '#3a2a1c', prop = '', hat = '', hairShape = null,
  eyes = 'round', age = 'adult', beard = 'none', beardColor = null,
  moustache = null, brow = null, eyeColor = '#2a2118', mouth = null,
  faceMark = '', build = 1, blush = 0.4, behind = '',
}) {
  const child = age === 'child';
  const old = age === 'old';
  const dark = skinDark || '#c9926a';
  const browC = brow || hair;
  const bc1 = beardColor || hair;
  const bc2 = beardColor ? beardColor : hair2;

  // 몸 폭 — 어깨선과 팔 위치가 build 로 벌어진다
  const bw = 16 * build;
  const L = 48 - bw;
  const R = 48 + bw;
  const armX = [30 - bw * 0.5, 66 + bw * 0.5 - 11];
  const headY = child ? 36 : 34;
  const headR = child ? [19.5, 19] : [21, 20];
  const eyeCy = child ? 39 : 36;
  const legY = child ? 100 : 96;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="top_${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${top2}"/>
    </linearGradient>
    <linearGradient id="hair_${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${hair2}"/><stop offset="1" stop-color="${hair}"/>
    </linearGradient>
    <radialGradient id="face_${id}" cx="0.42" cy="0.36" r="0.8">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="0.72" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="${dark}" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="rim_${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.3"/>
      <stop offset="0.6" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <ellipse cx="48" cy="118" rx="${18 * build}" ry="4.6" fill="#000" opacity="0.20"/>
  ${behind}
  <rect x="${41 - 5}" y="${legY}" width="10" height="${114 - legY}" rx="4" fill="${bottom}"/>
  <rect x="${55 - 5}" y="${legY}" width="10" height="${114 - legY}" rx="4" fill="${bottom}"/>
  <ellipse cx="41" cy="115" rx="7.5" ry="4.5" fill="#241a11"/>
  <ellipse cx="55" cy="115" rx="7.5" ry="4.5" fill="#241a11"/>
  <ellipse cx="41" cy="113.8" rx="7" ry="3.8" fill="#3d2c1c"/>
  <ellipse cx="55" cy="113.8" rx="7" ry="3.8" fill="#3d2c1c"/>

  <!-- 팔 (몸통보다 먼저 — 어깨가 옷 밑으로 들어간다) -->
  <rect x="${armX[0]}" y="56" width="11" height="34" rx="5.5" fill="${top2}"/>
  <rect x="${armX[1]}" y="56" width="11" height="34" rx="5.5" fill="${top2}"/>
  <rect x="${armX[0]}" y="56" width="4" height="34" rx="2" fill="#fff" opacity="0.14"/>
  <rect x="${armX[1] + 7}" y="56" width="4" height="34" rx="2" fill="#000" opacity="0.12"/>
  <circle cx="${armX[0] + 5.5}" cy="90" r="6" fill="${skin}"/>
  <circle cx="${armX[1] + 5.5}" cy="90" r="6" fill="${skin}"/>
  <circle cx="${armX[0] + 4.4}" cy="88.8" r="3.6" fill="#fff" opacity="0.28"/>
  <circle cx="${armX[1] + 4.4}" cy="88.8" r="3.6" fill="#fff" opacity="0.28"/>

  <!-- 상의 -->
  <path d="M${L} 56 Q${L - 2} 52 ${L + 4} 50 L${R - 4} 50 Q${R + 2} 52 ${R} 56 L${R + 2} ${legY + 2} Q48 ${legY + 8} ${L - 2} ${legY + 2} Z" fill="url(#top_${id})"/>
  <path d="M${L} 56 Q48 62 ${R} 56 L${R} 66 Q48 72 ${L} 66 Z" fill="url(#rim_${id})"/>
  <path d="M${L + 4} 74 Q48 79 ${R - 4} 74" stroke="#000" stroke-width="1.2" fill="none" opacity="0.14"/>
  ${prop}

  <!-- 목 -->
  <rect x="43" y="${headY + 10}" width="10" height="8" rx="4" fill="${dark}"/>

  <!-- 얼굴 -->
  <ellipse cx="48" cy="${headY}" rx="${headR[0]}" ry="${headR[1]}" fill="${skin}"/>
  <ellipse cx="48" cy="${headY}" rx="${headR[0]}" ry="${headR[1]}" fill="url(#face_${id})"/>
  ${old ? `
  <path d="M36 ${headY - 10} q12 -2 24 0" stroke="${dark}" stroke-width="1.2" fill="none" opacity="0.5"/>
  <path d="M38 ${headY - 13.5} q10 -1.6 20 0" stroke="${dark}" stroke-width="1" fill="none" opacity="0.35"/>
  <path d="M33.5 ${headY + 3.5} l-2 2M62.5 ${headY + 3.5} l2 2" stroke="${dark}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M38 ${headY + 12} q4 2 8 0" stroke="${dark}" stroke-width="1" fill="none" opacity="0.4"/>` : ''}
  <!-- 머리카락 -->
  <path d="${hairShape || `M27 ${headY - 2} Q30 ${headY - 26} 48 ${headY - 26} Q66 ${headY - 26} 69 ${headY - 2} Q60 ${headY - 12} 48 ${headY - 10} Q36 ${headY - 12} 27 ${headY - 2} Z`}" fill="url(#hair_${id})"/>
  ${hat}
  ${eyesOf(eyes, browC, eyeColor, eyeCy)}
  <!-- 코 -->
  <path d="M47.4 ${eyeCy + 2.4} L46.6 ${eyeCy + 6.4}" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.45"/>
  <path d="M46.2 ${eyeCy + 7} q1.8 1.3 3.6 0" stroke="${dark}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  ${beardOf(beard, bc1, bc2)}
  ${moustache ? `
  <path d="M40.5 ${eyeCy + 9.4} q7.5 -2.2 15 0 q-2.8 3.8 -7.5 3.8 q-4.7 0 -7.5 -3.8 Z" fill="${moustache}"/>` : ''}
  ${mouth || `<path d="M43 ${eyeCy + 10.5} q5 3.6 10 0" stroke="#a35b3e" stroke-width="1.9" fill="none" stroke-linecap="round"/>`}
  ${blush ? `
  <ellipse cx="34" cy="${eyeCy + 5}" rx="4" ry="2.8" fill="#ff9c9c" opacity="${blush}"/>
  <ellipse cx="62" cy="${eyeCy + 5}" rx="4" ry="2.8" fill="#ff9c9c" opacity="${blush}"/>` : ''}
  ${faceMark}
</svg>`;
}

const NPCS = {
  // 잡화상 마르타 — 넉넉한 아주머니. 두건, 앞치마, 늘 웃는 눈.
  npc_shopkeeper: person({
    id: 'shop', top: '#79c36a', top2: '#4a8f45', hair: '#4a2f14', hair2: '#7a4f22',
    eyes: 'round', blush: 0.55, brow: '#4a2f14', build: 1.05,
    mouth: `<path d="M41.5 46 q6.5 5.4 13 0 q-6.5 2.6 -13 0 Z" fill="#8f4436"/>
            <path d="M41.5 46 q6.5 5.4 13 0" stroke="#8f4436" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 머리 두건 -->
          <path d="M25 30 Q28 12 48 11 Q68 12 71 30 L68 33 Q60 21 48 21 Q36 21 28 33 Z" fill="#c9503f"/>
          <path d="M25 30 Q28 14 48 13 Q68 14 71 30 Q48 20 25 30 Z" fill="#e06a56"/>
          <path d="M30 20 q9 -4 18 -3.6" stroke="#f08c78" stroke-width="1.8" fill="none" opacity="0.8"/>
          <path d="M26 30 Q18 34 17 42 Q24 38 28 34 Z" fill="#c9503f"/>`,
    prop: `<!-- 앞치마 -->
           <path d="M36 62 L60 62 L63 96 Q48 101 33 96 Z" fill="#f0e6cf"/>
           <path d="M36 62 L60 62 L60.6 68 L35.4 68 Z" fill="#d9cbab"/>
           <path d="M42 60 L48 66 L54 60" stroke="#d9cbab" stroke-width="2" fill="none"/>
           <!-- 안고 있는 사과 바구니 -->
           <rect x="34" y="72" width="28" height="17" rx="4" fill="#c89a5e"/>
           <path d="M34 78 h28M40 72 v17M48 72 v17M56 72 v17" stroke="#a3702f" stroke-width="1.4"/>
           <rect x="33" y="70" width="30" height="5" rx="2.5" fill="#a3702f"/>
           <circle cx="42" cy="68" r="5" fill="#e0503f"/><circle cx="41" cy="66.4" r="1.6" fill="#ff9c8c"/>
           <circle cx="54" cy="67" r="5" fill="#ffd166"/><circle cx="53" cy="65.4" r="1.6" fill="#fff0b8"/>`,
  }),

  // 대장장이 고르드 — 떡 벌어진 어깨, 시커먼 수염, 볼에 그을음.
  npc_blacksmith: person({
    id: 'forge', skin: '#dda36f', skinDark: '#a8703f',
    top: '#8c3b2f', top2: '#5e2620', hair: '#241611', hair2: '#4a2c18',
    bottom: '#4a3a2a', build: 1.3, eyes: 'sharp', beard: 'full',
    beardColor: '#241611', brow: '#241611', blush: 0,
    mouth: `<path d="M42 47 q6 2.4 12 0" stroke="#6e3226" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 붉은 두건 -->
          <path d="M25 26 Q48 11 71 26 L71 32 Q48 19 25 32 Z" fill="#d94f45"/>
          <rect x="24" y="25.5" width="48" height="6.5" rx="3" fill="#b03a32"/>
          <path d="M30 20 q9 -4 18 -3" stroke="#ef6f63" stroke-width="1.8" fill="none" opacity="0.75"/>
          <path d="M24 28 Q16 32 15 40 Q22 36 26 32 Z" fill="#b03a32"/>`,
    faceMark: `<!-- 그을음 -->
               <ellipse cx="62" cy="41" rx="5" ry="3" fill="#3a2b22" opacity="0.42" transform="rotate(-18 62 41)"/>
               <ellipse cx="34" cy="30" rx="3.6" ry="2.2" fill="#3a2b22" opacity="0.32" transform="rotate(14 34 30)"/>`,
    prop: `<!-- 가죽 앞치마 -->
           <path d="M35 60 L61 60 L64 97 Q48 102 32 97 Z" fill="#6b4526"/>
           <path d="M35 60 L61 60 L61.6 67 L34.4 67 Z" fill="#8a5c33"/>
           <path d="M41 58 L48 65 L55 58" stroke="#8a5c33" stroke-width="2.4" fill="none"/>
           <circle cx="40" cy="72" r="2" fill="#c9a06a"/><circle cx="56" cy="72" r="2" fill="#c9a06a"/>
           <!-- 어깨에 멘 망치 -->
           <g transform="rotate(-24 74 74)">
             <rect x="70" y="46" width="6.5" height="44" rx="3" fill="#7a4a22"/>
             <rect x="70" y="46" width="2.6" height="44" rx="1.3" fill="#9c6435"/>
             <rect x="59" y="38" width="28" height="17" rx="4" fill="#7d879a"/>
             <rect x="59" y="38" width="28" height="6" rx="3" fill="#a7b1c1"/>
             <rect x="59" y="50" width="28" height="5" rx="2.5" fill="#5d6577"/>
           </g>`,
  }),

  // 여관 주인 리사 — 쪽진 머리, 앞치마, 갓 구운 빵.
  npc_innkeeper: person({
    id: 'inn', top: '#a97bd4', top2: '#7245a1', hair: '#a8761f', hair2: '#e0be6a',
    eyes: 'lash', eyeColor: '#4a7a52', brow: '#a8761f', blush: 0.5,
    hairShape: 'M27 32 Q30 8 48 8 Q66 8 69 32 Q62 18 48 20 Q34 18 27 32 Z',
    hat: `<!-- 뒤로 묶은 쪽머리 -->
          <ellipse cx="48" cy="9" rx="11" ry="8" fill="#c9a34e"/>
          <ellipse cx="48" cy="8" rx="9" ry="6" fill="#e0be6a"/>
          <path d="M41 9 q7 -4 14 0" stroke="#a8761f" stroke-width="1.4" fill="none"/>
          <path d="M30 24 q8 -6 18 -6" stroke="#f0d68f" stroke-width="2" fill="none" opacity="0.8"/>`,
    mouth: `<path d="M42 46.4 q6 4.6 12 0 q-6 2.2 -12 0 Z" fill="#a04a58"/>
            <path d="M42 46.4 q6 4.6 12 0" stroke="#a04a58" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    prop: `<!-- 앞치마 -->
           <path d="M36 62 L60 62 L62 96 Q48 101 34 96 Z" fill="#f6efe0"/>
           <path d="M42 60 L48 66 L54 60" stroke="#ddd2ba" stroke-width="2" fill="none"/>
           <!-- 들고 있는 빵 쟁반 -->
           <rect x="33" y="74" width="30" height="5" rx="2.5" fill="#8b5a2b"/>
           <ellipse cx="40" cy="71" rx="6" ry="4" fill="#d9a45e"/>
           <ellipse cx="40" cy="70" rx="5" ry="3" fill="#efc07a"/>
           <ellipse cx="52" cy="70.5" rx="6.5" ry="4.2" fill="#d9a45e"/>
           <ellipse cx="52" cy="69.5" rx="5.4" ry="3.2" fill="#efc07a"/>
           <path d="M37 69 l6 0M49 68.6 l6 0" stroke="#b57c3c" stroke-width="1.2"/>`,
  }),

  // 마을 주민 — 평범한 젊은이. (촌장·아이는 따로 그린다)
  npc_villager: person({
    id: 'vil', top: '#e0b45c', top2: '#b08733', hair: '#241a11', hair2: '#3d2b18',
    eyes: 'round', blush: 0.4, beard: 'stubble', beardColor: '#241a11',
    prop: `<path d="M38 62 L58 62 L59 92 Q48 96 37 92 Z" fill="#c9b48c" opacity="0.5"/>`,
  }),

  // 촌장 하렌 — 나이 든 사람. 흰 수염, 벗어진 머리, 지팡이.
  npc_elder: person({
    id: 'eld', skin: '#e8c8a4', skinDark: '#b9946f',
    top: '#6f6350', top2: '#4a4238', bottom: '#3a352c',
    hair: '#c9c9c9', hair2: '#f0f0f0', age: 'old', eyes: 'narrow',
    beard: 'long', beardColor: '#e8e8e8', brow: '#d8d8d8', blush: 0.18,
    // 정수리는 벗어지고 옆머리만 남았다
    hairShape: 'M26 34 Q26 22 32 17 Q30 26 31 34 Z M70 34 Q70 22 64 17 Q66 26 65 34 Z',
    mouth: `<path d="M44 47.4 q4 1.6 8 0" stroke="#8a5a48" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    prop: `<!-- 지팡이 -->
           <rect x="70" y="26" width="6" height="76" rx="3" fill="#7a5230"/>
           <rect x="70" y="26" width="2.4" height="76" rx="1.2" fill="#9c6b3d"/>
           <path d="M70 30 Q64 22 70 16 Q78 18 76 26 Z" fill="#8b5a2b"/>
           <circle cx="73" cy="20" r="3.4" fill="#7cc4ff" opacity="0.85"/>
           <!-- 어깨에 두른 숄 -->
           <path d="M30 56 Q48 68 66 56 L68 74 Q48 84 28 74 Z" fill="#8a7a62"/>
           <path d="M30 58 Q48 69 66 58" stroke="#a89881" stroke-width="2" fill="none"/>`,
  }),

  // 마을 아이 — 머리가 크고 몸이 작다. 주근깨, 나무칼.
  npc_kid: person({
    id: 'kid', skin: '#fcdcbc', skinDark: '#d9a97f',
    top: '#6fb8e0', top2: '#3f86ad', bottom: '#5a4a34',
    hair: '#a3651f', hair2: '#d09040', age: 'child', build: 0.78,
    eyes: 'round', blush: 0.6, brow: '#a3651f',
    hairShape: 'M28 36 Q30 12 48 11 Q66 12 68 36 Q64 24 56 24 Q52 30 44 27 Q34 26 28 36 Z',
    mouth: `<path d="M42 50 q6 6 12 0 q-6 3 -12 0 Z" fill="#c25a4a"/>
            <path d="M42 50 q6 6 12 0" stroke="#c25a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    faceMark: `<!-- 주근깨 -->
               <circle cx="36" cy="44" r="0.9" fill="#c98a5c" opacity="0.8"/>
               <circle cx="39" cy="46" r="0.8" fill="#c98a5c" opacity="0.75"/>
               <circle cx="33.5" cy="46.5" r="0.7" fill="#c98a5c" opacity="0.7"/>
               <circle cx="60" cy="44" r="0.9" fill="#c98a5c" opacity="0.8"/>
               <circle cx="57" cy="46" r="0.8" fill="#c98a5c" opacity="0.75"/>
               <circle cx="62.5" cy="46.5" r="0.7" fill="#c98a5c" opacity="0.7"/>`,
    prop: `<!-- 나무칼 -->
           <g transform="rotate(22 70 76)">
             <rect x="67" y="52" width="6" height="30" rx="2" fill="#c9a06a"/>
             <rect x="63" y="80" width="14" height="4" rx="2" fill="#8b5a2b"/>
             <rect x="68" y="84" width="4" height="9" rx="2" fill="#6b4423"/>
           </g>`,
  }),

  // 성문 위병 — 코가리개 달린 투구, 매서운 눈, 창.
  npc_guard: person({
    id: 'grd', skin: '#efc59a', skinDark: '#c19468',
    top: '#8f97ab', top2: '#666e82', bottom: '#3a4050',
    eyes: 'sharp', beard: 'stubble', beardColor: '#3a2c1c', brow: '#3a2c1c', blush: 0,
    hairShape: 'M30 30 Q32 18 48 18 Q64 18 66 30 Q58 24 48 25 Q38 24 30 30 Z',
    mouth: `<path d="M43 47 q5 1.8 10 0" stroke="#8a5a48" stroke-width="1.9" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 투구 -->
          <path d="M26 30 Q48 5 70 30 L70 35 Q48 22 26 35 Z" fill="#b7bfd0"/>
          <path d="M28 28 Q48 10 68 28 Q48 20 28 28 Z" fill="#d3dae7"/>
          <rect x="25" y="29" width="46" height="7" rx="3.5" fill="#8f97ab"/>
          <rect x="45" y="6" width="6" height="16" rx="3" fill="#e14b5a"/>
          <path d="M45 6 Q48 0 51 6 Z" fill="#f07886"/>
          <!-- 코가리개 -->
          <rect x="45.6" y="30" width="4.8" height="16" rx="2.4" fill="#b7bfd0"/>
          <rect x="45.6" y="30" width="2" height="16" rx="1" fill="#d3dae7"/>
          <!-- 볼 가리개 -->
          <path d="M27 33 L31 33 L32 46 Q29 44 27 40 Z" fill="#a4adc0"/>
          <path d="M69 33 L65 33 L64 46 Q67 44 69 40 Z" fill="#a4adc0"/>`,
    prop: `<rect x="70" y="14" width="6" height="88" rx="3" fill="#7a4a22"/>
           <rect x="70" y="14" width="2.4" height="88" rx="1.2" fill="#9c6b3d"/>
           <path d="M73 2 L80 22 L66 22 Z" fill="#cfd8e6"/>
           <path d="M73 5 L77.5 21 L68.5 21 Z" fill="#eef3fa"/>
           <rect x="66" y="22" width="14" height="4" rx="2" fill="#8f97ab"/>
           <!-- 가슴 문장 -->
           <path d="M42 66 L54 66 L54 76 L48 81 L42 76 Z" fill="#4a6ea8"/>
           <path d="M45 69 L51 69 L51 75 L48 77.5 L45 75 Z" fill="#ffd166"/>`,
  }),

  // 연금술사 세피 — 이마에 올린 고글, 잠 못 잔 눈, 플라스크.
  npc_alchemist: person({
    id: 'alch', skin: '#f2d0ad', skinDark: '#c9a37c',
    top: '#2f8f8a', top2: '#1d5f5c', hair: '#3a2a55', hair2: '#7b5aa8',
    bottom: '#2b3040', eyes: 'tired', brow: '#4a3568', blush: 0.22,
    hairShape: 'M26 32 Q28 8 48 7 Q68 8 70 32 Q64 18 56 20 Q50 27 42 22 Q32 22 26 32 Z',
    mouth: `<path d="M44 47 q4 2.6 8 0" stroke="#a3625a" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 이마에 올린 고글 -->
          <rect x="24" y="21" width="48" height="7" rx="3.5" fill="#5a4632"/>
          <circle cx="37" cy="24" r="7.5" fill="#8a6a44"/>
          <circle cx="37" cy="24" r="5.6" fill="#9fe8d8"/>
          <circle cx="35" cy="22" r="2" fill="#fff" opacity="0.8"/>
          <circle cx="59" cy="24" r="7.5" fill="#8a6a44"/>
          <circle cx="59" cy="24" r="5.6" fill="#9fe8d8"/>
          <circle cx="57" cy="22" r="2" fill="#fff" opacity="0.8"/>
          <rect x="44" y="22" width="8" height="4" rx="2" fill="#5a4632"/>`,
    prop: `<!-- 앞주머니에 꽂은 시약병들 -->
           <rect x="33" y="70" width="7" height="14" rx="2" fill="#cfe4ff" opacity="0.7"/>
           <rect x="33" y="76" width="7" height="8" rx="2" fill="#ff8ab0"/>
           <rect x="34.4" y="66" width="4.2" height="5" rx="1.6" fill="#8b5a2b"/>
           <rect x="56" y="70" width="7" height="14" rx="2" fill="#cfe4ff" opacity="0.7"/>
           <rect x="56" y="77" width="7" height="7" rx="2" fill="#ffd166"/>
           <rect x="57.4" y="66" width="4.2" height="5" rx="1.6" fill="#8b5a2b"/>
           <!-- 들고 있는 큰 플라스크 -->
           <path d="M44 64 L52 64 L52 70 L58 86 Q48 91 38 86 L44 70 Z" fill="#cfe4ff" opacity="0.6"/>
           <path d="M41.6 79 Q48 84 54.4 79 L57 85.4 Q48 90 39 85.4 Z" fill="#7ef0b0"/>
           <rect x="43" y="61" width="10" height="5" rx="2" fill="#8b5a2b"/>
           <circle cx="45" cy="76" r="1.4" fill="#fff" opacity="0.65"/>`,
  }),
  // 왕실 대장장이 도르한 — 성 안 대장간의 주인. 0.40.
  //
  // 마을 대장장이 고르드와 한눈에 갈려야 한다. 고르드는 붉은 두건에 가죽 앞치마고,
  // 이쪽은 **금테를 두른 왕실 앞치마와 백금 망치** 다. +10 너머를 다루는 사람이라는 것을
  // 말 걸기 전에 옷이 먼저 말해 준다.
  npc_royal_smith: person({
    id: 'royalsmith', skin: '#c98f5e', skinDark: '#96633a',
    top: '#2f3a5e', top2: '#1c2340', hair: '#2b2118', hair2: '#4a3624',
    bottom: '#232a44', build: 1.36, eyes: 'sharp', beard: 'full',
    beardColor: '#3a2b1e', brow: '#2b2118', blush: 0,
    mouth: `<path d="M42 47.5 q6 2 12 0" stroke="#7a3a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 금테 두른 대장간 두건 -->
          <path d="M24 26 Q48 10 72 26 L72 32 Q48 18 24 32 Z" fill="#3a4670"/>
          <rect x="23" y="25" width="50" height="6.5" rx="3" fill="#26304f"/>
          <rect x="23" y="25" width="50" height="2.2" rx="1.1" fill="#ffd166"/>
          <path d="M29 20 q9 -4 18 -3" stroke="#5a6a9e" stroke-width="1.8" fill="none" opacity="0.8"/>
          <circle cx="48" cy="16.5" r="3.4" fill="#ffd166"/>
          <circle cx="47" cy="15.6" r="1.2" fill="#fff0b8"/>
          <path d="M23 28 Q15 33 14 41 Q21 37 25 32 Z" fill="#26304f"/>`,
    faceMark: `<!-- 불티에 그을린 자국과 오래된 흉터 -->
               <ellipse cx="62" cy="41" rx="5" ry="3" fill="#3a2b22" opacity="0.4" transform="rotate(-18 62 41)"/>
               <path d="M35 30 L38 39" stroke="#8a5238" stroke-width="1.6" opacity="0.7"/>`,
    prop: `<!-- 금테 왕실 앞치마 -->
           <path d="M34 60 L62 60 L65 98 Q48 103 31 98 Z" fill="#2b3352"/>
           <path d="M34 60 L62 60 L62.6 67 L33.4 67 Z" fill="#3d4970"/>
           <path d="M34 60 L62 60 L62 61.8 L34 61.8 Z" fill="#ffd166"/>
           <path d="M31 98 Q48 103 65 98 L64.6 95.4 Q48 100.2 31.4 95.4 Z" fill="#ffd166" opacity="0.85"/>
           <path d="M41 58 L48 65 L55 58" stroke="#ffd166" stroke-width="2.2" fill="none"/>
           <circle cx="39" cy="74" r="2.1" fill="#ffd166"/><circle cx="57" cy="74" r="2.1" fill="#ffd166"/>
           <!-- 어깨에 멘 백금 망치. 머리가 크고 금테가 둘려 있다 -->
           <g transform="rotate(-24 74 74)">
             <rect x="69.5" y="44" width="7.5" height="48" rx="3.5" fill="#6b4526"/>
             <rect x="69.5" y="44" width="3" height="48" rx="1.5" fill="#9c6435"/>
             <rect x="56" y="34" width="34" height="20" rx="4.5" fill="#9aa6bd"/>
             <rect x="56" y="34" width="34" height="6.5" rx="3.2" fill="#cfd8e6"/>
             <rect x="56" y="48" width="34" height="6" rx="3" fill="#6c7488"/>
             <rect x="56" y="40.5" width="34" height="2" fill="#ffd166"/>
           </g>
           <!-- 망치 끝에서 튀는 불티 -->
           <circle cx="86" cy="30" r="2.2" fill="#ffb347" opacity="0.9"/>
           <circle cx="92" cy="38" r="1.5" fill="#ffd166" opacity="0.8"/>
           <circle cx="80" cy="24" r="1.2" fill="#ff8a2b" opacity="0.75"/>`,
  }),

  // 포이노 국왕 — 왕관, 잘 다듬은 반백 수염, 위엄 있는 눈.
  npc_king: person({
    id: 'king', skin: '#f0cfa8', skinDark: '#c4a077',
    top: '#7b4fd4', top2: '#4a2b96', bottom: '#2e2145', build: 1.12,
    hair: '#9e9e9e', hair2: '#e0e0e0', age: 'old', eyes: 'narrow',
    beard: 'short', beardColor: '#c9c9c9', moustache: '#d8d8d8',
    brow: '#c0c0c0', blush: 0.15,
    mouth: `<path d="M43.5 48.6 q4.5 1.6 9 0" stroke="#8a5a48" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    hat: `<!-- 왕관 -->
          <path d="M28 23 L33 5 L41 18 L48 3 L55 18 L63 5 L68 23 Z" fill="#ffd166"/>
          <path d="M30 22 L34 9 L41 20 L48 7 L55 20 L62 9 L66 22 Z" fill="#ffe9a8" opacity="0.55"/>
          <rect x="27" y="20" width="42" height="8.5" rx="3" fill="#e8b44a"/>
          <rect x="27" y="20" width="42" height="3" rx="1.5" fill="#ffe9a8"/>
          <circle cx="48" cy="24.4" r="3.2" fill="#e14b5a"/>
          <circle cx="47" cy="23.4" r="1.1" fill="#ff9aa4"/>
          <circle cx="36" cy="24.4" r="2.2" fill="#5ec4ff"/>
          <circle cx="60" cy="24.4" r="2.2" fill="#5ec4ff"/>
          <circle cx="33" cy="5" r="2.4" fill="#fff0b8"/>
          <circle cx="63" cy="5" r="2.4" fill="#fff0b8"/>
          <circle cx="48" cy="3" r="2.6" fill="#fff0b8"/>`,
    prop: `<!-- 어깨에 두른 흰담비 망토 -->
           <path d="M28 54 Q48 66 68 54 L71 78 Q48 88 25 78 Z" fill="#f2efe6"/>
           <circle cx="33" cy="62" r="1.6" fill="#3a3a3a"/><circle cx="41" cy="66" r="1.4" fill="#3a3a3a"/>
           <circle cx="55" cy="66" r="1.4" fill="#3a3a3a"/><circle cx="63" cy="62" r="1.6" fill="#3a3a3a"/>
           <circle cx="48" cy="69" r="1.5" fill="#3a3a3a"/>
           <!-- 홀 -->
           <rect x="70" y="30" width="6" height="70" rx="3" fill="#ffd166"/>
           <rect x="70" y="30" width="2.4" height="70" rx="1.2" fill="#ffe9a8"/>
           <circle cx="73" cy="26" r="8" fill="#e8b44a"/>
           <circle cx="73" cy="26" r="5.4" fill="#7cc4ff"/>
           <circle cx="71.4" cy="24.4" r="2" fill="#fff" opacity="0.8"/>`,
  }),
};

// ---------------- 추가 몬스터 (128x128) ----------------
const WOLF = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs><linearGradient id="fur" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8d93a3"/><stop offset="1" stop-color="#4c5364"/>
  </linearGradient></defs>
  <path d="M96 92 Q118 78 116 58 Q108 70 96 74 Z" fill="#5d6478"/>
  <ellipse cx="62" cy="82" rx="40" ry="26" fill="url(#fur)"/>
  <path d="M28 96 l4 16 h10 l-3-16Z M52 100 l3 14h10l-3-14Z M76 100 l3 14h10l-3-14Z M96 94 l4 18h10l-4-18Z" fill="#454b5c"/>
  <ellipse cx="36" cy="56" rx="26" ry="24" fill="url(#fur)"/>
  <path d="M18 40 L14 14 L34 30 Z" fill="#6b7285"/><path d="M52 36 L60 12 L64 34 Z" fill="#6b7285"/>
  <path d="M20 38 L18 22 L30 32 Z" fill="#c58cff" opacity="0.45"/>
  <path d="M54 34 L58 20 L62 33 Z" fill="#c58cff" opacity="0.45"/>
  <ellipse cx="20" cy="64" rx="16" ry="12" fill="#a8aebd"/>
  <ellipse cx="8" cy="64" rx="6" ry="5" fill="#2b3040"/>
  <path d="M6 70 q10 8 22 4" stroke="#2b3040" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M10 70 l3 7 3-7Z M20 72 l3 7 3-7Z" fill="#fff"/>
  <ellipse cx="30" cy="52" rx="6" ry="7" fill="#ffe066"/>
  <ellipse cx="48" cy="50" rx="6" ry="7" fill="#ffe066"/>
  <ellipse cx="30" cy="53" rx="2.4" ry="4.5" fill="#2b1840"/>
  <ellipse cx="48" cy="51" rx="2.4" ry="4.5" fill="#2b1840"/>
</svg>`;

const IMP = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs><radialGradient id="skin" cx="0.4" cy="0.3" r="0.85">
    <stop offset="0" stop-color="#ff8b6b"/><stop offset="1" stop-color="#b8342c"/>
  </radialGradient></defs>
  <path d="M40 66 Q8 44 6 74 Q22 72 34 88 Z" fill="#7a1f22"/>
  <path d="M88 66 Q120 44 122 74 Q106 72 94 88 Z" fill="#7a1f22"/>
  <path d="M84 96 q22 8 20 24 q-10-4-14-12" fill="#a52a2a"/>
  <ellipse cx="64" cy="88" rx="26" ry="24" fill="url(#skin)"/>
  <ellipse cx="64" cy="52" rx="30" ry="27" fill="url(#skin)"/>
  <path d="M38 34 L30 8 L52 26 Z" fill="#8c2a24"/><path d="M90 34 L98 8 L76 26 Z" fill="#8c2a24"/>
  <ellipse cx="52" cy="50" rx="9" ry="10" fill="#ffe066"/>
  <ellipse cx="76" cy="50" rx="9" ry="10" fill="#ffe066"/>
  <ellipse cx="52" cy="51" rx="3.4" ry="6" fill="#3a0d0d"/>
  <ellipse cx="76" cy="51" rx="3.4" ry="6" fill="#3a0d0d"/>
  <path d="M50 68 q14 10 28 0 q-6 12-14 12t-14-12Z" fill="#3a0d0d"/>
  <path d="M54 70 l3 7 3-7Z M68 70 l3 7 3-7Z" fill="#fff"/>
  <path d="M44 100 l-8 14h9l6-12Z M84 100 l8 14h-9l-6-12Z" fill="#8c2a24"/>
</svg>`;

const SKELETON = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs><linearGradient id="bone" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f4f1e4"/><stop offset="1" stop-color="#c7c0ab"/>
  </linearGradient></defs>
  <rect x="56" y="66" width="16" height="40" rx="6" fill="url(#bone)"/>
  <g fill="url(#bone)">
    <rect x="38" y="72" width="52" height="7" rx="3.5"/>
    <rect x="40" y="84" width="48" height="7" rx="3.5"/>
    <rect x="44" y="96" width="40" height="7" rx="3.5"/>
  </g>
  <rect x="26" y="66" width="10" height="36" rx="5" fill="url(#bone)" transform="rotate(-14 31 84)"/>
  <rect x="92" y="66" width="10" height="36" rx="5" fill="url(#bone)" transform="rotate(14 97 84)"/>
  <rect x="44" y="104" width="11" height="20" rx="5" fill="url(#bone)"/>
  <rect x="73" y="104" width="11" height="20" rx="5" fill="url(#bone)"/>
  <path d="M34 44 a30 30 0 0 1 60 0 v16 q0 14-14 14 h-32 q-14 0-14-14 Z" fill="url(#bone)"/>
  <ellipse cx="51" cy="48" rx="10" ry="11" fill="#241f18"/>
  <ellipse cx="77" cy="48" rx="10" ry="11" fill="#241f18"/>
  <circle cx="51" cy="48" r="4.5" fill="#7cf0ff"/><circle cx="77" cy="48" r="4.5" fill="#7cf0ff"/>
  <path d="M60 62 l4 8 4-8Z" fill="#241f18"/>
  <g stroke="#241f18" stroke-width="2.6"><path d="M52 74v-6M60 74v-6M68 74v-6M76 74v-6"/></g>
</svg>`;

const DEMON_SOLDIER = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="armor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b3a86"/><stop offset="1" stop-color="#2f1748"/>
    </linearGradient>
    <linearGradient id="dskin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d1584a"/><stop offset="1" stop-color="#8c2a24"/>
    </linearGradient>
  </defs>
  <g transform="rotate(20 100 64)">
    <rect x="96" y="12" width="9" height="76" rx="3" fill="#5a3a1e"/>
    <path d="M86 4 L116 4 L106 34 L96 34 Z" fill="#b7bfd0"/>
    <path d="M86 4 L101 4 L98 34 L96 34 Z" fill="#eef3fa"/>
  </g>
  <rect x="44" y="98" width="14" height="22" rx="6" fill="#2f1748"/>
  <rect x="70" y="98" width="14" height="22" rx="6" fill="#2f1748"/>
  <path d="M38 58 Q34 50 46 48 L82 48 Q94 50 90 58 L94 102 Q64 110 34 102 Z" fill="url(#armor)"/>
  <path d="M38 58 Q64 66 90 58 L90 70 Q64 78 38 70 Z" fill="#8c58a8" opacity="0.5"/>
  <circle cx="64" cy="76" r="9" fill="#ff5a5a"/><circle cx="64" cy="76" r="4" fill="#ffd166"/>
  <ellipse cx="64" cy="30" rx="22" ry="21" fill="url(#dskin)"/>
  <path d="M42 20 L32 0 L54 14 Z" fill="#6b3a86"/><path d="M86 20 L96 0 L74 14 Z" fill="#6b3a86"/>
  <path d="M42 24 q22 -10 44 0 l0 8 q-22 -8 -44 0 Z" fill="#4a2a66"/>
  <ellipse cx="55" cy="34" rx="6" ry="5" fill="#ffe066"/>
  <ellipse cx="73" cy="34" rx="6" ry="5" fill="#ffe066"/>
  <path d="M56 44 q8 6 16 0" stroke="#3a0d0d" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

// ---------------- 보스 ----------------
const IMP_CAPTAIN = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="bskin" cx="0.4" cy="0.28" r="0.9">
      <stop offset="0" stop-color="#ff9d5c"/><stop offset="0.6" stop-color="#d1402c"/>
      <stop offset="1" stop-color="#7a1512"/>
    </radialGradient>
    <radialGradient id="aura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff7a3c" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#ff7a3c" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="64" cy="66" r="62" fill="url(#aura)"/>
  <path d="M42 60 Q2 30 0 70 Q20 66 34 92 Z" fill="#6b1418"/>
  <path d="M86 60 Q126 30 128 70 Q108 66 94 92 Z" fill="#6b1418"/>
  <path d="M40 62 Q10 38 8 70 Q24 66 36 88 Z" fill="#a5252a"/>
  <path d="M88 62 Q118 38 120 70 Q104 66 92 88 Z" fill="#a5252a"/>
  <ellipse cx="64" cy="92" rx="32" ry="28" fill="url(#bskin)"/>
  <path d="M40 82 Q64 96 88 82 L88 96 Q64 108 40 96 Z" fill="#5c1b1b" opacity="0.6"/>
  <ellipse cx="64" cy="48" rx="34" ry="30" fill="url(#bskin)"/>
  <path d="M34 30 L18 0 L52 22 Z" fill="#7a1512"/><path d="M94 30 L110 0 L76 22 Z" fill="#7a1512"/>
  <path d="M36 30 L26 8 L48 24 Z" fill="#c05038"/><path d="M92 30 L102 8 L80 24 Z" fill="#c05038"/>
  <path d="M30 34 q34 -14 68 0 l0 10 q-34 -12 -68 0 Z" fill="#3d0f12"/>
  <circle cx="64" cy="38" r="6" fill="#ffd166"/>
  <ellipse cx="50" cy="54" rx="10" ry="9" fill="#ffe066"/>
  <ellipse cx="78" cy="54" rx="10" ry="9" fill="#ffe066"/>
  <ellipse cx="50" cy="55" rx="3.6" ry="6" fill="#3a0d0d"/>
  <ellipse cx="78" cy="55" rx="3.6" ry="6" fill="#3a0d0d"/>
  <path d="M46 68 q18 14 36 0 q-8 16-18 16t-18-16Z" fill="#3a0d0d"/>
  <path d="M50 70 l4 9 4-9Z M70 70 l4 9 4-9Z" fill="#fff"/>
</svg>`;

const DEMON_GENERAL = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="garmor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b2f7a"/><stop offset="0.5" stop-color="#2a1348"/>
      <stop offset="1" stop-color="#150822"/>
    </linearGradient>
    <linearGradient id="gskin" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b9483c"/><stop offset="1" stop-color="#65171a"/>
    </linearGradient>
    <radialGradient id="gaura" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#a05cff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#a05cff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="64" cy="64" r="64" fill="url(#gaura)"/>
  <path d="M36 56 Q0 26 2 70 Q24 62 34 94 Z" fill="#2a1348"/>
  <path d="M92 56 Q128 26 126 70 Q104 62 94 94 Z" fill="#2a1348"/>
  <path d="M36 58 Q10 36 10 68 Q26 62 34 88 Z" fill="#452a70" opacity="0.9"/>
  <path d="M92 58 Q118 36 118 68 Q102 62 94 88 Z" fill="#452a70" opacity="0.9"/>
  <g transform="rotate(24 106 60)">
    <rect x="100" y="0" width="12" height="90" rx="4" fill="#3a2c1e"/>
    <path d="M86 -6 L126 -6 L114 40 L98 40 Z" fill="#c9d4e6"/>
    <path d="M86 -6 L104 -6 L102 40 L98 40 Z" fill="#fff"/>
    <rect x="92" y="40" width="28" height="8" rx="4" fill="#ffd166"/>
  </g>
  <rect x="42" y="102" width="16" height="24" rx="7" fill="#150822"/>
  <rect x="70" y="102" width="16" height="24" rx="7" fill="#150822"/>
  <path d="M32 56 Q26 46 42 44 L86 44 Q102 46 96 56 L100 106 Q64 116 28 106 Z" fill="url(#garmor)"/>
  <path d="M32 56 Q64 66 96 56 L96 68 Q64 78 32 68 Z" fill="#7b4fd4" opacity="0.45"/>
  <path d="M20 46 q14-10 26 2 l-6 14 q-12-8-22-4Z" fill="#3d2560"/>
  <path d="M108 46 q-14-10-26 2 l6 14 q12-8 22-4Z" fill="#3d2560"/>
  <circle cx="64" cy="78" r="12" fill="#ff4d4d"/><circle cx="64" cy="78" r="6" fill="#ffd166"/>
  <ellipse cx="64" cy="26" rx="24" ry="22" fill="url(#gskin)"/>
  <path d="M40 14 L24 -12 L54 8 Z" fill="#2a1348"/><path d="M88 14 L104 -12 L74 8 Z" fill="#2a1348"/>
  <path d="M42 16 L34 0 L52 12 Z" fill="#5b3a96"/><path d="M86 16 L94 0 L76 12 Z" fill="#5b3a96"/>
  <path d="M40 20 q24 -12 48 0 l0 9 q-24 -10 -48 0 Z" fill="#150822"/>
  <ellipse cx="55" cy="30" rx="7" ry="6" fill="#ff6b6b"/>
  <ellipse cx="73" cy="30" rx="7" ry="6" fill="#ff6b6b"/>
  <circle cx="55" cy="30" r="2.6" fill="#fff"/><circle cx="73" cy="30" r="2.6" fill="#fff"/>
  <path d="M54 40 q10 8 20 0" stroke="#150822" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ---------------- 추가 아이템 (64x64) ----------------
const item = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;

const NEW_ITEMS = {
  potion: item(`
    <path d="M26 8h12v10l8 12a14 14 0 0 1-28 0l8-12Z" fill="#cfe4ff" opacity="0.55"/>
    <path d="M20 34a14 14 0 0 0 24 10 14 14 0 0 0 4-10Z" fill="#ff5a7a"/>
    <path d="M22 38q6 4 12 0t12 0" stroke="#ff8fa6" stroke-width="2.5" fill="none"/>
    <rect x="24" y="4" width="16" height="7" rx="3" fill="#8b5a2b"/>
    <ellipse cx="27" cy="30" rx="2.5" ry="5" fill="#fff" opacity="0.6" transform="rotate(-16 27 30)"/>`),

  flame_sword: item(`
    <g transform="rotate(-38 32 32)">
      <path d="M27 2 L37 2 L37 40 L32 48 L27 40 Z" fill="#ff8a3c"/>
      <path d="M27 2 L32 2 L32 40 L29.5 44 Z" fill="#ffd166"/>
      <path d="M29 6 q4 8 0 16 q-4 -8 0 -16Z" fill="#fff3c4" opacity="0.8"/>
      <rect x="17" y="40" width="30" height="6" rx="3" fill="#c0392b"/>
      <rect x="29" y="46" width="6" height="13" rx="3" fill="#5a3a1e"/>
      <circle cx="32" cy="59" r="4.5" fill="#ff5a2b"/>
    </g>`),

  demon_blade: item(`
    <g transform="rotate(-38 32 32)">
      <path d="M25 2 Q40 6 39 26 L34 46 L28 40 L25 2 Z" fill="#6b3a86"/>
      <path d="M25 2 Q34 8 33 26 L30 40 L28 38 Z" fill="#a05cff"/>
      <path d="M39 26 q6 6 2 14 q-4-6-6-8Z" fill="#4a2a66"/>
      <rect x="16" y="42" width="32" height="6" rx="3" fill="#2a1348"/>
      <path d="M16 45 q16 -8 32 0" stroke="#ff4d4d" stroke-width="2" fill="none"/>
      <rect x="29" y="48" width="6" height="12" rx="3" fill="#150822"/>
      <circle cx="32" cy="60" r="4.5" fill="#ff4d4d"/>
    </g>`),

  knight_armor: item(`
    <path d="M18 14 L28 9 L36 9 L46 14 L50 26 L42 29 L42 54 L22 54 L22 29 L14 26 Z" fill="#b7bfd0"/>
    <path d="M28 9 L32 21 L36 9 Z" fill="#8f97ab"/>
    <path d="M18 14 L28 9 L32 21 L22 29 L14 26 Z" fill="#d6dde8"/>
    <rect x="22" y="36" width="20" height="6" rx="3" fill="#ffd166"/>
    <circle cx="26" cy="28" r="2.4" fill="#6fa8d4"/><circle cx="38" cy="28" r="2.4" fill="#6fa8d4"/>`),

  dragon_mail: item(`
    <path d="M18 14 L28 9 L36 9 L46 14 L50 26 L42 29 L42 54 L22 54 L22 29 L14 26 Z" fill="#2f7a5a"/>
    <path d="M28 9 L32 21 L36 9 Z" fill="#1f5a42"/>
    <g fill="#4fbf8a">
      <path d="M26 30 a5 5 0 0 1 10 0Z"/><path d="M20 38 a5 5 0 0 1 10 0Z"/>
      <path d="M34 38 a5 5 0 0 1 10 0Z"/><path d="M26 46 a5 5 0 0 1 10 0Z"/>
    </g>
    <circle cx="32" cy="24" r="4" fill="#ffd166"/>`),

  // ── 용린 세트 ──────────────────────────────────────────────
  // 세 개가 한 벌이다(투구 · 갑옷 · 어깨). 소지품에서 초록 글씨로 뜨므로
  // 그림도 같은 초록 계열로 맞춰, 늘어놓았을 때 한눈에 한 벌로 보이게 한다.
  // 비늘 무늬(반원 넷)와 이마의 금빛 알이 세 개에 공통으로 들어간다.
  dragon_helm: item(`
    <path d="M32 8 Q50 10 52 28 Q52 44 32 54 Q12 44 12 28 Q14 10 32 8 Z" fill="#2f7a5a"/>
    <path d="M32 8 Q50 10 52 28 Q44 20 32 19 Q20 20 12 28 Q14 10 32 8 Z" fill="#3c9a71"/>
    <!-- 눈구멍 — 여기가 뚫려 있어야 투구로 읽힌다 -->
    <path d="M19 28 L30 26 L30 34 L19 34 Z" fill="#0f2a1f"/>
    <path d="M45 28 L34 26 L34 34 L45 34 Z" fill="#0f2a1f"/>
    <path d="M20 29 L29 27.6 L29 31 L20 31 Z" fill="#7ef0b0" opacity="0.55"/>
    <path d="M44 29 L35 27.6 L35 31 L44 31 Z" fill="#7ef0b0" opacity="0.55"/>
    <g fill="#4fbf8a">
      <path d="M27 38 a5 5 0 0 1 10 0Z"/><path d="M21 46 a5 5 0 0 1 10 0Z"/>
      <path d="M33 46 a5 5 0 0 1 10 0Z"/>
    </g>
    <!-- 뒤로 뻗은 뿔 -->
    <path d="M14 20 Q4 14 2 4 Q14 10 18 18 Z" fill="#1f5a42"/>
    <path d="M50 20 Q60 14 62 4 Q50 10 46 18 Z" fill="#1f5a42"/>
    <circle cx="32" cy="16" r="3.6" fill="#ffd166"/>
    <circle cx="30.8" cy="14.8" r="1.3" fill="#fff3c4"/>`),

  dragon_pauldron: item(`
    <path d="M8 26 Q32 8 56 26 L52 44 Q32 34 12 44 Z" fill="#2f7a5a"/>
    <path d="M8 26 Q32 8 56 26 Q32 18 8 26 Z" fill="#3c9a71"/>
    <g fill="#4fbf8a">
      <path d="M18 30 a5 5 0 0 1 10 0Z"/><path d="M36 30 a5 5 0 0 1 10 0Z"/>
      <path d="M27 38 a5 5 0 0 1 10 0Z"/>
    </g>
    <!-- 아래로 늘어뜨린 비늘 자락 -->
    <path d="M12 44 Q32 34 52 44 L50 52 Q32 43 14 52 Z" fill="#1f5a42"/>
    <path d="M14 52 l5 8 5 -8 M28 53 l4 8 4 -8 M40 52 l5 8 5 -8" fill="#1f5a42"/>
    <circle cx="32" cy="24" r="3.6" fill="#ffd166"/>
    <circle cx="30.8" cy="22.8" r="1.3" fill="#fff3c4"/>`),

  // ── 쓸모없는 검 ────────────────────────────────────────────
  // 값은 10만인데 공격력이 1이다. 그림도 그렇게 보여야 한다 —
  // 날은 이가 빠지고 색은 죽었고, 대신 **빈 홈 두 개**가 또렷하게 뚫려 있다.
  // 사람이 그림만 보고 "이건 뭔가 박으라는 물건이구나" 를 알아채야 한다.
  useless_sword: item(`
    <g transform="rotate(-38 32 32)">
      <path d="M28 4 L36 4 L36 40 L32 46 L28 40 Z" fill="#8b8f96"/>
      <path d="M28 4 L32 4 L32 40 L30 43 Z" fill="#a9adb4"/>
      <!-- 이 빠진 날 -->
      <path d="M36 12 l-4 3 4 3 Z" fill="#3a3f45"/>
      <path d="M28 24 l4 3 -4 3 Z" fill="#3a3f45"/>
      <path d="M36 30 l-4 2.5 4 2.5 Z" fill="#3a3f45"/>
      <!-- 빈 홈 둘 -->
      <circle cx="32" cy="16" r="4.2" fill="#2a2e33" stroke="#5c6169" stroke-width="1.4"/>
      <circle cx="32" cy="30" r="4.2" fill="#2a2e33" stroke="#5c6169" stroke-width="1.4"/>
      <rect x="17" y="40" width="30" height="6" rx="3" fill="#6b7078"/>
      <rect x="29" y="46" width="6" height="13" rx="3" fill="#4a3a2c"/>
      <circle cx="32" cy="59" r="4.5" fill="#6b7078"/>
    </g>`),

  // ── 용린 기사검 ────────────────────────────────────────────
  // 쓸모없는 검에 루비 → 에메랄드를 순서대로 박으면 이것이 된다.
  // 용린 세트의 네 번째 조각이므로 갑옷 셋과 같은 초록 계열에 금빛 알을 쓰고,
  // 박아 넣은 두 보석이 날 위에 그대로 남아 있어야 "그 검이 이렇게 되었다"로 읽힌다.
  dragon_knight_sword: item(`
    <g transform="rotate(-38 32 32)">
      <path d="M27 2 L37 2 L37 40 L32 47 L27 40 Z" fill="#2f7a5a"/>
      <path d="M27 2 L32 2 L32 40 L29.5 44 Z" fill="#4fbf8a"/>
      <g fill="#3c9a71">
        <path d="M28 8 a4 4 0 0 1 8 0Z"/><path d="M28 20 a4 4 0 0 1 8 0Z"/>
        <path d="M28 34 a4 4 0 0 1 8 0Z"/>
      </g>
      <!-- 박아 넣은 루비(위) 와 에메랄드(아래) -->
      <circle cx="32" cy="14" r="4.2" fill="#e0384f" stroke="#ffd166" stroke-width="1.2"/>
      <circle cx="30.8" cy="12.8" r="1.3" fill="#ffb3bd"/>
      <circle cx="32" cy="27" r="4.2" fill="#2fbf6a" stroke="#ffd166" stroke-width="1.2"/>
      <circle cx="30.8" cy="25.8" r="1.3" fill="#a8f5c6"/>
      <rect x="16" y="40" width="32" height="6" rx="3" fill="#1f5a42"/>
      <path d="M16 43 q16 -7 32 0" stroke="#ffd166" stroke-width="1.8" fill="none"/>
      <rect x="29" y="46" width="6" height="13" rx="3" fill="#153a2b"/>
      <circle cx="32" cy="59" r="4.8" fill="#ffd166"/>
      <circle cx="30.6" cy="57.6" r="1.6" fill="#fff3c4"/>
    </g>`),

  // ── 매직 투구 ──────────────────────────────────────────────
  // 투구 칸의 두 번째 선택지. 용린 투구가 초록·비늘이라면 이쪽은 푸른 마력이다.
  // 한눈에 "다른 계열" 로 보여야 고르는 재미가 생긴다.
  magic_helm: item(`
    <path d="M32 8 Q50 10 52 28 Q52 44 32 54 Q12 44 12 28 Q14 10 32 8 Z" fill="#3b4a86"/>
    <path d="M32 8 Q50 10 52 28 Q44 20 32 19 Q20 20 12 28 Q14 10 32 8 Z" fill="#4f63ad"/>
    <path d="M19 28 L30 26 L30 34 L19 34 Z" fill="#151a33"/>
    <path d="M45 28 L34 26 L34 34 L45 34 Z" fill="#151a33"/>
    <path d="M20 29 L29 27.6 L29 31 L20 31 Z" fill="#9fd0ff" opacity="0.7"/>
    <path d="M44 29 L35 27.6 L35 31 L44 31 Z" fill="#9fd0ff" opacity="0.7"/>
    <!-- 이마의 마력 결정과 흘러내리는 빛 -->
    <path d="M32 10 L37 18 L32 23 L27 18 Z" fill="#8ad8ff"/>
    <path d="M32 12.5 L34.6 18 L32 20.6 L29.4 18 Z" fill="#e6f7ff"/>
    <g stroke="#8ad8ff" stroke-width="1.6" fill="none" opacity="0.85">
      <path d="M17 38 q6 4 0 9"/><path d="M47 38 q-6 4 0 9"/>
    </g>
    <path d="M24 44 q8 5 16 0" stroke="#9fd0ff" stroke-width="1.6" fill="none" opacity="0.7"/>`),

  // ── 용린 기사궁 · 용린 기사장 ──────────────────────────────
  // 기사검과 같은 초록·금빛에, 박아 넣은 루비와 에메랄드를 그대로 얹는다.
  // 셋을 늘어놓으면 한 형제로 보여야 한다.
  dragon_knight_bow: item(`
    <g transform="rotate(-20 32 32)">
      <path d="M20 6 Q46 20 20 58" stroke="#2f7a5a" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M20 6 Q42 20 20 58" stroke="#4fbf8a" stroke-width="2.4" fill="none"/>
      <path d="M20 6 L20 58" stroke="#ffd166" stroke-width="1.6"/>
      <circle cx="34" cy="20" r="4.2" fill="#e0384f" stroke="#ffd166" stroke-width="1.2"/>
      <circle cx="32.8" cy="18.8" r="1.3" fill="#ffb3bd"/>
      <circle cx="34" cy="44" r="4.2" fill="#2fbf6a" stroke="#ffd166" stroke-width="1.2"/>
      <circle cx="32.8" cy="42.8" r="1.3" fill="#a8f5c6"/>
      <path d="M20 32 L46 32" stroke="#1f5a42" stroke-width="3"/>
      <path d="M44 28 l6 4 -6 4 Z" fill="#ffd166"/>
    </g>`),

  dragon_knight_staff: item(`
    <g transform="rotate(-32 32 32)">
      <rect x="29" y="20" width="6" height="40" rx="3" fill="#2f7a5a"/>
      <rect x="30.5" y="20" width="2" height="40" fill="#4fbf8a"/>
      <path d="M32 2 Q46 8 44 20 Q38 12 32 12 Q26 12 20 20 Q18 8 32 2 Z" fill="#1f5a42"/>
      <circle cx="32" cy="18" r="8" fill="#2f7a5a"/>
      <circle cx="32" cy="18" r="5.6" fill="#4fbf8a"/>
      <circle cx="30" cy="16" r="3.4" fill="#e0384f" stroke="#ffd166" stroke-width="1"/>
      <circle cx="34.4" cy="20.4" r="3.4" fill="#2fbf6a" stroke="#ffd166" stroke-width="1"/>
      <circle cx="32" cy="18" r="8" fill="none" stroke="#ffd166" stroke-width="1.6"/>
      <circle cx="32" cy="58" r="4.2" fill="#ffd166"/>
    </g>`),

  power_ring: item(`
    <circle cx="32" cy="38" r="16" fill="none" stroke="#c0392b" stroke-width="6"/>
    <circle cx="32" cy="38" r="16" fill="none" stroke="#ff8a3c" stroke-width="2"/>
    <path d="M32 8 L40 22 L24 22 Z" fill="#ff5a5a"/>
    <circle cx="32" cy="19" r="7" fill="#e14b5a"/>
    <circle cx="29" cy="16" r="2.4" fill="#ffd9d9"/>`),

  magic_stone: item(`
    <path d="M32 6 L52 24 L44 54 L20 54 L12 24 Z" fill="#7cc4ff"/>
    <path d="M32 6 L52 24 L32 32 Z" fill="#b8e2ff"/>
    <path d="M32 32 L44 54 L20 54 Z" fill="#4fa8ef"/>
    <path d="M12 24 L32 32 L20 54 Z" fill="#6bb6f5"/>
    <circle cx="26" cy="24" r="3" fill="#fff" opacity="0.75"/>`),

  club: item(`
    <g transform="rotate(-38 32 32)">
      <rect x="28" y="36" width="8" height="22" rx="4" fill="#7a5a34"/>
      <path d="M27 38 Q20 22 25 10 Q32 3 39 10 Q44 22 37 38 Z" fill="#a3702f"/>
      <path d="M27 38 Q22 22 26 11 Q30 6 32 6 L32 38 Z" fill="#c89a5e"/>
      <ellipse cx="29" cy="20" rx="2.6" ry="4" fill="#7a5a34" opacity="0.8"/>
      <ellipse cx="35" cy="29" rx="2" ry="3" fill="#7a5a34" opacity="0.7"/>
      <path d="M27 38 Q32 41 37 38" stroke="#6b4423" stroke-width="2" fill="none"/>
    </g>`),

  speed_potion: item(`
    <path d="M26 8h12v10l8 12a14 14 0 0 1-28 0l8-12Z" fill="#cfe4ff" opacity="0.5"/>
    <path d="M20 34a14 14 0 0 0 24 10 14 14 0 0 0 4-10Z" fill="#4fd6c0"/>
    <path d="M22 38q6 4 12 0t12 0" stroke="#9df3e6" stroke-width="2.5" fill="none"/>
    <rect x="24" y="4" width="16" height="7" rx="3" fill="#8b5a2b"/>
    <g stroke="#eafffb" stroke-width="2.6" stroke-linecap="round" opacity="0.95">
      <path d="M28 30 l6-7 M34 34 l7-8 M30 42 l5-6"/>
    </g>
    <ellipse cx="27" cy="30" rx="2.2" ry="4.5" fill="#fff" opacity="0.55" transform="rotate(-16 27 30)"/>`),

  // ── 투구 넷 ────────────────────────────────────────────────
  // 0.54 — 투구 칸이 둘(용린·매직)뿐이라 대부분의 사람은 머리에 아무것도 쓰지 않았다.
  // 갑옷 등급마다 하나씩 짝을 지어 놓아, 어느 단계에서도 쓸 것이 있게 한다.
  // 그림은 전부 "정면에서 본 머리" 로 통일한다 — 늘어놓았을 때 한 칸으로 읽히게.
  cloth_hood: item(`
    <path d="M32 8 Q52 12 52 34 Q52 50 32 56 Q12 50 12 34 Q12 12 32 8 Z" fill="#b8b09a"/>
    <path d="M32 8 Q52 12 52 34 Q42 24 32 23 Q22 24 12 34 Q12 12 32 8 Z" fill="#d6cebc"/>
    <!-- 얼굴이 드러나는 구멍 -->
    <ellipse cx="32" cy="36" rx="12" ry="13" fill="#2a2519"/>
    <ellipse cx="32" cy="35" rx="10" ry="11" fill="#f0d3b4"/>
    <circle cx="27.5" cy="34" r="1.8" fill="#2a2519"/><circle cx="36.5" cy="34" r="1.8" fill="#2a2519"/>
    <!-- 어깨로 흘러내린 자락 -->
    <path d="M12 46 Q10 58 16 60 L22 52 Z" fill="#a49c88"/>
    <path d="M52 46 Q54 58 48 60 L42 52 Z" fill="#a49c88"/>`),

  leather_cap: item(`
    <path d="M12 34 Q12 12 32 10 Q52 12 52 34 Z" fill="#8a6036"/>
    <path d="M12 34 Q14 16 32 13 Q40 14 45 20 Q34 20 24 27 Q17 31 12 34 Z" fill="#a87b47"/>
    <!-- 챙 -->
    <path d="M6 34 Q32 28 58 34 Q32 42 6 34 Z" fill="#5e3f22"/>
    <!-- 이마 띠와 매듭 -->
    <rect x="12" y="28" width="40" height="5" rx="2.5" fill="#4a301a"/>
    <circle cx="47" cy="30.5" r="3" fill="#ffd166"/>
    <path d="M20 40 q12 8 24 0" stroke="#f0d3b4" stroke-width="0" fill="none"/>`),

  knight_helm: item(`
    <path d="M32 8 Q50 10 52 28 L52 40 L44 40 L44 28 Q44 18 32 17 Q20 18 20 28 L20 40 L12 40 L12 28 Q14 10 32 8 Z" fill="#b8c2d2"/>
    <path d="M12 26 Q32 6 52 26 Q32 16 12 26 Z" fill="#dbe3ef"/>
    <!-- 볼가리개 -->
    <path d="M12 28 L20 28 L20 52 Q16 54 12 50 Z" fill="#8b95a6"/>
    <path d="M52 28 L44 28 L44 52 Q48 54 52 50 Z" fill="#8b95a6"/>
    <!-- 코가리개 -->
    <rect x="29" y="24" width="6" height="26" rx="3" fill="#98a2b3"/>
    <!-- 눈구멍 -->
    <path d="M21 30 L28 29 L28 37 L21 37 Z" fill="#1b2130"/>
    <path d="M43 30 L36 29 L36 37 L43 37 Z" fill="#1b2130"/>
    <circle cx="32" cy="16" r="3.4" fill="#ffd166"/>
    <circle cx="30.9" cy="15" r="1.2" fill="#fff3c4"/>`),

  rune_helm: item(`
    <path d="M32 10 Q50 12 52 30 L52 42 L44 42 L44 30 Q44 20 32 19 Q20 20 20 30 L20 42 L12 42 L12 30 Q14 12 32 10 Z" fill="#4d5aa8"/>
    <path d="M12 28 Q32 8 52 28 Q32 18 12 28 Z" fill="#6a79cf"/>
    <path d="M12 30 L20 30 L20 54 Q16 56 12 52 Z" fill="#3a4585"/>
    <path d="M52 30 L44 30 L44 54 Q48 56 52 52 Z" fill="#3a4585"/>
    <rect x="29" y="26" width="6" height="26" rx="3" fill="#5c6ab8"/>
    <path d="M21 32 L28 31 L28 39 L21 39 Z" fill="#141a30"/>
    <path d="M43 32 L36 31 L36 39 L43 39 Z" fill="#141a30"/>
    <path d="M22 33 L27 32.4 L27 36 L22 36 Z" fill="#96d2ff" opacity="0.75"/>
    <path d="M42 33 L37 32.4 L37 36 L42 36 Z" fill="#96d2ff" opacity="0.75"/>
    <!-- 정수리에서 뻗는 빛 깃털 -->
    <path d="M32 10 Q40 2 34 0 Q36 6 30 9 Z" fill="#96d2ff"/>
    <path d="M32 12 Q44 6 40 2" stroke="#96d2ff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.9"/>
    <!-- 이마의 룬 -->
    <g stroke="#c9e8ff" stroke-width="1.8" fill="none" stroke-linecap="round">
      <path d="M32 16 v8M28.6 19 L32 15.6 L35.4 19"/>
    </g>`),

  demon_core: item(`
    <circle cx="32" cy="32" r="20" fill="#2a1348"/>
    <circle cx="32" cy="32" r="14" fill="#7b2fbf"/>
    <circle cx="32" cy="32" r="8" fill="#ff4d4d"/>
    <circle cx="32" cy="32" r="3.5" fill="#ffd166"/>
    <g stroke="#a05cff" stroke-width="2.5" fill="none">
      <path d="M32 8 v6M32 50v6M8 32h6M50 32h6"/>
    </g>`),
};

// ---------------- 퀘스트 게시판 (96x128, NPC처럼 세워 둔다) ----------------
const QUEST_BOARD = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="qbwood" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#a3702f"/><stop offset="1" stop-color="#6b4423"/>
    </linearGradient>
  </defs>
  <rect x="20" y="84" width="9" height="38" rx="3" fill="#6b4423"/>
  <rect x="67" y="84" width="9" height="38" rx="3" fill="#6b4423"/>
  
  <rect x="12" y="26" width="72" height="62" rx="5" fill="url(#qbwood)"/>
  <rect x="16" y="30" width="64" height="54" rx="3" fill="#8a5a2b"/>
  <rect x="8" y="20" width="80" height="10" rx="4" fill="#8b5a2b"/>
  <path d="M8 20 L48 6 L88 20 Z" fill="#a8443c"/>
  <path d="M8 20 L48 6 L48 20 Z" fill="#c2564c"/>

  <g>
    <rect x="22" y="36" width="24" height="20" rx="1.5" fill="#f4ecd8" transform="rotate(-3 34 46)"/>
    <g stroke="#9c8b78" stroke-width="1.6" stroke-linecap="round" transform="rotate(-3 34 46)">
      <path d="M26 42h16M26 46h16M26 50h10"/>
    </g>
    <circle cx="34" cy="35" r="2" fill="#e14b5a"/>
  </g>
  <g>
    <rect x="50" y="40" width="24" height="20" rx="1.5" fill="#f4ecd8" transform="rotate(4 62 50)"/>
    <g stroke="#9c8b78" stroke-width="1.6" stroke-linecap="round" transform="rotate(4 62 50)">
      <path d="M54 46h16M54 50h16M54 54h9"/>
    </g>
    <circle cx="62" cy="39" r="2" fill="#ffd166"/>
  </g>
  <g>
    <rect x="32" y="62" width="26" height="18" rx="1.5" fill="#efe3c8" transform="rotate(-2 45 71)"/>
    <g stroke="#9c8b78" stroke-width="1.6" stroke-linecap="round" transform="rotate(-2 45 71)">
      <path d="M36 68h18M36 72h18M36 76h11"/>
    </g>
    <circle cx="45" cy="61" r="2" fill="#7cc4ff"/>
  </g>
</svg>`;

module.exports = {
  TOWN_TILES, NPCS, WOLF, IMP, SKELETON, DEMON_SOLDIER, IMP_CAPTAIN, DEMON_GENERAL,
  NEW_ITEMS, QUEST_BOARD,
  // 새 NPC 를 다른 파일에서 만들 때 쓴다(tools/art-deep.js)
  person,
};
