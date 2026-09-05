// 책임: "이 한 대는 무엇으로, 얼마나 세게 때린 것인가" 를 한 곳에서 정한다.
// 금지: 상태 수정 · DOM. 읽어서 갈래 이름과 무게만 돌려준다.
//
// 왜 따로 있나: 같은 물음을 세 곳이 각각 물어본다 —
//   · 그림   scenes/BattleScene.js (맞는 자리 이펙트)
//   · 소리   main.js (타격음)
//   · 글씨   ui/BattleView.js (피해 숫자 크기)
// 세 곳에 따로 적어 두면 언젠가 갈린다. 화살을 맞았는데 둔기 소리가 나고,
// 글씨는 작은데 이펙트만 큰 식이다. 그래서 잣대를 여기 하나만 둔다.
//
// core/ 에 있는 이유: scenes 도 ui 도 이걸 봐야 하는데, ui 가 scenes 를 들여다보는
// 것은 층이 거꾸로다. 둘 다 기대는 바닥은 core 다.

/** 갈래 → 이펙트 그림 이름(manifest 의 키) */
export const KIND_FX = {
  slash: 'fx_slash',
  pierce: 'fx_pierce',
  magic: 'fx_magic',
  // 0.56 — 마법사는 불덩이를 던진다. 보랏빛 별(magic)은 마법을 쓰는 **몬스터** 몫이다.
  fire: 'fx_fire',
  impact: 'fx_impact',
  guard: 'fx_guard',
};

/** 갈래 → 효과음 이름(core/Sound.js 의 sfx) */
export const KIND_SFX = {
  slash: 'hit',
  pierce: 'arrow',
  magic: 'magic',
  fire: 'magic',
  impact: 'hit',
  guard: 'guard',
};

/**
 * 갈래 → **떠나는 순간**의 소리(core/Sound.js 의 sfx).
 *
 * KIND_SFX 는 '닿았을 때' 나는 소리다. 0.57 에서 그 앞에 하나를 더 뒀다 —
 * 검이 공기를 가르는 소리, 시위를 떠난 화살, 날아가는 불덩이.
 * 여기 없는 갈래는 예전처럼 기합('swing')만 낸다.
 */
export const KIND_CAST = {
  slash: 'sword',
  pierce: 'bowshot',
  fire: 'firecast',
  magic: 'castmagic',
};

/** 직업이 무엇으로 때리나. */
const BY_CLASS = { warrior: 'slash', ranger: 'pierce', mage: 'fire' };

/**
 * @param {object} state 게임 상태(직업과 몬스터 표를 본다)
 * @param {object} turn CombatSystem 이 만든 타임라인 한 칸
 * @returns {'slash'|'pierce'|'magic'|'fire'|'impact'|'guard'}
 */
export function hitKindOf(state, turn) {
  if (!turn) return 'impact';
  if (turn.type === 'miss') return 'guard';

  // 마법사의 광역 여파와 마력 충전 — 이 두 꼬리표는 마법사만 단다.
  // 그러므로 그 직업이 무엇으로 때리는지를 그대로 따른다(0.56 부터 불덩이).
  if (turn.tag === 'charge' || turn.tag === 'cleave') {
    const cls = (state && state.player && state.player.classId) || 'mage';
    return BY_CLASS[cls] || 'magic';
  }
  // 사냥꾼의 선제 사격은 활이다 — 예측 공격이 켜져 있어도 마찬가지.
  if (turn.tag === 'opener') return 'pierce';

  if (turn.actor === 'player') {
    const cls = (state && state.player && state.player.classId) || 'warrior';
    return BY_CLASS[cls] || 'slash';
  }

  // 몬스터 — 속성이 마법이면 마법, 아니면 물어뜯고 후려치는 쪽으로 본다.
  //
  // 0.58 — 잣대를 **타임라인 한 칸이 들고 오는 값**으로 바꿨다(CombatSystem 의 actorSchool).
  //   예전에는 turn.actorDefId 로 state.db 를 뒤졌는데 그 칸을 채우는 곳이 없어서
  //   몬스터는 **언제나 'impact'** 였다. 마법 상대 11마리가 전부 둔기로 보이고 들렸다.
  //   옛 저장본이나 옛 타임라인이 흘러들어올 수 있으니 표 조회는 뒤로 남겨 둔다.
  if (turn.actorSchool === 'magic') return 'magic';
  if (turn.actorSchool === 'physical') return 'impact';
  const defId = turn.actorDefId || null;
  const def = defId && state && state.db ? state.db.monsters[defId] : null;
  if (def && def.school === 'magic') return 'magic';
  return 'impact';
}

/**
 * 이 한 대가 얼마나 무거웠나 — 0(보통) · 1(큰 한 방) · 2(통째로).
 *
 * 잣대는 **피해량 그 자체가 아니라 상대의 최대 HP 대비 몫**이다.
 * 숫자만 보면 안 된다 — 슬라임에게 들어간 300 과 고룡에게 들어간 300 은
 * 전혀 다른 한 대인데, 절대값으로 재면 둘 다 "큰 한 방" 이 되어 버린다.
 *
 * @param {object} turn CombatSystem 이 만든 타임라인 한 칸
 */
export function hitWeight(turn) {
  const max = turn && turn.targetMaxHp;
  if (!max || !turn.damage) return 0;
  const part = turn.damage / max;
  if (part >= 0.15) return 2;
  if (part >= 0.06) return 1;
  return 0;
}
