// 마을 사람 이름 (0.70.34) — 이름은 구글 시트의 npcs 탭에서 고친다(server/sheets.js 의 npcs).
//
// npcs.json 의 사람마다
//   title  직함   (잡화상 · 왕실 대장장이 · 성문 위병 …)
//   given  이름   (마르타 · 도르한 … 없으면 빈칸 — '성문 위병' 처럼 직함만으로 부르는 사람)
//   name   보이는 이름 = 직함 + 이름 (대화창 · 상점 창 제목에 나온다)
//
// ── 다른 글 속의 이름 ───────────────────────────────────────
// 퀘스트 설명 · 다른 사람의 대사 · 막힌 길 안내에 이름이 박혀 있으면, 시트에서 이름을 바꿔도
// 그 글은 옛 이름 그대로 남는다("고르드가 악마의 핵을 찾는다"). 그래서 글에는 이름 대신 **자리표**를 적는다.
//
//   {blacksmith}         부르는 이름(이름, 없으면 직함)       → 고르드
//   {blacksmith:이/가}   부르는 이름 + 받침에 맞는 조사         → 고르드가 / 민준이
//   {blacksmith:전체}    보이는 이름(직함 + 이름)               → 대장장이 고르드
//   {blacksmith:전체:이/가}  보이는 이름 + 조사                    → 대장장이 고르드가
//   조사는 '이/가' · '을/를' · '은/는' · '과/와' · '으로/로' · '이라고/라고' 처럼 받침 있을 때/없을 때를 / 로 나눠 적는다.
//
// 중괄호 안이 마을 사람 id 가 아니면 그대로 둔다(다른 글의 중괄호를 건드리지 않는다).
// 금지: DOM · 게임 상태. 글자만 다룬다(어디서나 불러 쓸 수 있게).
import { josa } from './Josa.js';

/** 보이는 이름(직함 + 이름). title/given 이 없는 옛 표면 name 그대로. */
export function npcFullName(def) {
  if (!def) return '';
  const t = String(def.title || '').trim(), g = String(def.given || '').trim();
  if (t || g) return [t, g].filter(Boolean).join(' ');
  return String(def.name || '');
}

/** 부르는 이름(이름, 없으면 직함, 그것도 없으면 보이는 이름). */
export function npcCallName(def) {
  if (!def) return '';
  return String(def.given || '').trim() || String(def.title || '').trim() || String(def.name || '');
}

const TOKEN = /\{([a-z][a-z0-9_]*)((?::[^{}:]{1,8}){0,2})\}/g;

/**
 * 글 속의 자리표를 지금 이름으로 바꾼다.
 * @param {string} text
 * @param {Record<string, any>} npcs  db.npcs
 */
export function fillNpcNames(text, npcs) {
  if (text == null) return text;
  const s = String(text);
  if (!npcs || s.indexOf('{') < 0) return s;
  return s.replace(TOKEN, (m, id, rest) => {
    const def = npcs[id];
    if (!def || typeof def !== 'object') return m;
    const opts = String(rest || '').split(':').filter(Boolean);
    const full = opts.includes('전체');
    const particle = opts.find((o) => o.includes('/'));
    // 모르는 꼬리표가 붙어 있으면 손대지 않는다(오타를 조용히 삼키지 않게 — 화면에 그대로 보인다)
    if (opts.some((o) => o !== '전체' && o !== particle)) return m;
    const word = full ? npcFullName(def) : npcCallName(def);
    return particle ? josa(word, particle) : word;
  });
}
