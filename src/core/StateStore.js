// 책임: 게임 상태 객체 하나를 보관하고, 변경 시 구독자에게 알린다.
// 금지: 상태의 "의미"를 해석하는 로직(레벨업 판정 등) → systems/ 담당.
// 금지: DOM 접근.

export class StateStore {
  constructor(initialState = {}) {
    this._state = initialState;
    this._subs = new Set();
    this._dirty = false;
  }

  /** 읽기 전용으로 취급할 것. 직접 수정하려면 mutate()를 쓴다. */
  get state() {
    return this._state;
  }

  /**
   * 상태를 직접 변형한다. 콜백 안에서 마음대로 수정하고,
   * 끝나면 자동으로 구독자에게 알린다.
   */
  mutate(fn) {
    const result = fn(this._state);
    this.notify();
    return result;
  }

  /** 여러 번 변경한 뒤 한 번만 알리고 싶을 때. */
  markDirty() {
    this._dirty = true;
  }

  flush() {
    if (this._dirty) {
      this._dirty = false;
      this.notify();
    }
  }

  notify() {
    for (const sub of Array.from(this._subs)) {
      try {
        sub(this._state);
      } catch (err) {
        console.error('[StateStore] 구독자 오류:', err);
      }
    }
  }

  subscribe(fn) {
    this._subs.add(fn);
    return () => this._subs.delete(fn);
  }
}
