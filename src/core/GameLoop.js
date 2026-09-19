// 책임: requestAnimationFrame 기반 고정 타임스텝 루프. update(dt)와 render()를 호출한다.
// 금지: 게임 로직. 무엇을 업데이트할지는 전혀 모른다.
// 금지: 캔버스 직접 조작.

import { CONFIG } from '../config.js';

export class GameLoop {
  constructor({ update, render }) {
    this._update = update;
    this._render = render;
    this._rafId = null;
    this._last = 0;
    this._acc = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    this._acc = 0;
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  _tick(now) {
    if (!this.running) return;
    let frameMs = now - this._last;
    this._last = now;
    if (frameMs > CONFIG.MAX_FRAME_MS) frameMs = CONFIG.MAX_FRAME_MS;

    this._acc += frameMs;
    let guard = 0;
    while (this._acc >= CONFIG.FIXED_DT && guard < 8) {
      this._update(CONFIG.FIXED_DT);
      this._acc -= CONFIG.FIXED_DT;
      guard++;
    }
    this._render();
    this._rafId = requestAnimationFrame(this._tick);
  }
}
