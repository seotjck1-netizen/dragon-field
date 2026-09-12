// 책임: "이걸 끼면 지금 낀 것보다 얼마나 나은가" 를 재고 글로 만든다.
// 규칙: 상태를 읽기만 한다. 소지품 창과 상점 창이 **같은 규칙**을 쓰게 하려고 여기 모았다.
// 금지: 상태 수정, 강화 수치 계산(formulas 가 준 값을 견주기만 한다).

import { enhancedStats } from '../data/formulas.js';
import { slotsForItem } from '../systems/EquipmentSystem.js';
import { STAT_LABEL, fmtStat } from './statLabels.js';

/**
 * 이 물건을 끼면 **무엇이 벗겨지는가** — 그 물건의 (강화까지 먹인) 능력치.
 *
 * 반지처럼 자리가 둘인 것은 빈 칸이 있으면 아무것도 안 벗겨지므로 null 을 준다
 * (그때는 견줄 것이 없고, 그냥 더해지는 것이 맞다).
 * 자리가 다 차 있으면 EquipmentSystem 의 규칙과 같게 **첫 칸**이 바뀐다.
 *
 * @param {object} state
 * @param {object} def items.json 의 그 아이템(끼려는 쪽)
 * @returns {{stats:object, name:string}|null} 벗겨질 물건. 없으면 null.
 */
export function replacedBy(state, def) {
  const slots = slotsForItem(def);
  if (!slots.length) return null;
  const eq = (state.player && state.player.equipment) || {};
  const free = slots.find((sl) => !eq[sl]);
  if (free) return null; // 빈 칸이 있으면 벗겨지는 것이 없다
  const uid = eq[slots[0]];
  const old = (state.inventory || []).find((i) => i.uid === uid);
  const oldDef = old && state.db.items[old.id];
  if (!oldDef) return null;
  return {
    name: oldDef.name,
    stats: enhancedStats(oldDef.stats, old.enhance || 0, oldDef.rarity),
  };
}

/**
 * 두 능력치 묶음의 차이를 한 줄씩.
 *
 * 오르면 초록 ▲, 내려가면 빨강 ▼. 부호는 붙이지 않는다 —
 * 화살표가 방향을 말하므로 "-7 ▼" 는 같은 말을 두 번 하는 것이다.
 *
 * @param {object} now 끼려는 물건의 능치
 * @param {object|null} before 벗겨질 물건의 능치(없으면 차이를 안 적는다)
 * @returns {Array<{key:string, label:string, value:number, diff:number|null}>}
 */
export function compareStats(now, before) {
  const keys = new Set([...Object.keys(now || {}), ...Object.keys(before || {})]);
  const out = [];
  for (const k of keys) {
    const a = Number((now || {})[k] || 0);
    const b = before ? Number(before[k] || 0) : null;
    out.push({
      key: k,
      label: STAT_LABEL[k] || k,
      value: a,
      diff: b == null ? null : +(a - b).toFixed(4),
    });
  }
  return out;
}

/** 차이 하나를 "▲ 7" 같은 조각으로. 차이가 없거나 견줄 것이 없으면 빈 글자. */
export function diffHtml(row) {
  if (!row.diff) return '';
  const cls = row.diff > 0 ? 'is-up' : 'is-down';
  const arrow = row.diff > 0 ? '▲' : '▼';
  return `<span class="stat-diff ${cls}">${arrow} ${fmtStat(row.key, Math.abs(row.diff))}</span>`;
}

/** 상점처럼 한 줄에 다 적어야 하는 곳을 위한 짧은 형태 — "공격 +37 ▲ 7 · 방어 +5 ▼ 2". */
export function compareLine(now, before) {
  return compareStats(now, before)
    .filter((r) => r.value || r.diff)
    .map((r) => `${r.label} +${fmtStat(r.key, r.value)} ${diffHtml(r)}`.trim())
    .join(' · ');
}
