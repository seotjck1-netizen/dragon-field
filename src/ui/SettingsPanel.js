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

  /**
   * 처음부터 다시 도전 (0.68).
   *
   * **되돌릴 수 없는 일이다.** 그래서 한 번에 누를 수 없게 두 걸음으로 나눈다.
   *   ① '다시 도전 준비' 를 눌러야 아래가 열린다
   *   ② 직업을 고르고, 캐릭터 이름을 그대로 적어야 마지막 단추가 살아난다
   *
   * 이름을 적게 하는 이유: '정말요?' 창은 사람이 읽지 않고 누른다. 지울 대상의
   * 이름을 손으로 적는 동안에는 **무엇을 지우는지** 눈에 들어온다.
   * (운영자 창의 계정 지우기도 같은 방법을 쓴다)
   */
  _restartHtml() {
    const st = this.store.state;
    const name = (st.player && st.player.name) || '';
    if (!this.restartOpen) {
      return `
        <section class="set-group">
          <h3 class="slot-group-title">처음부터 다시 도전</h3>
          <p class="set-desc set-hint">
            랭킹은 <b>계정이 태어난 순간부터</b> 보스를 눕힐 때까지를 잽니다.
            한 번 느리게 끝내면 그 계정으로는 더 나은 기록을 낼 수 없습니다.
            여기서 <b>계정은 그대로 두고 캐릭터만</b> 새로 만든 것과 똑같이 되돌립니다 —
            <b>시계도 0초부터</b> 다시 갑니다.
          </p>
          <div class="save-btns">
            <button class="mini-btn mini-btn--warn" data-restart-open>다시 도전 준비</button>
          </div>
        </section>`;
    }
    return `
      <section class="set-group set-group--danger">
        <h3 class="slot-group-title">처음부터 다시 도전</h3>
        <p class="set-desc">
          <b>없어지는 것</b> — 레벨·경험치·골드·소지품·장비·퀘스트·웨이포인트,
          그리고 <b>우편함에 쌓아 둔 것 전부</b>.
        </p>
        <p class="set-desc">
          <b>남는 것</b> — 아이디·비밀번호·캐릭터 이름, 그리고
          <b>이미 랭킹에 올라간 기록</b>(이번 도전이 더 빠르면 그때 갈아 끼웁니다).
        </p>
        <p class="set-desc set-hint">
          되돌릴 수 없습니다. 새로 시작할 직업을 고르고, 아래에
          <b>${escapeHtml(name)}</b> 라고 그대로 적으세요.
        </p>
        <div class="class-row class-row--restart">${this._restartClasses()}</div>
        <div class="save-btns restart-confirm">
          <input class="restart-name" data-restart-name placeholder="${escapeAttr(name)}"
                 autocomplete="off" maxlength="12" />
          <button class="mini-btn" data-restart-cancel>그만두기</button>
          <button class="mini-btn mini-btn--warn" data-restart-go disabled>지우고 다시 시작</button>
        </div>
        <p class="set-desc" data-restart-msg></p>
      </section>`;
  }

  _restartClasses() {
    const st = this.store.state;
    const list = (st.db && st.db.classes && st.db.classes.list) || {};
    const now = this.restartClass || (st.player && st.player.classId);
    return Object.entries(list)
      .map(([id, def]) => {
        const on = id === now ? 'is-on' : '';
        const off = def.available ? '' : 'disabled';
        return `<button type="button" data-restart-class="${id}" class="${on}" ${off}>
                  <b>${escapeHtml(def.name)}</b>
                  <span class="class-tagline">${escapeHtml(def.tagline || '')}</span>
                </button>`;
      })
      .join('');
  }

  _wireRestart() {
    const openBtn = this.root.querySelector('[data-restart-open]');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        this.restartOpen = true;
        this.restartClass = (this.store.state.player || {}).classId || null;
        this.render();
      });
      return;
    }
    const cancel = this.root.querySelector('[data-restart-cancel]');
    if (cancel) {
      cancel.addEventListener('click', () => {
        this.restartOpen = false;
        this.render();
      });
    }
    for (const b of this.root.querySelectorAll('[data-restart-class]')) {
      b.addEventListener('click', () => {
        this.restartClass = b.dataset.restartClass;
        // 적어 둔 이름은 지우지 않는다 — 직업을 바꿨다고 다시 적게 하면 짜증만 난다.
        const typed = this.root.querySelector('[data-restart-name]');
        const keep = typed ? typed.value : '';
        this.render();
        const again = this.root.querySelector('[data-restart-name]');
        if (again) { again.value = keep; again.dispatchEvent(new Event('input')); }
      });
    }
    const input = this.root.querySelector('[data-restart-name]');
    const go = this.root.querySelector('[data-restart-go]');
    if (input && go) {
      const want = ((this.store.state.player || {}).name || '').trim();
      const check = () => { go.disabled = input.value.trim() !== want; };
      input.addEventListener('input', check);
      check();
      go.addEventListener('click', () => {
        if (go.disabled) return;
        go.disabled = true;
        const msg = this.root.querySelector('[data-restart-msg]');
        if (msg) msg.textContent = '되돌리는 중…';
        this.bus.emit('ui:restart', { classId: this.restartClass });
      });
    }
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

          ${this._restartHtml()}

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

    this._wireRestart();

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

// 글자를 그대로 화면에 넣기 위한 것 — 캐릭터 이름에 꺾쇠가 들어 있어도
// 글자로만 보이게 한다(이름은 사람이 지은 값이다).
function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const escapeAttr = escapeHtml;
