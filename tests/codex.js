// 도감 · 업적 (0.80.21).
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   · 표(achievements.json)가 가리키는 몬스터 · 물건 · 세트가 모두 있다
//   · 붙어 본 놈은 도감에 오르고, 잡으면 잡은 수가 는다
//   · 해낸 업적은 그 자리에서 보상이 들어오고, **두 번 들어오지 않는다**
//   · 레벨 · 등급처럼 지금 상태에서 읽는 업적도 저절로 잡힌다
//   · 세이브에 남고, 깨진 세이브는 빈 도감으로 시작한다
//   · K / HUD 단추로 창이 열리고 탭 셋이 그려진다
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('codex');

  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const Codex = await import('/src/systems/CodexSystem.js');
    const Inv = await import('/src/systems/InventorySystem.js');
    const Acc = await import('/src/systems/AccountSystem.js');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};

    // ① 표가 가리키는 것들이 다 있다
    const list = Codex.achievements(s.db);
    const sets = (s.db.affixes && s.db.affixes['세트']) || {};
    const bad = [];
    const ids = new Set();
    for (const a of list) {
      if (ids.has(a.id)) bad.push('겹친 id ' + a.id);
      ids.add(a.id);
      if (a.type === 'kill' && !['any', 'boss'].includes(a.target) && !s.db.monsters[a.target]) bad.push(a.id);
      if (a.type === 'set' && !sets[a.target]) bad.push(a.id);
      for (const it of (a.reward && a.reward.items) || []) if (!s.db.items[it.id]) bad.push(a.id + ':' + it.id);
    }
    const allMon = Codex.monsterIds(s.db).length;
    for (const a of list) if (a.type === 'codexMon' && a.count > allMon) bad.push(a.id + ' > ' + allMon);
    const allGear = Codex.gearIds(s.db).length;
    for (const a of list) if (a.type === 'codexItem' && a.count > allGear) bad.push(a.id + ' > ' + allGear);
    out.table = { n: list.length, bad };

    // ② 새 캐릭터는 빈 도감(시작 장비는 가방에 있으니 장비 칸은 몇 개 차 있을 수 있다)
    out.fresh = Object.keys(s.codex.mon).length === 0 && !s.codex.done.kill_1;

    // ③ 잡몹 하나를 잡는다 → 도감 · 첫 사냥 · 보상
    await g.changeMap('field_1', 20, 16); await wait(500);
    s.player.hp = 99999;
    const mon = s.monsters.find((m) => m.alive && !m.isBoss);
    const p = s.player;
    mon.tx = mon.fromTx = p.tx + 1; mon.ty = mon.fromTy = p.ty;
    mon.px = mon.tx * 32 + 16; mon.py = mon.ty * 32 + 16; mon.moving = false;
    const gold0 = s.player.gold;
    const pot0 = Inv.countOf(s, 'potion');
    g.bus.emit('battle:request', { monsterUid: mon.uid });
    for (let i = 0; i < 200 && g.fieldScene.fight; i++) await wait(100);
    await wait(300);
    g.bus.emit('battle:confirm');
    await wait(200);
    const entry = s.codex.mon[mon.defId];
    out.kill = { seen: !!entry, kills: entry ? entry.kills : 0, total: s.codex.stat.kills };
    const firstReward = list.find((a) => a.id === 'kill_1').reward;
    out.first = {
      done: !!s.codex.done.kill_1,
      potions: Inv.countOf(s, 'potion') - pot0,
      want: firstReward.items[0].count,
      goldUp: s.player.gold - gold0 >= firstReward.gold,
    };

    // ④ 두 번 들어오지 않는다
    const goldA = s.player.gold;
    g.store.notify(); await wait(50);
    g.store.notify(); await wait(50);
    out.once = s.player.gold === goldA;

    // ⑤ 지금 상태에서 읽는 업적 — 레벨
    const goldB = s.player.gold;
    s.player.level = 10;
    g.store.notify(); await wait(80);
    out.level = { done: !!s.codex.done.lv_10, notYet: !s.codex.done.lv_20, gold: s.player.gold - goldB };

    // ⑥ 등급 — 희귀 장비를 얻으면 도감에 등급과 함께 오른다
    const sword = Codex.gearIds(s.db).find((id) => s.db.items[id].slot === 'weapon' && !s.db.items[id].named);
    Inv.addItem(s, sword, 1, { grade: 'rare' });
    g.store.notify(); await wait(80);
    out.grade = { rank: s.codex.item[sword], done: !!s.codex.done.grade_rare, epicNot: !s.codex.done.grade_epic };

    // ⑦ 세이브에 남는다 · 깨진 세이브는 빈 도감
    const save = JSON.parse(JSON.stringify(Acc.serializeSave(s)));
    const norm = Codex.normalize(save.codex);
    out.save = {
      kills: norm.stat.kills === s.codex.stat.kills,
      done: Object.keys(norm.done).length === Object.keys(s.codex.done).length,
      item: norm.item[sword] === s.codex.item[sword],
    };
    const junk = Codex.normalize({ mon: { x: 'y', slime: { kills: -5 } }, item: { a: 99 }, stat: { kills: 'many' }, done: null });
    out.junk = junk.mon.slime.kills === 0 && junk.item.a === 4 && junk.stat.kills === 0
      && Object.keys(junk.done).length === 0 && !junk.mon.x;
    out.empty = Object.keys(Codex.normalize(undefined).mon).length === 0;

    // ⑧ 창 — HUD 단추와 탭 셋
    g.bus.emit('ui:codex'); await wait(80);
    const root = document.getElementById('codex-panel');
    out.panel = {
      open: g.panels.codexPanel.open && !root.hidden,
      tabs: root.querySelectorAll('[data-tab]').length,
      monCards: root.querySelectorAll('.codex-card').length,
      known: root.querySelectorAll('.codex-card:not(.is-unknown)').length,
    };
    root.querySelector('[data-tab="item"]').click(); await wait(50);
    out.panel.items = root.querySelectorAll('.codex-item').length;
    out.panel.rareShown = !!root.querySelector('.codex-item .rarity-rare');
    root.querySelector('[data-tab="ach"]').click(); await wait(50);
    out.panel.achs = root.querySelectorAll('.codex-ach').length;
    out.panel.doneShown = root.querySelectorAll('.codex-ach.is-done').length;
    out.allMon = allMon; out.allGear = allGear;
    return out;
  });

  // K 로 닫고 다시 연다
  await page.keyboard.press('k');
  await page.waitForTimeout(100);
  const closed = await page.evaluate(() => !window.__game.panels.codexPanel.open);
  await page.keyboard.press('k');
  await page.waitForTimeout(100);
  const reopened = await page.evaluate(() => window.__game.panels.codexPanel.open);
  const hudBtn = await page.evaluate(() => !!document.querySelector('[data-tool="codex"], [data-key="codex"]'));

  check('업적 표가 가리키는 것이 모두 있다', r.table.n >= 20 && r.table.bad.length === 0, `${r.table.n}개 ${r.table.bad.join(',')}`);
  check('새 캐릭터의 도감은 비어 있다', r.fresh);
  check('붙어 본 놈은 도감에 오르고 잡은 수가 는다', r.kill.seen && r.kill.kills >= 1 && r.kill.total >= 1, JSON.stringify(r.kill));
  check('첫 사냥 — 그 자리에서 보상이 들어온다', r.first.done && r.first.potions === r.first.want && r.first.goldUp, JSON.stringify(r.first));
  check('보상은 두 번 들어오지 않는다', r.once);
  check('레벨 업적은 지금 레벨을 읽는다', r.level.done && r.level.notYet && r.level.gold > 0, JSON.stringify(r.level));
  check('얻은 장비는 등급과 함께 도감에 오른다', r.grade.rank === 2 && r.grade.done && r.grade.epicNot, JSON.stringify(r.grade));
  check('세이브에 남는다', r.save.kills && r.save.done && r.save.item, JSON.stringify(r.save));
  check('깨진 세이브는 다듬고, 없으면 빈 도감', r.junk && r.empty);
  check('창은 탭 셋 · 몬스터 전부를 그린다', r.panel.open && r.panel.tabs === 3 && r.panel.monCards === r.allMon && r.panel.known >= 1,
    JSON.stringify(r.panel));
  check('장비 탭 · 업적 탭이 그려진다', r.panel.items === r.allGear && r.panel.rareShown && r.panel.achs === r.table.n && r.panel.doneShown >= 3,
    JSON.stringify({ items: r.panel.items, all: r.allGear, achs: r.panel.achs, done: r.panel.doneShown }));
  check('K 로 닫고 연다', closed && reopened);
  check('HUD 에 단추가 있다', hudBtn);
  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})();
