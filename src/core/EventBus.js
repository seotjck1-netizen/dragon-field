// 책임: 모듈 간 유일한 통신 수단. 발행/구독만 제공한다.
// 금지: 게임 도메인 지식(몬스터, 아이템 등)을 아는 코드.
// 금지: DOM 접근.

export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  /** 구독. 해제 함수를 반환한다. */
  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  /** 1회성 구독. */
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off(type, handler) {
    const set = this._handlers.get(type);
    if (set) set.delete(handler);
  }

  /** 발행. 핸들러 하나가 던져도 나머지는 계속 실행된다. */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set || set.size === 0) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] "${type}" 핸들러 오류:`, err);
      }
    }
  }

  clear() {
    this._handlers.clear();
  }
}

// 앱 전역에서 쓰는 단일 인스턴스. main.js가 주입해서 쓰는 것을 권장하지만,
// 편의를 위해 기본 버스를 하나 제공한다.
export const bus = new EventBus();
