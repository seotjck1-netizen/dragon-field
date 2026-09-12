// 책임: "상태가 바뀌었다" 는 알림을 "정말 다시 그려야 하는가" 로 걸러 준다.
// 금지: 게임 상태 판단. 무엇이 바뀌었는지는 각 화면이 sig 로 알려 준다.
//
// ── 왜 있나 ────────────────────────────────────────────────
// 창들은 store 가 바뀔 때마다 innerHTML 을 통째로 갈아 끼운다.
// 평소에는 그래도 됐다. store 가 바뀌는 일이 드물었기 때문이다.
//
// 그런데 "창이 열려 있어도 시간은 흐른다" 로 바꾸면서 사정이 달라졌다.
// 회복 버프가 걸려 있으면 체력이 찰 때마다 알림이 오는데, 이게 **초당 스무 번**이다.
// 그때마다 상점·소지품·강화 창이 통째로 새로 그려진다. 화면은 깜빡이고,
// 누르려던 버튼은 손가락이 닿기 전에 사라졌다가 다시 생긴다.
// 쓰는 사람 눈에는 "창이 계속 반복해서 열리는" 것으로 보인다.
//
// 그래서 두 겹으로 막는다.
//   ① 한 프레임에 여러 번 바뀌어도 그리기는 **한 번**  (rAF 로 모은다)
//   ② 화면에 보이는 것이 그대로면 **아예 안 그린다**  (sig 로 비교)
//
// 체력이 차는 것은 상점 화면에 아무 영향이 없다. 그러니 상점은 안 그려야 맞다.

const raf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (fn) => setTimeout(fn, 16);

/**
 * store 구독을 걸되, 쓸데없는 다시 그리기를 걸러 낸다.
 *
 * @param {{subscribe:Function}} store
 * @param {object} o
 * @param {() => boolean} o.isOpen  닫혀 있으면 아무것도 하지 않는다
 * @param {() => string} [o.sig]    지금 화면에 보이는 것의 요약. 같으면 안 그린다
 * @param {() => void} o.render
 * @returns {{unsubscribe:Function, reset:Function}} reset 은 창을 열 때 부른다
 */
export function subscribeRender(store, { isOpen, sig, render }) {
  let last = null;
  let queued = false;

  const run = () => {
    queued = false;
    if (!isOpen()) return;
    if (sig) {
      const now = sig();
      if (now === last) return;
      last = now;
    }
    render();
  };

  const unsubscribe = store.subscribe(() => {
    if (!isOpen()) return;
    if (queued) return;
    queued = true;
    raf(run);
  });

  // 창을 열 때는 기억을 지운다 — 닫혀 있는 동안 바뀐 것을 놓치지 않게.
  return { unsubscribe, reset: () => { last = sig ? sig() : null; } };
}

/**
 * 소지품·상점·강화 창이 보여 주는 것의 요약.
 *
 * 돈 · 가진 물건 · 입은 것. 체력이나 버프는 여기 없다 — 이 창들은 그것을 보여 주지 않으므로
 * 체력이 찬다고 다시 그릴 이유가 없다.
 */
export function bagSig(state) {
  const p = state && state.player;
  if (!p) return '';
  // ⚠ 가방은 state.inventory 에 있다(state.player.inventory 가 아니다).
  //    여기를 헛짚으면 물건이 늘고 줄어도 요약이 그대로여서 창이 갱신되지 않는다.
  const inv = (state.inventory || [])
    .map((i) => `${i.uid}:${i.id}:${i.count || 1}:${i.enhance || 0}:${i.transcend || 0}`)
    .join(',');
  // ⚠ equipment 의 값은 **uid 문자열**이다(아이템 객체가 아니다).
  //    객체로 착각해 .uid 를 읽으면 전부 undefined 가 되어, 장착해도 요약이
  //    그대로다 — 장비를 바꿔도 창이 갱신되지 않는다.
  const eq = Object.entries(p.equipment || {})
    .map(([slot, uid]) => `${slot}:${uid || '-'}`)
    .join(',');
  return `${p.gold}|${inv}|${eq}`;
}

/** 캐릭터 창이 보여 주는 것의 요약 — 레벨·경험치·포인트·스탯·스킬. */
export function sheetSig(state) {
  const p = state && state.player;
  if (!p) return '';
  const stats = Object.entries(p.stats || {}).map(([k, v]) => `${k}${v}`).join('');
  const skills = Object.entries(p.skills || {}).map(([k, v]) => `${k}${v}`).join('');
  const traits = Object.entries(p.traits || {}).map(([k, v]) => `${k}${v}`).join('');
  return [
    p.level, p.exp, p.hp, p.traitPoints || 0, p.skillPoints || 0,
    stats, skills, traits, bagSig(state),
  ].join('|');
}
