// 보스가 있는 들판의 화산 지형 타일.
//
// 지형 자체는 다른 들판과 똑같이 생성된다(같은 씨앗, 같은 길, 같은 덤불 배치).
// 여기서 바꾸는 것은 "무엇으로 그리느냐" 하나뿐이다 —
// 풀은 잿더미로, 나무는 타 버린 둥치로, 바위는 검은 현무암으로, 물은 마그마로.
// 그래서 보스 방에 들어서는 순간 같은 길인데 다른 땅이라는 게 눈으로 보인다.

/**
 * 잿더미 바닥 — 다른 들판의 grassBase 자리를 대신한다.
 *
 * ⚠ **그라데이션도, 칸 테두리도 넣지 않는다** (0.70 에 걷어냈다).
 *   위→아래로 밝기가 흐르고 칸마다 검은 테두리를 한 겹 둘렀는데,
 *   같은 장을 격자로 이어 붙이면 밝기가 칸마다 끊기고 테두리가 격자로 드러나서
 *   땅이 아니라 **바둑판**으로 보였다. 들판 풀(0.65)·마른 땅(0.67)에서
 *   똑같이 겪고 걷어낸 것을, 여기만 세 판째 놓치고 있었다.
 */
const ashBase = `
  <rect width="32" height="32" fill="#332b29"/>
  <ellipse cx="9" cy="11" rx="10" ry="6.5" fill="#3b3230" opacity="0.6"/>
  <ellipse cx="24" cy="24" rx="9" ry="6" fill="#282120" opacity="0.6"/>
  <path d="M4 26q2-4 4 0M12 21q2-4 4 0M22 27q2-4 4 0M26 14q2-4 4 0M8 12q2-4 4 0M17 8q2-4 4 0"
        stroke="#584a46" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.7"/>
  <circle cx="9" cy="18" r="0.9" fill="#7a3a20" opacity="0.5"/>
  <circle cx="24" cy="9" r="0.8" fill="#7a3a20" opacity="0.45"/>`;

/**
 * 잿더미 두 장 더 (0.70.19).
 *
 * 화산 들판 넷(5·10·15·20단계)이 전부 이 한 장으로 덮여 있었다 —
 * 한 장짜리 바닥은 화면 어디를 봐도 같은 무늬라 **벽지**로 보인다.
 * 풀이 네 장인 것과 같은 까닭으로 셋으로 늘린다.
 */
const ashBase2 = `
  <rect width="32" height="32" fill="#332b29"/>
  <ellipse cx="23" cy="9" rx="10" ry="6" fill="#3b3230" opacity="0.58"/>
  <ellipse cx="7" cy="24" rx="9.5" ry="6.5" fill="#282120" opacity="0.58"/>
  <path d="M9 24q2-4 4 0M19 19q2-4 4 0M27 28q2-4 4 0M4 15q2-4 4 0M14 7q2-4 4 0M25 4q2-4 4 0"
        stroke="#584a46" stroke-width="1.25" fill="none" stroke-linecap="round" opacity="0.66"/>
  <circle cx="18" cy="14" r="0.9" fill="#7a3a20" opacity="0.48"/>
  <circle cx="5" cy="29" r="0.8" fill="#7a3a20" opacity="0.42"/>`;

const ashBase3 = `
  <rect width="32" height="32" fill="#332b29"/>
  <ellipse cx="15" cy="15" rx="12" ry="7.5" fill="#3b3230" opacity="0.5"/>
  <ellipse cx="29" cy="29" rx="8" ry="5.5" fill="#282120" opacity="0.55"/>
  <path d="M6 9q2-4 4 0M16 27q2-4 4 0M28 17q2-4 4 0M21 11q2-4 4 0M10 19q2-4 4 0"
        stroke="#584a46" stroke-width="1.3" fill="none" stroke-linecap="round" opacity="0.68"/>
  <circle cx="26" cy="7" r="0.95" fill="#7a3a20" opacity="0.46"/>
  <circle cx="11" cy="30" r="0.8" fill="#7a3a20" opacity="0.4"/>`;

/**
 * 잿더미 두 장 더 (0.70.24) — 셋 → **다섯**.
 *
 * 0.70.23 에 죽은 나무를 '얹는 그림' 으로 바꾸면서, 나무가 제 밑에 깔던
 * 잿더미 한 장이 사라지고 **지도의 바닥 세 장이 실제로 비치게** 됐다.
 * 그러고 나니 화산 들판 넷이 전부 이 세 장으로만 덮여 있는 것이 드러났다.
 *
 * 풀은 네 장, 마른 땅은 다섯 장이다. 화면 대부분을 덮는 바닥은 장이 적을수록
 * **벽지**로 보인다. 같은 잣대로 다섯 장까지 늘린다.
 *
 * ⚠ 한 장 안에 **눈에 잡히는 크기의 얼룩**을 넣지 않는다(0.70.19 의 교훈).
 *   그것을 격자로 이어 붙이면 얼룩이 32px 마다 되풀이되어 바둑판이 된다.
 *   큰 변화는 장을 늘려서 만들고, 한 장 안에서는 **작고 고르게** 둔다.
 */
const ashBase4 = `
  <rect width="32" height="32" fill="#332b29"/>
  <ellipse cx="4" cy="19" rx="9.5" ry="6" fill="#3b3230" opacity="0.55"/>
  <ellipse cx="21" cy="5" rx="10" ry="5.5" fill="#282120" opacity="0.5"/>
  <ellipse cx="27" cy="23" rx="7" ry="5" fill="#3b3230" opacity="0.4"/>
  <path d="M12 25q2-4 4 0M2 6q2-4 4 0M24 30q2-4 4 0M14 14q2-4 4 0M29 10q2-4 4 0M20 20q2-4 4 0"
        stroke="#584a46" stroke-width="1.28" fill="none" stroke-linecap="round" opacity="0.64"/>
  <circle cx="7" cy="27" r="0.9" fill="#7a3a20" opacity="0.44"/>
  <circle cx="20" cy="12" r="0.8" fill="#7a3a20" opacity="0.38"/>`;

const ashBase5 = `
  <rect width="32" height="32" fill="#332b29"/>
  <ellipse cx="16" cy="28" rx="11" ry="6" fill="#282120" opacity="0.52"/>
  <ellipse cx="2" cy="7" rx="8.5" ry="5.5" fill="#3b3230" opacity="0.5"/>
  <ellipse cx="30" cy="14" rx="7.5" ry="6" fill="#3b3230" opacity="0.45"/>
  <path d="M7 17q2-4 4 0M23 8q2-4 4 0M17 22q2-4 4 0M3 29q2-4 4 0M26 26q2-4 4 0M11 4q2-4 4 0"
        stroke="#584a46" stroke-width="1.32" fill="none" stroke-linecap="round" opacity="0.66"/>
  <circle cx="14" cy="9" r="0.95" fill="#7a3a20" opacity="0.42"/>
  <circle cx="28" cy="20" r="0.8" fill="#7a3a20" opacity="0.4"/>`;

const VOLCANO_TILES = {
  // ── 밟고 지나가는 조경 (0.70) ───────────────────────────────
  //
  // ⚠ 0.65~0.69 에는 보스 땅에도 들판의 잔돌·덤불·그루터기·키큰 풀이 그대로
  //   깔렸다. 그것들은 '얹는 그림'이라 밑에 **풀**이 함께 깔리므로,
  //   잿더미 위에 **초록 잔디 네모가 백 개 넘게** 흩어져 있었다.
  //   불타 버린 땅에 풀이 있을 리가 없다.
  //
  //   그래서 화산 테마가 이 넷을 제 것으로 갈아 끼운다(gen-maps 의 THEMES).
  //   서쪽 절벽의 자갈·뼈와 같은 방식이다 — **제 밑색을 가진 통짜 그림**이라
  //   밑에 아무것도 깔지 않는다.
  ash_rubble: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="12" cy="19" rx="5" ry="3.2" fill="#000" opacity="0.28"/>
    <ellipse cx="11.6" cy="18" rx="4.6" ry="3" fill="#4a3f3e"/>
    <ellipse cx="10.6" cy="17" rx="2.6" ry="1.5" fill="#665957"/>
    <ellipse cx="22" cy="24" rx="3.4" ry="2.2" fill="#000" opacity="0.24"/>
    <ellipse cx="21.7" cy="23.2" rx="3" ry="2" fill="#413636"/>
    <ellipse cx="21" cy="22.6" rx="1.7" ry="1" fill="#5c4f4d"/>
    <ellipse cx="24.5" cy="11" rx="2.2" ry="1.4" fill="#4a3f3e" opacity="0.9"/>
    <circle cx="7" cy="25" r="1" fill="#ff7a2a" opacity="0.5"/>
  </svg>`,

  charred_stump: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="24" rx="8" ry="2.8" fill="#000" opacity="0.35"/>
    <path d="M10 22 q0 -7 1 -9 l10 0 q1 2 1 9 z" fill="#2b201d"/>
    <ellipse cx="16" cy="13" rx="6" ry="2.6" fill="#4a3a33"/>
    <ellipse cx="16" cy="13" rx="3.6" ry="1.5" fill="#33261f"/>
    <ellipse cx="16" cy="13" rx="1.4" ry="0.6" fill="#ff7a2a" opacity="0.75"/>
    <path d="M11 18 q5 1.5 10 0" stroke="#1c1412" stroke-width="1" fill="none" opacity="0.8"/>
    <path d="M12 20 l1 -4M20 20 l-1 -4" stroke="#ff7a2a" stroke-width="0.9" opacity="0.35"/>
  </svg>`,

  // 김이 새는 틈 — 들판의 '키큰 풀' 자리를 대신한다(밟고 지나간다).
  ash_vent: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M8 24 q4 -3 8 -1 t8 -2" stroke="#1b1412" stroke-width="2.6" fill="none"
          stroke-linecap="round" opacity="0.85"/>
    <path d="M8 24 q4 -3 8 -1 t8 -2" stroke="#ff7a2a" stroke-width="1.1" fill="none"
          stroke-linecap="round" opacity="0.6"/>
    <ellipse cx="16" cy="21" rx="10" ry="6" fill="#ff8b3a" opacity="0.1"/>
    <g fill="#8a7d78" opacity="0.35">
      <ellipse cx="12" cy="13" rx="3" ry="4.4"/>
      <ellipse cx="20" cy="9" rx="2.4" ry="3.6"/>
      <ellipse cx="16" cy="6" rx="1.8" ry="2.6"/>
    </g>
  </svg>`,

  // 바닥 — 식은 화산재
  ash: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase}</svg>`,
  ash2: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase2}</svg>`,
  ash3: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase3}</svg>`,
  ash4: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase4}</svg>`,
  ash5: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${ashBase5}</svg>`,

  // 길 — 굳은 용암이 갈라진 자국
  // ⚠ 0.70.19 — **세로 그라데이션을 걷어냈다.**
  //   위가 밝고 아래가 어두운 밑색을 깔아 놓으면, 같은 장을 세로로 이어 붙일 때
  //   칸과 칸이 만나는 자리에서 어두움→밝음이 툭 끊긴다. 그 끊김이 가로줄로
  //   죽 이어져 길에 줄무늬가 그려진다. 이 파일 첫머리(ashBase)와 들판 풀(0.65)에서
  //   이미 두 번 걷어낸 것인데 이 타일만 남아 있었다. 밑색은 평평하게 둔다.
  ash_path: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#4a3c3f"/>
    <ellipse cx="10" cy="12" rx="11" ry="7" fill="#544447" opacity="0.5"/>
    <ellipse cx="24" cy="25" rx="10" ry="6.5" fill="#403436" opacity="0.5"/>
    <path d="M3 7 L11 12 L9 21 L17 27" stroke="#c14a1e" stroke-width="1.1" fill="none" opacity="0.55"/>
    <path d="M21 2 L24 11 L31 15" stroke="#c14a1e" stroke-width="0.9" fill="none" opacity="0.4"/>
    <circle cx="14" cy="17" r="1.4" fill="#6b585a" opacity="0.8"/>
    <circle cx="26" cy="24" r="1.2" fill="#6b585a" opacity="0.7"/>
    <circle cx="6" cy="27" r="1" fill="#6b585a" opacity="0.6"/>
  </svg>`,

  // 마그마 — 물 자리. 걸어 들어갈 수 없다.
  magma: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${/* ⚠ 0.70.19 — 여기도 세로 그라데이션을 걷어냈다(ash_path 와 같은 까닭).
         마그마 못이 넓으면 칸마다 밝기가 끊겨 가로줄이 그려졌다.
         밑색은 평평하게 두고, 달아오른 자리는 **흩어 놓은 얼룩**으로만 준다. */ ''}
    <rect width="32" height="32" fill="#d8481a"/>
    <ellipse cx="11" cy="10" rx="11" ry="7" fill="#ff8a2b" opacity="0.45"/>
    <ellipse cx="25" cy="23" rx="10" ry="6.5" fill="#8f1f07" opacity="0.45"/>
    <ellipse cx="6" cy="27" rx="8" ry="5" fill="#ffb04a" opacity="0.28"/>
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

  // 타 버린 나무 — 나무 자리.
  //
  // ⚠ 이제 **밑그림(ashBase)을 깔지 않는다** (0.70.23).
  //   풀밭 나무처럼 아래의 `charred_big*` 을 세워 쓰기로 했으므로,
  //   이 한 칸짜리 그림은 옛 저장본·다른 씬을 위한 대비품으로만 남는다.
  //   바닥은 지도의 `ground`(ash)가 깔아 준다 — 여기서 또 깔면 잿더미 변형
  //   세 장이 이 한 장에 덮여 화산 들판이 다시 벽지가 된다.
  charred: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
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

  // ── 큰 타 버린 나무 셋 (0.70.23) ────────────────────────────
  //
  // 0.70.23 에 들판을 떠 보고 나서야 알았다. 풀밭의 나무는 56×72 로 서는데
  // (`tile_tree_big`), **화산 들판의 나무만 한 칸(32×32)에 갇혀 있었다.**
  // 같은 씨앗·같은 자리인데 한쪽은 숲이고 한쪽은 **잔가지 밭**이었다.
  //
  // 화산 지형은 "같은 길인데 다른 땅" 이 되라고 만든 것이지 **작아지라고**
  // 만든 것이 아니다. 풀밭 나무와 같은 크기로 세운다.
  //
  // ⚠ 잎이 없다. 그래서 풀밭 나무보다 **가지를 성기게, 줄기를 굵게** 그린다 —
  //   실루엣이 비어 있으면 그냥 막대기로 보인다.
  charred_big: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="14" ry="4.2" fill="#000" opacity="0.4"/>
    <path d="M23 70 q-2 -2 -0.5 -5 l0 -30 l10 0 l0 30 q1.5 3 -0.5 5 z" fill="#241c19"/>
    <path d="M24 38 l3.2 0 l0 32 l-3.2 0 z" fill="#352824" opacity="0.7"/>
    <path d="M25 38 q-8 -5 -13 -14" stroke="#241c19" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M31 34 q9 -5 13 -15" stroke="#241c19" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <path d="M28 33 l0 -22" stroke="#241c19" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M12 24 q-3 -4 -4 -8" stroke="#241c19" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M12 24 q-5 -1 -8 -5" stroke="#241c19" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M44 19 q3 -4 4 -9" stroke="#241c19" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M44 19 q5 -2 8 -6" stroke="#241c19" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M28 11 q-4 -3 -6 -7" stroke="#241c19" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M28 11 q4 -3 7 -6" stroke="#241c19" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <circle cx="8" cy="16" r="1.2" fill="#c14a1e" opacity="0.65"/>
    <circle cx="48" cy="10" r="1.1" fill="#c14a1e" opacity="0.55"/>
    <circle cx="22" cy="4" r="1" fill="#c14a1e" opacity="0.5"/>
    <path d="M26 52 q3 -2 5 1" stroke="#c14a1e" stroke-width="0.9" fill="none" opacity="0.3"/>
  </svg>`,

  charred_big2: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="13" ry="4" fill="#000" opacity="0.38"/>
    <path d="M24 70 q-2 -2 -0.5 -4 l1 -34 l8 1 l-1 33 q1.5 2 -0.5 4 z" fill="#201a17"/>
    <path d="M25 37 l3 0 l-0.6 33 l-3 0 z" fill="#302523" opacity="0.65"/>
    <path d="M26 40 q-10 -3 -15 -11" stroke="#201a17" stroke-width="3.6" fill="none" stroke-linecap="round"/>
    <path d="M31 30 q8 -6 10 -16" stroke="#201a17" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M29 36 q2 -14 -1 -22" stroke="#201a17" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M11 29 q-4 -2 -6 -6" stroke="#201a17" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M41 14 q2 -4 2 -8" stroke="#201a17" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M41 14 q5 -1 7 -5" stroke="#201a17" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M28 14 q-5 -2 -8 -6" stroke="#201a17" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <circle cx="5" cy="23" r="1.1" fill="#c14a1e" opacity="0.6"/>
    <circle cx="43" cy="6" r="1" fill="#c14a1e" opacity="0.5"/>
    <circle cx="20" cy="8" r="0.9" fill="#c14a1e" opacity="0.45"/>
  </svg>`,

  charred_big3: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="15" ry="4.4" fill="#000" opacity="0.42"/>
    <path d="M22 70 q-2 -3 0 -6 l1 -26 l12 0 l-1 26 q2 3 0 6 z" fill="#2a201c"/>
    <path d="M24 42 l3.6 0 l-0.6 28 l-3.4 0 z" fill="#3b2d28" opacity="0.6"/>
    <path d="M24 44 q-11 -6 -16 -16" stroke="#2a201c" stroke-width="4.2" fill="none" stroke-linecap="round"/>
    <path d="M33 40 q11 -7 14 -17" stroke="#2a201c" stroke-width="3.8" fill="none" stroke-linecap="round"/>
    <path d="M28 40 q-3 -16 1 -24" stroke="#2a201c" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path d="M8 28 q-3 -5 -3 -10" stroke="#2a201c" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M47 23 q4 -5 4 -10" stroke="#2a201c" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M29 16 q5 -4 8 -5" stroke="#2a201c" stroke-width="1.9" fill="none" stroke-linecap="round"/>
    <path d="M29 16 q-5 -4 -9 -5" stroke="#2a201c" stroke-width="1.7" fill="none" stroke-linecap="round"/>
    <circle cx="5" cy="18" r="1.2" fill="#c14a1e" opacity="0.6"/>
    <circle cx="51" cy="13" r="1.1" fill="#c14a1e" opacity="0.55"/>
    <path d="M25 56 q4 -2 6 1" stroke="#c14a1e" stroke-width="0.9" fill="none" opacity="0.28"/>
  </svg>`,

  /**
   * 탄 나무 밑에 까는 그늘 (0.70.23).
   *
   * 풀밭의 `tree_shade` 를 그대로 쓸 수 없다. 그것은 **잎이 드리운 초록 그늘**이라
   * 잿더미 위에 깔면 죽은 나무 밑에만 풀이 돋은 것처럼 보인다.
   * 여기서는 **그을음 자국**으로 깐다 — 잎이 없으니 그림자도 성기게.
   */
  charred_shade: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="40" viewBox="0 0 56 40">
    <ellipse cx="31" cy="26" rx="21" ry="10" fill="#110c0a" opacity="0.2"/>
    <ellipse cx="33" cy="28" rx="13" ry="6.5" fill="#110c0a" opacity="0.15"/>
    <path d="M14 22 q6 5 16 6" stroke="#110c0a" stroke-width="2.2" fill="none" opacity="0.16" stroke-linecap="round"/>
    <path d="M46 24 q-6 6 -14 8" stroke="#110c0a" stroke-width="2" fill="none" opacity="0.13" stroke-linecap="round"/>
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
