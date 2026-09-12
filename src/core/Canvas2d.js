// 책임: 브라우저마다 있는 것과 없는 것이 다른 캔버스 기능을 한 겹 감싼다.
// 왜 필요한가: ctx.roundRect() 는 사파리 16.4 이상에만 있다.
//   아이폰을 업데이트하지 않은 사람의 화면에서는 이 한 줄 때문에 그리기가 통째로 멈춘다.
// 금지: 게임 상태 접근.

/**
 * 모서리가 둥근 사각형 경로를 만든다(채우기·선긋기는 호출한 쪽에서 한다).
 * ctx.roundRect 가 있으면 그것을 쓰고, 없으면 직접 그린다.
 */
export function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
