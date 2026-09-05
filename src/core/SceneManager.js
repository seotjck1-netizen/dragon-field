// 책임: 씬 스택 관리. 최상단 씬에만 update/render/onAction을 위임한다.
// 금지: 특정 씬(필드/전투)의 내용을 아는 것. 씬은 인터페이스로만 다룬다.
// 씬 인터페이스: { enter?(), exit?(), pause?(), resume?(), update?(dt), render?(renderer), onAction?(action) }

export class SceneManager {
  constructor() {
    /** @type {Array<object>} */
    this.stack = [];
  }

  get current() {
    return this.stack[this.stack.length - 1] || null;
  }

  push(scene, params) {
    const prev = this.current;
    if (prev && prev.pause) prev.pause();
    this.stack.push(scene);
    if (scene.enter) scene.enter(params);
  }

  pop() {
    const scene = this.stack.pop();
    if (scene && scene.exit) scene.exit();
    const next = this.current;
    if (next && next.resume) next.resume();
    return scene;
  }

  replace(scene, params) {
    while (this.stack.length) this.pop();
    this.push(scene, params);
  }

  /**
   * @param {number} dt 흐른 시간(ms)
   * @param {object} [opts] 씬에 그대로 넘긴다(예: { paused: true } — 창이 열려 있음).
   *        씬은 이 값을 보고 "시간은 흘리되 조작은 멈추는" 판단을 스스로 한다.
   */
  update(dt, opts) {
    const scene = this.current;
    if (scene && scene.update) scene.update(dt, opts);
  }

  render(renderer) {
    // 스택 전체를 아래에서부터 그린다(전투 씬이 필드 위에 겹치는 연출 등을 위해).
    for (const scene of this.stack) {
      if (scene.render) scene.render(renderer);
    }
  }

  onAction(action) {
    const scene = this.current;
    if (scene && scene.onAction) scene.onAction(action);
  }
}
