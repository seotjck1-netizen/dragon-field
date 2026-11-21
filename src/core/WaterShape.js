// 둥근 물의 모양 (0.70.31~) — **그리는 쪽과 걷는 쪽이 같은 값을 쓴다.**
//
// 물 칸을 4px 그물에 찍고 흐리게 번진 값(0~1)이 물의 모양이다. 0.5 부터가 물이다.
//   · 그리는 쪽: FieldScene._roundWater — 이 값의 높낮이로 모래 띠 · 물 · 거품 · 깊은 물을 나눈다.
//   · 걷는 쪽:  MovementSystem.tryStep — 대각선 걸음이 물 칸의 **둥글게 깎인 모서리**를 지나갈 때
//               그 자리가 마른 땅이면 지나가게 한다(벽 모서리는 그대로 못 뚫는다).
//
// ⚠ 한쪽만 고치면 "보이는 것"과 "걷는 것"이 다시 어긋난다 — 흐림 반경 · 문턱은 여기서만 바꾼다.
// 금지: document/canvas 접근(시험 · 서버에서도 돈다). 숫자만 계산한다.

/** 그물 한 칸(px) */
export const WATER_GRID = 4;
/** 이 값부터 물이다 */
export const WET = 0.5;
/** 상자 흐림 반경(그물 칸) — 두 번 흐린다(≈ 가우스) */
const BLUR_R = 3;

/** 둥근 물로 그리는 칸인가(물 그림 · 위에 얹은 것이 아님). */
export function isWaterTile(tile) {
  return !!tile && tile.sprite === 'tile_water' && !tile.over;
}

/**
 * 지도 한 장의 물 모양. 지도마다 한 번 계산해 지도에 붙여 둔다(격자가 바뀌면 다시).
 * 지도 밖은 물로 친다(지도 끝에 닿은 물은 밖으로 이어진다).
 * @returns {{gw:number, gh:number, S:number, f:Float32Array}|null} 물이 없으면 null
 */
export function waterField(map, T = 32) {
  if (!map || !map.grid) return null;
  const c = map._waterField;
  if (c && c.grid === map.grid && c.T === T) return c.field;
  const wet = new Uint8Array(map.w * map.h);
  let any = false;
  for (let y = 0; y < map.h; y++) {
    const row = map.grid[y];
    for (let x = 0; x < map.w; x++) {
      if (isWaterTile(map.tileset[row[x]])) { wet[y * map.w + x] = 1; any = true; }
    }
  }
  let field = null;
  if (any) {
    const S = WATER_GRID;
    const gw = Math.ceil((map.w * T) / S), gh = Math.ceil((map.h * T) / S);
    const per = T / S;
    const isWet = (x, y) => (x < 0 || y < 0 || x >= map.w || y >= map.h ? 1 : wet[y * map.w + x]);
    let f = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) f[j * gw + i] = isWet(Math.floor(i / per), Math.floor(j / per));
    f = blur(blur(f, gw, gh, BLUR_R), gw, gh, BLUR_R);
    field = { gw, gh, S, f };
  }
  // 지도에 붙여 둔다 — 열거되지 않게(세이브 · 비교에 안 섞이게)
  Object.defineProperty(map, '_waterField', { value: { grid: map.grid, T, field }, writable: true, configurable: true, enumerable: false });
  return field;
}

/** 판 밖은 가장자리 값으로 친다. */
function blur(src, gw, gh, r) {
  const tmp = new Float32Array(gw * gh), out = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[j * gw + Math.min(gw - 1, Math.max(0, k))];
    for (let i = 0; i < gw; i++) {
      tmp[j * gw + i] = acc / (2 * r + 1);
      acc += src[j * gw + Math.min(gw - 1, i + r + 1)] - src[j * gw + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < gw; i++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(gh - 1, Math.max(0, k)) * gw + i];
    for (let j = 0; j < gh; j++) {
      out[j * gw + i] = acc / (2 * r + 1);
      acc += tmp[Math.min(gh - 1, j + r + 1) * gw + i] - tmp[Math.max(0, j - r) * gw + i];
    }
  }
  return out;
}

/**
 * 지도 위 한 점(px)의 물 값(0~1). 그리는 쪽이 작은 그물을 부드럽게 키운 것(이중 선형)과 같게 읽는다.
 * 물이 없는 지도는 0.
 */
export function wetAt(map, px, py, T = 32) {
  const w = waterField(map, T);
  if (!w) return 0;
  const { gw, gh, S, f } = w;
  const gx = Math.min(gw - 1, Math.max(0, px / S - 0.5));
  const gy = Math.min(gh - 1, Math.max(0, py / S - 0.5));
  const i0 = Math.floor(gx), j0 = Math.floor(gy);
  const i1 = Math.min(gw - 1, i0 + 1), j1 = Math.min(gh - 1, j0 + 1);
  const ax = gx - i0, ay = gy - j0;
  const top = f[j0 * gw + i0] * (1 - ax) + f[j0 * gw + i1] * ax;
  const bot = f[j1 * gw + i0] * (1 - ax) + f[j1 * gw + i1] * ax;
  return top * (1 - ay) + bot * ay;
}

/**
 * (fx,fy) 칸에서 (tx,ty) 칸으로 **대각선으로** 걸어갈 때, 지나가는 길이 마른 땅인가.
 * 두 칸 가운데를 잇는 선의 가운데(= 네 칸이 만나는 모서리)와 그 앞뒤를 잰다.
 * 몸 폭만큼 물가에서 조금 떨어져야 하므로 문턱을 WET 보다 조금 낮게 잡는다.
 */
export function diagonalDry(map, fx, fy, tx, ty, T = 32) {
  if (!waterField(map, T)) return false;
  const ax = (fx + 0.5) * T, ay = (fy + 0.5) * T;
  const bx = (tx + 0.5) * T, by = (ty + 0.5) * T;
  for (const t of [0.35, 0.5, 0.65]) {
    if (wetAt(map, ax + (bx - ax) * t, ay + (by - ay) * t, T) >= WET - 0.08) return false;
  }
  return true;
}
