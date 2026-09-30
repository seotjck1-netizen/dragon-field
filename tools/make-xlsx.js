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

// ── '읽어보기' 탭 (0.70.4) ───────────────────────────────────
//
// 몬스터 탭의 제목 줄 밑에는 칸마다 한 줄짜리 설명이 붙는다(server/sheets.js 의
// MON_NOTE). 한 줄에 다 못 담는 것 — 특히 **분노가 어떻게 쌓이는가** — 을 여기에 편다.
//
// ⚠ 이 탭은 게임 표가 아니다. 서버는 아는 탭 이름만 찾아가므로(sheetsync)
//   여기에 무엇을 적든 게임에는 아무 일도 일어나지 않는다. '계정' 탭과 같은 자리다.
//   그러니 마음껏 고쳐 적어도 된다.
const READ_ME = [
  ['드래곤 필드 — 표 읽는 법'],
  [''],
  ['이 탭은 설명일 뿐입니다. 서버는 아는 탭 이름(items·monsters·drops…)만 읽어 가므로'],
  ['여기에 무엇을 적어도 게임은 달라지지 않습니다. 마음껏 고쳐 쓰세요.'],
  [''],
  ['■ 몬스터 탭 — 실제 값 (0.70.6)'],
  ['칸', "실제 값 — **공격력 바로 오른쪽.** 자동으로 채워집니다"],
  ['왜 있나', '표의 hp·atk·def 는 **맨몸 값**입니다. 싸움에서 만나는 숫자는 그 몬스터가'],
  ['', '사는 땅의 보정(power)을 곱한 것이라 표의 값과 많이 다릅니다.'],
  ['보기', '지하감옥 5층은 ×18.6 입니다 — 표에 atk 500 을 적으면 싸움에서는 9,305 입니다.'],
  ['', '그래서 고룡의 공격력을 1,000 으로 올려도 5층 주인(표 500)보다 약합니다.'],
  ['여러 곳에 사는 놈', '가장 약한 곳~가장 센 곳을 함께 보여 줍니다. 예: `→ 실전 32~41 (×1.3~1.7 · 2곳)`'],
  ['고쳐 적으면', '아무 일도 없습니다. 게임은 이 칸을 읽지 않고, 다음 표를 뽑을 때 다시 계산됩니다.'],
  ['땅 보정을 바꾸려면', '이 표가 아니라 지도(maps.json)의 값입니다 — 시트에서는 못 고칩니다.'],
  [''],
  ['■ 몬스터 탭 — 전투크기'],
  ['칸', '전투크기 (battleScale)'],
  ['무엇에 걸리나', '전투 화면에서 그림을 몇 배로 그릴지. **보기용입니다.**'],
  ['싸움에 영향', '없습니다. 체력·공격력·방어력 어디에도 안 걸립니다.'],
  ['쓰는 값', '1 = 보통 · 1.2 = 조금 큼 · 2.1 = 고룡 카르나크 · 2.3 = 아그라모스'],
  ['비우면', '1 로 봅니다(보통 크기).'],
  ['같이 커지는 것', '맞는 자리에 터지는 빛도 이 값만큼 커집니다 — 큰 놈은 크게 터집니다.'],
  ['주의', '너무 키우면 전투 화면 밖으로 나갑니다. 2.5 언저리가 끝이라고 보세요.'],
  [''],
  ['■ 몬스터 탭 — 분노'],
  ['칸', '분노 (rage)'],
  ['무엇에 걸리나', '이 몬스터가 **제 차례에 한 대 칠 때마다** 제 공격력이 그만큼씩 붙습니다.'],
  ['어떻게 쌓이나', '더하기가 아니라 **곱하기**입니다. 0.1 이면 1.1배 → 1.21배 → 1.331배 …'],
  ['식', '그 대의 공격력 = 표의 공격력 × (1 + 분노) ^ (지금까지 휘두른 횟수)'],
  ['0.1 이면', '1대째 1.0배 · 5대째 1.46배 · 10대째 2.36배 · 20대째 6.12배 · 30대째 15.9배'],
  ['0.05 면', '10대째 1.55배 · 30대째 4.1배 — 길게 끄는 판에서만 티가 납니다.'],
  ['0.2 면', '10대째 5.2배 · 20대째 32배 — 오래 끌면 무조건 집니다.'],
  ['안 오르는 경우', '여파(광역)로 맞히거나 반사로 되돌아간 피해로는 안 오릅니다. 제 차례에 휘두를 때만.'],
  ['비우면', '0 — 처음부터 끝까지 표의 공격력 그대로입니다.'],
  ['어디에 쓰나', '"버티기만 하면 이긴다"를 막는 값입니다. 물약을 들이부어 길게 끄는 전법을'],
  ['', '막고 싶으면 이 칸을 올리세요. 공격력을 올리면 첫 대부터 세지지만,'],
  ['', '분노를 올리면 **짧게 끝내면 안 아프고 길어지면 아파집니다.**'],
  [''],
  ['둘 중 무엇을 만져야 하나'],
  ['첫 대부터 아프게', '공격력(atk) 을 올립니다.'],
  ['길어질수록 아프게', '분노를 올립니다.'],
  ['더 커 보이게', '전투크기를 올립니다 — 세지지는 않습니다.'],
  [''],
  ['⚠ 0.70.3 이전에는 분노가 전투에 닿지 않았습니다'],
  ['전투는 rage 를 읽는데 그 값을 실어 나르는 자리가 다섯 칸(hp·atk·def·spd·crit)만'],
  ['담고 있어서, 분노는 조용히 빠졌습니다. 표에 적어 두어도 늘 0 이었습니다.'],
  ['0.70.3 부터 실제로 걸립니다 — 같은 씨앗으로 재 본 고룡 카르나크:'],
  ['', '첫 대', '마지막 대'],
  ['고치기 전', 7624, 3727],
  ['고친 뒤', 7624, 25916],
  [''],
  ['■ 그 밖에 헷갈리기 쉬운 칸'],
  ['레벨', '화면에 뜨는 숫자는 이 값 + 그 땅의 보정입니다. 표의 값 그대로가 아닙니다.'],
  ['속성', 'magic 이라고 적으면 공격이 통째로 마법이 됩니다 — 상대의 마법 저항(지능)이'],
  ['', '최대 80%까지 깎아 냅니다. 고룡 둘이 그렇습니다. 비우면 물리입니다.'],
  ['crit', '0~1 사이의 확률입니다. 0.3 이면 세 대에 한 번쯤 치명타입니다.'],
  ['이동', 'chase = 쫓아옴 · wander = 어슬렁 · still = 가만히'],
  ['기타', '표로 못 펴는 값을 JSON 으로 실어 나릅니다. 건드리지 마세요.'],
];

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
  // ── 계정 목록 (0.59) ──────────────────────────────────────
  //
  // 이 탭은 **보기만 하는 사진**이다. 게임 표가 아니므로 sheets.SHEETS 에 없고,
  // 서버가 읽어 가지도 않는다(server/sheets.js 는 아는 탭 이름만 본다).
  //
  // ⚠ 왜 "시트에서 지우면 계정이 지워진다" 로 만들지 않았나:
  //   서버가 시트를 읽는 길은 **링크가 있는 모든 사용자 — 뷰어** 공개다. 그 길로
  //   계정 삭제를 받으면 링크를 가진 누구나 남의 계정을 지울 수 있다. 지우는 일은
  //   ADMIN_KEY 가 지키는 운영자 창에만 둔다. 여기는 '누가 있나' 를 보는 자리다.
  //
  //   node tools/accounts.js 로 새로 뜬다(안 돌리면 이 탭은 그냥 빠진다).
  const acctCsv = path.join(SHEET_DIR, 'accounts.csv');
  if (fs.existsSync(acctCsv)) {
    tabs.push({ name: '계정', rows: sheets.parseCsv(fs.readFileSync(acctCsv, 'utf8')) });
  }

  // 설명 탭 — 맨 뒤에 붙인다. 게임 표가 아니므로 서버는 지나친다.
  tabs.push({ name: '읽어보기', rows: READ_ME });

  if (!tabs.length) {
    console.error('시트가 하나도 없습니다. 먼저 `node tools/sheets.js export` 하세요.');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT, buildBook(tabs));

  console.log(`\n✓ ${path.relative(ROOT, OUT)}  (탭 ${tabs.length}개)\n`);
  for (const t of tabs) {
    // ⚠ 게임 표가 아닌 탭('계정')은 SHEETS 에 없다. 그냥 꺼내 쓰면 여기서 죽는다
    //   — 실제로 0.60 에서 그렇게 죽였다. 이름표가 없으면 그 자리를 비운다.
    const label = (sheets.SHEETS[t.name] || {}).label || '(게임 표가 아님 — 보기용)';
    console.log(`  · ${t.name.padEnd(9)} ${String(t.rows.length - 1).padStart(4)}줄  — ${label}`);
  }
  console.log('\n  구글 드라이브에 끌어다 놓고 더블클릭하면 시트로 열립니다.');
  console.log('  탭 이름은 그대로 두세요 — 서버가 이름으로 찾아갑니다.\n');
}

if (require.main === module) main();
module.exports = { makeZip, sheetXml, buildBook };
