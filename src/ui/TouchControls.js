// 책임: 터치 기기(아이폰·아이패드·안드로이드)에서 쓸 화면 조작 버튼.
//        키보드가 없는 기기에서는 이게 없으면 캐릭터를 움직일 방법이 아예 없다.
// 금지: 게임 상태 접근·규칙 판단. 눌린 버튼을 Input 의 액션으로 넘기기만 한다.
//
// 버튼은 스테이지 밖(화면 기준)에 붙는다. 스테이지는 화면 크기에 맞춰 축소되는데,
// 조작 버튼까지 같이 줄어들면 손가락으로 누르기 어려워지기 때문이다.

/** 터치로 조작하는 기기인가. (마우스가 함께 있는 노트북은 제외) */
export function isTouchDevice() {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touch = 'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
  return !!(coarse && touch);
}

const DPAD = [
  { action: 'up', label: '▲', cls: 'up' },
  { action: 'left', label: '◀', cls: 'left' },
  { action: 'right', label: '▶', cls: 'right' },
  { action: 'down', label: '▼', cls: 'down' },
];

export class TouchControls {
  /**
   * @param {object} o
   * @param {import('../core/Input.js').Input} o.input
   */
  constructor({ bus, input, root }) {
    this.bus = bus;
    this.input = input;
    this.root = root;
    this.enabled = false;
  }

  /** 터치 기기일 때만 켠다. */
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('is-touch');
    this._build();
  }

  setVisible(v) {
    if (!this.enabled) return;
    this.root.hidden = !v;
    if (!v) {
      this.input.releaseDirections();
      this._dirs = [];
    }
  }

  _build() {
    this.root.hidden = false;
    this.root.innerHTML = `
      <div class="tc-pad" data-pad>
        ${DPAD.map(
          (d) => `<button class="tc-dir tc-${d.cls}" data-dir="${d.action}"
                    aria-label="${d.action}">${d.label}</button>`
        ).join('')}
        <span class="tc-center"></span>
      </div>
      <div class="tc-actions">
        <button class="tc-btn tc-quick" data-tap="quick1">1</button>
        <button class="tc-btn tc-quick" data-tap="quick2">2</button>
        <button class="tc-btn tc-cancel" data-tap="cancel">✕</button>
        <button class="tc-btn tc-confirm" data-tap="confirm">확인</button>
      </div>
      <div class="tc-menu">
        <button class="tc-mini" data-tap="inventory">소지품</button>
        <button class="tc-mini" data-tap="character">캐릭터</button>
        <button class="tc-mini" data-tap="settings">설정</button>
      </div>`;

    // ── 방향 패드 — 조이패드처럼 ──
    //
    // 예전에는 elementFromPoint 로 "지금 손가락 밑에 있는 화살표"를 읽었다.
    // 그래서 화살표와 화살표 사이의 빈틈이나 한가운데를 지나가면 방향이 null 이 되어
    // 캐릭터가 멈칫했다. 누른 채 밀고 다니는 맛이 나지 않았다.
    //
    // 지금은 **패드 한가운데에서 손가락까지의 방향**으로 정한다.
    //   · 패드 아무 데나 눌러도 잡힌다(화살표를 정확히 짚지 않아도 된다)
    //   · 누른 채 밀면 방향이 따라온다 — 손을 떼기 전까지 계속 움직인다
    //   · 패드 밖으로 나가도 놓지 않는다(엄지가 미끄러져도 안 끊긴다)
    const pad = this.root.querySelector('[data-pad]');
    let padTouchId = null;
    let padRect = null;

    // 한가운데의 이 반지름 안에서는 방향을 정하지 않는다.
    // 없으면 손가락을 올려놓기만 해도 아무 쪽으로나 튄다.
    const DEAD_ZONE = 0.22; // 패드 반지름 대비

    /**
     * 패드 한가운데 기준으로 어느 쪽인가. 가까우면 빈 배열.
     *
     * 0.53 — **여덟 갈래**로 나눈다. 예전에는 "더 많이 벗어난 축이 이긴다" 였는데,
     * 그러면 대각선으로 밀어도 상하좌우 중 하나로만 갔다. 키보드가 대각선으로
     * 걷게 된 이상 손가락도 같아야 한다. 한 칸이 45° 씩이라 대각선도 제 몫을 갖는다.
     */
    const dirFrom = (x, y) => {
      const r = padRect;
      if (!r) return [];
      const dx = x - (r.left + r.width / 2);
      const dy = y - (r.top + r.height / 2);
      const radius = Math.max(1, Math.min(r.width, r.height) / 2);
      if (Math.hypot(dx, dy) < radius * DEAD_ZONE) return [];
      const oct = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      return [
        ['right'], ['down', 'right'], ['down'], ['down', 'left'],
        ['left'], ['up', 'left'], ['up'], ['up', 'right'],
      ][oct];
    };

    /** 지금 누르고 있는 방향들을 이 목록으로 맞춘다(둘까지). */
    const setDir = (dirs) => {
      const now = Array.isArray(dirs) ? dirs : dirs ? [dirs] : [];
      const was = this._dirs || [];
      if (was.length === now.length && was.every((d) => now.includes(d))) return;
      for (const d of was) if (!now.includes(d)) this.input.releaseAction(d);
      for (const d of now) if (!was.includes(d)) this.input.pressAction(d);
      this._dirs = now;
      // 어느 쪽으로 가는지 눈에 보이게 — 손가락에 가려도 알 수 있다.
      for (const btn of pad.querySelectorAll('[data-dir]')) {
        btn.classList.toggle('is-on', now.includes(btn.dataset.dir));
      }
    };

    pad.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        padTouchId = t.identifier;
        padRect = pad.getBoundingClientRect();
        setDir(dirFrom(t.clientX, t.clientY));
      },
      { passive: false }
    );

    // 손가락이 패드 밖으로 나가도 따라간다 — 그래서 document 에 건다.
    document.addEventListener(
      'touchmove',
      (e) => {
        if (padTouchId === null) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== padTouchId) continue;
          e.preventDefault();
          setDir(dirFrom(t.clientX, t.clientY));
        }
      },
      { passive: false }
    );

    const endPad = (e) => {
      if (padTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== padTouchId) continue;
        padTouchId = null;
        padRect = null;
        setDir([]);
      }
    };
    document.addEventListener('touchend', endPad, { passive: true });
    document.addEventListener('touchcancel', endPad, { passive: true });

    // 마우스로도 눌러 볼 수 있게(개발·테스트용). 같은 규칙으로 민다.
    let mouseDown = false;
    pad.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mouseDown = true;
      padRect = pad.getBoundingClientRect();
      setDir(dirFrom(e.clientX, e.clientY));
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      setDir(dirFrom(e.clientX, e.clientY));
    });
    window.addEventListener('mouseup', () => {
      if (!mouseDown) return;
      mouseDown = false;
      padRect = null;
      setDir([]);
    });

    // ── 한 번 누르는 버튼들 ──
    //
    // ⚠ 터치 기기는 한 번 두드리면 이벤트가 **두 번** 온다 —
    //   touchstart 가 먼저 오고, 0.3초쯤 뒤에 브라우저가 만들어 낸 click 이 뒤따른다.
    //   (touchstart 에서 preventDefault 를 해도 기기·브라우저에 따라 그대로 온다)
    //
    //   예전 코드는 `if (e.detail === 0) return` 으로 막으려 했는데 이게 거꾸로였다.
    //   터치가 만든 click 의 detail 은 1 이라 그냥 통과했고, 오히려 키보드로 만든
    //   click(detail 0)만 막혔다. 그래서 **한 번 누르면 두 번 실행**됐고,
    //   캐릭터 창이 열렸다 닫혔다 하며 "계속 눌린 것처럼" 보였다.
    //
    //   이제는 방금 터치가 있었는지를 시각으로 기억해 두고, 그 직후의 click 을 버린다.
    let lastTouchAt = 0;
    const GHOST_CLICK_MS = 700;

    for (const btn of this.root.querySelectorAll('[data-tap]')) {
      const action = btn.dataset.tap;
      const fire = () => {
        this.input.pressAction(action);
        // 누른 즉시 뗀 것으로 처리한다(길게 눌러도 한 번만 동작).
        setTimeout(() => this.input.releaseAction(action), 0);
      };
      btn.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          lastTouchAt = Date.now();
          fire();
        },
        { passive: false }
      );
      btn.addEventListener('click', (e) => {
        if (Date.now() - lastTouchAt < GHOST_CLICK_MS) return; // 터치가 남긴 유령 클릭
        e.preventDefault();
        fire();
      });
    }
  }
}
