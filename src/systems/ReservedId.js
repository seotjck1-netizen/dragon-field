// 책임: **아이디로 쓸 수 없는 말**을 가린다.
// 금지: 게임 상태 수정, DOM 조작.
//
// ── 왜 필요한가 ──────────────────────────────────────────────
// 0.66 부터 화면에 나오는 이름은 캐릭터 이름이지만, 아이디는 여전히
// 운영자 창·랭킹 자료·시트에 남는다. 누구나 `admin` 이나 `운영자` 로 계정을
// 만들 수 있으면, 목록에서 진짜 운영자를 가려낼 수 없다.
// 게다가 그런 아이디를 가진 사람은 **남에게 운영자 행세**를 하기 쉽다.
//
// ⚠ **이 파일 하나가 유일한 잣대다.**
//   손님(브라우저)과 서버가 **같은 함수**를 쓴다. 서버는 시작할 때 이 파일을
//   불러와 쓴다(server/server.js 의 loadReserved).
//   예전에 표를 두 군데 적어 두었다가 갈라진 적이 있어서(타일 글자, 0.68),
//   여기서는 아예 나눠 적지 않는다.
//
// ⚠ 막는 것은 **계정 만들기(register)뿐이다.** 접속(login)은 막으면 안 된다 —
//   막으면 진짜 운영자가 제 계정으로 못 들어온다. 실제로 그럴 뻔했다.

/**
 * 이 말로 **시작하면** 안 되는 것.
 *
 * `admin1` · `adminkim` · `ADMIN_X` · `관리자입니다` 를 모두 막는다.
 * 앞머리로 막으므로 넉넉하게 걸린다 — 그게 목적이다.
 */
export const RESERVED_PREFIX = [
  'admin', 'administrator', 'root', 'system', 'operator', 'moderator',
  '운영자', '운영', '관리자', '관리', '시스템', '어드민', '관리인',
];

/**
 * **그 말 자체**일 때만 막는 것.
 *
 * 앞머리로 막으면 애먼 것까지 걸리는 짧은 말들이다.
 * (`gm` 을 앞머리로 막으면 `gmail`·`gmkim` 까지 못 쓴다)
 */
export const RESERVED_EXACT = [
  'gm', 'sys', 'staff', 'support', 'owner', 'master', 'official', 'notice',
  'server', 'bot', 'null', 'undefined', 'none', 'me', 'you',
  '마스터', '주인', '공지', '공식', '서버', '봇', '개발자', '제작자',
  '고객센터', '지원', '도움말', '포이노',
];

/**
 * 견주기 전에 **같은 모양으로 펴는** 일.
 *
 * 사람은 규칙을 피해 가려고 글자를 바꿔 적는다. `Admin` · `ADMIN` · `adm1n` ·
 * `@dmin` · `a_d_m_i_n` 은 눈에는 다 'admin' 으로 읽힌다. 그대로 두면
 * 표에 적힌 말만 막고 나머지는 다 통과한다 — 있으나 마나가 된다.
 *
 * 하는 일은 셋이다.
 *   ① 소문자로
 *   ② 숫자·기호로 바꿔 적은 글자를 되돌린다 (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, @→a, $→s)
 *   ③ 밑줄처럼 사이에 끼워 넣은 것을 뺀다
 *
 * ⚠ 한글은 건드리지 않는다. 한글에는 이런 바꿔 적기가 없고,
 *   섣불리 손대면 멀쩡한 이름이 엉뚱하게 걸린다.
 */
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };

export function normalizeId(id) {
  return String(id || '')
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] || c)
    .join('')
    .replace(/[_\-.\s]/g, '');
}

/**
 * 이 아이디를 쓸 수 있나.
 *
 * @param {string} id 사람이 적은 아이디 그대로
 * @returns {string|null} 못 쓰면 그 까닭(사람에게 보여 줄 글), 쓸 수 있으면 null
 */
export function reservedIdReason(id) {
  const flat = normalizeId(id);
  if (!flat) return null; // 빈 값은 여기서 볼 일이 아니다(validateId 가 본다)

  for (const word of RESERVED_PREFIX) {
    const w = normalizeId(word);
    if (w && flat.startsWith(w)) {
      return `'${word}' 로 시작하는 아이디는 쓸 수 없습니다. 운영자와 헷갈립니다.`;
    }
  }
  for (const word of RESERVED_EXACT) {
    if (flat === normalizeId(word)) {
      return `'${word}' 는 쓸 수 없는 아이디입니다.`;
    }
  }
  return null;
}

/** 사람에게 보여 줄 안내 한 줄(접속 화면에 적는다). */
export const RESERVED_HINT =
  'admin · 운영자 · 관리자 로 시작하거나, gm · 마스터 같은 말은 쓸 수 없습니다.';
