// 책임: 전투 "계산"만 담당한다. 현재 스탯 스냅샷을 받아 전투 전체 결과를
//        타임라인 배열로 한 번에 만들어 반환한다. 플레이어 입력은 개입하지 않는다.
// 금지: DOM/캔버스/연출. 화면에 보여주는 일은 ui/BattleView.js 가 한다.
// 금지: Math.random() 직접 호출. 반드시 seed 를 받아 재현 가능해야 한다.
//
// ★ 이 파일과 BattleView 를 절대 한 파일로 합치지 마라.
//   나중에 턴제/스킬을 넣으려면 여기만, 연출을 화려하게 하려면 저기만 고치면 된다.
//
// 전투는 "1 명 vs N 마리" 다. 마법사는 여러 마리를 한꺼번에 끌고 들어오고(광역),
// 사냥꾼은 붙기 전에 먼저 쏘고, 용사는 맞으면서 반격한다.
// 직업별 전투 특성은 classes.json 의 combat 블록에 데이터로만 적혀 있다.

import { createRng } from '../core/Rng.js';
import { damage, BALANCE } from '../data/formulas.js';

const NO_MODS = {
  crit: 0,
  critMult: 0,
  doubleHit: 0,
  lifesteal: 0,
  pierce: 0,
  dmgReduction: 0,
  // 마법 — 지능 특성과 마법사 스킬
  magicPower: 0,
  magicResist: 0,
  // 직업 스킬이 여는 특수 규칙
  thorns: 0,
  lowHpCritMult: 0,
  lowHpThreshold: 0,
  shieldBonusTurns: 0,
  evadeBonus: 0,
  absorbChance: 0, // 맞은 만큼 그대로 되돌려 받을 확률 (마법사 — 지능에 비례)
  openerBonus: 0,
  openerPowerBonus: 0,
  cleaveBonus: 0,
  chargeBonus: 0,
  // 특성·패시브가 주는 배율(전투 안에서 쓰는 것만 적어 둔다)
  potionMult: 0,
};

/** lowHpCritMult 의 기본 임계 — 스킬이 따로 정하지 않으면 HP 50% 아래에서 발동한다. */
const LOW_HP_DEFAULT = 0.5;

/**
 * 직업 전투 특성의 기본값(=아무 특성도 없는 상태).
 * classes.json 의 combat 블록이 이 위에 덮인다.
 */
export const NO_TRAITS = {
  opener: 0, // 전투 시작 시 공짜로 쏘는 횟수 (사냥꾼)
  openerPower: 1, // 그 선제 공격의 위력 배율
  evade: 0, // 공격을 흘릴 확률 (사냥꾼)
  cleave: 0, // 주 대상에게 준 피해의 몇 %를 나머지 전부에게 (마법사)
  chargeEvery: 0, // N 번째 공격마다 대폭발 (마법사). 0 이면 없음
  chargePower: 1, // 그 대폭발의 배율
  counter: 0, // 맞았을 때 반격할 확률 (용사)
  counterPower: 0.5, // 반격 피해 배율
  lastStand: 0, // 치명상을 1회 버틸 확률 (용사)

  // ── 직업 패시브(전투 중 자동으로 발동한다) ──
  potionPower: 1, // 물약 회복량 배율 (용사 = 2)
  shieldOnFatal: 0, // 1 이면 치명상을 받을 때 보호막이 한 번 터진다 (마법사)
  shieldTurns: 0, // 그 보호막이 막아 내는 **공격 횟수**. 0.54 이전에는 시간(ms)이었다
  evadeAfterHit: 0, // 1 이면 피해를 입은 "다음" 공격을 무조건 흘린다 (사냥꾼)
  duelReduction: 0, // 상대가 **한 마리뿐일 때만** 받는 피해를 이만큼 깎는다 (마법사)

  // 이 직업의 공격이 물리인가 마법인가. 'magic' 이면 마법 피해 증가/감소가 적용된다.
  school: 'physical',

  // 마법사 — 주는 피해를 **전부** 마법으로 바꾸고 그만큼 곱한다(1.1 = 10% 더).
  // school 만으로는 "마법으로 친다"까지고, 이 값이 "마법으로 바꾸는 값"이다.
  // 1 이면 바뀌는 것이 없다.
  magicConvert: 1,
};


/**
 * 전투 중 자동 물약의 기본 설정.
 * stock 은 [{ id, name, heal, count }] — 재고가 있는 회복 소모품 목록.
 */
export const NO_POTIONS = {
  stock: [],
  threshold: 0.7, // 최대 HP 대비 이 비율 이하로 떨어지면 마신다
  cooldownMs: 2000,
};

/**
 * @param {object} args
 * @param {object} args.player  toCombatant()로 만든 스냅샷
 * @param {object[]} [args.monsters] 여러 마리(앞에서부터 상대한다)
 * @param {object} [args.monster]  한 마리만 넘길 때(예전 호출 방식)
 * @param {number} args.seed
 * @param {object} [args.playerMods]  SkillSystem.computeModifiers() 결과
 * @param {object} [args.playerTraits] 직업 전투 특성(classes.json 의 combat)
 * @param {number} [args.startAt] 타임라인 시작 시각(전투 도중 재계산할 때 쓴다)
 * @param {boolean} [args.skipIntro] 재계산 시 인트로 간격을 생략한다
 * @param {object} [args.potions] 자동 물약 설정 — NO_POTIONS 참고
 */
export function simulateBattle({
  player,
  monsters = null,
  monster = null,
  seed = 1,
  playerMods = null,
  playerTraits = null,
  monsterMods = null,
  startAt = 0,
  skipIntro = false,
  potions = null,
}) {
  const rng = createRng(seed);
  const T = BALANCE.TIMING;
  const pMods = { ...NO_MODS, ...(playerMods || {}) };
  const mMods = { ...NO_MODS, ...(monsterMods || {}) };
  const tr = { ...NO_TRAITS, ...(playerTraits || {}) };

  // 스킬이 직업 고유 수치를 밀어 올린다.
  // (직업 기본값은 classes.json, 스킬로 얼마나 늘어나는지는 skills.json — 둘을 여기서 합친다)
  tr.evade += pMods.evadeBonus || 0;
  tr.opener += pMods.openerBonus || 0;
  // 예측공격 — 붙기 전에 쏘는 그 화살의 **위력**을 올린다(횟수가 아니라).
  // 1 포인트당 +70%, 3 포인트면 +210% 라 세 배가 조금 넘는다.
  tr.openerPower += pMods.openerPowerBonus || 0;
  tr.cleave += pMods.cleaveBonus || 0;
  tr.chargePower += pMods.chargeBonus || 0;
  tr.shieldTurns += pMods.shieldBonusTurns || 0;

  const list = monsters && monsters.length ? monsters : monster ? [monster] : [];

  const hero = { ...player, side: 'player', index: -1, mods: pMods };

  // 이 판에서 상대가 얼마나 벼르고 있는가(기세). seed 로 굴리므로 재현된다.
  // 이미 싸우던 중(startAt>0, 물약 먹고 재계산)이면 이미 정해진 값을 그대로 쓴다 —
  // 여기서 다시 굴리면 싸우는 도중에 상대가 갑자기 세지거나 약해진다.
  const moodSpread = BALANCE.MONSTER_MOOD || 0;
  const rollMood = () =>
    moodSpread > 0 ? +(1 + (rng() * 2 - 1) * moodSpread).toFixed(3) : 1;

  // 이미 쓰러진 놈도 목록에는 남긴다 — 그래야 index 가 원래 순서와 어긋나지 않는다
  // (전투 도중 물약을 먹고 재계산할 때 보상 대상을 잘못 짚지 않게 한다).
  const foes = list.map((m, i) => {
    const mood = m.mood != null ? m.mood : rollMood();
    // 최대 HP 는 기세만큼 늘리되, 지금 남은 HP 는 이미 정해진 값이면 건드리지 않는다.
    const maxHp = Math.max(1, Math.round((m.maxHp || m.hp) * mood));
    const hp = m.mood != null ? m.hp : Math.min(maxHp, Math.round(m.hp * mood));
    return {
      ...m,
      mood,
      maxHp,
      hp,
      atk: Math.max(1, Math.round(m.atk * mood)),
      // 분노 — 한 번 휘두를 때마다 공격력이 이만큼씩 붙는다(monsters.json 의 rage).
      // 오래 끌수록 무서워지는 상대를 만든다. 0 이면 예전과 똑같다.
      rage: Number(m.rage) > 0 ? Number(m.rage) : 0,
      rageStacks: 0,
      side: 'monster',
      index: i,
      mods: mMods,
      _reaped: m.hp <= 0, // 이번 전투가 시작될 때 이미 죽어 있었나
      _wasDead: m.hp <= 0,
    };
  });
  const snapshot = { player: { ...hero }, monsters: foes.map((f) => ({ ...f })) };

  const turns = [];
  let t = startAt + (skipIntro ? 0 : T.INTRO);
  let actions = 0;
  let winner = 'draw';
  let lastStandCount = 0; // 이 전투에서 치명상을 몇 번 버텼나
  let heroSwings = 0;

  // ── 직업 패시브 상태 ──
  let shieldUsed = false; // 마법사 보호막을 이미 썼는가
  /**
   * 보호막이 앞으로 **몇 대를 더 막아 주는가** (0.54 — 시간에서 횟수로 바꿨다).
   *
   * ⚠ 예전에는 `t < shieldUntil` 로 **시간**을 쟀다. 그런데 그 t 는 타임라인의
   *   시각이고, 한 대와 한 대 사이가 620ms(ACTION_GAP)라 "2.5초 무적" 은
   *   사실상 "네 대 무적" 이었다. 그러면서도 상대가 몇 마리인지, 물약을 마셨는지,
   *   광역이 몇 번 터졌는지에 따라 그 사이에 들어오는 공격 수가 **판마다 달랐다.**
   *   같은 스킬을 찍고도 어떤 판은 두 대, 어떤 판은 다섯 대를 막았다.
   *
   *   횟수로 세면 "몇 대를 막는다" 가 그대로 규칙이 된다 — 화면에도 그렇게 적는다.
   */
  let shieldLeft = 0;
  // 터진 순간부터 **내가 한 번 휘두를 때까지**는 무조건 막는다.
  //
  // 왜 필요한가: 마법사는 넷까지 끌고 온다. 횟수만으로 세면 넷에게 둘러싸였을 때
  // 남은 셋이 곧바로 이어 때려서, 1 HP 로 버틴 사람이 반격 한 번 못 하고 끝난다.
  // 실제로 재 보니 그런 판이 100/100 이었다 — 그러면 보호막이 아무 일도 안 한 셈이다.
  // '몇 대를 막는다' 는 규칙은 그대로 두고, 그 위에 "적어도 한 번은 휘두른다" 를 얹는다.
  let shieldSwingOwed = false;
  /** 지금 보호막이 살아 있는가. */
  const shieldOn = () => shieldLeft > 0 || shieldSwingOwed;
  let guardNext = false; // 사냥꾼 — 다음 피해를 무조건 흘린다

  // ── 자동 물약 ──
  // 재고를 복사해서 쓴다(호출부의 배열을 건드리지 않는다).
  // 순서는 호출부가 정해서 넘긴다(단축키 1번부터). 여기서 다시 정렬하지 않는다 —
  // 회복량 순으로 고르면 아껴 둔 비싼 약부터 사라져서 쓰는 사람의 뜻과 어긋난다.
  const pot = { ...NO_POTIONS, ...(potions || {}) };
  const potStock = (pot.stock || [])
    .filter((p) => p && p.count > 0 && p.heal > 0)
    .map((p) => ({ ...p }));
  const potionsUsed = new Map(); // id → 개수
  let lastDrinkAt = -Infinity;

  /** 이 사람의 공격이 물리인가 마법인가. 플레이어는 직업이, 몬스터는 제 정의가 정한다. */
  function schoolOf(actor) {
    if (actor.side === 'player') return tr.school || 'physical';
    return actor.school || 'physical';
  }

  /**
   * 이 상대의 공격 가운데 몇 할이 마법인가(0~1).
   *
   * 예전에는 몬스터의 공격이 물리 아니면 마법, 둘 중 하나였다. 그래서 물리 몬스터만
   * 나오는 땅에서는 지능의 '받는 마법 피해 감소' 가 통째로 죽은 값이었다 —
   * 지능을 올린 사람에게 아무 일도 일어나지 않았다.
   *
   * 이제 땅마다 마법이 섞이는 비율이 있다(maps.json 의 magicPart).
   * 11단계부터 10%, 16단계부터 20%, 그 두 구간의 보스는 30%, 지하감옥은 50%.
   * 섞인 만큼만 마법 피해 감소가 걸리므로, 지능이 실제로 값을 한다.
   */
  function magicShare(actor) {
    if (schoolOf(actor) === 'magic') return 1; // 통째로 마법인 상대(고룡·망령 등)
    return Math.max(0, Math.min(1, Number(actor.magicPart) || 0));
  }

  const aliveFoes = () => foes.filter((f) => f.hp > 0);
  /** 지금 때릴 대상 — 살아 있는 놈 중 맨 앞. */
  const target = () => aliveFoes()[0] || null;

  function push(turn) {
    turns.push({ t, ...turn });
  }

  /** 빗나감 한 줄. tag 로 그냥 회피인지 보호막/철벽 회피인지 구분한다. */
  function pushMiss(attacker, defender, tag) {
    push({
      type: 'miss',
      actor: attacker.side,
      actorIndex: attacker.index,
      actorName: attacker.name,
      target: defender.side,
      targetName: defender.name,
      tag,
    });
    t += Math.round(T.ACTION_GAP * 0.6);
  }

  /** 실제 피해 계산 한 번. 연출 이벤트도 여기서 만든다. */
  function strike(attacker, defender, { extra = false, power = 1, tag = null, gap = null } = {}) {
    const aM = attacker.mods;
    const dM = defender.mods;

    // 플레이어가 맞는 쪽일 때만 보는 방어 판정들. 순서가 곧 우선순위다.
    if (defender.side === 'player') {
      // 1) 마법사의 보호막이 아직 남아 있으면 피해가 통하지 않는다.
      if (shieldOn()) {
        if (shieldLeft > 0) shieldLeft--; // 한 대 막을 때마다 한 겹 벗겨진다
        pushMiss(attacker, defender, 'shield');
        return false;
      }
      // 2) 사냥꾼 패시브 — 직전에 맞았으면 이번 것은 무조건 흘린다.
      if (guardNext) {
        guardNext = false;
        pushMiss(attacker, defender, 'guard');
        return false;
      }
      // 3) 사냥꾼의 기본 회피(확률)
      if (tr.evade > 0 && rng.chance(tr.evade)) {
        pushMiss(attacker, defender, null);
        return false;
      }
    }

    let duelGuarded = false;

    // 분노 — 한 턴 지날 때마다 이 상대의 공격력이 더 붙는다.
    //
    // 곱으로 쌓는다(10%면 1.1배씩). 오래 끄는 만큼 가파르게 무서워지므로
    // "버티기만 하면 이긴다"는 싸움이 성립하지 않는다.
    // 스택은 **제 차례에 휘두를 때만** 오른다 — 여파(광역)나 반사로는 오르지 않는다.
    let rageMult = 1;
    if (attacker.side === 'monster' && attacker.rage > 0) {
      rageMult = Math.pow(1 + attacker.rage, attacker.rageStacks);
      if (!extra) attacker.rageStacks++;
    }

    // 위기의 치명타 피해 (0.54) — HP 가 임계 아래로 떨어지면 **치명타가 더 아프다.**
    //
    // 예전에는 주는 피해 전체가 올랐다. 그러면 "몰릴수록 세진다" 가 그냥
    // 상시 버프처럼 밋밋하게 붙었다. 치명타 배율에 얹으면 **터질 때 크게 터진다** —
    // 위기에서 한 방을 노리는 맛이 생기고, 치명타 확률을 올린 값도 함께 산다.
    // 치명타가 아닌 대에는 아무 일도 안 일어난다(그게 이 효과의 성격이다).
    let critBonus = 0;
    if (aM.lowHpCritMult > 0 && attacker.maxHp > 0) {
      // 0.9 로 막아 둔다 — 임계가 1 을 넘으면 "위기"가 아니라 상시 버프가 된다.
      const line = Math.min(0.9, aM.lowHpThreshold > 0 ? aM.lowHpThreshold : LOW_HP_DEFAULT);
      if (attacker.hp / attacker.maxHp <= line) critBonus = aM.lowHpCritMult;
    }

    const isCrit = rng.chance((attacker.crit || 0) + aM.crit);
    const effDef = defender.def * (1 - aM.pierce);
    let dmg = damage(attacker.atk * rageMult, effDef, rng(), isCrit, aM.critMult + critBonus);
    if (power !== 1) dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * power));

    // 마법이 섞인 만큼 마법 피해 증가/감소를 태운다.
    //
    // 통째로 마법인 상대(고룡·망령·마법사)는 share = 1 이라 예전과 똑같이 굴러가고,
    // 물리 상대에 마법이 조금 섞인 땅(11단계부터)은 그 비율만큼만 걸린다.
    //   맞은 값 = 물리 몫 + 마법 몫 × (1 − 마법 피해 감소)
    //           = dmg × (1 − share × 감소)
    // 때리는 쪽의 magicPower 도 마법 몫에만 얹는다.
    const share = magicShare(attacker);
    if (share > 0) {
      const amp = 1 + share * (aM.magicPower || 0);
      const cut = 1 - share * Math.min(0.8, dM.magicResist || 0);
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * amp * cut));
    }

    // 마법사 — 주는 피해를 전부 마법으로 바꾸면서 그만큼 곱한다(classes.json 의 magicConvert).
    // 위의 마법 계산이 끝난 **뒤**에 곱한다. 마법으로 바꾼 값에 붙는 값이기 때문이다.
    if (attacker.side === 'player' && tr.magicConvert && tr.magicConvert !== 1) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * tr.magicConvert));
    }

    // 주는 피해 전체에 곱하는 배율. 물리·마법을 가리지 않고 여기서 한 번만 곱한다.
    // 조건부 세트 효과가 쓴다(용린 4세트 — 고룡과 싸울 때 두 배).
    // 상대의 피해 감소보다 **앞에** 둔다 — 두 배로 때린 값에서 상대가 깎는 것이 순서다.
    if (aM.damageMult) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 + aM.damageMult)));
    }

    if (dM.dmgReduction) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 - dM.dmgReduction)));
    }

    // 마법사의 단독 대치 — **상대가 한 마리뿐일 때만** 받는 피해를 깎는다.
    //
    // 마법사는 여럿을 끌고 와 한 번에 쓸어 담는 직업이라, 한 마리씩 붙는 자리
    // (보스·지하감옥 깊은 층)에서는 장점이 통째로 죽고 몸만 약했다.
    // 그래서 '광역을 쓸 수 없는 판'에서만 대신 단단해진다.
    // 여럿을 끌고 온 판에는 걸리지 않으므로 사냥 효율에는 영향이 없다.
    if (defender.side === 'player' && tr.duelReduction > 0 && list.length === 1) {
      dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(dmg * (1 - tr.duelReduction)));
      duelGuarded = true;
    }

    // 용사의 최후의 버팀 — 치명상을 1 HP 로 버틴다.
    //
    // 첫 번째는 **무조건** 버틴다. 확률이면 "버티는 직업"이라고 해 놓고 실제로는
    // 반반이라, 한 번도 못 버티고 끝나는 판이 절반이었다. 그 다음부터가 도박이다.
    // (한 전투에 몇 번이고 버틸 수 있지만, 두 번째부터는 tr.lastStand 확률로만)
    let survived = false;
    if (defender.side === 'player' && dmg >= defender.hp && tr.lastStand > 0) {
      const sure = lastStandCount === 0; // 첫 번째는 확정
      if (sure || rng.chance(tr.lastStand)) {
        lastStandCount++;
        survived = true;
        dmg = Math.max(0, defender.hp - 1);
      }
    }

    // 마법사 패시브 — HP 가 0 아래로 내려가는 피해를 받으면 보호막이 터진다.
    // 한 전투에 한 번, 1 HP 로 버티고 그 뒤 shieldTurns **대**를 막아 낸다.
    let shielded = false;
    if (
      defender.side === 'player' &&
      !survived &&
      dmg >= defender.hp &&
      !shieldUsed &&
      tr.shieldOnFatal > 0
    ) {
      shieldUsed = true;
      shielded = true;
      dmg = Math.max(0, defender.hp - 1);
      // 적어도 한 대는 막는다 — 0 이면 1 HP 로 버틴 것이 그대로 다음 대에 끝난다.
      // 내림으로 센다 — '2점마다 한 대' 가 되어 표에 적힌 대로 굴러간다.
      shieldLeft = Math.max(1, Math.floor(tr.shieldTurns || 1));
      shieldSwingOwed = true; // 한 번 휘두를 때까지는 횟수와 상관없이 막는다
    }

    defender.hp = Math.max(0, defender.hp - dmg);

    // 마법사 패시브 — 맞은 만큼을 그대로 되돌려 받는다(마력 흡수).
    //
    // 지능에 비례해 확률이 오른다. 터지면 **받은 피해와 똑같은 만큼** 차므로
    // 그 한 대는 없던 일이 된다. 죽는 일격에는 걸리지 않는다 —
    // 이미 쓰러진 뒤에 채워 봐야 소용이 없고, '버티는 것'은 보호막의 몫이다.
    let absorbed = 0;
    if (
      defender.side === 'player' &&
      dmg > 0 &&
      defender.hp > 0 &&
      dM.absorbChance > 0 &&
      rng.chance(dM.absorbChance)
    ) {
      absorbed = Math.min(dmg, defender.maxHp - defender.hp);
      defender.hp += absorbed;
    }

    // 사냥꾼 패시브 — 피해를 입었으면 다음 한 대는 무조건 흘린다.
    if (defender.side === 'player' && dmg > 0 && tr.evadeAfterHit > 0) guardNext = true;

    let healed = 0;
    if (aM.lifesteal > 0 && attacker.hp < attacker.maxHp && dmg > 0) {
      healed = Math.max(1, Math.round(dmg * aM.lifesteal));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
    }

    // 용사의 가시 갑옷 — 맞은 만큼이 아니라 "내 방어력"에 비례해 되돌려 준다.
    // 방어를 올릴수록 반격이 아파지는 것이 이 스킬의 취지다.
    //
    // 두 가지를 지킨다:
    //  ① 맞는 그 순간 들어간다 — 내 차례를 기다리지 않는다. 그래서 여기,
    //     피해가 확정된 바로 뒤에서 상대 HP 를 깎고 actorHpAfter 로 함께 알린다.
    //  ② 치명타가 붙지 않는다 — 내가 때린 것이 아니라 상대가 가시에 스스로
    //     찔린 것이므로, isCrit 도 치명타 배율도 여기에는 관여하지 않는다.
    let thornsBack = 0;
    if (defender.side === 'player' && dmg > 0 && dM.thorns > 0 && attacker.hp > 0) {
      thornsBack = Math.max(1, Math.round(defender.def * dM.thorns));
      attacker.hp = Math.max(0, attacker.hp - thornsBack);
    }

    push({
      type: 'hit',
      actor: attacker.side,
      actorIndex: attacker.index,
      actorName: attacker.name,
      actorHpAfter: attacker.hp,
      actorMaxHp: attacker.maxHp,
      // 0.58 — 이 한 대를 **무엇으로** 때렸나. 그림·소리·글씨가 이걸 본다(core/hitLook.js).
      //
      // ⚠ 그 전까지 hitLook 은 turn.actorDefId 로 표를 뒤졌는데, 그 칸을 **아무도 채운 적이
      //   없었다.** 그래서 몬스터가 때리면 언제나 'impact' — 24마리 중 11마리(임프·악마 장군·
      //   지하감옥의 것들·두 용)가 마법 상대인데도 둔기 이펙트에 둔기 소리가 났고,
      //   근접으로 분류되어 코앞까지 달려들었다. 여기서 속성을 실어 보낸다.
      actorSchool: schoolOf(attacker),
      // 땅에 섞인 마법 몫(maps.json 의 magicPart). 통째로 마법인 상대는 1 이다.
      actorMagicShare: +magicShare(attacker).toFixed(3),
      target: defender.side,
      targetIndex: defender.index,
      targetName: defender.name,
      damage: dmg,
      crit: isCrit,
      extra,
      tag, // 'opener' | 'charge' | 'counter' | null — 로그 문구용
      // 위력 배율. 1 이 아니면 화면이 "왜 이 한 대만 세게 들어갔는지" 를 적을 수 있다.
      // (예측 공격이 켜진 선제 사격 — power 3.1 이면 "예측 +210%")
      power: power !== 1 ? +power.toFixed(3) : undefined,
      healed,
      thornsBack,
      absorbed,
      duelGuarded,
      rageStacks: attacker.side === 'monster' && attacker.rage > 0 ? attacker.rageStacks : 0,
      survived,
      shielded,
      targetHpAfter: defender.hp,
      targetMaxHp: defender.maxHp,
      remaining: defender.side === 'monster' ? aliveFoes().length : undefined,
    });
    t += gap != null ? gap : extra ? Math.round(T.ACTION_GAP * 0.45) : T.ACTION_GAP;
    return defender.hp <= 0;
  }

  /** 마법사의 광역 — 주 대상 외 나머지에게 여파를 준다. */
  function splash(mainTarget, baseDamage) {
    if (tr.cleave <= 0) return;
    const others = aliveFoes().filter((f) => f !== mainTarget);
    if (!others.length) return;

    const dmg = Math.max(BALANCE.MIN_DAMAGE, Math.round(baseDamage * tr.cleave));
    for (const f of others) {
      f.hp = Math.max(0, f.hp - dmg);
      push({
        type: 'hit',
        actor: 'player',
        actorIndex: -1,
        actorName: hero.name,
        actorHpAfter: hero.hp,
        actorMaxHp: hero.maxHp,
        target: 'monster',
        targetIndex: f.index,
        targetName: f.name,
        damage: dmg,
        crit: false,
        extra: true,
        tag: 'cleave',
        healed: 0,
        targetHpAfter: f.hp,
        targetMaxHp: f.maxHp,
        remaining: aliveFoes().length,
      });
      t += Math.round(T.ACTION_GAP * 0.22);
    }
    reapDefeated();
  }

  /** 쓰러진 몬스터에 대해 defeat 이벤트를 찍는다. */
  function reapDefeated() {
    for (const f of foes) {
      if (f.hp <= 0 && !f._reaped) {
        f._reaped = true;
        push({
          type: 'defeat',
          actor: 'monster',
          actorIndex: f.index,
          actorName: f.name,
          remaining: aliveFoes().length,
        });
        t += Math.round(T.ACTION_GAP * 0.3);
      }
    }
  }

  /**
   * 자동 물약 — 이번 차례를 물약 마시는 데 쓸지 정한다.
   * 전투 중 물약은 사람이 누르는 게 아니라 여기서 알아서 마신다(설정에서 기준선을 바꾼다).
   * @returns {boolean} 마셨으면 true — 이번 차례에는 공격하지 않는다
   */
  function maybeDrink() {
    if (!potStock.length || hero.hp <= 0) return false;
    if (hero.hp / hero.maxHp > pot.threshold) return false;
    if (t - lastDrinkAt < pot.cooldownMs) return false;

    const missing = hero.maxHp - hero.hp;
    if (missing <= 0) return false;

    // 직업 배율(용사 2배) × 특성 '물약 사용 능력'(곱연산)
    const power = (tr.potionPower || 1) * (1 + (pMods.potionMult || 0));
    // 넘어온 순서 그대로 — 앞에 있는 것(단축키 1번에 가까운 것)부터 쓴다.
    const pick = potStock.find((p) => p.count > 0);
    if (!pick) return false;

    pick.count -= 1;
    potionsUsed.set(pick.id, (potionsUsed.get(pick.id) || 0) + 1);

    const healed = Math.min(missing, Math.round(pick.heal * power));
    hero.hp += healed;
    lastDrinkAt = t;

    push({
      type: 'heal',
      actor: 'player',
      actorName: hero.name,
      amount: healed,
      actorHpAfter: hero.hp,
      actorMaxHp: hero.maxHp,
      itemId: pick.id,
      itemName: pick.name || pick.id,
      doubled: power > 1,
    });
    t += Math.round(T.ACTION_GAP * 0.55);
    return true;
  }

  /** 플레이어의 한 차례. */
  function heroTurn() {
    const foe = target();
    if (!foe) return true;

    // 위험하면 먼저 마신다. 마시는 것은 차례를 쓰지 않는다 —
    // 차례를 쓰게 하면 여러 마리에게 둘러싸였을 때 마실수록 더 맞는 악순환이 된다.
    maybeDrink();

    heroSwings++;
    // 보호막이 켜져 있는 동안에는 **무조건 두 번** 친다.
    // 보호막은 "한 대 버티는" 것이 아니라 "버티고 되돌려 주는" 패시브다 —
    // 버티기만 하면 다음 대에 그대로 죽으므로 아무것도 바뀌지 않는다.
    const underShield = shieldOn();
    // 마법사의 충전 — N 번째 공격마다 대폭발
    const charged = tr.chargeEvery > 0 && heroSwings % tr.chargeEvery === 0;
    const before = foe.hp;
    strike(hero, foe, { power: charged ? tr.chargePower : 1, tag: charged ? 'charge' : null });
    // 약속한 반격을 했다. 이제부터는 남은 횟수만으로 막는다.
    shieldSwingOwed = false;
    splash(foe, before - foe.hp);
    reapDefeated();

    if (!aliveFoes().length) return true;

    if (underShield) {
      const next = target();
      if (next) {
        actions++;
        const b2 = next.hp;
        strike(hero, next, { extra: true, tag: 'shield' });
        splash(next, b2 - next.hp);
        reapDefeated();
      }
      return !aliveFoes().length;
    }

    // 확률적 2회 공격
    if (pMods.doubleHit > 0 && rng.chance(pMods.doubleHit)) {
      const next = target();
      if (next) {
        actions++;
        const b2 = next.hp;
        strike(hero, next, { extra: true });
        splash(next, b2 - next.hp);
        reapDefeated();
      }
    }
    return !aliveFoes().length;
  }

  /**
   * 몬스터들의 차례. 살아 있는 놈이 전부 한 대씩 친다.
   * @returns {null|'monster'|'player'|'draw'} 전투가 여기서 끝났다면 그 결과
   *
   * 예전에는 그냥 true/false 를 돌려주고 호출부가 "쓰러지지 않았으면 플레이어 승리"로
   * 판정했는데, 그러면 제한 횟수를 다 써서 끝난 지구전까지 승리가 되어 버렸다.
   * (HP 3만짜리 보스를 때리다 시간만 끌어도 이겼다.) 그래서 이유를 그대로 돌려준다.
   */
  function foesTurn() {
    for (const foe of aliveFoes()) {
      actions++;
      const before = hero.hp;
      strike(foe, hero);
      if (hero.hp <= 0) return 'monster';

      // 가시 갑옷이 때린 놈을 눕혔을 수도 있다 — 그 경우도 처치로 세어 준다.
      reapDefeated();
      if (!aliveFoes().length) return 'player';

      // 용사의 반격 — 맞은 직후 되받아친다.
      if (hero.hp < before && tr.counter > 0 && rng.chance(tr.counter)) {
        const back = target();
        if (back) {
          strike(hero, back, {
            extra: true,
            power: tr.counterPower,
            tag: 'counter',
            gap: Math.round(BALANCE.TIMING.ACTION_GAP * 0.4),
          });
          reapDefeated();
          if (!aliveFoes().length) return 'player';
        }
      }
      if (actions >= BALANCE.MAX_BATTLE_ACTIONS) return 'draw';
    }
    return null;
  }

  // ── 전투 시작 ────────────────────────────────────────────
  if (!foes.length) {
    return {
      winner: 'player',
      duration: t,
      seed,
      turns,
      finalHp: { player: hero.hp, monster: 0 },
      monstersHp: [],
      defeated: [],
      potionsUsed: [],
      snapshot,
    };
  }

  // 사냥꾼의 선제 사격 — 붙기 전에 거리에서 먼저 쏜다.
  for (let i = 0; i < tr.opener && aliveFoes().length; i++) {
    const foe = target();
    if (!foe) break;
    actions++;
    heroSwings++;
    const before = foe.hp;
    strike(hero, foe, { power: tr.openerPower, tag: 'opener' });
    splash(foe, before - foe.hp);
    reapDefeated();
  }

  if (!aliveFoes().length) winner = 'player';

  // 선공은 속도로 결정한다(가장 빠른 몬스터 기준). 동률이면 플레이어 우선.
  const fastestFoe = foes.reduce((m, f) => (f.spd > m.spd ? f : m), foes[0]);
  let heroFirst = hero.spd >= fastestFoe.spd;

  battle: while (winner === 'draw' && actions < BALANCE.MAX_BATTLE_ACTIONS) {
    const phases = heroFirst ? ['hero', 'foes'] : ['foes', 'hero'];
    for (const phase of phases) {
      if (phase === 'hero') {
        actions++;
        if (heroTurn()) {
          winner = 'player';
          break battle;
        }
      } else {
        const done = foesTurn();
        if (done) {
          winner = done;
          break battle;
        }
      }
      if (actions >= BALANCE.MAX_BATTLE_ACTIONS) break battle;
    }
    // 선공 순서는 전투 내내 유지된다(매 라운드 다시 굴리지 않는다).
  }

  // 마지막 확인. 제한 횟수를 다 써서 끝났으면(winner === 'draw') 그대로 무승부다 —
  // 아직 서 있다는 이유만으로 승리로 바꾸지 않는다.
  if (hero.hp <= 0) winner = 'monster';
  else if (!aliveFoes().length) winner = 'player';

  if (winner === 'monster') {
    push({ type: 'defeat', actor: 'player', actorName: hero.name });
    t += T.OUTRO;
  } else if (winner === 'player') {
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
    finalHp: { player: hero.hp, monster: foes[0] ? foes[0].hp : 0 },
    monstersHp: foes.map((f) => f.hp),
    // "이번 전투에서 새로 쓰러뜨린" 놈들만. 처음부터 죽어 있던 놈은 빼야
    // 물약 후 재계산에서 보상을 두 번 주지 않는다.
    defeated: foes.filter((f) => f.hp <= 0 && !f._wasDead).map((f) => f.index),
    // 전투 중 자동으로 마신 물약. 호출부가 전투가 끝난 뒤 소지품에서 덜어 낸다.
    potionsUsed: [...potionsUsed.entries()].map(([id, count]) => ({ id, count })),
    snapshot,
  };
}
