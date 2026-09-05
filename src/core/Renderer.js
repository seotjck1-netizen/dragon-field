// 책임: 캔버스 초기화, 카메라, 그리기 헬퍼. 무엇을 그릴지는 씬이 결정한다.
// 금지: 게임 상태 접근. 인자로 받은 것만 그린다.
// 금지: HTML UI 조작 → ui/ 담당.

import { CONFIG } from '../config.js';

export class Renderer {
  /** @param {HTMLCanvasElement} canvas @param {import('./AssetLoader.js').AssetLoader} assets */
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.assets = assets;
    this.ctx = canvas.getContext('2d');
    this.camera = { x: 0, y: 0 };
    this.width = CONFIG.VIEW_W;
    this.height = CONFIG.VIEW_H;
    this._resize();
  }

  /**
   * 보이는 판의 크기를 바꾼다(가로 ↔ 세로).
   *
   * 캔버스 크기만 바꾸면 되는 이유: 그리는 쪽은 전부 this.width/height 를 보고
   * 계산한다(카메라 clamp · 타일 범위 · 전투 배치 · 배너 가운데맞춤).
   * 그래서 여기 두 수만 바꾸면 나머지가 알아서 따라온다.
   */
  setViewSize(w, h) {
    if (this.width === w && this.height === h) return false;
    this.width = w;
    this.height = h;
    this._resize();
    return true;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  clear(color = '#0b1020') {
    const { ctx } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  /** 카메라를 월드 좌표 (x,y) 중심에 두되, 맵 밖을 보여주지 않도록 clamp 한다. */
  centerCamera(x, y, worldW, worldH) {
    let cx = x - this.width / 2;
    let cy = y - this.height / 2;
    if (worldW <= this.width) cx = (worldW - this.width) / 2;
    else cx = Math.max(0, Math.min(cx, worldW - this.width));
    if (worldH <= this.height) cy = (worldH - this.height) / 2;
    else cy = Math.max(0, Math.min(cy, worldH - this.height));
    this.camera.x = Math.round(cx);
    this.camera.y = Math.round(cy);
  }

  resetCamera() {
    this.camera.x = 0;
    this.camera.y = 0;
  }

  /**
   * 스프라이트를 그린다. 이미지가 없으면 AssetLoader가 플레이스홀더를 준다.
   * anchor: 'center' | 'bottom' | 'topleft'
   */
  drawSprite(key, x, y, opts = {}) {
    const {
      anchor = 'bottom',
      frame = 0,
      scale = 1,
      alpha = 1,
      flipX = false,
      world = true,
      flash = 0, // 0~1. 스프라이트 실루엣만 하얗게 달아오르게 한다
      // 0.43 — 발밑을 축으로 기울인다(라디안). 전투의 내지르는 동작에 쓴다.
      // 몬스터마다 공격 그림을 따로 그릴 수는 없으니, 기울이기로 "덤벼든다"를 만든다.
      rotate = 0,
    } = opts;

    // key 자리에 asset 객체를 직접 넘길 수도 있다(장비가 반영된 스프라이트 등).
    const asset = typeof key === 'string' ? this.assets.get(key) : key;
    if (!asset || !asset.image) return;

    // 원본(파일) 좌표
    const fw = asset.frames > 1 ? asset.frameWidth : asset.srcW;
    const fh = asset.frames > 1 ? asset.frameHeight : asset.srcH;
    const sx = asset.frames > 1 ? (frame % asset.frames) * asset.frameWidth : 0;

    // 화면 좌표 (manifest의 w/h = 그릴 크기)
    const dw = (asset.frames > 1 ? asset.w / asset.frames : asset.w) * scale;
    const dh = asset.h * scale;

    let dx = world ? x - this.camera.x : x;
    let dy = world ? y - this.camera.y : y;

    if (anchor === 'center') {
      dx -= dw / 2;
      dy -= dh / 2;
    } else if (anchor === 'bottom') {
      dx -= dw / 2;
      dy -= dh;
    }

    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (rotate) {
      // 발밑(가로 가운데 · 세로 아래)을 축으로 돌린다. 머리만 기울고 발은 붙어 있다.
      const px = dx + dw / 2;
      const py = dy + dh;
      ctx.translate(px, py);
      ctx.rotate(rotate);
      ctx.translate(-px, -py);
    }
    if (flipX) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(asset.image, sx, 0, fw, fh, 0, 0, dw, dh);
      if (flash > 0) {
        // 같은 그림을 한 번 더 겹쳐 그려 실루엣만 밝힌다(사각형이 생기지 않는다)
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * flash;
        ctx.drawImage(asset.image, sx, 0, fw, fh, 0, 0, dw, dh);
      }
    } else {
      ctx.drawImage(asset.image, sx, 0, fw, fh, dx, dy, dw, dh);
      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * flash;
        ctx.drawImage(asset.image, sx, 0, fw, fh, dx, dy, dw, dh);
      }
    }
    ctx.restore();
  }

  /** 발밑 그림자. 스프라이트가 바닥에 붙어 보이게 한다. */
  drawShadow(x, y, w, opts = {}) {
    const { alpha = 0.28, world = true } = opts;
    const { ctx } = this;
    const dx = world ? x - this.camera.x : x;
    const dy = world ? y - this.camera.y : y;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(dx, dy, w / 2, w / 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 어둠 — 화면 전체를 덮고 (x, y) 둘레만 동그랗게 뚫는다.
   *
   * 지하감옥에서 쓴다. 타일은 평소대로 다 그린 뒤 그 위에 이걸 덮으므로,
   * 그리는 쪽은 "무엇이 보이나"를 신경 쓸 필요가 없다.
   * 가장자리는 부드럽게 흐려서 횃불빛처럼 보이게 한다.
   *
   * @param {number} x 월드 좌표
   * @param {number} y 월드 좌표
   * @param {number} radius 훤히 보이는 반지름(픽셀)
   * @param {number} [darkness] 바깥쪽 어둠의 진하기 0~1
   */
  drawDarkness(x, y, radius, darkness = 0.97) {
    const { ctx } = this;
    const dx = x - this.camera.x;
    const dy = y - this.camera.y;
    const outer = radius * 1.85; // 여기부터는 완전한 어둠

    const g = ctx.createRadialGradient(dx, dy, Math.max(1, radius * 0.45), dx, dy, outer);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgba(0,0,0,${darkness * 0.45})`);
    g.addColorStop(0.75, `rgba(0,0,0,${darkness * 0.85})`);
    g.addColorStop(1, `rgba(0,0,0,${darkness})`);

    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  fillRect(x, y, w, h, color, world = true) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.fillRect(world ? x - this.camera.x : x, world ? y - this.camera.y : y, w, h);
    ctx.restore();
  }

  drawText(text, x, y, opts = {}) {
    const {
      font = '600 14px system-ui, sans-serif',
      color = '#fff',
      align = 'left',
      baseline = 'top',
      world = false,
      shadow = true,
      // 밝은 풀밭 위에서도 글자가 읽히도록 테두리를 두를 수 있다.
      stroke = null,
      strokeWidth = 3,
    } = opts;
    const { ctx } = this;
    const px = world ? x - this.camera.x : x;
    const py = world ? y - this.camera.y : y;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (shadow && !stroke) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
    }
    if (stroke) {
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = stroke;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(text, px, py);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, px, py);
    ctx.restore();
  }
}
