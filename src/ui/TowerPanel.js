// 책임: 끝없는 탑 창 — 이번 주 내 기록 · 도전 시작(체크포인트) · 다음 층 미리 보기 · 이번 주/지난 주 상위 10.
// 금지: 층 짜기 · 보상 · 서버 호출. TowerSystem 이 짜고 main.js 가 싸움을 연다. 여기는 보여 주고 알리기만.
//
// 0.80.22 — 처음 만든 창. 탑지기 무영(포이노 마을)에게 말을 걸면 열린다.
import { setHtml } from './keepScroll.js';
import * as Tower from '../systems/TowerSystem.js';
import { leftText } from './RankPanel.js';

const MEDAL = ['🥇', '🥈', '🥉'];

export class TowerPanel {
  constructor({ bus, store, root, assets = null }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.era = 'now';
    this.pick = 1; // 고른 시작 층
    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('tower:opened');
    this.bus.emit('ui:tower-refresh');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('tower:closed');
  }

  render() {
    const state = this.store.state;
    const db = state.db;
    const R = Tower.rules(db);
    const rec = Tower.ensure(state);
    const board = state.towerBoard || { offline: true, top: [], prev: { top: [] } };
    const run = state.towerRun || null;
    const locked = state.player.level < R.unlockLevel;
    const marks = Tower.checkpoints(db, rec.best);
    if (!marks.includes(this.pick)) this.pick = marks[marks.length - 1];
    const next = run ? run.floor + 1 : this.pick;
    const endsAt = board.endsAt || Tower.weekEnd(Tower.weekOf());

    setHtml(this.root, `
      <div class="wp-panel tower-panel">
        <header class="inv-header">
          <h2>끝없는 탑</h2>
          <span class="inv-hint">이번 주 남은 시간 <b>${leftText(endsAt - Date.now())}</b></span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <div class="tower-body">
          <section class="tower-me">
            <div><span>이번 주</span><b>${rec.best ? `${rec.best}층` : '—'}</b>${
              board.mine ? `<i>${board.mine.rank}위 / ${board.total}명</i>` : ''}</div>
            <div><span>여태 최고</span><b>${rec.bestEver ? `${rec.bestEver}층` : '—'}</b></div>
            <div><span>HP</span><b>${state.player.hp.toLocaleString('ko-KR')}</b></div>
          </section>
          ${locked
            ? `<p class="wp-note tower-lock">Lv.${R.unlockLevel} 부터 오를 수 있습니다.</p>`
            : run
              ? this._runHtml(state, run)
              : this._startHtml(state, marks)}
          ${this._previewHtml(state, next, rec)}
          <div class="rank-eras tower-eras">
            <button data-era="now" class="${this.era === 'now' ? 'is-on' : ''}">이번 주</button>
            <button data-era="prev" class="${this.era === 'prev' ? 'is-on' : ''}">지난 주</button>
          </div>
          ${this._listHtml(board)}
          <p class="wp-note">한 층에 한 판 · ${R.bossEvery}층마다 보스, 깨면 HP 를 다 채운다 · 그 사이는 깎인 HP 로 오른다(물약은 저절로) ·
            지면 잃는 것 없이 여기로 · <b>이번 주에 처음 깬 층만</b> 보상 · 주가 바뀌면 1 ~ ${R.weekly.length}위에게 우편</p>
        </div>
      </div>`);

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const b of this.root.querySelectorAll('[data-era]')) {
      b.addEventListener('click', () => { this.era = b.dataset.era; this.render(); });
    }
    for (const b of this.root.querySelectorAll('[data-pick]')) {
      b.addEventListener('click', () => { this.pick = Number(b.dataset.pick) || 1; this.render(); });
    }
    const go = this.root.querySelector('[data-start]');
    if (go) go.addEventListener('click', () => this.bus.emit('tower:start', { start: this.pick }));
    const nx = this.root.querySelector('[data-next]');
    if (nx) nx.addEventListener('click', () => this.bus.emit('tower:next'));
    const lv = this.root.querySelector('[data-leave]');
    if (lv) lv.addEventListener('click', () => this.bus.emit('tower:leave'));
  }

  _startHtml(state, marks) {
    return `
      <section class="tower-start">
        <div class="tower-picks">${marks.map((f) => `
          <button data-pick="${f}" class="${f === this.pick ? 'is-on' : ''}">${f}층부터</button>`).join('')}
        </div>
        <button class="confirm-btn tower-go" data-start>${this.pick}층부터 오르기</button>
        ${state.towerBusy ? '<p class="wp-note">서버에 알리는 중…</p>' : ''}
      </section>`;
  }

  _runHtml(state, run) {
    return `
      <section class="tower-run">
        <p>${run.floor >= run.start
          ? `<b>${run.floor}층</b>까지 올랐다 — 지금 HP 그대로 다음 층에 오른다.`
          : `<b>${run.start}층</b>부터 도전을 열었다.`}</p>
        <div class="tower-run-btns">
          <button class="confirm-btn" data-next>${run.floor + 1}층 오르기</button>
          <button class="tower-leave" data-leave>그만 오르기</button>
        </div>
      </section>`;
  }

  _previewHtml(state, floor, rec) {
    const plan = Tower.floorPlan(state.db, floor, Tower.weekOf());
    const reward = Tower.floorReward(state.db, plan);
    const first = floor > rec.best;
    const names = plan.members.map((m) => `${m.isBoss ? '👑 ' : ''}${esc(m.def.name)} <i>Lv.${m.def.level}</i>`).join(' · ');
    const items = reward.items.map((i) => `${esc((state.db.items[i.id] || {}).name || i.id)} ×${i.count}`).join(' · ');
    return `
      <section class="tower-preview ${plan.boss ? 'is-boss' : ''}">
        <div class="tower-floor">${floor}층${plan.boss ? ' · 보스' : ''}${plan.heal ? ' <em>깨면 HP 회복</em>' : ''}</div>
        <div class="tower-foes">${names || '—'}</div>
        <div class="tower-reward">${first
          ? `이번 주 처음 — 🪙 ${reward.gold.toLocaleString('ko-KR')}${items ? ` · ${items}` : ''}`
          : '이번 주에 이미 깬 층 — 보상 없음'}</div>
      </section>`;
  }

  _listHtml(board) {
    if (board.offline) {
      return '<p class="wp-note">순위는 <b>서버에 접속해서 할 때만</b> 오릅니다. 기록은 이 브라우저에 남습니다.</p>';
    }
    const src = this.era === 'prev' ? (board.prev || { top: [] }) : board;
    const rows = src.top || [];
    if (!rows.length) return `<p class="wp-note">${this.era === 'prev' ? '지난 주에는 아무도 오르지 않았습니다.' : '아직 아무도 오르지 않았습니다 — 첫 이름을 새기세요.'}</p>`;
    const classes = (this.store.state.db.classes && this.store.state.db.classes.list) || {};
    return `<ol class="rank-list">${rows.map((r, i) => `
      <li class="rank-row tower-row ${src.mine && src.mine.rank === r.rank ? 'is-me' : ''}">
        <span class="rank-medal">${MEDAL[i] || r.rank}</span>
        <span class="rank-name">${esc(r.name)}</span>
        <span class="rank-lv">${classes[r.cls] ? esc(classes[r.cls].name) + ' · ' : ''}Lv.${r.level}</span>
        <span class="rank-time">${r.best}층</span>
      </li>`).join('')}</ol>`;
  }
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
