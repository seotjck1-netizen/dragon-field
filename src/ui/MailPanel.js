// 책임: 우편함 화면 — 온 편지를 보여 주고, 받기/버리기를 이벤트로 알린다.
// 금지: 소지품 변경, 서버 호출. 실제 처리는 main.js 가 한다.
//
// 우편은 "서버가 나에게 보낸 것"이다. 고룡 토벌 몫, 운영자 이벤트 선물이 여기로 온다.
// 혼자 하는 중(서버 없음)이면 우편함 자체가 뜻이 없으므로 그렇게 적어 둔다.

const ICON = { dragon: '🐉', event: '🎁', default: '✉' };

/** 언제 온 편지인가를 사람 말로. */
function whenText(at) {
  const diff = Date.now() - (Number(at) || 0);
  if (diff < 60000) return '방금';
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  return `${Math.floor(hour / 24)}일 전`;
}

/**
 * 언제까지 받아야 하는가.
 *
 * 우편은 기본 7일 뒤에 사라진다. 사라지고 나서 "있었는데 없어졌다" 가 되면
 * 그건 고장으로 읽힌다 — 사라지기 전에 남은 날을 보여 준다.
 */
function untilText(expiresAt) {
  if (!expiresAt) return ''; // 0 이면 안 사라지는 우편
  const left = Number(expiresAt) - Date.now();
  if (left <= 0) return '<span class="mail-until is-soon">기한 지남</span>';
  const hour = Math.floor(left / 3600000);
  if (hour < 1) return '<span class="mail-until is-soon">곧 사라짐</span>';
  if (hour < 24) return `<span class="mail-until is-soon">${hour}시간 뒤 사라짐</span>`;
  const day = Math.floor(hour / 24);
  return `<span class="mail-until${day <= 1 ? ' is-soon' : ''}">${day}일 뒤 사라짐</span>`;
}

export class MailPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.open = false;
    this.busy = false;

    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('mail:opened');
    // 열 때마다 서버에서 새로 받아 온다 — 열었는데 옛 목록이면 우편함이 아니다.
    this.bus.emit('ui:mail-refresh');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('mail:closed');
  }

  render() {
    const state = this.store.state;
    const box = state.mail || { list: [], offline: false, loading: false };
    const list = box.list || [];
    const unread = list.filter((m) => !m.taken).length;

    this.root.innerHTML = `
      <div class="wp-panel mail-panel">
        <header class="inv-header">
          <h2>우편함</h2>
          <span class="inv-hint">${
            box.offline ? '서버에 접속했을 때만 옵니다' : `안 받은 것 ${unread}통`
          }</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        ${this._bodyHtml(box, list)}
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-claim]')) {
      btn.addEventListener('click', () => {
        if (this.busy) return;
        this.busy = true;
        this.bus.emit('ui:mail-claim', { mid: btn.dataset.claim });
        setTimeout(() => { this.busy = false; }, 400);
      });
    }
    for (const btn of this.root.querySelectorAll('[data-drop]')) {
      btn.addEventListener('click', () => this.bus.emit('ui:mail-delete', { mid: btn.dataset.drop }));
    }
  }

  _bodyHtml(box, list) {
    if (box.offline) {
      return `<p class="wp-note">
        우편은 <b>서버에 접속해서 할 때만</b> 옵니다.
        고룡을 함께 잡은 몫과 운영자가 보내는 선물이 이리로 옵니다.
      </p>`;
    }
    if (box.loading && !list.length) return `<p class="wp-note">받아 오는 중…</p>`;
    if (!list.length) {
      return `<p class="wp-note">온 편지가 없습니다.<br>
        서쪽 절벽의 고룡을 함께 눕히면 몫이 이리로 옵니다.</p>`;
    }
    return `<ul class="mail-list">${list.map((m) => this._rowHtml(m)).join('')}</ul>`;
  }

  _rowHtml(m) {
    const db = this.store.state.db;
    const icon = /고룡|절벽/.test(m.from) ? ICON.dragon : /운영/.test(m.from) ? ICON.event : ICON.default;
    // 아이템 · 골드 · 경험치를 한 줄에 나란히. 고룡 몫은 셋이 함께 온다.
    const chips = (m.items || []).map((it) => {
      const def = db.items[it.id];
      return `<span class="mail-item">${def ? def.name : it.id} ×${it.count}</span>`;
    });
    if (m.gold > 0) chips.push(`<span class="mail-item is-gold">🪙 ${m.gold.toLocaleString()}</span>`);
    if (m.exp > 0) chips.push(`<span class="mail-item is-exp">경험치 ${m.exp.toLocaleString()}</span>`);
    const items = chips.join('');

    return `
      <li class="mail-row ${m.taken ? 'is-taken' : ''}">
        <div class="mail-head">
          <span class="mail-icon">${icon}</span>
          <span class="mail-subject">${m.subject}</span>
          <span class="mail-when">${whenText(m.at)}</span>
        </div>
        <div class="mail-from">${m.from}${m.taken ? '' : untilText(m.expiresAt)}</div>
        <p class="mail-body">${String(m.body || '').replace(/\n/g, '<br>')}</p>
        ${items ? `<div class="mail-items">${items}</div>` : ''}
        ${
          m.taken
            ? `<div class="mail-foot"><span class="muted">받았습니다</span>
                 <button class="mail-drop" data-drop="${m.mid}">버리기</button></div>`
            : `<button class="primary-btn mail-claim" data-claim="${m.mid}">받기</button>`
        }
      </li>`;
  }
}
