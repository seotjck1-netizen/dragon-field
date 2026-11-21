#!/bin/bash
# 밸런스 대시보드 페이지 조립 — head + body + (sim + calc-tail) + ui → dist/balance/page.html · page.doc.json
#   대시보드의 files/index.html 문서({text})로 올리는 것이 page.doc.json 이다.
cd "$(dirname "$0")"
OUT=../../dist/balance; mkdir -p "$OUT"
{ cat head.html; cat body.html; echo "<script>"; grep -v "^if (typeof module" sim.js; cat calc-tail.js; echo "</script>"; echo "<script>"; cat ui.js; echo "</script>"; } > "$OUT/page.html"
node -e "const fs=require('fs'); const t=fs.readFileSync('$OUT/page.html','utf8'); fs.writeFileSync('$OUT/page.doc.json', JSON.stringify({text:t})); console.log('page.html', (t.length/1024).toFixed(1)+'KB')"
