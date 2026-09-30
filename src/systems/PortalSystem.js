// 책임: 플레이어가 포탈 칸에 올라섰는지 판정하고 이동 요청을 발행한다.
//        통행 조건(레벨·보스·퀘스트)이 걸린 포탈은 막고 안내 문구를 알린다.
// 금지: 실제 맵 교체(오케스트레이터가 한다), DOM 접근, 다른 system import.
//
// ── 왜 gate 를 밖에서 받는가 ────────────────────────────────
// "그 보스를 잡았는가"는 웨이포인트가, "그 퀘스트를 마쳤는가"는 퀘스트가 안다.
// system 끼리는 서로 import 하지 않기로 했으므로, 판정 함수 하나를 오케스트레이터
// (main.js)가 만들어 넣어 준다. 이 파일은 그 답만 보고 문을 여닫는다.

export class PortalSystem {
  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {{gate?: (state:object, portal:object) => ({ok:boolean, reason?:string})}} [opts]
   */
  constructor(bus, opts = {}) {
    this.bus = bus;
    this.gate = opts.gate || null;
    this._lastKey = null;
  }

  /** 맵을 옮기면 초기화한다(도착 지점이 곧바로 재발동하지 않도록). */
  reset(player) {
    this._lastKey = player ? `${player.tx},${player.ty}` : null;
  }

  update(state) {
    const player = state.player;
    // 이동 중이라도 판정한다. tryStep 은 걸음을 "시작할 때" 목적지 타일을 tx/ty 에 넣으므로,
    // 계속 걸어가는 중에도 포탈 칸을 지나치지 않는다.
    const key = `${player.tx},${player.ty}`;
    if (key === this._lastKey) return null;
    this._lastKey = key;

    const portal = (state.map.portals || []).find((p) => p.x === player.tx && p.y === player.ty);
    if (!portal) return null;

    if (portal.requireLevel && player.level < portal.requireLevel) {
      this.bus.emit('portal:blocked', portal);
      return null;
    }

    // 보스·퀘스트 조건. 왜 막는가:
    // 예전에는 5단계 보스를 지나쳐 20단계까지 그냥 걸어갈 수 있었다. 그래서
    // 보스는 선택 사항이 되고, 단계마다 세지는 몬스터도 의미가 없었다.
    // 이제 한 구간의 보스를 잡고 그 퀘스트까지 마쳐야 다음 구간의 문이 열린다.
    if (this.gate) {
      const check = this.gate(state, portal);
      if (check && !check.ok) {
        this.bus.emit('portal:blocked', { ...portal, blockedText: check.reason });
        return null;
      }
    }

    this.bus.emit('map:travel', portal);
    return portal;
  }
}

/** 포탈 바로 앞 칸(안내 표시용). */
export function portalAt(map, x, y) {
  return (map.portals || []).find((p) => p.x === x && p.y === y) || null;
}
