// 책임: 퀘스트 게시판 화면 — 현재 의뢰, 진행도, 보상, 완료 버튼, 지나온 의뢰 목록.
// 금지: 완료 판정/보상 지급 → systems/QuestSystem.js 가 준 값을 표시하고 조작은 이벤트로 알린다.
// 금지: 게임 상태 수정.

import { makePlaceholder } from '../core/AssetLoader.js';
import { allQuests, currentQuest, progressOf, isLocked, specialQuests } from '../systems/QuestSystem.js';
import { captureScroll, restoreScroll } from './keepScroll.js';
import { statLine } from './statLabels.js';

const TYPE_LABEL = { collect: '수집', hunt: '토벌', reach: '탐사' };

export class QuestPanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    /**
     * 고른 보상 — **의뢰 하나마다 따로** 기억한다 (0.60).
     *
     * ⚠ 0.59 까지는 `this.choice` 한 칸이었다. 그런데 이 판에는 카드가 여럿 뜬다 —
     *   진행 중인 의뢰 하나 + 특별 의뢰(고룡을 만난 사람에게 열리는 줄) 몇 개.
     *   카드마다 _renderCurrent 를 다시 부르는데, 그 안에
     *       if (this.choice && !quest.choices.includes(this.choice)) this.choice = null;
     *   이 있었다. 특별 의뢰에는 선택 보상이 없으므로, **맨 나중에 그려지는 그 카드가
     *   방금 고른 것을 지워 버렸다.**
     *
     *   그래서 보상을 고르면 단추는 '보상 받기' 로 바뀌는데 눌러도 안 먹고,
     *   판이 한 번 더 그려지는 순간 '보상을 고르세요' 로 되돌아갔다.
     *   여럿이 접속해 있으면 남이 한 걸음 옮길 때마다 판이 다시 그려지므로
     *   **혼자일 때는 어쩌다 눌리고, 같이 하면 아예 안 눌렸다.**
     *   (누가 먼저 했는지와는 상관이 없다 — 고룡을 만나 특별 의뢰가 열렸느냐가 갈랐다)
     *
     * @type {Record<string, string>} 의뢰 id → 고른 아이템 id
     */
    this.choices = {};

    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    this.bus.emit('quest:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('quest:closed');
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
    const list = allQuests(state);
    const active = currentQuest(state);
    const doneIds = (state.quests && state.quests.done) || [];

    this.root.innerHTML = `
      <div class="quest-panel">
        <header class="inv-header">
          <h2>퀘스트 게시판</h2>
          <span class="inv-hint">${doneIds.length} / ${list.length} 완료</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        <div class="quest-body">
          ${/* ⚠ 왼쪽 칸은 반드시 한 덩어리로 묶는다.
                예전에는 진행 중 의뢰·특별 의뢰·의뢰 목록 셋이 두 칸짜리 격자에
                그냥 들어 있었다. 그러면 셋째(의뢰 목록)가 다음 줄로 밀려
                오른쪽이 아니라 **왼쪽 아래**에 나타난다(실제로 그랬다). */ ''}
          <div class="quest-left" data-keep-scroll="left">
            <section class="quest-current" data-current></section>
            ${/* 특별 의뢰 — 게시판 차례와 상관없이, 조건을 채운 사람에게만 열린다.
                  게시판 아래에 묻으면 열린 줄도 모르므로 진행 중인 의뢰 바로 밑에 둔다. */ ''}
            <section class="quest-special" data-special></section>
          </div>
          <section class="quest-list" data-keep-scroll="list">
            <h3>의뢰 목록</h3>
            <ul data-list></ul>
          </section>
        </div>
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    this._renderCurrent(this.root.querySelector('[data-current]'), state, active);
    this._renderSpecial(this.root.querySelector('[data-special]'), state);
    this._renderList(this.root.querySelector('[data-list]'), state, list, active, doneIds);
  }

  _renderCurrent(box, state, quest) {
    if (!quest) {
      box.innerHTML = `<p class="muted quest-empty">
        게시판의 의뢰를 모두 끝냈다.<br />새 종이가 붙기를 기다리자.
      </p>`;
      return;
    }

    const p = progressOf(state, quest);
    const ratio = p.need ? Math.min(1, p.have / p.need) : 0;
    const rewardItem = quest.rewardItem ? state.db.items[quest.rewardItem] : null;
    const locked = isLocked(state, quest);
    // 이 의뢰에서 고른 것만 본다. 다른 카드가 고른 것은 건드리지 않는다.
    // 고른 보상이 이 의뢰 것이 아니면 버린다(의뢰가 넘어간 경우).
    let chosen = this.choices[quest.id] || null;
    if (chosen && !quest.choices.includes(chosen)) {
      delete this.choices[quest.id];
      chosen = null;
    }
    const needChoice = quest.choices.length > 0;
    const canComplete = p.done && !locked && (!needChoice || !!chosen);

    box.innerHTML = `
      <div class="quest-card ${canComplete ? 'is-ready' : ''}">
        <div class="quest-tag">${TYPE_LABEL[quest.type] || quest.type}</div>
        <h3>${quest.title}${
          quest.reqLevel ? `<span class="quest-req ${locked ? 'is-lack' : ''}">Lv.${quest.reqLevel}+</span>` : ''
        }</h3>
        <p class="quest-desc">${quest.desc.replace(/\n/g, '<br />')}</p>

        <div class="quest-progress">
          ${
            // 대상이 둘 이상인 사냥 의뢰(0.64)는 **대상마다** 막대를 그린다.
            // 합쳐서 '27/40' 하나만 두면 어느 쪽이 모자란지 알 수가 없다.
            p.parts
              ? p.parts.map((x) => `<div class="bar ${x.done ? 'is-done' : ''}">`
                  + `<i style="width:${(Math.min(1, x.have / Math.max(1, x.need))) * 100}%"></i>`
                  + `<span>${escQ(x.label)} ${x.have} / ${x.need}</span></div>`).join('')
              : `<div class="bar"><i style="width:${ratio * 100}%"></i><span>${escQ(p.label)} ${p.have} / ${p.need}</span></div>`
          }
        </div>

        <div class="quest-rewards" data-rewards></div>
        ${needChoice ? '<div class="quest-choice" data-choice></div>' : ''}
        ${locked ? `<p class="muted quest-lock">레벨 ${quest.reqLevel}이 되어야 보상을 받을 수 있다.</p>` : ''}
        <button class="primary-btn" data-complete ${canComplete ? '' : 'disabled'}>
          ${
            locked
              ? `Lv.${quest.reqLevel} 필요`
              : !p.done
                ? '진행 중'
                : needChoice && !chosen
                  ? '보상을 고르세요'
                  : '보상 받기'
          }
        </button>
      </div>`;

    if (needChoice) this._renderChoice(box.querySelector('[data-choice]'), state, quest);

    const rw = box.querySelector('[data-rewards]');
    rw.appendChild(this._chip('✦', `${quest.exp} EXP`));
    rw.appendChild(this._chip('🪙', `${quest.gold}`));
    if (rewardItem) {
      const chip = document.createElement('span');
      chip.className = 'quest-chip';
      chip.appendChild(this._icon(rewardItem.icon || `item_${quest.rewardItem}`, 20));
      const label = document.createElement('b');
      label.textContent = `${rewardItem.name} ×${quest.rewardCount}`;
      chip.appendChild(label);
      rw.appendChild(chip);
    }

    box.querySelector('[data-complete]').addEventListener('click', () =>
      this.bus.emit('ui:quest-complete', { choice: chosen, id: quest.unlock ? quest.id : null })
    );
  }

  /**
   * 특별 의뢰 — 조건을 채운 사람에게만 열리는 줄들.
   *
   * 게시판의 차례와 별개라 진행 중인 의뢰와 **함께** 떠 있어야 한다.
   * 목록 속에 섞어 두면 "열렸다"는 알림만 보고 어디서 받는지 못 찾는다.
   */
  _renderSpecial(box, state) {
    const list = specialQuests(state);
    if (!list.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML = '<h3 class="quest-special-title">특별 의뢰</h3>';
    for (const q of list) {
      const card = document.createElement('div');
      box.appendChild(card);
      this._renderCurrent(card, state, q);
    }
  }

  /** 직업 퀘스트의 "무기 or 방어구" 선택 카드. */
  _renderChoice(box, state, quest) {
    const head = document.createElement('p');
    head.className = 'quest-choice-title';
    head.textContent = '보상 선택 — 하나만 받을 수 있다';
    box.appendChild(head);

    const row = document.createElement('div');
    row.className = 'quest-choice-row';

    for (const id of quest.choices) {
      const def = state.db.items[id];
      if (!def) continue;
      const btn = document.createElement('button');
      btn.className = `quest-choice-btn rarity-${def.rarity || 'common'} ${
        this.choices[quest.id] === id ? 'is-on' : ''
      }`;
      btn.appendChild(this._icon(def.icon || `item_${id}`, 30));

      const text = document.createElement('span');
      const stats = Object.entries(def.stats || {})
        .map(([k, v]) => statLine(k, v, 0))
        .join(' · ');
      text.innerHTML = `<b>${def.name}</b><i>${stats}</i>`;
      btn.appendChild(text);

      btn.addEventListener('click', () => {
        // 같은 것을 다시 누르면 고르기를 물린다.
        if (this.choices[quest.id] === id) delete this.choices[quest.id];
        else this.choices[quest.id] = id;
        this.render();
      });
      row.appendChild(btn);
    }
    box.appendChild(row);
  }

  _renderList(list, state, quests, active, doneIds) {
    for (const q of quests) {
      const done = doneIds.includes(q.id);
      const isActive = active && active.id === q.id;
      const locked = !done && !isActive;

      const li = document.createElement('li');
      li.className = `quest-row ${done ? 'is-done' : ''} ${isActive ? 'is-active' : ''}`;
      li.innerHTML = `
        <span class="quest-mark">${done ? '✔' : isActive ? '▶' : '·'}</span>
        <span class="quest-row-title">${locked ? '???' : q.title}</span>
        <span class="quest-row-type">${locked ? '' : TYPE_LABEL[q.type] || ''}</span>
        <span class="quest-row-reward">${locked ? '' : `${q.exp} EXP · 🪙 ${q.gold}`}</span>`;
      list.appendChild(li);
    }
  }

  _chip(icon, text) {
    const el = document.createElement('span');
    el.className = 'quest-chip';
    el.innerHTML = `${icon}<b>${text}</b>`;
    return el;
  }

  _icon(key, size) {
    const asset = this.assets.get(key);
    const wrap = document.createElement('span');
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

/** 몬스터·아이템 이름은 표에서 온다 — 태그가 섞여 들어와도 글자로만 나가게 한다. */
function escQ(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
