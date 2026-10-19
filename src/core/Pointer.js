// 책임: 캔버스 클릭을 월드 좌표로 바꿔 이벤트로 알린다.
// 금지: 게임 로직. 무엇을 클릭했는지는 씬이 판단한다.

export class Pointer {
  /**
   * @param {import('./EventBus.js').EventBus} bus
   * @param {HTMLCanvasElement} canvas
   * @param {import('./Renderer.js').Renderer} renderer
   */
  constructor(bus, canvas, renderer) {
    this.bus = bus;
    this.canvas = canvas;
    this.renderer = renderer;
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
  }

  attach() {
    this.canvas.addEventListener('pointerdown', this._onDown);
    this.canvas.addEventListener('pointermove', this._onMove);
  }

  detach() {
    this.canvas.removeEventListener('pointerdown', this._onDown);
    this.canvas.removeEventListener('pointermove', this._onMove);
  }

  _toWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * this.renderer.width;
    const sy = ((e.clientY - rect.top) / rect.height) * this.renderer.height;
    return {
      sx,
      sy,
      wx: sx + this.renderer.camera.x,
      wy: sy + this.renderer.camera.y,
    };
  }

  _onDown(e) {
    this.bus.emit('input:click', this._toWorld(e));
  }

  _onMove(e) {
    this.bus.emit('input:hover', this._toWorld(e));
  }
}
