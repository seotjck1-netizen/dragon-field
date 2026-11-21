const sim = (battle, targets, tdrops, sets, items, quests, consts) => {
  // ── 상수(바꿔 보기 칸의 값 · 없으면 처음 값) ────────────────
  const C = {}, S = {};
  for (const r of consts) { S[r.key] = String(r.value); C[r.key] = Number(r.value); }
  const ENH = S.ENH_STEPS.split(',').map(Number);
  const ECH = S.ENHANCE_CHANCE.split(',').map(Number);
  const TCH = S.TRANSCEND_CHANCE.split(',').map(Number);
  const EMAX = C.ENHANCE_MAX, TMAX = C.TRANSCEND_MAX;
  const T = [...targets].sort((a, b) => a.idx - b.idx);
  const dropsOf = {};
  for (const d of tdrops) (dropsOf[d.tid] ||= []).push(d);
  const itemOf = Object.fromEntries(items.map((i) => [i.item, i]));
  // 들판은 앞 구간 문(보스)을 모두 넘어야 들어간다 · 지하감옥은 레벨만
  const gatesBefore = {};
  const gl = [];
  for (const t of [...T].sort((a, b) => a.stage - b.stage)) {
    if (t.gate_boss && !gl.includes(t.gate_boss)) gl.push(t.gate_boss);
    if (!gatesBefore[t.map]) gatesBefore[t.map] = t.dungeon ? [] : [...gl];
  }
  const maps = [...new Set(T.map((t) => t.map))];
  // ── 전투 표 ──────────────────────────────────────────────
  const B = {};
  for (const r of battle) B[`${r.class}:${r.level}:${r.set}:${r.enh}`] = r;
  const parsed = new Map();
  const arr = (r) => {
    if (!parsed.has(r)) parsed.set(r, { w: String(r.w).split(',').map(Number), ms: String(r.ms).split(',').map(Number) });
    return parsed.get(r);
  };
  // 같은 몸(직업 · 레벨 · 한 벌 · 강화)은 한 번만 섞는다 — 돌려주는 값은 고치지 않는다
  const lookCache = new Map();
  const look = (cls, L, set, e) => {
    const key = `${cls}:${L}:${set}:${e}`;
    let v = lookCache.get(key);
    if (!v) { v = look0(cls, L, set, e); lookCache.set(key, v); }
    return v;
  };
  const look0 = (cls, L, set, e) => {
    let i = 0;
    while (i < ENH.length - 2 && e > ENH[i + 1]) i++;
    const f = Math.max(0, Math.min(1, (e - ENH[i]) / (ENH[i + 1] - ENH[i])));
    const a = B[`${cls}:${L}:${set}:${ENH[i]}`], b = B[`${cls}:${L}:${set}:${ENH[i + 1]}`];
    const pa = arr(a), pb = arr(b);
    const mix = (x, y) => x + (y - x) * f;
    return {
      w: pa.w.map((v, k) => mix(v, pb.w[k]) / 100), s: pa.ms.map((v, k) => mix(v, pb.ms[k]) / 10 / C.BATTLE_SPEED),
      cp: Math.round(mix(a.cp, b.cp)), atk: Math.round(mix(a.atk, b.atk)), hp: Math.round(mix(a.hp, b.hp)), def: Math.round(mix(a.def, b.def)),
      gf: Number(a.gold_find), md: Number(a.material_double),
    };
  };
  const expOf = (t, L, boss) => {
    const gap = Math.min(C.GAP_MAX, Math.max(C.GAP_MIN, 1 - (L - t.level) * C.GAP_STEP));
    return Math.max(1, Math.round(t.exp * gap * C.EXP_GAIN * (boss ? C.BOSS_EXP_GAIN : 1)));
  };
  const needExp = (L) => (L >= C.MAX_LEVEL ? Infinity : Math.floor(C.EXP_BASE * Math.pow(C.EXP_GROWTH, L - 1)));
  const matFor = (rarity) => (rarity === 'epic' || rarity === 'legendary' ? 'demon_core' : rarity === 'rare' ? 'magic_stone' : 'herb');
  const gemFor = (slot) => (slot === 'weapon' ? 'gem_ruby' : ['ring', 'necklace', 'belt'].includes(slot) ? 'gem_onyx' : 'gem_emerald');
  const GEMS = ['gem_ruby', 'gem_sapphire', 'gem_emerald', 'gem_topaz', 'gem_amethyst', 'gem_onyx', 'gem_diamond'];
  const pcCache = new Map();
  const piecesOf = (set, cls) => {
    const key = `${set}:${cls}`;
    if (!pcCache.has(key)) {
      const s = sets.find((x) => Number(x.set) === set);
      pcCache.set(key, [s[`weapon_${cls}`], ...String(s.wear).split(',')].filter(Boolean));
    }
    return pcCache.get(key);
  };
  // 물건마다 그것이 떨어지는 사냥감
  const srcOf = {};
  for (const t of T) for (const d of dropsOf[t.tid] || []) (srcOf[d.item] ||= []).push(t);
  const out = [];
  for (const cls of [...new Set(battle.map((b) => b.class))]) {
    const st = { L: 1, exp: 0, gold: C.START_GOLD || 140, set: 0, enh: 0, owned: {}, mats: {}, killed: new Set(), visited: new Set(),
                 qi: 0, qk: {}, cum: { trash: 0, boss: 0, quest: 0, gold: 0, spent: 0, bossKills: 0 }, townLeft: 0,
                 lvOf: {}, bk: {}, lastTown: -1e9, own: new Set([0]), got: {} };
    for (const p of piecesOf(0, cls)) st.owned[p] = 1;
    const add = (k, v) => { st.mats[k] = (st.mats[k] || 0) + v; };
    const has = (k) => st.mats[k] || 0;
    // 사냥 · 의뢰로 얻은 재료 · 보석(누적) — 산 것 · 연금술사에게 바꾼 것은 뺀다
    const earn = (k, v) => { add(k, v); st.got[k] = (st.got[k] || 0) + v; };
    const gainExp = (v, kind) => {
      st.cum[kind] += v;
      if (st.L >= C.MAX_LEVEL) return;
      st.exp += v;
      while (st.L < C.MAX_LEVEL && st.exp >= needExp(st.L)) { st.exp -= needExp(st.L); st.L++; }
      if (st.L >= C.MAX_LEVEL) st.exp = 0;
    };
    const open = (t) => st.L >= t.gate_level && gatesBefore[t.map].every((g) => st.killed.has(g));
    const mapInfo = (map) => T.find((t) => t.map === map) || {};
    const blank = (map) => ({ map, exp: 0, gold: 0, drops: {}, kills: {}, boss: 0, trashExp: 0, bossExp: 0, win: 0, label: '',
                              name: mapInfo(map).map_name || map, stage: mapInfo(map).stage || 0, tcp: 0 });
    // 몇 마리를 잡았을 때 얻는 것(기댓값)
    const reward = (r, t, kills, isBoss, body) => {
      const e = expOf(t, st.L, isBoss) * kills;
      if (isBoss) r.bossExp += e; else r.trashExp += e;
      r.exp += e;
      r.gold += t.gold * (1 + body.gf) * C.GOLD_MULT * kills;
      r.kills[t.mon] = (r.kills[t.mon] || 0) + kills;
      for (const d of dropsOf[t.tid] || []) {
        const dbl = d.type === 'material' ? 1 + body.md : 1;
        r.drops[d.item] = (r.drops[d.item] || 0) + Number(d.per_kill) * C.DROP_MULT * dbl * kills;
      }
    };
    // 1분짜리 결과를 f 만큼(0~1) 더한다
    const addInto = (r, src, f) => {
      for (const k of ['exp', 'gold', 'trashExp', 'bossExp']) r[k] += src[k] * f;
      for (const [k, v] of Object.entries(src.kills)) r.kills[k] = (r.kills[k] || 0) + v * f;
      for (const [k, v] of Object.entries(src.drops)) r.drops[k] = (r.drops[k] || 0) + v * f;
    };
    // 잡몹 — 1분 동안. 한 마리 = 전투(보는 속도로 나눈 시간) + 걷기 + 지면 잃는 몫
    // 같은 분 · 같은 몸이면 맵마다 한 번만 잰다(보스 · 의뢰 셈이 같은 잡몹 값을 여러 번 묻는다)
    const trCache = new Map();
    let trBody = null;
    const trashRate = (map, body) => {
      if (body !== trBody) { trCache.clear(); trBody = body; }
      if (trCache.has(map)) return trCache.get(map);
      const r = trashRate0(map, body);
      trCache.set(map, r);
      return r;
    };
    const trashRate0 = (map, body) => {
      const tr = T.filter((t) => t.map === map && t.kind === 'trash' && open(t))
        .map((t) => ({ t, w: body.w[t.idx], time: body.s[t.idx] + C.TRAVEL_S + (1 - body.w[t.idx]) * C.DEATH_S }));
      if (!tr.length) return null;
      const win = tr.reduce((a, x) => a + x.w, 0) / tr.length;
      if (win < C.MIN_WIN) return null;
      const r = blank(map);
      const perMin = 60 / (tr.reduce((a, x) => a + x.time, 0) / tr.length);
      for (const x of tr) reward(r, x.t, (perMin / tr.length) * x.w, false, body);
      r.win = win; r.label = '잡몹';
      r.tcp = tr.reduce((a, x) => a + Number(x.t.cp), 0) / tr.length;
      return r;
    };
    // 보스 — 지면 곧바로 다시 붙고(진 몫의 시간만 잃는다), 이기면 다시 설 때까지 기다리는 동안
    // 같은 맵 잡몹이나 웨이포인트로 오가며 더 나은 사냥터의 잡몹을 잡는다.
    const bossRate = (map, body, mode, bestTrash, val) => {
      const t = T.find((x) => x.map === map && x.kind === 'boss' && open(x));
      if (!t) return null;
      const w = body.w[t.idx], fight = body.s[t.idx] + C.TRAVEL_S;
      if (w < (mode === 'gate' ? 0.15 : C.BOSS_MIN_WIN) || w <= 0) return null;
      const perTry = fight + (1 - w) * C.DEATH_S;
      const F = perTry / w;                                           // 한 마리를 눕히기까지 싸우는 시간(진 판 포함)
      const respawn = Number(t.respawn_s) || C.BOSS_RESPAWN_S;       // 맵이 따로 정해 두지 않으면 기본값(바꿔 보기 칸)
      const wait = Math.max(0, respawn - fight);                      // 눕힌 뒤 다시 설 때까지
      const cycle = F + wait;
      const kpm = 60 / cycle;
      const r = blank(map);
      reward(r, t, kpm, true, body);
      r.boss = kpm; r.bossWin = w; r.label = t.name; r.tcp = Number(t.cp); r.win = w;
      const freeSec = 60 * (wait / cycle);                            // 1분 가운데 기다리는 몫
      const own = trashRate(map, body);
      const away = bestTrash && bestTrash.map !== map ? Math.max(0, freeSec - 2 * C.WARP_S * kpm) : 0;
      const a = own ? own : null;
      const optOwn = a ? val(a) * (freeSec / 60) : 0;
      const optAway = bestTrash && away > 0 ? val(bestTrash) * (away / 60) : 0;
      if (optAway > optOwn) { addInto(r, bestTrash, away / 60); r.label += ` + ${bestTrash.name} 잡몹`; }
      else if (a) addInto(r, a, freeSec / 60);
      return r;
    };
    // 의뢰 하나에 드는 시간 — 그 놈 · 그 재료가 가장 잘 나오는 곳에서
    const questPlan = (q, body, bestTrash, val) => {
      if (!q || st.L < q.level || q.open) return null;
      const want = q.kind === 'hunt' ? String(q.target).split('+') : [q.target];
      let best = null;
      for (const map of maps) {
        if (!T.some((t) => t.map === map && open(t))) continue;
        for (const r of [trashRate(map, body), bossRate(map, body, 'gate', null, val)]) {
          if (!r) continue;
          let per = 0;
          if (q.kind === 'hunt') per = want.reduce((a, m) => a + (r.kills[m] || 0), 0);
          else if (q.kind === 'collect') per = r.drops[q.target] || 0;
          else if (q.kind === 'reach') per = map === q.target ? 1e9 : 0;
          if (per <= 0) continue;
          const left = q.kind === 'hunt' ? q.count - want.reduce((a, m) => a + (st.qk[m] || 0), 0)
            : q.kind === 'collect' ? q.count - has(q.target) : 1;
          const mins = Math.max(0, left) / per;
          if (!best || mins < best.mins) best = { r, mins };
        }
      }
      return best;
    };
    const finishQuests = () => {
      for (;;) {
        const q = quests[st.qi];
        if (!q || q.open) return;                                       // 열림조건(고룡을 만난 사람) — 흉내에서는 멈춘다
        if (st.L < q.level) return;
        const want = String(q.target).split('+');
        let done = false;
        if (q.kind === 'hunt') done = want.reduce((a, m) => a + (st.qk[m] || 0), 0) >= q.count;
        else if (q.kind === 'collect') { if (has(q.target) >= q.count) { st.mats[q.target] -= q.count; done = true; } }
        else if (q.kind === 'reach') done = st.visited.has(q.target) || T.some((t) => t.map === q.target && open(t));
        if (!done) return;
        gainExp(q.exp * C.QUEST_EXP_GAIN, 'quest');
        st.gold += q.gold; st.cum.gold += q.gold;
        const give = (id, n) => { if (!id) return; if (itemOf[id] && itemOf[id].type !== 'material' && itemOf[id].type !== 'potion') st.owned[id] = (st.owned[id] || 0) + n; else earn(id, n); };
        give(q.item, q.qty || 1);
        const picks = String(q.picks || '').split(',').filter(Boolean);
        if (picks.length) {
          const mine = picks.find((p) => piecesOf(5, cls).includes(p) || piecesOf(2, cls).includes(p)) || picks[0];
          give(mine, 1);
        }
        st.qi++;
        st.qk = {};
      }
    };
    // 장비 한 벌 · 강화 · 초월 · 보석
    const pieceCost = (set) => {
      let gold = 0;
      for (const p of piecesOf(set, cls)) {
        if (st.owned[p] >= 1) continue;
        const it = itemOf[p] || {};
        if (it.shop === 'poino' || (it.shop === 'castle' && st.L >= 25)) { gold += it.price; continue; }
        // 상점에 없는 물건 — 떨어진 놈이 사는 땅에 들어갈 수 있으면 "그쯤이면 주웠다" 고 본다
        const src = srcOf[p] || [];
        if (src.some((t) => open(t))) continue;
        if (quests.some((q, i) => i >= st.qi && (q.item === p || String(q.picks).split(',').includes(p)))) return null;
        return null;
      }
      return gold;
    };
    // 부위마다 강화 수치 — 한 벌을 바꿔도 같은 물건(룬 갑옷 · 용린 건틀릿 …)은 강화가 그대로 남는다
    const pcsOf = (set) => piecesOf(set, cls).filter((p) => (itemOf[p] || {}).enhanceable !== false);
    const avgEnh = (set) => { const p = pcsOf(set); return p.length ? p.reduce((a, x) => a + (st.lvOf[x] || 0), 0) / p.length : 0; };
    // 입는 한 벌 — 가진 한 벌 가운데 지금 가장 센 것. 새로 산 한 벌은 강화가 따라잡을 때까지 옛 한 벌을 입고 싸운다
    const wear = () => {
      let best = null;
      for (const s of st.own) {
        const e = avgEnh(s), b = look(cls, st.L, s, Math.min(e, TMAX));
        if (!best || b.cp > best.cp) best = { ...b, set: s, enh: e };
      }
      return best;
    };
    // 더 높은 한 벌을 아직 얻을 수 있으면 초월(보석)은 미루고 그 돈을 모은다
    const saving = () => sets.some((x) => Number(x.set) > st.set && pieceCost(Number(x.set)) != null);
    const town = (body) => {
      let did = false;
      // ① 더 좋은 한 벌 — 지금 입은 만큼(+10 까지)은 곧 다시 올린다고 보고 전투력을 견준다.
      //    산 한 벌은 강화가 따라잡을 때까지 옛 한 벌을 입는다(wear)
      for (let s = sets.length - 1; s > st.set; s--) {
        const cost = pieceCost(s);
        if (cost == null || cost > st.gold) continue;
        const reach = Math.max(avgEnh(s), Math.min(body.enh, EMAX));
        const next = look(cls, st.L, s, Math.min(reach, TMAX)).cp;
        if (next <= body.cp) continue;
        st.gold -= cost; st.cum.spent += cost;
        for (const p of piecesOf(s, cls)) st.owned[p] = Math.max(1, st.owned[p] || 0);
        st.set = s; st.own.add(s); did = true;
        break;
      }
      // ② 강화 · 초월 — 가장 낮은 부위부터 한 단계씩. 강화 수치 = 부위들의 평균
      const names = pcsOf(st.set);
      const pcs = names.map((p) => itemOf[p] || { rarity: 'common', slot: '' });
      // 지금 의뢰가 모으라는 재료는 남겨 둔다(강화에 다 쓰면 의뢰가 영영 안 끝난다)
      const cq = quests[st.qi];
      const keep = cq && cq.kind === 'collect' ? { [cq.target]: Number(cq.count) } : {};
      const free = (k) => has(k) - (keep[k] || 0);
      // 모자란 재료 — 연금술사(약초 5 → 마력석 1 · 마력석 10 → 악마의 핵 1), 그래도 모자라면 약초를 산다(잡화상)
      const herbP = Number((itemOf.herb || {}).price) || 50;
      let reserve = 0;                                              // 이번 강화에 낼 골드는 남겨 두고 산다
      const buyHerb = (n) => {
        if (n <= 0) return true;
        const g = n * herbP;
        if (st.gold - reserve < g) return false;
        st.gold -= g; st.cum.spent += g; add('herb', n);
        return true;
      };
      const swapFor = (k, v) => {
        if (free(k) >= v) return true;
        if (k === 'herb') return buyHerb(v - free('herb'));
        if (k === 'magic_stone') {
          const lack = v - free('magic_stone');
          if (!buyHerb(lack * 5 - free('herb'))) return false;
          st.mats.herb -= lack * 5; add('magic_stone', lack);
          return true;
        }
        if (k === 'demon_core') {
          const lack = v - free('demon_core');
          const fromStone = Math.min(Math.max(0, free('magic_stone')), lack * 10);
          const herbs = (lack - fromStone / 10) * 50;
          if (!buyHerb(herbs - Math.max(0, free('herb')))) return false;
          st.mats.magic_stone -= fromStone; st.mats.herb -= herbs; add('demon_core', lack);
          return true;
        }
        return false;
      };
      for (let guard = 0; guard < 400; guard++) {
        let i = 0;
        for (let j = 1; j < names.length; j++) if ((st.lvOf[names[j]] || 0) < (st.lvOf[names[i]] || 0)) i = j;
        const e = st.lvOf[names[i]] || 0, p = pcs[i];
        if (e < EMAX) {
          const ch = ECH[e] || ECH[ECH.length - 1];
          // 0.80.20 — C 규칙(+8 부터 실패하면 −1)의 기대 비용이 표에 있으면 그것을 쓴다
          const EG = S.ENH_EXP_GOLD ? S.ENH_EXP_GOLD.split(',').map(Number) : null;
          const EM = S.ENH_EXP_MAT ? S.ENH_EXP_MAT.split(',').map(Number) : null;
          const gold = EG ? EG[e] : C.ENH_COST_BASE * Math.pow(C.ENH_COST_GROWTH, e) / ch;
          const k = matFor(p.rarity), v = EM ? EM[e] : (1 + Math.floor(e / 2)) / ch;
          reserve = gold;
          if (gold > st.gold || !swapFor(k, v)) break;
          reserve = 0;
          st.gold -= gold; st.cum.spent += gold; st.mats[k] -= v;
        } else if (e < TMAX && st.L >= 25 && !saving()) {
          const ch = TCH[e - EMAX], g = gemFor(p.slot), v = 1 / ch;
          // 모자란 보석 — 남는 보석 셋을 하나로(보석 노인), 그래도 모자라면 골드로 무작위 한 알씩
          const spare = () => GEMS.reduce((a, x) => a + (x === g ? 0 : has(x)), 0);
          while (has(g) + spare() / 3 < v && st.gold >= C.GEM_PRICE) {
            st.gold -= C.GEM_PRICE; st.cum.spent += C.GEM_PRICE;
            for (const x of GEMS) add(x, 1 / GEMS.length);
          }
          if (has(g) + spare() / 3 < v) break;
          let lack = v - Math.min(has(g), v);
          st.mats[g] = has(g) - Math.min(has(g), v);
          for (const x of GEMS) {
            if (lack <= 1e-9) break;
            if (x === g) continue;
            const use = Math.min(has(x), lack * 3);
            st.mats[x] = has(x) - use; lack -= use / 3;
          }
        } else break;
        st.lvOf[names[i]] = e + 1;
        did = true;
      }
      st.enh = avgEnh(st.set);
      return did;
    };
    for (let minute = 1; minute <= C.SIM_MINUTES; minute++) {
      const body = wear();
      const gemV = (r) => GEMS.reduce((a, g) => a + (r.drops[g] || 0), 0) * C.GEM_PRICE;
      const val = (r) => (st.L < C.MAX_LEVEL ? r.exp : r.gold + gemV(r));   // 만렙이면 골드 · 보석
      // 이번 1분에 할 수 있는 일 — 잡몹 · 보스(되풀이) · 다음 구간 문 보스
      const trashes = [];
      for (const map of maps) { const r = trashRate(map, body); if (r) trashes.push(r); }
      const bestTrash = trashes.reduce((a, r) => (!a || val(r) > val(a) ? r : a), null);
      const cands = [...trashes];
      const nextGate = gl.find((g) => !st.killed.has(g));
      for (const map of maps) {
        const r = bossRate(map, body, 'boss', bestTrash, val);
        if (r) cands.push(r);
        const gt = T.find((t) => t.map === map && t.kind === 'boss' && t.mon === nextGate && open(t));
        if (gt && !r) { const g = bossRate(map, body, 'gate', bestTrash, val); if (g) { g.gate = true; cands.push(g); } }
        else if (gt && r) r.gate = true;
      }
      const best = cands.reduce((a, r) => (!a || val(r) > val(a) ? r : a), null);
      let pick = null, why = '';
      // 의뢰는 그 값을 할 때만 — 장비를 주거나, 2분 안에 끝나거나, 보상이 그 시간 동안 사냥하는 것의 절반은 될 때
      const q = quests[st.qi];
      const qp = questPlan(q, body, bestTrash, val);
      if (qp && qp.mins <= C.QUEST_MAX_MIN && st.L < C.MAX_LEVEL) {
        const gear = (q.item && itemOf[q.item] && !['material', 'potion'].includes(itemOf[q.item].type)) || String(q.picks || '');
        const worth = q.exp * C.QUEST_EXP_GAIN + qp.r.exp * Math.max(1, qp.mins);
        if (gear || qp.mins <= 2 || worth >= 0.5 * (best ? best.exp : 0) * Math.max(1, qp.mins)) { pick = qp.r; why = `의뢰 · ${q.title}`; }
      }
      // 다음 구간 문 보스는 이길 만하면(15% 넘게) 먼저 잡으러 간다 — 문을 열어야 다음 땅에 간다
      if (!pick) {
        const gate = cands.find((r) => r.gate);
        if (gate && st.L < C.MAX_LEVEL) { pick = gate; why = '구간 문 보스'; }
      }
      if (!pick && best) { pick = best; why = st.L < C.MAX_LEVEL ? '경험치' : '골드 · 보석'; }
      const k = 1 - Math.min(1, st.townLeft / 60);
      st.townLeft = 0;
      if (pick) {
        st.visited.add(pick.map);
        gainExp(pick.trashExp * k, 'trash');
        gainExp(pick.bossExp * k, 'boss');
        const g = pick.gold * k;
        st.gold += g; st.cum.gold += g;
        st.cum.bossKills += pick.boss * k;
        for (const [m, n] of Object.entries(pick.kills)) st.qk[m] = (st.qk[m] || 0) + n * k;
        // 보스를 눕힌 횟수(기댓값)가 한 번을 넘으면 그 문이 열린다
        if (pick.boss > 0) {
          const bt = T.find((t) => t.map === pick.map && t.kind === 'boss');
          if (bt) { st.bk[bt.mon] = (st.bk[bt.mon] || 0) + pick.boss * k; if (st.bk[bt.mon] >= 1) st.killed.add(bt.mon); }
        }
        for (const [id, n] of Object.entries(pick.drops)) {
          const it = itemOf[id];
          const dropped = (tdrops.find((d) => d.item === id) || {});
          if (it && it.type !== 'material' && it.type !== 'potion' && (st.owned[id] || 0) < 1) { st.owned[id] = (st.owned[id] || 0) + n * k; continue; }
          if (dropped.type && dropped.type !== 'material' && !GEMS.includes(id) && id !== 'socket_drill') {
            const v = n * k * Number(dropped.price || 0) * C.SELL_RATE;             // 쓰지 않는 장비는 판다(물약은 쓴다)
            if (dropped.type !== 'potion') { st.gold += v; st.cum.gold += v; }
            continue;
          }
          earn(id, n * k);
        }
      }
      finishQuests();
      // 마을에는 TOWN_EVERY 분마다 들른다(사고 · 강화 · 초월을 한꺼번에). 더 좋은 한 벌을 살 돈이 생기면 곧바로 간다
      const canBuy = sets.some((x) => Number(x.set) > st.set && (() => { const c = pieceCost(Number(x.set)); return c != null && c <= st.gold; })());
      if (minute - st.lastTown >= C.TOWN_EVERY || canBuy) {
        if (town(wear())) { st.townLeft = C.TOWN_S; st.lastTown = minute; }
      }
      const now = wear();
      out.push({
        class: cls, minute, level: st.L, exp_pct: st.L >= C.MAX_LEVEL ? 1 : +(st.exp / needExp(st.L)).toFixed(3),
        set: now.set, set_name: (sets.find((s) => Number(s.set) === now.set) || {}).name, enh: +now.enh.toFixed(1),
        build: st.set, build_enh: +st.enh.toFixed(1),
        doing: pick ? `${pick.name} · ${pick.label}` : '쉬는 중', why, win: pick ? +(pick.bossWin ?? pick.win).toFixed(2) : 0,
        act_stage: pick ? pick.stage : null, act_boss: !!(pick && pick.boss > 0), mon_cp: pick ? Math.round(pick.tcp) : null,
        exp_min: pick ? Math.round((pick.trashExp + pick.bossExp) * k) : 0,
        cum_exp_trash: Math.round(st.cum.trash), cum_exp_boss: Math.round(st.cum.boss), cum_exp_quest: Math.round(st.cum.quest),
        gold: Math.round(st.gold), gold_earned: Math.round(st.cum.gold), gold_spent: Math.round(st.cum.spent),
        boss_kills: +st.cum.bossKills.toFixed(1), quests_done: st.qi,
        cp: now.cp, atk: now.atk, hp: now.hp, def: now.def,
        herb: Math.round(has('herb')), magic_stone: Math.round(has('magic_stone')), demon_core: Math.round(has('demon_core')),
        gems: +GEMS.reduce((a, g) => a + has(g), 0).toFixed(1),
        got_herb: Math.round(st.got.herb || 0), got_magic_stone: Math.round(st.got.magic_stone || 0),
        got_demon_core: Math.round(st.got.demon_core || 0), got_gems: +GEMS.reduce((a, g) => a + (st.got[g] || 0), 0).toFixed(1),
      });
    }
  }
  return out;
};
if (typeof module !== 'undefined') module.exports = sim;
