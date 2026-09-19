#!/usr/bin/env node
/**
 * **마법의 타고난 관통을 몇 %로 둘 것인가** — 추측하지 말고 잰다.
 *
 *   node tools/magic-pierce.js                       0 / 20 / 30 / 35 / 40 / 50% 를 훑는다
 *   node tools/magic-pierce.js --at 0,0.3,0.5        값을 직접 지정
 *   node tools/magic-pierce.js --n 40                표본 수 (기본 24)
 *   node tools/magic-pierce.js --saves /tmp/saves    세이브가 든 폴더
 *
 * 세이브 파일(POINO1:…)을 **게임 안에서** 그대로 불러 재기 때문에,
 * 여기 나오는 승률은 사람이 실제로 겪는 승률과 같다(savecheck.js 와 같은 방식).
 *
 * ── 무엇을 보고 고르나 ────────────────────────────────────
 * 이 값은 **양날**이다. 마법사가 고룡의 갑옷을 무시하게 되는 만큼,
 * 고룡(school:'magic')도 사람의 갑옷을 무시한다. 그래서 표를 이렇게 읽는다.
 *   · 마법사(t02)   0% 에서 벗어나 "몇 번 도전하면 잡는" 자리로 올라오는가
 *   · 용사(t00)     고룡에게 지나치게 밀리지 않는가 (방어력이 주력인 몸)
 *   · 사냥꾼(t01)   물리 몸이 통째로 주저앉지 않는가
 * 세 줄이 함께 성립하는 가장 낮은 값을 고른다 — 규칙은 약할수록 안전하다.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const SAMPLES = Number(opt('n', 24)) || 24;
const DIR = opt('saves', '/tmp/saves');
// 홈을 전부 이 보석으로 바꿔서 재 본다 — "다 갖춘 몸"에서도 과하지 않은지 보려고.
const GEM = opt('gem', null) ? `gem_${opt('gem', null)}` : null;
const AT = String(opt('at', '0,0.2,0.3,0.35,0.4,0.5'))
  .split(',').map(Number).filter((x) => !Number.isNaN(x));
const URL = process.env.GAME_URL || 'http://localhost:8899/index.html';

const BOSSES = [
  ['elite_demon_general', 'field_20', '20단계 발가르', 'phys'],
  ['dungeon_lord', 'dungeon_5', '지하 5층 주인', 'phys'],
  ['great_dragon', 'west_cliff', '고룡1 카르나크', 'magic'],
  ['elder_dragon', 'dragon_lair', '고룡2 아그라모스', 'magic'],
];

const w = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - w(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - w(s))) + String(s);

function readSave(p) {
  const raw = fs.readFileSync(p, 'utf8').trim();
  const body = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  const j = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  return j.save || j;
}

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.txt')).sort();
  if (!files.length) {
    console.log(`  ${DIR} 에 세이브(.txt)가 없습니다.`);
    process.exit(1);
  }
  const saves = files.map((f) => readSave(path.join(DIR, f)));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(1400);
  await page.getByText('새 계정', { exact: true }).click();
  await page.fill('input[name="id"]', 'mp' + process.pid);
  for (const el of await page.$$('input[type="password"]')) await el.fill('check1234');
  for (const btn of await page.$$('button')) {
    const t = (await btn.innerText()).trim();
    if (t.includes('만들') || t.includes('시작')) { await btn.click(); break; }
  }
  await page.waitForFunction(() => !!window.__game, null, { timeout: 45000 });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async ({ saves: svs, bosses, samples, at, gem }) => {
    const g = window.__game;
    const S = await import('/src/entities/StatBlock.js');
    const C = await import('/src/systems/CombatSystem.js');
    const F = await import('/src/data/formulas.js');
    const Skills = await import('/src/systems/SkillSystem.js');
    const s = g.store.state;
    const maps = s.db.maps.maps;

    const potionsOf = () => {
      let best = null;
      for (const i of s.inventory) {
        const d = s.db.items[i.id];
        if (!d || !d.use || !d.use.hp) continue;
        if (!best || d.use.hp > best.heal) best = { id: i.id, name: d.name, heal: d.use.hp, count: i.count || 1 };
      }
      return { stock: best ? [best] : [], threshold: 0.7, cooldownMs: 2000 };
    };

    const build = (sv) => {
      Object.assign(s.player, {
        name: sv.name, classId: sv.classId, level: sv.level,
        equipment: JSON.parse(JSON.stringify(sv.equipment)),
        stats: { ...sv.stats }, traits: { ...sv.traits }, skills: { ...sv.skills },
      });
      s.inventory = JSON.parse(JSON.stringify(sv.inventory));
      s.buffs = [];
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

    const fight = (sv, st, monId, mapId) => {
      const base = s.db.monsters[monId];
      const map = maps[mapId] || {};
      const pw = map.power || 1;
      const full = Math.round(base.stats.hp * pw);
      const potions = potionsOf();
      let win = 0;
      const dealt = [];
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
      }
      dealt.sort((a, c) => a - c);
      const per = dealt[Math.floor(dealt.length / 2)] || 0;
      return {
        rate: Math.round((win / samples) * 100),
        per, full,
        fights: per > 0 ? Math.ceil(full / per) : null,
        keepHp: !!(map.timedBoss || map.bossKeepHp),
      };
    };

    const rows = [];
    const keep = F.BALANCE.MAGIC_PIERCE;
    for (const v of at) {
      F.BALANCE.MAGIC_PIERCE = v; // ⚠ 전투 계산기와 같은 개체다 — 바꾸면 바로 먹는다
      const one = { at: v, who: [] };
      for (const sv of svs) {
        const st = build(sv);
        const r = {
          name: sv.name, cls: sv.classId,
          power: F.combatPower(st, st.mods),
          pierce: +(st.mods.pierce || 0).toFixed(3),
          magicResist: +(st.mods.magicResist || 0).toFixed(3),
          bosses: {},
        };
        for (const [id, map, label] of bosses) r.bosses[label] = fight(sv, st, id, map);
        one.who.push(r);
      }
      rows.push(one);
    }
    F.BALANCE.MAGIC_PIERCE = keep;
    return rows;
  }, { saves, bosses: BOSSES, samples: SAMPLES, at: AT, gem: GEM });

  await browser.close();

  console.log('');
  console.log(`  마법의 타고난 관통 훑기 — 세이브 ${saves.length}개 · 판마다 ${SAMPLES}번`
    + (GEM ? ` · 홈 전부 ${GEM.replace('gem_', '')}` : ''));
  console.log('  ' + '─'.repeat(84));
  const head = '  ' + pad('관통', 6) + pad('누구', 18) + padL('전투력', 11) + '  '
    + BOSSES.map(([, , n]) => padL(n, 16)).join('');
  console.log(head);
  console.log('  ' + '─'.repeat(84));
  for (const row of out) {
    for (const [i, p] of row.who.entries()) {
      const cells = BOSSES.map(([, , n]) => {
        const b = p.bosses[n];
        const tail = b.keepHp && b.rate === 0 && b.fights ? `(${b.fights}판)` : '';
        return padL(b.rate + '%' + tail, 16);
      }).join('');
      console.log('  ' + pad(i === 0 ? Math.round(row.at * 100) + '%' : '', 6)
        + pad(`${p.name} ${p.cls}`, 18) + padL(p.power.toLocaleString('en-US'), 11) + '  ' + cells);
    }
    console.log('');
  }
  if (errs.length) console.log('  ⚠ 콘솔 오류: ' + errs.slice(0, 3).join(' | '));
  console.log('  · 물리 보스(발가르·지하 5층)는 이 값과 거의 무관해야 정상입니다.');
  console.log('  · 고룡 두 마리만 크게 움직이면, 규칙이 의도한 자리에만 걸린 것입니다.');
  console.log('');
})();
