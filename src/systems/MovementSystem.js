// 책임: 타일 충돌 판정 + 플레이어/몬스터의 격자 이동 보간.
// 금지: document/canvas 접근. 좌표만 계산한다.
// 금지: 다른 system을 import 하는 것.

import { CONFIG } from '../config.js';
import { syncPixel, stepDuration, DIR_VECTORS, FACING_OF } from '../entities/Actor.js';

/** 해당 타일이 막혀 있는가. 맵 밖도 막힌 것으로 본다. */
export function isSolid(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
  const ch = map.grid[ty][tx];
  const tile = map.tileset[ch];
  return !tile || tile.solid === true;
}

/**
 * 그 타일이 **올라설 수 있는 것**인가 (0.70.17).
 *
 * 술통·탁자·침대·계산대·바위·울타리처럼 **한 칸짜리 낮은 물건**이다.
 * maps.json 의 tileset 에 `"climb": true` 로 적는다.
 *
 * ── 왜 solid 를 그냥 풀지 않는가 ────────────────────────────
 * solid 를 false 로 바꾸면 **모두가** 지나간다 — 몬스터가 술통을 통과해 걸어오고,
 * 몬스터 스폰 자리로도 뽑히고, 길찾기가 탁자 위로 길을 낸다. 술통은 여전히
 * **막힌 것**이 맞다. 다만 사람은 그 위로 **올라설** 수 있을 뿐이다.
 * 그래서 solid 는 그대로 두고, 올라서는 것만 따로 표시한다.
 */
export function isClimbable(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return false;
  const tile = map.tileset[map.grid[ty][tx]];
  return !!(tile && tile.climb === true);
}

/** 그 타일에 다른 액터가 서 있는가(자기 자신 제외). */
export function isOccupied(actors, tx, ty, selfUid) {
  return actors.some(
    (a) => a.alive !== false && a.uid !== selfUid && a.tx === tx && a.ty === ty
  );
}

/**
 * 한 칸 이동을 시작한다. 이미 이동 중이면 무시.
 * @returns {boolean} 이동을 시작했는지 여부
 */
export function tryStep(actor, dir, map, blockers = [], opts = {}) {
  if (!dir) return false;
  // 바라보는 쪽은 네 방향뿐이다(대각선 그림이 없다). 걷는 쪽과 따로 둔다.
  actor.dir = FACING_OF[dir] || dir;
  if (actor.moving) return false;

  const v = DIR_VECTORS[dir];
  if (!v) return false;
  const nx = actor.tx + v.x;
  const ny = actor.ty + v.y;

  // ── 뛰어오르기 (0.70.17) ───────────────────────────────
  //
  // 막혀 있어도 **올라설 수 있는 것**이면 뛰어오른다. 술통 위에 서고, 거기서
  // 다시 뛰어내린다 — 그래서 한 칸짜리 장애물은 '돌아가야 하는 벽' 이 아니라
  // '넘어가는 것' 이 된다.
  //
  // ⚠ 뛸 수 있는 것은 **사람뿐**이다(opts.climb). 몬스터까지 뛰면 술통 위에 갇히고,
  //   길찾기(pathStep)도 탁자 위로 길을 내서 쫓아오다 멈춘다.
  // ⚠ 대각선으로는 못 뛴다. 모서리 두 칸이 다 막혀 있어도 뛰어 넘게 되어,
  //   벽 모서리를 대각선으로 통과하는 구멍이 된다(아래 모서리 규칙과 같은 까닭).
  const jumping = isSolid(map, nx, ny)
    && !!opts.climb && !(v.x && v.y) && isClimbable(map, nx, ny);

  if (!jumping && isSolid(map, nx, ny)) return false;
  if (isOccupied(blockers, nx, ny, actor.uid)) return false;

  // ⚠ 대각선은 **모서리를 뚫지 않는다** (0.53).
  //   옆의 두 칸 중 하나라도 벽이면 못 간다. 안 막으면 벽 모서리를 스치듯
  //   지나가고, 두 벽 사이의 대각선 틈으로 빠져나가게 된다.
  //   막고 있는 것이 벽이 아니라 **몬스터**일 때는 지나갈 수 있게 둔다 —
  //   서 있는 놈 하나 때문에 대각선이 죽으면 답답하다.
  if (v.x && v.y
      && (isSolid(map, actor.tx + v.x, actor.ty) || isSolid(map, actor.tx, actor.ty + v.y))) {
    return false;
  }

  actor.fromTx = actor.tx;
  actor.fromTy = actor.ty;
  actor.tx = nx;
  actor.ty = ny;
  actor.moving = true;
  actor.stepT = 0;
  // 대각선은 √2 배 멀다 — 그만큼 오래 걸려야 빠르기가 같다.
  // 뛰어오르는 걸음은 한 걸음보다 **느리다**. 같은 빠르기로 넘으면 뛴 것이 아니라
  // 벽을 스쳐 지나간 것으로 보인다. 몸이 떴다 내려앉을 참이 있어야 한다.
  actor.stepSpan = (v.x && v.y ? Math.SQRT2 : 1) * (jumping ? JUMP_SLOW : 1);
  actor.jumping = jumping;
  return true;
}

/** 뛰어오르는 걸음이 한 걸음보다 몇 배 오래 걸리나. */
export const JUMP_SLOW = 1.7;

/** 이동 보간을 진행한다. 도착하면 moving=false. */
export function advance(actor, dt) {
  actor.bobT += dt;
  // 걷는 그림의 박자 시계 (0.70.19).
  //
  // ⚠ **한 칸 안(stepT)으로 세면 안 된다.** stepT 는 칸마다 0 으로 되돌아가므로
  //   그걸로 박자를 만들면 애니메이션이 **한 칸에 한 바퀴**로 묶인다. 한 칸이 170ms 라
  //   네 박자가 42ms 마다 넘어가서, 다리가 파르르 떨리는 것처럼 보였다.
  //   칸을 넘어서도 이어지는 시계가 따로 있어야 걸음을 느리게 할 수 있다.
  if (actor.moving) actor.walkT = (actor.walkT || 0) + dt;
  if (actor.moving) {
    const dur = stepDuration(actor);
    actor.stepT += dt;
    if (actor.stepT >= dur) {
      actor.stepT = dur;
      actor.moving = false;
      actor.jumping = false; // 내려앉았다
      actor.fromTx = actor.tx;
      actor.fromTy = actor.ty;
    }
  }
  syncPixel(actor);
  return actor;
}

/** 플레이어: 방향키가 눌려 있으면 계속 걷는다. */
export function updatePlayer(player, dt, map, heldDir, blockers) {
  advance(player, dt);
  if (!player.moving && heldDir) {
    // 사람만 뛰어오른다 — 몬스터는 술통 위로 못 올라간다(updateMonster 는 안 넘긴다).
    tryStep(player, heldDir, map, blockers, { climb: true });
    advance(player, 0);
  }
  player.walking = player.moving;
  return player;
}

/**
 * 마을 사람: 제 자리 둘레를 어슬렁거린다 (0.70.18).
 *
 * ── 왜 아무나 걷게 두지 않는가 ──────────────────────────────
 * 상인·대장장이·여관 주인은 **자리를 지켜야 한다.** 가게를 여는 사람이 마을을
 * 돌아다니면 사람이 가게를 찾아 헤매게 된다. 그래서 돌아다니는 것은 표에
 * `"wander": <칸수>` 가 적힌 사람뿐이다 — 지금은 촌장과 아이 둘이다.
 *
 * ⚠ 집 자리(homeX/homeY)에서 그 칸수 밖으로는 안 나간다. 멀리 가면 말 걸러 온
 *   사람이 못 찾는다. 처음 선 자리가 곧 집이다.
 * ⚠ 몬스터와 달리 **뛰어오르지 않는다**(climb 를 안 넘긴다). 마을 사람이 술통 위에
 *   올라가 있으면 그것대로 우스꽝스럽고, 내려오지 못할 수도 있다.
 */
export function updateNpc(npc, dt, map, rng, blockers) {
  advance(npc, dt);
  if (!npc.wander || npc.moving) return npc;

  npc.thinkTimer -= dt;
  if (npc.thinkTimer > 0) return npc;
  // 다음에 움직일 때까지 한참 쉰다 — 쉬지 않고 걸으면 마을이 어수선해진다.
  npc.thinkTimer = 1800 + rng() * 3200;

  const dirs = ['up', 'down', 'left', 'right'];
  const dir = dirs[Math.floor(rng() * dirs.length) % dirs.length];
  const v = DIR_VECTORS[dir];
  if (!v) return npc;
  const nx = npc.tx + v.x;
  const ny = npc.ty + v.y;
  const home = { x: npc.homeX ?? npc.tx, y: npc.homeY ?? npc.ty };
  if (Math.abs(nx - home.x) + Math.abs(ny - home.y) > npc.wander) return npc;

  tryStep(npc, dir, map, blockers);
  return npc;
}

/**
 * 몬스터 AI.
 * moveStyle 'wander' = 랜덤 배회, 'chase' = 일정 거리 안이면 플레이어 추적.
 *
 * ── 발각 ──────────────────────────────────────────────────
 * map.aggro 가 켜져 있으면(지하감옥), 그 거리 안에 들어온 플레이어를 알아채고
 * 달려든다. 한 번 알아채면 한참 멀어질 때까지 쫓는다 — 한 걸음 물러섰다고
 * 바로 관심을 끄면 "들켰다"는 긴장이 생기지 않는다.
 * 쫓는 동안은 생각하는 간격도 짧아져서 눈에 띄게 빨라진다.
 */
export function updateMonster(monster, dt, map, rng, player, blockers, opts = {}) {
  advance(monster, dt);
  if (monster.moving) return monster;

  monster.thinkTimer -= dt;
  if (monster.thinkTimer > 0) return monster;

  const dist = Math.abs(monster.tx - player.tx) + Math.abs(monster.ty - player.ty);

  // 발각 판정 — 알아챈 순간을 화면에 알릴 수 있도록 alertedAt 을 남긴다.
  // 숨어 있으면(매직 투구) 먼저 알아채지 못한다. 이미 알아챈 놈은 그대로 쫓는다 —
  // 투구를 쓴 순간 쫓아오던 것들이 한꺼번에 멈추면 도망이 아니라 무적이 된다.
  const aggro = opts.hidden ? 0 : map.aggro || 0;
  if (aggro > 0) {
    if (!monster.alerted && dist <= aggro) {
      monster.alerted = true;
      monster.alertedAt = 0; // 느낌표를 띄우는 쪽(FieldScene)이 읽는다
    } else if (monster.alerted && dist > aggro * 2.5) {
      monster.alerted = false; // 충분히 따돌렸다
    }
  }

  const chasing = monster.alerted || (!opts.hidden && monster.moveStyle === 'chase' && dist <= 6);
  monster.thinkTimer = chasing
    ? Math.round(CONFIG.MONSTER_THINK_MIN_MS * 0.5)
    : rng.int(CONFIG.MONSTER_THINK_MIN_MS, CONFIG.MONSTER_THINK_MAX_MS);

  // 쫓을 때는 길을 찾아서 간다.
  //
  // 그냥 "플레이어 쪽으로 한 칸"이면 벽 하나에 걸려 제자리에서 위아래로 떨린다.
  // 방과 복도로 된 지하감옥에서는 그게 곧 "쫓아오지 않는다"와 같다.
  // 그래서 좁은 범위만 너비 우선으로 훑어 첫 걸음을 고른다.
  let dir = null;
  if (chasing) dir = pathStep(monster, player, map, blockers);
  if (!dir) dir = chasing ? directionToward(monster, player, rng) : rng.pick(['up', 'down', 'left', 'right']);

  if (!tryStep(monster, dir, map, blockers)) {
    tryStep(monster, rng.pick(['up', 'down', 'left', 'right']), map, blockers);
  }
  advance(monster, 0);
  return monster;
}

const STEPS = [
  { dir: 'up', x: 0, y: -1 },
  { dir: 'down', x: 0, y: 1 },
  { dir: 'left', x: -1, y: 0 },
  { dir: 'right', x: 1, y: 0 },
];

/**
 * 목표까지 가는 첫 걸음. 너비 우선으로 찾되 범위를 좁게 잘라 쓴다.
 *
 * 왜 범위를 자르나: 쫓는 놈이 여럿이고 매 200ms 마다 생각하므로, 맵 전체를
 * 훑으면 프레임이 흔들린다. 발각 거리 언저리만 보면 충분하다 —
 * 그 밖으로 나간 상대는 어차피 놓친 것이다.
 *
 * @returns {string|null} 'up'|'down'|'left'|'right', 길이 없으면 null
 */
export function pathStep(from, to, map, blockers, span = 9) {
  if (from.tx === to.tx && from.ty === to.ty) return null;

  const minX = Math.max(0, Math.min(from.tx, to.tx) - span);
  const maxX = Math.min(map.w - 1, Math.max(from.tx, to.tx) + span);
  const minY = Math.max(0, Math.min(from.ty, to.ty) - span);
  const maxY = Math.min(map.h - 1, Math.max(from.ty, to.ty) + span);
  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  if (W * H > 900) return null; // 너무 넓으면 포기하고 단순 추적으로

  const idx = (x, y) => (y - minY) * W + (x - minX);
  const first = new Int8Array(W * H).fill(-1); // 그 칸에 닿은 "첫 걸음"의 번호
  const queue = [[from.tx, from.ty]];
  first[idx(from.tx, from.ty)] = 4; // 출발점 표시(4 = 아직 걸음 없음)

  for (let head = 0; head < queue.length; head++) {
    const [cx, cy] = queue[head];
    const step0 = first[idx(cx, cy)];
    for (let s = 0; s < 4; s++) {
      const nx = cx + STEPS[s].x;
      const ny = cy + STEPS[s].y;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (first[idx(nx, ny)] !== -1) continue;
      // 목표 칸 자체는 막혀 있어도(사람이 서 있다) 도착으로 친다.
      if (nx === to.tx && ny === to.ty) return STEPS[step0 === 4 ? s : step0].dir;
      if (isSolid(map, nx, ny)) continue;
      if (isOccupied(blockers, nx, ny, from.uid)) continue;
      first[idx(nx, ny)] = step0 === 4 ? s : step0;
      queue.push([nx, ny]);
    }
  }
  return null;
}

function directionToward(from, to, rng) {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  const horizontalFirst = Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && rng.chance(0.5));
  if (horizontalFirst && dx !== 0) return dx > 0 ? 'right' : 'left';
  if (dy !== 0) return dy > 0 ? 'down' : 'up';
  if (dx !== 0) return dx > 0 ? 'right' : 'left';
  return rng.pick(['up', 'down', 'left', 'right']);
}
