#!/usr/bin/env node
/**
 * 지하감옥 5층을 만들어 src/data/maps.json 에 넣는다.
 *
 *   node tools/gen-dungeon.js
 *
 * 손으로 40×30 격자를 다섯 장 그리는 대신, 방을 놓고 복도로 잇는 식으로 만든다.
 * 씨앗이 고정이라 몇 번을 돌려도 같은 층이 나온다(맵이 매번 바뀌면 곤란하다).
 *
 * 층 구조
 *   1층 입구  ← 성에서 내려온다
 *   각 층 아래쪽에 '내려가는 계단'(s), 위쪽에 '올라가는 계단'
 *   5층 끝에 주인이 앉아 있다
 *
 * 몬스터는 층이 깊어질수록 power 가 올라간다(maps.json 의 power).
 * 실제 능력치는 formulas.js 의 scaleMonsterStats 가 곱해 준다.
 */
const fs = require('fs');
const path = require('path');

const W = 40;
const H = 30;
const FLOORS = 5;
const MAPS = path.resolve(__dirname, '../src/data/maps.json');

// 씨앗 고정 난수(mulberry32) — 게임 것과 같은 방식
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 층 하나. 방 여러 개를 놓고 복도로 잇는다. */
/**
 * 보스 층 귀환점을 첫 방 안에서 고른다 (0.65).
 *
 * 조건은 둘뿐이다: **걸어 다닐 수 있고, 계단이 아닐 것.**
 * 계단 위에 떨어지면 도착하자마자 그 계단을 타고 나가 버린다.
 */
function bossWaypoint(grid, room, stairs) {
  const taken = (x, y) => stairs.some((sp) => sp && sp.x === x && sp.y === y);
  const walk = (x, y) => grid[y] && grid[y][x] === 'd';
  // 방 한가운데부터 바깥으로 조금씩 벌리며 첫 자리를 잡는다.
  for (let r = 0; r <= 3; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = room.cx + dx;
        const y = room.cy + dy;
        if (walk(x, y) && !taken(x, y)) return { x, y };
      }
    }
  }
  return { x: room.cx, y: room.cy };
}

function makeFloor(seed, opts) {
  const r = rng(seed);
  const g = Array.from({ length: H }, () => new Array(W).fill('Z'));

  const rooms = [];
  const tries = 60;
  for (let i = 0; i < tries && rooms.length < opts.rooms; i++) {
    const w = 5 + Math.floor(r() * 7);
    const h = 4 + Math.floor(r() * 5);
    const x = 2 + Math.floor(r() * (W - w - 4));
    const y = 2 + Math.floor(r() * (H - h - 4));
    const box = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };
    // 방끼리 한 칸은 띄운다
    if (rooms.some((o) => x < o.x + o.w + 1 && x + w + 1 > o.x && y < o.y + o.h + 1 && y + h + 1 > o.y)) continue;
    rooms.push(box);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy][xx] = 'd';
  }

  // 방을 순서대로 복도로 잇는다(ㄱ자 통로)
  const dig = (x, y) => { if (y > 0 && y < H - 1 && x > 0 && x < W - 1) g[y][x] = 'd'; };
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    const midX = r() < 0.5;
    if (midX) {
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { dig(x, a.cy); dig(x, a.cy + 1); }
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { dig(b.cx, y); dig(b.cx + 1, y); }
    } else {
      for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) { dig(a.cx, y); dig(a.cx + 1, y); }
      for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) { dig(x, b.cy); dig(x, b.cy + 1); }
    }
  }

  // ── 벽 횃불 (0.68) ─────────────────────────────────────────
  //
  // 지하감옥은 횃불이 닿는 데까지만 보인다. 그 밖은 통째로 안 그리므로
  // **길을 찾을 실마리가 하나도 없었다** — 벽을 더듬는 것 말고는 방법이 없다.
  // 방 벽에 불을 걸어 두고, 그 불만은 어둠 밖에서도 보이게 한다(FieldScene).
  // 멀리 보이는 불빛 하나가 "저쪽에 방이 있다" 를 말해 준다.
  //
  // ⚠ **바닥(d)이 아니라 벽(Z)에만** 건다. 바닥에 걸면 지나갈 수 없는 칸이
  //   복도 한가운데 생겨서, 길을 밝히려다 길을 막는다.
  //   (글자 'x' 다 — 'F' 는 이미 들판의 꽃이 쓰고 있다. 표는 지도마다가 아니라
  //    **하나**라, 겹치면 지하감옥 벽에 꽃이 핀다)
  const isWall = (x, y) => y > 0 && y < H - 1 && x > 0 && x < W - 1 && g[y][x] === 'Z';
  const isFloor = (x, y) => y >= 0 && y < H && x >= 0 && x < W && g[y][x] === 'd';
  for (const room of rooms) {
    // 방마다 위·아래 벽에 하나씩. 방 안에서 보면 벽에 걸린 것으로 읽힌다.
    const spots = [
      [room.x + 1, room.y - 1],
      [room.x + room.w - 2, room.y + room.h],
    ];
    for (const [x, y] of spots) {
      if (!isWall(x, y)) continue;
      // 불빛이 방 안을 비춰야 뜻이 있다 — 바닥과 맞닿은 벽에만.
      if (!isFloor(x, y - 1) && !isFloor(x, y + 1)) continue;
      g[y][x] = 'x';
    }
  }

  return { grid: g, rooms };
}

const asRows = (g) => g.map((row) => row.join(''));

// ── 층별 설정 ────────────────────────────────────────────────
// power 가 곧 난이도다. 1층부터 이미 20단계 필드보다 세고, 5층은 아득하게 만든다.
const PLAN = [
  { floor: 1, seed: 91001, rooms: 7, power: 11.936, monsters: ['elite_skeleton', 'elite_demon_soldier'], count: 12, name: '지하감옥 1층 · 무너진 감방' },
  { floor: 2, seed: 91002, rooms: 7, power: 14.289, monsters: ['elite_demon_soldier', 'dungeon_wraith'], count: 13, name: '지하감옥 2층 · 물 고인 복도' },
  { floor: 3, seed: 91003, rooms: 8, power: 17.683, monsters: ['dungeon_wraith', 'dungeon_golem'], count: 14, name: '지하감옥 3층 · 석상의 방' },
  { floor: 4, seed: 91004, rooms: 8, power: 12.592, monsters: ['dungeon_golem', 'dungeon_general'], count: 14, name: '지하감옥 4층 · 봉인된 층' },
  // 5층은 석상만 둔다. 망령(62)을 함께 두면 4층(석상 70)보다 낮은 숫자가 나와
  // 마지막 층에서 사다리가 한 칸 꺼진다. 보스방은 한 종류만 있어도 어색하지 않다.
  { floor: 5, seed: 91005, rooms: 6, power: 18.609, monsters: ['dungeon_golem'], count: 10, boss: 'dungeon_lord', name: '지하감옥 5층 · 주인의 자리' },
];

const data = JSON.parse(fs.readFileSync(MAPS, 'utf8'));

PLAN.forEach((p, i) => {
  const { grid, rooms } = makeFloor(p.seed, p);
  const first = rooms[0];
  const last = rooms[rooms.length - 1];

  // 올라가는 자리(첫 방)와 내려가는 계단(마지막 방)
  const up = { x: first.cx, y: first.cy };
  const down = { x: last.cx, y: last.cy };
  if (i < FLOORS - 1) grid[down.y][down.x] = 's';
  // 올라가는 계단 — 0.40. 예전에는 이 자리가 맨바닥이라 "성으로 돌아가는 길"이
  // 지도 어디에도 안 보였다. 내려가는 계단만 그림이 있었던 탓이다.
  grid[up.y][up.x] = 'u';

  const id = `dungeon_${p.floor}`;
  const portals = [];
  // 위로
  portals.push(
    i === 0
      ? { x: up.x, y: up.y, to: 'castle', toX: 20, toY: 4, label: '성으로' }
      : { x: up.x, y: up.y, to: `dungeon_${p.floor - 1}`, toXKey: 'down', label: `${p.floor - 1}층으로` }
  );
  // 아래로
  if (i < FLOORS - 1) {
    portals.push({ x: down.x, y: down.y, to: `dungeon_${p.floor + 1}`, toXKey: 'up', label: `${p.floor + 1}층으로` });
  }

  data.maps[id] = {
    name: p.name,
    kind: 'field',
    bgm: 'dungeon',
    bgColor: '#0a0910',
    dungeon: true,
    stage: 20 + p.floor,
    power: p.power,
    // 지하감옥은 절반이 마법으로 들어온다 — 여기까지 온 사람은 지능을 올릴 수
    // 있었고, 그 선택이 값을 하는 자리가 있어야 한다.
    magicPart: 0.5,
    // 지하감옥도 층마다 숫자가 오른다.
    // 예전에는 0 이라 1층 잡몹이 45~48 로 찍혔는데, 바로 위 20단계가 60 이었다 —
    // 더 깊은 곳에 내려왔는데 레벨이 내려가 보였다. 16 부터 시작해 그 위에 얹는다.
    levelBonus: 16 + (p.floor - 1),
    // 지하감옥은 캄캄하다. 횃불이 닿는 만큼만 보인다.
    dark: true,
    sight: 3.5,
    // 몬스터가 이만큼 안에 들어온 플레이어를 알아채고 달려든다.
    aggro: 5,
    // 방마다 문이 있으므로 계단은 매번 다른 방에 놓인다(runtime 이 고른다).
    rooms: rooms.map((r) => ({ x: r.cx, y: r.cy })),
    // ── 보스 층의 귀환점 (0.65) ───────────────────────────────
    //
    // ⚠ 이 줄이 없어서 한 번 사고가 났다. 예전에는 dungeon_5 의 waypoint 가
    //   **maps.json 에 손으로만** 적혀 있었다. 그런데 gen-maps 는 maps.json 을
    //   통째로 다시 쓴다 — 지형을 손보려고 `npm run maps` 를 한 번 돌렸더니
    //   그 한 줄이 조용히 사라졌고, 5층 귀환점이 통째로 없어졌다.
    //   손으로 적어 둔 값은 언젠가 이렇게 날아간다. **만드는 자리에서 만든다.**
    //
    //   자리는 첫 방 안에서 **계단을 비켜 간** 칸이다. 방 한가운데를 그냥 쓰면
    //   올라가는 계단 위에 떨어져서, 귀환하자마자 4층으로 도로 올라가 버린다
    //   (처음에 그렇게 나왔다 — 손으로 적혀 있던 옛 값도 한 칸 비켜 있었다).
    waypoint: p.boss ? bossWaypoint(grid, first, [up, down]) : undefined,
    randomStairs: i < FLOORS - 1,
    // 한 판에 몇 마리가 달려드나 — 60% 한 마리, 35% 두 마리, 5% 세 마리.
    // 보스 층은 보스 하나뿐이라 이 규칙을 쓰지 않는다.
    groupOdds: p.boss ? null : [0.6, 0.35, 0.05],
    grid: asRows(grid),
    monsters: p.monsters,
    monsterCount: p.count,
    boss: p.boss || null,
    // 보스 층에는 보스 말고 아무것도 두지 않는다.
    bossOnly: !!p.boss,
    respawnMs: 15000,
    npcs: [],
    portals,
    _anchor: { up, down },
  };
});

// 포탈의 도착 좌표를 서로 맞춘다(윗층의 '내려가는 계단' ↔ 아랫층의 '올라오는 자리')
for (let i = 0; i < FLOORS; i++) {
  const me = data.maps[`dungeon_${i + 1}`];
  for (const p of me.portals) {
    if (!p.toXKey) continue;
    const target = data.maps[p.to];
    const at = target._anchor[p.toXKey];
    p.toX = at.x;
    p.toY = at.y;
    delete p.toXKey;
  }
}
// 성 → 1층 입구도 여기서 맞춘다.
//
// 성의 포탈은 gen-maps.js 가 손으로 적어 두는데, 1층의 배치는 **여기서** 만든다.
// 그대로 두면 옛 좌표로 내려보내게 되고, 그 자리가 바위면 사방이 벽인 곳에
// 떨어져 **한 칸도 못 움직인다.** (실제로 20,28 에 떨어져 갇혀 있었다.)
// 계단이 어디 있는지는 이 파일만 알고 있으므로, 맞추는 것도 여기서 한다.
{
  const first = data.maps.dungeon_1;
  const entry = first && first._anchor && first._anchor.up;
  const castle = data.maps.castle;
  if (entry && castle && Array.isArray(castle.portals)) {
    let fixed = 0;
    for (const p of castle.portals) {
      if (p.to !== 'dungeon_1') continue;
      if (p.toX === entry.x && p.toY === entry.y) continue;
      p.toX = entry.x;
      p.toY = entry.y;
      fixed++;
    }
    if (fixed) console.log(`  성 → 1층 입구를 ${entry.x},${entry.y} 로 맞췄습니다.`);
  }
}

for (let i = 0; i < FLOORS; i++) delete data.maps[`dungeon_${i + 1}`]._anchor;

fs.writeFileSync(MAPS, JSON.stringify(data, null, 2) + '\n');

console.log(`지하감옥 ${FLOORS}층을 만들었습니다.`);
for (const p of PLAN) {
  const m = data.maps[`dungeon_${p.floor}`];
  const open = m.grid.join('').split('').filter((c) => c !== 'Z').length;
  console.log(`  ${p.floor}층  power ${p.power}  통로 ${open}칸  몬스터 ${m.monsterCount}  ${m.boss ? '· 보스 ' + m.boss : ''}`);
}
