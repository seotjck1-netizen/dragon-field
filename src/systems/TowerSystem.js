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
//
// 0.80.25 — 층 보상 표(floors · 구글 시트 tower 탭)와 보스 특성(affixes · tower_boss 탭).
//   보스 층의 보스는 그 주 · 그 층마다 특성 몇 개를 굴려 받는다(디아블로 2 유니크 보스처럼).
//   특성은 강점 하나 · 약점 하나 — "방어를 되받아치지만 마법에 약하다", "한 방이 세지만 2회 공격에 흐트러진다".
//   HP · 공격 · 방어 · 속도 배율, 마법 저항, 분노, 마법 공격은 여기서 몬스터 값에 미리 얹고(미리 보기에도 그 값이 보인다),
//   싸움 안의 규칙(반격 · 일격 · 반사 · 받는 피해 …)은 member.aff 로 넘긴다 — CombatSystem 이 읽는다.

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
    floors: Array.isArray(t.floors) ? t.floors.filter((r) => r && Number(r.floor) > 0) : [],
    affixes: t.affixes && typeof t.affixes === 'object' ? t.affixes : {},
    weekly: Array.isArray(t.weekly) ? t.weekly : [],
  };
}

/** 표에서 가장 높은 층. */
function lastFloor(R) {
  return R.floors.reduce((n, r) => Math.max(n, Number(r.floor) || 0), 0);
}

/**
 * 이 층의 보상 줄(floors). 표 밖의 층은 마지막 10층을 되풀이하고 골드만 층마다 growth 만큼 더 준다.
 * @returns {{floor, rec:string, gold:number, items:Array, gear:number[]|null, affixes:number, bossHp:number, beyond:boolean}}
 */
export function floorRow(db, floor) {
  const R = rules(db);
  const f = Math.max(1, Math.floor(floor));
  const top = lastFloor(R);
  let src = f;
  if (top > 0 && f > top) {
    const span = Math.min(10, top);
    src = top - span + 1 + ((f - top - 1) % span);
  }
  const row = R.floors.find((r) => Number(r.floor) === src) || {};
  const grow = src !== f ? Math.pow(1 + R.growth, f - src) : 1;
  const gear = Array.isArray(row.gear) && row.gear.some((w) => Number(w) > 0) ? row.gear.map((w) => Math.max(0, Number(w) || 0)) : null;
  return {
    floor: f,
    rec: src === f ? String(row.rec || '') : '',
    gold: Math.round((Number(row.gold) || 0) * grow),
    items: (Array.isArray(row.items) ? row.items : []).filter((x) => Array.isArray(x) && x[0] && db.items && db.items[x[0]]),
    gear,
    affixes: Math.max(0, Math.floor(Number(row.affixes) || 0)),
    bossHp: Number(row.bossHp) > 0 ? Number(row.bossHp) : 1,
    beyond: src !== f,
  };
}

/** 장비 등급 몫 [고급, 희귀, 영웅, 전설] → LootSystem 이 쓰는 [일반, 고급, 희귀, 영웅, 전설]. */
export function gearWeights(gear) {
  return gear ? [0, ...gear.slice(0, 4)] : null;
}

const GEAR_GRADE_NAME = ['고급', '희귀', '영웅', '전설'];
/** 장비 몫을 사람이 읽을 글로 — "희귀 55 · 영웅 42 · 전설 3". */
export function gearText(gear) {
  if (!gear) return '';
  const sum = gear.reduce((a, b) => a + b, 0) || 1;
  return gear.map((w, i) => (w > 0 ? `${GEAR_GRADE_NAME[i]} ${Math.round((w / sum) * 100)}` : null)).filter(Boolean).join(' · ');
}

// ── 보스 특성 ────────────────────────────────────────────────

/** 배율로 곱하는 효과(그 밖의 것은 더한다). */
const AFF_MULT = ['hpMult', 'atkMult', 'defMult', 'spdMult'];
/** 몬스터 값에 미리 얹는 효과 — 싸움 규칙(aff)으로는 넘기지 않는다. */
const AFF_STAT = [...AFF_MULT, 'magicResist', 'rage', 'magicAttack'];
/** 여럿이 겹치면 더하지 않고 큰 것 하나만 쓰는 효과(주기 · 위력 · 확률의 천장). */
const AFF_MAX = ['heavyEvery', 'heavyPower', 'heavyBreak', 'counterPower', 'curse', 'reflectMagic', 'shatter', 'shatterCrits'];

/** 특성 표(이름이 있는 것만). */
export function affixTable(db) {
  const out = {};
  for (const [id, a] of Object.entries(rules(db).affixes)) {
    if (!id.startsWith('_') && a && a.name && a.effect && typeof a.effect === 'object') out[id] = a;
  }
  return out;
}

/** 이 주 · 이 층의 보스 특성 n 개(누구에게나 같다). excludes 짝은 함께 나오지 않는다. */
export function rollAffixes(db, floor, week, n) {
  const table = affixTable(db);
  const pool = Object.keys(table);
  if (n <= 0 || !pool.length) return [];
  const rng = createRng(((week * 31337) ^ (Math.floor(floor) * 2654435761) ^ 0x9e3779b9) >>> 0);
  const out = [];
  let left = pool.slice();
  while (out.length < n && left.length) {
    const id = left[Math.floor(rng() * left.length)];
    out.push(id);
    const ex = new Set([id, ...((table[id].excludes) || [])]);
    // 거꾸로 적힌 짝도 지운다(한쪽에만 적어도 된다)
    for (const other of left) if ((table[other].excludes || []).includes(id)) ex.add(other);
    left = left.filter((x) => !ex.has(x));
  }
  return out;
}

/** 특성 여럿의 효과를 하나로 합친다. */
export function mergeAffixes(db, ids) {
  const table = affixTable(db);
  const eff = {};
  for (const id of ids) {
    const a = table[id];
    if (!a) continue;
    for (const [k, raw] of Object.entries(a.effect)) {
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      if (AFF_MULT.includes(k)) eff[k] = (eff[k] == null ? 1 : eff[k]) * v;
      else if (AFF_MAX.includes(k)) eff[k] = Math.max(eff[k] || 0, v);
      else eff[k] = (eff[k] || 0) + v;
    }
  }
  return eff;
}

/** 보스 몸에 특성을 얹는다. def(표 값) · stats 는 새로 만들어 돌려준다. */
function applyAffixes(def, eff, bossHp) {
  const st = { ...def.stats };
  const m = (k) => (eff[k] != null ? eff[k] : 1);
  st.hp = Math.max(1, Math.round(st.hp * m('hpMult') * bossHp));
  st.atk = Math.max(1, Math.round(st.atk * m('atkMult')));
  st.def = Math.max(0, Math.round(st.def * m('defMult')));
  st.spd = Math.max(1, Math.round((st.spd || 1) * m('spdMult') * 100) / 100);
  const out = { ...def, stats: st };
  if (eff.magicResist) out.magicResist = (Number(def.magicResist) || 0) + eff.magicResist;
  if (eff.rage) out.rage = (Number(def.rage) || 0) + eff.rage;
  if (eff.magicAttack > 0) out.school = 'magic';
  return out;
}

/** 싸움 규칙으로 넘길 몫(값에 미리 얹은 것은 뺀다). 없으면 null. */
function combatAff(eff) {
  const out = {};
  for (const [k, v] of Object.entries(eff)) if (!AFF_STAT.includes(k) && v) out[k] = v;
  return Object.keys(out).length ? out : null;
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

  // 0.80.25 — 보스 특성. 그 주 · 그 층마다 굴린다(누구에게나 같다).
  const row = floorRow(db, f);
  let affixes = [];
  if (boss) {
    affixes = rollAffixes(db, f, week, row.affixes);
    const eff = mergeAffixes(db, affixes);
    const table = affixTable(db);
    for (const m of members) {
      if (!m.isBoss) continue;
      m.def = applyAffixes(m.def, eff, row.bossHp);
      m.aff = combatAff(eff);
      m.affixes = affixes.map((id) => ({ id, name: table[id].name, strong: table[id].strong || '', weak: table[id].weak || '' }));
    }
  }

  return {
    floor: f,
    boss,
    affixes,
    rec: row.rec,
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

/**
 * 이 층을 **이번 주에 처음** 깼을 때의 보상(표 floors).
 * 장비는 몫만 돌려준다 — 굴려서 넣는 일은 main.js(LootSystem.rollBox · 각인)가 한다.
 * @returns {{gold:number, items:Array<{id,count}>, gear:number[]|null}}
 */
export function floorReward(db, plan) {
  const row = floorRow(db, plan.floor);
  return {
    gold: row.gold,
    items: row.items.map(([id, count]) => ({ id, count: Math.max(1, Math.floor(Number(count) || 1)) })),
    gear: row.gear,
  };
}

/**
 * 탑 창의 층별 목록 — from ~ to 층의 상대 · 특성 · 적정 레벨 · 보상.
 * @returns {Array<{floor, boss, heal, rec, foes:string, affixes:Array, reward}>}
 */
export function floorList(db, from, to, week = 0) {
  const out = [];
  for (let f = Math.max(1, from); f <= to; f++) {
    const plan = floorPlan(db, f, week);
    const bossM = plan.members.find((m) => m.isBoss);
    out.push({
      floor: f,
      boss: plan.boss,
      heal: plan.heal,
      rec: plan.rec,
      level: plan.members.reduce((n, m) => Math.max(n, m.def.level || 0), 0),
      foes: plan.members.map((m) => m.def.name).join(' · '),
      bossName: bossM ? bossM.def.name : '',
      affixes: bossM ? bossM.affixes || [] : [],
      reward: floorReward(db, plan),
    });
  }
  return out;
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
