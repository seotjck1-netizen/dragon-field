// 책임: 드래곤퀘스트식 말풍선/대사창 표시. 타자기 효과와 다음 표시(▼)만 담당한다.
// 금지: 대사 진행 판단 → systems/DialogueSystem.js 가 한다. 여기선 화면에 그리고 클릭을 알린다.
// 금지: 게임 상태 수정.

const TYPE_SPEED_MS = 18;

export class DialogueBox {
  constructor({ bus, root, assets }) {
    this.bus = bus;
    this.root = root;
    this.assets = assets;
    this._typing = null;
    this._full = '';
    this._build();

    bus.on('dialogue:line', (line) => this.show(line));
    bus.on('dialogue:closed', () => this.hide());
  }

  _build() {
    this.root.innerHTML = `
      <div class="dlg-wrap">
        <div class="dlg-portrait" data-portrait hidden></div>
        <div class="dlg-box" data-box>
          <div class="dlg-name" data-name></div>
          <p class="dlg-text" data-text></p>
          <div class="dlg-foot">
            <button class="dlg-action" data-action hidden></button>
            <button class="dlg-action dlg-action-alt" data-action2 hidden></button>
            <span class="dlg-next" data-next>▼</span>
          </div>
        </div>
      </div>`;
    this.el = {
      portrait: this.root.querySelector('[data-portrait]'),
      box: this.root.querySelector('[data-box]'),
      name: this.root.querySelector('[data-name]'),
      text: this.root.querySelector('[data-text]'),
      action: this.root.querySelector('[data-action]'),
      // 두 가지 일을 하는 사람도 있다(마녀 — 징표 교환과 초월 강화).
      // 하나로 합치면 어느 쪽을 하러 왔는지 매번 헤매게 된다.
      action2: this.root.querySelector('[data-action2]'),
      next: this.root.querySelector('[data-next]'),
    };
    this.root.hidden = true;

    // 대사창 아무 데나 누르면 다음 줄로.
    this.el.box.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]') || e.target.closest('[data-action2]')) return;
      this.advanceOrFinishTyping();
    });
    this.el.action.addEventListener('click', () => this.bus.emit('dialogue:action'));
    this.el.action2.addEventListener('click', () => this.bus.emit('dialogue:action', { alt: true }));
  }

  show({ speaker, text, portrait, action, action2, quick }) {
    this.quick = !!quick;
    this.root.hidden = false;
    this.el.name.textContent = speaker || '';
    this.el.name.hidden = !speaker;

    if (portrait) {
      const asset = this.assets.get(portrait);
      this.el.portrait.hidden = false;
      this.el.portrait.innerHTML = '';
      if (asset && asset.ok) {
        const img = document.createElement('img');
        img.src = asset.image.src;
        img.alt = '';
        this.el.portrait.appendChild(img);
      }
    } else {
      this.el.portrait.hidden = true;
    }

    if (action) {
      this.el.action.hidden = false;
      this.el.action.textContent = action.label;
    } else {
      this.el.action.hidden = true;
    }
    if (action2) {
      this.el.action2.hidden = false;
      this.el.action2.textContent = action2.label;
    } else {
      this.el.action2.hidden = true;
    }
    this.el.next.title = this.quick ? '한 번 더 누르면 바로 넘어갑니다' : '';

    this._startTyping(text || '');
  }

  _startTyping(text) {
    clearInterval(this._typing);
    this._full = text;
    this.el.text.textContent = '';
    this.el.next.classList.remove('is-ready');
    let i = 0;
    this._typing = setInterval(() => {
      i++;
      this.el.text.textContent = this._full.slice(0, i);
      if (i >= this._full.length) {
        clearInterval(this._typing);
        this._typing = null;
        this.el.next.classList.add('is-ready');
      }
    }, TYPE_SPEED_MS);
  }

  /**
   * 타자 중이면 즉시 전체를 보여준다.
   * 이미 다 나왔으면 — 보통 NPC는 다음 줄로, 자주 쓰는 NPC(quick)는 대사를 통째로 건너뛴다.
   */
  advanceOrFinishTyping() {
    if (this._typing) {
      clearInterval(this._typing);
      this._typing = null;
      this.el.text.textContent = this._full;
      this.el.next.classList.add('is-ready');
      return;
    }
    this.bus.emit(this.quick ? 'dialogue:skip' : 'dialogue:advance');
  }

  hide() {
    clearInterval(this._typing);
    this._typing = null;
    this.root.hidden = true;
  }

  get open() {
    return !this.root.hidden;
  }
}
