// 책임: 새 시즌 첫 접속 때 마을에서 뜨는 **직업 고르기** 창.
// 금지: 상태 수정 → 고른 직업을 이벤트('ui:pickClass')로 알리기만 한다.
// 금지: 규칙 판단 → classes.json 이 적어 둔 것을 보여 주기만 한다.
//
// ── 왜 여기서 다시 고르나 ───────────────────────────────────
// 시즌이 끝나면 모두가 갓 만든 캐릭터로 되돌아간다(server/world.js 의
// resetAllSaves — 세이브를 통째로 비운다). 그런데 **직업만은** 계정을 만들 때
// 고른 그대로 따라왔다. 처음부터 다시 하는 자리인데 직업만 지난 시즌 것이면,
// "처음 만든 것과 같다" 는 말이 반쪽이 된다.
// 그래서 새 시즌의 첫 접속에서 마을에 서면 이 창이 한 번 뜬다.

import { setHtml } from './keepScroll.js';

/**
 * 표(classes.json)의 `**굵게**` 표기를 화면용으로 옮긴다.
 *
 * ⚠ 이걸 안 하면 별표가 **글자 그대로** 화면에 나온다(0.70.15에 실제로 그랬다).
 *   표는 사람이 읽고 고치는 곳이라 그 표기를 그대로 두는 편이 낫고,
 *   옮기는 일은 보여 주는 쪽에서 한다.
 */
function markup(text) {
  return String(text || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/** 직업마다 한 줄로 보여 줄 능력치. (LoginScreen 의 표와 같은 자리) */
const STAT_ROWS = [
  ['hp', 'HP'],
  ['atk', '공격'],
  ['def', '방어'],
  ['spd', '속도'],
];

export class ClassPickPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.open = false;
    this.season = null;
    /** 지난 시즌 요약. 서버가 세이브를 지우기 전에 떠 둔 것이다. */
    this.last = null;
    this.picked = null;

    this.root.hidden = true;
  }

  /**
   * 「지난 시즌엔 여기까지 갔습니다」 한 단.
   *
   * 처음부터 다시 시작하는 자리는 그냥 두면 허전하다. 무엇이 사라졌는지가 아니라
   * **무엇을 해냈는지**를 적는다 — 다음 시즌에 넘어설 눈금이 되기 때문이다.
   */
  _lastHtml() {
    const d = this.last;
    if (!d) return '';
    const list = (this.store.state.db.classes || {}).list || {};
    const mons = this.store.state.db.monsters || {};
    const cls = (list[d.classId] || {}).name || '';
    const rows = [];
    if (d.level) rows.push(['레벨', `Lv.${d.level}${cls ? ` · ${cls}` : ''}`]);
    if (d.stage) rows.push(['들판', `${d.stage}단계까지`]);
    if (d.floor) rows.push(['지하감옥', `${d.floor}층까지`]);
    if (d.dragons) rows.push(['고룡', `${d.dragons}마리`]);
    if (d.gold) rows.push(['모은 골드', `🪙 ${Number(d.gold).toLocaleString('ko-KR')}`]);

    // 처음으로 눕힌 보스는 이름으로 적는다 — 숫자보다 이쪽이 기억에 남는다.
    const names = (d.bosses || [])
      .map((id) => (mons[id] || {}).name)
      .filter(Boolean);

    if (!rows.length && !names.length) return '';
    return `
      <div class="pick-last">
        <h3>지난 ${d.season ? `${d.season} ` : ''}시즌의 기록</h3>
        <div class="pick-last-rows">${rows
          .map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('')}</div>
        ${names.length
          ? `<p class="pick-last-bosses">눕힌 보스 — ${names.join(' · ')}</p>`
          : ''}
        <p class="pick-last-note">이 기록은 여기까지입니다. 장비와 보석도 함께 사라졌습니다.
          다음 시즌은 모두가 같은 자리에서 다시 시작합니다.</p>
      </div>`;
  }

  show({ season = null, last = null } = {}) {
    this.open = true;
    this.season = season;
    this.last = last;
    this.picked = (this.store.state.player || {}).classId || null;
    this.root.hidden = false;
    this.render();
    this.bus.emit('classpick:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('classpick:closed');
  }

  render() {
    const state = this.store.state;
    const list = (state.db.classes && state.db.classes.list) || {};
    const ids = Object.keys(list).filter((id) => list[id] && list[id].available !== false);

    const cards = ids.map((id) => {
      const c = list[id];
      const base = c.baseStats || {};
      const on = this.picked === id;
      const stats = STAT_ROWS
        .filter(([k]) => base[k] != null)
        .map(([k, label]) => `<span>${label} <b>${base[k]}</b></span>`)
        .join('');
      // 한 줄만 보여 준다 — 셋을 나란히 세워야 하고, 자세한 것은 캐릭터 창에 있다.
      const how = (c.combatDesc || []).slice(0, 1).map((l) => `<li>${markup(l)}</li>`).join('');
      return `
        <button type="button" class="pick-card ${on ? 'is-on' : ''}" data-class="${id}">
          <span class="pick-name">${c.name}</span>
          <span class="pick-tag">${c.tagline || ''}</span>
          <span class="pick-stats">${stats}</span>
          ${how ? `<ul class="pick-how">${how}</ul>` : ''}
        </button>`;
    }).join('');

    const head = this.season
      ? `${this.season} 시즌이 시작되었습니다`
      : '새 시즌이 시작되었습니다';

    setHtml(this.root, `
      <div class="pick-veil">
        <div class="pick-card-box">
          <!-- ⚠ 고르는 단추는 **스크롤 밖**에 둔다. 게임 화면은 세로가 좁아서
               안에 두면 내려야 보이는데, 이 창은 그 단추가 유일한 출구다. -->
          <div class="pick-scroll">
            <h2>${head}</h2>
            <p class="pick-sub">모두가 처음부터 다시 시작합니다.
              이번 시즌에 걸을 길을 고르세요 — <b>한 번만 고를 수 있습니다.</b></p>
            ${this._lastHtml()}
            <div class="pick-row">${cards}</div>
          </div>
          <button class="mini-btn pick-go" data-go ${this.picked ? '' : 'disabled'}>
            ${this.picked ? `${(list[this.picked] || {}).name}로 시작하기` : '직업을 고르세요'}
          </button>
        </div>
      </div>`);

    for (const btn of this.root.querySelectorAll('[data-class]')) {
      btn.addEventListener('click', () => {
        this.picked = btn.dataset.class;
        this.render();
      });
    }
    const go = this.root.querySelector('[data-go]');
    if (go) {
      go.addEventListener('click', () => {
        if (!this.picked) return;
        // 창은 여기서 닫지 않는다 — 캐릭터를 새로 세운 뒤 호출부가 닫는다.
        // 먼저 닫으면 바뀌기 전의 몸이 한 순간 보인다.
        this.bus.emit('ui:pickClass', { classId: this.picked });
      });
    }
  }
}
