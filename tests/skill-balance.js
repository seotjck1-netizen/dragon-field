// 스킬 트리 균형 (0.80.29) — 사용자: 「굳센 몸(3단)이 위의 불굴의 심장(1단)보다 안 좋다 — 스킬 밸런스가 엉망」 → 「57개 전부 다시 짜기」.
//
// ⚠ 성질을 잰다(tools/skill-value.js 의 잣대 — 버티기 k · 사냥 빠르기를 반반, Lv.50 끝 한 벌):
//   ① 같은 갈래에서 깊은 단일수록 한 점이 세다 — 2단 · 3단 · 궁극의 한 점이 그 갈래 1단 한 점(평균)보다 세다
//      (2단 ≥ 0.9 · 3단 ≥ 1.1 · 궁극 ≥ 2.5 — 1단 두 칸 가운데 하나가 약하면 평균이 내려가 비가 부풀므로 아래만 본다)
//   ② 같은 직업의 갈래 셋은 다 찍었을 때 세기가 비슷하다(가장 센 갈래의 90% 이상)
//   ③ 숫자를 화면에 두 자리까지만 — 짧은 설명(desc)의 소수는 두 자리를 넘지 않는다
//   값 하나하나를 적어 두지 않는다. 맞추는 도구: node tools/skill-rescale.js
const { tally } = require('./lib/harness.js');
const { check, done } = tally();
process.argv.push('--n', '8');
const V = require('../tools/skill-value.js');

(async () => {
  const meter = await V.makeMeter('src');
  for (const cls of ['warrior', 'ranger', 'mage']) {
    const r = V.valuesOf(meter, cls);
    const bad = [];
    for (const b of ['A', 'B', 'C']) {
      const rows = r.rows.filter((x) => x.branch === b);
      for (const x of rows) {
        const need = { 2: 0.9, 3: 1.1, 4: 2.5 }[x.tier];
        if (need != null && !(x.ratio >= need)) bad.push(`${x.name} ${x.ratio.toFixed(2)}(${need} 이상)`);
      }
    }
    check(`${V.NAME[cls]} — 깊은 단일수록 한 점이 세다(2단 · 3단 · 궁극 > 1단)`, bad.length === 0, bad.join(' · '));
    const tot = Object.values(r.branches).map((x) => x.total);
    const top = Math.max(...tot);
    check(`${V.NAME[cls]} — 갈래 셋을 다 찍은 세기가 비슷하다(가장 센 갈래의 90% 이상)`, tot.every((t) => t >= top * 0.9),
      Object.entries(r.branches).map(([b, x]) => `${b} ${x.total.toFixed(3)}`).join(' · '));
  }
  const long = Object.entries(meter.skills.tree).filter(([id, d]) => !id.startsWith('_') && /\d\.\d{3,}/.test(d.desc || ''));
  check('짧은 설명의 소수는 두 자리까지', long.length === 0, long.map(([id, d]) => `${id}: ${d.desc}`).join(' · '));
  done();
})();
