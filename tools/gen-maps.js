// src/data/maps.json 을 만들어 내는 도구.
// 마을/성은 여기서 격자를 조립하고, 필드 10단계는 생성 파라미터만 적어 넣는다.
// (생성된 maps.json 은 그냥 데이터 파일이므로 이후 직접 손으로 고쳐도 된다)
const fs = require('fs');
const path = require('path');

// ⚠ 이 스크립트는 maps.json 을 통째로 다시 씁니다 — 지하감옥 2~5층이 사라집니다.
//    반드시 뒤이어 `node tools/gen-dungeon.js` 를 돌리세요.
//    (`npm run maps` 가 둘을 순서대로 돌립니다)

// ── 0.65 — 땅 위에 **얹는** 칸 ─────────────────────────────
//
// over: true 면 FieldScene 이 **밑에 풀을 먼저 깔고** 그 위에 이 그림을 얹는다.
// 그래서 이 그림들은 네모를 꽉 채우지 않고 가장자리가 들쭉날쭉하다 —
// 그 사이로 풀이 비쳐 칸 경계가 녹는다(길이 벽돌처럼 안 보이는 이유).
//
// ── 0.65 — 한 칸짜리 벽을 줄인다 ───────────────────────────
//
// 예전에는 들판에 **한 칸짜리 바위**가 열여섯 개씩 흩어져 있었다. 크기가 작아
// 눈에 잘 안 띄는데 막기는 확실히 막으니, 걷다 보면 자꾸 걸린다.
// 이제 대부분은 **밟고 지나가는 조경**(잔돌·덤불·그루터기·키큰 풀)으로 깔고,
// 막는 것은 **여러 칸짜리 바위 무더기**만 남긴다. 막는 것은 커야 한다 —
// 커야 눈에 들어오고, 눈에 들어와야 돌아갈 마음이 든다.
/**
 * 글자 하나가 칸 하나다. 표는 **하나**이고 지도 전부가 같은 표를 쓴다.
 *
 * ⚠ 그래서 **같은 글자를 두 번 쓰면 안 된다.** 그런데 그냥 객체로 적어 두면
 *   자바스크립트가 조용히 뒤엣것으로 덮어쓴다 — 오류도 경고도 없다.
 *   이걸로 세 번 당했다.
 *     'F'  들판의 꽃 ↔ 지하감옥 횃불   → 감옥 벽에 꽃이 폈다
 *     'A'  성벽 총안 ↔ 화산 잿더미     → **성벽 꼭대기로 걸어 들어갈 수 있었다**
 *     'K'  성문 ↔ 잠긴 동굴문          → 성 안 출입구에 자물쇠가 달려 있었다
 *   그래서 이제 무리별로 나눠 적고, merge 가 겹치면 **그 자리에서 멈춘다.**
 *   조용히 덮어쓰는 것보다 시끄럽게 멎는 편이 언제나 낫다.
 */
function merge(...groups) {
  const out = {};
  for (const g of groups) {
    for (const [ch, def] of Object.entries(g)) {
      if (out[ch]) {
        throw new Error(
          `타일 글자 '${ch}' 가 두 번 쓰였습니다: ` +
          `'${out[ch].sprite}' ↔ '${def.sprite}'. 표는 지도마다가 아니라 하나입니다.`
        );
      }
      out[ch] = def;
    }
  }
  return out;
}

// 들판
const FIELD_TILES = {
  G: { sprite: 'tile_grass', solid: false },
  P: { sprite: 'tile_path', solid: false, over: true },
  T: { sprite: 'tile_tree', solid: true, over: true },
  R: { sprite: 'tile_rock', solid: true, over: true },
  W: { sprite: 'tile_water', solid: true },
  F: { sprite: 'tile_flower', solid: false, over: true },
  // 밟고 지나가는 조경 — 막지 않는다.
  r: { sprite: 'tile_pebble', solid: false, over: true },
  h: { sprite: 'tile_bush', solid: false, over: true },
  q: { sprite: 'tile_stump', solid: false, over: true },
  g: { sprite: 'tile_grass_tall', solid: false, over: true },
};

// 마을
const TOWN_TILES = {
  B: { sprite: 'tile_brick', solid: false },
  H: { sprite: 'tile_house_wall', solid: true },
  O: { sprite: 'tile_house_roof', solid: true },
  D: { sprite: 'tile_door', solid: true },
  V: { sprite: 'tile_fence', solid: true },
  X: { sprite: 'tile_gate_exit', solid: false },
  S: { sprite: 'tile_signpost', solid: true },
  // 드래곤퀘스트6 식 가게 간판 — 벽(H)을 대신 놓는다. 가게마다 모양이 다르다.
  i: { sprite: 'tile_sign_item', solid: true },
  w: { sprite: 'tile_sign_weapon', solid: true },
  y: { sprite: 'tile_sign_alchemy', solid: true },
  n: { sprite: 'tile_sign_inn', solid: true },
};

// 성 — 마을에서 보이는 정면과 안쪽
const CASTLE_TILES = {
  C: { sprite: 'tile_castle_wall', solid: true },
  U: { sprite: 'tile_castle_top', solid: true },
  L: { sprite: 'tile_castle_floor', solid: false },
  // 성 정면 (0.68) — 여러 칸에 걸친 그림 한 장을 오려 쓴다.
  // 성문은 2칸×2칸이라 민가 문(한 칸)보다 네 배 크다.
  // ⚠ 아래 두 칸(N/M)만 걸어 들어갈 수 있다. 위 두 칸은 아치라 막는다.
  '5': { sprite: 'tile_castle_gate_ul', solid: true },
  '6': { sprite: 'tile_castle_gate_ur', solid: true },
  N: { sprite: 'tile_castle_gate_dl', solid: false },
  M: { sprite: 'tile_castle_gate_dr', solid: false },
  '7': { sprite: 'tile_castle_tower_tl', solid: true },
  '8': { sprite: 'tile_castle_tower_tr', solid: true },
  '9': { sprite: 'tile_castle_tower_bl', solid: true },
  '0': { sprite: 'tile_castle_tower_br', solid: true },
  Y: { sprite: 'tile_castle_batt', solid: true },
  E: { sprite: 'tile_castle_window', solid: true },
  // 성 안 (0.68) — 융단·기둥·색유리 창·벽 횃불.
  // 넓은 판석 방을 '왕이 있는 곳' 으로 만든다.
  '@': { sprite: 'tile_castle_rug', solid: false },
  '%': { sprite: 'tile_castle_rug_end', solid: false },
  '&': { sprite: 'tile_castle_pillar', solid: true },
  '*': { sprite: 'tile_castle_glass', solid: true },
  '+': { sprite: 'tile_wall_torch', solid: true, lit: true },
  // 성 안 무기상의 장비 가판대(진열대라 지나갈 수 없다)
  '1': { sprite: 'tile_stall_weapon', solid: true },
  '2': { sprite: 'tile_stall_armor', solid: true },
  // 성 안 왕실 대장간 — 화덕과 모루(지나갈 수 없다)
  '3': { sprite: 'tile_forge_hearth', solid: true },
  '4': { sprite: 'tile_forge_anvil', solid: true },
};

// 지하감옥 / 웨이포인트
const DUNGEON_TILES = {
  d: { sprite: 'tile_dungeon_floor', solid: false },
  Z: { sprite: 'tile_dungeon_wall', solid: true },
  // 벽에 걸린 횃불 (0.68). 어둠 밖에서도 이 불만은 보인다(FieldScene) —
  // 그 불빛 하나가 "저쪽에 방이 있다" 를 말해 준다.
  x: { sprite: 'tile_dungeon_torch', solid: true, lit: true },
  s: { sprite: 'tile_stairs_down', solid: false },
  // 올라가는 계단. 0.40 이전에는 이 자리가 맨바닥이라 나가는 길이 안 보였다.
  u: { sprite: 'tile_stairs_up', solid: false },
  Q: { sprite: 'tile_waypoint_pad', solid: false },
};

// 서쪽 절벽 들판
const WEST_TILES = {
  a: { sprite: 'tile_waste', solid: false },
  // 밟고 지나가는 조경 — 막지 않는다(들판의 r/h/q/g 와 같은 뜻).
  // ⚠ over 를 켜면 **밑에 풀이 깔린다.** 절벽 들판에 풀이 돋으면 안 되므로
  //   여기서는 제 밑색(마른 땅)을 가진 통짜 그림을 쓴다.
  j: { sprite: 'tile_waste_rubble', solid: false },
  k: { sprite: 'tile_waste_bones', solid: false },
  '#': { sprite: 'tile_cliff', solid: true },
  '=': { sprite: 'tile_cliff_edge', solid: false },
  '^': { sprite: 'tile_wind_rock', solid: true },
  // 잠긴 큰 동굴문. 지나갈 수 있지만(그래야 포탈 칸을 밟는다) 그 앞에서
  // PortalSystem 이 열쇠를 확인하고 막는다 — 문이 solid 면 밟을 수가 없어
  // "열쇠가 없다"는 말도 못 듣고 그냥 벽처럼 보인다.
  J: { sprite: 'tile_lair_gate', solid: false },
};

// 화산 지형 — 보스가 있는 들판만 이 글자를 쓴다(테마 표는 아래 THEMES).
const VOLCANO_TILES = {
  A: { sprite: 'tile_ash', solid: false },
  p: { sprite: 'tile_ash_path', solid: false },
  c: { sprite: 'tile_charred', solid: true },
  b: { sprite: 'tile_basalt', solid: true },
  m: { sprite: 'tile_magma', solid: true },
  e: { sprite: 'tile_ember', solid: false },
  // 밟고 지나가는 화산 조경 (0.70) — 들판의 r/h/q/g 를 대신한다.
  // ⚠ over 를 켜면 밑에 **풀**이 깔린다. 잿더미에 잔디가 돋으면 안 되므로
  //   서쪽 절벽의 자갈·뼈처럼 제 밑색을 가진 통짜 그림을 쓴다.
  f: { sprite: 'tile_ash_rubble', solid: false },
  t: { sprite: 'tile_charred_stump', solid: false },
  v: { sprite: 'tile_ash_vent', solid: false },
};

// 집 안 (0.70.3)
//
// ⚠ 마을 문(D)은 **막혀 있다**(벽처럼). 들어가는 문은 밟을 수 있어야 포탈이
//   걸리므로 글자를 따로 둔다 — 그림은 같은 문이다. 간판이 붙은 집만 열린다.
const ROOM_TILES = {
  l: { sprite: 'tile_room_floor', solid: false },
  o: { sprite: 'tile_room_wall', solid: true },
  z: { sprite: 'tile_room_exit', solid: false },
  I: { sprite: 'tile_room_window', solid: true },
  K: { sprite: 'tile_counter', solid: true },
  '$': { sprite: 'tile_shelf', solid: true },
  '!': { sprite: 'tile_barrel', solid: true },
  '~': { sprite: 'tile_bed', solid: true },
  '?': { sprite: 'tile_table', solid: true },
  '|': { sprite: 'tile_cauldron', solid: true },
  // 드나드는 문 — 마을 쪽. 그림은 D 와 같고 **밟을 수 있다**는 것만 다르다.
  '<': { sprite: 'tile_door', solid: false },
};

const TILESET = merge(
  FIELD_TILES, TOWN_TILES, CASTLE_TILES, DUNGEON_TILES, WEST_TILES, VOLCANO_TILES,
  ROOM_TILES
);

// 지형 테마 — "같은 지도를 무엇으로 그리느냐".
//
// 보스가 있는 들판은 다른 들판과 지형이 똑같다(씨앗도 같다).
// 바뀌는 것은 타일 글자뿐이라, 길과 덤불 배치는 그대로인데 땅만 달라 보인다.
// 새 테마를 넣고 싶으면 여기 한 줄만 늘리면 된다.
const THEMES = {
  // ⚠ **들판이 쓰는 글자를 하나도 빠뜨리면 안 된다.**
  //   빠뜨린 글자는 들판 그림 그대로 남는다. 0.65 에 밟고 지나가는 조경
  //   (r 잔돌 · h 덤불 · q 그루터기 · g 키큰 풀)을 넣으면서 여기를 안 늘려서,
  //   보스 땅 잿더미 위에 **초록 잔디 네모가 백 개 넘게** 깔려 있었다.
  //   (그 넷은 '얹는 그림'이라 밑에 풀이 함께 깔린다 — 그래서 더 눈에 띄었다)
  volcano: {
    G: 'A', P: 'p', T: 'c', R: 'b', W: 'm', F: 'e',
    r: 'f', h: 'f', q: 't', g: 'v',
  },
};

// 입장 레벨 — 성문과 그 안쪽 지하감옥.
// 성문은 원래 50이었는데, 만렙이 50이라 사실상 "끝난 뒤에나 열리는 문"이었다.
// 성문 앞 무기상점이 11~20단계를 준비하는 곳이 되었으므로 25로 내린다.
const CASTLE_LEVEL = 25;
const DUNGEON_LEVEL = 40;

function blank(w, h, fill) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}
function rect(g, x, y, w, h, ch) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) g[j][i] = ch;
}
function toStrings(g) {
  return g.map((row) => row.join(''));
}

// 장식(풀·바위·덤불)을 **건물 위에 놓지 못하게** 막는다.
//
// 왜 필요한가: 장식은 격자를 그대로 덮어쓴다. 지붕 한 칸을 덮으면
//   0.70.6 처럼 처마가 어긋나 보이고, 성벽 한 칸을 덮으면 0.67 처럼
//   **걸어 들어갈 수 있는 구멍**이 뚫린다. 둘 다 눈으로는 찾기 어렵고
//   찾아도 원인이 장식이라고는 생각하기 힘들다. 여기서 그 자리에 멎는 게 낫다.
const SOLID_BUILD = new Set(['O', 'H', 'D', '<', 'C', 'Q', 'W']);
function buildingGuard(g, props, where) {
  for (const [ch, x, y] of props) {
    const at = g[y] && g[y][x];
    if (at === undefined) throw new Error(`[${where}] 장식 '${ch}' 이 판 밖(${x},${y})에 있다`);
    if (SOLID_BUILD.has(at)) {
      throw new Error(
        `[${where}] 장식 '${ch}' 이 (${x},${y}) 의 '${at}' 칸을 덮는다 — ` +
        `건물·성벽·물 위에는 놓을 수 없다`,
      );
    }
  }
}

// ---------------- 집 안 (0.70.3) ----------------
//
// 방 하나짜리 작은 지도다. 화면(20×15칸)보다 작게 잡아, 문을 열고 들어서면
// 방 전체가 한눈에 들어온다 — 실내에서 화면이 따라 움직이면
// 좁은 방이 아니라 또 하나의 들판처럼 느껴진다.
// (화면보다 작은 판은 Renderer.centerCamera 가 알아서 가운데 세운다)
//
// ⚠ 방은 **격자를 그대로 적는다.** 다른 지도처럼 rect 로 조립하지 않는다 —
//   방은 작아서, 글자로 그려 놓으면 눈으로 보고 "여기 서면 말을 걸 수 있나"를
//   바로 알 수 있다. 조립식으로 적으면 그게 안 보인다.
//
// ⚠ **주인은 반드시 바닥 칸에, 그 앞칸도 바닥이어야 한다.**
//   말을 거는 것(Enter)은 **바로 앞 한 칸**만 본다(FieldScene.facingNpc).
//   계산대 너머에 세우면 클릭으로는 되고 Enter 로는 안 되는 반쪽이 된다.
//   아래 checkRoom 이 그것을 확인하고, 어긋나면 그 자리에서 멎는다.
//
// @param back  마을로 돌아가는 자리 { x, y } — **문 앞 칸**이다. 문 위가 아니다.
//              문 위로 되돌리면 밟자마자 포탈이 다시 걸려 무한히 오간다.
function buildRoom({ name, plan, back, npcs = [], bgm = 'town', bgColor = '#241a12' }) {
  const w = plan[0].length;
  const h = plan.length;
  const g = plan.map((row) => row.split(''));

  for (const [i, row] of plan.entries()) {
    if (row.length !== w) throw new Error(`${name}: ${i}번째 줄이 ${row.length}칸입니다(${w}칸이어야 합니다).`);
  }
  let exitX = -1;
  for (let x = 0; x < w; x++) if (g[h - 1][x] === 'z') exitX = x;
  if (exitX < 0) throw new Error(`${name}: 나가는 자리(z)가 아래 벽에 없습니다.`);
  if (g[h - 2][exitX] !== 'l') throw new Error(`${name}: 문 앞(${exitX},${h - 2})이 막혀 있습니다.`);

  // 주인 앞에 설 자리가 있는가 — 위 ⚠ 참고.
  for (const n of npcs) {
    if (g[n.y][n.x] !== 'l') throw new Error(`${name}: ${n.id} 가 바닥이 아닌 칸(${n.x},${n.y})에 섰습니다.`);
    const front = [[0, 1], [0, -1], [1, 0], [-1, 0]]
      .some(([dx, dy]) => (g[n.y + dy] || [])[n.x + dx] === 'l');
    if (!front) throw new Error(`${name}: ${n.id} 앞에 설 자리가 없습니다 — Enter 로 말을 못 겁니다.`);
  }

  return {
    name,
    kind: 'town',            // 몬스터가 나오지 않는 땅
    // 집 안이라는 표시 — 드나들 때 '슝' 이 아니라 **문 소리**가 난다(main.js).
    room: true,
    bgm,
    bgColor,
    grid: toStrings(g),
    spawns: [],
    respawnMs: 0,
    npcs,
    portals: [{ x: exitX, y: h - 1, to: 'poino', toX: back.x, toY: back.y, label: '마을' }],
  };
}

// ---------------- 포이노 마을 (40 x 32) ----------------
function buildTown() {
  const W = 40;
  const H = 32;
  const g = blank(W, H, 'G');

  // 바깥 경계 숲
  rect(g, 0, 0, W, 1, 'T');
  rect(g, 0, H - 1, W, 1, 'T');
  for (let y = 0; y < H; y++) {
    g[y][0] = 'T';
    g[y][W - 1] = 'T';
  }

  // ── 북쪽 성 정면 (x 13..26, y 1..7) ─────────────────────────
  //
  // 0.67 까지는 벽 그림 한 장을 격자로 도배한 것이 전부였다. 성이 아니라
  // 회색 담장이었고, 성문은 32×32 한 칸짜리라 **바로 아래 민가의 나무문과
  // 크기가 같았다.** 문이 같으면 집도 같아 보인다.
  //
  // 이제 이렇게 쌓는다.
  //   y=1   망루 꼭대기(깃발) · 가운데는 총안
  //   y=2   망루 몸통 · 가운데는 성벽
  //   y=3~5 성벽 (창 둘)
  //   y=6~7 가운데 두 칸이 **2×2 성문**. 아래 두 칸만 걸어 들어간다.
  rect(g, 13, 1, 14, 7, 'C');           // 먼저 성벽으로 채우고
  rect(g, 15, 1, 10, 1, 'Y');           // 가운데 꼭대기 = 총안

  // 좌우 망루 — 성벽보다 한 칸 위로 솟는다(2칸 폭 × 2칸).
  g[1][13] = '7'; g[1][14] = '8';
  g[2][13] = '9'; g[2][14] = '0';
  g[1][25] = '7'; g[1][26] = '8';
  g[2][25] = '9'; g[2][26] = '0';

  // 성벽 창 둘 — 밋밋한 담장에 눈이 걸리는 자리를 만든다.
  g[4][16] = 'E';
  g[4][23] = 'E';

  // 성문 — 2칸 × 2칸. 걸어 들어가는 것은 **아래 두 칸**뿐이다.
  g[6][19] = '5'; g[6][20] = '6';
  g[7][19] = 'N'; g[7][20] = 'M';

  // 성문 → 광장 대로
  rect(g, 19, 8, 2, 6, 'B');
  // 중앙 광장
  rect(g, 15, 14, 11, 5, 'B');

  // 동쪽 출구 도로
  rect(g, 26, 15, 13, 2, 'P');
  g[15][W - 1] = 'X';
  g[16][W - 1] = 'X';
  g[14][27] = 'S';

  // 서쪽 출구 도로 — 절벽 들판으로. 표지판을 하나 세워 둔다.
  rect(g, 1, 15, 14, 2, 'P');
  g[15][0] = 'X';
  g[16][0] = 'X';
  g[14][13] = 'S';

  // 잡화점 (서쪽) — 문 옆에 잡화 간판
  rect(g, 6, 9, 6, 2, 'O');
  rect(g, 6, 11, 6, 1, 'H');
  g[11][8] = '<';   // 들어가는 문 (0.70.3)
  g[11][9] = 'i';

  // 대장간 = 무기점 (동쪽) — 검 모양 간판
  rect(g, 28, 9, 6, 2, 'O');
  rect(g, 28, 11, 6, 1, 'H');
  g[11][30] = '<';  // 들어가는 문
  g[11][31] = 'w';

  // 연금술사 집 — 무기점(대장간) 바로 아래. 플라스크 간판.
  rect(g, 28, 18, 6, 2, 'O');
  rect(g, 28, 20, 6, 1, 'H');
  g[20][30] = '<';  // 들어가는 문
  g[20][31] = 'y';

  // 여관 (남서) — 침대 간판
  //
  // ⚠ 0.66 까지 이 집은 **반으로 갈라져 있었다.**
  //   아래 흙길 가운데 `rect(g, 12, 19, 1, 5, 'P')` 가 x=12 를 세로로 긁고
  //   지나갔는데, 그 줄이 지붕(y=21,22) 한가운데를 지우고 **현관문까지**
  //   길로 덮어 버렸다(g[23][12] 가 'D' 에서 'P' 로). 그래서 지붕이 두 쪽으로
  //   갈라지고, 정작 들어갈 문은 없는 집이 됐다.
  //   다른 집들은 모두 **아래(남쪽)에서** 문 앞으로 걸어 들어온다.
  //   여관만 위에서 지붕을 뚫고 들어가고 있었던 셈이다.
  //   → 가운데 길을 걷어내고, 서쪽 큰길에서 남쪽으로 돌아 문 앞으로 잇는다.
  rect(g, 10, 21, 6, 2, 'O');
  rect(g, 10, 23, 6, 1, 'H');
  g[23][12] = '<';  // 들어가는 문
  g[23][13] = 'n';

  // 민가 — 연금술사 집이 들어오면서 더 남쪽으로 내려갔다
  rect(g, 25, 24, 6, 2, 'O');
  rect(g, 25, 26, 6, 1, 'H');
  g[26][27] = 'D';

  // 광장에서 각 건물로 이어지는 흙길
  rect(g, 8, 12, 1, 3, 'P');
  rect(g, 8, 14, 8, 1, 'P');
  rect(g, 30, 12, 1, 3, 'P');
  rect(g, 26, 14, 5, 1, 'P');
  // 여관으로 — 서쪽 큰길에서 남쪽으로 내려가 집을 **돌아** 문 앞(12,24)으로.
  // (지붕 위를 지나가지 않는다. 위 주석 참고)
  rect(g, 8, 17, 1, 8, 'P');
  rect(g, 8, 24, 5, 1, 'P');
  // 동쪽 큰길 → 연금술사 집 (집을 동쪽으로 돌아 문 앞으로 들어간다)
  rect(g, 34, 17, 1, 5, 'P');
  rect(g, 30, 21, 5, 1, 'P');
  // 광장 → 남쪽 민가
  rect(g, 24, 19, 1, 9, 'P');
  rect(g, 24, 27, 4, 1, 'P');

  // 남쪽 연못 + 울타리 + 나무/꽃 장식
  //
  // 0.68 — 네모를 깎아 둥글게. 물가(모래톱)를 두르고 나니 직사각형이 더
  // 또렷하게 드러나서 연못이 아니라 파란 카펫처럼 보였다.
  rect(g, 4, 26, 6, 3, 'W');
  g[26][4] = 'G'; g[26][9] = 'G';
  g[28][4] = 'G'; g[28][9] = 'G';
  rect(g, 3, 25, 8, 1, 'V');
  const props = [
    ['T', 3, 4], ['T', 6, 5], ['T', 9, 3], ['T', 33, 4], ['T', 36, 6], ['T', 30, 3],
    ['T', 4, 18], ['T', 6, 20], ['T', 36, 20], ['T', 37, 24], ['T', 33, 28], ['T', 8, 29],
    ['T', 20, 28], ['T', 23, 29], ['T', 16, 27],
    // 0.67 — 마을 안의 한 칸짜리 바위를 **밟고 지나가는** 것으로 바꿨다.
    //   들판에서 걷어낸 것과 같은 문제다(0.65): 작아서 눈에 안 들어오는데
    //   막기는 확실히 막는다. 마을은 오가는 곳이라 더 거슬린다.
    ['h', 12, 6], ['r', 28, 6], ['q', 35, 12],
    ['F', 14, 12], ['F', 26, 12], ['F', 17, 20], ['F', 22, 21], ['F', 10, 17], ['F', 36, 18],
    ['F', 18, 25], ['F', 22, 26], ['F', 7, 22], ['F', 35, 22],
    // 잔디밭이 너무 말끔했다 — 밟히는 조경을 흩어 놓는다.
    // ⚠ 성벽 안(x 13~26, y 1~7)에는 놓지 않는다 — 0.67 에 ['g', 15, 5] 를 놓았다가
    //   성벽 한가운데에 **걸어 들어갈 수 있는 구멍**을 뚫었다.
    // ['h', 8, 26] 은 **연못 한가운데** 였다 — 위 buildingGuard 가 찾아냈다. 물가로 옮긴다.
    ['g', 5, 8], ['g', 33, 8], ['h', 11, 27], ['r', 31, 29], ['g', 9, 5],
    // ⚠ 0.70.6 — ['h', 30, 25] 를 여기 놓았다가 **민가 지붕 오른쪽 아래 칸**을
    //   덤불로 덮어썼다. 0.70.1 부터 지붕은 가로로 이어진 칸을 한 장의 큰 그림으로
    //   그리기 때문에, 윗줄은 6칸인데 아랫줄이 5칸이 되면서 처마가 한 칸 어긋나
    //   보였다. 아래 buildingGuard 가 같은 실수를 다시 못 하게 막는다.
    ['q', 26, 22], ['h', 19, 12], ['r', 4, 13], ['g', 37, 27], ['h', 32, 26],
  ];
  buildingGuard(g, props, '포이노 마을');
  for (const [ch, x, y] of props) g[y][x] = ch;

  // 광장 한가운데 웨이포인트 돌 자리
  g[16][20] = 'Q';

  return {
    name: '포이노 마을',
    kind: 'town',
    bgm: 'town',
    bgColor: '#1c2f22',
    grid: toStrings(g),
    spawns: [],
    respawnMs: 0,
    npcs: [
      // ⚠ 0.70.3 — 잡화상·대장장이·연금술사·여관 주인은 **집 안으로 들어갔다.**
      //   문 앞 길바닥에 서서 장사하는 사람은 없다. 각자 제 가게 안에 있다
      //   (buildRoom 아래 참고). 광장 사람들과 문지기·게시판만 밖에 남는다.
      { id: 'villager_kid', x: 27, y: 27 },
      // 0.38 — 두 칸 아래로. 광장 한복판에서 조금 물러나 앉는다.
      { id: 'villager_elder', x: 23, y: 22 },
      { id: 'gate_guard', x: 18, y: 9 },
      { id: 'quest_board', x: 35, y: 14 },
      // 웨이포인트 돌 — 광장 한가운데. 보스를 잡은 땅으로 곧장 갈 수 있다.
      { id: 'waypoint_stone', x: 20, y: 16 },
      // 마녀 — 서쪽 문 가는 길목. 용의 징표만 받는다.
      { id: 'witch', x: 6, y: 18 },
    ],
    portals: [
      {
        x: 19, y: 7, to: 'castle', toX: 11, toY: 13,
        label: '포이노 성', requireLevel: CASTLE_LEVEL,
        blockedText: `성문 위병: 레벨 ${CASTLE_LEVEL}에 이르지 못한 자는 통과할 수 없다.`,
      },
      {
        x: 20, y: 7, to: 'castle', toX: 12, toY: 13,
        label: '포이노 성', requireLevel: CASTLE_LEVEL,
        blockedText: `성문 위병: 레벨 ${CASTLE_LEVEL}에 이르지 못한 자는 통과할 수 없다.`,
      },
      // 집 안으로 (0.70.3) — 문 앞에서 위를 누르면 문 칸을 밟고 들어간다.
      //
      // ⚠ 나오는 자리(buildRoom 의 back)는 **문 바로 아래 칸**이다.
      //   문 위로 되돌리면 밟은 그 자리에서 포탈이 다시 걸려 끝없이 오간다.
      { x: 8, y: 11, to: 'poino_shop', toX: 6, toY: 8, label: '잡화점' },
      { x: 30, y: 11, to: 'poino_forge', toX: 6, toY: 8, label: '대장간' },
      { x: 30, y: 20, to: 'poino_alchemy', toX: 6, toY: 8, label: '연금술사의 집' },
      { x: 12, y: 23, to: 'poino_inn', toX: 6, toY: 8, label: '여관' },
      { x: 39, y: 15, to: 'field_1', toX: 1, toY: 15, label: '동쪽 들판' },
      { x: 39, y: 16, to: 'field_1', toX: 1, toY: 16, label: '동쪽 들판' },
      { x: 0, y: 15, to: 'west_cliff', toX: 38, toY: 15, label: '서쪽 절벽' },
      { x: 0, y: 16, to: 'west_cliff', toX: 38, toY: 16, label: '서쪽 절벽' },
    ],
  };
}

// ---------------- 서쪽 절벽 들판 (40 x 32) ----------------
//
// 아무것도 없는 곳이다. 나무도 몬스터도 상점도 없다.
// 넓게 트인 마른 땅과 사방의 낭떠러지뿐이고, 가운데가 텅 비어 있다.
// 30분에 한 번 그 빈 자리에 용이 내려앉는다 — 비어 있어야 내려앉는 게 보인다.

/**
 * 고룡의 둥지 — 서쪽 절벽 끝, 잠긴 큰 동굴문 안.
 *
 * 여기는 **한 마리만 있는 방**이다. 잡몹도 길찾기도 없다.
 * 절벽 들판이 "허전해서 무서운" 곳이라면 여기는 "닫혀 있어서 무서운" 곳이라,
 * 사방을 현무암으로 막고 가운데만 재로 비워 두었다.
 *
 * 카르나크(서쪽 절벽)와 다른 점:
 *   · 시간에 맞춰 오지 않는다. 늘 거기 있고, **잡으면 한 시간 뒤에** 다시 선다.
 *   · 체력이 이어지지 않는다. 물러나면 온전한 몸으로 다시 만난다 —
 *     한 시간에 한 번뿐인 상대라 조금씩 깎는 방식이 성립하지 않는다.
 */
function buildDragonLair() {
  const W = 40;
  const H = 32;
  const g = blank(W, H, 'A'); // 재

  // 사방 벽 — 두껍게 둘러 "닫힌 방" 으로 보이게.
  rect(g, 0, 0, W, 4, 'b');
  rect(g, 0, H - 4, W, 4, 'b');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 3; x++) { g[y][x] = 'b'; g[y][W - 1 - x] = 'b'; }
  }

  // 벽을 따라 흐르는 용암 — 밟을 수 없고, 방을 좁혀 도망갈 곳을 줄인다.
  rect(g, 4, 4, W - 8, 1, 'm');
  rect(g, 4, H - 5, W - 8, 1, 'm');

  // 가운데로 갈수록 타 있는 바닥
  rect(g, 10, 10, W - 20, 12, 'p');
  for (const [x, y] of [[12, 8], [27, 8], [12, 23], [27, 23], [8, 16], [31, 16]]) {
    g[y][x] = 'c';
  }
  // 불씨 몇 점 — 어두운 방에 눈이 갈 곳
  for (const [x, y] of [[16, 12], [24, 12], [16, 20], [24, 20], [20, 9], [20, 22]]) {
    g[y][x] = 'e';
  }

  // 동쪽 출구(절벽 쪽)
  g[15][W - 1] = 'X';
  g[16][W - 1] = 'X';
  rect(g, W - 4, 15, 3, 2, 'A');

  return {
    name: '고룡의 둥지',
    kind: 'field',
    bgm: 'dragon',
    bgColor: '#140a08',
    stage: 0,
    power: 1,
    levelBonus: 0,
    grid: toStrings(g),
    monsters: [],
    monsterCount: 0,
    // 방 한복판에 한 마리. 늘 거기 있다.
    spawns: [{ monster: 'elder_dragon', x: 20, y: 16, boss: true }],
    boss: 'elder_dragon',
    // 잡으면 **한 시간** 뒤에 다시 선다. 다른 보스는 1분이다.
    bossRespawnMs: 3600000,
    // 상처가 남는다 — 한 판에 눕힐 수 없는 상대이므로 몇 번이고 물어뜯어 눕힌다.
    // (서쪽 절벽의 카르나크와 같은 방식. 그래서 져도 값을 치르지 않는다)
    bossKeepHp: true,
    reviveAt: { map: 'west_cliff', x: 3, y: 15 },
    respawnMs: 0,
    // 절반이 마법으로 들어온다 — 지하감옥과 같은 자리다.
    magicPart: 0.5,
    npcs: [],
    portals: [
      { x: W - 1, y: 15, to: 'west_cliff', toX: 1, toY: 15, label: '서쪽 절벽' },
      { x: W - 1, y: 16, to: 'west_cliff', toX: 1, toY: 16, label: '서쪽 절벽' },
    ],
  };
}

function buildWestCliff() {
  const W = 40;
  const H = 32;
  const g = blank(W, H, 'a');

  // 사방이 낭떠러지. 위아래는 두껍게(깊이가 보이게), 좌우는 한 줄.
  rect(g, 0, 0, W, 3, '#');
  rect(g, 0, H - 3, W, 3, '#');
  for (let y = 0; y < H; y++) {
    g[y][0] = '#';
    g[y][W - 1] = '#';
  }
  // 낭떠러지 바로 앞은 설 수 있는 가장자리로 둔다.
  rect(g, 1, 3, W - 2, 1, '=');
  rect(g, 1, H - 4, W - 2, 1, '=');

  // 안쪽으로 파고든 협곡 두 군데 — 넓기만 하면 방향을 잃는다.
  rect(g, 8, 4, 3, 6, '#');
  rect(g, 8, 10, 3, 1, '=');
  rect(g, 27, 22, 4, 5, '#');
  rect(g, 27, 21, 4, 1, '=');

  // 바람에 깎인 바위 몇 개. 이 땅에 **서 있는** 유일한 것이다.
  //
  // 하나짜리라 눈에 잘 안 들어오는데 막기는 확실히 막는다 — 들판에서 걷어낸
  // 바로 그 문제다(0.65). 여기서는 두 칸 덩어리로 놓아 크게 보이게 한다.
  for (const [x, y] of [[6, 20], [14, 8], [19, 25], [24, 6], [33, 12], [12, 16], [30, 17]]) {
    g[y][x] = '^';
    // 옆 칸이 맨땅이면 한 칸 더 붙여 덩어리로 만든다(판 밖·절벽은 건드리지 않는다).
    if (x + 1 < W - 1 && g[y][x + 1] === 'a') g[y][x + 1] = '^';
  }

  // 밟고 지나가는 것들 — 자갈과 마른 뼈 (0.67).
  //
  // 이 땅은 "허전해서 무서운" 곳이지만, 0.66 까지는 정말 아무것도 없어서
  // 무서운 게 아니라 **안 만든 것처럼** 보였다. 걸음을 막지 않는 것들만
  // 흩어 놓는다 — 눈에는 뭔가 있고 발은 자유롭다.
  let seed = 20260907;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 60; i++) {
    const x = 2 + Math.floor(rnd() * (W - 4));
    const y = 5 + Math.floor(rnd() * (H - 10));
    if (g[y][x] !== 'a') continue;
    // 뼈는 드물어야 뼈다. 흔하면 쓰레기처럼 보인다.
    g[y][x] = rnd() < 0.82 ? 'j' : 'k';
  }

  // 동쪽 입구(마을 쪽)
  g[15][W - 1] = 'X';
  g[16][W - 1] = 'X';
  rect(g, 34, 15, 5, 2, 'a');

  // 서쪽 끝 — 절벽에 박힌 큰 동굴문. 열쇠가 있어야 지나간다.
  // 앞을 두 칸 틔워 두어야 문이 벽에 묻히지 않고 "들어가는 곳" 으로 보인다.
  rect(g, 1, 14, 3, 4, 'a');
  g[15][0] = 'J';
  g[16][0] = 'J';

  return {
    name: '서쪽 절벽 들판',
    kind: 'field',
    ground: 'waste',
    bgm: 'dragon',
    bgColor: '#2a2620',
    stage: 0,
    power: 1,
    levelBonus: 0,
    grid: toStrings(g),
    // 잡몹은 없다. 오직 용뿐이다.
    monsters: [],
    monsterCount: 0,
    spawns: [],
    boss: null,
    respawnMs: 0,
    // 30분마다 용이 내려앉는 자리. 지도 한복판이라 어디서든 보인다.
    timedBoss: {
      monster: 'great_dragon',
      everyMs: 1800000,
      // 30분마다 오지만 머무는 것은 25분이다. 나머지 5분은 절벽이 비어 있다 —
      // 늘 있으면 "지금 가야 한다"는 마음이 생기지 않는다.
      stayMs: 1500000,
      // 마을에 있으면 이 말이 뜬다. 서쪽으로 가라는 신호다.
      omen: '서쪽에서 이상한 기운이 감돈다...',
      x: 20,
      y: 15,
      // 못 잡아도 용의 HP 는 그대로 이어진다. 다음에 와도 깎아 둔 만큼 깎여 있다.
      keepHp: true,
      // 져도 잃는 것이 없다. 무조건 마을에서 눈을 뜬다.
      noPenalty: true,
      reviveAt: { map: 'poino', x: 20, y: 17 },
    },
    npcs: [],
    portals: [
      { x: W - 1, y: 15, to: 'poino', toX: 1, toY: 15, label: '포이노 마을' },
      { x: W - 1, y: 16, to: 'poino', toX: 1, toY: 16, label: '포이노 마을' },
      // 잠긴 큰 동굴문 — 마녀에게서 받은 용의 열쇠가 있어야 지나간다.
      // 열쇠는 **없어지지 않는다.** 한 번 연 문은 계속 열려 있어야,
      // 1시간 리젠을 기다렸다 다시 오는 것이 성립한다.
      { x: 0, y: 15, to: 'dragon_lair', toX: 37, toY: 15, label: '잠긴 동굴',
        requireItem: 'dragon_gate_key' },
      { x: 0, y: 16, to: 'dragon_lair', toX: 37, toY: 16, label: '잠긴 동굴',
        requireItem: 'dragon_gate_key' },
    ],
  };
}

// ---------------- 포이노 성 내부 (24 x 16) ----------------
function buildCastle() {
  const W = 24;
  const H = 16;
  const g = blank(W, H, 'L');
  rect(g, 0, 0, W, 2, 'U');
  for (let y = 2; y < H; y++) {
    g[y][0] = 'C';
    g[y][1] = 'C';
    g[y][W - 2] = 'C';
    g[y][W - 1] = 'C';
  }
  rect(g, 0, H - 1, W, 1, 'C');
  // 성 안에서 본 출입구 — 마을 쪽과 **같은 성문 그림**의 아래 두 칸을 쓴다.
  // (0.67 까지는 'K' 였는데, 그 글자를 서쪽 절벽의 **잠긴 동굴문**이 나중에
  //  덮어써서 성 출입구에 자물쇠가 달려 있었다. 아무도 눈치채지 못했다)
  g[H - 1][11] = 'N';
  g[H - 1][12] = 'M';
  // ── 알현실은 **따로** 있다 (0.70) ──────────────────────────
  //
  // 0.69 까지는 왕·간수·상점·대장간이 **한 방에 다** 있었다. 방 하나에
  // 네 자리를 욱여넣으니 성이 넓어 보이기는커녕 창고처럼 보였다.
  // 여기는 이제 **들어서는 방**이고, 왕은 옥좌 뒤 문으로 들어가 만난다.
  // 문 하나를 지나야 나오는 자리는 그것만으로 무게가 생긴다.
  rect(g, 10, 0, 4, 2, 'U');
  g[1][11] = 'N';
  g[1][12] = 'M';
  // 문 앞은 붉은 융단으로 이어 둔다 — 어디로 가야 하는지 말해 준다.
  rect(g, 11, 2, 2, 2, '@');

  // ── 성 안 손질 (0.68) ──────────────────────────────────────
  //
  // 0.67 까지는 판석만 깔린 넓은 빈 방이었다. 왕·간수·상점·대장간 네 자리가
  // 있는데 그 사이가 텅 비어서, "큰 방"이지 "왕이 있는 곳"이 아니었다.
  //
  //   융단  문에서 옥좌까지 곧게 이어져 **어디로 가야 하는지**를 말해 준다
  //   기둥  네 귀퉁이. 방에 뼈대가 생긴다
  //   창    양 벽. 색유리라 회색 돌에 색이 하나 들어온다
  //   횃불  문 양옆과 옥좌 뒤. 불이 있는 쪽이 사람이 있는 쪽이다

  // 알현실 문 앞에서 성문까지 곧게 뻗은 붉은 융단(2칸 폭).
  rect(g, 11, 4, 2, H - 5, '@');
  g[2][11] = '%'; g[2][12] = '%';   // 문 쪽 끝단(술이 달린다)

  // 기둥 넷 — 예전에 성벽 조각(C)을 놓았던 자리다.
  //   벽 조각은 '벽이 방 한가운데 떠 있는' 것으로 보였다. 기둥이 맞다.
  g[6][5] = '&'; g[6][6] = '&';
  g[6][17] = '&'; g[6][18] = '&';
  g[10][5] = '&'; g[10][6] = '&';
  g[10][17] = '&'; g[10][18] = '&';

  // 색유리 창 — 좌우 벽. 벽은 두 겹(x 0,1 과 W-2,W-1)이라 안쪽 겹에 낸다.
  for (const y of [4, 8, 12]) {
    g[y][1] = '*';
    g[y][W - 2] = '*';
  }

  // 벽 횃불 — 성문 양옆과 옥좌 뒤.
  g[H - 1][9] = '+'; g[H - 1][14] = '+';
  g[1][9] = '+'; g[1][14] = '+';

  // 옥좌 뒤편 — 지하감옥으로 내려가는 계단
  g[3][20] = 's';
  g[4][20] = 'L';

  // 오른쪽 아래 — 무기상 카일의 좌판.
  // 가판대를 늘어놓아 "여기가 상점"이라는 걸 말 걸기 전에 알 수 있게 한다.
  g[12][19] = '1';
  g[12][20] = '2';
  g[12][21] = '1';

  // 왼쪽 아래 — 왕실 대장간. 화덕 둘에 모루 하나를 두고 그 앞에 대장장이가 선다.
  // 좌판과 마주 보게 놓아, 성 안이 "왕 · 간수 · 상점 · 대장간" 네 자리로 읽히게 한다.
  g[12][2] = '3';
  g[12][3] = '4';
  g[12][4] = '3';

  return {
    name: '포이노 성 · 들어서는 방',
    kind: 'town',
    // ⚠ 성에는 **성 전용 곡**이 있다 (0.59 에 사람이 만들어 준 것).
    //   이 줄이 없어서 한 번 사고가 났다 — 예전에는 maps.json 에 손으로만
    //   'castle' 이라 적혀 있었는데, gen-maps 는 maps.json 을 통째로 다시 쓴다.
    //   지형을 손보려고 `npm run maps` 를 한 번 돌렸더니 그 한 줄이 조용히
    //   'town' 으로 돌아갔고, 성에 들어가도 마을 곡이 흘렀다.
    //   (같은 사고가 지하감옥 5층 귀환점에서도 났다 — gen-dungeon 참고)
    //   **손으로 적어 둔 값은 언젠가 날아간다. 만드는 자리에서 만든다.**
    bgm: 'castle',
    bgColor: '#1a1c2a',
    grid: toStrings(g),
    spawns: [],
    respawnMs: 0,
    npcs: [
      // 화덕 바로 앞. 아래에서 걸어와 Enter 로 말을 건다.
      { id: 'royal_smith', x: 3, y: 13 },
      { id: 'dungeon_warden', x: 19, y: 5 },
      // 가판대 바로 앞에 선다(아래에서 걸어와 Enter 로 말을 건다)
      { id: 'gate_merchant', x: 20, y: 13 },
    ],
    portals: [
      { x: 11, y: 15, to: 'poino', toX: 19, toY: 8, label: '마을로' },
      { x: 12, y: 15, to: 'poino', toX: 20, toY: 8, label: '마을로' },
      { x: 11, y: 1, to: 'throne', toX: 9, toY: 15, label: '알현실' },
      { x: 12, y: 1, to: 'throne', toX: 10, toY: 15, label: '알현실' },
      {
        x: 20, y: 3, to: 'dungeon_1', toX: 20, toY: 28,
        label: '지하감옥', requireLevel: DUNGEON_LEVEL,
        blockedText: `지하감옥 간수: 레벨 ${DUNGEON_LEVEL}은 되어야 내려보낼 수 있네.`,
      },
    ],
  };
}

// ---------------- 지하감옥 (40 x 30) ----------------
// 성 안쪽 계단으로 내려가는 곳. 레벨 40부터.
// 필드처럼 넓은 들판이 아니라 방과 복도로 이루어진 돌 감옥이다.
function buildDungeon() {
  const W = 40;
  const H = 30;
  const g = blank(W, H, 'Z'); // 처음엔 전부 벽, 여기서부터 파낸다

  const carve = (x, y, w, h) => rect(g, x, y, w, h, 'd');

  // 세로 중앙 복도(입구 → 안쪽)
  carve(19, 3, 3, 25);
  // 방 넷 + 이어 주는 복도
  carve(4, 4, 11, 7);
  carve(25, 4, 11, 7);
  carve(4, 17, 11, 8);
  carve(25, 17, 11, 8);
  carve(14, 7, 6, 2);
  carve(21, 7, 5, 2);
  carve(14, 20, 6, 2);
  carve(21, 20, 5, 2);
  // 가운데 넓은 방(보스 자리)
  carve(14, 12, 12, 5);

  // 기둥 몇 개 — 밋밋하지 않게
  for (const [x, y] of [[7, 7], [12, 7], [28, 7], [33, 7], [7, 21], [12, 21], [28, 21], [33, 21]]) {
    g[y][x] = 'Z';
  }

  // 올라가는 계단(입구)
  g[28][20] = 's';

  return {
    name: '포이노 지하감옥',
    kind: 'field', // 몬스터가 나오는 곳이므로 필드 규칙을 따른다
    bgm: 'dungeon',
    bgColor: '#141320',
    dungeon: true,
    stage: 21,
    // 17단계쯤의 세기. 레벨 40에 들어올 수 있는 곳이므로 20단계보다 세면 안 된다
    // (문은 열리는데 한 대도 못 버티면 문이 없는 것과 같다).
    power: 1.45,
    levelBonus: 0,
    grid: toStrings(g),
    monsters: ['elite_skeleton', 'elite_demon_soldier'],
    monsterCount: 12,
    boss: null,
    respawnMs: 13000,
    npcs: [],
    portals: [
      { x: 20, y: 28, to: 'castle', toX: 20, toY: 4, label: '성으로' },
    ],
  };
}

// ---------------- 알현실 (20 x 17) ----------------
/**
 * 왕이 있는 방 (0.70).
 *
 * ── 왜 따로 냈나 ───────────────────────────────────────────
 * 0.69 까지 성은 방 하나였고, 그 안에 왕·간수·상점·대장간이 다 있었다.
 * 넓어 보이라고 크게 그린 방인데 정작 **창고처럼** 보였다 — 자리가 넷이면
 * 방도 넷이어야 각 자리가 제 몫을 한다.
 *
 * 문 하나를 지나야 나오는 자리는 그것만으로 무게가 생긴다.
 * 여기는 붉은 융단이 문에서 옥좌까지 곧게 뻗고, 좌우로 기둥이 늘어서고,
 * 옥좌 뒤에 색유리 창이 셋 있다. 다른 것은 두지 않는다 —
 * **왕 말고는 볼 것이 없어야** 왕이 보인다.
 */
function buildThrone() {
  const W = 20;
  const H = 17;
  const g = blank(W, H, 'L');

  // 벽 — 위는 두 겹(성벽 꼭대기가 보이게), 좌우·아래는 두 겹.
  rect(g, 0, 0, W, 2, 'U');
  for (let y = 2; y < H; y++) {
    g[y][0] = 'C';
    g[y][1] = 'C';
    g[y][W - 2] = 'C';
    g[y][W - 1] = 'C';
  }
  rect(g, 0, H - 1, W, 1, 'C');

  // 들어오는 문 — 아래 가운데. 성의 '들어서는 방' 과 이어진다.
  g[H - 1][9] = 'N';
  g[H - 1][10] = 'M';

  // 옥좌 단 — 세 계단 넓이로 위쪽 가운데에 앉힌다.
  rect(g, 6, 2, 8, 3, 'B');

  // 옥좌 뒤 색유리 창 셋 — 왕 뒤에서 빛이 들어온다.
  g[1][7] = '*'; g[1][10] = '*'; g[1][13] = '*';

  // 붉은 융단 — 문에서 옥좌까지 곧게. 끝단(술)은 옥좌 쪽.
  rect(g, 9, 5, 2, H - 6, '@');
  g[5][9] = '%'; g[5][10] = '%';

  // 기둥 — 융단 좌우로 세 쌍. 늘어서면 방이 길어 보인다.
  for (const y of [7, 10, 13]) {
    g[y][5] = '&'; g[y][6] = '&';
    g[y][13] = '&'; g[y][14] = '&';
  }

  // 벽 횃불 — 문 양옆과 옥좌 양옆.
  g[H - 1][7] = '+'; g[H - 1][12] = '+';
  g[2][2] = '+'; g[2][W - 3] = '+';

  return {
    name: '포이노 성 · 알현실',
    kind: 'town',
    // 성과 같은 곡이 이어진다 — 문 하나 지났다고 곡이 바뀌면 딴 건물처럼 들린다.
    bgm: 'castle',
    bgColor: '#1a1c2a',
    grid: toStrings(g),
    spawns: [],
    respawnMs: 0,
    npcs: [
      // 옥좌 단(B) 위에 선다. 융단 한가운데 서 있으면 왕이 아니라
      // 길을 막고 선 사람으로 보인다.
      { id: 'king', x: 9, y: 4 },
    ],
    portals: [
      { x: 9, y: H - 1, to: 'castle', toX: 11, toY: 3, label: '들어서는 방' },
      { x: 10, y: H - 1, to: 'castle', toX: 12, toY: 3, label: '들어서는 방' },
    ],
  };
}

// ---------------- 필드 20단계 ----------------
// 1~10단계는 손으로 적은 표, 11~20단계는 그것을 그대로 되풀이하되
// "강화된 ○○" 몬스터로 바꾸고 배율만 올린다(맵과 몬스터 겉모습은 완전히 같다).
//
// ── 사다리 규칙 (0.35에서 다시 잡았다) ────────────────────────
// ① 각 땅에는 **앞 땅의 새 놈 + 이번 땅의 새 놈** 두 종류만 둔다.
//    앞으로 되돌아가 더 약한 놈을 데려오지 않는다.
// ② 그래서 화면에 찍히는 레벨(몬스터 제 레벨 + levelBonus)이 **절대 내려가지 않는다.**
//    예전에는 7단계에 늑대(8), 9단계에 꼬마 악마(12)가 섞여 있어서
//    "6단계보다 7단계 레벨이 낮다"가 눈에 보였다.
// ③ levelBonus 는 한 단계에 1씩. 새 놈이 없는 땅(8·9단계)도 숫자는 계속 오른다.
//
// 확인: node tools/stage-curve.js — 레벨이 내려가거나 승률이 올라가면 ← 로 짚어 준다.
const STAGES = [
  { name: '포이노 동쪽 들판', monsters: ['slime'], count: 9, power: 1.327, levelBonus: 0, bg: '#16301f' },
  { name: '바람 언덕', monsters: ['slime', 'bat'], count: 10, power: 1.721, levelBonus: 1, bg: '#173322' },
  { name: '늑대 골짜기', monsters: ['bat', 'wolf'], count: 10, power: 1.481, levelBonus: 2, bg: '#1a2f28' },
  { name: '잿빛 숲', monsters: ['wolf', 'mushroom'], count: 11, power: 3.333, levelBonus: 3, bg: '#222c1e' },
  { name: '무너진 초소', monsters: ['mushroom', 'imp'], count: 9, power: 5.134, levelBonus: 4, bg: '#2b2418', boss: 'imp_captain' },
  { name: '붉은 황야', monsters: ['imp', 'skeleton'], count: 11, power: 8.184, levelBonus: 5, bg: '#33221c' },
  // 7·8·9단계는 새 놈이 없다(1구간의 몬스터를 다 썼다).
  // 예전에는 빈자리를 늑대·꼬마 악마로 메웠는데 그게 곧 레벨 역전이었다.
  // 이제는 가장 센 두 놈을 그대로 두고 levelBonus 와 배율로만 밀어 올린다.
  // 7단계는 **해골만** 둔다. 여기서 악마 병사를 미리 꺼내면 6→7 에서 승률이
  // 95% 에서 10% 로 떨어져 사다리가 아니라 절벽이 된다. 이름도 '뼈의 들판'이다.
  { name: '뼈의 들판', monsters: ['skeleton'], count: 12, power: 9.201, levelBonus: 6, bg: '#2c2622' },
  { name: '악마의 길목', monsters: ['skeleton', 'demon_soldier'], count: 11, power: 7.313, levelBonus: 7, bg: '#2e1e26' },
  { name: '검은 성문 앞', monsters: ['skeleton', 'demon_soldier'], count: 12, power: 8.388, levelBonus: 8, bg: '#281a2c' },
  { name: '심연의 관문', monsters: ['demon_soldier'], count: 9, power: 9.521, levelBonus: 9, bg: '#1f1430', boss: 'demon_general' },
];

// 11~20단계의 이름과 배율.
// 배율은 손으로 찍은 값이 아니라 "이 단계에 오는 캐릭터가 몇 대 버티고 몇 대에 잡는가"를
// 목표로 두고 역산해 나온 등비 수열이다(공비 약 1.068).
const DEEP_NAMES = [
  '되살아난 들판', '무너진 바람 언덕', '검게 죽은 골짜기', '재의 숲', '되세워진 초소',
  '피에 젖은 황야', '뼈가 쌓인 들판', '악마의 대로', '닫힌 성문 앞', '심연 너머',
];
/**
 * 그 단계에서 마법으로 들어오는 몫.
 *
 * 얕은 땅(1~10단계)은 0 이다 — 지능을 아직 안 올린 사람에게 마법을 섞으면
 * 막을 방법이 없는 피해가 되고, 그 자리는 물리만으로도 충분히 어렵다.
 */
function magicPartOf(stage) {
  if (stage >= 16) return 0.2;
  if (stage >= 11) return 0.1;
  return 0;
}

// 15·20단계 보스는 제 땅보다 마법을 더 많이 섞는다.
// 5·10단계 보스는 그대로 둔다 — 그 자리는 마법이 0 인 구간이고,
// 지능을 아직 못 올린 사람에게 막을 수 없는 피해를 주게 된다.
const BOSS_MAGIC_PART = 0.3;

const DEEP_POWER = [4.262, 4.32, 3.885, 4.03, 4.814, 7.865, 8.533, 7.923, 8.707, 9.114];

// 11단계의 레벨 보정 시작값. 10단계의 마지막 숫자(악마 병사 24 + 9 = 33) 위에서
// 시작해야 사다리가 끊기지 않는다. 강화된 슬라임이 31 이므로 3 을 얹어 34 로 만든다.
const DEEP_LEVEL_BASE = 3;

/** 1~10단계 표를 그대로 되풀이해 11~20단계를 만든다. */
function deepStages() {
  return STAGES.map((s, i) => ({
    name: DEEP_NAMES[i],
    monsters: s.monsters.map((m) => `elite_${m}`),
    count: s.count,
    power: DEEP_POWER[i],
    // 강화 몬스터도 제 레벨 위에 단계 보정을 얹는다.
    //
    // 예전에는 0 이었다. 그래서 11~20단계 안에서는 숫자가 아예 안 움직였고,
    // 10단계 마지막(악마 병사 24+9=33)에서 11단계 첫 땅(강화된 슬라임 31)으로
    // 넘어가면 **레벨이 오히려 내려갔다.** 3부터 시작해 그 자리를 메운다.
    levelBonus: DEEP_LEVEL_BASE + i,
    bg: s.bg,
    boss: s.boss ? `elite_${s.boss}` : undefined,
    deep: true,
  }));
}

const ALL_STAGES = [...STAGES, ...deepStages()];

function buildFields() {
  const out = {};
  ALL_STAGES.forEach((s, i) => {
    const n = i + 1;
    const id = `field_${n}`;
    const prev = n === 1 ? 'poino' : `field_${n - 1}`;
    const next = n === ALL_STAGES.length ? 'poino' : `field_${n + 1}`;

    const last = n === ALL_STAGES.length;
    const portals = [
      {
        x: 0, y: 15, to: prev,
        toX: 38, toY: 15,
        label: n === 1 ? '포이노 마을' : ALL_STAGES[i - 1].name,
      },
    ];
    // 마지막 단계(20단계)에는 동쪽 길이 없다. 여기가 동쪽 들판의 끝이다.
    // 예전에는 오른쪽 끝이 마을로 이어져 있어서, 심연 너머를 지나 다시 마을로
    // 걸어 나오는 고리가 되었다 — "끝"이라는 느낌이 없었다.
    if (!last) {
      portals.push({
        x: 39, y: 15, to: next,
        toX: 1, toY: 15,
        label: ALL_STAGES[i + 1].name,
        // 이 단계에 보스가 있으면, 그 보스를 잡고 퀘스트까지 마쳐야 다음으로 간다.
        ...(s.boss ? { requireBossOf: id, requireQuestOf: s.boss } : {}),
      });
    }
    // 세로로 2칸씩 열어 둔다(놓치기 어렵게)
    const wide = portals.map((p) => ({ ...p, y: 16, toY: 16 }));
    portals.push(...wide);

    out[id] = {
      name: `${n}단계 · ${s.name}`,
      kind: 'field',
      bgm: 'field',
      stage: n,
      // 11~20단계는 1~10단계와 같은 땅을 되풀이한다(맵 생성 씨앗도 같다).
      deep: s.deep || false,
      bgColor: s.boss ? '#160d0a' : s.bg,
      power: s.power,
      levelBonus: s.levelBonus,
      // 이 땅의 공격 가운데 몇 할이 마법으로 들어오는가(0~1).
      //
      // 물리 몬스터만 나오는 땅에서는 지능의 '받는 마법 피해 감소' 가 죽은 값이었다.
      // 뒤로 갈수록 마법이 섞이게 두면 그 값이 실제로 일을 한다.
      //   11~15단계 10% · 16~20단계 20% · 그 두 구간의 보스 30% · 지하감옥 50%
      magicPart: magicPartOf(n),
      bossMagicPart: s.boss && magicPartOf(n) > 0 ? BOSS_MAGIC_PART : undefined,
      generate: {
        w: 40,
        h: 32,
        // 11~20단계는 1~10단계와 똑같은 지형이어야 하므로 씨앗을 그대로 쓴다.
        seed: 90210 + ((n - 1) % STAGES.length + 1) * 7919,
        entryY: 15,
        exitY: 15,
        treeClusters: 16,
        rocks: 16,
        ponds: 3,
        flowers: 26,
      },
      // 보스가 있는 들판은 화산 지형으로 갈아입는다.
      // 지도 자체는 그대로다 — MapSystem 이 만들어 낸 글자를 THEMES 로 바꿔 칠할 뿐이다.
      theme: s.boss ? 'volcano' : null,
      // 얹는 그림(over) 밑에 깔 바닥 (0.70). 없으면 풀로 본다.
      // 화산 땅에 풀을 깔면 잿더미에 잔디 조각이 흩어진다.
      ground: s.boss ? 'ash' : 'grass',
      monsters: s.monsters,
      monsterCount: s.count,
      boss: s.boss || null,
      respawnMs: 11000,
      npcs: [],
      portals,
      // 보스를 잡으면 마을 웨이포인트에서 이 맵으로 바로 올 수 있게 된다.
      waypoint: { x: 20, y: 16 },
    };
  });
  return out;
}

const maps = {
  tileset: TILESET,
  themes: THEMES,
  maps: {
    poino: buildTown(),
    // ── 집 안 (0.70.3) ─────────────────────────────────────
    //
    // 가게 주인은 이제 여기 있다. 밖에서는 문과 간판만 보인다.
    // 글자: o 벽 · I 창 · l 바닥 · z 나가는 자리 · K 계산대 · $ 진열대
    //       ! 통 · ~ 침대 · ? 탁자 · | 가마솥 · 3 화덕 · 4 모루
    //
    // ⚠ 주인은 **계산대 뒤가 아니라 옆**에 선다. 아래 격자에서 주인이 설 칸과
    //   그 앞칸이 둘 다 바닥(l)인지 눈으로 확인할 수 있다(buildRoom 이 다시 검사한다).
    poino_shop: buildRoom({
      name: '포이노 잡화점', back: { x: 8, y: 12 },
      npcs: [{ id: 'shopkeeper', x: 8, y: 4 }],
      plan: [
        'ooooooooooooooo',
        'ooIooooooooIooo',
        'o$$lllllllll$$o',
        'olllllllllllllo',
        'ollKKKKKllllllo',
        'olllllllllllllo',
        'ollllllllllll!o',
        'o!lllllllllll!o',
        'olllllllllllllo',
        'olllllllllllllo',
        'ooooooozooooooo',
      ],
    }),
    poino_forge: buildRoom({
      name: '포이노 대장간', back: { x: 30, y: 12 },
      // 화덕이 타는 곳이라 밖이 더 어둡고 붉다.
      bgColor: '#2a1710',
      npcs: [{ id: 'blacksmith', x: 6, y: 4 }],
      plan: [
        'ooooooooooooooo',
        'ooIooooooooIooo',
        'oll33llllll$$lo',
        'olllllllllllllo',
        'ollll4llllllllo',
        'olllllllllllllo',
        'ollllllllllKKlo',
        'o!lllllllllll!o',
        'olllllllllllllo',
        'olllllllllllllo',
        'ooooooozooooooo',
      ],
    }),
    poino_alchemy: buildRoom({
      name: '연금술사의 집', back: { x: 30, y: 21 },
      npcs: [{ id: 'alchemist', x: 6, y: 4 }],
      plan: [
        'ooooooooooooooo',
        'ooIooooooooIooo',
        'o$$llllllll$$$o',
        'olllllllllllllo',
        'ollll|llllllllo',
        'olllllllllllllo',
        'olllllllll??llo',
        'o!lllllllllll!o',
        'olllllllllllllo',
        'olllllllllllllo',
        'ooooooozooooooo',
      ],
    }),
    poino_inn: buildRoom({
      name: '포이노 여관', back: { x: 12, y: 24 },
      npcs: [{ id: 'innkeeper', x: 4, y: 4 }],
      plan: [
        'ooooooooooooooo',
        'ooIooooooooIooo',
        'olllllllll~l~lo',
        'olllllllllllllo',
        'ollKlllll~l~llo',
        'olllllllllllllo',
        'oll??lllll~l~lo',
        'o!lllllllllll!o',
        'olllllllllllllo',
        'olllllllllllllo',
        'ooooooozooooooo',
      ],
    }),
    west_cliff: buildWestCliff(),
    dragon_lair: buildDragonLair(),
    castle: buildCastle(),
    throne: buildThrone(),
    dungeon_1: buildDungeon(),
    ...buildFields(),
  },
};

const file = path.resolve(__dirname, '../src/data/maps.json');
fs.writeFileSync(file, JSON.stringify(maps, null, 2));

// 검증
for (const [id, m] of Object.entries(maps.maps)) {
  if (!m.grid) continue;
  const w = m.grid[0].length;
  const bad = m.grid.filter((r) => r.length !== w);
  const unknown = new Set();
  for (const row of m.grid) for (const ch of row) if (!TILESET[ch]) unknown.add(ch);
  console.log(
    `${id}: ${w}x${m.grid.length}` +
      (bad.length ? `  ⚠ 길이 불일치 ${bad.length}행` : '') +
      (unknown.size ? `  ⚠ 미정의 타일 ${[...unknown].join(',')}` : '  ✓')
  );
}
console.log(`✓ ${file}`);
