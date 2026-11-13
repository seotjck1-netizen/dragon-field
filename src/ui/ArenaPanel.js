// 책임: 결투장 창 — 내 점수 · 오늘 남은 판 · 상대 셋(도전) · 이번 주/지난 주 상위 10 · 최근 기록.
// 금지: 싸움 계산 · 점수 · 서버 호출. 서버가 계산하고 main.js 가 받아 온다. 여기는 보여 주고 알리기만.
//
// 0.80.24 — 처음 만든 창. 결투장 관리인(포이노 마을)에게 말을 걸면 열린다.
import { setHtml } from './keepScroll.js';
import { leftText } from './RankPanel.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export class ArenaPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.open = false;
    this.era = 'now';
    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('arena:opened');
    this.bus.emit('ui:arena-refresh');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('arena:closed');
  }

  render() {
    const state = this.store.state;
    const R = (state.db && state.db.arena) || {};
    const board = state.arenaBoard || { loading: true, top: [], prev: { top: [] } };
    const offer = state.arenaOffer || null;
    const busy = !!state.arenaBusy;
    const unlock = R.unlockLevel || 20;
    const locked = state.player.level < unlock;
    const me = board.me || null;
    const classes = (state.db.classes && state.db.classes.list) || {};
    const clsName = (c) => (classes[c] ? classes[c].name : c || '');

    let body;
    if (board.offline) {
      body = '<p class="wp-note arena-note">결투장은 <b>서버에 접속했을 때만</b> 열립니다 — 상대가 다른 사람이라서요.</p>';
    } else if (locked) {
      body = `<p class="wp-note arena-note">Lv.${unlock} 부터 결투장에 설 수 있습니다.</p>`;
    } else {
      const left = me ? me.left : R.dailyFights || 5;
      body = `
        <section class="tower-me arena-me">
          <div><span>이번 주 점수</span><b>${me ? me.rating : R.start || 1000}</b>${
            board.mine ? `<i>${board.mine.rank}위 / ${board.total}명</i>` : ''}</div>
          <div><span>승 · 패</span><b>${me ? `${me.wins} · ${me.losses}` : '0 · 0'}</b></div>
          <div><span>오늘 남은 판</span><b>${left} / ${board.daily || R.dailyFights || 5}</b></div>
        </section>
        <section class="arena-offer">
          <div class="arena-offer-head">
            <b>상대</b>
            <button class="tower-leave arena-reroll" data-offer ${busy ? 'disabled' : ''}>${offer ? '다른 상대 받기' : '상대 받기'}</button>
          </div>
          ${offer && offer.list && offer.list.length
            ? `<ul class="arena-foes">${offer.list.map((o) => `
                <li class="arena-foe">
                  <div class="arena-foe-who"><b>${esc(o.name)}</b><i>${esc(clsName(o.cls))} · Lv.${o.level}</i></div>
                  <div class="arena-foe-num"><span>점수 <b>${o.rating}</b></span><span>전투력 ${Number(o.power || 0).toLocaleString('ko-KR')}</span></div>
                  <div class="arena-foe-bet">이기면 <b class="up">+${o.win}</b> · 지면 <b class="down">${o.lose}</b></div>
                  <button class="confirm-btn arena-go" data-fight="${esc(o.id)}" ${busy || left <= 0 ? 'disabled' : ''}>도전</button>
                </li>`).join('')}</ul>`
            : offer
              ? '<p class="wp-note">아직 겨룰 사람이 없습니다 — 다른 사람이 결투장에 들르면 나타납니다.</p>'
              : '<p class="wp-note">「상대 받기」를 누르면 내 점수 근처의 세 사람을 보여 줍니다.</p>'}
          ${busy ? '<p class="wp-note">서버가 계산하는 중…</p>' : ''}
        </section>`;
    }

    setHtml(this.root, `
      <div class="wp-panel tower-panel arena-panel">
        <header class="inv-header">
          <h2>결투장</h2>
          <span class="inv-hint">${board.endsAt ? `이번 주 남은 시간 <b>${leftText(board.endsAt - Date.now())}</b>` : ''}</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <div class="tower-body">
          ${body}
          <div class="rank-eras tower-eras">
            <button data-era="now" class="${this.era === 'now' ? 'is-on' : ''}">이번 주</button>
            <button data-era="prev" class="${this.era === 'prev' ? 'is-on' : ''}">지난 주</button>
            <button data-era="log" class="${this.era === 'log' ? 'is-on' : ''}">내 기록</button>
          </div>
          ${this.era === 'log' ? this._logHtml(board, clsName) : this._listHtml(board, clsName)}
          <p class="wp-note">싸움은 서버가 계산합니다 · 상대는 접속해 있지 않아도 됩니다(마지막으로 올린 몸으로 막는다) ·
            물약은 안 씁니다 · 직업 보정 없음 · 하루 ${R.dailyFights || 5}판 · 주가 바뀌면 1 ~ ${(R.weekly || []).length || 5}위에게 우편</p>
        </div>
      </div>`);

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const b of this.root.querySelectorAll('[data-era]')) {
      b.addEventListener('click', () => { this.era = b.dataset.era; this.render(); });
    }
    const off = this.root.querySelector('[data-offer]');
    if (off) off.addEventListener('click', () => this.bus.emit('arena:offer'));
    for (const b of this.root.querySelectorAll('[data-fight]')) {
      b.addEventListener('click', () => this.bus.emit('arena:fight', { target: b.dataset.fight }));
    }
  }

  _listHtml(board, clsName) {
    if (board.offline) return '';
    if (board.loading && !(board.top || []).length) return '<p class="wp-note">받아 오는 중…</p>';
    const src = this.era === 'prev' ? (board.prev || { top: [] }) : board;
    const rows = src.top || [];
    if (!rows.length) return `<p class="wp-note">${this.era === 'prev' ? '지난 주에는 아무도 겨루지 않았습니다.' : '아직 아무도 겨루지 않았습니다 — 첫 이름을 새기세요.'}</p>`;
    return `<ol class="rank-list">${rows.map((r, i) => `
      <li class="rank-row tower-row ${src.mine && src.mine.rank === r.rank ? 'is-me' : ''}">
        <span class="rank-medal">${MEDAL[i] || r.rank}</span>
        <span class="rank-name">${esc(r.name)}</span>
        <span class="rank-lv">${esc(clsName(r.cls))} · Lv.${r.level} · ${r.wins}승 ${r.losses}패</span>
        <span class="rank-time">${r.rating}</span>
      </li>`).join('')}</ol>`;
  }

  _logHtml(board, clsName) {
    const rows = board.log || [];
    if (!rows.length) return '<p class="wp-note">아직 겨룬 판이 없습니다.</p>';
    return `<ul class="arena-log">${rows.map((r) => `
      <li class="${r.win ? 'is-win' : r.draw ? '' : 'is-lose'}">
        <span>${r.role === 'attack' ? '⚔ 걸었다' : '🛡 막았다'}</span>
        <b>${esc(r.vs)}</b><i>${esc(clsName(r.cls))}</i>
        <em>${r.win ? '승' : r.draw ? '무' : '패'} ${r.delta > 0 ? '+' : ''}${r.delta}</em>
      </li>`).join('')}</ul>`;
  }
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
