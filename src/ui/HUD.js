// 책임: 화면 가장자리의 상태 표시 — HP · 경험치 · 퀘스트 · 위치/골드 · 기능 버튼.
// 금지: 게임 상태 수정. 읽기만 한다.
// 금지: 전투/인벤토리 규칙 판단.
//
// ── 배치 (디아블로식) ──────────────────────────────────────
// 예전에는 왼쪽 위에 카드 하나로 전부 몰아 두었다. 그 카드가 화면 왼쪽을
// 통째로 덮어서, 정작 걸어 다니는 땅이 안 보였다.
// 지금은 네 귀퉁이로 흩어 놓고 가운데를 완전히 비운다.
//
//   왼쪽 아래   HP 구슬 — 죽고 사는 값이라 눈이 가장 자주 가는 자리
//   맨 아래     경험치 — 가늘고 긴 회색 띠. 10% 마다 눈금
//   오른쪽 위   퀘스트 ! 아이콘 — 다 모으면 반짝인다. 누르면 내용
//   오른쪽 아래 지금 있는 곳 · 골드
//   오른쪽 세로 귀환 · 캐릭터 · 우편 · 랭킹 · 설정 · 도움말 (아이콘만)
//
// 전투력·공격력 같은 숫자는 여기서 뺐다. 늘 보고 있을 값이 아니라
// 장비를 고칠 때 보는 값이라, 소지품·캐릭터 창에서 보여 준다.

import { computePlayerStats } from '../entities/StatBlock.js';
import { expProgress, expNeeded } from '../systems/ProgressionSystem.js';
import { currentQuest, progressOf } from '../systems/QuestSystem.js';

/** 오른쪽 세로줄에 세울 버튼들. 아이콘 하나와 설명만 있으면 된다. */
const TOOLS = [
  { key: 'town', icon: '🏠', label: '마을로 귀환', hint: '그 자리에 돌아올 포탈이 남습니다', event: 'ui:return-town' },
  { key: 'char', icon: '✦', label: '캐릭터', hint: '장비 · 특성 · 스킬 (C)', event: 'ui:character', badge: 'points' },
  { key: 'bag', icon: '🎒', label: '소지품', hint: '가진 것 전부 (I)', event: 'ui:inventory' },
  { key: 'mail', icon: '✉', label: '우편함', hint: '고룡 몫과 이벤트 선물 (M)', event: 'ui:mail', badge: 'mail' },
  { key: 'rank', icon: '🏆', label: '타임어택', hint: '보스별 상위 5명 (R)', event: 'ui:rank' },
  { key: 'set', icon: '⚙', label: '설정', hint: '화면 · 조작 (O)', event: 'ui:settings' },
  { key: 'help', icon: '?', label: '조작법', hint: '', event: null },
  // 운영자만 보인다. 처음에는 숨어 있고, 서버가 "운영자 맞다"고 답하면 나타난다.
  { key: 'admin', icon: '🛡', label: '운영자', hint: '', event: 'ui:admin', adminOnly: true },
];

const HELP_LINES = [
  ['방향키 / WASD', '이동'],
  ['Enter · NPC 클릭', '대화 · 확인'],
  ['I', '소지품'],
  ['C', '캐릭터'],
  ['M', '우편함'],
  ['R', '타임어택'],
  ['O', '설정'],
  ['1 ~ 4', '단축키 물약'],
  ['Shift', '전투 빨리감기'],
  ['?', '이 창 — 막혔을 때 빠져나오기'],
];

export class HUD {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    this.helpOpen = false;
    this.questOpen = false;
    this.isAdmin = false;
    this._build();
    this._unsub = store.subscribe(() => this.render());
    this.render();
  }

  _build() {
    this.root.innerHTML = `
      <!-- 왼쪽 아래 — HP 구슬 -->
      <div class="hud-orb" data-orb>
        <div class="orb-liquid"><div class="orb-fill" data-hp-fill></div></div>
        <div class="orb-face">
          <span class="orb-hp" data-hp-text></span>
          <span class="orb-lv">Lv.<b data-level></b></span>
        </div>
      </div>

      <!-- 왼쪽 아래 · 구슬 위 — 버프와 고룡 -->
      <div class="hud-left">
        <div class="hud-dragon" data-dragon hidden></div>
        <div class="hud-buffs" data-buffs></div>
      </div>

      <!-- 맨 아래 — 경험치 띠. 10% 마다 눈금 -->
      <div class="hud-exp" data-exp title="경험치">
        <i data-exp-fill></i>
        <div class="hud-exp-ticks">${'<span></span>'.repeat(9)}</div>
        <span class="hud-exp-text" data-exp-text></span>
      </div>

      <!-- 오른쪽 위 — 퀘스트 -->
      <button class="hud-quest-btn" data-quest-btn hidden>
        <span class="hq-mark">!</span>
        <span class="hq-badge" data-quest-badge hidden></span>
      </button>
      <div class="hud-quest-card" data-quest-card hidden></div>

      <!-- 오른쪽 세로 — 기능 아이콘 -->
      <div class="hud-tools">
        ${TOOLS.map(
          (t) => `<button class="hud-tool${t.adminOnly ? ' hud-tool--admin' : ''}"
                   data-tool="${t.key}" title="${t.label}${t.hint ? ` — ${t.hint}` : ''}"
                   ${t.adminOnly ? 'hidden' : ''}>
            <span class="ht-icon">${t.icon}</span>
            ${t.badge ? `<span class="ht-badge" data-badge-${t.badge} hidden></span>` : ''}
          </button>`
        ).join('')}
      </div>

      <!-- 도움말 — 물음표를 누르면 열린다.
           아래쪽 '막혔을 때' 는 조작법이 아니라 **빠져나오는 길**이다.
           움직이지 못하게 됐을 때 사람이 찾아갈 곳이 여기뿐이라 같이 둔다. -->
      <div class="hud-help-card" data-help hidden>
        <div class="hh-title">조작법</div>
        <dl>${HELP_LINES.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="hh-title hh-title--stuck">막혔을 때</div>
        <p class="hh-note">움직이지 않으면 아래를 눌러 보세요. 세이브는 먼저 저장됩니다.</p>
        <div class="hh-fix">
          <button class="hh-btn" data-fix-unstick>조작 되살리기</button>
          <button class="hh-btn" data-fix-town>마을에서 다시 시작</button>
          <button class="hh-btn hh-btn--warn" data-fix-reload>다시 접속</button>
        </div>
      </div>

      <!-- 오른쪽 아래 — 지금 있는 곳과 골드 -->
      <div class="hud-place">
        <span class="hp-where" data-place></span>
        <span class="hp-gold">🪙 <b data-gold></b></span>
        <span class="hud-net" data-net hidden></span>
      </div>
    `;

    this.el = {
      orb: this.root.querySelector('[data-orb]'),
      hpFill: this.root.querySelector('[data-hp-fill]'),
      hpText: this.root.querySelector('[data-hp-text]'),
      level: this.root.querySelector('[data-level]'),
      expFill: this.root.querySelector('[data-exp-fill]'),
      expText: this.root.querySelector('[data-exp-text]'),
      questBtn: this.root.querySelector('[data-quest-btn]'),
      questBadge: this.root.querySelector('[data-quest-badge]'),
      questCard: this.root.querySelector('[data-quest-card]'),
      help: this.root.querySelector('[data-help]'),
      fixUnstick: this.root.querySelector('[data-fix-unstick]'),
      fixTown: this.root.querySelector('[data-fix-town]'),
      fixReload: this.root.querySelector('[data-fix-reload]'),
      buffs: this.root.querySelector('[data-buffs]'),
      dragon: this.root.querySelector('[data-dragon]'),
      place: this.root.querySelector('[data-place]'),
      gold: this.root.querySelector('[data-gold]'),
      net: this.root.querySelector('[data-net]'),
      town: this.root.querySelector('[data-tool="town"]'),
      admin: this.root.querySelector('[data-tool="admin"]'),
      badgePoints: this.root.querySelector('[data-badge-points]'),
      badgeMail: this.root.querySelector('[data-badge-mail]'),
    };

    for (const t of TOOLS) {
      const btn = this.root.querySelector(`[data-tool="${t.key}"]`);
      if (!btn) continue;
      btn.addEventListener('click', () => {
        if (t.key === 'help') return this._toggleHelp();
        this._closePopups();
        if (t.event) this.bus.emit(t.event);
      });
    }

    // 막혔을 때 빠져나오는 세 가지. 실제 처리는 main.js 가 한다(UI 는 알리기만).
    this.el.fixUnstick.addEventListener('click', () => {
      this._closePopups();
      this.bus.emit('ui:unstick');
    });
    this.el.fixTown.addEventListener('click', () => {
      this._closePopups();
      this.bus.emit('ui:restart-town');
    });
    this.el.fixReload.addEventListener('click', () => {
      this._closePopups();
      this.bus.emit('ui:reconnect');
    });

    // 퀘스트는 아이콘을 눌러야 내용이 나온다 — 늘 펼쳐 두면 화면을 가린다.
    this.el.questBtn.addEventListener('click', () => {
      this.questOpen = !this.questOpen;
      this.helpOpen = false;
      this.render();
    });
  }

  _toggleHelp() {
    this.helpOpen = !this.helpOpen;
    this.questOpen = false;
    this.render();
  }

  _closePopups() {
    this.helpOpen = false;
    this.questOpen = false;
    this.el.help.hidden = true;
    this.el.questCard.hidden = true;
  }

  /** 운영자 버튼을 보일지. main.js 가 서버에 물어보고 알려 준다. */
  setAdmin(on) {
    this.isAdmin = !!on;
    if (this.el.admin) this.el.admin.hidden = !this.isAdmin;
  }

  setVisible(v) {
    this.root.hidden = !v;
    if (!v) this._closePopups();
  }

  render() {
    const state = this.store.state;
    if (!state.player) return;
    const stats = computePlayerStats(state);
    const p = state.player;

    // ── HP 구슬 ── 아래에서 위로 찬다. 위험할수록 붉게.
    const ratio = stats.hp > 0 ? Math.max(0, Math.min(1, p.hp / stats.hp)) : 0;
    this.el.hpFill.style.height = `${ratio * 100}%`;
    this.el.orb.classList.toggle('is-low', ratio <= 0.3);
    // 숫자가 길어지면 글자를 한 단계씩 줄인다. 구슬은 84px 인데 "12345 / 23456" 은
    // 그보다 넓다 — 0.40 이전에는 이 줄이 동그라미에 잘려 앞뒤가 안 보였다.
    const hpText = `${p.hp.toLocaleString('ko-KR')} / ${stats.hp.toLocaleString('ko-KR')}`;
    this.el.hpText.textContent = hpText;
    this.el.hpText.classList.toggle('is-long', hpText.length >= 11);
    this.el.hpText.classList.toggle('is-longer', hpText.length >= 14);
    this.el.level.textContent = p.level;

    // ── 경험치 띠 ──
    const need = expNeeded(state);
    const prog = expProgress(state);
    this.el.expFill.style.width = `${prog * 100}%`;
    this.el.expText.textContent = isFinite(need)
      ? `${Math.floor(prog * 100)}%`
      : 'MAX';

    // ── 오른쪽 아래 ──
    this.el.gold.textContent = Number(p.gold || 0).toLocaleString('ko-KR');
    this.el.place.textContent = state.map ? state.map.name : '';
    this.el.town.disabled = state.map ? state.map.kind === 'town' : false;

    // ── 배지 ──
    const points = (p.traitPoints || 0) + (p.skillPoints || 0);
    this.el.badgePoints.hidden = points === 0;
    this.el.badgePoints.textContent = points;

    const unread = ((state.mail && state.mail.list) || []).filter((m) => !m.taken).length;
    this.el.badgeMail.hidden = unread === 0;
    this.el.badgeMail.textContent = unread;

    this.el.help.hidden = !this.helpOpen;
    // _build 는 한 번뿐이지만 render 는 자주 돈다 — 운영자 버튼이 도로 숨지 않게 지킨다.
    if (this.el.admin) this.el.admin.hidden = !this.isAdmin;

    this._renderBuffs(state);
    this._renderQuest(state);
    this._renderDragon(state);
  }

  /**
   * 퀘스트 — 오른쪽 위의 ! 아이콘.
   * 다 모으면 아이콘 겉이 반짝인다. 눌러야 내용이 펼쳐진다.
   */
  _renderQuest(state) {
    const quest = currentQuest(state);
    if (!quest) {
      this.el.questBtn.hidden = true;
      this.el.questCard.hidden = true;
      return;
    }
    const p = progressOf(state, quest);
    this.el.questBtn.hidden = false;
    this.el.questBtn.className = `hud-quest-btn ${p.done ? 'is-ready' : ''}`;
    this.el.questBtn.title = p.done
      ? `${quest.title} — 다 모았습니다. 맡긴 사람에게 돌아가세요`
      : `${quest.title} — ${p.have}/${p.need}`;

    this.el.questBadge.hidden = !p.done;
    this.el.questBadge.textContent = '✔';

    this.el.questCard.hidden = !this.questOpen;
    if (!this.questOpen) return;
    this.el.questCard.className = `hud-quest-card ${p.done ? 'is-ready' : ''}`;
    // 같은 내용이면 다시 만들지 않는다(깜빡임 방지).
    const qsig = `${quest.title}|${p.have}/${p.need}|${p.done}`;
    if (qsig === this._questSig) return;
    this._questSig = qsig;
    this.el.questCard.innerHTML = `
      <div class="hqc-title">${quest.title}</div>
      <p class="hqc-desc">${quest.desc || ''}</p>
      <div class="hqc-bar"><i style="width:${Math.min(100, (p.have / Math.max(1, p.need)) * 100)}%"></i></div>
      <div class="hqc-foot">
        <span>${p.have} / ${p.need}</span>
        <span class="${p.done ? 'is-ready' : 'muted'}">${
          p.done ? '다 모았다 — 맡긴 사람에게' : '모으는 중'
        }</span>
      </div>`;
  }

  _renderBuffs(state) {
    const buffs = state.buffs || [];
    if (!buffs.length) {
      if (this._buffSig !== '') {
        this._buffSig = '';
        this.el.buffs.innerHTML = '';
      }
      this.el.buffs.hidden = true;
      return;
    }
    this.el.buffs.hidden = false;

    // 버프 칩은 초 단위로만 바뀐다. 그런데 HUD 는 체력이 찰 때마다(초당 네 번)
    // 다시 그려지므로, 그때마다 innerHTML 을 갈면 아이콘이 눈에 띄게 깜빡인다.
    // 보이는 글자가 그대로면 DOM 을 손대지 않는다.
    const sig = buffs
      .map((b) => `${b.id}:${Math.max(0, Math.ceil(b.remaining / 1000))}`)
      .join(',');
    if (sig === this._buffSig) return;
    this._buffSig = sig;

    this.el.buffs.innerHTML = buffs
      .map((b) => {
        const sec = Math.max(0, Math.ceil(b.remaining / 1000));
        const time = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${sec}s`;
        return `<span class="buff-chip" title="${b.name} — ${b.desc || ''}">
                  ${b.icon}<b>${time}</b>
                </span>`;
      })
      .join('');
  }

  /**
   * 고룡 상태 줄. 그 땅에 있을 때만 뜬다.
   *
   * 여기 서 있는 동안 알고 싶은 것은 딱 둘이다 —
   * "얼마나 깎였나"와 "언제 사라지나".
   */
  _renderDragon(state) {
    const info = state.dragonHud;
    const el = this.el.dragon;
    if (!info || !info.show) {
      el.hidden = true;
      return;
    }
    el.hidden = false;

    if (!info.present) {
      el.className = 'hud-dragon is-gone';
      el.innerHTML = `<span class="hd-name">${info.name}</span>
        <span class="hd-note">${info.note || '지금은 없다'}</span>`;
      return;
    }

    const pct = Math.max(0, Math.min(100, Math.round((info.hp / Math.max(1, info.maxHp)) * 100)));
    el.className = 'hud-dragon';
    el.innerHTML = `
      <div class="hd-head">
        <span class="hd-name">${info.name}</span>
        <span class="hd-left">${info.leftText} 뒤 떠남</span>
      </div>
      <div class="hd-bar"><i style="width:${pct}%"></i></div>
      <div class="hd-foot">
        <span>체력 <b>${pct}%</b></span>
        <span class="hd-hp">${info.hp.toLocaleString()} / ${info.maxHp.toLocaleString()}</span>
      </div>
      ${info.shared ? '' : '<div class="hd-solo">혼자 하는 중 — 이 상처는 나만의 것</div>'}`;
  }

  /**
   * 접속 상태 표시.
   *
   * 그냥 인원수만 보여 주면 "왜 친구가 안 보이지?" 를 알 수가 없다.
   * 서버에 붙어 있는지, 이 브라우저 안에만 있는지를 한눈에 구분되게 적는다.
   *
   * @param {number} count 같은 맵에 있는 다른 사람 수
   * @param {boolean} online 서버와 연결되어 있는가
   * @param {boolean} hasServer 애초에 서버가 있는 주소로 들어왔는가
   */
  setNet(count, online, hasServer = online) {
    if (!this.el || !this.el.net) return;
    const el = this.el.net;
    el.hidden = false;
    el.classList.toggle('is-off', !online);

    if (online) {
      el.textContent = `🌐 ${count}명`;
      el.title = '서버에 연결되어 있습니다. 같은 맵에 있는 사람만 세어집니다.';
      return;
    }
    if (hasServer) {
      el.textContent = '⚠ 연결 끊김';
      el.title = '서버와의 연결이 끊겼습니다. 스스로 다시 붙습니다.';
      return;
    }
    if (count) {
      el.textContent = `🖥 ${count}명`;
      el.title = '서버 없이 이 브라우저의 다른 탭끼리만 연결되어 있습니다.';
      return;
    }
    el.textContent = '🖥 혼자';
    el.title =
      '서버를 찾지 못해 이 브라우저 안에서만 놀고 있습니다.\n' +
      '다른 기기와 같이 놀려면 서버 주소(https://…)로 접속하세요.';
  }
}
