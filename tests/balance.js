// 밸런스 못 박기 — 레벨 차 경험치 천장 · 보스가 다시 서는 시간 (0.70.39).
//
// 0.70.38 까지는 ① 레벨 차 경험치 보정에 위쪽 천장이 없었고(나보다 30레벨 높은 보스 4.6배,
// 48레벨 높으면 6.8배) ② 보스가 1분마다 다시 섰다. 둘이 겹쳐 **같은 보스를 되풀이해 잡는 것만으로**
// 한두 시간에 Lv.45 였다(밸런스 대시보드로 잰 값 — 경험치의 80% 남짓이 보스).
// 0.70.39 에서 천장 2배 · 보스 5분으로 묶었다. 누가 값을 되돌리면 여기서 걸린다.
//
// ⚠ 값을 일부러 바꿀 때는 이 시험도 같이 고친다 — 시험이 막으려는 것은 "모르고 되돌리기" 다.
//
// 브라우저 없이 돈다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ok = [], bad = [];
const check = (n, c, x = '') => (c ? ok : bad).push(n + (x ? ` — ${x}` : ''));

(async () => {
  const F = await import(path.join(ROOT, 'src', 'data', 'formulas.js'));
  const MS = await import(path.join(ROOT, 'src', 'systems', 'MapSystem.js'));
  const { BALANCE: B, expReward } = F;
  const mon = (level) => ({ exp: 1000, level });
  const want = (gap, boss = false) => Math.round(1000 * gap * B.EXP_GAIN * (boss ? B.BOSS_EXP_GAIN : 1));

  // ① 레벨 차 경험치 — 위쪽 천장 2배, 아래쪽 바닥 35%
  check('천장은 2배다(EXP_GAP_MAX)', B.EXP_GAP_MAX === 2, `지금 ${B.EXP_GAP_MAX}`);
  check('같은 레벨은 1배', expReward(mon(30), 30) === want(1), String(expReward(mon(30), 30)));
  check('5레벨 높으면 1.6배 — 천장 아래는 그대로', expReward(mon(35), 30) === want(1.6), String(expReward(mon(35), 30)));
  check('9레벨 높으면 2배에서 멈춘다(2.08 → 2)', expReward(mon(39), 30) === want(2), String(expReward(mon(39), 30)));
  check('30레벨 높아도 2배(전에는 4.6배)', expReward(mon(60), 30) === want(2), String(expReward(mon(60), 30)));
  check('보스도 같은 천장 — Lv.30 이 Lv.78 보스를 잡으면 2배 × 보스 몫',
    expReward(mon(78), 30, true) === want(2, true), String(expReward(mon(78), 30, true)));
  check('낮은 쪽 바닥은 그대로 35%', expReward(mon(1), 50) === want(0.35), String(expReward(mon(1), 50)));

  // ② 보스가 다시 서는 시간 — 기본 5분, 고룡의 둥지만 맵이 따로(한 시간)
  check('보스는 5분 뒤에 다시 선다(BOSS_RESPAWN_MS)', MS.BOSS_RESPAWN_MS === 300000, `지금 ${MS.BOSS_RESPAWN_MS}`);
  const db = {};
  for (const f of fs.readdirSync(path.join(ROOT, 'src', 'data')).filter((x) => x.endsWith('.json'))) {
    db[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8'));
  }
  const bosses = [];
  for (const id of Object.keys(db.maps.maps)) {
    const map = MS.buildMap(db, id);
    for (const a of MS.spawnMonsters(db, map)) if (a.isBoss) bosses.push({ id, mon: a.defId, ms: a.respawnMs, own: db.maps.maps[id].bossRespawnMs });
  }
  const plain = bosses.filter((b) => !b.own);
  check('지도에 선 보스 가운데 맵이 따로 정하지 않은 것이 다섯 넘게 있다', plain.length >= 5, plain.map((b) => b.mon).join(' '));
  const wrong = plain.filter((b) => b.ms !== 300000);
  check('그 보스들은 모두 5분', wrong.length === 0, wrong.map((b) => `${b.id}:${b.mon}=${b.ms}`).join(' '));
  const lair = bosses.find((b) => b.id === 'dragon_lair');
  check('고룡의 둥지는 맵이 정한 한 시간 그대로', !!lair && lair.ms === 3600000, lair ? String(lair.ms) : '없음');

  // ③ 0.80.23 — 한 판의 손 수 상한. 140 이면 사냥꾼이 감옥의 주인을 "이길 수 있는데 시간이 모자라" 졌다(+9 승률 10%).
  //   깎아 눕히는 고룡(서쪽 절벽 · 둥지)만 예전 상한 — 한 번에 깎는 양이 그대로여야 한다.
  check('한 판의 손 수 상한은 260', B.MAX_BATTLE_ACTIONS === 260, `지금 ${B.MAX_BATTLE_ACTIONS}`);
  check('깎아 눕히는 고룡은 예전 상한 140', B.MAX_BATTLE_ACTIONS_CHIP === 140, `지금 ${B.MAX_BATTLE_ACTIONS_CHIP}`);
  {
    const { simulateBattle } = await import(path.join(ROOT, 'src', 'systems', 'CombatSystem.js'));
    // 서로 거의 못 때리는 판 — 상한까지 간다. 넘긴 상한에서 멈추나
    const wall = { name: 'w', hp: 1e9, maxHp: 1e9, atk: 1, def: 1e6, spd: 10, crit: 0 };
    const me = { name: 'p', hp: 1e9, maxHp: 1e9, atk: 1, def: 1e6, spd: 10, crit: 0 };
    const a = simulateBattle({ player: { ...me }, monster: { ...wall }, seed: 1 });
    const b = simulateBattle({ player: { ...me }, monster: { ...wall }, seed: 1, maxActions: B.MAX_BATTLE_ACTIONS_CHIP });
    const hits = (r) => r.turns.filter((t) => t.type === 'hit' || t.type === 'miss' || t.type === 'evade').length;
    check('상한에 걸리면 무승부 — 기본은 길게, 고룡용은 짧게', a.winner === 'draw' && b.winner === 'draw' && hits(a) > hits(b),
      `${hits(a)} / ${hits(b)}`);
  }
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  check('게임은 고룡(시각 보스 · 상처가 남는 보스)에게만 고룡용 상한을 넘긴다',
    /maxActions: firstActor\.timedBoss \|\| \(state\.map\.bossKeepHp && firstActor\.isBoss\)/.test(main));

  console.log('');
  for (const s of ok) console.log('  ✓', s);
  for (const s of bad) console.log('  ✗', s);
  console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
  process.exit(bad.length ? 1 : 0);
})();
