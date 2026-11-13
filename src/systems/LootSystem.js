// 책임: 드랍표를 굴려 어떤 아이템이 나왔는지 결정한다.
// 금지: 인벤토리에 실제로 넣는 일(InventorySystem 담당).
// 금지: DOM 접근, Math.random() 직접 호출.
//
// 드랍표는 src/data/drops.json 에 있다. 한 줄이 드랍 하나:
//   [ "아이템id", 확률(0~1), 최소, 최대 ]

import { expReward, goldReward } from '../data/formulas.js';

/**
 * @param {object} db 전체 데이터
 * @param {string} monsterId 몬스터 id (drops.json 의 표 키)
 * @param {Function} rng createRng()로 만든 난수 함수
 * @returns {Array<{id:string,count:number}>}
 */
export function rollLoot(db, monsterId, rng, materialDouble = 0) {
  const table = db.drops['표'][monsterId];
  if (!table) return [];

  const out = [];
  for (const row of table) {
    const [itemId, chance, min = 1, max = min ?? 1] = row;
    const def = db.items[itemId];
    if (!def) continue; // 없는 아이템 줄은 조용히 건너뛴다
    if (!rng.chance(Number(chance))) continue;
    let count = rng.int(Number(min), Number(max));
    // 용사 패시브 — 사냥에서 나온 '재료'만 두 배로 챙긴다.
    // 장비까지 두 배로 주면 같은 검이 두 자루씩 쏟아져 값이 무너진다.
    if (materialDouble > 0 && def.type === 'material' && rng.chance(materialDouble)) {
      count *= 2;
    }
    out.push({ id: itemId, count });
  }
  return out;
}

/**
 * 전투 승리 보상 전체(경험치/골드/아이템).
 * @param {{goldFind?:number, materialDouble?:number}} [mods]
 *   골드 획득 증가(특성·사냥꾼 패시브)와 재료 두 배 확률(용사 패시브).
 *   system 끼리 import 하지 않으므로 호출부가 계산해서 넣어 준다.
 */
/**
 * @param {boolean} [isBoss] 보스인가 (0.70.22 — 보스는 경험치를 한 번 더 깎는다)
 */
/**
 * @param {{goldFind?:number, materialDouble?:number, stage?:number, shape?:string}} [mods]
 *   stage — 그 땅의 단계(장비 드롭의 등급 구간). shape — 잡은 사람의 무기 갈래(무기 드롭이 이 갈래로 나온다)
 */
export function rollRewards(db, monsterId, monsterDef, playerLevel, rng, mods = {}, isBoss = false) {
  const items = rollLoot(db, monsterId, rng, mods.materialDouble || 0);
  // 0.80.20 — 모든 몬스터가 낮은 확률로 장비 하나(잡몹 2% · 보스 30%). 표의 정해진 드롭과 따로 굴린다.
  const gear = rollGearDrop(db, rng, { stage: mods.stage || 0, isBoss, shape: mods.shape || null });
  if (gear) items.push(gear);
  return {
    exp: expReward(monsterDef, playerLevel, isBoss),
    gold: goldReward(monsterDef, rng(), mods.goldFind || 0),
    items,
  };
}

// ─────────────────────────────────────────────────────────────
// 0.80.20 — 무작위 장비(모든 몬스터 · 도박 상자)
// 표는 drops.json 의 '장비'. 등급은 물건마다 굴린다 — 여기서는 {id, count:1, grade} 만 정한다.
// 등급 · 덤 · 줄은 소지품에 들어갈 때 AffixSystem.rollGear 가 굴린다.
// ─────────────────────────────────────────────────────────────

const GRADE_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const ARMOR = ['helmet', 'shoulder', 'armor', 'gloves', 'boots'];
const ACC = ['ring', 'necklace', 'belt'];
const SHAPE_FAMILY = { sword: 'sword', greatsword: 'sword', club: 'sword', bow: 'bow', staff: 'staff' };

function gearCfg(db) {
  return (db.drops && db.drops['장비']) || null;
}

/** 단계 → 그 구간의 등급 몫. 보스는 한 구간 위. */
export function gradeTable(db, stage, isBoss = false) {
  const cfg = gearCfg(db);
  const bands = (cfg && cfg['구간']) || [];
  if (!bands.length) return null;
  let i = bands.findIndex((b) => stage >= b['단계'][0] && stage <= b['단계'][1]);
  if (i < 0) i = stage <= 0 ? bands.length - 1 : 0; // 단계 0(고룡의 땅)은 맨 위 구간
  if (isBoss) i = Math.min(bands.length - 1, i + 1);
  return bands[i]['등급'];
}

function pickIndex(weights, rng) {
  const total = weights.reduce((a, b) => a + (b > 0 ? b : 0), 0);
  if (total <= 0) return -1;
  let x = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}

export function rollGrade(weights, rng) {
  const i = pickIndex(weights || [], rng);
  return i < 0 ? 'common' : GRADE_ORDER[Math.min(GRADE_ORDER.length - 1, i)];
}

/**
 * 무작위로 나올 수 있는 "생김새" 후보. 세트 · 이름 붙은 것(named) · 강화 안 되는 것은 빠진다.
 * @param {string} slot items.json 의 slot
 * @param {string|null} shape 무기면 갈래 무리(sword · bow · staff)
 */
export function gearBases(db, slot, shape = null) {
  const look = ((db.appearance || {}).weapon) || {};
  const fam = shape ? SHAPE_FAMILY[shape] || shape : null;
  return Object.entries(db.items || {})
    .filter(([id, d]) => d && d.slot === slot && !d.named && !d.stackable && d.enhanceable !== false && !id.startsWith('_'))
    .filter(([id]) => slot !== 'weapon' || !fam || SHAPE_FAMILY[(look[id] || {}).shape] === fam)
    .map(([id, d]) => ({ id, rank: Math.max(0, GRADE_ORDER.indexOf(d.rarity || 'common')) }));
}

/** 등급에 맞는 생김새 하나 — 그 등급 이하에서 가장 높은 것, 없으면 그 위에서 가장 낮은 것. */
export function pickBase(db, slot, grade, rng, shape = null) {
  const list = gearBases(db, slot, shape);
  if (!list.length) return null;
  const g = Math.max(0, GRADE_ORDER.indexOf(grade));
  const below = list.filter((b) => b.rank <= g);
  const want = below.length
    ? Math.max(...below.map((b) => b.rank))
    : Math.min(...list.map((b) => b.rank));
  const same = list.filter((b) => b.rank === want);
  return same[Math.floor(rng() * same.length)].id;
}

/** 무기 · 방어구 · 장신구 가운데 하나(몫대로), 그 무리 안의 부위는 고르게. */
export function pickSlot(db, rng, group = null) {
  const cfg = gearCfg(db) || {};
  const share = cfg['무리'] || { weapon: 0.2, armor: 0.55, accessory: 0.25 };
  const g = group || ['weapon', 'armor', 'accessory'][Math.max(0, pickIndex([share.weapon, share.armor, share.accessory], rng))];
  if (g === 'weapon') return 'weapon';
  const list = g === 'armor' ? ARMOR : ACC;
  return list[Math.floor(rng() * list.length)];
}

/** 몬스터 한 마리가 떨구는 무작위 장비. 없으면 null. */
export function rollGearDrop(db, rng, { stage = 0, isBoss = false, shape = null } = {}) {
  const cfg = gearCfg(db);
  if (!cfg) return null;
  const chance = Number((cfg['확률'] || {})[isBoss ? '보스' : '잡몹']) || 0;
  if (!(rng() < chance)) return null;
  const grade = rollGrade(gradeTable(db, stage, isBoss), rng);
  const slot = pickSlot(db, rng);
  const id = pickBase(db, slot, grade, rng, slot === 'weapon' ? shape : null);
  return id ? { id, count: 1, grade } : null;
}

/** 도박 상자 정의 목록(상점 npc 의 boxes 순서대로). */
export function boxDefs(db, ids) {
  const table = ((gearCfg(db) || {})['상자']) || {};
  return (ids || []).filter((id) => table[id]).map((id) => ({
    id,
    name: table[id]['이름'] || id,
    price: Number(table[id]['값']) || 0,
    level: Number(table[id]['레벨']) || 1,
    grades: table[id]['등급'] || [],
  }));
}

/** 상자 하나를 연다 — 무리(weapon · armor · accessory)를 사람이 골랐다. */
export function rollBox(db, box, group, rng, shape = null) {
  const grade = rollGrade(box.grades, rng);
  const slot = pickSlot(db, rng, group);
  const id = pickBase(db, slot, grade, rng, slot === 'weapon' ? shape : null);
  return id ? { id, count: 1, grade } : null;
}

/** 표를 사람이 읽을 수 있게 정리한다(도구·디버그용). */
export function describeTable(db, monsterId) {
  const table = db.drops['표'][monsterId] || [];
  return table.map(([id, chance, min = 1, max = min]) => ({
    name: db.items[id]?.name || id,
    id,
    chance: `${Math.round(Number(chance) * 100)}%`,
    amount: min === max ? `${min}` : `${min}~${max}`,
  }));
}
