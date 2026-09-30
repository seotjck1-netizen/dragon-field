#!/usr/bin/env node
/**
 * 드랍표와 퀘스트표를 사람이 읽기 좋게 찍어 준다.
 *   node tools/print-tables.js          # 전부
 *   node tools/print-tables.js drops    # 드랍표만
 *   node tools/print-tables.js quests   # 퀘스트표만
 *   node tools/print-tables.js items    # 아이템 정의만
 *   node tools/print-tables.js look     # 장비 외형이 빠진 곳만
 *
 * 표를 고친 뒤 이걸 돌려 보면 오타(없는 아이템 id 등)를 바로 잡을 수 있다.
 */
const fs = require('fs');
const path = require('path');

const D = path.resolve(__dirname, '../src/data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

const items = read('items.json');
const monsters = read('monsters.json');
const maps = read('maps.json');
const drops = read('drops.json');
const quests = read('quests.json');

const pad = (s, n) => {
  // 한글은 두 칸 폭으로 계산한다
  const width = [...String(s)].reduce((w, c) => w + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - width));
};

let problems = 0;

function printDrops() {
  console.log('\n═══ 드랍표 (src/data/drops.json) ═══\n');
  for (const [monsterId, table] of Object.entries(drops['표'])) {
    const mon = monsters[monsterId];
    if (!mon) {
      console.log(`⚠ ${monsterId}: monsters.json 에 없는 몬스터`);
      problems++;
      continue;
    }
    console.log(`● ${mon.name}  (Lv.${mon.level}${mon.boss ? ' · 보스' : ''})`);
    console.log(`  ${pad('아이템', 18)}${pad('확률', 8)}수량`);
    for (const [id, chance, min = 1, max = min] of table) {
      const def = items[id];
      if (!def) {
        console.log(`  ⚠ ${id} — items.json 에 없음`);
        problems++;
        continue;
      }
      const amount = min === max ? `${min}` : `${min}~${max}`;
      console.log(`  ${pad(def.name, 18)}${pad(`${Math.round(chance * 100)}%`, 8)}${amount}`);
    }
    console.log('');
  }
  const missing = Object.keys(monsters).filter((m) => !drops['표'][m]);
  if (missing.length) console.log(`(드랍표가 없는 몬스터: ${missing.join(', ')})\n`);
}

function printQuests() {
  console.log('\n═══ 퀘스트표 (src/data/quests.json) ═══\n');
  console.log(
    `  ${pad('#', 4)}${pad('제목', 20)}${pad('조건', 8)}${pad('대상', 20)}${pad('개수', 6)}` +
      `${pad('EXP', 8)}${pad('골드', 8)}${pad('Lv', 5)}보상`
  );
  quests['표'].forEach((row, i) => {
    const [id, title, type, target, count, exp, gold, rewardItem, rewardCount, , reqLevel, choices] =
      row;
    let targetName = target;
    if (type === 'collect') targetName = items[target]?.name;
    else if (type === 'hunt') targetName = monsters[target]?.name;
    else if (type === 'reach') targetName = maps.maps[target]?.name;
    if (!targetName) {
      targetName = `⚠ ${target}`;
      problems++;
    }
    let reward = rewardItem ? `${items[rewardItem]?.name || `⚠ ${rewardItem}`} ×${rewardCount}` : '-';
    if (rewardItem && !items[rewardItem]) problems++;

    // 선택 보상(직업 퀘스트)
    if (Array.isArray(choices) && choices.length) {
      reward = choices
        .map((id) => {
          if (!items[id]) problems++;
          return items[id]?.name || `⚠ ${id}`;
        })
        .join(' 또는 ');
    }

    console.log(
      `  ${pad(i + 1, 4)}${pad(title, 20)}${pad(type, 8)}${pad(targetName, 20)}${pad(count, 6)}` +
        `${pad(exp, 8)}${pad(gold, 8)}${pad(reqLevel || '-', 5)}${reward}`
    );
  });
  console.log('');
}

/**
 * 아이템 정의 자체를 검사한다.
 * type 은 "분류"(weapon/armor/accessory/consumable/material)여야 하는데,
 * 실수로 슬롯 이름(shoulder, belt …)을 적으면 소지품의 어느 탭에도 잡히지 않아
 * "가방에 있는데 고를 수가 없다"가 된다. 실제로 한 번 겪었으므로 여기서 막는다.
 */
const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'material'];
// 0.35 에서 투구(helmet)가 늘었다. 여기를 같이 안 고치면 용린 투구가 매번
// "없는 칸입니다" 로 잡혀, 진짜 실수와 섞여 검사가 무뎌진다.
// 이 목록은 systems/EquipmentSystem.js 의 SLOT_GROUPS 와 같아야 한다.
const SLOT_NAMES = [
  'weapon', 'helmet', 'armor', 'shoulder', 'gloves', 'boots', 'belt', 'necklace', 'ring',
];

function printItems() {
  console.log('═══ 아이템 점검 (src/data/items.json) ═══\n');
  const bad = [];
  for (const [id, def] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    if (!ITEM_TYPES.includes(def.type)) {
      bad.push(`${id}: type "${def.type}" 은(는) 분류가 아닙니다 ` +
        `(써야 할 값: ${ITEM_TYPES.join(' / ')})` +
        (SLOT_NAMES.includes(def.type) ? ' — 슬롯 이름을 적은 것 같습니다' : ''));
    }
    if (def.slot && !SLOT_NAMES.includes(def.slot)) {
      bad.push(`${id}: slot "${def.slot}" 은(는) 없는 칸입니다`);
    }
    if (def.slot && !['weapon', 'armor', 'accessory'].includes(def.type)) {
      bad.push(`${id}: 장착 칸(${def.slot})이 있는데 type 이 "${def.type}" 입니다 — 장비 탭에 안 뜹니다`);
    }
    if (def.use && def.type !== 'consumable') {
      bad.push(`${id}: 사용 효과가 있는데 type 이 "${def.type}" 입니다`);
    }
    if (!def.slot && !def.use && !['material'].includes(def.type)) {
      bad.push(`${id}: 칸도 효과도 없는데 type 이 "${def.type}" 입니다`);
    }
  }
  if (bad.length) {
    for (const b of bad) console.log(`  ⚠ ${b}`);
    problems += bad.length;
  } else {
    console.log(`  ✓ ${Object.keys(items).filter((k) => !k.startsWith('_')).length}개 모두 정상`);
  }
  console.log('');
}

/**
 * 장비마다 "입었을 때 어떻게 보이는지"가 정해져 있는가.
 *
 * appearance.json 에 항목이 없으면 조용히 default 로 떨어져서
 * 좋은 장비를 입어도 기본 나시 차림이 된다. 아무 오류도 안 나므로
 * 새 장비를 추가할 때 가장 빠뜨리기 쉬운 곳이다.
 */
const SLOT_TABLE = {
  weapon: 'weapon',
  armor: 'armor',
  shoulder: 'shoulder',
  gloves: 'gloves',
  boots: 'boots',
  belt: 'accessory',
  necklace: 'accessory',
  ring: 'accessory',
};

function printAppearance() {
  console.log('═══ 장비 외형 점검 (src/data/appearance.json) ═══\n');
  const ap = read('appearance.json');
  const bad = [];
  let checked = 0;
  for (const [id, def] of Object.entries(items)) {
    if (id.startsWith('_') || !def.slot) continue;
    const table = SLOT_TABLE[def.slot];
    if (!table) continue;
    checked++;
    if (!ap[table] || !ap[table][id]) {
      bad.push(`${id}(${def.name}): appearance.json 의 "${table}" 에 없습니다 — 입어도 겉모습이 안 바뀝니다`);
    }
  }
  if (bad.length) {
    for (const b of bad) console.log(`  ⚠ ${b}`);
    problems += bad.length;
  } else {
    console.log(`  ✓ 장비 ${checked}개 모두 외형이 정해져 있습니다`);
  }
  console.log('');
}

const which = process.argv[2];
if (!which || which === 'items') printItems();
if (!which || which === 'look') printAppearance();
if (!which || which === 'drops') printDrops();
if (!which || which === 'quests') printQuests();

if (problems) {
  console.log(`⚠ 문제 ${problems}건을 찾았습니다. 위의 ⚠ 표시를 확인하세요.\n`);
  process.exitCode = 1;
} else {
  console.log('✓ 표에 문제가 없습니다.\n');
}
