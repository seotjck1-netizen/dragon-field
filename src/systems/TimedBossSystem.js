// 책임: "정해진 시각마다 내려앉는 보스"의 시계와 남은 체력을 계산한다(순수 함수).
// 금지: DOM 접근, 상태 저장. 무엇을 해야 하는지만 답하고, 실제 적용은 main.js 가 한다.
// 금지: 다른 system import.
//
// ── 왜 따로 두는가 ──────────────────────────────────────────
// 서쪽 절벽의 용은 다른 몬스터와 규칙이 다르다.
//   · 맵에 늘 있는 게 아니라 30분마다 한 번 내려앉는다
//   · 못 잡아도 깎아 둔 체력이 남는다 — 여러 번 붙어서 겨우 눕히는 상대다
//   · 져도 잃는 것이 없다. 무조건 마을에서 눈을 뜬다
// 이 세 가지를 MapSystem 이나 main.js 안에 섞으면 평범한 보스 규칙까지 헷갈린다.
//
// ── 저장 형태 ──────────────────────────────────────────────
//   state.timedBoss = {
//     west_cliff: { since: 1725000000000, hp: 412300, downedAt: 0 }
//   }
//   since    — 지금 내려앉아 있는 용이 나타난 시각
//   hp       — 남은 체력(없으면 아직 안 깎은 것)
//   downedAt — 잡은 시각. 다음 마리가 올 때까지 자리가 비어 있다

/** 이 맵에 시각을 보고 나타나는 보스가 있나. */
export function timedBossOf(map) {
  return (map && map.timedBoss) || null;
}

/** 그 맵의 기록 한 칸. 없으면 빈 것을 만들어 준다(상태는 건드리지 않는다). */
export function recordOf(state, mapId) {
  return (state.timedBoss && state.timedBoss[mapId]) || null;
}

/**
 * 지금 이 맵에 용이 있어야 하는가.
 *
 * "몇 번째 주기인가"를 시각으로 계산한다. 접속을 끊고 있었어도 시계는 흘렀으므로,
 * 다시 들어오면 그동안 지나간 주기만큼 새 용이 와 있다.
 *
 * @returns {{present:boolean, since:number, hp:number|null, nextAt:number}}
 *   present — 지금 자리에 있나
 *   since   — 지금(또는 다음) 마리가 내려앉은 시각
 *   hp      — 남은 체력. null 이면 아직 한 번도 안 깎았다
 *   nextAt  — 다음 마리가 올 시각
 */
export function evaluate(state, map, now = Date.now()) {
  const def = timedBossOf(map);
  if (!def) return { present: false, since: 0, hp: null, nextAt: 0, endsAt: 0 };

  const every = Math.max(1000, def.everyMs || 1800000);
  // 머무는 시간. 주기보다 짧으면 그 뒤로는 절벽이 비어 있다.
  const stay = Math.min(def.stayMs || every, every);
  // 이번 주기의 시작 시각. 계정을 만든 시점과 무관하게 시계에 맞춘다 —
  // 그래야 여러 명이 같이 해도 "지금 와 있다"가 서로 같다.
  const since = Math.floor(now / every) * every;
  const nextAt = since + every;
  const endsAt = since + stay;

  const rec = recordOf(state, map.id);
  // 이번 마리를 이미 잡았으면 다음 주기까지 자리가 비어 있다.
  if (rec && rec.since === since && rec.downedAt) {
    return { present: false, since, hp: 0, nextAt, endsAt, downed: true };
  }
  // 머무는 시간이 지났으면 스스로 떠났다.
  if (now >= endsAt) {
    return { present: false, since, hp: null, nextAt, endsAt, left: true };
  }
  const hp = rec && rec.since === since && typeof rec.hp === 'number' ? rec.hp : null;
  return { present: true, since, hp, nextAt, endsAt };
}

/**
 * 이번 판을 시작할 때 쓸 용의 체력.
 * 깎아 둔 것이 있으면 그것을, 없으면 온전한 몸을 준다.
 */
export function startingHp(state, map, fullHp, now = Date.now()) {
  const at = evaluate(state, map, now);
  if (!at.present) return 0;
  if (at.hp == null) return fullHp;
  return Math.max(1, Math.min(fullHp, at.hp));
}

/**
 * 전투가 끝난 뒤 남은 체력을 적어 둔다.
 * @param {number} leftHp 0 이하면 잡은 것
 * @returns {object} 새 기록(호출부가 state 에 넣는다)
 */
export function afterBattle(state, map, leftHp, now = Date.now()) {
  const at = evaluate(state, map, now);
  const table = { ...(state.timedBoss || {}) };
  table[map.id] = {
    since: at.since,
    hp: Math.max(0, Math.round(leftHp)),
    downedAt: leftHp <= 0 ? now : 0,
  };
  return table;
}

/**
 * 지금 이 세상에 고룡이 와 있는가. 맵과 상관없이 시계만 보고 답한다.
 * 마을에서 "서쪽에서 이상한 기운이 감돈다"를 띄울지 정할 때 쓴다.
 * @returns {{present:boolean, since:number, endsAt:number, nextAt:number, omen:string, map:string}|null}
 */
export function omenNow(db, state, now = Date.now()) {
  for (const [mapId, def] of Object.entries(db.maps.maps)) {
    const tb = def.timedBoss;
    if (!tb || !tb.omen) continue;
    const at = evaluate(state, { id: mapId, timedBoss: tb }, now);
    return { ...at, omen: tb.omen, map: mapId, name: def.name };
  }
  return null;
}

/** "다음 용까지 12분" 같은 안내 글. */
export function waitText(nextAt, now = Date.now()) {
  const left = Math.max(0, nextAt - now);
  const min = Math.floor(left / 60000);
  const sec = Math.floor((left % 60000) / 1000);
  if (min <= 0) return `${sec}초`;
  return `${min}분 ${String(sec).padStart(2, '0')}초`;
}

/**
 * 지난 주기의 기록은 버린다. 세이브가 끝없이 불어나지 않게.
 * 지금 주기의 것만 남긴다.
 */
export function prune(state, db, now = Date.now()) {
  const table = state.timedBoss;
  if (!table) return {};
  const out = {};
  for (const [mapId, rec] of Object.entries(table)) {
    const def = db.maps.maps[mapId] && db.maps.maps[mapId].timedBoss;
    if (!def || !rec || typeof rec.since !== 'number') continue;
    const every = Math.max(1000, def.everyMs || 1800000);
    if (Math.floor(now / every) * every === rec.since) out[mapId] = { ...rec };
  }
  return out;
}
