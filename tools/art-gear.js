// 신규 장비 아이콘 + 마을 간판 타일.
// gen-assets.js 가 함께 굽는다.

const item = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
const tile = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;

// ---------------- 어깨 / 장갑 / 신발 / 벨트 / 목걸이 ----------------
const GEAR_ITEMS = {
  leather_pauldron: item(`
    <path d="M14 26 a18 12 0 0 1 36 0 l-2 18 q-16 6 -32 0 Z" fill="#9c6b3f"/>
    <path d="M14 26 a18 12 0 0 1 36 0 l-1 6 q-17 -8 -34 0 Z" fill="#c08a55"/>
    <circle cx="24" cy="34" r="2.4" fill="#d9b48a"/><circle cx="40" cy="34" r="2.4" fill="#d9b48a"/>
    <path d="M16 44 q16 6 32 0" stroke="#6b4423" stroke-width="2.5" fill="none"/>`),

  steel_pauldron: item(`
    <path d="M12 28 a20 13 0 0 1 40 0 l-2 16 q-18 6 -36 0 Z" fill="#8f97ab"/>
    <path d="M12 28 a20 13 0 0 1 40 0 l-1 5 q-19 -8 -38 0 Z" fill="#d6dde8"/>
    <path d="M20 36 q12 5 24 0" stroke="#6b7285" stroke-width="2" fill="none"/>
    <circle cx="32" cy="30" r="3.4" fill="#ffd166"/>
    <path d="M14 44 q18 6 36 0" stroke="#6b7285" stroke-width="2.5" fill="none"/>`),

  cloth_gloves: item(`
    <path d="M20 22 h18 q6 0 6 6 v14 q0 8 -8 8 h-10 q-8 0 -8 -8 v-14 q0 -6 2 -6 Z" fill="#e8ddc4"/>
    <path d="M20 22 q-6 -8 -2 -12 q5 -2 7 4 l1 8 Z" fill="#e8ddc4"/>
    <path d="M22 42 h20" stroke="#b9a67f" stroke-width="3" stroke-linecap="round"/>
    <path d="M26 24 v10M32 24 v10M38 24 v10" stroke="#cdbf9d" stroke-width="1.8"/>`),

  steel_gauntlet: item(`
    <path d="M20 22 h18 q6 0 6 6 v14 q0 8 -8 8 h-10 q-8 0 -8 -8 v-14 q0 -6 2 -6 Z" fill="#b7bfd0"/>
    <path d="M20 22 q-6 -8 -2 -12 q5 -2 7 4 l1 8 Z" fill="#d6dde8"/>
    <rect x="19" y="27" width="26" height="4" rx="2" fill="#8f97ab"/>
    <rect x="19" y="34" width="26" height="4" rx="2" fill="#8f97ab"/>
    <path d="M22 44 h20" stroke="#ffd166" stroke-width="3" stroke-linecap="round"/>`),

  leather_boots: item(`
    <path d="M22 10 h12 v26 l10 6 v10 H22 Z" fill="#9c6b3f"/>
    <path d="M22 10 h6 v26 l10 6 v10 h-16 Z" fill="#c08a55"/>
    <rect x="20" y="46" width="28" height="6" rx="3" fill="#5d3d22"/>
    <path d="M23 20 h10M23 27 h10" stroke="#6b4423" stroke-width="2"/>`),

  swift_boots: item(`
    <path d="M22 10 h12 v26 l10 6 v10 H22 Z" fill="#2f8f8a"/>
    <path d="M22 10 h6 v26 l10 6 v10 h-16 Z" fill="#4fd6c0"/>
    <rect x="20" y="46" width="28" height="6" rx="3" fill="#1d5f5c"/>
    <g stroke="#eafffb" stroke-width="2.4" stroke-linecap="round">
      <path d="M12 18 h8M10 26 h10M13 34 h7"/>
    </g>`),

  leather_belt: item(`
    <rect x="6" y="26" width="52" height="12" rx="4" fill="#9c6b3f"/>
    <rect x="6" y="26" width="52" height="4" rx="2" fill="#c08a55"/>
    <rect x="26" y="22" width="14" height="20" rx="3" fill="#ffd166"/>
    <rect x="30" y="26" width="6" height="12" rx="2" fill="#131a2c"/>
    <circle cx="16" cy="32" r="2" fill="#6b4423"/><circle cx="50" cy="32" r="2" fill="#6b4423"/>`),

  mana_belt: item(`
    <rect x="6" y="26" width="52" height="12" rx="4" fill="#4b2f7a"/>
    <rect x="6" y="26" width="52" height="4" rx="2" fill="#7b4fd4"/>
    <path d="M32 18 l10 14 l-10 14 l-10 -14 Z" fill="#7cc4ff"/>
    <path d="M32 24 l6 8 l-6 8 l-6 -8 Z" fill="#dff1ff"/>
    <circle cx="14" cy="32" r="2" fill="#a05cff"/><circle cx="50" cy="32" r="2" fill="#a05cff"/>`),

  wood_amulet: item(`
    <path d="M18 12 q14 10 28 0" stroke="#8b5a2b" stroke-width="3" fill="none"/>
    <path d="M18 12 q-2 18 14 22 q16 -4 14 -22" stroke="#a3702f" stroke-width="2.4" fill="none"/>
    <circle cx="32" cy="40" r="11" fill="#a3702f"/>
    <circle cx="32" cy="40" r="7" fill="#c89a5e"/>
    <path d="M32 34 v12M27 40 h10" stroke="#7a5a34" stroke-width="2"/>`),

  guard_amulet: item(`
    <path d="M18 12 q14 10 28 0" stroke="#8f97ab" stroke-width="3" fill="none"/>
    <path d="M18 12 q-2 18 14 22 q16 -4 14 -22" stroke="#b7bfd0" stroke-width="2.4" fill="none"/>
    <path d="M32 28 l12 5 v10 q0 8 -12 13 q-12 -5 -12 -13 v-10 Z" fill="#b7bfd0"/>
    <path d="M32 28 l12 5 v6 q-12 -5 -12 -5 Z" fill="#eef3fa"/>
    <circle cx="32" cy="42" r="4" fill="#7cc4ff"/>`),
};

// ---------------- 마을 간판 (드래곤퀘스트식) ----------------
// 집 벽 위에 나무 판을 달아 무슨 가게인지 알려 준다.
function signboard(iconSvg, plate = '#a3702f') {
  return tile(`
    <rect width="32" height="32" fill="#e3d3b4"/>
    <rect y="0" width="32" height="3" fill="#c9b795"/>
    <g stroke="#8a6a45" stroke-width="2.4"><path d="M4 3v29M28 3v29"/></g>
    <rect x="14" y="2" width="4" height="5" fill="#6b4423"/>
    <rect x="4" y="6" width="24" height="20" rx="3" fill="${plate}"/>
    <rect x="6" y="8" width="20" height="16" rx="2" fill="#d8b98a"/>
    ${iconSvg}
    <path d="M4 26 h24" stroke="#6b4423" stroke-width="2"/>`);
}

const SIGN_TILES = {
  sign_item: signboard(`
    <path d="M14 11h4v3l3 4a5 5 0 0 1-10 0l3-4Z" fill="#cfe4ff"/>
    <path d="M11 17a5 5 0 0 0 10 0Z" fill="#e14b5a"/>
    <rect x="13.5" y="9" width="5" height="2.4" rx="1" fill="#6b4423"/>`),

  sign_weapon: signboard(`
    <g transform="rotate(-40 16 16)">
      <rect x="14.6" y="8" width="2.8" height="11" fill="#cfd8e6"/>
      <rect x="12.4" y="18.6" width="7.2" height="2" rx="1" fill="#ffd166"/>
      <rect x="15" y="20.4" width="2" height="4" rx="1" fill="#6b4423"/>
    </g>
    <g transform="rotate(38 16 16)">
      <rect x="15.2" y="12" width="1.8" height="11" rx="0.8" fill="#7a4a22"/>
      <rect x="12" y="9" width="8.4" height="4.4" rx="1.4" fill="#8f97ab"/>
    </g>`, '#8c3b2f'),

  sign_alchemy: signboard(`
    <path d="M14 9h4v4l4 7a5.4 5.4 0 0 1-12 0l4-7Z" fill="#cfe4ff" opacity="0.85"/>
    <path d="M10.6 18a5.4 5.4 0 0 0 10.8 0Z" fill="#7ef0b0"/>
    <circle cx="14" cy="20" r="1.2" fill="#eafffb"/>
    <circle cx="18" cy="21" r="0.9" fill="#eafffb"/>
    <rect x="13.5" y="7.4" width="5" height="2.4" rx="1" fill="#6b4423"/>`, '#2f8f8a'),

  sign_inn: signboard(`
    <rect x="8" y="17" width="16" height="5" rx="1.6" fill="#f4ecd8"/>
    <rect x="8" y="13" width="6" height="5" rx="2" fill="#f4ecd8"/>
    <rect x="7" y="21" width="18" height="2.6" rx="1.2" fill="#7a4a22"/>
    <path d="M17 13 q3 -4 6 0" stroke="#7a4a22" stroke-width="1.6" fill="none"/>
    <circle cx="20" cy="10" r="1.4" fill="#ffd166"/>`, '#7245a1'),
};

module.exports = { GEAR_ITEMS, SIGN_TILES };
