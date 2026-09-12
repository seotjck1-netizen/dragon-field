// 책임: 스탯 키(hp/atk/…)를 사람이 읽는 이름과 표기로 바꾼다.
// 왜 따로 두는가: 같은 표가 소지품·캐릭터·상점·퀘스트 네 곳에 복사돼 있어서
//                 새 스탯을 하나 넣을 때마다 한 곳을 빠뜨렸다. 이제 여기만 고친다.
// 금지: 상태 접근, 계산.

export const STAT_LABEL = {
  hp: 'HP',
  atk: '공격',
  def: '방어',
  spd: '속도',
  crit: '치명',
  critDmg: '치명피해',
};

export const STAT_ICON = {
  hp: '❤',
  atk: '⚔',
  def: '🛡',
  spd: '👟',
  crit: '✦',
  critDmg: '✸',
};

/** 비율로 보여 줄 스탯(0.15 → 15%). */
export const RATIO_STATS = new Set(['crit', 'critDmg']);

export const isRatio = (k) => RATIO_STATS.has(k);

/** 값 하나를 화면용 글로. */
export function fmtStat(k, v, digits = 1) {
  if (isRatio(k)) return `${(v * 100).toFixed(digits)}%`;
  return String(Math.round(v * 100) / 100);
}

/** "공격 +12" 같은 한 줄. */
export function statLine(k, v, digits = 1) {
  return `${STAT_LABEL[k] || k} +${fmtStat(k, v, digits)}`;
}

// 보정(mods) 이름표는 src/data/modLabels.js 한 곳에 있다.
// 화면 쪽에서 쓰기 좋게 여기서 그대로 다시 내보낸다.
export { MOD_LABEL, modLabel } from '../data/modLabels.js';
