// 한국어 조사 고르기 (0.70.25).
//
// 화면에 "악마의 파편이(가) 없습니다" · "골드 1234을(를) 잃고" 처럼 **둘 다 적은**
// 말이 열여덟 군데 있었다. 이름이 바뀌어도 맞도록 적은 것인데, 읽는 사람에게는
// 기계가 쓴 글로 보인다. 받침을 보고 하나만 고른다.
//
// 금지: DOM · 게임 상태. 글자만 다룬다(어디서나 불러 쓸 수 있게).

// 숫자는 **읽는 소리**로 받침을 본다 — 1(일)·3(삼)·6(육)·7(칠)·8(팔)·0(영)은 받침이 있다.
const DIGIT_FINAL = { 0: 21, 1: 8, 2: 0, 3: 16, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 };
// ㄹ 받침 — '으로/로' 에서만 따로 본다(ㄹ 받침 뒤에는 '로': 칼로, 물로)
const RIEUL = 8;

/** 마지막 글자의 받침 번호(0 이면 받침 없음). 한글·숫자가 아니면 -1. */
function finalOf(word) {
  const s = String(word || '').trim();
  if (!s) return -1;
  const ch = s[s.length - 1];
  if (/[0-9]/.test(ch)) return DIGIT_FINAL[ch];
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}

/**
 * 낱말에 맞는 조사를 붙여 돌려준다.
 *   josa('악마의 파편', '이/가') → '악마의 파편이'
 *   josa('슬라임', '을/를')     → '슬라임을'
 *   josa('물', '으로/로')       → '물로'
 * 한글·숫자로 끝나지 않으면(영문 등) 받침 없는 쪽을 쓴다.
 */
export function josa(word, pair) {
  const [withF, noF] = String(pair).split('/');
  const f = finalOf(word);
  if (withF === '으로') return `${word}${f > 0 && f !== RIEUL ? '으로' : '로'}`;
  return `${word}${f > 0 ? withF : noF}`;
}
