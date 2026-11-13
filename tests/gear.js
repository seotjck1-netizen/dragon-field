// 장비 · 강화 · 홈 · 세트 — 값을 손볼 때마다 눈으로 확인하던 자리.
// 0.80.20 — 장비 셋을 한 규칙으로(5 + 덤 + 강화 · 등급이 줄 수를 정함 · C 강화 · 초월 없앰).
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
    // C 규칙 — +7 에서 실패하면 그 자리, +8 부터는 실패하면 한 단계 내려간다(장비는 사라지지 않는다)
    const fake = (ok) => Object.assign(() => 0.5, { chance: () => ok, int: (a) => a });
    const u6 = give(sword, 6);
    E.applyEnhance(s, u6, fake(false));
    out.fail6 = s.inventory.find((i) => i.uid === u6).enhance;
    const u7 = give(sword, 7, { ups: [0.02] });
    const f7 = E.applyEnhance(s, u7, fake(false));
    const i7 = s.inventory.find((i) => i.uid === u7);
    out.fail7 = { to: i7.enhance, fell: f7.fell, ups: (i7.ups || []).length };
    const u9 = give(sword, 9, { ups: [0.02, 0.02, 0.02] });
    E.applyEnhance(s, u9, fake(false));
    const i9 = s.inventory.find((i) => i.uid === u9);
    out.fail9 = { to: i9.enhance, ups: (i9.ups || []).length, exists: !!i9 };
    // +7 에 올라서면 덤(무기 치명타)이 하나 붙는다
    const u6b = give(sword, 6);
    const w7 = E.applyEnhance(s, u6b, fake(true));
    const i6b = s.inventory.find((i) => i.uid === u6b);
    out.up7 = { lvl: i6b.enhance, ups: (i6b.ups || []).length, v: (i6b.ups || [])[0], toast: !!w7.affix };

    // ── 초월 강화는 없다(+10 이 끝) ─────────────────────
    out.tGone = E.canTranscend(s, give(sword, MAX));

    // ── 장비 기본값 · 등급 ──────────────────────────────
    const G = await import('/src/data/gear.js');
    const rng = Object.assign(() => 0.99, { int: (a, b) => b, chance: () => true });
    const roll = (id, grade) => A.rollGear(s.db, { uid: 'r' + (++n), id, count: 1, enhance: 0 }, rng, { grade });
    out.lines = {};
    for (const g of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
      const it = roll(sword, g);
      out.lines[g] = { n: (it.affixes || []).length, plus: it.plus, sp: !!it.special };
    }
    const ringId = find((d) => d.slot === 'ring' && !d.named);
    const rr = roll(ringId, 'epic');
    out.ringPlus = rr.plus;
    out.base = G.gearBase({ plus: 3, enhance: 8 }, items[sword]);
    out.ringBase = G.gearBase({ plus: 3, enhance: 8 }, items[ringId]);
    out.ringMult = G.lineMult({ enhance: 5 }, items[ringId]);
    out.weaponMult = G.lineMult({ enhance: 5 }, items[sword]);
    out.named = roll('dragonslayer').special;

    // ── 홈 (+10 에 하나) ─────────────────────────────────
    const sockAt = (L) => A.socketsOf(s.db, { id: sword, enhance: L }, items[sword]);
    out.sock = { 9: sockAt(9), 10: sockAt(10) };

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
  check('낮은 단계(+5)는 실패해도 그 자리다', r.failKeeps === true);
  check('강화에 성공하면 한 단계 오른다', r.winUp === true);
  check('+7 을 노리다 실패하면 그 자리다', r.fail6 === 6, String(r.fail6));
  check('+8 을 노리다 실패하면 한 단계 내려간다(C 규칙)', r.fail7.to === 6 && r.fail7.fell === true, JSON.stringify(r.fail7));
  check('내려가면 그 단계의 강화 덤도 떨어진다', r.fail7.ups === 0 && r.fail9.ups === 2, `${r.fail7.ups} · ${r.fail9.ups}`);
  check('실패해도 장비는 사라지지 않는다', r.fail9.exists && r.fail9.to === 8, JSON.stringify(r.fail9));
  check('+7 에 올라서면 덤(무기 치명타)이 하나 붙는다', r.up7.lvl === 7 && r.up7.ups === 1 && r.up7.v > 0 && r.up7.toast,
    JSON.stringify(r.up7));

  // ── 초월 강화는 없앴다 ─────────────────────────────────
  check(`초월 강화는 없다 — +${r.MAX} 가 끝이다`, r.tGone.ok === false, r.tGone.reason || '');

  // ── 장비 규칙(5 + 덤 + 강화 · 등급) ─────────────────────
  check('등급이 옵션 줄 수를 정한다(일반 0 · 고급 1 · 희귀 2 · 영웅 3 · 전설 3)',
    r.lines.common.n === 0 && r.lines.uncommon.n === 1 && r.lines.rare.n === 2 && r.lines.epic.n === 3 && r.lines.legendary.n === 3,
    JSON.stringify(r.lines));
  check('높은 등급일수록 덤의 끝이 크다', r.lines.common.plus === 0 && r.lines.uncommon.plus < r.lines.legendary.plus,
    `${r.lines.uncommon.plus} → ${r.lines.legendary.plus}`);
  check('전설만 특수효과를 단다', r.lines.legendary.sp && !r.lines.epic.sp);
  check('장신구에는 덤(기본값)이 없다', r.ringPlus === 0 && r.ringBase === 0);
  check('무기 대미지 = 5 + 덤 + 강화', r.base === 16, String(r.base));
  check('장신구는 강화하면 줄 값이 커진다 · 무기는 아니다', r.ringMult > 1 && r.weaponMult === 1, `${r.ringMult} · ${r.weaponMult}`);
  check('이름 붙은 전설은 정해진 특수효과를 단다', !!r.named, String(r.named));

  // ── 홈 ────────────────────────────────────────────────
  check('+9 에는 홈이 없다', r.sock[9] === 0, String(r.sock[9]));
  check('+10 에 홈이 하나 생긴다', r.sock[10] === 1, String(r.sock[10]));

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
