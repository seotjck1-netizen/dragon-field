const DS = ['battle', 'targets', 'tdrops', 'sets', 'items', 'quests', 'consts'];
const CLS = { warrior: '용사', ranger: '사냥꾼', mage: '마법사' };
const KNOBS = [
  { group: '경험치', items: [
    ['EXP_BASE', '필요 경험치 시작값', 1, 1, 1000],
    ['EXP_GROWTH', '레벨마다 필요 경험치 ×', 0.01, 1.01, 2],
    ['EXP_GAIN', '몬스터 경험치 눈금', 0.05, 0.05, 10],
    ['BOSS_EXP_GAIN', '보스 경험치 눈금(위에 한 번 더)', 0.05, 0.01, 10],
    ['QUEST_EXP_GAIN', '의뢰 경험치 눈금', 0.05, 0, 10],
    ['GAP_STEP', '레벨 차 1마다 경험치 ±', 0.01, 0, 0.5],
    ['GAP_MAX', '높은 몬스터 경험치 천장(배)', 0.5, 1, 99],
  ] },
  { group: '보스', items: [
    ['BOSS_RESPAWN_S', '보스가 다시 서기까지(초)', 5, 5, 3600],
    ['BOSS_MIN_WIN', '보스를 되풀이해 잡는 최소 승률', 0.05, 0, 1],
  ] },
  { group: '경제', items: [
    ['GOLD_MULT', '골드 배율', 0.05, 0, 10],
    ['DROP_MULT', '떨어지는 것 배율', 0.05, 0, 10],
    ['ENH_COST_BASE', '강화 골드 시작값', 1, 0, 100000],
    ['ENH_COST_GROWTH', '강화 골드 단계마다 ×', 0.05, 1, 5],
    ['GEM_PRICE', '보석 노인 한 알 값', 50000, 0, 100000000],
  ] },
  { group: '사냥 방식', items: [
    ['BATTLE_SPEED', '전투 보는 속도', 'speed'],
    ['TRAVEL_S', '다음 몬스터까지 걷는 시간(초)', 1, 0, 120],
    ['DEATH_S', '지면 잃는 시간(초)', 5, 0, 600],
    ['TOWN_S', '마을에 들르는 시간(초)', 5, 0, 600],
    ['MIN_WIN', '잡몹 사냥터 최소 승률', 0.05, 0, 1],
    ['QUEST_MAX_MIN', '의뢰 하나에 들일 시간(분)', 1, 0, 120],
    ['SIM_MINUTES', '흉내 낼 시간', 'minutes'],
  ] },
];
const KNOB_KEYS = KNOBS.flatMap((g) => g.items.map((i) => i[0]));
const METRICS = [
  ['level', '레벨'], ['cp', '전투력'], ['atk', '공격력'], ['hp', '체력'], ['def', '방어력'], ['enh', '강화'],
  ['exp_min', '분당 경험치'], ['gold_earned', '번 골드'], ['gold', '들고 있는 골드'], ['boss_kills', '보스 잡은 수'],
  ['mon_cp', '상대 전투력'], ['got_demon_core', '악마의 핵'], ['got_magic_stone', '마력석'], ['got_herb', '약초'], ['got_gems', '보석'],
];
const SET_SHORT = ['처음', '강철', '화염', '용린', '룬', '룬+인장'];
const ui = { cmp: new Set(['level', 'cp', 'atk', 'exp_min', 'gold_earned', 'mon_cp']), mode: 'index', cx: 'min', sort: ['level', 1],
  span: 'all', before: true, knobsOpen: false, built: false, hashDone: false, whatKey: null, what: null };

const $ = (s) => document.querySelector(s);
// 큰 수는 만 · 억으로. 1.0만 처럼 끝의 .0 은 떼어 낸다
const ko = (n) => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  const f = (v, d) => String(+v.toFixed(d));
  if (a >= 1e8) return f(n / 1e8, a >= 1e9 ? 0 : 1) + '억';
  if (a >= 1e4) return f(n / 1e4, a >= 1e5 ? 0 : 1) + '만';
  if (a >= 100) return d3.format(',')(Math.round(n));
  return f(+n, a >= 10 ? 1 : 2);
};
const mins = (m) => {
  if (m == null) return '—';
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return m < 60 ? `${Math.round(m)}분` : r ? `${h}시간 ${r}분` : `${h}시간`;
};
const pct = (p) => `${p > 0 ? '+' : ''}${(p * 100).toFixed(Math.abs(p) < 0.1 ? 1 : 0)}%`;
const cls = () => dash.params().cls || 'warrior';
const el = (tag, cl, text) => { const e = document.createElement(tag); if (cl) e.className = cl; if (text != null) e.textContent = text; return e; };

// ── 바꿔 보기 ──────────────────────────────────────────────
const baseConsts = () => { const d = dash.data('consts'); return d.status === 'ok' ? d.data : []; };
const defaults = () => Object.fromEntries(baseConsts().map((r) => [r.key, Number(r.value)]));
function overrides() {
  const p = dash.params(), def = defaults(), o = {};
  for (const k of KNOB_KEYS) if (p[k] != null && Number(p[k]) !== def[k]) o[k] = Number(p[k]);
  return o;
}
function whatIf() {
  const o = overrides();
  if (!Object.keys(o).length) return null;
  const key = JSON.stringify(o);
  if (ui.whatKey === key && ui.what) return ui.what;
  const rows = {};
  for (const id of DS) rows[id] = dash.data(id).data;
  const consts = rows.consts.map((r) => (r.key in o ? { ...r, value: o[r.key] } : r));
  const model = window.DFB.sim(rows.battle, rows.targets, rows.tdrops, rows.sets, rows.items, rows.quests, consts).map((r) => ({ variant: 'now', ...r }));
  ui.what = { model, milestones: window.DFB.milestones(model), goals: window.DFB.goals(model), consts };
  ui.whatKey = key;
  return ui.what;
}
function buildKnobs() {
  const D = defaults();
  const labels = Object.fromEntries(baseConsts().map((r) => [r.key, r.label]));
  const old = { GAP_MAX: D.OLD_GAP_MAX, BOSS_RESPAWN_S: D.OLD_BOSS_RESPAWN_S };
  const presets = [
    ['지금 게임 값', {}],
    [`0.70.38 값 — 천장 없음 · 보스 ${D.OLD_BOSS_RESPAWN_S}초`, old],
    ['0.70.38 + 관리자 리젠(보스 20초 · 전투 건너뛰기)', { ...old, BOSS_RESPAWN_S: 20, BATTLE_SPEED: 20 }],
    [`보스 경험치 ${D.BOSS_EXP_GAIN} → ${D.BOSS_EXP_GAIN / 2}`, { BOSS_EXP_GAIN: D.BOSS_EXP_GAIN / 2 }],
    ['보스 3분', { BOSS_RESPAWN_S: 180 }],
  ];
  $('#presets').replaceChildren(...presets.map(([t, v]) => {
    const b = el('button', 'bd-chip', t);
    b.type = 'button';
    b.addEventListener('click', () => {
      const keep = cls();
      dash.resetParams();
      dash.setParams({ cls: keep, ...v });
    });
    return b;
  }));
  const box = $('#knob-groups');
  box.replaceChildren();
  for (const g of KNOBS) {
    const wrap = el('div', 'bd-knob-group');
    wrap.append(el('h3', null, g.group));
    for (const [key, label, step, min, max] of g.items) {
      const row = el('div', 'bd-knob');
      row.dataset.key = key;
      const lab = el('label', null, label);
      lab.htmlFor = `knob-${key}`;
      let input;
      const sel = step === 'speed' || step === 'minutes';
      if (sel) {
        input = document.createElement('select');
        const opts = step === 'speed' ? [['1', '1배(그대로)'], ['4', '4배(Shift)'], ['20', '거의 건너뛰기']]
          : [['300', '5시간'], ['720', '12시간'], ['1440', '하루'], ['2880', '이틀']];
        for (const [v, t] of opts) input.append(new Option(t, v));
      } else {
        input = document.createElement('input');
        input.type = 'number';
        input.step = String(step);
        input.min = String(min);
        input.max = String(max);
        input.inputMode = 'decimal';
      }
      input.id = `knob-${key}`;
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (!isFinite(v)) return;
        const val = sel ? v : Math.min(max, Math.max(min, v));
        dash.setParams({ [key]: val === defaults()[key] ? null : val });
      });
      // 풀이가 이름을 되풀이할 뿐이면 싣지 않는다
      const bare = (t) => String(t || '').replace(/[^0-9A-Za-z가-힣]/g, '');
      const hint = labels[key] || '';
      row.append(lab, input, ...(hint && !bare(label).includes(bare(hint)) && !bare(hint).startsWith(bare(label)) ? [el('small', null, hint)] : []));
      wrap.append(row);
    }
    box.append(wrap);
  }
  ui.built = true;
}
function syncKnobs() {
  const p = dash.params(), def = defaults();
  for (const row of document.querySelectorAll('.bd-knob')) {
    const key = row.dataset.key;
    const input = row.querySelector('input, select');
    const v = p[key] != null ? Number(p[key]) : def[key];
    if (input !== document.activeElement) input.value = String(v);
    row.classList.toggle('is-changed', p[key] != null && Number(p[key]) !== def[key]);
  }
  const n = Object.keys(overrides()).length;
  $('#changed').hidden = !n;
  $('#changed-n').textContent = `바꾼 값 ${n}개 — 붉은 점선`;
}
$('#knob-toggle').addEventListener('click', () => {
  ui.knobsOpen = !ui.knobsOpen;
  $('#knobs').hidden = !ui.knobsOpen;
  $('#knob-toggle').setAttribute('aria-expanded', String(ui.knobsOpen));
  if (ui.knobsOpen) dash.setLink('knobs');
});
$('#knob-reset').addEventListener('click', () => {
  const keep = cls();
  dash.resetParams();
  dash.setParams({ cls: keep });
});
for (const b of document.querySelectorAll('#cls-seg button')) b.addEventListener('click', () => dash.setParams({ cls: b.dataset.cls }));
for (const b of document.querySelectorAll('#span-seg button')) b.addEventListener('click', () => { ui.span = b.dataset.span; draw(); });
$('#before-toggle').addEventListener('click', () => { ui.before = !ui.before; draw(); });

// ── 그림 연장 ──────────────────────────────────────────────
function legend(box, items) {
  box.replaceChildren(...items.map(([name, color, kind, op]) => {
    const s = el('span');
    const b = el('b');
    if (kind === 'dash') { b.className = 'dash'; b.style.borderTopColor = color; }
    else if (kind === 'star') { b.className = 'star'; b.style.color = color; b.textContent = '★'; }
    else { b.style.background = color; if (kind === 'bar' || kind === 'rug' || kind === 'dot') b.className = kind; }
    if (op) b.style.opacity = op;
    s.append(b, document.createTextNode(name));
    return s;
  }));
}
function fail(box) {
  box.replaceChildren(el('div', 'bd-fail', 'Failed to load'));
}
// 로그 눈금 — 값은 1 · 10 · 100 …(두 자리 안쪽이면 2 · 5 도), 시간(분)은 1분 · 3분 · 10분 · 30분 · 1시간 · 3시간 · 10시간 · 하루 · 이틀.
// 범위는 위아래로 가장 가까운 눈금까지 넓혀서 맨 위 · 맨 아래에 늘 글자가 붙게 한다.
const TIME_TICKS = [1, 3, 10, 30, 60, 180, 600, 1440, 2880, 5760];
const TIME_TICKS_WIDE = [1, 10, 60, 360, 1440, 5760];
function logScaleTicks(lo, hi, time, maxN) {
  let c;
  if (time) {
    c = TIME_TICKS;
    const b0 = [...c].reverse().find((v) => v <= lo * 1.0001) ?? c[0], t0 = c.find((v) => v >= hi * 0.9999) ?? c[c.length - 1];
    if (c.filter((v) => v >= b0 && v <= t0).length > maxN) c = TIME_TICKS_WIDE;
  } else {
    c = [];
    const e0 = Math.floor(Math.log10(lo)), e1 = Math.ceil(Math.log10(hi));
    for (let e = e0; e <= e1; e++) for (const m of e1 - e0 <= 2 ? [1, 2, 5] : [1]) c.push(m * Math.pow(10, e));
  }
  const bottom = [...c].reverse().find((v) => v <= lo * 1.0001) ?? c[0];
  const top = c.find((v) => v >= hi * 0.9999) ?? c[c.length - 1];
  let ticks = c.filter((v) => v >= bottom && v <= top);
  if (ticks.length > maxN) {
    const k = Math.ceil((ticks.length - 1) / (maxN - 1));
    ticks = ticks.filter((v, i) => (ticks.length - 1 - i) % k === 0);
  }
  return { domain: [bottom, top], ticks };
}
const timeFmt = (v) => (v >= 2880 && v % 1440 === 0 ? `${v / 1440}일` : v === 1440 ? '하루' : v >= 60 ? `${+(v / 60).toFixed(1)}시간` : `${v}분`);
function chart(box, cfg) {
  box.replaceChildren();
  const W = Math.max(240, box.clientWidth || 600);
  const H = cfg.height || 240;
  box.style.minHeight = `${H}px`;
  const [xa, xb] = cfg.x.domain;
  const okp = (p) => p.y != null && isFinite(p.y) && (!cfg.y.log || p.y > 0) && p.x >= xa && p.x <= xb;
  // 구간 막대(w)는 구간이 통째로 들어올 때만
  const series = cfg.series.map((s) => ({ ...s, data: (s.data || []).filter((p) => okp(p) && (!(s.w > 1) || p.x + s.w <= xb + 1e-9)) })).filter((s) => s.data.length);
  if (!series.length) return 0;
  const all = series.filter((s) => s.kind !== 'rug').flatMap((s) => s.data);
  let [y0, y1] = all.length ? d3.extent(all, (p) => p.y) : [1, 2];
  if (cfg.y.min != null) y0 = cfg.y.min;
  else if (!cfg.y.log && cfg.y.zero !== false) y0 = Math.min(0, y0);
  if (cfg.y.max != null) y1 = cfg.y.fixed ? cfg.y.max : Math.max(y1, cfg.y.max);
  if (y0 === y1) y1 = y0 + (cfg.y.log ? y0 : 1);
  const rug = series.some((s) => s.kind === 'rug');
  const m = { t: rug ? 22 : 10, r: 14, b: 26, l: 0 };
  const ih0 = H - m.t - m.b;
  let domain, ticks;
  if (cfg.y.log) ({ domain, ticks } = logScaleTicks(y0, y1, cfg.y.time, ih0 < 130 ? 3 : 6));
  else if (cfg.y.ticks) { domain = cfg.y.fixed ? [y0, y1] : d3.extent([...cfg.y.ticks, y0, y1]); ticks = cfg.y.ticks.filter((t) => t >= domain[0] && t <= domain[1]); }
  else {
    const s = d3.scaleLinear([y0, y1], [0, 1]);
    if (!cfg.y.fixed) s.nice(ih0 < 130 ? 3 : 5);
    domain = s.domain();
    ticks = s.ticks(ih0 < 130 ? 3 : 5);
  }
  const yfmt = cfg.y.fmt || (cfg.y.time ? timeFmt : ko);
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img');
  if (cfg.label) svg.attr('aria-label', cfg.label);
  const probe = svg.append('text').attr('font-size', 12).style('font-family', 'var(--font-anthropic-sans)');
  let tw = 0;
  for (const t of ticks) { probe.text(yfmt(t)); tw = Math.max(tw, probe.node().getComputedTextLength()); }
  probe.remove();
  m.l = Math.max(cfg.minLeft || 0, Math.ceil(tw) + 12);
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = d3.scaleLinear([xa, xb], [m.l, m.l + iw]);
  const y = (cfg.y.log ? d3.scaleLog() : d3.scaleLinear()).domain(domain).range([m.t + ih, m.t]).clamp(true);
  const g = svg.append('g');
  for (const t of ticks) {
    g.append('line').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', 'var(--cds-chart-grid)').attr('stroke-width', 1);
    g.append('text').attr('x', m.l - 8).attr('y', y(t)).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 12).attr('fill', 'var(--color-fg-muted)').text(yfmt(t));
  }
  // 가로 눈금 — 글자 폭을 재서 서로 닿지 않게 고른다
  const xfmt = cfg.x.fmt || String;
  let xt = cfg.x.ticks ? cfg.x.ticks(iw) : null;
  if (!xt) {
    const steps = cfg.x.steps || [1, 2, 5, 10, 20, 50];
    // 칸 폭(W)으로 고른다 — 이웃한 그림끼리 눈금 간격이 같아진다
    const fit = steps.find((st) => (xb - xa) / st <= Math.max(2, W / (cfg.x.gap || 56))) || steps[steps.length - 1];
    xt = [];
    for (let v = Math.ceil(xa / fit) * fit; v <= xb; v += fit) xt.push(v);
    if (cfg.x.first && xt[0] !== xa) xt.unshift(xa);
  }
  xt = xt.filter((v) => v >= xa && v <= xb);
  const xprobe = svg.append('text').attr('font-size', 12).style('font-family', 'var(--font-anthropic-sans)');
  let lastR = -Infinity;
  for (const v of xt) {
    xprobe.text(xfmt(v));
    const w = xprobe.node().getComputedTextLength();
    let cx = x(v);
    const anchor = cx - w / 2 < m.l - 6 ? 'start' : cx + w / 2 > m.l + iw + m.r ? 'end' : 'middle';
    const left = anchor === 'start' ? cx : anchor === 'end' ? cx - w : cx - w / 2;
    if (left < lastR + 8) continue;
    lastR = left + w;
    g.append('text').attr('x', cx).attr('y', m.t + ih + 18).attr('text-anchor', anchor).attr('font-size', 12).attr('fill', 'var(--color-fg-muted)').text(xfmt(v));
  }
  xprobe.remove();
  g.append('line').attr('x1', m.l).attr('x2', m.l + iw).attr('y1', m.t + ih).attr('y2', m.t + ih).attr('stroke', 'var(--cds-chart-axis)');
  for (const r of cfg.refs || []) {
    if (r.x == null || r.x < xa || r.x > xb) continue;
    g.append('line').attr('x1', x(r.x)).attr('x2', x(r.x)).attr('y1', m.t).attr('y2', m.t + ih).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '4 3');
    if (r.label) g.append('text').attr('x', x(r.x) + 4).attr('y', m.t + 10).attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(r.label);
  }
  const base = y.domain()[0] > 0 || cfg.y.log ? y.domain()[0] : 0;
  const unit = iw / Math.max(1, xb - xa);
  for (const s of series) {
    const col = s.color;
    if (s.kind === 'bar') {
      const span = s.w || 1;
      const bw = Math.max(1, Math.min(32, span * unit * (span > 1 ? 0.8 : 0.72)));
      const at = (p) => (span > 1 ? x(p.x + span / 2) : x(p.x));
      g.append('g').selectAll('rect').data(s.data).join('rect')
        .attr('x', (p) => at(p) - bw / 2).attr('width', bw)
        .attr('y', (p) => Math.min(y(p.y), y(base))).attr('height', (p) => Math.max(1, Math.abs(y(base) - y(p.y))))
        .attr('rx', Math.min(4, bw / 2)).attr('fill', col).attr('opacity', s.opacity || 1);
    } else if (s.kind === 'rug') {
      g.append('g').selectAll('line').data(s.data).join('line')
        .attr('x1', (p) => x(p.x)).attr('x2', (p) => x(p.x)).attr('y1', 3).attr('y2', 12)
        .attr('stroke', col).attr('stroke-width', Math.max(1, Math.min(3, unit))).attr('opacity', s.opacity || 0.9);
    } else if (s.kind === 'dots' || s.kind === 'star') {
      const r = s.kind === 'star' ? 7 : (s.r || 3);
      const sel = g.append('g').selectAll('path').data(s.data).join('path')
        .attr('transform', (p) => `translate(${x(p.x)},${y(p.y)})`)
        .attr('d', d3.symbol(s.kind === 'star' ? d3.symbolStar : d3.symbolCircle, r * r * 3.2))
        .attr('fill', col).attr('opacity', s.opacity || 1);
      if (s.kind === 'star') sel.attr('stroke', 'var(--color-panel)').attr('stroke-width', 1.5);
    } else {
      const line = d3.line().x((p) => x(p.x)).y((p) => y(p.y)).curve(s.kind === 'step' ? d3.curveStepAfter : d3.curveLinear);
      g.append('path').datum(s.data).attr('d', line).attr('fill', 'none').attr('stroke', col)
        .attr('stroke-width', s.width || 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
        .attr('stroke-dasharray', s.dash ? '5 4' : null).attr('opacity', s.opacity || 1);
    }
  }
  const tip = el('div', 'bd-tip');
  tip.hidden = true;
  box.append(tip);
  const rule = g.append('line').attr('y1', m.t).attr('y2', m.t + ih).attr('stroke', 'var(--cds-chart-reference)').attr('opacity', 0);
  const dots = g.append('g');
  const show = (ev) => {
    const [mx] = d3.pointer(ev, svg.node());
    const scale = W / (svg.node().getBoundingClientRect().width || W);
    const xv = Math.max(xa, Math.min(xb, Math.round(x.invert(mx))));
    rule.attr('x1', x(xv)).attr('x2', x(xv)).attr('opacity', 1);
    dots.selectAll('*').remove();
    const lines = [];
    for (const s of series) {
      if (s.kind === 'rug' || s.tip === false) continue;
      let p;
      if (s.kind === 'bar' && s.w > 1) p = s.data.find((q) => xv >= q.x && xv < q.x + s.w);
      else if (s.kind === 'step' || !s.kind || s.kind === 'line') {
        // 그 분의 값 — 없으면(구간 밖) 바로 앞 값
        let lo = 0, hi = s.data.length - 1, idx = -1;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (s.data[mid].x <= xv) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
        p = idx >= 0 && (s.kind === 'step' || s.data[idx].x === xv) ? s.data[idx] : null;
      } else p = s.data.find((q) => q.x === xv);
      if (!p) continue;
      if (s.kind !== 'bar') dots.append('circle').attr('cx', x(p.x === xv ? xv : xv)).attr('cy', y(p.y)).attr('r', 3.5).attr('fill', s.color).attr('opacity', s.opacity || 1);
      lines.push([s.name, s.color, (s.fmt || cfg.tipFmt || yfmt)(p.y, p), s.rank ?? 50]);
    }
    lines.sort((a, b) => a[3] - b[3]);
    if (!lines.length) { tip.hidden = true; return; }
    tip.replaceChildren(el('div', 't', (cfg.x.tip || ((v) => String(v)))(xv)), ...lines.map(([n, c, v]) => {
      const r = el('div', 'r');
      const i = el('i');
      i.style.background = c;
      r.append(i, document.createTextNode(n), el('em', null, v));
      return r;
    }));
    tip.hidden = false;
    const bw = box.getBoundingClientRect().width;
    const px = x(xv) / (scale || 1);
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, px + 14 + w > bw ? px - 14 - w : px + 14)}px`;
    tip.style.top = `${m.t / (scale || 1)}px`;
  };
  svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', iw).attr('height', ih).attr('fill', 'transparent')
    .on('pointermove', show).on('pointerleave', () => { tip.hidden = true; rule.attr('opacity', 0); dots.selectAll('*').remove(); });
  return m.l;
}
// 글자 폭(px) — 그림 왼쪽 여백을 맞출 때
function textWidth(box, texts, size = 11) {
  const svg = d3.select(box).append('svg').attr('width', 0).attr('height', 0).style('position', 'absolute');
  const t = svg.append('text').attr('font-size', size).style('font-family', 'var(--font-anthropic-sans)');
  let w = 0;
  for (const s of texts) { t.text(s); w = Math.max(w, t.node().getComputedTextLength()); }
  svg.remove();
  return Math.ceil(w);
}
// 한 벌 띠 — 줄마다(지금 · 0.70.38 · 바꾼 값) 입고 있던 한 벌을 색 칸으로, 칸이 넓으면 이름을 적는다
function bands(box, cfg) {
  box.replaceChildren();
  const rows = cfg.rows.filter((r) => r.data.length);
  const RH = 18, GAP = 6;
  const H = 8 + rows.length * (RH + GAP) + 20;
  box.style.minHeight = `${H}px`;
  if (!rows.length) return;
  const W = Math.max(240, box.clientWidth || 600);
  const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('class', 'bd-band');
  const probe = svg.append('text').attr('font-size', 11).style('font-family', 'var(--font-anthropic-sans)');
  let lw = 0;
  for (const r of rows) { probe.text(r.label); lw = Math.max(lw, probe.node().getComputedTextLength()); }
  const [xa, xb] = cfg.x.domain;
  const l = Math.max(cfg.left || 0, Math.ceil(lw) + 12), rr = 14;
  const x = d3.scaleLinear([xa, xb], [l, W - rr]);
  // 칸 색의 밝기를 재서 글자를 검게 · 희게
  const lum = (c) => {
    const p = el('span'); p.style.color = c; box.append(p);
    const m = getComputedStyle(p).color.match(/\d+(\.\d+)?/g) || [0, 0, 0];
    p.remove();
    const [r, g, b] = m.map(Number).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ink = cfg.colors.map((c) => (lum(c) > 0.35 ? '#1a1a1a' : '#ffffff'));
  rows.forEach((row, i) => {
    const top = 8 + i * (RH + GAP);
    svg.append('text').attr('x', l - 8).attr('y', top + RH / 2).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(row.label);
    // 같은 한 벌이 이어지는 구간으로 묶는다
    const segs = [];
    for (const p of row.data) {
      if (p.x < xa || p.x > xb) continue;
      const last = segs[segs.length - 1];
      if (last && last.set === p.set) last.x1 = p.x + 1; else segs.push({ set: p.set, x0: p.x, x1: p.x + 1 });
    }
    for (const s of segs) {
      const x0 = x(Math.max(xa, s.x0)), x1 = x(Math.min(xb, s.x1)), w = Math.max(1, x1 - x0);
      svg.append('rect').attr('x', x0).attr('y', top).attr('width', w).attr('height', RH).attr('fill', cfg.colors[s.set]).attr('opacity', row.opacity || 1)
        .append('title').text(`${row.label} · ${cfg.names[s.set]}`);
      const name = SET_SHORT[s.set] || String(s.set);
      probe.text(name);
      if (probe.node().getComputedTextLength() + 8 < w) {
        svg.append('text').attr('x', x0 + 5).attr('y', top + RH / 2).attr('dy', '0.32em').attr('font-size', 11).attr('fill', row.opacity && row.opacity < 1 ? 'var(--color-fg)' : ink[s.set]).text(name);
      }
    }
  });
  probe.remove();
  // 한 벌 색 풀이
  const key = el('div', 'bd-legend bd-band-key');
  legend(key, cfg.colors.map((c, i) => [SET_SHORT[i] || String(i), c, 'bar']));
  key.style.paddingLeft = `${l}px`;
  box.append(key);
}
const twoPanels = (box, h1 = 200, h2 = 110) => {
  box.replaceChildren();
  const a = el('div', 'bd-chart'), b = el('div', 'bd-chart');
  a.style.minHeight = `${h1}px`; b.style.minHeight = `${h2}px`;
  box.append(a, b);
  return [a, b];
};
// 시간 축(분) — 글자가 닿지 않는 가장 촘촘한 간격으로
const minX = (end) => ({ domain: [0, end], steps: end >= 180 ? [60, 120, 180, 240, 360, 480, 720] : [15, 30, 60], gap: 64,
  fmt: (v) => (v === 0 ? '0' : v % 60 === 0 ? `${v / 60}시간` : `${v}분`), tip: (v) => mins(v) });
const lvX = { domain: [1, 50], steps: [5, 10], first: true, gap: 40, tip: (v) => `Lv.${v}` };
// 10분 평균(앞뒤 5분) — 마을에 들른 분이 톱니처럼 꺼지는 것을 편다
const smooth = (list, k, w = 10) => list.map((r, i) => {
  let s = 0, n = 0;
  for (let j = Math.max(0, i - w / 2); j < Math.min(list.length, i + w / 2); j++) { s += Number(list[j][k]) || 0; n++; }
  return { ...r, [k]: n ? s / n : r[k] };
});
// 구간마다 오른 값(막대)
// 줄 t 는 t+1 분째 — 구간 [t, t+step) 분 동안 오른 값
const gains = (list, k, step) => {
  const out = [];
  for (let t = 0; t < list.length; t += step) {
    const a = Number(list[Math.max(0, t - 1)][k]), b = Number(list[Math.min(list.length - 1, t + step - 1)][k]);
    out.push({ x: t, y: b - a });
  }
  return out;
};

// ── 그리기 ─────────────────────────────────────────────────
function draw() {
  const ids = [...DS, 'model', 'milestones', 'goals'];
  const states = ids.map((id) => dash.data(id).status);
  const charts = ['#ch-lt', '#ch-time', '#ch-exp', '#ch-src', '#ch-cmp', '#ch-gear', '#ch-power', '#ch-attack', '#ch-gold', '#ch-hunt', '#ch-bosses', '#ch-mon', '#ch-mats'];
  for (const b of document.querySelectorAll('#cls-seg button')) b.setAttribute('aria-pressed', String(b.dataset.cls === cls()));
  for (const b of document.querySelectorAll('#span-seg button')) b.setAttribute('aria-pressed', String(b.dataset.span === ui.span));
  $('#before-toggle').setAttribute('aria-pressed', String(ui.before));
  if (states.some((s) => s === 'error')) {
    for (const s of charts) fail($(s));
    for (const e of document.querySelectorAll('.dash-skeleton')) e.classList.remove('dash-skeleton');
    return;
  }
  if (states.some((s) => s !== 'ok')) return;
  if (!ui.built) buildKnobs();
  syncKnobs();
  for (const e of document.querySelectorAll('.dash-skeleton')) e.classList.remove('dash-skeleton');
  const K = dash.colors;
  const WC = 'var(--cds-chart-status-critical)';        // 바꾼 값
  const BC = 'var(--cds-chart-reference)';              // 0.70.38 — 견주는 기준선
  const OC = 'var(--color-warn)';                       // 사용자가 잰 값
  const D = defaults();
  const model = dash.data('model').data, ms = dash.data('milestones').data, goals = dash.data('goals').data;
  const what = whatIf();
  const c = cls(), name = CLS[c] || c;
  const byMin = (a, b) => a.minute - b.minute;
  const rows = model.filter((r) => r.class === c && r.variant === 'now').sort(byMin);
  const brows = ui.before ? model.filter((r) => r.class === c && r.variant === 'v0_70_38').sort(byMin) : null;
  const allB = model.filter((r) => r.class === c && r.variant === 'v0_70_38').sort(byMin);
  const wrows = what ? what.model.filter((r) => r.class === c).sort(byMin) : null;
  const mrows = ms.filter((r) => r.class === c).sort((a, b) => a.level - b.level);
  const wms = what ? what.milestones.filter((r) => r.class === c).sort((a, b) => a.level - b.level) : null;
  const goal = (list, v, k) => (list || []).find((x) => x.class === c && x.variant === v && x.goal === k) || null;
  const SIM = D.SIM_MINUTES;
  const WSIM = what ? Number((what.consts.find((r) => r.key === 'SIM_MINUTES') || {}).value || SIM) : SIM;
  const END = ui.span === 'first' ? Math.min(300, Math.max(SIM, WSIM)) : Math.max(SIM, WSIM);
  for (const b of document.querySelectorAll('#span-seg button')) if (b.dataset.span === 'all') b.textContent = `전부(${mins(Math.max(SIM, WSIM))})`;
  const XM = minX(END);
  const mp = (list, f) => (list || []).map((r) => ({ x: Number(r.minute), y: f(r), r }));
  const lp = (list, f) => (list || []).map((r) => ({ x: Number(r.level), y: f(r), r }));
  const gapTxt = (g) => (g >= 99 ? '없음' : `${g}배`);
  const until = (v) => (v == null ? `${mins(SIM)} 안에 못 감` : mins(v));

  // 머리말
  {
    const n = (k) => goal(goals, 'now', k), b = (k) => goal(goals, 'v0_70_38', k);
    const t = (k) => `${until((n(k) || {}).value)}(0.70.38 ${until((b(k) || {}).value)})`;
    let take = `${name} — 지금 값(레벨 차 천장 ${gapTxt(D.GAP_MAX)} · 보스 ${mins(D.BOSS_RESPAWN_S / 60)})으로 Lv.45까지 ${t('lv45')}, Lv.50까지 ${t('lv50')}, 룬 한 벌 +15까지 ${t('rune15')}. 모은 경험치 가운데 보스 몫은 ${(n('boss_share') || {}).value}%(0.70.38 ${(b('boss_share') || {}).value}%)입니다.`;
    if (what) {
      const w = (k) => until((goal(what.goals, 'now', k) || {}).value);
      take += ` 바꾼 값으로는 Lv.45 ${w('lv45')} · Lv.50 ${w('lv50')} · +15 ${w('rune15')}.`;
    }
    $('#takeaway').textContent = take;
  }

  // 큰 숫자
  for (const [id, k, obs] of [['#kpi-45', 'lv45', D.OBS_L45_MIN], ['#kpi-50', 'lv50', null], ['#kpi-10', 'rune10', D.OBS_ENH10_MIN], ['#kpi-15', 'rune15', D.OBS_ENH15_MIN], ['#kpi-boss', 'boss_share', null]]) {
    const box = $(id), num = box.querySelector('.bd-kpi-num'), unit = box.querySelector('.bd-kpi-unit'), sub = box.querySelector('.bd-kpi-sub');
    const time = k !== 'boss_share';
    const g = goal(goals, 'now', k), bg = goal(goals, 'v0_70_38', k);
    const v = g ? (time ? g.hours : g.value) : null;
    num.dataset.where = `variant=now&class=${c}&goal=${k}`;
    num.textContent = v == null ? '—' : time ? v.toFixed(1) : String(v);
    unit.hidden = v == null;
    const parts = [];
    if (time && v == null) parts.push(`${mins(SIM)} 안에 못 감`);
    if (bg) {
      const was = el('span', 'was', `0.70.38 ${time ? (bg.value == null ? '못 감' : mins(bg.value)) : `${bg.value}%`}`);
      if (time && g && g.value != null && bg.value != null && bg.value > 0) was.textContent += ` (×${(g.value / bg.value).toFixed(1)})`;
      parts.push(was);
    }
    if (obs != null) parts.push(el('span', 'was', `사용자 ${mins(obs)}`));
    if (what) {
      const w = goal(what.goals, 'now', k);
      const span = el('span', 'was');
      const wv = w ? w.value : null;
      if (time && g && g.value != null && wv != null) {
        // 빠른 것이 좋은지 나쁜지는 보는 사람이 정한다 — 색 없이 바꾼 쪽만 굵게
        const d = wv / Math.max(1, g.value) - 1;
        span.className = 'was bd-what';
        span.textContent = `바꾸면 ${mins(wv)} (${pct(d)})`;
      } else { span.className = 'was bd-what'; span.textContent = `바꾸면 ${wv == null ? '못 감' : time ? mins(wv) : `${wv}%`}`; }
      parts.push(span);
    }
    sub.replaceChildren();
    parts.forEach((p, i) => { if (i) sub.append(document.createTextNode(' · ')); sub.append(p); });
  }

  // ① 시간에 따른 레벨 — 세 직업 · 0.70.38 · 바꾼 값 · 사용자
  const clsKeys = Object.keys(CLS).filter((k) => model.some((r) => r.class === k));
  legend($('#lg-lt'), [...clsKeys.map((k, i) => [CLS[k], K[i], 'line']), ...(brows ? [[`0.70.38(${name})`, BC, 'line']] : []),
    ...(wrows ? [[`바꾼 값(${name})`, WC, 'dash']] : []), ['사용자가 잰 값(0.70.38)', OC, 'star']]);
  chart($('#ch-lt'), {
    height: 300, x: XM, y: { min: 1, max: 50, fixed: true, ticks: [1, 10, 20, 30, 40, 50], fmt: (v) => `Lv.${Math.round(v)}` },
    series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'step', width: 1.75, rank: 90, data: mp(brows, (r) => r.level), fmt: (v, p) => `Lv.${v} · ${p.r.doing}` }] : []),
      ...clsKeys.map((k, i) => ({ name: CLS[k], color: K[i], kind: 'step', width: k === c ? 2.5 : 1.5, opacity: k === c ? 1 : 0.55, rank: k === c ? 0 : 10 + i,
        data: mp(model.filter((r) => r.class === k && r.variant === 'now').sort(byMin), (r) => r.level), fmt: (v, p) => `Lv.${v} · ${p.r.doing}` })),
      { name: `바꾼 값(${name})`, color: WC, kind: 'step', dash: true, rank: 95, data: mp(wrows, (r) => r.level), fmt: (v) => `Lv.${v}` },
      { name: '사용자(0.70.38)', color: OC, kind: 'star', data: [{ x: D.OBS_L45_MIN, y: 45 }], fmt: () => `Lv.45 · ${mins(D.OBS_L45_MIN)}` },
    ],
  });

  // ② 레벨에 따른 시간
  legend($('#lg-time'), [['닿은 시각', K[0], 'line'], ['머문 시간', K[1], 'bar'], ...(ui.before ? [['0.70.38 닿은 시각', BC, 'line']] : []), ...(wms ? [['바꾼 값', WC, 'dash']] : [])]);
  chart($('#ch-time'), {
    x: lvX, y: { log: true, time: true },
    series: [
      { name: '머문 시간', color: K[1], kind: 'bar', opacity: 0.85, data: lp(mrows, (r) => r.stay), fmt: (v) => mins(v) },
      ...(ui.before ? [{ name: '0.70.38', color: BC, kind: 'line', width: 1.75, rank: 90, data: lp(mrows.filter((r) => r.before_minute > 0), (r) => r.before_minute), fmt: (v) => mins(v) }] : []),
      { name: '닿은 시각', color: K[0], kind: 'line', data: lp(mrows.filter((r) => r.minute > 0), (r) => r.minute), fmt: (v) => mins(v) },
      { name: '바꾼 값', color: WC, kind: 'line', dash: true, data: lp(wms && wms.filter((r) => r.minute > 0), (r) => r.minute), fmt: (v) => mins(v) },
    ],
  });

  // ③ 레벨에 따른 경험치
  {
    const need = (L, C) => (L >= C.MAX_LEVEL ? null : Math.floor(C.EXP_BASE * Math.pow(C.EXP_GROWTH, L - 1)));
    const WD = what ? Object.fromEntries(what.consts.map((r) => [r.key, Number(r.value)])) : null;
    const earn = (list) => {
      const by = {};
      for (const r of list || []) if (r.level < D.MAX_LEVEL) (by[r.level] ||= []).push(r.exp_min);
      return Object.entries(by).map(([L, v]) => ({ x: Number(L), y: v.reduce((a, b) => a + b, 0) / v.length }));
    };
    const changedNeed = WD && (WD.EXP_BASE !== D.EXP_BASE || WD.EXP_GROWTH !== D.EXP_GROWTH);
    legend($('#lg-exp'), [['필요 경험치', K[0], 'line'], ['1분에 번 경험치', K[1], 'line'], ...(brows ? [['0.70.38 번 경험치', BC, 'line']] : []), ...(what ? [['바꾼 값', WC, 'dash']] : [])]);
    chart($('#ch-exp'), {
      x: lvX, y: { log: true },
      series: [
        { name: '필요 경험치', color: K[0], kind: 'line', data: Array.from({ length: 49 }, (_, i) => ({ x: i + 1, y: need(i + 1, D) })) },
        ...(brows ? [{ name: '0.70.38', color: BC, kind: 'line', width: 1.75, rank: 90, data: earn(brows) }] : []),
        { name: '1분에 번 경험치', color: K[1], kind: 'line', data: earn(rows) },
        { name: '필요(바꾼 값)', color: WC, kind: 'line', dash: true, width: 1.5, data: changedNeed ? Array.from({ length: 49 }, (_, i) => ({ x: i + 1, y: need(i + 1, WD) })) : [] },
        { name: '번 경험치(바꾼 값)', color: WC, kind: 'line', dash: true, width: 1.5, data: earn(wrows) },
      ],
    });
  }

  // ④ 경험치는 어디서
  {
    $('#src-note').textContent = `시간마다 모은 경험치를 잡몹 · 보스 · 의뢰로 나눈 몫. 나보다 높은 몬스터는 레벨마다 ${Math.round(D.GAP_STEP * 100)}%씩 더 주는데, 지금은 ${gapTxt(D.GAP_MAX)}에서 멈추고 보스는 ${mins(D.BOSS_RESPAWN_S / 60)}마다 다시 섭니다. 0.70.38 에는 천장이 ${gapTxt(D.OLD_GAP_MAX)}(30레벨 높으면 ${+(1 + 30 * D.GAP_STEP).toFixed(1)}배)이고 보스가 ${mins(D.OLD_BOSS_RESPAWN_S / 60)}마다 서서, 보스 한 마리가 잡몹 수백 마리 몫이었습니다.`;
    const share = (list, k) => mp(list, (r) => { const t = r.cum_exp_trash + r.cum_exp_boss + r.cum_exp_quest; return t ? (r[k] / t) * 100 : null; });
    legend($('#lg-src'), [['보스', K[0], 'line'], ['잡몹', K[1], 'line'], ['의뢰', K[2], 'line'], ...(brows ? [['보스(0.70.38)', BC, 'line']] : []), ...(wrows ? [['보스(바꾼 값)', WC, 'dash']] : [])]);
    const f = (v) => `${Math.round(v)}%`;
    chart($('#ch-src'), {
      x: XM, y: { fmt: f, min: 0, max: 100, fixed: true, ticks: [0, 25, 50, 75, 100] },
      series: [
        ...(brows ? [{ name: '보스(0.70.38)', color: BC, kind: 'line', width: 1.75, rank: 90, data: share(brows, 'cum_exp_boss'), fmt: f }] : []),
        { name: '보스', color: K[0], kind: 'line', data: share(rows, 'cum_exp_boss'), fmt: f },
        { name: '잡몹', color: K[1], kind: 'line', data: share(rows, 'cum_exp_trash'), fmt: f },
        { name: '의뢰', color: K[2], kind: 'line', data: share(rows, 'cum_exp_quest'), fmt: f },
        { name: '보스(바꾼 값)', color: WC, kind: 'line', dash: true, data: share(wrows, 'cum_exp_boss'), fmt: f },
      ],
    });
  }

  // ⑤ 모든 수치 비교
  {
    const seg = (box, opts, cur, set) => box.replaceChildren(...opts.map(([k, t]) => {
      const b = el('button', null, t);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(cur === k));
      b.addEventListener('click', () => { set(k); draw(); });
      return b;
    }));
    seg($('#cmp-x'), [['min', '가로축: 시간'], ['lv', '레벨']], ui.cx, (k) => { ui.cx = k; });
    seg($('#cmp-mode'), [['index', '처음 대비 배수'], ['raw', '값 그대로']], ui.mode, (k) => { ui.mode = k; });
    const picked = METRICS.filter(([k]) => ui.cmp.has(k));
    const colorOf = (k) => K[picked.findIndex(([q]) => q === k) % K.length];
    $('#cmp-chips').replaceChildren(...METRICS.map(([k, t]) => {
      const b = el('button', 'bd-chip');
      b.type = 'button';
      const i = el('i');
      if (ui.cmp.has(k)) i.style.background = colorOf(k);
      b.append(i, document.createTextNode(t));
      b.setAttribute('aria-pressed', String(ui.cmp.has(k)));
      b.addEventListener('click', () => { if (ui.cmp.has(k)) ui.cmp.delete(k); else ui.cmp.add(k); draw(); });
      return b;
    }));
    const byLevel = (list) => {
      const out = [];
      for (const r of list || []) if (!out.length || r.level > out[out.length - 1].level) out.push(r);
      return out;
    };
    const tf = (list0, k) => {
      const list = k === 'exp_min' ? smooth(list0 || [], 'exp_min') : list0 || [];
      const src = ui.cx === 'lv' ? byLevel(list) : list;
      const v = src.map((r) => ({ x: ui.cx === 'lv' ? Number(r.level) : Number(r.minute), y: r[k] == null ? null : Number(r[k]) }));
      if (ui.mode === 'raw') return v;
      const first = v.find((p) => p.y > 0);
      return v.map((p) => ({ x: p.x, y: first && p.y > 0 ? p.y / first.y : null }));
    };
    const fm = ui.mode === 'index' ? (v) => `×${ko(v)}` : ko;
    const series = [];
    for (const [k, t] of picked) {
      series.push({ name: t, color: colorOf(k), kind: 'line', data: tf(rows, k), fmt: fm });
      if (wrows) series.push({ name: `${t}(바꾼 값)`, color: colorOf(k), kind: 'line', dash: true, width: 1.5, data: tf(wrows, k), fmt: fm });
    }
    if (series.length) chart($('#ch-cmp'), { height: 320, x: ui.cx === 'lv' ? lvX : XM, y: { log: true, fmt: fm }, series });
    else $('#ch-cmp').replaceChildren();
  }

  // ⑥ 장비와 강화 — 위: 강화 · 아래: 한 벌 띠
  {
    const [a, b] = twoPanels($('#ch-gear'), 200, 0);
    const bandLabels = ['지금', ...(brows ? ['0.70.38'] : []), ...(wrows ? ['바꾼 값'] : [])];
    legend($('#lg-gear'), [['강화(부위 평균)', K[0], 'line'], ...(brows ? [['0.70.38', BC, 'line']] : []), ...(wrows ? [['바꾼 값', WC, 'dash']] : []), ['사용자가 잰 값(0.70.38)', OC, 'star']]);
    const ml = chart(a, { height: 200, x: XM, minLeft: textWidth(a, bandLabels) + 12, y: { min: 0, max: 15, fixed: true, ticks: [0, 5, 10, 15], fmt: (v) => `+${Math.round(v)}` }, series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'step', width: 1.75, rank: 90, data: mp(brows, (r) => r.enh), fmt: (v, p) => `+${v} · ${p.r.set_name}` }] : []),
      { name: '강화', color: K[0], kind: 'step', data: mp(rows, (r) => r.enh), fmt: (v, p) => `+${v} · ${p.r.set_name}` },
      { name: '강화(바꾼 값)', color: WC, kind: 'step', dash: true, data: mp(wrows, (r) => r.enh), fmt: (v) => `+${v}` },
      { name: '사용자(0.70.38)', color: OC, kind: 'star', data: [{ x: D.OBS_ENH10_MIN, y: 10 }, { x: D.OBS_ENH15_MIN, y: 15 }], fmt: (v) => `+${v}` },
    ] });
    const setNames = Object.fromEntries(dash.data('sets').data.map((s) => [Number(s.set), s.name]));
    bands(b, {
      x: XM, left: ml,
      colors: [2, 3, 4, 5, 6, 7].map((i) => `var(--cds-chart-sequential-${i})`), names: setNames,
      rows: [
        { label: '지금', data: rows.map((r) => ({ x: Number(r.minute), set: Number(r.set) })) },
        ...(brows ? [{ label: '0.70.38', opacity: 0.45, data: brows.map((r) => ({ x: Number(r.minute), set: Number(r.set) })) }] : []),
        ...(wrows ? [{ label: '바꾼 값', data: wrows.map((r) => ({ x: Number(r.minute), set: Number(r.set) })) }] : []),
      ],
    });
  }
  const bucket = END <= 300 ? 10 : END <= 720 ? 30 : 60;
  const bucketTxt = bucket < 60 ? `${bucket}분` : '1시간';

  // ⑦ 전투력
  {
    const [a, b] = twoPanels($('#ch-power'), 200, 110);
    legend($('#lg-power'), [['내 전투력', K[0], 'line'], ['상대 전투력', K[1], 'line'], ...(brows ? [['0.70.38 내 전투력', BC, 'line']] : []), [`${bucketTxt}마다 오른 전투력`, K[2], 'bar'], ...(wrows ? [['바꾼 값', WC, 'dash']] : [])]);
    chart(a, { height: 200, x: XM, y: { log: true }, series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'line', width: 1.75, rank: 90, data: mp(brows, (r) => r.cp) }] : []),
      { name: '상대', color: K[1], kind: 'step', width: 1.5, data: mp(rows, (r) => r.mon_cp), fmt: (v, p) => `${ko(v)} · ${p.r.doing}` },
      { name: '내 전투력', color: K[0], kind: 'line', data: mp(rows, (r) => r.cp) },
      { name: '내 전투력(바꾼 값)', color: WC, kind: 'line', dash: true, data: mp(wrows, (r) => r.cp) },
    ] });
    chart(b, { height: 110, x: XM, y: {}, series: [
      { name: `${bucketTxt} 동안 오른 전투력`, color: K[2], kind: 'bar', w: bucket, data: gains(rows, 'cp', bucket) },
    ] });
  }
  // ⑧ 공격력 · 체력
  {
    const [a, b] = twoPanels($('#ch-attack'), 200, 110);
    legend($('#lg-attack'), [['공격력', K[0], 'line'], ['체력 ÷ 10', K[3], 'line'], ...(brows ? [['0.70.38 공격력', BC, 'line']] : []), [`${bucketTxt}마다 오른 공격력`, K[2], 'bar'], ...(wrows ? [['공격력(바꾼 값)', WC, 'dash']] : [])]);
    chart(a, { height: 200, x: XM, y: {}, series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'line', width: 1.75, rank: 90, data: mp(brows, (r) => r.atk) }] : []),
      { name: '체력 ÷ 10', color: K[3], kind: 'line', width: 1.5, data: mp(rows, (r) => r.hp / 10), fmt: (v) => `${ko(v * 10)} (체력)` },
      { name: '공격력', color: K[0], kind: 'line', data: mp(rows, (r) => r.atk) },
      { name: '공격력(바꾼 값)', color: WC, kind: 'line', dash: true, data: mp(wrows, (r) => r.atk) },
    ] });
    chart(b, { height: 110, x: XM, y: {}, series: [
      { name: `${bucketTxt} 동안 오른 공격력`, color: K[2], kind: 'bar', w: bucket, data: gains(rows, 'atk', bucket) },
    ] });
  }

  // ⑨ 골드
  legend($('#lg-gold'), [['번 골드(누적)', K[0], 'line'], ['쓴 골드(누적)', K[1], 'line'], ['들고 있는 골드', K[2], 'line'], ...(brows ? [['0.70.38 번 골드', BC, 'line']] : []), ...(wrows ? [['번 골드(바꾼 값)', WC, 'dash']] : [])]);
  chart($('#ch-gold'), { x: XM, y: { log: true }, series: [
    ...(brows ? [{ name: '0.70.38 번 골드', color: BC, kind: 'line', width: 1.75, rank: 90, data: mp(brows, (r) => r.gold_earned) }] : []),
    { name: '들고 있는', color: K[2], kind: 'line', width: 1, opacity: 0.6, data: mp(rows, (r) => r.gold) },
    { name: '쓴 골드', color: K[1], kind: 'line', data: mp(rows, (r) => r.gold_spent) },
    { name: '번 골드', color: K[0], kind: 'line', data: mp(rows, (r) => r.gold_earned) },
    { name: '번 골드(바꾼 값)', color: WC, kind: 'line', dash: true, data: mp(wrows, (r) => r.gold_earned) },
  ] });

  // ⑩ 무엇을 잡고 있나
  {
    const [a, b] = twoPanels($('#ch-hunt'), 200, 110);
    legend($('#lg-hunt'), [['사냥한 곳(단계)', K[0], 'line'], ['보스를 잡으러 간 분', K[1], 'rug'], ['승률', K[2], 'line'], ...(wrows ? [['바꾼 값', WC, 'dash']] : [])]);
    const stageFmt = (v) => (v > 20 ? `감옥${Math.round(v) - 20}` : `${Math.round(v)}단계`);
    chart(a, { height: 200, x: XM, y: { min: 1, max: 25, fixed: true, ticks: [1, 5, 10, 15, 20, 25], fmt: stageFmt }, series: [
      { name: '보스', color: K[1], kind: 'rug', data: mp(rows.filter((r) => r.act_boss), (r) => r.act_stage) },
      { name: '사냥한 곳', color: K[0], kind: 'step', data: mp(rows, (r) => r.act_stage), fmt: (v, p) => `${p.r.doing}${p.r.why ? ` (${p.r.why})` : ''}` },
      { name: '바꾼 값', color: WC, kind: 'step', dash: true, data: mp(wrows, (r) => r.act_stage), fmt: (v, p) => p.r.doing },
    ] });
    chart(b, { height: 110, x: XM, y: { min: 0, max: 1, fixed: true, ticks: [0, 0.5, 1], fmt: (v) => `${Math.round(v * 100)}%` }, series: [
      { name: '승률', color: K[2], kind: 'line', width: 1.5, data: mp(rows, (r) => r.win) },
    ] });
  }

  // ⑪ 보스 잡은 수 · 의뢰
  {
    const [a, b] = twoPanels($('#ch-bosses'), 200, 110);
    legend($('#lg-bosses'), [['보스 잡은 수(누적)', K[0], 'line'], ['끝낸 의뢰', K[1], 'line'], ...(brows ? [['0.70.38', BC, 'line']] : []), ...(wrows ? [['바꾼 값', WC, 'dash']] : [])]);
    const kf = (v) => `${ko(v)}마리`;
    chart(a, { height: 200, x: XM, y: { fmt: ko }, series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'line', width: 1.75, rank: 90, data: mp(brows, (r) => r.boss_kills), fmt: kf }] : []),
      { name: '보스 잡은 수', color: K[0], kind: 'line', data: mp(rows, (r) => r.boss_kills), fmt: kf },
      { name: '바꾼 값', color: WC, kind: 'line', dash: true, data: mp(wrows, (r) => r.boss_kills), fmt: kf },
    ] });
    const qn = dash.data('quests').data.length;
    const qf = (v) => `${v} / ${qn}`;
    chart(b, { height: 110, x: XM, y: { min: 0, max: qn, fixed: true, ticks: [0, Math.round(qn / 2), qn], fmt: String }, series: [
      ...(brows ? [{ name: '0.70.38', color: BC, kind: 'step', width: 1.75, rank: 90, data: mp(brows, (r) => r.quests_done), fmt: qf }] : []),
      { name: '끝낸 의뢰', color: K[1], kind: 'step', data: mp(rows, (r) => r.quests_done), fmt: qf },
      { name: '바꾼 값', color: WC, kind: 'step', dash: true, data: mp(wrows, (r) => r.quests_done), fmt: qf },
    ] });
  }

  // ⑫ 몬스터 세기
  {
    const tg = dash.data('targets').data;
    const stages = [...new Set(tg.map((t) => Number(t.stage)))].sort((p, q) => p - q);
    const nameOf = Object.fromEntries(tg.map((t) => [Number(t.stage), t.map_name]));
    const trash = stages.map((s) => { const l = tg.filter((t) => Number(t.stage) === s && t.kind === 'trash'); return l.length ? { x: s, y: l.reduce((p, t) => p + Number(t.cp), 0) / l.length } : null; }).filter(Boolean);
    const boss = tg.filter((t) => t.kind === 'boss').map((t) => ({ x: Number(t.stage), y: Number(t.cp), t }));
    const last = stages[stages.length - 1];
    legend($('#lg-mon'), [['잡몹 평균 전투력', K[0], 'bar'], ['보스 전투력', K[1], 'dot']]);
    chart($('#ch-mon'), {
      x: { domain: [1, last], ticks: () => [1, 5, 10, 15, 20, last].filter((v, i, a) => a.indexOf(v) === i), fmt: (v) => (v > 20 ? `감옥${v - 20}` : String(v)), tip: (v) => (v > 20 ? nameOf[v] || `지하감옥 ${v - 20}층` : `${v}단계 · ${nameOf[v] || ''}`) },
      y: { log: true }, refs: last > 20 ? [{ x: 20.5, label: '지하감옥' }] : [], series: [
        { name: '잡몹', color: K[0], kind: 'bar', data: trash },
        { name: '보스', color: K[1], kind: 'dots', r: 5, data: boss, fmt: (v, p) => `${ko(v)} · ${p.t.name} Lv.${p.t.level}` },
      ] });
  }

  // ⑬ 재료 · 보석 — 모은 양(누적)
  {
    const mats = [['got_demon_core', '악마의 핵'], ['got_magic_stone', '마력석'], ['got_herb', '약초'], ['got_gems', '보석']];
    legend($('#lg-mats'), [...mats.map(([, t], i) => [t, K[i], 'line']), ...(brows ? [['옅은 선 — 0.70.38', BC, 'line']] : [])]);
    chart($('#ch-mats'), { x: XM, y: { log: true }, series: [
      ...(brows ? mats.map(([k, t], i) => ({ name: `${t}(0.70.38)`, color: K[i], kind: 'line', width: 1.25, opacity: 0.35, data: mp(brows, (r) => r[k]) })) : []),
      ...mats.map(([k, t], i) => ({ name: t, color: K[i], kind: 'line', data: mp(rows, (r) => r[k]) })),
    ] });
  }

  // ⑭ 표
  {
    const [k, dir] = ui.sort;
    const val = (r) => (r[k] == null ? Infinity * dir : Number(r[k]) || 0);
    const sorted = mrows.slice().sort((p, q) => (val(p) - val(q)) * dir);
    $('#tbl tbody').replaceChildren(...sorted.map((r) => {
      const tr = document.createElement('tr');
      tr.dataset.key = `${r.class},${r.level}`;
      const cells = [
        [String(r.level)], [d3.format(',')(r.minute)], [r.before_minute == null ? '—' : d3.format(',')(r.before_minute)], [r.stay == null ? '—' : d3.format(',')(r.stay)],
        [r.doing, 'l wrap'], [`${Math.round(r.win * 100)}%`], [d3.format(',')(r.exp_min)], [r.set_name, 'l'], [`+${r.enh}`], [d3.format(',')(r.cp)], [d3.format(',')(r.gold_earned)],
      ];
      tr.append(...cells.map(([t, cl]) => { const td = el('td', cl || null, t); return td; }));
      return tr;
    }));
    for (const th of document.querySelectorAll('#tbl th')) {
      const b = th.querySelector('button');
      th.setAttribute('aria-sort', b && b.dataset.sort === k ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    }
  }
  $('#method-old').textContent = `레벨 차 경험치 천장 ${gapTxt(D.OLD_GAP_MAX)} · 보스 ${mins(D.OLD_BOSS_RESPAWN_S / 60)}마다(지금은 ${gapTxt(D.GAP_MAX)} · ${mins(D.BOSS_RESPAWN_S / 60)}마다)`;
  $('#method-asof').textContent = `전투 표는 칸마다 ${D.SAMPLES}판 · 걷는 시간 ${D.TRAVEL_S}초 · 전투 ${D.BATTLE_SPEED}배속으로 보고, ${mins(SIM)} 동안 흉내 냅니다`;

  if (!ui.hashDone) {
    ui.hashDone = true;
    const named = document.getElementById(location.hash.slice(1));
    if (named) {
      if (named.id === 'knobs') { ui.knobsOpen = true; named.hidden = false; $('#knob-toggle').setAttribute('aria-expanded', 'true'); }
      named.scrollIntoView();
    }
  }
}
for (const b of document.querySelectorAll('#tbl th button')) {
  b.addEventListener('click', () => {
    const k = b.dataset.sort;
    ui.sort = [k, ui.sort[0] === k ? -ui.sort[1] : 1];
    draw();
  });
}
dash.onData(draw);
