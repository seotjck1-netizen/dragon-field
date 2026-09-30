// 가장 기본이 도는가 — 들어가고, 걷고, 싸우고, 땅을 옮기고, 저장한다.
//
// 0.70.24 에 시험 122개가 사라진 뒤 제일 먼저 되살린 것. 촘촘하지는 않지만
// **크게 부러진 것**은 여기서 잡힌다. 자세한 것을 재는 시험은 이 위에 쌓는다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('smk');

  // ── ① 들어가졌다 ──────────────────────────────────────
  const start = await page.evaluate(() => {
    const s = window.__game.store.state;
    return { hp: s.player.hp, map: s.map.id, cls: s.player.classId, lv: s.player.level };
  });
  check('계정을 만들고 들어갔다', !!start.map, JSON.stringify(start));
  check('시작할 때 살아 있다', start.hp > 0, `HP ${start.hp}`);

  // ── ② 걸어진다 ────────────────────────────────────────
  const before = await page.evaluate(() => {
    const p = window.__game.store.state.player;
    return { tx: p.tx, ty: p.ty };
  });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(140);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(90);
  }
  const after = await page.evaluate(() => {
    const p = window.__game.store.state.player;
    return { tx: p.tx, ty: p.ty };
  });
  check('방향키로 움직인다',
    after.tx !== before.tx || after.ty !== before.ty,
    `${before.tx},${before.ty} → ${after.tx},${after.ty}`);

  // ── ③ 땅을 옮겨 다닌다 ────────────────────────────────
  const hop = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const want = ['poino', 'field_1', 'poino_inn', 'castle', 'dungeon_1', 'field_5', 'west_cliff'];
    const got = [];
    for (const id of want) {
      g.changeMap(id, 5, 15);
      await new Promise((r) => setTimeout(r, 450));
      g.scenes.render(g.renderer);
      got.push(s.map.id);
    }
    return { want, got };
  });
  check('여러 땅을 오간다',
    hop.got.join() === hop.want.join(), hop.got.join(' '));

  // ── ④ 전투가 끝까지 돈다 ──────────────────────────────
  //
  // 미리 계산하는 방식이라, 계산이 깨지면 화면이 아니라 **값**이 먼저 이상해진다.
  // 이긴 쪽·걸린 시간·남은 HP 가 다 말이 되는지 본다.
  const fight = await page.evaluate(async () => {
    const C = await import('/src/systems/CombatSystem.js');
    const S = await import('/src/entities/StatBlock.js');
    const g = window.__game, s = g.store.state;
    const mon = s.db.monsters.slime || Object.values(s.db.monsters)[0];
    const r = C.simulateBattle({
      player: S.toCombatant('나', S.computePlayerStats(s), s.player.sprite),
      monsters: [S.toCombatant(mon.name, S.computeMonsterStats(mon), mon.sprite)],
      seed: 12345,
    });
    return {
      winner: r.winner,
      turns: Array.isArray(r.turns) ? r.turns.length : -1,
      dur: r.duration,
      // ⚠ finalHp 는 **숫자가 아니라 {player, monster}** 다. 0.70 에 여기서 NaN 이 났다.
      hpShape: r.finalHp && typeof r.finalHp === 'object'
        ? Object.keys(r.finalHp).sort().join(',') : String(typeof r.finalHp),
      playerHp: r.finalHp && r.finalHp.player,
    };
  });
  check('전투가 승패를 낸다', ['player', 'monster', 'draw'].includes(fight.winner), fight.winner);
  check('전투에 수가 있다', fight.turns > 0, `${fight.turns}수`);
  check('전투에 걸린 시간이 있다', fight.dur > 0, `${fight.dur}ms`);
  check('남은 HP 가 {player, monster} 꼴이다',
    fight.hpShape === 'monster,player', fight.hpShape);
  check('남은 HP 가 숫자다', Number.isFinite(fight.playerHp), String(fight.playerHp));

  // ── ⑤ 저장한 것이 되읽힌다 ────────────────────────────
  //
  // 세이브는 **납작한 한 겹**이다(save.player 같은 것은 없다). 모양이 바뀌면
  // 옛 저장본이 통째로 안 읽히므로, 반드시 있어야 하는 칸을 짚어 둔다.
  const save = await page.evaluate(async () => {
    const A = await import('/src/systems/AccountSystem.js');
    const g = window.__game;
    const fn = A.serializeSave || (A.default && A.default.serializeSave);
    if (!fn) return { noFn: true };
    const out = fn(g.store.state);
    return { keys: Object.keys(out), nested: 'player' in out, v: out.v };
  });
  const MUST = ['v', 'classId', 'level', 'exp', 'gold', 'hp', 'mapId', 'tx', 'ty'];
  check('세이브를 만들 수 있다', !save.noFn);
  check('세이브에 꼭 필요한 칸이 다 있다',
    !save.noFn && MUST.every((k) => save.keys.includes(k)),
    save.noFn ? '' : MUST.filter((k) => !save.keys.includes(k)).join(' ') || '모두 있음');
  check('세이브는 납작한 한 겹이다', save.nested === false);

  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
