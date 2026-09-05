// 11~20단계(심층)에서 새로 쓰는 아트 — 지하감옥 타일, 웨이포인트 돌, 성문 무기상, 룬 장비 아이콘.
// gen-assets.js 가 이 파일을 읽어 함께 굽는다. (게임 실행과 무관)

const t = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;

const item = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
     <defs>
       <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0.45"/>
         <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
       </linearGradient>
     </defs>${inner}</svg>`;

// ---------------- 지하감옥 타일 ----------------
const DEEP_TILES = {
  dungeon_floor: t(`
    <rect width="32" height="32" fill="#3b3a46"/>
    <g stroke="#2c2b36" stroke-width="1.3">
      <path d="M0 10.5h32M0 21.5h32"/>
      <path d="M11 0v10.5M21 10.5v11M6 21.5v10.5M25 21.5v10.5"/>
    </g>
    <rect x="2" y="2" width="7" height="6" fill="#474655" opacity="0.7"/>
    <rect x="23" y="13" width="6" height="6" fill="#474655" opacity="0.5"/>
    <circle cx="17" cy="27" r="1.2" fill="#2a2933" opacity="0.9"/>`),

  dungeon_wall: t(`
    <rect width="32" height="32" fill="#26252f"/>
    <g stroke="#1a1922" stroke-width="1.6">
      <path d="M0 11h32M0 22h32"/><path d="M9 0v11M23 11v11M14 22v10"/>
    </g>
    <rect x="1" y="1" width="7" height="8" fill="#33323f"/>
    <rect x="24" y="12" width="7" height="8" fill="#33323f" opacity="0.8"/>
    <path d="M4 24q3-4 6 0" stroke="#3d5a3a" stroke-width="1.4" fill="none" opacity="0.6"/>`),

  // 아래로 내려가는 계단 — 밟으면 지하감옥 입구
  stairs_down: t(`
    <rect width="32" height="32" fill="#2b2a34"/>
    <path d="M0 6h32v5H0z" fill="#4a4957"/>
    <path d="M3 12h26v5H3z" fill="#3e3d4a"/>
    <path d="M6 18h20v5H6z" fill="#33323d"/>
    <path d="M9 24h14v6H9z" fill="#191820"/>
    <path d="M0 6h32v1.4H0z" fill="#5d5c6c"/>
    <path d="M3 12h26v1.2H3z" fill="#51505e"/>
    <path d="M6 18h20v1.2H6z" fill="#454452"/>`),


  // 위로 올라가는 계단 — 밟으면 한 층 위(1층에서는 성)로 나간다.
  //
  // 0.40 이전에는 이 자리가 **맨바닥이었다.** 내려오는 계단만 그림이 있고
  // 올라가는 자리는 아무 표시가 없어서, 1층에서 성으로 돌아가는 길을 못 찾고
  // 지도를 헤매는 일이 있었다. 내려가는 계단과 **반대로** 그린다 —
  // 위쪽이 밝고 넓게 열려 있어 "여기로 나간다"가 한눈에 보이게.
  stairs_up: t(`
    <rect width="32" height="32" fill="#2b2a34"/>
    <path d="M9 2h14v6H9z" fill="#6f6d80"/>
    <path d="M6 9h20v5H6z" fill="#5d5b6d"/>
    <path d="M3 15h26v5H3z" fill="#4d4b5c"/>
    <path d="M0 21h32v5H0z" fill="#3e3d4a"/>
    <path d="M9 2h14v1.4H9z" fill="#8e8ca3"/>
    <path d="M6 9h20v1.3H6z" fill="#7d7b91"/>
    <path d="M3 15h26v1.2H3z" fill="#6b6a7e"/>
    <path d="M0 21h32v1.2H0z" fill="#5a5969"/>
    <path d="M12 0h8v3h-8z" fill="#cfd6e8" opacity="0.5"/>`),

  // 왕실 대장간 — 성 안. 불을 문 화덕과 모루 두 칸으로 "여기가 대장간"을 알린다.
  forge_hearth: t(`
    <rect width="32" height="32" fill="#2a2230"/>
    <rect x="2" y="6" width="28" height="24" rx="3" fill="#4a3b33"/>
    <rect x="4" y="8" width="24" height="20" rx="2" fill="#2a1c18"/>
    <path d="M16 26 q-7 -3 -6 -9 q3 3 4 1 q-1 -5 3 -8 q-1 5 3 7 q2 -1 2 -4 q3 5 0 10 q-2 3 -6 3 Z" fill="#ff8a2b"/>
    <path d="M16 25 q-4 -2 -3.5 -6 q2 2 2.6 0.6 q-0.6 -3 1.9 -5 q-0.6 3 1.9 4.4 q1.2 -0.6 1.2 -2.4 q1.9 3 0 6.4 q-1.2 2 -4.1 2 Z" fill="#ffd45e"/>
    <rect x="0" y="29" width="32" height="3" fill="#3a3040"/>
    <rect x="9" y="2" width="14" height="4" rx="1.5" fill="#5a4a40"/>`),

  forge_anvil: t(`
    <rect width="32" height="32" fill="#2a2230"/>
    <rect x="0" y="24" width="32" height="8" fill="#4a3a2c"/>
    <rect x="11" y="21" width="10" height="5" rx="1" fill="#4a3a2c"/>
    <path d="M5 12 L27 12 L24 17 L20 17 L20 21 L12 21 L12 17 L8 17 Z" fill="#7d879a"/>
    <path d="M5 12 L27 12 L26 14 L6 14 Z" fill="#aab4c6"/>
    <path d="M12 17h8v1.4h-8z" fill="#5d6577"/>
    <g transform="rotate(-32 22 8)">
      <rect x="20" y="1" width="3.4" height="13" rx="1.6" fill="#7a4a22"/>
      <rect x="15" y="0" width="13" height="6" rx="2" fill="#8b95a6"/>
      <rect x="15" y="0" width="13" height="2.2" rx="1.1" fill="#b6c0d0"/>
    </g>
    <circle cx="9" cy="9" r="1.2" fill="#ffd45e" opacity="0.8"/>
    <circle cx="6" cy="14" r="0.9" fill="#ff8a2b" opacity="0.7"/>`),

  // 장비 가판대 — 성 안 무기상 카일의 좌판. 여기가 상점이라는 걸 그림으로 알린다.
  stall_weapon: t(`
    <rect width="32" height="32" fill="#3a2f22"/>
    <rect x="0" y="9" width="32" height="4" fill="#6b4a2a"/>
    <rect x="0" y="9" width="32" height="1.4" fill="#8d6438"/>
    <g stroke="#5a3d22" stroke-width="2"><path d="M4 13v19M28 13v19"/></g>
    <path d="M10 2 L13 8 L13 9 L7 9 L7 8 Z" fill="#cfd8e6"/>
    <rect x="8.6" y="9" width="2.8" height="3" fill="#8d6438"/>
    <path d="M22 2 q6 4 0 8" stroke="#7ea8d8" stroke-width="2.2" fill="none"/>
    <path d="M22 2 L22 10" stroke="#dfe9f5" stroke-width="1.2"/>
    <rect x="0" y="20" width="32" height="3" fill="#4a3a28"/>
    <rect x="12" y="14" width="9" height="5" rx="1.5" fill="#8b95a6"/>`),

  stall_armor: t(`
    <rect width="32" height="32" fill="#3a2f22"/>
    <rect x="0" y="9" width="32" height="4" fill="#6b4a2a"/>
    <rect x="0" y="9" width="32" height="1.4" fill="#8d6438"/>
    <g stroke="#5a3d22" stroke-width="2"><path d="M4 13v19M28 13v19"/></g>
    <path d="M9 1 L16 -2 L23 1 L23 7 Q16 11 9 7 Z" fill="#5f6b86"/>
    <path d="M9 1 L16 -2 L23 1 L23 4 Q16 7 9 4 Z" fill="#7b88a6"/>
    <rect x="4" y="14" width="6" height="7" rx="2" fill="#cfe4ff" opacity="0.6"/>
    <rect x="4" y="17" width="6" height="4" rx="1.5" fill="#ff6b8a"/>
    <rect x="21" y="14" width="6" height="7" rx="2" fill="#cfe4ff" opacity="0.6"/>
    <rect x="21" y="17" width="6" height="4" rx="1.5" fill="#7ef0b0"/>
    <rect x="0" y="22" width="32" height="3" fill="#4a3a28"/>`),

  // 웨이포인트 돌이 박힌 바닥 — 광장 한가운데
  waypoint_pad: t(`
    <rect width="32" height="32" fill="#b9a894"/>
    <circle cx="16" cy="16" r="13" fill="#6b6480"/>
    <circle cx="16" cy="16" r="10" fill="#3f3a56"/>
    <circle cx="16" cy="16" r="6" fill="#7cc4ff" opacity="0.35"/>
    <g stroke="#9fd6ff" stroke-width="1.1" fill="none" opacity="0.9">
      <path d="M16 6v5M16 21v5M6 16h5M21 16h5"/>
      <path d="M9 9l3.5 3.5M23 9l-3.5 3.5M9 23l3.5-3.5M23 23l-3.5-3.5"/>
    </g>
    <circle cx="16" cy="16" r="2.4" fill="#dff1ff"/>`),
};

// ---------------- 웨이포인트 돌(오브젝트) ----------------
const WAYPOINT_STONE = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="wpstone" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5b5478"/><stop offset="1" stop-color="#2a2540"/>
    </linearGradient>
    <radialGradient id="wpglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#bfe6ff" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#5aa8ff" stop-opacity="0.5"/>
      <stop offset="1" stop-color="#5aa8ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="48" cy="116" rx="30" ry="9" fill="#000" opacity="0.28"/>
  <ellipse cx="48" cy="112" rx="27" ry="8" fill="#4a4358"/>
  <path d="M30 112 L34 40 Q48 22 62 40 L66 112 Z" fill="url(#wpstone)"/>
  <path d="M34 40 Q48 22 62 40 L60 52 Q48 38 36 52 Z" fill="#7a7099" opacity="0.5"/>
  <circle cx="48" cy="66" r="26" fill="url(#wpglow)"/>
  <g stroke="#9fd6ff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="0.95">
    <path d="M48 48v10M48 76v10M36 66h8M52 66h8"/>
    <path d="M39 57l6 6M57 57l-6 6M39 75l6-6M57 75l-6-6"/>
  </g>
  <circle cx="48" cy="66" r="6" fill="#dff1ff"/>
  <circle cx="48" cy="66" r="3" fill="#fff"/>
  <g stroke="#8fc9ff" stroke-width="1.6" opacity="0.55" fill="none">
    <path d="M36 92h24M38 100h20"/>
  </g>
</svg>`;

// ---------------- 룬 장비 아이콘 ----------------
const runeGlow = (c) =>
  `<g stroke="${c}" stroke-width="1.6" fill="none" opacity="0.9" stroke-linecap="round">`;

const DEEP_ITEMS = {
  // 악마의 파편(socket_drill) — 지하감옥 깊은 곳에서만 나온다. 장비에 홈을 하나 더 만든다.
  // 장비가 아니라 도구이므로, 무기처럼 날을 세우지 않고 자루와 끝을 강조했다.
  socket_drill: item(`
    <rect x="26" y="8" width="12" height="16" rx="5" fill="#8d6438"/>
    <rect x="26" y="8" width="4" height="16" rx="2" fill="#a8763f"/>
    <rect x="24" y="22" width="16" height="6" rx="3" fill="#5a4a3a"/>
    <path d="M28 28 L36 28 L34 46 L32 56 L30 46 Z" fill="#cfd8e6"/>
    <path d="M28 28 L32 28 L31 46 L32 56 Z" fill="#f2f6ff"/>
    <g stroke="#7f9ab0" stroke-width="1.2" fill="none" opacity="0.8">
      <path d="M29 34h6M29.4 39h5.2M30 44h4"/>
    </g>
    <g stroke="#ffd88a" stroke-width="1.6" fill="none" opacity="0.9" stroke-linecap="round">
      <path d="M46 18l4-4M50 22h5M44 26l4 4"/>
    </g>
    <circle cx="32" cy="57" r="2.2" fill="#fff3cf"/>
    <path d="M26 8 L38 8 L38 14 L26 14 Z" fill="url(#shine)"/>`),

  frost_blade: item(`
    <path d="M32 4 L40 20 L40 42 L32 50 L24 42 L24 20 Z" fill="#bfe6ff"/>
    <path d="M32 4 L32 50 L24 42 L24 20 Z" fill="#8fc9ff"/>
    <rect x="18" y="46" width="28" height="5" rx="2.5" fill="#4a6a8a"/>
    <rect x="29" y="50" width="6" height="12" rx="3" fill="#6b4a2a"/>
    <circle cx="32" cy="56" r="3.2" fill="#bfe6ff"/>
    ${runeGlow('#eaf7ff')}<path d="M28 24h8M32 20v8M27 34l10 0"/></g>
    <path d="M32 4 L40 20 L32 24 Z" fill="url(#shine)"/>`),

  storm_bow: item(`
    <path d="M20 8 Q46 32 20 56" stroke="#4a5f7a" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M20 8 Q46 32 20 56" stroke="#7ea8d8" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M20 8 L20 56" stroke="#dfe9f5" stroke-width="1.8"/>
    <path d="M31 20 L25 33 L33 33 L27 46" stroke="#ffe066" stroke-width="3" fill="none"
          stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="20" cy="8" r="3.2" fill="#9fd6ff"/>
    <circle cx="20" cy="56" r="3.2" fill="#9fd6ff"/>`),

  ember_staff: item(`
    <rect x="29" y="18" width="6" height="44" rx="3" fill="#6b4a2a"/>
    <rect x="29" y="18" width="2.4" height="44" fill="#8d6438"/>
    <path d="M32 4 Q46 12 42 24 Q38 34 32 34 Q26 34 22 24 Q18 12 32 4 Z" fill="#ff8a3d"/>
    <path d="M32 10 Q41 16 38 24 Q35 30 32 30 Q29 30 26 24 Q23 16 32 10 Z" fill="#ffd166"/>
    <circle cx="32" cy="24" r="4" fill="#fff3c4"/>
    <path d="M24 34h16l-3 6H27Z" fill="#5a3d22"/>`),

  rune_mail: item(`
    <path d="M16 14 L32 8 L48 14 L48 40 Q32 58 16 40 Z" fill="#5f6b86"/>
    <path d="M16 14 L32 8 L48 14 L48 22 Q32 30 16 22 Z" fill="#7b88a6"/>
    <path d="M16 14 L32 8 L48 14 L48 40 Q32 58 16 40 Z" fill="url(#shine)"/>
    ${runeGlow('#9fd6ff')}
      <path d="M26 24h12M32 20v14M24 32l4 6M40 32l-4 6M28 44h8"/></g>
    <circle cx="32" cy="27" r="2.4" fill="#dff1ff"/>`),

  rune_pauldron: item(`
    <path d="M12 30 Q32 10 52 30 L48 44 Q32 34 16 44 Z" fill="#5f6b86"/>
    <path d="M12 30 Q32 10 52 30 L50 36 Q32 20 14 36 Z" fill="#7b88a6"/>
    <path d="M14 44 Q32 36 50 44 L48 52 Q32 46 16 52 Z" fill="#4c566d"/>
    ${runeGlow('#9fd6ff')}<path d="M26 28h12M32 22v12"/></g>`),

  rune_gauntlet: item(`
    <path d="M18 22 h28 v22 q0 8-14 8 t-14-8 Z" fill="#5f6b86"/>
    <path d="M18 22 h28 v8 H18 Z" fill="#7b88a6"/>
    <g fill="#4c566d"><rect x="20" y="12" width="6" height="12" rx="3"/>
      <rect x="29" y="9" width="6" height="15" rx="3"/><rect x="38" y="12" width="6" height="12" rx="3"/></g>
    ${runeGlow('#ffcf6b')}<path d="M27 36h10M32 31v10"/></g>`),

  rune_boots: item(`
    <path d="M22 10 h14 v28 l12 8 v8 H22 Z" fill="#5f6b86"/>
    <path d="M22 10 h14 v8 H22 Z" fill="#7b88a6"/>
    <path d="M20 46 h30 v8 H20 Z" fill="#3a4256"/>
    ${runeGlow('#7ef0b0')}<path d="M27 22h6M27 30h10"/></g>
    <path d="M46 16l-8 8M52 22l-8 8" stroke="#9fd6ff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`),

  rune_belt: item(`
    <rect x="6" y="26" width="52" height="13" rx="4" fill="#6b4a2a"/>
    <rect x="6" y="26" width="52" height="5" rx="2.5" fill="#8d6438"/>
    <rect x="24" y="20" width="16" height="25" rx="4" fill="#c9a13d"/>
    <rect x="28" y="25" width="8" height="15" rx="2" fill="#3a2f18"/>
    ${runeGlow('#c48fff')}<path d="M14 33h6M44 33h6"/></g>
    <circle cx="32" cy="32" r="3" fill="#e6c76a"/>`),

  rune_amulet: item(`
    <path d="M20 12 Q32 26 44 12" stroke="#c9a13d" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <path d="M20 12 Q10 34 32 34 Q54 34 44 12" stroke="#c9a13d" stroke-width="3" fill="none"/>
    <path d="M32 32 L44 42 L38 56 H26 L20 42 Z" fill="#5f6b86"/>
    <path d="M32 32 L44 42 L38 48 H26 L20 42 Z" fill="#7b88a6"/>
    ${runeGlow('#9fd6ff')}<path d="M28 44h8M32 40v10"/></g>`),

  greater_potion: item(`
    <rect x="26" y="8" width="12" height="10" rx="2" fill="#8b5a2b"/>
    <path d="M24 18 h16 l8 12 v22 q0 6-6 6 H22 q-6 0-6-6 V30 Z" fill="#cfe4ff" opacity="0.45"/>
    <path d="M18 34 h28 v18 q0 4-4 4 H22 q-4 0-4-4 Z" fill="#ff6b8a"/>
    <path d="M18 34 h28 v5 H18 Z" fill="#ff96ae"/>
    <circle cx="26" cy="44" r="2.4" fill="#ffd7e2" opacity="0.9"/>
    <circle cx="36" cy="48" r="1.8" fill="#ffd7e2" opacity="0.8"/>
    <path d="M24 18 h6 v34 h-6 Z" fill="url(#shine)"/>
    <path d="M30 26 l4 0 0 -4 4 0 0 4 4 0 0 4 -4 0 0 4 -4 0 0 -4 -4 0 Z" fill="#fff" opacity="0.55"/>`),

  // 거대 물약 — 희귀 회복약 열 개를 한 병에 눌러 담았다.
  // 같은 계열로 보이되 한눈에 더 크고 진하게: 병을 넓히고 금테를 둘렀다.
  mega_potion: item(`
    <rect x="24" y="4" width="16" height="10" rx="2" fill="#7a4a1e"/>
    <rect x="22" y="12" width="20" height="5" rx="2" fill="#c9a13d"/>
    <path d="M20 17 h24 l10 14 v22 q0 7-7 7 H17 q-7 0-7-7 V31 Z" fill="#cfe4ff" opacity="0.42"/>
    <path d="M12 32 h40 v21 q0 5-5 5 H17 q-5 0-5-5 Z" fill="#ff3d63"/>
    <path d="M12 32 h40 v6 H12 Z" fill="#ff7d9b"/>
    <circle cx="22" cy="44" r="3.2" fill="#ffe0e8" opacity="0.95"/>
    <circle cx="34" cy="49" r="2.4" fill="#ffe0e8" opacity="0.85"/>
    <circle cx="43" cy="42" r="1.8" fill="#ffe0e8" opacity="0.8"/>
    <path d="M20 17 h7 v40 h-7 Z" fill="url(#shine)"/>
    <g stroke="#ffd166" stroke-width="2.2" fill="none" stroke-linecap="round">
      <path d="M12 40 h40"/>
    </g>
    <path d="M28 24 l4 0 0 -5 5 0 0 5 5 0 0 4 -5 0 0 5 -5 0 0 -5 -4 0 Z" fill="#fff" opacity="0.6"/>`),

  dragon_ring: item(`
    <circle cx="32" cy="38" r="18" fill="none" stroke="#c9a13d" stroke-width="7"/>
    <circle cx="32" cy="38" r="18" fill="none" stroke="#e6c76a" stroke-width="2.6"/>
    <path d="M32 8 L42 20 L32 30 L22 20 Z" fill="#ff5a4a"/>
    <path d="M32 8 L42 20 L32 24 Z" fill="#ff9a72"/>
    <path d="M32 12 L38 20 L32 26 L26 20 Z" fill="#ffd166" opacity="0.75"/>
    <circle cx="32" cy="20" r="2.6" fill="#fff3c4"/>`),
};

// ---------------- 성문 무기상 ----------------
// 성문 앞에 좌판을 편 상인. 등에 룬 검을 메고 있다.
const { person } = require('./art-town.js');

// 무기상 카일 — 전장을 겪은 장사꾼. 안대, 흉터, 챙 넓은 모자.
const GATE_MERCHANT = person({
  id: 'gatem', skin: '#e0b083', skinDark: '#b0814f',
  top: '#3f5b8c', top2: '#26385a',
  hair: '#3a2a18', hair2: '#6b4b26', bottom: '#2e3448',
  eyes: 'sharp', beard: 'short', beardColor: '#3a2a18', brow: '#3a2a18', blush: 0,
  hairShape: 'M28 30 Q30 16 48 16 Q66 16 68 30 Q60 24 48 25 Q36 24 28 30 Z',
  mouth: `<path d="M42 47 q6 2.2 12 0" stroke="#7a4a38" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  hat: `<!-- 챙 넓은 가죽 모자 -->
        <path d="M28 26 Q48 8 68 26 L68 31 Q48 20 28 31 Z" fill="#5a3d22"/>
        <path d="M30 24 Q48 12 66 24 Q48 18 30 24 Z" fill="#7a5230"/>
        <ellipse cx="48" cy="30" rx="28" ry="6.5" fill="#6b4a2a"/>
        <ellipse cx="48" cy="28.8" rx="28" ry="6" fill="#8d6438"/>
        <rect x="20" y="26" width="56" height="4.5" rx="2.2" fill="#4a3018"/>
        <path d="M62 26 l6 -3 l2 5 Z" fill="#c9a06a"/>`,
  faceMark: `<!-- 안대와 흉터 -->
             <path d="M30 30 L62 42" stroke="#3a2a18" stroke-width="2.4"/>
             <ellipse cx="56.5" cy="36.6" rx="7" ry="6" fill="#2e2318"/>
             <ellipse cx="56.5" cy="35.6" rx="5.8" ry="4.6" fill="#463526"/>
             <path d="M34 44 l4 6" stroke="#c98a5c" stroke-width="1.6" stroke-linecap="round"/>`,
  prop: `<!-- 세워 둔 대검 -->
         <g transform="rotate(28 22 70)">
           <rect x="19" y="34" width="7" height="46" rx="3" fill="#bfe6ff"/>
           <rect x="19" y="34" width="2.8" height="46" rx="1.4" fill="#eaf6ff"/>
           <rect x="14" y="80" width="17" height="5" rx="2.5" fill="#4a6a8a"/>
           <rect x="20" y="85" width="5" height="11" rx="2.5" fill="#6b4a2a"/>
         </g>
         <!-- 가판대 궤짝 -->
         <rect x="35" y="70" width="28" height="19" rx="4" fill="#8d6438"/>
         <rect x="35" y="70" width="28" height="5" rx="2.5" fill="#a8763f"/>
         <path d="M35 80 h28" stroke="#6b4a2a" stroke-width="1.4"/>
         <circle cx="45" cy="68" r="4.8" fill="#9fd6ff"/>
         <circle cx="43.6" cy="66.4" r="1.6" fill="#e8f6ff"/>
         <circle cx="55" cy="67" r="4.8" fill="#ff8a3d"/>
         <circle cx="53.6" cy="65.4" r="1.6" fill="#ffd0a8"/>`,
});

module.exports = { DEEP_TILES, DEEP_ITEMS, WAYPOINT_STONE, GATE_MERCHANT };
