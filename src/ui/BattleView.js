// 책임: 전투 타임라인 이벤트를 받아 HP바·데미지 숫자·로그·결과창을 DOM으로 보여준다.
// 금지: 데미지/승패 계산. 이미 계산된 이벤트를 표시만 한다.
// 금지: 게임 상태 수정. 결과 확인은 이벤트('battle:close')로 알린다.

import { hitWeight } from '../core/hitLook.js';

// 로그에 붙일 특수 공격 이름
const TAG_LABEL = {
  opener: '선제 사격!',
  charge: '마력 충전 폭발!',
  cleave: '광역 여파',
  counter: '반격!',
  // 보호막이 켜져 있는 동안의 덤 공격. 왜 두 번 쳤는지가 보여야 한다.
  shield: '보호막 반격!',
};

/** 빗나감 한 줄의 문구. tag 에 따라 이유가 달라진다. */
const MISS_LINE = {
  shield: () => '보호막이 튕겨냈다',
  guard: () => '완전히 피했다',
};

export class BattleView {
  /**
   * @param {() => object} [getSettings] 설정값(피해 숫자 표시 여부 등)
   * @param {object} [assets] 보스 등장 연출에 그 몬스터 그림을 쓴다 (0.47)
   */
  constructor({ bus, root, assets = null, getSettings = () => ({}) }) {
    this.bus = bus;
    this.root = root;
    this.assets = assets;
    this.getSettings = getSettings;
    /** 보스 등장 연출이 도는 중인가. 도는 동안 전투 재생을 멈춘다. */
    this.introTimer = null;
    this._build();

    bus.on('battle:start', (payload) => this.start(payload));
    bus.on('battle:event', (turn) => this.onTurn(turn));
    bus.on('battle:result', (summary) => this.showResult(summary));
    bus.on('battle:close', () => this.hide());
  }

  _build() {
    this.root.innerHTML = `
      <div class="battle-hud">
        <div class="fighter fighter--monster">
          <div class="fighter-name" data-mon-name></div>
          <div class="bar bar--hp"><i data-mon-fill></i><span data-mon-text></span></div>
        </div>
        <div class="fighter fighter--player">
          <div class="fighter-name" data-ply-name></div>
          <div class="bar bar--hp"><i data-ply-fill></i><span data-ply-text></span></div>
        </div>
      </div>
      <div class="damage-layer" data-damage></div>
      <div class="boss-intro" data-intro hidden></div>
      <div class="battle-log" data-log></div>
      <button class="skip-btn" data-skip>스킵 ⏭</button>
      <div class="result-panel" data-result hidden></div>
    `;
    this.el = {
      monName: this.root.querySelector('[data-mon-name]'),
      monFill: this.root.querySelector('[data-mon-fill]'),
      monText: this.root.querySelector('[data-mon-text]'),
      plyName: this.root.querySelector('[data-ply-name]'),
      plyFill: this.root.querySelector('[data-ply-fill]'),
      plyText: this.root.querySelector('[data-ply-text]'),
      damage: this.root.querySelector('[data-damage]'),
      intro: this.root.querySelector('[data-intro]'),
      log: this.root.querySelector('[data-log]'),
      skip: this.root.querySelector('[data-skip]'),
      result: this.root.querySelector('[data-result]'),
    };
    this.el.skip.addEventListener('click', () => {
      this._endIntro(); // 건너뛰기를 눌렀는데 배너가 남아 있으면 안 된다
      this.bus.emit('battle:skip');
    });
    this.root.hidden = true;
  }

  start(payload) {
    this.root.hidden = false;
    this.root.classList.add('is-active');
    this.el.result.hidden = true;
    this.el.result.innerHTML = '';
    this.el.log.innerHTML = '';
    this.el.damage.innerHTML = '';
    this.el.skip.hidden = false;
    this._cutDone = false; // 쓰러짐 연출은 전투마다 한 번(위 showResult 참고)

    const { player, monster } = payload;
    // 여러 마리일 수 있다. HP 바는 "지금 상대하는 놈"을 보여 주고 남은 수를 함께 적는다.
    this.monsters = (payload.monsters && payload.monsters.length)
      ? payload.monsters
      : monster ? [monster] : [];
    this.monsterHp = this.monsters.map((m) => m.maxHp);
    this.focus = 0;

    this.max = { player: player.maxHp, monster: this.monsters[0]?.maxHp || 1 };

    this.el.plyName.textContent = `${player.name}  Lv.${player.level ?? '?'}`;
    this._renderMonsterHead();
    this._setBar('player', player.hp ?? player.maxHp);

    if (this.monsters.length > 1) {
      const names = this.monsters.map((m) => m.name).join(', ');
      this._log(`${names} — 모두 ${this.monsters.length}마리가 몰려왔다!`, 'bad');
    } else if (this.monsters[0]) {
      this._log(`${this.monsters[0].name}이(가) 나타났다!`);
    }

    // 보스가 나왔으면 이름을 크게 한 번 보여 준다 (0.47).
    this._bossCut(this.monsters.find((m) => m.boss), 'in');

    // 기세 — 같은 상대라도 판마다 컨디션이 다르다. 크게 치우쳤을 때만 알려 준다.
    // (왜 방금은 쉬웠는지 / 왜 이번엔 안 되는지를 사람이 알 수 있어야 한다)
    for (const m of this.monsters) {
      if (m.mood == null) continue;
      const off = Math.round((m.mood - 1) * 100);
      if (Math.abs(m.mood - 1) < 0.08) continue;
      this._log(
        off > 0
          ? `${m.name}이(가) 잔뜩 벼르고 있다 — 기세 +${off}%`
          : `${m.name}은(는) 지쳐 보인다 — 기세 ${off}%`,
        off > 0 ? 'bad' : 'good'
      );
    }
  }

  /**
   * 보스 연출 — 등장(0.47)과 쓰러짐(0.48).
   *
   * 두 자리가 같은 틀을 쓴다. 다른 것은 세 가지뿐이다: 위쪽 딱지(`보스` / `쓰러졌다`),
   * 어느 대사를 읽나(`intro` / `defeat`), 그리고 얼마나 오래 머무나.
   * 하나로 묶어 두면 "등장은 고쳤는데 쓰러짐은 안 고친" 일이 안 생긴다.
   *
   * 규칙 셋:
   *   · **보스일 때만.** 잡몹마다 뜨면 사냥하는 내내 화면이 덮인다.
   *   · **건너뛰기를 켜 두었으면 안 뜬다.** 그 사람은 연출을 안 보겠다고 한 것이다.
   *   · **도는 동안 전투가 멈춘다.** 안 그러면 배너 뒤에서 첫 대가 오간다
   *     (bus 로 알려 주고, main.js 가 씬을 멈춘다).
   *
   * @param {object} boss 전투에 넘어온 몬스터 하나 (name · level · sprite · intro · defeat · grand)
   * @param {'in'|'out'} kind 등장인가 쓰러짐인가
   */
  _bossCut(boss, kind = 'in') {
    this._endIntro();
    if (!boss) return;
    if (this.getSettings().battleSkip) return;

    // 고룡은 크게 — 화면을 통째로 쓰고 더 오래 머문다.
    const grand = kind === 'in' && !!boss.grand;
    const line = kind === 'in' ? boss.intro : boss.defeat;
    const tag = kind === 'in' ? (grand ? '고룡' : '보스') : '쓰러졌다';
    const ms = kind === 'in' ? (grand ? 2800 : 1700) : 1600;

    const asset = this.assets && boss.sprite
      ? (typeof boss.sprite === 'string' ? this.assets.get(boss.sprite) : boss.sprite)
      : null;
    const art = asset && asset.image
      ? `<img class="boss-intro-art" src="${escapeAttr(asset.image.src)}" alt="" />`
      : '';

    this.el.intro.className = `boss-intro boss-intro--${kind}${grand ? ' boss-intro--grand' : ''}`;
    this.el.intro.innerHTML = `
      <div class="boss-intro-card">
        ${art}
        <div class="boss-intro-text">
          <span class="boss-intro-tag">${escapeHtml(tag)}</span>
          <strong class="boss-intro-name">${escapeHtml(boss.name || '')}</strong>
          ${kind === 'in'
            ? `<span class="boss-intro-lv">Lv.${boss.level ?? '?'}</span>`
            : ''}
        </div>
      </div>
      ${line ? `<p class="boss-intro-line">${escapeHtml(line)}</p>` : ''}`;
    this.el.intro.hidden = false;
    // 다음 프레임에 클래스를 붙여야 애니메이션이 처음부터 돈다
    // (같은 프레임에 붙이면 브라우저가 '처음부터 그 상태였다'고 본다).
    requestAnimationFrame(() => this.el.intro.classList.add('is-in'));
    // 무엇이 뜨는지도 함께 알린다 — main.js 가 그에 맞는 소리를 낸다.
    // (`on` 만 보고 멈추면 되므로 듣는 쪽이 나머지를 몰라도 된다)
    this.bus.emit('battle:intro', { on: true, kind, grand });
    this.introTimer = setTimeout(() => this._endIntro(), ms);
  }

  /** 연출을 걷는다. 시간이 다 됐거나, 건너뛰기를 눌렀거나, 다음 전투가 시작됐거나. */
  _endIntro() {
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
    if (!this.el || !this.el.intro) return;
    if (!this.el.intro.hidden) {
      this.el.intro.hidden = true;
      this.el.intro.className = 'boss-intro';
      this.el.intro.innerHTML = '';
      this.bus.emit('battle:intro', { on: false });
    }
  }

  /** 상대 쪽 이름줄 + HP 바를 지금 보고 있는 몬스터 기준으로 갱신한다. */
  _renderMonsterHead() {
    const m = this.monsters[this.focus];
    if (!m) return;
    const alive = this.monsterHp.filter((hp) => hp > 0).length;
    const tail = this.monsters.length > 1 ? `  <i class="foe-count">남은 ${alive}마리</i>` : '';
    this.el.monName.innerHTML = `${m.name}  Lv.${m.level ?? '?'}${tail}`;
    this.max.monster = m.maxHp;
    this._setBar('monster', this.monsterHp[this.focus]);
  }

  /** 설정에서 피해 숫자를 켜 두었는가. */
  _showDamage() {
    return this.getSettings().damageNumbers !== false;
  }

  onTurn(turn) {
    if (turn.type === 'hit') {
      if (turn.target === 'monster') {
        const i = turn.targetIndex ?? 0;
        this.monsterHp[i] = turn.targetHpAfter;
        this.focus = i;
        this._renderMonsterHead();
      } else {
        // 마력 흡수가 터진 대는 targetHpAfter 가 이미 되찾은 뒤의 값이다.
        this._setBar('player', turn.targetHpAfter);
      }
      if (turn.actor === 'player' && turn.actorHpAfter != null) {
        this._setBar('player', turn.actorHpAfter);
      }
      // 때린 쪽이 몬스터라면 그쪽 HP 도 이 자리에서 반영한다.
      // 가시 갑옷의 반사는 "맞은 그 순간" 들어가는데, 예전에는 이 줄이 없어서
      // 내가 다시 때릴 때까지 몬스터 체력이 그대로 보였다(늦게 들어가는 것처럼 보였다).
      if (turn.actor === 'monster' && turn.actorHpAfter != null && turn.actorIndex != null) {
        this.monsterHp[turn.actorIndex] = turn.actorHpAfter;
        this._renderMonsterHead();
      }
      if (this._showDamage()) {
        this._popDamage(turn.target, turn.damage, turn.crit, turn.tag, hitWeight(turn));
      }
      if (turn.healed && this._showDamage()) this._popHeal(turn.actor, turn.healed);
      // 반사 피해는 언제나 치명타가 아니다 — 숫자도 치명타 모양으로 띄우지 않는다.
      if (turn.thornsBack && this._showDamage()) {
        this._popDamage(turn.actor, turn.thornsBack, false);
      }
      // 마법사의 마력 흡수 — 맞은 만큼 그대로 되돌아온다. 숫자로 보여야 안다.
      if (turn.absorbed && this._showDamage()) this._popHeal(turn.target, turn.absorbed);

      const tags = [];
      if (turn.crit) tags.push('치명타!');
      if (turn.tag && TAG_LABEL[turn.tag]) tags.push(TAG_LABEL[turn.tag]);
      else if (turn.extra) tags.push('연격!');
      // 예측 공격(0.42) — 선제 사격의 위력이 1 보다 크면 그만큼을 적는다.
      // 스킬에 세 점을 부었는데 화면이 아무 말도 안 하면 부은 값이 안 보인다.
      if (turn.tag === 'opener' && turn.power > 1) {
        tags.push(`예측 +${Math.round((turn.power - 1) * 100)}%`);
      }
      if (turn.thornsBack) tags.push(`가시 갑옷 ${turn.thornsBack}`);
      if (turn.healed) tags.push(`흡혈 +${turn.healed}`);
      if (turn.absorbed) tags.push(`마력 흡수 +${turn.absorbed}`);
      // 분노 — 몇 번째 휘두름인지가 곧 몇 배인지다. 갑자기 아파진 이유가 보여야 한다.
      if (turn.rageStacks > 1) tags.push(`분노 ${turn.rageStacks}중첩`);
      if (turn.survived) tags.push('버텨냈다!');
      if (turn.shielded) tags.push('보호막 발동!');

      // ── 한 줄은 짧게 (0.53) ────────────────────────────────
      //
      // 예전 줄: `슬라임의 공격! 아무개에게 23 데미지 (치명타! · 흡혈 +4 · 분노 2중첩)`
      // 이름 둘에 꼬리표 넷이라 세로 화면에서는 두세 줄로 접히고, 다음 줄이
      // 곧바로 올라와서 **읽기도 전에 지나갔다.**
      //
      // 누가 누구를 때렸는지는 화면에 이미 보인다(그림이 움직이고 숫자가 뜬다).
      // 그래서 글에는 **얼마나**와 **무엇으로**만 남긴다.
      //   내가 때림  `23 데미지를 주었다 (치명타!)`
      //   내가 맞음  `23 데미지를 입었다`
      // 꼬리표는 앞의 둘까지만 — 셋을 넘기면 다시 두 줄이 된다.
      const arrow = turn.extra || turn.tag ? '↳ ' : '';
      const mine = turn.actor === 'player';
      this._log(
        `${arrow}${turn.damage} 데미지를 ${mine ? '주었다' : '입었다'}`
          + (tags.length ? ` (${tags.slice(0, 2).join(' · ')})` : ''),
        turn.crit || turn.tag === 'charge' ? 'good' : ''
      );
    } else if (turn.type === 'miss') {
      const line = MISS_LINE[turn.tag];
      this._log(line ? line(turn) : (turn.actor === 'player' ? '빗나갔다' : '피했다'), 'good');
    } else if (turn.type === 'heal') {
      this._setBar('player', turn.actorHpAfter);
      if (this._showDamage()) this._popHeal(turn.actor, turn.amount);
      this._log(
        `HP +${turn.amount} 회복`
          + (turn.itemName ? ` (${turn.itemName}${turn.doubled ? ' 2배' : ''})` : ''),
        'good'
      );
    } else if (turn.type === 'defeat') {
      if (turn.actor === 'monster' && turn.actorIndex != null) {
        this.monsterHp[turn.actorIndex] = 0;
        const next = this.monsterHp.findIndex((hp) => hp > 0);
        if (next >= 0) this.focus = next;
        this._renderMonsterHead();
      }
      this._log(`${turn.actorName} 쓰러졌다!`, turn.actor === 'monster' ? 'good' : 'bad');
    } else if (turn.type === 'draw') {
      this._log('승부가 나지 않았다...', 'bad');
    }
  }

  _setBar(side, hp) {
    const max = this.max[side] || 1;
    const ratio = Math.max(0, Math.min(1, hp / max));
    if (side === 'monster') {
      this.el.monFill.style.width = `${ratio * 100}%`;
      this.el.monText.textContent = `${hp} / ${max}`;
    } else {
      this.el.plyFill.style.width = `${ratio * 100}%`;
      this.el.plyText.textContent = `${hp} / ${max}`;
    }
  }

  _popDamage(side, amount, crit, tag = null, weight = 0) {
    const el = document.createElement('span');
    // 선제 사격은 붙기도 전에 들어가는 한 대라, 다른 공격과 같은 모양이면
    // "언제 두 발이 나갔는지" 를 알 수가 없다. 초록 화살 색으로 따로 띄운다.
    const opener = tag === 'opener' ? ' dmg--opener' : '';
    // 세게 맞았으면 글씨가 커진다 — 숫자를 읽지 않아도 눈으로 알 수 있게.
    const heavy = weight >= 2 ? ' dmg--huge' : weight === 1 ? ' dmg--big' : '';
    el.className = `dmg ${crit ? 'dmg--crit' : ''}${opener}${heavy} dmg--${side}`;
    el.textContent = (tag === 'opener' ? '🎯 ' : '') + (crit ? `${amount}!` : String(amount));
    // 매번 살짝 다른 위치에서 튀어오르게 한다.
    el.style.setProperty('--jitter', `${(Math.random() * 2 - 1) * 26}px`);
    this.el.damage.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  _popHeal(side, amount) {
    const el = document.createElement('span');
    el.className = `dmg dmg--heal dmg--${side}`;
    el.textContent = `+${amount}`;
    el.style.setProperty('--jitter', `${(Math.random() * 2 - 1) * 22}px`);
    this.el.damage.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  _log(text, tone = '') {
    const line = document.createElement('div');
    line.className = `log-line ${tone ? `log-line--${tone}` : ''}`;
    line.textContent = text;
    this.el.log.appendChild(line);
    this.el.log.scrollTop = this.el.log.scrollHeight;
    while (this.el.log.children.length > 40) this.el.log.firstChild.remove();
  }

  /**
   * @param {{win:boolean, draw?:boolean, exp:number, gold:number,
   *          items:Array<{name:string,count:number,icon?:string}>,
   *          levelUp?:{from:number,to:number}, note?:string}} s
   */
  showResult(s) {
    // 보스를 눕혔으면 **결과창보다 먼저** 쓰러지는 연출을 보여 준다 (0.48).
    // 결과창을 먼저 띄우면 그 위에 배너가 겹쳐 둘 다 안 읽힌다.
    //
    // ⚠ 표시는 **이번 전투에 한 번**이어야 한다. 처음에 "연출 중인가" 로 막았더니,
    //   연출이 끝나며 이 함수를 다시 부를 때 그 표시가 이미 꺼져 있어서
    //   쓰러짐 연출이 끝없이 다시 떴다(결과창이 영영 안 나왔다).
    //   그래서 `_cutDone` 은 **다음 전투가 시작될 때만** 꺼진다.
    const fallen = this.monsters && this.monsters.find((m) => m.boss);
    if (s.win && fallen && !this.getSettings().battleSkip && !this._cutDone) {
      this._cutDone = true;
      this._bossCut(fallen, 'out');
      setTimeout(() => this.showResult(s), this.introTimer ? 1600 : 0);
      return;
    }
    this.el.skip.hidden = true;
    const title = s.draw ? '무승부' : s.win ? '승리!' : '패배...';
    const itemsHtml = s.items.length
      ? s.items.map((i) => `<li>${i.name} <b>×${i.count}</b></li>`).join('')
      : '<li class="muted">획득한 아이템 없음</li>';

    // 각인이 붙어 나온 물건 — 특히 **초월**은 여기서 놓치면 가방을 열기 전까지 모른다.
    // 전리품 줄에 섞어 적으면 "화염검 ×1" 과 구별이 안 되므로 아래에 따로 세운다.
    const engravedHtml = (s.engraved || []).length
      ? `<ul class="result-engraved">${s.engraved
          .map((e) => `<li class="${e.perfect ? 'is-perfect' : ''}">${
            e.perfect ? '✦✦ 초월 각인' : '✦ 각인'
          } — ${e.name} · ${e.text}${e.perfect ? ' <b>(최대치)</b>' : ''}</li>`)
          .join('')}</ul>`
      : '';

    this.el.result.innerHTML = `
      <div class="result-card ${s.win ? 'is-win' : s.draw ? 'is-draw' : 'is-lose'}">
        <h2>${title}</h2>
        ${
          s.win
            ? `<div class="result-rewards">
                 <div class="reward"><span>획득 경험치</span><b>+${s.exp}</b></div>
                 <div class="reward"><span>획득 골드</span><b>+${s.gold}</b></div>
               </div>
               <ul class="result-items">${itemsHtml}</ul>
               ${engravedHtml}`
            : `<p class="result-note">${s.note || ''}</p>`
        }
        ${s.levelUp ? `<div class="levelup">LEVEL UP!  ${s.levelUp.from} → ${s.levelUp.to}</div>` : ''}
        ${
          s.potions && s.potions.length
            ? `<p class="result-note result-potion">사용한 회복약 — ${s.potions
                .map((p) => `${p.name} ×${p.count}`)
                .join(', ')}</p>`
            : ''
        }
        <button class="confirm-btn" data-confirm>확인 (Enter)</button>
      </div>
    `;
    this.el.result.hidden = false;
    const btn = this.el.result.querySelector('[data-confirm]');
    btn.addEventListener('click', () => this.bus.emit('battle:confirm'));
    btn.focus();
  }

  hide() {
    this._endIntro();
    this.root.hidden = true;
    this.root.classList.remove('is-active');
    this.el.result.hidden = true;
  }
}


// 표에서 온 글이라 위험할 일은 거의 없지만, HTML 로 넣는 것은 **언제나** 걸러 둔다.
// "이 값은 안전하다" 는 오늘의 사실이고, 내일 그 값이 어디서 오는지는 아무도 모른다.
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const escapeAttr = escapeHtml;
