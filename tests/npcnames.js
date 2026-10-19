// 마을 사람 이름 — 구글 시트 npcs 탭에서 고친다 (0.70.34).
//
// ⚠ 성질을 잰다: "시트에서 이름을 바꾸면 대화창 · 다른 사람의 대사 · 퀘스트 글이 같이 바뀐다",
//   "npcs 탭이 없는 옛 시트도 나머지 탭은 그대로 읽힌다", "이상한 이름은 반영 전에 막힌다".
// ⚠ 서버 쪽 시험은 **임시 폴더**(POINO_CONTENT_DIR)에서 돈다 — 진짜 server/content 를 안 건드린다.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'npcnames-'));
process.env.POINO_CONTENT_DIR = path.join(TMP, 'content');
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();
const sheets = require('../server/sheets.js');
const content = require('../server/content.js');
const sheetsync = require('../server/sheetsync.js');
const { buildBook } = require('../tools/make-xlsx.js');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

(async () => {
  const NN = await import(pathToFileURL(path.join(ROOT, 'src/core/NpcNames.js')).href);
  const all = {};
  for (const n of content.CONTENT_FILES) {
    const f = path.join(ROOT, 'src/data', n);
    if (fs.existsSync(f)) all[n] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  const npcs = all['npcs.json'];

  // ── ① npcs 탭 — 꺼내고 되돌리면 그대로 ───────────────────
  const def = sheets.SHEETS.npcs;
  check('npcs 탭이 시트 목록에 있다(나중에 생긴 탭이라 없어도 되는 탭)', !!def && def.optional === true);
  const rows = def.toRows(all);
  const people = Object.entries(npcs).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object');
  check('마을 사람마다 한 줄', rows.length - 1 === people.length, `${rows.length - 1}줄 · ${people.length}명`);
  check('꺼냈다 되돌리면 그대로', JSON.stringify(def.apply(rows, all)['npcs.json']) === JSON.stringify(npcs));
  check('지금 이름 = 직함 + 이름', people.every(([, d]) => d.name === [d.title, d.given].filter(Boolean).join(' ')),
    people.filter(([, d]) => d.name !== [d.title, d.given].filter(Boolean).join(' ')).map(([k]) => k).join(' '));

  // ── ② 이름을 바꾼다 ───────────────────────────────────────
  const edit = rows.map((r) => r.slice());
  const at = (id) => edit.findIndex((r) => r[0] === id);
  edit[at('blacksmith')][2] = '민준';                 // 받침 있는 이름
  edit[at('gate_guard')][1] = '성문지기';
  edit[at('royal_smith')][1] = '궁정 장인';
  const next = def.apply(edit, all)['npcs.json'];
  const guardName = ['성문지기', npcs.gate_guard.given].filter(Boolean).join(' ');
  check('시트에서 바꾼 이름이 표에 들어간다', next.blacksmith.name === `${npcs.blacksmith.title} 민준` && next.gate_guard.name === guardName
    && next.royal_smith.name === ['궁정 장인', npcs.royal_smith.given].filter(Boolean).join(' '), `${next.blacksmith.name} · ${next.gate_guard.name} · ${next.royal_smith.name}`);
  const v = content.validate({ ...all, 'npcs.json': next });
  check('바꾼 표가 서버 검사를 통과한다', v.ok, v.errors.join(' | '));

  // 다른 글 속의 이름이 같이 바뀐다 — 퀘스트 · 다른 사람의 대사 · 막힌 길
  const questText = JSON.stringify(all['quests.json']);
  const stone = (questText.match(/"\{blacksmith:이\/가\}[^"]*"/) || [''])[0];
  check('퀘스트 글의 이름이 따라 바뀐다(조사도 받침에 맞게)', NN.fillNpcNames(stone, next).includes('민준이 악마의 핵'), NN.fillNpcNames(stone, next));
  const royalLine = next.royal_smith.lines.find((l) => l.includes('{blacksmith}')) || '';
  check('다른 사람의 대사 속 이름이 따라 바뀐다', NN.fillNpcNames(royalLine, next).includes('민준의 망치는'), NN.fillNpcNames(royalLine, next));
  const blocked = JSON.stringify(all['maps.json']).match(/\{gate_guard:전체\}: [^"]*/);
  check('막힌 길 안내의 이름이 따라 바뀐다', !!blocked && NN.fillNpcNames(blocked[0], next).startsWith(`${guardName}: `), blocked && NN.fillNpcNames(blocked[0], next));

  // ── ③ 이상한 줄은 반영 전에 막힌다 ───────────────────────
  const bad = (fix, why) => {
    const e = rows.map((r) => r.slice());
    fix(e);
    try { def.apply(e, all); return `안 막힘(${why})`; } catch (err) { return err.message; }
  };
  const msgs = [
    bad((e) => { e[1][0] = 'nobody'; }, '없는 id'),
    bad((e) => { e[1][1] = ''; e[1][2] = ''; }, '둘 다 빈칸'),
    bad((e) => { e[1][2] = '<b>마르타</b>'; }, 'HTML'),
    bad((e) => { e[1][2] = '{blacksmith}'; }, '자리표'),
    bad((e) => { e[1][2] = '아주아주아주아주긴이름입니다'; }, '너무 김'),
    bad((e) => { e.push(e[1].slice()); }, '두 번'),
  ];
  check('없는 id · 빈 이름 · HTML · 중괄호 · 긴 이름 · 겹친 줄은 막힌다', msgs.every((m) => !m.startsWith('안 막힘')), msgs.join(' / '));

  // ── ④ 글 속에 다른 사람의 이름을 그대로 적어 두지 않았다(자리표로) ─────
  const texts = [];
  for (const [id, d] of people) for (const l of [...(d.lines || []), ...(d.lines2 || [])]) texts.push([`npcs.${id}`, id, l]);
  const walk = (o, where) => { if (typeof o === 'string') texts.push([where, '', o]); else if (o && typeof o === 'object') Object.values(o).forEach((x) => walk(x, where)); };
  walk(all['quests.json'], 'quests');
  for (const m of Object.values(all['maps.json'].maps)) for (const p of m.portals || []) if (p.blockedText) texts.push(['maps', '', p.blockedText]);
  const hard = [];
  for (const [where, self, t] of texts) {
    for (const [id, d] of people) {
      if (id === self || !d.given) continue;
      if (t.includes(d.given)) hard.push(`${where}: '${d.given}'`);
    }
  }
  check('다른 글 속 이름은 자리표로 적혀 있다(시트에서 바꾸면 따라 바뀐다)', hard.length === 0, hard.slice(0, 4).join(' · '));

  // ── ⑤ 서버가 시트를 읽을 때 ───────────────────────────────
  //   진짜 구글 대신 통합문서를 만들어 돌려준다(fetch 를 잠시 바꿔 끼운다).
  const tabsOf = (withNpcs, rename) => Object.entries(sheets.SHEETS)
    .filter(([n]) => withNpcs || n !== 'npcs')
    .map(([n, d]) => {
      let r = d.toRows(all);
      if (n === 'npcs' && rename) r = r.map((x) => (x[0] === 'witch' ? [x[0], x[1], rename, ...x.slice(3)] : x));
      return { name: n, rows: r };
    });
  const realFetch = global.fetch;
  const serve = (tabs) => { global.fetch = async () => new Response(buildBook(tabs), { status: 200 }); };
  const env = { SHEET_ID: '1abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' };
  try {
    serve(tabsOf(false));
    const r1 = await sheetsync.pullOnce(env, '시험 — npcs 탭 없는 옛 시트');
    check('npcs 탭이 없는 옛 시트도 반영이 멈추지 않는다(알림만)', r1.ok && (r1.warnings || []).some((w) => /npcs/.test(w)),
      JSON.stringify({ ok: r1.ok, errors: r1.errors, w: (r1.warnings || []).filter((w) => /npcs/.test(w)) }));
    serve(tabsOf(true, '루나'));
    const r2 = await sheetsync.pullOnce(env, '시험 — 마녀 이름 바꾸기');
    const after = JSON.parse(fs.readFileSync(path.join(process.env.POINO_CONTENT_DIR, 'npcs.json'), 'utf8'));
    check('시트에서 이름을 바꾸면 서버가 그 이름으로 배포한다', r2.ok && (r2.changed || []).includes('npcs.json') && after.witch.name === `${npcs.witch.title} 루나`,
      JSON.stringify({ ok: r2.ok, errors: r2.errors, changed: r2.changed, name: after.witch && after.witch.name }));
  } finally {
    global.fetch = realFetch;
  }
  check('진짜 server/content 는 그대로(시험은 임시 폴더에서)', read('server/content/npcs.json').witch.name === npcs.witch.name);

  // ── ⑥ 게임 안 ──────────────────────────────────────────
  const { browser, page, errs } = await boot('npcname');
  const r = await page.evaluate(async () => {
    const g = window.__game, s = g.store.state;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const N = s.db.npcs;
    // 시트에서 이름이 바뀌어 새 표가 온 것처럼
    Object.assign(N.blacksmith, { given: '민준', name: '대장장이 민준' });
    Object.assign(N.gate_guard, { title: '성문지기', given: '', name: '성문지기' });
    const say = async (map, id) => {
      g.changeMap(map, 6, 8);
      await wait(500);
      const npc = s.npcs.find((n) => n.defId === id);
      if (!npc) return { err: `no ${id}` };
      g.talkToRef(npc);
      await wait(2500);
      const out = { name: document.querySelector('.dlg-name').textContent, text: document.querySelector('.dlg-text').textContent };
      g.bus.emit('dialogue:closed');
      g.fieldScene.resume && g.fieldScene.resume();
      await wait(100);
      return out;
    };
    const out = {};
    out.smith = await say('poino_forge', 'blacksmith');
    out.royal = await say('castle', 'royal_smith');
    // 막힌 길 — 위병이 말린다(이름은 표에서)
    g.bus.emit('portal:blocked', { requireLevel: 99, blockedText: '{gate_guard:전체}: 아직이다.' });
    await wait(1500);
    out.blocked = { name: document.querySelector('.dlg-name').textContent, text: document.querySelector('.dlg-text').textContent };
    g.bus.emit('dialogue:closed');
    return out;
  });
  check('대화창 이름이 시트의 이름', r.smith && r.smith.name === '대장장이 민준', JSON.stringify(r.smith));
  check('다른 사람의 대사 속 이름도 시트의 이름', r.royal && /민준의 망치는/.test(r.royal.text) && !/\{/.test(r.royal.text), JSON.stringify(r.royal));
  check('막힌 길을 말리는 위병 이름도 시트의 이름', r.blocked.name === '성문지기' && r.blocked.text.startsWith('성문지기: '), JSON.stringify(r.blocked));
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  done();
})();
