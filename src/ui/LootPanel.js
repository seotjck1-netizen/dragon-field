// 책임: 아이템 획득 창 — 몬스터에게서 얻은 장비가 **지금 것보다 좋을 때만** 그림 · 옵션 · 비교와 함께 띄우고,
//        「장착」 / 「가방에 넣기」 를 고르게 한다.
// 금지: 무엇이 더 좋은지 재기 · 장착하기. main.js 가 재서(전투력) 넘겨 주고, 장착은 'ui:equip' 으로 알린다.
//
// 0.80.26 — 사용자 요청(2026-11-13): "몹을 잡고 아이템 획득시 위에 글씨만 나오는 게 아니라 아이템 획득 창이 떠서
//   이미지와 함께 볼 수 있게 하고, 현재 장비에서 교체할 것인지 가방에 넣을 건지 선택할 수 있게."
//   사용자 답: **더 나은 장비만 창**(나머지는 지금처럼 글씨) · 필드 싸움 중이면 끝난 뒤에.
//   물건은 얻는 순간 이미 가방에 들어가 있다 — 「가방에 넣기」 는 그대로 닫는 것이고, 「장착」 은 바로 낀다.
import { setHtml } from './keepScroll.js';
import { gradeOf, GRADES, slotGroup, tierOf } from '../data/gear.js';
import { gearSummary, itemExtras } from '../systems/AffixSystem.js';
import { makePlaceholder } from '../core/AssetLoader.js';

const SLOT_LABEL = {
  weapon: '무기', helmet: '투구', armor: '갑옷', shoulder: '어깨', gloves: '장갑', boots: '신발',
  ring: '반지', ring1: '반지', ring2: '반지', necklace: '목걸이', belt: '허리띠',
};

export class LootPanel {
  constructor({ bus, store, assets, root }) {
    this.bus = bus;
    this.store = store;
    this.assets = assets;
    this.root = root;
    this.open = false;
    this.offer = null;
    this.root.hidden = true;
  }

  /**
   * @param {{uid, slot, before:number, after:number, replacedUid:string|null}} offer main.js 의 upgradeOf 가 잰 것
   */
  show(offer) {
    this.offer = offer;
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('loot:opened', offer);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.offer = null;
    this.root.hidden = true;
    this.bus.emit('loot:closed');
  }

  /** 「장착」 — 고른 칸에 낀다(반지는 잰 칸에). */
  equip() {
    const o = this.offer;
    if (!o) return;
    this.close();
    this.bus.emit('ui:equip', { uid: o.uid, slot: o.slot });
  }

  /** 「가방에 넣기」 — 이미 가방에 있다. 닫기만 한다. */
  keep() {
    this.close();
  }

  render() {
    const state = this.store.state;
    const o = this.offer;
    const inst = o && state.inventory.find((i) => i.uid === o.uid);
    const def = inst && state.db.items[inst.id];
    if (!inst || !def) { this.close(); return; }
    const old = o.replacedUid ? state.inventory.find((i) => i.uid === o.replacedUid) : null;
    const oldDef = old && state.db.items[old.id];
    const grade = gradeOf(inst, def);
    const gain = o.after - o.before;
    const pct = o.before > 0 ? (gain / o.before) * 100 : 0;

    setHtml(this.root, `
      <div class="loot-card rarity-border-${grade}" role="dialog" aria-label="아이템 획득">
        <div class="loot-head">
          <span class="loot-tag">새 장비 — 지금 것보다 좋다</span>
          <button class="inv-close" data-keep aria-label="닫기">✕</button>
        </div>
        <div class="loot-main">
          <div class="loot-icon" data-icon></div>
          <div class="loot-title">
            <b class="loot-name rarity-${grade}">[${GRADES[grade].name}] ${esc(def.name)}${inst.enhance ? ` +${inst.enhance}` : ''}</b>
            <span class="loot-type">${SLOT_LABEL[def.slot] || ''}${slotGroup(def.slot) === 'accessory' ? '' : ` · ${tierOf(def)}단계`}</span>
          </div>
        </div>
        <ul class="loot-lines">${this._lines(state, inst, def)}</ul>
        <div class="loot-compare">
          <div class="loot-vs">
            <span>지금 ${SLOT_LABEL[o.slot] || ''}</span>
            ${old && oldDef
              ? `<b class="rarity-${gradeOf(old, oldDef)}">[${GRADES[gradeOf(old, oldDef)].name}] ${esc(oldDef.name)}${old.enhance ? ` +${old.enhance}` : ''}</b>
                 <i>${this._baseText(state, old, oldDef)}</i>`
              : '<b class="loot-empty">비어 있음</b>'}
          </div>
          <div class="loot-power">전투력 <b>${fmt(o.before)}</b> → <b class="loot-up">${fmt(o.after)}</b>
            <em>+${fmt(gain)}${pct >= 0.1 ? ` (+${pct.toFixed(pct < 10 ? 1 : 0)}%)` : ''}</em></div>
        </div>
        <div class="loot-btns">
          <button class="confirm-btn" data-equip>장착 (Enter)</button>
          <button class="tower-leave" data-keep>가방에 넣기 (Esc)</button>
        </div>
      </div>`);
    const iconBox = this.root.querySelector('[data-icon]');
    if (iconBox) iconBox.appendChild(this._icon(def.icon || `item_${inst.id}`, 72));
    this.root.querySelector('[data-equip]').addEventListener('click', () => this.equip());
    for (const b of this.root.querySelectorAll('[data-keep]')) b.addEventListener('click', () => this.keep());
  }

  _baseText(state, inst, def) {
    const s = gearSummary(state.db, inst, def);
    if (s.group === 'weapon') return `대미지 ${s.base}`;
    if (s.group === 'armor') return `방어 ${s.base}`;
    return `옵션 ${(inst.affixes || []).length}줄`;
  }

  _lines(state, inst, def) {
    const s = gearSummary(state.db, inst, def);
    const out = [];
    if (s.group === 'weapon') out.push(`<li class="loot-base">무기 대미지 <b>${s.base}</b></li>`);
    if (s.group === 'armor') out.push(`<li class="loot-base">방어 <b>${s.base}</b></li>`);
    if (s.innate) out.push(`<li>${esc(s.innate.label || s.innate.name || '')}</li>`);
    for (const e of itemExtras(state.db, inst)) {
      out.push(`<li class="loot-${e.kind}">${esc(e.text)}</li>`);
    }
    return out.join('');
  }

  _icon(key, size) {
    const asset = this.assets && this.assets.get(key);
    const wrap = document.createElement('div');
    wrap.className = 'inv-icon';
    wrap.style.width = `${size}px`;
    wrap.style.height = `${size}px`;
    if (asset && asset.ok) {
      const img = document.createElement('img');
      img.src = asset.image.src;
      img.width = size;
      img.height = size;
      img.alt = '';
      wrap.appendChild(img);
    } else {
      wrap.appendChild(makePlaceholder(key, size, size, (asset && asset.label) || key));
    }
    return wrap;
  }
}

const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');

function esc(v) {
  return String(v).replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
