#!/usr/bin/env node
/**
 * 화면 코드 규칙 검사. (npm test · 회귀에 들어 있다)
 *
 *   node tools/check-ui.js
 *
 * ── 지금 보는 규칙: src/ui 에서 innerHTML 을 직접 대입하지 않는다 ──────
 *
 * 왜: 창은 상태가 바뀌면 innerHTML 을 통째로 갈아 끼운다. 그러면 그 안의
 * **스크롤이 전부 0 으로 돌아가고, 글자를 치던 칸은 초점을 잃는다.**
 * 이 버그는 0.40(소지품) · 0.64(운영자 창) · 0.70.8(설정 창 · 장비 띠) 세 번 났다.
 * 매번 "그 창"을 고쳤기 때문에 매번 다시 났다 — 사람이 기억해야 하는 규칙은
 * 언젠가 반드시 잊힌다. 그래서 기억 대신 **검사**로 바꾼다.
 *
 * 고치는 법 — 둘 중 하나.
 *   ① `el.innerHTML = x;` → `setHtml(el, x);`  (src/ui/keepScroll.js)
 *   ② 정말 스크롤·입력과 상관없는 자리면 **바로 윗줄에** 이유를 적는다:
 *        // innerHTML-ok: 한 줄짜리 말풍선이라 스크롤이 없다
 *        el.innerHTML = x;
 *
 * ②를 남겨 두는 이유: 규칙을 피할 길이 없으면 사람은 규칙을 지우려 든다.
 * 빠져나갈 구멍을 두되, **이유를 적게** 해서 다음 사람이 판단할 수 있게 한다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const UI = path.join(ROOT, 'src', 'ui');
// keepScroll 자신은 innerHTML 을 쓸 수밖에 없다(그 일을 하는 곳이다).
const SKIP = new Set(['keepScroll.js']);

const problems = [];
let checked = 0;

for (const name of fs.readdirSync(UI).sort()) {
  if (!name.endsWith('.js') || SKIP.has(name)) continue;
  const lines = fs.readFileSync(path.join(UI, name), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/\.innerHTML\s*=/.test(line)) return;
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*')) return; // 주석 속 설명
    if (/\.innerHTML\s*===?/.test(line)) return;               // 비교는 괜찮다
    checked++;
    const before = (lines[i - 1] || '').trim();
    if (/^\/\/\s*innerHTML-ok:\s*\S/.test(before)) return;     // 이유를 적어 뒀다
    problems.push({ file: name, line: i + 1, code });
  });
}

if (!problems.length) {
  console.log(`✓ 화면 코드에 문제가 없습니다. (src/ui, innerHTML 직접 대입 ${checked}군데 — 전부 이유가 적혀 있습니다)`);
  process.exit(0);
}

console.log('⚠ innerHTML 을 직접 대입한 자리가 있습니다.');
console.log('  창을 다시 그릴 때 스크롤과 입력 자리가 날아갑니다. setHtml() 을 쓰세요.');
console.log('  (정말 상관없는 자리면 바로 윗줄에 `// innerHTML-ok: 이유` 를 적습니다)');
console.log('');
for (const p of problems) console.log(`  ✗ src/ui/${p.file}:${p.line}  ${p.code}`);
console.log('');
console.log(`  ${problems.length}군데`);
process.exit(1);
