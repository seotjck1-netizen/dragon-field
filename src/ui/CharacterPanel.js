// 책임: 캐릭터 창 — 장비 9칸, 디아블로2식 수치 분해, 특성/스킬 트리 표시와 조작 버튼.
// 금지: 포인트 사용 규칙 판단 → systems/SkillSystem.js 가 준 값을 표시하고, 조작은 이벤트로 알린다.
// 금지: 게임 상태 수정.

import { computePlayerStats, computeLook } from '../entities/StatBlock.js';
import { splitBody } from './bodyPick.js';
import {
  classSkills, canLearn, canSpendTrait, classDef, effectiveTraits, branchSpent, classPoints, commonPoints, buildShape,
  branchPowers, masteryMult,
} from '../systems/SkillSystem.js';
import { SLOT_GROUPS, SLOT_LABEL } from '../systems/EquipmentSystem.js';
import { isEngraved, isPerfect, describe } from '../systems/AffixSystem.js';
import { growthShares } from '../systems/ProgressionSystem.js';
import { resetCost, combatPower, BALANCE } from '../data/formulas.js';
import { captureScroll, restoreScroll, setHtml } from './keepScroll.js';
import { STAT_LABEL, STAT_ICON, fmtStat, isRatio, modLabel } from './statLabels.js';
import { subscribeRender, sheetSig } from './rerender.js';

const STAT_ORDER = ['atk', 'def', 'spd', 'crit', 'hp'];
const nameOf = (inst, def) => ((inst.enhance || 0) > 0 ? `${def.name} +${inst.enhance}` : def.name);

// 비율로 보여 줄 키들. 여기 없는 키는 숫자 그대로 찍는다.
const EFFECT_SUFFIX = {
  atkPct: '%', defPct: '%', hpPct: '%', hpMult: '%',
  crit: '%', critMult: '%', doubleHit: '%',
  lifesteal: '%', pierce: '%', dmgReduction: '%',
  magicPower: '%', magicResist: '%',
  thorns: '%', defToAtk: '%', lowHpCritMult: '%', evadeBonus: '%', evadeRevenge: '%', cleaveBonus: '%',
  atkMult: '%', defMult: '%', potionMult: '%', goldFind: '%',
  materialDouble: '%', engraveBonus: '%', absorbChance: '%', moveSpeed: '%',
};

export class CharacterPanel {
  constructor({ bus, store, root, bodyLook = null }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
    // 0.70.26 — 장비 탭 맨 위 '내 모습'(새 몸 그림). 0.80.01 — 성별 · 차림 바꾸기는 뺐다(만들 때 · 직업 고를 때만)
    this.bodyLook = bodyLook;
    this.open = false;
    this.tab = 'gear';
    // 디아블로2처럼 ">" 로 펼쳐 둔 수치들
    this.expanded = new Set();

    this.root.hidden = true;
    this._sub = subscribeRender(store, {
      isOpen: () => this.open,
      sig: () => sheetSig(this.store.state),
      render: () => this.render(),
    });
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  show(tab) {
    this.open = true;
    if (tab) this.tab = tab;
    this._sub.reset();
    this.root.hidden = false;
    this.render();
    this.bus.emit('character:opened');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('character:closed');
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
    const p = state.player;
    const stats = computePlayerStats(state);
    const cls = classDef(state);

    setHtml(this.root, `
      <div class="char-panel">
        <header class="inv-header">
          <h2>${p.name} <span class="char-class">${cls.name}</span></h2>
          <span class="char-points">
            직업 <b class="${classPoints(state) ? 'is-on' : ''}">${classPoints(state)}</b>
            · 공용 <b class="${commonPoints(state) ? 'is-on' : ''}">${commonPoints(state)}</b>
          </span>
          <button class="inv-close" data-close>✕</button>
        </header>
        ${this._passiveBarHtml(cls)}

        <section class="inv-summary">
          <span>Lv.${p.level}</span><span>❤ ${stats.hp}</span><span>⚔ ${stats.atk}</span>
          <span>🛡 ${stats.def}</span><span>👟 ${stats.spd}</span>
          <span>✦ ${(stats.crit * 100).toFixed(1)}%</span>
          <span class="sum-power" title="전투력">⚡ ${combatPower(stats, stats.mods).toLocaleString('ko-KR')}</span>
        </section>

        <nav class="shop-tabs">
          <button data-tab="gear" class="${this.tab === 'gear' ? 'is-on' : ''}">장비</button>
          <button data-tab="stat" class="${this.tab === 'stat' ? 'is-on' : ''}">스탯</button>
          <button data-tab="tree" class="${this.tab === 'tree' ? 'is-on' : ''}">스킬 트리</button>
        </nav>

        <div class="char-body" data-body data-keep-scroll="body"></div>
      </div>`);

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.render();
      });
    }

    const body = this.root.querySelector('[data-body]');
    if (this.tab === 'gear') this._renderGear(body, state, stats);
    else if (this.tab === 'stat') this._renderStats(body, state);
    else this._renderTree(body, state); // 0.80.02 — 예전 '특성' · '스킬' 탭이 하나가 됐다(옛 이름으로 열어도 여기로)
  }

  /** 장비 탭 — 9칸 배치 + 디아블로2식 수치 분해. */
  _renderGear(body, state, stats) {
    const wrap = document.createElement('div');
    wrap.className = 'gear-tab';

    const p = state.player;
    const showBody = this.bodyLook && !p.rawSprite && this.bodyLook.has(p.body);
    // 0.80.01 — 성별 · 차림은 **캐릭터를 만들 때(그리고 직업을 고를 때)만** 고른다.
    //   소지품 · 장비 창에서 아무 때나 바꾸던 단추는 뺐다. 여기서는 지금 모습을 보여 주기만 한다.
    const sel = showBody ? splitBody(this.bodyLook, p.body) : null;
    const lookName = sel ? `${sel.gender === 'f' ? '여' : '남'} · ${sel.style === 'rugged' ? '거친 차림' : '깨끗한 차림'}` : '';
    setHtml(wrap, `
      ${showBody ? `<div class="my-look">
        <canvas class="my-look-art" width="180" height="222" data-my-look></canvas>
        <div class="my-look-side">
          <h3 class="slot-group-title">내 모습</h3>
          <p class="my-look-name">${lookName}</p>
          <p class="my-look-note">입은 장비는 희귀도마다 모양이 달라집니다.</p>
        </div>
      </div>` : ''}
      <div class="gear-slots">
        ${Object.entries(SLOT_GROUPS)
          .map(
            ([group, slots]) => `
          <div class="slot-group">
            <h3 class="slot-group-title">${group}</h3>
            <div class="slot-group-slots">
              ${slots.map((s) => this._slotHtml(state, s)).join('')}
            </div>
          </div>`
          )
          .join('')}
      </div>
      <div class="gear-stats">
        <h3 class="slot-group-title">수치 (&gt; 를 눌러 출처 보기)</h3>
        ${this._statRowsHtml(state, stats)}
      </div>
      ${this._combatTraitsHtml(state)}`);

    for (const btn of wrap.querySelectorAll('[data-unequip]')) {
      btn.addEventListener('click', () =>
        this.bus.emit('ui:unequip', { slot: btn.dataset.unequip })
      );
    }
    for (const btn of wrap.querySelectorAll('[data-stat]')) {
      btn.addEventListener('click', () => {
        const k = btn.dataset.stat;
        this.expanded.has(k) ? this.expanded.delete(k) : this.expanded.add(k);
        this.render();
      });
    }
    if (showBody) {
      const cv = wrap.querySelector('[data-my-look]');
      const look = computeLook(state);
      const draw = () => {
        const a = this.bodyLook.get(p.body, 'bstand', look);
        if (!a || !cv) return;
        const ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, cv.width, cv.height);
        const k = a.srcW / 320;
        ctx.drawImage(a.image, 40 * k, 24 * k, 240 * k, 296 * k, 0, 0, cv.width, cv.height);
      };
      draw();
      this.bodyLook.prefetch(p.body, look).then(draw);
    }
    body.appendChild(wrap);
  }

  /**
   * 직업 이름 바로 아래 붙는 패시브 한 줄.
   * 어느 탭에 있든 늘 보인다 — 자기 직업이 무엇을 공짜로 갖고 있는지는
   * 장비 탭까지 내려가 봐야 알 수 있으면 안 된다.
   */
  _passiveBarHtml(cls) {
    const pas = cls.passive;
    if (!pas) return '';
    return `
      <div class="char-passive" title="${escapeAttr(pas.detail || pas.desc)}">
        <span class="char-passive-tag">패시브</span>
        <b>${pas.name}</b>
        <span class="char-passive-desc">${pas.detail || pas.desc}</span>
      </div>`;
  }

  /** 이 직업만의 전투 방식(classes.json 의 combatDesc). */
  _combatTraitsHtml(state) {
    const cls = classDef(state);
    const lines = (cls.combatDesc || []).slice();
    // 마법으로 때리는 직업은 갑옷을 타고나기를 무시한다(BALANCE.MAGIC_PIERCE).
    // 표에 적지 않고 **여기서 만들어 붙인다** — 표에 숫자를 적어 두면 공식을
    // 고칠 때마다 설명만 옛날 값으로 남는다(0.70.x 내내 그 일이 반복됐다).
    if ((cls.combat || {}).school === 'magic') {
      lines.unshift(`마법 피해는 상대 방어력을 ${Math.round(BALANCE.MAGIC_PIERCE * 100)}% 무시한다`
        + ' — 갑옷이 두꺼운 상대일수록 유리하다');
    }
    const pas = cls.passive;
    if (!lines.length && !pas) return '';
    return `
      <div class="combat-traits">
        <h3 class="slot-group-title">${cls.name}의 전투 방식</h3>
        ${pas ? `<p class="passive-line"><b>패시브 · ${pas.name}</b> ${pas.detail || pas.desc}</p>` : ''}
        <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
      </div>`;
  }

  _slotHtml(state, slot) {
    const uid = state.player.equipment[slot];
    const inst = uid ? state.inventory.find((i) => i.uid === uid) : null;
    const def = inst ? state.db.items[inst.id] : null;
    return `
      <div class="slot ${def ? 'is-filled' : ''}">
        <span class="slot-label">${SLOT_LABEL[slot]}${this._engraveMark(state, inst, def)}</span>
        <span class="slot-name ${def ? `rarity-${def.rarity || 'common'}` : 'muted'}">${
          def ? nameOf(inst, def) : '비어 있음'
        }</span>
        ${def ? `<button class="mini-btn" data-unequip="${slot}">해제</button>` : ''}
      </div>`;
  }

  /**
   * 칸 이름 옆에 붙는 붉은 별 — **이 자리에 각인이 있다** (0.60).
   *
   * 왜 필요한가: 각인은 소지품의 툴팁에만 있었다. 장비 탭에서는 이름만 보이므로,
   * 열 자리 가운데 어디에 각인이 붙었는지 알려면 하나씩 벗겨 봐야 했다 —
   * 정작 각인은 **바꿀지 말지를 정할 때** 봐야 하는 값인데.
   *
   * 별 하나는 각인, **둘은 초월 각인**이다(AffixSystem 이 툴팁에 쓰는 ✦/✦✦ 와 같은 규칙).
   * 무엇이 붙었는지는 title 로 얹어 둔다 — 자리는 좁고, 자세한 것은 소지품에 있다.
   */
  _engraveMark(state, inst, def) {
    if (!inst || !def || !isEngraved(inst)) return '';
    const perfect = isPerfect(inst);
    let tip = perfect ? '초월 각인' : '각인';
    try {
      const d = describe(state.db, def, inst.bonus);
      if (d && d.text) tip = `${tip} · ${d.text}`;
    } catch { /* 설명을 못 만들어도 별은 붙는다 */ }
    return `<span class="slot-engrave ${perfect ? 'is-perfect' : ''}" title="${escapeAttr(tip)}"
      aria-label="${escapeAttr(tip)}">${perfect ? '★★' : '★'}</span>`;
  }

  /**
   * 수치 한 줄 + 펼쳤을 때의 출처 목록.
   * 계산은 computePlayerStats 가 이미 끝냈고 여기서는 나누어 보여 주기만 한다.
   */
  _statRowsHtml(state, stats) {
    const pctOf = { hp: stats.mods.hpPct, atk: stats.mods.atkPct, def: stats.mods.defPct };

    return STAT_ORDER.map((k) => {
      const open = this.expanded.has(k);
      const lines = [];

      if (stats.base[k]) lines.push([`기본 (Lv.${state.player.level})`, fmtStat(k, stats.base[k])]);
      if (stats.fromTraits[k]) lines.push(['특성', fmtStat(k, stats.fromTraits[k])]);

      for (const e of stats.equipped) {
        if (!e.stats[k]) continue;
        lines.push([`${SLOT_LABEL[e.slot]} · ${nameOf(e.inst, e.def)}`, fmtStat(k, e.stats[k])]);
      }

      if (k === 'crit' && stats.mods.crit) {
        lines.push(['스킬 · 강화 · 버프', fmtStat(k, stats.mods.crit)]);
      }
      if (pctOf[k]) lines.push(['비율 보너스', `${Math.round(pctOf[k] * 100)}%`]);

      const items = lines.length
        ? lines.map(([label, v]) => `<li><span>${label}</span><b>+${v}</b></li>`).join('')
        : '<li class="muted"><span>더할 것이 없습니다.</span></li>';

      return `
        <div class="stat-row ${open ? 'is-open' : ''}">
          <button class="stat-toggle" data-stat="${k}" aria-expanded="${open}">${
            open ? '∨' : '>'
          }</button>
          <span class="stat-key">${STAT_ICON[k]} ${STAT_LABEL[k]}</span>
          <b class="stat-val">${fmtStat(k, stats[k])}</b>
          ${open ? `<ul class="stat-breakdown">${items}</ul>` : ''}
        </div>`;
    }).join('');
  }

  /** 초기화 버튼 한 줄 — 스킬 트리(스킬 + 공용 특성)를 한꺼번에. 처음 한 번은 공짜. */
  _resetBarHtml(state) {
    const p = state.player;
    const sum = (r) => Object.values(r || {}).reduce((a, b) => a + (b || 0), 0);
    const spent = sum(p.traits) + sum(p.skills);
    if (!spent) return `<p class="char-note muted">아직 찍은 칸이 없습니다.</p>`;
    const free = (p.freeResets || 0) > 0;
    const cost = free ? 0 : resetCost(spent, p.level);
    const can = p.gold >= cost;
    return `<div class="reset-bar">
      <span>찍은 ${spent}포인트를 모두 되돌립니다${free ? ' — <b class="tree-free">처음 한 번은 공짜</b>' : ''}</span>
      <button class="mini-btn ${can ? '' : 'is-lack'}" data-reset="tree" ${can ? '' : 'disabled'}>
        초기화 ${free ? '공짜' : `🪙 ${cost}`}
      </button>
    </div>`;
  }

  _wireReset(body) {
    const btn = body.querySelector('[data-reset]');
    if (btn) {
      btn.addEventListener('click', () => this.bus.emit('ui:reset', { kind: btn.dataset.reset }));
    }
  }

  /**
   * 스탯 탭 — 힘·민첩·지능. 찍는 것이 아니라 레벨이 올려 주는 값이다.
   * 그래서 + 버튼도, 최대치(0/80)도 없다. 지금 얼마인지와 무엇을 주는지만 보인다.
   */
  _renderStats(body, state) {
    const nodes = (state.db.stats && state.db.stats.nodes) || {};
    const p = state.player;
    const cls = classDef(state);
    const growth = cls.statGrowth || {};
    const shares = growthShares(growth); // 레벨 하나에 이 스탯이 가져가는 몫
    const eff = effectiveTraits(state); // 장비가 얹어 준 몫까지 포함한 실제 값

    const list = document.createElement('ul');
    list.className = 'char-list';

    for (const [id, def] of Object.entries(nodes)) {
      if (id.startsWith('_')) continue;
      const own = p.stats?.[id] || 0;
      const total = eff[id] || 0;
      const fromGear = total - own;
      // 0.42 — 표의 숫자는 '몇 레벨마다' 가 아니라 **차례**(1등·2등·3등)다.
      // 화면에는 사람이 바로 쓰는 말로 옮긴다 — 열 레벨에 몇 점 오르는지.
      const share = shares[id] || 0;
      const rank = Number(growth[id]) || 0;
      const rate = share
        ? `10레벨마다 약 +${(share * 10).toFixed(1)}${rank === 1 ? ' · 이 직업이 가장 잘 키우는 값' : ''}`
        : '오르지 않음';

      const li = document.createElement('li');
      li.className = 'char-node is-learned';
      setHtml(li, `
        <span class="char-icon">${def.icon || '·'}</span>
        <div class="char-text">
          <span class="char-name">${def.name} <b>${total}</b></span>
          <span class="char-desc">${def.desc}</span>
          ${def.long ? `<span class="char-long">${def.long}</span>` : ''}
          <span class="char-total">${rate}${
            fromGear ? ` · 장비에서 +${fromGear}` : ''
          } · 지금까지 ${statTotalText(def, total)}</span>
        </div>`);
      list.appendChild(li);
    }
    body.appendChild(list);

    const note = document.createElement('p');
    note.className = 'muted char-note';
    setHtml(note, `<b>${cls.name}</b>는 레벨이 오를 때마다 이 셋이 자동으로 자랍니다. ` +
      `한 번 오를 때 <b>20% 확률로 두 점</b>이 오릅니다 — 찍을 것은 없습니다.`);
    body.appendChild(note);
  }

  /**
   * 스킬 트리 탭 (0.80.03 — 와우식) — 뿌리 하나 + 갈래 셋(1단 둘 · 2단 · 3단 · 궁극 · 숙련) + 공용 특성(따로 주머니).
   * 직업 포인트 25점으로 한 갈래 올인(숙련까지) 또는 1.5갈래(궁극 + 옆 갈래 절반)를 고른다.
   * 문턱 · 궁극 레벨은 SkillSystem(canLearn)이 정하고, 여기서는 보이기만 한다.
   */
  _renderTree(body, state) {
    const cfg = state.db.skills;
    const p = state.player;
    const tree = cfg.tree;
    const gates = cfg.gates || {};
    const capLevel = Number(cfg.capLevel) || 0;
    const learnable = new Set(classSkills(state).map((s) => s.id));
    const list = state.db.classes.list || {};
    // 운영자(allSkills)는 세 직업 트리를 다 본다 — 제 직업이 맨 앞
    const mine = p.classId in (cfg.classTrees || {}) ? p.classId : state.db.classes.default;
    const order = [mine, ...Object.keys(cfg.classTrees || {}).filter((c) => c !== mine)]
      .filter((c) => (list[c] && list[c].skills || []).some((id) => learnable.has(id)));

    const wrap = document.createElement('div');
    wrap.className = 'skill-tree';
    const pool = classPoints(state);
    const common = commonPoints(state);
    const nextSkill = (Math.floor(p.level / cfg.everyLevels) + 1) * cfg.everyLevels;
    const full = Math.floor(BALANCE.MAX_LEVEL / cfg.everyLevels) * cfg.pointsPerGrant;
    const capNeed = (Number(gates[4]) || 12) + 1;
    const head = document.createElement('p');
    head.className = 'char-note';
    setHtml(head, `직업 포인트 <b class="${pool ? 'tree-pool is-on' : 'tree-pool'}">${pool}</b> · ` +
      `${cfg.everyLevels}레벨마다 1 (${nextSkill <= BALANCE.MAX_LEVEL ? `다음 Lv.${nextSkill}, ` : ''}만렙에 ${full}점)<br>` +
      `<i class="char-free">${full}점으로 고르는 것은 둘입니다 — <b>한 갈래 올인</b>(뿌리 5 + 갈래 20, 숙련까지) 또는 ` +
      `<b>1.5갈래</b>(뿌리 5 + 궁극까지 ${capNeed} + 옆 갈래 ${full - 5 - capNeed}). ` +
      `2단 ${gates[2] || 3}점 · 3단 ${gates[3] || 6}점 · 궁극 ${gates[4] || 12}점 + Lv.${capLevel} · 숙련 ${gates[5] || 16}점.</i>`);
    wrap.appendChild(head);

    const powers = branchPowers(state);
    const nodeHtml = (id, def, check, rank, extraClass = '') => {
      const maxed = rank >= def.max;
      const locked = !check.ok && check.gate;
      const lockText = locked
        ? (check.gate.have < check.gate.need ? `🔒 이 갈래 ${check.gate.need}점` : `🔒 Lv.${check.gate.capLevel}`)
        : '';
      const cls = ['tree-node', extraClass, rank ? 'is-learned' : '', maxed ? 'is-maxed' : '', locked ? 'is-locked' : '',
        def.cap ? 'is-cap' : '', def.mastery ? 'is-mastery' : ''].filter(Boolean).join(' ');
      // 숙련(올인)이 이 갈래를 키우고 있으면 키운 값으로 보여 준다 — 실제로 전투에 들어가는 값이다
      const amp = rank && !def.mastery ? masteryMult(state, id, powers) : 1;
      const total = rank ? `<span class="char-total">지금까지 ${effectText(def.effect, rank * amp, def.steps)}${
        amp > 1 ? ` <em class="tree-amp">숙련 ×${+amp.toFixed(2)}</em>` : ''}</span>` : '';
      return `<div class="${cls}" title="${escapeAttr(def.long || def.desc || '')}">
        <div class="tree-node-h"><span class="char-icon">${def.icon || '·'}</span>
          <span class="char-name">${def.name} <b>${rank}</b><i>/${def.max}</i></span></div>
        <span class="char-desc">${def.desc || ''}</span>${total}
        ${lockText ? `<span class="tree-lock">${lockText}</span>` : ''}
        <button class="char-plus" data-node="${id}" ${check.ok ? '' : 'disabled'} title="${escapeAttr(check.reason || '1 투자')}">${maxed ? '★' : '+'}</button>
      </div>`;
    };

    for (const cid of order) {
      const ct = cfg.classTrees[cid];
      const ids = (list[cid].skills || []).filter((id) => learnable.has(id) && tree[id]);
      const sec = document.createElement('section');
      sec.className = 'tree-class';
      const rootId = ct.root;
      const rootDef = tree[rootId];
      let html = order.length > 1 ? `<h3 class="tree-class-h">${list[cid].name} <small>${ct.motto || ''}</small></h3>` : '';
      // 지금 빌드 — 갈래마다 몇 점, 올인인지 1.5갈래인지, 트리가 지금까지 준 것의 합
      const shape = buildShape(state, cid);
      const sum = treeTotals(tree, ids, p.skills, (id) => masteryMult(state, id, powers));
      const bars = shape.branches.map((b) => `<span class="tb-seg br-${b.id} ${b.mastery ? 'is-mastery' : b.cap ? 'is-cap' : ''}" style="flex:${Math.max(0.0001, b.points)}" title="${b.name} ${b.points}점">${b.points ? `${b.name} ${b.points}` : ''}</span>`).join('');
      html += `<div class="tree-build kind-${shape.kind}"><div class="tb-line"><b>${shape.label}</b><em>뿌리 ${shape.root} · ${shape.branches.map((b) => `${b.name} ${b.points}`).join(' · ')}</em></div>` +
        `<div class="tb-bar">${bars}</div>` +
        (sum ? `<div class="tb-sum" title="뿌리와 갈래 칸이 지금까지 준 것을 모두 더한 값">${sum}</div>` : '') + '</div>';
      if (rootDef) {
        html += `<div class="tree-root"><span class="tree-tier">뿌리 — 누구나 먼저</span>${nodeHtml(rootId, rootDef, canLearn(state, rootId), p.skills[rootId] || 0, 'tree-root-node')}</div>`;
      }
      html += '<div class="tree-branches">';
      for (const b of ct.branches || []) {
        const spent = branchSpent(state, cid, b.id);
        html += `<div class="tree-branch br-${b.id}"><header class="tree-bh"><b>${b.id} · ${b.name}</b><em>${spent}점</em><span>${b.theme || ''}</span></header>`;
        for (const tier of [1, 2, 3, 4, 5]) {
          const here = ids.filter((id) => tree[id].branch === b.id && Number(tree[id].tier) === tier);
          if (!here.length) continue;
          const need = tier === 1 ? 0 : Number(gates[tier]) || 0;
          const open = spent >= need && (tier !== 4 || p.level >= capLevel);
          const label = tier === 1 ? '1단' : tier === 4 ? `궁극 · ${need}점 · Lv.${capLevel}`
            : tier === 5 ? `숙련(올인) · ${need}점` : `${tier}단 · ${need}점`;
          html += `<span class="tree-tier ${open ? 'is-open' : ''}">${label}</span>`;
          for (const id of here) html += nodeHtml(id, tree[id], canLearn(state, id), p.skills[id] || 0);
        }
        html += '</div>';
      }
      html += '</div>';
      setHtml(sec, html);
      wrap.appendChild(sec);
    }

    // 공용 특성 — 일곱(문턱 없음). 주머니가 따로다(10레벨마다 1 · 단계 보스 의뢰마다 1)
    const commonSec = document.createElement('section');
    commonSec.className = 'tree-common';
    let ch = `<header class="tree-bh"><b>공용</b><em class="${common ? 'tree-pool is-on' : 'tree-pool'}">공용 포인트 ${common}</em>` +
      '<span>모든 직업 · 문턱 없음 · 10레벨마다 1 · 단계 보스 의뢰마다 1</span></header><div class="tree-common-grid">';
    for (const [id, def] of Object.entries(state.db.traits.nodes || {})) {
      if (id.startsWith('_') || typeof def !== 'object') continue;
      const rank = p.traits[id] || 0;
      const check = canSpendTrait(state, id);
      const maxed = rank >= def.max;
      const total = rank ? `<span class="char-total">지금까지 ${traitTotalText(def, rank)}</span>` : '';
      ch += `<div class="tree-node ${rank ? 'is-learned' : ''} ${maxed ? 'is-maxed' : ''}" title="${escapeAttr(def.long || def.desc || '')}">
        <div class="tree-node-h"><span class="char-icon">${def.icon || '·'}</span>
          <span class="char-name">${def.name} <b>${rank}</b><i>/${def.max}</i></span></div>
        <span class="char-desc">${def.desc || ''}</span>${total}
        <button class="char-plus" data-trait="${id}" ${check.ok ? '' : 'disabled'} title="${escapeAttr(check.reason || '1 투자')}">${maxed ? '★' : '+'}</button>
      </div>`;
    }
    ch += '</div>';
    setHtml(commonSec, ch);
    wrap.appendChild(commonSec);

    const bar = document.createElement('div');
    setHtml(bar, this._resetBarHtml(state));
    wrap.appendChild(bar);
    body.appendChild(wrap);

    for (const btn of wrap.querySelectorAll('[data-node]')) {
      btn.addEventListener('click', () => this.bus.emit('ui:skill', { id: btn.dataset.node }));
    }
    for (const btn of wrap.querySelectorAll('[data-trait]')) {
      btn.addEventListener('click', () => this.bus.emit('ui:trait', { id: btn.dataset.trait }));
    }
    this._wireReset(body);
  }
}

/** 뿌리 · 갈래 칸이 지금까지 준 것을 모두 더한 한 줄(빌드 요약). 찍은 것이 없으면 빈 글. */
function treeTotals(tree, ids, ranks, ampOf = () => 1) {
  const total = {};
  for (const id of ids) {
    const d = tree[id];
    const r = (ranks && ranks[id]) || 0;
    if (!d || !r) continue;
    // 숙련이 키운 값으로 더한다(숙련 칸 자신의 '갈래 효과 증폭'은 이미 다른 칸에 들어갔으므로 따로 적지 않는다)
    const amp = d.mastery ? 1 : ampOf(id);
    for (const [k, v] of Object.entries(d.effect || {})) {
      if (k === 'lowHpThreshold' || k === 'branchPower') continue;
      total[k] = (total[k] || 0) + v * r * amp;
    }
    for (const [k, arr] of Object.entries(d.steps || {})) {
      if (Array.isArray(arr) && arr.length) total[k] = (total[k] || 0) + (Number(arr[Math.min(Math.max(1, Math.round(r * amp)), arr.length) - 1]) || 0);
    }
  }
  return Object.keys(total).length ? effectText(total, 1) : '';
}

/** 특성 한 항목이 지금까지 준 것 — 순수 스탯(per)과 비율(mods)을 함께 적는다. */
function traitTotalText(def, rank) {
  const parts = [];
  for (const [k, v] of Object.entries(def.per || {})) {
    const total = v * rank;
    parts.push(`${labelOf(k)} +${isRatio(k) ? `${(total * 100).toFixed(2)}%` : round2(total)}`);
  }
  for (const [k, v] of Object.entries(def.mods || {})) {
    parts.push(`${labelOf(k)} +${(v * rank * 100).toFixed(1)}%`);
  }
  return parts.join(' · ');
}

/** 스탯 한 항목이 지금까지 준 것. 규칙은 특성과 같지만 이름을 나눠 둔다. */
const statTotalText = traitTotalText;

const round2 = (n) => String(Math.round(n * 100) / 100);

/**
 * '지금까지 얼마나 올랐나' 한 줄.
 *
 * 0.64 — `steps` 로 자라는 스킬(보호막 연장)은 점수 × 값이 아니라 **표에서 뽑는다.**
 * 그걸 곱셈으로 계산하면 3점에 '+6대' 같은 없는 숫자가 나온다.
 */
function effectText(effect, rank, steps = null) {
  const stepEntries = Object.entries(steps || {}).map(([k, arr]) => {
    const i = Math.min(Math.max(1, Math.round(rank)), arr.length) - 1;
    return [k, Number(arr[i]) || 0];
  });
  if (stepEntries.length) {
    return stepEntries
      .map(([k, v]) => (k === 'shieldBonusTurns'
        ? `${labelOf(k)} +${round2(v)}대`
        : `${labelOf(k)} +${round2(v)}`))
      .join(' · ');
  }
  return Object.entries(effect || {})
    .filter(([k]) => k !== 'lowHpThreshold') // 임계값은 설명글에 이미 적혀 있다
    .map(([k, v]) => {
      const total = v * rank;
      if (k === 'shieldBonusTurns') return `${labelOf(k)} +${Math.round(total)}대`;
      if (k === 'openerBonus') return `${labelOf(k)} +${total}발`;
      if (k === 'chargeBonus') return `${labelOf(k)} +${round2(total)}배`;
      const suffix = EFFECT_SUFFIX[k] || '%';
      const shown = suffix === '%' ? (total * 100).toFixed(1) : round2(total);
      return `${labelOf(k)} +${shown}${suffix}`;
    })
    .join(' · ');
}

// 이름표는 ui/statLabels.js 한 곳에만 둔다(화면마다 표를 복사하지 않는다).
const labelOf = modLabel;

/** 따옴표가 든 글이 title 속성을 깨뜨리지 않게 한다. */
function escapeAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
