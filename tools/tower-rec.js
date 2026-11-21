#!/usr/bin/env node
/**
 * 끝없는 탑 — 층마다 적정 레벨 (0.80.25).
 *
 *   node tools/tower-rec.js            층마다 적정 레벨을 재서 보여 준다
 *   node tools/tower-rec.js --write    src/data/tower.json · server/content/tower.json 의 rec 칸에 적는다
 *   node tools/tower-rec.js --n 40     한 자리에서 더 많이 싸워 본다(느리다, 기본 24)
 *
 * ── 무엇을 재나 ────────────────────────────────────────────
 * 그 층 한 판을 **가득 찬 HP 로** 싸워서, 직업 셋(트리는 직업마다 가장 잘 되는 것)의 승률 평균이
 * WANT(70%) 를 넘는 가장 낮은 몸. 몸은 아래 LADDER 를 차례로 오른다 — 그 레벨에 흔히 갖춘 장비 ·
 * 강화(tools/balance.js 의 statsOf, tools/tower.js 와 같은 몸)다.
 *
 * 보스 특성 · 잡몹은 주마다 바뀌므로 여러 주(WEEKS)를 섞어 평균한다 — 적정 레벨은 주와 상관없이 하나다.
 * 층 사이에 깎인 HP 로 오르는 것은 넣지 않는다(그건 실력 · 물약 몫이다). 그래서 한 번에 죽 오를 수 있는
 * 높이는 이것보다 조금 낮다 — tools/tower.js 가 그 높이를 잰다.
 *
 * 화면(탑 창 · 층별 보상)에 그대로 적히는 글이다. 시트(tower 탭 '적정 레벨')에서 손으로 고쳐도 된다.
 */
const fs = require('fs');
const path = require('path');
const B = require('./balance.js');

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const N = arg('--n', 24);
const WRITE = args.includes('--write');
const WANT = 0.7;
const WEEKS = [2901, 2902, 2903, 2904, 2905, 2906];

/**
 * 그 레벨에 흔히 갖춘 몸 — tools/balance.js 의 '사람이 실제로 그 문 앞에 설 때의 몸'(play*)을 잇는다.
 *   Lv.15 ~ 26  +7 · 희귀 여섯(play15 — 15단계 문 앞의 몸)
 *   Lv.27 ~ 39  +7 · 룬 한 벌(play20 — 20단계 문 앞의 몸)
 *   Lv.40 ~ 49  +8 · 룬 한 벌 + 용의 반지(20)
 */
function bodyAt(level) {
  if (level < 27) return { label: `Lv.${level}`, level, enh: 7, tier: 'play15' };
  if (level < 40) return { label: `Lv.${level}`, level, enh: 7, tier: 'play20' };
  return { label: `Lv.${level}`, level, enh: 8, tier: 20 };
}
const LADDER = [];
for (let lv = 15; lv <= 49; lv++) LADDER.push(bodyAt(lv));
LADDER.push({ label: 'Lv.50 +9', level: 50, enh: 9, tier: 20 });
LADDER.push({ label: 'Lv.50 +10', level: 50, enh: 10, tier: 20 });
LADDER.push({ label: '전설 +10', level: 50, enh: 10, tier: 20, grade: 'legendary' });
const BEYOND = '전설 +10 ↑'; // 다 갖춘 몸으로도 열에 일곱이 안 되는 층 — 겨루는 자리

(async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const T = await import('../src/systems/TowerSystem.js');
  const G = B.loadFrom('src');
  const file = path.join(__dirname, '..', 'src', 'data', 'tower.json');
  const tower = JSON.parse(fs.readFileSync(file, 'utf8'));
  const db = { maps: G['maps.json'], monsters: G['monsters.json'], items: G['items.json'], tower };
  const classes = ['warrior', 'ranger', 'mage'];
  const bodyCache = new Map();

  function bodies(cls, body) {
    const key = `${cls}|${body.label}`;
    if (!bodyCache.has(key)) {
      const plans = Math.max(1, (B.PLANS[cls] || []).length);
      const list = [];
      for (let p = 0; p < plans; p++) {
        list.push({ ...B.statsOf(G, cls, body.level, body.enh, body.tier, null, p, null, null, body.grade || null), pot: B.potionsOf(G, body.tier) });
      }
      bodyCache.set(key, list);
    }
    return bodyCache.get(key);
  }

  /** 이 몸(직업 셋 평균)이 이 층을 몇 할 깨나. */
  function rate(floor, body) {
    const weeks = T.isBossFloor(db, floor) ? WEEKS : WEEKS.slice(0, 3);
    let sum = 0;
    for (const cls of classes) {
      let best = 0;
      for (const b of bodies(cls, body)) {
        let win = 0;
        let n = 0;
        for (const week of weeks) {
          const plan = T.floorPlan(db, floor, week);
          const per = Math.ceil(N / weeks.length);
          for (let i = 0; i < per; i++) {
            const monsters = plan.members.map((m) => ({
              name: m.def.name, level: m.def.level, ...m.def.stats, maxHp: m.def.stats.hp,
              magicPart: plan.magicPart || 0, rage: Number(m.def.rage) || 0, magicResist: Number(m.def.magicResist) || 0,
              school: m.def.school || 'physical', ...(m.aff ? { aff: { ...m.aff } } : {}),
            }));
            const r = simulateBattle({
              player: { name: 'p', level: body.level, ...b.stats, maxHp: b.stats.hp, hp: b.stats.hp, weaponShape: b.weaponShape },
              monsters,
              seed: floor * 7919 + week * 31 + i,
              playerMods: b.mods,
              playerTraits: G['classes.json'].list[cls].combat,
              potions: { ...b.pot, stock: b.pot.stock.map((s) => ({ ...s })) },
            });
            n++;
            if (r.winner === 'player') win++;
          }
        }
        best = Math.max(best, win / n);
      }
      sum += best;
    }
    return sum / classes.length;
  }

  const out = [];
  let lo = 0; // 층이 오를수록 적정 몸은 내려가지 않는다 — 아래 층의 답부터 찾는다
  const top = tower.floors.reduce((n, r) => Math.max(n, r.floor), 0);
  for (let f = 1; f <= top; f++) {
    let a = lo;
    let b = LADDER.length - 1;
    let ans = -1;
    if (rate(f, LADDER[b]) < WANT) {
      ans = -1;
    } else {
      while (a < b) {
        const mid = (a + b) >> 1;
        if (rate(f, LADDER[mid]) >= WANT) b = mid; else a = mid + 1;
      }
      ans = a;
    }
    const label = ans < 0 ? BEYOND : LADDER[ans].label;
    if (ans >= 0) lo = ans;
    else lo = LADDER.length - 1;
    out.push({ floor: f, rec: label });
    process.stdout.write(`${String(f).padStart(3)}층${T.isBossFloor(db, f) ? ' 보스' : '     '}  ${label}\n`);
  }

  if (WRITE) {
    const S = require('../server/sheets.js');
    for (const target of [file, path.join(__dirname, '..', 'server', 'content', 'tower.json')]) {
      if (!fs.existsSync(target)) continue;
      const t = JSON.parse(fs.readFileSync(target, 'utf8'));
      for (const r of t.floors || []) {
        const got = out.find((x) => x.floor === r.floor);
        if (got) r.rec = got.rec;
      }
      fs.writeFileSync(target, S.formatTower(t));
      console.log(`적었다 — ${path.relative(path.join(__dirname, '..'), target)}`);
    }
  }
})();
