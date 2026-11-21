// 0.80.26 — 아이템 획득 창 · 물약 % · 고정 공격력.
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   물약
//   · 회복약(기본)은 예전처럼 고정, 희귀 회복약 이상은 최대 HP 의 몫(한 병의 천장까지)
//   · 전투 안의 자동 물약도 같은 셈 · 몫으로 차는 약은 다음 약까지 더 오래 기다린다
//   고정 공격력
//   · 뿌리 스킬 한 점이 공격력을 몇씩 그대로 올린다 · 무기 대미지가 고정 공격력으로도 더해진다
//   아이템 획득 창
//   · 지금 것보다 좋은 장비면 창(그림 · 비교 · 전투력) — 못한 것은 창 없이 가방에
//   · Enter = 장착 · Esc = 가방에 넣기(이미 가방에 있다) · 싸우는 동안은 기다렸다가 끝난 뒤에 뜬다
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const ROOT = path.join(__dirname, '..');

(async () => {
  const F = await import(path.join(ROOT, 'src/data/formulas.js'));
  const C = await import(path.join(ROOT, 'src/systems/CombatSystem.js'));
  const items = require(path.join(ROOT, 'src/data/items.json'));

  // ══ 1. 물약 ═════════════════════════════════════════════
  const basic = items.potion.use;
  const rare = items.greater_potion.use;
  check('회복약(기본)은 고정이다', basic.hp > 0 && !basic.hpPct && F.potionHeal(basic, 1200) === basic.hp && F.potionHeal(basic, 9000) === basic.hp,
    JSON.stringify(basic));
  check('희귀 회복약은 최대 HP 의 몫이다(HP 1,200 마법사에게 회복약보다 훨씬 크다)', rare.hpPct > 0
    && F.potionHeal(rare, 1200) === Math.round(1200 * rare.hpPct) && F.potionHeal(rare, 1200) > basic.hp * 3, String(F.potionHeal(rare, 1200)));
  check('몫으로 찰 때는 한 병의 천장까지', !rare.hpMax || F.potionHeal(rare, 1e6) === rare.hpMax);
  check('희귀 이상은 전부 몫이다', Object.values(items).filter((d) => d && d.use && (d.use.hp || d.use.hpPct) && ['rare', 'epic', 'legendary'].includes(d.rarity))
    .every((d) => d.use.hpPct > 0));
  check('화면 글 — "최대 HP 20%"', /최대 HP \d+%/.test(F.potionHealText(rare)) && F.potionHealText(basic) === `HP +${basic.hp}`);
  // 전투 안의 자동 물약
  const fight = (stock) => C.simulateBattle({
    seed: 3,
    player: { name: '나', hp: 400, maxHp: 1200, atk: 50, def: 30, spd: 10, crit: 0 },
    monsters: [{ name: '샌드백', hp: 200000, maxHp: 200000, atk: 140, def: 10, spd: 9, crit: 0 }],
    potions: { stock, threshold: 0.7, cooldownMs: 2000 },
    maxActions: 60,
  });
  const r1 = fight([{ id: 'greater_potion', heal: 0, healPct: rare.hpPct, healMax: rare.hpMax || 0, count: 5 }]);
  const h1 = r1.turns.filter((t) => t.type === 'heal');
  const want1 = Math.min(Math.round(1200 * rare.hpPct), rare.hpMax || Infinity);
  check('전투 안에서도 몫만큼 찬다', h1.length > 0 && h1[0].amount === want1, `${h1[0] && h1[0].amount} / ${want1}`);
  const gaps = h1.slice(1).map((t, i) => t.t - h1[i].t);
  check('몫으로 차는 약은 다음 약까지 더 오래 기다린다', gaps.every((g) => g >= (F.BALANCE.POTION_PCT_COOLDOWN_MS || 0)), gaps.join(','));

  // ══ 2. 게임(브라우저) ══════════════════════════════════════
  const { browser, page, errs } = await boot('loot');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    const Inv = await import('/src/systems/InventorySystem.js');
    const Eq = await import('/src/systems/EquipmentSystem.js');
    const St = await import('/src/entities/StatBlock.js');
    const Skills = await import('/src/systems/SkillSystem.js');

    // 고정 공격력 — 무기를 벗으면 그 무기의 대미지만큼 고정 공격력도 빠진다 · 뿌리 스킬 한 점
    const atk0 = St.computePlayerStats(s).atk;
    const wUid = s.player.equipment.weapon;
    s.player.equipment.weapon = null;
    const atkBare = St.computePlayerStats(s).atk;
    s.player.equipment.weapon = wUid;
    out.weaponFlat = { atk0, atkBare };
    const tree = s.db.skills.tree || {};
    const cls = s.player.classId;
    const rootNode = Object.entries(tree).find(([, n]) => n && n.effect && n.effect.atkFlat && (!n.class || n.class === cls));
    out.rootFlat = rootNode ? rootNode[1].effect.atkFlat : 0;

    // 아이템 획득 창 — 지금 무기보다 좋은 것(전설 · 높은 단계)
    const pick = (pred) => Object.entries(s.db.items).find(([id, d]) => d && pred(d, id));
    const Loot = await import('/src/systems/LootSystem.js');
    const bases = Loot.gearBases(s.db, 'weapon', Skills.weaponShape(s)).sort((a, b) => b.tier - a.tier);
    const better = [bases[0].id];
    const made = Inv.addItem(s, better[0], 1, { grade: 'legendary' });
    g.store.notify();
    g.offerLootRef(made);
    await sleep(500);
    const card = document.querySelector('#loot-panel .loot-card');
    out.open = { panel: g.panels.lootPanel.open, card: !!card, icon: !!(card && card.querySelector('.inv-icon')),
      text: card ? card.innerText.replace(/\s+/g, ' ').slice(0, 500) : '' };
    // Enter — 장착
    g.bus.emit('input:action', 'confirm');
    await sleep(300);
    out.equipped = s.player.equipment.weapon === made[0].uid && !g.panels.lootPanel.open;

    // 못한 것 — 창 없이 가방에
    const worse = pick((d) => d.slot === 'weapon' && !d.named && Number(d.tier) === 1);
    const madeW = Inv.addItem(s, worse[0], 1, { grade: 'common' });
    g.offerLootRef(madeW);
    await sleep(500);
    out.worse = { panel: g.panels.lootPanel.open, inBag: s.inventory.some((i) => i.uid === madeW[0].uid) };

    // Esc — 가방에 넣기(끼지 않는다)
    const ring = pick((d) => d.slot === 'ring' && !d.named);
    for (const sl of ['ring1', 'ring2']) s.player.equipment[sl] = null;
    const madeR = Inv.addItem(s, ring[0], 1, { grade: 'epic' });
    g.offerLootRef(madeR);
    await sleep(500);
    out.ringOpen = g.panels.lootPanel.open;
    g.bus.emit('input:action', 'cancel');
    await sleep(200);
    out.kept = !g.panels.lootPanel.open && !Eq.isEquipped(s, madeR[0].uid) && s.inventory.some((i) => i.uid === madeR[0].uid);

    // 싸우는 동안은 기다린다 — 필드 싸움이 끝난 뒤에 뜬다
    await g.changeMap('field_1', 20, 16); await sleep(600);
    const mon = s.monsters.find((m) => m.alive && !m.isBoss);
    const p = s.player;
    mon.tx = mon.fromTx = p.tx + 1; mon.ty = mon.fromTy = p.ty;
    mon.px = mon.tx * 32 + 16; mon.py = mon.ty * 32 + 16; mon.moving = false;
    const def = s.db.monsters[mon.defId || mon.id];
    const hp0 = def.stats.hp;
    def.stats.hp = hp0 * 30;
    g.bus.emit('battle:request', { monsterUid: mon.uid, seed: 5 });
    await sleep(200);
    def.stats.hp = hp0;
    const fighting = !!g.fieldScene.fight;
    const armorSlot = 'armor';
    s.player.equipment[armorSlot] = null;
    const armor = pick((d) => d.slot === 'armor' && !d.named && Number(d.tier) >= 2);
    const madeA = Inv.addItem(s, armor[0], 1, { grade: 'rare' });
    g.offerLootRef(madeA);
    await sleep(400);
    out.during = { fighting, panel: g.panels.lootPanel.open };
    for (let i = 0; i < 300 && g.fieldScene.fight; i++) await sleep(100);
    await sleep(700);
    out.after = { fight: !!g.fieldScene.fight, panel: g.panels.lootPanel.open };
    if (g.panels.lootPanel.open) g.bus.emit('input:action', 'confirm');
    await sleep(200);
    out.armorOn = s.player.equipment[armorSlot] === madeA[0].uid;
    return out;
  });
  check('무기 대미지가 고정 공격력으로도 더해진다(벗으면 그만큼 더 빠진다)', r.weaponFlat.atk0 > r.weaponFlat.atkBare, JSON.stringify(r.weaponFlat));
  check('직업 뿌리 스킬 한 점 = 고정 공격력', r.rootFlat > 0, String(r.rootFlat));
  check('지금 것보다 좋은 장비면 획득 창(그림 · 전투력 비교)', r.open.panel && r.open.card && r.open.icon && /전투력/.test(r.open.text) && /장착/.test(r.open.text),
    JSON.stringify(r.open));
  check('Enter — 바로 장착한다', r.equipped);
  check('못한 장비는 창 없이 가방에', r.worse.panel === false && r.worse.inBag, JSON.stringify(r.worse));
  check('빈 반지 칸 — 창이 뜨고, Esc 는 가방에 넣기(끼지 않는다)', r.ringOpen && r.kept);
  check('싸우는 동안은 창을 띄우지 않는다', r.during.fighting && r.during.panel === false, JSON.stringify(r.during));
  check('싸움이 끝나면 뜬다', r.after.fight === false && r.after.panel === true && r.armorOn, JSON.stringify({ ...r.after, on: r.armorOn }));
  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
