#!/bin/bash
# 시험 전부 돌리기.   bash tests/run.sh [시험이름 ...]
cd "$(dirname "$0")/.."
OUT=${OUT:-/tmp/testout}; rm -rf "$OUT"; mkdir -p "$OUT"

# 정적 서버 — 혼자 도는 시험은 이것만 있으면 된다.
if ! curl -s -o /dev/null http://localhost:8899/index.html 2>/dev/null; then
  setsid python3 -m http.server 8899 --bind 127.0.0.1 > /dev/null 2>&1 < /dev/null &
  sleep 2
fi

LIST="$*"
[ -z "$LIST" ] && LIST=$(ls tests/*.js | xargs -n1 basename | sed 's/\.js$//')

fail=0
for t in $LIST; do
  printf "%-16s " "$t"
  timeout 400 node "tests/$t.js" > "$OUT/$t.txt" 2>&1
  out=$(tail -1 "$OUT/$t.txt")
  echo "$out"
  echo "$out" | grep -q " 0 실패" || fail=1
done
echo ""
[ $fail -eq 0 ] && echo "전부 통과" || echo "실패한 시험이 있습니다 — $OUT 를 보세요"
exit $fail
