// 책임: 직업 고르기 옆에 붙는 **성별 · 차림** 고르기와, 고른 몸의 미리보기 (0.70.26).
// 금지: 상태 수정. 고른 값은 부르는 쪽(LoginScreen · ClassPickPanel)이 들고 있다.
//
// 몸은 넷이다 — 남·여 × 깨끗한 차림·거친 차림(src/data/bodies.json). 직업과 **따로** 고른다:
// 어느 직업이든 어느 몸이든 된다. 그림에는 그 직업이 처음 들고 시작하는 무기를 쥐여 준다.

export const GENDERS = [['m', '남'], ['f', '여']];
export const STYLES = [['clean', '깨끗한 차림'], ['rugged', '거친 차림']];

/** 몸 id → {gender, style}. 모르면 남·깨끗. */
export function splitBody(bodyLook, bodyId) {
  const b = bodyLook && bodyLook.list().find((x) => x.id === bodyId);
  return b ? { gender: b.gender, style: b.style } : { gender: 'm', style: 'clean' };
}

/** 성별·차림 단추 두 줄. data-gender / data-style 로 눌린다. */
export function bodyPickHtml(sel) {
  const row = (name, list, on) => list
    .map(([v, label]) => `<button type="button" data-${name}="${v}" class="${v === on ? 'is-on' : ''}">${label}</button>`)
    .join('');
  return `
    <div class="body-pick">
      <div class="body-pick-row"><span>성별</span>${row('gender', GENDERS, sel.gender)}</div>
      <div class="body-pick-row"><span>차림</span>${row('style', STYLES, sel.style)}</div>
    </div>`;
}

/** 직업이 처음 쥐는 것 — 겉모습 미리보기에 쓴다(무기 · 투구 따위, 칸이 있는 것만). */
export function startLook(db, classId) {
  const cls = db && db.classes && db.classes.list && db.classes.list[classId];
  const look = {};
  for (const e of (cls && cls.startItems) || []) {
    const def = db.items && db.items[e.id];
    if (!def || !def.slot) continue;
    const slot = def.slot === 'ring' ? null : def.slot;
    if (slot && !look[slot]) look[slot] = e.id;
  }
  return look;
}

/**
 * root 안의 <canvas data-preview-class="warrior"> 들에 몸을 그린다.
 * 층 그림을 아직 안 읽었으면 읽은 뒤에 다시 그린다.
 */
export function paintPreviews(root, bodyLook, db, bodyId, scene = 'bstand') {
  if (!root || !bodyLook || !bodyLook.has(bodyId)) return;
  for (const cv of root.querySelectorAll('canvas[data-preview-class]')) {
    const look = startLook(db, cv.dataset.previewClass);
    const draw = () => {
      const a = bodyLook.get(bodyId, scene, look);
      if (!a) return;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingQuality = 'high';
      // 전투 장면(320) 가운데 아래 몸(192×256) 둘레만 잘라 칸에 맞춘다
      const s = a.srcW / 320;
      ctx.drawImage(a.image, 40 * s, 24 * s, 240 * s, 296 * s, 0, 0, cv.width, cv.height);
    };
    draw();
    bodyLook.prefetch(bodyId, look).then(draw);
  }
}
