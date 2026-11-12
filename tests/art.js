// 새 그림체 (0.70.28) — 아이템마다 다른 모양 · 달리기 · 점프 · 맞기 · 쓰러짐 · 마을 사람 · 몬스터 · 전투 배경 · 소지품 그림.
//
// ⚠ 성질을 잰다: "같은 등급이라도 아이템이 다르면 그림이 다르다", "질주 중이면 달린다",
//   "쓰러진 몸은 옆으로 누워 있다(가로가 세로보다 길다)", "지하감옥에서 싸우면 지하감옥 배경".
//   픽셀 값을 적어 두지 않는다.
const { tally, boot } = require('./lib/harness.js');
const { check, done } = tally();

(async () => {
  const { browser, page, errs } = await boot('art');
  const r = await page.evaluate(async () => {
    const g = window.__game;
    const s = g.store.state;
    const bl = g.bodyLook;
    const body = s.player.body;
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const pix = (a) => {
      const c = document.createElement('canvas');
      c.width = a.srcW || a.image.width; c.height = a.srcH || a.image.height;
      const x = c.getContext('2d');
      x.drawImage(a.image, 0, 0, c.width, c.height);
      return x.getImageData(0, 0, c.width, c.height).data;
    };
    const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 3] - b[i + 3]) > 40) n++; return n; };
    const box = (d, w) => {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) { const p = (i - 3) / 4, x = p % w, y = Math.floor(p / w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      return { w: x1 - x0, h: y1 - y0 };
    };
    const out = {};
    const shot = async (scene, look) => { await bl.prefetch(body, look); await wait(150); return pix(bl.get(body, scene, look)); };
    // ① 같은 등급(희귀)의 다른 아이템
    out.armorPair = diff(await shot('stand', { armor: 'knight_armor' }), await shot('stand', { armor: 'dragon_mail' }));
    out.helmPair = diff(await shot('bstand', { helmet: 'knight_helm' }), await shot('bstand', { helmet: 'magic_helm' }));
    out.swordPair = diff(await shot('stance_sword', { weapon: 'flame_sword' }), await shot('stance_sword', { weapon: 'dragon_knight_sword' }));
    out.dragonKey = bl.layerKeys(body, 'stand', { armor: 'dragon_mail' }).join(',');
    // ② 달리기 · 점프
    const fs = g.fieldScene;
    const step = 170;
    out.walkPhase = fs._walkPhase({ moving: true, stepMs: step, walkT: 0, body });
    out.runPhase = fs._walkPhase({ moving: true, stepMs: step / 1.5, walkT: 0, body });
    out.runPhase2 = fs._walkPhase({ moving: true, stepMs: step / 1.5, walkT: (step / 1.5) * 2 + 1, body });
    out.jumpPhase = fs._walkPhase({ moving: true, jumping: true, stepMs: step, walkT: 0, body });
    out.runVsWalk = diff(await shot('run_l', {}), await shot('walk1', {}));
    // ③ 맞기 · 쓰러짐
    const looks = g.battleLooks(s);
    out.hasHurt = !!(looks.hurtSprite && looks.downSprite);
    await wait(300);
    const down = pix(bl.get(body, 'down', {}));
    const stand = pix(bl.get(body, 'bstand', {}));
    out.downBox = box(down, 320);
    out.standBox = box(stand, 320);
    out.hurtVsStand = diff(pix(bl.get(body, 'hurt', {})), stand);
    // ④ 마을 사람
    const warden = g.assets.get('npc_warden');
    out.warden = !!(warden && warden.ok) && s.db.npcs.dungeon_warden.sprite === 'npc_warden';
    const shop = g.assets.get('npc_shopkeeper');
    out.npcSize = [shop.w, shop.h];
    out.npcWalk = !!(g.assets.get('npc_shopkeeper_walk1') || {}).ok;
    // ⑤ 몬스터 — 모든 몬스터의 다섯 장이 읽혔는가 · 망령 · 석상은 제 그림
    const miss = [];
    for (const [id, m] of Object.entries(s.db.monsters)) {
      if (!m || typeof m !== 'object' || !m.sprite) continue;
      const stem = m.sprite.replace(/_field$/, '');
      for (const k of [m.sprite, m.battleSprite, `${stem}_attack`, `${stem}_walk1`, `${stem}_walk2`]) {
        const a = g.assets.get(k);
        if (!(a && a.ok)) miss.push(`${id}:${k}`);
      }
    }
    out.monMiss = miss;
    out.wraith = s.db.monsters.dungeon_wraith.battleSprite;
    out.golem = s.db.monsters.dungeon_golem.battleSprite;
    // ⑥ 전투 배경
    out.bg = {
      field: g.battleBgOf({ id: 'field_1', ground: 'grass' }),
      volcano: g.battleBgOf({ id: 'field_5', ground: 'ash', theme: 'volcano' }),
      dungeon: g.battleBgOf({ id: 'dungeon_2', ground: 'dungeon' }),
    };
    out.bgOk = ['bg_battle_field', 'bg_battle_volcano', 'bg_battle_dungeon'].every((k) => (g.assets.get(k) || {}).ok);
    // ⑦ 소지품 그림 — 같은 등급 갑옷 둘
    const ic = (id) => pix(g.assets.get(s.db.items[id].icon));
    out.iconPair = diff(ic('knight_armor'), ic('dragon_mail'));
    return out;
  });

  check('같은 등급(희귀) 갑옷 둘 — 기사 갑옷과 용린 갑옷의 그림이 다르다', r.armorPair > 300, `${r.armorPair}`);
  check('같은 등급 투구 둘 — 기사 투구와 매직 투구가 다르다', r.helmPair > 300, `${r.helmPair}`);
  check('같은 등급 칼 둘 — 화염검과 용린 기사검이 다르다', r.swordPair > 300, `${r.swordPair}`);
  check('용린 갑옷은 제 층(armor_dragon)을 입는다', r.dragonKey.includes('armor_dragon'), r.dragonKey);
  check('평소 걸음은 걷기, 질주 중에는 달린다(왼발 → 오른발)', r.walkPhase === 'walk1' && r.runPhase === 'run_l' && r.runPhase2 === 'run_r',
    `${r.walkPhase} ${r.runPhase} ${r.runPhase2}`);
  check('뛰어오른 동안은 공중 자세', r.jumpPhase === 'jump', r.jumpPhase);
  check('달리기 그림은 걷기 그림과 다르다', r.runVsWalk > 200, `${r.runVsWalk}`);
  check('전투에 맞는 그림 · 쓰러진 그림이 넘어간다', r.hasHurt);
  check('맞는 순간은 서 있는 몸과 다르다', r.hurtVsStand > 300, `${r.hurtVsStand}`);
  check('쓰러진 몸은 누워 있다(가로가 세로보다 길다)', r.downBox.w > r.downBox.h && r.standBox.h > r.standBox.w,
    `${JSON.stringify(r.downBox)} ${JSON.stringify(r.standBox)}`);
  check('마을 사람 새 그림 — 몸과 같은 틀(92×92) · 걷는 그림', r.npcSize[0] === 92 && r.npcSize[1] === 92 && r.npcWalk, JSON.stringify(r.npcSize));
  check('지하감옥 간수는 제 그림(npc_warden)', r.warden);
  check('모든 몬스터의 다섯 장(서기 · 전투 · 공격 · 걷기 둘)이 읽힌다', r.monMiss.length === 0, r.monMiss.slice(0, 5).join(', '));
  check('망령 · 석상은 해골 · 악마 병사 그림을 빌리지 않는다', r.wraith === 'mon_wraith_battle' && r.golem === 'mon_golem_battle', `${r.wraith} ${r.golem}`);
  check('싸우는 곳마다 전투 배경 — 들판 · 화산 · 지하감옥', r.bg.field === 'bg_battle_field' && r.bg.volcano === 'bg_battle_volcano'
    && r.bg.dungeon === 'bg_battle_dungeon' && r.bgOk, JSON.stringify(r.bg));
  check('소지품 그림도 아이템마다 — 기사 갑옷과 용린 갑옷', r.iconPair > 300, `${r.iconPair}`);
  check('오류가 없다', errs.length === 0, errs.join(' | '));
  await browser.close();
  done();
})();
