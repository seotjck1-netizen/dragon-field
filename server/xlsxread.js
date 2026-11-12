// 책임: 엑셀 통합문서(.xlsx) 한 장을 { 탭이름: [[칸,…],…] } 로 읽는다.
// 금지: 게임 규칙, 파일 쓰기. 읽어서 글자 표로 바꾸는 일만 한다.
//
// ── 왜 이게 필요한가 (0.52) ────────────────────────────────
//
// 예전에는 구글의 `gviz` 통로로 탭을 하나씩 CSV 로 받아 왔다. 그런데 gviz 는
// **칸(열)마다 자료형을 스스로 정한다.** 한 열에 글자와 숫자가 섞여 있으면
// 많은 쪽으로 정해 버리고, 거기에 안 맞는 칸은 **빈칸으로 지워서** 준다.
//
// `classes` 탭이 딱 그 모양이다 — '값' 열에 `용사`(글자)와 `48`(숫자)이 섞여 있다.
// 그래서 gviz 는 그 열을 숫자로 보고 `용사` 를 지웠고, 서버는
// "classes 시트 2번째 줄: 이름은 비울 수 없습니다" 라고 멈췄다.
// **시트에는 멀쩡히 '용사' 라고 적혀 있는데도** 그랬다.
//
// 통로를 바꾼다. 구글은 통합문서 전체를 xlsx 로 그대로 내려 준다:
//   https://docs.google.com/spreadsheets/d/<아이디>/export?format=xlsx
// 이건 자료형을 짐작하지 않는다. 칸에 적힌 것이 그대로 온다.
// 덤으로 **요청이 열 번에서 한 번으로** 줄고, 탭을 반쯤 읽다 마는 일도 없어진다.
//
// 바깥 라이브러리는 안 쓴다. xlsx 는 XML 몇 장을 zip 으로 묶은 것이고,
// zip 풀기는 node 의 zlib 만으로 된다(tools/make-xlsx.js 가 같은 방식으로 굽는다).

const zlib = require('zlib');

/**
 * zip 한 덩어리를 { 파일이름: Buffer } 로 푼다.
 *
 * 가운데 목록(central directory)을 뒤에서부터 찾아 읽는다. 앞에서부터 훑으면
 * 파일 이름 길이·덧글 길이를 잘못 짚었을 때 통째로 어긋나는데, 가운데 목록에는
 * 각 파일이 어디서 시작하는지가 적혀 있어 한 장씩 독립적으로 꺼낼 수 있다.
 */
function unzip(buf) {
  // End of central directory — 뒤에서 찾는다(덧글이 붙어 있을 수 있다).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀 파일이 아닙니다(zip 끝을 못 찾았습니다).');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localAt = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + cmtLen;

    // 지역 머리글은 이름·덧붙임 길이가 가운데 목록과 다를 수 있다. 거기서 다시 읽는다.
    if (buf.readUInt32LE(localAt) !== 0x04034b50) continue;
    const lNameLen = buf.readUInt16LE(localAt + 26);
    const lExtraLen = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    out[name] = method === 0 ? raw : zlib.inflateRawSync(raw);
  }
  return out;
}

/** XML 의 &amp; 따위를 되돌린다. */
function unesc(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** <si> 하나 안의 <t> 들을 이어 붙인다(서식이 섞이면 여러 조각으로 쪼개져 있다). */
function siText(si) {
  const parts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1]));
  return parts.join('');
}

/** 'C7' → 2 (0부터 센 열 번호). */
function colOf(ref) {
  let n = 0;
  for (const ch of String(ref)) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * 통합문서를 { 탭이름: [[칸,…],…] } 로.
 *
 * 모든 칸은 **글자**로 돌려준다 — 이 저장소의 표 해석기(server/sheets.js)가
 * 글자를 받아 스스로 숫자로 바꾼다. 여기서 미리 숫자로 바꾸면 `0.001` 이
 * `1e-3` 이 되는 식으로 모양이 흔들린다.
 */
function readWorkbook(buf) {
  const files = unzip(buf);
  const txt = (name) => (files[name] ? files[name].toString('utf8') : '');

  // 공유 문자열 통
  const shared = [];
  const sst = txt('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(siText(m[1]));

  // rId → 워크시트 파일
  const rels = {};
  for (const m of txt('xl/_rels/workbook.xml.rels')
    .matchAll(/<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    rels[m[1]] = m[2].replace(/^\/?xl\//, '').replace(/^\.\//, '');
  }

  const book = {};
  const wb = txt('xl/workbook.xml');
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1];
    const name = /name="([^"]*)"/.exec(attrs);
    const rid = /r:id="([^"]+)"/.exec(attrs);
    if (!name || !rid) continue;
    const target = rels[rid[1]];
    const xml = target ? txt(`xl/${target}`) : '';
    if (!xml) continue;
    book[unesc(name[1])] = readSheet(xml, shared);
  }
  return book;
}

/** 워크시트 XML 한 장 → 줄 배열. 빈 칸은 '' 로 채워 자리를 지킨다. */
function readSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const inner = cm[2] || '';
      const ref = /r="([A-Z]+)\d+"/.exec(attrs);
      const type = /t="([^"]+)"/.exec(attrs);
      const at = ref ? colOf(ref[1]) : cells.length;

      let val = '';
      if (type && type[1] === 's') {
        const i = /<v>([\s\S]*?)<\/v>/.exec(inner);
        val = i ? (shared[Number(i[1])] ?? '') : '';
      } else if (type && type[1] === 'inlineStr') {
        val = siText(inner);
      } else {
        const i = /<v>([\s\S]*?)<\/v>/.exec(inner);
        val = i ? unesc(i[1]) : '';
      }
      while (cells.length < at) cells.push('');
      cells[at] = val;
    }
    rows.push(cells);
  }
  // 뒤쪽의 완전히 빈 줄은 버린다(구글은 시트 끝까지 빈 줄을 붙여 보낸다).
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

module.exports = { readWorkbook, unzip };
