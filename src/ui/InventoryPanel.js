// 책임: 소지품/장비 목록 표시와 버튼 조작. 상태를 직접 바꾸지 않는다.
// 규칙: 사용자의 조작은 전부 이벤트로 발행하고, 실제 처리는 main.js가 시스템에 위임한다.
// 금지: 게임 상태 수정, 강화 확률 계산(formulas가 준 값을 표시만 한다).

import { makePlaceholder } from '../core/AssetLoader.js';
import {
  enhancedStats, rerollCost, enhanceMaterial, combatPower, BALANCE,
} from '../data/formulas.js';
import { computePlayerStats } from '../entities/StatBlock.js';
import {
  listWithDefs,
  countOf,
  CATEGORIES,
  filterByCategory,
  countByCategory,
  categoryOf,
} from '../systems/InventorySystem.js';
import {
  SLOT_GROUPS,
  SLOT_LABEL,
  groupOf,
  isEquipped,
  equippedSlotOf,
  slotsForItem,
  canEnhance,
  canTranscend,
} from '../systems/EquipmentSystem.js';
import {
  itemExtras, socketsOf, gemDefs, canSocket, canReroll, isEngraved, isPerfect, canDrill, DRILL_ITEM, MAX_SOCKETS,
  setOf, setProgress, transmuteState,
} from '../systems/AffixSystem.js';
import { captureScroll, restoreScroll } from './keepScroll.js';
import { STAT_LABEL, fmtStat } from './statLabels.js';
import { replacedBy, compareStats, diffHtml } from './gearCompare.js';
import { subscribeRender, bagSig } from './rerender.js';

const RARITY_LABEL = {
  common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설',
};

// 아이템 상세의 "분류" 표시(ring 은 슬롯 이름이 ring1/ring2 라 따로 적는다)
const TYPE_LABEL = { ...SLOT_LABEL, ring: '반지' };

export class InventoryPanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.selectedUid = null;
    this.mode = 'bag'; // 'bag' | 'forge'(마을 대장간) | 'transcend'(성 안 왕실 대장간)
    this._gemArm = null; // '정말 박을까요?' 로 물어 둔 보석 id
    this._gemArmT = null;
    this.title = '소지품';
    this.category = 'all'; // 분류 탭 (systems/InventorySystem.js 의 CATEGORIES)

    this.root.hidden = true;
    this._sub = subscribeRender(store, {
      isOpen: () => this.open,
      sig: () => bagSig(this.store.state),
      render: () => this.render(),
    });
    this._unsub = this._sub.unsubscribe;
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  /** @param {{mode?:'bag'|'forge', title?:string}} opts */
  show(opts = {}) {
    this.open = true;
    this.mode = opts.mode || 'bag';
    this.title =
      opts.title ||
      (this.mode === 'forge' ? '대장간' : this.mode === 'transcend' ? '초월 강화' : '소지품');
    this.root.hidden = false;
    this._sub.reset();
    this.render();
    this.bus.emit('inventory:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    clearTimeout(this._gemArmT);
    this._gemArm = null;
    this.bus.emit('inventory:closed');
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
    const stats = computePlayerStats(state);
    let entries = listWithDefs(state);
    // 대장간에서는 강화 가능한 장비만 보여준다(탭도 숨긴다).
    const showTabs = this.mode === 'bag';
    if (!showTabs) entries = entries.filter((e) => e.def.enhanceable);

    // 0.38 — **입고 있는 것은 목록에서 뺀다.**
    //
    // 예전에는 같은 물건이 위 장비 띠와 아래 목록에 두 번 나왔다. 그래서 목록에서
    // 고르고도 "이게 지금 낀 건가" 를 다시 확인해야 했고, 목록이 늘 장비 수만큼
    // 길었다. 입고 있는 것은 장비 띠가 맡고, 목록은 **아직 안 입은 것**만 맡는다.
    //
    // 대장간·마녀는 예외다 — 거기서는 지금 낀 무기를 강화하러 오기 때문이다.
    if (showTabs) entries = entries.filter((e) => !isEquipped(state, e.inst.uid));

    const counts = countByCategory(entries);
    if (showTabs) entries = filterByCategory(entries, this.category);

    // 고른 것이 목록에서 사라졌으면 놓는다.
    // 단 **입고 있는 것은 목록에 없어도 고른 채로 둔다** — 장비 띠에서 고른 것이다.
    if (this.selectedUid
        && !entries.some((e) => e.inst.uid === this.selectedUid)
        && !isEquipped(state, this.selectedUid)) {
      this.selectedUid = null;
    }

    this.root.innerHTML = `
      <div class="inv-panel">
        <header class="inv-header">
          <h2>${this.title}</h2>
          ${this.mode === 'forge' ? '<span class="inv-hint">강화할 장비를 고르세요</span>' : ''}
          ${this.mode === 'transcend'
            ? `<span class="inv-hint">+${BALANCE.ENHANCE_MAX} 장비를 고르세요 — 보석으로 +${BALANCE.TRANSCEND_MAX}까지</span>`
            : ''}
          <button class="inv-close" data-close>✕</button>
        </header>
        <section class="inv-equipped">
          ${this._equippedStripHtml(state)}
        </section>
        <section class="inv-summary">
          ${/* 전투력은 늘 보고 있을 값이 아니라 장비를 고칠 때 보는 값이라
               화면 구석이 아니라 이 창에 있다. 필드 몬스터 이름표 색과 같은 잣대다. */ ''}
          <span class="sum-power" title="전투력 — 몬스터 이름표 색과 같은 잣대">⚡ ${combatPower(
            stats,
            stats.mods
          ).toLocaleString('ko-KR')}</span>
          <span>⚔ ${stats.atk}</span><span>🛡 ${stats.def}</span>
          <span>👟 ${stats.spd}</span><span>✦ ${(stats.crit * 100).toFixed(1)}%</span>
          <span>❤ ${stats.hp}</span><span>🪙 ${state.player.gold.toLocaleString('ko-KR')}</span>
        </section>
        ${
          showTabs
            ? `<nav class="inv-tabs">${CATEGORIES.map(
                (c) => `<button data-cat="${c.id}" class="${this.category === c.id ? 'is-on' : ''}">
                          ${c.label}<i>${counts[c.id] ?? 0}</i>
                        </button>`
              ).join('')}</nav>`
            : ''
        }
        <div class="inv-body">
          <ul class="inv-list" data-list data-keep-scroll="list"></ul>
          <aside class="inv-detail" data-detail data-keep-scroll="detail"></aside>
        </div>
      </div>
    `;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());

    for (const btn of this.root.querySelectorAll('[data-cat]')) {
      btn.addEventListener('click', () => {
        this.category = btn.dataset.cat;
        this.render();
      });
    }

    // 장비 띠를 누르면 그 물건을 펼쳐 본다(해제는 자세히 보기의 버튼이 맡는다).
    for (const btn of this.root.querySelectorAll('[data-show]')) {
      btn.addEventListener('click', () => {
        this.selectedUid = btn.dataset.show;
        this.render();
      });
    }

    const list = this.root.querySelector('[data-list]');
    // 대장간에서는 지금 낀 것이 목록에 남아 있으므로 그것부터 위로 올린다.
    // 가방에서는 낀 것이 아예 없으므로 이름순만 남는다.
    const sorted = entries.slice().sort((a, b) => {
      const ae = isEquipped(state, a.inst.uid) ? 0 : 1;
      const be = isEquipped(state, b.inst.uid) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.def.name.localeCompare(b.def.name, 'ko');
    });

    // 0.40 — **묶어서 보여 준다.**
    //
    // 입은 것을 숨긴 뒤에도 가방은 여전히 어지러웠다. 검·물약·약초·반지가
    // 이름순으로 뒤섞여 한 줄로 늘어서 있으니, 팔 것을 고르려면 처음부터 끝까지
    // 눈으로 훑어야 했다. 줄 수를 줄일 수는 없으니 **줄을 나눈다** —
    // 전체 탭은 장비·소모품·재료로, 장비 탭은 무기·방어구·장신구로.
    for (const sec of this._sections(state, sorted)) {
      if (sec.title) {
        const head = document.createElement('li');
        head.className = 'inv-section';
        head.innerHTML = `<span>${sec.title}</span><i>${sec.rows.length}</i>`;
        list.appendChild(head);
      }
      for (const { inst, def } of sec.rows) list.appendChild(this._itemRow(state, inst, def));
    }
    if (!sorted.length) {
      const label = CATEGORIES.find((c) => c.id === this.category)?.label || '';
      // 입고 있는 것은 목록에 없으므로, 비었다는 말이 "아무것도 없다"로 읽히면 안 된다.
      const wearing = Object.values(state.player.equipment || {}).filter(Boolean).length;
      list.innerHTML = `<li class="muted inv-empty">${
        this.category === 'all'
          ? (wearing ? '가방이 비었습니다. 가진 것은 전부 입고 있습니다.' : '소지품이 비어 있습니다.')
          : `${label} 항목이 없습니다.`
      }</li>`;
    }

    this._renderDetail(state);
  }

  /**
   * 목록을 소제목으로 나눈다.
   *
   * 나누는 잣대는 지금 보고 있는 탭이 정한다:
   *   전체  장비 · 소모품 · 재료
   *   장비  무기 · 방어구 · 장신구 (EquipmentSystem 의 SLOT_GROUPS 그대로)
   *   그 밖  나누지 않는다 — 이미 한 종류뿐이라 소제목이 줄만 늘린다.
   * 대장간·마녀 창도 나누지 않는다. 거기서는 목록이 이미 강화 가능한 장비뿐이다.
   *
   * @returns {Array<{title:string|null, rows:Array}>} 빈 묶음은 넣지 않는다.
   */
  _sections(state, rows) {
    if (this.mode !== 'bag') return [{ title: null, rows }];

    const groupsFor = (name) => {
      if (this.category === 'all') {
        const cat = categoryOf(state.db.items[name.inst.id]);
        return cat === 'gear' ? '장비' : cat === 'consumable' ? '소모품' : '재료';
      }
      if (this.category === 'gear') {
        const slot = name.def.slot === 'ring' ? 'ring1' : name.def.slot;
        return groupOf(slot) || '그 밖';
      }
      return null;
    };

    const order = this.category === 'all'
      ? ['장비', '소모품', '재료']
      : this.category === 'gear' ? ['무기', '방어구', '장신구', '그 밖'] : [];
    if (!order.length) return [{ title: null, rows }];

    const bucket = new Map(order.map((k) => [k, []]));
    for (const r of rows) {
      const key = groupsFor(r);
      if (bucket.has(key)) bucket.get(key).push(r);
      else bucket.get(order[order.length - 1]).push(r);
    }
    // 묶음이 하나뿐이면 소제목을 달지 않는다 — 나눌 것이 없는데 줄만 늘어난다.
    const used = [...bucket.entries()].filter(([, v]) => v.length);
    if (used.length <= 1) return [{ title: null, rows }];
    return used.map(([title, sub]) => ({ title, rows: sub }));
  }

  /**
   * 소지품 창은 좁으니 장착 칸을 한 줄짜리 띠로만 보여 준다.
   * 9칸 전체 배치와 스탯 분해는 캐릭터 창(CharacterPanel)이 담당한다.
   */
  _equippedStripHtml(state) {
    const chips = [];
    for (const slot of Object.values(SLOT_GROUPS).flat()) {
      const uid = state.player.equipment[slot];
      if (!uid) continue;
      const inst = state.inventory.find((i) => i.uid === uid);
      const def = inst ? state.db.items[inst.id] : null;
      if (!def) continue;
      // 0.38 — 누르면 **해제가 아니라 그 물건을 펼쳐 본다.**
      //
      // 예전에는 누르는 즉시 벗겨졌다. 무엇을 끼고 있는지 확인하려고 눌렀다가
      // 벗겨지는 일이 잦았고, 되돌리려면 목록에서 다시 찾아 끼워야 했다.
      // 보는 것과 벗는 것은 다른 일이므로, 벗기는 자세히 보기의 버튼이 맡는다.
      chips.push(`
        <button class="equip-chip rarity-${def.rarity || 'common'} ${
          setOf(state.db, inst.id) ? 'is-set' : ''
        } ${isPerfect(inst) ? 'is-perfect' : ''} ${
          this.selectedUid === uid ? 'is-selected' : ''
        }" data-show="${uid}"
                title="${SLOT_LABEL[slot]} — 눌러서 자세히 보기">
          <span class="equip-chip-slot">${SLOT_LABEL[slot]}</span>
          <span class="equip-chip-name">${this._displayName(inst, def)}</span>
        </button>`);
    }
    if (!chips.length) {
      return '<span class="muted equip-strip-empty">장착한 장비가 없습니다. (C — 캐릭터 창)</span>';
    }
    return `<div class="equip-strip">${chips.join('')}</div>`;
  }

  _itemRow(state, inst, def) {
    const li = document.createElement('li');
    const equipped = isEquipped(state, inst.uid);
    const inSet = setOf(state.db, inst.id);
    li.className = `inv-item rarity-${def.rarity || 'common'} ${inSet ? 'is-set' : ''} ${
      isPerfect(inst) ? 'is-perfect' : ''
    } ${equipped ? 'is-equipped' : ''
    } ${this.selectedUid === inst.uid ? 'is-selected' : ''}`;

    const icon = this._icon(def.icon || `item_${inst.id}`, 34);
    li.appendChild(icon);

    const text = document.createElement('div');
    text.className = 'inv-item-text';
    text.innerHTML = `
      <span class="inv-item-name">${this._displayName(inst, def)}</span>
      <span class="inv-item-sub">${inSet ? `${inSet.name} 세트 · ` : ''}${
        RARITY_LABEL[def.rarity] || ''
      }${def.stackable ? ` · ${inst.count}개` : ''}${equipped ? ' · 장착 중' : ''}</span>
    `;
    li.appendChild(text);

    li.addEventListener('click', () => {
      this.selectedUid = inst.uid;
      // 다른 물건으로 옮기면 물어 두었던 보석은 없던 일이 된다.
      clearTimeout(this._gemArmT);
      this._gemArm = null;
      this.render();
    });
    return li;
  }

  _renderDetail(state) {
    const box = this.root.querySelector('[data-detail]');
    const inst = this.selectedUid
      ? state.inventory.find((i) => i.uid === this.selectedUid)
      : null;
    if (!inst) {
      box.innerHTML = '<p class="muted">아이템을 선택하세요.</p>';
      return;
    }
    const def = state.db.items[inst.id];
    const equipped = isEquipped(state, inst.uid);

    // 강화 보정은 formulas가 계산한다. UI는 표시만 한다.
    const shown = enhancedStats(def.stats, inst.enhance || 0, def.rarity);

    // 0.38 — **지금 낀 것과 견줘 준다.**
    //
    // 예전에는 "공격 +37" 만 보였다. 지금 낀 검이 30 인지 45 인지는 위 띠를 보고
    // 사람이 머리로 빼야 했고, 부위가 다르면 어느 것과 견줘야 하는지도 몰랐다.
    // 갈아 끼울 자리의 물건을 찾아 차이만 보여 주면 그 계산이 사라진다.
    const vs = equipped ? null : replacedBy(state, def);
    const statsHtml = (def.stats || vs)
      ? compareStats(shown, vs && vs.stats)
          .map((r) => `<li>${r.label} <b>+${fmtStat(r.key, r.value)}</b> ${diffHtml(r)}</li>`)
          .join('')
      : '';

    // +7~+9 에서 굴린 무작위 옵션과 +10 의 보석 홈
    //
    // 대장간에서는 옵션 줄마다 "다시" 버튼이 붙는다 — 그 자리 하나만 다시 굴린다.
    // 보석 줄에는 붙지 않는다(박은 보석은 뺄 수 없다).
    const extras = itemExtras(state.db, inst);
    const forge = this.mode === 'forge';
    const witch = this.mode === 'transcend';
    let affixSeen = -1;
    const specialHtml = extras.length
      ? `<ul class="detail-specials">${extras
          .map((e) => {
            if (e.kind !== 'affix') return `<li class="ex-${e.kind}">${e.text}</li>`;
            affixSeen += 1;
            if (!forge) return `<li class="ex-affix">${e.text}</li>`;
            const i = affixSeen;
            const can = canReroll(state, inst.uid, i);
            const cost = rerollCost(i);
            const mat = enhanceMaterial(inst.enhance || 0, def.rarity || 'common');
            const need = BALANCE.REROLL_MATERIAL_COUNT;
            const haveMat = countOf(state, mat.id);
            const afford = state.player.gold >= cost && haveMat >= need;
            const why = !can.ok ? can.reason
              : state.player.gold < cost ? `골드가 모자랍니다 (${cost})`
              : `${state.db.items[mat.id]?.name || mat.id} ${haveMat}/${need}`;
            return `<li class="ex-affix">${e.text}
              <button class="reroll-btn" data-reroll="${i}"
                ${can.ok && afford ? '' : 'disabled'}
                title="다시 굴리기 — 🪙 ${cost} · ${state.db.items[mat.id]?.name || mat.id} ${need}개 (${why})"
              >다시</button></li>`;
          })
          .join('')}</ul>`
      : '';

    // 강화는 대장간에서만 한다. 소지품 창에서는 안내만 보여 준다.
    const enh = this.mode === 'forge' ? canEnhance(state, inst.uid) : null;
    const tr = this.mode === 'transcend' ? canTranscend(state, inst.uid) : null;
    let enhanceHtml = '';
    if (def.enhanceable && this.mode === 'bag') {
      enhanceHtml = `<div class="enhance-box"><p class="muted">
        강화는 <b>마을 대장간</b>에서만 할 수 있습니다.
      </p></div>`;
    } else if (def.enhanceable && enh) {
      if (enh.ok) {
        const haveMat = countOf(state, enh.material.id);
        const matDef = state.db.items[enh.material.id];
        const affordable = state.player.gold >= enh.gold && haveMat >= enh.material.count;
        enhanceHtml = `
          <div class="enhance-box">
            <div class="enhance-row">성공 확률 <b>${(enh.chance * 100).toFixed(0)}%</b></div>
            <div class="enhance-row">비용 🪙 <b class="${
              state.player.gold >= enh.gold ? '' : 'lack'
            }">${enh.gold}</b> · ${matDef.name} <b class="${
              haveMat >= enh.material.count ? '' : 'lack'
            }">${haveMat}/${enh.material.count}</b></div>
            <div class="enhance-row muted enhance-mat-note">${
              RARITY_LABEL[def.rarity || 'common'] || '일반'
            } 등급은 +${BALANCE.ENHANCE_MAX}까지 <b>${matDef.name}</b>만 쓴다</div>
            <button class="primary-btn" data-enhance ${affordable ? '' : 'disabled'}>
              +${enh.level} → +${enh.level + 1} 강화
            </button>
          </div>`;
      } else {
        enhanceHtml = `<div class="enhance-box"><p class="muted">${enh.reason}</p></div>`;
      }
    }

    // ── 초월 강화 (+10 ~ +15 · 성 안 왕실 대장간에서만) ──
    // 실패해도 내려가지 않고 부서지지도 않는다. 그 사실을 버튼 옆에 그대로 적는다 —
    // "50%" 만 보고 부서지는 줄 알면 아무도 안 건다.
    let transcendHtml = '';
    if (witch && def.enhanceable) {
      if (tr && tr.ok) {
        const have = countOf(state, tr.material.id);
        const matName = (state.db.items[tr.material.id] || {}).name || tr.material.id;
        const enough = have >= tr.material.count;
        const GROUP = { weapon: '무기', armor: '방어구', accessory: '장신구' };
        transcendHtml = `
          <div class="enhance-box transcend-box">
            <div class="enhance-row">지금 <b>+${tr.level}</b> → 최대 <b>+${BALANCE.TRANSCEND_MAX}</b></div>
            <div class="enhance-row">성공 확률 <b class="tr-chance">${Math.round(tr.chance * 100)}%</b></div>
            <div class="enhance-row">값 — ${GROUP[tr.material.group]}는 <b>${matName}</b>
              <b class="${enough ? '' : 'lack'}">${have}/${tr.material.count}</b></div>
            <div class="enhance-row muted">실패해도 부서지지 않고 <b>내려가지도 않습니다.</b> 보석만 사라집니다.</div>
            <button class="primary-btn transcend-btn" data-transcend ${enough ? '' : 'disabled'}>
              +${tr.level} → +${tr.level + 1} 초월 강화
            </button>
          </div>`;
      } else if (tr) {
        transcendHtml = `<div class="enhance-box"><p class="muted">${tr.reason}</p></div>`;
      }
    }

    // ── 보석 박기 (+10 장비만) ──
    // 대장간에서만 박게 한다. 소지품 창에서는 안내만.
    let gemHtml = '';
    const sockets = socketsOf(state.db, inst, def);

    // 홈 뚫기 — 대장간에서, 송곳을 들고 있을 때만 보인다.
    let drillHtml = '';
    if (this.mode === 'forge') {
      const have = countOf(state, DRILL_ITEM);
      const d = canDrill(state, inst.uid);
      if (d.ok) {
        drillHtml = `<div class="enhance-box">
          <div class="enhance-row">${(state.db.items[DRILL_ITEM] || {}).name || DRILL_ITEM}
            <b>${have}</b>개 — 이 장비에 <b>홈을 하나 더</b> 만든다</div>
          <button class="btn-enhance" data-drill>홈 뚫기 (${sockets} → ${Math.min(MAX_SOCKETS, sockets + 1)})</button>
        </div>`;
      } else if (have > 0 && sockets > 0) {
        drillHtml = `<div class="enhance-box"><p class="muted">홈 뚫기 — ${d.reason}</p></div>`;
      }
    }

    if (sockets > 0) {
      const gems = inst.gems || [];
      const freeSlots = Math.max(0, sockets - gems.filter(Boolean).length);
      if (this.mode === 'bag') {
        gemHtml = `<div class="enhance-box"><p class="muted">
          보석은 <b>마을 대장간</b>에서 박을 수 있습니다. (빈 홈 ${freeSlots}개)
        </p></div>`;
      } else if (witch) {
        gemHtml = ''; // 마녀는 보석을 다루지 않는다
      } else if (freeSlots <= 0) {
        gemHtml = `<div class="enhance-box"><p class="muted">홈이 모두 찼습니다.</p></div>`;
      } else {
        const owned = gemDefs(state.db)
          .map((g) => ({ g, have: countOf(state, g.id) }))
          .filter((x) => x.have > 0);
        gemHtml = owned.length
          ? `<div class="enhance-box">
               <div class="enhance-row">빈 홈 <b>${freeSlots}</b>개 — 박으면 뺄 수 없습니다</div>
               <div class="gem-pick">${owned
                 .map(({ g, have }) => {
                   const ok = canSocket(state, inst.uid, g.id).ok;
                   // 한 번 더 눌러야 박힌다. 강화가 +10 이 되는 순간 강화 단추 자리에
                   // 보석 단추가 올라와서, 이어 누른 손이 그대로 보석을 박아 버렸다.
                   const arm = this._gemArm === g.id;
                   return `<button data-gem="${g.id}" ${ok ? '' : 'disabled'}
                     class="${arm ? 'is-armed' : ''}"
                     title="${g.name} — ${g.effect} (한 번 더 누르면 박습니다)">${
                       arm ? `정말 박을까요? — ${g.name}` : `${g.name} · <b>${g.effect}</b>`
                     } <span class="muted">×${have}</span></button>`;
                 })
                 .join('')}</div>
             </div>`
          : `<div class="enhance-box"><p class="muted">
               가진 보석이 없습니다. 보석은 <b>성 안 지하감옥</b>에서 나옵니다.
             </p></div>`;
      }
    }

    box.innerHTML = `
      <div class="detail-head">
        <span class="detail-name rarity-${def.rarity || 'common'} ${
          setOf(state.db, inst.id) ? 'is-set' : ''
        } ${isPerfect(inst) ? 'is-perfect' : ''}">${this._displayName(inst, def)}</span>
        <span class="detail-type">${TYPE_LABEL[def.slot] || '재료'}</span>
      </div>
      <p class="detail-desc">${def.desc || ''}</p>
      ${statsHtml ? `<ul class="detail-stats">${statsHtml}</ul>` : ''}
      ${this._transmuteHtml(state, inst)}
      ${this._setHtml(state, inst.id)}
      ${/*
          대장간·마녀 창에서는 하러 온 일이 맨 위에 온다.
          아래에 두었더니 창 밖으로 밀려나서, 정작 누를 버튼이 스크롤해야 보였다.
        */ ''}
      ${forge || witch ? `${enhanceHtml}${transcendHtml}${drillHtml}${gemHtml}` : ''}
      ${specialHtml}
      ${
        def.use
          ? `<div class="detail-quick">
               <span>단축키 지정</span>
               <div class="quick-pick">
                 ${[0, 1, 2, 3]
                   .map(
                     (i) =>
                       `<button data-quick="${i}" class="${
                         (state.quickSlots || [])[i] === inst.id ? 'is-on' : ''
                       }">${i + 1}</button>`
                   )
                   .join('')}
               </div>
             </div>`
          : ''
      }
      ${this._equipButtonsHtml(state, inst, def, equipped)}
      ${def.use ? `<button class="primary-btn" data-use>사용하기</button>` : ''}
      ${forge || witch ? '' : `${enhanceHtml}${transcendHtml}${gemHtml}`}
    `;

    for (const btn of box.querySelectorAll('[data-equip]')) {
      btn.addEventListener('click', () =>
        this.bus.emit('ui:equip', { uid: inst.uid, slot: btn.dataset.equip || null })
      );
    }
    const unequipBtn = box.querySelector('[data-detail-unequip]');
    if (unequipBtn) {
      unequipBtn.addEventListener('click', () =>
        this.bus.emit('ui:unequip', { slot: unequipBtn.dataset.detailUnequip })
      );
    }
    const useBtn = box.querySelector('[data-use]');
    if (useBtn) {
      useBtn.addEventListener('click', () => this.bus.emit('ui:use', { uid: inst.uid }));
    }
    for (const btn of box.querySelectorAll('[data-quick]')) {
      btn.addEventListener('click', () =>
        this.bus.emit('ui:quickassign', { index: Number(btn.dataset.quick), itemId: inst.id })
      );
    }
    const enhanceBtn = box.querySelector('[data-enhance]');
    if (enhanceBtn) {
      enhanceBtn.addEventListener('click', () => this.bus.emit('ui:enhance', { uid: inst.uid }));
    }
    const drillBtn = box.querySelector('[data-drill]');
    if (drillBtn) {
      drillBtn.addEventListener('click', () => this.bus.emit('ui:drill', { uid: inst.uid }));
    }
    for (const btn of box.querySelectorAll('[data-gem]')) {
      btn.addEventListener('click', () => {
        const gemId = btn.dataset.gem;
        // 첫 누름은 "정말?" 로 바뀌기만 한다. 두 번째 누름에서야 박는다.
        // 보석은 빼지 못하므로, 손이 미끄러진 한 번으로 물건이 정해지면 안 된다.
        if (this._gemArm !== gemId) {
          this._gemArm = gemId;
          clearTimeout(this._gemArmT);
          // 5초가 지나면 저절로 풀린다(누른 것을 잊고 나중에 다시 누르는 일을 막는다).
          this._gemArmT = setTimeout(() => {
            if (!this.open) return;
            this._gemArm = null;
            this.render();
          }, 5000);
          this.render();
          return;
        }
        clearTimeout(this._gemArmT);
        this._gemArm = null;
        this.bus.emit('ui:socket', { uid: inst.uid, gemId });
      });
    }
    const trBtn = box.querySelector('[data-transcend]');
    if (trBtn) {
      trBtn.addEventListener('click', () => this.bus.emit('ui:transcend', { uid: inst.uid }));
    }
    for (const btn of box.querySelectorAll('[data-reroll]')) {
      btn.addEventListener('click', () =>
        this.bus.emit('ui:reroll', { uid: inst.uid, index: Number(btn.dataset.reroll) })
      );
    }
  }

  /** 장착/해제 버튼. 반지처럼 들어갈 칸이 둘이면 칸마다 버튼을 준다. */
  _equipButtonsHtml(state, inst, def, equipped) {
    const slots = slotsForItem(def);
    if (!slots.length) return '';

    if (equipped) {
      const slot = equippedSlotOf(state, inst.uid);
      return `<button class="primary-btn is-off" data-detail-unequip="${slot}">
        ${SLOT_LABEL[slot]} 해제하기
      </button>`;
    }

    // 어느 칸에 들어가는지 버튼에 적어 둔다 — "장착하기" 만 있으면
    // 엉뚱한 아이템을 보고 있어도 눈치채기 어렵다.
    if (slots.length === 1) {
      return `<button class="primary-btn" data-equip>${SLOT_LABEL[slots[0]]} 장착하기</button>`;
    }

    return `<div class="equip-choice">
      ${slots
        .map((s) => {
          const taken = state.player.equipment[s];
          const cur = taken ? state.inventory.find((i) => i.uid === taken) : null;
          const curDef = cur ? state.db.items[cur.id] : null;
          return `<button class="primary-btn" data-equip="${s}">
            ${SLOT_LABEL[s]}에 장착${curDef ? `<small>${curDef.name} 교체</small>` : ''}
          </button>`;
        })
        .join('')}
    </div>`;
  }

  _displayName(inst, def) {
    const name = (inst.enhance || 0) > 0 ? `${def.name} +${inst.enhance}` : def.name;
    // 각인 장비는 이름 앞에 ✦ 를 단다 — 목록에서 한눈에 골라낼 수 있게.
    // 초월 각인은 ✦✦ 둘이다(색은 CSS 의 .is-perfect 가 붉게 칠한다).
    if (isPerfect(inst)) return `✦✦ ${name}`;
    return isEngraved(inst) ? `✦ ${name}` : name;
  }

  /**
   * 세트 칸 — "몇 개 중 몇 개" 와 켜진 효과.
   *
   * 지금 **입고 있는 것만** 센다. 가방에 있는 것까지 세면 "다 모았는데 왜 안 켜지지"가 된다.
   * 아직 안 켜진 줄도 흐리게 함께 보여 준다 — 하나 더 입으면 뭐가 생기는지 알아야
   * 나머지를 모을 마음이 생긴다.
   */
  /**
   * 변신 조리법 — "무엇을 어떤 차례로 박으면 무엇이 되는가".
   *
   * 설명글에만 적어 두면 안 된다. 보석은 한 번 박으면 빠지지 않으므로,
   * **박기 직전 화면에** 다음 차례가 또렷하게 보여야 한다.
   */
  _transmuteHtml(state, inst) {
    const tm = transmuteState(state.db, inst, state.player && state.player.classId);
    if (!tm) return '';
    const items = state.db.items;
    const nameOf = (gid) => (gemDefs(state.db).find((g) => g.id === gid) || {}).name || gid;
    const into = (items[tm.recipe.into] || {}).name || tm.recipe.into;
    const done = (inst.gems || []).filter(Boolean).length;
    return `<div class="set-lines">
      <span class="set-title">변신 · ${done}/${tm.recipe.order.length} → ${into}</span>
      ${tm.recipe.order
        .map((gid, i) => {
          const on = (inst.gems || [])[i] === gid;
          const now = !on && tm.next === gid;
          return `<span class="set-step ${on ? 'is-on' : ''} ${now ? 'is-when' : ''}">${
            on ? '◆' : now ? '▶' : '◇'
          } ${i + 1}번째 — ${nameOf(gid)}${now ? ' (지금 이 차례)' : ''}</span>`;
        })
        .join('')}
      <span class="set-parts">차례가 아닌 보석은 박히지 않습니다.</span>
    </div>`;
  }

  _setHtml(state, itemId) {
    const def = setOf(state.db, itemId);
    if (!def) return '';
    const worn = [];
    for (const uid of Object.values(state.player.equipment || {})) {
      if (!uid) continue;
      const it = state.inventory.find((i) => i.uid === uid);
      if (it) worn.push(it.id);
    }
    const prog = setProgress(state.db, worn).find((p) => p.set.id === def.id);
    const have = prog ? prog.worn : 0;
    const items = state.db.items;
    const cls = state.player && state.player.classId;
    // 조건부 효과(고룡전 한정)는 **개수를 채웠어도 평소에는 안 켜져 있다.**
    // 그래서 ◆(지금 켜짐) 말고 ◈(개수는 채웠고 그때가 되면 켜짐)를 따로 쓴다 —
    // 셋 다 ◇ 로 보이면 "네 개를 입었는데 왜 안 붙지" 하고 헤매게 된다.
    return `<div class="set-lines">
      <span class="set-title">${def.name} 세트 · ${have}/${def.slots.length}</span>
      ${def.steps
        // 글이 빈 줄은 안 적는다 — 같은 개수의 효과가 여럿일 때 대표 한 줄만 남긴다.
        .filter((st) => st.text)
        .map((st) => {
          const met = have >= st.need;
          const mark = !met ? '◇' : st.foes ? '◈' : '◆';
          return `<span class="set-step ${met ? 'is-on' : ''} ${st.foes ? 'is-when' : ''}">${
            mark
          } ${st.need}개 — ${st.text}</span>`;
        })
        .join('')}
      ${/* 한 자리를 여러 물건으로 채울 수 있으면(무기 — 검·활·지팡이) 그 자리는
             **하나로** 적는다. 셋을 나란히 적으면 여섯 개를 모아야 하는 것처럼 보인다.
             제 직업 것이 있으면 그것을, 없으면 슬래시로 묶어 보여 준다. */ ''}
      <span class="set-parts">${def.slots
        .map((slot) => {
          const on = slot.find((id) => worn.includes(id));
          if (on) return `<b>${(items[on] || {}).name || on}</b>`;
          const mine = slot.find((id) => (items[id] || {}).classId === cls);
          const show = mine ? [mine] : slot;
          return show.map((id) => (items[id] || {}).name || id).join(' / ');
        })
        .join(' · ')}</span>
    </div>`;
  }

  /** 이미지가 있으면 <img>, 없으면 즉석 플레이스홀더 캔버스를 만들어 준다. */
  _icon(key, size) {
    const asset = this.assets.get(key);
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
      const canvas = makePlaceholder(key, size, size, (asset && asset.label) || key);
      wrap.appendChild(canvas);
    }
    return wrap;
  }
}
