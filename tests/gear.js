// 장비 · 강화 · 초월 · 홈 · 세트 — 값을 손볼 때마다 눈으로 확인하던 자리.
//
// 0.70.24 에 시험 122개를 잃고 두 번째로 되살린 것이다.
//
// ⚠ 규칙을 **게임이 쓰는 표(db) 그대로** 잰다. 표를 손으로 다시 짜서 시험하면
//   (affixes.json 은 읽을 때 한 번 가공된다) 게임과 다른 표를 재게 된다.
//   그래서 게임을 띄우고 그 안의 db 와 시스템을 직접 부른다.
//
// ⚠ 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④). "+6 강화 확률은 58%" 처럼 적으면
//   시트에서 값을 고칠 때마다 시험이 깨진다. "높이 오를수록 어려워진다" 를 잰다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('gear');

  const r = await page.evaluate(async () => {
    const E = await import('/src/systems/EquipmentSystem.js');
    const A = await import('/src/systems/AffixSystem.js');
    const F = await import('/src/data/formulas.js');
    const s = window.__game.store.state;
    const items = s.db.items;
    const MAX = F.BALANCE.ENHANCE_MAX, TMAX = F.BALANCE.TRANSCEND_MAX;
    let n = 0;
    const give = (id, enhance = 0, extra = {}) => {
      const uid = `t_${id}_${enhance}_${++n}`;
      s.inventory.push({ uid, id, enhance, count: 1, ...extra });
      return uid;
    };
    const find = (pred) => (Object.entries(items).find(([, d]) => pred(d)) || [])[0];
    const out = { MAX, TMAX };

    // ── 강화 ────────────────────────────────────────────
    const sword = find((d) => d.enhanceable && d.slot === 'weapon' && (d.rarity || 'common') === 'common');
    const curve = [];
    for (let L = 0; L < MAX; L++) curve.push(E.canEnhance(s, give(sword, L)));
    out.curveOk = curve.every((c) => c.ok);
    out.chanceDown = curve.every((c, i) => i === 0 || c.chance <= curve[i - 1].chance);
    out.goldUp = curve.every((c, i) => i === 0 || c.gold >= curve[i - 1].gold);
    out.firstChance = curve[0].chance; out.lastChance = curve[MAX - 1].chance;
    out.atMax = E.canEnhance(s, give(sword, MAX));
    out.club = E.canEnhance(s, give('club', 0));   // 낡은 몽둥이 — 강화할 수 없다
    // 재료는 등급이 정한다 — 일반=약초, 희귀=마력석, 영웅=악마의 핵
    out.mat = {};
    for (const rar of ['common', 'rare', 'epic']) {
      const id = find((d) => d.enhanceable && (d.rarity || 'common') === rar);
      out.mat[rar] = id ? (E.canEnhance(s, give(id, 3)).material || {}).id : null;
    }
    // 강화 성공 · 실패 — 실패해도 **부서지거나 내려가지 않는다**
    const u5 = give(sword, 5);
    const fail = E.applyEnhance(s, u5, { chance: () => false });
    out.failKeeps = fail.ok && !fail.success && s.inventory.find((i) => i.uid === u5).enhance === 5;
    const win = E.applyEnhance(s, u5, { chance: () => true, pick: (a) => a[0], int: (a) => a, next: () => 0.5 });
    out.winUp = win.success && s.inventory.find((i) => i.uid === u5).enhance === 6;

    // ── 초월 (+10 → +15, 왕실 대장간) ───────────────────
    out.tBelow = E.canTranscend(s, give(sword, MAX - 1));
    out.tMat = {};
    for (const slot of ['weapon', 'armor', 'ring', 'necklace']) {
      const id = find((d) => d.enhanceable && d.slot === slot);
      out.tMat[slot] = (E.canTranscend(s, give(id, MAX)).material || {}).id;
    }
    const t12 = give(sword, 12);
    const tf = E.applyTranscend(s, t12, { chance: () => false });
    out.tFailKeeps = tf.ok && !tf.success && s.inventory.find((i) => i.uid === t12).enhance === 12;
    const tw = E.applyTranscend(s, t12, { chance: () => true });
    out.tWinUp = tw.success && s.inventory.find((i) => i.uid === t12).enhance === 13;
    out.tTop = E.canTranscend(s, give(sword, TMAX));

    // ── 홈 (+10 에 하나) ─────────────────────────────────
    const sockAt = (L) => A.socketsOf(s.db, { id: sword, enhance: L }, items[sword]);
    out.sock = { 9: sockAt(9), 10: sockAt(10), 15: sockAt(15) };

    // ── 홈 뚫기 (악마의 파편) ───────────────────────────
    const hadDrill = s.inventory.filter((i) => i.id === A.DRILL_ITEM);
    s.inventory = s.inventory.filter((i) => i.id !== A.DRILL_ITEM);
    const w10 = give(sword, 10);
    out.dNoItem = A.canDrill(s, w10);
    give(A.DRILL_ITEM, 0, { count: 3 });
    out.dWornNeeded = E.isEquipped(s, w10);           // 입고 있지 **않은** 채로 뚫는다
    out.dOk = A.canDrill(s, w10);
    out.dDo = A.drillSocket(s, w10);
    const drilled = s.inventory.find((i) => i.uid === w10);
    out.dAfter = { sockets: A.socketsOf(s.db, drilled, items[sword]), gems: (drilled.gems || []).length };
    out.dTwice = A.canDrill(s, w10);
    out.dBelow = A.canDrill(s, give(sword, 9));
    const armor = find((d) => d.enhanceable && d.slot === 'armor');
    out.dArmor = A.canDrill(s, give(armor, 10));
    const ring = find((d) => d.enhanceable && d.slot === 'ring');
    out.dRing = A.canDrill(s, give(ring, 10));
    out.maxSockets = A.MAX_SOCKETS;
    s.inventory = s.inventory.filter((i) => i.id !== A.DRILL_ITEM).concat(hadDrill);

    // ── 용린 세트 — 고룡 앞에서만 ───────────────────────
    const set = A.setDefs(s.db).find((x) => x.id === 'dragonscale');
    const full = set ? set.slots.map((sl) => sl[0]) : [];
    const vsDragon = A.setProgress(s.db, full, ['great_dragon'])[0];
    const vsSlime = A.setProgress(s.db, full, ['slime'])[0];
    const noFoe = A.setProgress(s.db, full, null)[0];
    out.set = {
      found: !!set,
      worn: vsDragon && vsDragon.worn, slots: set && set.slots.length,
      onDragon: vsDragon ? vsDragon.steps.filter((x) => x.on).length : 0,
      onSlime: vsSlime ? vsSlime.steps.filter((x) => x.on).length : -1,
      metSlime: vsSlime ? vsSlime.steps.filter((x) => x.met).length : 0,
      onNone: noFoe ? noFoe.steps.filter((x) => x.on).length : -1,
      steps: set ? set.steps.length : 0,
      // 무기 자리는 검·활·지팡이 중 **하나**로 채워진다 — 셋 다 가져도 한 자리
      threeWeapons: A.setProgress(s.db,
        ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'dragon_knight_sword', 'dragon_knight_bow', 'dragon_knight_staff'],
        ['great_dragon'])[0].worn,
      // 가방에 있는 것은 안 센다 — **끼고 있는 것만**
      bagOnly: A.setProgress(s.db, [], ['great_dragon']).length,
    };
    return out;
  });

  // ── 강화 ───────────────────────────────────────────────
  check('+0~+9 는 강화할 수 있다', r.curveOk);
  check('높이 오를수록 성공 확률이 떨어진다(오르는 일이 없다)', r.chanceDown,
    `+0 ${(r.firstChance * 100).toFixed(0)}% → +9 ${(r.lastChance * 100).toFixed(0)}%`);
  check('높이 오를수록 값이 비싸진다(싸지는 일이 없다)', r.goldUp);
  check(`+${r.MAX} 에서는 대장간 강화가 멈춘다`, r.atMax.ok === false, r.atMax.reason || '');
  check('낡은 몽둥이는 강화할 수 없다', r.club.ok === false, r.club.reason || '');
  check('일반 장비는 약초로 강화한다', r.mat.common === 'herb', String(r.mat.common));
  check('희귀 장비는 마력석으로 강화한다', r.mat.rare === 'magic_stone', String(r.mat.rare));
  check('영웅 장비는 악마의 핵으로 강화한다', r.mat.epic === 'demon_core', String(r.mat.epic));
  check('강화에 실패해도 부서지거나 내려가지 않는다', r.failKeeps === true);
  check('강화에 성공하면 한 단계 오른다', r.winUp === true);

  // ── 초월 ───────────────────────────────────────────────
  check(`초월은 +${r.MAX} 부터다`, r.tBelow.ok === false, r.tBelow.reason || '');
  check('무기 초월은 루비', r.tMat.weapon === 'gem_ruby', String(r.tMat.weapon));
  check('방어구 초월은 에메랄드', r.tMat.armor === 'gem_emerald', String(r.tMat.armor));
  check('장신구 초월은 오닉스', r.tMat.ring === 'gem_onyx' && r.tMat.necklace === 'gem_onyx',
    `${r.tMat.ring} · ${r.tMat.necklace}`);
  // 내려가면 홈이 사라지고, 박아 둔 보석이 조용히 없어진다 — 그 사고가 한 단계보다 나쁘다
  check('초월에 실패해도 내려가지 않는다', r.tFailKeeps === true);
  check('초월에 성공하면 한 단계 오른다', r.tWinUp === true);
  check(`+${r.TMAX} 가 끝이다`, r.tTop.ok === false, r.tTop.reason || '');

  // ── 홈 ────────────────────────────────────────────────
  check('+9 에는 홈이 없다', r.sock[9] === 0, String(r.sock[9]));
  check('+10 에 홈이 하나 생긴다', r.sock[10] === 1, String(r.sock[10]));
  check('초월해도 홈이 저절로 늘지는 않는다', r.sock[15] === 1, String(r.sock[15]));

  // ── 홈 뚫기 ────────────────────────────────────────────
  check('악마의 파편이 없으면 못 뚫는다', r.dNoItem.ok === false, r.dNoItem.reason || '');
  check('입고 있지 않은 장비도 뚫을 수 있다', r.dWornNeeded === false && r.dOk.ok === true,
    r.dOk.reason || '');
  check('뚫으면 홈이 둘이 된다', r.dDo.ok && r.dAfter.sockets === 2 && r.dAfter.gems === 2,
    JSON.stringify(r.dAfter));
  check('한 장비에 한 번뿐이다', r.dTwice.ok === false, r.dTwice.reason || '');
  check('+9 장비는 못 뚫는다', r.dBelow.ok === false, r.dBelow.reason || '');
  check('방어구는 못 뚫는다', r.dArmor.ok === false, r.dArmor.reason || '');
  check('반지는 뚫을 수 있다', r.dRing.ok === true, r.dRing.reason || '');
  check('홈은 둘을 넘지 않는다', r.maxSockets === 2);

  // ── 세트 ───────────────────────────────────────────────
  check('용린 세트를 표에서 찾았다', r.set.found);
  check('용린 한 벌은 네 자리다', r.set.slots === 4 && r.set.worn === 4, `${r.set.worn}/${r.set.slots}`);
  check('고룡 앞에서는 세트 효과가 다 켜진다', r.set.onDragon === r.set.steps && r.set.steps > 0,
    `${r.set.onDragon}/${r.set.steps}`);
  check('슬라임 앞에서는 하나도 안 켜진다(고룡에게만 세다)', r.set.onSlime === 0, String(r.set.onSlime));
  check('안 켜져도 "다 갖췄다" 는 보인다(왜 안 붙는지 헤매지 않게)', r.set.metSlime === r.set.steps);
  check('싸우지 않을 때도 안 켜진다', r.set.onNone === 0, String(r.set.onNone));
  check('무기 셋을 다 가져도 무기 자리는 하나로 센다', r.set.threeWeapons === 4, `${r.set.threeWeapons}/4`);
  check('가방에만 있는 것은 세트로 안 센다', r.set.bagOnly === 0);

  // ── 두 대장간 모두에서 뚫는 칸이 보인다 ─────────────────
  //
  // 0.70.16 전에는 **왕실 대장간에 이 칸이 아예 없었다.** +10 넘은 장비를 들고 가는
  // 곳이 거기라, 거기서 안 되면 "낀 것만 되는구나" 로 읽혔다.
  const ui = await page.evaluate(async () => {
    const A = await import('/src/systems/AffixSystem.js');
    const g = window.__game, s = g.store.state;
    const sword = Object.entries(s.db.items).find(([, d]) => d.enhanceable && d.slot === 'weapon')[0];
    const uid = 'ui_drill_test';
    s.inventory.push({ uid, id: sword, enhance: 10, count: 1 });
    s.inventory.push({ uid: 'ui_drill_item', id: A.DRILL_ITEM, count: 2 });
    const out = {};
    for (const mode of ['forge', 'transcend']) {
      g.panels.inventoryPanel.show({ mode });
      g.panels.inventoryPanel.selectedUid = uid;
      g.panels.inventoryPanel.render();
      await new Promise((r) => setTimeout(r, 120));
      out[mode] = !!g.panels.inventoryPanel.root.querySelector('[data-drill]');
      g.panels.inventoryPanel.close();
    }
    s.inventory = s.inventory.filter((i) => i.uid !== uid && i.uid !== 'ui_drill_item');
    return out;
  });
  check('마을 대장간에서 홈 뚫기 단추가 보인다', ui.forge === true);
  check('왕실 대장간에서도 홈 뚫기 단추가 보인다', ui.transcend === true);

  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
