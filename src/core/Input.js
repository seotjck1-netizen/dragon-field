// 책임: 키보드 raw 이벤트를 추상 액션으로 변환한다.
// 금지: 게임 로직. "이동"이 무엇인지 모르고, 'up' 액션이 눌렸다는 사실만 안다.
// 액션: up / down / left / right / confirm / cancel / inventory / character / settings / skip

const KEY_MAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'cancel',
  KeyI: 'inventory',
  Tab: 'inventory',
  KeyC: 'character',
  KeyM: 'mail',
  KeyR: 'rank',
  KeyO: 'settings',
  F1: 'settings',
  ShiftLeft: 'skip',
  ShiftRight: 'skip',
  Digit1: 'quick1',
  Digit2: 'quick2',
  Digit3: 'quick3',
  Digit4: 'quick4',
  Numpad1: 'quick1',
  Numpad2: 'quick2',
  Numpad3: 'quick3',
  Numpad4: 'quick4',
};

const DIRECTIONS = ['up', 'down', 'left', 'right'];

/**
 * 지금 사람이 **글자를 치고 있는가.**
 *
 * ⚠ 이걸 안 보면 게임이 글자를 통째로 삼킨다 (0.53 에서 고침).
 *   KEY_MAP 에는 `1`·`2`·`3`·`4`(단축칸), `W`·`A`·`S`·`D`(이동), `I`·`C`·`M`·`R`·`O`(창),
 *   스페이스·엔터·Tab·Esc 가 들어 있다. 예전에는 이 키들을 **어디에 포커스가 있든**
 *   preventDefault 로 막아 버렸다. 그래서 운영자 창에 `1 시즌` 을 칠 수가 없었다 —
 *   `1` 도 스페이스도 게임이 먼저 집어 갔기 때문이다.
 *   글자를 치는 중에는 게임이 손을 뗀다.
 */
function isTyping(e) {
  const el = (e && (e.target || e.srcElement)) || null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return !!el.isContentEditable;
}

export class Input {
  /** @param {import('./EventBus.js').EventBus} bus */
  constructor(bus, target = window) {
    this.bus = bus;
    this.target = target;
    /** @type {Set<string>} 현재 눌려 있는 액션 */
    this.held = new Set();
    /** 방향키를 누른 순서. 마지막에 누른 방향이 우선한다. */
    this._dirOrder = [];
    this._enabled = true;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);
  }

  attach() {
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    this.target.addEventListener('blur', this._onBlur);
  }

  detach() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this._clear();
  }

  /** 현재 눌려 있는 방향 중 가장 최근 것. 없으면 null. */
  get direction() {
    for (let i = this._dirOrder.length - 1; i >= 0; i--) {
      if (this.held.has(this._dirOrder[i])) return this._dirOrder[i];
    }
    return null;
  }

  /** 그 축에서 지금 눌려 있는 것 중 **가장 최근** 것. */
  _axis(a, b) {
    for (let i = this._dirOrder.length - 1; i >= 0; i--) {
      const d = this._dirOrder[i];
      if ((d === a || d === b) && this.held.has(d)) return d;
    }
    return null;
  }

  /**
   * 실제로 걸어갈 방향 — **여덟 갈래** (0.53).
   *
   * 화살표를 둘 같이 누르면 대각선이 된다(`upleft` 처럼 세로+가로 순서로 잇는다).
   * 같은 축에서 둘이 눌려 있으면(위+아래) 나중에 누른 쪽을 따른다 —
   * 그래야 손가락을 굴릴 때 걸음이 끊기지 않는다.
   */
  get moveDir() {
    const v = this._axis('up', 'down');
    const h = this._axis('left', 'right');
    if (v && h) return v + h;
    return v || h || null;
  }

  isHeld(action) {
    return this.held.has(action);
  }

  _onKeyDown(e) {
    // 글자를 치는 중이면 게임은 아무것도 안 한다(막지도, 액션을 내지도 않는다).
    if (isTyping(e)) return;
    // 한글 조합 중(IME)에는 keydown 이 229 로 온다 — 그때도 손대지 않는다.
    if (e.isComposing || e.keyCode === 229) return;
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!this._enabled) return;
    if (e.repeat) return;

    this.held.add(action);
    if (DIRECTIONS.includes(action)) {
      this._dirOrder = this._dirOrder.filter((d) => d !== action);
      this._dirOrder.push(action);
    }
    this.bus.emit('input:action', action);
  }

  _onKeyUp(e) {
    if (isTyping(e)) return;
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.held.delete(action);
    this.bus.emit('input:release', action);
  }

  /**
   * 화면 버튼(터치 조작)이 부르는 창구.
   * 키보드와 똑같은 액션 흐름을 타므로 게임 쪽은 무엇으로 눌렀는지 몰라도 된다.
   */
  pressAction(action) {
    if (!this._enabled || !action) return;
    if (this.held.has(action)) return;
    this.held.add(action);
    if (DIRECTIONS.includes(action)) {
      this._dirOrder = this._dirOrder.filter((d) => d !== action);
      this._dirOrder.push(action);
    }
    this.bus.emit('input:action', action);
  }

  releaseAction(action) {
    if (!action) return;
    this.held.delete(action);
    this.bus.emit('input:release', action);
  }

  /** 방향 버튼에서 손을 뗐을 때처럼, 방향만 전부 놓는다. */
  releaseDirections() {
    for (const d of DIRECTIONS) this.held.delete(d);
    this._dirOrder = [];
  }

  /**
   * 누르고 있던 것을 전부 놓는다.
   *
   * 창이 열린 채로 키를 떼면 keyup 이 창으로 가서 여기 안 온다 —
   * 그러면 창을 닫은 뒤에도 "누르고 있는 중"으로 남아 엉뚱하게 걸어간다.
   * 막힌 데서 빠져나올 때(main.js 의 unstick) 함께 부른다.
   */
  releaseAll() {
    this._clear();
  }

  _onBlur() {
    this._clear();
  }

  _clear() {
    this.held.clear();
    this._dirOrder = [];
  }
}
