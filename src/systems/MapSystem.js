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

  // 바깥 경계 숲
  for (let x = 0; x < W; x++) {
    grid[0][x] = 'T';
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

  // 연못
  for (let i = 0; i < g.ponds; i++) {
    const pw = rng.int(3, 5);
    const ph = rng.int(2, 3);
    const px = rng.int(2, W - pw - 2);
    const py = rng.int(2, H - ph - 2);
    let ok = true;
    for (let j = py - 1; j <= py + ph && ok; j++)
      for (let i2 = px - 1; i2 <= px + pw && ok; i2++) if (!free(i2, j)) ok = false;
    if (!ok) continue;
    for (let j = py; j < py + ph; j++) for (let i2 = px; i2 < px + pw; i2++) grid[j][i2] = 'W';
  }

  // 나무 덤불
  for (let i = 0; i < g.treeClusters; i++) {
    const cx = rng.int(2, W - 3);
    const cy = rng.int(2, H - 3);
    const n = rng.int(3, 7);
    for (let k = 0; k < n; k++) {
      const x = cx + rng.int(-2, 2);
      const yy = cy + rng.int(-1, 1);
      if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = 'T';
    }
  }

  // 바위 / 꽃
  for (let i = 0; i < g.rocks; i++) {
    const x = rng.int(2, W - 3);
    const yy = rng.int(2, H - 3);
    if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = 'R';
  }
  for (let i = 0; i < g.flowers; i++) {
    const x = rng.int(2, W - 3);
    const yy = rng.int(2, H - 3);
    if (free(x, yy) && grid[yy][x] === 'G') grid[yy][x] = 'F';
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
