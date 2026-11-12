// 책임: 끝없는 탑 — 몇 층에 무엇이 나오나, 깨면 무엇을 주나, 이번 주가 언제인가.
// 금지: 전투 · 보상 넣기 · 서버 호출. main.js 가 이 값을 받아 싸움을 열고 보상을 넣는다.
//
// 0.80.22 — 처음 만든 판. 사용자 답(2026-11-12):
//   · 층과 층 사이 HP 는 **이어 간다**, 5층마다(보스를 깨면) 다 채운다. 물약은 평소처럼 저절로
//   · 지면 **값을 치르지 않고** 마을로 — 그 도전은 거기서 끝, 다음에는 1층(또는 체크포인트)부터
//   · 주간 순위 1 ~ 5위는 주가 바뀔 때 서버가 우편으로 보낸다(server/tower.js)
//
// 층 짜는 법(표: src/data/tower.json):
//   1 ~ 25층  그 단계 땅의 몬스터 · 보스가 그 땅의 배율 그대로(1층 = 1단계 들판 … 25층 = 지하 5층)
//   26층 ~    지하 1 ~ 5층 몬스터가 돌아가며, 한 층마다 HP · 공격 · 방어 × (1 + growth)
//   보스 층   bossEvery 의 배수. 25층까지는 그 땅의 보스, 그 위는 감옥의 주인
//   잡몹 층   5층 묶음의 앞 둘은 한 마리, 뒤 둘은 두 마리
//   **누가 오르든 그 주의 같은 층에는 같은 몬스터가 나온다**(주 번호 + 층으로 굴린다) — 순위가 공평하다.

import { createRng } from '../core/Rng.js';
import { scaleMonsterStats, stageMult } from '../data/formulas.js';

// 한 주의 시작 — 월요일 0시(한국 시각 UTC+9). 1970-01-05(월) 00:00 KST = 1970-01-04 15:00 UTC.
export const WEEK_MS = 7 * 86400000;
export const WEEK_ZERO = 3 * 86400000 + 15 * 3600000;

/** 지금이 몇 번째 주인가(서버와 같은 셈 — server/tower.js 의 weekOf 와 같아야 한다). */
export function weekOf(now = Date.now()) {
  return Math.floor((now - WEEK_ZERO) / WEEK_MS);
}
export function weekStart(week) {
  return WEEK_ZERO + week * WEEK_MS;
}
export function weekEnd(week) {
  return weekStart(week + 1);
}

export function rules(db) {
  const t = (db && db.tower) || {};
  return {
    unlockLevel: t.unlockLevel || 15,
    checkpointEvery: Math.max(1, t.checkpointEvery || 10),
    bossEvery: Math.max(2, t.bossEvery || 5),
    healEvery: Math.max(1, t.healEvery || 5),
    baseStages: Math.max(1, t.baseStages || 25),
    loopStages: Array.isArray(t.loopStages) && t.loopStages.length ? t.loopStages : [21, 22, 23, 24, 25],
    growth: Number(t.growth) > 0 ? Number(t.growth) : 0.06,
    levelPerFloor: Number(t.levelPerFloor) || 0,
    goldMult: Number(t.goldMult) > 0 ? Number(t.goldMult) : 3,
    bossGoldMult: Number(t.bossGoldMult) > 0 ? Number(t.bossGoldMult) : 1,
    bossItems: Array.isArray(t.bossItems) ? t.bossItems : [],
    gemEvery: t.gemEvery || 0,
    gemFrom: t.gemFrom || 0,
    gems: Array.isArray(t.gems) ? t.gems : [],
    weekly: Array.isArray(t.weekly) ? t.weekly : [],
  };
}

/** 단계 → 그 단계의 땅(maps.json). */
function mapOfStage(db, stage) {
  const maps = (db && db.maps && db.maps.maps) || {};
  for (const [id, m] of Object.entries(maps)) {
    if (m && m.stage === stage) return { id, ...m };
  }
  return null;
}

export function isBossFloor(db, floor) {
  return floor > 0 && floor % rules(db).bossEvery === 0;
}
export function isHealFloor(db, floor) {
  return floor > 0 && floor % rules(db).healEvery === 0;
}

/** 이번 주에 가장 높이 오른 층으로 고를 수 있는 시작 층들(1 · 11 · 21 …). */
export function checkpoints(db, best = 0) {
  const step = rules(db).checkpointEvery;
  const out = [1];
  for (let f = step + 1; f - 1 <= best; f += step) out.push(f);
  return out;
}

/**
 * 이 층에 무엇이 나오나.
 * @returns {{floor, boss:boolean, heal:boolean, stage:number, mapId:string, extra:number, level:number,
 *            members:Array<{defId:string, def:object, isBoss:boolean}>}}
 */
export function floorPlan(db, floor, week = 0) {
  const R = rules(db);
  const f = Math.max(1, Math.floor(floor));
  const over = Math.max(0, f - R.baseStages); // 25층 위로 몇 층
  const stage = over > 0 ? R.loopStages[(over - 1) % R.loopStages.length] : f;
  const map = mapOfStage(db, stage) || mapOfStage(db, R.baseStages) || {};
  const boss = isBossFloor(db, f);
  const extra = Math.pow(1 + R.growth, over);
  // 같은 주 · 같은 층이면 누구에게나 같은 상대(순위가 공평하다)
  const rng = createRng(((week * 7919) ^ (f * 104729) ^ 0x5bd1e995) >>> 0);

  let ids;
  if (boss) {
    const bossMap = over > 0 ? mapOfStage(db, R.baseStages) : map;
    const bossId = (bossMap && bossMap.boss) || (map.monsters || [])[0];
    ids = [{ id: bossId, map: bossMap || map, isBoss: !!(bossMap && bossMap.boss) }];
  } else {
    const pool = (map.monsters || []).filter((id) => db.monsters[id]);
    const n = (f % R.bossEvery) >= Math.ceil(R.bossEvery / 2) ? 2 : 1;
    ids = [];
    for (let i = 0; i < n && pool.length; i++) ids.push({ id: rng.pick(pool), map, isBoss: false });
  }

  const members = ids
    .filter((x) => x.id && db.monsters[x.id])
    .map(({ id, map: m, isBoss }) => {
      const base = db.monsters[id];
      const power = m.power || 1;
      const st = scaleMonsterStats(base.stats, power, stageMult(m, isBoss));
      const stats = {
        ...st,
        hp: Math.round(st.hp * extra),
        atk: Math.round(st.atk * extra),
        def: Math.round(st.def * extra),
      };
      return {
        defId: id,
        isBoss,
        def: {
          ...base,
          level: base.level + (m.levelBonus || 0) + Math.round(over * R.levelPerFloor),
          stats,
          // 탑에서는 경험치 · 드롭이 없다 — 층 보상만 있다(아래 floorReward)
          exp: 0,
          gold: Math.round((base.gold || 0) * power * extra),
        },
      };
    });

  return {
    floor: f,
    boss,
    heal: isHealFloor(db, f),
    stage,
    mapId: map.id || null,
    magicPart: boss && map.bossMagicPart != null ? map.bossMagicPart : map.magicPart || 0,
    ground: map.ground || null,
    theme: map.theme || null,
    extra,
    members,
  };
}

/** 이 층을 **이번 주에 처음** 깼을 때의 보상. */
export function floorReward(db, plan) {
  const R = rules(db);
  const goldSum = plan.members.reduce((n, m) => n + (m.def.gold || 0), 0);
  const gold = Math.round(goldSum * (plan.boss ? R.bossGoldMult : R.goldMult));
  const items = [];
  if (plan.boss) {
    const row = R.bossItems.find((r) => Array.isArray(r) && plan.floor <= r[0]);
    if (row && db.items[row[1]]) items.push({ id: row[1], count: Math.max(1, row[2] || 1) });
  }
  if (R.gemEvery && plan.floor >= R.gemFrom && plan.floor % R.gemEvery === 0 && R.gems.length) {
    const gem = R.gems[Math.floor(plan.floor / R.gemEvery) % R.gems.length];
    if (db.items[gem]) items.push({ id: gem, count: 1 });
  }
  return { gold, items };
}

/** 세이브의 탑 기록(state.tower). 주가 바뀌었으면 이번 주 기록을 비운다. */
export function ensure(state, now = Date.now()) {
  const w = weekOf(now);
  const t = state.tower && typeof state.tower === 'object' ? state.tower : {};
  const out = {
    week: Number.isFinite(t.week) ? t.week : w,
    best: Math.max(0, Math.floor(Number(t.best) || 0)),
    bestEver: Math.max(0, Math.floor(Number(t.bestEver) || 0)),
  };
  if (out.week !== w) { out.week = w; out.best = 0; }
  out.bestEver = Math.max(out.bestEver, out.best);
  state.tower = out;
  return out;
}

export function normalize(raw, now = Date.now()) {
  const holder = { tower: raw };
  return ensure(holder, now);
}
