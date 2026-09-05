#!/usr/bin/env node
/**
 * 표 전부를 엑셀 통합문서 한 개로 굽는다 — 탭 이름은 시트 이름 그대로.
 *
 *   node tools/sheets.js export      # 먼저 sheets/*.csv 를 꺼내고
 *   node tools/make-xlsx.js          # dragon-field-tables.xlsx 를 만든다
 *
 * 왜 필요한가:
 * 구글 시트로 옮기려면 표 하나하나를 "파일 → 가져오기 → 새 시트 삽입" 으로
 * 아홉 번 반복해야 한다. 통합문서 하나를 드라이브에 끌어다 놓으면
 * 구글이 알아서 시트로 바꿔 주고 **탭 이름까지 그대로** 붙는다.
 *
 * ⚠ 탭 이름이 곧 약속이다. 서버는 문서 아이디 하나만 알고 그 안에서
 *   탭 이름으로 찾아가므로, 이름을 바꾸면 그 표만 조용히 안 읽힌다.
 *
 * 바깥 라이브러리를 쓰지 않는다. xlsx 는 XML 몇 장을 zip 으로 묶은 것이고,
 * zip 은 node 의 zlib 만으로 쓸 수 있다(아래 makeZip).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sheets = require('../server/sheets.js');

const ROOT = path.resolve(__dirname, '..');
const SHEET_DIR = path.join(ROOT, 'sheets');
const OUT = path.join(ROOT, 'dragon-field-tables.xlsx');

// ── XML 이스케이프 ───────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // 엑셀은 제어문자를 통째로 거부한다. 줄바꿈·탭만 남긴다.
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

/** A1, B1 … Z1, AA1 형식의 칸 이름. */
function cellRef(col, row) {
  let s = '';
  let n = col + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s + (row + 1);
}

/** 표 하나 → 워크시트 XML. 숫자는 숫자로, 나머지는 인라인 문자열로 넣는다. */
function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          if (v === '' || v == null) return '';
          const ref = cellRef(c, r);
          // 숫자로 보이는 칸은 숫자로 넣는다 — 시트에서 계산할 수 있게.
          // (앞이 0 인 것이나 아주 긴 수는 글자로 둔다. 아이디가 숫자로 변하면 곤란하다)
          const str = String(v);
          const isNum = /^-?(0|[1-9]\d*)(\.\d+)?$/.test(str) && str.length < 15;
          if (isNum) return `<c r="${ref}"><v>${str}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(str)}</t></is></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    // 첫 줄(머리글)을 고정해 둔다 — 표가 길어도 무슨 칸인지 계속 보인다.
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

// ── 최소 ZIP 쓰기 ────────────────────────────────────────────
// xlsx = zip. 바깥 라이브러리를 들이는 대신 여기서 규격대로 쓴다.
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** @param {{name:string, data:Buffer}[]} files */
function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = f.data;
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    // 압축이 되레 커지는 작은 파일은 그냥 담는다(method 0).
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // 필요한 버전
    local.writeUInt16LE(0x0800, 6); // UTF-8 이름
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // 시각 — 0 으로 둔다(빌드가 재현되게)
    local.writeUInt16LE(0x21, 12); // 날짜 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, name, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(0, 38); // 바깥 속성
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);

    offset += local.length + name.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ── 통합문서 조립 ────────────────────────────────────────────
/**
 * 탭 목록 → xlsx 한 덩어리(Buffer).
 * @param {{name:string, rows:string[][]}[]} tabs
 *
 * main() 에서 떼어 냈다(0.52) — 시험이 '구글이 준 통합문서' 를 흉내 낼 때
 * 이 함수를 그대로 쓴다. 굽는 쪽과 읽는 쪽이 같은 규격을 보게 된다.
 */
function buildBook(tabs) {
  const files = [];

  files.push({
    name: '[Content_Types].xml',
    data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        tabs
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ` +
              'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          )
          .join('') +
        '</Types>',
      'utf8'
    ),
  });

  files.push({
    name: '_rels/.rels',
    data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Target="xl/workbook.xml" ' +
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"/>' +
        '</Relationships>',
      'utf8'
    ),
  });

  files.push({
    name: 'xl/workbook.xml',
    data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        tabs
          .map((t, i) => `<sheet name="${esc(t.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets></workbook>',
      'utf8'
    ),
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        tabs
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" ` +
              'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>'
          )
          .join('') +
        '</Relationships>',
      'utf8'
    ),
  });

  tabs.forEach((t, i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(t.rows), 'utf8'),
    });
  });

  return makeZip(files);
}

function main() {
  const tabs = [];
  for (const name of Object.keys(sheets.SHEETS)) {
    const csv = path.join(SHEET_DIR, `${name}.csv`);
    if (!fs.existsSync(csv)) {
      console.log(`  · ${name}.csv 가 없어 건너뜁니다. (먼저 node tools/sheets.js export)`);
      continue;
    }
    tabs.push({ name, rows: sheets.parseCsv(fs.readFileSync(csv, 'utf8')) });
  }
  if (!tabs.length) {
    console.error('시트가 하나도 없습니다. 먼저 `node tools/sheets.js export` 하세요.');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT, buildBook(tabs));

  console.log(`\n✓ ${path.relative(ROOT, OUT)}  (탭 ${tabs.length}개)\n`);
  for (const t of tabs) {
    console.log(`  · ${t.name.padEnd(9)} ${String(t.rows.length - 1).padStart(4)}줄  ` +
      `— ${sheets.SHEETS[t.name].label}`);
  }
  console.log('\n  구글 드라이브에 끌어다 놓고 더블클릭하면 시트로 열립니다.');
  console.log('  탭 이름은 그대로 두세요 — 서버가 이름으로 찾아갑니다.\n');
}

if (require.main === module) main();
module.exports = { makeZip, sheetXml, buildBook };
