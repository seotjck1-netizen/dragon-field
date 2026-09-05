// 책임: 설정 창 표시와 조작. 값은 이벤트로만 알리고 직접 바꾸지 않는다.
// 금지: 게임 상태 수정, 설정 기본값 정의(systems/SettingsSystem.js 의 표를 그대로 읽는다).

import { grouped } from '../systems/SettingsSystem.js';

export class SettingsPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.open = false;

    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('settings:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('settings:closed');
  }

  render() {
    const s = this.store.state.settings || {};

    this.root.innerHTML = `
      <div class="char-panel settings-panel">
        <header class="inv-header">
          <h2>설정</h2>
          <button class="inv-close" data-close>✕</button>
        </header>
        <div class="char-body">
          ${grouped()
            .map(
              ([group, rows]) => `
            <section class="set-group">
              <h3 class="slot-group-title">${group}</h3>
              ${rows.map((def) => this._rowHtml(def, s[def.key])).join('')}
            </section>`
            )
            .join('')}
          <section class="set-group">
            <h3 class="slot-group-title">세이브 옮기기</h3>
            <p class="set-desc set-hint">
              계정은 이 기기 안에만 저장됩니다. 다른 컴퓨터·폰으로 옮기려면
              아래 글자를 통째로 복사해서 그쪽 게임의 "붙여넣기" 칸에 넣으세요.
            </p>
            <div class="save-move">
              <textarea class="save-box" data-savebox readonly
                placeholder="내보내기를 누르면 여기에 나옵니다"></textarea>
              <div class="save-btns">
                <button class="mini-btn" data-export>내보내기</button>
                <button class="mini-btn" data-copy>복사</button>
                <button class="mini-btn" data-import>붙여넣기로 불러오기</button>
              </div>
              <p class="set-desc" data-savemsg></p>
            </div>
          </section>

          <section class="set-group">
            <h3 class="slot-group-title">그만하기</h3>
            <p class="set-desc set-hint">
              둘 다 <b>먼저 저장한 뒤에</b> 나갑니다. 접속 화면으로 가면 다른 아이디로 바꿔
              접속할 수 있고, 종료는 창을 닫습니다(브라우저가 막으면 접속 화면으로 갑니다).
            </p>
            <div class="save-btns">
              <button class="mini-btn" data-logout>접속 화면으로</button>
              <button class="mini-btn mini-btn--warn" data-quit>종료</button>
            </div>
          </section>

          <p class="char-note muted">설정은 이 브라우저에 저장됩니다.</p>
          <div class="reset-bar">
            <span>모든 설정을 기본값으로</span>
            <button class="mini-btn" data-defaults>기본값 복원</button>
          </div>
        </div>
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    this.root
      .querySelector('[data-defaults]')
      .addEventListener('click', () => this.bus.emit('ui:settings-defaults'));

    this.root
      .querySelector('[data-logout]')
      .addEventListener('click', () => this.bus.emit('ui:logout'));
    this.root
      .querySelector('[data-quit]')
      .addEventListener('click', () => this.bus.emit('ui:quit'));

    this._wireSaveMove();

    for (const el of this.root.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      if (el.type === 'range') {
        el.addEventListener('input', () =>
          this.bus.emit('ui:setting', { key, value: Number(el.value) })
        );
      } else if (el.dataset.value != null) {
        el.addEventListener('click', () =>
          this.bus.emit('ui:setting', { key, value: el.dataset.value })
        );
      } else {
        el.addEventListener('click', () =>
          this.bus.emit('ui:setting', { key, value: el.getAttribute('aria-checked') !== 'true' })
        );
      }
    }
  }

  /** 세이브 내보내기·불러오기. 실제 처리는 main.js 가 한다. */
  _wireSaveMove() {
    const box = this.root.querySelector('[data-savebox]');
    const msg = this.root.querySelector('[data-savemsg]');
    if (!box) return;

    const say = (text, bad = false) => {
      msg.textContent = text;
      msg.className = `set-desc ${bad ? 'is-bad' : 'is-good'}`;
    };

    this.root.querySelector('[data-export]').addEventListener('click', () => {
      this.bus.emit('ui:save-export', {
        done: (code) => {
          box.readOnly = true;
          box.value = code;
          box.select();
          say(`${code.length}자 — 전부 복사해서 다른 기기에 붙여 넣으세요.`);
        },
      });
    });

    this.root.querySelector('[data-copy]').addEventListener('click', async () => {
      if (!box.value) return say('먼저 내보내기를 누르세요.', true);
      try {
        // 사파리는 클립보드 권한이 까다로워 실패할 수 있다 — 그때는 직접 복사하게 안내한다.
        await navigator.clipboard.writeText(box.value);
        say('복사했습니다.');
      } catch {
        box.select();
        say('길게 눌러 "복사"를 골라 주세요.', true);
      }
    });

    this.root.querySelector('[data-import]').addEventListener('click', () => {
      if (box.readOnly) {
        box.readOnly = false;
        box.value = '';
        box.placeholder = '다른 기기에서 복사한 글자를 여기에 붙여 넣고 다시 누르세요';
        box.focus();
        return say('붙여 넣은 뒤 이 버튼을 한 번 더 누르세요.');
      }
      const code = box.value.trim();
      if (!code) return say('붙여 넣은 내용이 없습니다.', true);
      this.bus.emit('ui:save-import', {
        code,
        done: (ok, text) => say(text, !ok),
      });
    });
  }

  _rowHtml(def, value) {
    let control;
    if (def.type === 'range') {
      control = `<input class="set-range" type="range" data-key="${def.key}"
             min="${def.min}" max="${def.max}" step="${def.step}" value="${value}">
           <b class="set-value">${value}${def.unit ?? '%'}</b>`;
    } else if (def.type === 'choice') {
      control = `<div class="set-choice">${def.options
        .map(
          (o) => `<button data-key="${def.key}" data-value="${o.value}"
                    class="${o.value === value ? 'is-on' : ''}">${o.label}</button>`
        )
        .join('')}</div>`;
    } else {
      control = `<button class="set-switch" data-key="${def.key}" role="switch"
             aria-checked="${value ? 'true' : 'false'}">
             <span class="set-knob"></span>
           </button>`;
    }

    return `
      <div class="set-row">
        <div class="set-text">
          <span class="set-label">${def.label}</span>
          <span class="set-desc">${def.desc}</span>
        </div>
        <div class="set-control">${control}</div>
      </div>`;
  }
}
