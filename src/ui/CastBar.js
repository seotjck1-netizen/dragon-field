// 책임: 시전(캐스팅) 진행 바를 보여 준다. 진행·취소 판단은 하지 않는다.
// 금지: 게임 상태 접근. main.js 가 show/setProgress/hide 를 불러 준다.

export class CastBar {
  constructor({ bus, root }) {
    this.bus = bus;
    this.root = root;
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="cast-card">
        <div class="cast-top">
          <span class="cast-label" data-label></span>
          <button class="cast-cancel" data-cancel title="취소 (Esc)">✕</button>
        </div>
        <div class="bar bar--cast"><i data-fill></i><span data-time></span></div>
        <p class="cast-hint">움직이면 취소됩니다</p>
      </div>`;
    this.el = {
      label: this.root.querySelector('[data-label]'),
      fill: this.root.querySelector('[data-fill]'),
      time: this.root.querySelector('[data-time]'),
    };
    this.root
      .querySelector('[data-cancel]')
      .addEventListener('click', () => this.bus.emit('ui:cast-cancel'));
  }

  show(label, ms) {
    this.totalMs = ms;
    this.el.label.textContent = label;
    this.root.hidden = false;
    this.setProgress(0);
  }

  setProgress(ratio) {
    const r = Math.min(1, Math.max(0, ratio));
    this.el.fill.style.width = `${r * 100}%`;
    const left = Math.max(0, this.totalMs * (1 - r));
    this.el.time.textContent = `${(left / 1000).toFixed(1)}초`;
  }

  hide() {
    this.root.hidden = true;
  }
}
