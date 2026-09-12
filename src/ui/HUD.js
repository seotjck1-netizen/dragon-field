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
  { key: 'town', icon: '🏠', label: '마을로 귀환', hint: '그 자리에 돌아올 포탈이 남습니다 (T)', event: 'ui:return-town' },
  { key: 'char', icon: '✦', label: '캐릭터', hint: '장비 · 특성 · 스킬 (C)', event: 'ui:character', badge: 'points' },
  { key: 'bag', icon: '🎒', label: '소지품', hint: '가진 것 전부 (I)', event: 'ui:inventory' },
  { key: 'mail', icon: '✉', label: '우편함', hint: '고룡 몫과 이벤트 선물 (M)', event: 'ui:mail', badge: 'mail' },
  { key: 'rank', icon: '🏆', label: '타임어택', hint: '보스별 상위 5명 (R)', event: 'ui:rank' },
  { key: 'set', icon: '⚙', label: '설정', hint: '화면 · 조작 (O)', event: 'ui:settings' },
  { key: 'help', icon: '?', label: '조작법', hint: '단축키 전부 (?)', event: null },
  // 운영자만 보인다. 처음에는 숨어 있고, 서버가 "운영자 맞다"고 답하면 나타난다.
  { key: 'admin', icon: '🛡', label: '운영자', hint: '', event: 'ui:admin', adminOnly: true },
];

// 조작법 카드에 적는 줄.
//
// ⚠ **키를 늘리면 여기도 늘린다.** 적어 두지 않은 키는 없는 키와 같다 —
//   아무도 눌러 보지 않기 때문이다. (0.69 에 Q·T·? 를 넣으면서 함께 적었다)
//   짝은 core/Input.js 의 KEY_MAP 이다.
const HELP_LINES = [
  ['방향키 / WASD', '이동 (둘을 같이 = 대각선)'],
  ['Enter · NPC 클릭', '대화 · 확인'],
  ['Esc', '창 닫기'],
  ['I · Tab', '소지품'],
  ['C', '캐릭터 · 장비 · 스킬'],
  ['Q', '의뢰'],
  ['T', '마을로 귀환'],
  ['M', '우편함'],
  ['R', '타임어택 랭킹'],
  ['O · F1', '설정'],
  ['1 ~ 4', '단축칸 물약'],
  ['Shift', '전투 빨리감기'],
  ['?', '이 창'],
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
        <!-- 유리병 (0.70.1).
             겹 순서가 곧 유리다 — 안쪽 그늘 → 피 → 물결 → 유리 반사 → 테.
             하나라도 자리를 바꾸면 '유리에 담긴 것' 이 아니라 '색칠한 원' 이 된다. -->
        <div class="orb-liquid">
          <div class="orb-fill" data-hp-fill>
            <span class="orb-wave"></span>
            <span class="orb-wave orb-wave--b"></span>
          </div>
          <div class="orb-inner-shadow"></div>
        </div>
        <div class="orb-glass"></div>
        <div class="orb-rim"></div>
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
        <p class="hh-note">움직이지 않으면 아래를 눌러 보세요.</p>
        <div class="hh-fix">
          <button class="hh-btn" data-fix-unstick>조작 되살리기</button>
          <button class="hh-btn" data-fix-town>마을에서 다시 시작</button>
          <button class="hh-btn hh-btn--warn" data-fix-reload>다시 접속</button>
        </div>
      </div>

      <!-- 왼쪽 위 — 초당 프레임 (설정에서 켤 때만) -->
      <div class="hud-fps" data-fps hidden></div>

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
      fps: this.root.querySelector('[data-fps]'),
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

  /** 조작법 카드 열고 닫기. '?' 단추와 **? 키**가 같이 쓴다 (0.69). */
  toggleHelp() {
    this.helpOpen = !this.helpOpen;
    this.questOpen = false;
    this.render();
  }

  /** 옛 이름 — 안쪽에서 부르던 자리를 위해 남겨 둔다. */
  _toggleHelp() {
    this.toggleHelp();
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

  /**
   * 초당 프레임 (0.70.1).
   *
   * ⚠ **매 프레임 DOM 을 고치면 안 된다.** 재는 것 때문에 느려지면 재는 뜻이 없다.
   *   초당 한 번만 글자를 갈아 끼운다.
   *
   * 색으로도 말한다 — 55 위는 조용한 회색, 40~55 는 노랑, 그 아래는 빨강.
   * 소리가 끊길 만큼 느려졌는지를 숫자를 읽지 않고도 알 수 있어야 한다.
   */
  tickFps(now) {
    const on = (this.store.state.settings || {}).showFps === true;
    const el = this.el && this.el.fps;
    if (!el) return;
    if (!on) {
      if (!el.hidden) { el.hidden = true; el.textContent = ''; }
      this._fps = null;
      return;
    }
    if (!this._fps) this._fps = { n: 0, at: now, low: 999 };
    const f = this._fps;
    f.n++;
    const span = now - f.at;
    if (span < 1000) return;
    const v = Math.round((f.n * 1000) / span);
    f.low = Math.min(f.low, v);
    f.n = 0;
    f.at = now;
    el.hidden = false;
    el.textContent = `${v} fps  (최저 ${f.low})`;
    el.className = `hud-fps ${v >= 55 ? '' : v >= 40 ? 'is-warn' : 'is-bad'}`;
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
    // ⚠ parts 도 서명에 넣는다. 20/0 과 10/10 은 **합이 같다** —
    //   빼 두면 한쪽만 잡는 동안 카드가 멈춰 있는다.
    const qsig = `${quest.title}|${p.have}/${p.need}|${p.done}`
      + (p.parts ? '|' + p.parts.map((x) => `${x.target}:${x.have}`).join(',') : '');
    if (qsig === this._questSig) return;
    this._questSig = qsig;
    // 대상이 둘이면 어느 쪽이 모자란지가 알고 싶은 전부다 — 한 줄씩 따로 적는다.
    const parts = (p.parts || [])
      .map((x) => `<div class="hqc-part ${x.done ? 'is-ready' : ''}">`
        + `${esc(x.label)} <b>${x.have} / ${x.need}</b></div>`)
      .join('');
    this.el.questCard.innerHTML = `
      <div class="hqc-title">${quest.title}</div>
      <p class="hqc-desc">${quest.desc || ''}</p>
      <div class="hqc-bar"><i style="width:${Math.min(100, (p.have / Math.max(1, p.need)) * 100)}%"></i></div>
      ${parts}
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
   * 0.61 — **어느 땅에 있든 다 센다.**
   *   그 전에는 같은 맵에 있는 사람만 셌다. 그래서 친구가 옆 들판으로 한 칸만 넘어가도
   *   '0명' 이 되어, 서버가 끊긴 것과 구별이 안 됐다. 이제 접속한 사람을 전부 세고,
   *   그 가운데 몇이 지금 이 땅에 있는지를 괄호로 덧붙인다.
   *
   * @param {number} total 어느 맵에 있든 접속해 있는 다른 사람 수
   * @param {boolean} online 서버와 연결되어 있는가
   * @param {boolean} hasServer 애초에 서버가 있는 주소로 들어왔는가
   * @param {number} [here] 그 가운데 지금 같은 맵에 있는 수
   */
  setNet(total, online, hasServer = online, here = null) {
    if (!this.el || !this.el.net) return;
    const el = this.el.net;
    const count = total;
    el.hidden = false;
    el.classList.toggle('is-off', !online);

    if (online) {
      // 다 같은 땅에 있으면 괄호를 안 붙인다 — 늘 붙으면 눈에 안 들어온다.
      const sameSpot = here == null || here === total;
      el.textContent = sameSpot ? `🌐 ${total}명` : `🌐 ${total}명 (여기 ${here})`;
      el.title = sameSpot
        ? '서버에 접속해 있는 사람 수입니다(어느 땅에 있든 모두).'
        : `서버에 접속해 있는 사람 ${total}명 가운데 ${here}명이 지금 이 땅에 있습니다.`;
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

/** 몬스터 이름은 표에서 온다 — 표에 태그를 적어 넣어도 글자로만 나가게 한다. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
