
// 레벨마다 처음 닿은 순간 — 지금 값(now) 줄마다 0.70.38 값으로 같은 레벨에 닿은 분(before_minute)을 곁들인다
const milestones = (model) => {
  const out = [];
  const reach = (rows) => {
    const at = { 1: 0 };
    for (const r of rows) for (let L = 2; L <= r.level; L++) if (at[L] == null) at[L] = r.minute;
    return at;
  };
  for (const cls of [...new Set(model.map((r) => r.class))]) {
    const rows = model.filter((r) => r.class === cls && r.variant === 'now').sort((a, b) => a.minute - b.minute);
    const before = reach(model.filter((r) => r.class === cls && r.variant === 'v0_70_38').sort((a, b) => a.minute - b.minute));
    let L = 1;
    const at = [{ ...rows[0], level: 1, minute: 0 }];
    for (const r of rows) while (L < r.level) { L++; at.push({ ...r, level: L }); }
    at.forEach((r, i) => {
      out.push({
        class: cls, level: r.level, minute: r.minute, stay: at[i + 1] ? at[i + 1].minute - r.minute : null,
        before_minute: before[r.level] ?? null,
        doing: r.doing, win: r.win, exp_min: r.exp_min, set: r.set, set_name: r.set_name, enh: r.enh, cp: r.cp, gold_earned: r.gold_earned,
      });
    });
  }
  return out;
};
// 목표에 처음 닿은 분(value)과 시간(hours, 0.1 단위) · 모은 경험치 가운데 보스 몫(%) — 값마다(now · v0_70_38)
const goals = (model) => {
  const out = [];
  for (const variant of [...new Set(model.map((r) => r.variant))]) {
    for (const cls of [...new Set(model.map((r) => r.class))]) {
      const rows = model.filter((r) => r.variant === variant && r.class === cls).sort((a, b) => a.minute - b.minute);
      if (!rows.length) continue;
      const first = (f) => { const r = rows.find(f); return r ? r.minute : null; };
      const last = rows[rows.length - 1];
      const tot = last.cum_exp_boss + last.cum_exp_trash + last.cum_exp_quest;
      const row = (goal, value) => out.push({ variant, class: cls, goal, value, hours: value == null ? null : Math.round(value / 6) / 10 });
      row('lv45', first((r) => r.level >= 45));
      row('lv50', first((r) => r.level >= 50));
      row('rune10', first((r) => r.set >= 4 && r.enh >= 10));
      row('rune15', first((r) => r.set >= 4 && r.enh >= 15));
      out.push({ variant, class: cls, goal: 'boss_share', value: tot ? Math.round((last.cum_exp_boss / tot) * 100) : 0, hours: null });
    }
  }
  return out;
};
dash.calc('model', {
  inputs: ['battle', 'targets', 'tdrops', 'sets', 'items', 'quests', 'consts'],
  // 지금 값으로 한 번(now), 0.70.38 값(OLD_GAP_MAX · OLD_BOSS_RESPAWN_S)으로 한 번(v0_70_38)
  fn: (battle, targets, tdrops, sets, items, quests, consts) => {
    const v = Object.fromEntries(consts.map((r) => [r.key, r.value]));
    const old = consts.map((r) => (r.key === 'GAP_MAX' ? { ...r, value: v.OLD_GAP_MAX }
      : r.key === 'BOSS_RESPAWN_S' ? { ...r, value: v.OLD_BOSS_RESPAWN_S } : r));
    return [
      ...sim(battle, targets, tdrops, sets, items, quests, consts).map((r) => ({ variant: 'now', ...r })),
      ...sim(battle, targets, tdrops, sets, items, quests, old).map((r) => ({ variant: 'v0_70_38', ...r })),
    ];
  },
  title: '성장 흉내 — 1분마다',
  description: '직업마다 새 캐릭터로 시작해 1분마다 가장 빨리 크는 사냥(잡몹·보스·의뢰)을 고르고, 번 것으로 장비를 사고 강화·초월한다. 지금 값(now)과 0.70.38 값(v0_70_38)으로 한 번씩 돌린다. 전투 승률은 게임 전투 계산기로 잰 표에서 읽는다.',
});
dash.calc('milestones', {
  inputs: ['model'],
  fn: milestones,
  title: '레벨에 닿은 시각',
  description: '지금 값으로 각 레벨에 처음 닿은 분과 그 레벨에 머문 시간, 그때의 장비·강화·전투력, 그리고 0.70.38 값으로 같은 레벨에 닿은 분.',
});
dash.calc('goals', {
  inputs: ['model'],
  fn: goals,
  title: '목표에 닿은 시각',
  description: 'Lv.45 · Lv.50 · 룬 한 벌 +10 · 룬 한 벌 +15 에 처음 닿은 분과 시간, 모은 경험치 가운데 보스 몫(%) — 지금 값과 0.70.38 값.',
});
window.DFB = { sim, milestones, goals };
