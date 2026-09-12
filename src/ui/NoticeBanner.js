// 책임: 모두가 함께 보는 **공지** 한 줄을 화면 위 가운데에 띄운다.
// 금지: 상태 수정 · 계산. 서버가 보내 준 글을 그대로 보여 주기만 한다.
//
// 왜 토스트가 아닌가 (0.61):
//   토스트는 **내게 일어난 일**을 알린다(아이템을 얻었다, 레벨이 올랐다).
//   오른쪽 아래에 여러 개가 쌓이고 짧게 사라진다.
//   공지는 **세상에 일어난 일**이다 — 누가 고룡을 눕혔다, 누가 1위에 올랐다.
//   그건 내 일이 아니라 모두의 일이라 자리도 무게도 달라야 한다.
//   그래서 화면 맨 위 가운데, 확성기와 함께, 한 번에 하나만, 10초 동안 띄운다.
//
// ⚠ 여기 오는 글은 **서버가 만든다.** 사람이 적어 넣는 글이 아니다.
//   그래도 이름·땅 이름이 섞이므로 textContent 로만 넣는다(innerHTML 금지) —
//   아이디에 꺾쇠가 들어 있어도 글자로만 보이게.

/** 한 줄이 머무는 시간(ms). */
const SHOW_MS = 10000;
/** 사라질 때 옅어지는 시간(ms). CSS 의 transition 과 맞춰 둔다. */
const FADE_MS = 420;

export class NoticeBanner {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root #notice-banner
   */
  constructor({ root }) {
    this.root = root;
    this.timer = null;
    this.fadeTimer = null;
    if (this.root) this.root.hidden = true;
  }

  /**
   * 공지 한 줄을 띄운다. 이미 떠 있으면 **새 것으로 갈아 끼운다** —
   * 줄줄이 쌓아 두면 정작 방금 일어난 일이 아래로 밀린다.
   *
   * @param {string} text 보여 줄 글(서버가 만든 것)
   * @param {string} [kind] 'dragon' | 'rank' — 빛깔만 달라진다
   */
  show(text, kind = '') {
    if (!this.root || !text) return;
    clearTimeout(this.timer);
    clearTimeout(this.fadeTimer);

    this.root.className = `notice-root${kind ? ` is-${kind}` : ''}`;
    this.root.hidden = false;
    this.root.innerHTML = '';

    const horn = document.createElement('span');
    horn.className = 'notice-horn';
    horn.textContent = '📢';
    horn.setAttribute('aria-hidden', 'true');

    const line = document.createElement('span');
    line.className = 'notice-text';
    line.textContent = String(text);

    this.root.appendChild(horn);
    this.root.appendChild(line);

    // 읽어 주는 기계에도 알린다 — 소리 없이 지나가는 소식이 되지 않게.
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');

    // 다시 뜰 때 들어오는 동작이 살아나도록 한 프레임 뒤에 켠다.
    requestAnimationFrame(() => this.root.classList.add('is-on'));

    this.timer = setTimeout(() => this.hide(), SHOW_MS);
  }

  hide() {
    if (!this.root) return;
    clearTimeout(this.timer);
    this.root.classList.remove('is-on');
    // 옅어지는 동안은 자리를 지킨다. 바로 감추면 뚝 끊겨 보인다.
    this.fadeTimer = setTimeout(() => {
      this.root.hidden = true;
      this.root.innerHTML = '';
    }, FADE_MS);
  }
}
