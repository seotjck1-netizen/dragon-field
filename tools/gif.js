// 책임: RGBA 프레임 여러 장 → 움직이는 GIF 한 장. 바깥 라이브러리를 쓰지 않는다.
// 금지: 게임 코드 참조. 이 파일은 순수한 이미지 인코더다.
//
// 왜 직접 짰나: 이 저장소의 규칙이 "바깥 라이브러리 없음" 이다. GIF 는 규격이
// 오래되고 작아서(헤더 + 색표 + LZW) 손으로 짜는 편이 npm 하나를 들이는 것보다 싸다.
//
// 쓰는 법
//   const { encodeGif } = require('./gif.js');
//   fs.writeFileSync('out.gif', encodeGif(frames, w, h, { delayMs: 80 }));
//   frames = [Uint8Array(RGBA), …]  — 모두 같은 크기

// ─────────────────────────────────────────────────────────────
// 색 줄이기 — 중앙값 자르기(median cut)
//
// GIF 는 한 장에 256 색까지다. 프레임마다 색표를 따로 두면 깜빡이므로,
// **모든 프레임을 한꺼번에 보고** 색표 하나를 만든다.
// ─────────────────────────────────────────────────────────────

/** 5-5-5 로 뭉친 색 → 개수. 32768 칸이면 충분히 촘촘하고 충분히 빠르다. */
function histogram(frames, step) {
  const hist = new Uint32Array(32768);
  for (const f of frames) {
    for (let i = 0; i < f.length; i += 4 * step) {
      const key = ((f[i] >> 3) << 10) | ((f[i + 1] >> 3) << 5) | (f[i + 2] >> 3);
      hist[key]++;
    }
  }
  return hist;
}

function boxOf(entries) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0, n = 0;
  for (const e of entries) {
    if (e.r < rMin) rMin = e.r; if (e.r > rMax) rMax = e.r;
    if (e.g < gMin) gMin = e.g; if (e.g > gMax) gMax = e.g;
    if (e.b < bMin) bMin = e.b; if (e.b > bMax) bMax = e.b;
    n += e.n;
  }
  return { entries, n, rMin, rMax, gMin, gMax, bMin, bMax,
    span: Math.max(rMax - rMin, gMax - gMin, bMax - bMin) };
}

/** @returns {number[][]} 최대 256 개의 [r,g,b] */
function buildPalette(frames, want = 256) {
  const hist = histogram(frames, 3); // 세 픽셀에 하나만 봐도 색은 다 나온다
  const entries = [];
  for (let key = 0; key < hist.length; key++) {
    if (!hist[key]) continue;
    // ⚠ 칸의 **가운데** 값을 쓴다(+4). 그냥 <<3 하면 언제나 칸의 왼쪽 끝이라
    //    모든 색이 4 씩 어두워진 채로 색표가 만들어진다 — 화면 전체가 살짝 죽는다.
    entries.push({
      r: (((key >> 10) & 31) << 3) | 4,
      g: (((key >> 5) & 31) << 3) | 4,
      b: ((key & 31) << 3) | 4,
      n: hist[key],
    });
  }
  if (entries.length <= want) {
    return entries.map((e) => [e.r, e.g, e.b]);
  }

  let boxes = [boxOf(entries)];
  while (boxes.length < want) {
    // 가장 넓게 퍼진 상자를 가른다. 픽셀이 많은 상자를 먼저 가르면
    // 하늘처럼 넓고 단조로운 곳에 색을 다 써 버린다.
    let best = -1, bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].entries.length < 2) continue;
      const score = boxes[i].span * Math.cbrt(boxes[i].n);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) break;
    const box = boxes[best];
    const axis = box.span === box.rMax - box.rMin ? 'r'
      : box.span === box.gMax - box.gMin ? 'g' : 'b';
    const sorted = box.entries.slice().sort((a, b) => a[axis] - b[axis]);
    // 픽셀 수의 절반이 되는 자리에서 가른다(색 종류의 절반이 아니라).
    let half = box.n / 2, acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i].n;
      if (acc >= half) { cut = i + 1; break; }
      cut = i + 1;
    }
    boxes.splice(best, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
  }

  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0, n = 0;
    for (const e of b.entries) { r += e.r * e.n; g += e.g * e.n; bl += e.b * e.n; n += e.n; }
    return n ? [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] : [0, 0, 0];
  });
}

/** 색 하나 → 가장 가까운 색표 자리. 5-5-5 로 뭉쳐 캐시하므로 한 색당 한 번만 센다. */
function makeMapper(palette) {
  const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const hit = cache[key];
    if (hit >= 0) return hit;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
      // 눈이 초록에 가장 예민하다 — 가중치를 준다.
      const d = dr * dr * 3 + dg * dg * 6 + db * db * 1;
      if (d < bestD) { bestD = d; best = i; }
    }
    cache[key] = best;
    return best;
  };
}

// ─────────────────────────────────────────────────────────────
// LZW — GIF 방식
// ─────────────────────────────────────────────────────────────

function lzwEncode(minCodeSize, indices) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const out = [];
  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let cur = 0;
  let curBits = 0;

  // ⚠ 코드 폭은 **코드를 쓴 뒤에** 넓힌다.
  //
  // 여기서 한 칸이라도 어긋나면 스트림이 통째로 깨진다(실제로 깨뜨려 봤다).
  // 푸는 쪽은 코드를 하나 읽을 때마다 표에 한 줄을 더하는데, 그 표는 **넣는 쪽보다
  // 언제나 한 줄 늦다.** 그래서 넣는 쪽도 511 번째 줄을 채운 **다음 코드까지는**
  // 9 비트로 쓰고, 그 다음부터 10 비트로 넓혀야 둘의 폭이 맞는다.
  const emit = (code) => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 0xff); cur >>>= 8; curBits -= 8; }
    if (nextCode > (1 << codeSize) - 1 && codeSize < 12) codeSize++;
  };
  let dict = new Map();
  const reset = () => { dict = new Map(); nextCode = eoiCode + 1; codeSize = minCodeSize + 1; };

  emit(clearCode);
  reset();

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k; // k 는 0~255, prefix 는 0~4095
    const found = dict.get(key);
    if (found !== undefined) { prefix = found; continue; }
    emit(prefix);
    dict.set(key, nextCode);
    nextCode++;
    if (nextCode === 4096) {
      emit(clearCode);
      reset();
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (curBits > 0) out.push(cur & 0xff);
  return out;
}

/** LZW 결과를 255 바이트짜리 덩어리로 나눈다(GIF 의 sub-block). */
function subBlocks(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return out;
}

// ─────────────────────────────────────────────────────────────
// 본체
// ─────────────────────────────────────────────────────────────

/**
 * @param {Uint8Array[]} frames RGBA 픽셀 (w*h*4), 모두 같은 크기
 * @param {number} w
 * @param {number} h
 * @param {{delayMs?:number, loop?:number}} [opts] delayMs 는 한 장이 머무는 시간
 * @returns {Buffer}
 */
function encodeGif(frames, w, h, opts = {}) {
  if (!frames.length) throw new Error('프레임이 없습니다.');
  const delay = Math.max(2, Math.round((opts.delayMs ?? 80) / 10)); // GIF 단위는 1/100초
  const loop = opts.loop ?? 0;

  const palette = buildPalette(frames, 256);
  const mapTo = makeMapper(palette);

  const bytes = [];
  const push = (...v) => bytes.push(...v);
  const push16 = (n) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  const str = (s) => { for (const c of s) bytes.push(c.charCodeAt(0)); };

  str('GIF89a');
  push16(w); push16(h);
  push(0xf7, 0, 0); // 전역 색표 있음 · 256 색
  for (let i = 0; i < 256; i++) {
    const c = palette[i] || [0, 0, 0];
    push(c[0], c[1], c[2]);
  }
  // 되풀이(NETSCAPE2.0)
  push(0x21, 0xff, 11);
  str('NETSCAPE2.0');
  push(3, 1, loop & 0xff, (loop >> 8) & 0xff, 0);

  const indices = new Uint8Array(w * h);
  for (const f of frames) {
    for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
      indices[p] = mapTo(f[i], f[i + 1], f[i + 2]);
    }
    // 그림 앞 제어(머무는 시간)
    push(0x21, 0xf9, 4, 0x04, delay & 0xff, (delay >> 8) & 0xff, 0, 0);
    // 그림
    push(0x2c);
    push16(0); push16(0); push16(w); push16(h);
    push(0); // 지역 색표 없음
    push(8); // 최소 코드 크기
    // ⚠ push(...배열) 로 펼치면 안 된다 — 한 프레임이 수십만 바이트라
    //    인자 개수 한계에 걸려 통째로 터진다(실제로 터뜨려 봤다).
    const blocks = subBlocks(lzwEncode(8, indices));
    for (let i = 0; i < blocks.length; i++) bytes.push(blocks[i]);
  }
  push(0x3b);
  return Buffer.from(bytes);
}

module.exports = { encodeGif, buildPalette };
