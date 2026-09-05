// 책임: 게임 설정값의 기본값·검증·저장 형태를 한곳에서 정의한다.
// 금지: DOM 접근, 저장소 직접 접근(core/Storage.js 가 한다), 다른 system import.
// 설정을 하나 늘리고 싶으면 아래 SETTINGS 표에 한 줄만 추가하면 된다.
//   UI(SettingsPanel)와 저장은 이 표를 그대로 읽는다.

/**
 * 설정 표.
 *   key      저장될 이름
 *   type     'toggle' | 'range' | 'choice'
 *   label    화면에 보일 이름
 *   desc     한 줄 설명
 *   default  기본값
 *   group    설정 창에서 묶일 분류
 *   min/max/step  range 일 때만
 *   options  choice 일 때만 — [{ value, label }]
 */
export const SETTINGS = [
  {
    key: 'music',
    type: 'toggle',
    group: '소리',
    label: '배경 음악',
    desc: '접속 화면 · 마을 · 들판 · 지하감옥 · 고룡',
    // ⚠ 0.43 까지 이 기본값이 false 였다. 곡을 넣어 놓고도 아무도 못 들었다 —
    //   시험이 Sound 를 직접 만들면서 설정을 흉내 냈던 탓에 잡히지 않았다.
    //   (지금 batch30 은 **진짜 기본 설정**으로 만들어 확인한다)
    default: true,
  },
  {
    key: 'sfx',
    type: 'toggle',
    group: '소리',
    label: '효과음',
    desc: '타격음 · 기합 · 사고팔기 · 강화 · 발소리',
    default: true,
  },
  {
    key: 'volume',
    type: 'range',
    group: '소리',
    label: '음량',
    desc: '전체 소리 크기',
    default: 60,
    min: 0,
    max: 100,
    step: 5,
    unit: '',
  },
  {
    key: 'orientation',
    type: 'choice',
    group: '화면',
    label: '화면 방향',
    desc: '세로로 하면 폰을 세워 든 채로도 판이 크게 보인다',
    default: 'auto',
    options: [
      { value: 'auto', label: '자동' },
      { value: 'landscape', label: '가로 고정' },
      { value: 'portrait', label: '세로 고정' },
    ],
  },
  {
    key: 'pauseInMenus',
    type: 'toggle',
    group: '화면',
    label: '창을 열면 시간 멈춤',
    desc: '켜면 상점·소지품을 보는 동안 회복과 되살아남이 멈춘다. 화면이 조용해진다',
    default: true,
  },
  {
    key: 'battleSkip',
    type: 'toggle',
    group: '전투',
    label: '전투 화면 건너뛰기',
    desc: '켜면 연출 없이 결과만 바로 보여 준다',
    default: false,
  },
  {
    key: 'battleSpeed',
    type: 'range',
    group: '전투',
    label: '전투 속도',
    desc: '연출 재생 배속',
    default: 100,
    min: 50,
    max: 300,
    step: 25,
  },
  {
    key: 'autoPotionAt',
    type: 'range',
    group: '전투',
    label: '물약 자동 사용 기준',
    desc: '전투 중 HP 가 이 비율 아래로 내려가면 회복약을 알아서 마신다',
    default: 70,
    min: 50,
    max: 90,
    step: 5,
    unit: '%',
  },
  {
    key: 'damageNumbers',
    type: 'toggle',
    group: '전투',
    label: '피해 숫자 표시',
    desc: '맞을 때 뜨는 숫자',
    default: true,
  },
  {
    key: 'showNames',
    type: 'toggle',
    group: '화면',
    label: '다른 사람 아이디 표시',
    desc: '함께 접속한 사람 머리 위에 아이디를 보여 준다',
    default: true,
  },
  {
    key: 'showOwnName',
    type: 'toggle',
    group: '화면',
    label: '내 이름표도 표시',
    desc: '내 캐릭터 머리 위에도 이름표를 보여 준다',
    default: false,
  },
  {
    key: 'nameTagShows',
    type: 'choice',
    group: '화면',
    label: '이름표에 표시할 것',
    desc: '머리 위에 계정 아이디를 쓸지, 캐릭터 이름을 쓸지',
    default: 'id',
    options: [
      { value: 'id', label: '아이디' },
      { value: 'name', label: '캐릭터 이름' },
    ],
  },
  {
    key: 'screenShake',
    type: 'toggle',
    group: '화면',
    label: '화면 흔들림',
    desc: '치명타·보스 등장 연출',
    default: true,
  },
];

const BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s]));

/** 기본값만 담긴 설정 객체. */
export function defaultSettings() {
  const out = {};
  for (const s of SETTINGS) out[s.key] = s.default;
  return out;
}

/** 저장된 값 → 안전한 설정 객체. 모르는 키는 버리고, 잘못된 값은 기본값으로 되돌린다. */
export function normalize(saved) {
  const out = defaultSettings();
  if (!saved || typeof saved !== 'object') return out;

  for (const [key, value] of Object.entries(saved)) {
    const def = BY_KEY[key];
    if (!def) continue;
    if (def.type === 'toggle') {
      if (typeof value === 'boolean') out[key] = value;
    } else if (def.type === 'range') {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.min(def.max, Math.max(def.min, n));
    } else if (def.type === 'choice') {
      if (def.options.some((o) => o.value === value)) out[key] = value;
    }
  }
  return out;
}

/** 값 하나를 바꾼 새 설정 객체. (상태를 직접 고치지 않는다) */
export function withValue(settings, key, value) {
  const def = BY_KEY[key];
  if (!def) return settings;
  return normalize({ ...settings, [key]: value });
}

/** 설정 창에서 쓸 분류별 묶음. */
export function grouped() {
  const map = new Map();
  for (const s of SETTINGS) {
    if (!map.has(s.group)) map.set(s.group, []);
    map.get(s.group).push(s);
  }
  return [...map.entries()];
}

/** 전투 연출 배속(1.0 = 기본). */
export function battleSpeedMult(settings) {
  return (settings.battleSpeed || 100) / 100;
}

/** 물약 자동 사용 기준선(0~1). 설정은 퍼센트로 저장된다. */
export function autoPotionThreshold(settings) {
  const pct = (settings && settings.autoPotionAt) || 70;
  return Math.min(0.9, Math.max(0.5, pct / 100));
}
