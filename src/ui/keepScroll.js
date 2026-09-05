// 책임: 창을 통째로 다시 그릴 때 스크롤 위치를 잃지 않게 한다.
// 금지: 게임 상태 접근, 이벤트 발행.
//
// 이 게임의 창들은 상태가 바뀌면 innerHTML 을 통째로 새로 만든다(간단해서 좋다).
// 그런데 그러면 목록의 스크롤이 매번 맨 위로 돌아간다.
// 아래로 한참 내려가서 아이템을 누르면 목록이 위로 튀어 올라
// "엉뚱한 것이 골라졌다" 또는 "눌러도 안 골라진다"로 보인다.
//
// 쓰는 법 — 다시 그리기 직전에 기억하고, 다 그린 뒤에 되돌린다.
//   const keep = captureScroll(this.root);
//   this.root.innerHTML = ...;
//   restoreScroll(this.root, keep);

/**
 * 지금 스크롤된 영역들의 위치를 기억한다.
 * @param {HTMLElement} root
 * @param {string} [selector] 기억할 영역들(기본: 스크롤이 생길 수 있는 것 전부)
 * @returns {Array<{sel:string, top:number, left:number}>}
 */
export function captureScroll(root, selector = '[data-keep-scroll]') {
  if (!root) return [];
  const out = [];
  for (const el of root.querySelectorAll(selector)) {
    if (!el.scrollTop && !el.scrollLeft) continue;
    const key = el.getAttribute('data-keep-scroll');
    if (!key) continue;
    out.push({ sel: key, top: el.scrollTop, left: el.scrollLeft });
  }
  return out;
}

/**
 * 기억해 둔 위치로 되돌린다. 내용이 짧아졌으면 브라우저가 알아서 잘라 준다.
 * @param {HTMLElement} root
 * @param {Array<{sel:string, top:number, left:number}>} saved
 */
export function restoreScroll(root, saved) {
  if (!root || !saved || !saved.length) return;
  for (const s of saved) {
    const el = root.querySelector(`[data-keep-scroll="${s.sel}"]`);
    if (!el) continue;
    el.scrollTop = s.top;
    el.scrollLeft = s.left;
  }
}
