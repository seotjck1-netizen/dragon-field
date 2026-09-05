// 책임: 경험치 획득, 레벨업 판정, 레벨업에 따른 스탯/HP 갱신.
// 금지: DOM 접근, 다른 system import.

import { expToNext, BALANCE } from '../data/formulas.js';
import { computePlayerStats } from '../entities/StatBlock.js';
import { createRng } from '../core/Rng.js';

// 레벨업의 '두 배' 굴림에 쓰는 난수. 시스템 안에서 Math.random 을 부르지 않기로 했으므로
// 여기서 한 번만 만들어 둔다. 결과는 곧바로 세이브에 남으므로 재현할 필요가 없다.
const rng = createRng((Date.now() ^ 0x5bf03635) >>> 0);

/**
 * 경험치를 넣고 레벨업을 처리한다.
 * @returns {{leveledUp:boolean, from:number, to:number, before:object, after:object}}
 */
export function gainExp(state, amount) {
  const player = state.player;
  const from = player.level;
  const before = computePlayerStats(state);

  player.exp += Math.max(0, Math.floor(amount));

  let guard = 0;
  while (player.level < BALANCE.MAX_LEVEL && player.exp >= expToNext(player.level) && guard < 99) {
    player.exp -= expToNext(player.level);
    player.level += 1;
    guard++;
  }
  if (player.level >= BALANCE.MAX_LEVEL) player.exp = 0;

  const points = grantPoints(state, from, player.level);
  const grown = growStats(state, from, player.level);
  const after = computePlayerStats(state);
  const leveledUp = player.level > from;

  if (leveledUp) {
    // 레벨업 시 완전 회복 — 필드로 돌아가 계속 사냥할 수 있게 한다.
    player.hp = after.hp;
  } else {
    clampHp(state, after);
  }

  return { leveledUp, from, to: player.level, before, after, points, grown };
}

/**
 * 레벨 구간에 따라 특성/스킬 포인트를 지급한다.
 *  - 특성: traits.json 의 startLevel 부터 레벨마다 pointsPerLevel
 *  - 스킬: skills.json 의 everyLevels 마다 pointsPerGrant
 * @returns {{trait:number, skill:number}} 이번에 지급된 포인트
 */
export function grantPoints(state, fromLevel, toLevel) {
  const traitsCfg = state.db.traits;
  const skillsCfg = state.db.skills;
  const player = state.player;

  // 특성은 10레벨마다 한 점. (예전에는 10레벨부터 매 레벨 한 점이었다 —
  // 그때는 힘·민첩·지능을 여기서 찍었기 때문이고, 지금 그 셋은 자동으로 자란다)
  const tEvery = traitsCfg.everyLevels;
  const traitGrants = Math.floor(toLevel / tEvery) - Math.floor(fromLevel / tEvery);
  const trait = Math.max(0, traitGrants) * traitsCfg.pointsPerGrant;

  const every = skillsCfg.everyLevels;
  const skillGrants = Math.floor(toLevel / every) - Math.floor(fromLevel / every);
  const skill = Math.max(0, skillGrants) * skillsCfg.pointsPerGrant;

  player.traitPoints = (player.traitPoints || 0) + trait;
  player.skillPoints = (player.skillPoints || 0) + skill;
  return { trait, skill };
}

/** 세이브를 불러왔을 때, 레벨에 비해 포인트가 모자라면 채워 준다(데이터 수정 대비). */
export function reconcilePoints(state) {
  const player = state.player;
  const traitsCfg = state.db.traits;
  const skillsCfg = state.db.skills;

  const fromLevels =
    Math.floor(player.level / traitsCfg.everyLevels) * traitsCfg.pointsPerGrant;
  // 보스 퀘스트로 받은 몫도 세어 준다 — 아니면 접속할 때마다 그 점수가 사라진다.
  const done = (state.quests && state.quests.done) || [];
  const fromQuests = (traitsCfg.questPoints || []).filter((q) => done.includes(q)).length;
  const earnedTrait = fromLevels + fromQuests;
  const earnedSkill = Math.floor(player.level / skillsCfg.everyLevels) * skillsCfg.pointsPerGrant;

  const spentTrait = Object.values(player.traits || {}).reduce((a, b) => a + b, 0);
  const spentSkill = Object.values(player.skills || {}).reduce((a, b) => a + b, 0);

  player.traitPoints = Math.max(0, earnedTrait - spentTrait);
  player.skillPoints = Math.max(0, earnedSkill - spentSkill);
}

// ─────────────────────────────────────────────────────────────
// 힘·민첩·지능이 자라는 규칙 (0.42 에서 다시 짰다)
//
// ── 예전에는 왜 3:2:1 이 안 나왔나 ─────────────────────────
// classes.json 의 숫자를 "몇 레벨마다 한 점"으로 읽었다.
// 용사면 힘 1 · 민첩 2 · 지능 3 이니 50 레벨에서 50 / 25 / 16 —
// **비율이 3:2:1 이 아니라 6:3:2 였다.** 1/1 : 1/2 : 1/3 은 6:3:2 다.
// 사람이 표에 3:2:1 로 적어 두고 다 키운 캐릭터를 보면 안 맞으니
// "왜 이러지" 가 될 수밖에 없었다.
//
// ── 지금은 ────────────────────────────────────────────────
// 같은 숫자를 **차례(1등·2등·3등)** 로 읽고, 몫을 3:2:1 로 나눈다.
//   1등 → 3/6,  2등 → 2/6,  3등 → 1/6
// 한 레벨에 나눠 주는 총량은 예전과 같은 11/6 점(≈1.83)이라
// 다 키운 캐릭터의 총점은 그대로고, 갈리는 몫만 제대로 3:2:1 이 된다.
//
// 나눗셈의 나머지는 버리지 않는다. `floor(레벨 × 몫) - floor((레벨-1) × 몫)` 로
// 레벨마다 몇 점을 줄지 정하므로, 소수점이 쌓여 제때 한 점이 된다.
// 세이브에 따로 적어 둘 것이 없고(누적기가 필요 없다), 몇 레벨을 한 번에 올려도
// 결과가 같다.
//
// ── 운이 좋으면 두 배 ─────────────────────────────────────
// 점수를 줄 때마다 20% 로 한 점을 더 얹는다(BALANCE.STAT_DOUBLE_CHANCE).
// 확률이 세 스탯 모두 같으므로 **기댓값의 비율은 그대로 3:2:1** 이다 —
// 비율은 규칙이 지키고, 운은 그 위에 얹히기만 한다.
// ─────────────────────────────────────────────────────────────

/** 한 레벨에 나눠 주는 스탯 총량. 예전 규칙(1/1 + 1/2 + 1/3)과 같은 값이다. */
export const STAT_PER_LEVEL = 11 / 6;

/**
 * 차례(1등·2등·3등) → 그 스탯이 가져가는 **한 레벨당 몫**.
 *
 * @param {object} ranks { strength: 1, agility: 2, intellect: 3 } 처럼 적힌 차례표
 * @returns {object} { strength: 0.9167, … } — 다 더하면 STAT_PER_LEVEL
 */
export function growthShares(ranks) {
  const ids = Object.keys(ranks || {}).filter((id) => Number(ranks[id]) >= 1);
  if (!ids.length) return {};
  const n = ids.length;
  // 1등이 n, 꼴찌가 1. 셋이면 3:2:1 이고, 스탯이 늘어도 규칙은 그대로 간다.
  const weight = (id) => Math.max(1, n + 1 - Math.round(Number(ranks[id])));
  const total = ids.reduce((a, id) => a + weight(id), 0);
  const out = {};
  for (const id of ids) out[id] = (STAT_PER_LEVEL * weight(id)) / total;
  return out;
}

/** 그 레벨까지 **운을 빼고** 쌓였어야 할 점수. 소수점은 버리지 않고 쌓인다. */
export function statsFromGrowth(ranks, level) {
  const shares = growthShares(ranks);
  const out = {};
  for (const [id, share] of Object.entries(shares)) out[id] = Math.floor(level * share);
  return out;
}

/**
 * 힘·민첩·지능을 레벨에 맞게 자라게 한다.
 *
 * @returns {object} 이번에 오른 만큼 { strength: 2, agility: 1, ... }
 */
export function growStats(state, fromLevel, toLevel) {
  const player = state.player;
  const cls = state.db.classes.list[player.classId] || {};
  // statGrowth 가 비어 있으면 아무것도 자라지 않는다 — 그런데 그게 조용해서,
  // 표를 잘못 고친 날 "레벨업했는데 스탯이 안 오른다"로만 보인다.
  // 그래서 비어 있으면 기본값으로라도 자라게 하고, 콘솔에 한 줄 남긴다.
  const growth = hasGrowth(cls) ? cls.statGrowth : fallbackGrowth(state, player.classId);
  if (!player.stats) player.stats = {};

  const shares = growthShares(growth);
  const gained = {};
  for (let lv = fromLevel + 1; lv <= toLevel; lv++) {
    for (const [id, share] of Object.entries(shares)) {
      const step = Math.floor(lv * share) - Math.floor((lv - 1) * share);
      if (step <= 0) continue;
      // 한 점마다 따로 굴린다 — 두 점이 한꺼번에 오르는 레벨에서도 규칙이 같다.
      let add = 0;
      for (let i = 0; i < step; i++) add += rng.chance(BALANCE.STAT_DOUBLE_CHANCE) ? 2 : 1;
      player.stats[id] = (player.stats[id] || 0) + add;
      gained[id] = (gained[id] || 0) + add;
    }
  }
  return gained;
}

/** 이 직업에 쓸 만한 성장표가 있는가. */
function hasGrowth(cls) {
  const g = cls && cls.statGrowth;
  return !!g && Object.values(g).some((n) => Number(n) >= 1);
}

/**
 * 성장표가 없을 때 쓰는 기본값 — 세 스탯 모두 두 레벨에 한 점.
 * 균형이 맞는 값은 아니다. "아무것도 안 오르는" 것보다 나을 뿐이고,
 * 콘솔 경고를 보고 표를 고치라는 뜻이다.
 */
let _warned = false;
function fallbackGrowth(state, classId) {
  if (!_warned) {
    _warned = true;
    console.warn(
      `[ProgressionSystem] '${classId}' 에 statGrowth 가 없습니다. ` +
        '두 레벨에 한 점씩 올리는 기본값으로 대신합니다 — classes.json 을 확인하세요.'
    );
  }
  const out = {};
  // 차례를 다 같게 주면 셋이 고르게 나눠 갖는다(1:1:1).
  for (const id of Object.keys((state.db.stats && state.db.stats.nodes) || {})) {
    if (!id.startsWith('_')) out[id] = 1;
  }
  return out;
}

/**
 * 세이브를 불러왔을 때 스탯 칸이 비어 있으면(옛 세이브) 레벨에 맞게 채워 준다.
 * 두 배 굴림은 다시 하지 않는다 — 이미 지나간 레벨업을 되돌려 굴리면
 * 접속할 때마다 능력치가 달라진다. 최소치로만 채운다.
 */
export function backfillStats(state) {
  const player = state.player;
  const cls = state.db.classes.list[player.classId] || {};
  const growth = hasGrowth(cls) ? cls.statGrowth : fallbackGrowth(state, player.classId);
  if (!player.stats) player.stats = {};
  let filled = 0;
  // 운을 뺀 최소치로만 채운다. 이미 그보다 높으면 건드리지 않는다 —
  // 0.41 이전 규칙으로 자란 캐릭터는 몇 점 더 갖고 있는데, 그걸 깎으면
  // "접속했더니 스탯이 줄었다" 가 된다. 앞으로 자라는 몫만 새 규칙을 따른다.
  for (const [id, least] of Object.entries(statsFromGrowth(growth, player.level))) {
    if ((player.stats[id] || 0) < least) {
      player.stats[id] = least;
      filled++;
    }
  }
  return filled;
}

/** 장비 교체 등으로 최대 HP가 바뀌었을 때 현재 HP를 범위 안으로 맞춘다. */
export function clampHp(state, stats = null) {
  const s = stats || computePlayerStats(state);
  state.player.hp = Math.max(0, Math.min(state.player.hp, s.hp));
  return state.player.hp;
}

/** 현재 레벨의 경험치 진행도(0~1). */
export function expProgress(state) {
  const need = expToNext(state.player.level);
  if (!isFinite(need)) return 1;
  return Math.max(0, Math.min(1, state.player.exp / need));
}

export function expNeeded(state) {
  return expToNext(state.player.level);
}

/** 패배 시 처리. 지금은 마을 대신 시작 지점으로 돌려보내고 절반 회복. */
export function reviveAfterDefeat(state) {
  const stats = computePlayerStats(state);
  state.player.hp = Math.max(1, Math.floor(stats.hp * 0.5));
  const lostGold = Math.floor(state.player.gold * 0.1);
  state.player.gold -= lostGold;
  // TODO(확장): 마을/세이브포인트로 이동, 사망 패널티 규칙을 여기에 넣는다.
  return { lostGold, hp: state.player.hp };
}
