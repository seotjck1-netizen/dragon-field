// 책임: 키보드 raw 이벤트를 추상 액션으로 변환한다.
// 금지: 게임 로직. "이동"이 무엇인지 모르고, 'up' 액션이 눌렸다는 사실만 안다.
// 액션: up / down / left / right / confirm / cancel / inventory / character / quest /
//       town / mail / rank / help / settings / skip

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
  KeyQ: 'quest',
  KeyT: 'town',
  KeyO: 'settings',
  F1: 'settings',
  Slash: 'help',
  // '?' 는 Shift+/ 다. 자판에 따라 code 가 다르므로 둘 다 받는다.
  NumpadDivide: 'help',
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
 *   KEY_MAP 에는 `1`·`2`·`3`·`4`(단축칸), `W`·`A`·`S`·`D`(이동),
 *   `I`·`C`·`M`·`R`·`Q`·`T`·`O`·`?`(창과 기능),
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
    this._onHide = this._onHide.bind(this);
  }

  // ── 눌린 채로 잊히는 것 막기 (0.70.22) ──────────────────────
  //
  // ── 무엇이 잘못됐나 ───────────────────────────────────────
  // 방향키를 **누른 채로** 오른쪽 마우스를 누르면(또는 휴대폰에서 다른 것을 만지면)
  // 그 방향으로 **계속 걸어갔다.** 손은 이미 뗐는데 게임은 모른다.
  //
  // 까닭은 하나다 — `keyup` 이 **안 온다.**
  //   · 오른쪽 마우스 → 브라우저 차림표가 열리며 키 이벤트를 가져간다.
  //     차림표가 닫힐 때 keyup 은 이미 지나갔고, 우리 쪽에는 keydown 만 남는다.
  //   · 탭을 바꾸거나 화면을 끄면 그 사이의 keyup 이 통째로 사라진다.
  //   · 휴대폰에서 손가락이 다른 것에 붙잡히면 touchend 가 안 온다.
  //
  // `blur` 하나로는 못 막는다. 차림표가 열려도 창은 **포커스를 잃지 않는다.**
  //
  // ── 어떻게 막나 ───────────────────────────────────────────
  // "눌렸다" 를 **확실히 아는 것**은 keydown 뿐이므로, 조금이라도 수상하면 전부 놓는다.
  // 잘못 놓아 봐야 한 걸음 멈추는 것이고, 안 놓으면 벽에 박혀 계속 걷는다.
  // 놓는 쪽이 언제나 덜 나쁘다.

  attach() {
    this.target.addEventListener('keydown', this._onKeyDown);
    this.target.addEventListener('keyup', this._onKeyUp);
    this.target.addEventListener('blur', this._onBlur);
    // 오른쪽 마우스 — 차림표가 키 이벤트를 가져간다.
    this.target.addEventListener('contextmenu', this._onHide);
    // 손가락이 붙잡히거나 취소됐다.
    this.target.addEventListener('pointercancel', this._onHide);
    this.target.addEventListener('touchcancel', this._onHide);
    // 창이 뒤로 가거나 화면이 꺼졌다 — 그동안의 keyup 은 사라진다.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._onHide);
    }
    this.target.addEventListener('pagehide', this._onHide);
  }

  detach() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
    this.target.removeEventListener('contextmenu', this._onHide);
    this.target.removeEventListener('pointercancel', this._onHide);
    this.target.removeEventListener('touchcancel', this._onHide);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onHide);
    }
    this.target.removeEventListener('pagehide', this._onHide);
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

  /**
   * 수상한 일이 생겼다 — 누르고 있던 것을 전부 놓는다.
   *
   * visibilitychange 는 **보이게 될 때도** 온다. 그때도 놓는 것이 맞다 —
   * 안 보이는 동안의 keyup 은 이미 사라졌으므로, 돌아온 순간의 held 는 거짓말이다.
   */
  _onHide() {
    this._clear();
  }

  _clear() {
    this.held.clear();
    this._dirOrder = [];
  }
}
