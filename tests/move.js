// 이동 속도 못 박기 (0.80.01).
//
// 기본 걸음은 예전(0.70)의 1.2배로 고정, 질주의 물약은 없앴다.
// 더 빠르게는 특성 '날랜 발'(점당 +6%p)로만 — 다섯 점이면 +30%p, 합 150%(예전 물약을 마신 속도).
// 여관 버프의 이동 1.5배도 뺐다(남기면 천장 150% 를 넘는다).
// 장비 창에서 겉모습(성별 · 차림)을 바꾸던 단추도 0.80.01 에서 뺐다 — 그것도 여기서 본다.
//
// ⚠ 값을 일부러 바꿀 때는 이 시험도 같이 고친다 — 시험이 막으려는 것은 "모르고 되돌리기" 다.
//
// 브라우저 없이 돈다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ok = [], bad = [];
const check = (n, c, x = '') => (c ? ok : bad).push(n + (x ? ` — ${x}` : ''));
const near = (a, b) => Math.abs(a - b) < 1e-9;

(async () => {
  const { BALANCE: B } = await import(path.join(ROOT, 'src', 'data', 'formulas.js'));
  const { speedMultiplier } = await import(path.join(ROOT, 'src', 'systems', 'BuffSystem.js'));
  const rule = { base: B.MOVE_SPEED_BASE, max: B.MOVE_SPEED_BONUS_MAX };

  // ① 기본 1.2배 · 천장 +0.3
  check('기본 걸음은 1.2배(MOVE_SPEED_BASE)', B.MOVE_SPEED_BASE === 1.2, String(B.MOVE_SPEED_BASE));
  check('더하는 몫의 천장은 +0.3(MOVE_SPEED_BONUS_MAX)', B.MOVE_SPEED_BONUS_MAX === 0.3, String(B.MOVE_SPEED_BONUS_MAX));
  const st = { buffs: [] };
  check('보정이 없으면 1.2배', near(speedMultiplier(st, {}, rule), 1.2));
  check('날랜 발 다섯 점(+0.3)이면 1.5배', near(speedMultiplier(st, { moveSpeed: 0.3 }, rule), 1.5));
  check('더 쌓여도 1.5배에서 멈춘다', near(speedMultiplier(st, { moveSpeed: 0.9 }, rule), 1.5));
  // 옛 저장본에 남은 질주 버프(speedMult 1.5)는 더는 걸음을 바꾸지 않는다
  const old = { buffs: [{ id: 'haste', effects: { speedMult: 1.5 }, remaining: 60000 }] };
  check('옛 질주 버프는 무시한다', near(speedMultiplier(old, {}, rule), 1.2), String(speedMultiplier(old, {}, rule)));

  // ② 여관 — 회복만
  check('여관 버프에 이동 배수가 없다', !(B.INN_BUFF.effects || {}).speedMult, JSON.stringify(B.INN_BUFF.effects));

  // ③ 달리는 그림은 1.35배부터 — 기본(1.2)은 걷고, 날랜 발 셋째 점(1.38)부터 달린다
  check('달리기 잣대는 1.2 와 1.38 사이', B.RUN_FROM_SPEED > 1.2 && B.RUN_FROM_SPEED <= 1.38, String(B.RUN_FROM_SPEED));

  // ④ 표 — 질주의 물약이 어디에도 없다(src/data 와 서버 표 둘 다)
  for (const dir of ['src/data', 'server/content']) {
    const read = (f) => fs.readFileSync(path.join(ROOT, dir, f), 'utf8');
    for (const f of ['items.json', 'classes.json', 'npcs.json', 'drops.json', 'quests.json', 'manifest.json']) {
      if (!fs.existsSync(path.join(ROOT, dir, f))) continue;
      check(`${dir}/${f} 에 질주의 물약이 없다`, !/speed_potion/.test(read(f)));
    }
    // ⑤ 특성 '날랜 발' — 다섯 점 × 6%p = 30%p
    const T = JSON.parse(read('traits.json'));
    const sw = T.nodes && T.nodes.swift;
    check(`${dir} 특성에 날랜 발이 있다`, !!sw);
    if (sw) check(`${dir} 날랜 발 다섯 점이면 +30%p`, sw.max === 5 && near(sw.max * sw.mods.moveSpeed, 0.3), JSON.stringify(sw.mods));
  }
  check('sheets/items.csv 에도 질주의 물약이 없다', !/speed_potion/.test(fs.readFileSync(path.join(ROOT, 'sheets', 'items.csv'), 'utf8')));

  // ⑥ 장비 창에서 겉모습 바꾸기를 뺐다(만들 때 · 직업 고를 때만 고른다)
  const cp = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'CharacterPanel.js'), 'utf8');
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  check('장비 창에 성별 · 차림 단추가 없다', !/bodyPickHtml\(/.test(cp) && !/data-gender/.test(cp));
  check("'ui:setBody' 를 받는 곳이 없다", !/bus\.on\('ui:setBody'/.test(main));

  console.log('');
  for (const s of ok) console.log('  ✓', s);
  for (const s of bad) console.log('  ✗', s);
  console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
  process.exit(bad.length ? 1 : 0);
})();
