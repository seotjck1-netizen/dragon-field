#!/usr/bin/env node
/**
 * 스킬 트리 숫자를 다시 맞춘다 (0.80.29) — tools/skill-value.js 의 잣대로.
 *
 *   node tools/skill-rescale.js            맞춘 값과 표를 보여 주기만 한다(파일을 안 고친다)
 *   node tools/skill-rescale.js --write    src/data/skills.json · server/content/skills.json 의 effect · steps · desc 를 고친다
 *   node tools/skill-rescale.js --iter 8 --n 16
 *
 * 사용자(2026-11-22): 「57개 전부 다시 짜기」. 규칙(PROJECT-RULES 7):
 *   ① 같은 갈래에서 **깊은 단일수록 한 점이 세다** — 한 점의 값의 비 1단 1 · 2단 1.25 · 3단 1.5 · 궁극(1점) 4 · 숙련 1.25.
 *   ② 같은 직업의 갈래 셋은 다 찍었을 때 세기가 같다 — **지금 가장 센 갈래**에 맞춘다(그보다 센 빌드는 안 생긴다 →
 *      가장 센 빌드의 레벨업 · 보스는 지금 그대로).
 *   ③ 뿌리(0단 · 맨 처음 5점)는 그대로 둔다 — 레벨 초반의 세기를 흔들지 않는다.
 * 칸마다 배율 하나를 그 칸의 숫자 전부(effect · steps)에 곱한다. 문턱 · 켜기 · 발 수(lowHpThreshold · lowHpCrit ·
 * openerBonus)는 그대로. 재고 → 곱하고 → 다시 재기를 되풀이한다(짝 · 숙련이 서로 얽혀 있으므로).
 *
 * 파일은 **그 칸의 effect · steps · desc 줄만** 바꾼다(손으로 맞춘 서식 · 주석을 지키려고 통째로 다시 쓰지 않는다).
 * long(긴 설명)의 숫자는 손으로 고친다 — 바뀐 칸을 끝에 적어 준다.
 */
const fs = require('fs');
const path = require('path');
const V = require('./skill-value.js');

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const ITER = Number(arg('iter', 6));
const WRITE = process.argv.includes('--write');
const ROOT = path.resolve(__dirname, '..');
const FILES = ['src/data/skills.json', 'server/content/skills.json'];
const FIXED = new Set(['lowHpThreshold', 'lowHpCrit', 'openerBonus']);
// 한 점(궁극은 그 한 점)에 이 이상은 주지 않는다 — 확률은 100% 를 넘을 수 없어 키워도 어느 순간 값이 0 이 되고,
// 약한 효과를 숫자만 키우면 「처형 피해 +235%」 같은 말이 안 되는 수가 나온다. 여기에 걸린 칸은 끝에 적는다(효과를 바꿀 후보).
const PER_POINT_MAX = {
  doubleHit: 0.15, counterBonus: 0.12, evadeBonus: 0.05, absorbChance: 0.04, crit: 0.05,
  dmgReduction: 0.08, lifesteal: 0.06, magicResist: 0.12, pierce: 0.08, branchPower: 0.3,
  executeBonus: 1.2, thorns: 0.6, lowHpCritMult: 0.8, hpMult: 0.3, hpPct: 0.3, defPct: 0.3,
  critMult: 0.5, counterPowerBonus: 0.8, evadeRevenge: 0.6, openerPowerBonus: 1.2, chargeBonus: 1.2,
  cleaveBonus: 0.8, magicPower: 0.3, atkPct: 0.12, lastStandBonus: 0.4,
};
// 효과가 본디 약한 칸(최대 HP% · 가시 · 흡혈 · 2회 공격 천장 · 처형 · 흡수)은 숫자만 키워서는 단의 몫에 못 닿는다
// (위 상한에 걸린다). 그런 칸에는 결이 맞는 두 번째 효과를 붙인다 — 처음 값(맞추기 전). 맞추기는 칸 전체에 배율을 곱한다.
const ADD = {
  unbreakable: { lastStandBonus: 0.03 }, // 불굴의 심장 — 최대 HP + 치명상 버티기(받는 피해 감소는 강철 의지와 함께 천장 75% 에 닿는다)
  stout: { defPct: 0.05 },               // 굳센 몸 — 최대 HP + 방어력
  thorn_mail: { defPct: 0.04 },          // 가시 갑옷 — 가시(방어력 기준) + 방어력
  double_slash: { atkPct: 0.05 },        // 연격 — 2회 공격 + 공격력
  blood_taste: { atkPct: 0.05 },         // 피 맛 — 흡혈 + 공격력
  bloodthirst: { critMult: 0.12 },       // 광폭화 — 위기의 치명타 피해 + 치명타 피해
  slaughter: { critMult: 0.25 },         // 학살 — 처형 · 2회 공격 + 치명타 피해
  hunters_mark: { critMult: 0.05 },      // 사냥꾼의 표식 — 관통 + 치명타 피해
  read_wind: { dmgReduction: 0.01 },     // 바람 읽기 — 회피 + 받는 피해 감소
  afterimage: { evadeBonus: 0.015 },     // 잔상 — 최대 HP + 회피
  rapid_shot: { atkPct: 0.04 },          // 속사 — 2회 공격 + 공격력
  relentless: { critMult: 0.25 },        // 끝까지 쫓는다 — 처형 · 2회 공격 + 치명타 피해
  arcane_armor: { dmgReduction: 0.015 }, // 비전 갑주 — 받는 마법 피해 감소 + 받는 피해 감소
  absorb: { hpPct: 0.04 },               // 마력 흡수 — 흡수 확률 + 최대 HP
};
// 붙인 효과를 짧은 설명에 덧붙이는 말
const ADD_TEXT = {
  dmgReduction: (v) => `받는 피해 -${pct(v)}%`, defPct: (v) => `방어력 +${pct(v)}%`, atkPct: (v) => `공격력 +${pct(v)}%`,
  critMult: (v) => `치명타 피해 +${pct(v)}%`, evadeBonus: (v) => `회피 +${pct(v)}%p`, hpPct: (v) => `최대 HP +${pct(v)}%`,
  lastStandBonus: (v) => `치명상 버티기 +${pct(v)}%p`,
};
const pct = (v) => String(Math.round(v * 10000) / 100);

/** 그 칸에 곱할 수 있는 가장 큰 배율(효과 하나라도 상한에 닿으면 거기까지) — 궁극은 한 점이 네 몫이라 상한도 2.5 배 */
function maxFactor(def) {
  let f = 3;
  const k4 = def.tier === 4 ? 2.5 : 1;
  for (const [k, v] of Object.entries(def.effect || {})) {
    if (FIXED.has(k) || typeof v !== 'number' || v <= 0 || PER_POINT_MAX[k] == null) continue;
    f = Math.min(f, (PER_POINT_MAX[k] * k4) / v);
  }
  return f;
}
const CLASSES = ['warrior', 'ranger', 'mage'];

/** 화면에 보이기 좋은 값으로 — 0.1 아래는 0.25% 눈금, 1 아래는 0.5%, 그 위는 0.05 */
function nice(v, key) {
  if (key === 'atkFlat') return Math.max(1, Math.round(v));
  const a = Math.abs(v);
  const step = a < 0.1 ? 0.0025 : a < 1 ? 0.005 : 0.05;
  return Math.round(Math.round(v / step) * step * 10000) / 10000;
}

function scaleSkill(def, f) {
  const out = { ...def };
  if (def.effect) {
    out.effect = {};
    for (const [k, v] of Object.entries(def.effect)) out.effect[k] = FIXED.has(k) || typeof v !== 'number' ? v : v * f;
  }
  if (def.steps) {
    out.steps = {};
    for (const [k, arr] of Object.entries(def.steps)) out.steps[k] = arr.map((x) => x * f);
  }
  return out;
}

async function main() {
  const orig = JSON.parse(fs.readFileSync(path.join(ROOT, FILES[0]), 'utf8'));
  // 맞추기의 출발점 = 지금 표 + 두 번째 효과(ADD)
  const base = JSON.parse(JSON.stringify(orig));
  for (const [id, add] of Object.entries(ADD)) base.tree[id].effect = { ...base.tree[id].effect, ...add };
  let skills = JSON.parse(JSON.stringify(base));
  const origRes = {};
  { const m0 = await V.makeMeter('src', orig); for (const cls of CLASSES) origRes[cls] = V.valuesOf(m0, cls); }
  const factor = {}; // 처음 값에 대한 누적 배율
  const capped = {}; // 상한에 걸려 목표에 못 닿은 칸
  const unit = {}; // 갈래마다 한 점의 기준값
  const before = {};
  let last = null;
  for (let it = 0; it <= ITER; it++) {
    const meter = await V.makeMeter('src', skills);
    const res = {};
    for (const cls of CLASSES) res[cls] = V.valuesOf(meter, cls);
    if (it === 0) Object.assign(before, res);
    last = res;
    // 맞는지 — 갈래 합(뿌리 포함)과 단마다의 비
    const report = CLASSES.map((cls) => {
      const b = res[cls].branches;
      const tot = Object.values(b).map((x) => x.total);
      return `${V.NAME[cls]} 갈래 ${tot.map((x) => x.toFixed(3)).join(' / ')}`;
    }).join(' · ');
    console.log(`[${it}] ${report}`);
    if (it === ITER) break;
    for (const cls of CLASSES) {
      const r = res[cls];
      // 목표 — **지금 표**(두 번째 효과를 붙이기 전)에서 가장 센 갈래의 합(뿌리 포함). 그보다 센 빌드는 안 생긴다
      const target = Math.max(...Object.values(origRes[cls].branches).map((x) => x.total));
      for (const b of ['A', 'B', 'C']) {
        const rows = r.rows.filter((x) => x.branch === b);
        // 갈래마다 「한 점의 기준값」 u — 처음엔 지금 값의 평균, 바퀴마다 갈래 합이 목표에 못 미친 만큼 올린다.
        //   상한에 걸려 못 오르는 칸의 모자란 몫을 같은 갈래의 다른 칸이 떠안는다(갈래가 약해지지 않게).
        const key = cls + b;
        if (unit[key] == null) {
          const sumV = rows.reduce((a, x) => a + Math.max(0, x.v), 0);
          const sumW = rows.reduce((a, x) => a + V.WEIGHT[x.tier] * x.max, 0);
          unit[key] = sumV / sumW;
        } else {
          unit[key] *= Math.pow(target / Math.max(1e-6, r.branches[b].total), 1.5);
        }
        for (const x of rows) {
          const want = V.WEIGHT[x.tier] * x.max * unit[key];
          const f = Math.min(2, Math.max(0.5, Math.pow(want / Math.max(1e-4, x.v), 0.6)));
          const cum = Math.min(maxFactor(base.tree[x.id]), Math.max(0.33, (factor[x.id] || 1) * f));
          capped[x.id] = cum >= maxFactor(base.tree[x.id]) - 1e-9 && want > x.v * 1.1;
          factor[x.id] = cum;
          skills.tree[x.id] = scaleSkill(base.tree[x.id], cum);
        }
      }
    }
  }
  // 반올림한 값으로 마지막에 한 번 더 잰다
  for (const id of Object.keys(factor)) {
    const d = skills.tree[id];
    if (d.effect) for (const k of Object.keys(d.effect)) if (!FIXED.has(k) && typeof d.effect[k] === 'number') d.effect[k] = nice(d.effect[k], k);
    if (d.steps) for (const k of Object.keys(d.steps)) d.steps[k] = d.steps[k].map((x) => Math.round(x * 4) / 4);
  }
  const meter = await V.makeMeter('src', skills);
  console.log('\n== 맞춘 뒤(반올림한 값) ==');
  const table = [];
  for (const cls of CLASSES) {
    const r = V.valuesOf(meter, cls);
    console.log(`\n${V.NAME[cls]} — 갈래 합 ${Object.entries(r.branches).map(([b, x]) => `${b} ${x.total.toFixed(3)}`).join(' · ')} (처음 ${Object.entries(before[cls].branches).map(([b, x]) => `${b} ${x.total.toFixed(3)}`).join(' · ')})`);
    for (const x of r.rows) {
      const old = before[cls].rows.find((y) => y.id === x.id);
      const d = skills.tree[x.id], o = orig.tree[x.id];
      console.log(`  ${x.branch.padEnd(4)} ${x.tier} ${x.name.padEnd(10)} 1단 대비 ${old.ratio == null ? '  - ' : old.ratio.toFixed(2)} → ${x.ratio == null ? '  - ' : x.ratio.toFixed(2)} (규칙 ${V.WEIGHT[x.tier]})  ${JSON.stringify(o.effect || o.steps)} → ${JSON.stringify(d.effect || d.steps)}`);
      table.push({ cls, id: x.id, name: x.name, branch: x.branch, tier: x.tier, before: old.ratio, after: x.ratio, from: o.effect || o.steps, to: d.effect || d.steps });
    }
  }
  const stuck = Object.entries(capped).filter(([, c]) => c).map(([id]) => `${id}(${skills.tree[id].name})`);
  console.log(`\n상한에 걸려 목표에 못 닿은 칸: ${stuck.length ? stuck.join(' · ') : '없음'}`);
  fs.writeFileSync(path.join(ROOT, 'dist', 'skill-rescale.json'), JSON.stringify({ table, stuck, skills: skills.tree }, null, 1));
  if (WRITE) writeFiles(orig, skills);
}

/** 바뀐 칸의 effect · steps · desc 줄만 고친다 */
function writeFiles(base, skills) {
  const changed = [];
  for (const rel of FILES) {
    const file = path.join(ROOT, rel);
    let text = fs.readFileSync(file, 'utf8');
    const cur = JSON.parse(text);
    for (const [id, d] of Object.entries(skills.tree)) {
      if (id.startsWith('_')) continue;
      const o = base.tree[id];
      if (JSON.stringify(o.effect) === JSON.stringify(d.effect) && JSON.stringify(o.steps) === JSON.stringify(d.steps)) continue;
      const start = text.indexOf(`    "${id}": {`);
      if (start < 0) throw new Error(`${rel}: ${id} 칸을 못 찾음`);
      const end = text.indexOf('\n    }', start);
      let block = text.slice(start, end);
      if (d.effect) block = block.replace(/"effect": \{[^}]*\}/, `"effect": { ${Object.entries(d.effect).map(([k, v]) => `"${k}": ${v}`).join(', ')} }`);
      if (d.steps) block = block.replace(/"steps": \{.*\}/, `"steps": ${JSON.stringify(d.steps)}`);
      let desc = descOf(cur.tree[id].desc, o, d);
      for (const k of Object.keys(ADD[id] || {})) desc += ` · ${ADD_TEXT[k](d.effect[k])}`;
      block = block.replace(/"desc": "[^"]*"/, `"desc": ${JSON.stringify(desc)}`);
      text = text.slice(0, start) + block + text.slice(end);
      if (rel === FILES[0]) changed.push({ id, name: d.name, desc, long: cur.tree[id].long || '' });
    }
    JSON.parse(text); // 깨지지 않았나
    fs.writeFileSync(file, text);
  }
  console.log('\n고친 칸 — long(긴 설명)에 숫자가 있으면 손으로 맞춘다:');
  for (const c of changed) console.log(`  ${c.id} ${c.name}: ${c.desc}${/\d/.test(c.long) ? `   ⚠ long: ${c.long.slice(0, 80)}` : ''}`);
}

/** 짧은 설명 속 숫자를 새 값으로 — 옛 값이 화면에 쓰이던 모양(%, %p, 배, 그대로)을 찾아 바꾼다 */
function descOf(desc, o, d) {
  let out = desc;
  const shows = (v) => {
    const pct = Math.round(v * 10000) / 100;
    return [String(pct), String(Math.round(v * 100) / 100), String(v)];
  };
  for (const [k, v] of Object.entries(o.effect || {})) {
    const nv = d.effect && d.effect[k];
    if (typeof v !== 'number' || nv == null || nv === v || FIXED.has(k)) continue;
    for (const s of shows(v)) {
      const re = new RegExp(`(\\+|-|\\b)${s.replace('.', '\\.')}(?=(%p|%|배|\\b))`);
      if (re.test(out)) {
        const isPct = s === String(Math.round(v * 10000) / 100) && s !== String(v);
        const ns = k === 'atkFlat' ? String(nv) : isPct ? String(Math.round(nv * 10000) / 100) : String(Math.round(nv * 100) / 100);
        out = out.replace(re, `$1${ns}`);
        break;
      }
    }
  }
  if (o.steps && d.steps) {
    // 보호막 연장 — 「1 → 1.5 → 2 → 2.5 → 3대」: 기본 1 + 단계값
    for (const [k, arr] of Object.entries(d.steps)) {
      if (k === 'shieldBonusTurns') out = out.replace(/1 → [\d. →]+대/, `1 → ${arr.map((x) => 1 + x).join(' → ')}대`);
    }
  }
  return out;
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
