// 책임: 캐릭터 창 — 장비 9칸, 디아블로2식 수치 분해, 특성/스킬 트리 표시와 조작 버튼.
// 금지: 포인트 사용 규칙 판단 → systems/SkillSystem.js 가 준 값을 표시하고, 조작은 이벤트로 알린다.
// 금지: 게임 상태 수정.

import { computePlayerStats } from '../entities/StatBlock.js';
import {
  classSkills, canLearn, canSpendTrait, classDef, effectiveTraits,
} from '../systems/SkillSystem.js';
import { SLOT_GROUPS, SLOT_LABEL } from '../systems/EquipmentSystem.js';
import { growthShares } from '../systems/ProgressionSystem.js';
import { resetCost, combatPower } from '../data/formulas.js';
import { captureScroll, restoreScroll } from './keepScroll.js';
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
  thorns: '%', defToAtk: '%', lowHpCritMult: '%', evadeBonus: '%', cleaveBonus: '%',
  atkMult: '%', defMult: '%', potionMult: '%', goldFind: '%',
  materialDouble: '%', engraveBonus: '%', absorbChance: '%',
};

export class CharacterPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
    this.root = root;
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

    this.root.innerHTML = `
      <div class="char-panel">
        <header class="inv-header">
          <h2>${p.name} <span class="char-class">${cls.name}</span></h2>
          <span class="char-points">
            특성 <b class="${p.traitPoints ? 'is-on' : ''}">${p.traitPoints || 0}</b>
            · 스킬 <b class="${p.skillPoints ? 'is-on' : ''}">${p.skillPoints || 0}</b>
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
          <button data-tab="trait" class="${this.tab === 'trait' ? 'is-on' : ''}">특성</button>
          <button data-tab="skill" class="${this.tab === 'skill' ? 'is-on' : ''}">스킬</button>
        </nav>

        <div class="char-body" data-body data-keep-scroll="body"></div>
      </div>`;

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
    else if (this.tab === 'trait') this._renderTraits(body, state);
    else this._renderSkills(body, state);
  }

  /** 장비 탭 — 9칸 배치 + 디아블로2식 수치 분해. */
  _renderGear(body, state, stats) {
    const wrap = document.createElement('div');
    wrap.className = 'gear-tab';

    wrap.innerHTML = `
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
      ${this._combatTraitsHtml(state)}`;

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
    const lines = cls.combatDesc || [];
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
        <span class="slot-label">${SLOT_LABEL[slot]}</span>
        <span class="slot-name ${def ? `rarity-${def.rarity || 'common'}` : 'muted'}">${
          def ? nameOf(inst, def) : '비어 있음'
        }</span>
        ${def ? `<button class="mini-btn" data-unequip="${slot}">해제</button>` : ''}
      </div>`;
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

  /** 초기화 버튼 한 줄. kind: 'trait' | 'skill' */
  _resetBarHtml(state, kind) {
    const p = state.player;
    const ranks = kind === 'trait' ? p.traits : p.skills;
    const spent = Object.values(ranks || {}).reduce((a, b) => a + (b || 0), 0);
    const cost = resetCost(spent, p.level);
    const label = kind === 'trait' ? '특성' : '스킬';
    if (!spent) return `<p class="char-note muted">아직 찍은 ${label}이 없습니다.</p>`;
    const can = p.gold >= cost;
    return `<div class="reset-bar">
      <span>${label} ${spent}포인트를 되돌립니다</span>
      <button class="mini-btn ${can ? '' : 'is-lack'}" data-reset="${kind}" ${can ? '' : 'disabled'}>
        초기화 🪙 ${cost}
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
      li.innerHTML = `
        <span class="char-icon">${def.icon || '·'}</span>
        <div class="char-text">
          <span class="char-name">${def.name} <b>${total}</b></span>
          <span class="char-desc">${def.desc}</span>
          ${def.long ? `<span class="char-long">${def.long}</span>` : ''}
          <span class="char-total">${rate}${
            fromGear ? ` · 장비에서 +${fromGear}` : ''
          } · 지금까지 ${statTotalText(def, total)}</span>
        </div>`;
      list.appendChild(li);
    }
    body.appendChild(list);

    const note = document.createElement('p');
    note.className = 'muted char-note';
    note.innerHTML =
      `<b>${cls.name}</b>는 레벨이 오를 때마다 이 셋이 자동으로 자랍니다. ` +
      `한 번 오를 때 <b>20% 확률로 두 점</b>이 오릅니다 — 찍을 것은 없습니다.`;
    body.appendChild(note);
  }

  /** 특성 탭 — 포인트로 고르는 여섯 갈래. */
  _renderTraits(body, state) {
    const cfg = state.db.traits;
    const p = state.player;

    const list = document.createElement('ul');
    list.className = 'char-list';

    for (const [id, def] of Object.entries(cfg.nodes)) {
      if (id.startsWith('_') || typeof def !== 'object') continue;
      const rank = p.traits[id] || 0;
      const check = canSpendTrait(state, id);

      const li = document.createElement('li');
      li.className = `char-node ${rank ? 'is-learned' : ''}`;
      li.innerHTML = `
        <span class="char-icon">${def.icon}</span>
        <div class="char-text">
          <span class="char-name">${def.name} <b>${rank}</b><i>/${def.max}</i></span>
          <span class="char-desc">${def.desc}</span>
          ${def.long ? `<span class="char-long">${def.long}</span>` : ''}
          ${rank ? `<span class="char-total">지금까지 ${traitTotalText(def, rank)}</span>` : ''}
        </div>
        <button class="char-plus" ${check.ok ? '' : 'disabled'} title="${check.reason || '1 투자'}">+</button>`;
      li.querySelector('.char-plus').addEventListener('click', () =>
        this.bus.emit('ui:trait', { id })
      );
      list.appendChild(li);
    }
    body.appendChild(list);

    const note = document.createElement('p');
    note.className = 'muted char-note';
    note.innerHTML =
      `특성 포인트는 <b>${cfg.everyLevels}레벨마다 1점</b>, 그리고 ` +
      `<b>단계 보스 퀘스트를 마칠 때마다 1점</b> 나옵니다. ` +
      `여섯 갈래에 다섯 칸씩이라 다 채울 수는 없습니다.`;
    body.appendChild(note);

    const bar = document.createElement('div');
    bar.innerHTML = this._resetBarHtml(state, 'trait');
    body.appendChild(bar);
    this._wireReset(body);
  }

  /**
   * 스킬 탭 — 단계도 선행 조건도 없다. 가진 포인트로 아무거나 찍는다.
   * 그래서 트리 모양이 아니라 그냥 목록이다.
   */
  _renderSkills(body, state) {
    const cfg = state.db.skills;
    const p = state.player;
    const skills = classSkills(state);
    const spent = skills.reduce((a, s) => a + (p.skills[s.id] || 0), 0);
    const cap = skills.reduce((a, s) => a + (s.def.max || 0), 0);

    const wrap = document.createElement('div');
    wrap.className = 'char-tree';

    const note = document.createElement('p');
    note.className = 'char-note';
    const next = (Math.floor(p.level / cfg.everyLevels) + 1) * cfg.everyLevels;
    note.innerHTML =
      `${cfg.everyLevels}레벨마다 1포인트 · 다음 지급 <b>Lv.${next}</b> · ` +
      `찍은 것 <b>${spent}</b>/${cap}<br>` +
      `<i class="char-free">단계도 선행 조건도 없습니다 — 원하는 것부터 찍으세요. ` +
      `포인트가 넉넉하지 않으니 무엇을 포기할지가 곧 빌드입니다.</i>`;
    wrap.appendChild(note);

    const nodes = document.createElement('div');
    nodes.className = 'char-skill-list';

    for (const { id, def } of skills) {
      const rank = p.skills[id] || 0;
      const check = canLearn(state, id);
      const maxed = rank >= def.max;

      const node = document.createElement('div');
      node.className = `char-skill ${rank ? 'is-learned' : ''} ${maxed ? 'is-maxed' : ''}`;
      node.innerHTML = `
        <span class="char-icon">${def.icon}</span>
        <div class="char-text">
          <span class="char-name">${def.name} <b>${rank}</b><i>/${def.max}</i></span>
          <span class="char-desc">${def.desc}</span>
          ${def.long ? `<span class="char-long">${def.long}</span>` : ''}
          ${rank ? `<span class="char-total">지금까지 ${effectText(def.effect, rank)}</span>` : ''}
        </div>
        <button class="char-plus" ${check.ok ? '' : 'disabled'} title="${check.reason || '1 투자'}">
          ${maxed ? '★' : '+'}
        </button>`;
      node.querySelector('.char-plus').addEventListener('click', () =>
        this.bus.emit('ui:skill', { id })
      );
      nodes.appendChild(node);
    }
    wrap.appendChild(nodes);

    const bar = document.createElement('div');
    bar.innerHTML = this._resetBarHtml(state, 'skill');
    wrap.appendChild(bar);

    body.appendChild(wrap);
    this._wireReset(body);
  }
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

function effectText(effect, rank) {
  return Object.entries(effect)
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
