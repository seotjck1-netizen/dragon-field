// 책임: 화면 아래 단축키 칸(1~4) 표시와 클릭 처리.
// 금지: 아이템 사용 규칙 판단 → 이벤트('ui:quickuse')만 발행한다.
// 금지: 게임 상태 수정.

import { makePlaceholder } from '../core/AssetLoader.js';
import { BALANCE } from '../data/formulas.js';
import { subscribeRender } from './rerender.js';

export class QuickSlots {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.cooldown = 0;
    this.cooldownMax = 1;
    this._build();
    // 단축칸은 '무엇이 몇 개 들어 있나'만 보여 준다. 체력이 차거나 시간이 흘러도
    // 그 내용은 그대로다 — 그런데도 알림마다 innerHTML 을 통째로 갈아 끼우면
    // 초당 몇 번씩 아이콘이 깜빡인다. 그래서 내용이 바뀔 때만 다시 그린다.
    this._sub = subscribeRender(store, {
      isOpen: () => true,
      sig: () => this._sig(),
      render: () => this.render(),
    });
    this.render();
  }

  _build() {
    this.root.innerHTML = `<div class="qs-row" data-row></div>`;
    this.row = this.root.querySelector('[data-row]');
  }

  /** 남은 쿨타임(ms)을 알려 주면 원형 게이지로 보여 준다. */
  setCooldown(remaining, max) {
    this.cooldown = remaining;
    this.cooldownMax = max || BALANCE.QUICKSLOT_BATTLE_COOLDOWN_MS;
    this._paintCooldown();
  }

  _paintCooldown() {
    const ratio = this.cooldown > 0 ? this.cooldown / this.cooldownMax : 0;
    for (const el of this.row.querySelectorAll('.qs-slot')) {
      const mask = el.querySelector('.qs-cd');
      if (!mask) continue;
      mask.style.opacity = ratio > 0 ? '1' : '0';
      mask.style.height = `${Math.min(1, ratio) * 100}%`;
    }
  }

  /** 지금 칸에 보이는 것의 요약 — 아이템과 개수. */
  _sig() {
    const state = this.store.state;
    if (!state || !state.db) return '';
    const slots = state.quickSlots || [];
    const out = [];
    for (let i = 0; i < BALANCE.QUICKSLOT_COUNT; i++) {
      const id = slots[i] || '-';
      out.push(`${id}:${id === '-' ? 0 : countOf(state, id)}`);
    }
    return out.join(',');
  }

  render() {
    const state = this.store.state;
    const slots = state.quickSlots || [];
    this.row.innerHTML = '';

    for (let i = 0; i < BALANCE.QUICKSLOT_COUNT; i++) {
      const itemId = slots[i] || null;
      const def = itemId ? state.db.items[itemId] : null;
      const count = itemId ? countOf(state, itemId) : 0;

      const el = document.createElement('button');
      el.className = `qs-slot ${def ? 'is-filled' : ''} ${def && count === 0 ? 'is-empty-stock' : ''}`;
      el.title = def ? `${def.name} — ${def.desc || ''}` : `빈 칸 (소지품에서 지정)`;

      const key = document.createElement('span');
      key.className = 'qs-key';
      key.textContent = String(i + 1);
      el.appendChild(key);

      if (def) {
        el.appendChild(this._icon(def.icon || `item_${itemId}`, 30));
        const num = document.createElement('span');
        num.className = 'qs-count';
        num.textContent = count;
        el.appendChild(num);
      }

      const cd = document.createElement('span');
      cd.className = 'qs-cd';
      el.appendChild(cd);

      el.addEventListener('click', () => this.bus.emit('ui:quickuse', { index: i }));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.bus.emit('ui:quickclear', { index: i });
      });
      this.row.appendChild(el);
    }
    this._paintCooldown();
  }

  _icon(key, size) {
    const asset = this.assets.get(key);
    const wrap = document.createElement('span');
    wrap.className = 'qs-icon';
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

function countOf(state, itemId) {
  return state.inventory.filter((i) => i.id === itemId).reduce((s, i) => s + i.count, 0);
}
