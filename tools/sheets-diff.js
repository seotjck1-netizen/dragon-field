#!/usr/bin/env node
/**
 * 구글 시트(엑셀 통합문서)와 저장소의 sheets/*.csv 가 어디가 다른지 보여 준다.
 *
 *   node tools/sheets-diff.js                            sheets/inbox/ 의 최신 통합문서와 견주기
 *   node tools/sheets-diff.js <통합문서.xlsx | 폴더>      무엇이 다른지 보기만
 *   node tools/sheets-diff.js <통합문서.xlsx> --take             시트 쪽 값을 전부 가져오기
 *   node tools/sheets-diff.js <통합문서.xlsx> --take drops,quests  그 탭만 가져오기
 *
 * 파일 **이름은 보지 않는다**. 폴더를 주거나 아무것도 안 주면 그 안에서 가장
 * 최근에 받은 .xlsx 를 집는다 — 버전이 붙은 이름이 바뀌어도 그대로 돌아간다.
 *
 * 왜 필요한가:
 * 시트는 **사람이 직접 고치는 곳**이다. 저장소의 sheets/*.csv 를 그대로 덮어쓰면
 * 그 사람이 시트에서 손봐 둔 숫자가 소리 없이 사라진다. 작업을 시작하기 전에
 * 늘 이걸로 견주고, 시트 쪽 수정은 **가져온 다음** 코드 작업을 시작한다.
 *
 * --take 는 이렇게 가른다:
 *   · 양쪽에 있는 줄 → **시트 값을 쓴다** (사람이 고친 것이 이긴다)
 *   · 시트에만 있는 줄 → 가져온다 (사람이 새로 넣은 것)
 *   · 저장소에만 있는 줄 → 그대로 둔다 (이번 판에서 새로 넣은 것. 시트가 옛것일 뿐)
 *   · 시트에 아예 없는 탭·칸 → 건드리지 않는다 (옛 통합문서라는 뜻)
 *
 * ⚠ 칸이 늘어난 탭은 자리가 밀리므로 값을 가져오지 않고 **표시만** 한다.
 *   그럴 때는 npm run sheets 로 표를 새로 뽑아 시트에 올리는 것이 먼저다.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SHEET_DIR = path.join(ROOT, 'sheets');

/**
 * 통합문서를 찾는다. **이름은 보지 않는다.**
 *
 * 버전이 올라갈 때마다 파일 이름이 '…-0.42.0.xlsx' → '…-0.43.0.xlsx' 로 바뀐다.
 * 그때마다 이름을 고쳐 적게 하면 언젠가 옛 파일을 견주고도 "같습니다" 를 보게 된다.
 * 그래서 **폴더를 주면 그 안에서 가장 최근에 받은 .xlsx 를 집는다**.
 * 아무것도 안 주면 sheets/inbox/ 를 본다.
 */
function resolveBook(arg) {
  const target = arg || path.join(SHEET_DIR, 'inbox');
  if (!fs.existsSync(target)) return null;
  if (!fs.statSync(target).isDirectory()) return target;

  const found = fs
    .readdirSync(target)
    .filter((n) => n.endsWith('.xlsx') && !n.startsWith('~$'))
    .map((n) => path.join(target, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!found.length) return null;
  if (found.length > 1) {
    console.log(`  (${path.relative(ROOT, target) || target} 안에 ${found.length}개 — 가장 최근 것을 봅니다)`);
  }
  console.log(`  통합문서: ${path.basename(found[0])}`);
  return found[0];
}

const file = resolveBook(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null);
// --take            전부 가져온다
// --take drops,quests  그 탭만 가져온다 (시트가 옛것이라 일부만 믿을 때)
const takeAt = process.argv.indexOf('--take');
const takeAll = takeAt >= 0;
const takeArg = takeAt >= 0 ? process.argv[takeAt + 1] : null;
const takeTabs = takeArg && !takeArg.startsWith('--')
  ? new Set(takeArg.split(',').map((s) => s.trim()))
  : null;
const wantTake = (tab) => takeAll && (!takeTabs || takeTabs.has(tab));
const take = takeAll;
if (!file || !fs.existsSync(file)) {
  console.log('  쓰는 법: node tools/sheets-diff.js [통합문서.xlsx | 폴더] [--take]');
  console.log('  · 폴더를 주면 그 안에서 가장 최근 .xlsx 를 집습니다(이름·버전 안 봅니다).');
  console.log(`  · 아무것도 안 주면 ${path.relative(ROOT, path.join(SHEET_DIR, 'inbox'))}/ 를 봅니다.`);
  process.exit(1);
}

// xlsx 읽기는 파이썬(openpyxl)에 맡긴다 — zip 안의 XML 을 직접 뜯는 것보다
// 틀릴 여지가 적다. 쓰기(make-xlsx.js)는 라이브러리 없이 하고 있으므로
// 저장소가 파이썬에 의존하게 되는 것은 **이 진단 도구 하나뿐**이다.
const PY = `
import sys, json, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
out = {}
for name in wb.sheetnames:
    ws = wb[name]
    rows = []
    for r in ws.iter_rows(values_only=True):
        cells = ['' if v is None else str(v) for v in r]
        while cells and cells[-1] == '':
            cells.pop()
        if cells:
            rows.append(cells)
    out[name] = rows
print(json.dumps(out, ensure_ascii=False))
`;
const book = JSON.parse(
  execFileSync('python3', ['-c', PY, file], { maxBuffer: 64 * 1024 * 1024 }).toString()
);

/** csv 한 줄을 칸 배열로. 따옴표 안의 쉼표와 "" 를 지킨다. */
function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  while (out.length && out[out.length - 1] === '') out.pop();
  return out;
}

// 구글은 정수를 '1.0' 으로 돌려준다. 그대로 적으면 표가 지저분해지고
// '개수 8.0' 같은 값이 남는다 — 뜻이 같으면 짧은 쪽으로 적는다.
const tidy = (v) => {
  const s = String(v == null ? '' : v).trim();
  if (s === '' || !/^-?\d+\.0+$/.test(s)) return v;
  return String(parseInt(s, 10));
};

const joinCsv = (cells) =>
  cells
    .map((raw) => {
      const s = String(tidy(raw) == null ? '' : tidy(raw));
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');

const readCsv = (f) =>
  fs
    .readFileSync(f, 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map(splitCsv);

// 드랍표는 한 몬스터가 여러 줄이라 'id' 로 짝지을 수 없다 — 통째로 견준다.
const WHOLE_TABLE = new Set(['drops']);

let anyDiff = false;
let anyShape = false;
const summary = [];

for (const f of fs.readdirSync(SHEET_DIR).filter((n) => n.endsWith('.csv'))) {
  const tab = f.replace(/\.csv$/, '');
  const localRows = readCsv(path.join(SHEET_DIR, f));
  const sheetRows = book[tab];
  if (!sheetRows) {
    summary.push(`  ${tab.padEnd(10)} 시트에 이 탭이 없습니다 — 건너뜁니다`);
    continue;
  }

  const lHead = localRows[0] || [];
  const sHead = sheetRows[0] || [];
  const headSame = lHead.length === sHead.length && lHead.every((v, i) => v === sHead[i]);
  if (!headSame) {
    anyShape = true;
    const miss = lHead.filter((h) => !sHead.includes(h));
    const extra = sHead.filter((h) => !lHead.includes(h));
    summary.push(
      `  ${tab.padEnd(10)} ⚠ 제목 줄이 다릅니다` +
        (miss.length ? ` · 시트에 없는 칸: ${miss.join(', ')}` : '') +
        (extra.length ? ` · 시트에만 있는 칸: ${extra.join(', ')}` : '')
    );
  }

  if (WHOLE_TABLE.has(tab)) {
    // 구글은 1 을 '1.0' 으로 돌려준다. 서식 차이를 다른 값으로 세면
    // 표 전체가 "다르다"로 뜨고 진짜 다른 줄이 묻힌다.
    const norm = (r) =>
      joinCsv(r.map((v) => {
        const s = String(v == null ? '' : v).trim();
        return s !== '' && !Number.isNaN(Number(s)) ? String(Number(s)) : s;
      }));
    const l = localRows.slice(1).map(norm).sort();
    const s = sheetRows.slice(1).map(norm).sort();
    const onlySheet = s.filter((x) => !l.includes(x));
    const onlyLocal = l.filter((x) => !s.includes(x));
    if (onlySheet.length || onlyLocal.length) {
      anyDiff = true;
      summary.push(`  ${tab.padEnd(10)} 시트에만 ${onlySheet.length}줄 · 저장소에만 ${onlyLocal.length}줄`);
      for (const x of onlySheet.slice(0, 8)) summary.push(`             시트→ ${x}`);
      for (const x of onlyLocal.slice(0, 8)) summary.push(`             여기→ ${x}`);
    }

    if (wantTake(tab) && headSame) {
      // 시트가 아는 것은 시트가 정한다. 다만 **시트가 이름조차 모르는 아이템**의 줄은
      // 이번 판에서 새로 넣은 것이므로 남긴다(예: 홈 뚫는 송곳).
      // 이 구분이 없으면 "시트를 가져왔더니 이번에 넣은 드랍이 사라졌다"가 된다.
      const knownItems = new Set();
      for (const r of (book.items || []).slice(1)) if (r[0]) knownItems.add(r[0]);
      const kept = localRows.slice(1).filter((r) => r[1] && !knownItems.has(r[1]));
      const out = [localRows[0], ...sheetRows.slice(1), ...kept];
      const bom = fs.readFileSync(path.join(SHEET_DIR, f), 'utf8').startsWith('\ufeff') ? '\ufeff' : '';
      fs.writeFileSync(path.join(SHEET_DIR, f), bom + out.map(joinCsv).join('\r\n') + '\r\n');
    }
    continue;
  }

  const byId = (rows) => {
    const m = new Map();
    for (const r of rows.slice(1)) if (r[0]) m.set(r[0], r);
    return m;
  };
  const L = byId(localRows);
  const S = byId(sheetRows);

  const changed = [];
  for (const [id, sRow] of S) {
    const lRow = L.get(id);
    if (!lRow) { changed.push(`+ ${id} (시트에만 있는 줄)`); continue; }
    if (!headSame) continue; // 자리가 밀린 표는 값을 견주지 않는다
    for (let i = 1; i < Math.max(lRow.length, sRow.length); i++) {
      const a = (lRow[i] || '').trim();
      const b = (sRow[i] || '').trim();
      if (a === b) continue;
      // 숫자는 서식 차이(1 vs 1.0)를 같은 값으로 본다
      if (a !== '' && b !== '' && Number(a) === Number(b) && !Number.isNaN(Number(a))) continue;
      changed.push(`~ ${id} · ${lHead[i] || `${i}번째 칸`}: 여기 '${a}' → 시트 '${b}'`);
    }
  }
  const onlyLocal = [...L.keys()].filter((id) => !S.has(id));

  if (changed.length || onlyLocal.length) {
    anyDiff = true;
    summary.push(`  ${tab.padEnd(10)} 다른 곳 ${changed.length}군데 · 저장소에만 ${onlyLocal.length}줄`);
    for (const c of changed.slice(0, 20)) summary.push(`             ${c}`);
    if (changed.length > 20) summary.push(`             ... 그리고 ${changed.length - 20}군데 더`);
    if (onlyLocal.length) summary.push(`             (저장소에만: ${onlyLocal.join(', ')})`);
  }

  if (wantTake(tab) && headSame) {
    const out = [localRows[0]];
    const seen = new Set();
    for (const r of localRows.slice(1)) {
      if (!r[0]) continue;
      out.push(S.get(r[0]) || r); // 양쪽에 있으면 시트 값이 이긴다
      seen.add(r[0]);
    }
    for (const [id, sRow] of S) if (!seen.has(id)) out.push(sRow);
    const bom = fs.readFileSync(path.join(SHEET_DIR, f), 'utf8').startsWith('﻿') ? '﻿' : '';
    fs.writeFileSync(path.join(SHEET_DIR, f), bom + out.map(joinCsv).join('\r\n') + '\r\n');
  }
}

console.log('');
console.log(`  구글 시트 ↔ sheets/  견주기 — ${path.basename(file)}`);
console.log('  ' + '─'.repeat(72));
if (!summary.length) console.log('  다른 곳이 없습니다.');
else summary.forEach((l) => console.log(l));
console.log('');
if (anyShape) {
  console.log('  ⚠ 칸 생김새가 다른 탭이 있습니다. 값은 가져오지 않았습니다.');
  console.log('    npm run sheets 로 표를 새로 뽑아 시트에 올린 뒤 다시 견주세요.');
}
if (take) console.log('  시트 값을 sheets/ 로 가져왔습니다 → node tools/sheets.js check');
else if (anyDiff) console.log('  --take 를 붙이면 시트 쪽 값을 sheets/ 로 가져옵니다.');
console.log('');
