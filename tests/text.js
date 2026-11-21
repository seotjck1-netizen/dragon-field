// 화면에 나오는 글 — 조사를 둘 다 적지 않는다 (0.70.25).
//
// "악마의 파편이(가) 없습니다" · "골드 1234을(를) 잃고" 처럼 적힌 말이 열여덟 군데
// 있었다(gear 시험을 쓰다 발견). 이름이 바뀌어도 맞게 하려던 것인데, 읽는 사람에게는
// 기계가 쓴 글이다. core/Josa.js 로 하나만 고른다.
//
// 브라우저 없이 돈다.
const fs = require('fs');
const path = require('path');

const ok = [], bad = [];
const check = (n, c, x = '') => (c ? ok : bad).push(n + (x ? ` — ${x}` : ''));

(async () => {
  const { josa } = await import(path.join(__dirname, '..', 'src', 'core', 'Josa.js'));
  const cases = [
    ['악마의 파편', '이/가', '악마의 파편이'], ['박쥐', '이/가', '박쥐가'],
    ['슬라임', '을/를', '슬라임을'], ['루비', '을/를', '루비를'],
    ['고룡', '은/는', '고룡은'], ['마녀', '은/는', '마녀는'],
    ['물', '으로/로', '물로'], ['집', '으로/로', '집으로'], ['나무', '으로/로', '나무로'],
    // 숫자는 읽는 소리로 — 4(사)는 받침 없음, 1(일)·3(삼)·6(육)·7(칠)·8(팔)·0(영)은 있음
    ['1234', '을/를', '1234를'], ['1231', '을/를', '1231을'], ['500', '이/가', '500이'],
  ];
  for (const [w, p, want] of cases) {
    const got = josa(w, p);
    check(`${w} + ${p} → ${want}`, got === want, got);
  }

  // 화면에 나가는 글(따옴표·백틱 안)에 '이(가)' 같은 겹친 조사가 남아 있지 않은지.
  // 주석은 본다 안 본다 — 설명하느라 적은 것은 괜찮다.
  const ROOT = path.join(__dirname, '..', 'src');
  const hits = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!f.endsWith('.js')) continue;
      fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
        if (/^\s*\*/.test(line)) return;
        if (/(이\(가\)|을\(를\)|은\(는\)|와\(과\))/.test(code)) hits.push(`${path.relative(ROOT, p)}:${i + 1}`);
      });
    }
  };
  walk(ROOT);
  check('화면에 나가는 글에 겹친 조사가 없다', hits.length === 0, hits.join(' '));

  // 윈도우 배치 파일(0.70.40) — 한글이 든 UTF-8 · LF 파일을 명령 창이 잘못 읽어 주석 토막을
  // 명령으로 실행했다(upload.bat 이 아무것도 못 올렸다). .bat 은 ASCII · CRLF 로만 둔다.
  const TOP = path.join(__dirname, '..');
  const bats = fs.readdirSync(TOP).filter((f) => /\.(bat|cmd)$/i.test(f));
  check('배치 파일이 있다(upload.bat · rollback.bat)', bats.includes('upload.bat') && bats.includes('rollback.bat'), bats.join(' '));
  for (const f of bats) {
    const buf = fs.readFileSync(path.join(TOP, f));
    const nonAscii = [...buf].findIndex((b) => b > 0x7f);
    check(`${f} 는 ASCII 만 쓴다`, nonAscii < 0, nonAscii >= 0 ? `${nonAscii} 바이트째` : '');
    const text = buf.toString('latin1');
    const lf = (text.match(/\n/g) || []).length;
    const crlf = (text.match(/\r\n/g) || []).length;
    check(`${f} 의 줄 끝이 모두 CRLF`, lf > 0 && lf === crlf, `LF ${lf} · CRLF ${crlf}`);
    check(`${f} 는 chcp 로 글자판을 바꾸지 않는다`, !/chcp/i.test(text));
  }
  // 하는 일은 Node 쪽에 — upload.bat 이 부르는 tools/upload.js 가 계정 파일을 막는다
  const up = fs.readFileSync(path.join(TOP, 'tools', 'upload.js'), 'utf8');
  check('upload.bat 이 tools/upload.js 를 부른다', /node tools\\upload\.js/.test(fs.readFileSync(path.join(TOP, 'upload.bat'), 'latin1')));
  check('tools/upload.js 가 server/data · .env · accounts.csv 를 막는다',
    /server\/data\//.test(up) && /'\.env'/.test(up) && /sheets\/accounts\.csv/.test(up));

  console.log('');
  for (const s of ok) console.log('  ✓', s);
  for (const s of bad) console.log('  ✗', s);
  console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
  process.exit(bad.length ? 1 : 0);
})();
