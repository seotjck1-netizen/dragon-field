// 보석 아이콘 (64x64).
//
// +10 장비의 홈에 박는 물건이다. 지하감옥에서만 나온다.
// 일곱 개가 한눈에 구분돼야 하므로 색과 깎은 모양을 둘 다 다르게 한다.
//   루비 사각 · 사파이어 물방울 · 에메랄드 육각 · 토파즈 마름모
//   자수정 별 · 오닉스 원 · 다이아몬드 삼각

const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
     <defs>
       <linearGradient id="gshine" x1="0" y1="0" x2="0.3" y2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0.75"/>
         <stop offset="0.5" stop-color="#fff" stop-opacity="0.1"/>
         <stop offset="1" stop-color="#000" stop-opacity="0.25"/>
       </linearGradient>
       <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
         <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
         <stop offset="1" stop-color="#fff" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <ellipse cx="32" cy="56" rx="15" ry="4" fill="#000" opacity="0.28"/>
     ${inner}
   </svg>`;

/**
 * @param {string} lit  밝은 면
 * @param {string} mid  기본 색
 * @param {string} dark 그늘 면
 * @param {string} shape 깎은 모양 path
 * @param {string} facet 안쪽 면을 나누는 선
 */
const gem = (lit, mid, dark, shape, facet) => wrap(`
  <circle cx="32" cy="30" r="24" fill="url(#glow)"/>
  <path d="${shape}" fill="${mid}"/>
  <path d="${facet}" fill="${lit}" opacity="0.85"/>
  <path d="${shape}" fill="url(#gshine)"/>
  <path d="${shape}" fill="none" stroke="${dark}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="25" cy="20" r="3.4" fill="#fff" opacity="0.75"/>
  <circle cx="39" cy="41" r="1.8" fill="#fff" opacity="0.45"/>`);

const GEM_ITEMS = {
  // 사각형으로 깎은 붉은 돌
  gem_ruby: gem('#ff8a92', '#e0344a', '#8c1226',
    'M20 18 L44 18 L50 32 L32 52 L14 32 Z',
    'M20 18 L44 18 L38 30 L26 30 Z'),

  // 물방울 모양 푸른 돌
  gem_sapphire: gem('#8ec4ff', '#2f6fd0', '#123f80',
    'M32 10 Q48 26 48 36 Q48 52 32 52 Q16 52 16 36 Q16 26 32 10 Z',
    'M32 12 Q42 26 42 36 Q42 44 32 46 Q30 30 32 12 Z'),

  // 육각으로 깎은 초록 돌
  gem_emerald: gem('#8ef0b8', '#1fa864', '#0b5c36',
    'M22 14 L42 14 L52 32 L42 50 L22 50 L12 32 Z',
    'M22 14 L42 14 L46 30 L18 30 Z'),

  // 마름모 노란 돌
  gem_topaz: gem('#ffe28a', '#e8a92a', '#8c5f0a',
    'M32 8 L52 32 L32 56 L12 32 Z',
    'M32 8 L52 32 L32 34 L12 32 Z'),

  // 별 모양 보라 돌
  gem_amethyst: gem('#d4a6ff', '#8b4fd4', '#4a1e80',
    'M32 8 L38 24 L54 26 L42 37 L46 53 L32 44 L18 53 L22 37 L10 26 L26 24 Z',
    'M32 8 L38 24 L32 30 L26 24 Z'),

  // 둥근 검은 돌
  gem_onyx: gem('#8a8f9c', '#2e3340', '#12151d',
    'M32 8 A22 22 0 1 1 31.9 8 Z',
    'M32 10 A20 20 0 0 1 50 26 Q40 18 32 20 Q24 18 18 24 A20 20 0 0 1 32 10 Z'),

  // 삼각으로 깎은 흰 돌
  gem_diamond: gem('#ffffff', '#cfe4f5', '#7f9ab0',
    'M32 8 L54 28 L32 56 L10 28 Z',
    'M32 8 L54 28 L32 30 L10 28 Z'),
};

module.exports = { GEM_ITEMS };
