// 책임: 상점 화면(구매/판매 탭) 표시와 버튼 조작.
// 규칙: 조작은 이벤트로만 알린다 — 'ui:buy', 'ui:sell'. 골드/인벤토리는 건드리지 않는다.
// 금지: 가격 계산 → systems/ShopSystem.js + data/formulas.js.

import { makePlaceholder } from '../core/AssetLoader.js';
import { buildStock, buildSellList, quoteSell } from '../systems/ShopSystem.js';
import { computePlayerStats } from '../entities/StatBlock.js';
import { SLOTS } from '../systems/EquipmentSystem.js';
import { isEngraved, isPerfect } from '../systems/AffixSystem.js';
import { enhancedStats } from '../data/formulas.js';
import { captureScroll, restoreScroll } from './keepScroll.js';
import { statLine } from './statLabels.js';
import { replacedBy, compareLine } from './gearCompare.js';
import { subscribeRender, bagSig } from './rerender.js';

/** 뭉치로 파는 물건(물약 등)에 붙일 묶음 구매 버튼. */
const BULK_BUY = [1, 10];

const RARITY_LABEL = {
  common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설',
};

export class ShopPanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.tab = 'buy';
    this.stockIds = [];
    this.shopName = '상점';
    // 판매 탭에서 골라 둔 것들 — uid → 팔 개수. 다시 그려도 선택이 유지된다.
    this.picked = new Map();

    this.root.hidden = true;
    // 돈·물건이 바뀔 때만 다시 그린다. 체력이 차는 것 같은 일로는 안 그린다.
    this._sub = subscribeRender(store, {
      isOpen: () => this.open,
      sig: () => bagSig(this.store.state),
      render: () => this.render(),
    });
  }

  show({ name, stock }) {
    this.open = true;
    this.tab = 'buy';
    this.shopName = name || '상점';
    this.stockIds = stock || [];
    this.picked.clear();
    this._sub.reset();
    this.root.hidden = false;
    this.render();
    this.bus.emit('shop:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('shop:closed');
  }

  /**
   * 다시 그리기 — 스크롤 위치는 잃지 않는다.
   * 실제 그리기는 _render() 가 하고, 여기서는 앞뒤로 위치만 챙긴다.
   * (_render 안에 이른 return 이 있어도 확실히 되돌려 놓기 위해 감쌌다)
   */
  render() {
    const keep = captureScroll(this.root);
    try {
      this._render();
    } finally {
      restoreScroll(this.root, keep);
    }
  }

  _render() {
    const state = this.store.state;
    const equipped = SLOTS.map((s) => state.player.equipment[s]).filter(Boolean);

    this.root.innerHTML = `
      <div class="shop-panel">
        <header class="inv-header">
          <h2>${this.shopName}</h2>
          <div class="shop-gold">🪙 <b>${state.player.gold}</b></div>
          <button class="inv-close" data-close>✕</button>
        </header>
        <nav class="shop-tabs">
          <button data-tab="buy" class="${this.tab === 'buy' ? 'is-on' : ''}">구매</button>
          <button data-tab="sell" class="${this.tab === 'sell' ? 'is-on' : ''}">판매</button>
        </nav>
        <ul class="shop-list" data-list data-keep-scroll="list"></ul>
        <div class="shop-bulk" data-bulk hidden></div>
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.picked.clear();
        this.render();
      });
    }

    const list = this.root.querySelector('[data-list]');
    const gf = computePlayerStats(state).mods.goldFind || 0;
    const rows =
      this.tab === 'buy' ? buildStock(state, this.stockIds) : buildSellList(state, equipped, gf);

    if (!rows.length) {
      list.innerHTML = `<li class="muted inv-empty">${
        this.tab === 'buy' ? '진열된 물건이 없습니다.' : '팔 수 있는 물건이 없습니다.'
      }</li>`;
      return;
    }

    if (this.tab === 'buy') {
      for (const row of rows) list.appendChild(this._buyRow(state, row));
      return;
    }

    // 판매 탭 — 없어진 아이템은 선택에서 지운다(팔고 나면 사라지므로).
    const alive = new Set(rows.map((r) => r.inst.uid));
    for (const uid of [...this.picked.keys()]) if (!alive.has(uid)) this.picked.delete(uid);

    for (const row of rows) list.appendChild(this._sellRow(state, row, equipped));
    this._renderSellBar(state, rows, equipped);
  }

  /** 판매 탭 아래 띠 — 고른 것들의 합계와 "한 번에 팔기" 버튼. */
  _renderSellBar(state, rows, equipped) {
    const bar = this.root.querySelector('[data-bulk]');
    const picks = [...this.picked.entries()].map(([uid, count]) => ({ uid, count }));
    const quote = quoteSell(state, picks, equipped, computePlayerStats(state).mods.goldFind || 0);

    bar.hidden = false;
    bar.innerHTML = `
      <div class="bulk-left">
        <button class="mini-btn" data-pick-all>${
          this.picked.size >= rows.length ? '선택 해제' : '전부 선택'
        }</button>
        <span class="bulk-sum">${
          quote.lines.length
            ? `${quote.lines.length}종 ${quote.count}개 · 🪙 <b>${quote.total}</b>`
            : '팔 것을 고르세요'
        }</span>
      </div>
      <button class="primary-btn" data-sell-many ${quote.lines.length ? '' : 'disabled'}>
        선택한 것 팔기
      </button>`;

    bar.querySelector('[data-pick-all]').addEventListener('click', () => {
      if (this.picked.size >= rows.length) this.picked.clear();
      else for (const r of rows) this.picked.set(r.inst.uid, r.inst.count || 1);
      this.render();
    });

    const sellBtn = bar.querySelector('[data-sell-many]');
    if (sellBtn && !sellBtn.disabled) {
      sellBtn.addEventListener('click', () => {
        this.bus.emit('ui:sell-many', { picks });
        this.picked.clear();
      });
    }
  }

  /**
   * 진열대 한 줄에 적을 능력치.
   *
   * 0.39 — **장비는 지금 낀 것과 견줘 준다.** 예전에는 "공격 +37" 만 적혀서,
   * 지금 낀 검이 30 인지 45 인지 가방을 열어 확인하고 다시 상점으로 돌아와야 했다.
   * 사기 전에 오르는지 내리는지 보이면 그 왕복이 통째로 없어진다.
   */
  _statsText(state, def) {
    if (!def.stats) {
      if (def.use?.hp) return `HP +${def.use.hp}`;
      if (def.use?.buff) return def.use.buff.desc || def.use.buff.name;
      return '';
    }
    if (def.slot) {
      const vs = replacedBy(state, def);
      // 상점 물건은 아직 내 것이 아니므로 강화는 0 — 그래도 벗겨질 쪽은 강화를 먹여 견준다.
      return compareLine(enhancedStats(def.stats, 0, def.rarity), vs && vs.stats);
    }
    return Object.entries(def.stats)
      .map(([k, v]) => statLine(k, v))
      .join(' · ');
  }

  _buyRow(state, { id, def, price }) {
    const li = document.createElement('li');
    li.className = `shop-row rarity-${def.rarity || 'common'}`;
    li.appendChild(this._icon(def.icon || `item_${id}`, 34));

    const stats = this._statsText(state, def);
    const vs = def.slot ? replacedBy(state, def) : null;
    const info = document.createElement('div');
    info.className = 'shop-info';
    info.innerHTML = `
      <span class="shop-name">${def.name}</span>
      <span class="shop-sub">${RARITY_LABEL[def.rarity] || ''}${stats ? ` · ${stats}` : ''}</span>${
      // 무엇과 견준 것인지 적어 준다 — 안 적으면 화살표가 어디서 왔는지 알 수 없다.
      vs ? `<span class="shop-vs">지금 낀 것: ${vs.name}</span>` : ''
    }`;
    li.appendChild(info);

    // 뭉치로 쌓이는 물건(물약·재료)은 10개 묶음으로도 살 수 있게 한다.
    const qtys = def.stackable ? BULK_BUY : [1];
    const box = document.createElement('div');
    box.className = 'shop-buy-btns';
    for (const q of qtys) {
      const btn = document.createElement('button');
      btn.className = 'shop-btn' + (q > 1 ? ' shop-btn--bulk' : '');
      btn.textContent = q > 1 ? `×${q}  🪙 ${price * q}` : `🪙 ${price}`;
      btn.disabled = state.player.gold < price * q;
      btn.addEventListener('click', () => this.bus.emit('ui:buy', { id, qty: q }));
      box.appendChild(btn);
    }
    li.appendChild(box);
    return li;
  }

  _sellRow(state, { inst, def, price }, equipped) {
    const li = document.createElement('li');
    const on = this.picked.has(inst.uid);
    // 각인·초월은 팔기 전에 보여야 한다 — 백에 하나짜리를 모르고 넘기는 일이 실제로 있었다.
    li.className = `shop-row rarity-${def.rarity || 'common'}${on ? ' is-picked' : ''}${
      isPerfect(inst) ? ' is-perfect' : ''
    }`;

    // 고르기 — 줄 아무 데나 눌러도 켜지고 꺼진다(폰에서 체크박스는 너무 작다).
    const check = document.createElement('button');
    check.className = 'shop-check' + (on ? ' is-on' : '');
    check.type = 'button';
    check.setAttribute('aria-pressed', on ? 'true' : 'false');
    check.setAttribute('aria-label', `${def.name} 고르기`);
    check.textContent = on ? '✓' : '';
    li.appendChild(check);

    li.appendChild(this._icon(def.icon || `item_${inst.id}`, 34));

    const stack = inst.count || 1;
    const qty = this.picked.get(inst.uid) || stack;
    const base = (inst.enhance || 0) > 0 ? `${def.name} +${inst.enhance}` : def.name;
    const mark = isPerfect(inst) ? '✦✦ ' : isEngraved(inst) ? '✦ ' : '';
    const name = `${mark}${base}`;
    const info = document.createElement('div');
    info.className = 'shop-info';
    info.innerHTML = `
      <span class="shop-name">${name}</span>
      <span class="shop-sub">${RARITY_LABEL[def.rarity] || ''}${
        stack > 1 ? ` · 보유 ${stack}개` : ''
      }${on && stack > 1 ? ` · <b class="pick-qty">${qty}개 선택</b>` : ''}</span>`;
    li.appendChild(info);

    const toggle = () => {
      if (this.picked.has(inst.uid)) this.picked.delete(inst.uid);
      else this.picked.set(inst.uid, stack);
      this.render();
    };
    check.addEventListener('click', toggle);
    info.addEventListener('click', toggle);

    const btns = document.createElement('div');
    btns.className = 'shop-buy-btns';

    // 뭉치는 "1개만" 도 팔 수 있게 남겨 둔다.
    if (stack > 1) {
      const one = document.createElement('button');
      one.className = 'shop-btn shop-btn--sell';
      one.textContent = `1개 🪙 ${price}`;
      one.addEventListener('click', () => this.bus.emit('ui:sell', { uid: inst.uid, qty: 1 }));
      btns.appendChild(one);
    }

    const btn = document.createElement('button');
    btn.className = 'shop-btn shop-btn--sell';
    btn.textContent = stack > 1 ? `전부 🪙 ${price * stack}` : `팔기 🪙 ${price}`;
    btn.addEventListener('click', () => this.bus.emit('ui:sell', { uid: inst.uid, qty: stack }));
    btns.appendChild(btn);
    li.appendChild(btns);
    return li;
  }

  _icon(key, size) {
    const asset = this.assets.get(key);
    const wrap = document.createElement('div');
    wrap.className = 'inv-icon';
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
    if (asset && asset.ok) {
      const img = document.createElement('img');
      img.src = asset.image.src;
      img.alt = '';
      wrap.appendChild(img);
    } else {
      wrap.appendChild(makePlaceholder(key, size, size, (asset && asset.label) || key));
    }
    return wrap;
  }
}
