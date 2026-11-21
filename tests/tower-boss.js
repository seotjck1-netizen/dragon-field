// 끝없는 탑 — 보스 특성 · 층 보상 표 · 시트 (0.80.25).
//
// 숫자가 아니라 **성질**을 잰다(docs/TESTS.md ④):
//   특성(전투 규칙)
//   · 가시 껍질은 물리만 되받아치고 마법은 50% 더 아프다 · 일격은 기를 모으고, 두 대를 먹이면 흐트러진다
//   · 거울 장막은 마법을 되돌리고 치명타에 깨진다 · 저주는 치명타를 깎는다 · 신속은 두 번 친다 · 흡혈은 되찾는다
//   · 특성이 없는 판은 aff 칸이 없을 때와 한 대도 다르지 않다(난수를 더 쓰지 않는다)
//   층 짜기 · 보상
//   · 그 주 · 그 층이면 누구에게나 같은 특성, '같이 안 나옴' 짝은 함께 안 나온다
//   · 보스 몸에 특성 배율이 얹힌다 · 표 밖(51층 ~)은 마지막 10층을 되풀이하고 골드는 더 준다
//   · 5층마다 장비 몫이 있다 · 층마다 적정 레벨이 적혀 있다
//   시트(tower · tower_boss 탭)
//   · 표 → 탭 → 표가 그대로 돈다 · 없는 아이템 · 모르는 효과는 막는다 · 탭이 없는 옛 시트는 그대로 둔다
//   · 서버는 server/content 의 표를 읽는다(시트를 고치면 다음 요청부터 그 값)
//   게임(브라우저)
//   · 탑 창의 층별 보상(10층씩 · 적정 레벨 · 특성 · 장비) · 보스 등장에 특성 · 이름 아래 특성
//   · 보스 층을 처음 깨면 장비 하나(표의 등급 안에서)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

const ROOT = path.join(__dirname, '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', f), 'utf8'));

(async () => {
  const C = await import(path.join(ROOT, 'src/systems/CombatSystem.js'));
  const T = await import(path.join(ROOT, 'src/systems/TowerSystem.js'));
  const tower = read('tower.json');
  const db = { maps: read('maps.json'), monsters: read('monsters.json'), items: read('items.json'), tower };

  // ══ 1. 특성 — 전투 규칙 ═════════════════════════════════════
  const hero = (over = {}) => ({ name: '나', hp: 50000, maxHp: 50000, atk: 3000, def: 1500, spd: 10, crit: 0, ...over });
  const boss = (aff, over = {}) => ({ name: '보스', hp: 400000, maxHp: 400000, atk: 2500, def: 1200, spd: 9, crit: 0, ...(aff ? { aff } : {}), ...over });
  const warrior = { counter: 0 };
  const mage = { school: 'magic' };
  const run = (o) => C.simulateBattle({ seed: 7, ...o });
  const hits = (r, f) => r.turns.filter((t) => t.type === 'hit' && f(t));

  const thornW = run({ player: hero(), monsters: [boss({ counterPhys: 1, counterPower: 0.8, takenMagic: 0.5 })], playerTraits: warrior });
  const thornM = run({ player: hero(), monsters: [boss({ counterPhys: 1, counterPower: 0.8, takenMagic: 0.5 })], playerTraits: mage });
  check('가시 껍질 — 물리로 때리면 되받아친다', hits(thornW, (t) => t.tag === 'bossCounter' && t.actor === 'monster').length > 0);
  check('가시 껍질 — 마법은 되받아치지 않는다', hits(thornM, (t) => t.tag === 'bossCounter').length === 0);
  const plainM = run({ player: hero(), monsters: [boss(null)], playerTraits: mage });
  const weakM = run({ player: hero(), monsters: [boss({ takenMagic: 0.5 })], playerTraits: mage });
  const d0 = hits(plainM, (t) => t.actor === 'player')[0].damage;
  const d1 = hits(weakM, (t) => t.actor === 'player')[0].damage;
  check('가시 껍질 — 마법 피해 +50%', Math.abs(d1 / d0 - 1.5) < 0.01, `${d0} → ${d1}`);

  const heavyNo = run({ player: hero({ hp: 400000, maxHp: 400000 }), monsters: [boss({ heavyEvery: 3, heavyPower: 2.6, heavyBreak: 2 })], playerTraits: warrior });
  const heavyYes = run({ player: hero({ hp: 400000, maxHp: 400000 }), monsters: [boss({ heavyEvery: 3, heavyPower: 2.6, heavyBreak: 2 })], playerTraits: warrior, playerMods: { doubleHit: 1 } });
  const windups = heavyNo.turns.filter((t) => t.type === 'windup').length;
  check('일격 — 기를 모은 다음 차례에 큰 한 방', windups > 0 && hits(heavyNo, (t) => t.tag === 'heavy').length > 0
    && heavyNo.turns.filter((t) => t.type === 'stagger').length === 0, `기 ${windups}`);
  const heavyHit = hits(heavyNo, (t) => t.tag === 'heavy')[0];
  const normalHit = hits(heavyNo, (t) => t.actor === 'monster' && !t.tag && !t.crit)[0];
  check('일격 — 보통 대보다 훨씬 세다', heavyHit && normalHit && heavyHit.damage > normalHit.damage * 2, `${normalHit && normalHit.damage} → ${heavyHit && heavyHit.damage}`);
  check('일격 — 기를 모으는 동안 두 대를 먹이면(2회 공격) 흐트러진다', heavyYes.turns.some((t) => t.type === 'stagger')
    && hits(heavyYes, (t) => t.tag === 'heavy').length === 0);

  const mirror = run({ player: hero({ hp: 200000, maxHp: 200000 }), monsters: [boss({ reflectMagic: 0.4, shatterCrits: 99 })], playerTraits: mage });
  const refl = hits(mirror, (t) => t.actor === 'player' && t.reflected > 0);
  check('거울 장막 — 마법 피해를 되돌린다(내 HP 가 깎인다)', refl.length > 0 && refl[0].actorHpAfter < 200000
    && Math.abs(refl[0].reflected - Math.round(refl[0].damage * 0.4)) <= 1, JSON.stringify(refl[0] && { d: refl[0].damage, r: refl[0].reflected }));
  const mirrorW = run({ player: hero(), monsters: [boss({ reflectMagic: 0.4, shatterCrits: 99 })], playerTraits: warrior });
  check('거울 장막 — 물리는 되돌리지 않는다', hits(mirrorW, (t) => t.reflected > 0).length === 0);
  const shatter = run({ player: hero({ crit: 1 }), monsters: [boss({ reflectMagic: 0.4, shatterCrits: 2 })], playerTraits: mage });
  const sh = hits(shatter, (t) => t.actor === 'player');
  check('거울 장막 — 치명타(여기선 두 번)에 깨지고 그 뒤로는 안 되돌린다', sh[0].reflected > 0 && sh[1].shattered === true
    && sh.slice(1).every((t) => !t.reflected), JSON.stringify(sh.slice(0, 3).map((t) => [t.crit, t.reflected || 0, !!t.shattered])));

  const cursed = run({ player: hero({ crit: 1, hp: 400000, maxHp: 400000 }), monsters: [boss({ curse: 0.5 })], playerTraits: warrior });
  const mine = hits(cursed, (t) => t.actor === 'player');
  const critShare = mine.filter((t) => t.crit).length / mine.length;
  check('저주 — 내 치명타 확률이 깎인다(100% → 반쯤)', critShare > 0.25 && critShare < 0.75, critShare.toFixed(2));
  const swift = run({ player: hero({ hp: 400000, maxHp: 400000 }), monsters: [boss({ doubleHit: 1 })], playerTraits: warrior });
  check('신속 — 한 번 더 친다', hits(swift, (t) => t.tag === 'swift' && t.actor === 'monster').length > 0);
  const regen = run({ player: hero({ hp: 400000, maxHp: 400000 }), monsters: [boss({ regen: 0.01 })], playerTraits: warrior });
  const rh = hits(regen, (t) => t.actor === 'monster' && t.healed > 0);
  check('흡혈 — 맞힐 때마다 제 최대 HP 의 몫을 되찾는다', rh.length > 0 && rh[0].healed <= 4000, rh[0] && String(rh[0].healed));
  const low = run({ player: hero(), monsters: [boss({ takenLow: 1 }, { hp: 100000 })], playerTraits: warrior });
  const lowPlain = run({ player: hero(), monsters: [boss(null, { hp: 100000 })], playerTraits: warrior });
  check('흡혈의 약점 — HP 40% 아래에서는 더 아프다', hits(low, (t) => t.actor === 'player')[0].damage === hits(lowPlain, (t) => t.actor === 'player')[0].damage * 2
    || Math.abs(hits(low, (t) => t.actor === 'player')[0].damage / hits(lowPlain, (t) => t.actor === 'player')[0].damage - 2) < 0.01);

  // 특성이 없으면 aff 칸이 없을 때와 똑같다(같은 seed · 같은 결과)
  const same = [1, 2, 3, 4, 5].every((seed) => {
    const a = C.simulateBattle({ seed, player: hero({ crit: 0.3 }), monsters: [boss(null), boss(null)], playerTraits: warrior, playerMods: { doubleHit: 0.2 } });
    const b = C.simulateBattle({ seed, player: hero({ crit: 0.3 }), monsters: [boss(null), boss(null)], playerTraits: warrior, playerMods: { doubleHit: 0.2 } });
    return JSON.stringify(a) === JSON.stringify(b) && !a.turns.some((t) => 'reflected' in t || 'windupHits' in t);
  });
  check('특성이 없는 판에는 새 칸이 하나도 안 붙는다', same);

  // ══ 2. 층 짜기 · 보상 ═══════════════════════════════════════
  const a1 = T.floorPlan(db, 30, 2966).affixes.join();
  const a2 = T.floorPlan(db, 30, 2966).affixes.join();
  check('그 주 · 그 층이면 누구에게나 같은 특성', a1 === a2 && a1.split(',').length === 2, a1);
  const weeks = Array.from({ length: 200 }, (_, i) => T.rollAffixes(db, 40, 3000 + i, 3));
  const exOk = weeks.every((ids) => {
    for (const id of ids) for (const x of tower.affixes[id].excludes || []) if (ids.includes(x)) return false;
    return new Set(ids).size === ids.length;
  });
  check("'같이 안 나옴' 짝은 함께 안 나온다 · 같은 특성은 두 번 안 붙는다", exOk);
  const kinds = new Set(weeks.flat());
  check('주마다 여러 특성이 돌아가며 나온다', kinds.size >= 8, String(kinds.size));
  // 특성 배율이 보스 몸에 얹힌다
  const onlyStone = { ...db, tower: { ...tower, affixes: { stone: tower.affixes.stone } } };
  const plain = { ...db, tower: { ...tower, floors: tower.floors.map((r) => ({ ...r, affixes: 0 })) } };
  const bs = T.floorPlan(onlyStone, 25, 1).members[0];
  const bp = T.floorPlan(plain, 25, 1).members[0];
  check('돌가죽 — 보스 방어가 표의 배율만큼', Math.abs(bs.def.stats.def / bp.def.stats.def - tower.affixes.stone.effect.defMult) < 0.01
    && bs.aff && bs.aff.takenCrit === tower.affixes.stone.effect.takenCrit && bs.aff.defMult == null, JSON.stringify(bs.aff));
  const onlyFlame = { ...db, tower: { ...tower, affixes: { flame: tower.affixes.flame } } };
  check('불꽃 두름 — 보스 공격이 마법이 된다', T.floorPlan(onlyFlame, 25, 1).members[0].def.school === 'magic');
  check('특성 없는 보스 층에는 aff 가 없다', !bp.aff && !T.floorPlan(db, 4, 1).members.some((m) => m.aff));

  const rows = tower.floors;
  const bossRows = rows.filter((r) => r.floor % 5 === 0);
  check('5층마다 보스 층에 장비 몫이 있다', bossRows.length === 10 && bossRows.every((r) => Array.isArray(r.gear) && r.gear.some((w) => w > 0)));
  check('층마다 적정 레벨이 적혀 있다', rows.every((r) => r.rec && r.rec.length > 2), rows.filter((r) => !r.rec).map((r) => r.floor).join());
  const rw50 = T.floorReward(db, T.floorPlan(db, 50, 1));
  const rw60 = T.floorReward(db, T.floorPlan(db, 60, 1));
  check('표 밖(60층)은 50층을 되풀이하고 골드는 더 준다', rw60.gold > rw50.gold && JSON.stringify(rw60.items) === JSON.stringify(rw50.items)
    && JSON.stringify(rw60.gear) === JSON.stringify(rw50.gear), `${rw50.gold} → ${rw60.gold}`);
  check('장비 몫 → 등급 몫(일반 0 을 앞에)', JSON.stringify(T.gearWeights([70, 30, 0, 0])) === '[0,70,30,0,0]' && T.gearWeights(null) === null);
  check('층별 목록 — 10층에 보스 · 특성 · 적정 레벨 · 보상', (() => {
    const l = T.floorList(db, 1, 10, 3000);
    return l.length === 10 && l[4].boss && l[4].affixes.length === 1 && l[4].reward.gear && l[0].rec && l[0].reward.gold > 0;
  })());

  // ══ 3. 시트 ═════════════════════════════════════════════════
  const S = require('../server/sheets.js');
  const all = { 'tower.json': tower, 'maps.json': db.maps, 'monsters.json': db.monsters, 'items.json': db.items };
  const t1 = S.SHEETS.tower.apply(S.parseCsv(S.toCsv(S.SHEETS.tower.toRows(all))), all)['tower.json'];
  const t2 = S.SHEETS.tower_boss.apply(S.parseCsv(S.toCsv(S.SHEETS.tower_boss.toRows(all))), { ...all, 'tower.json': t1 })['tower.json'];
  check('표 → 시트 → 표가 그대로 돈다(tower · tower_boss)', S.formatTower(t2) === fs.readFileSync(path.join(ROOT, 'src/data/tower.json'), 'utf8'));
  check('시트 탭은 없어도 된다(옛 시트)', S.SHEETS.tower.optional === true && S.SHEETS.tower_boss.optional === true);
  const rowsT = S.SHEETS.tower.toRows(all);
  const badItem = rowsT.map((r) => r.slice());
  badItem[5][3] = 'no_such_item';
  let e1 = '';
  try { S.SHEETS.tower.apply(badItem, all); } catch (err) { e1 = err.message; }
  check('없는 아이템은 막는다', /없는 아이템/.test(e1), e1);
  const rowsB = S.SHEETS.tower_boss.toRows(all).map((r) => r.slice());
  rowsB[1][4] = '하늘을 난다';
  let e2 = '';
  try { S.SHEETS.tower_boss.apply(rowsB, all); } catch (err) { e2 = err.message; }
  check('모르는 효과 이름은 막는다', /모릅니다/.test(e2), e2);
  // 시트에서 값을 바꾸면 반영된다(5층 골드 · 가시 껍질의 반격 확률)
  const edT = rowsT.map((r) => r.slice());
  edT[5][2] = '12,345';
  const edB = S.SHEETS.tower_boss.toRows(all).map((r) => r.slice());
  edB[1][5] = 0.25;
  const n1 = S.SHEETS.tower.apply(edT, all)['tower.json'];
  const n2 = S.SHEETS.tower_boss.apply(edB, { ...all, 'tower.json': n1 })['tower.json'];
  check('시트에서 고친 골드 · 특성 값이 표에 들어간다', n2.floors[4].gold === 12345 && n2.affixes.thorny.effect.counterPhys === 0.25);
  const C2 = require('../server/content.js');
  const files = {};
  for (const f of ['items.json', 'monsters.json', 'drops.json', 'quests.json', 'npcs.json', 'classes.json', 'skills.json', 'traits.json', 'stats.json', 'player.json', 'appearance.json', 'maps.json', 'manifest.json', 'affixes.json', 'tower.json']) files[f] = read(f);
  check('지금 표는 검사를 통과한다', C2.validate(files).ok);
  const broken = { ...files, 'tower.json': { ...tower, affixes: { ...tower.affixes, odd: { name: '이상', effect: { flying: 1 } } } } };
  check('검사 — 모르는 효과 키는 막는다', !C2.validate(broken).ok);

  // 서버는 server/content 의 표를 읽는다
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tower-rules-'));
  fs.writeFileSync(path.join(dir, 'tower.json'), JSON.stringify({ ...tower, minFloorMs: 4321 }));
  process.env.POINO_CONTENT_DIR = dir;
  delete require.cache[require.resolve('../server/tower.js')];
  const { loadRules } = require('../server/tower.js');
  check('서버는 server/content 의 표(시트가 고친 것)를 읽는다', loadRules().minFloorMs === 4321);
  delete process.env.POINO_CONTENT_DIR;
  fs.rmSync(dir, { recursive: true, force: true });

  // ══ 4. 게임(브라우저) ══════════════════════════════════════
  const { browser, page, errs } = await boot('towerboss');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    const out = {};
    const Eq = await import('/src/systems/EquipmentSystem.js');
    const Inv = await import('/src/systems/InventorySystem.js');
    s.player.level = 50;
    const w = s.inventory.find((i) => i.uid === s.player.equipment.weapon);
    if (w) { w.grade = 'legendary'; w.plus = 5; w.enhance = 10; }
    const bySlot = {};
    for (const [id, d] of Object.entries(s.db.items)) {
      if (!d || !d.slot || d.slot === 'weapon' || d.type === 'consumable' || d.type === 'material') continue;
      if (!bySlot[d.slot] || (d.price || 0) > (s.db.items[bySlot[d.slot]].price || 0)) bySlot[d.slot] = id;
    }
    for (const id of Object.values(bySlot)) {
      const made = Inv.addItem(s, id, 1, { grade: 'legendary' });
      if (made[0]) { made[0].enhance = 10; made[0].plus = 5; Eq.equip(s, made[0].uid); }
    }
    s.settings.battleSkip = false;
    g.store.notify();
    g.bus.emit('ui:tower'); await sleep(200);
    const rowsEl = [...document.querySelectorAll('#tower-panel .tf-row')];
    out.list = {
      n: rowsEl.length,
      rec: rowsEl.every((li) => /Lv\.|전설/.test(li.querySelector('.tf-rec').textContent)),
      boss: rowsEl.filter((li) => li.classList.contains('is-boss')).length,
      aff: rowsEl.filter((li) => li.querySelector('.tf-foes em')).length,
      gear: rowsEl.filter((li) => /장비/.test(li.querySelector('.tf-reward').textContent)).length,
    };
    // 다음 묶음(11~20층)
    const pg = document.querySelector('[data-page="1"]');
    if (pg) pg.click();
    await sleep(100);
    out.page2 = document.querySelector('#tower-panel .tf-row .tf-floor') && document.querySelector('#tower-panel .tf-row .tf-floor').textContent.trim().startsWith('11');
    out.previewRec = /적정/.test((document.querySelector('.tower-preview') || {}).textContent || '');

    const card = () => document.querySelector('.tower-result');
    const finish = async () => {
      for (let k = 0; k < 200 && !card(); k++) { try { g.battleScene.skipToEnd(); } catch { /* */ } await sleep(80); }
      return card() ? card().innerText.replace(/\s+/g, ' ') : '';
    };
    const gear0 = s.inventory.filter((i) => s.db.items[i.id] && s.db.items[i.id].slot).length;
    g.bus.emit('tower:start', { start: 1 }); await sleep(250);
    await finish();
    for (let i = 0; i < 3 && s.towerRun; i++) { g.bus.emit('battle:confirm'); await sleep(400); await finish(); }
    // 5층(보스) — 등장 연출과 이름줄에 특성
    g.bus.emit('battle:confirm'); await sleep(450);
    out.intro = document.querySelectorAll('.boss-intro-affixes li').length;
    out.head = document.querySelectorAll('[data-mon-name] .foe-affixes i').length;
    const t5 = await finish();
    const gearNew = s.inventory.filter((i) => s.db.items[i.id] && s.db.items[i.id].slot).slice(gear0);
    out.gear = { text: t5.slice(0, 160), got: gearNew.map((i) => i.grade) };
    g.bus.emit('tower:leave'); await sleep(300);
    return out;
  });
  check('탑 창 — 층별 보상 10층(보스 둘 · 특성 · 장비 · 적정 레벨)', r.list.n === 10 && r.list.rec && r.list.boss === 2 && r.list.aff === 2 && r.list.gear === 2,
    JSON.stringify(r.list));
  check('탑 창 — 다음 묶음(11~20층)으로 넘긴다', r.page2);
  check('탑 창 — 다음 층 미리 보기에 적정 레벨', r.previewRec);
  check('보스 등장 연출 · 이름줄에 특성', r.intro >= 1 && r.head >= 1, JSON.stringify({ intro: r.intro, head: r.head }));
  check('5층 보스를 처음 깨면 장비 하나(고급 · 희귀 가운데)', r.gear.got.length === 1 && ['uncommon', 'rare'].includes(r.gear.got[0]) && /\[(고급|희귀)\]/.test(r.gear.text),
    JSON.stringify(r.gear));
  check('오류 없음', errs.length === 0, errs.join(' / '));
  await browser.close();
  done();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
