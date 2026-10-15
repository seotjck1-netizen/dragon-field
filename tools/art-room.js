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

/**
 * 바닥 널 — 어느 칸에 놓아도 이어지는 밑바탕.
 *
 * ── 0.70.22 에 **세로로 눕혔다** ─────────────────────────────
 * 그 전에는 널을 **가로로** 깔고 8px 마다 이음매를 그었다. 한 칸만 보면 마루인데,
 * 방 하나를 채우면 화면에 **가로줄이 죽 그어진다** — 널의 이음매(8px 주기)와
 * 칸의 이음매(32px 주기)가 같은 방향으로 겹쳐서, 마루가 아니라 **줄무늬 천**으로 보였다.
 *
 * 세로로 눕히면 그 겹침이 사라진다. 세로 이음매는 칸 경계와 **직각**으로 만나므로
 * 서로를 강조하지 않는다. 그리고 널을 11px 로 넓히고 이음매를 흐리게 해서,
 * 멀리서 보면 나무빛 한 장으로 보이고 가까이서만 결이 보이게 했다.
 *
 * ⚠ 널의 **가로 자리**는 32 의 약수로 끊어야 한다(11 + 11 + 10). 아무 폭이나 쓰면
 *   칸 경계에서 널이 반 토막 나 그 자리만 굵은 선이 된다.
 * ⚠ 짧은 마디(널이 끝나고 다음 널이 시작되는 가로선)는 **칸마다 다른 높이**에 둔다.
 *   같은 높이에 두면 그것이 다시 가로줄이 된다.
 */
const FLOOR = `
  <rect width="32" height="32" fill="#a7794a"/>
  <g fill="#ad7f4e">
    <rect x="0" width="11" height="32"/>
    <rect x="22" width="10" height="32"/>
  </g>
  <g fill="#a1744604" opacity="0"/>
  ${/* 세로 이음매 — 아주 흐리게. 진하면 그것대로 세로줄이 된다. */ ''}
  <g fill="#946a3f" opacity="0.38">
    <rect x="10.6" width="0.8" height="32"/>
    <rect x="21.6" width="0.8" height="32"/>
    <rect x="31.6" width="0.8" height="32"/>
  </g>
  ${/* 짧은 마디 — 널이 끝나는 자리. 널마다 다른 높이에 둔다. */ ''}
  <g fill="#8f6339" opacity="0.32">
    <rect x="0" y="9" width="11" height="0.8"/>
    <rect x="11" y="21" width="11" height="0.8"/>
    <rect x="22" y="4" width="10" height="0.8"/>
  </g>
  ${/* 나뭇결 — 길게 흐르는 옅은 선 몇 가닥 */ ''}
  <g stroke="#9a6c40" stroke-width="0.6" opacity="0.28" fill="none">
    <path d="M4 0v32M16 0v32M27 0v32"/>
  </g>
  <g stroke="#b4874f" stroke-width="0.6" opacity="0.3" fill="none">
    <path d="M7.5 0v32M18.5 0v32"/>
  </g>`;

/**
 * 벽 밑바탕 — 회칠 위에 나무 굽도리.
 *
 * ── 0.70.23 에 **가로 띠 두 줄을 걷어냈다** ──────────────────
 * 마루와 **똑같은 병**이었다. 0.70.22 에 마루는 고쳤는데 벽은 안 고쳤다.
 *
 * 그 전에는 y=6 과 y=17 에 폭 32 짜리 가로줄을 그어 회벽의 켜를 흉내 냈다.
 * 한 칸만 보면 그럴듯한데, 벽은 방 위쪽을 **한 줄로 길게** 덮는 물건이라
 * 그 두 줄이 **방을 가로질러 끝에서 끝까지** 그어진다.
 * 여관에 들어서면 벽이 아니라 **줄 쳐진 공책**으로 보였다.
 *
 * 벽은 서 있는 면이다. 회칠 자국(흙손 자국)도 **세로로** 난다.
 * 그래서 결을 세로로 눕히고, 진하기를 가로줄의 3분의 1로 낮췄다.
 *
 * ⚠ 세로 결도 32px 마다 되풀이된다 — 벽 한 줄을 따라가며 **같은 자리에**
 *   되풀이되면 그것대로 눈에 잡힌다. 그래서
 *     · 진하기를 0.45 → 0.16 으로 낮추고
 *     · 자리를 3·12·19·27 처럼 **고르지 않게** 흩고
 *     · 굵기를 저마다 다르게 두었다.
 *   멀리서는 회벽 한 장, 가까이서만 결이 보인다.
 *
 * 굽도리(바닥과 만나는 나무 띠)는 여기 없다 — 아래의 `WALL`·`room_wall_edge_*`
 * 가 **제가 보는 쪽에** 따로 붙인다.
 */
const PLASTER = `
  <rect width="32" height="32" fill="#ddcaa4"/>
  ${/* 회칠 얼룩 — 칸 안에서 닫히는 옅은 덩어리. 가로도 세로도 아니게 둔다. */ ''}
  <g opacity="0.3">
    <ellipse cx="8" cy="9" rx="10" ry="7" fill="#e2d1ac"/>
    <ellipse cx="25" cy="16" rx="9" ry="6" fill="#d6c29b"/>
    <ellipse cx="14" cy="20" rx="7" ry="4.5" fill="#e0cfaa"/>
  </g>
  ${/* 흙손 자국 — 세로. 자리도 굵기도 고르지 않게. */ ''}
  <g stroke="#c8b083" fill="none" opacity="0.16" stroke-linecap="round">
    <path d="M3 1v22" stroke-width="0.7"/>
    <path d="M12 0v19" stroke-width="0.5"/>
    <path d="M19 4v20" stroke-width="0.8"/>
    <path d="M27 0v16" stroke-width="0.6"/>
  </g>
  <g stroke="#e6d6b2" fill="none" opacity="0.18" stroke-linecap="round">
    <path d="M7 2v20" stroke-width="0.6"/>
    <path d="M23 0v23" stroke-width="0.5"/>
  </g>`;

/**
 * 뒷벽 — 방의 **위쪽**을 덮는 벽. 아래로 바닥이 이어진다.
 *
 * 굽도리(y=24 아래)는 **가로가 맞다.** 이것은 실수로 생긴 줄이 아니라
 * 바닥과 벽이 만나는 자리를 마감하는 **진짜 나무**다. 고칠 것은
 * **뜻 없이 그은 줄**이지 가로줄 전부가 아니다.
 * (옆벽은 만나는 선이 세로라 `room_wall_edge_l`·`room_wall_edge_r` 로 세워 그린다)
 */
const WALL = `${PLASTER}
  <rect y="24" width="32" height="8" fill="#8a6a45"/>
  <rect y="24" width="32" height="1.6" fill="#a5825a"/>
  <rect y="30.6" width="32" height="1.4" fill="#6f5436"/>`;

// ── 0.70.20 — 가구는 **제 밑바탕을 굽지 않는다** ────────────
//
// 예전에는 가구마다 `t(`${FLOOR} ...물건...`)` 처럼 바닥 한 장을 통째로 깔고
// 그 위에 물건을 그렸다. 그래서 물건 타일이 **꽉 찬 네모**였다.
//
// 무엇이 잘못됐나:
//   ① 그 바닥은 **이 파일이 아는 한 장**이다. 방 바닥이 여러 장이 되거나
//      (0.70.19 에 길·재·마른땅이 그렇게 됐다) 다른 바닥 위에 놓이면
//      그 칸만 밑색이 달라 **네모가 드러난다.**
//   ② 대장간 모루는 아예 다른 밑색을 굽고 있어서, 나무 바닥 한가운데에
//      **잿빛 네모**가 박혀 있었다.
//
// 이제 밑바탕은 **화면이 깐다**(FieldScene 의 underAt). 이 파일은 물건만 그린다.
// 그래서 물건 둘레가 비어 있어야 하고, 그 사이로 그 방의 진짜 바닥이 비친다.
//
// ⚠ 물건을 새로 넣을 때 `${FLOOR}` 나 `${WALL}` 을 다시 넣지 말 것.
//   넣는 순간 그 칸만 다시 네모가 된다. 대신 maps.json 의 그 글자에
//   `"over": true` 를 적는다(벽에 붙는 것이면 `"under": "tile_room_wall"` 도).

const ROOM_TILES = {
  room_floor: t(FLOOR),

  room_wall: t(WALL),

  // ── 옆벽 셋 (0.70.23) ───────────────────────────────────────
  //
  // 가로 띠를 걷어내고 여관을 다시 떠 보니 **더 큰 것이 드러났다.**
  // 굽도리(칸 아래의 가로 나무)가 방 **옆벽**에도 똑같이 그려지고 있었다.
  // 옆벽은 세로로 줄지어 선다. 그래서 굽도리가 32px 마다 되풀이되어
  // 옆벽이 **사다리**로 보였다 — 가로 띠 두 줄보다 훨씬 눈에 잡혔다.
  //
  // 굽도리는 **바닥과 벽이 만나는 선**이다. 옆벽이 방과 만나는 선은
  // 가로가 아니라 **세로**다. 그러니 세워서 그린다.
  //
  // 이름은 **굽도리가 붙는 쪽**으로 읽는다 — `edge_r` 은 오른쪽 변에 세운
  // 것이고, 그러므로 방이 오른쪽에 있는 **왼쪽 벽**에 쓰인다.
  //
  // 어느 쪽을 세울지는 지도에 안 적는다 — 이웃을 보고 그릴 때 고른다
  // (지붕 마루가 쓰는 것과 같은 방식이다. 적어 두면 방을 옮길 때마다
  //  두 군데를 고쳐야 하고, 반드시 한쪽을 잊는다).
  room_wall_edge_r: t(`${PLASTER}
    <rect x="24" width="8" height="32" fill="#8a6a45"/>
    <rect x="24" width="1.6" height="32" fill="#a5825a"/>
    <rect x="30.6" width="1.4" height="32" fill="#6f5436"/>`),

  room_wall_edge_l: t(`${PLASTER}
    <rect width="8" height="32" fill="#8a6a45"/>
    <rect x="6.6" width="1.4" height="32" fill="#6f5436"/>
    <rect width="1.6" height="32" fill="#a5825a"/>`),

  // 벽 속 — 사방이 벽이라 방에서 보이는 면이 없다. 굽도리를 안 그린다.
  room_wall_in: t(PLASTER),

  // 창 — 밖이 보인다. 하나만 있어도 방이 '갇힌 상자' 가 아니게 된다.
  room_window: t(`
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
  counter: t(`
    <rect x="0" y="10" width="32" height="20" fill="#7a5330"/>
    <rect x="0" y="8" width="32" height="4.5" fill="#a97c4c"/>
    <rect x="0" y="8" width="32" height="1.6" fill="#c39762"/>
    <g stroke="#63421f" stroke-width="0.9" opacity="0.7">
      <path d="M8 12.5v17.5M24 12.5v17.5"/>
    </g>
    <g fill="#ffd166"><circle cx="12" cy="6.4" r="2"/><circle cx="15.4" cy="7" r="2"/></g>
    <path d="M22 8V3M19 3h6M20 3l-1.4 3h2.8Z" stroke="#8b8fa3" stroke-width="1.2" fill="#b9bdd0"/>`),

  // 진열대 — 항아리와 두루마리를 올려 둔 선반.
  shelf: t(`
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
  barrel: t(`
    <ellipse cx="16" cy="29" rx="10" ry="2.6" fill="#000" opacity="0.18"/>
    <path d="M7 10q9-3 18 0v15q-9 3-18 0Z" fill="#8a5f36"/>
    <path d="M9 10.6q7-2.4 14 0v13.8q-7 2.4-14 0Z" fill="#a3743f"/>
    <g fill="#6e4a28"><rect x="7" y="13.6" width="18" height="2"/><rect x="7" y="20" width="18" height="2"/></g>
    <ellipse cx="16" cy="10.4" rx="9" ry="2.6" fill="#c08d51"/>
    <ellipse cx="16" cy="10.4" rx="6.6" ry="1.8" fill="#8a5f36" opacity="0.5"/>`),

  // ── 침대 — **두 칸짜리** (0.70.22) ──────────────────────
  //
  // 한 칸짜리 침대는 사람 상반신만 했다. 0.70.21 에 그림만 크게 구워 봤더니
  // 위로 두 칸을 덮어서 **벽 속으로 들어가고**, 옆에 선 사람이 반투명이 됐다.
  //
  // 침대는 원래 **두 칸을 차지하는 물건**이다. 그렇게 놓는 것이 맞다:
  //   `~` 머리맡(위 칸) · `;` 발치(아래 칸)
  // 두 장을 위아래로 이어 붙이면 한 침대가 된다. 위로 삐져나가지 않으므로
  // 벽에 파묻히지 않고, 앞뒤를 따질 일도 없다.
  //
  // ⚠ 두 장이 **맞닿는 변에서 이어져야** 한다. 머리맡의 아래 끝과 발치의 위 끝이
  //   같은 색·같은 폭이라야 한 장으로 보인다. 이불의 세로 주름도 x 자리를 맞춰 둔다.
  // ⚠ 가로는 42 로 구워 칸(32)보다 넓게 쓴다 — 침대는 사람보다 넓다.
  //   세로는 키우지 않는다. 키우면 다시 위 칸을 침범한다.
  bed: t(`
    <rect x="3" y="1" width="26" height="4" rx="1.6" fill="#6b4423"/>
    <rect x="3.8" y="1.8" width="24.4" height="2" rx="1" fill="#8a5f36"/>
    <rect x="4" y="4" width="24" height="28" fill="#7a5330"/>
    <rect x="5.6" y="5" width="20.8" height="27" fill="#e6ddc9"/>
    <rect x="5.6" y="5" width="20.8" height="11" rx="1.5" fill="#f4eee0"/>
    <rect x="8.5" y="6.4" width="15" height="7.6" rx="2.4" fill="#fff" opacity="0.9"/>
    <rect x="8.5" y="6.4" width="15" height="3" rx="1.5" fill="#fff" opacity="0.5"/>
    <rect x="5.6" y="18" width="20.8" height="14" fill="#a8455a"/>
    <rect x="5.6" y="18" width="20.8" height="2.6" fill="#c65a70"/>
    <g stroke="#8d3549" stroke-width="0.9" opacity="0.55"><path d="M11 20.6v11.4M21 20.6v11.4"/></g>`),

  // 발치 — 머리맡 바로 아래 칸. 이불이 이어지고 끝에 발판이 선다.
  bed_foot: t(`
    <rect x="4" y="0" width="24" height="28" fill="#7a5330"/>
    <rect x="5.6" y="0" width="20.8" height="27" fill="#e6ddc9"/>
    <rect x="5.6" y="0" width="20.8" height="19" fill="#a8455a"/>
    <g stroke="#8d3549" stroke-width="0.9" opacity="0.55"><path d="M11 0v19M21 0v19"/></g>
    <rect x="5.6" y="17.6" width="20.8" height="2.4" fill="#8d3549" opacity="0.7"/>
    <rect x="5.6" y="19" width="20.8" height="8" fill="#e6ddc9"/>
    <rect x="5.6" y="19" width="20.8" height="2" fill="#f4eee0"/>
    <rect x="3" y="26" width="26" height="5" rx="1.6" fill="#6b4423"/>
    <rect x="3.8" y="26.8" width="24.4" height="2" rx="1" fill="#8a5f36"/>`),

  // ── 0.70.22 에 늘린 살림 넷 ────────────────────────────
  //
  // 방이 넓어 보이던 것은 크기 탓만이 아니라 **물건이 적어서**였다.
  // 탁자와 술통뿐이면 여관도 대장간도 같은 빈 마루로 보인다.
  //
  // ⚠ 넷 다 밑바탕을 굽지 않는다(0.70.20 규칙). 물건만 그리고 둘레는 비운다.
  // ⚠ 발밑을 칸 아래 변에 두고 위로 자라게 그린다 — 화면이 그렇게 세운다.

  // 의자 — 등받이가 위로 간다. 탁자 옆에 놓으면 앉을 자리가 된다.
  chair: t(`
    <ellipse cx="16" cy="29" rx="7.5" ry="2.2" fill="#000" opacity="0.16"/>
    <rect x="8" y="4" width="16" height="13" rx="2.4" fill="#7a5330"/>
    <rect x="9.4" y="5.4" width="13.2" height="10.2" rx="1.8" fill="#9a6b3e"/>
    <g stroke="#6b4423" stroke-width="0.9" opacity="0.6"><path d="M13 5.4v10.2M19 5.4v10.2"/></g>
    <rect x="6.5" y="16" width="19" height="6" rx="2" fill="#8a5f36"/>
    <rect x="6.5" y="16" width="19" height="2.2" rx="1" fill="#b1834f"/>
    <g fill="#6b4423"><rect x="8" y="21" width="2.6" height="7"/><rect x="21.4" y="21" width="2.6" height="7"/></g>`),

  // 장롱 — 키가 크다. 벽에 붙여 놓는다.
  wardrobe: t(`
    <ellipse cx="16" cy="30" rx="11" ry="2.4" fill="#000" opacity="0.18"/>
    <rect x="4" y="1" width="24" height="29" rx="1.6" fill="#6b4423"/>
    <rect x="5.4" y="2.4" width="21.2" height="26.2" fill="#8a5f36"/>
    <rect x="5.4" y="2.4" width="21.2" height="3" fill="#a3743f"/>
    <rect x="15.2" y="5.4" width="1.6" height="23.2" fill="#6b4423"/>
    <g fill="#7a5330" opacity="0.7">
      <rect x="7.4" y="8" width="7" height="9" rx="1"/><rect x="17.6" y="8" width="7" height="9" rx="1"/>
    </g>
    <g fill="#ffd166"><circle cx="13.6" cy="16.5" r="1.1"/><circle cx="18.4" cy="16.5" r="1.1"/></g>`),

  // 화로 — 방을 덥히는 자리. 불빛이 바닥에 번진다.
  fireplace: t(`
    <ellipse cx="16" cy="28" rx="12" ry="3.4" fill="#c8642f" opacity="0.2"/>
    <rect x="3" y="3" width="26" height="24" rx="2" fill="#6d7386"/>
    <rect x="4.6" y="4.6" width="22.8" height="21" rx="1.4" fill="#8f97ab"/>
    <path d="M8 25.6 L8 13 A8 8 0 0 1 24 13 L24 25.6 Z" fill="#2a2620"/>
    <path d="M10 25.6 L10 14 A6 6 0 0 1 22 14 L22 25.6 Z" fill="#1a1613"/>
    <g fill="#c8642f" opacity="0.95">
      <path d="M11 25q3-6 5-3 2-4 5 3Z"/>
    </g>
    <g fill="#ffcf5c" opacity="0.9"><path d="M13.5 25q2-4 2.5-2 0.8-2.6 2.5 2Z"/></g>
    <rect x="2" y="1" width="28" height="3.4" rx="1.2" fill="#b7bfd0"/>`),

  // 책상 — 두루마리와 깃펜. 연금술사·여관 주인 자리에 어울린다.
  desk: t(`
    <ellipse cx="16" cy="29" rx="12" ry="2.6" fill="#000" opacity="0.16"/>
    <rect x="2" y="12" width="28" height="6" rx="1.6" fill="#8a5f36"/>
    <rect x="2" y="12" width="28" height="2" rx="1" fill="#b1834f"/>
    <g fill="#6b4423"><rect x="4" y="18" width="3.4" height="10"/><rect x="24.6" y="18" width="3.4" height="10"/></g>
    <rect x="7.4" y="18" width="17.2" height="6" rx="1" fill="#7a5330"/>
    <g fill="#ffd166" opacity="0.9"><circle cx="16" cy="21" r="1.1"/></g>
    <rect x="6" y="6" width="12" height="6" rx="1.4" fill="#e8dcc0"/>
    <rect x="6" y="6" width="12" height="1.6" rx="0.8" fill="#f4eee0"/>
    <g stroke="#9a8a6a" stroke-width="0.7" opacity="0.7"><path d="M8 9h8M8 10.6h6"/></g>
    <path d="M23 12 L25 4 L26.4 4.6 L24.2 12 Z" fill="#cfd8e6"/>
    <path d="M25 4 L26.4 4.6" stroke="#8b8fa3" stroke-width="0.8"/>`),

  // 탁자 — 초 하나. 여관과 민가에 놓는다.
  table: t(`
    <ellipse cx="16" cy="27" rx="11" ry="3" fill="#000" opacity="0.16"/>
    <rect x="13.6" y="16" width="4.8" height="10" fill="#7a5330"/>
    <ellipse cx="16" cy="16" rx="13" ry="7" fill="#8a5f36"/>
    <ellipse cx="16" cy="14.8" rx="13" ry="7" fill="#b1834f"/>
    <ellipse cx="16" cy="14.4" rx="9.6" ry="4.8" fill="#c0925c" opacity="0.7"/>
    <rect x="14.6" y="6" width="2.8" height="7.6" rx="1" fill="#f0e6cf"/>
    <path d="M16 6q2-2.4 0-4.4Q14 3.6 16 6Z" fill="#ffcf5c"/>
    <circle cx="16" cy="3.4" r="3.4" fill="#ffcf5c" opacity="0.28"/>`),

  // 가마솥 — 연금술사의 자리. 불빛이 방을 물들인다.
  cauldron: t(`
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
