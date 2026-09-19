// 책임: 창을 다시 그릴 때 **스크롤 위치와 입력 중이던 자리**를 잃지 않게 한다.
// 금지: 게임 상태 접근, 이벤트 발행.
//
// ── 왜 다시 만들었나 (0.70.8) ───────────────────────────────
//
// 이 버그는 세 번째다. 0.40 에 소지품, 0.64 에 운영자 창, 이번에 설정 창과
// 소지품의 **장비 띠**(가로 스크롤). 매번 "그 창을 고쳤다" 로 끝냈기 때문에
// 매번 다시 났다. 고쳐야 했던 것은 창이 아니라 **방식**이었다.
//
// 무엇이 문제였나:
//   창은 상태가 바뀌면 innerHTML 을 통째로 갈아 끼운다(간단해서 좋다).
//   그러면 스크롤은 전부 0 으로 돌아간다. 예전 방식은 이것을 막으려면
//     ① 그 창이 captureScroll/restoreScroll 을 **부르고**
//     ② 스크롤이 생기는 칸마다 data-keep-scroll="..." 을 **붙여야** 했다.
//   둘 중 하나만 빠져도 조용히 되돌아간다. 창 열두 개 중 다섯 개만 ①을 했고,
//   ②는 세로 목록에만 붙어 있었다 — 그래서 가로로 미는 장비 띠는 처음부터
//   한 번도 기억된 적이 없었다. 반지는 띠의 오른쪽 끝에 있으니 누를 때마다
//   맨 왼쪽으로 튀었다.
//
// 어떻게 바꿨나 — **표시를 안 해도 저절로 기억한다.**
//   · 스크롤된 칸을 attribute 로 찾지 않고, 지금 **실제로 밀려 있는 칸을 전부** 찾는다.
//   · 되돌릴 때는 **자리(몇 번째 자식의 몇 번째 자식…)** 로 같은 칸을 찾는다.
//     어차피 같은 코드가 같은 모양을 다시 그리므로 자리는 그대로다.
//   · 글자를 치던 칸이 있으면 **초점과 커서 자리**까지 돌려놓는다.
//     값을 고치는 도중에 다시 그려져도 손이 튕겨 나가지 않는다.
//   · 창은 innerHTML 대신 setHtml() 을 쓴다. 그러면 위 모든 것이 딸려 온다.
//
// ⚠ 새 창을 만들 때 `el.innerHTML = ...` 를 쓰면 **tools/check-ui.js 가 막는다.**
//   (npm test 와 회귀에 들어 있다) 그 자리를 setHtml(el, ...) 로 바꾸거나,
//   정말 스크롤과 상관없는 자리면 바로 윗줄에 `// innerHTML-ok: 이유` 를 적는다.
//   사람의 기억에 기대지 않는 것이 이 파일의 요점이다.

const raf =
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);

/** root 안에서 node 가 있는 자리를 '0/3/2' 같은 글로 적는다. */
function pathOf(root, node) {
  const parts = [];
  let cur = node;
  while (cur && cur !== root) {
    const parent = cur.parentNode;
    if (!parent) return null;
    parts.push(Array.prototype.indexOf.call(parent.children, cur));
    cur = parent;
  }
  return cur === root ? parts.reverse().join('/') : null;
}

/** pathOf 가 적어 둔 자리로 다시 찾아간다. 모양이 달라졌으면 null. */
function nodeAt(root, path) {
  if (path === '') return root;
  let cur = root;
  for (const part of path.split('/')) {
    if (!cur) return null;
    cur = cur.children[Number(part)];
  }
  return cur || null;
}

/** 글자를 치는 칸인가 (초점과 커서를 돌려놓을 값어치가 있는가). */
function isTextField(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  return !['checkbox', 'radio', 'button', 'submit', 'file', 'range', 'color'].includes(el.type);
}

/**
 * 지금 밀려 있는 칸들과, 글자를 치던 자리를 기억한다.
 *
 * **표시(data-keep-scroll)를 붙이지 않아도 된다.** 실제로 밀려 있으면 기억한다.
 * 표시가 붙어 있으면 그것을 먼저 쓴다 — 모양이 조금 바뀌어도 따라간다.
 *
 * @param {HTMLElement} root
 * @returns {{scrolls:Array, focus:object|null}}
 */
export function captureScroll(root) {
  if (!root || !root.querySelectorAll) return { scrolls: [], focus: null };

  const scrolls = [];
  const note = (el) => {
    if (!el.scrollTop && !el.scrollLeft) return;
    const key = el.getAttribute && el.getAttribute('data-keep-scroll');
    const path = pathOf(root, el);
    if (key == null && path == null) return;
    scrolls.push({ key: key || null, path, top: el.scrollTop, left: el.scrollLeft });
  };
  note(root);
  for (const el of root.querySelectorAll('*')) note(el);

  // 글자를 치던 칸 — 초점과 커서 자리.
  // ⚠ 이 창 안에 초점이 있을 때만 기억한다. 남의 칸을 뺏어 오면 안 된다.
  let focus = null;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && active !== root && root.contains && root.contains(active)) {
    const path = pathOf(root, active);
    if (path != null) {
      focus = { path, text: isTextField(active) };
      if (focus.text) {
        try {
          focus.start = active.selectionStart;
          focus.end = active.selectionEnd;
        } catch { /* number 칸 등은 selection 을 안 준다 — 초점만 돌려놓는다 */ }
      }
    }
  }

  return { scrolls, focus };
}

/**
 * 기억해 둔 자리로 되돌린다. 내용이 짧아졌으면 브라우저가 알아서 잘라 준다.
 * @param {HTMLElement} root
 * @param {{scrolls:Array, focus:object|null}} saved
 */
export function restoreScroll(root, saved) {
  if (!root || !saved) return;
  const { scrolls = [], focus = null } = saved;
  if (!scrolls.length && !focus) return;

  const find = (s) =>
    (s.key && root.querySelector(`[data-keep-scroll="${s.key}"]`)) || nodeAt(root, s.path);

  const put = () => {
    for (const s of scrolls) {
      const el = find(s);
      if (!el) continue;
      if (s.top) el.scrollTop = s.top;
      if (s.left) el.scrollLeft = s.left;
    }
  };
  put();

  // 그림이 아직 안 잡혀 있으면(스크롤 길이가 0) 위에서 한 것이 먹지 않는다.
  // 한 프레임 뒤에 한 번 더 놓아 본다 — 그때는 길이가 잡혀 있다.
  const missed = scrolls.some((s) => {
    const el = find(s);
    return el && ((s.top && el.scrollTop !== s.top) || (s.left && el.scrollLeft !== s.left));
  });
  if (missed) raf(put);

  if (focus) {
    const el = nodeAt(root, focus.path);
    if (el && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
      if (focus.text && focus.start != null && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(focus.start, focus.end); } catch { /* 지원 안 하는 칸 */ }
      }
    }
  }
}

/**
 * innerHTML 을 갈아 끼우되 **스크롤과 입력 자리를 지킨다.**
 *
 * 창에서는 `el.innerHTML = html` 대신 언제나 이것을 쓴다.
 *
 * @param {HTMLElement} el
 * @param {string} html
 */
export function setHtml(el, html) {
  if (!el) return;
  const keep = captureScroll(el);
  el.innerHTML = html;
  restoreScroll(el, keep);
}
