// 책임: 일시적 효과(버프)의 보관과 시간 경과 처리.
// 금지: DOM 접근, 다른 system import.
// 효과 키: regen(초당 HP), speedMult(이동속도 배수), 그 외는 SkillSystem 이 전투 수정자로 합산한다.

/** 같은 id 의 버프는 덮어쓴다(재사용 시 시간 갱신). */
export function addBuff(state, buff) {
  if (!state.buffs) state.buffs = [];
  const idx = state.buffs.findIndex((b) => b.id === buff.id);
  const entry = {
    id: buff.id,
    name: buff.name,
    icon: buff.icon || '✨',
    desc: buff.desc || '',
    effects: { ...(buff.effects || {}) },
    remaining: buff.durationMs,
    duration: buff.durationMs,
  };
  if (idx >= 0) state.buffs[idx] = entry;
  else state.buffs.push(entry);
  return entry;
}

export function removeBuff(state, id) {
  if (!state.buffs) return;
  state.buffs = state.buffs.filter((b) => b.id !== id);
}

export function hasBuff(state, id) {
  return (state.buffs || []).some((b) => b.id === id);
}

/**
 * 시간을 흘려보낸다. 재생 효과로 회복한 HP를 돌려준다.
 * @returns {{healed:number, expired:string[]}}
 */
export function tickBuffs(state, dt, maxHp) {
  if (!state.buffs || !state.buffs.length) return { healed: 0, expired: [] };

  const expired = [];
  let regenPerSec = 0;

  for (const buff of state.buffs) {
    buff.remaining -= dt;
    if (buff.remaining <= 0) {
      expired.push(buff.id);
      continue;
    }
    if (buff.effects.regen) regenPerSec += buff.effects.regen;
  }
  if (expired.length) state.buffs = state.buffs.filter((b) => !expired.includes(b.id));

  let healed = 0;
  if (regenPerSec > 0 && state.player.hp < maxHp) {
    // 소수점 회복분을 모았다가 1 이상이 되면 반영한다
    state._regenAcc = (state._regenAcc || 0) + (regenPerSec * dt) / 1000;
    if (state._regenAcc >= 1) {
      healed = Math.floor(state._regenAcc);
      state._regenAcc -= healed;
      state.player.hp = Math.min(maxHp, state.player.hp + healed);
    }
  }
  return { healed, expired };
}

/** 이동속도 배수(여러 버프가 겹치면 가장 큰 값 하나만). */
export function speedMultiplier(state) {
  let mult = 1;
  for (const buff of state.buffs || []) {
    if (buff.effects.speedMult) mult = Math.max(mult, buff.effects.speedMult);
  }
  return mult;
}

/** 저장용으로 남은 시간만 추린다. */
export function serializeBuffs(state) {
  return (state.buffs || []).map((b) => ({
    id: b.id,
    name: b.name,
    icon: b.icon,
    desc: b.desc,
    effects: b.effects,
    remaining: Math.round(b.remaining),
    duration: b.duration,
  }));
}
