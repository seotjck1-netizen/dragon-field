// 스킬 트리 (0.80.02 · 0.80.03 와우식) — 직업마다 뿌리 하나 + 갈래 셋(숙련까지 20점), 공용 특성은 따로 주머니.
//
// ⚠ 성질을 잰다: "갈래의 2단 · 3단 · 궁극 · 숙련은 그 갈래에 찍은 점수로 열린다", "궁극은 Lv.25 부터",
//   "직업 포인트 25점으로 올인은 딱 맞고 궁극 둘은 안 된다(1.5갈래)", "주머니는 둘(직업 · 공용)",
//   "숙련은 그 갈래의 다른 칸을 통째로 키운다", "초기화는 공짜가 있으면 공짜, 그 뒤로 비용",
//   "옛 세이브는 다 돌려받고 공짜 초기화 한 번", "새 규칙 다섯(반격 확률 · 반격 피해 · 치명상 버티기 · 처형 · 위기 치명타)이
//   전투에서 실제로 먹힌다", "경험치 눈금 0.6", "시트로 꺼냈다 되돌려도 트리가 그대로 · 트리 전 옛 탭은 반영하지 않는다".
//   값 하나하나를 적어 두지 않는다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('tree');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.store.state;
    const S = await import('/src/systems/SkillSystem.js');
    const P = await import('/src/systems/ProgressionSystem.js');
    const A = await import('/src/systems/AccountSystem.js');
    const C = await import('/src/systems/CombatSystem.js');
    const F = await import('/src/data/formulas.js');
    const out = {};
    const sk = s.db.skills;
    const list = s.db.classes.list;

    // ① 표 — 직업마다 뿌리(5) + 갈래 셋(1단 둘 · 2단 · 3단 · 궁극 · 숙련 = 20점)
    out.shape = {};
    for (const [cid, ct] of Object.entries(sk.classTrees)) {
      const ids = list[cid].skills;
      const per = (b, t) => ids.filter((id) => sk.tree[id] && sk.tree[id].branch === b && sk.tree[id].tier === t).length;
      const sum = (b) => ids.filter((id) => sk.tree[id] && sk.tree[id].branch === b).reduce((a, id) => a + sk.tree[id].max, 0);
      out.shape[cid] = {
        root: !!(sk.tree[ct.root] && sk.tree[ct.root].branch === 'root' && ids[0] === ct.root),
        rootMax: sk.tree[ct.root].max,
        ok: ct.branches.length === 3 && ct.branches.every((b) => per(b.id, 1) === 2 && per(b.id, 2) === 1 && per(b.id, 3) === 1 && per(b.id, 4) === 1 && per(b.id, 5) === 1),
        sums: ct.branches.map((b) => sum(b.id)),
        caps: ids.filter((id) => sk.tree[id].cap).length,
        masteries: ids.filter((id) => sk.tree[id].mastery && sk.tree[id].tier === 5 && sk.tree[id].effect.branchPower > 0).length,
        missing: ids.filter((id) => !sk.tree[id]).length,
      };
    }
    out.gates = { ...sk.gates, cap: sk.capLevel };
    // 25점으로 고를 수 있는 것 — 올인(뿌리 + 갈래 전부)은 딱 맞고, 궁극 둘은 모자란다
    const full = Math.floor(F.BALANCE.MAX_LEVEL / sk.everyLevels) * sk.pointsPerGrant;
    const capNeed = Number(sk.gates[4]) + 1;
    out.budget = { full, allin: out.shape.warrior.rootMax + out.shape.warrior.sums[0], twoCaps: out.shape.warrior.rootMax + capNeed * 2, hybridSide: full - out.shape.warrior.rootMax - capNeed };

    // ② 문턱 · 궁극 레벨 · 숙련 · 두 주머니 — 용사로
    const p = s.player;
    const save = { classId: p.classId, level: p.level, skills: { ...p.skills }, traits: { ...p.traits }, sp: p.skillPoints, tp: p.traitPoints, gold: p.gold, fr: p.freeResets, admin: p.allSkills };
    p.classId = 'warrior';
    p.allSkills = false;
    for (const k of Object.keys(p.skills)) p.skills[k] = 0;
    for (const k of Object.keys(p.traits)) p.traits[k] = 0;
    p.level = 24;
    p.skillPoints = 0; p.traitPoints = 2;
    // 주머니가 따로다 — 공용 포인트로는 직업 칸을 못 찍는다(그 반대도)
    out.noClassPts = S.canLearn(s, 'fortress');
    out.traitOk = S.canSpendTrait(s, 'might').ok;
    S.spendTrait(s, 'might');
    out.traitSpent = p.traits.might === 1 && p.traitPoints === 1 && p.skillPoints === 0;
    p.skillPoints = 20; p.traitPoints = 0;
    out.noCommonPts = S.canSpendTrait(s, 'might');
    out.t2before = S.canLearn(s, 'iron_will').ok;
    for (let i = 0; i < 3; i++) S.learnSkill(s, 'fortress');
    out.t2after = S.canLearn(s, 'iron_will').ok;
    out.t3before = S.canLearn(s, 'stout').ok;
    S.learnSkill(s, 'fortress'); S.learnSkill(s, 'unbreakable'); S.learnSkill(s, 'unbreakable');
    out.t3after = S.canLearn(s, 'stout').ok;
    out.capBefore = S.canLearn(s, 'immortal');
    S.learnSkill(s, 'unbreakable'); S.learnSkill(s, 'unbreakable');
    for (let i = 0; i < 4; i++) S.learnSkill(s, 'iron_will');
    out.branchA = S.branchSpent(s, 'warrior', 'A');
    out.capLv24 = S.canLearn(s, 'immortal');
    p.level = 25;
    out.capLv25 = S.canLearn(s, 'immortal').ok;
    out.masteryBefore = S.canLearn(s, 'adamant');
    S.learnSkill(s, 'immortal');
    out.shapeSingle = S.buildShape(s).kind;
    for (let i = 0; i < 3; i++) S.learnSkill(s, 'stout');
    out.masteryAfter = S.canLearn(s, 'adamant').ok;
    // 다른 갈래의 점수는 이 갈래 문턱에 안 센다
    out.otherBranch = S.canLearn(s, 'heavy_counter').ok === false;
    // 숙련 — 그 갈래의 다른 칸 효과가 통째로 커진다(뿌리 · 다른 갈래는 그대로)
    S.learnSkill(s, 'battle_sense');
    const m0 = S.computeModifiers(s);
    S.learnSkill(s, 'adamant'); S.learnSkill(s, 'adamant');
    const m1 = S.computeModifiers(s);
    const bp = sk.tree.adamant.effect.branchPower * 2;
    out.mastery = { def0: m0.defPct, def1: m1.defPct, want: m0.defPct * (1 + bp), root0: m0.defToAtk, root1: m1.defToAtk, leak: m1.branchPower || 0 };
    out.shapeAllin = S.buildShape(s).kind;
    out.spentOnlyClass = p.traitPoints === 0;
    // 1.5갈래 — 궁극 + 옆 갈래
    for (const k of Object.keys(p.skills)) p.skills[k] = 0;
    p.skillPoints = 25;
    for (const [id, n] of [['battle_sense', 5], ['fortress', 4], ['unbreakable', 4], ['iron_will', 4], ['immortal', 1], ['thorn_mail', 4], ['retort', 3]]) for (let i = 0; i < n; i++) S.learnSkill(s, id);
    out.hybrid = { kind: S.buildShape(s).kind, left: p.skillPoints, secondCap: S.canLearn(s, 'raging_fort').ok };

    // ③ 맞추기 — 주머니마다 따로. 번 것보다 많이 찍혀 있으면 그 주머니를 통째로 돌려준다(덤이 생기지 않게)
    p.level = 30;
    for (const k of Object.keys(p.skills)) p.skills[k] = 0;
    for (const k of Object.keys(p.traits)) p.traits[k] = 0;
    p.skills.battle_sense = 5; p.skills.fortress = 4; p.traits.might = 1;
    P.reconcilePoints(s);
    const done_ = (s.quests && s.quests.done) || [];
    const earnS = Math.floor(30 / sk.everyLevels) * sk.pointsPerGrant;
    const earnT = Math.floor(30 / s.db.traits.everyLevels) * s.db.traits.pointsPerGrant + (s.db.traits.questPoints || []).filter((q) => done_.includes(q)).length;
    out.reconcile = { sp: p.skillPoints, wantS: earnS - 9, tp: p.traitPoints, wantT: earnT - 1 };
    p.skills.unbreakable = 4; p.skills.iron_will = 4; // 5 + 4 + 4 + 4 = 17 > 15
    P.reconcilePoints(s);
    out.reconcileOver = { sp: p.skillPoints, wantS: earnS, cleared: Object.values(p.skills).every((v) => !v), traitKept: p.traits.might === 1 };

    // ④ 초기화 — 스킬 · 특성 함께, 점수는 제 주머니로. 공짜가 있으면 공짜, 그 뒤로 비용
    p.skills.battle_sense = 2; p.skillPoints -= 2;
    p.freeResets = 1;
    p.gold = 100000;
    const before = { sp: p.skillPoints, tp: p.traitPoints };
    const c1 = S.canReset(s, 'tree');
    S.applyReset(s, 'tree');
    out.reset1 = { free: c1.free, gold: c1.gold, left: p.freeResets, allZero: Object.values(p.skills).every((v) => !v) && Object.values(p.traits).every((v) => !v),
      pools: p.skillPoints === before.sp + 2 && p.traitPoints === before.tp + 1 };
    S.learnSkill(s, 'battle_sense'); S.spendTrait(s, 'might');
    const c2 = S.canReset(s, 'tree');
    out.reset2 = { free: c2.free, gold: c2.gold, want: F.resetCost(2, p.level) };
    p.gold = 0;
    out.reset3 = S.canReset(s, 'tree').ok;

    // ⑤ 옛 세이브(v7 — 한 주머니 트리) — 스킬 · 특성 다 돌려받고 공짜 초기화 한 번
    const old = { ...A.serializeSave(s), v: 7, skills: { fortress: 3, battle_sense: 2 }, traits: { might: 2 }, skillPoints: 1, traitPoints: 0, freeResets: 0 };
    A.applySave(s, old);
    P.reconcilePoints(s); // 게임은 불러온 바로 뒤에 주머니를 맞춘다(main.js)
    out.migrate = {
      skills: Object.values(s.player.skills).reduce((a, b) => a + b, 0),
      traits: Object.values(s.player.traits).reduce((a, b) => a + b, 0),
      sp: s.player.skillPoints, wantS: Math.floor(s.player.level / sk.everyLevels) * sk.pointsPerGrant,
      free: s.player.freeResets, tree: !!(s.rankRefund && s.rankRefund.tree),
    };
    const v8 = { ...A.serializeSave(s), skills: { battle_sense: 2 }, traits: {}, freeResets: 0 };
    A.applySave(s, v8);
    out.v8 = { kept: s.player.skills.battle_sense, free: s.player.freeResets, sv: A.SAVE_VERSION };

    // ⑥ 새 규칙 다섯 — 진짜 전투 계산기로
    const sim = (mods, traits, opts = {}) => {
      let n = 0, crit = 0, counters = 0, dmg = 0, stands = 0, wins = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const res = C.simulateBattle({
          player: { name: 'p', level: 30, hp: opts.hp || 900, maxHp: 900, atk: 120, def: 60, spd: 10, crit: 0.05 },
          monster: { name: 'm', level: 30, hp: opts.mhp || 2500, maxHp: opts.mhp || 2500, atk: opts.matk || 70, def: 40, spd: 9, crit: 0.05 },
          seed, playerMods: mods, playerTraits: traits,
        });
        if (res.winner === 'player') wins++;
        for (const t of res.turns) {
          if (t.type === 'hit' && t.actor === 'player') { n++; if (t.crit) crit++; dmg += t.damage || t.dmg || 0; if (t.tag === 'counter') counters++; }
          if (t.tag === 'laststand' || t.type === 'laststand' || t.lastStand) stands++;
        }
      }
      return { n, crit, counters, dmg, stands, wins };
    };
    const war = list.warrior.combat;
    const base = sim({}, war);
    const ctr = sim({ counterBonus: 0.5 }, war);
    const pow = sim({ counterPowerBonus: 2 }, war);
    out.counter = { base: base.counters, more: ctr.counters, dmgBase: base.dmg, dmgPow: pow.dmg };
    const ex = sim({ executeBonus: 1 }, {});
    const ex0 = sim({}, {});
    out.execute = { base: ex0.dmg, more: ex.dmg };
    // 위기 치명타 — HP 를 낮게 두고 시작(위기선 아래)
    const low = sim({ lowHpCrit: 1, lowHpThreshold: 0.4 }, {}, { hp: 200 });
    const low0 = sim({ lowHpThreshold: 0.4 }, {}, { hp: 200 });
    out.lowHpCrit = { rate: low.n ? low.crit / low.n : 0, base: low0.n ? low0.crit / low0.n : 0 };
    // 치명상 버티기 — 센 상대에게 이기는 판 수(용사 패시브의 확률에 더한다)
    const ls0 = sim({}, war, { matk: 260, mhp: 1800 });
    const ls1 = sim({ lastStandBonus: 0.45 }, war, { matk: 260, mhp: 1800 });
    out.lastStand = { base: ls0.wins, more: ls1.wins };

    out.exp = F.BALANCE.EXP_GAIN;

    // 되돌려 놓기
    Object.assign(p, { classId: save.classId, level: save.level, skills: save.skills, traits: save.traits, skillPoints: save.sp, traitPoints: save.tp, gold: save.gold, freeResets: save.fr, allSkills: save.admin });

    // ⑦ 캐릭터 창 — '스킬 트리' 탭 하나(예전 '특성' · '스킬' 탭은 없다)
    g.bus.emit('ui:character');
    await new Promise((res) => setTimeout(res, 200));
    const tab = document.querySelector('[data-tab="tree"]');
    out.ui = { tree: !!tab, oldTabs: document.querySelectorAll('[data-tab="trait"], [data-tab="skill"]').length };
    tab.click();
    await new Promise((res) => setTimeout(res, 200));
    out.ui.branches = document.querySelectorAll('.tree-branch').length;
    out.ui.common = document.querySelectorAll('.tree-common .tree-node').length;
    out.ui.caps = document.querySelectorAll('.tree-node.is-cap').length;
    out.ui.masteries = document.querySelectorAll('.tree-node.is-mastery').length;
    out.ui.build = !!document.querySelector('.tree-build .tb-bar');
    out.ui.reset = !!document.querySelector('[data-reset="tree"]') || !!document.querySelector('.reset-bar, .char-note');
    g.bus.emit('ui:character');
    return out;
  });

  check('직업마다 뿌리(5점) + 갈래 셋(1단 둘 · 2단 · 3단 · 궁극 · 숙련 = 20점)',
    Object.values(r.shape).every((x) => x.root && x.rootMax === 5 && x.ok && x.caps === 3 && x.masteries === 3 && !x.missing && x.sums.every((n) => n === 20)), JSON.stringify(r.shape));
  check('문턱은 2단 3점 · 3단 6점 · 궁극 12점 · 숙련 16점, 궁극은 Lv.25', r.gates[2] === 3 && r.gates[3] === 6 && r.gates[4] === 12 && r.gates[5] === 16 && r.gates.cap === 25, JSON.stringify(r.gates));
  check('만렙 직업 포인트로 한 갈래 올인은 딱 맞고, 궁극 둘은 모자라고, 1.5갈래의 옆 갈래에 다섯 점 넘게 남는다',
    r.budget.allin === r.budget.full && r.budget.twoCaps > r.budget.full && r.budget.hybridSide >= 5, JSON.stringify(r.budget));
  check('주머니가 따로다 — 공용 포인트로 직업 칸을 못 찍고, 직업 포인트로 공용을 못 찍는다',
    !r.noClassPts.ok && /직업 포인트/.test(r.noClassPts.reason || '') && r.traitOk && r.traitSpent && !r.noCommonPts.ok && /공용 포인트/.test(r.noCommonPts.reason || '') && r.spentOnlyClass,
    `${r.noClassPts.reason} · ${r.noCommonPts.reason}`);
  check('2단은 그 갈래에 3점을 찍어야 열린다', !r.t2before && r.t2after, `${r.t2before} → ${r.t2after}`);
  check('3단은 6점', !r.t3before && r.t3after, `${r.t3before} → ${r.t3after}`);
  check('궁극은 12점 — 8점으로는 안 열리고, 12점이어도 Lv.25 전에는 막힌다',
    !r.capBefore.ok && r.branchA === 12 && !r.capLv24.ok && /Lv\.25/.test(r.capLv24.reason || '') && r.capLv25, `${r.capBefore.reason} · ${r.branchA}점 · ${r.capLv24.reason} · ${r.capLv25}`);
  check('숙련(올인 전용)은 그 갈래 16점 — 궁극까지 다 채워야 열린다', !r.masteryBefore.ok && r.masteryAfter, `${r.masteryBefore.reason} → ${r.masteryAfter}`);
  check('숙련은 그 갈래의 다른 칸 효과를 통째로 키운다(뿌리는 그대로 · 보정값으로 새지 않는다)',
    Math.abs(r.mastery.def1 - r.mastery.want) < 1e-6 && r.mastery.def1 > r.mastery.def0 && r.mastery.root0 === r.mastery.root1 && !r.mastery.leak, JSON.stringify(r.mastery));
  check('빌드 모양을 안다 — 한 갈래 · 올인(숙련) · 1.5갈래(궁극 + 옆 갈래), 궁극 둘은 못 찍는다',
    r.shapeSingle === 'single' && r.shapeAllin === 'allin' && r.hybrid.kind === 'hybrid' && r.hybrid.left === 0 && !r.hybrid.secondCap, `${r.shapeSingle} ${r.shapeAllin} ${JSON.stringify(r.hybrid)}`);
  check('다른 갈래의 점수는 이 갈래 문턱에 안 센다', r.otherBranch, '');
  check('불러올 때 맞추기 — 주머니마다 번 것 − 쓴 것', r.reconcile.sp === r.reconcile.wantS && r.reconcile.tp === r.reconcile.wantT, JSON.stringify(r.reconcile));
  check('번 것보다 많이 찍힌 주머니는 통째로 돌려준다(다른 주머니는 그대로)', r.reconcileOver.sp === r.reconcileOver.wantS && r.reconcileOver.cleared && r.reconcileOver.traitKept, JSON.stringify(r.reconcileOver));
  check('초기화는 스킬 · 특성을 함께, 점수는 제 주머니로, 공짜가 있으면 공짜', r.reset1.free && r.reset1.gold === 0 && r.reset1.left === 0 && r.reset1.allZero && r.reset1.pools, JSON.stringify(r.reset1));
  check('그 뒤로는 비용(resetCost) · 골드가 모자라면 막힌다', !r.reset2.free && r.reset2.gold === r.reset2.want && r.reset2.want > 0 && !r.reset3, JSON.stringify(r.reset2));
  check('옛 세이브(v7 — 한 주머니)는 스킬 · 특성을 다 돌려받고 공짜 초기화 한 번', r.migrate.skills === 0 && r.migrate.traits === 0 && r.migrate.sp === r.migrate.wantS && r.migrate.free === 1 && r.migrate.tree, JSON.stringify(r.migrate));
  check('새 판(v8) 세이브는 찍은 그대로 · 남은 공짜 그대로', r.v8.kept === 2 && r.v8.free === 0 && r.v8.sv === 8, JSON.stringify(r.v8));
  check('반격 확률(counterBonus) · 반격 피해(counterPowerBonus)가 먹힌다', r.counter.more > r.counter.base && r.counter.dmgPow > r.counter.dmgBase, JSON.stringify(r.counter));
  check('처형(executeBonus) — 상대 HP 30% 아래에서 피해가 오른다', r.execute.more > r.execute.base, JSON.stringify(r.execute));
  check('위기 치명타(lowHpCrit 1) — 위기선 아래면 모든 공격이 치명타', r.lowHpCrit.rate === 1 && r.lowHpCrit.base < 0.5, JSON.stringify(r.lowHpCrit));
  check('치명상 버티기(lastStandBonus)가 센 상대에게 이기는 판을 늘린다', r.lastStand.more >= r.lastStand.base, JSON.stringify(r.lastStand));
  check('경험치 눈금 0.6', r.exp === 0.6, String(r.exp));
  check("캐릭터 창은 '스킬 트리' 탭 하나 — 갈래 셋 · 공용 일곱 · 궁극 셋 · 숙련 셋 · 지금 빌드 줄", r.ui.tree && r.ui.oldTabs === 0 && r.ui.branches === 3 && r.ui.common === 7 && r.ui.caps === 3 && r.ui.masteries === 3 && r.ui.build, JSON.stringify(r.ui));
  // ⑧ 시트 — 새 통합문서의 skills 탭은 그대로 돌아오고, 트리 전 옛 탭(기타 칸에 갈래가 없다)은 반영하지 않는다
  {
    const path = require('path');
    const S = require('../server/sheets.js');
    const D = path.resolve(__dirname, '../src/data');
    const all = { 'skills.json': require(path.join(D, 'skills.json')), 'classes.json': require(path.join(D, 'classes.json')) };
    const rows = S.SHEETS.skills.toRows(all).map((row) => row.map(String));
    const back = S.SHEETS.skills.apply(rows, all);
    const same = JSON.stringify(back['skills.json'].tree) === JSON.stringify(all['skills.json'].tree)
      && Object.keys(all['classes.json'].list).every((c) => JSON.stringify(back['classes.json'].list[c].skills) === JSON.stringify(all['classes.json'].list[c].skills));
    check('시트 skills 탭으로 꺼냈다 되돌리면 트리(갈래 · 단 · 궁극 · 직업 칸)가 그대로다', same && !S.SHEETS.skills.stale(rows, all), '');
    const old = rows.map((row, i) => (i ? row.map((c, j) => (j === 13 ? '' : c)) : row));
    const kept = S.SHEETS.skills.apply(old, all);
    const noMastery = rows.map((row, i) => (i ? row.map((c, j) => (j === 13 ? c.replace(/,?"mastery":true/, '') : c)) : row));
    check('숙련을 모르는 0.80.02 skills 탭도 반영하지 않는다', /0\.80\.03/.test(S.SHEETS.skills.stale(noMastery, all) || '') && S.SHEETS.skills.apply(noMastery, all)['skills.json'] === all['skills.json'], '');
    check('트리 전 옛 skills 탭은 반영하지 않고 알린다(지금 값 그대로)',
      !!S.SHEETS.skills.stale(old, all) && kept['skills.json'] === all['skills.json'] && kept['classes.json'] === all['classes.json'], '');
  }
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
