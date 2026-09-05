// 책임: 게임 표(JSON) ↔ 스프레드시트(CSV) 변환.
// 금지: 게임 규칙, 파일 배포(server/content.js 가 한다), 네트워크 요청(호출부가 한다).
//
// ── 왜 있나 ────────────────────────────────────────────────
// 아이템·몬스터·드랍·퀘스트·스킬·특성은 전부 표다.
// 표는 엑셀이나 구글 시트에서 고치는 게 훨씬 빠르다.
//
//   items    아이템
//   monsters 몬스터
//   drops    드랍표   (한 줄 = 드랍 하나. 몬스터 하나가 여러 줄을 갖는다)
//   quests   퀘스트
//   skills   스킬     (skills.json + classes.json 둘 다 고친다 — '직업' 칸 때문)
//   traits   특성
//   config   포인트를 언제 얼마나 주나
//
// ── 지켜야 할 것 세 가지 ───────────────────────────────────
// ① CSV 가 모르는 칸은 잃어버리지 않는다.
//    아이템의 use.buff 처럼 표로 펴기 어려운 값은 마지막 "기타" 칸에 JSON 으로 실어 나른다.
//    시트에서 건드리지 않으면 그대로 돌아온다.
// ② 사람이 손으로 맞춰 놓은 형식을 부수지 않는다.
//    drops/quests 의 "한 줄 = 한 행", skills 의 직업 구분선, per·mods·effect 를
//    한 줄로 눕히는 것. JSON.stringify 로 다시 쓰면 전부 부서진다.
//    그래서 파일마다 전용 서식기를 둔다.
// ③ 게임이 모르는 효과 이름은 여기서 막는다.
//    SkillSystem 은 모르는 키를 조용히 무시하므로, 오타 난 스킬은 "아무 일도 안 하는
//    스킬"이 되어 배포된다. 그런 건 배포되기 전에 걸러야 한다.

// ─────────────────────────────────────────────────────────────
// CSV 읽기/쓰기
// ─────────────────────────────────────────────────────────────

/** CSV 한 판을 행 배열로. 따옴표·줄바꿈·쉼표를 제대로 다룬다. */
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, ''); // 엑셀이 붙이는 BOM
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') {
      quoted = true;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (c === '\r') continue;
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // 완전히 빈 줄은 버린다(시트 아래쪽 여백)
  return rows.filter((r) => r.some((v) => String(v).trim() !== ''));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 행 배열을 CSV 글로. 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다. */
function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────
// 칸 값 다루기
// ─────────────────────────────────────────────────────────────

const YES = new Set(['예', 'y', 'yes', 'true', '1', 'o', 'ㅇ', 'TRUE']);
const NO = new Set(['', '아니오', 'n', 'no', 'false', '0', 'x', 'FALSE']);

function readBool(v, fallback = false) {
  const s = String(v == null ? '' : v).trim();
  if (YES.has(s) || YES.has(s.toLowerCase())) return true;
  if (NO.has(s) || NO.has(s.toLowerCase())) return false;
  return fallback;
}

const writeBool = (v) => (v ? '예' : '아니오');

function readNum(v, fallback = null) {
  const s = String(v == null ? '' : v).trim().replace(/,/g, '');
  if (s === '') return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

const readText = (v) => String(v == null ? '' : v).trim();

/** 시트 한 칸에 여러 줄을 담을 수 없으니, 줄바꿈은 \n 두 글자로 바꿔 실어 나른다. */
const escNl = (s) => String(s == null ? '' : s).replace(/\n/g, '\\n');
const unescNl = (s) => String(s == null ? '' : s).replace(/\\n/g, '\n');

/** 표로 못 펴는 나머지 칸을 JSON 으로 싣는다(빈 객체면 빈 칸). */
function packExtra(obj, known) {
  const rest = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!known.includes(k)) rest[k] = v;
  }
  return Object.keys(rest).length ? JSON.stringify(rest) : '';
}

function unpackExtra(cell, at) {
  const s = readText(cell);
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('객체가 아닙니다');
    return v;
  } catch (err) {
    throw new Error(`${at}: '기타' 칸의 JSON 을 읽을 수 없습니다 — ${err.message}`);
  }
}

/** 값이 없는 키는 아예 넣지 않는다(원본에 없던 키가 새로 생기지 않게). */
function put(obj, key, value) {
  if (value !== null && value !== undefined && value !== '') obj[key] = value;
  return obj;
}

/**
 * 원본과 같은 키 순서로 맞춘다.
 * 순서는 게임에 아무 영향이 없지만, 시트를 한 번 돌릴 때마다 파일 전체가
 * 뒤바뀐 것처럼 보이면 무엇이 진짜 바뀌었는지 알 수가 없다.
 */
function orderLike(obj, template) {
  if (!template || typeof template !== 'object') return obj;
  const out = {};
  for (const k of Object.keys(template)) if (k in obj) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out)) out[k] = obj[k];
  return out;
}

/** 원본에 있던 주석용 키(_로 시작)는 시트에 실리지 않으므로 따로 남긴다. */
function keepNotes(original) {
  const out = {};
  for (const k of Object.keys(original || {})) if (k.startsWith('_')) out[k] = original[k];
  return out;
}

// ─────────────────────────────────────────────────────────────
// 아이템
// ─────────────────────────────────────────────────────────────

const ITEM_HEAD = [
  'id', '이름', '종류', '부위', '아이콘', '등급', '겹침', '강화',
  '가격', 'atk', 'def', 'hp', 'spd', 'crit', '치명피해', '회복HP', '마법', '설명', '기타',
];
const ITEM_KNOWN = ['name', 'type', 'slot', 'icon', 'rarity', 'stackable', 'enhanceable', 'price', 'stats', 'desc', 'magic'];

function itemsToRows(items) {
  const rows = [ITEM_HEAD];
  for (const [id, d] of Object.entries(items)) {
    if (id.startsWith('_')) continue;
    const st = d.stats || {};
    // use 는 {hp:55} 처럼 단순한 것만 칸으로 펴고, 나머지는 '기타' 로 보낸다.
    const simpleHeal = d.use && typeof d.use === 'object' && Object.keys(d.use).length === 1 && typeof d.use.hp === 'number';
    const known = simpleHeal ? [...ITEM_KNOWN, 'use'] : ITEM_KNOWN;
    rows.push([
      id, d.name || '', d.type || '', d.slot || '', d.icon || '', d.rarity || '',
      writeBool(d.stackable), writeBool(d.enhanceable),
      d.price ?? '', st.atk ?? '', st.def ?? '', st.hp ?? '', st.spd ?? '', st.crit ?? '',
      st.critDmg ?? '',
      simpleHeal ? d.use.hp : '', d.magic || '', escNl(d.desc || ''),
      packExtra(d, known),
    ]);
  }
  return rows;
}

function rowsToItems(rows, original = {}) {
  const out = keepNotes(original);
  const body = dropHeader(rows, ITEM_HEAD, 'items');
  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `items 시트 ${i + 2}번째 줄`;
    if (out[id]) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);

    const stats = {};
    put(stats, 'atk', readNum(r[9]));
    put(stats, 'def', readNum(r[10]));
    put(stats, 'hp', readNum(r[11]));
    put(stats, 'spd', readNum(r[12]));
    put(stats, 'crit', readNum(r[13]));
    put(stats, 'critDmg', readNum(r[14]));

    const def = { name: readText(r[1]) };
    if (!def.name) throw new Error(`${at}: 이름이 비어 있습니다.`);
    put(def, 'type', readText(r[2]));
    put(def, 'slot', readText(r[3]));
    put(def, 'icon', readText(r[4]));
    put(def, 'rarity', readText(r[5]));
    def.stackable = readBool(r[6]);
    def.enhanceable = readBool(r[7]);
    put(def, 'price', readNum(r[8]));
    const was = original[id];
    if (Object.keys(stats).length) def.stats = orderLike(stats, was && was.stats);
    const heal = readNum(r[15]);
    if (heal != null) def.use = { hp: heal };
    put(def, 'magic', readText(r[16]));
    put(def, 'desc', unescNl(r[17]));
    Object.assign(def, unpackExtra(r[18], at));
    out[id] = orderLike(def, was);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// 몬스터
// ─────────────────────────────────────────────────────────────

const MON_HEAD = [
  'id', '이름', '레벨', 'hp', 'atk', 'def', 'spd', 'crit',
  'exp', '골드', '이동', '속성', '보스', '정예', '전투크기', '분노', '필드그림', '전투그림',
  '등장대사', '쓰러질때', '기타',
];
// '분노' = rage. 한 번 휘두를 때마다 공격력이 이만큼씩 더 붙는다(0.1 = 10%).
// 오래 끌수록 무서워지는 상대를 만들 때 쓴다. 비우면 0(예전과 같음).
//
// '등장대사' · '쓰러질때' (0.48) — 보스가 나타날 때와 쓰러질 때 한 줄씩 말한다.
// **보스에게만 보여 준다**(잡몹이 매번 말하면 사냥이 시끄러워진다).
// 비워 두면 그 자리에 아무 말도 안 붙는다 — 연출 자체는 그대로 돈다.
const MON_KNOWN = ['name', 'level', 'stats', 'exp', 'gold', 'moveStyle', 'school', 'boss', 'elite', 'battleScale', 'rage', 'sprite', 'battleSprite', 'intro', 'defeat'];

function monstersToRows(monsters) {
  const rows = [MON_HEAD];
  for (const [id, d] of Object.entries(monsters)) {
    if (id.startsWith('_')) continue;
    const st = d.stats || {};
    rows.push([
      id, d.name || '', d.level ?? '', st.hp ?? '', st.atk ?? '', st.def ?? '', st.spd ?? '', st.crit ?? '',
      d.exp ?? '', d.gold ?? '', d.moveStyle || '', d.school || '',
      writeBool(d.boss), writeBool(d.elite), d.battleScale ?? '', d.rage ?? '',
      d.sprite || '', d.battleSprite || '',
      d.intro || '', d.defeat || '',
      packExtra(d, MON_KNOWN),
    ]);
  }
  return rows;
}

function rowsToMonsters(rows, original = {}) {
  const out = keepNotes(original);
  const body = dropHeader(rows, MON_HEAD, 'monsters');
  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `monsters 시트 ${i + 2}번째 줄`;
    if (out[id]) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);

    const stats = {};
    put(stats, 'hp', readNum(r[3]));
    put(stats, 'atk', readNum(r[4]));
    put(stats, 'def', readNum(r[5]));
    put(stats, 'spd', readNum(r[6]));
    put(stats, 'crit', readNum(r[7]));

    const def = { name: readText(r[1]) };
    if (!def.name) throw new Error(`${at}: 이름이 비어 있습니다.`);
    put(def, 'level', readNum(r[2]));
    put(def, 'sprite', readText(r[16]));
    put(def, 'battleSprite', readText(r[17]));
    const was = original[id];
    if (Object.keys(stats).length) def.stats = orderLike(stats, was && was.stats);
    put(def, 'exp', readNum(r[8]));
    put(def, 'gold', readNum(r[9]));
    put(def, 'moveStyle', readText(r[10]));
    put(def, 'school', readText(r[11]));
    if (readBool(r[12])) def.boss = true;
    if (readBool(r[13])) def.elite = true;
    put(def, 'battleScale', readNum(r[14]));
    put(def, 'rage', readNum(r[15]));
    put(def, 'intro', readText(r[18]));
    put(def, 'defeat', readText(r[19]));
    Object.assign(def, unpackExtra(r[20], at));
    out[id] = orderLike(def, was);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// 드랍표 — 한 줄이 드랍 하나(몬스터 하나가 여러 줄)
// ─────────────────────────────────────────────────────────────

const DROP_HEAD = ['몬스터', '아이템', '확률', '최소', '최대'];

function dropsToRows(drops) {
  const rows = [DROP_HEAD];
  for (const [mid, table] of Object.entries((drops && drops['표']) || {})) {
    for (const row of table || []) {
      const [item, chance, min, max] = row;
      rows.push([mid, item, chance, min ?? 1, max ?? 1]);
    }
  }
  return rows;
}

function rowsToDrops(rows) {
  const table = {};
  const body = dropHeader(rows, DROP_HEAD, 'drops');
  body.forEach((r, i) => {
    const mid = readText(r[0]);
    const item = readText(r[1]);
    if (!mid && !item) return;
    const at = `drops 시트 ${i + 2}번째 줄`;
    if (!mid) throw new Error(`${at}: 몬스터 칸이 비어 있습니다.`);
    if (!item) throw new Error(`${at}: 아이템 칸이 비어 있습니다.`);
    const chance = readNum(r[2]);
    if (chance == null) throw new Error(`${at}: 확률이 숫자가 아닙니다.`);
    if (chance < 0 || chance > 1) throw new Error(`${at}: 확률은 0~1 사이여야 합니다 (0.25 = 25%). 지금 값: ${chance}`);
    const min = readNum(r[3], 1);
    const max = readNum(r[4], min);
    if (max < min) throw new Error(`${at}: 최대(${max})가 최소(${min})보다 작습니다.`);
    (table[mid] = table[mid] || []).push([item, chance, min, max]);
  });
  return table;
}

// ─────────────────────────────────────────────────────────────
// 퀘스트
// ─────────────────────────────────────────────────────────────

const QUEST_HEAD = [
  'id', '제목', '조건', '대상', '개수', 'EXP', '골드', '보상템', '수량', '필요레벨', '선택보상', '설명',
  // 0.37 — 특별 의뢰. 비어 있으면 여느 때처럼 위에서 아래로 이어지는 줄이다.
  // 값이 있으면 **줄 순서에서 빠지고**, 그 조건이 채워졌을 때만 따로 열린다.
  //   met:<몬스터id>  그 상대를 한 번이라도 만나 봤으면
  '열림조건',
];

function questsToRows(quests) {
  const rows = [QUEST_HEAD];
  for (const row of (quests && quests['표']) || []) {
    const [id, title, type, target, count, exp, gold, rItem, rCount, desc, needLv, choices, unlock] = row;
    rows.push([
      id, title, type, target, count, exp, gold, rItem || '', rCount ?? 0,
      needLv ?? '', Array.isArray(choices) ? choices.join(' | ') : '', escNl(desc || ''),
      unlock || '',
    ]);
  }
  return rows;
}

function rowsToQuests(rows) {
  const out = [];
  const seen = new Set();
  const body = dropHeader(rows, QUEST_HEAD, 'quests');
  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `quests 시트 ${i + 2}번째 줄`;
    if (seen.has(id)) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);
    seen.add(id);

    const type = readText(r[2]);
    if (!['collect', 'hunt', 'reach'].includes(type)) {
      throw new Error(`${at}: 조건은 collect / hunt / reach 중 하나여야 합니다. 지금 값: '${type}'`);
    }
    const row = [
      id,
      readText(r[1]),
      type,
      readText(r[3]),
      readNum(r[4], 1),
      readNum(r[5], 0),
      readNum(r[6], 0),
      readText(r[7]),
      readNum(r[8], 0),
      unescNl(r[11]),
    ];
    const needLv = readNum(r[9]);
    const choices = readText(r[10])
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    const unlock = readText(r[12]);
    // 뒤 세 칸은 없어도 되는 칸이다. 필요한 만큼만 붙인다.
    // (앞 칸을 건너뛸 수 없으므로, 뒤 칸이 있으면 앞 칸도 기본값으로 채워 넣는다)
    if (needLv != null || choices.length || unlock) row.push(needLv ?? 0);
    if (choices.length || unlock) row.push(choices);
    if (unlock) row.push(unlock);
    out.push(row);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// 손으로 맞춘 형식을 지키는 서식기 (drops.json / quests.json)
// ─────────────────────────────────────────────────────────────

/** 한글은 화면에서 두 칸을 먹는다. 줄을 맞추려면 그 폭으로 세야 한다. */
function width(s) {
  let n = 0;
  for (const ch of String(s)) n += /[ᄀ-ᇿ　-〿㄰-㆏가-힯＀-｠]/.test(ch) ? 2 : 1;
  return n;
}

function padRight(s, to) {
  return s + ' '.repeat(Math.max(0, to - width(s)));
}

function padLeft(s, to) {
  return ' '.repeat(Math.max(0, to - width(s))) + s;
}

const q = (s) => JSON.stringify(String(s));

/** 확률의 0.30 같은 표기를 살린다(0.3 으로 줄어들면 표가 지저분해진다). */
function fmtChance(n) {
  const dec = (String(n).split('.')[1] || '').length;
  return n.toFixed(Math.max(2, dec)); // 0.3 → 0.30, 1 → 1.00 (표가 눈에 잘 들어오게)
}

/**
 * 표를 뺀 나머지 키(_읽는법·열·게시판 …)를 원래 순서 그대로 다시 쓴다.
 *
 * ⚠ 원본은 **줄 순서와 생김새**를 정하는 본보기일 뿐, 값은 반드시 `next` 에서 가져온다.
 *
 *   예전에는 값까지 원본에서 그대로 베꼈다. 그래서 표 바깥에 있는 값
 *   (traits.json 의 everyLevels 같은 것)은 시트에서 아무리 고쳐도
 *   **검사는 새 값으로 통과하고 파일에는 옛 값이 쓰였다.** 조용히 안 먹혔다.
 *
 *   게다가 원본에 없던 키는 아예 빠져 버렸다. 판이 올라가며 이름이 바뀐 경우
 *   (startLevel → everyLevels) 새 키가 사라진 파일이 저장되고, 그다음 확인부터
 *   "everyLevels 가 1 이상이 아닙니다" 로 시트 연결 전체가 멈췄다.
 *
 * @param {object} original 원본 JSON — 줄 순서·주석의 본보기
 * @param {string} tableKey 표가 들어 있는 키 이름 ('표' · 'tree' · 'nodes')
 * @param {(lines:string[], comma:string) => void} writeTable 그 자리에서 부를 함수
 * @param {object} [next] 새 JSON. 값은 여기서 가져온다(없으면 원본을 쓴다)
 */
function formatWithTable(original, tableKey, writeTable, next) {
  const src = next && typeof next === 'object' ? next : original;
  const lines = ['{'];

  // 원본의 줄 순서를 따르되, 새 JSON 에서 사라진 키는 빼고
  // 새로 생긴 키는 뒤에 이어 붙인다.
  const keys = Object.keys(original).filter((k) => k === tableKey || k in src);
  for (const k of Object.keys(src)) if (!keys.includes(k)) keys.push(k);

  const isScalar = (v) => v === null || typeof v !== 'object';

  keys.forEach((key, ki) => {
    const last = ki === keys.length - 1;
    const comma = last ? '' : ',';
    const val = src[key];

    if (key === tableKey) {
      writeTable(lines, comma);
    } else if (key === '_읽는법' && Array.isArray(val)) {
      // 설명문은 한 줄에 한 문장씩 — 읽으라고 있는 것이니 읽기 좋게.
      lines.push(`  ${q(key)}: [`);
      val.forEach((s, i) => lines.push(`    ${q(s)}${i < val.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else if (Array.isArray(val) && val.every((v) => typeof v !== 'object')) {
      lines.push(`  ${q(key)}: [${val.map((v) => JSON.stringify(v)).join(', ')}]${comma}`);
    } else {
      const body = JSON.stringify(val, null, 2).split('\n').join('\n  ');
      lines.push(`  ${q(key)}: ${body}${comma}`);
    }
    // 짧은 값끼리는 붙여 둔다(everyLevels / pointsPerGrant 처럼 한 묶음인 것들).
    const nextKey = keys[ki + 1];
    const bothScalar = isScalar(val) && nextKey !== undefined && isScalar(src[nextKey]);
    if (!last && !bothScalar) lines.push('');
  });

  lines.push('}');
  return lines.join('\n') + '\n';
}

/**
 * drops.json 을 손으로 고치기 좋은 모양으로 쓴다.
 * _읽는법·열 은 원본에서 그대로 가져오고, 표만 갈아 끼운다.
 */
function formatDrops(original, table, next) {
  // 아이템 이름 칸의 폭을 표 전체에 맞춰 하나로 정한다.
  let idW = 20;
  for (const rows of Object.values(table)) {
    for (const [item] of rows) idW = Math.max(idW, width(q(item)) + 2);
  }

  return formatWithTable(original, '표', (lines, comma) => {
    lines.push('  "표": {');
    const mids = Object.keys(table);
    mids.forEach((mid, mi) => {
      lines.push(`    ${q(mid)}: [`);
      const rows = table[mid];
      rows.forEach((r, ri) => {
        const [item, chance, min, max] = r;
        const cell = padRight(`${q(item)},`, idW);
        lines.push(`      [${cell}${fmtChance(chance)}, ${min}, ${max}]${ri < rows.length - 1 ? ',' : ''}`);
      });
      lines.push(`    ]${mi < mids.length - 1 ? ',' : ''}`);
      if (mi < mids.length - 1) lines.push('');
    });
    lines.push(`  }${comma}`);
  }, next);
}

/** quests.json 도 한 줄 = 한 퀘스트 형태를 지킨다. */
function formatQuests(original, table, next) {
  // 앞쪽 아홉 칸만 줄을 맞춘다. 설명은 길어서 맞추는 의미가 없다.
  const cellText = (v) =>
    Array.isArray(v) ? `[${v.map(q).join(', ')}]` : typeof v === 'number' ? String(v) : q(v);
  const cells = table.map((r) => r.map(cellText));
  const W = [];
  for (let c = 0; c < 9; c++) {
    W[c] = Math.max(0, ...cells.map((r) => (r[c] ? width(r[c]) : 0)));
  }
  const RIGHT = new Set([4, 5, 6, 8]); // 숫자 칸은 오른쪽 맞춤

  return formatWithTable(original, '표', (lines, comma) => {
    lines.push('  "표": [');
    cells.forEach((r, i) => {
      let line = '';
      for (let c = 0; c < r.length; c++) {
        const isLast = c === r.length - 1;
        const raw = r[c] + (isLast ? '' : ',');
        if (c > 0) line += ' ';
        if (isLast || c >= 9) line += raw;
        else line += RIGHT.has(c) ? padLeft(raw, W[c] + 1) : padRight(raw, W[c] + 1);
      }
      lines.push(`    [${line}]${i < cells.length - 1 ? ',' : ''}`);
    });
    lines.push(`  ]${comma}`);
  }, next);
}

// ─────────────────────────────────────────────────────────────
// 스킬 · 특성이 쓰는 '효과' 이름
// ─────────────────────────────────────────────────────────────

/**
 * 스킬·특성이 쓸 수 있는 효과 키 전부.
 * src/systems/SkillSystem.js 의 EMPTY_MODS 와 같아야 한다.
 * (여기 없는 키를 시트에 적으면 게임이 조용히 무시하므로, 미리 걸러 낸다)
 */
const MOD_KEYS = [
  'atkPct', 'defPct', 'hpPct', 'hpMult', 'crit', 'critMult', 'doubleHit',
  'lifesteal', 'pierce', 'dmgReduction', 'magicPower', 'magicResist',
  'thorns', 'defToAtk', 'lowHpCritMult', 'lowHpThreshold', 'shieldBonusTurns',
  'evadeBonus', 'openerBonus', 'openerPowerBonus', 'cleaveBonus', 'chargeBonus',
  // 특성 여섯 갈래가 쓰는 '곱연산' 배율과, 직업 패시브가 여는 확률
  'atkMult', 'defMult', 'potionMult', 'goldFind', 'materialDouble', 'engraveBonus',
  'absorbChance',
];

/** 게임 화면에 안 나오지만 시트에서는 이름이 있어야 읽히는 것들. */
const EXTRA_LABELS = {
  lowHpThreshold: '위기 기준 HP',
  atkMult: '공격력 배율',
  defMult: '방어력 배율',
  potionMult: '물약 배율',
  goldFind: '골드 획득',
  materialDouble: '재료 두 배',
  engraveBonus: '각인 확률',
  absorbChance: '마력 흡수 확률',
};

/** 특성의 'per' 가 쓸 수 있는 순수 스탯. */
const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'crit'];

/** 효과 키 → 시트에 적을 한글 이름. */
function labelOf(key, labels) {
  return (labels && labels[key]) || EXTRA_LABELS[key] || key;
}

/** 시트에 적힌 이름(한글이든 영문 키든) → 효과 키. */
/**
 * 이름이 바뀐 칸 — **옛 시트로도 서버가 서게** 해 준다.
 *
 * 칸 이름을 바꾸면 아직 갈아 끼우지 않은 시트가 통째로 막힌다(그 줄에서 오류가 난다).
 * 표 하나가 낡았다고 서버가 멈추면 안 되므로, 옛 이름을 알아보되 **값은 안 가져온다** —
 * 뜻이 달라진 자리라 옛 값을 그대로 넣으면 조용히 엉뚱한 규칙이 된다.
 * (예: 보호막은 0.54 에서 '무적 시간 500ms' → '막는 횟수 1대' 로 뜻이 바뀌었다.
 *  500 을 그대로 넣으면 500 대를 막는다.)
 *
 * 값 → 새 이름으로 갈아 끼운 시트를 올리면 그때부터 정상으로 읽힌다.
 */
const RENAMED_LABELS = {
  '보호막 무적 시간': '보호막 막는 횟수',
  '보호막 지속': '보호막 막는 횟수',
  '위기의 피해 증가': '위기의 치명타 피해',
};

function modKeyOf(cell, labels, at) {
  const s = readText(cell);
  if (!s) return null;
  if (MOD_KEYS.includes(s)) return s;
  for (const [k, v] of Object.entries(labels || {})) if (v === s && MOD_KEYS.includes(k)) return k;
  for (const [k, v] of Object.entries(EXTRA_LABELS)) if (v === s) return k;
  const known = MOD_KEYS.map((k) => labelOf(k, labels)).join(', ');
  throw new Error(`${at}: '${s}' 는 알 수 없는 효과 이름입니다.\n    쓸 수 있는 이름: ${known}`);
}

/** 효과 객체 → [이름1, 값1, 이름2, 값2, …] 칸들. */
function effectToCells(effect, labels, slots) {
  const out = [];
  const entries = Object.entries(effect || {});
  for (let i = 0; i < slots; i++) {
    const e = entries[i];
    out.push(e ? labelOf(e[0], labels) : '', e ? e[1] : '');
  }
  return { cells: out, overflow: Object.fromEntries(entries.slice(slots)) };
}

/** [이름1, 값1, …] 칸들 → 효과 객체. */
/**
 * 효과 칸들 → 효과 객체.
 * @returns {{effect:object, renamed:boolean}} renamed 은 "옛 이름을 만나 건너뛴 칸이 있다".
 */
function cellsToEffect(row, start, slots, labels, at) {
  const out = {};
  const renamedTo = [];
  for (let i = 0; i < slots; i++) {
    // 이름이 바뀐 효과는 알아보되 값은 안 가져온다(RENAMED_LABELS 의 설명 참고).
    // 아직 갈아 끼우지 않은 시트 하나 때문에 서버가 서지 못하면 안 된다.
    const oldName = RENAMED_LABELS[readText(row[start + i * 2])];
    if (oldName) { renamedTo.push(oldName); continue; }
    const key = modKeyOf(row[start + i * 2], labels, at);
    if (!key) continue;
    const val = readNum(row[start + i * 2 + 1]);
    if (val == null) throw new Error(`${at}: '${labelOf(key, labels)}' 의 값이 비었거나 숫자가 아닙니다.`);
    out[key] = val;
  }
  return { effect: out, renamed: renamedTo.length > 0, renamedTo };
}

// ─────────────────────────────────────────────────────────────
// 스킬
// ─────────────────────────────────────────────────────────────
//
// 스킬은 두 파일에 걸쳐 있다.
//   skills.json  스킬이 무엇을 하는가
//   classes.json 어느 직업이 그 스킬을 배울 수 있는가
// 시트의 '직업' 칸이 두 번째를 정한다. 그래서 이 시트는 두 파일을 함께 고친다.

const SKILL_SLOTS = 3;
const SKILL_HEAD = [
  'id', '이름', '아이콘', '직업', '최대',
  '효과1', '값1', '효과2', '값2', '효과3', '값3',
  '설명', '자세한설명', '기타',
];
const SKILL_KNOWN = ['name', 'icon', 'max', 'desc', 'long', 'effect'];

/** 직업 id → 화면에 쓰는 이름, 그리고 그 반대. */
function classMaps(classes) {
  const list = (classes && classes.list) || {};
  const idToName = new Map();
  const nameToId = new Map();
  for (const [cid, d] of Object.entries(list)) {
    const name = (d && d.name) || cid;
    idToName.set(cid, name);
    nameToId.set(name, cid);
    nameToId.set(cid, cid); // 영문 id 로 적어도 받아 준다
  }
  return { idToName, nameToId, order: Object.keys(list) };
}

function skillsToRows(originals) {
  const skills = originals['skills.json'] || {};
  const classes = originals['classes.json'] || {};
  const labels = skills.effectLabels || {};
  const { idToName, order } = classMaps(classes);

  // 스킬 id → 그 스킬을 배울 수 있는 직업 이름들
  const owners = new Map();
  for (const cid of order) {
    for (const sid of (classes.list[cid].skills || [])) {
      if (!owners.has(sid)) owners.set(sid, []);
      owners.get(sid).push(idToName.get(cid));
    }
  }

  const rows = [SKILL_HEAD];
  for (const [id, d] of Object.entries(skills.tree || {})) {
    if (id.startsWith('_') || !d || typeof d !== 'object') continue; // '_용사' 같은 구분선은 건너뛴다
    const { cells, overflow } = effectToCells(d.effect, labels, SKILL_SLOTS);
    const extra = packExtra(d, SKILL_KNOWN);
    const spill = Object.keys(overflow).length ? JSON.stringify({ effect: overflow }) : '';
    rows.push([
      id, d.name || '', d.icon || '', (owners.get(id) || []).join(' | '), d.max ?? 1,
      ...cells,
      escNl(d.desc || ''), escNl(d.long || ''),
      extra || spill,
    ]);
  }
  return rows;
}

function rowsToSkills(rows, originals) {
  const skills = originals['skills.json'] || {};
  const classes = originals['classes.json'] || {};
  const labels = skills.effectLabels || {};
  const { nameToId, order } = classMaps(classes);

  const body = dropHeader(rows, SKILL_HEAD, 'skills');
  const parsed = [];
  const seen = new Set();

  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `skills 시트 ${i + 2}번째 줄`;
    if (id.startsWith('_')) throw new Error(`${at}: 아이디는 _ 로 시작할 수 없습니다.`);
    if (seen.has(id)) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);
    seen.add(id);

    const def = { name: readText(r[1]) };
    if (!def.name) throw new Error(`${at}: 이름이 비어 있습니다.`);
    put(def, 'icon', readText(r[2]));
    const max = readNum(r[4], 1);
    if (max < 1) throw new Error(`${at}: 최대는 1 이상이어야 합니다.`);
    def.max = max;
    put(def, 'desc', unescNl(r[11]));
    put(def, 'long', unescNl(r[12]));
    const eff = cellsToEffect(r, 5, SKILL_SLOTS, labels, at);
    // 이름이 바뀐 칸은 **지금 표에 있는 값**을 그대로 채워 넣는다.
    // 옛 시트 하나 때문에 그 효과가 통째로 사라지면 스킬이 조용히 죽는다.
    const was = (skills.tree || {})[id];
    for (const newLabel of eff.renamedTo) {
      const key = Object.keys(labels).find((k) => labels[k] === newLabel);
      if (key && was && was.effect && was.effect[key] != null) eff.effect[key] = was.effect[key];
    }
    if (Object.keys(eff.effect).length) def.effect = eff.effect;
    else if (eff.renamed && was && was.effect) def.effect = { ...was.effect };
    const extra = unpackExtra(r[13], at);
    if (extra.effect) {
      def.effect = { ...(def.effect || {}), ...extra.effect };
      delete extra.effect;
    }
    Object.assign(def, extra);
    if (!def.effect || !Object.keys(def.effect).length) {
      throw new Error(`${at}: 효과가 하나도 없습니다. 아무 일도 하지 않는 스킬이 됩니다.`);
    }

    const classIds = readText(r[3])
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name) => {
        const cid = nameToId.get(name);
        if (!cid) {
          throw new Error(
            `${at}: '${name}' 은 없는 직업입니다.\n    쓸 수 있는 직업: ${order.map((c) => classes.list[c].name).join(', ')}`
          );
        }
        return cid;
      });

    parsed.push({ id, def: orderLike(def, (skills.tree || {})[id]), classIds });
  });

  // ① skills.json 의 tree — 직업별로 묶고, 원본의 구분선 설명을 그대로 살린다.
  const tree = {};
  const oldTree = skills.tree || {};
  for (const cid of order) {
    const groupKey = `_${classes.list[cid].name}`;
    const members = parsed.filter((p) => p.classIds[0] === cid);
    if (!members.length) continue;
    tree[groupKey] = typeof oldTree[groupKey] === 'string' ? oldTree[groupKey] : '';
    for (const m of members) tree[m.id] = m.def;
  }
  const orphans = parsed.filter((p) => !p.classIds.length);
  if (orphans.length) {
    tree['_직업 없음'] = '직업 칸이 비어 있어 아무도 배울 수 없다.';
    for (const o of orphans) tree[o.id] = o.def;
  }

  // ② classes.json 의 직업별 스킬 목록 — 시트에 적힌 순서 그대로.
  const list = {};
  for (const cid of order) {
    const mine = parsed.filter((p) => p.classIds.includes(cid)).map((p) => p.id);
    list[cid] = { ...classes.list[cid], skills: mine };
  }

  return {
    'skills.json': { ...skills, tree },
    'classes.json': { ...classes, list },
  };
}

// ─────────────────────────────────────────────────────────────
// 특성
// ─────────────────────────────────────────────────────────────

const TRAIT_SLOTS = 3;
const TRAIT_HEAD = [
  'id', '이름', '아이콘', '최대',
  'hp', 'atk', 'def', 'spd', 'crit',
  '효과1', '값1', '효과2', '값2', '효과3', '값3',
  '설명', '자세한설명', '기타',
];
const TRAIT_KNOWN = ['name', 'icon', 'max', 'desc', 'long', 'per', 'mods'];

function traitsToRows(originals) {
  const traits = originals['traits.json'] || {};
  const labels = (originals['skills.json'] || {}).effectLabels || {};
  const rows = [TRAIT_HEAD];
  for (const [id, d] of Object.entries(traits.nodes || {})) {
    if (id.startsWith('_') || !d || typeof d !== 'object') continue;
    const per = d.per || {};
    const { cells, overflow } = effectToCells(d.mods, labels, TRAIT_SLOTS);
    const extra = packExtra(d, TRAIT_KNOWN);
    const spill = Object.keys(overflow).length ? JSON.stringify({ mods: overflow }) : '';
    rows.push([
      id, d.name || '', d.icon || '', d.max ?? 1,
      ...STAT_KEYS.map((k) => per[k] ?? ''),
      ...cells,
      escNl(d.desc || ''), escNl(d.long || ''),
      extra || spill,
    ]);
  }
  return rows;
}

function rowsToTraits(rows, originals) {
  const traits = originals['traits.json'] || {};
  const labels = (originals['skills.json'] || {}).effectLabels || {};
  const body = dropHeader(rows, TRAIT_HEAD, 'traits');
  const nodes = {};

  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `traits 시트 ${i + 2}번째 줄`;
    if (nodes[id]) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);

    const def = { name: readText(r[1]) };
    if (!def.name) throw new Error(`${at}: 이름이 비어 있습니다.`);
    put(def, 'icon', readText(r[2]));
    const max = readNum(r[3], 1);
    if (max < 1) throw new Error(`${at}: 최대는 1 이상이어야 합니다.`);
    put(def, 'desc', unescNl(r[15]));
    put(def, 'long', unescNl(r[16]));
    def.max = max;

    const per = {};
    STAT_KEYS.forEach((k, ki) => put(per, k, readNum(r[4 + ki])));
    const mods = cellsToEffect(r, 9, TRAIT_SLOTS, labels, at).effect;

    const was = (traits.nodes || {})[id];
    if (Object.keys(per).length) def.per = orderLike(per, was && was.per);
    if (Object.keys(mods).length) def.mods = orderLike(mods, was && was.mods);

    const extra = unpackExtra(r[17], at);
    if (extra.mods) {
      def.mods = { ...(def.mods || {}), ...extra.mods };
      delete extra.mods;
    }
    Object.assign(def, extra);

    if (!def.per && !def.mods) {
      throw new Error(`${at}: 올려 주는 값이 하나도 없습니다. 찍어도 아무 일이 없는 특성이 됩니다.`);
    }
    nodes[id] = orderLike(def, was);
  });

  return { 'traits.json': { ...traits, nodes } };
}

// ─────────────────────────────────────────────────────────────
// 스탯 (힘 · 민첩 · 지능)
// ─────────────────────────────────────────────────────────────
//
// 특성과 표 모양이 거의 같지만 '최대' 칸이 없다 — 포인트로 찍는 것이 아니라
// 레벨이 올려 주는 값이라 위가 없기 때문이다.
// 어느 스탯이 잘 자라는지는 classes 시트의 '힘 성장 차례' 쪽에 있다.

const STAT_SLOTS = 3;
const STAT_HEAD = [
  'id', '이름', '아이콘',
  'hp', 'atk', 'def', 'spd', 'crit',
  '효과1', '값1', '효과2', '값2', '효과3', '값3',
  '설명', '자세한설명', '기타',
];
const STAT_KNOWN = ['name', 'icon', 'desc', 'long', 'per', 'mods'];

function statsToRows(originals) {
  const stats = originals['stats.json'] || {};
  const labels = (originals['skills.json'] || {}).effectLabels || {};
  const rows = [STAT_HEAD];
  for (const [id, d] of Object.entries(stats.nodes || {})) {
    if (id.startsWith('_') || !d || typeof d !== 'object') continue;
    const per = d.per || {};
    const { cells, overflow } = effectToCells(d.mods, labels, STAT_SLOTS);
    const extra = packExtra(d, STAT_KNOWN);
    const spill = Object.keys(overflow).length ? JSON.stringify({ mods: overflow }) : '';
    rows.push([
      id, d.name || '', d.icon || '',
      ...STAT_KEYS.map((k) => per[k] ?? ''),
      ...cells,
      escNl(d.desc || ''), escNl(d.long || ''),
      extra || spill,
    ]);
  }
  return rows;
}

function rowsToStats(rows, originals) {
  const stats = originals['stats.json'] || {};
  const labels = (originals['skills.json'] || {}).effectLabels || {};
  const body = dropHeader(rows, STAT_HEAD, 'stats');
  const nodes = {};

  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `stats 시트 ${i + 2}번째 줄`;
    if (nodes[id]) throw new Error(`${at}: 아이디 '${id}' 가 두 번 나옵니다.`);

    const def = { name: readText(r[1]) };
    if (!def.name) throw new Error(`${at}: 이름이 비어 있습니다.`);
    put(def, 'icon', readText(r[2]));
    put(def, 'desc', unescNl(r[14]));
    put(def, 'long', unescNl(r[15]));

    const per = {};
    STAT_KEYS.forEach((k, ki) => put(per, k, readNum(r[3 + ki])));
    const mods = cellsToEffect(r, 8, STAT_SLOTS, labels, at).effect;

    const was = (stats.nodes || {})[id];
    if (Object.keys(per).length) def.per = orderLike(per, was && was.per);
    if (Object.keys(mods).length) def.mods = orderLike(mods, was && was.mods);

    const extra = unpackExtra(r[16], at);
    if (extra.mods) {
      def.mods = { ...(def.mods || {}), ...extra.mods };
      delete extra.mods;
    }
    Object.assign(def, extra);

    if (!def.per && !def.mods) {
      throw new Error(`${at}: 올려 주는 값이 하나도 없습니다. 올라도 아무 일이 없는 스탯이 됩니다.`);
    }
    nodes[id] = orderLike(def, was);
  });

  return { 'stats.json': { ...stats, nodes } };
}

// ─────────────────────────────────────────────────────────────
// 직업 · 패시브
// ─────────────────────────────────────────────────────────────
//
// 여기가 헷갈리기 쉬운 곳이라 먼저 적어 둔다.
//
//   passive.*    화면에 보여 줄 글일 뿐이다. 고쳐도 전투는 그대로다.
//   combat.*     실제로 전투를 바꾸는 숫자다. "패시브를 세게" 하려면 여기를 고친다.
//   combatDesc   캐릭터 창에 나오는 설명 줄. 역시 글일 뿐이다.
//
// 예) 용사의 "무쇠 위장(회복약 2배)" 을 3배로 만들려면
//     combat.potionPower 를 2 → 3 으로 고치고, passive.desc 도 같이 고쳐 준다.
//
// 직업은 셋뿐이라 칸을 옆으로 늘리면 서른 칸이 넘는다. 그래서 세로로 눕힌다 —
// 한 줄이 "어느 직업의 · 무슨 항목이 · 얼마" 하나다. 줄마다 설명이 붙어 있어
// 무엇을 고치는지 보면서 고칠 수 있다.

const CLASS_HEAD = ['직업', '항목', '값', '설명'];

/** [경로, 한글 항목명, 종류, 설명] — 이 순서대로 시트에 나온다. */
const CLASS_FIELDS = [
  ['name', '이름', 'text', '화면에 나오는 직업 이름'],
  ['tagline', '한줄소개', 'text', '접속 화면 직업 카드의 한 줄'],
  ['available', '선택가능', 'bool', '아니오면 접속 화면에 "준비 중"으로 회색 표시'],

  ['baseStats.hp', '기본 HP', 'num', '1레벨 체력'],
  ['baseStats.atk', '기본 공격력', 'num', ''],
  ['baseStats.def', '기본 방어력', 'num', ''],
  ['baseStats.spd', '기본 속도', 'num', '높으면 먼저 때린다'],
  ['baseStats.crit', '기본 치명타', 'num', '0.06 = 6%'],

  ['growth.hp', '성장 HP', 'num', '레벨 1당 오르는 양'],
  ['growth.atk', '성장 공격력', 'num', ''],
  ['growth.def', '성장 방어력', 'num', ''],
  ['growth.spd', '성장 속도', 'num', ''],
  ['growth.crit', '성장 치명타', 'num', ''],

  ['passive.name', '패시브 이름', 'text', '★ 글자일 뿐이다 — 전투는 안 바뀐다'],
  ['passive.desc', '패시브 설명', 'text', '★ 직업 카드의 한 줄 요약'],
  ['passive.detail', '패시브 자세히', 'text', '★ 캐릭터 창에 나오는 긴 설명'],

  ['combat.counter', '반격 확률', 'num', '맞았을 때 되받아칠 확률. 0.35 = 35%'],
  ['combat.counterPower', '반격 위력', 'num', '반격 피해 배율. 0.55 = 평소의 55%'],
  ['combat.lastStand', '치명상 버티기', 'num', '쓰러질 피해를 HP 1 로 버틸 확률. 전투당 1회'],
  ['combat.potionPower', '물약 배율', 'num', '물약 회복량 배율. 2 = 두 배'],
  ['combat.opener', '선제 공격 횟수', 'num', '전투 시작하자마자 공짜로 때리는 횟수'],
  ['combat.openerPower', '선제 공격 위력', 'num', '그 공격의 피해 배율'],
  ['combat.evade', '회피 확률', 'num', '0.18 = 18%'],
  ['combat.evadeAfterHit', '맞은 뒤 확정 회피', 'num', '1 이면 켬. 비우면 끔'],
  ['combat.cleave', '광역 여파', 'num', '주 대상에게 준 피해의 몇 %가 나머지 전부에게. 0.45 = 45%'],
  ['combat.chargeEvery', '충전 주기', 'num', '몇 번째 공격마다 대폭발이 터지나'],
  ['combat.chargePower', '충전 위력', 'num', '그 폭발의 피해 배율. 2.1 = 2.1배'],
  ['combat.shieldOnFatal', '보호막', 'num', '1 이면 켬 — 쓰러질 피해를 막고 HP 1 로 버틴다'],
  ['combat.shieldTurns', '보호막 막는 횟수', 'num', '몇 대를 막아 내나. 0.54 이전에는 밀리초였다'],
  ['combat.pull', '끌어오기 범위', 'num', '필드에서 몇 칸 안의 몬스터까지 함께 끌고 들어오나. 0 = 한 마리'],
  ['combat.maxPull', '한 전투 최대 마리', 'num', '끌고 올 수 있는 최대 수'],
  ['combat.school', '공격 속성', 'text', 'magic 이면 마법 공격으로 친다. 비우면 물리'],
  ['combat.magicConvert', '마법 전환 배율', 'num', '주는 피해를 전부 마법으로 바꾸면서 곱하는 값. 1.1 = 10% 더. 비우면 1(그대로)'],
  ['combat.goldFind', '골드 획득', 'num', '사냥꾼 패시브. 0.3 = +30% (상점 판매에도)'],
  ['combat.goldFindPerAgi', '골드 획득/민첩', 'num', '민첩 1점마다 더 오르는 몫. 0.01 = 1%p'],
  ['combat.materialDouble', '재료 두 배 확률', 'num', '용사 패시브. 0.2 = 20%'],
  ['combat.materialDoublePerStr', '재료 두 배/힘', 'num', '힘 1점마다 더 오르는 몫. 0.005 = 0.5%p'],
  ['combat.engraveBonus', '각인 확률 추가', 'num', '마법사 패시브. 0.1 이면 10% → 20%'],
  ['combat.engravePerInt', '각인 확률/지능', 'num', '지능 1점마다 더 오르는 몫. 0.002 = 0.2%p'],
  ['combat.evadePerAgi', '회피 확률/민첩', 'num', '사냥꾼 패시브. 민첩 1점마다 더 오르는 몫. 0.003 = 0.3%p'],
  ['combat.absorbPerInt', '마력 흡수/지능', 'num', '마법사 패시브. 맞은 만큼 그대로 되돌려 받을 확률. 지능 1점당 0.003 = 0.3%p'],
  ['combat.duelReduction', '1:1 피해 감소', 'num', '마법사 패시브. 상대가 한 마리뿐인 전투에서만 받는 피해를 깎는다. 0.5 = 절반'],

  // 레벨업마다 힘·민첩·지능이 얼마나 자라나 — "몇 레벨에 한 점"인가.
  // 1 이면 매 레벨, 2 면 두 레벨에 한 번. (오를 때 20% 확률로 두 점이 오른다)
  // 0.42 — 숫자의 뜻이 바뀌었다. '몇 레벨마다' 가 아니라 **몇 등으로 잘 자라나** 다.
  // 1등이 3, 2등이 2, 3등이 1 의 몫을 가져간다(정확히 3:2:1).
  ['statGrowth.strength', '힘 성장 차례', 'num', '1=가장 잘 자람 · 2=다음 · 3=가장 덜 (몫 3:2:1)'],
  ['statGrowth.agility', '민첩 성장 차례', 'num', '1=가장 잘 자람 · 2=다음 · 3=가장 덜'],
  ['statGrowth.intellect', '지능 성장 차례', 'num', '1=가장 잘 자람 · 2=다음 · 3=가장 덜'],

  ['combatDesc.0', '전투설명 1', 'text', '★ 캐릭터 창에 나오는 줄'],
  ['combatDesc.1', '전투설명 2', 'text', '★'],
  ['combatDesc.2', '전투설명 3', 'text', '★'],
];

function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, p, v) {
  const ks = p.split('.');
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = /^\d+$/.test(ks[i + 1]) ? [] : {};
    cur = cur[k];
  }
  cur[ks[ks.length - 1]] = v;
}

function delPath(obj, p) {
  const ks = p.split('.');
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return;
    cur = cur[ks[i]];
  }
  if (cur && typeof cur === 'object') delete cur[ks[ks.length - 1]];
}

function classesToRows(originals) {
  const classes = originals['classes.json'] || {};
  const rows = [CLASS_HEAD];
  for (const [cid, def] of Object.entries(classes.list || {})) {
    for (const [p, label, type, desc] of CLASS_FIELDS) {
      const v = getPath(def, p);
      let cell = '';
      if (v !== undefined && v !== null) cell = type === 'bool' ? writeBool(v) : type === 'text' ? escNl(v) : v;
      rows.push([cid, label, cell, desc]);
    }
  }
  return rows;
}

function rowsToClasses(rows, originals) {
  const classes = originals['classes.json'] || {};
  const body = dropHeader(rows, CLASS_HEAD, 'classes');
  const byLabel = new Map(CLASS_FIELDS.map((f) => [f[1], f]));
  const byPath = new Map(CLASS_FIELDS.map((f) => [f[0], f]));

  // 원본을 그대로 복사해 두고 시트에 적힌 칸만 덮어쓴다.
  // (시트에 없는 항목 — 시작 아이템·스킬 목록·그림 — 은 손대지 않는다)
  const list = JSON.parse(JSON.stringify(classes.list || {}));
  const touchedDesc = new Set();

  body.forEach((r, i) => {
    const cid = readText(r[0]);
    const label = readText(r[1]);
    if (!cid && !label) return;
    const at = `classes 시트 ${i + 2}번째 줄`;
    if (!list[cid]) {
      throw new Error(
        `${at}: '${cid}' 는 없는 직업입니다.\n    쓸 수 있는 직업: ${Object.keys(list).join(', ')}\n    (새 직업은 그림도 필요해서 시트로는 만들 수 없습니다)`
      );
    }
    // 이름이 바뀐 칸은 알아보되 값은 건너뛴다(뜻이 달라진 자리다).
    if (RENAMED_LABELS[label]) return;
    const field = byLabel.get(label) || byPath.get(label);
    if (!field) {
      throw new Error(`${at}: '${label}' 은 여기서 고칠 수 있는 항목이 아닙니다.`
        + `\n    (칸 이름이 바뀌었을 수 있습니다 — \`npm run sheets\` 로 구운 새 표를 올려 보세요)`);
    }
    const [p, , type] = field;
    const raw = readText(r[2]);

    if (p.startsWith('combatDesc.')) touchedDesc.add(cid);

    if (raw === '') {
      // 빈 칸 = 그 항목을 끈다. 단, 이름처럼 없으면 안 되는 것은 막는다.
      if (p === 'name') throw new Error(`${at}: 이름은 비울 수 없습니다.`);
      delPath(list[cid], p);
      return;
    }
    if (type === 'bool') setPath(list[cid], p, readBool(raw, true));
    else if (type === 'text') setPath(list[cid], p, unescNl(raw));
    else {
      const n = readNum(raw);
      if (n == null) throw new Error(`${at}: '${label}' 의 값이 숫자가 아닙니다 — '${raw}'`);
      setPath(list[cid], p, n);
    }
  });

  // 전투설명은 가운데를 비워도 구멍이 남지 않게 다시 정리한다.
  for (const cid of touchedDesc) {
    const arr = (list[cid].combatDesc || []).filter((s) => s != null && s !== '');
    if (arr.length) list[cid].combatDesc = arr;
    else delete list[cid].combatDesc;
  }

  return { 'classes.json': { ...classes, list } };
}

// ─────────────────────────────────────────────────────────────
// 설정 (포인트를 언제 얼마나 주나)
// ─────────────────────────────────────────────────────────────

const CONFIG_HEAD = ['표', '항목', '값', '설명'];
const CONFIG_ROWS = [
  ['traits.json', 'everyLevels', '몇 레벨마다 특성 포인트를 주나'],
  ['traits.json', 'pointsPerGrant', '그때 한 번에 주는 특성 포인트'],
  ['skills.json', 'everyLevels', '몇 레벨마다 스킬 포인트를 주나'],
  ['skills.json', 'pointsPerGrant', '그때 한 번에 주는 스킬 포인트'],
];

function configToRows(originals) {
  const rows = [CONFIG_HEAD];
  for (const [file, key, desc] of CONFIG_ROWS) {
    const json = originals[file] || {};
    rows.push([file, key, json[key] ?? '', desc]);
  }
  return rows;
}

function rowsToConfig(rows, originals) {
  const body = dropHeader(rows, CONFIG_HEAD, 'config');
  const out = {};
  const allowed = new Map(CONFIG_ROWS.map(([f, k]) => [`${f}/${k}`, true]));

  body.forEach((r, i) => {
    const file = readText(r[0]);
    const key = readText(r[1]);
    if (!file && !key) return;
    const at = `config 시트 ${i + 2}번째 줄`;
    if (!allowed.has(`${file}/${key}`)) {
      throw new Error(`${at}: '${file} / ${key}' 는 여기서 고칠 수 있는 항목이 아닙니다.`);
    }
    const val = readNum(r[2]);
    if (val == null || val < 1) throw new Error(`${at}: 값은 1 이상의 숫자여야 합니다.`);
    if (!out[file]) out[file] = { ...(originals[file] || {}) };
    out[file][key] = val;
  });

  return out;
}

// ─────────────────────────────────────────────────────────────
// 스킬 · 특성 파일 서식기
// ─────────────────────────────────────────────────────────────

/** { "atk": 3, "def": 2 } 처럼 한 줄로 눕히는 작은 객체. */
function inlineObj(v) {
  return `{ ${Object.entries(v).map(([k, x]) => `${q(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
}

/** 항목 하나를 블록으로 쓴다. per·mods·effect 는 한 줄로 눕힌다. */
function writeEntry(lines, key, def, indent, comma) {
  const INLINE = ['per', 'mods', 'effect'];
  lines.push(`${indent}${q(key)}: {`);
  const ks = Object.keys(def);
  ks.forEach((k, i) => {
    const c = i < ks.length - 1 ? ',' : '';
    const v = def[k];
    const flat = INLINE.includes(k) && v && typeof v === 'object' && !Array.isArray(v);
    lines.push(`${indent}  ${q(k)}: ${flat ? inlineObj(v) : JSON.stringify(v)}${c}`);
  });
  lines.push(`${indent}}${comma}`);
}

function formatTraits(original, nodes, next) {
  return formatWithTable(original, 'nodes', (lines, comma) => {
    lines.push('  "nodes": {');
    const ks = Object.keys(nodes);
    ks.forEach((k, i) => writeEntry(lines, k, nodes[k], '    ', i < ks.length - 1 ? ',' : ''));
    lines.push(`  }${comma}`);
  }, next);
}

function formatSkills(original, tree, next) {
  return formatWithTable(original, 'tree', (lines, comma) => {
    lines.push('  "tree": {');
    const ks = Object.keys(tree);
    ks.forEach((k, i) => {
      const c = i < ks.length - 1 ? ',' : '';
      const v = tree[k];
      if (typeof v === 'string') {
        // 직업 구분선. 앞뒤로 한 줄 비워 두면 어디까지가 한 묶음인지 눈에 들어온다.
        if (i > 0) lines.push('');
        lines.push(`    ${q(k)}: ${JSON.stringify(v)}${c}`);
        lines.push('');
      } else {
        writeEntry(lines, k, v, '    ', c);
      }
    });
    lines.push(`  }${comma}`);
  }, next);
}

// ─────────────────────────────────────────────────────────────
// 각인 시트 — affixes.json 의 '각인' 표
// ─────────────────────────────────────────────────────────────

const ENGRAVE_HEAD = ['등급', '이름', '최소', '최대', '붙을 확률 %', '초월 확률 %'];

// 등급의 차례는 표에 적힌 대로 쓴다(common → legendary). 시트에서 줄을 옮겨도
// 여기 차례가 바뀌지는 않는다 — 등급은 아이템이 정하는 것이지 줄 순서가 아니다.
const ENGRAVE_RARITY = {
  common: '일반', uncommon: '고급', rare: '희귀', epic: '영웅', legendary: '전설',
};

/**
 * 한 등급 줄을 읽는다. 표에는 네 숫자가 있다:
 *   최소·최대   그 등급 각인이 굴러가는 범위(사람이 읽는 숫자 — 3~5 = 3~5% 또는 3~5점)
 *   붙을 확률   이 등급 장비에 각인이 붙을 확률(%)
 *   초월 확률   붙은 각인이 '초월' 이 될 확률(%)
 * 뒤 둘을 비워 두면 각인 표의 기본값(확률 · 초월확률)을 쓴다.
 */
function engraveToRows(all) {
  const t = (all['affixes.json'] || {})['각인'] || {};
  const bands = t['등급'] || {};
  const rows = [ENGRAVE_HEAD];
  for (const [id, label] of Object.entries(ENGRAVE_RARITY)) {
    const b = bands[id] || [];
    rows.push([
      id,
      label,
      b[0] ?? '',
      b[1] ?? '',
      b[2] == null ? pct(t['확률']) : pct(b[2]),
      b[3] == null ? pct(t['초월확률']) : pct(b[3]),
    ]);
  }
  return rows;
}

/** 0.1 → 10 (사람이 읽는 퍼센트). 시트에 0.1 이라고 적혀 있으면 0.1% 라는 뜻이 된다. */
const pct = (v) => (v == null ? '' : +(Number(v) * 100).toFixed(4));

function rowsToEngrave(rows, originals) {
  const body = dropHeader(rows, ENGRAVE_HEAD, 'engrave');
  const src = originals['affixes.json'] || {};
  const table = { ...(src['각인'] || {}) };
  const bands = {};

  body.forEach((r, i) => {
    const id = readText(r[0]);
    if (!id) return;
    const at = `engrave 시트 ${i + 2}번째 줄`;
    if (!ENGRAVE_RARITY[id]) {
      throw new Error(`${at}: '${id}' 는 모르는 등급입니다. ${Object.keys(ENGRAVE_RARITY).join(' · ')} 중 하나여야 합니다.`);
    }
    const lo = readNum(r[2]);
    const hi = readNum(r[3]);
    if (lo == null || hi == null) throw new Error(`${at}: 최소·최대를 둘 다 적어 주세요.`);
    if (lo <= 0 || hi <= 0) throw new Error(`${at}: 각인 수치는 0보다 커야 합니다.`);
    if (hi < lo) throw new Error(`${at}: 최대(${hi})가 최소(${lo})보다 작습니다.`);

    const chance = readNum(r[4]);
    const perfect = readNum(r[5]);
    for (const [label, v] of [['붙을 확률', chance], ['초월 확률', perfect]]) {
      if (v == null) continue;
      if (v < 0 || v > 100) throw new Error(`${at}: ${label}은 0~100 사이의 퍼센트여야 합니다. 지금: ${v}`);
    }
    // 확률을 비워 두면 표의 기본값을 쓴다 — 그래야 다섯 줄에 같은 값을 다섯 번 안 적는다.
    const band = [lo, hi];
    if (chance != null) band.push(+(chance / 100).toFixed(6));
    if (chance != null && perfect != null) band.push(+(perfect / 100).toFixed(6));
    bands[id] = band;
  });

  const missing = Object.keys(ENGRAVE_RARITY).filter((k) => !bands[k]);
  if (missing.length) throw new Error(`engrave 시트에 ${missing.join(' · ')} 줄이 없습니다. 등급 다섯 줄이 다 있어야 합니다.`);

  table['등급'] = bands;
  return { 'affixes.json': { ...src, ['각인']: table } };
}

// ─────────────────────────────────────────────────────────────
// affixes.json 서식기
//
// 이 파일은 사람이 손으로 칸을 맞춰 둔 표다. JSON.stringify 로 다시 쓰면
// 줄마다 숫자 하나씩 늘어서서 표가 아니게 된다(드랍표·퀘스트와 같은 이유).
// 그래서 여기서 다시 찍는다 — 짧은 것은 한 줄로, 줄지어 있는 것은 칸을 맞춰서.
// ─────────────────────────────────────────────────────────────

/** 한글은 두 칸을 먹는다. 칸 맞추기는 글자 수가 아니라 **보이는 너비**로 해야 맞는다. */
function visualWidth(s) {
  let w = 0;
  for (const ch of String(s)) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
  return w;
}

/**
 * 적힌 차례를 그대로 쓰되, **숫자꼴 열쇠만 뒤로 돌린다.**
 *
 * JSON.parse 는 "10" 같은 숫자꼴 열쇠를 무조건 앞으로 당긴다(자바스크립트 규칙).
 * 그대로 찍으면 '홈' 표에서 설명(_읽는법)이 값 뒤로 밀려 읽는 순서가 뒤집힌다.
 * 되돌리는 데 필요한 건 이것뿐이다 — 나머지는 사람이 적어 둔 차례가 맞다.
 */
function orderedKeys(obj) {
  const ks = Object.keys(obj);
  const numeric = (k) => /^\d+$/.test(k);
  return [...ks.filter((k) => !numeric(k)), ...ks.filter(numeric)];
}

const isPrimitive = (v) => v === null || typeof v !== 'object';
const allPrimitive = (a) => Array.isArray(a) && a.every(isPrimitive);

/** 한 줄로 눕힌 모습. 안에 또 묶음이 있거나 너무 길면 null(=여러 줄로 써야 한다). */
function flat(v, limit = 88) {
  if (isPrimitive(v)) return JSON.stringify(v);
  const inner = Array.isArray(v) ? v : Object.values(v);
  if (!inner.every(isPrimitive)) return null;
  const s = Array.isArray(v)
    ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]`
    : `{ ${Object.entries(v).map(([k, x]) => `${q(k)}: ${JSON.stringify(x)}`).join(', ')} }`;
  return visualWidth(s) <= limit ? s : null;
}

/** 줄지어 선 같은 모양의 배열들(보석표·옵션표)은 칸을 맞춰 적는다. */
function alignedRows(arr, indent) {
  if (!Array.isArray(arr) || arr.length < 2 || !arr.every(allPrimitive)) return null;
  const width = arr[0].length;
  if (!arr.every((r) => r.length === width)) return null;
  const cells = arr.map((r) => r.map((v) => JSON.stringify(v)));
  const pad = [];
  for (let c = 0; c < width; c++) pad[c] = Math.max(...cells.map((r) => visualWidth(r[c])));
  return cells.map((r, i) => {
    const line = r
      .map((s, c) => (c === width - 1 ? s : `${s},${' '.repeat(Math.max(1, pad[c] - visualWidth(s) + 1))}`))
      .join('');
    return `${indent}[${line}]${i < arr.length - 1 ? ',' : ''}`;
  });
}

function writeValue(lines, value, indent, tail) {
  const one = flat(value);
  if (one !== null) {
    lines.push(`${indent}${one}${tail}`);
    return;
  }
  if (Array.isArray(value)) {
    const rows = alignedRows(value, indent + '  ');
    lines.push(`${indent}[`);
    if (rows) lines.push(...rows);
    else {
      value.forEach((v, i) => writeValue(lines, v, indent + '  ', i < value.length - 1 ? ',' : ''));
    }
    lines.push(`${indent}]${tail}`);
    return;
  }
  const keys = orderedKeys(value);
  lines.push(`${indent}{`);
  keys.forEach((k, i) => {
    const c = i < keys.length - 1 ? ',' : '';
    const v = value[k];
    const one2 = flat(v);
    if (one2 !== null) {
      lines.push(`${indent}  ${q(k)}: ${one2}${c}`);
      return;
    }
    lines.push(`${indent}  ${q(k)}:`);
    // 값을 제목 아래 줄에 쓰지 않고 붙여 쓰기 위해 마지막 줄을 이어 붙인다.
    const sub = [];
    writeValue(sub, v, `${indent}  `, c);
    lines[lines.length - 1] += ` ${sub[0].trim()}`;
    lines.push(...sub.slice(1));
  });
  lines.push(`${indent}}${tail}`);
}

/** affixes.json 전체를 사람이 읽는 모양으로 찍는다. */
function formatAffixes(json) {
  const keys = orderedKeys(json);
  const lines = ['{'];
  keys.forEach((k, i) => {
    const c = i < keys.length - 1 ? ',' : '';
    const one = flat(json[k]);
    if (one !== null) lines.push(`  ${q(k)}: ${one}${c}`);
    else {
      const sub = [];
      writeValue(sub, json[k], '  ', c);
      lines.push(`  ${q(k)}: ${sub[0].trim()}`);
      lines.push(...sub.slice(1));
    }
    if (i < keys.length - 1) lines.push(''); // 묶음 사이는 한 줄 비운다
  });
  lines.push('}');
  return lines.join('\n') + '\n';
}

// ─────────────────────────────────────────────────────────────
// 시트 목록
// ─────────────────────────────────────────────────────────────

function dropHeader(rows, head, name) {
  if (!rows.length) throw new Error(`${name} 시트가 비어 있습니다.`);
  const first = rows[0].map((v) => readText(v));
  const looksLikeHeader = first[0] === head[0] || first[0] === 'id';
  if (!looksLikeHeader) {
    // 첫 칸에 제목과 **아랫줄이 이어 붙어** 오면(예: '직업 warrior warrior warrior')
    // 시트가 틀린 것이 아니라 구글이 제목 줄을 여러 줄로 짐작한 것이다.
    // 그냥 "제목 줄이 아닙니다" 로 끝내면 사람이 시트를 붙들고 헤매게 되므로
    // 무엇이 일어난 것인지 짚어 준다(0.50).
    const glued = first[0].startsWith(`${head[0]} `);
    throw new Error(
      `${name} 시트의 첫 줄이 제목 줄이 아닙니다. 첫 칸은 '${head[0]}' 이어야 합니다. `
      + `지금: '${first[0]}'`
      + (glued
        ? ` — 제목과 아랫줄이 붙어 왔습니다. 구글이 제목 줄을 여러 줄로 잘못 읽은 것입니다.`
          + ` 서버를 0.50 이상으로 올리면(주소에 headers=1 을 붙입니다) 사라집니다.`
        : '')
    );
  }

  // 칸은 **자리로** 읽는다. 그래서 제목 줄이 우리가 아는 차례와 어긋나면
  // 값이 한 칸씩 밀려 들어간다 — 그림 이름 자리에 '기타' 의 JSON 이 들어가는 식이다.
  // 조용히 어긋나면 무엇이 잘못됐는지 아무도 못 찾으므로, 여기서 멈추고 어디가
  // 다른지 짚어 준다. (칸이 뒤에 더 붙어 있는 것은 괜찮다 — 앞자리가 그대로면 된다.)
  for (let i = 0; i < head.length; i++) {
    if (first[i] === head[i]) continue;
    throw new Error(
      `${name} 시트의 ${i + 1}번째 칸 제목이 다릅니다. ` +
        `'${head[i]}' 이어야 하는데 '${first[i] || '(빈 칸)'}' 입니다. ` +
        `표를 새로 뽑아(npm run sheets) 올려 주세요. 지금 차례: ${head.join(' · ')}`
    );
  }
  return rows.slice(1);
}

/**
 * 시트 하나하나의 정의.
 *
 *   files   이 시트가 바꾸는 JSON 파일들(첫 번째가 주 파일)
 *   toRows  (원본 파일 전부) → 행 배열
 *   apply   (행 배열, 원본 파일 전부) → { 파일이름: 새 JSON }
 *   format  (파일이름, 새 JSON, 원본 JSON) → 파일에 쓸 글. 없으면 보통 JSON 서식
 *
 * toRows·apply 가 파일 전부를 받는 이유: 스킬 시트의 '직업' 칸처럼
 * 한 시트가 두 파일에 걸쳐 있는 경우가 있기 때문이다.
 */
const SHEETS = {
  items: {
    files: ['items.json'],
    label: '아이템',
    toRows: (all) => itemsToRows(all['items.json']),
    apply: (rows, all) => ({ 'items.json': rowsToItems(rows, all['items.json']) }),
  },
  monsters: {
    files: ['monsters.json'],
    label: '몬스터',
    toRows: (all) => monstersToRows(all['monsters.json']),
    apply: (rows, all) => ({ 'monsters.json': rowsToMonsters(rows, all['monsters.json']) }),
  },
  drops: {
    files: ['drops.json'],
    label: '드랍표',
    toRows: (all) => dropsToRows(all['drops.json']),
    apply: (rows, all) => ({ 'drops.json': { ...all['drops.json'], ['표']: rowsToDrops(rows) } }),
    format: (file, json, original) => formatDrops(original, json['표'], json),
  },
  quests: {
    files: ['quests.json'],
    label: '퀘스트',
    toRows: (all) => questsToRows(all['quests.json']),
    apply: (rows, all) => ({ 'quests.json': { ...all['quests.json'], ['표']: rowsToQuests(rows) } }),
    format: (file, json, original) => formatQuests(original, json['표'], json),
  },
  skills: {
    files: ['skills.json', 'classes.json'],
    label: '스킬',
    toRows: (all) => skillsToRows(all),
    apply: (rows, all) => rowsToSkills(rows, all),
    format: (file, json, original) =>
      file === 'skills.json' ? formatSkills(original, json.tree, json) : null,
  },
  // skills 시트가 classes.json 의 스킬 목록을 먼저 정리한 뒤에 온다.
  // 둘은 서로 다른 칸을 건드리므로 겹치지 않는다.
  classes: {
    files: ['classes.json'],
    label: '직업 · 패시브',
    toRows: (all) => classesToRows(all),
    apply: (rows, all) => rowsToClasses(rows, all),
  },
  traits: {
    files: ['traits.json'],
    label: '특성',
    toRows: (all) => traitsToRows(all),
    apply: (rows, all) => rowsToTraits(rows, all),
    format: (file, json, original) => formatTraits(original, json.nodes, json),
  },
  stats: {
    files: ['stats.json'],
    label: '스탯(힘·민첩·지능)',
    toRows: (all) => statsToRows(all),
    apply: (rows, all) => rowsToStats(rows, all),
    format: (file, json, original) => formatTraits(original, json.nodes, json),
  },
  engrave: {
    files: ['affixes.json'],
    label: '각인',
    toRows: (all) => engraveToRows(all),
    apply: (rows, all) => rowsToEngrave(rows, all),
    format: (file, json) => formatAffixes(json),
  },
  config: {
    files: ['traits.json', 'skills.json'],
    label: '포인트 설정',
    toRows: (all) => configToRows(all),
    apply: (rows, all) => rowsToConfig(rows, all),
    format: (file, json, original) =>
      file === 'skills.json' ? formatSkills(original, json.tree, json) : formatTraits(original, json.nodes, json),
  },
};

/** 시트 정의대로 JSON 을 파일에 쓸 글로 바꾼다. */
function stringify(name, file, json, original) {
  const def = SHEETS[name];
  const custom = def && def.format && def.format(file, json, original);
  return custom || JSON.stringify(json, null, 2) + '\n';
}

module.exports = {
  SHEETS,
  MOD_KEYS,
  STAT_KEYS,
  EXTRA_LABELS,
  labelOf,
  parseCsv,
  toCsv,
  stringify,
  formatDrops,
  formatQuests,
  formatSkills,
  formatTraits,
  formatAffixes,
};
