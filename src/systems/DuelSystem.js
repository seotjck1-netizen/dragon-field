// 책임: 결투장의 1 대 1 — 사람 대 사람 싸움을 계산한다(서버와 게임이 같은 코드를 쓴다).
// 금지: DOM · 서버 호출 · Math.random() 직접 호출(반드시 seed).
//
// 0.80.24 — 처음 만든 판. 사용자 답(2026-11-13): 점수제 · 비슷한 상대 셋 · 하루 5번 ·
//   **직업 보정 없음**(장비 · 몸 그대로) · 주간 1 ~ 5위 우편 + 이기면 조금.
//
// ── 왜 CombatSystem 을 그대로 안 쓰나 ─────────────────────────
// CombatSystem 은 "사람 하나 대 몬스터 여럿" 이라 **직업 특성이 사람 쪽에만** 붙는다
// (보호막 · 회피 · 반격 · 최후의 버팀 · 선제 사격 · 충전 …). 사람끼리 붙이면 지키는 쪽이
// 제 직업을 잃는다. 여기서는 **두 사람 모두** 자기 특성 · 보정 · 상태를 들고 싸운다.
//
// ⚠ 한 대의 규칙(피해 공식 · 관통 · 마법 몫 · 피해 감소 천장 · 처형 · 위기의 치명타 · 흡혈 · 가시 · 흡수 ·
//   보호막 · 최후의 버팀 · 바람의 걸음)은 **CombatSystem.strike 와 같아야 한다.** 그쪽을 고치면 여기도 고친다.
//   다른 점(결투장만의 규칙): 물약 없음 · 기세(±35%) 없음 · 광역 없음(상대가 하나다) · 마법사 단독 대치는 늘 켜짐.
//
// 타임라인은 전투 화면이 그대로 재생할 수 있는 모양이다 — 거는 쪽(a)이 'player', 받는 쪽(b)이 'monster'(0번).

import { createRng } from '../core/Rng.js';
import { damage, BALANCE } from '../data/formulas.js';
import { NO_MODS, NO_TRAITS } from './CombatSystem.js';

const LOW_HP_DEFAULT = 0.5;

/** 직업 특성 + 스킬이 밀어 올린 몫(CombatSystem.simulateBattle 앞부분과 같은 셈). */
export function resolveTraits(traits, mods, weaponShape) {
  const tr = { ...NO_TRAITS, ...(traits || {}) };
  const m = { ...NO_MODS, ...(mods || {}) };
  if (tr.openerWeapon && weaponShape !== tr.openerWeapon) tr.opener = 0;
  tr.evade += m.evadeBonus || 0;
  tr.opener += m.openerBonus || 0;
  tr.openerPower += m.openerPowerBonus || 0;
  tr.cleave += m.cleaveBonus || 0;
  tr.chargePower += m.chargeBonus || 0;
  tr.shieldTurns += m.shieldBonusTurns || 0;
  tr.counter += m.counterBonus || 0;
  tr.counterPower += m.counterPowerBonus || 0;
  tr.lastStand += m.lastStandBonus || 0;
  return tr;
}

const NUM_MAX = 1e9;
const num = (v, lo = 0, hi = NUM_MAX) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
};

/**
 * 결투에 들고 가는 몸(게임이 만들어 서버에 올린다). 바깥에서 온 값이므로 늘 다듬어 쓴다.
 * @returns {{name, level, classId, sprite, power, stats:{hp,atk,def,spd,crit}, mods:object, traits:object, weaponShape}}
 */
export function sanitizeSnapshot(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const s = r.stats || {};
  const mods = {};
  for (const [k, v] of Object.entries(r.mods || {})) {
    if (typeof k !== 'string' || k.length > 40) continue;
    const n = Number(v);
    if (Number.isFinite(n)) mods[k] = Math.max(-10, Math.min(100, n));
  }
  const traits = {};
  for (const [k, v] of Object.entries(r.traits || {})) {
    if (typeof k !== 'string' || k.length > 40) continue;
    if (typeof v === 'string') traits[k] = v.slice(0, 20);
    else if (v === null) traits[k] = null;
    else {
      const n = Number(v);
      if (Number.isFinite(n)) traits[k] = Math.max(-10, Math.min(1000, n));
    }
  }
  return {
    name: String(r.name || '이름 없음').slice(0, 24),
    level: Math.floor(num(r.level, 1, 999)),
    classId: String(r.classId || '').slice(0, 20),
    sprite: String(r.sprite || '').slice(0, 60),
    body: r.body ? String(r.body).slice(0, 20) : null,
    power: Math.floor(num(r.power)),
    weaponShape: r.weaponShape ? String(r.weaponShape).slice(0, 20) : null,
    stats: {
      hp: Math.max(1, Math.round(num(s.hp, 1))),
      atk: Math.max(1, Math.round(num(s.atk, 1))),
      def: Math.round(num(s.def)),
      spd: num(s.spd, 0, 100000),
      crit: num(s.crit, 0, 1),
    },
    mods,
    traits,
  };
}

/**
 * 1 대 1. a 가 거는 쪽, b 가 받는 쪽.
 * @param {{a:object, b:object, seed:number, maxActions?:number}} args  a · b 는 sanitizeSnapshot 모양
 * @returns {{winner:'a'|'b'|'draw', duration:number, seed:number, turns:object[], finalHp:{a:number,b:number}, maxHp:{a:number,b:number}}}
 */
export function simulateDuel({ a, b, seed = 1, maxActions = null }) {
  const CAP = maxActions > 0 ? maxActions : BALANCE.MAX_BATTLE_ACTIONS;
  const rng = createRng(seed);
  const T = BALANCE.TIMING;

  const make = (snap, side) => {
    const mods = { ...NO_MODS, ...(snap.mods || {}) };
    const tr = resolveTraits(snap.traits, mods, snap.weaponShape);
    return {
      name: snap.name,
      side,
      index: side === 'player' ? -1 : 0,
      maxHp: snap.stats.hp,
      hp: snap.stats.hp,
      atk: snap.stats.atk,
      def: snap.stats.def,
      spd: snap.stats.spd,
      crit: snap.stats.crit,
      mods,
      tr,
      // 직업 패시브 상태(사람마다 따로)
      st: { swings: 0, lastStand: 0, shieldUsed: false, shieldLeft: 0, swingOwed: false, guardNext: false, revengeOwed: false },
    };
  };
  const A = make(a, 'player');
  const B = make(b, 'monster');
  const foeOf = (x) => (x === A ? B : A);

  const turns = [];
  let t = T.INTRO;
  let actions = 0;
  const push = (turn) => turns.push({ t, ...turn });
  const shieldOn = (x) => x.st.shieldLeft > 0 || x.st.swingOwed;
  const schoolOf = (x) => x.tr.school || 'physical';
  const shareOf = (x) => (schoolOf(x) === 'magic' ? 1 : 0);

  function pushMiss(att, def, tag) {
    push({ type: 'miss', actor: att.side, actorIndex: att.index, actorName: att.name, target: def.side, targetName: def.name, tag });
    t += Math.round(T.ACTION_GAP * 0.6);
  }

  /** 한 대 — CombatSystem.strike 의 규칙을 양쪽에 똑같이. */
  function strike(att, def, { extra = false, power = 1, tag = null, gap = null } = {}) {
    const aM = att.mods;
    const dM = def.mods;
    const dt = def.tr;

    if (shieldOn(def)) {
      if (def.st.shieldLeft > 0) def.st.shieldLeft--;
      pushMiss(att, def, 'shield');
      return false;
    }
    if (def.st.guardNext) {
      def.st.guardNext = false;
      if (dM.evadeRevenge > 0) def.st.revengeOwed = true;
      pushMiss(att, def, 'guard');
      return false;
    }
    if (dt.evade > 0 && rng.chance(dt.evade)) {
      if (dM.evadeRevenge > 0) def.st.revengeOwed = true;
      pushMiss(att, def, null);
      return false;
    }

    let critBonus = 0;
    const lowLine = Math.min(0.9, aM.lowHpThreshold > 0 ? aM.lowHpThreshold : LOW_HP_DEFAULT);
    const isLow = att.maxHp > 0 && att.hp / att.maxHp <= lowLine;
    if (aM.lowHpCritMult > 0 && isLow) critBonus = aM.lowHpCritMult;
    let isCrit = rng.chance((att.crit || 0) + aM.crit);
    if (!isCrit && isLow && (aM.lowHpCrit || 0) > 0) isCrit = aM.lowHpCrit >= 1 || rng.chance(aM.lowHpCrit);

    const share = shareOf(att);
    const effPierce = Math.min(BALANCE.PIERCE_CAP, aM.pierce + BALANCE.MAGIC_PIERCE * share);
    const effDef = def.def * (1 - effPierce);
    let dmg = damage(att.atk, effDef, rng(), isCrit, aM.critMult + critBonus);
    if (power !== 1) dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * power));
    if (share > 0) {
      const amp = 1 + share * (aM.magicPower || 0);
      const cut = 1 - share * Math.min(0.8, dM.magicResist || 0);
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * amp * cut));
    }
    if (att.tr.magicConvert && att.tr.magicConvert !== 1) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * att.tr.magicConvert));
    }
    if (aM.damageMult) dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 + aM.damageMult)));
    if ((aM.executeBonus || 0) > 0 && def.maxHp > 0 && def.hp / def.maxHp <= BALANCE.EXECUTE_LINE) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 + aM.executeBonus)));
    }
    let revenged = false;
    if (att.st.revengeOwed && aM.evadeRevenge > 0) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 + aM.evadeRevenge)));
      att.st.revengeOwed = false;
      revenged = true;
    }
    if (dM.dmgReduction) {
      const cut = Math.min(BALANCE.DMG_REDUCTION_CAP, dM.dmgReduction);
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 - cut)));
    }
    // 마법사의 단독 대치 — 결투장은 늘 1 대 1 이다
    let duelGuarded = false;
    if (dt.duelReduction > 0) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 - dt.duelReduction)));
      duelGuarded = true;
    }
    let survived = false;
    if (dmg >= def.hp && dt.lastStand > 0) {
      const sure = def.st.lastStand === 0;
      const bonus = ((def.def || 0) / 200) * (dt.lastStandPerDef || 0);
      const chance = Math.min(dt.lastStandCap || 0.95, dt.lastStand + bonus);
      if (sure || rng.chance(chance)) {
        def.st.lastStand++;
        survived = true;
        dmg = Math.max(0, def.hp - 1);
      }
    }
    let shielded = false;
    if (!survived && dmg >= def.hp && !def.st.shieldUsed && dt.shieldOnFatal > 0) {
      def.st.shieldUsed = true;
      shielded = true;
      dmg = Math.max(0, def.hp - 1);
      const want = Number(dt.shieldTurns);
      const whole = Number.isFinite(want) ? Math.floor(want) : 1;
      const frac = Number.isFinite(want) ? want - whole : 0;
      def.st.shieldLeft = Math.max(1, whole + (frac > 0 && rng.chance(frac) ? 1 : 0));
      def.st.swingOwed = true;
    }
    def.hp = Math.max(0, def.hp - dmg);

    let absorbed = 0;
    if (dmg > 0 && def.hp > 0 && dM.absorbChance > 0 && rng.chance(dM.absorbChance)) {
      absorbed = Math.min(dmg, def.maxHp - def.hp);
      def.hp += absorbed;
    }
    if (dmg > 0 && dt.evadeAfterHit > 0) def.st.guardNext = true;
    let healed = 0;
    if (aM.lifesteal > 0 && att.hp < att.maxHp && dmg > 0) {
      healed = Math.max(1, Math.round(dmg * aM.lifesteal));
      att.hp = Math.min(att.maxHp, att.hp + healed);
    }
    let thornsBack = 0;
    if (dmg > 0 && dM.thorns > 0 && att.hp > 0) {
      thornsBack = Math.max(1, Math.round(def.def * dM.thorns));
      att.hp = Math.max(0, att.hp - thornsBack);
    }
    push({
      type: 'hit',
      actor: att.side,
      actorIndex: att.index,
      actorName: att.name,
      actorHpAfter: att.hp,
      actorMaxHp: att.maxHp,
      actorSchool: schoolOf(att),
      actorMagicShare: share,
      target: def.side,
      targetIndex: def.index,
      targetName: def.name,
      damage: dmg,
      crit: isCrit,
      extra,
      tag: revenged && !tag ? 'revenge' : tag,
      power: power !== 1 ? +power.toFixed(3) : undefined,
      healed,
      thornsBack,
      absorbed,
      duelGuarded,
      rageStacks: 0,
      survived,
      shielded,
      targetHpAfter: def.hp,
      targetMaxHp: def.maxHp,
      remaining: def.side === 'monster' ? (def.hp > 0 ? 1 : 0) : undefined,
    });
    t += gap != null ? gap : extra ? Math.round(T.ACTION_GAP * 0.45) : T.ACTION_GAP;
    return def.hp <= 0;
  }

  const over = () => A.hp <= 0 || B.hp <= 0;

  /** 한 사람의 차례(때리기 · 보호막 두 번 · 2회 공격). 끝났으면 true. */
  function turnOf(x) {
    const y = foeOf(x);
    x.st.swings++;
    const underShield = shieldOn(x);
    const charged = x.tr.chargeEvery > 0 && x.st.swings % x.tr.chargeEvery === 0;
    strike(x, y, { power: charged ? x.tr.chargePower : 1, tag: charged ? 'charge' : null });
    x.st.swingOwed = false;
    if (over()) return true;
    if (underShield) {
      actions++;
      strike(x, y, { extra: true, tag: 'shield' });
      return over();
    }
    if (x.mods.doubleHit > 0 && rng.chance(x.mods.doubleHit)) {
      actions++;
      strike(x, y, { extra: true });
      if (over()) return true;
    }
    return false;
  }

  /** 맞은 쪽의 반격(용사). */
  function maybeCounter(hitOne, before) {
    if (hitOne.hp > 0 && hitOne.hp < before && hitOne.tr.counter > 0 && rng.chance(hitOne.tr.counter)) {
      strike(hitOne, foeOf(hitOne), {
        extra: true,
        power: hitOne.tr.counterPower,
        tag: 'counter',
        gap: Math.round(T.ACTION_GAP * 0.4),
      });
    }
  }

  // 선제 사격(사냥꾼) — 빠른 쪽부터
  const first = A.spd >= B.spd ? A : B;
  for (const x of [first, foeOf(first)]) {
    for (let i = 0; i < x.tr.opener && !over(); i++) {
      actions++;
      x.st.swings++;
      strike(x, foeOf(x), { power: x.tr.openerPower, tag: 'opener' });
    }
  }

  let winner = 'draw';
  battle: while (!over() && actions < CAP) {
    for (const x of [first, foeOf(first)]) {
      actions++;
      const y = foeOf(x);
      const before = y.hp;
      if (turnOf(x)) break battle;
      maybeCounter(y, before);
      if (over()) break battle;
      if (actions >= CAP) break battle;
    }
  }
  if (B.hp <= 0 && A.hp > 0) winner = 'a';
  else if (A.hp <= 0 && B.hp > 0) winner = 'b';
  else if (A.hp <= 0 && B.hp <= 0) winner = 'draw';

  if (winner === 'a') {
    push({ type: 'defeat', actor: 'monster', actorIndex: 0, actorName: B.name, remaining: 0 });
    t += Math.round(T.ACTION_GAP * 0.3) + T.OUTRO;
  } else if (winner === 'b') {
    push({ type: 'defeat', actor: 'player', actorName: A.name });
    t += T.OUTRO;
  } else {
    push({ type: 'draw' });
    t += T.OUTRO;
  }
  return {
    winner,
    duration: t,
    seed,
    turns,
    finalHp: { a: A.hp, b: B.hp },
    maxHp: { a: A.maxHp, b: B.maxHp },
  };
}

/** 점수 — 엘로. 이긴 쪽의 기대 승률이 낮을수록 많이 오른다. */
export const RATING = { START: 1000, K: 32, DEFEND: 0.5 };

export function expected(ra, rb) {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * @param {'a'|'b'|'draw'} winner
 * @returns {{a:number, b:number}} 거는 쪽 · 받는 쪽의 점수 변화(받는 쪽은 절반만 움직인다)
 */
export function ratingDelta(ra, rb, winner, k = RATING.K, defend = RATING.DEFEND) {
  const ea = expected(ra, rb);
  const sa = winner === 'a' ? 1 : winner === 'b' ? 0 : 0.5;
  const da = Math.round(k * (sa - ea));
  return { a: da, b: Math.round(-da * defend) };
}
