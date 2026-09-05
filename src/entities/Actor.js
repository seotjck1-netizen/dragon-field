// 책임: 필드 위 유닛(플레이어/몬스터)의 공통 데이터 구조와 좌표 헬퍼.
// 금지: DOM/캔버스 접근. 그리기는 scenes/가 이 데이터를 읽어서 한다.
// 금지: 전투 계산. 스탯 합산은 StatBlock, 전투는 CombatSystem이 한다.

import { CONFIG } from '../config.js';

let _uid = 1;
export function nextUid(prefix = 'a') {
  return `${prefix}_${_uid++}`;
}

/**
 * 타일 좌표계를 쓰되, 화면에는 픽셀 보간으로 부드럽게 이동한다.
 * tx/ty = 논리 타일 좌표, px/py = 렌더링용 픽셀 좌표(타일 중앙 바닥 기준)
 */
export function createActor({
  uid = nextUid(),
  kind = 'monster',
  defId = null,
  name = '',
  tx = 0,
  ty = 0,
  dir = 'down',
  sprite = null,
  battleSprite = null,
  stepMs = CONFIG.MONSTER_STEP_MS,
  spriteScale = 1,
  extra = {},
}) {
  const actor = {
    uid,
    kind,
    defId,
    name,
    tx,
    ty,
    fromTx: tx,
    fromTy: ty,
    dir,
    moving: false,
    stepT: 0,
    stepMs,
    sprite,
    battleSprite,
    spriteScale,
    bobT: Math.random() * 1000,
    alive: true,
    thinkTimer: 0,
    px: 0,
    py: 0,
    ...extra,
  };
  syncPixel(actor);
  return actor;
}

/** 한 걸음에 걸리는 시간. 대각선은 거리가 √2 배라 그만큼 더 걸린다(0.53). */
export function stepDuration(actor) {
  return actor.stepMs * (actor.stepSpan || 1);
}

/** 타일 좌표 → 픽셀 좌표(중앙 바닥). 보간 중이면 fromTile→tile 사이를 lerp 한다. */
export function syncPixel(actor) {
  const t = CONFIG.TILE;
  const progress = actor.moving ? Math.min(1, actor.stepT / stepDuration(actor)) : 1;
  const fx = actor.fromTx + (actor.tx - actor.fromTx) * progress;
  const fy = actor.fromTy + (actor.ty - actor.fromTy) * progress;
  actor.px = fx * t + t / 2;
  actor.py = fy * t + t; // 발밑
  return actor;
}

export function tileDistance(a, b) {
  return Math.abs(a.tx - b.tx) + Math.abs(a.ty - b.ty);
}

export function pixelDistance(a, b) {
  const dx = a.px - b.px;
  const dy = a.py - b.py;
  return Math.hypot(dx, dy);
}

export const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  // 0.53 — 대각선. 화살표 둘을 같이 누르면 이쪽으로 걷는다.
  upleft: { x: -1, y: -1 },
  upright: { x: 1, y: -1 },
  downleft: { x: -1, y: 1 },
  downright: { x: 1, y: 1 },
};

/**
 * 그 방향으로 걸을 때 **바라보는 쪽**(그림에 쓰는 값).
 *
 * 대각선 그림은 없다. 좌우가 섞여 있으면 좌우를 본다 — 사람은 좌우 뒤집기로
 * 표현되므로 그쪽이 자연스럽고, NPC 에게 말 거는 방향도 좌우가 더 자주 맞는다.
 */
export const FACING_OF = {
  up: 'up', down: 'down', left: 'left', right: 'right',
  upleft: 'left', downleft: 'left', upright: 'right', downright: 'right',
};

/** 네 방향인가(대각선이 아닌가). */
export const isDiagonal = (dir) => {
  const v = DIR_VECTORS[dir];
  return !!(v && v.x && v.y);
};
