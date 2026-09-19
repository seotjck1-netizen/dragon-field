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
export function rollRewards(db, monsterId, monsterDef, playerLevel, rng, mods = {}) {
  return {
    exp: expReward(monsterDef, playerLevel),
    gold: goldReward(monsterDef, rng(), mods.goldFind || 0),
    items: rollLoot(db, monsterId, rng, mods.materialDouble || 0),
  };
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
