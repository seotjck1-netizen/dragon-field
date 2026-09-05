// 책임: 접속 화면(로그인 / 새 계정). 입력을 받아 이벤트로 넘긴다.
//        + 접속이 안 될 때 이유를 스스로 짚어 주는 "자가 진단".
// 금지: 해시 계산·저장소 접근 → systems/AccountSystem.js + core/Storage.js 담당.
// 금지: 게임 상태 접근.

/**
 * 지금 환경에서 게임이 제대로 돌 수 있는지 항목별로 확인한다.
 * 접속이 안 되는 원인은 거의 다 여기 넷 중 하나다.
 * @returns {{ok:boolean, rows:Array<{label:string,ok:boolean,detail:string}>}}
 */
export function selfCheck({ isServer = false, contentVersion = null } = {}) {
  const rows = [];
  const proto = location.protocol;

  // ① 어떻게 열었는가
  // 미리보기 창(다른 페이지 안에 끼워 넣은 틀)인지부터 본다.
  // 이 경우 브라우저가 폼 제출·저장 같은 기능을 막아 버려 "버튼이 안 눌린다"가 된다.
  const framed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true; // 접근조차 막혔다면 확실히 남의 틀 안이다
    }
  })();
  const previewish = framed || proto === 'about:' || proto === 'blob:';

  if (previewish) {
    rows.push({
      label: '여는 방법',
      ok: false,
      detail:
        '미리보기 창 안에서 열렸습니다 — 브라우저가 여기서는 기능을 제한합니다. ' +
        '파일을 저장한 뒤 브라우저에서 직접 열어 주세요.',
    });
  } else if (proto === 'file:') {
    rows.push({ label: '여는 방법', ok: true, detail: '파일로 열림 — 이 기기 안에서만 저장됩니다' });
  } else {
    rows.push({ label: '여는 방법', ok: true, detail: `${location.host || proto} 에서 열림` });
  }

  // ② 서버를 찾았는가 — 없어도 혼자 하는 데는 문제가 없다(실패가 아니라 정보다)
  rows.push({
    label: '서버',
    ok: true,
    info: !isServer,
    detail: isServer
      ? `연결됨${contentVersion ? ` · 콘텐츠 v${contentVersion}` : ''} — 다른 기기와 이어집니다`
      : '없음 — 혼자 하는 데는 문제없지만, 계정이 이 기기 밖으로 나가지 않습니다',
  });

  // ③ 비밀번호 해시를 만들 수 있는가
  const hasSubtle = !!(typeof crypto !== 'undefined' && crypto && crypto.subtle);
  rows.push({
    label: '비밀번호 처리',
    ok: true,
    detail: hasSubtle ? '브라우저 기본 기능 사용' : '내장 방식 사용 (결과는 동일)',
  });

  // ④ 저장이 되는가 — 여기가 막히면 새 계정조차 만들 수 없다
  let storeOk = false;
  let storeDetail = '';
  try {
    localStorage.setItem('poino.probe', '1');
    localStorage.removeItem('poino.probe');
    storeOk = true;
    storeDetail = '가능';
  } catch (err) {
    storeDetail = '막힘 — 사파리 "개인정보 보호 모드"이거나 브라우저가 저장을 차단했습니다';
  }
  rows.push({ label: '이 기기에 저장', ok: storeOk || isServer, detail: storeDetail });

  return { ok: rows.every((r) => r.ok), rows };
}

export class LoginScreen {
  /** @param {object} [o.assets] 직업 그림을 보여 주기 위한 AssetLoader(없어도 동작한다) */
  constructor({ bus, root, assets = null }) {
    this.bus = bus;
    this.root = root;
    this.assets = assets;
    this.mode = 'login'; // 'login' | 'register'
    this.busy = false;
    this.storageLabel = '확인 중…';
    this.lastId = '';
    this._build();
  }

  /**
   * @param {object} o
   * @param {boolean} [o.isServer] 서버에 붙어 있는가(계정이 기기 밖에 저장되는가)
   * @param {string[]} [o.localAccounts] 이 브라우저에 저장된 계정들
   */
  show({
    storageLabel,
    lastId,
    classes,
    isServer = false,
    localAccounts = [],
    version = '',
    dataStamp = '',
    contentVersion = null,
    serverVersion = null,
  }) {
    this.version = version;
    // 이 파일이 들고 있는 표의 기준 시각(한 장짜리 html 일 때만 값이 있다).
    // 왜 찍나: config.js 의 DATA_STAMP 주석 참고 — "시트를 고쳤는데 왜 그대로지" 의 답이다.
    this.dataStamp = dataStamp || '';
    this.contentVersion = contentVersion;
    this.serverVersion = serverVersion || null;
    this.storageLabel = storageLabel;
    this.lastId = lastId || '';
    this.classes = classes || { default: 'warrior', list: {} };
    this.classId = this.classes.default;
    this.isServer = isServer;
    this.localAccounts = localAccounts;
    // 배경 음악이 지금 켜져 있나(오른쪽 위 스피커 단추). main.js 가 알려 준다.
    if (this.bgmOn === undefined) this.bgmOn = true;
    // 서버가 없고 이 기기에 계정도 없다면 "접속"이 아니라 "새 계정"부터 보여 준다.
    // (다른 컴퓨터에서 만든 계정은 이 기기에 없으므로 접속이 될 리가 없다)
    if (!isServer && localAccounts.length === 0) this.mode = 'register';
    this.root.hidden = false;
    this.render();
  }

  /** 저장 위치가 나중에 밝혀지면(서버 감지) 안내 문구를 갱신한다. */
  setStorageInfo({ isServer, localAccounts, serverVersion }) {
    this.isServer = isServer;
    if (localAccounts) this.localAccounts = localAccounts;
    if (serverVersion !== undefined) this.serverVersion = serverVersion;
    this.render();
  }

  /**
   * 내 파일이 서버가 내려 주는 판보다 낡았는가.
   *
   * 브라우저가 옛 파일을 캐시에서 붙잡고 있으면 겉보기에는 멀쩡히 돌아가다가
   * 새로 생긴 아이템이 '없는 아이템'이 되고 세이브가 어긋난다.
   * 조용히 두면 원인을 알 길이 없으므로 **아예 못 들어가게** 막는다.
   */
  isOutdated() {
    return !!(this.serverVersion && this.version && this.serverVersion !== this.version);
  }

  hide() {
    this.root.hidden = true;
  }

  /** 게임을 띄우다 실패했을 때 다시 보여 준다(설정은 그대로 유지). */
  showAgain() {
    this.root.hidden = false;
    this.render();
  }

  setStorageLabel(label) {
    this.storageLabel = label;
    const el = this.root.querySelector('[data-storage]');
    if (el) el.textContent = label;
  }

  setBusy(busy) {
    this.busy = busy;
    const btn = this.root.querySelector('[data-submit]');
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? '접속 중…' : this.mode === 'login' ? '접속하기' : '계정 만들고 시작';
    }
  }

  error(message) {
    const el = this.root.querySelector('[data-error]');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  _build() {
    this.root.hidden = true;
  }

  /**
   * 다시 그려도 **적고 있던 글을 잃지 않는다** (0.53).
   *
   * 왜 필요한가: `setStorageInfo()` 는 서버 판을 알아낸 순간 창을 다시 그린다.
   * 그 순간이 사람이 아이디를 치는 도중이면 칸이 통째로 새로 만들어져서
   * 적던 글도, 커서도, 한글 조합도 사라진다. "입력이 매끄럽지 않다" 의 정체다.
   */
  _keepFields(draw) {
    const before = {};
    let focusName = null;
    let at = 0;
    for (const el of this.root.querySelectorAll('input[name]')) {
      before[el.name] = el.value;
      if (document.activeElement === el) {
        focusName = el.name;
        at = el.selectionStart;
      }
    }
    draw();
    for (const [name, value] of Object.entries(before)) {
      const el = this.root.querySelector(`input[name="${name}"]`);
      if (el && value) el.value = value;
    }
    if (focusName) {
      const el = this.root.querySelector(`input[name="${focusName}"]`);
      if (el) {
        el.focus();
        try { el.setSelectionRange(at, at); } catch { /* 비밀번호 칸은 못 옮길 수 있다 */ }
      }
    }
  }

  render() {
    this._keepFields(() => this._render());
  }

  _render() {
    const isLogin = this.mode === 'login';
    this.root.innerHTML = `
      <div class="login-card">
        <div class="login-brand">
          <span class="login-mark">⚔</span>
          <div>
            <h1>드래곤 필드</h1>
            <p>포이노 오픈 필드</p>
          </div>
          ${this._soundButtonHtml()}
        </div>

        ${this._outdatedHtml()}
        ${this._previewWarnHtml()}

        <nav class="login-tabs">
          <button data-mode="login" class="${isLogin ? 'is-on' : ''}">접속</button>
          <button data-mode="register" class="${isLogin ? '' : 'is-on'}">새 계정</button>
        </nav>

        <form class="login-form" data-form>
          <!-- 이 안만 스크롤된다. 접속 버튼은 밖에 있어 항상 보인다. -->
          <div class="login-fields">
          <label>
            <span>아이디</span>
            <input name="id" autocomplete="username" maxlength="16"
                   value="${escapeAttr(this.lastId)}" placeholder="3~16자" />
          </label>
          <label>
            <span>비밀번호</span>
            <input name="pw" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                   maxlength="64" placeholder="4자 이상" />
          </label>
          ${
            isLogin
              ? ''
              : `<label>
                   <span>캐릭터 이름</span>
                   <input name="nick" maxlength="12" placeholder="비우면 아이디를 씁니다" />
                 </label>
                 <div class="class-pick">
                   <span>직업</span>
                   <div class="class-row">${this._classButtons()}</div>
                 </div>`
          }
          ${
            isLogin && !this.isServer && (this.localAccounts || []).length
              ? `<div class="login-known">
                   <span>이 기기에 저장된 계정</span>
                   <div class="login-known-row">
                     ${this.localAccounts
                       .slice(0, 6)
                       .map((a) => `<button type="button" data-pick="${escapeAttr(a)}">${escapeHtml(a)}</button>`)
                       .join('')}
                   </div>
                 </div>`
              : ''
          }
          <p class="login-error" data-error hidden></p>
          </div>
          <button class="login-submit" data-submit type="submit">
            ${isLogin ? '접속하기' : '계정 만들고 시작'}
          </button>
        </form>

        <footer class="login-foot">
          <p class="login-where">
            저장 위치 · <b data-storage>${escapeHtml(this.storageLabel)}</b>
            <button type="button" class="login-diag-btn" data-diag>진단</button>
            <span class="login-ver">v${escapeHtml(this.version || '')}</span>${
              this.dataStamp
                ? `<span class="login-stamp" title="이 파일에 박혀 있는 표(아이템·몬스터·의뢰)의 기준 시각입니다. 구글 시트를 이 시각 뒤에 고쳤다면 다시 구워야 반영됩니다.">표 ${escapeHtml(this.dataStamp)}</span>`
                : ''
            }
          </p>
          <div class="login-diag" data-diagbox hidden></div>
          ${this._whereNoteHtml(isLogin)}
          <p class="login-warn">
            이 계정은 세이브 슬롯을 구분하기 위한 것입니다.
            다른 곳에서 쓰는 비밀번호를 재사용하지 마세요.
          </p>
        </footer>
      </div>`;

    const soundBtn = this.root.querySelector('[data-sound]');
    if (soundBtn) {
      soundBtn.addEventListener('click', (e) => {
        // 이 단추는 '접속' 이 아니다 — 폼이 딸려 넘어가지 않게 막는다.
        e.preventDefault();
        e.stopPropagation();
        this.bus.emit('login:bgm-toggle');
      });
    }

    for (const btn of this.root.querySelectorAll('[data-mode]')) {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        this.render();
      });
    }

    for (const btn of this.root.querySelectorAll('[data-class]')) {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        this.classId = btn.dataset.class;
        // 다시 그리면 이미 입력한 아이디·비밀번호가 지워진다.
        // 선택 표시만 바꾼다.
        for (const other of this.root.querySelectorAll('[data-class]')) {
          other.classList.toggle('is-on', other.dataset.class === this.classId);
        }
      });
    }

    const diagBtn = this.root.querySelector('[data-diag]');
    if (diagBtn) {
      diagBtn.addEventListener('click', () => {
        const box = this.root.querySelector('[data-diagbox]');
        if (!box.hidden) return void (box.hidden = true);
        const result = selfCheck({ isServer: this.isServer, contentVersion: this.contentVersion });
        box.hidden = false;
        box.innerHTML = `
          <ul>${result.rows
            .map(
              (r) => {
                const cls = !r.ok ? 'is-bad' : r.info ? 'is-info' : 'is-ok';
                const mark = !r.ok ? '✗' : r.info ? '·' : '✓';
                return `<li class="${cls}">
                          <b>${mark} ${escapeHtml(r.label)}</b>
                          <span>${escapeHtml(r.detail)}</span>
                        </li>`;
              }
            )
            .join('')}</ul>`;
      });
    }

    for (const btn of this.root.querySelectorAll('[data-pick]')) {
      btn.addEventListener('click', () => {
        const input = this.root.querySelector('input[name="id"]');
        input.value = btn.dataset.pick;
        this.root.querySelector('input[name="pw"]').focus();
      });
    }

    // ── 제출 ──────────────────────────────────────────────
    // 폼 submit 하나에만 기대면 안 된다.
    // 미리보기 창처럼 sandbox 로 감싸인 곳에서는 브라우저가 폼 제출 자체를 막아 버려
    // (allow-forms 없음) 버튼을 눌러도 아무 일도 일어나지 않는다.
    // 그래서 버튼 클릭과 Enter 키로도 같은 일을 하게 해 둔다.
    const form = this.root.querySelector('[data-form]');
    const submit = () => {
      if (this.busy) return;
      // 옛 파일로는 못 들어간다. 버튼도 잠가 두지만, 키보드로도 못 들어오게 여기서도 막는다.
      if (this.isOutdated()) {
        this.error(`${this.serverVersion} 버전이 새로 나왔습니다. 새로 받아서 다시 열어 주세요.`);
        return;
      }
      const val = (name) => {
        const el = form.querySelector(`[name="${name}"]`);
        return el ? String(el.value || '') : '';
      };
      this.bus.emit('login:submit', {
        mode: this.mode,
        id: val('id').trim(),
        pw: val('pw'),
        nick: val('nick').trim(),
        classId: this.classId,
      });
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });

    // 새 판이 나왔으면 '새로 받아서 다시 열기'
    const refreshBtn = this.root.querySelector('[data-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        // 주소 뒤에 값을 하나 붙여 캐시를 비껴간다. 그냥 reload 하면
        // 브라우저가 들고 있던 옛 파일을 그대로 다시 줄 수 있다.
        const url = new URL(location.href);
        url.searchParams.set('v', String(Date.now()));
        location.replace(url.toString());
      });
    }

    const submitBtn = this.root.querySelector('[data-submit]');
    if (submitBtn) {
      submitBtn.disabled = this.isOutdated();
      submitBtn.addEventListener('click', (e) => {
        // 기본 폼 제출을 막고 직접 처리한다(그래야 두 번 실행되지 않는다).
        e.preventDefault();
        submit();
      });
    }

    for (const input of form.querySelectorAll('input')) {
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        submit();
      });
    }

    const first = form.querySelector('input[name="id"]');
    if (first) setTimeout(() => first.focus(), 30);
  }
}

/**
 * "계정이 어디에 저장되는가"를 한 줄로 설명한다.
 * 다른 컴퓨터·다른 폰에서 접속이 안 되는 이유가 대부분 여기에 있다.
 */
/**
 * 서버가 내려 주는 판과 내 파일의 판이 다르면 맨 위에 띠를 띄우고 접속을 막는다.
 *
 * 왜 막기까지 하나: 옛 파일로도 로그인은 된다. 그러고 나서 새로 생긴 아이템을
 * 주우면 '없는 아이템'으로 지워지고, 그 상태가 그대로 저장된다.
 * 들어가기 전에 멈추는 편이 낫다.
 */
LoginScreen.prototype._outdatedHtml = function () {
  if (!this.isOutdated()) return '';
  return `<div class="login-outdated">
    <b>${escapeAttr(this.serverVersion)} 버전이 새로 나왔습니다</b>
    지금 열려 있는 파일은 <b>v${escapeAttr(this.version)}</b> 입니다.
    옛 파일로 접속하면 새로 생긴 아이템이 사라지고 세이브가 어긋날 수 있어 막아 두었습니다.
    <button type="button" data-refresh>새로 받아서 다시 열기</button>
    <span class="lo-hint">눌러도 그대로면 Ctrl+Shift+R (맥은 ⌘+Shift+R) 로 새로고침하세요.</span>
  </div>`;
};

/** 미리보기 창(샌드박스) 안이라면 맨 위에 경고를 띄운다. */
/**
 * 배경 음악 켜고 끄기 — 오른쪽 위 스피커 단추 (0.57).
 *
 * 왜 여기 있나: 브라우저는 사람이 한 번 누르기 전에는 소리를 못 내게 막는다.
 * 그래서 예전에는 "아무 데나 한 번 누르면 음악이 시작된다" 였는데,
 * 그것을 모르는 사람에게는 **음악이 없는 게임**이었고, 시끄러워서 끄고 싶은
 * 사람에게는 끌 방법이 없었다(설정 창은 게임에 들어가야 열린다).
 * 이제 눌러서 켜고, 다시 눌러서 끈다. 그 선택은 이 기기에 저장된다.
 */
LoginScreen.prototype._soundButtonHtml = function () {
  const on = this.bgmOn !== false;
  // 윈도우의 소리 아이콘과 같은 모양 — 사각형 + 삼각형(스피커)에
  // 켜져 있으면 음파 두 줄, 꺼져 있으면 ✕.
  const waves = on
    ? `<path d="M15.5 9.2a5 5 0 0 1 0 7.6" stroke="currentColor" stroke-width="1.8"
             fill="none" stroke-linecap="round"/>
       <path d="M18.4 6.2a9 9 0 0 1 0 13.6" stroke="currentColor" stroke-width="1.8"
             fill="none" stroke-linecap="round"/>`
    : `<path d="M16 10 L21 16 M21 10 L16 16" stroke="currentColor" stroke-width="2"
             fill="none" stroke-linecap="round"/>`;
  return `<button type="button" class="login-sound ${on ? 'is-on' : 'is-off'}"
      data-sound aria-pressed="${on}" title="${on ? '배경 음악 끄기' : '배경 음악 켜기'}"
      aria-label="${on ? '배경 음악 끄기' : '배경 음악 켜기'}">
      <svg viewBox="0 0 26 26" width="20" height="20" aria-hidden="true">
        <path d="M4 10 h3.4 L12 5.6 v14.8 L7.4 16 H4 Z" fill="currentColor"/>
        ${waves}
      </svg>
    </button>`;
};

/** main.js 가 "지금 음악이 켜져 있다/꺼져 있다" 를 알려 준다. */
LoginScreen.prototype.setBgm = function (on) {
  if (this.bgmOn === !!on) return;
  this.bgmOn = !!on;
  this.render();
};

LoginScreen.prototype._previewWarnHtml = function () {
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  if (!framed && location.protocol !== 'about:' && location.protocol !== 'blob:') return '';

  return `<div class="login-preview-warn">
    <b>미리보기 창에서 열렸습니다</b>
    여기서는 브라우저가 기능을 막아 게임이 제대로 돌지 않습니다.
    <b>dragon-field.html 파일을 컴퓨터에 저장한 뒤</b>, 그 파일을 더블클릭해서 열어 주세요.
  </div>`;
};

LoginScreen.prototype._whereNoteHtml = function (isLogin) {
  if (this.isServer) {
    return `<p class="login-note is-good">
      서버에 저장되므로 <b>폰·다른 컴퓨터에서도 같은 아이디로 이어서</b> 할 수 있습니다.
    </p>`;
  }
  const none = !(this.localAccounts || []).length;
  if (isLogin && none) {
    return `<p class="login-note is-warn">
      계정은 <b>이 기기의 이 브라우저 안에만</b> 저장됩니다.
      다른 컴퓨터에서 만든 아이디는 여기에 없으니 <b>새 계정</b>으로 시작하세요.<br />
      기기끼리 이어서 하려면 컴퓨터에서 <code>node server/server.js</code> 를 켜고
      그 주소로 접속하면 됩니다.
    </p>`;
  }
  return `<p class="login-note">
    계정은 <b>이 기기의 이 브라우저 안에만</b> 저장됩니다.
    다른 기기와 이어서 하려면 서버를 켜고 그 주소로 접속하세요.
  </p>`;
};

// 직업 카드에 보여 줄 요약 스탯(기본치 기준)
const CLASS_STAT_ROWS = [
  ['❤', 'hp'],
  ['⚔', 'atk'],
  ['🛡', 'def'],
  ['👟', 'spd'],
];

LoginScreen.prototype._classButtons = function () {
  const list = (this.classes && this.classes.list) || {};
  return Object.entries(list)
    .map(([id, def]) => {
      const on = id === this.classId ? 'is-on' : '';
      const off = def.available ? '' : 'disabled';
      const tag = def.available ? '' : '<i>준비 중</i>';
      const stats = (def.baseStats || {});
      const statLine = CLASS_STAT_ROWS.map(([icon, k]) => `${icon}${stats[k] ?? '-'}`).join(' ');

      // 스프라이트가 로드돼 있으면 그림을, 없으면 이름만 보여 준다.
      const asset = this.assets ? this.assets.get(def.sprite) : null;
      const art =
        asset && asset.ok
          ? `<img class="class-art" src="${asset.image.src}" alt="" />`
          : '<span class="class-art class-art--none"></span>';

      // 직업 패시브 — 고르기 전에 "이 직업만의 것"이 무엇인지 바로 보이게 한다.
      const pas = def.passive;
      const passiveHtml = pas
        ? `<span class="class-passive">
             <b>${escapeHtml(pas.name)}</b>${escapeHtml(pas.desc)}
           </span>`
        : '';
      const tip = [def.tagline || '', pas ? `${pas.name} — ${pas.detail || pas.desc}` : '']
        .filter(Boolean)
        .join('\n');

      return `<button type="button" data-class="${id}" class="${on}" ${off}
                title="${escapeHtml(tip)}">
                ${art}
                <b>${escapeHtml(def.name)}</b>${tag}
                <span class="class-tagline">${escapeHtml(def.tagline || '')}</span>
                <span class="class-stats">${statLine}</span>
                ${passiveHtml}
              </button>`;
    })
    .join('');
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
