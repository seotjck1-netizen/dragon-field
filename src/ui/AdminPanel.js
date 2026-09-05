// 책임: 운영자 창 — 랭킹 초기화 · 전 유저 우편 보내기 · 시트 지금 읽기.
// 금지: 서버 호출을 직접 하지 않는다. 이벤트만 쏘고 main.js 가 처리한다.
// 금지: 게임 상태를 고치지 않는다.
//
// ── 누구에게 보이나 ────────────────────────────────────────
// 서버가 "당신은 운영자다" 라고 답한 사람에게만 HUD 에 버튼이 생긴다.
// 이 파일에는 열쇠도 비밀번호도 없다 — 잠금은 전부 서버에 있다.
//
// ── 아이템 고르기 ──────────────────────────────────────────
// 아이템이 예순 종을 넘는다. 한 줄로 늘어놓으면 찾을 수가 없어서
// **장비 · 소모품 · 재료** 세 갈래로 나누고, 이름으로 거를 수 있게 했다.
// 고른 것은 아래에 개수와 함께 쌓이고, 개수는 직접 적을 수 있다.

import { captureScroll, restoreScroll } from './keepScroll.js';

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'equip', label: '장비' },
  { key: 'consumable', label: '소모품' },
  { key: 'material', label: '재료' },
];

const RARITY_ORDER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/**
 * 시즌 시작 선물 — 초기화 바로 다음에 전 유저에게 한 번 뿌리는 꾸러미 (0.41).
 *
 * 갓 만든 캐릭터가 받는 것이므로 "앞서 나가게" 가 아니라 "첫 걸음이 덜 고되게" 로 짠다.
 * 여기 한 곳에만 적어 두고 버튼이 이 표를 그대로 읽으므로, 무엇이 나가는지
 * 누르기 전에 화면에서 그대로 보인다.
 */
export const SEASON_GIFT = {
  subject: '새 시즌을 시작하며',
  body: '새 시즌이 열렸습니다.\n모두가 같은 자리에서 다시 시작합니다 — 첫 걸음에 보태세요.',
  from: '운영자',
  gold: 5000,
  exp: 0,
  days: 7,
  items: [
    { id: 'potion', count: 20 },
    { id: 'magic_stone', count: 10 },
    { id: 'herb', count: 20 },
  ],
};

/** 이 아이템이 어느 갈래인가. items.json 의 type 을 세 갈래로 접는다. */
function categoryOf(def) {
  if (def.slot) return 'equip';
  if (def.type === 'consumable') return 'consumable';
  return 'material';
}

export class AdminPanel {
  constructor({ bus, store, root, assets }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.assets = assets;
    this.open = false;
    this.busy = false;
    this.tab = 'mail'; // 'mail' | 'rank' | 'sheet' | 'accounts'
    this.sheetInfo = null;  // { id, from, pollMin } — 표 단이 띄운다
    this.sheetUrl = '';     // 사람이 붙여 넣고 있는 주소
    this.cat = 'all';
    this.query = '';
    /** @type {Array<{id:string,count:number}>} 우편에 실을 것들 */
    this.picked = [];
    this.status = '';
    this.statusTone = '';
    this.hidden = true; // 운영자는 기본이 투명이다
    // 우편을 누구에게 보내나. 'all' = 전체(기본), 'some' = 고른 사람들.
    this.mailTo = 'all';
    // 전체 유저 초기화 확인 글자. 정확히 '다음 시즌' 이어야 단추가 열린다.
    this.seasonGuard = '';
    // 1 시즌으로 되돌리기 확인 글자. 정확히 '1 시즌' 이어야 단추가 열린다 (0.45).
    this.rewindGuard = '';
    // 우편 전체 삭제 확인 글자. 정확히 '우편 삭제' 여야 단추가 열린다 (0.45).
    this.mailWipeGuard = '';
    // 초기화한 뒤 선물까지 함께 보낼지. 기본은 켜 둔다(둘 다 하는 것이 보통이다).
    this.seasonAlsoGift = true;
    /** @type {Array<{id,name,level}>} 서버에서 받아 온 계정 목록 */
    this.accounts = null;
    /** @type {Set<string>} 고른 아이디 */
    this.toIds = new Set();
    this.accountQuery = '';
    // 계정 지우기(0.46) — 우편 보내기와 **다른 목록**을 쓴다.
    // 같은 toIds 를 쓰면 우편 받을 사람을 골라 둔 채 탭을 옮겼을 때
    // 그 사람들이 지울 대상으로 둔갑한다. 되돌릴 수 없는 일에는 제 목록을 준다.
    /** @type {Set<string>} 지울 아이디 */
    this.delIds = new Set();
    this.delQuery = '';
    // 확인 글자. 정확히 '계정 삭제' 여야 단추가 열린다.
    this.delGuard = '';

    this.root.hidden = true;
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.status = '';
    this.render();
    this.bus.emit('admin:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('admin:closed');
  }

  setBusy(busy) {
    this.busy = busy;
    this.render();
  }

  /** main.js 가 결과를 알려 준다. 창은 스스로 판단하지 않는다. */
  setStatus(text, tone = '') {
    this.status = text || '';
    this.statusTone = tone;
    this.busy = false;
    this.render();
  }

  /** 지금 보고 있는 구글 문서가 도착했다. main.js 가 넣어 준다 (0.51). */
  setSheetInfo(info) {
    this.sheetInfo = info || null;
    if (this.open && this.tab === 'sheet') this.render();
  }

  /** 계정 목록이 도착했다. main.js 가 넣어 준다. */
  setAccounts(list) {
    // null 을 주면 "다시 받아 오는 중" 이다(빈 목록과 다르다).
    // 계정을 지운 직후 목록을 새로 받을 때 이 자리가 필요하다.
    this.accounts = list === null ? null : Array.isArray(list) ? list : [];
    if (this.open) this.render();
  }

  /** 지금 투명한가. main.js 가 알려 준다. */
  setHidden(on) {
    this.hidden = !!on;
    if (this.open) this.render();
  }

  /** 우편을 보낸 뒤 — 적어 둔 것을 비운다. */
  clearMail() {
    this.picked = [];
    const form = this.root.querySelector('[data-mailform]');
    if (form) {
      form.querySelector('[name="subject"]').value = '';
      form.querySelector('[name="body"]').value = '';
    }
    this.render();
  }

  // ── 아이템 목록 ──────────────────────────────────────────

  _items() {
    const db = this.store.state.db;
    const q = this.query.trim().toLowerCase();
    return Object.entries(db.items || {})
      .filter(([id, def]) => {
        if (!def || id.startsWith('_')) return false;
        if (this.cat !== 'all' && categoryOf(def) !== this.cat) return false;
        if (!q) return true;
        return id.toLowerCase().includes(q) || String(def.name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const r = (RARITY_ORDER[b[1].rarity] || 0) - (RARITY_ORDER[a[1].rarity] || 0);
        return r || String(a[1].name || '').localeCompare(String(b[1].name || ''));
      })
      .slice(0, 200);
  }

  _pick(id) {
    const at = this.picked.findIndex((p) => p.id === id);
    if (at >= 0) this.picked.splice(at, 1);
    else if (this.picked.length >= 12) {
      // 서버가 한 통에 12종까지만 받는다(world.js 의 sanitizeMail).
      // 말없이 잘리면 "넣었는데 안 왔다"가 되므로 여기서 막고 알린다.
      this.status = '우편 한 통에는 12종까지만 담을 수 있습니다.';
      this.statusTone = 'bad';
    } else {
      this.picked.push({ id, count: 1 });
    }
    this.render();
  }

  // ── 그리기 ───────────────────────────────────────────────

  /**
   * 다시 그리기 — 스크롤 위치는 잃지 않는다.
   *
   * 이 창은 상태가 바뀌면 innerHTML 을 통째로 새로 만든다. 그대로 두면 목록에서
   * '재료' 를 고르는 순간 창이 맨 위로 튀어 올라, 고른 것이 화면 밖으로 나간다.
   */
  render() {
    if (!this.open) return;
    const keep = captureScroll(this.root);
    try {
      this._render();
    } finally {
      restoreScroll(this.root, keep);
    }
  }

  _render() {
    if (!this.open) return;
    const bosses = this._bosses();

    this.root.innerHTML = `
      <div class="wp-panel admin-panel" data-keep-scroll="panel">
        <header class="inv-header">
          <h2>운영자</h2>
          <span class="inv-hint">이 창은 운영자 계정에만 보입니다</span>
          <button class="inv-close" data-close>✕</button>
        </header>

        <div class="admin-look">
          <span class="admin-look-state ${this.hidden ? 'is-hidden' : 'is-shown'}">
            ${this.hidden ? '지금 투명합니다 — 남에게 안 보입니다' : '지금 모습이 보입니다'}
          </span>
          <button type="button" data-toggle-hidden>
            ${this.hidden ? '모습 보이기' : '투명해지기'}
          </button>
        </div>

        <div class="rank-eras admin-tabs">
          <button data-atab="mail" class="${this.tab === 'mail' ? 'is-on' : ''}">전체 우편</button>
          <button data-atab="rank" class="${this.tab === 'rank' ? 'is-on' : ''}">랭킹</button>
          <button data-atab="accounts" class="${this.tab === 'accounts' ? 'is-on' : ''}">계정</button>
          <button data-atab="sheet" class="${this.tab === 'sheet' ? 'is-on' : ''}">표</button>
        </div>

        ${/* 서버가 준 글을 그대로 넣지 않는다 — 그 글에는 사람이 적은 아이디가 섞여 들어온다.
             줄바꿈은 CSS(white-space: pre-line)가 살려 준다. */ ''}
        ${this.status ? `<p class="admin-status ${this.statusTone}">${escapeHtml(this.status)}</p>` : ''}

        ${this.tab === 'mail' ? this._mailHtml() : ''}
        ${this.tab === 'rank' ? this._rankHtml(bosses) : ''}
        ${this.tab === 'accounts' ? this._accountsHtml() : ''}
        ${this.tab === 'sheet' ? this._sheetHtml() : ''}
      </div>`;

    this._bind(bosses);
  }

  _mailHtml() {
    const items = this._items();
    return `
      <form class="admin-form" data-mailform>
        <div class="rank-eras admin-tabs admin-to">
          <button type="button" data-to="all" class="${this.mailTo === 'all' ? 'is-on' : ''}">전체 유저</button>
          <button type="button" data-to="some" class="${this.mailTo === 'some' ? 'is-on' : ''}">고른 사람만</button>
        </div>
        ${this._toHtml()}
        <label><span>제목</span>
          <input name="subject" maxlength="60" placeholder="예: 추석 선물" /></label>
        <label><span>내용</span>
          <textarea name="body" maxlength="600" rows="3" placeholder="받는 사람에게 보일 글"></textarea></label>
        <div class="admin-row">
          <label><span>골드</span><input name="gold" type="number" min="0" value="0" /></label>
          <label><span>경험치</span><input name="exp" type="number" min="0" value="0" /></label>
          <label><span>유효기간(일)</span><input name="days" type="number" min="0" max="365" value="7" /></label>
        </div>
        <p class="admin-note">유효기간이 지나면 우편이 스스로 사라집니다. <b>0 을 적으면 안 사라집니다.</b></p>

        <div class="admin-picker">
          <div class="admin-cats">
            ${CATEGORIES.map(
              (c) => `<button type="button" data-cat="${c.key}"
                        class="${this.cat === c.key ? 'is-on' : ''}">${c.label}</button>`
            ).join('')}
            <input class="admin-search" data-search placeholder="이름으로 찾기"
                   value="${escapeAttr(this.query)}" />
          </div>
          <ul class="admin-items" data-keep-scroll="items">
            ${
              items.length
                ? items.map((entry) => this._itemHtml(entry)).join('')
                : '<li class="muted admin-empty">없습니다</li>'
            }
          </ul>
        </div>

        ${this._pickedHtml()}

        <button class="primary-btn" type="button" data-send ${this.busy ? 'disabled' : ''}>
          ${
            this.busy
              ? '보내는 중…'
              : this.mailTo === 'all'
                ? '전 유저에게 보내기'
                : `고른 ${this.toIds.size}명에게 보내기`
          }
        </button>

        ${/* ── 여태 보낸 우편 모두 지우기 (0.45) ──────────────
             시험하며 우편을 몇 번씩 뿌리다 보면 모두의 우편함이 시험용 편지로 찬다.
             하나씩 지우게 할 수는 없으므로 한 번에 비우는 단추를 둔다.
             되돌릴 수 없으니 여기도 확인 글자를 받는다. */ ''}
        <div class="admin-season">
          <p class="admin-note admin-note--gap">
            <b class="admin-danger-text">여태 보낸 우편 모두 지우기</b> — 모든 사람의 우편함을
            비우고, <b>아직 안 들어온 사람에게 배달을 기다리던 것까지</b> 함께 지웁니다.
          </p>
          <ul class="admin-season-what">
            <li class="is-gone">지워짐 — 받은 우편 · 안 받은 우편 · 배달 대기 중인 전체 발송</li>
            <li class="is-kept">남음 — 이미 받아서 소지품에 들어간 물건 (편지지만 사라집니다)</li>
          </ul>
          <label class="admin-season-guard">
            <span>되돌릴 수 없습니다. 확인하려면 <b>우편 삭제</b> 라고 적으세요.</span>
            <input type="text" data-mailwipe-guard value="${escapeAttr(this.mailWipeGuard || '')}"
                   placeholder="우편 삭제" autocomplete="off" />
          </label>
          <button class="primary-btn admin-danger" type="button" data-mail-wipe
                  ${this.busy || (this.mailWipeGuard || '').trim() !== '우편 삭제' ? 'disabled' : ''}>
            ${this.busy ? '지우는 중…' : '여태 보낸 우편 모두 지우기'}
          </button>
        </div>
      </form>`;
  }

  /**
   * 받는 사람 고르기.
   *
   * 전체 발송은 **이벤트 통**에 넣어 두었다가 각자 접속할 때 우편함으로 옮겨 준다 —
   * 지금 안 들어와 있는 사람에게도 나중에 도착한다.
   * 고른 사람에게 보내면 그 사람들의 우편함에 **바로** 들어간다.
   */
  _toHtml() {
    if (this.mailTo === 'all') {
      return `<p class="admin-note">
        지금 접속하지 않은 사람에게도 갑니다 — 다음에 접속할 때 우편함에 들어갑니다.
      </p>`;
    }
    if (this.accounts === null) {
      return `<p class="admin-note">계정 목록을 받아 오는 중…</p>`;
    }
    const q = this.accountQuery.trim().toLowerCase();
    const list = this.accounts.filter(
      (a) => !q || a.id.toLowerCase().includes(q) || String(a.name || '').toLowerCase().includes(q)
    );
    return `
      <div class="admin-picker">
        <div class="admin-cats">
          <input class="admin-search" data-acctsearch placeholder="아이디·이름으로 찾기"
                 value="${escapeAttr(this.accountQuery)}" />
          <button type="button" data-pickall>보이는 사람 전부</button>
          <button type="button" data-pickclear>비우기</button>
        </div>
        <ul class="admin-items" data-keep-scroll="items">
          ${
            list.length
              ? list
                  .slice(0, 200)
                  .map(
                    (a) => `<li><button type="button" class="admin-item ${
                      this.toIds.has(a.id) ? 'is-on' : ''
                    }" data-acct="${escapeAttr(a.id)}">
                      <span class="admin-item-name">${escapeHtml(a.name || a.id)}</span>
                      <span class="admin-item-id">${escapeHtml(a.id)}${
                        a.level ? ` · Lv.${a.level}` : ''
                      }${acctWhen(a)}</span>
                    </button></li>`
                  )
                  .join('')
              : '<li class="muted admin-empty">없습니다</li>'
          }
        </ul>
      </div>
      <p class="admin-note">${
        this.toIds.size
          ? `<b>${this.toIds.size}명</b> 고름 — ${[...this.toIds].slice(0, 8).join(', ')}${
              this.toIds.size > 8 ? ' …' : ''
            }`
          : '아직 아무도 안 골랐습니다. 한 명 이상 골라야 보낼 수 있습니다.'
      }</p>`;
  }

  _itemHtml([id, def]) {
    const on = this.picked.some((p) => p.id === id);
    return `<li>
      <button type="button" class="admin-item ${on ? 'is-on' : ''}" data-item="${escapeAttr(id)}">
        <span class="admin-item-name r-${def.rarity || 'common'}">${escapeHtml(def.name || id)}</span>
        <span class="admin-item-id">${escapeHtml(id)}</span>
      </button>
    </li>`;
  }

  _pickedHtml() {
    if (!this.picked.length) {
      return '<p class="admin-note">아이템 없이 골드·경험치만 보낼 수도 있습니다.</p>';
    }
    const db = this.store.state.db;
    return `<div class="admin-picked">
      ${this.picked
        .map(
          (p) => `<div class="admin-picked-row">
            <span>${escapeHtml((db.items[p.id] || {}).name || p.id)}</span>
            <input type="number" min="1" max="999" value="${p.count}" data-count="${escapeAttr(p.id)}" />
            <button type="button" class="admin-x" data-unpick="${escapeAttr(p.id)}">✕</button>
          </div>`
        )
        .join('')}
    </div>`;
  }

  _bosses() {
    const state = this.store.state;
    const maps = (state.db.maps && state.db.maps.maps) || {};
    const out = [];
    for (const [mapId, def] of Object.entries(maps)) {
      const monId = def.boss || (def.timedBoss && def.timedBoss.monster);
      if (!monId || !state.db.monsters[monId]) continue;
      out.push({ key: monId, name: state.db.monsters[monId].name, where: def.name });
    }
    return out;
  }

  /** 선물 꾸러미를 사람이 읽는 한 줄로. 아이템 이름은 표에서 가져온다. */
  _giftText() {
    const items = this.store.state.db.items || {};
    return SEASON_GIFT.items
      .map((it) => `${(items[it.id] || {}).name || it.id} ×${it.count}`)
      .join(' · ');
  }

  _rankHtml(bosses) {
    const season = (this.store.state.ranks || {}).season;
    const locked = !!(season && season.locked);
    const now = season ? season.season : null;
    return `
      <div class="admin-form">
        ${/* ── 시즌 다루기 (0.45) ────────────────────────────
             시험 중인 서버에서는 초기화를 몇 번씩 하게 되는데, 그때마다 시즌이
             올라가면 "1 시즌 기록" 이 영영 안 남는다. 그래서 두 가지를 둔다:
               ① 고정 — 어떤 초기화도 번호를 안 올린다
               ② 되돌리기 — 이미 올라가 버린 번호를 1 로 내린다 */ ''}
        <div class="admin-seasonbox ${locked ? 'is-locked' : ''}">
          <div class="admin-seasonbox-head">
            <span class="admin-seasonnow">지금 <b>${now == null ? '?' : now} 시즌</b></span>
            <label class="admin-seasonlock">
              <input type="checkbox" data-season-lock ${locked ? 'checked' : ''}
                     ${this.busy ? 'disabled' : ''} />
              <span>시즌 고정</span>
            </label>
          </div>
          <p class="admin-note">
            ${locked
              ? '<b>고정 중입니다.</b> 아래의 어떤 초기화를 눌러도 기록과 세이브만 지워지고 <b>시즌 번호는 그대로</b>입니다 — 시험하는 동안 다음 시즌으로 안 넘어갑니다.'
              : '지금은 <b>고정이 꺼져 있습니다.</b> 전체 초기화를 누르면 시즌이 한 칸 넘어갑니다. 시험 중이라 넘기고 싶지 않다면 위 칸을 켜 두세요.'}
          </p>
          ${now != null && now > 1 ? `
          <label class="admin-season-guard">
            <span>번호를 <b>1 시즌</b>으로 되돌립니다. 기록과 세이브는 <b>안 지웁니다</b> —
                  확인하려면 <b>1 시즌</b> 이라고 적으세요.</span>
            <input type="text" data-rewind-guard value="${escapeAttr(this.rewindGuard || '')}"
                   placeholder="1 시즌" autocomplete="off" />
          </label>
          <button class="primary-btn" type="button" data-season-rewind
                  ${this.busy || (this.rewindGuard || '').trim() !== '1 시즌' ? 'disabled' : ''}>
            ${this.busy ? '처리 중…' : '1 시즌으로 되돌리기'}
          </button>` : `
          <p class="admin-note">이미 1 시즌입니다 — 되돌릴 것이 없습니다.</p>`}
        </div>

        <p class="admin-note admin-note--gap">
          ${locked
            ? '전체 초기화는 <b>표만 비웁니다</b> — 시즌 고정이 켜져 있어 번호는 그대로이고 \'지난 시즌\' 도 안 만듭니다.'
            : '전체 초기화는 <b>시즌을 넘깁니다</b> — 지금 표가 통째로 \'지난 시즌\' 으로 옮겨지고, 모두가 처음부터 다시 겨룹니다. 지워지는 것이 아니라 옮겨집니다.'}
        </p>
        <button class="primary-btn admin-danger" type="button" data-reset-all ${this.busy ? 'disabled' : ''}>
          ${this.busy ? '처리 중…' : locked ? '전체 초기화 (시즌 그대로)' : '전체 초기화 (시즌 넘기기)'}
        </button>

        <p class="admin-note admin-note--gap">
          표 하나만 지우고 싶다면 아래에서 고르세요. <b>시즌은 넘어가지 않습니다</b> —
          잘못 올라간 기록을 손볼 때 씁니다.
        </p>
        <ul class="admin-bosses">
          ${bosses
            .map(
              (b) => `<li>
                <span>${escapeHtml(b.name)} <i>${escapeHtml(b.where || '')}</i></span>
                <button type="button" data-reset-one="${escapeAttr(b.key)}" ${this.busy ? 'disabled' : ''}>지우기</button>
              </li>`
            )
            .join('')}
        </ul>

        ${/* ── 전체 유저 초기화 ──────────────────────────────
             되돌릴 수 없는 단추다. 그래서 두 가지를 요구한다:
               ① 무엇이 지워지고 무엇이 남는지 먼저 다 적는다
               ② '다음 시즌' 이라고 직접 쳐 넣어야 단추가 열린다
             실수로 눌러서 서버 전체가 날아가는 일은 한 번도 있어서는 안 된다. */ ''}
        <div class="admin-season">
          <p class="admin-note admin-note--gap">
            <b class="admin-danger-text">전체 유저 초기화</b> — 모든 사람이 <b>캐릭터를 갓 만든
            상태</b>로 돌아갑니다. 접속 중인 사람에게는 그 자리에서
            "${locked ? `${now} 시즌이 다시 시작되었습니다` : '다음 시즌이 시작되었습니다'}" 가 뜨고
            화면이 처음으로 돌아갑니다.
          </p>
          <ul class="admin-season-what">
            <li class="is-gone">지워짐 — 레벨 · 소지품 · 장비 · 퀘스트 · 우편함 · 잡은 기록</li>
            <li class="is-kept">남음 — 아이디 · 비밀번호 · 이름 (다시 만들 필요 없습니다)</li>
          </ul>
          <label class="admin-season-guard">
            <span>되돌릴 수 없습니다. 확인하려면 <b>다음 시즌</b> 이라고 적으세요.</span>
            <input type="text" data-season-guard value="${escapeAttr(this.seasonGuard || '')}"
                   placeholder="다음 시즌" autocomplete="off" />
          </label>
          ${/* 0.42 — 초기화와 선물을 두 번 누르면 **선물만 잊기 쉽다.**
               초기화한 그 자리에서 함께 보내도록 한 칸으로 묶는다. 기본은 켜 둔다 —
               새 시즌을 여는 사람이 원하는 것은 거의 언제나 "둘 다" 이기 때문이다. */ ''}
          <label class="admin-season-also">
            <input type="checkbox" data-season-also ${this.seasonAlsoGift ? 'checked' : ''} />
            <span>초기화한 뒤 <b>시즌 시작 선물도 함께</b> 보내기</span>
          </label>
          <div class="admin-season-btns">
            <button class="primary-btn admin-danger" type="button" data-season-reset
                    ${this.busy || (this.seasonGuard || '').trim() !== '다음 시즌' ? 'disabled' : ''}>
              ${this.busy ? '처리 중…'
                : locked ? `전체 유저 초기화 — ${now} 시즌 다시 시작` : '전체 유저 초기화 — 다음 시즌 시작'}
            </button>
            ${/* 초기화 바로 옆. 초기화를 누른 다음 이걸 누르면 시즌 전환이 끝난다.
                 무엇이 나가는지 아래에 그대로 적어 둔다 — 눌러 보고 아는 단추는 나쁘다. */ ''}
            <button class="primary-btn" type="button" data-season-gift ${this.busy ? 'disabled' : ''}>
              ${this.busy ? '보내는 중…' : '시즌 시작 선물 보내기'}
            </button>
          </div>
          <p class="admin-note admin-gift-what">
            선물 꾸러미 — ${this._giftText()} · 🪙 ${SEASON_GIFT.gold.toLocaleString('ko-KR')}
            · ${SEASON_GIFT.days}일 안에 받기. <b>전 유저</b>에게 갑니다.
          </p>
        </div>
      </div>`;
  }

  /**
   * 계정 지우기 (0.46).
   *
   * 되돌릴 수 없는 일이라 세 겹으로 막는다:
   *   ① 고른 사람을 **이름과 아이디로 다시 한 번 보여 준다**
   *   ② '계정 삭제' 라고 직접 쳐 넣어야 단추가 열린다
   *   ③ 운영자 자신은 아예 목록에 안 나온다(지우면 이 창을 열 사람이 없어진다)
   */
  _accountsHtml() {
    if (this.accounts === null) {
      return `<div class="admin-form"><p class="admin-note">계정 목록을 받아 오는 중…</p></div>`;
    }
    const q = this.delQuery.trim().toLowerCase();
    const list = this.accounts.filter(
      (a) => !a.self
        && (!q || a.id.toLowerCase().includes(q) || String(a.name || '').toLowerCase().includes(q))
    );
    const picked = [...this.delIds];
    return `
      <div class="admin-form">
        <p class="admin-note">
          고른 계정을 <b>통째로 지웁니다</b> — 아이디·비밀번호·세이브·우편함·랭킹 기록까지.
          전체 초기화는 모두를 <b>되돌릴 뿐</b> 계정을 없애지는 않습니다.
        </p>
        <ul class="admin-season-what">
          <li class="is-gone">지워짐 — 계정 · 세이브 · 우편함 · 랭킹에 올라간 기록(지난 시즌 포함)</li>
          <li class="is-kept">남음 — 같은 아이디로 <b>다시 가입할 수 있습니다</b>. 새 사람이 됩니다</li>
        </ul>

        ${/* ⚠ 확인 칸을 목록 **위**에 둔다. 아래에 두면 목록이 길 때 창 밖으로 밀려
             나가서, 고른 다음 무엇을 눌러야 할지가 안 보인다(처음에 그랬다). */ ''}
        ${
          picked.length
            ? `<div class="admin-season admin-season--top">
                 <p class="admin-note admin-note--gap">
                   <b class="admin-danger-text">${picked.length}명을 지웁니다</b> —
                   ${picked.slice(0, 12).map((id) => escapeHtml(id)).join(' · ')}${
                     picked.length > 12 ? ` 외 ${picked.length - 12}명` : ''
                   }
                 </p>
                 <label class="admin-season-guard">
                   <span>되돌릴 수 없습니다. 확인하려면 <b>계정 삭제</b> 라고 적으세요.</span>
                   <input type="text" data-delguard value="${escapeAttr(this.delGuard || '')}"
                          placeholder="계정 삭제" autocomplete="off" />
                 </label>
                 <button class="primary-btn admin-danger" type="button" data-delrun
                         ${this.busy || (this.delGuard || '').trim() !== '계정 삭제' ? 'disabled' : ''}>
                   ${this.busy ? '지우는 중…' : `고른 ${picked.length}명 지우기`}
                 </button>
               </div>`
            : '<p class="admin-note admin-note--gap">위에서 지울 사람을 고르세요.</p>'
        }
        <div class="admin-picker">
          <div class="admin-cats">
            <input class="admin-search" data-delsearch placeholder="아이디·이름으로 찾기"
                   value="${escapeAttr(this.delQuery)}" />
            <button type="button" data-delclear>비우기</button>
          </div>
          <p class="admin-note admin-list-note">최근에 만든 계정이 위에 있습니다.</p>
          <ul class="admin-items" data-keep-scroll="items">
            ${
              list.length
                ? list
                    .slice(0, 200)
                    .map(
                      (a) => `<li><button type="button" class="admin-item ${
                        this.delIds.has(a.id) ? 'is-on' : ''
                      }" data-delacct="${escapeAttr(a.id)}">
                        <span class="admin-item-name">${escapeHtml(a.name || a.id)}</span>
                        <span class="admin-item-id">${escapeHtml(a.id)}${
                          a.level ? ` · Lv.${a.level}` : ''
                        }${acctWhen(a)}</span>
                      </button></li>`
                    )
                    .join('')
                : '<li class="muted admin-empty">없습니다</li>'
            }
          </ul>
        </div>

      </div>`;
  }

  /**
   * 표 단.
   *
   * ⚠ **지금 보고 있는 문서를 맨 위에 적는다** (0.51).
   *   시트를 새로 만들어 올리면 문서 아이디가 바뀌는데, 서버는 옛 아이디를 들고
   *   `401` 만 돌려받는다. 그때 화면에는 "공개했는지 보세요" 만 떠서, 멀쩡한 시트의
   *   공개 설정을 붙들고 헤매게 된다 — 다섯 판 연속으로 그랬다.
   *   어느 문서를 보고 있는지가 보이면 "내 시트가 아니네" 가 곧바로 보인다.
   */
  _sheetHtml() {
    const info = this.sheetInfo;
    const WHERE = {
      saved: '운영자 창에서 정한 문서',
      env: '서버 환경변수 SHEET_ID',
      file: '저장소의 sheets/SOURCE.txt',
    };
    const where = info && info.from ? WHERE[info.from] || info.from : '';
    return `
      <div class="admin-form">
        <div class="admin-sheet-now">
          <span class="admin-sheet-label">지금 보는 문서</span>
          ${info
            ? info.id
              ? `<code class="admin-sheet-id">${escapeHtml(info.id)}</code>
                 <i class="admin-sheet-where">${escapeHtml(where)}</i>`
              : '<i class="admin-sheet-where">아직 정해지지 않았습니다</i>'
            : '<i class="admin-sheet-where">확인 중…</i>'}
        </div>

        <p class="admin-note">
          시트를 <b>새로 만들어 올리면 문서 아이디가 바뀝니다.</b> 그러면 서버는 없어진
          문서를 계속 두드리며 <code>401</code> 만 받습니다. 그럴 때 지금 시트 주소를
          붙여 넣고 저장하면, 서버를 다시 올리지 않아도 그때부터 그 문서를 봅니다.
        </p>
        <label class="admin-sheet-set">
          <span>시트 주소</span>
          <input type="text" data-sheet-url placeholder="https://docs.google.com/spreadsheets/d/…"
                 value="${escapeAttr(this.sheetUrl || '')}" />
        </label>
        <div class="admin-sheet-btns">
          <button type="button" data-sheet-save ${this.busy ? 'disabled' : ''}>주소 저장</button>
          <button type="button" data-sheet-clear ${this.busy ? 'disabled' : ''}>원래대로</button>
        </div>

        <p class="admin-note">
          구글 시트를 <b>지금 당장</b> 읽어 반영합니다. 평소에는 서버가 몇 분마다 알아서 읽지만,
          방금 고친 것을 바로 보고 싶을 때 씁니다.
        </p>
        <p class="admin-note">
          반영되면 접속해 있는 사람들에게 <b>새 콘텐츠</b> 띠가 뜹니다. 표는 접속할 때 읽으므로
          '지금 적용' 을 눌러 새로고침해야 화면에 나타납니다.
        </p>
        <button class="primary-btn" type="button" data-sheet-pull ${this.busy ? 'disabled' : ''}>
          ${this.busy ? '읽는 중…' : '시트 지금 읽기'}
        </button>
      </div>`;
  }

  // ── 글자 칸 다루기 (0.53) ────────────────────────────────
  //
  // ⚠ 예전에는 **한 글자 칠 때마다 창을 통째로 다시 그리고** 커서를 되돌려 놓았다.
  //   영어는 그럭저럭 됐지만 한글은 그렇지 않다 — 'ㅅ' 을 친 순간 글자 칸이 새로
  //   만들어지므로 조합이 끊겨 '시' 로 이어지지 못한다. 그래서 '1 시즌' 을
  //   칠 수가 없었다(게다가 '1' 은 게임이 단축칸으로 먼저 집어 갔다 — core/Input.js).
  //
  //   그래서 두 가지로 나눈다.
  //     · 확인 글 칸  다시 안 그린다. 단추의 잠금만 그 자리에서 푼다.
  //     · 찾기 칸     조합이 끝난 뒤에만 다시 그린다.

  /**
   * 확인 글 칸 — 다시 그리지 않고 단추 잠금만 맞춘다.
   * @param {string} boxSel 글자 칸 선택자
   * @param {string} btnSel 그 칸이 풀어 주는 단추
   * @param {string} want  똑같이 적어야 하는 글
   * @param {(v:string)=>void} keep 적은 글을 어디에 담을지
   */
  _bindGuard(boxSel, btnSel, want, keep) {
    const box = this.root.querySelector(boxSel);
    const btn = this.root.querySelector(btnSel);
    if (!box) return;
    const sync = () => {
      keep(box.value);
      if (btn) btn.disabled = this.busy || String(box.value).trim() !== want;
    };
    box.addEventListener('input', sync);
    // 한글은 조합이 끝나야 값이 완성된다. 그때 한 번 더 본다.
    box.addEventListener('compositionend', sync);
    sync();
  }

  /**
   * 찾기 칸 — 목록을 다시 그려야 하지만, **조합 중에는 안 그린다.**
   * @param {string} sel 글자 칸 선택자
   * @param {(v:string)=>void} keep 적은 글을 어디에 담을지
   */
  _bindSearch(sel, keep) {
    const box = this.root.querySelector(sel);
    if (!box) return;
    let composing = false;
    const redraw = () => {
      const at = box.selectionStart;
      this.render();
      const again = this.root.querySelector(sel);
      if (again) { again.focus(); again.setSelectionRange(at, at); }
    };
    box.addEventListener('compositionstart', () => { composing = true; });
    box.addEventListener('compositionend', () => {
      composing = false;
      keep(box.value);
      redraw();
    });
    box.addEventListener('input', () => {
      keep(box.value);
      if (composing) return;   // 조합 중에는 손대지 않는다
      redraw();
    });
  }

  // ── 손잡이 달기 ──────────────────────────────────────────

  _bind() {
    const q = (sel) => this.root.querySelector(sel);
    const all = (sel) => this.root.querySelectorAll(sel);

    q('[data-close]').addEventListener('click', () => this.close());
    for (const btn of all('[data-atab]')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.atab;
        this.status = '';
        // 표 단을 열 때마다 "지금 어느 문서를 보고 있나" 를 새로 물어본다.
        if (this.tab === 'sheet') this.bus.emit('admin:sheet-info');
        this.render();
      });
    }

    for (const btn of all('[data-cat]')) {
      btn.addEventListener('click', () => {
        this.cat = btn.dataset.cat;
        this.render();
      });
    }

    for (const btn of all('[data-to]')) {
      btn.addEventListener('click', () => {
        this.mailTo = btn.dataset.to;
        this.render();
        // 처음 '고른 사람만' 을 눌렀을 때 목록을 받아 온다.
        if ((this.tab === 'accounts' || this.mailTo === 'some') && this.accounts === null) {
          this.bus.emit('admin:accounts');
        }
      });
    }
    for (const btn of all('[data-acct]')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.acct;
        if (this.toIds.has(id)) this.toIds.delete(id);
        else this.toIds.add(id);
        this.render();
      });
    }
    const pickAll = q('[data-pickall]');
    if (pickAll) {
      pickAll.addEventListener('click', () => {
        for (const el of all('[data-acct]')) this.toIds.add(el.dataset.acct);
        this.render();
      });
    }
    const pickClear = q('[data-pickclear]');
    if (pickClear) {
      pickClear.addEventListener('click', () => {
        this.toIds.clear();
        this.render();
      });
    }
    this._bindSearch('[data-acctsearch]', (v) => { this.accountQuery = v; });
    this._bindSearch('[data-search]', (v) => { this.query = v; });

    for (const btn of all('[data-item]')) {
      btn.addEventListener('click', () => this._pick(btn.dataset.item));
    }
    for (const btn of all('[data-unpick]')) {
      btn.addEventListener('click', () => this._pick(btn.dataset.unpick));
    }
    for (const input of all('[data-count]')) {
      input.addEventListener('change', () => {
        const row = this.picked.find((p) => p.id === input.dataset.count);
        if (row) row.count = Math.max(1, Math.min(999, Math.round(Number(input.value) || 1)));
        this.render();
      });
    }

    const send = q('[data-send]');
    if (send) send.addEventListener('click', () => this._send());

    const resetAll = q('[data-reset-all]');
    if (resetAll) {
      resetAll.addEventListener('click', () => {
        this.busy = true;
        this.render();
        this.bus.emit('admin:rank-reset', { boss: null });
      });
    }
    for (const btn of all('[data-reset-one]')) {
      btn.addEventListener('click', () => {
        this.busy = true;
        this.render();
        this.bus.emit('admin:rank-reset', { boss: btn.dataset.resetOne });
      });
    }

    this._bindGuard('[data-season-guard]', '[data-season-reset]', '다음 시즌',
      (v) => { this.seasonGuard = v; });

    // ── 계정 지우기 (0.46) ──
    this._bindSearch('[data-delsearch]', (v) => { this.delQuery = v; });
    for (const btn of all('[data-delacct]')) {
      btn.addEventListener('click', () => {
        const id = btn.dataset.delacct;
        if (this.delIds.has(id)) this.delIds.delete(id);
        else this.delIds.add(id);
        // 고른 사람이 바뀌면 확인 글자는 다시 받는다 —
        // 적어 둔 채로 다른 사람을 더 고르면 안 보고 누르게 된다.
        this.delGuard = '';
        this.render();
      });
    }
    const delClear = q('[data-delclear]');
    if (delClear) {
      delClear.addEventListener('click', () => {
        this.delIds.clear();
        this.delGuard = '';
        this.render();
      });
    }
    this._bindGuard('[data-delguard]', '[data-delrun]', '계정 삭제',
      (v) => { this.delGuard = v; });
    // ⚠ 잠겨 있어도 손잡이를 **미리** 단다 (0.53).
    //   확인 글을 적으면 다시 그리지 않고 그 자리에서 잠금만 풀리므로,
    //   "안 잠겼을 때만 단다" 로 두면 풀린 단추에 손잡이가 없다.
    const delRun = q('[data-delrun]');
    if (delRun) {
      delRun.addEventListener('click', () => {
        if (delRun.disabled) return;
        const ids = [...this.delIds];
        this.busy = true;
        this.delGuard = '';
        this.render();
        this.bus.emit('admin:account-delete', { ids });
      });
    }

    this._bindGuard('[data-mailwipe-guard]', '[data-mail-wipe]', '우편 삭제',
      (v) => { this.mailWipeGuard = v; });

    const wipe = q('[data-mail-wipe]');
    if (wipe) {
      wipe.addEventListener('click', () => {
        if (wipe.disabled) return;
        this.busy = true;
        this.mailWipeGuard = '';
        this.render();
        this.bus.emit('admin:mail-clear');
      });
    }

    const lock = q('[data-season-lock]');
    if (lock) {
      lock.addEventListener('change', () => {
        this.busy = true;
        this.render();
        this.bus.emit('admin:season-lock', { locked: lock.checked });
      });
    }

    this._bindGuard('[data-rewind-guard]', '[data-season-rewind]', '1 시즌',
      (v) => { this.rewindGuard = v; });

    const rewind = q('[data-season-rewind]');
    if (rewind) {
      rewind.addEventListener('click', () => {
        if (rewind.disabled) return;
        this.busy = true;
        this.rewindGuard = '';
        this.render();
        this.bus.emit('admin:season-set', { season: 1 });
      });
    }

    const also = q('[data-season-also]');
    if (also) {
      also.addEventListener('change', () => {
        this.seasonAlsoGift = also.checked;
        this.render();
      });
    }

    const seasonBtn = q('[data-season-reset]');
    if (seasonBtn) {
      seasonBtn.addEventListener('click', () => {
        if (seasonBtn.disabled) return;
        const withGift = this.seasonAlsoGift;
        this.busy = true;
        this.seasonGuard = '';
        this.render();
        this.bus.emit('admin:season-reset', { gift: withGift });
      });
    }

    const giftBtn = q('[data-season-gift]');
    if (giftBtn) {
      giftBtn.addEventListener('click', () => {
        this.busy = true;
        this.render();
        this.bus.emit('admin:season-gift');
      });
    }

    const look = q('[data-toggle-hidden]');
    if (look) look.addEventListener('click', () => this.bus.emit('admin:toggle-hidden'));

    const pull = q('[data-sheet-pull]');
    if (pull) {
      pull.addEventListener('click', () => {
        this.busy = true;
        this.render();
        this.bus.emit('admin:sheet-pull');
      });
    }

    const urlBox = q('[data-sheet-url]');
    // 다시 그릴 때 적던 글이 날아가지 않게 그때그때 들고 있는다.
    if (urlBox) urlBox.addEventListener('input', () => { this.sheetUrl = urlBox.value; });

    const save = q('[data-sheet-save]');
    if (save) {
      save.addEventListener('click', () => {
        const url = urlBox ? String(urlBox.value || '').trim() : '';
        if (!url) {
          this.status = '시트 주소를 붙여 넣어 주세요.';
          this.statusTone = 'bad';
          return this.render();
        }
        this.busy = true;
        this.render();
        this.bus.emit('admin:sheet-set', { url });
      });
    }

    const clear = q('[data-sheet-clear]');
    if (clear) {
      clear.addEventListener('click', () => {
        this.sheetUrl = '';
        this.busy = true;
        this.render();
        this.bus.emit('admin:sheet-set', { url: '' });
      });
    }
  }

  _send() {
    const form = this.root.querySelector('[data-mailform]');
    const val = (name) => {
      const el = form.querySelector(`[name="${name}"]`);
      return el ? String(el.value || '') : '';
    };
    const subject = val('subject').trim();
    if (!subject) {
      this.status = '제목을 적어 주세요.';
      this.statusTone = 'bad';
      return this.render();
    }
    if (this.mailTo === 'some' && !this.toIds.size) {
      this.status = '받을 사람을 한 명 이상 고르세요.';
      this.statusTone = 'bad';
      return this.render();
    }
    this.busy = true;
    this.render();
    this.bus.emit('admin:send-mail', {
      to: this.mailTo === 'some' ? [...this.toIds] : [],
      subject,
      body: val('body'),
      gold: Math.max(0, Math.round(Number(val('gold')) || 0)),
      exp: Math.max(0, Math.round(Number(val('exp')) || 0)),
      days: Math.max(0, Math.round(Number(val('days')) || 0)),
      items: this.picked.map((p) => ({ id: p.id, count: p.count })),
    });
  }
}

/**
 * 때를 짧게 적는다 (0.47 · 0.48).
 *
 * 오늘·어제는 시각까지, 그보다 오래되면 날짜만. 시험 계정을 지울 때 알고 싶은 것은
 * "몇 시인가" 이지 "2026년 9월 3일" 이 아니다.
 */
function whenText(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  const now = new Date();
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yesterday = new Date(now.getTime() - 86400000);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (sameDay(d, now)) return `오늘 ${hm}`;
  if (sameDay(d, yesterday)) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 계정 한 줄에 붙일 때 정보 (0.48).
 *
 * **마지막 접속을 늘 적는다.** 운영자가 이 목록을 보며 묻는 것은 거의 언제나
 * "이 계정 아직 쓰나" 이고, 그 답은 마지막 접속이다.
 * 만든 때는 **그와 다를 때만** 덧붙인다 — 갓 만든 계정에 같은 시각을 두 번 적으면
 * 줄만 길어지고 아무것도 안 알려 준다.
 *
 * ⚠ 두 값이 같은지는 **적힌 시각(ISO)** 으로 가른다. 화면에 찍히는 글로 견주면
 *   같은 분 안에 다시 들어온 것이 "안 들어옴" 으로 보인다(처음에 그랬다).
 */
function acctWhen(a) {
  const made = whenText(a.createdAt);
  const seen = whenText(a.lastLoginAt);
  const same = a.createdAt && a.lastLoginAt && a.createdAt === a.lastLoginAt;
  const parts = [];
  if (seen) parts.push(`접속 ${seen}`);
  else parts.push('접속 없음');
  if (made && !same) parts.push(`만듦 ${made}`);
  return ` · <i class="admin-item-when">${escapeHtml(parts.join(' · '))}</i>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function escapeAttr(s) {
  return escapeHtml(s);
}
