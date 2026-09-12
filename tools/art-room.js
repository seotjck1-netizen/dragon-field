// 집 안 타일 (0.70.3) — 여관 · 잡화점 · 대장간 · 연금술사의 실내.
// gen-assets.js 가 이 파일을 읽어 함께 굽는다. (게임 실행과 무관)
//
// ── 왜 실내가 필요한가 ─────────────────────────────────────
// 0.70.2 까지 마을의 집은 **그림**이었다. 문은 벽이고, 가게 주인은 문 앞
// 길바닥에 서 있었다. 지붕을 크게 세워 뒤로 걸어갈 수 있게 하고 나니
// 그 어긋남이 더 눈에 띄었다 — 들어갈 수 없는 집이 다섯 채 서 있는 마을이다.
//
// ── 그릴 때 지킨 것 ────────────────────────────────────────
// ⚠ **한 장 전체를 가로지르는 그라데이션을 넣지 않는다.** 같은 장을 격자로
//   이어 붙이면 칸마다 밝기가 끊겨 줄무늬가 된다(0.65 들판 · 0.67 마을에서
//   두 번 겪었다). 밑색은 평평하게 깔고, 결은 **칸 안에서 닫히는 무늬**로 낸다.
// ⚠ 바닥 널은 **칸 경계에서 이어져야** 한다. 널 하나를 칸 한가운데에 그리면
//   옆 칸과 만나는 자리에 굵은 이음매가 생겨 바둑판처럼 보인다.
//   그래서 널을 가로로 눕히고, 세로 이음매를 줄마다 어긋내 두었다.

const t = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${inner}</svg>`;

/** 바닥 널 — 어느 칸에 놓아도 이어지는 밑바탕. */
const FLOOR = `
  <rect width="32" height="32" fill="#a7794a"/>
  <g fill="#b1834f">
    <rect y="0" width="32" height="7.4"/>
    <rect y="16" width="32" height="7.4"/>
  </g>
  <g fill="#9c6e41" opacity="0.55">
    <rect y="7.4" width="32" height="0.9"/>
    <rect y="15.4" width="32" height="0.9"/>
    <rect y="23.4" width="32" height="0.9"/>
    <rect y="31.4" width="32" height="0.9"/>
  </g>
  <g fill="#8f6339" opacity="0.5">
    <rect x="10" y="0" width="0.9" height="8"/>
    <rect x="25" y="8" width="0.9" height="8"/>
    <rect x="4" y="16" width="0.9" height="8"/>
    <rect x="19" y="24" width="0.9" height="8"/>
  </g>
  <g stroke="#9a6c40" stroke-width="0.7" opacity="0.35" fill="none">
    <path d="M2 3.5h9M16 11.5h8M6 19.5h10M22 27.5h8"/>
  </g>`;

/** 벽 밑바탕 — 회칠 위에 나무 굽도리. 집 바깥 벽(house_wall)과 같은 결이다. */
const WALL = `
  <rect width="32" height="32" fill="#dccBa6"/>
  <rect width="32" height="32" fill="#ddcaa4"/>
  <g fill="#c8b083" opacity="0.45">
    <rect x="0" y="6" width="32" height="0.8"/>
    <rect x="0" y="17" width="32" height="0.8"/>
  </g>
  <rect y="24" width="32" height="8" fill="#8a6a45"/>
  <rect y="24" width="32" height="1.6" fill="#a5825a"/>
  <rect y="30.6" width="32" height="1.4" fill="#6f5436"/>`;

const ROOM_TILES = {
  room_floor: t(FLOOR),

  room_wall: t(WALL),

  // 창 — 밖이 보인다. 하나만 있어도 방이 '갇힌 상자' 가 아니게 된다.
  room_window: t(`${WALL}
    <rect x="6" y="4" width="20" height="15" rx="1.5" fill="#8a6a45"/>
    <rect x="7.6" y="5.6" width="16.8" height="11.8" fill="#6ea7d0"/>
    <rect x="7.6" y="5.6" width="7.6" height="5.4" fill="#9fd0ec" opacity="0.7"/>
    <path d="M16 5.6v11.8M7.6 11.5h16.8" stroke="#8a6a45" stroke-width="1.6"/>
    <rect x="4.5" y="18.4" width="23" height="2.2" rx="0.8" fill="#a5825a"/>`),

  // 나가는 자리 — 발판을 깔아 "여기가 문" 임을 바닥으로 말한다.
  // (아래 칸이 바깥이라 문짝은 안 그린다. 문짝을 그리면 벽처럼 보인다)
  room_exit: t(`${FLOOR}
    <rect x="0" y="22" width="32" height="10" fill="#8a6a45" opacity="0.35"/>
    <rect x="4" y="19" width="24" height="11" rx="2" fill="#6b4a2a"/>
    <rect x="5.6" y="20.4" width="20.8" height="9.6" rx="1.4" fill="#8f6a3f"/>
    <g stroke="#6b4a2a" stroke-width="0.9" opacity="0.8">
      <path d="M9 20.4v9.6M16 20.4v9.6M23 20.4v9.6"/>
    </g>
    <path d="M4 19h24" stroke="#4f3620" stroke-width="1.4"/>`),

  // 가게 계산대 — 앞은 나무판, 위는 밝은 상판. 위에 저울과 동전을 올려 둔다.
  counter: t(`${FLOOR}
    <rect x="0" y="10" width="32" height="20" fill="#7a5330"/>
    <rect x="0" y="8" width="32" height="4.5" fill="#a97c4c"/>
    <rect x="0" y="8" width="32" height="1.6" fill="#c39762"/>
    <g stroke="#63421f" stroke-width="0.9" opacity="0.7">
      <path d="M8 12.5v17.5M24 12.5v17.5"/>
    </g>
    <g fill="#ffd166"><circle cx="12" cy="6.4" r="2"/><circle cx="15.4" cy="7" r="2"/></g>
    <path d="M22 8V3M19 3h6M20 3l-1.4 3h2.8Z" stroke="#8b8fa3" stroke-width="1.2" fill="#b9bdd0"/>`),

  // 진열대 — 항아리와 두루마리를 올려 둔 선반.
  shelf: t(`${WALL}
    <rect x="1" y="6" width="30" height="21" rx="1.2" fill="#7a5330"/>
    <rect x="2.4" y="7.4" width="27.2" height="18.2" fill="#5d3d21"/>
    <rect x="2.4" y="15" width="27.2" height="1.8" fill="#8a6238"/>
    <g fill="#c9694f"><rect x="4.5" y="9" width="5" height="6" rx="1.6"/></g>
    <g fill="#5fa9c9"><rect x="11" y="9.6" width="4.4" height="5.4" rx="1.4"/></g>
    <g fill="#d9c48c"><rect x="17" y="10" width="4" height="5" rx="0.8"/><rect x="22" y="10" width="4" height="5" rx="0.8"/></g>
    <g fill="#8fbf6a"><rect x="5" y="18" width="4.6" height="6" rx="1.5"/></g>
    <g fill="#b98ccf"><rect x="11.5" y="18.4" width="4.2" height="5.6" rx="1.4"/></g>
    <rect x="18" y="19" width="9" height="4.6" rx="1" fill="#a97c4c"/>`),

  // 통 — 어느 가게에나 하나쯤 있는 것. 방이 비어 보이지 않게 한다.
  barrel: t(`${FLOOR}
    <ellipse cx="16" cy="29" rx="10" ry="2.6" fill="#000" opacity="0.18"/>
    <path d="M7 10q9-3 18 0v15q-9 3-18 0Z" fill="#8a5f36"/>
    <path d="M9 10.6q7-2.4 14 0v13.8q-7 2.4-14 0Z" fill="#a3743f"/>
    <g fill="#6e4a28"><rect x="7" y="13.6" width="18" height="2"/><rect x="7" y="20" width="18" height="2"/></g>
    <ellipse cx="16" cy="10.4" rx="9" ry="2.6" fill="#c08d51"/>
    <ellipse cx="16" cy="10.4" rx="6.6" ry="1.8" fill="#8a5f36" opacity="0.5"/>`),

  // 침대 — 여관의 전부다. 머리맡을 위로 두어 방향이 읽히게 한다.
  bed: t(`${FLOOR}
    <rect x="4" y="1" width="24" height="30" rx="2.5" fill="#7a5330"/>
    <rect x="5.6" y="2.6" width="20.8" height="26.8" rx="2" fill="#e6ddc9"/>
    <rect x="5.6" y="2.6" width="20.8" height="9" rx="2" fill="#f4eee0"/>
    <rect x="8.5" y="4" width="15" height="6" rx="2" fill="#fff" opacity="0.85"/>
    <rect x="5.6" y="13" width="20.8" height="16.4" rx="1.6" fill="#a8455a"/>
    <rect x="5.6" y="13" width="20.8" height="2.6" fill="#c65a70"/>
    <g stroke="#8d3549" stroke-width="0.9" opacity="0.6"><path d="M11 15.6v13.8M21 15.6v13.8"/></g>`),

  // 탁자 — 초 하나. 여관과 민가에 놓는다.
  table: t(`${FLOOR}
    <ellipse cx="16" cy="27" rx="11" ry="3" fill="#000" opacity="0.16"/>
    <rect x="13.6" y="16" width="4.8" height="10" fill="#7a5330"/>
    <ellipse cx="16" cy="16" rx="13" ry="7" fill="#8a5f36"/>
    <ellipse cx="16" cy="14.8" rx="13" ry="7" fill="#b1834f"/>
    <ellipse cx="16" cy="14.4" rx="9.6" ry="4.8" fill="#c0925c" opacity="0.7"/>
    <rect x="14.6" y="6" width="2.8" height="7.6" rx="1" fill="#f0e6cf"/>
    <path d="M16 6q2-2.4 0-4.4Q14 3.6 16 6Z" fill="#ffcf5c"/>
    <circle cx="16" cy="3.4" r="3.4" fill="#ffcf5c" opacity="0.28"/>`),

  // 가마솥 — 연금술사의 자리. 불빛이 방을 물들인다.
  cauldron: t(`${FLOOR}
    <ellipse cx="16" cy="28" rx="10" ry="2.8" fill="#000" opacity="0.2"/>
    <g fill="#c8642f" opacity="0.85">
      <path d="M9 26q3-5 7-2 4-3 7 2Z"/>
    </g>
    <path d="M6 14h20v6a10 8 0 0 1-20 0Z" fill="#3c3f4a"/>
    <ellipse cx="16" cy="14" rx="10" ry="4" fill="#2e313a"/>
    <ellipse cx="16" cy="14" rx="7.6" ry="2.8" fill="#7ad39a"/>
    <ellipse cx="13" cy="13.4" rx="2" ry="1" fill="#b6f0c9" opacity="0.8"/>
    <g fill="#7ad39a" opacity="0.55">
      <circle cx="12.5" cy="8" r="2"/><circle cx="18" cy="5.4" r="2.6"/><circle cx="15" cy="2.6" r="1.6"/>
    </g>
    <path d="M6 15.6h20" stroke="#5a5e6b" stroke-width="1.2"/>`),
};

module.exports = { ROOM_TILES };
