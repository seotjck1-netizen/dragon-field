// 책임: 짧은 알림 메시지를 화면에 띄운다.
// 금지: 게임 상태 읽기/수정. 이벤트로 받은 문자열만 표시한다.

export class Toast {
  constructor({ bus, root }) {
    this.bus = bus;
    this.root = root;
    this.bus.on('toast', (payload) => this.show(payload));
  }

  /**
   * @param {{text:string, tone?:'info'|'good'|'bad'|'rare', ms?:number}|string} payload
   *   ms — 머무는 시간. 여러 줄짜리 알림(토벌 결과처럼)은 1.9초로는 다 못 읽는다.
   */
  show(payload) {
    const { text, tone = 'info', ms } = typeof payload === 'string' ? { text: payload } : payload;
    const el = document.createElement('div');
    el.className = `toast toast--${tone}`;
    el.textContent = text;
    this.root.appendChild(el);

    // 줄 수에 맞춰 조금 더 머문다 — 긴 알림이 읽기도 전에 사라지지 않게.
    const lines = String(text).split('\n').length;
    const stay = ms || Math.min(6000, 1900 + (lines - 1) * 700);

    requestAnimationFrame(() => el.classList.add('is-in'));
    setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 320);
    }, stay);

    // 너무 많이 쌓이면 오래된 것부터 지운다.
    while (this.root.children.length > 5) this.root.firstChild.remove();
  }
}
