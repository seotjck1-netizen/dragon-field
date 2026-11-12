#!/usr/bin/env node
/**
 * 관통(pierce)이 실제로 얼마나 값어치가 있나 — 레벨 구간별로 잰다.
 *
 *   node tools/pierce-check.js            표를 찍고 docs/pierce.svg 를 만든다
 *   node tools/pierce-check.js --n 300    표본을 늘린다
 *
 * ── 왜 필요한가 ────────────────────────────────────────────
 * 관통은 "상대 방어력을 이 비율만큼 없는 셈 친다" 이다.
 *   피해 = 공격² / (공격 + 방어×0.55)     ← damage() 의 식 (DEFENSE_SOFTNESS)
 * 그래서 값어치가 **상대 방어력이 내 공격력에 견줘 얼마나 큰가**에 달려 있다.
 * 방어가 물렁한 상대에게는 거의 0 이고, 단단한 보스에게는 공격력보다 크다.
 * 숫자 하나로 말할 수 없어서, 단계마다 실제 전투 계산기로 재어 그림으로 그린다.
 *
 * 견주는 잣대는 **보석 한 알**이다(누구나 아는 단위).
 *   다이아몬드 관통 +10% · 루비 공격력 +8% · 토파즈 치명타 +5% · 자수정 치명타 피해 +18%
 * "한 알이 평균 피해를 몇 % 올리나" 를 나란히 놓으면 무엇을 챙길지 바로 보인다.
 */
const fs = require('fs');
const path = require('path');
const B = require('./balance.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argOf = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const N = Number(argOf('--n', 160));

// 보석 한 알이 주는 값. affixes.json 의 '보석' 표에서 읽는다(표가 바뀌면 같이 바뀐다).
function gemUnits(G) {
  const rows = (G['affixes.json'] && G['affixes.json']['보석']) || [];
  const of = (id) => {
    const r = rows.find((x) => x[0] === id);
    return r ? { prop: String(r[2]).split('.')[1], value: r[3] } : null;
  };
  return [
    { key: 'pierce', label: '관통(다이아몬드)', ...(of('gem_diamond') || { prop: 'pierce', value: 0.1 }) },
    { key: 'atkPct', label: '공격력(루비)', ...(of('gem_ruby') || { prop: 'atkPct', value: 0.08 }) },
    { key: 'crit', label: '치명타(토파즈)', ...(of('gem_topaz') || { prop: 'crit', value: 0.05 }) },
    { key: 'critMult', label: '치명피해(자수정)', ...(of('gem_amethyst') || { prop: 'critMult', value: 0.18 }) },
  ];
}

/** 맵 단계 보정을 게임과 똑같이 먹인 몬스터. */
function foeOf(G, monId, mapId) {
  const base = G['monsters.json'][monId];
  const mapDef = (G['maps.json'].maps[mapId] || {});
  const power = mapDef.power || 1;
  const st = base.stats;
  return {
    name: base.name,
    level: base.level,
    hp: Math.round(st.hp * power),
    maxHp: Math.round(st.hp * power),
    atk: Math.round(st.atk * power),
    def: Math.round(st.def * power),
    spd: +(st.spd * (1 + (power - 1) * 0.25)).toFixed(2),
    crit: st.crit || 0,
    mood: 1,
  };
}

/**
 * 내가 때리는 평균 피해. 상대를 안 죽는 허수아비로 바꿔 두고 순수한 피해만 본다.
 * (승률로 재면 물약·보호막·운이 섞여서 관통 한 알의 몫이 보이지 않는다)
 */
function avgHit(sim, G, cls, stats, mods, foe, traits) {
  const dummy = { ...foe, hp: 10 ** 9, maxHp: 10 ** 9, atk: 1 };
  let sum = 0;
  let n = 0;
  for (let seed = 1; seed <= N; seed++) {
    const r = sim({
      player: { name: 'p', ...stats, maxHp: stats.hp },
      monsters: [dummy],
      seed,
      playerMods: mods,
      playerTraits: traits,
      potions: null,
    });
    for (const t of r.turns) {
      if (t.type !== 'hit' || t.actor !== 'player' || t.tag) continue;
      sum += t.damage;
      n++;
      break;
    }
  }
  return n ? sum / n : 0;
}

(async () => {
  const { simulateBattle } = await import(`file://${ROOT}/src/systems/CombatSystem.js`);
  const G = B.loadFrom('src');
  const UNITS = gemUnits(G);

  // 재는 자리 — balance.js 가 쓰는 것과 같은 몸·같은 상대.
  const SPOTS = B.MATCHES.map((m) => ({
    monId: m[0], level: m[1], enh: m[2], tier: m[3], label: m[4], mapId: m[6],
  }));

  const pad = (s, n) => {
    const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
    return String(s) + ' '.repeat(Math.max(0, n - w));
  };
  const padL = (s, n) => {
    const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
    return ' '.repeat(Math.max(0, n - w)) + String(s);
  };

  console.log('');
  console.log('  관통 값어치 — 보석 한 알이 평균 피해를 몇 % 올리나');
  console.log('  ' + '─'.repeat(78));
  console.log('  ' + pad('자리', 30) + padL('방어/공격', 11)
    + UNITS.map((u) => padL(u.label, 17)).join(''));

  const chart = []; // 그림용

  for (const spot of SPOTS) {
    const foe = foeOf(G, spot.monId, spot.mapId);
    const row = { label: spot.label, bars: [] };
    // 세 직업의 평균으로 본다 — 한 직업만 보면 그 직업의 스킬 취향이 섞인다.
    const per = UNITS.map(() => []);
    let ratioSum = 0;
    for (const cls of ['warrior', 'ranger', 'mage']) {
      const { stats, mods } = B.statsOf(G, cls, spot.level, spot.enh, spot.tier);
      const traits = G['classes.json'].list[cls].combat;
      const base = avgHit(simulateBattle, G, cls, stats, mods, foe, traits);
      ratioSum += (foe.def * 0.55) / Math.max(1, stats.atk);
      UNITS.forEach((u, i) => {
        // 공격력 %는 전투 계산기가 아니라 스탯을 낼 때 곱해진다(computePlayerStats).
        // mods 에 넣기만 하면 아무 일도 안 일어나서 루비가 0% 로 보인다.
        const s2 = u.prop === 'atkPct'
          ? { ...stats, atk: Math.round(stats.atk * (1 + u.value)) }
          : stats;
        const m2 = u.prop === 'atkPct' ? mods : { ...mods, [u.prop]: (mods[u.prop] || 0) + u.value };
        const v = avgHit(simulateBattle, G, cls, s2, m2, foe, traits);
        per[i].push(base > 0 ? (v / base - 1) * 100 : 0);
      });
    }
    const avg = per.map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
    row.bars = UNITS.map((u, i) => ({ label: u.label, gain: avg[i] }));
    row.ratio = ratioSum / 3;
    chart.push(row);
    console.log('  ' + pad(spot.label, 30) + padL(row.ratio.toFixed(2), 11)
      + avg.map((v) => padL(`+${v.toFixed(1)}%`, 17)).join(''));
  }

  // ── 얼마나 챙기면 좋은가 — 관통을 0 부터 늘려 가며 한 알의 몫을 잰다 ──
  console.log('');
  console.log('  관통을 이미 얼마나 챙겼을 때, 다음 한 알이 얼마나 오르나 (20단계 보스 기준)');
  console.log('  ' + '─'.repeat(78));
  const last = SPOTS[SPOTS.length - 2] || SPOTS[SPOTS.length - 1];
  const foeL = foeOf(G, last.monId, last.mapId);
  const unit = UNITS[0].value;
  const curve = [];
  for (const have of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
    let sum = 0;
    for (const cls of ['warrior', 'ranger', 'mage']) {
      const { stats, mods } = B.statsOf(G, cls, last.level, last.enh, last.tier);
      const traits = G['classes.json'].list[cls].combat;
      const a = avgHit(simulateBattle, G, cls, stats,
        { ...mods, pierce: (mods.pierce || 0) + have }, foeL, traits);
      const b = avgHit(simulateBattle, G, cls, stats,
        { ...mods, pierce: (mods.pierce || 0) + have + unit }, foeL, traits);
      sum += a > 0 ? (b / a - 1) * 100 : 0;
    }
    const gain = sum / 3;
    curve.push({ have, gain });
    const bar = '█'.repeat(Math.max(0, Math.round(gain * 2)));
    console.log('  ' + padL(`${Math.round(have * 100)}%`, 6) + ' 갖춘 상태에서 한 알 더 → '
      + padL(`+${gain.toFixed(1)}%`, 8) + '  ' + bar);
  }
  console.log('');
  console.log('  읽는 법 — 관통은 **깎을 방어력이 남아 있을 때만** 값이 있다.');
  console.log('  값이 줄지 않고 늘어나는 것은 (1-p) 가 작아질수록 같은 한 알이');
  console.log('  더 큰 몫을 지우기 때문이다. 다만 방어가 물렁한 상대에게는 처음부터 작다.');
  console.log('');

  // ── 그림 ──
  const svg = drawSvg(chart, curve, UNITS);
  const out = path.join(ROOT, 'docs', 'pierce.svg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, svg);
  console.log('  그림: docs/pierce.svg');
  console.log('');
})();

/** 표를 막대그림 하나로. 바깥 라이브러리를 쓰지 않는다(이 저장소의 규칙). */
function drawSvg(chart, curve, units) {
  const W = 900;
  const rowH = 96;
  const H = 90 + chart.length * rowH + 250;
  const colors = ['#7cc4ff', '#ffb46b', '#7ef0b0', '#c9a2ff'];
  const maxGain = Math.max(10, ...chart.flatMap((r) => r.bars.map((b) => b.gain)));
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#0d1220"/>
  <text x="24" y="34" fill="#eef2ff" font-family="system-ui,sans-serif" font-size="19" font-weight="700">관통 값어치 — 보석 한 알이 평균 피해를 몇 % 올리나</text>
  <text x="24" y="56" fill="#8fa3c8" font-family="system-ui,sans-serif" font-size="12">막대가 길수록 그 자리에서 값어치가 크다. 관통은 상대 방어력이 두꺼운 자리에서만 커진다.</text>`;

  units.forEach((u, i) => {
    s += `<rect x="${560 + i * 84}" y="24" width="10" height="10" fill="${colors[i]}"/>
  <text x="${574 + i * 84}" y="33" fill="#cfe0f5" font-family="system-ui,sans-serif" font-size="10">${esc(u.label.split('(')[0])}</text>`;
  });

  chart.forEach((row, ri) => {
    const y0 = 86 + ri * rowH;
    s += `<text x="24" y="${y0 + 12}" fill="#eef2ff" font-family="system-ui,sans-serif" font-size="13" font-weight="600">${esc(row.label)}</text>
  <text x="24" y="${y0 + 28}" fill="#8fa3c8" font-family="system-ui,sans-serif" font-size="11">상대 방어 ÷ 내 공격 = ${row.ratio.toFixed(2)}</text>`;
    row.bars.forEach((b, bi) => {
      const w = Math.max(1, (b.gain / maxGain) * 520);
      const y = y0 + 6 + bi * 15;
      s += `<rect x="300" y="${y}" width="${w.toFixed(1)}" height="11" rx="3" fill="${colors[bi]}" opacity="0.9"/>
  <text x="${306 + w}" y="${y + 10}" fill="#cfe0f5" font-family="system-ui,sans-serif" font-size="10">+${b.gain.toFixed(1)}%</text>`;
    });
  });

  // 아래쪽 꺾은선 — 이미 챙긴 관통에 따른 다음 한 알의 몫
  const cy0 = 86 + chart.length * rowH + 40;
  const cw = 760;
  const ch = 150;
  const maxC = Math.max(4, ...curve.map((c) => c.gain));
  s += `<text x="24" y="${cy0 - 14}" fill="#eef2ff" font-family="system-ui,sans-serif" font-size="14" font-weight="700">이미 챙긴 관통에 따라, 다음 한 알이 올려 주는 몫</text>
  <rect x="80" y="${cy0}" width="${cw}" height="${ch}" fill="#111830" stroke="#26314d"/>`;
  const pts = curve.map((c, i) => {
    const x = 80 + (i / (curve.length - 1)) * cw;
    const y = cy0 + ch - (c.gain / maxC) * (ch - 16) - 8;
    return { x, y, c };
  });
  s += `<polyline fill="none" stroke="#7cc4ff" stroke-width="2.5" points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}"/>`;
  for (const p of pts) {
    s += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="#7cc4ff"/>
  <text x="${p.x.toFixed(1)}" y="${(p.y - 9).toFixed(1)}" fill="#cfe0f5" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle">+${p.c.gain.toFixed(1)}%</text>
  <text x="${p.x.toFixed(1)}" y="${cy0 + ch + 16}" fill="#8fa3c8" font-family="system-ui,sans-serif" font-size="10" text-anchor="middle">${Math.round(p.c.have * 100)}%</text>`;
  }
  s += `<text x="${80 + cw / 2}" y="${cy0 + ch + 34}" fill="#8fa3c8" font-family="system-ui,sans-serif" font-size="11" text-anchor="middle">이미 챙긴 관통</text>
</svg>`;
  return s;
}
