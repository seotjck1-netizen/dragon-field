// SVG로 그린 아트를 PNG로 굽는다. (게임 런타임과 무관한 빌드용 스크립트)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/home/claude/rpg-game/assets';

// ---------- 공통 조각 ----------
const defsShadowLift = `
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>`;

// ---------- 타일 32x32 ----------
// ── 땅 (0.65) ────────────────────────────────────────────────
//
// 무엇이 엉성했나:
//   ① **풀이 한 장뿐**이었다. 40×32 칸을 같은 그림으로 덮으니 격자무늬가
//      눈에 그대로 보였다. 자연에는 그런 무늬가 없다.
//   ② **길·바위·나무가 네모난 도장**이었다. 32×32 안에 꽉 찬 그림을 찍으니
//      칸 경계가 직선으로 드러났다. 길이 벽돌처럼 보인 이유가 이것이다.
//
// 어떻게 고쳤나:
//   ① 풀을 **네 장**으로 늘리고, 칸마다 자리(x,y)로 골라 깐다(FieldScene).
//      네 장이면 반복 주기가 눈에 안 잡힌다.
//   ② 길·바위·나무·덤불을 **속이 비치는 얹는 그림**으로 바꿨다. 가장자리를
//      들쭉날쭉하게 파 두면, 밑에 깔린 풀이 그 사이로 비쳐 경계가 녹는다.
//      옆 칸의 길과도 저절로 이어져 **한 갈래 흙길**로 보인다.
//
// 규칙: 이 파일은 SVG 만 만든다. 어떤 칸에 무엇을 까는지는 maps/FieldScene 이 정한다.

/**
 * 풀 밑색. **그라데이션을 쓰지 않는다.**
 *
 * ⚠ 처음에는 위→아래 그라데이션(밝은 풀 → 짙은 풀)과 왼쪽 위 광택을 넣었다.
 *   한 장만 놓고 보면 예쁜데, **깔아 놓으면 줄무늬가 된다.** 칸마다 위가 밝고
 *   아래가 어두우니, 칸과 칸이 만나는 자리에서 어두움→밝음이 툭 끊긴다.
 *   40칸을 이어 붙이면 그 끊김이 가로줄로 죽 이어져 화면에 격자가 그려진다.
 *   실제로 그렇게 나왔다(첫 화면에 가로줄이 촘촘히 보였다).
 *
 *   깔리는 그림에는 **한쪽으로 쏠린 밝기**를 넣으면 안 된다. 밑색은 평평하게 두고,
 *   변화는 흩어 놓은 풀포기·얼룩으로만 준다. 그래야 이어 붙여도 이음매가 없다.
 */
const GRASS_BG = '#49a34a';

/**
 * 풀 한 장.
 * @param {string} blades 풀포기 — 변형마다 다르게 넣는다
 * @param {string} extra  흙 자국·잔돌 같은 덤
 */
const grassTile = (blades, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${GRASS_BG}"/>
  ${extra}
  <g stroke-linecap="round" fill="none">${blades}</g>
</svg>`;

/**
 * 한 변에 붙는 풀 술. deg 만큼 돌려 네 방향을 만든다.
 * 0=위, 90=오른쪽, 180=아래, 270=왼쪽.
 */
const edgeGrass = (deg) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="rotate(${deg} 16 16)">
    <path d="M0 0 h32 v3 q-4 3 -8 1 t-8 2 t-8 -1 t-8 1 z" fill="#49a34a"/>
    <g stroke-linecap="round" fill="none">
      <path d="M3 6 q1 -3 2 -5M9 7 q1 -4 2 -6M15 6 q1 -3 2 -5M21 7 q1 -4 2 -6M27 6 q1 -3 2 -5"
            stroke="#49a34a" stroke-width="2.6"/>
      <path d="M6 5 q1 -2.5 2 -4M18 5 q1 -2.5 2 -4M24 4.5 q1 -2 2 -3.5"
            stroke="#3f9642" stroke-width="2"/>
      <path d="M4 5 q0.8 -2 1.6 -3.5M16 5.5 q0.8 -2 1.6 -3.5M28 5 q0.8 -2 1.6 -3.5"
            stroke="#5fbc5c" stroke-width="1.4"/>
    </g>
  </g>
</svg>`;

/**
 * 물가 한 변. deg 만큼 돌려 네 방향을 만든다(0=위).
 *
 * 젖은 모래 → 거품 → 물 순서로 세 겹. 가장자리를 물결처럼 흔들어
 * 옆 칸과 이어 붙여도 같은 자리에서 끊기지 않게 했다.
 */
const shoreEdge = (deg) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="rotate(${deg} 16 16)">
    <path d="M0 0 h32 v4.5 q-4 3 -8 1.4 t-8 1.6 t-8 -1.2 t-8 1.2 z" fill="#cbb389"/>
    <path d="M0 3.4 h32 v3.4 q-4 3 -8 1.4 t-8 1.6 t-8 -1.2 t-8 1.2 z" fill="#b89b70" opacity="0.85"/>
    <path d="M0 6.6 q4 2.6 8 1.2 t8 1.4 t8 -1.2 t8 1"
          stroke="#eaf7ff" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round"/>
    <path d="M2 9.4 q4 1.8 8 0.8 t8 1 t8 -0.8"
          stroke="#eaf7ff" stroke-width="1" fill="none" opacity="0.4" stroke-linecap="round"/>
  </g>
</svg>`;

/**
 * 물가 모서리 하나 — 왼쪽 위 귀퉁이에 얹는다. deg 로 네 귀퉁이를 만든다.
 *
 * 변(shoreEdge)과 달리 **귀퉁이만** 젖는다. 두 변이 다 물일 때(= 대각선으로만
 * 땅이 닿을 때) 쓰므로, 넓게 칠하면 연못 안쪽까지 모래가 번진다.
 */
const shoreCorner = (deg) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="rotate(${deg} 16 16)">
    <path d="M0 0 h11 q-1.5 4 -5 5.5 t-6 5.5 z" fill="#cbb389"/>
    <path d="M0 0 h8 q-1 3 -4 4.4 t-4 3.6 z" fill="#b89b70" opacity="0.85"/>
    <path d="M11.5 0.5 q-1.6 4.6 -5.6 6.4 t-5.4 5.2"
          stroke="#eaf7ff" stroke-width="1.5" fill="none" opacity="0.65" stroke-linecap="round"/>
  </g>
</svg>`;

/**
 * 용암 가장자리 한 변 (0.70). deg 만큼 돌려 네 방향을 만든다(0=위).
 *
 * 굳은 껍질(검정) → 식어 가는 테(짙은 갈색) → 달아오른 실금(주황) 세 겹.
 * 물가와 마찬가지로 **밑변은 비워** 둔다 — 사각형을 꽉 채우면 용암 위에
 * 검은 띠를 두른 꼴이 되어 오히려 더 딱딱해진다.
 */
const crustEdge = (deg) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="rotate(${deg} 16 16)">
    <path d="M0 0 h32 v5 q-4 3.4 -8 1.6 t-8 1.8 t-8 -1.4 t-8 1.4 z" fill="#241c17"/>
    <path d="M0 3.6 h32 v3.6 q-4 3.2 -8 1.6 t-8 1.8 t-8 -1.4 t-8 1.4 z" fill="#3a2a20" opacity="0.9"/>
    <path d="M0 7 q4 2.8 8 1.4 t8 1.6 t8 -1.4 t8 1.2"
          stroke="#ff8b3a" stroke-width="1.7" fill="none" opacity="0.75" stroke-linecap="round"/>
    <path d="M2 9.8 q4 2 8 0.9 t8 1.1 t8 -0.9"
          stroke="#ffd166" stroke-width="1" fill="none" opacity="0.45" stroke-linecap="round"/>
  </g>
</svg>`;

/** 용암 가장자리 귀퉁이 — 대각선으로만 땅이 닿을 때. */
const crustCorner = (deg) => `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <g transform="rotate(${deg} 16 16)">
    <path d="M0 0 h11.5 q-1.6 4.2 -5.2 5.8 t-6.3 5.8 z" fill="#241c17"/>
    <path d="M0 0 h8 q-1 3 -4 4.6 t-4 3.8 z" fill="#3a2a20" opacity="0.9"/>
    <path d="M12 0.6 q-1.7 4.8 -5.8 6.6 t-5.6 5.4"
          stroke="#ff8b3a" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round"/>
  </g>
</svg>`;

/**
 * 집 지붕 한 칸 (0.70.1) — 32 × 120.
 *
 * ⚠ **지붕 두 줄을 한 장이 통째로 덮는다.**
 *   처음에는 윗줄만 크게 그리고 아랫줄은 바닥에 구워 두었는데, 사람이 집 뒤에
 *   섰을 때 **윗줄만 비치고 아랫줄은 그대로**여서 지붕이 두 쪽으로 갈라져 보였다.
 *   한 채는 한 장이어야 함께 비친다.
 *
 * 아래 64px 이 지붕 두 줄(제 칸)이고, 위 56px 이 칸 밖으로 자란 부분이다.
 * 그 56px 덕분에 집 북쪽에 선 사람이 지붕에 가린다 — "집 뒤에 있다".
 *
 * `side` 는 'l'(왼쪽 끝) · 'm'(가운데) · 'r'(오른쪽 끝).
 * 6칸짜리 집을 같은 그림으로 도배하면 지붕이 아니라 **띠**로 보인다.
 */
const roofTop = (side) => {
  const H = 120;
  const rows = [];
  // 기와 — 11px 마다 한 줄, 줄마다 5px 씩 어긋난다.
  for (let y = 22; y < H; y += 11) {
    const off = ((y - 22) / 11) % 2 ? 5 : 0;
    rows.push(`
      <g fill="#bb5147">
        <path d="M${-6 + off} ${y}h9v10h-9z"/><path d="M${4 + off} ${y}h9v10h-9z"/>
        <path d="M${14 + off} ${y}h9v10h-9z"/><path d="M${24 + off} ${y}h9v10h-9z"/>
      </g>
      <g fill="#cf6055" opacity="0.9">
        <path d="M${-6 + off} ${y}h9v3h-9z"/><path d="M${4 + off} ${y}h9v3h-9z"/>
        <path d="M${14 + off} ${y}h9v3h-9z"/><path d="M${24 + off} ${y}h9v3h-9z"/>
      </g>
      <rect x="-2" y="${y + 10}" width="36" height="1.6" fill="#6f251f" opacity="0.5"/>`);
  }
  // 옆 처마 — 끝 칸에만. 지붕이 벽보다 한 뼘 나와 있어야 집처럼 보인다.
  const eave =
    side === 'l'
      ? `<rect x="0" y="18" width="3.5" height="${H - 18}" fill="#8c322c"/>`
        + `<rect x="0" y="18" width="1.6" height="${H - 18}" fill="#a03a33"/>`
      : side === 'r'
        ? `<rect x="28.5" y="18" width="3.5" height="${H - 18}" fill="#8c322c"/>`
          + `<rect x="30.4" y="18" width="1.6" height="${H - 18}" fill="#7a2823"/>`
        : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="${H}" viewBox="0 0 32 ${H}">
    <rect x="0" y="20" width="32" height="${H - 20}" fill="#8c322c"/>
    ${rows.join('')}
    <!-- 용마루 — 지붕의 꼭대기 선 -->
    <path d="M-2 22 L34 22 L34 17 L-2 17 Z" fill="#8c322c"/>
    <path d="M-2 17 L34 17 L34 13 L-2 13 Z" fill="#a03a33"/>
    <path d="M-2 13 L34 13 L34 10.5 L-2 10.5 Z" fill="#c96a5f"/>
    <ellipse cx="16" cy="10.5" rx="20" ry="2.8" fill="#d67a6d" opacity="0.85"/>
    ${eave}
    <!-- 처마 그늘 — 지붕이 벽 위에 '얹혀' 보이게 -->
    <rect x="0" y="${H - 3}" width="32" height="3" fill="#5c1e19" opacity="0.55"/>
  </svg>`;
};

// 밑에 깔리는 풀(다른 그림이 그 위에 얹힌다). 첫 장을 그대로 쓴다.
const grassBase = `
  <rect width="32" height="32" fill="${GRASS_BG}"/>
  <g stroke-linecap="round" fill="none">
    <path d="M5 27q2-5 4 0M13 21q2-5 4 0M23 27q2-4 3 0" stroke="#5fbc5c" stroke-width="1.3" opacity="0.8"/>
    <path d="M9 13q2-4 3 0M26 15q2-4 3 0" stroke="#3f9642" stroke-width="1.2" opacity="0.7"/>
  </g>`;

const TILES = {
  // ── 풀 네 장 ────────────────────────────────────────────────
  //
  // 밑색은 평평하게 두고(위 설명 참고), 변화는 **흩어 놓은 자국**으로만 준다.
  // 한 장에 열 개 남짓 넣어야 넓게 깔았을 때 허전하지 않다 —
  // 처음에는 대여섯 개만 넣었더니 큰 풀밭이 단색 천처럼 보였다.
  grass: grassTile(`
    <path d="M5 27q2-5 4 0M13 21q2-5 4 0M23 27q2-4 3 0M29 24q1.5-4 3 0" stroke="#5fbc5c" stroke-width="1.4" opacity="0.9"/>
    <path d="M9 13q2-4 3 0M26 15q2-4 3 0M18 9q2-4 3 0M2 8q1.5-3.5 3 0" stroke="#3f9642" stroke-width="1.3" opacity="0.8"/>
    <path d="M20 18q1.5-3 2.5 0M7 20q1.5-3 2.5 0" stroke="#69c866" stroke-width="1.1" opacity="0.7"/>`,
    `<ellipse cx="14" cy="16" rx="7" ry="5" fill="#54ad53" opacity="0.35"/>
     <ellipse cx="26" cy="6" rx="5" ry="3.5" fill="#429844" opacity="0.3"/>`),

  grass2: grassTile(`
    <path d="M8 24q2-5 4 0M20 18q2-5 4 0M27 28q2-4 3 0M3 29q1.5-4 3 0" stroke="#5fbc5c" stroke-width="1.4" opacity="0.85"/>
    <path d="M3 16q2-4 3 0M15 11q2-4 3 0M25 9q2-4 3 0" stroke="#3f9642" stroke-width="1.3" opacity="0.75"/>
    <path d="M12 28q1.5-3 2.5 0M23 13q1.5-3 2.5 0" stroke="#69c866" stroke-width="1.1" opacity="0.65"/>`,
    `<ellipse cx="21" cy="24" rx="7" ry="4.5" fill="#8fa05a" opacity="0.22"/>
     <ellipse cx="7" cy="9" rx="5.5" ry="4" fill="#54ad53" opacity="0.32"/>`),

  grass3: grassTile(`
    <path d="M11 28q2-5 4 0M25 22q2-5 4 0M6 17q2-4 3 0M18 6q1.5-4 3 0" stroke="#6ac765" stroke-width="1.5" opacity="0.9"/>
    <path d="M17 25q2-4 3 0M29 11q2-4 3 0M13 8q2-4 3 0M2 24q1.5-3.5 3 0" stroke="#3f9642" stroke-width="1.3" opacity="0.8"/>
    <path d="M22 16q1.5-3 2.5 0" stroke="#69c866" stroke-width="1.1" opacity="0.7"/>`,
    `<ellipse cx="20" cy="12" rx="6.5" ry="4.5" fill="#54ad53" opacity="0.33"/>
     <ellipse cx="9" cy="10" rx="2.2" ry="1.6" fill="#98a2a8" opacity="0.45"/>
     <ellipse cx="9" cy="9.4" rx="1.5" ry="1" fill="#c2c9cd" opacity="0.4"/>`),

  grass4: grassTile(`
    <path d="M4 21q2-5 4 0M16 27q2-5 4 0M28 19q2-4 3 0M9 30q1.5-4 3 0" stroke="#5fbc5c" stroke-width="1.4" opacity="0.85"/>
    <path d="M22 10q2-4 3 0M10 6q2-4 3 0M30 28q1.5-3.5 3 0" stroke="#3f9642" stroke-width="1.3" opacity="0.78"/>
    <path d="M17 15q1.5-3 2.5 0M5 13q1.5-3 2.5 0" stroke="#69c866" stroke-width="1.1" opacity="0.68"/>`,
    `<ellipse cx="12" cy="24" rx="6" ry="4" fill="#429844" opacity="0.3"/>
     <g opacity="0.5">
       <circle cx="24" cy="26" r="1.6" fill="#2f8f3d"/><circle cx="27" cy="27" r="1.4" fill="#2f8f3d"/>
       <circle cx="25.5" cy="29.5" r="1.2" fill="#2f8f3d"/>
     </g>`),

  // ── 길 (0.65) ───────────────────────────────────────────────
  //
  // ⚠ 처음에는 가장자리를 **물결로 파서** 밑의 풀이 비치게 했다. 한 칸만 보면
  //   자연스러운데, 깔아 놓으니 **길이 토막났다.** 큰길은 두 칸 높이라
  //   위 칸의 아래 물결과 아래 칸의 위 물결 사이로 풀이 비쳤고, 길이 두 갈래
  //   가는 띠처럼 끊겨 보였다. 길이 비스듬히 꺾이는 자리는 아예 조각으로 흩어졌다.
  //
  //   그래서 길 자체는 **네 변을 꽉 채운다** — 옆 칸과 만나면 빈틈없이 이어진다.
  //   자연스러운 가장자리는 따로 만든 **풀 술(edge_grass_*)** 이 맡는다.
  //   그건 풀과 맞닿은 변에만 얹으므로, 길 안쪽에는 생기지 않는다.
  path: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#c2a175"/>
    <path d="M0 9 q8 3 16 0 t16 -1" stroke="#b08e60" stroke-width="2.5" fill="none" opacity="0.35"/>
    <path d="M0 23 q9 -3 17 0 t15 1" stroke="#b08e60" stroke-width="2" fill="none" opacity="0.28"/>
    <ellipse cx="8" cy="14" rx="2.4" ry="1.6" fill="#a8875a" opacity="0.5"/>
    <ellipse cx="22" cy="18" rx="2.8" ry="1.8" fill="#a8875a" opacity="0.45"/>
    <ellipse cx="15" cy="27" rx="2" ry="1.3" fill="#a8875a" opacity="0.4"/>
    <circle cx="27" cy="7" r="1.1" fill="#e3cda6" opacity="0.75"/>
    <circle cx="5" cy="21" r="1" fill="#e3cda6" opacity="0.65"/>
    <circle cx="18" cy="5" r="0.9" fill="#e3cda6" opacity="0.6"/>
  </svg>`,

  path2: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#bd9b6e"/>
    <path d="M0 6 q9 3 17 0 t15 1" stroke="#a8875a" stroke-width="2.2" fill="none" opacity="0.3"/>
    <path d="M0 19 q8 -3 16 0 t16 1" stroke="#a8875a" stroke-width="2.6" fill="none" opacity="0.32"/>
    <ellipse cx="12" cy="11" rx="2.6" ry="1.7" fill="#a8875a" opacity="0.45"/>
    <ellipse cx="25" cy="25" rx="2.2" ry="1.5" fill="#a8875a" opacity="0.4"/>
    <circle cx="17" cy="29" r="1" fill="#e3cda6" opacity="0.6"/>
    <circle cx="3" cy="13" r="0.9" fill="#e3cda6" opacity="0.55"/>
  </svg>`,

  // ── 길가의 풀 술 (0.65) ─────────────────────────────────────
  //
  // 길이 풀과 맞닿는 **그 변에만** 얹는다. 네 방향을 따로 만든 이유는,
  // 한 장을 돌려 쓰면 발밑을 축으로 도는 그리기라 자리가 어긋나기 때문이다.
  // 이것 덕분에 길은 안쪽이 빈틈없이 이어지면서도 가장자리는 풀에 녹아든다.
  edge_grass_n: edgeGrass(0),
  edge_grass_e: edgeGrass(90),
  edge_grass_s: edgeGrass(180),
  edge_grass_w: edgeGrass(270),

  // ── 나무 — 그림자와 겹친 잎으로 부피를 만든다 ───────────────
  tree: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="28.5" rx="9.5" ry="3.2" fill="#12301c" opacity="0.38"/>
    <path d="M14.6 28 q-0.6 -6 0.4 -10 l2.4 0 q1 4 0.4 10 z" fill="#5a3a1e"/>
    <path d="M15 22 q-2.5 -1.5 -3.5 -3.5" stroke="#5a3a1e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <circle cx="16" cy="14" r="10.5" fill="#1c6633"/>
    <circle cx="11.5" cy="12" r="6.8" fill="#26803f"/>
    <circle cx="20.5" cy="13" r="6.4" fill="#26803f"/>
    <circle cx="16" cy="9.5" r="6" fill="#2f9a4b"/>
    <circle cx="12.5" cy="8.5" r="3.6" fill="#46b962" opacity="0.95"/>
    <circle cx="19" cy="7.5" r="2.6" fill="#46b962" opacity="0.8"/>
    <path d="M8 17 q3 4 8 4.5" stroke="#14512a" stroke-width="2" fill="none" opacity="0.5" stroke-linecap="round"/>
  </svg>`,

  // 나무 두 장 더. 숲은 같은 나무를 줄 세운 것처럼 보이면 안 된다 —
  // 키와 잎 뭉치를 조금씩 달리해 두고 자리로 섞는다(FieldScene).
  tree2: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="16" cy="28.5" rx="8.5" ry="3" fill="#12301c" opacity="0.36"/>
    <path d="M14.2 28 q-0.5 -7 0.5 -11 l2.2 0 q0.9 4 0.4 11 z" fill="#54361c"/>
    <circle cx="15" cy="15" r="9.5" fill="#19602f"/>
    <circle cx="20" cy="13.5" r="7" fill="#237a3b"/>
    <circle cx="11" cy="12.5" r="6" fill="#237a3b"/>
    <circle cx="16.5" cy="10" r="5.4" fill="#2c9247"/>
    <circle cx="20" cy="9" r="3" fill="#41b25c" opacity="0.9"/>
    <circle cx="11" cy="10" r="2.2" fill="#41b25c" opacity="0.7"/>
  </svg>`,

  tree3: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="29" rx="9" ry="3" fill="#12301c" opacity="0.34"/>
    <path d="M15 29 q-0.5 -8 0.4 -12 l2.3 0 q0.8 5 0.3 12 z" fill="#5f3f21"/>
    <path d="M16 20 q3 -1.5 4.5 -4" stroke="#5f3f21" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="16.5" cy="13" r="10" fill="#1a6a31"/>
    <circle cx="10.5" cy="14" r="6.2" fill="#238040"/>
    <circle cx="22" cy="15" r="5.6" fill="#238040"/>
    <circle cx="15" cy="8" r="6.4" fill="#309d4c"/>
    <circle cx="18.5" cy="6" r="3.2" fill="#4bbc66" opacity="0.9"/>
    <circle cx="9" cy="17" r="2" fill="#4bbc66" opacity="0.6"/>
  </svg>`,

  // ── 큰 나무 (0.67) — 칸보다 크게 그려 캐릭터를 가린다 ───────
  //
  // 32×32 안에 가둔 나무는 아무리 잘 그려도 "덤불"로 보인다. 나무는 사람보다
  // 커야 나무다. 그래서 이 그림들은 **56×72** 로, 제 칸 밖으로 자란다 —
  // 위로 두 칸 반, 옆으로 반 칸씩 삐져나온다.
  //
  // 그래서 그리는 자리도 다르다. 바닥 타일이 아니라 **사람과 같은 줄에 세워**
  // 발밑(py) 순서로 정렬한다(FieldScene). 그러면 나무 아래로 걸어 들어가면
  // 사람이 앞에 서고, 나무 뒤로 돌아가면 잎에 가려진다.
  //
  // ⚠ 밑동 그림자는 여기에 같이 넣는다. 따로 빼면 잎과 그림자가 서로 다른
  //   순서로 그려져, 남의 발밑에 그림자만 떠 있는 일이 생긴다.
  tree_big: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="16" ry="4.6" fill="#0f2a18" opacity="0.34"/>
    <path d="M23.5 70 q-2 -2 -0.5 -5 l0 -19 l10 0 l0 19 q1.5 3 -0.5 5 z" fill="#5a3a1e"/>
    <path d="M24.5 46 l3.5 0 l0 24 l-3.5 0 z" fill="#6d4a28" opacity="0.7"/>
    <path d="M25 50 q-6 -3 -9 -8" stroke="#5a3a1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M31 47 q6 -3 9 -9" stroke="#5a3a1e" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="30" rx="26" ry="22" fill="#1a5e30"/>
    <circle cx="13" cy="27" r="12" fill="#20733a"/>
    <circle cx="43" cy="28" r="11.5" fill="#20733a"/>
    <circle cx="28" cy="18" r="15" fill="#278844"/>
    <circle cx="18" cy="15" r="9" fill="#2f9d4e"/>
    <circle cx="37" cy="16" r="8" fill="#2f9d4e"/>
    <circle cx="26" cy="9" r="7.5" fill="#3cb35c"/>
    <circle cx="16" cy="10" r="4.4" fill="#4ec46d" opacity="0.9"/>
    <circle cx="34" cy="8" r="3.4" fill="#4ec46d" opacity="0.75"/>
    <path d="M8 34 q8 9 20 11" stroke="#124a26" stroke-width="3.4" fill="none" opacity="0.4" stroke-linecap="round"/>
    <path d="M48 33 q-7 9 -18 12" stroke="#124a26" stroke-width="3" fill="none" opacity="0.32" stroke-linecap="round"/>
  </svg>`,

  tree_big2: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="14.5" ry="4.2" fill="#0f2a18" opacity="0.32"/>
    <path d="M24 70 q-1.5 -2 -0.5 -4 l0 -22 l9 0 l0 22 q1 2 -0.5 4 z" fill="#54361c"/>
    <path d="M25 44 l3 0 l0 26 l-3 0 z" fill="#68452a" opacity="0.6"/>
    <path d="M32 45 q7 -4 10 -10" stroke="#54361c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="27" cy="27" rx="24" ry="20" fill="#175628"/>
    <circle cx="41" cy="25" r="12" fill="#1e6d36"/>
    <circle cx="13" cy="26" r="10.5" fill="#1e6d36"/>
    <circle cx="29" cy="15" r="14" fill="#268241"/>
    <circle cx="38" cy="12" r="7.5" fill="#2f9a4c"/>
    <circle cx="19" cy="13" r="6.5" fill="#2f9a4c"/>
    <circle cx="30" cy="7" r="5.6" fill="#43b060" opacity="0.92"/>
    <circle cx="14" cy="18" r="3.4" fill="#43b060" opacity="0.6"/>
    <path d="M46 30 q-8 10 -18 12" stroke="#0f4421" stroke-width="3.2" fill="none" opacity="0.36" stroke-linecap="round"/>
  </svg>`,

  tree_big3: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="72" viewBox="0 0 56 72">
    <ellipse cx="28" cy="69" rx="15" ry="4.4" fill="#0f2a18" opacity="0.3"/>
    <path d="M23.5 70 q-2 -3 0 -6 l0 -16 l10 0 l0 16 q2 3 0 6 z" fill="#5f3f21"/>
    <path d="M25 48 l3.4 0 l0 22 l-3.4 0 z" fill="#734d2c" opacity="0.65"/>
    <path d="M24 52 q-7 -4 -10 -10" stroke="#5f3f21" stroke-width="3" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="32" rx="25" ry="21" fill="#1c6433"/>
    <circle cx="12" cy="30" r="11" fill="#23793c"/>
    <circle cx="44" cy="31" r="10.5" fill="#23793c"/>
    <circle cx="27" cy="19" r="15.5" fill="#2b8f48"/>
    <circle cx="16" cy="18" r="8" fill="#33a352"/>
    <circle cx="39" cy="19" r="7" fill="#33a352"/>
    <circle cx="24" cy="10" r="7" fill="#45b962"/>
    <circle cx="35" cy="10" r="4" fill="#57cb74" opacity="0.85"/>
    <circle cx="14" cy="24" r="3" fill="#57cb74" opacity="0.6"/>
    <path d="M9 37 q9 9 19 10" stroke="#14512a" stroke-width="3.2" fill="none" opacity="0.38" stroke-linecap="round"/>
  </svg>`,

  // 나무 그늘 (0.68) — 바닥에 먼저 깔린다.
  //
  // 큰 나무를 사람과 같은 줄에 세우고 나니, 나무가 땅에 **붙어 있지 않고 떠**
  // 보였다. 밑동 그림자만으로는 부족하다 — 잎이 칸 밖까지 자라는데 그늘은
  // 한 뼘도 없으면 눈이 "이게 어디에 서 있지" 를 못 푼다.
  //
  // 빛은 왼쪽 위에서 온다(다른 그림자와 같은 방향). 그래서 그늘은 오른쪽 아래로
  // 눕는다. 밑동 그림자와 달리 이것은 **바닥 그림**이라, 사람이 그 위를 밟고 지나간다.
  tree_shade: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="40" viewBox="0 0 56 40">
    <ellipse cx="31" cy="26" rx="24" ry="12" fill="#0f2a18" opacity="0.17"/>
    <ellipse cx="33" cy="28" rx="17" ry="8.5" fill="#0f2a18" opacity="0.13"/>
    <ellipse cx="29" cy="24" rx="9" ry="5" fill="#0f2a18" opacity="0.1"/>
  </svg>`,

  // ── 집 지붕 (0.70.1) — 칸보다 **훨씬 크게** 세운다 ──────────
  //
  // 0.68 에는 마루를 24px 만 내밀었다. 집이 납작한 딱지처럼 보이는 것은 면했지만,
  // 집 **뒤로 걸어가는** 맛은 안 났다 — 사람의 발끝만 살짝 가렸다.
  //
  // 이제 지붕 윗줄이 칸 위로 **56px(거의 두 칸)** 자란다. 집 북쪽에 서면
  // 사람이 지붕에 가린다 — 그것이 "집 뒤에 있다" 이다.
  // (통째로 삼키지는 않는다. 겹치는 동안에는 집 한 채가 함께 비친다 — FieldScene)
  //
  // ⚠ 세 장으로 나눈다. 6칸짜리 집을 같은 그림으로 도배하면 지붕이 아니라
  //   **띠**로 보인다. 왼쪽 끝은 왼쪽 처마가, 오른쪽 끝은 오른쪽 처마가 있어야
  //   한 채로 읽힌다. 어느 것을 쓸지는 옆 칸을 보고 정한다(FieldScene).
  house_roof_top: roofTop('m'),
  house_roof_top_l: roofTop('l'),
  house_roof_top_r: roofTop('r'),

  // ── 큰 바위 — 막는 것. 크고 확실하게 보이게 ─────────────────
  rock: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="28" rx="11" ry="3.4" fill="#12301c" opacity="0.35"/>
    <path d="M4 27 L7 13 L14 6 L24 9 L28 19 L27 27 Z" fill="#7d879a"/>
    <path d="M7 13 L14 6 L24 9 L20 17 L11 19 Z" fill="#9fa9bb"/>
    <path d="M14 6 L18 7 L15 15 L11 14 Z" fill="#b8c1d0" opacity="0.8"/>
    <path d="M20 17 L28 19 L27 27 L18 26 Z" fill="#5f6a7c"/>
    <path d="M4 27 L11 19 L18 26 Z" fill="#6b7688"/>
    <path d="M9 21 q3 1 5 -1" stroke="#4c5666" stroke-width="1" fill="none" opacity="0.6"/>
    <ellipse cx="22" cy="12" rx="3" ry="1.6" fill="#4f8a3f" opacity="0.45"/>
    <ellipse cx="9" cy="24" rx="2.4" ry="1.3" fill="#4f8a3f" opacity="0.4"/>
  </svg>`,

  // ── 걸어 다닐 수 있는 조경 (0.65) ───────────────────────────
  //
  // 예전에는 바위가 전부 **한 칸짜리 벽**이었다. 그런 것이 들판에 열여섯 개
  // 흩어져 있으면 길이 아니라 지뢰밭이 된다. 이제 대부분은 **밟고 지나가는**
  // 잔돌·덤불·그루터기로 깔고, 막는 것은 크고 확실한 바위 무더기만 남긴다.

  pebble: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="12" cy="19" rx="4.6" ry="3.2" fill="#0d2415" opacity="0.25"/>
    <ellipse cx="11.6" cy="18" rx="4.4" ry="3" fill="#8d97a6"/>
    <ellipse cx="10.6" cy="17" rx="2.6" ry="1.6" fill="#b3bcc9"/>
    <ellipse cx="22" cy="24" rx="3.2" ry="2.2" fill="#0d2415" opacity="0.22"/>
    <ellipse cx="21.7" cy="23.3" rx="3" ry="2" fill="#7f8998"/>
    <ellipse cx="21" cy="22.7" rx="1.7" ry="1" fill="#a8b1be"/>
    <ellipse cx="24" cy="11" rx="2.2" ry="1.5" fill="#8d97a6" opacity="0.85"/>
  </svg>`,

  bush: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="25" rx="9" ry="3" fill="#12301c" opacity="0.3"/>
    <circle cx="11" cy="20" r="6" fill="#1f6f37"/>
    <circle cx="20" cy="20" r="6.4" fill="#1f6f37"/>
    <circle cx="15.5" cy="17" r="6" fill="#2a8a45"/>
    <circle cx="12" cy="16" r="3.2" fill="#3ea85a" opacity="0.9"/>
    <circle cx="20" cy="16.5" r="2.4" fill="#3ea85a" opacity="0.75"/>
    <circle cx="22.5" cy="21" r="1.2" fill="#e0555f" opacity="0.9"/>
    <circle cx="9.5" cy="22" r="1.1" fill="#e0555f" opacity="0.8"/>
  </svg>`,

  stump: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <ellipse cx="17" cy="24" rx="8" ry="2.8" fill="#12301c" opacity="0.32"/>
    <path d="M10 22 q0 -7 1 -9 l10 0 q1 2 1 9 z" fill="#6b4423"/>
    <ellipse cx="16" cy="13" rx="6" ry="2.6" fill="#a3763f"/>
    <ellipse cx="16" cy="13" rx="3.6" ry="1.5" fill="#8a6132" opacity="0.8"/>
    <ellipse cx="16" cy="13" rx="1.4" ry="0.6" fill="#6b4423" opacity="0.8"/>
    <path d="M11 18 q5 1.5 10 0" stroke="#52351b" stroke-width="1" fill="none" opacity="0.7"/>
    <ellipse cx="24" cy="21" rx="3" ry="1.6" fill="#2a8a45" opacity="0.6"/>
  </svg>`,

  grass_tall: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g fill="none" stroke-linecap="round">
      <path d="M10 27 q-1 -8 -3 -11" stroke="#2f8f3d" stroke-width="1.8" opacity="0.9"/>
      <path d="M12 27 q0 -9 1 -12" stroke="#3aa64a" stroke-width="1.8" opacity="0.9"/>
      <path d="M14 27 q2 -8 5 -10" stroke="#2f8f3d" stroke-width="1.7" opacity="0.85"/>
      <path d="M20 28 q0 -7 2 -10" stroke="#3aa64a" stroke-width="1.7" opacity="0.85"/>
      <path d="M22 28 q2 -6 5 -8" stroke="#2f8f3d" stroke-width="1.5" opacity="0.8"/>
      <path d="M18 28 q-1 -6 -1 -9" stroke="#4fc060" stroke-width="1.4" opacity="0.75"/>
    </g>
  </svg>`,

  // ── 물 (0.67) ───────────────────────────────────────────────
  //
  // 밑색은 **평평하게** 둔다(풀과 같은 이유 — 위아래 그라데이션을 넣으면
  // 연못을 이어 붙였을 때 가로줄무늬가 된다. 0.65 에 한 번 겪었다).
  // 깊이는 얼룩과 물결로만 준다.
  water: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#2d78b4"/>
    <ellipse cx="9" cy="11" rx="11" ry="7" fill="#27689f" opacity="0.55"/>
    <ellipse cx="25" cy="24" rx="10" ry="6" fill="#27689f" opacity="0.45"/>
    <path d="M1 8q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1.5" fill="none" opacity="0.5" stroke-linecap="round"/>
    <path d="M-3 18q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1.2" fill="none" opacity="0.34" stroke-linecap="round"/>
    <path d="M1 26q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1" fill="none" opacity="0.26" stroke-linecap="round"/>
    <circle cx="24" cy="12" r="1.1" fill="#dff4ff" opacity="0.5"/>
    <circle cx="8" cy="22" r="0.9" fill="#dff4ff" opacity="0.4"/>
  </svg>`,

  // 물 두 번째 장 — 연못이 넓으면 한 장만으로는 격자가 보인다.
  water2: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="#2d78b4"/>
    <ellipse cx="22" cy="9" rx="12" ry="7" fill="#27689f" opacity="0.5"/>
    <ellipse cx="7" cy="25" rx="10" ry="6" fill="#27689f" opacity="0.42"/>
    <path d="M-2 12q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1.4" fill="none" opacity="0.46" stroke-linecap="round"/>
    <path d="M2 22q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1.1" fill="none" opacity="0.3" stroke-linecap="round"/>
    <path d="M-1 29q4-2.5 8 0t8 0 8 0 8 0" stroke="#9fdcf7" stroke-width="1" fill="none" opacity="0.22" stroke-linecap="round"/>
    <circle cx="11" cy="6" r="1" fill="#dff4ff" opacity="0.45"/>
    <circle cx="27" cy="19" r="0.9" fill="#dff4ff" opacity="0.38"/>
  </svg>`,

  // ── 물가 (0.67) ─────────────────────────────────────────────
  //
  // 물과 땅이 **직선으로** 맞닿아 있으면 연못이 아니라 파란 사각형이 된다.
  // 길에 풀 술을 얹은 것과 같은 방법을 쓴다 — 땅과 맞닿은 변에만
  // 젖은 모래와 거품을 얹는다. 물끼리 맞닿은 변에는 안 얹으므로
  // 연못 한가운데에 모래톱이 생기는 일은 없다.
  //
  // ⚠ 얹는 그림이라 **밑변이 투명**해야 한다. 사각형을 꽉 채우면
  //   물 위에 모래 띠를 두른 꼴이 되어 오히려 더 딱딱해진다.
  shore_n: shoreEdge(0),
  shore_e: shoreEdge(90),
  shore_s: shoreEdge(180),
  shore_w: shoreEdge(270),

  // 대각선 모서리 (0.68).
  //
  // 네 변만 두르면 **비스듬히 맞닿은 땅**이 빠진다. 연못 모서리를 깎아
  // 둥글게 만들면 바로 그 자리가 물과 땅이 대각선으로 만나는 곳인데,
  // 거기만 모래가 없어 물이 땅을 파고든 것처럼 보였다.
  shore_dnw: shoreCorner(0),
  shore_dne: shoreCorner(90),
  shore_dse: shoreCorner(180),
  shore_dsw: shoreCorner(270),

  // ── 용암 가장자리 (0.70) ────────────────────────────────────
  //
  // 물가와 **같은 방법**이다. 검은 잿더미에 주황 네모가 박혀 있으면 용암이
  // 아니라 카펫으로 보인다. 다만 두르는 것이 다르다 —
  // 물은 젖은 모래와 거품, 용암은 **식어 굳은 껍질**과 그 안쪽의 붉은 빛이다.
  crust_n: crustEdge(0),
  crust_e: crustEdge(90),
  crust_s: crustEdge(180),
  crust_w: crustEdge(270),
  crust_dnw: crustCorner(0),
  crust_dne: crustCorner(90),
  crust_dse: crustCorner(180),
  crust_dsw: crustCorner(270),

  // ── 꽃 — 얹는 그림 ──────────────────────────────────────────
  flower: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <g stroke="#2f8f3d" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.8">
      <path d="M10 18 q0 4 0 6M22 24 q0 3 0 4M16 27 q0 2 0 2"/>
    </g>
    <g>
      <circle cx="10" cy="15" r="3" fill="#ff8fb4"/>
      <circle cx="10" cy="15" r="1.2" fill="#ffe9a3"/>
      <circle cx="22" cy="21" r="2.8" fill="#ffd166"/>
      <circle cx="22" cy="21" r="1.1" fill="#fff6d6"/>
      <circle cx="16" cy="25" r="2.4" fill="#c58cff"/>
      <circle cx="16" cy="25" r="0.9" fill="#fff"/>
      <circle cx="26" cy="12" r="2" fill="#8fd3ff"/>
      <circle cx="26" cy="12" r="0.8" fill="#fff"/>
    </g>
  </svg>`,
};

// ---------- 캐릭터 (viewBox 96x128) ----------
// 초기 차림: 민소매(나시) + 반바지, 맨팔·맨다리.
// 무기와 망토·소매는 여기에 그리지 않는다 — 장비에 따라 core/Appearance.js 가 얹는다.
const HERO = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="tunic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f8ef7"/><stop offset="1" stop-color="#2b5fc4"/>
    </linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8b5a2b"/><stop offset="1" stop-color="#5e3a17"/>
    </linearGradient>
    <linearGradient id="shorts" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c7a4e"/><stop offset="1" stop-color="#6b4f2c"/>
    </linearGradient>
    ${defsShadowLift}
  </defs>

  <!-- 맨다리 -->
  <rect x="37" y="96" width="9" height="16" rx="4.5" fill="#f0c39a"/>
  <rect x="50" y="96" width="9" height="16" rx="4.5" fill="#f0c39a"/>

  <!-- 샌들 -->
  <ellipse cx="41.5" cy="114" rx="7.5" ry="4.2" fill="#6b4423"/>
  <ellipse cx="54.5" cy="114" rx="7.5" ry="4.2" fill="#6b4423"/>
  <path d="M36 112 l11 -3M49 112 l11 -3" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/>

  <!-- 반바지 -->
  <path d="M32 82 L64 82 L63 99 L51 99 L48 90 L45 99 L33 99 Z" fill="url(#shorts)"/>
  <rect x="31" y="80" width="34" height="6" rx="3" fill="#7a5a34"/>
  <rect x="44" y="80" width="8" height="6" rx="2" fill="#ffd166"/>

  <!-- 민소매 상의 -->
  <path d="M34 54 Q36 49 42 48 L54 48 Q60 49 62 54 L64 84 Q48 89 32 84 Z" fill="url(#tunic)"/>
  <path d="M42 48 Q48 56 54 48" fill="#1f4a9e" opacity="0.55"/>
  <path d="M34 54 Q48 60 62 54 L62 64 Q48 70 34 64 Z" fill="url(#rim)"/>

  <!-- 맨팔 (어깨가 드러난다) -->
  <rect x="24" y="54" width="10" height="34" rx="5" fill="#f0c39a"/>
  <rect x="62" y="54" width="10" height="34" rx="5" fill="#f0c39a"/>
  <circle cx="29" cy="90" r="6" fill="#f7cfa6"/>
  <circle cx="67" cy="90" r="6" fill="#f7cfa6"/>
  <circle cx="29" cy="56" r="5.4" fill="#f7cfa6"/>
  <circle cx="67" cy="56" r="5.4" fill="#f7cfa6"/>

  <!-- 머리 -->
  <ellipse cx="48" cy="34" rx="21" ry="20" fill="#f7cfa6"/>
  <path d="M27 32 Q30 8 48 8 Q66 8 69 32 Q60 22 48 24 Q36 22 27 32 Z" fill="url(#hair)"/>
  <ellipse cx="40" cy="36" rx="3.4" ry="4.2" fill="#2a2118"/>
  <ellipse cx="56" cy="36" rx="3.4" ry="4.2" fill="#2a2118"/>
  <circle cx="41.2" cy="34.4" r="1.2" fill="#fff"/>
  <circle cx="57.2" cy="34.4" r="1.2" fill="#fff"/>
  <path d="M43 45 q5 4 10 0" stroke="#b5764c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="42" r="3.6" fill="#ff9c9c" opacity="0.5"/>
  <circle cx="64" cy="42" r="3.6" fill="#ff9c9c" opacity="0.5"/>
</svg>`;

// ---------- 몬스터 (viewBox 128x128) ----------
const SLIME = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="sl" cx="0.38" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#8fe6ff"/><stop offset="0.55" stop-color="#3fb6ea"/>
      <stop offset="1" stop-color="#1d7fbd"/>
    </radialGradient>
  </defs>
  <path d="M18 104 Q10 62 40 36 Q64 16 88 36 Q118 62 110 104 Q64 116 18 104 Z" fill="url(#sl)"/>
  <path d="M18 104 Q64 116 110 104 Q64 112 18 104 Z" fill="#0f5f92" opacity="0.5"/>
  <ellipse cx="46" cy="46" rx="15" ry="10" fill="#fff" opacity="0.55" transform="rotate(-22 46 46)"/>
  <ellipse cx="48" cy="70" rx="8" ry="10" fill="#10344a"/>
  <ellipse cx="82" cy="70" rx="8" ry="10" fill="#10344a"/>
  <circle cx="51" cy="66" r="3" fill="#fff"/><circle cx="85" cy="66" r="3" fill="#fff"/>
  <path d="M56 88 q9 9 18 0" stroke="#10344a" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

const BAT = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="wing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b4fa8"/><stop offset="1" stop-color="#3a2762"/>
    </linearGradient>
    <radialGradient id="body" cx="0.4" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#7d5fbd"/><stop offset="1" stop-color="#402a70"/>
    </radialGradient>
  </defs>
  <path d="M46 60 Q18 34 4 46 Q16 52 12 66 Q24 62 30 74 Q36 64 46 66 Z" fill="url(#wing)"/>
  <path d="M82 60 Q110 34 124 46 Q112 52 116 66 Q104 62 98 74 Q92 64 82 66 Z" fill="url(#wing)"/>
  <ellipse cx="64" cy="72" rx="26" ry="28" fill="url(#body)"/>
  <path d="M44 50 L48 24 L62 44 Z" fill="#5b3f96"/>
  <path d="M84 50 L80 24 L66 44 Z" fill="#5b3f96"/>
  <path d="M47 46 L49 32 L58 45 Z" fill="#c58cff" opacity="0.6"/>
  <path d="M81 46 L79 32 L70 45 Z" fill="#c58cff" opacity="0.6"/>
  <ellipse cx="54" cy="66" rx="7.5" ry="8.5" fill="#ffe066"/>
  <ellipse cx="76" cy="66" rx="7.5" ry="8.5" fill="#ffe066"/>
  <ellipse cx="54" cy="67" rx="3" ry="5" fill="#2a1840"/>
  <ellipse cx="76" cy="67" rx="3" ry="5" fill="#2a1840"/>
  <path d="M56 84 L60 92 L64 84 L68 92 L72 84" stroke="#fff" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
</svg>`;

const MUSHROOM = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff7a6b"/><stop offset="1" stop-color="#c3352c"/>
    </linearGradient>
    <linearGradient id="stalk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf0d5"/><stop offset="1" stop-color="#d9c39a"/>
    </linearGradient>
  </defs>
  <path d="M40 66 Q38 100 44 110 L84 110 Q90 100 88 66 Z" fill="url(#stalk)"/>
  <path d="M10 68 Q14 22 64 20 Q114 22 118 68 Q64 82 10 68 Z" fill="url(#cap)"/>
  <circle cx="34" cy="48" r="9" fill="#ffeede" opacity="0.95"/>
  <circle cx="66" cy="38" r="11" fill="#ffeede" opacity="0.95"/>
  <circle cx="97" cy="52" r="8" fill="#ffeede" opacity="0.95"/>
  <path d="M10 68 Q64 82 118 68 Q64 76 10 68 Z" fill="#8c211b" opacity="0.5"/>
  <path d="M44 82 L60 88" stroke="#6b5a3c" stroke-width="4" stroke-linecap="round"/>
  <path d="M84 82 L68 88" stroke="#6b5a3c" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="52" cy="94" rx="6" ry="7" fill="#3a2f1c"/>
  <ellipse cx="76" cy="94" rx="6" ry="7" fill="#3a2f1c"/>
  <circle cx="54" cy="91" r="2" fill="#fff"/><circle cx="78" cy="91" r="2" fill="#fff"/>
  <path d="M56 106 q8 -6 16 0" stroke="#3a2f1c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ---------- 아이템 아이콘 64x64 ----------
function itemSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
}

const ITEMS = {
  wooden_sword: itemSvg(`
    <g transform="rotate(-38 32 32)">
      <path d="M28 6 L36 6 L36 40 L32 46 L28 40 Z" fill="#c89a5e"/>
      <path d="M28 6 L32 6 L32 40 L30 43 Z" fill="#e0b87f"/>
      <rect x="20" y="40" width="24" height="5" rx="2.5" fill="#8b5a2b"/>
      <rect x="29" y="45" width="6" height="13" rx="3" fill="#6b4423"/>
      <circle cx="32" cy="58" r="4" fill="#a3702f"/>
    </g>`),
  iron_sword: itemSvg(`
    <g transform="rotate(-38 32 32)">
      <path d="M27 4 L37 4 L37 40 L32 47 L27 40 Z" fill="#b9c4d4"/>
      <path d="M27 4 L32 4 L32 40 L29.5 43.5 Z" fill="#eff4fa"/>
      <rect x="18" y="40" width="28" height="6" rx="3" fill="#ffd166"/>
      <rect x="29" y="46" width="6" height="13" rx="3" fill="#5a3a1e"/>
      <circle cx="32" cy="59" r="4.2" fill="#ffd166"/>
    </g>`),
  cloth_armor: itemSvg(`
    <path d="M20 14 L28 10 L36 10 L44 14 L48 24 L41 27 L41 52 L23 52 L23 27 L16 24 Z" fill="#e8ddc4"/>
    <path d="M28 10 L32 20 L36 10 Z" fill="#cdbf9d"/>
    <rect x="23" y="38" width="18" height="5" rx="2" fill="#b9a67f"/>`),
  leather_armor: itemSvg(`
    <path d="M20 14 L28 10 L36 10 L44 14 L48 24 L41 27 L41 52 L23 52 L23 27 L16 24 Z" fill="#9c6b3f"/>
    <path d="M28 10 L32 20 L36 10 Z" fill="#7a5230"/>
    <rect x="23" y="36" width="18" height="6" rx="3" fill="#5d3d22"/>
    <circle cx="27" cy="28" r="2" fill="#d9b48a"/><circle cx="37" cy="28" r="2" fill="#d9b48a"/>`),
  swift_ring: itemSvg(`
    <circle cx="32" cy="38" r="16" fill="none" stroke="#ffd166" stroke-width="6"/>
    <circle cx="32" cy="38" r="16" fill="none" stroke="#fff0b8" stroke-width="2"/>
    <path d="M32 8 L38 20 L26 20 Z" fill="#7cc4ff"/>
    <circle cx="32" cy="18" r="6" fill="#4fa8ef"/>
    <circle cx="30" cy="16" r="2" fill="#dff1ff"/>`),
  herb: itemSvg(`
    <path d="M32 54 Q32 34 32 20" stroke="#4a7c37" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M32 34 Q14 32 12 16 Q30 14 32 34 Z" fill="#5fbf5a"/>
    <path d="M32 30 Q50 26 54 12 Q34 12 32 30 Z" fill="#7ad46f"/>
    <path d="M32 46 Q20 46 18 36 Q30 34 32 46 Z" fill="#4a9e4a"/>`),
  slime_jelly: itemSvg(`
    <path d="M32 8 Q50 30 50 40 A18 18 0 1 1 14 40 Q14 30 32 8 Z" fill="#4fc3f7"/>
    <path d="M32 14 Q44 32 44 40 A12 12 0 0 1 22 44 Z" fill="#8fe6ff" opacity="0.6"/>
    <ellipse cx="25" cy="34" rx="5" ry="7" fill="#fff" opacity="0.75" transform="rotate(-20 25 34)"/>`),
  bat_fang: itemSvg(`
    <path d="M22 10 Q32 6 42 10 L36 34 Q32 56 28 34 Z" fill="#f2f5fa"/>
    <path d="M22 10 Q28 8 30 10 L30 40 Q27 44 26 30 Z" fill="#fff"/>
    <path d="M22 10 Q32 16 42 10" stroke="#c9d3e0" stroke-width="2.5" fill="none"/>`),
};

// ---------- 전투 배경 640x480 ----------
const BATTLE_BG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3c6b"/><stop offset="0.45" stop-color="#3d5484"/>
      <stop offset="0.62" stop-color="#5b6f93"/><stop offset="1" stop-color="#1a2438"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3c6b45"/><stop offset="1" stop-color="#1c3325"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#ffd9a0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="480" fill="url(#sky)"/>
  <circle cx="320" cy="200" r="180" fill="url(#glow)"/>
  <path d="M0 250 L90 170 L160 250 L250 150 L340 250 L430 180 L520 250 L640 165 L640 300 L0 300 Z" fill="#243453" opacity="0.85"/>
  <path d="M0 275 L80 220 L170 280 L280 215 L380 280 L480 225 L570 285 L640 240 L640 320 L0 320 Z" fill="#1c2942" opacity="0.9"/>
  <rect y="290" width="640" height="190" fill="url(#ground)"/>
  <ellipse cx="320" cy="300" rx="420" ry="40" fill="#4a7d55" opacity="0.5"/>
  <g opacity="0.35" fill="#8fd48a">
    <path d="M60 340q4-14 8 0M140 380q4-14 8 0M420 350q4-14 8 0M560 400q4-14 8 0M250 420q4-14 8 0"/>
  </g>
  <rect y="300" width="640" height="180" fill="#000" opacity="0.12"/>
</svg>`;

// ---------- 확장 아트 (마을/NPC/보스/상위 아이템) ----------
const EXT = require('./art-town.js');
const GEAR = require('./art-gear.js');
const CLS = require('./art-class.js');
const DEEP = require('./art-deep.js');
const GEMS = require('./art-gems.js');
const VOLC = require('./art-volcano.js');
const WEST = require('./art-west.js');
const ROOM = require('./art-room.js');
const LEGEND = require('./art-legend.js');

// ---------- 렌더 ----------
const JOBS = [];

// 칸(32×32)보다 크게 굽는 바닥 그림 (0.67).
//
// 큰 나무는 제 칸 밖으로 자란다 — 위로 두 칸 넘게, 옆으로 반 칸씩.
// 여기 적어 두지 않으면 아래 루프가 32×32 로 눌러 담아 납작한 덤불이 된다.
const BIG_TILES = {
  tree_big: { w: 56, h: 72 },
  tree_big2: { w: 56, h: 72 },
  tree_big3: { w: 56, h: 72 },
  tree_shade: { w: 56, h: 40 },
  house_roof_top: { w: 32, h: 120 },
  house_roof_top_l: { w: 32, h: 120 },
  house_roof_top_r: { w: 32, h: 120 },
};

for (const [name, svg] of Object.entries({
  ...TILES, ...EXT.TOWN_TILES, ...GEAR.SIGN_TILES, ...DEEP.DEEP_TILES, ...VOLC.VOLCANO_TILES,
  ...WEST.WEST_TILES, ...ROOM.ROOM_TILES,
})) {
  const big = BIG_TILES[name];
  JOBS.push({ svg, w: big ? big.w : 32, h: big ? big.h : 32, out: `tiles/${name}.png` });
}
// 직업 마크 (0.69) — 랭킹표 이름 옆에 서는 작은 그림.
// 타일이 아니라 UI 그림이라 tiles/ 가 아니라 ui/ 아래에 굽는다.
for (const [name, svg] of Object.entries(CLS.CLASS_MARKS)) {
  JOBS.push({ svg, w: 24, h: 24, out: `ui/marks/${name.replace(/^mark_/, '')}.png` });
}

// 직업별 주인공 스프라이트는 tools/art-class.js 에서 만든다.
// (원본 일러스트로 바꾸고 싶으면 tools/prep-hero.py 를 쓰고 아래 루프를 주석 처리할 것)
// 운영자 모습도 같은 규격으로 굽는다. 직업이 아니므로 CLASS_SPRITES 에 넣지 않는다
// (넣으면 접속 화면의 직업 고르기에 나타난다).
const ADMIN_ART = require('./art-admin.js');
const FX = require('./art-fx.js');
for (const [name, svg] of Object.entries({ ...CLS.CLASS_SPRITES, admin: ADMIN_ART.ADMIN })) {
  JOBS.push({ svg, w: 96, h: 128, out: `sprites/characters/${name}_field.png` });
  JOBS.push({ svg, w: 384, h: 512, out: `sprites/characters/${name}_battle.png` });
  // 0.43 — 내지르는 자세. 전투에서 때리는 순간에만 이 그림으로 바뀐다.
  // 서 있는 그림을 기울이고 무기 궤적을 얹어 만든다(따로 그리지 않는다).
  const arc = FX.ATTACK_ARC[name];
  if (arc) {
    JOBS.push({ svg: FX.attackPose(svg, arc), w: 384, h: 512,
                out: `sprites/characters/${name}_attack.png` });
  }
  // 0.56 — 전투 기본 자세. 전투 화면에서 **서 있는 동안** 쓰는 그림이다.
  // (차렷으로 서 있던 것을 팔·다리를 다시 그려 싸울 자세로 바꿨다)
  const stance = CLS.CLASS_STANCE[name];
  if (stance) {
    JOBS.push({ svg: stance, w: 384, h: 512, out: `sprites/characters/${name}_stance.png` });
  }
}

// 전투 이펙트 — 맞는 자리에 한 번 터졌다 사라지는 그림 다섯 장.
// 그리는 크기는 128 이고 파일은 192 로 굽는다(1.5배). 다른 그림은 2배로 굽지만
// 이것은 0.3초만 스치는 빛이라 그만큼 선명할 필요가 없다 —
// 256 으로 구웠더니 다섯 장이 320KB 였고, 한 장짜리 html 이 그만큼 무거워졌다.
for (const [name, svg] of Object.entries(FX.FX_SPRITES)) {
  JOBS.push({ svg, w: 192, h: 192, out: `fx/${name}.png` });
}

for (const [key, svg] of Object.entries(EXT.NPCS)) {
  const name = key.replace(/^npc_/, '');
  JOBS.push({ svg, w: 96, h: 128, out: `sprites/npc/${name}.png` });
}
JOBS.push({ svg: EXT.QUEST_BOARD, w: 96, h: 128, out: 'sprites/npc/quest_board.png' });
JOBS.push({ svg: DEEP.WAYPOINT_STONE, w: 96, h: 128, out: 'sprites/npc/waypoint.png' });
JOBS.push({ svg: DEEP.GATE_MERCHANT, w: 96, h: 128, out: 'sprites/npc/gate_merchant.png' });
JOBS.push({ svg: WEST.WITCH, w: 96, h: 128, out: 'sprites/npc/witch.png' });

const MON = {
  slime: SLIME,
  bat: BAT,
  mushroom: MUSHROOM,
  wolf: EXT.WOLF,
  imp: EXT.IMP,
  skeleton: EXT.SKELETON,
  demon_soldier: EXT.DEMON_SOLDIER,
  imp_captain: EXT.IMP_CAPTAIN,
  demon_general: EXT.DEMON_GENERAL,
  great_dragon: WEST.GREAT_DRAGON,
  elder_dragon: WEST.ELDER_DRAGON,
};
const MONFX = require('./art-monfx.js');
for (const [name, svg] of Object.entries(MON)) {
  // 0.70.3 — 들판 몬스터를 **크게** 굽는다.
  //
  //   48×48 은 칸(32) 보다 겨우 한 뼘 컸다. 나무와 집이 칸 밖으로 자라고 나니
  //   그 옆에 선 몬스터만 유난히 납작해 보였다 — 같은 땅에 사는 것 같지 않았다.
  //   128 로 구워 64(두 칸)로 쓴다. 2배로 굽는 것은 다른 그림과 같은 규칙이고,
  //   그래야 확대해도 흐려지지 않는다(manifest 가 그릴 크기를 정한다).
  JOBS.push({ svg, w: 128, h: 128, out: `sprites/monsters/${name}_field.png` });
  JOBS.push({ svg, w: 256, h: 256, out: `sprites/monsters/${name}_battle.png` });
  // 0.44 — 덤벼드는 자세. 전투에서 때리는 순간에만 이 그림으로 바뀐다.
  // 몬스터는 왼쪽(주인공 쪽)을 보고 서 있으므로 자국도 왼쪽 앞에 붙는다.
  const how = MONFX.MON_ATTACK[name];
  if (how) {
    JOBS.push({ svg: MONFX.attackPose(svg, how), w: 256, h: 256,
                out: `sprites/monsters/${name}_attack.png` });
  }
}
for (const [name, svg] of Object.entries({ ...ITEMS, ...EXT.NEW_ITEMS, ...GEAR.GEAR_ITEMS, ...CLS.CLASS_ITEMS, ...DEEP.DEEP_ITEMS, ...GEMS.GEM_ITEMS, ...WEST.WEST_ITEMS, ...LEGEND.LEGEND_ITEMS })) {
  JOBS.push({ svg, w: 64, h: 64, out: `ui/items/${name}.png` });
}
JOBS.push({ svg: BATTLE_BG, w: 640, h: 480, out: 'ui/battle_bg_field.png' });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const job of JOBS) {
    const svg = job.svg.replace(/\{W\}/g, job.w).replace(/\{H\}/g, job.h);
    await page.setContent(
      `<body style="margin:0;background:transparent">
         <div id="t" style="width:${job.w}px;height:${job.h}px;line-height:0">${svg}</div>
       </body>`
    );
    const el = await page.$('#t');
    const file = path.join(OUT, job.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await el.screenshot({ path: file, omitBackground: true });
    console.log('✓', job.out);
  }
  await browser.close();
})();
