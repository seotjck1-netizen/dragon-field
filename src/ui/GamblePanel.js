// 책임: 보석 노인의 좌판 — 내놓을 보석 고르기, 받을 보석 고르기, 무작위 한 알 사기.
// 금지: 실제 교환 처리 → 이벤트('ui:gemTrade' · 'ui:gemBuy')만 발행한다.
// 금지: 규칙 판단 → systems/GambleSystem.js 가 준 값을 보여 주기만 한다.

import { makePlaceholder } from '../core/AssetLoader.js';
import { ownedGems, gemTotal, canTrade, canBuy, TRADE_COST } from '../systems/GambleSystem.js';
import { BALANCE } from '../data/formulas.js';
import { subscribeRender, bagSig } from './rerender.js';
import { setHtml } from './keepScroll.js';

export class GamblePanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.title = '보석 노인';
    /** 내놓을 보석 — { 보석id: 개수 }. 합이 딱 세 알이어야 바꿀 수 있다. */
    this.picks = {};
    /** 받을 보석 id. */
    this.want = null;

    this.root.hidden = true;
    this._sub = subscribeRender(store, {
      isOpen: () => this.open,
      sig: () => bagSig(this.store.state),
      render: () => this.render(),
    });
  }

  show({ name } = {}) {
    this.open = true;
    this.title = name || '보석 노인';
    this.picks = {};
    this.want = null;
    this._sub.reset();
    this.root.hidden = false;
    this.render();
    this.bus.emit('gamble:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('gamble:closed');
  }

  /** 지금 고른 알 수. */
  _picked() {
    return Object.values(this.picks).reduce((a, n) => a + (n || 0), 0);
  }

  render() {
    const state = this.store.state;
    const owned = ownedGems(state);
    const total = gemTotal(state);
    const picked = this._picked();
    const price = BALANCE.GEM_GAMBLE_PRICE;
    const buy = canBuy(state);
    const gold = (state.player && state.player.gold) || 0;

    // 가진 보석이 세 알보다 적으면 바꾸는 쪽은 아예 못 연다 — 왜 안 되는지 먼저 말한다.
    const tradeNote = total < TRADE_COST
      ? `보석이 ${TRADE_COST}알은 있어야 바꿀 수 있습니다. (지금 ${total}알)`
      : `내놓을 보석을 눌러 <b>${TRADE_COST}알</b>을 고르세요. (고른 것 ${picked}/${TRADE_COST})`;

    // 받을 수 있는 보석은 **표에 있는 전부**다 — 내가 가진 것만 받을 수 있으면
    // 이 노인이 있을 이유가 없다(없는 것을 얻으려고 오는 자리다).
    const all = (state.db.affixes && state.db.affixes['보석']) || [];
    const wantable = all
      .filter((r) => Array.isArray(r) && state.db.items[r[0]])
      .map((r) => ({ id: r[0], name: state.db.items[r[0]].name, effect: r[4] === 'percent'
        ? `+${+(Number(r[3]) * 100).toFixed(1)}%` : `+${r[3]}` , key: r[2] }));

    const ok = canTrade(state, this.picks, this.want).ok;

    setHtml(this.root, `
      <div class="shop-panel gamble-panel">
        <header class="inv-header">
          <h2>${this.title}</h2>
          <span class="inv-hint">셋을 주면 하나를 고른다</span>
          <button class="inv-close" data-close>✕</button>
        </header>

        <section class="gamble-sec">
          <h3>보석 ${TRADE_COST}알 → 원하는 １알</h3>
          <p class="gamble-note">${tradeNote}</p>
          <div class="gamble-row" data-give>${
            owned.length
              ? owned.map((g) => {
                  const n = this.picks[g.id] || 0;
                  return `<button data-give="${g.id}" class="${n ? 'is-armed' : ''}"
                    title="${g.name} — ${g.effect} · 가진 것 ${g.count}알">
                    ${g.name} <span class="muted">${n ? `${n}/${g.count}` : `×${g.count}`}</span>
                  </button>`;
                }).join('')
              : '<p class="muted">가진 보석이 없습니다.</p>'
          }</div>

          <p class="gamble-note">받을 보석</p>
          <div class="gamble-row" data-want>${wantable.map((g) => `
            <button data-want="${g.id}" class="${this.want === g.id ? 'is-armed' : ''}"
              title="${g.name} ${g.effect}">${g.name} <span class="muted">${g.effect}</span></button>`).join('')}
          </div>

          <button class="shop-btn gamble-do" data-trade ${ok ? '' : 'disabled'}>
            ${this.want && picked === TRADE_COST
              ? `${TRADE_COST}알을 내주고 ${(state.db.items[this.want] || {}).name || ''} 받기`
              : '보석 3알과 받을 보석을 고르세요'}
          </button>
        </section>

        <section class="gamble-sec">
          <h3>무작위 １알 사기</h3>
          <p class="gamble-note">
            🪙 <b>${price.toLocaleString('ko-KR')}</b> — 무엇이 나올지는 노인도 모릅니다.
            (가진 골드 ${gold.toLocaleString('ko-KR')})
          </p>
          <button class="shop-btn gamble-do" data-buy ${buy.ok ? '' : 'disabled'}>
            ${buy.ok ? '한 알 뽑기' : buy.reason}
          </button>
        </section>
      </div>`);

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());

    for (const btn of this.root.querySelectorAll('[data-give]')) {
      const id = btn.dataset.give;
      if (!id) continue;
      btn.addEventListener('click', () => {
        const have = (owned.find((g) => g.id === id) || {}).count || 0;
        const now = this.picks[id] || 0;
        // 한 번 누를 때마다 한 알씩. 가진 만큼, 그리고 세 알까지만 올라간다.
        // 세 알을 다 채운 뒤 또 누르면 그 보석은 0 으로 돌아간다(고쳐 고르기).
        if (now >= have || this._picked() >= TRADE_COST) delete this.picks[id];
        else this.picks[id] = now + 1;
        this.render();
      });
    }
    for (const btn of this.root.querySelectorAll('[data-want]')) {
      btn.addEventListener('click', () => {
        this.want = this.want === btn.dataset.want ? null : btn.dataset.want;
        this.render();
      });
    }
    this.root.querySelector('[data-trade]').addEventListener('click', () => {
      this.bus.emit('ui:gemTrade', { picks: { ...this.picks }, want: this.want });
      this.picks = {};
      this.want = null;
    });
    this.root.querySelector('[data-buy]').addEventListener('click', () => {
      this.bus.emit('ui:gemBuy', {});
    });
  }
}
