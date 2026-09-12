// 책임: 웨이포인트 돌 화면 — 갈 수 있는 곳을 보여 주고 고르게 한다.
// 금지: 실제 이동. 'ui:waypoint-travel' 이벤트로만 알린다.
// 금지: 해금 판정 → systems/WaypointSystem.js.

import { listFor } from '../systems/WaypointSystem.js';

export class WaypointPanel {
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

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('waypoint:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('waypoint:closed');
  }

  render() {
    const state = this.store.state;
    const rows = listFor(state);
    const openCount = rows.filter((r) => r.open).length;

    this.root.innerHTML = `
      <div class="wp-panel">
        <header class="inv-header">
          <h2>웨이포인트</h2>
          <span class="inv-hint">${openCount} / ${rows.length} 열림</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <p class="wp-note">
          보스를 잡은 곳으로 곧장 갈 수 있다. 도착 지점은 그 땅의 한가운데다.
        </p>
        <ul class="wp-list">${rows.map((r) => this._rowHtml(r)).join('')}</ul>
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-go]')) {
      btn.addEventListener('click', () => {
        this.bus.emit('ui:waypoint-travel', { mapId: btn.dataset.go });
        this.close();
      });
    }
  }

  _rowHtml(r) {
    const cls = r.open ? (r.here ? 'is-here' : 'is-open') : 'is-locked';
    const right = r.here
      ? '<span class="wp-tag">지금 여기</span>'
      : r.open
        ? `<button class="shop-btn" data-go="${r.id}">이동</button>`
        : '<span class="wp-tag wp-tag--locked">잠김</span>';

    return `
      <li class="wp-row ${cls}">
        <span class="wp-stage">${r.stage || '—'}</span>
        <div class="wp-info">
          <span class="wp-name">${r.name}</span>
          <span class="wp-sub">${
            r.open ? '길이 열려 있다' : `${r.bossName}을(를) 쓰러뜨리면 열린다`
          }</span>
        </div>
        ${right}
      </li>`;
  }
}
