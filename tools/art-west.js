// 서쪽 절벽 들판 — 땅·절벽·용·토큰·마녀.
//
// 여기는 "아무것도 없는" 곳이다. 나무도 꽃도 집도 없다.
// 바람에 깎인 마른 땅과 낭떠러지뿐이고, 30분에 한 번 용이 내려앉는다.
// 그 허전함이 곧 이 땅의 성격이라, 장식을 일부러 넣지 않았다.

const { person } = require('./art-town.js');

// 마른 땅 — 풀이 아니라 갈라진 흙과 바랜 억새.
const wasteBase = `
  <defs>
    <linearGradient id="wb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9a8f74"/><stop offset="1" stop-color="#7b7159"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#wb)"/>
  <path d="M3 8 L9 11 M18 5 L23 9 M6 22 L11 25 M21 20 L27 23 M13 15 L17 17"
        stroke="#6a6047" stroke-width="1.1" opacity="0.55" stroke-linecap="round"/>
  <path d="M8 27 q1.5-4 3 0M24 13 q1.5-4 3 0M15 24 q1.5-4 3 0"
        stroke="#b6a983" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/>
  <rect width="32" height="32" fill="none" stroke="#000" stroke-opacity="0.06"/>`;

const WEST_TILES = {
  // 들판 바닥
  waste: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${wasteBase}</svg>`,

  // 낭떠러지 — 지나갈 수 없다. 아래로 갈수록 어두워져 깊이가 보인다.
  cliff: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6d6552"/><stop offset="0.35" stop-color="#3e3a30"/>
      <stop offset="1" stop-color="#151310"/>
    </linearGradient></defs>
    <rect width="32" height="32" fill="url(#cf)"/>
    <path d="M0 6 L32 6" stroke="#8b8168" stroke-width="2.4" opacity="0.9"/>
    <path d="M0 8.5 L32 8.5" stroke="#211f19" stroke-width="1.4" opacity="0.7"/>
    <path d="M5 10 L7 24 M13 10 L12 26 M21 11 L23 25 M28 10 L27 23"
          stroke="#0d0c0a" stroke-width="1.5" opacity="0.75"/>
    <path d="M9 14 L10 22 M25 15 L24 21" stroke="#565040" stroke-width="1" opacity="0.5"/>
  </svg>`,

  // 절벽 끝 — 땅과 낭떠러지 사이. 밟을 수 있다(가장자리에 설 수 있어야 절벽 같다).
  cliff_edge: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${wasteBase}
    <path d="M0 24 L32 24 L32 32 L0 32 Z" fill="#4a4437"/>
    <path d="M0 24 L32 24" stroke="#a89b7c" stroke-width="2" opacity="0.85"/>
    <path d="M4 26 L5 32 M14 25 L13 32 M24 26 L25 32" stroke="#1c1a15" stroke-width="1.3" opacity="0.7"/>
  </svg>`,

  // 바람에 깎인 바위 하나 — 이 땅에 서 있는 유일한 것
  wind_rock: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${wasteBase}
    <ellipse cx="16" cy="27" rx="8" ry="2.4" fill="#000" opacity="0.25"/>
    <path d="M8 27 L11 14 L16 10 L22 15 L24 27 Z" fill="#7d7462"/>
    <path d="M11 14 L16 10 L18 18 L13 19 Z" fill="#9a9280"/>
    <path d="M18 18 L22 15 L24 27 L19 26 Z" fill="#5f5849"/>
  </svg>`,

  // 잠긴 큰 동굴문 — 절벽에 박힌 검은 아치.
  // 열쇠가 없으면 지나갈 수 없고, 있으면 그대로 걸어 들어간다.
  // 절벽(cliff)과 같은 돌빛을 쓰되 아치와 자물쇠로 "문" 임을 알린다.
  lair_gate: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6d6552"/><stop offset="1" stop-color="#151310"/>
    </linearGradient></defs>
    <rect width="32" height="32" fill="url(#lg)"/>
    <path d="M7 32 L7 15 Q16 5 25 15 L25 32 Z" fill="#0a0910"/>
    <path d="M7 15 Q16 5 25 15" stroke="#8b8168" stroke-width="2" fill="none"/>
    <path d="M9 32 L9 16 Q16 8 23 16 L23 32" stroke="#3a3830" stroke-width="1.2" fill="none"/>
    <path d="M16 8 L16 32" stroke="#2a2822" stroke-width="1.2"/>
    <!-- 자물쇠 -->
    <rect x="13" y="19" width="6" height="5" rx="1" fill="#c9a227"/>
    <path d="M14.5 19 v-2 a1.5 1.5 0 0 1 3 0 v2" stroke="#c9a227" stroke-width="1.3" fill="none"/>
    <circle cx="16" cy="21.5" r="1" fill="#3a2a06"/>
    <!-- 문틈에서 새어 나오는 붉은 빛 -->
    <path d="M16 26 L16 32" stroke="#c0392b" stroke-width="1.6" opacity="0.75"/>
  </svg>`,
};

// ---------------- 큰 용 ----------------
// 이 게임에서 가장 큰 상대다. 다른 몬스터가 48px 안에 들어가는 데 비해
// 이 녀석은 화면 밖으로 나갈 듯 날개를 편다.
const GREAT_DRAGON = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="dg" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#5b3f8f"/><stop offset="0.55" stop-color="#3a2660"/>
      <stop offset="1" stop-color="#1e1338"/>
    </linearGradient>
    <linearGradient id="dw" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7a57b8"/><stop offset="1" stop-color="#2b1c4c"/>
    </linearGradient>
    <radialGradient id="dfire" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffd98a"/><stop offset="1" stop-color="#ff6a1e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="58" rx="20" ry="4" fill="#000" opacity="0.3"/>

  <!-- 펼친 날개 -->
  <path d="M28 30 L4 12 L8 28 L2 26 L10 40 L26 38 Z" fill="url(#dw)"/>
  <path d="M36 30 L60 12 L56 28 L62 26 L54 40 L38 38 Z" fill="url(#dw)"/>
  <path d="M28 30 L10 16 M28 33 L7 27 M28 36 L11 38" stroke="#1c1230" stroke-width="1.1" opacity="0.8"/>
  <path d="M36 30 L54 16 M36 33 L57 27 M36 36 L53 38" stroke="#1c1230" stroke-width="1.1" opacity="0.8"/>

  <!-- 꼬리 -->
  <path d="M32 48 q-10 6 -18 3 q8 5 18 1 Z" fill="#3a2660"/>

  <!-- 몸통 -->
  <ellipse cx="32" cy="38" rx="11" ry="14" fill="url(#dg)"/>
  <path d="M26 34 q6 4 12 0 q-6 8 -12 0 Z" fill="#6a4ea0" opacity="0.7"/>
  <path d="M28 44 q4 3 8 0 q-4 6 -8 0 Z" fill="#6a4ea0" opacity="0.55"/>

  <!-- 목과 머리 -->
  <path d="M29 28 q-1 -10 3 -14 q4 4 3 14 Z" fill="#4a3378"/>
  <ellipse cx="32" cy="14" rx="9" ry="7.5" fill="#5b3f8f"/>
  <path d="M24 12 L18 5 L26 9 Z" fill="#2b1c4c"/>
  <path d="M40 12 L46 5 L38 9 Z" fill="#2b1c4c"/>
  <path d="M25 17 q7 4 14 0 q-7 6 -14 0 Z" fill="#2a1b48"/>

  <!-- 눈 -->
  <ellipse cx="28" cy="13" rx="2.6" ry="3" fill="#ffcf4a"/>
  <ellipse cx="36" cy="13" rx="2.6" ry="3" fill="#ffcf4a"/>
  <ellipse cx="28" cy="13.4" rx="0.9" ry="2.2" fill="#2a1206"/>
  <ellipse cx="36" cy="13.4" rx="0.9" ry="2.2" fill="#2a1206"/>

  <!-- 입김 -->
  <circle cx="32" cy="22" r="6" fill="url(#dfire)" opacity="0.8"/>

  <!-- 앞발 -->
  <path d="M23 48 q-3 5 1 7 l4 -2 Z" fill="#3a2660"/>
  <path d="M41 48 q3 5 -1 7 l-4 -2 Z" fill="#3a2660"/>
</svg>`;


// ---------------- 두 번째 큰 용 ----------------
// 카르나크가 보랏빛 밤이라면 이쪽은 재와 불이다.
// 같은 골격을 쓰되 색과 뿔·비늘을 바꿔, 나란히 놓았을 때 "같은 종족의 다른 개체"로 읽히게 했다.
// 잠긴 동굴 안에 갇혀 있던 놈이라 날개가 찢겨 있고 사슬 자국이 남아 있다.
const ELDER_DRAGON = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="eg" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#a33a24"/><stop offset="0.55" stop-color="#6b1f14"/>
      <stop offset="1" stop-color="#2a0c08"/>
    </linearGradient>
    <linearGradient id="ew" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d1552b"/><stop offset="1" stop-color="#3d120c"/>
    </linearGradient>
    <radialGradient id="efire" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff2c0"/><stop offset="1" stop-color="#ff3b1e" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="58" rx="21" ry="4" fill="#000" opacity="0.35"/>

  <!-- 찢긴 날개 — 갇혀 있던 세월이 보여야 한다 -->
  <path d="M28 30 L3 10 L8 27 L1 25 L10 41 L26 38 Z" fill="url(#ew)"/>
  <path d="M36 30 L61 10 L56 27 L63 25 L54 41 L38 38 Z" fill="url(#ew)"/>
  <path d="M14 20 L17 27 L11 25 Z" fill="#2a0c08"/>
  <path d="M50 20 L47 27 L53 25 Z" fill="#2a0c08"/>
  <path d="M28 30 L9 14 M28 33 L6 26 M28 36 L10 39" stroke="#2a0c08" stroke-width="1.1" opacity="0.85"/>
  <path d="M36 30 L55 14 M36 33 L58 26 M36 36 L54 39" stroke="#2a0c08" stroke-width="1.1" opacity="0.85"/>

  <!-- 꼬리 -->
  <path d="M32 48 q-11 7 -20 3 q9 6 20 1 Z" fill="#6b1f14"/>
  <path d="M12 51 l-6 2 6 2 Z" fill="#2a0c08"/>

  <!-- 몸통 -->
  <ellipse cx="32" cy="38" rx="12" ry="15" fill="url(#eg)"/>
  <path d="M25 33 q7 4 14 0 q-7 9 -14 0 Z" fill="#d1552b" opacity="0.6"/>
  <path d="M27 44 q5 3 10 0 q-5 7 -10 0 Z" fill="#d1552b" opacity="0.45"/>
  <!-- 사슬 자국 -->
  <path d="M22 40 q10 4 20 0" stroke="#6f6a60" stroke-width="1.6" fill="none" opacity="0.7"/>
  <circle cx="26" cy="41" r="1.4" fill="#8a8478"/><circle cx="38" cy="41" r="1.4" fill="#8a8478"/>

  <!-- 목과 머리 -->
  <path d="M29 28 q-1 -11 3 -15 q4 4 3 15 Z" fill="#8a2c1a"/>
  <ellipse cx="32" cy="13" rx="9.5" ry="8" fill="#a33a24"/>
  <!-- 앞으로 굽은 뿔 넷 -->
  <path d="M23 11 L15 3 L25 8 Z" fill="#3d120c"/>
  <path d="M41 11 L49 3 L39 8 Z" fill="#3d120c"/>
  <path d="M26 6 L24 0 L30 5 Z" fill="#2a0c08"/>
  <path d="M38 6 L40 0 L34 5 Z" fill="#2a0c08"/>
  <path d="M25 16 q7 5 14 0 q-7 7 -14 0 Z" fill="#2a0c08"/>
  <path d="M26 17 l2 2 M31 18 l0 2.4 M36 17 l-2 2" stroke="#ffe9b0" stroke-width="1.1"/>

  <!-- 눈 — 카르나크는 금빛, 이쪽은 하얗게 타 있다 -->
  <ellipse cx="28" cy="12" rx="2.8" ry="3.2" fill="#fff3d0"/>
  <ellipse cx="36" cy="12" rx="2.8" ry="3.2" fill="#fff3d0"/>
  <ellipse cx="28" cy="12.4" rx="0.9" ry="2.4" fill="#7a1a06"/>
  <ellipse cx="36" cy="12.4" rx="0.9" ry="2.4" fill="#7a1a06"/>

  <!-- 입김 -->
  <circle cx="32" cy="23" r="7" fill="url(#efire)" opacity="0.9"/>

  <!-- 앞발 -->
  <path d="M22 48 q-4 6 1 8 l5 -2 Z" fill="#6b1f14"/>
  <path d="M42 48 q4 6 -1 8 l-5 -2 Z" fill="#6b1f14"/>
</svg>`;

// ---------------- 용의 징표(토큰) ----------------
const WEST_ITEMS = {
  // 용의 열쇠 — 마녀가 징표 열 개를 받고 내주는 것.
  // 잠긴 동굴문의 자물쇠와 같은 금빛이라, 문 앞에 서면 "이거구나" 가 된다.
  dragon_gate_key: `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="dk" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="#f6e3a6"/><stop offset="0.5" stop-color="#c9a227"/>
        <stop offset="1" stop-color="#7a5c10"/>
      </linearGradient>
      <radialGradient id="dkg" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ff8a3c" stop-opacity="0.8"/>
        <stop offset="1" stop-color="#ff8a3c" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="22" cy="20" r="15" fill="url(#dkg)"/>
    <!-- 용의 머리를 본뜬 손잡이 -->
    <circle cx="22" cy="20" r="10" fill="none" stroke="url(#dk)" stroke-width="5"/>
    <path d="M14 12 L10 5 L18 9 Z" fill="url(#dk)"/>
    <path d="M30 12 L34 5 L26 9 Z" fill="url(#dk)"/>
    <circle cx="22" cy="20" r="4.4" fill="#3a2a06"/>
    <circle cx="20.6" cy="18.6" r="1.6" fill="#ff6a1e"/>
    <!-- 자루와 이빨 -->
    <rect x="19.5" y="29" width="5" height="28" rx="2" fill="url(#dk)"/>
    <rect x="24" y="45" width="9" height="4.4" rx="1.6" fill="url(#dk)"/>
    <rect x="24" y="52" width="6.5" height="4.4" rx="1.6" fill="url(#dk)"/>
  </svg>`,

  dragon_token: `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="tk" x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stop-color="#f2d78a"/><stop offset="0.5" stop-color="#c99a3c"/>
        <stop offset="1" stop-color="#7a5a1e"/>
      </linearGradient>
      <radialGradient id="tkg" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#fff6d4" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#fff6d4" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="32" cy="32" r="23" fill="url(#tk)"/>
    <circle cx="32" cy="32" r="23" fill="none" stroke="#5e440f" stroke-width="2.2"/>
    <circle cx="32" cy="32" r="18" fill="none" stroke="#8f6a22" stroke-width="1.4" opacity="0.8"/>
    <circle cx="32" cy="30" r="16" fill="url(#tkg)"/>
    <!-- 가운데 용의 눈 -->
    <ellipse cx="32" cy="32" rx="11" ry="7" fill="#2a1b48"/>
    <ellipse cx="32" cy="32" rx="9.4" ry="5.6" fill="#7a57b8"/>
    <ellipse cx="32" cy="32" rx="2.2" ry="5.4" fill="#1a0f30"/>
    <path d="M21 32 q11 -8 22 0 q-11 8 -22 0" fill="none" stroke="#f0dca0" stroke-width="1.2" opacity="0.85"/>
    <path d="M32 11 l3 5 -6 0 Z" fill="#8f6a22"/>
    <path d="M32 53 l3 -5 -6 0 Z" fill="#8f6a22"/>
  </svg>`,
};

// ---------------- 마녀 ----------------
// 마을 남서쪽 오두막. 용의 징표만 받는다.
const WITCH = person({
  id: 'witch', skin: '#e9d4bd', skinDark: '#bfa389',
  top: '#4a2f6e', top2: '#2a1a44',
  hair: '#2b2436', hair2: '#4e4460', bottom: '#221636',
  eyes: 'sharp', brow: '#2b2436', blush: 0.2, eyeColor: '#5fe0c0',
  hairShape: 'M26 32 Q26 14 48 14 Q70 14 70 32 Q66 40 62 52 Q58 32 48 30 Q38 32 34 52 Q30 40 26 32 Z',
  mouth: `<path d="M42 47 q6 3 12 -1" stroke="#8a4a58" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  hat: `<!-- 뾰족 모자 -->
        <path d="M48 -6 Q56 12 62 27 L34 27 Q40 12 48 -6 Z" fill="#3a2358"/>
        <path d="M48 -6 Q52 12 56 27 L44 27 Q46 12 48 -6 Z" fill="#503176" opacity="0.8"/>
        <ellipse cx="48" cy="28" rx="31" ry="7" fill="#2c1a44"/>
        <ellipse cx="48" cy="26.6" rx="31" ry="6.4" fill="#432a64"/>
        <rect x="30" y="22" width="36" height="5" rx="2.4" fill="#1e1230"/>
        <circle cx="48" cy="24.5" r="3.4" fill="#5fe0c0"/>
        <circle cx="46.8" cy="23.4" r="1.2" fill="#d6fff4"/>`,
  behind: `<!-- 등 뒤에 뜬 별빛 -->
           <circle cx="20" cy="46" r="1.8" fill="#9fe8d8" opacity="0.8"/>
           <circle cx="76" cy="52" r="1.5" fill="#c8a4ff" opacity="0.75"/>
           <circle cx="14" cy="62" r="1.2" fill="#c8a4ff" opacity="0.6"/>`,
  prop: `<!-- 부글대는 솥 -->
         <ellipse cx="66" cy="92" rx="15" ry="5" fill="#000" opacity="0.25"/>
         <path d="M52 74 q14 -5 28 0 l-3 15 q-11 5 -22 0 Z" fill="#2b2733"/>
         <ellipse cx="66" cy="74.5" rx="14" ry="4.6" fill="#1a1720"/>
         <ellipse cx="66" cy="74" rx="12.4" ry="3.8" fill="#5fe0c0"/>
         <circle cx="61" cy="72.6" r="2" fill="#b6fff0" opacity="0.9"/>
         <circle cx="70" cy="73.4" r="1.4" fill="#b6fff0" opacity="0.8"/>
         <circle cx="66" cy="66" r="2.6" fill="#9fe8d8" opacity="0.55"/>
         <circle cx="70" cy="60" r="1.8" fill="#9fe8d8" opacity="0.4"/>
         <!-- 지팡이 -->
         <g transform="rotate(-14 26 66)">
           <rect x="23" y="34" width="5" height="56" rx="2.5" fill="#4a3a26"/>
           <circle cx="25.5" cy="32" r="6.5" fill="#5fe0c0" opacity="0.35"/>
           <circle cx="25.5" cy="32" r="4" fill="#9fe8d8"/>
           <circle cx="24.4" cy="30.6" r="1.5" fill="#f0fffb"/>
         </g>`,
});

module.exports = { WEST_TILES, GREAT_DRAGON, ELDER_DRAGON, WEST_ITEMS, WITCH };
