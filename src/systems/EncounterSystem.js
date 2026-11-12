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

  update(dt, player, monsters) {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    // 0.80.21 — 싸움은 **닿아야** 열린다(와우식). 사거리 안에 들었다고 먼저 치지 않는다 —
    //   선공 몬스터가 보고 쫓아와 닿거나, 내가 다가가 닿을 때. 사거리는 싸우는 동안(벗어나면 멈춤)에만 쓴다.
    const hit = findEncounter(player, monsters, CONFIG.ENCOUNTER_RADIUS);
    if (hit) {
      this.startCooldown();
      this.bus.emit('battle:request', { monsterUid: hit.uid });
    }
    return hit;
  }
}

/**
 * 순수 함수: 맞닿은(반경 안) 살아 있는 몬스터 중 가장 가까운 것.
 *
 * 0.80.20 에는 무기 사거리(활 4칸) 안이면 먼저 쳤다. 0.80.21 에 사용자 말대로 되돌렸다 —
 * 몹 근처를 지나기만 해도 싸움이 열려 성가셨다. 이제는 몹이 보고 쫓아와 **닿아야** 열린다(와우식).
 * lineOfSight · tileDist 는 싸우는 동안의 거리 재기에 남겨 둔다.
 */
export function findEncounter(player, monsters, radius) {
  let best = null;
  let bestDist = Infinity;
  for (const m of monsters) {
    if (!m.alive) continue;
    const d = pixelDistance(player, m);
    if (d <= radius && d < bestDist) {
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
