// 책임: PNG 한 장 → 날것 RGBA 픽셀. 바깥 라이브러리를 쓰지 않는다(zlib 은 Node 내장).
// 금지: 게임 코드 참조. 순수한 이미지 디코더다.
//
// 왜 필요한가: 전투 GIF 는 **화면 그대로**여야 쓸모가 있다. 체력 막대·피해 숫자·
// 전투 기록은 캔버스가 아니라 HTML 이라, 캔버스 픽셀만 퍼 오면 그것들이 통째로 빠진다.
// 브라우저에게 화면을 통째로 찍게 하면 PNG 로 오므로, 그 PNG 를 여기서 푼다.
//
// 다루는 것: 8비트 · 인터레이스 없음 · 회색(0) · RGB(2) · 회색+투명(4) · RGBA(6).
// (브라우저 스크린샷은 언제나 이 안에 들어온다)

const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} buf PNG 파일 그대로
 * @returns {{width:number, height:number, data:Uint8Array}} data 는 RGBA (w*h*4)
 */
function readPng(buf) {
  if (!buf.slice(0, 8).equals(SIG)) throw new Error('PNG 가 아닙니다.');

  let width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.slice(p + 8, p + 8 + len);
    p += 12 + len; // 길이(4) + 종류(4) + 내용 + CRC(4)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      color = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (depth !== 8) throw new Error(`8비트 PNG 만 읽습니다 (지금 ${depth}비트).`);
  if (interlace !== 0) throw new Error('인터레이스 PNG 는 읽지 않습니다.');

  const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const ch = CHANNELS[color];
  if (!ch) throw new Error(`다루지 않는 색 방식입니다 (colorType ${color}).`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = new Uint8Array(width * height * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  let q = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[q++];
    for (let i = 0; i < stride; i++) line[i] = raw[q + i];
    q += stride;

    // 필터 되돌리기 — PNG 규격 그대로. a=왼쪽, b=위, c=왼쪽위.
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 0xff;
    }

    const base = y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = x * ch;
      const d = base + x * 4;
      if (ch === 1) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255; }
      else if (ch === 2) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1]; }
      else if (ch === 3) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255; }
      else { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3]; }
    }
    prev.set(line);
  }
  return { width, height, data: out };
}

module.exports = { readPng };
