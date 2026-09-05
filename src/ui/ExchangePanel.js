// 책임: 연금술사의 재료 교환 목록 표시와 버튼 조작.
// 금지: 실제 교환 처리 → 이벤트('ui:exchange')만 발행한다.
// 금지: 가능 여부 계산 → systems/ExchangeSystem.js 가 준 값을 표시만 한다.

import { makePlaceholder } from '../core/AssetLoader.js';
import { buildRecipes } from '../systems/ExchangeSystem.js';
import { subscribeRender, bagSig } from './rerender.js';
import { attachTip } from './Tooltip.js';
import { gemDef } from '../systems/AffixSystem.js';

/** 등급 이름 — 쪽지 첫 줄에 색을 주기 위한 것. */
const RARITY_NAME = {
  common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설',
};

/**
 * 아이템 하나의 설명 쪽지 내용.
 *
 * 보석이면 **표에 적힌 실제 수치**를 그대로 보여 준다 — 설명 글보다 이쪽이 진실이라
 * 표를 고치면 쪽지도 같이 바뀐다. 마녀에게서 보석을 살 때 무엇을 사는지 모르고
 * 징표를 쓰는 일이 없어야 한다.
 */
function itemTipLines(db, id) {
  const def = (db.items || {})[id];
  if (!def) return [id];
  const lines = [`${def.name} <span class="tip-rarity r-${def.rarity || 'common'}">${
    RARITY_NAME[def.rarity] || ''}</span>`];

  const g = gemDef(db, id);
  if (g) {
    const val = g.show === 'percent' ? `+${+(g.value * 100).toFixed(1)}%` : `+${g.value}`;
    // 수치는 표에서, 어디에 박는지는 아이템 설명에서 온다.
    // 설명에도 수치가 적혀 있지만 그건 사람이 읽는 글이고, 여기 ◈ 줄이 진실이다.
    lines.push({ kind: 'effect', text: `◈ ${g.name} ${val}` });
  } else {
    const st = def.stats || {};
    const bits = [];
    if (st.atk) bits.push(`공격 +${st.atk}`);
    if (st.def) bits.push(`방어 +${st.def}`);
    if (st.hp) bits.push(`체력 +${st.hp}`);
    if (st.spd) bits.push(`속도 +${st.spd}`);
    if (st.crit) bits.push(`치명 +${+(st.crit * 100).toFixed(1)}%`);
    if (st.critDmg) bits.push(`치명피해 +${+(st.critDmg * 100).toFixed(1)}%`);
    if (def.use && def.use.hp) bits.push(`HP ${def.use.hp} 회복`);
    if (bits.length) lines.push({ kind: 'effect', text: bits.join(' · ') });
  }
  if (def.desc) lines.push({ kind: 'note', text: String(def.desc).replace(/\n/g, '<br>') });
  return lines;
}

export class ExchangePanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.title = '재료 교환';
    this.recipes = [];

    this.root.hidden = true;
    this._sub = subscribeRender(store, {
      isOpen: () => this.open,
      sig: () => bagSig(this.store.state),
      render: () => this.render(),
    });
  }

  show({ name, recipes }) {
    this.open = true;
    this.title = name || '재료 교환';
    this.recipes = recipes || [];
    this._sub.reset();
    this.root.hidden = false;
    this.render();
    this.bus.emit('exchange:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('exchange:closed');
  }

  render() {
    const state = this.store.state;
    const rows = buildRecipes(state, this.recipes);

    this.root.innerHTML = `
      <div class="shop-panel">
        <header class="inv-header">
          <h2>${this.title}</h2>
          <span class="inv-hint">쓸모없는 재료를 강화 재료로</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <ul class="shop-list" data-list></ul>
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    const list = this.root.querySelector('[data-list]');

    if (!rows.length) {
      list.innerHTML = '<li class="muted inv-empty">교환할 수 있는 것이 없습니다.</li>';
      return;
    }

    for (const row of rows) list.appendChild(this._row(row));
  }

  _row(recipe) {
    const li = document.createElement('li');
    li.className = 'shop-row exchange-row';

    const give = document.createElement('div');
    give.className = 'ex-side';
    for (const g of recipe.give) {
      const cell = document.createElement('div');
      cell.className = `ex-cell ${g.have >= g.count ? '' : 'is-lacking'}`;
      cell.appendChild(this._icon(g.def.icon || `item_${g.id}`, 26));
      const label = document.createElement('span');
      label.innerHTML = `${g.def.name}<b>${g.have}/${g.count}</b>`;
      cell.appendChild(label);
      attachTip(cell, () => itemTipLines(this.store.state.db, g.id));
      give.appendChild(cell);
    }
    li.appendChild(give);

    const arrow = document.createElement('span');
    arrow.className = 'ex-arrow';
    arrow.textContent = '→';
    li.appendChild(arrow);

    const get = document.createElement('div');
    get.className = 'ex-side ex-side--get';
    const cell = document.createElement('div');
    cell.className = 'ex-cell';
    cell.appendChild(this._icon(recipe.get.def.icon || `item_${recipe.get.id}`, 30));
    const label = document.createElement('span');
    label.innerHTML = `${recipe.get.def.name}<b>×${recipe.get.count}</b>`;
    cell.appendChild(label);
    // 마녀에게서 보석을 살 때 무엇을 사는지 보여 준다.
    attachTip(cell, () => itemTipLines(this.store.state.db, recipe.get.id));
    get.appendChild(cell);
    li.appendChild(get);

    const btns = document.createElement('div');
    btns.className = 'ex-btns';

    const btn = document.createElement('button');
    btn.className = 'shop-btn';
    btn.textContent = '교환';
    btn.disabled = !recipe.ok;
    btn.addEventListener('click', () => this.bus.emit('ui:exchange', { index: recipe.index }));
    btns.appendChild(btn);

    // '전부' — 가진 재료로 할 수 있는 만큼 한 번에.
    // 젤리 60개를 스무 번 눌러 바꾸는 것은 조작이 아니라 노동이다.
    const all = document.createElement('button');
    all.className = 'shop-btn shop-btn--all';
    all.textContent = recipe.times > 1 ? `전부 ×${recipe.times}` : '전부';
    all.disabled = recipe.times < 2;
    all.title = recipe.times > 1 ? `${recipe.times}번 한꺼번에 교환합니다.` : '두 번 이상 바꿀 재료가 없습니다.';
    all.addEventListener('click', () =>
      this.bus.emit('ui:exchange', { index: recipe.index, all: true })
    );
    btns.appendChild(all);

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
