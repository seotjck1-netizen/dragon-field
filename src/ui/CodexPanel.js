// 책임: 도감 · 업적 창 — 탭 셋(몬스터 · 장비 · 업적).
// 금지: 기록 · 판정 · 보상. CodexSystem 이 적고 main.js 가 보상을 넣는다. 여기는 보여 주기만.
//
// 0.80.21 — 처음 만든 창.
//   몬스터  만난 적 없는 놈은 그림자와 '???' — 무엇이 남았는지는 보이되 이름은 숨긴다
//   장비    얻은 적이 있는 가장 높은 등급의 색으로 이름을 칠한다
//   업적    묶음(사냥 · 보스 · 성장 · 장비 · 도감)마다, 해낸 것은 아래로 내려간다
import { setHtml } from './keepScroll.js';
import * as Codex from '../systems/CodexSystem.js';
import { GRADE_ORDER, gradeName } from '../data/gear.js';

const TABS = [
  { id: 'mon', label: '몬스터' },
  { id: 'item', label: '장비' },
  { id: 'ach', label: '업적' },
];

const SLOT_NAME = {
  weapon: '무기', helmet: '투구', shoulder: '어깨', armor: '갑옷', gloves: '장갑',
  boots: '신발', belt: '허리띠', necklace: '목걸이', ring: '반지',
};
const SLOT_ORDER = Object.keys(SLOT_NAME);

export class CodexPanel {
  constructor({ bus, store, root, assets = null }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.tab = 'mon';
    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show(tab = null) {
    if (tab && TABS.some((t) => t.id === tab)) this.tab = tab;
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('codex:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('codex:closed');
  }

  render() {
    const state = this.store.state;
    const sum = Codex.totals(state);
    const pct = (x) => (x.all ? Math.floor((x.have / x.all) * 100) : 0);
    const counts = { mon: sum.mon, item: sum.item, ach: sum.ach };
    const body = this.tab === 'mon' ? this._monHtml(state) : this.tab === 'item' ? this._itemHtml(state) : this._achHtml(state);

    setHtml(this.root, `
      <div class="wp-panel codex-panel">
        <header class="inv-header">
          <h2>도감 · 업적</h2>
          <span class="inv-hint">모은 것과 해낸 것 — 보상은 해낸 자리에서 들어옵니다</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <div class="rank-tabs codex-tabs">${TABS.map((t) => `
          <button data-tab="${t.id}" class="${t.id === this.tab ? 'is-on' : ''}">
            ${t.label} <i>${counts[t.id].have}/${counts[t.id].all}</i>
          </button>`).join('')}
        </div>
        <div class="codex-bar" title="${pct(counts[this.tab])}%">
          <span style="width:${pct(counts[this.tab])}%"></span>
        </div>
        <div class="codex-body">${body}</div>
      </div>`);

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.render();
      });
    }
  }

  _img(key, cls) {
    const a = this.assets ? this.assets.get(key) : null;
    if (!a || !a.ok || !a.image) return `<span class="${cls} codex-noimg"></span>`;
    return `<img class="${cls}" src="${esc(a.image.src)}" alt="" loading="lazy" />`;
  }

  _monHtml(state) {
    const db = state.db;
    const c = Codex.ensure(state);
    const cards = Codex.monsterIds(db).map((id) => {
      const def = db.monsters[id];
      const got = c.mon[id];
      if (!got) {
        return `<li class="codex-card is-unknown">
          ${this._img(def.battleSprite || def.sprite, 'codex-mon')}
          <b>???</b><span>Lv.${def.level}</span></li>`;
      }
      return `<li class="codex-card" title="${esc(def.name)}">
        ${this._img(def.battleSprite || def.sprite, 'codex-mon')}
        <b>${esc(def.name)}</b>
        <span>Lv.${def.level} · ${got.kills ? `${got.kills.toLocaleString('ko-KR')}마리` : '아직 못 잡음'}</span>
      </li>`;
    });
    return `<ul class="codex-grid">${cards.join('')}</ul>`;
  }

  _itemHtml(state) {
    const db = state.db;
    const c = Codex.ensure(state);
    const ids = Codex.gearIds(db).slice().sort((a, b) => {
      const sa = SLOT_ORDER.indexOf(db.items[a].slot);
      const sb = SLOT_ORDER.indexOf(db.items[b].slot);
      return sa - sb;
    });
    const groups = new Map();
    for (const id of ids) {
      const slot = db.items[id].slot;
      if (!groups.has(slot)) groups.set(slot, []);
      groups.get(slot).push(id);
    }
    const out = [];
    for (const [slot, list] of groups) {
      const have = list.filter((id) => c.item[id] !== undefined).length;
      out.push(`<h3 class="codex-h">${SLOT_NAME[slot] || slot} <i>${have}/${list.length}</i></h3>`);
      out.push(`<ul class="codex-items">${list.map((id) => {
        const def = db.items[id];
        const r = c.item[id];
        if (r === undefined) {
          return `<li class="codex-item is-unknown">${this._img(def.icon || `item_${id}`, 'codex-icon')}<b>???</b></li>`;
        }
        const g = GRADE_ORDER[r] || 'common';
        return `<li class="codex-item" title="${esc(def.name)} — 얻은 가장 높은 등급: ${gradeName(g)}">
          ${this._img(def.icon || `item_${id}`, 'codex-icon')}
          <b class="rarity-${g}">${esc(def.name)}</b><span class="rarity-${g}">${gradeName(g)}</span></li>`;
      }).join('')}</ul>`);
    }
    return out.join('');
  }

  _achHtml(state) {
    const db = state.db;
    const list = Codex.achievements(db);
    const groups = new Map();
    for (const a of list) {
      const g = a.group || '기타';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(a);
    }
    const out = [];
    for (const [name, items] of groups) {
      const rows = items.map((a) => ({ a, p: Codex.progress(state, a) }));
      const doneN = rows.filter((x) => x.p.done).length;
      // 아직 못 한 것을 위로 — 할 일이 먼저 보여야 한다.
      rows.sort((x, y) => Number(x.p.done) - Number(y.p.done));
      out.push(`<h3 class="codex-h">${esc(name)} <i>${doneN}/${rows.length}</i></h3>`);
      out.push(`<ul class="codex-achs">${rows.map(({ a, p }) => {
        const ratio = p.need ? Math.min(1, p.have / p.need) : 0;
        const big = p.need > 1;
        return `<li class="codex-ach ${p.done ? 'is-done' : ''}">
          <div class="codex-ach-top">
            <b>${p.done ? '🏆 ' : ''}${esc(a.name)}</b>
            <span class="codex-gift">${esc(Codex.rewardText(db, a.reward))}</span>
          </div>
          <div class="codex-ach-desc">${esc(a.desc || '')}</div>
          ${p.done
            ? `<div class="codex-ach-at">${p.at > 1 ? new Date(p.at).toLocaleDateString('ko-KR') : ''} 달성</div>`
            : big
              ? `<div class="codex-bar codex-bar--row"><span style="width:${Math.floor(ratio * 100)}%"></span>
                 <em>${p.have.toLocaleString('ko-KR')} / ${p.need.toLocaleString('ko-KR')}</em></div>`
              : ''}
        </li>`;
      }).join('')}</ul>`);
    }
    return out.join('');
  }
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
