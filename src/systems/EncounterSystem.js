// 책임: 플레이어와 몬스터의 접촉을 감지해 'battle:request' 이벤트를 발행한다.
// 금지: 전투 계산. 여기서는 "누구와 누가 부딪혔다"까지만 안다.
// 금지: DOM/캔버스 접근.

import { CONFIG } from '../config.js';
import { pixelDistance } from '../entities/Actor.js';

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
    const hit = findEncounter(player, monsters, CONFIG.ENCOUNTER_RADIUS);
    if (hit) {
      this.startCooldown();
      this.bus.emit('battle:request', { monsterUid: hit.uid });
    }
    return hit;
  }
}

/** 순수 함수: 반경 안에 들어온 살아 있는 몬스터 중 가장 가까운 것. */
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
