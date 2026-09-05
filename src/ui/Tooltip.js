// 책임: 마우스를 올렸을 때(또는 손가락으로 눌렀을 때) 뜨는 설명 쪽지 하나.
// 금지: 게임 상태 접근, 저장. 넘겨받은 글만 보여 준다.
//
// 왜 title 속성을 안 쓰나:
//   ① 브라우저가 1초쯤 뜸을 들이고, 그 사이 사람은 "설명이 없나 보다" 하고 지나간다.
//   ② 줄바꿈과 색을 못 준다 — 보석 설명은 "이름 / 효과 / 왜"가 각각 다른 줄이어야 읽힌다.
//   ③ **폰에서는 아예 안 뜬다.** 마우스가 없으니까.
// 그래서 눌러도 뜨게 만든다.

let el = null;
let hideTimer = null;

function ensure() {
  if (el && el.isConnected) return el;
  el = document.createElement('div');
  el.className = 'tip-card';
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

/** 화면 밖으로 나가지 않게 자리를 잡는다. */
function place(anchor) {
  const box = anchor.getBoundingClientRect();
  const tip = el.getBoundingClientRect();
  const pad = 8;
  let left = box.left + box.width / 2 - tip.width / 2;
  left = Math.max(pad, Math.min(window.innerWidth - tip.width - pad, left));
  // 위에 자리가 없으면 아래로 내린다
  let top = box.top - tip.height - 10;
  if (top < pad) top = box.bottom + 10;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

export function showTip(anchor, lines) {
  const rows = (Array.isArray(lines) ? lines : [lines]).filter(Boolean);
  if (!rows.length) return;
  clearTimeout(hideTimer);
  const node = ensure();
  node.innerHTML = rows
    .map((r, i) =>
      typeof r === 'string'
        ? `<div class="tip-line${i === 0 ? ' tip-title' : ''}">${r}</div>`
        : `<div class="tip-line tip-${r.kind || 'plain'}">${r.text}</div>`
    )
    .join('');
  node.hidden = false;
  place(anchor);
}

export function hideTip() {
  if (!el) return;
  // 살짝 늦춘다 — 아이콘과 쪽지 사이를 지나갈 때 깜빡이지 않게.
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => { if (el) el.hidden = true; }, 60);
}

/**
 * 어떤 요소에 설명 쪽지를 붙인다.
 * @param {HTMLElement} node
 * @param {() => Array} getLines 그때그때 만들어 쓰도록 함수로 받는다
 */
export function attachTip(node, getLines) {
  node.addEventListener('mouseenter', () => showTip(node, getLines()));
  node.addEventListener('mouseleave', hideTip);
  // 폰 — 누르면 뜨고, 다른 곳을 누르면 사라진다.
  node.addEventListener('touchstart', (e) => {
    e.stopPropagation();
    showTip(node, getLines());
  }, { passive: true });
}

// 아무 데나 누르면 닫는다(폰에서 쪽지가 남아 있지 않게).
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', () => hideTip(), { passive: true });
  document.addEventListener('click', () => hideTip());
}
