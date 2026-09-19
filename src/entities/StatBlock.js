// 책임: "이 캐릭터의 최종 스탯은 얼마인가"에 답하는 단일 진입점.
//        직업 기본치 + 레벨 성장 + 특성 포인트 + 장비(강화 포함) + 스킬 비율 보너스를 여기서만 합산한다.
// 금지: 상태 수정. 읽어서 계산만 한다.
// 금지: DOM 접근.

import { statsAtLevel, enhancedStats, BALANCE } from '../data/formulas.js';
import { traitStats, computeModifiers, classDef } from '../systems/SkillSystem.js';

const EMPTY = { hp: 0, atk: 0, def: 0, spd: 0, crit: 0 };

function addInto(target, src) {
  for (const k of Object.keys(EMPTY)) {
    if (src[k] != null) target[k] += src[k];
  }
  return target;
}

/**
 * 플레이어의 최종 스탯.
 * @returns {{hp:number,atk:number,def:number,spd:number,crit:number,
 *            base:object, fromTraits:object, fromEquipment:object,
 *            equipped:object[], mods:object}}
 */
/**
 * @param {string[]|null} foes 지금 상대하는 몬스터 id 들.
 *   조건부 세트 효과(예: 용린 4세트의 '고룡과 싸울 때')가 이것을 본다.
 *   평소에는 null 이고, 그때 조건부 효과는 꺼져 있다 — 그래서 사냥터를 걸어다닐 때의
 *   전투력·화면 표시는 예전 그대로다. 켜지는 것은 그 상대와 붙는 그 판뿐이다.
 */
export function computePlayerStats(state, foes = null) {
  const itemsDb = state.db.items;
  const player = state.player;
  const cls = classDef(state);

  const base = statsAtLevel(cls.baseStats, player.level, cls.growth);
  const fromTraits = traitStats(state, foes);

  const fromEquipment = { ...EMPTY };
  const equipped = [];

  for (const slot of Object.keys(player.equipment)) {
    const uid = player.equipment[slot];
    if (!uid) continue;
    const inst = state.inventory.find((i) => i.uid === uid);
    if (!inst) continue;
    const def = itemsDb[inst.id];
    if (!def) continue;
    const stats = enhancedStats(def.stats, inst.enhance || 0, def.rarity);
    addInto(fromEquipment, stats);
    equipped.push({ slot, inst, def, stats });
  }

  const total = { ...EMPTY };
  addInto(total, base);
  addInto(total, fromTraits);
  addInto(total, fromEquipment);

  // 특성·스킬·강화·버프의 비율 보너스는 마지막에 곱한다.
  const mods = computeModifiers(state, foes);

  // 순서가 중요하다:
  //   ① 방어력을 먼저 확정한다 (defToAtk 가 "최종 방어력"을 보고 더해야 하므로)
  //   ② 공격력 배율을 먼저 곱한다
  //   ③ **그 뒤에** 방어력에서 온 몫을 더한다 (용사 '전투 본능')
  //   ②-1 특성의 '곱연산' 배율은 스킬·장비의 합계(defPct/atkPct)와 **따로** 곱한다.
  //        더해 버리면 스킬 보너스와 특성이 서로를 잡아먹어 특성이 밋밋해진다.
  //
  // ⚠ 0.70.8 — ②와 ③의 **차례를 바꿨다.** 그 전에는 방어력에서 온 몫을 먼저
  //   더하고 그 합에 공격력 배율을 곱했다. 그러면 방어를 올리는 모든 것이
  //   **공격 배율까지 타고** 두 번 불어난다:
  //     방어력 873 → 철벽·방어 특성으로 ×3.25×1.35 = 3,830
  //     → 전투 본능이 120% 를 얹어 +4,596
  //     → 거기에 공격 특성 ×1.5 → 공격력 7,829 (맨몸 공격력은 623 이었다)
  //   "방어를 올려서 세지는 직업"이 아니라 **방어가 곧 공격 배율인 직업**이 된다.
  //   실제로 만렙 용사의 공격력이 세 직업 중 가장 높았다(사냥꾼의 여덟 배).
  //   차례를 바꾸면 방어에서 온 몫은 **더해지기만** 한다 — 여전히 값지지만,
  //   공격 특성을 찍을수록 더 커지는 이중 곱은 사라진다.
  total.def = Math.round(total.def * (1 + mods.defPct) * (1 + (mods.defMult || 0)));
  const toAtk = Math.min(BALANCE.DEF_TO_ATK_CAP, Math.max(0, mods.defToAtk || 0));
  const fromDef = toAtk > 0 ? Math.round(total.def * toAtk) : 0;
  total.atk = Math.round(total.atk * (1 + mods.atkPct) * (1 + (mods.atkMult || 0))) + fromDef;

  // hpPct 는 더하기 배율, hpMult 는 "두 배" 처럼 또렷한 배율. 둘 다 곱해 준다.
  total.hp = Math.round(total.hp * (1 + mods.hpPct) * (1 + mods.hpMult));

  // ④ 치명타 확률은 천장이 있고, 넘친 몫은 치명타 피해로 바뀐다.
  //    (버리면 확률을 끝까지 올린 사람의 다음 한 장이 아무 값도 없는 종이가 된다)
  const rawCrit = +(total.crit + mods.crit).toFixed(4);
  const cap = BALANCE.CRIT_CAP;
  const overflow = Math.max(0, +(rawCrit - cap).toFixed(4));
  // ⚠ 넘친 몫에도 **천장**을 둔다(0.70.8). ×10 은 "한두 장 남은 몫을 살려 주는"
  //   크기로 고른 값인데, 치명타 확률이 1.28 까지 가면 그것만으로 치명타 피해가
  //   +434%p 가 되어 주력 피해원이 된다.
  if (overflow > 0) {
    mods.critMult += Math.min(
      BALANCE.CRIT_OVERFLOW_CAP,
      overflow * BALANCE.CRIT_OVERFLOW_TO_DMG
    );
  }
  total.crit = Math.min(cap, rawCrit);
  total.critOverflow = overflow; // 화면에 "넘친 몫" 을 알려 주기 위한 값

  total.spd = +total.spd.toFixed(2);

  // 장비에 적힌 관통(활의 기본 옵션)을 보정으로 옮긴다 (0.70.13).
  //
  // 관통은 hp·atk 처럼 더해지는 능력치가 아니라 **보정**이다(상대 방어력을
  // 이만큼 없는 셈 친다). 그래서 EMPTY 에 넣어 합산하지 않고 여기서 mods 로 옮긴다.
  // 강화로는 오르지 않는다 — formulas.js 의 FIXED_STATS 를 보라.
  let gearPierce = 0;
  for (const e of equipped) gearPierce += e.stats.pierce || 0;
  if (gearPierce) mods.pierce = +((mods.pierce || 0) + gearPierce).toFixed(4);

  // 마법으로 때리는 직업(마법사)은 갑옷을 타고나기를 무시한다 — BALANCE.MAGIC_PIERCE.
  //
  // ⚠ 이 값은 **전투 계산에 쓰이지 않는다.** 실제 전투에서는 CombatSystem 이
  //   때리는 쪽·맞는 쪽·땅에 섞인 마법 비율(magicShare)을 보고 제가 계산한다.
  //   여기 적는 것은 **전투력 숫자에 그 몫을 보여 주기 위한 것**이다.
  //   (0.70.11 의 마법사는 관통 0 으로 찍혀 전투력이 실제보다 낮게 나왔다)
  mods.magicPierce = (cls.combat && cls.combat.school) === 'magic' ? BALANCE.MAGIC_PIERCE : 0;

  return { ...total, base, fromTraits, fromEquipment, fromDef, equipped, mods };
}

/**
 * 지금 입고 있는 장비의 "겉모습 정보". 렌더링 쪽에서 이것만 보고 스프라이트를 만든다.
 * 슬롯은 9칸이고, 그중 투구·무기·갑옷·어깨·장갑·신발이 그림을 바꾼다.
 * 장신구는 오라를 내는 하나만 본다.
 *
 * 투구는 0.54 에서 들어왔다 — 머리에 쓰는 것은 얼굴을 통째로 바꾸는데,
 * 여태 그림에 아무 표시가 없어서 "썼는지 안 썼는지" 를 알 수가 없었다.
 * @returns {{helmet:string|null, weapon:string|null, armor:string|null,
 *            shoulder:string|null, gloves:string|null, boots:string|null,
 *            accessory:string|null}}
 */
export function computeLook(state) {
  const eq = state.player.equipment || {};
  const idOf = (slot) => {
    const uid = eq[slot];
    if (!uid) return null;
    const inst = state.inventory.find((i) => i.uid === uid);
    return inst ? inst.id : null;
  };
  // 오라는 하나만 그린다: 반지 → 목걸이 → 벨트 순으로 먼저 끼고 있는 것.
  const accessory =
    idOf('ring1') || idOf('ring2') || idOf('necklace') || idOf('belt') || null;
  return {
    helmet: idOf('helmet'),
    weapon: idOf('weapon'),
    armor: idOf('armor'),
    shoulder: idOf('shoulder'),
    gloves: idOf('gloves'),
    boots: idOf('boots'),
    accessory,
  };
}

/** 몬스터의 최종 스탯. 지금은 데이터 그대로지만, 접두 보정을 넣을 자리다. */
export function computeMonsterStats(monsterDef) {
  // TODO(확장): 접두어(엘리트/보스) 배율, 맵 난이도 보정을 여기에 곱한다.
  return { ...EMPTY, ...monsterDef.stats };
}

/** 전투에 넘길 스냅샷. 전투는 이 값만 보고 계산한다. */
/**
 * @param {'physical'|'magic'} [school] 이 사람의 공격이 물리인가 마법인가.
 *        마법이면 상대의 마법 저항(지능·비전 갑주)이 깎아 낸다.
 */
export function toCombatant(name, stats, sprite, school = 'physical') {
  return {
    name,
    sprite,
    school,
    maxHp: stats.hp,
    hp: stats.hp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    crit: stats.crit,
  };
}
