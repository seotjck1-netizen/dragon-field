#!/usr/bin/env node
/**
 * **진짜 세이브로 재기.** 사람이 실제로 키운 캐릭터를 그대로 불러와 잰다.
 *
 *   node tools/savecheck.js <세이브파일>          그 캐릭터를 잰다
 *   node tools/savecheck.js <파일> --gem ruby     홈을 전부 그 보석으로 바꿔 본다
 *   node tools/savecheck.js <파일> --compare      지금 / 전부 루비 / 전부 다이아 견주기
 *   node tools/savecheck.js <파일> --n 40         표본 수 (기본 30)
 *
 * 세이브는 게임의 **설정 → 세이브 옮기기** 에서 나오는 `POINO1:…` 글이다.
 * 그 글을 파일에 넣고 경로를 주면 된다.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────
 *
 * 이 저장소에는 사람을 흉내 내는 자가 둘 있다.
 *   tools/balance.js  바닥값 — 그 문 앞에 겨우 다다른 사람
 *   tools/topline.js  천장 몸 — 끝까지 키운 사람
 * 둘 다 **게임의 계산을 베껴 적은 것**이다. 베낀 것은 반드시 언젠가 어긋난다.
 * 실제로 0.70.10 에 천장 몸은 "용사, 지하감옥 5층 0%" 라고 했는데, 사람이 보낸
 * 진짜 세이브(t00, 공격력 3,970 — 천장보다 **약한** 몸)는 같은 상대를 **100%** 로
 * 잡았다. 흉내가 틀린 것이다.
 *
 * 이 도구는 흉내 내지 않는다. **게임을 띄우고 게임의 계산기를 그대로 돌린다.**
 * 그래서 다른 두 자를 검산하는 잣대가 된다 — 세 값이 벌어지면 흉내 쪽이 틀린 것이다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const nAt = args.indexOf('--n');
const SAMPLES = nAt >= 0 ? Number(args[nAt + 1]) || 30 : 30;
const gemAt = args.indexOf('--gem');
const GEM = gemAt >= 0 ? `gem_${args[gemAt + 1]}` : null;
const COMPARE = args.includes('--compare');
const URL = process.env.GAME_URL || 'http://localhost:8899/index.html';

if (!file) {
  console.log('세이브 파일 경로를 주세요. 예: node tools/savecheck.js /tmp/t00.txt');
  console.log('(게임 → 설정 → 세이브 옮기기 에서 나오는 POINO1:… 글을 파일에 넣습니다)');
  process.exit(1);
}

/** POINO1:<base64> 를 풀어 save 만 꺼낸다. */
function readSave(p) {
  const raw = fs.readFileSync(p, 'utf8').trim();
  const body = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  const j = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  return j.save || j;
}

// 재 볼 상대. [몬스터, 맵, 이름]
const BOSSES = [
  ['elite_demon_general', 'field_20', '20단계 보스 · 강화된 발가르'],
  ['dungeon_lord', 'dungeon_5', '지하감옥 5층 · 감옥의 주인'],
  ['great_dragon', 'west_cliff', '고룡 1단계 · 카르나크'],
  ['elder_dragon', 'dragon_lair', '고룡 2단계 · 아그라모스'],
];

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
const padL = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return ' '.repeat(Math.max(0, n - w)) + String(s);
};

(async () => {
  const save = readSave(path.resolve(file));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1400);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', 'sc' + process.pid);
  for (const el of await page.$$('input[type="password"]')) await el.fill('check1234');
  for (const btn of await page.$$('button')) {
    const t = (await btn.innerText()).trim();
    if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
  }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await page.waitForTimeout(2500);

  const runs = COMPARE
    ? [['지금 그대로', null], ['홈 전부 루비', 'gem_ruby'], ['홈 전부 다이아', 'gem_diamond']]
    : [[GEM ? `홈 전부 ${GEM.replace('gem_', '')}` : '지금 그대로', GEM]];

  const out = await page.evaluate(async ({ sv, runs: plan, bosses, samples }) => {
    const g = window.__game;
    const S = await import('/src/entities/StatBlock.js');
    const C = await import('/src/systems/CombatSystem.js');
    const F = await import('/src/data/formulas.js');
    const Skills = await import('/src/systems/SkillSystem.js');
    const s = g.store.state;
    const maps = s.db.maps.maps;

    // 가방에서 가장 센 회복약을 넉넉히 — 사람이 실제로 그렇게 다닌다.
    const potionsOf = () => {
      let best = null;
      for (const i of s.inventory) {
        const d = s.db.items[i.id];
        if (!d || !d.use || !d.use.hp) continue;
        if (!best || d.use.hp > best.heal) best = { id: i.id, name: d.name, heal: d.use.hp, count: i.count || 1 };
      }
      return { stock: best ? [best] : [], threshold: 0.7, cooldownMs: 2000 };
    };

    const build = (gem) => {
      Object.assign(s.player, {
        name: sv.name, classId: sv.classId, level: sv.level,
        equipment: JSON.parse(JSON.stringify(sv.equipment)),
        stats: { ...sv.stats }, traits: { ...sv.traits }, skills: { ...sv.skills },
      });
      s.inventory = JSON.parse(JSON.stringify(sv.inventory));
      s.buffs = []; // 여관 버프 같은 일시적인 것은 빼고 잰다
      if (gem) {
        const m = Object.fromEntries(s.inventory.map((i) => [i.uid, i]));
        for (const uid of Object.values(s.player.equipment)) {
          const it = m[uid];
          if (it && it.gems) it.gems = it.gems.map(() => gem);
        }
      }
      g.store.notify();
      return S.computePlayerStats(s);
    };

    const fight = (st, monId, mapId) => {
      const base = s.db.monsters[monId];
      const map = maps[mapId] || {};
      const pw = map.power || 1;
      const full = Math.round(base.stats.hp * pw);
      const potions = potionsOf();
      let win = 0;
      const dealt = [];
      const turns = [];
      for (let seed = 1; seed <= samples; seed++) {
        const r = C.simulateBattle({
          player: {
            name: sv.name, level: sv.level, hp: st.hp, maxHp: st.hp,
            atk: st.atk, def: st.def, spd: st.spd, crit: st.crit,
            weaponShape: Skills.weaponShape(s),
          },
          monster: {
            name: base.name, level: base.level, hp: full, maxHp: full,
            atk: Math.round(base.stats.atk * pw), def: Math.round(base.stats.def * pw),
            spd: base.stats.spd, crit: base.stats.crit,
            magicPart: map.bossMagicPart != null ? map.bossMagicPart : (map.magicPart || 0),
            rage: Number(base.rage) > 0 ? Number(base.rage) : 0,
            school: base.school || 'physical',
          },
          seed,
          playerMods: st.mods,
          playerTraits: s.db.classes.list[sv.classId].combat,
          potions,
        });
        if (r.winner === 'player') win++;
        // ⚠ 깎은 양은 그 판의 몸에서 뺀다 — 기세가 체력을 흔들기 때문이다.
        const born = (r.snapshot && r.snapshot.monsters && r.snapshot.monsters[0]
          && r.snapshot.monsters[0].maxHp) || full;
        const left = (r.monstersHp && r.monstersHp[0] != null) ? r.monstersHp[0] : born;
        dealt.push(Math.max(0, born - left));
        turns.push((r.turns || []).length);
      }
      dealt.sort((a, c) => a - c);
      turns.sort((a, c) => a - c);
      const per = dealt[Math.floor(dealt.length / 2)] || 0;
      return {
        rate: Math.round((win / samples) * 100),
        per, full,
        fights: per > 0 ? Math.ceil(full / per) : null,
        turns: turns[Math.floor(turns.length / 2)],
        keepHp: !!(map.timedBoss || map.bossKeepHp),
      };
    };

    const res = [];
    for (const [label, gem] of plan) {
      const st = build(gem);
      const row = {
        label, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd,
        crit: st.crit, critMult: st.mods.critMult || 0,
        power: F.combatPower(st, st.mods),
        potion: potionsOf().stock[0] || null,
        mods: Object.fromEntries(Object.entries(st.mods).filter(([, v]) => typeof v === 'number' && v)),
        bosses: {},
      };
      for (const [id, map, name] of bosses) row.bosses[name] = fight(st, id, map);
      res.push(row);
    }

    // 지금 낀 장비와 홈에 박힌 보석.
    // ⚠ **먼저 원래대로 되돌리고 읽는다.** 위에서 --compare 로 보석을 갈아 끼워
    //   봤기 때문에, 그냥 읽으면 마지막으로 시험한 보석이 "지금 낀 것" 으로 찍힌다
    //   (0.70.10 에 열다섯 칸이 전부 다이아몬드로 나왔다 — 실제로는 아홉 칸이 루비다).
    build(null);
    const m = Object.fromEntries(s.inventory.map((i) => [i.uid, i]));
    const worn = {};
    for (const [slot, uid] of Object.entries(sv.equipment)) {
      const it = m[uid];
      if (!it) continue;
      worn[slot] = { id: it.id, name: s.db.items[it.id].name, enh: it.enhance || 0, gems: it.gems || [] };
    }
    return { res, worn, gemTable: (s.db.affixes || {})['보석'] || [] };
  }, { sv: save, runs, bosses: BOSSES, samples: SAMPLES });

  await browser.close();

  console.log('');
  console.log(`  세이브로 재기 — ${save.name} (${save.classId}) Lv.${save.level}`);
  console.log('  ' + '─'.repeat(76));

  // 홈에 박힌 보석
  const gemName = Object.fromEntries(out.gemTable.map((r) => [r[0], r[1]]));
  let sockets = 0;
  const tally = {};
  console.log('  낀 장비와 홈');
  for (const [slot, w] of Object.entries(out.worn)) {
    const gems = (w.gems || []).filter(Boolean);
    sockets += (w.gems || []).length;
    for (const gid of gems) tally[gid] = (tally[gid] || 0) + 1;
    console.log(`    ${pad(slot, 9)} ${pad(w.name, 14)} +${padL(w.enh, 2)}`
      + `   홈 ${(w.gems || []).map((x) => gemName[x] || '(빈 칸)').join(' · ') || '없음'}`);
  }
  const list = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  console.log(`    → 홈 ${sockets}칸: ` + list.map(([k, v]) => `${gemName[k] || k} ${v}`).join(' · '));
  const rubies = tally.gem_ruby || 0;
  console.log(rubies === sockets
    ? '    → **전부 루비입니다.**'
    : `    → 루비는 ${rubies}칸뿐입니다. 나머지 ${sockets - rubies}칸은 다른 보석입니다.`);

  for (const row of out.res) {
    console.log('');
    console.log(`  ${row.label}`);
    console.log('  ' + '─'.repeat(76));
    console.log(`    hp ${padL(row.hp.toLocaleString('en-US'), 8)} · atk ${padL(row.atk.toLocaleString('en-US'), 6)}`
      + ` · def ${padL(row.def.toLocaleString('en-US'), 6)} · 치명 ${(row.crit * 100).toFixed(0)}%`
      + ` · 치명피해 +${Math.round(row.critMult * 100)}% · 전투력 ${row.power.toLocaleString('en-US')}`);
    if (row.potion) console.log(`    가방: ${row.potion.name}(${row.potion.heal}) ${row.potion.count}병`);
    for (const [name, b] of Object.entries(row.bosses)) {
      const tail = b.keepHp
        ? `한 판에 ${b.per.toLocaleString('en-US')} 깎음 → ${b.fights}판이면 눕는다`
        : `한 판 ${b.turns}수`;
      console.log(`    ${pad(name, 30)} ${padL(b.rate + '%', 5)}   ${tail}`);
    }
  }

  if (errs.length) console.log('\n  ⚠ 콘솔 오류: ' + errs.slice(0, 3).join(' | '));
  console.log('');
  console.log('  ⚠ 이 값이 tools/topline.js 와 크게 다르면 **topline 쪽이 틀린 것**입니다.');
  console.log('     여기는 게임의 계산기를 그대로 돌리고, 저기는 베껴 적은 것이기 때문입니다.');
  console.log('');
})();
