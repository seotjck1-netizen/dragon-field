// 책임: 플레이어와 몬스터의 접촉을 감지해 'battle:request' 이벤트를 발행한다.
// 금지: 전투 계산. 여기서는 "누구와 누가 부딪혔다"까지만 안다.
// 금지: DOM/캔버스 접근.

import { CONFIG } from '../config.js';
import { pixelDistance } from '../entities/Actor.js';
import { isSolid } from './MovementSystem.js';

export class EncounterSystem {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    // 게임을 켜자마자 전투에 끌려가지 않도록 짧은 유예를 준다.
    this.cooldown = CONFIG.ENCOUNTER_COOLDOWN_MS * 2;
  }

  /** 전투 직후 다시 곧바로 붙잡히는 것을 막는다. */
  startCooldown(ms = CONFIG.ENCOUNTER_COOLDOWN_MS) {
    this.cooldown = ms;
  }

  /**
   * @param {object} [map] 지금 땅 — 사거리 공격의 길(시야)을 볼 때 쓴다
   * @param {number} [rangeTiles] 내 무기 사거리(칸). 1 이면 예전처럼 맞닿아야 붙는다
   */
  update(dt, player, monsters, map = null, rangeTiles = 1) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    const hit = findEncounter(player, monsters, CONFIG.ENCOUNTER_RADIUS, map, rangeTiles);
    if (hit) {
      this.startCooldown();
      this.bus.emit('battle:request', { monsterUid: hit.uid });
    }
    return hit;
  }
}

/**
 * 순수 함수: 붙을 상대 — 맞닿았거나(반경 안), 사거리 안이면서 길이 트인 살아 있는 몬스터 중 가장 가까운 것.
 *
 * 0.80.20 — 사거리(검 1 · 지팡이 3 · 활 4칸). 원거리는 몬스터가 다가오기 전에 먼저 친다.
 * 사이에 벽 · 나무 같은 막힌 칸이 있으면 못 친다(화살이 벽을 뚫지 않는다).
 */
export function findEncounter(player, monsters, radius, map = null, rangeTiles = 1) {
  let best = null;
  let bestDist = Infinity;
  for (const m of monsters) {
    if (!m.alive) continue;
    const d = pixelDistance(player, m);
    const touching = d <= radius;
    const reach = !touching && rangeTiles > 1 && map
      && tileDist(player, m) <= rangeTiles && lineOfSight(map, player.tx, player.ty, m.tx, m.ty);
    if ((touching || reach) && d < bestDist) {
      best = m;
      bestDist = d;
    }
  }
  return best;
}

/** 칸 사이 거리(곧은 선). */
export function tileDist(a, b) {
  return Math.hypot(a.tx - b.tx, a.ty - b.ty);
}

/** 두 칸 사이가 트였나 — 양 끝을 뺀 사이 칸에 막힌 칸이 없으면 참. */
export function lineOfSight(map, x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, x = x0, y = y0;
  for (let guard = 0; guard < 64; guard++) {
    if (x === x1 && y === y1) return true;
    if (!(x === x0 && y === y0) && isSolid(map, x, y)) return false;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
  return true;
}
