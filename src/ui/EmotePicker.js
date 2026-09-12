// 책임: 이모티콘 단추 하나와, 눌렀을 때 열리는 고르는 칸.
// 금지: 상태 수정 · 그물 전송. 고른 것을 bus 로 알리기만 한다(main.js 가 처리).
//
// 왜 넣나 (0.62):
//   같이 노는데 서로에게 건넬 말이 하나도 없었다. 채팅은 글자를 치는 일이라
//   손이 바쁘고(걸으면서는 못 친다), 욕설·도배를 막을 방법도 따로 있어야 한다.
//   이모티콘은 그 사이를 메운다 — 한 번 눌러 한 조각, 정해진 것 중에서만.
//
// 왜 말풍선인가:
//   머리 위 이름표 옆에 조그맣게 붙이면 누가 보냈는지 흐릿하다.
//   말풍선은 "저 사람이 말했다" 를 그림 하나로 말한다 — 꼬리가 그 사람을 가리킨다.

/**
 * 고를 수 있는 것들.
 *
 * 열두 개로 묶었다. 더 늘리면 고르는 데 시간이 걸려서 "한 번 눌러 한 조각" 이
 * 아니게 된다. 뜻이 겹치지 않게, 그리고 **나쁜 뜻으로 쓰기 어려운 것**으로만 골랐다
 * (손가락질·화난 얼굴 같은 것은 안 넣는다 — 서로 처음 보는 사람들이다).
 */
export const EMOTES = [
  '👋', '👍', '❤️', '😀',
  '😮', '😢', '🙏', '🎉',
  '⚔️', '🛡️', '💰', '❓',
];

export class EmotePicker {
  /**
   * @param {object} o
   * @param {import('../core/EventBus.js').EventBus} o.bus
   * @param {HTMLElement} o.root #emote-picker
   */
  constructor({ bus, root }) {
    this.bus = bus;
    this.root = root;
    this.open = false;
    if (!this.root) return;
    this.render();

    // 판 아무 데나 누르면 닫는다. 고르는 칸만 열어 두고 다른 일을 하러 가는 일이 잦다.
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      if (this.root.contains(e.target)) return;
      this.setOpen(false);
    });
    // Esc 로도 닫힌다.
    document.addEventListener('keydown', (e) => {
      if (this.open && e.key === 'Escape') this.setOpen(false);
    });
  }

  render() {
    this.root.innerHTML = `
      <div class="emote-pop" data-pop hidden>
        ${EMOTES.map(
          (e) => `<button type="button" class="emote-btn" data-emote="${e}"
                    aria-label="이모티콘 ${e}">${e}</button>`
        ).join('')}
      </div>
      <button type="button" class="emote-open" data-open
              aria-label="이모티콘" aria-expanded="false" title="이모티콘 (하나 골라 말풍선으로 띄운다)">🙂</button>`;

    this.pop = this.root.querySelector('[data-pop]');
    this.openBtn = this.root.querySelector('[data-open]');

    this.openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setOpen(!this.open);
    });

    for (const btn of this.root.querySelectorAll('[data-emote]')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.bus.emit('ui:emote', { icon: btn.dataset.emote });
        this.setOpen(false);
      });
    }
  }

  setOpen(on) {
    this.open = !!on;
    if (this.pop) this.pop.hidden = !this.open;
    if (this.openBtn) this.openBtn.setAttribute('aria-expanded', String(this.open));
    if (this.root) this.root.classList.toggle('is-open', this.open);
  }
}
