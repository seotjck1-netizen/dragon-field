// 필드 실시간 전투 (0.80.20) — 잡몹은 그 자리에서, 보스는 전투 화면에서.
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   · 잡몹과 붙으면 전투 화면이 아니라 필드에서 싸운다 / 보스는 전투 화면으로 간다
//   · 필드의 박자는 전투 화면보다 빠르다(BALANCE.FIELD.ACTION_GAP)
//   · 싸움은 닿아야 열린다(0.80.21 와우식) — 활을 들어도 떨어진 상대를 먼저 치지 않는다
//   · 선공 몬스터는 보고 쫓아오고, 멀리 따돌리면 놓는다 · 쫓아오던 놈은 닿을 때 함께 붙는다(애드)
//   · 싸우는 동안은 느리게 걷는다
//   · 싸우다 사거리 밖으로 걸어 나가면 그 판이 멈추고(남은 몸 그대로) 몬스터가 쫓아온다
//   · 다시 붙으면 깎인 몸으로 이어서 싸운다
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('field');

  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const F = await import('/src/data/formulas.js');
    const Enc = await import('/src/systems/EncounterSystem.js');
    const Inv = await import('/src/systems/InventorySystem.js');
    const Eq = await import('/src/systems/EquipmentSystem.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    // 상대를 내 옆 칸에 세운다 — 사거리 밖의 상대와 붙이면 첫 프레임에 '벗어났다' 로 멈춘다
    const near = (m) => {
      const p = s.player;
      m.tx = m.fromTx = p.tx + 1; m.ty = m.fromTy = p.ty;
      m.px = m.tx * 32 + 16; m.py = m.ty * 32 + 16; m.moving = false;
    };

    await g.changeMap('field_1', 20, 16); await wait(500);
    s.player.level = 2; // 몇 대 오가는 싸움(박자를 잰다)
    const stats = (await import('/src/entities/StatBlock.js')).computePlayerStats(s);
    s.player.hp = 9999;

    // ① 잡몹 → 필드
    const mon = s.monsters.find((m) => m.alive && !m.isBoss);
    near(mon);
    g.bus.emit('battle:request', { monsterUid: mon.uid });
    await wait(150);
    out.fieldFight = !!g.fieldScene.fight;
    out.notScene = g.scenes.current !== g.battleScene;
    const turns = g.fieldScene.fight ? g.fieldScene.fight.result.turns : [];
    const hits = turns.filter((t) => t.type === 'hit' && !t.extra && !t.tag);
    const gaps = [];
    for (let i = 1; i < hits.length; i++) gaps.push(hits[i].t - hits[i - 1].t);
    gaps.sort((a, b) => a - b);
    out.gap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    out.gapWant = F.BALANCE.FIELD.ACTION_GAP;
    out.sceneGap = F.BALANCE.TIMING.ACTION_GAP;
    // 끝날 때까지 기다린다
    for (let i = 0; i < 200 && g.fieldScene.fight; i++) await wait(100);
    out.ended = !g.fieldScene.fight;
    await wait(300);
    g.bus.emit('battle:confirm');

    // ② 사거리 — 칼(맞닿아야) · 활(4칸) · 벽 너머
    const me = { tx: 10, ty: 10, px: 10 * 32 + 16, py: 10 * 32 + 16 };
    const at = (tx, ty) => ({ alive: true, tx, ty, px: tx * 32 + 16, py: ty * 32 + 16 });
    const open = { w: 30, h: 30, grid: Array.from({ length: 30 }, () => '.'.repeat(30)), tileset: { '.': {}, '#': { solid: true } } };
    const walled = { ...open, grid: open.grid.map((row, y) => (y === 10 ? row.slice(0, 12) + '#' + row.slice(13) : row)) };
    out.far = !!Enc.findEncounter(me, [at(13, 10)], 36);
    out.near = !!Enc.findEncounter(me, [at(11, 10)], 36);
    // 알아챔 — 선공 몬스터는 SIGHT 안이면 쫓고, DEAGGRO 밖이면 놓는다
    const Mv = await import('/src/systems/MovementSystem.js');
    const C = (await import('/src/config.js')).CONFIG;
    const rng = Object.assign(() => 0.5, { int: (a) => a, pick: (a) => a[0], chance: () => false });
    const hunter = { alive: true, tx: 10 + C.MONSTER_SIGHT_TILES - 1, ty: 10, moveStyle: 'chase', thinkTimer: 0, stepMs: 260 };
    Mv.updateMonster(hunter, 16, open, rng, me, []);
    out.sees = !!hunter.alerted;
    hunter.tx = 10 + C.MONSTER_DEAGGRO_TILES - 1; hunter.thinkTimer = 0; hunter.moving = false;
    Mv.updateMonster(hunter, 16, open, rng, me, []);
    out.keeps = !!hunter.alerted;
    hunter.tx = 10 + C.MONSTER_DEAGGRO_TILES + 2; hunter.ty = 10; hunter.fromTx = hunter.tx; hunter.thinkTimer = 0; hunter.moving = false;
    Mv.updateMonster(hunter, 16, open, rng, me, []);
    out.lets = !hunter.alerted;
    const calm = { alive: true, tx: 12, ty: 10, moveStyle: 'wander', thinkTimer: 0, stepMs: 260 };
    Mv.updateMonster(calm, 16, open, rng, me, []);
    out.calm = !calm.alerted;

    // ③ 멈춤 · 이어서 — 싸우다 사거리 밖으로 나가면
    await wait(1500);
    const m2 = s.monsters.find((m) => m.alive && !m.isBoss);
    s.player.level = 1; // 오래 끄는 싸움(금방 끝나지 않게)
    s.player.hp = 9999;
    near(m2);
    g.bus.emit('battle:request', { monsterUid: m2.uid, seed: 7 });
    await wait(1400); // 몇 대 오간 뒤
    const f = g.fieldScene.fight;
    out.cutStarted = !!f;
    const fightStep = s.player.stepMs;
    let cut = null;
    const offFin = g.bus.on('battle:finished', (e) => { if (e && e.cut) cut = e.cut; });
    if (f) {
      // 멀리 옮긴다(걸어서 벗어난 것과 같다)
      const p = s.player;
      p.tx = p.fromTx = Math.max(1, m2.tx - 8); p.ty = p.fromTy = m2.ty;
      p.px = p.tx * 32 + 16; p.py = p.ty * 32 + 16;
      await wait(300);
    }
    out.cut = cut;
    await wait(200);
    out.stepMs = { fight: Math.round(fightStep), after: Math.round(s.player.stepMs) };
    out.slow = fightStep > s.player.stepMs * 1.5;
    out.afterCut = { fight: !!g.fieldScene.fight, fieldHp: m2.fieldHp || 0, alerted: !!m2.alerted, alive: m2.alive };
    if (typeof offFin === 'function') offFin();
    await wait(200);
    g.bus.emit('battle:confirm');

    // 다시 붙으면 깎인 몸으로
    await wait(1500);
    if (m2.alive && m2.fieldHp > 0) {
      near(m2);
      g.bus.emit('battle:request', { monsterUid: m2.uid, seed: 8 });
      await wait(120);
      const f2 = g.fieldScene.fight;
      out.resumeHp = f2 && f2.result.snapshot ? f2.result.snapshot.monsters[0].hp : null;
      out.resumeWant = m2.fieldHp;
      for (let i = 0; i < 300 && g.fieldScene.fight; i++) await wait(100);
      g.bus.emit('battle:confirm');
    }

    // 애드 — 나를 알아채고 쫓아오던 놈이 둘레에 있으면 함께 붙는다(직업과 상관없이)
    {
      const free = s.monsters.filter((m) => m.alive && !m.isBoss).slice(0, 3);
      const p = s.player;
      free.forEach((m, i) => { m.tx = m.fromTx = p.tx + 1; m.ty = m.fromTy = p.ty + i - 1; m.alerted = i > 0; });
      out.adds = free.length >= 3 ? g.battleParty(s, free[0], {}).length : 0;
      free.forEach((m) => { m.alerted = false; });
    }

    // ④ 보스 → 전투 화면
    await g.changeMap('field_5', 20, 16); await wait(600);
    s.player.level = 30; s.player.hp = 9999;
    const boss = s.monsters.find((m) => m.alive && m.isBoss);
    out.bossFound = !!boss;
    if (boss) {
      near(boss);
      g.bus.emit('battle:request', { monsterUid: boss.uid });
      await wait(300);
      out.bossScene = g.scenes.current === g.battleScene;
      out.bossField = !!g.fieldScene.fight;
      if (out.bossScene) { g.battleScene.skipToEnd(); await wait(300); g.bus.emit('battle:confirm'); }
    }
    return out;
  });

  check('잡몹과 붙으면 필드에서 싸운다(전투 화면이 아니다)', r.fieldFight && r.notScene, JSON.stringify({ f: r.fieldFight, n: r.notScene }));
  check('필드의 박자는 전투 화면보다 빠르다', r.gap != null && r.gap === r.gapWant && r.gapWant < r.sceneGap,
    `한가운데 간격 ${r.gap}ms · 필드 ${r.gapWant} · 화면 ${r.sceneGap}`);
  check('필드 싸움은 저절로 끝난다', r.ended);
  check('싸움은 닿아야 열린다 — 떨어진 상대와는 안 붙는다', !r.far && r.near);
  check('선공 몬스터는 보면 쫓아오고, 조금 물러서도 안 놓는다', r.sees && r.keeps);
  check('멀리 따돌리면 놓는다', r.lets);
  check('비선공 몬스터는 옆을 지나가도 쫓아오지 않는다', r.calm);
  check('쫓아오던 놈은 닿을 때 함께 붙는다(애드)', r.adds >= 2, String(r.adds));
  check('싸우는 동안은 느리게 걷는다', r.slow, JSON.stringify(r.stepMs));
  check('싸우다 사거리 밖으로 나가면 그 판이 멈춘다', r.cutStarted && !!r.cut && !r.afterCut.fight, JSON.stringify(r.cut));
  check('멈춘 판의 몬스터는 깎인 몸을 지니고 쫓아온다',
    r.afterCut.alive ? (r.afterCut.fieldHp > 0 && r.afterCut.alerted) : true, JSON.stringify(r.afterCut));
  check('다시 붙으면 깎인 몸으로 이어서 싸운다', r.resumeHp != null && r.resumeHp === r.resumeWant,
    `${r.resumeHp} / ${r.resumeWant}`);
  check('보스는 전투 화면으로 간다', r.bossFound && r.bossScene && !r.bossField, JSON.stringify({ s: r.bossScene, f: r.bossField }));
  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
