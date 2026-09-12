// 책임: 맵 데이터(JSON) → 실제 맵 객체. 손으로 그린 격자와 시드 기반 자동 생성을 모두 다룬다.
//        몬스터/NPC 배치도 여기서 결정한다.
// 금지: DOM/캔버스 접근. 좌표와 문자 격자만 만든다.
// 금지: 다른 system import.
//
// 새 맵 추가 = maps.json 에 grid(수작업) 또는 generate(자동 생성) 항목을 넣는 것으로 끝난다.

import { createRng } from '../core/Rng.js';
import { createActor } from '../entities/Actor.js';
import { CONFIG } from '../config.js';

/**
 * 보스가 다시 나타나기까지 걸리는 시간.
 *
 * 예전에는 맵을 나갔다 들어오면 보스가 늘 살아 있었다. 몬스터 목록을 맵을
 * 만들 때마다 새로 뽑았기 때문이다. 그래서 "문 밖에 나갔다 오기"만 하면
 * 보스를 몇 번이고 잡을 수 있었다 — 파밍이 아니라 버그에 가까웠다.
 * 지금은 죽은 시각을 state.bossRespawn 에 적어 두고, 맵을 다시 만들 때
 * 그 시각을 보고 되살릴지 정한다(세이브에도 함께 남는다).
 */
export const BOSS_RESPAWN_MS = 60000;

export function buildMap(db, mapId) {
  const def = db.maps.maps[mapId];
  if (!def) throw new Error(`[MapSystem] 맵을 찾을 수 없습니다: ${mapId}`);

  const tileset = db.maps.tileset;
  let grid = def.grid ? def.grid.slice() : generateField(def);

  // 지형 테마 — 같은 지도를 다른 땅으로 갈아입힌다.
  //
  // 보스가 있는 들판은 다른 들판과 지형이 완전히 같다(씨앗도 같다).
  // 여기서 글자만 바꿔 칠하므로 길·덤불·연못 배치는 그대로인데,
  // 풀은 잿더미로 물은 마그마로 바위는 검은 현무암으로 보인다.
  // 지형을 따로 만들지 않으니 "보스 방만 다르게 생겼다"는 일이 생기지 않는다.
  const theme = def.theme && db.maps.themes && db.maps.themes[def.theme];
  if (theme) {
    grid = grid.map((row) => row.replace(/./g, (ch) => theme[ch] || ch));
  }

  const map = {
    id: mapId,
    name: def.name,
    kind: def.kind || 'field',
    // 이 땅에 흐르는 곡(core/Sound.js 의 SONGS 이름). 없으면 마을/들판으로 가른다.
    bgm: def.bgm || null,
    // 얹는 그림(over) 밑에 깔 바닥 (0.70). 'grass' | 'ash' | 'waste'.
    ground: def.ground || 'grass',
    stage: def.stage || 0,
    bgColor: def.bgColor || '#12241a',
    grid,
    tileset,
    w: grid[0].length,
    h: grid.length,
    respawnMs: def.respawnMs ?? 10000,
    // 보스가 다시 서기까지. 안 적으면 BOSS_RESPAWN_MS(1분)다.
    // 고룡의 둥지만 한 시간이다 — 한 번에 한 번뿐인 상대여야 보상이 값을 한다.
    bossRespawnMs: def.bossRespawnMs || null,
    // 이 땅의 보스는 **상처가 남는다.** 한 판에 눕힐 수 없는 상대에게만 켠다
    // (고룡의 둥지 — 지하감옥 주인의 두 배). 켜면 진 값도 치르지 않는다.
    bossKeepHp: !!def.bossKeepHp,
    reviveAt: def.reviveAt || null,
    power: def.power ?? 1,
    levelBonus: def.levelBonus ?? 0,
    // 이 땅의 공격 가운데 마법으로 들어오는 몫(0~1). 보스는 따로 둘 수 있다.
    magicPart: def.magicPart ?? 0,
    bossMagicPart: def.bossMagicPart ?? null,
    // 어둠 — 켜져 있으면 횃불이 닿는 만큼만 보인다(scenes/FieldScene.js 가 그린다).
    dark: !!def.dark,
    sight: def.sight ?? 0,
    // 몬스터가 플레이어를 알아채는 거리(칸). 0 이면 알아채지 않는다.
    aggro: def.aggro ?? 0,
    // 한 판에 몇 마리와 싸우나 — [1마리, 2마리, 3마리] 확률. 없으면 직업 규칙을 쓴다.
    groupOdds: def.groupOdds || null,
    // 정해진 시각마다 내려앉는 보스(서쪽 절벽의 용). main.js 가 시계를 본다.
    timedBoss: def.timedBoss || null,
    // 포탈은 계단을 옮길 수 있으므로 정의를 그대로 쓰지 않고 복사한다.
    portals: (def.portals || []).map((p) => ({ ...p })),
    npcDefs: def.npcs || [],
    // 웨이포인트 판정에 필요한 정보(systems/WaypointSystem.js 가 읽는다)
    boss: def.boss || null,
    waypoint: def.waypoint || null,
    deep: !!def.deep,
    dungeon: !!def.dungeon,
    // 집 안인가 (0.70.3) — 드나들 때 문 소리를 내고, 곡을 바꾸지 않는다.
    room: !!def.room,
    spawns: [],
  };

  // 내려가는 계단을 매번 다른 방에 놓는다.
  // 지도는 같아도 "어디로 내려가는지"를 매번 찾아야 하므로 층마다 탐험이 생긴다.
  if (def.randomStairs && def.rooms && def.rooms.length > 1) {
    placeStairs(map, def);
  }

  // 격자를 손으로 그렸어도 monsters 목록이 있으면 몬스터는 흩뿌려 준다(지하감옥).
  map.spawns = def.grid
    ? def.spawns || (def.monsters ? pickSpawns(map, def) : [])
    : pickSpawns(map, def);
  return map;
}

/**
 * 내려가는 계단을 무작위 방으로 옮긴다.
 *
 * 들어온 자리(첫 방)에는 놓지 않는다 — 내려가자마자 다음 계단이면 탐험이 없다.
 * 계단 타일('s')과 그 자리에 걸린 포탈을 함께 옮긴다. 도착 좌표는 건드리지 않는다
 * (아랫층에서 올라오는 자리는 고정이어야 위아래가 어긋나지 않는다).
 *
 * ⚠ 여러 명이 같이 할 때는 사람마다 계단 자리가 다를 수 있다.
 *   지하감옥은 혼자 파고드는 곳이라 그대로 둔다 — 맞추려면 서버가 자리를 정해 줘야 한다.
 */
function placeStairs(map, def) {
  const rng = createRng((Date.now() ^ hashSeed(map.id)) >>> 0);
  const entry = def.rooms[0];
  const choices = def.rooms.filter((r) => r !== entry && walkable(map, r.x, r.y));
  if (!choices.length) return;
  const spot = rng.pick(choices);

  // 원래 계단 자리를 지운다(바닥으로 되돌린다).
  for (let y = 0; y < map.h; y++) {
    const at = map.grid[y].indexOf('s');
    if (at >= 0) map.grid[y] = map.grid[y].slice(0, at) + 'd' + map.grid[y].slice(at + 1);
  }
  map.grid[spot.y] =
    map.grid[spot.y].slice(0, spot.x) + 's' + map.grid[spot.y].slice(spot.x + 1);

  // 그 자리에 걸려 있던 "아래로" 포탈도 같이 옮긴다.
  const down = map.portals.find((p) => String(p.to).startsWith('dungeon_') && p.label !== '성으로'
    && Number(String(p.to).split('_')[1]) > Number(String(map.id).split('_')[1]));
  if (down) {
    down.x = spot.x;
    down.y = spot.y;
  }
  map.stairs = { x: spot.x, y: spot.y };
}

/** 시드 기반 필드 생성. 같은 seed → 항상 같은 지형. */
function generateField(def) {
  const g = def.generate;
  const rng = createRng(g.seed);
  const W = g.w;
  const H = g.h;

  const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => 'G'));
  const road = Array.from({ length: H }, () => Array.from({ length: W }, () => false));

  // 바깥 경계 숲.
  //
  // ⚠ **윗줄만 두 겹**이다 (0.67).
  //   큰 나무는 잎이 제 칸보다 **위로** 자란다(56×72). 그래서 맨 윗줄 나무는
  //   잎이 판 밖으로 나가 잘리고, 화면에는 기둥만 남아 울타리처럼 보였다.
  //   한 줄 더 두면 그 줄의 잎이 바깥 줄 기둥을 덮어 숲으로 보인다.
  //
  //   아래·좌·우는 한 겹 그대로다. 잎이 자라는 쪽이 위뿐이라 같은 일이 안 생기고,
  //   경계를 두껍게 할수록 걸을 자리가 줄기 때문이다(0.65 에서 넓힌 그 자리다).
  for (let x = 0; x < W; x++) {
    grid[0][x] = 'T';
    grid[1][x] = 'T';
    grid[H - 1][x] = 'T';
  }
  for (let y = 0; y < H; y++) {
    grid[y][0] = 'T';
    grid[y][W - 1] = 'T';
  }

  // 서→동 큰길. 위아래로 흔들리며 이어진다.
  let y = g.entryY;
  for (let x = 1; x < W - 1; x++) {
    if (x > 3 && x < W - 5 && rng.chance(0.3)) y += rng.pick([-1, 1]);
    y = Math.max(4, Math.min(H - 6, y));
    if (x === W - 5) y = g.exitY;
    for (let d = 0; d < 2; d++) {
      grid[y + d][x] = 'P';
      road[y + d][x] = true;
    }
  }

  const free = (x, yy) => x > 0 && yy > 0 && x < W - 1 && yy < H - 1 && !road[yy][x];

  // ── 연못 (0.68 — 네모를 깎아 둥글게) ────────────────────────
  //
  // 0.67 까지는 그냥 직사각형이었다. 물가(모래톱)를 두르고 나니 그 네모가 더
  // 또렷하게 드러나서, 연못이 아니라 **파란 카펫**처럼 보였다.
  // 네 귀퉁이를 떼면 그것만으로 물웅덩이가 된다 — 대각선으로 땅이 닿는 자리는
  // FieldScene 의 물가 모서리 그림이 받아 준다.
  for (let i = 0; i < g.ponds; i++) {
    const pw = rng.int(4, 6);
    const ph = rng.int(3, 4);
    const px = rng.int(2, W - pw - 2);
    const py = rng.int(2, H - ph - 2);
    let ok = true;
    for (let j = py - 1; j <= py + ph && ok; j++)
      for (let i2 = px - 1; i2 <= px + pw && ok; i2++) if (!free(i2, j)) ok = false;
    if (!ok) continue;
    for (let j = py; j < py + ph; j++) {
      for (let i2 = px; i2 < px + pw; i2++) {
        // 귀퉁이 한 칸씩은 물로 안 만든다.
        const corner =
          (i2 === px || i2 === px + pw - 1) && (j === py || j === py + ph - 1);
        if (corner) continue;
        grid[j][i2] = 'W';
      }
    }
  }

  // ── 나무 숲 (0.65) ─────────────────────────────────────────
  //
  // 예전에는 한 덤불에서 흩뿌린 나무가 **외톨이 한 칸**으로 여럿 남았다.
  // 한 칸짜리 나무는 눈에 잘 안 들어오는데 막기는 막으니, 걷다가 자꾸 걸린다.
  // 이제 가운데를 채우고 **붙여서** 키운다 — 숲은 덩어리로 보여야 숲이다.
  for (let i = 0; i < g.treeClusters; i++) {
    const cx = rng.int(3, W - 4);
    const cy = rng.int(3, H - 4);
    // 씨앗 둘레를 먼저 채운다(2×2 이상이 되게).
    const seed = [[0, 0], [1, 0], [0, 1], [1, 1]];
    for (const [dx, dy] of seed) {
      const x = cx + dx;
      const yy = cy + dy;
      if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = 'T';
    }
    // 그 언저리로 더 번진다 — **이미 나무인 칸에 닿는 자리만**.
    const n = rng.int(2, 6);
    for (let k = 0; k < n; k++) {
      const x = cx + rng.int(-2, 3);
      const yy = cy + rng.int(-1, 2);
      if (!free(x, yy) || grid[yy][x] !== 'G') continue;
      const touches = grid[yy - 1] && grid[yy - 1][x] === 'T'
        || grid[yy + 1] && grid[yy + 1][x] === 'T'
        || grid[yy][x - 1] === 'T' || grid[yy][x + 1] === 'T';
      if (touches) grid[yy][x] = 'T';
    }
  }

  // ── 바위 (0.65) ────────────────────────────────────────────
  //
  // 넷 중 하나만 **막는 바위 무더기**(2×2)로 놓고, 나머지는 밟고 지나가는
  // 잔돌로 깐다. 그래야 "막는 것 = 크고 확실한 것" 이 규칙이 된다.
  const boulders = Math.max(1, Math.round(g.rocks / 4));
  for (let i = 0; i < boulders; i++) {
    const x = rng.int(3, W - 4);
    const yy = rng.int(3, H - 4);
    let ok = true;
    for (let j = yy - 1; j <= yy + 2 && ok; j++)
      for (let i2 = x - 1; i2 <= x + 2 && ok; i2++) if (!free(i2, j) || grid[j][i2] !== 'G') ok = false;
    if (!ok) continue;
    for (let j = yy; j < yy + 2; j++) for (let i2 = x; i2 < x + 2; i2++) grid[j][i2] = 'R';
  }

  // 조경 — 전부 밟고 지나간다.
  // 넉넉히 깐다. 들판 하나가 1,200칸쯤인데 조경이 쉰 칸이면 티가 안 난다 —
  // 처음에 그렇게 깔아 보니 큰 풀밭이 단색 천처럼 보였다.
  const decor = ['r', 'r', 'h', 'h', 'q', 'g', 'g', 'g'];
  for (let i = 0; i < g.rocks * 9; i++) {
    const x = rng.int(2, W - 3);
    const yy = rng.int(2, H - 3);
    if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = rng.pick(decor);
  }
  for (let i = 0; i < g.flowers * 2; i++) {
    const x = rng.int(2, W - 3);
    const yy = rng.int(2, H - 3);
    if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = 'F';
  }

  // ── 외톨이 벽 없애기 (0.65) ────────────────────────────────
  //
  // 위에서 아무리 덩어리로 놓아도, 길이나 연못에 잘려 **혼자 남는 칸**이 생긴다.
  // 혼자 선 나무·바위는 화면에서 작아 보이는데 막기는 확실히 막는다 —
  // 사람이 "여기 왜 막히지" 하는 자리가 정확히 그것이다.
  // 사방에 같은 편이 하나도 없는 막는 칸은 **밟고 지나가는 것으로 바꾼다.**
  //   나무 → 덤불, 바위 → 잔돌.
  const SOFT = { T: 'h', R: 'r' };
  for (let yy = 1; yy < H - 1; yy++) {
    for (let x = 1; x < W - 1; x++) {
      const c = grid[yy][x];
      if (!SOFT[c]) continue;
      const near = (grid[yy - 1][x] === c) || (grid[yy + 1][x] === c)
        || (grid[yy][x - 1] === c) || (grid[yy][x + 1] === c);
      if (!near) grid[yy][x] = SOFT[c];
    }
  }

  // 포탈 자리를 뚫고, 안쪽으로 들어오는 길을 확보한다.
  for (const p of def.portals || []) {
    grid[p.y][p.x] = 'X';
    const inward = p.x === 0 ? 1 : p.x === W - 1 ? -1 : 0;
    for (let k = 1; k <= 3; k++) {
      const x = p.x + inward * k;
      if (x > 0 && x < W - 1) {
        grid[p.y][x] = 'P';
        road[p.y][x] = true;
      }
    }
  }

  return grid.map((row) => row.join(''));
}

/** 걸어 다닐 수 있는 칸인지. */
export function walkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const tile = map.tileset[map.grid[y][x]];
  return !!tile && tile.solid !== true;
}

/**
 * (x,y) 에서 가장 가까운 걸을 수 있는 칸.
 * 자동 생성 맵은 지형이 씨앗에 따라 달라져서 "맵 한가운데"가 나무일 수 있다.
 * 웨이포인트처럼 좌표를 미리 적어 두는 기능은 반드시 이걸 거쳐야 벽에 갇히지 않는다.
 */
export function nearestWalkable(map, x, y, maxRadius = 12) {
  if (walkable(map, x, y)) return { x, y };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        // 껍질만 본다(안쪽은 이미 더 작은 r 에서 봤다)
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (walkable(map, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return { x, y }; // 여기까지 오면 맵이 잘못된 것이다
}

/**
 * 몬스터 배치. 입구 근처에는 두지 않는다.
 * 자동 생성 맵뿐 아니라, 격자를 손으로 그렸어도 monsters 목록만 있으면 여기서 뿌린다
 * (지하감옥처럼 방 모양은 손으로 그리고 몬스터만 흩뿌리고 싶은 경우).
 */
function pickSpawns(map, def) {
  const g = def.generate;
  const rng = createRng((g ? g.seed : hashSeed(map.id)) ^ 0x5f3759df);
  // 입구 = 생성 맵이면 서쪽 진입로, 손으로 그린 맵이면 첫 포탈 자리.
  const entry = g
    ? { x: 2, y: g.entryY }
    : { x: def.portals?.[0]?.x ?? 2, y: def.portals?.[0]?.y ?? 2 };
  const out = [];

  // 보스 층에는 보스 말고 아무것도 두지 않는다 — 주인과 단 둘이 붙는 자리다.
  if (def.bossOnly) {
    if (def.boss) out.push({ monster: def.boss, x: entry.x, y: entry.y, boss: true, center: true });
    return placeBossAway(map, def, out, rng, entry);
  }

  for (let i = 0; i < (def.monsterCount || 8); i++) {
    for (let tries = 0; tries < 80; tries++) {
      const x = rng.int(2, map.w - 3);
      const y = rng.int(2, map.h - 3);
      if (!walkable(map, x, y)) continue;
      if (Math.abs(x - entry.x) + Math.abs(y - entry.y) < 7) continue;
      if (out.some((s) => s.x === x && s.y === y)) continue;
      out.push({ monster: rng.pick(def.monsters), x, y });
      break;
    }
  }

  if (def.boss) {
    for (let tries = 0; tries < 200; tries++) {
      const x = rng.int(map.w - 10, map.w - 4);
      const y = rng.int(4, map.h - 5);
      if (!walkable(map, x, y)) continue;
      out.push({ monster: def.boss, x, y, boss: true });
      break;
    }
  }
  return out;
}

/** 보스 하나만 있는 층 — 입구에서 충분히 떨어진 자리로 보낸다. */
function placeBossAway(map, def, out, rng, entry) {
  const boss = out[0];
  if (!boss) return out;
  for (let tries = 0; tries < 300; tries++) {
    const x = rng.int(2, map.w - 3);
    const y = rng.int(2, map.h - 3);
    if (!walkable(map, x, y)) continue;
    if (Math.abs(x - entry.x) + Math.abs(y - entry.y) < 12) continue;
    boss.x = x;
    boss.y = y;
    return out;
  }
  return out;
}

/** 맵 id 로 만드는 고정 씨앗 — 손으로 그린 맵도 항상 같은 배치가 나오게. */
function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 맵의 spawns 정의 → 몬스터 액터 배열. monsters.json만 고치면 새 몬스터가 나온다.
 *
 * @param {object} [respawnAt] { uid: 되살아날 시각(ms) } — 보스가 아직 죽어 있는지 본다.
 *   맵을 새로 만들어도 보스는 이 표를 보고 "아직 안 나올 때"면 죽은 채로 태어난다.
 */
export function spawnMonsters(db, map, respawnAt = null) {
  return map.spawns
    .map((spawn, index) => {
      const def = db.monsters[spawn.monster];
      if (!def) {
        console.warn(`[MapSystem] 알 수 없는 몬스터: ${spawn.monster}`);
        return null;
      }
      const isBoss = !!(spawn.boss || def.boss);
      const uid = `${map.id}#${index}`;
      // 아직 되살아날 때가 아니면 죽은 채로 태어난다(남은 시간도 그대로 이어받는다).
      const due = respawnAt && respawnAt[uid];
      const left = due ? due - Date.now() : 0;
      const actor = createActor({
        // uid 를 맵+순번으로 고정한다. 여러 명이 접속해도 같은 몬스터를 같은 이름으로 부를 수 있다.
        uid,
        kind: 'monster',
        defId: spawn.monster,
        name: def.name,
        tx: spawn.x,
        ty: spawn.y,
        sprite: def.sprite,
        battleSprite: def.battleSprite,
        stepMs: isBoss ? CONFIG.MONSTER_STEP_MS + 90 : CONFIG.MONSTER_STEP_MS,
        extra: {
          moveStyle: def.moveStyle || 'wander',
          respawnTimer: 0,
          isBoss,
          // 보스는 기본 1분이지만, 맵이 따로 정해 두면 그것을 따른다.
          // (고룡의 둥지 — 한 시간에 한 번뿐이다)
          respawnMs: isBoss ? (map.bossRespawnMs || BOSS_RESPAWN_MS) : map.respawnMs,
          homeX: spawn.x,
          homeY: spawn.y,
        },
      });
      if (left > 0) {
        actor.alive = false;
        actor.respawnTimer = left;
      }
      return actor;
    })
    .filter(Boolean);
}

/** 맵의 npcs 정의 → NPC 액터 배열. 움직이지 않고 대화만 한다. */
export function spawnNpcs(db, map) {
  return map.npcDefs
    .map((entry) => {
      const def = db.npcs[entry.id];
      if (!def) {
        console.warn(`[MapSystem] 알 수 없는 NPC: ${entry.id}`);
        return null;
      }
      return createActor({
        kind: 'npc',
        defId: entry.id,
        name: def.name,
        tx: entry.x,
        ty: entry.y,
        dir: entry.dir || 'down',
        sprite: def.sprite,
        stepMs: 9999,
        extra: { interactive: true },
      });
    })
    .filter(Boolean);
}
