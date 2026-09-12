// 책임: 대사 페이지 진행 상태만 관리한다(현재 몇 번째 줄인지, 끝났는지).
// 금지: DOM 접근 → 표시는 ui/DialogueBox.js.
// 금지: 상점/강화 실행 → 오케스트레이터가 action을 받아 처리한다.

export class DialogueSystem {
  constructor(bus) {
    this.bus = bus;
    this.active = false;
    this.speaker = '';
    this.lines = [];
    this.index = 0;
    this.action = null;
    this.action2 = null;
  }

  /**
   * @param {{name:string, lines:string[], action?:{type:string,label:string}, portrait?:string}} script
   */
  start(script) {
    this.active = true;
    this.speaker = script.name || '';
    this.lines = script.lines && script.lines.length ? script.lines : ['...'];
    this.index = 0;
    this.action = script.action || null;
    // 두 번째 행동(마녀처럼 하는 일이 둘인 사람).
    this.action2 = script.action2 || null;
    this.portrait = script.portrait || null;
    // quick = 자주 들르는 NPC. 첫 줄부터 행동 버튼이 보이고, 한 번 더 누르면 바로 끝난다.
    this.quick = !!script.quick;
    this._emit();
  }

  /** 남은 대사를 건너뛰고 바로 행동으로 넘어간다(상점·여관처럼 자주 쓰는 NPC용). */
  finish() {
    if (!this.active) return;
    this.bus.emit('dialogue:end', { action: this.action, speaker: this.speaker });
    this.close();
  }

  /** 다음 줄로. 마지막 줄이면 종료(또는 행동 제안)를 알린다. */
  advance() {
    if (!this.active) return;
    if (this.index < this.lines.length - 1) {
      this.index++;
      this._emit();
      return;
    }
    this.bus.emit('dialogue:end', { action: this.action, speaker: this.speaker });
    this.close();
  }

  close() {
    this.active = false;
    this.bus.emit('dialogue:closed');
  }

  _emit() {
    const last = this.index === this.lines.length - 1;
    this.bus.emit('dialogue:line', {
      speaker: this.speaker,
      text: this.lines[this.index],
      portrait: this.portrait,
      quick: this.quick,
      last,
      // quick NPC 는 첫 줄부터 행동 버튼을 보여 준다.
      action: this.quick || last ? this.action : null,
      action2: this.quick || last ? this.action2 : null,
    });
  }
}
