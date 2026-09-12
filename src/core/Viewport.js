// 책임: 640×480 로 만들어진 화면을 기기 화면 크기에 맞게 통째로 축소·확대한다.
// 왜 필요한가: 아이폰 세로 화면은 폭이 390 정도라 640 짜리 판이 그대로는 잘려 나간다.
//        캔버스만 줄이면 그 위에 얹힌 HTML UI 와 어긋나므로, 스테이지 전체를 CSS 로 함께 줄인다.
// 금지: 게임 상태 접근. 크기만 다룬다.

import { CONFIG } from '../config.js';

export class Viewport {
  /**
   * @param {HTMLElement} stage  #stage
   * @param {HTMLElement} frame  스테이지를 감싸는 자리
   * @param {object} [opts]
   * @param {() => string} [opts.getMode]  'auto' | 'landscape' | 'portrait'
   * @param {(w:number,h:number) => void} [opts.onViewSize] 판 크기가 바뀌면 알린다
   */
  constructor(stage, frame, { getMode = null, onViewSize = null } = {}) {
    this.stage = stage;
    this.frame = frame;
    this.scale = 1;
    this.getMode = getMode || (() => 'auto');
    this.onViewSize = onViewSize || (() => {});
    this.portrait = false;
    this._onResize = this.fit.bind(this);
  }

  /**
   * 지금 세로 판을 써야 하는가.
   *
   * 'auto' 는 **화면이 세로보다 길면** 세로 판을 쓴다. 고정을 고르면 화면 모양과
   * 상관없이 그쪽으로 간다 — 폰을 눕혔는데도 세로로 하고 싶은 사람이 있고,
   * 반대로 세워 든 채로 가로 판을 보고 싶은 사람도 있다.
   */
  _wantPortrait(vw, vh) {
    const mode = this.getMode();
    if (mode === 'portrait') return true;
    if (mode === 'landscape') return false;
    return vh > vw;
  }

  attach() {
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    // 아이폰에서 주소창이 접히면 화면 높이가 바뀌므로 이것도 듣는다.
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
    this.fit();
  }

  detach() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    if (window.visualViewport) window.visualViewport.removeEventListener('resize', this._onResize);
  }

  fit() {
    const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;

    const portraitView = this._wantPortrait(vw, vh);
    const W = portraitView ? CONFIG.VIEW_PORTRAIT_W : CONFIG.VIEW_W;
    const H = portraitView ? CONFIG.VIEW_PORTRAIT_H : CONFIG.VIEW_H;

    if (portraitView !== this.portrait) {
      this.portrait = portraitView;
      document.body.classList.toggle('is-portrait', portraitView);
    }
    // CSS 도 같은 수를 봐야 한다(#stage 의 width/height 가 --w/--h 다).
    const root = document.documentElement;
    root.style.setProperty('--w', `${W}px`);
    root.style.setProperty('--h', `${H}px`);
    this.onViewSize(W, H);

    // 터치 기기에서는 아래쪽에 조작 버튼 자리를 남긴다.
    const touch = document.body.classList.contains('is-touch');
    const portrait = vh >= vw;
    // 세로 판에서는 조작 버튼을 화면 아래 구석에 겹쳐 두므로 자리를 덜 뺀다.
    const reservedH = touch ? (portrait ? (portraitView ? 90 : 200) : 0) : 0;
    const padX = touch ? 2 : 32;
    const padY = touch ? 8 : 64;

    const availW = Math.max(200, vw - padX);
    const availH = Math.max(200, vh - padY - reservedH);

    // 데스크톱에서는 원래 크기보다 키우지 않는다(도트가 뭉개지지 않도록).
    const raw = Math.min(availW / W, availH / H);
    const scale = touch ? raw : Math.min(1, raw);

    this.scale = Math.max(0.3, Math.round(scale * 1000) / 1000);
    this.stage.style.setProperty('--stage-scale', String(this.scale));

    // 축소된 실제 크기를 자리 차지 요소에 알려 준다(레이아웃이 겹치지 않게).
    if (this.frame) {
      this.frame.style.width = `${Math.round(W * this.scale)}px`;
      this.frame.style.height = `${Math.round(H * this.scale)}px`;
    }
  }
}
