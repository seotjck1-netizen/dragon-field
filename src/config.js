// 책임: 엔진/화면 관련 전역 상수만 보관한다.
// 금지: 게임 밸런스 수치(데미지, 확률 등)를 여기 두지 않는다 → src/data/formulas.js
// 금지: 로직 함수 정의.

// 게임 버전. 접속 화면 아래에 찍히므로 "지금 열고 있는 파일이 최신인지"를 눈으로 확인할 수 있다.
// 파일을 여러 컴퓨터로 옮겨 다닐 때 옛 파일을 붙잡고 씨름하는 일을 막아 준다.
export const GAME_VERSION = '0.58.0';

/**
 * 이 파일이 들고 있는 **표(src/data/*.json)의 기준 시각**.
 *
 * 왜 있나 (0.58):
 * "다운받은 html 이 구글 시트와 다르다" 는 물음이 나왔다. 다른 게 맞다 —
 * 한 장짜리 html 은 굽는 순간의 표를 **안에 박아 넣는다**(tools/build-single-file.js 가
 * items.json 같은 것을 esbuild 로 통째로 끼워 넣는다). 그러니 구운 뒤에 시트를 고쳐도
 * 그 파일은 절대 따라오지 않는다. 시트를 따라가는 것은 **서버로 돌릴 때**뿐이다
 * (서버는 server/content/ 를 내려 주고, 그건 sheets 로 갱신할 수 있다).
 *
 * 문제는 그 사실이 화면 어디에도 없어서 "왜 다르지" 로만 보였다는 것이다.
 * 그래서 접속 화면에 버전과 나란히 이 기준 시각을 찍는다. 시트를 고친 시각보다
 * 이게 **앞서** 있으면, 그 파일은 옛 표를 들고 있는 것이다 — 새로 구우면 된다.
 *
 * 빈 문자열이면 안 찍는다 — 서버로 돌릴 때가 그렇다(그쪽은 시트를 따라가므로
 * 새길 시각이 없다). 한 장짜리를 구울 때만 esbuild 가 __DF_DATA_STAMP 를 채운다.
 * `typeof` 로 물어보는 이유: 개발 중에는 그 이름이 아예 없다(모듈을 그대로 읽는다).
 */
// eslint-disable-next-line no-undef
export const DATA_STAMP = typeof __DF_DATA_STAMP === 'string' ? __DF_DATA_STAMP : '';

export const CONFIG = {
  // 화면 — 가로로 볼 때의 크기. 세로로 볼 때는 아래 VIEW_PORTRAIT 를 쓴다.
  VIEW_W: 640,
  VIEW_H: 480,

  // 세로(폰을 세워 든) 화면.
  //
  // 왜 폭을 줄이나: 스테이지는 통째로 축소된다(core/Viewport.js). 폰을 세우면
  // 폭이 390 쯤이라 640 짜리 판이 0.6 배로 줄고, 그러면 아래위로 빈 자리가
  // 잔뜩 남는데도 글씨는 작아진다 — "화면이 작아서 불편하다"의 정체다.
  // 세로에서는 **폭을 줄이고 높이를 늘린** 판을 쓰면 같은 폭에서 0.8 배로 커진다.
  VIEW_PORTRAIT_W: 480,
  VIEW_PORTRAIT_H: 640,
  TILE: 32,

  // 루프
  FIXED_DT: 1000 / 60, // 고정 타임스텝(ms)
  MAX_FRAME_MS: 250, // 탭 비활성화 후 복귀 시 폭주 방지

  // 이동 (타일 1칸 이동에 걸리는 시간, ms)
  PLAYER_STEP_MS: 170,
  MONSTER_STEP_MS: 260,

  // 몬스터 AI
  MONSTER_THINK_MIN_MS: 400,
  MONSTER_THINK_MAX_MS: 1400,

  // 조우 판정 거리(픽셀).
  // 유닛끼리 같은 타일에 못 서므로 최소 거리는 인접(=TILE)이다.
  // TILE보다 조금 크게 잡아 "바로 옆에 붙으면 전투"가 되게 한다. 대각선(≈45px)은 제외.
  ENCOUNTER_RADIUS: 36,

  // 전투 종료 후 필드 복귀 시 무적/재조우 방지 시간(ms)
  ENCOUNTER_COOLDOWN_MS: 900,

  // 디버그
  DEBUG: false,
};
