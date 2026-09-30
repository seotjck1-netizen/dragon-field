#!/usr/bin/env node
/**
 * 표를 스프레드시트(엑셀 · 구글 시트)에서 고치기 위한 도구.
 *
 *   node tools/sheets.js export            표 → sheets/*.csv 로 꺼낸다
 *   node tools/sheets.js check             sheets/*.csv 가 말이 되는지 검사만
 *   node tools/sheets.js import            sheets/*.csv → src/data/*.json 으로 되돌린다
 *   node tools/sheets.js apply "메모"       import + 서버 배포까지 한 번에
 *
 *   node tools/sheets.js pull <구글시트주소>          구글 시트에서 바로 받아 sheets/ 에 넣는다
 *   node tools/sheets.js pull                       지난번 그 문서에서 다시 받는다
 *   node tools/sheets.js pull <주소> --apply "메모"   받아서 검사·반영·배포까지
 *
 * 주소는 한 번만 적으면 sheets/SOURCE.txt 에 남는다. 문서 **이름**이 아니라
 * **아이디**로 찾으므로, 시트 이름에 붙은 판 번호가 바뀌어도 그대로 읽힌다.
 * (다음 판도 같은 문서에 덮어써 주세요. 새 문서를 만들면 아이디가 바뀝니다.)
 *
 * 폴더를 바꾸고 싶으면 뒤에 붙인다:  node tools/sheets.js export 내표
 *
 * 다루는 표는 넷이다 — 아이템 · 몬스터 · 드랍표 · 퀘스트.
 * 스킬·직업·맵처럼 표로 펴기 어려운 것은 여기서 다루지 않는다(JSON 을 직접 고친다).
 */
const fs = require('fs');
const path = require('path');
const sheets = require('../server/sheets.js');
const content = require('../server/content.js');
const sheetsync = require('../server/sheetsync.js');

const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const DEFAULT_DIR = path.join(ROOT, 'sheets');

const [, , cmd = 'help', ...rest] = process.argv;

// ─────────────────────────────────────────────────────────────

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

/**
 * 통합문서를 통째로 받는다 (0.52).
 *
 * 예전에는 탭마다 `gviz/tq?tqx=out:csv` 로 하나씩 받았는데, 구글의 그 통로는
 * **열마다 자료형을 짐작하고 안 맞는 칸을 지워서** 준다. `classes` 탭의 '값' 열은
 * 글자와 숫자가 섞여 있어 `용사` 가 통째로 빈칸이 되어 왔다.
 * `export?format=xlsx` 는 짐작하지 않는다 — 칸에 적힌 것이 그대로 온다.
 * 서버(server/sheetsync.js)와 같은 길을 쓴다.
 */
async function fetchBook(idOrUrl) {
  return sheetsync.fetchWorkbook(idOrUrl);
}

// ─────────────────────────────────────────────────────────────

/** src/data 의 표를 전부 읽는다(시트 하나가 여러 파일에 걸쳐 있을 수 있으므로). */
function readAllSource() {
  const all = {};
  for (const name of content.CONTENT_FILES) {
    const file = path.join(SRC_DATA, name);
    if (fs.existsSync(file)) all[name] = readJson(file);
  }
  return all;
}

function exportSheets(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const all = readAllSource();
  for (const [name, def] of Object.entries(sheets.SHEETS)) {
    const csv = sheets.toCsv(def.toRows(all));
    const out = path.join(dir, `${name}.csv`);
    fs.writeFileSync(out, csv);
    console.log(`  · ${name}.csv  (${def.label}, ${sheets.parseCsv(csv).length - 1}줄)`);
  }
  console.log(`\n✓ ${path.relative(ROOT, dir)}/ 에 꺼냈습니다.`);
  console.log('  엑셀이나 구글 시트로 열어 고친 뒤 `node tools/sheets.js import` 하세요.');
}

/**
 * CSV 를 읽어 새 JSON 을 만든다. 파일에 쓰지는 않는다.
 * @returns {{files:object, texts:object}} files=검사용 JSON 전체, texts=쓸 글
 */
function build(dir) {
  // 검사는 표 전체가 서로 맞는지 보는 것이므로, 안 고친 표까지 다 읽어 둔다.
  const originals = readAllSource();
  const files = { ...originals };
  const texts = {};

  for (const [name, def] of Object.entries(sheets.SHEETS)) {
    const csvFile = path.join(dir, `${name}.csv`);
    if (!fs.existsSync(csvFile)) {
      console.log(`  · ${name}.csv 가 없어 건너뜁니다.`);
      continue;
    }
    const rows = sheets.parseCsv(fs.readFileSync(csvFile, 'utf8'));
    // 앞선 시트가 이미 고쳐 놓은 것 위에 얹는다(config 가 skills 를 이어서 손보는 식).
    const produced = def.apply(rows, files);
    for (const [file, json] of Object.entries(produced)) {
      files[file] = json;
      texts[file] = sheets.stringify(name, file, json, originals[file]);
    }
  }

  return { files, texts };
}

function check(dir) {
  const { files } = build(dir);
  const r = content.validate(files);
  if (r.ok) {
    console.log('✓ 표에 문제가 없습니다.');
    for (const w of r.warnings) console.log('  ·', w);
    return true;
  }
  console.log('⚠ 문제를 찾았습니다. 고치기 전에는 반영하지 않습니다:');
  for (const e of r.errors) console.log('  ✗', e);
  for (const w of r.warnings) console.log('  ·', w);
  return false;
}

function importSheets(dir) {
  const { files, texts } = build(dir);
  const r = content.validate(files);
  if (!r.ok) {
    console.log('⚠ 검사에 걸려 아무것도 바꾸지 않았습니다:');
    for (const e of r.errors) console.log('  ✗', e);
    process.exitCode = 1;
    return false;
  }
  for (const w of r.warnings) console.log('  ·', w);

  let changed = 0;
  for (const [file, text] of Object.entries(texts)) {
    const dest = path.join(SRC_DATA, file);
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (before === text) continue;
    fs.writeFileSync(dest, text);
    console.log(`  · ${file} 바뀜`);
    changed++;
  }
  console.log(changed ? `\n✓ ${changed}개 표를 반영했습니다.` : '\n바뀐 것이 없습니다.');
  return true;
}

// 문서 **아이디**를 적어 둔다. 파일 이름은 판마다 바뀌지만(…-0.42.0) 아이디는 안 바뀐다.
// 그래서 한 번 적어 두면 다음부터는 `node tools/sheets.js pull` 만으로 끝난다.
const SOURCE_FILE = path.join(ROOT, 'sheets', 'SOURCE.txt');

function rememberSource(target) {
  fs.mkdirSync(path.dirname(SOURCE_FILE), { recursive: true });
  fs.writeFileSync(SOURCE_FILE, `${String(target).trim()}\n`);
}

function recallSource() {
  if (!fs.existsSync(SOURCE_FILE)) return null;
  const line = fs
    .readFileSync(SOURCE_FILE, 'utf8')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && !s.startsWith('#'));
  return line || null;
}

async function pull(target, dir) {
  if (!target) target = recallSource();
  if (!target) {
    throw new Error(
      '구글 시트 주소를 적어 주세요. 한 번 적으면 sheets/SOURCE.txt 에 남아 다음부터는 생략됩니다.'
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  const book = await fetchBook(target);
  for (const name of Object.keys(sheets.SHEETS)) {
    const rows = book[name];
    if (!rows) throw new Error(`'${name}' 탭이 문서에 없습니다. 탭 이름을 그대로 두세요.`);
    // 받은 것이 표 모양인지 최소한만 본다(엉뚱한 걸 덮어쓰지 않게)
    if (rows.length < 2) throw new Error(`'${name}' 탭이 비어 있습니다.`);
    fs.writeFileSync(path.join(dir, `${name}.csv`), sheets.toCsv(rows));
    console.log(`  · ${name} — ${rows.length - 1}줄 받음`);
  }
  rememberSource(target);
  console.log(`\n✓ ${path.relative(ROOT, dir)}/ 에 받았습니다.`);
}

function release(note) {
  content.initFromSource();
  const moved = content.pushFromSource();
  for (const m of moved) console.log('  · server/content/' + m + ' 갱신');
  const r = content.publish(note || '시트에서 반영');
  if (!r.ok) {
    console.log('⚠ 배포 검사에 걸렸습니다:');
    for (const e of r.errors) console.log('  ✗', e);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ 콘텐츠 v${r.version} 배포 완료${r.note ? ` — ${r.note}` : ''}`);
  console.log('  (서버가 켜져 있다면 접속자에게 "새 콘텐츠" 알림이 갑니다)');
}

// ─────────────────────────────────────────────────────────────

(async () => {
  const flagApply = rest.includes('--apply');
  const args = rest.filter((a) => a !== '--apply');

  try {
    if (cmd === 'export') {
      exportSheets(args[0] ? path.resolve(args[0]) : DEFAULT_DIR);
    } else if (cmd === 'check') {
      if (!check(args[0] ? path.resolve(args[0]) : DEFAULT_DIR)) process.exitCode = 1;
    } else if (cmd === 'import') {
      importSheets(args[0] ? path.resolve(args[0]) : DEFAULT_DIR);
    } else if (cmd === 'apply') {
      if (importSheets(DEFAULT_DIR)) release(args.join(' '));
    } else if (cmd === 'pull') {
      const dir = DEFAULT_DIR;
      await pull(args[0], dir);
      if (flagApply) {
        if (importSheets(dir)) release(args.slice(1).join(' ') || '구글 시트에서 반영');
      } else {
        console.log('  확인: node tools/sheets.js check');
        console.log('  반영: node tools/sheets.js apply "무엇을 고쳤는지"');
      }
    } else {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#![^\n]*\n\/\*\*\n/, '').replace(/^ \* ?/gm, ''));
    }
  } catch (err) {
    console.log('⚠', err.message);
    process.exitCode = 1;
  }
})();
