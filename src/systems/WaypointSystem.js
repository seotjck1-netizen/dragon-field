// 책임: "어느 맵으로 바로 갈 수 있는가"만 판단한다(순수 함수).
//        해금은 그 맵의 보스를 잡았을 때 일어난다.
// 금지: DOM 접근, 저장소 접근, 실제 맵 교체(오케스트레이터가 한다), 다른 system import.
//
// 디아블로2 의 웨이포인트와 같은 규칙이다:
//   · 웨이포인트 돌은 마을 한가운데 하나뿐이다.
//   · 보스를 잡은 맵만 목록에 뜬다.
//   · 고르면 그 맵의 한가운데로 간다.

/** 마을은 언제나 갈 수 있다(웨이포인트 돌이 거기 있으므로 실제로는 안 쓰이지만 목록에 남긴다). */
export const HOME_MAP = 'poino';

/**
 * 맵 정의 표. db.maps 는 maps.json 파일 전체({tileset, maps})라서 한 겹 더 들어가야 한다.
 * 여기서 한 번만 감싸 두고 나머지는 이 함수만 쓴다.
 */
function mapDefs(db) {
  return (db.maps && db.maps.maps) || {};
}

/** 웨이포인트를 놓을 수 있는 맵인가 — 보스가 있는 맵만. */
export function isWaypointMap(mapDef) {
  return !!(mapDef && mapDef.boss && mapDef.waypoint);
}

/** 저장된 목록을 안전한 배열로. 모르는 맵 id 는 버린다. */
export function normalize(db, saved) {
  const defs = mapDefs(db);
  const out = [];
  for (const id of saved || []) {
    if (defs[id] && isWaypointMap(defs[id]) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 이미 해금돼 있는가. */
export function has(state, mapId) {
  return (state.waypoints || []).includes(mapId);
}

/**
 * 해금한다.
 * @returns {{unlocked:boolean, name:string}} 이번에 새로 열렸는지
 */
export function unlock(state, mapId) {
  const defs = mapDefs(state.db);
  const def = defs[mapId];
  if (!def || !isWaypointMap(def)) return { unlocked: false, name: '' };
  if (!state.waypoints) state.waypoints = [];
  if (state.waypoints.includes(mapId)) return { unlocked: false, name: def.name };
  state.waypoints.push(mapId);
  // 목록은 언제나 단계 순서로 보여 준다.
  state.waypoints.sort((a, b) => (defs[a].stage || 0) - (defs[b].stage || 0));
  return { unlocked: true, name: def.name };
}

/**
 * 웨이포인트 창에 뿌릴 목록. 아직 못 연 곳도 "잠김"으로 함께 보여 준다 —
 * 무엇을 더 깨야 열리는지 보이는 편이 낫다.
 * @returns {{id:string, name:string, stage:number, open:boolean, here:boolean, bossName:string}[]}
 */
export function listFor(state) {
  const rows = [];
  for (const [id, def] of Object.entries(mapDefs(state.db))) {
    if (!isWaypointMap(def)) continue;
    rows.push({
      id,
      name: def.name,
      stage: def.stage || 0,
      open: has(state, id),
      here: state.map.id === id,
      bossName: state.db.monsters[def.boss]?.name || '보스',
    });
  }
  return rows.sort((a, b) => a.stage - b.stage);
}

/**
 * 그 맵에서 내려설 자리. maps.json 의 waypoint 좌표를 쓰되,
 * 자동 생성 맵은 그 칸이 나무나 바위일 수 있으므로 호출부가 가까운 빈 칸을 찾아 준다.
 */
export function landingSpot(mapDef) {
  const wp = mapDef.waypoint || {};
  return { x: wp.x ?? 20, y: wp.y ?? 16 };
}

/** @returns {{ok:boolean, reason?:string}} */
export function canTravel(state, mapId) {
  if (!mapDefs(state.db)[mapId]) return { ok: false, reason: '그런 곳은 없다.' };
  if (!has(state, mapId)) return { ok: false, reason: '아직 가 본 적 없는 곳이다.' };
  if (state.map.id === mapId) return { ok: false, reason: '이미 그곳에 있다.' };
  return { ok: true };
}
