// 보스가 있는 들판의 화산 지형 타일.
//
// 지형 자체는 다른 들판과 똑같이 생성된다(같은 씨앗, 같은 길, 같은 덤불 배치).
// 여기서 바꾸는 것은 "무엇으로 그리느냐" 하나뿐이다 —
// 풀은 잿더미로, 나무는 타 버린 둥치로, 바위는 검은 현무암으로, 물은 마그마로.
// 그래서 보스 방에 들어서는 순간 같은 길인데 다른 땅이라는 게 눈으로 보인다.

// 잿더미 바닥 — 다른 들판의 grassBase 자리를 대신한다.
const ashBase = `
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b3230"/><stop offset="1" stop-color="#241d1c"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#a)"/>
  <path d="M4 26q2-4 4 0M12 21q2-4 4 0M22 27q2-4 4 0M26 14q2-4 4 0M8 12q2-4 4 0M17 8q2-4 4 0"
        stroke="#584a46" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.75"/>
  <circle cx="9" cy="18" r="0.9" fill="#7a3a20" opacity="0.5"/>
  <circle cx="24" cy="9" r="0.8" fill="#7a3a20" opacity="0.45"/>
  <rect width="32" height="32" fill="none" stroke="#000" stroke-opacity="0.12"/>`;

const VOLCANO_TILES = {
  // 바닥 — 식은 화산재
  ash: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase}</svg>`,

  // 길 — 굳은 용암이 갈라진 자국
  ash_path: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><linearGradient id="ap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#57484a"/><stop offset="1" stop-color="#3d3234"/>
    </linearGradient></defs>
    <rect width="32" height="32" fill="url(#ap)"/>
    <path d="M3 7 L11 12 L9 21 L17 27" stroke="#c14a1e" stroke-width="1.1" fill="none" opacity="0.55"/>
    <path d="M21 2 L24 11 L31 15" stroke="#c14a1e" stroke-width="0.9" fill="none" opacity="0.4"/>
    <circle cx="14" cy="17" r="1.4" fill="#6b585a" opacity="0.8"/>
    <circle cx="26" cy="24" r="1.2" fill="#6b585a" opacity="0.7"/>
    <circle cx="6" cy="27" r="1" fill="#6b585a" opacity="0.6"/>
  </svg>`,

  // 마그마 — 물 자리. 걸어 들어갈 수 없다.
  magma: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs>
      <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff8a2b"/><stop offset="0.55" stop-color="#e04a12"/>
        <stop offset="1" stop-color="#8f1f07"/>
      </linearGradient>
      <radialGradient id="mg" cx="0.5" cy="0.4" r="0.6">
        <stop offset="0" stop-color="#ffd88a" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#ffd88a" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="32" height="32" fill="url(#m)"/>
    <rect width="32" height="32" fill="url(#mg)"/>
    <path d="M2 10q4-3 8 0t8 0 8 0 8 0" stroke="#ffcf6b" stroke-width="1.5" fill="none" opacity="0.75" stroke-linecap="round"/>
    <path d="M-2 20q4-3 8 0t8 0 8 0 8 0" stroke="#ffb347" stroke-width="1.3" fill="none" opacity="0.55" stroke-linecap="round"/>
    <path d="M2 28q4-3 8 0t8 0 8 0 8 0" stroke="#ff9a3c" stroke-width="1.1" fill="none" opacity="0.45" stroke-linecap="round"/>
    <path d="M6 4 L9 6 L7 9 Z" fill="#4a1c0c" opacity="0.6"/>
    <path d="M23 16 L27 18 L24 22 Z" fill="#4a1c0c" opacity="0.55"/>
  </svg>`,

  // 검은 현무암 — 바위 자리. 각지게 깎아 화강암과 구분한다.
  basalt: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${ashBase}
    <ellipse cx="16" cy="27" rx="9" ry="2.6" fill="#000" opacity="0.35"/>
    <path d="M6 27 L9 11 L16 7 L25 12 L27 27 Z" fill="#2b2a30"/>
    <path d="M9 11 L16 7 L18 16 L11 18 Z" fill="#43414b"/>
    <path d="M18 16 L25 12 L27 27 L20 26 Z" fill="#1c1b20"/>
    <path d="M11 18 L18 16 L20 26 L12 26 Z" fill="#35343c"/>
    <path d="M13 13 L15 22" stroke="#5a5866" stroke-width="0.8" opacity="0.7"/>
    <path d="M21 15 L23 24" stroke="#0f0e12" stroke-width="0.9" opacity="0.8"/>
  </svg>`,

  // 타 버린 나무 — 나무 자리
  charred: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${ashBase}
    <ellipse cx="16" cy="29" rx="7" ry="2.4" fill="#000" opacity="0.35"/>
    <rect x="14" y="14" width="4" height="14" rx="1.2" fill="#241c19"/>
    <path d="M15 18 L8 12" stroke="#241c19" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M17 15 L24 9" stroke="#241c19" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 12 L16 6" stroke="#241c19" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M8 12 L5 9" stroke="#241c19" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M24 9 L27 7" stroke="#241c19" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="16" cy="6" r="1" fill="#c14a1e" opacity="0.7"/>
    <circle cx="8" cy="12" r="0.9" fill="#c14a1e" opacity="0.55"/>
  </svg>`,

  // 불씨 — 꽃 자리. 밟고 지나갈 수 있다.
  ember: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${ashBase}
    <g>
      <circle cx="10" cy="12" r="2.6" fill="#ff7a1e" opacity="0.85"/>
      <circle cx="10" cy="12" r="1.1" fill="#ffe08a"/>
      <circle cx="22" cy="19" r="2.2" fill="#e8541a" opacity="0.8"/>
      <circle cx="22" cy="19" r="0.9" fill="#ffc46b"/>
      <circle cx="16" cy="26" r="1.8" fill="#ff9a3c" opacity="0.75"/>
      <circle cx="16" cy="26" r="0.7" fill="#fff0c4"/>
    </g>
  </svg>`,
};

module.exports = { VOLCANO_TILES };
