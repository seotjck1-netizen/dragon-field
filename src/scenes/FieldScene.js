// 책임: 필드/마을 화면. 시스템을 호출하고 그 결과를 그린다.
// 금지: 전투 계산, 아이템 지급, 맵 교체 같은 규칙 판단 → systems/ 와 main.js 담당.
// 금지: HTML UI 조작 → ui/ 담당.

import { CONFIG } from '../config.js';
import * as Movement from '../systems/MovementSystem.js';
import { DIR_VECTORS } from '../entities/Actor.js';
import { computeLook, computePlayerStats } from '../entities/StatBlock.js';
import { tickBuffs, speedMultiplier } from '../systems/BuffSystem.js';
import { roundRectPath } from '../core/Canvas2d.js';

const INTERACT_RANGE_TILES = 2;

// 재생으로 체력이 차는 것을 화면에 알리는 간격(밀리초).
// 매번 알리면 열려 있는 창이 초당 스무 번 다시 그려진다.
const HP_TELL_MS = 250;

// 이름표 색: 1레벨은 흰색, 이 레벨에서 완전한 파란색이 된다.
const NAME_FULL_BLUE_LEVEL = 30;

/** 몬스터 이름표 색 — 전투력 비교 결과(formulas.powerTier)에 맞춘다. */
const MONSTER_TAG_COLOR = {
  trivial: '#8fa3a0', // 한 수 아래 — 흐린 회색(굳이 눈에 띌 필요 없다)
  easy: '#7ef0b0', // 쉬움 — 초록
  even: '#e8ecf6', // 비슷 — 흰색
  hard: '#ffb46b', // 버거움 — 주황
  deadly: '#ff6b6b', // 위험 — 빨강
};
const NAME_LOW = [255, 255, 255];
const NAME_HIGH = [64, 132, 255];

/**
 * 머리 위에 뜨는 이름 (0.66).
 *
 * **캐릭터 이름**으로 부른다. 아이디가 아니다.
 *
 * ⚠ 0.61 에는 반대로 했다 — 그때는 계정(메일 주소 같은 것)과 아이디가 따로였고,
 *   계정이 화면에 나오는 것이 문제라 아이디로 통일했다. 이제는 **캐릭터 이름**이
 *   있으니 그쪽이 맞다. 아이디는 계정을 여는 열쇠일 뿐, 남에게 보일 이유가 없다.
 *
 * 이름이 없는 옛 사람에게만 아이디를 빌려 쓴다(빈 이름표보다는 낫다).
 * 그때도 계정 뒤에 붙은 꼬리표(@xxxx)는 떼고 보여 준다.
 */
export function nameTagText(actor) {
  const nick = String(actor.name || '').trim();
  if (nick) return nick;
  const fallback = String(actor.account || actor.id || '').split('@')[0];
  return fallback || '모험가';
}

/** 레벨에 따라 흰색 → 파란색으로 섞은 RGB. */
export function nameColor(level) {
  const t = Math.min(1, Math.max(0, (level - 1) / (NAME_FULL_BLUE_LEVEL - 1)));
  return NAME_LOW.map((c, i) => Math.round(c + (NAME_HIGH[i] - c) * t));
}

export class FieldScene {
  constructor({ bus, store, input, encounter, portal, rng, appearance, net, getSettings }) {
    this.bus = bus;
    this.store = store;
    this.input = input;
    this.encounter = encounter;
    this.portal = portal;
    this.rng = rng;
    this.appearance = appearance;
    this.net = net;
    this.getSettings = getSettings || (() => ({}));
    this.accountId = null; // main.js 가 로그인 후 넣어 준다(이름 없는 옛 저장본의 이름표 대타)
    this.active = true;
    // 조작이 살아 있는가. 창을 열거나 대화를 하면 꺼진다.
    // active 와 나누어 둔 이유: 창이 열려 있어도 씬은 계속 돌아야 하기 때문이다
    // (버프와 리젠 시계는 흘러야 한다). 멈추는 것은 발과 전투뿐이다.
    this.controls = true;
    this.time = 0;
    this.hoverNpcUid = null;
    this.banner = null; // { text, t }
  }

  enter() {
    this.active = true;
    this.controls = true;
  }

  pause() {
    this.controls = false;
  }

  resume() {
    this.controls = true;
    this.encounter.startCooldown();
  }

  /** 맵 이름 배너를 잠깐 띄운다. */
  showBanner(text) {
    this.banner = { text, t: 2600 };
  }

  /**
   * @param {number} dt 흐른 시간(ms)
   * @param {{paused?:boolean}} [opts] paused = 창을 열어 두었거나 대화 중
   *
   * ── 창을 열면 시간이 흐르나 ──────────────────────────────
   * 고를 수 있다(설정 → 화면 → '창을 열면 시간 멈춤', **기본은 멈춤**).
   *
   *   멈춤(기본) — 예전 방식. 창을 보는 동안 아무것도 흐르지 않아 화면이 조용하다.
   *                버프가 창을 닫을 때까지 남아 있는 대신, 눈에 거슬리는 것이 없다.
   *   흐름       — 여관 버프·질주 물약·보스 리젠 시계가 계속 간다. 대신 체력이
   *                찰 때마다 화면 일부가 다시 그려진다.
   *
   * 어느 쪽이든 **내 발과 몬스터의 발은 멈춘다** — 그렇지 않으면 상점 목록을 보는
   * 사이에 늑대가 걸어와 전투가 시작되고, 사람은 무슨 일이 일어났는지 알 수 없다.
   */
  update(dt, { paused = false } = {}) {
    if (!this.active) return;

    // 창이 열려 있는 동안 시간을 멈출 것인가.
    //
    // 시간이 흐르면 상점을 보는 사이에도 체력이 차고 몬스터가 되살아난다.
    // 그 대신 화면이 자꾸 새로 그려져 깜빡이는 것처럼 보인다는 이야기가 있어서,
    // 고를 수 있게 두었다(설정 → 화면 → '창을 열면 시간 멈춤', 기본 켬).
    // 멈추면 이 아래 '시간에 속하는 것'이 통째로 서고, 화면은 완전히 조용해진다.
    const settings = this.getSettings ? this.getSettings() : {};
    if (paused && settings.pauseInMenus !== false) return;

    this.time += dt;
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }

    const state = this.store.state;
    const map = state.map;
    const player = state.player;
    const monsters = state.monsters;

    // ── 시간에 속하는 것 — 창이 열려 있어도 흐른다 ──
    // 버프 — 초당 재생과 이동속도
    const stats = computePlayerStats(state);
    const { healed, expired } = tickBuffs(state, dt, stats.hp);
    // 회복은 초당 스무 번씩 들어온다. 그때마다 알리면 열려 있는 창이 전부
    // 통째로 다시 그려져서, 상점이나 소지품이 손 대는 동안 깜빡거린다.
    // 체력 막대는 4분의 1초마다 고쳐도 사람 눈에는 이어져 보인다.
    if (healed) {
      this._hpTellMs = (this._hpTellMs || 0) + dt;
      if (this._hpTellMs >= HP_TELL_MS) {
        this._hpTellMs = 0;
        this.store.notify();
      }
    }
    if (expired.length) {
      this._hpTellMs = 0;
      this.store.notify();
      this.bus.emit('buff:expired', expired);
    }
    player.stepMs = CONFIG.PLAYER_STEP_MS / speedMultiplier(state);

    // ⚠ **다른 접속자는 길을 막지 않는다** — 서로 겹쳐 지나간다 (0.62).
    //
    // 0.61 에서 한 번 막아 봤다. 규칙으로는 맞았지만 실제로는 길이 막혔다 —
    // 좁은 통로나 마을 문 앞에 누가 서 있으면 지나갈 방법이 아예 없다.
    // 그 사람이 자리를 뜰 때까지 기다리는 것 말고는 할 수 있는 일이 없고,
    // 자리를 비켜 달라고 말할 방법도 (아직) 없다.
    //
    // 밀어내기·비켜 서기 같은 규칙 없이 막기만 하면 **막힘이 곧 버그로 보인다.**
    // 그래서 겹치는 쪽으로 되돌린다. 겹쳐 서면 앞뒤로 조금 어색하지만
    // 그것은 눈에 거슬리는 정도고, 길이 막히는 것은 못 노는 것이다.
    //
    // 다시 막고 싶어지면 그때는 **먼저** 비켜 나는 규칙을 만들 것.
    const blockers = [player, ...state.npcs, ...monsters.filter((m) => m.alive)];

    // 쓰러진 놈이 돌아오는 시계도 시간이다.
    for (const m of monsters) {
      if (m.alive) continue;
      m.respawnTimer -= dt;
      if (m.respawnTimer <= 0) this._respawn(m, map, blockers);
    }

    // ── 조작에 속하는 것 — 창이 열려 있으면 멈춘다 ──
    if (paused || !this.controls) return;

    // 0.53 — 여덟 갈래. 화살표 둘을 같이 누르면 대각선으로 걷는다.
    //   (this.input.direction 은 '마지막에 누른 하나' 라 대각선이 안 된다)
    Movement.updatePlayer(player, dt, map, this.input.moveDir, blockers);
    // 매직 투구를 쓰면 지하감옥의 것들이 먼저 알아채지 못한다(내가 때리면 그때 붙는다).
    const hidden = map.dungeon && (stats.mods || {}).dungeonStealth > 0;
    for (const m of monsters) {
      if (m.alive) Movement.updateMonster(m, dt, map, this.rng, player, blockers, { hidden });
    }

    this.portal.update(state);
    if (map.kind !== 'town') this.encounter.update(dt, player, monsters);
  }

  // ---------- 상호작용 ----------

  /** 플레이어가 바라보는 칸의 NPC. */
  facingNpc() {
    const state = this.store.state;
    const v = DIR_VECTORS[state.player.dir] || DIR_VECTORS.down;
    const tx = state.player.tx + v.x;
    const ty = state.player.ty + v.y;
    return state.npcs.find((n) => n.tx === tx && n.ty === ty) || null;
  }

  /** 화면 클릭 지점의 NPC(플레이어 근처에 있을 때만). */
  npcAt(wx, wy) {
    const state = this.store.state;
    for (const npc of state.npcs) {
      // 0.70.3 — 그림이 커졌으니(60×80) 누르는 자리도 같이 커야 한다.
      // 안 늘리면 머리와 발이 **눌러도 반응하지 않는** 띠가 된다.
      const w = 60;
      const h = 80;
      if (wx < npc.px - w / 2 || wx > npc.px + w / 2) continue;
      if (wy < npc.py - h || wy > npc.py + 6) continue;
      return npc;
    }
    return null;
  }

  inRange(npc) {
    const p = this.store.state.player;
    return Math.abs(npc.tx - p.tx) + Math.abs(npc.ty - p.ty) <= INTERACT_RANGE_TILES;
  }

  setHover(wx, wy) {
    const npc = this.npcAt(wx, wy);
    this.hoverNpcUid = npc ? npc.uid : null;
  }

  _respawn(monster, map, blockers) {
    const player = this.store.state.player;
    for (let i = 0; i < 40; i++) {
      const tx = this.rng.int(1, map.w - 2);
      const ty = this.rng.int(1, map.h - 2);
      if (Movement.isSolid(map, tx, ty)) continue;
      if (Movement.isOccupied(blockers, tx, ty, monster.uid)) continue;
      if (Math.abs(tx - player.tx) + Math.abs(ty - player.ty) < 6) continue;
      monster.tx = monster.fromTx = tx;
      monster.ty = monster.fromTy = ty;
      monster.alive = true;
      monster.moving = false;
      monster.stepT = 0;
      monster.alerted = false;
      // 보스가 실제로 돌아왔으면 "언제 돌아오나" 기록은 지운다.
      if (monster.isBoss && this.store.state.bossRespawn) {
        delete this.store.state.bossRespawn[monster.uid];
      }
      Movement.advance(monster, 0);
      this.bus.emit('field:respawned', { uid: monster.uid, tx, ty });
      return;
    }
    monster.respawnTimer = 2000;
  }

  // ---------- 렌더 ----------

  /**
   * 흙길 가장자리의 풀 술 (0.65).
   *
   * 길 그림 자체는 네 변을 꽉 채운다(그래야 옆 칸과 빈틈없이 이어진다).
   * 대신 **풀과 맞닿은 변**에만 이 술을 얹어 딱딱한 직선을 지운다.
   * 길끼리 맞닿은 변에는 안 얹으므로 길 한가운데에 풀이 돋는 일은 없다.
   */
  _pathFringe(renderer, map, tx, ty, T) {
    for (const [dx, dy, key] of FRINGE) {
      const nx = tx + dx;
      const ny = ty + dy;
      // 판 밖은 풀로 치지 않는다 — 테두리에 술이 돋으면 지도가 잘린 것처럼 보인다.
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
      const n = map.tileset[map.grid[ny][nx]];
      // 다져 놓은 바닥끼리 맞닿은 변에는 안 얹는다 — 길과 광장이 만나는 자리에
      // 풀이 돋으면 두 바닥 사이에 없던 경계가 생긴다.
      if (!n || HARD_GROUND.has(n.sprite)) continue;
      // 물·바위처럼 제 바닥을 가진 칸에는 안 얹는다. 풀 위에만.
      if (!n.over && n.sprite !== 'tile_grass') continue;
      renderer.drawSprite(key, tx * T, ty * T, { anchor: 'topleft' });
    }
  }

  /**
   * 이 나무가 지금 사람을 가리고 있나 (0.67).
   *
   * 가리는 조건은 둘 다 맞아야 한다.
   *   ① 사람이 나무보다 **위**에 서 있다 (py 가 작다 = 뒤에 있다)
   *   ② 잎이 덮는 네모 안에 들어와 있다
   *
   * ⚠ 그림 크기를 코드에 다시 적지 않는다. 자산에서 읽어 온다 —
   *   나무 그림을 키우면 가리는 범위도 따라 커져야 하는데, 숫자를 두 군데에
   *   적어 두면 반드시 한쪽만 고치게 된다.
   */
  _hidesPlayer(renderer, prop, player) {
    if (!player) return false;
    if (player.py >= prop.py) return false; // 나무보다 아래 = 사람이 앞
    const a = renderer && renderer.assets ? renderer.assets.get(prop.sprite) : null;
    const w = (a && a.w) || 56;
    const h = (a && a.h) || 72;
    // 밑동(아래 12px)은 줄기다. 줄기에 겹칠 때까지 비치면 사람이 유령처럼 보인다.
    const top = prop.py - h;
    const bottom = prop.py - 12;
    if (player.py < top || player.py > bottom) return false;
    return Math.abs(player.px - prop.px) <= w / 2;
  }

  /**
   * 물가·용암 가장자리 (0.67 물 · 0.70 마그마).
   *
   * 물과 땅이 직선으로 맞닿아 있으면 연못이 아니라 파란 사각형이 된다.
   * 길가 풀(_pathFringe)과 **같은 방법**이다 — 땅과 맞닿은 변에만 젖은
   * 모래와 거품을 얹는다. 물끼리 맞닿은 변에는 안 얹으므로 연못 한가운데에
   * 모래톱이 생기는 일은 없다.
   *
   * ⚠ 판 밖은 물로 친다. 지도 끝의 물은 '이어진다'가 맞다 — 거기에 모래를
   *   두르면 화면 끝에서 연못이 잘린 것처럼 보인다.
   */
  _liquidFringe(renderer, map, tx, ty, T, sprite) {
    const kind = EDGED[sprite];
    if (!kind) return;
    // 판 밖은 같은 액체로 친다 — 지도 끝의 물은 '이어진다'가 맞다.
    const wet = (x, y) => {
      if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
      const t = map.tileset[map.grid[y][x]];
      return !t || t.sprite === sprite;
    };
    for (const [dx, dy, side] of SHORE) {
      if (wet(tx + dx, ty + dy)) continue;
      renderer.drawSprite(`tile_${kind}_${side}`, tx * T, ty * T, { anchor: 'topleft' });
    }
    // 두 변이 다 액체인데 **대각선만** 땅인 귀퉁이 (0.68).
    for (const [ax, ay, bx, by, cx, cy, side] of SHORE_CORNER) {
      if (!wet(tx + ax, ty + ay) || !wet(tx + bx, ty + by)) continue;
      if (wet(tx + cx, ty + cy)) continue;
      renderer.drawSprite(`tile_${kind}_${side}`, tx * T, ty * T, { anchor: 'topleft' });
    }
  }

  /**
   * 바닥 한 장 (0.70).
   *
   * ── 왜 만들었나 ────────────────────────────────────────────
   * 0.67~0.68 에 땅이 두꺼워졌다. 칸마다 풀을 깔고, 그 위에 그림을 얹고,
   * 길가에 술을 두르고, 물가에 모래를 붙이고, 나무 밑에 그늘을 깐다.
   * 한 프레임에 **650번** 넘게 그리게 됐다(재 봤다).
   *
   * 그런데 이 그림들은 **한 번도 변하지 않는다.** 땅은 놀는 동안 그대로다.
   * 매 프레임 다시 그릴 이유가 없다 — 지도에 들어설 때 한 장으로 구워 두고,
   * 그 뒤로는 그 한 장을 붙이기만 하면 된다. 650번이 **한 번**이 된다.
   *
   * ⚠ 여기 넣으면 안 되는 것:
   *   · 큰 나무·지붕 마루 — 사람과 앞뒤가 바뀌어야 한다(배우 목록으로 간다)
   *   · 어둠 밖 횃불     — 밝기가 사람과의 거리에 따라 바뀐다
   *   · 사람·몬스터·NPC
   *   움직이거나 사람에 따라 달라지는 것은 전부 밖에 둔다.
   *
   * ⚠ 지도를 바꾸면 다시 굽는다. 판이 클수록 넓은 그림 한 장을 들지만
   *   (40×32칸이면 1280×1024), 한 장뿐이라 부담이 되지 않는다.
   */
  /**
   * 바닥을 **미리** 구워 둔다 (0.70.3).
   *
   * ── 왜 ────────────────────────────────────────────────────
   * 굽는 것은 지도에 들어설 때 한 번이지만, 그 한 번이 **첫 프레임 안에서** 일어났다.
   * 그래서 문을 지나는 순간 화면이 한 번 걸렸다 — 40×32칸이면 그 한 프레임에
   * 650번을 그린다. 옮기는 그 자리에서(아직 아무것도 안 그리고 있을 때) 구워 두면
   * 첫 프레임은 붙이기만 하면 된다.
   *
   * ⚠ 그림이 아직 안 실렸으면 굽지 않는다. 빈 칸으로 구운 판이 캐시에 남아
   *   그 지도 내내 빈 땅이 보이게 된다(굽기는 지도당 한 번뿐이므로 고칠 기회가 없다).
   */
  prebakeGround(renderer) {
    const map = this.store.state.map;
    if (!map || !map.grid || !renderer || !renderer.assets) return false;
    // 그림이 아직 안 실렸으면 그냥 둔다 — 첫 프레임이 알아서 굽는다.
    const probe = renderer.assets.get('tile_grass');
    if (!probe || !probe.ok) return false;
    this._groundLayer(renderer, map, CONFIG.TILE);
    return true;
  }

  _groundLayer(renderer, map, T) {
    const key = `${map.id}:${map.w}x${map.h}`;
    if (this._ground && this._ground.key === key) return this._ground;

    const canvas = document.createElement('canvas');
    canvas.width = map.w * T;
    canvas.height = map.h * T;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // 굽는 동안에는 카메라가 없다 — 판 좌표 그대로 찍는다.
    const bake = renderer.intoCanvas(ctx);
    const props = [];

    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const tile = map.tileset[map.grid[ty][tx]];
        if (!tile) continue;
        // 0.65 — **밑에 바닥을 깔고 그 위에 얹는다.**
        //
        //   예전에는 칸마다 그림 하나를 도장처럼 찍었다. 길·바위·나무 그림이
        //   32×32 를 꽉 채우고 있어서 칸 경계가 직선으로 드러났고, 길이 벽돌을
        //   깐 것처럼 보였다.
        //   이제 얹는 그림(over)은 가장자리가 들쭉날쭉하게 비어 있다. 밑에 바닥을
        //   먼저 깔면 그 사이로 바닥이 비쳐 경계가 녹고, 옆 칸의 길과도 저절로
        //   이어져 한 갈래 흙길로 보인다.
        if (tile.over) bake.drawSprite(groundAt(map, tx, ty), tx * T, ty * T, { anchor: 'topleft' });
        const tall = TALL[tile.sprite];
        if (tall) {
          // 그늘은 **바닥 그림**이다 — 여기 구워 둔다. 사람이 그 위를 밟는다.
          // (나무 자체는 뒤로 미룬다. 그래야 나무 뒤로 돌아갈 수 있다)
          bake.drawSprite(TREE_SHADE, tx * T + T / 2, ty * T + T, { anchor: 'bottom' });
          props.push({
            kind: 'prop',
            sprite: tall[Math.floor(hash2(tx + 11, ty + 5) * tall.length) % tall.length],
            px: tx * T + T / 2,
            // 발밑은 칸의 **아래 변**이다. 여기가 정렬 기준이 되므로,
            // 같은 줄에 선 사람과 정확히 같은 잣대로 견줘진다.
            py: ty * T + T,
          });
        } else if (tile.sprite === ROOF) {
          // 지붕은 **한 장이 두 줄을 통째로 덮는다** (0.70.1).
          //
          //   · 맨 아랫줄에서만 그림을 세운다(발밑이 거기다)
          //   · 그 위의 지붕 칸은 아무것도 안 그린다 — 이 그림이 덮는다
          //
          // ⚠ 윗줄만 크게 그리고 아랫줄은 바닥에 구워 두었더니, 사람이 집 뒤에
          //   섰을 때 **윗줄만 비치고 아랫줄은 그대로**여서 지붕이 두 쪽으로
          //   갈라져 보였다. 한 채는 한 장이어야 함께 비친다.
          if (isRoof(map, tx, ty + 1)) continue; // 아랫줄이 그린다
          const left = isRoof(map, tx - 1, ty);
          const right = isRoof(map, tx + 1, ty);
          props.push({
            kind: 'prop',
            sprite: ROOF_TOP[!left ? 'l' : !right ? 'r' : 'm'],
            px: tx * T + T / 2,
            py: ty * T + T,
            // 한 채로 묶는다 — 사람이 뒤에 서면 **집 전체**가 함께 비쳐야 한다.
            // 한 칸만 비치면 지붕에 네모난 구멍이 뚫린 것처럼 보인다.
            group: `roof:${ty}:${runStart(map, tx, ty)}`,
          });
        } else {
          bake.drawSprite(tileSprite(tile, tx, ty), tx * T, ty * T, { anchor: 'topleft' });
        }
        // 다져 놓은 바닥(흙길·광장 돌바닥)이 풀과 맞닿는 변에만 풀 술을 얹는다.
        // 안쪽에는 안 생기고, 길과 광장이 만나는 자리에도 안 생긴다.
        if (HARD_GROUND.has(tile.sprite)) this._pathFringe(bake, map, tx, ty, T);
        // 물·마그마가 땅과 맞닿는 변에만 가장자리를 얹는다 (0.67 물 · 0.70 마그마).
        if (EDGED[tile.sprite]) this._liquidFringe(bake, map, tx, ty, T, tile.sprite);
      }
    }

    // 배우 목록에 넣을 때 발밑 순서로 견주므로, 미리 세워 두면 매 프레임 안 세워도 된다.
    props.sort((a, b) => a.py - b.py);
    this._ground = { key, canvas, props };
    return this._ground;
  }

  render(renderer) {
    const state = this.store.state;
    const map = state.map;
    const player = state.player;
    const T = CONFIG.TILE;

    renderer.clear(map.bgColor || '#12241a');
    renderer.centerCamera(player.px, player.py - T / 2, map.w * T, map.h * T);

    const x0 = Math.max(0, Math.floor(renderer.camera.x / T));
    const y0 = Math.max(0, Math.floor(renderer.camera.y / T));
    const x1 = Math.min(map.w - 1, Math.ceil((renderer.camera.x + renderer.width) / T));
    // 화면 **아래로 두 줄 더** 훑는다 (0.67).
    //
    // 큰 나무는 잎이 제 칸보다 위로 자란다(72px = 두 칸 넘게). 그래서 밑동이
    // 화면 밖 바로 아래에 있는 나무라도 잎은 화면 안으로 들어온다.
    // 화면만큼만 훑으면 걸을 때마다 화면 아래쪽에서 나무가 **툭 나타난다.**
    const y1 = Math.min(map.h - 1, Math.ceil((renderer.camera.y + renderer.height) / T) + 2);

    // 바닥은 **한 장으로 미리 그려 둔 것**을 통째로 붙인다 (0.70).
    // 큰 나무·지붕 마루는 사람과 같은 줄에 세워야 하므로 그 목록만 받아 온다.
    const layer = this._groundLayer(renderer, map, T);
    renderer.drawLayer(layer.canvas);
    const tallProps = layer.props;

    /**
     * 이 큰 그림이 화면에 걸치나 (0.70.1).
     *
     * 발밑(px, py)만 보면 안 된다 — 큰 나무는 발밑에서 **위로 72px**,
     * 집 지붕은 **위로 88px** 자란다. 발밑이 화면 위쪽 밖에 있어도 잎과 지붕은
     * 화면 안으로 들어온다. 그래서 넉넉히 잡는다.
     */
    const view = {
      x0: renderer.camera.x - T * 2,
      x1: renderer.camera.x + renderer.width + T * 2,
      y0: renderer.camera.y - T,
      y1: renderer.camera.y + renderer.height + T * 4,
    };
    const inView = (q) =>
      q.px >= view.x0 && q.px <= view.x1 && q.py >= view.y0 && q.py <= view.y1;

    // 다른 접속자들도 같은 목록에 넣어 앞뒤 순서를 함께 계산한다.
    const peers = this.net ? this.net.peersOnMap(map.id) : [];
    this._drawReturnGate(renderer, state, T);

    // 어두운 맵에서는 횃불이 닿는 곳 밖의 것을 아예 그리지 않는다.
    // 어둠막만 덮으면 몬스터가 검은 실루엣으로 비쳐서 "안 보인다"가 무너진다.
    // 매직 투구처럼 시야를 넓혀 주는 장비가 있으면 그만큼 더 멀리 본다.
    const sightTiles = this._sightTiles(state, map);
    const sightPx = map.dark ? sightTiles * T : Infinity;
    const inSight = (a) =>
      sightPx === Infinity ||
      Math.hypot(a.px - player.px, a.py - player.py) <= sightPx + T * 0.5;

    const actors = [
      player,
      ...state.npcs.filter(inSight),
      ...state.monsters.filter((m) => m.alive && inSight(m)),
      // 다른 접속자는 **그 사람의 직업** 얼굴로 그린다.
      // 옛 판(직업을 안 보내던 때)에서 온 사람만 내 얼굴을 빌려 쓴다.
      ...peers
        .map((p) => ({ ...p, kind: 'peer', sprite: classSprite(state, p.cls) || player.sprite }))
        .filter(inSight),
      // 큰 나무·집도 같은 목록에 넣는다 (0.67). 규칙이 하나여야 앞뒤가 안 어긋난다 —
      // 나무만 따로 그리면 "내 앞의 나무" 와 "남 앞의 나무" 가 서로 다르게 나온다.
      //
      // ⚠ **보이는 것만 추린다** (0.70.1). 0.70 까지는 지도의 나무를 통째로
      //   그렸다(캔버스가 알아서 잘라 줄 뿐). 들판 하나에 200그루가 넘으므로
      //   그리는 값의 대부분이 화면 밖으로 나갔다. 판이 커질수록 더 나빠진다.
      ...tallProps.filter((q) => inView(q)),
    ];
    actors.sort((a, b) => a.py - b.py);

    // 묶인 것(집) 가운데 사람을 가리는 채가 있으면, 그 채는 통째로 비친다.
    const fadedGroups = new Set();
    for (const q of actors) {
      if (q.kind !== 'prop' || !q.group) continue;
      if (fadedGroups.has(q.group)) continue;
      if (this._hidesPlayer(renderer, q, player)) fadedGroups.add(q.group);
    }

    const myLook = computeLook(state);

    for (const actor of actors) {
      // 큰 나무 — 그림 하나를 발밑 기준으로 세우고 끝. (0.67)
      //
      // 사람이 잎에 겹치는 동안에는 반쯤 비친다. 통째로 가리면 "가려졌다"가
      // 아니라 "사라졌다"가 되어, 어디로 걷고 있는지 놓친다.
      if (actor.kind === 'prop') {
        // 한 채로 묶인 것(집)은 **함께** 비친다 (0.70.1).
        // 한 칸만 비치면 지붕에 네모난 구멍이 뚫린 것처럼 보인다.
        const hides = actor.group
          ? (fadedGroups.has(actor.group))
          : this._hidesPlayer(renderer, actor, player);
        const fade = actor.group ? HOUSE_FADE : FADE_ALPHA;
        renderer.drawSprite(actor.sprite, actor.px, actor.py, {
          anchor: 'bottom',
          alpha: hides ? fade : 1,
        });
        continue;
      }
      // ⚠ 0.61 — 걷는 흔들림. **다른 접속자에게는 bobT 가 없다.**
      //
      //   bobT 는 내 발이 몇 ms 째 움직였나를 재는 값이고, 그물로는 안 보낸다
      //   (보낼 값이 아니다 — 보여 주는 쪽에서 만들면 된다).
      //   그런데 여기서 그걸 그냥 나눠 썼다: undefined / 90 → NaN → sin(NaN) → NaN.
      //   그 NaN 이 아래 drawSprite 의 y 로 들어가고, 캔버스는 좌표가 NaN 이면
      //   **아무 말 없이 아무것도 안 그린다.**
      //
      //   그래서 남이 걷는 동안에는 통째로 안 보이고, 멈추면(moving=false → bob=0)
      //   다시 나타났다 — "계속 깜박인다" 의 정체다. 재 보니 걷는 사람은
      //   236프레임 가운데 191프레임이 NaN 이었다(81%).
      //
      //   보여 주는 값이므로 **받는 쪽 시계**로 만든다.
      const bobT = Number.isFinite(actor.bobT) ? actor.bobT : this.time;
      const bob = actor.moving ? Math.sin((bobT / 90) * Math.PI) * 2 : 0;
      const idle = actor.kind === 'npc' ? Math.sin((this.time + actor.bobT) / 520) * 1.2 : 0;
      const shadowW = actor.isBoss ? T * 1.05 : T * 0.72;

      // 플레이어와 다른 접속자는 장비가 반영된 스프라이트를 쓴다.
      // 다만 **운영자 모습(rawSprite)** 에는 장비를 얹지 않는다 —
      // 흰 갑옷 위에 갑옷 색이 덧칠되면 그림이 뭉개진다.
      let sprite = actor.sprite;
      if (this.appearance && actor.kind === 'player' && !actor.rawSprite) {
        sprite = this.appearance.get(actor.sprite, myLook);
      } else if (this.appearance && actor.kind === 'peer') {
        sprite = this.appearance.get(actor.sprite, actor.look);
      }

      // 운영자의 투명 상태 — 남에게는 아예 안 보내고(NetSystem),
      // 제 화면에는 **희미하게** 남긴다. 완전히 지우면 자기가 어디 있는지 모른다.
      let alpha = actor.kind === 'peer' ? 0.95 : 1;
      if (actor.kind === 'player' && state.player.hidden) alpha = 0.28;

      // 0.70.3 — **사람·몬스터 뒤로도 걸어갈 수 있다.**
      //
      // 그림이 두 칸으로 커지고 나니, 앞에 선 놈이 나를 통째로 덮는 일이 생겼다.
      // 나무·집에 쓰던 규칙을 그대로 쓴다: 내가 그 뒤에 있고 그 그림이 나를
      // 가리는 동안만 반쯤 비친다. 통째로 가리면 "가려졌다"가 아니라
      // "사라졌다"가 되어, 어디로 걷고 있는지 놓친다.
      // ⚠ 내 캐릭터에는 걸지 않는다 — 나를 가리는 것은 내가 아니다.
      if (actor.kind === 'npc' || actor.kind === 'monster') {
        if (this._hidesPlayer(renderer, { px: actor.px, py: actor.py, sprite }, player)) {
          alpha = ACTOR_FADE;
        }
      }

      if (!(actor.kind === 'player' && state.player.hidden)) {
        renderer.drawShadow(actor.px, actor.py - 3, shadowW);
      }
      renderer.drawSprite(sprite, actor.px, actor.py + 4 - bob + idle, {
        anchor: 'bottom',
        scale: actor.spriteScale || 1,
        alpha,
        flipX: actor.dir === 'left' && actor.kind !== 'npc',
      });

      const settings = state.settings || {};
      // 0.66 — 화면에 나오는 사람 이름은 **언제나 캐릭터 이름**이다.
      // 랭킹·공지·머리 위가 모두 같은 글자여야 서로를 부를 수 있다.
      if (actor.kind === 'peer' && settings.showNames !== false) {
        this._drawNameTag(renderer, actor);
      }
      if (actor.kind === 'player' && settings.showOwnName) {
        this._drawNameTag(renderer, {
          ...actor,
          name: state.player.name, // 내 머리 위도 캐릭터 이름 (0.66)
          account: this.accountId, // 이름이 없는 옛 저장본만 여기로 떨어진다
          level: state.player.level,
        });
      }
      // 이모티콘 말풍선 — 이름표보다 위에 (0.62).
      // 내 것과 남의 것을 같은 함수로 그린다. 자리가 다르면 "누가 말했나" 가 흐려진다.
      const emote = actor.kind === 'peer'
        ? actor.emote
        : (actor.kind === 'player' ? state.player.emote : null);
      if (emote && emote.icon) this._drawEmote(renderer, actor, emote.icon);

      if (actor.isBoss) this._drawBossMark(renderer, actor);
      if (actor.kind === 'monster') {
        this._drawMonsterTag(renderer, state, actor);
        // 발각 — 알아챈 놈 머리 위에 빨간 느낌표. 어두운 곳에서 이게 유일한 경고다.
        if (actor.alerted) this._drawAlertMark(renderer, actor);
      }
    }

    // 말을 걸 수 있는 NPC 위에 표시
    for (const npc of state.npcs) {
      if (!this.inRange(npc)) continue;
      if (!inSight(npc)) continue;
      const pulse = 1 + Math.sin(this.time / 180) * 0.12;
      renderer.drawText('❕', npc.px, npc.py - 72, {
        world: true,
        align: 'center',
        font: `${Math.round(20 * pulse)}px system-ui, sans-serif`,
        color: '#ffe27a',
      });
    }

    // 어둠은 맨 마지막에 덮는다 — 땅도 사람도 다 그린 뒤라야 빛이 자연스럽다.
    // 횃불은 조금씩 흔들린다(가만히 있어도 화면이 죽어 있지 않게).
    if (map.dark) {
      const flicker = 1 + Math.sin(this.time / 240) * 0.045 + Math.sin(this.time / 97) * 0.02;
      renderer.drawDarkness(player.px, player.py - T / 2, sightTiles * T * flicker);
      // 벽에 걸린 횃불은 **어둠 위에** 다시 그린다 (0.68).
      //
      //   여기까지는 횃불이 닿는 데까지만 보였다. 그 밖이 통째로 안 보이니
      //   길을 찾을 실마리가 하나도 없어서, 벽을 더듬는 것 말고는 방법이 없었다.
      //   멀리 보이는 불빛 하나가 "저쪽에 방이 있다" 를 말해 준다.
      //
      //   ⚠ 어둠막을 **덮은 뒤에** 그린다. 어둠 밑에 그리면 아무리 밝게 그려도
      //     막에 가려 안 보인다(처음에 그렇게 해 놓고 "왜 안 나오지" 했다).
      //   ⚠ 멀수록 흐리게 — 다 똑같이 밝으면 지도 전체가 한눈에 보여서
      //     어두운 곳을 더듬어 나아가는 맛이 사라진다.
      this._drawFarTorches(renderer, map, x0, y0, x1, y1, T, player, sightPx);
    }

    this._drawBanner(renderer, map);
  }

  /**
   * 이 맵에서 실제로 보이는 거리(칸).
   * 표에 적힌 값에 장비가 넓혀 주는 몫(mods.sightBonus)을 더한다.
   */
  /**
   * 어둠 밖의 횃불 (0.68).
   *
   * 시야 안의 것은 이미 바닥 층에서 제대로 그려졌다. 여기서 다시 그리는 것은
   * **시야 밖**의 것뿐이고, 거리에 따라 흐려진다.
   */
  _drawFarTorches(renderer, map, x0, y0, x1, y1, T, player, sightPx) {
    const far = sightPx * 5; // 이보다 먼 불은 아예 안 보인다
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = map.tileset[map.grid[ty][tx]];
        if (!tile || !tile.lit) continue;
        const cx = tx * T + T / 2;
        const cy = ty * T + T / 2;
        const d = Math.hypot(cx - player.px, cy - player.py);
        if (d <= sightPx) continue; // 시야 안 — 이미 그려졌다
        if (d >= far) continue;
        // 시야 끝에서 1, 멀어질수록 0 으로.
        const t = 1 - (d - sightPx) / (far - sightPx);
        renderer.drawSprite(tile.sprite, tx * T, ty * T, {
          anchor: 'topleft',
          alpha: Math.max(0.12, Math.min(0.85, t * 0.85)),
        });
      }
    }
  }

  _sightTiles(state, map) {
    const base = map.sight || 3.5;
    const bonus = (computePlayerStats(state).mods || {}).sightBonus || 0;
    return Math.max(1.5, base + bonus);
  }

  /**
   * 발각 표시. 처음 알아챈 0.6초 동안은 크게 튀어 오르고, 그 뒤로는 조용히 떠 있다.
   * 어두운 지하감옥에서는 이 느낌표가 "지금 쫓기고 있다"를 알리는 유일한 신호다.
   */
  _drawAlertMark(renderer, actor) {
    actor.alertedAt = (actor.alertedAt || 0) + 16;
    const pop = actor.alertedAt < 600 ? 1 + (1 - actor.alertedAt / 600) * 0.9 : 1;
    const float = Math.sin(this.time / 200) * 2;
    renderer.drawText('!', actor.px, actor.py - (actor.isBoss ? 82 : 66) + float, {
      world: true,
      align: 'center',
      font: `800 ${Math.round(20 * pop)}px system-ui, sans-serif`,
      color: '#ff5b5b',
      stroke: 'rgba(4,7,16,0.95)',
      strokeWidth: 4,
    });
  }

  /**
   * 몬스터 머리 위 이름표.
   * 색이 곧 경고다 — 내 전투력과 견주어 초록(쉬움) → 흰색(비슷) → 주황(버거움) → 빨강(위험).
   * 어느 놈을 건드리면 안 되는지 붙기 전에 알 수 있어야 한다.
   */
  _drawMonsterTag(renderer, state, actor) {
    const info = this.monsterPower ? this.monsterPower(actor) : null;
    if (!info) return;

    const color = MONSTER_TAG_COLOR[info.tier] || '#e8ecf6';
    const y = actor.py - (actor.isBoss ? 62 : 46);
    const text = `${actor.name} Lv.${info.level}`;

    renderer.drawText(text, actor.px, y, {
      world: true,
      align: 'center',
      font: '600 11px system-ui, sans-serif',
      color,
      stroke: 'rgba(4,7,16,0.9)',
      strokeWidth: 3,
    });
  }

  /**
   * 귀환 게이트. 마을로 돌아갈 때 서 있던 자리와 마을 광장에 한 쌍이 생긴다.
   * 타일을 바꾸지 않고 그 자리에 소용돌이만 그린다.
   */
  _drawReturnGate(renderer, state, T) {
    const gate = state.returnGate;
    if (!gate) return;

    let tx = null;
    let ty = null;
    if (state.map.id === gate.mapId) {
      tx = gate.tx;
      ty = gate.ty;
    } else if (state.map.id === gate.townMapId) {
      tx = gate.townX;
      ty = gate.townY;
    }
    if (tx == null) return;

    const cx = tx * T + T / 2 - renderer.camera.x;
    const cy = ty * T + T * 0.72 - renderer.camera.y;
    const { ctx } = renderer;
    const spin = this.time / 420;

    ctx.save();
    ctx.translate(cx, cy);

    // 바닥 마법진
    ctx.globalAlpha = 0.9;
    const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, T * 0.75);
    grad.addColorStop(0, 'rgba(150,190,255,0.75)');
    grad.addColorStop(0.55, 'rgba(110,140,255,0.35)');
    grad.addColorStop(1, 'rgba(110,140,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, T * 0.72, T * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();

    // 회전하는 두 개의 고리
    ctx.strokeStyle = 'rgba(190,220,255,0.85)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.rotate(spin * (i ? -1 : 1));
      ctx.beginPath();
      ctx.ellipse(0, 0, T * (0.5 - i * 0.14), T * (0.24 - i * 0.07), 0, 0.4, Math.PI * 1.7);
      ctx.stroke();
      ctx.restore();
    }

    // 위로 솟는 빛기둥
    ctx.globalAlpha = 0.32 + Math.sin(this.time / 260) * 0.1;
    const beam = ctx.createLinearGradient(0, 0, 0, -T * 1.5);
    beam.addColorStop(0, 'rgba(150,190,255,0.6)');
    beam.addColorStop(1, 'rgba(150,190,255,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(-T * 0.3, -T * 1.5, T * 0.6, T * 1.5);
    ctx.restore();

    const label = state.map.id === gate.mapId ? '↩ 마을로' : `↪ ${gate.mapName}`;
    renderer.drawText(label, cx, cy - T * 1.6, {
      align: 'center',
      baseline: 'middle',
      font: '700 11px system-ui, sans-serif',
      color: '#cfe4ff',
    });
  }

  /**
   * 머리 위 말풍선 하나 (0.62).
   *
   * 이름표(−74)보다 더 위(−104)에 둔다. 겹치면 둘 다 못 읽는다.
   * 꼬리를 아래로 내려 **누가 말했는지**를 가리킨다 — 여럿이 붙어 서 있으면
   * 말풍선만으로는 누구 것인지 알 수 없다.
   */
  _drawEmote(renderer, actor, icon) {
    const { ctx } = renderer;
    const sx = actor.px - renderer.camera.x;
    const sy = actor.py - renderer.camera.y - 104;
    const w = 34;
    const h = 30;

    ctx.save();
    ctx.fillStyle = 'rgba(248,250,255,0.96)';
    ctx.strokeStyle = 'rgba(20,26,48,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, sx - w / 2, sy - h / 2, w, h, 10);
    ctx.fill();
    ctx.stroke();

    // 꼬리 — 말한 사람 쪽으로.
    ctx.beginPath();
    ctx.moveTo(sx - 5, sy + h / 2 - 1);
    ctx.lineTo(sx, sy + h / 2 + 7);
    ctx.lineTo(sx + 5, sy + h / 2 - 1);
    ctx.closePath();
    ctx.fillStyle = 'rgba(248,250,255,0.96)';
    ctx.fill();

    ctx.font = '18px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#101828';
    ctx.fillText(String(icon), sx, sy + 1);
    ctx.restore();
  }

  _drawNameTag(renderer, actor) {
    const label = `${nameTagText(actor)} Lv.${actor.level || 1}`;
    const color = nameColor(actor.level || 1);
    const { ctx } = renderer;
    // 화면 좌표로 한 번에 계산한다(카메라 보정을 두 번 하지 않도록).
    const sx = actor.px - renderer.camera.x;
    const sy = actor.py - renderer.camera.y - 74;

    ctx.save();
    ctx.font = '700 11px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 14;
    ctx.fillStyle = 'rgba(8,12,24,0.78)';
    ctx.strokeStyle = `rgba(${color.join(',')},0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, sx - w / 2, sy - 9, w, 18, 9);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `rgb(${color.join(',')})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 3;
    ctx.fillText(label, sx, sy + 1);
    ctx.restore();
  }

  _drawBossMark(renderer, actor) {
    const { ctx } = renderer;
    const x = actor.px - renderer.camera.x;
    const y = actor.py - renderer.camera.y;
    ctx.save();
    ctx.globalAlpha = 0.45 + Math.sin(this.time / 220) * 0.2;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 26, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    renderer.drawText('BOSS', actor.px, actor.py - 64, {
      world: true,
      align: 'center',
      font: '800 11px system-ui, sans-serif',
      color: '#ff8a8a',
    });
  }

  _drawBanner(renderer, map) {
    if (!this.banner) return;
    const alpha = Math.min(1, this.banner.t / 500);
    const { ctx } = renderer;
    const w = 300;
    const h = 44;
    const x = (renderer.width - w) / 2;
    const y = 26;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(8,12,24,0.82)';
    ctx.strokeStyle = 'rgba(148,168,214,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRectPath(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    renderer.drawText(this.banner.text, renderer.width / 2, y + h / 2, {
      align: 'center',
      baseline: 'middle',
      font: '700 15px system-ui, sans-serif',
      color: '#eef2ff',
    });
  }
}

/** 직업 id → 필드 그림 이름. 모르는 직업이면 null(부르는 쪽이 대신 쓸 것을 고른다). */
function classSprite(state, classId) {
  if (!classId) return null;
  const cls = ((state.db && state.db.classes && state.db.classes.list) || {})[classId];
  return (cls && cls.sprite) || null;
}


/**
 * 자리마다 다른 풀을 고른다 (0.65).
 *
 * 왜 필요한가: 풀이 한 장뿐이면 40×32 칸이 같은 그림으로 덮여 **격자무늬**가
 * 눈에 그대로 보인다. 자연에는 그런 무늬가 없다. 네 장을 자리로 섞으면
 * 반복 주기가 눈에 안 잡힌다.
 *
 * 무작위가 아니라 **자리에서 계산**한다 — 그래야 화면을 다시 그려도, 나갔다
 * 들어와도 같은 칸에 같은 풀이 깔린다. 걸을 때마다 땅이 바뀌면 어지럽다.
 */
const GRASS_VARIANTS = ['tile_grass', 'tile_grass2', 'tile_grass3', 'tile_grass4'];

/** 이 지붕 줄이 어디서 시작하나 — 한 채를 묶는 이름표로 쓴다. */
function runStart(map, x, y) {
  let i = x;
  while (isRoof(map, i - 1, y)) i--;
  return i;
}

/** 이 칸이 지붕인가 (판 밖은 지붕이 아니다). */
function isRoof(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
  const t = map.tileset[map.grid[y][x]];
  return !!t && t.sprite === ROOF;
}

function hash2(x, y) {
  // 자리 두 개를 섞어 0~1 을 뽑는 흔한 방법. 이웃한 칸이 붙어 나오지 않게
  // 서로 다른 소수를 곱해 흩는다.
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function grassAt(x, y) {
  return GRASS_VARIANTS[Math.floor(hash2(x, y) * GRASS_VARIANTS.length) % GRASS_VARIANTS.length];
}

/**
 * 얹는 그림(over) 밑에 깔 **그 땅의 바닥** (0.70).
 *
 * ⚠ 0.65~0.69 에는 **언제나 풀**을 깔았다. 그래서 화산 들판(보스 땅)에서
 *   잔돌·덤불·그루터기 밑마다 **초록 잔디 네모**가 깔렸다 — 잿더미 위에
 *   풀밭 조각이 백 개 넘게 흩어진 꼴이었다. 그 땅에 풀이 있을 리가 없다.
 *   이제 지도가 제 바닥을 말한다(maps.json 의 ground).
 */
const GROUNDS = {
  grass: GRASS_VARIANTS,
  ash: ['tile_ash'],
  waste: ['tile_waste', 'tile_waste2', 'tile_waste3'],
};

function groundAt(map, x, y) {
  const list = GROUNDS[map.ground] || GRASS_VARIANTS;
  return list[Math.floor(hash2(x, y) * list.length) % list.length];
}

/**
 * 같은 칸이라도 자리마다 다른 장을 고른다.
 *
 * 길 — 곧게 뻗을수록 반복이 잘 보인다. 두 장을 섞는다.
 * 나무 — 숲은 같은 나무를 줄 세운 것처럼 보이면 안 된다. 세 장을 섞는다.
 */
/** [옆칸 방향, 그 변에 얹을 술] — n/e/s/w */
const FRINGE = [
  [0, -1, 'tile_edge_grass_n'],
  [1, 0, 'tile_edge_grass_e'],
  [0, 1, 'tile_edge_grass_s'],
  [-1, 0, 'tile_edge_grass_w'],
];

/**
 * 가장자리를 두르는 액체 (0.67 물 · 0.70 마그마).
 *
 * 물과 땅이 직선으로 맞닿으면 연못이 아니라 파란 사각형이 된다.
 * 마그마도 똑같다 — 검은 잿더미에 주황 네모가 박혀 있으면 용암이 아니라
 * 카펫으로 보인다. 그래서 **같은 방법**으로 두른다.
 *   물   → 젖은 모래와 거품
 *   마그마 → 식어 굳은 검은 껍질과 붉게 달아오른 테두리
 */
const EDGED = {
  tile_water: 'shore',
  tile_magma: 'crust',
};

/** [옆칸 방향, 그 변에 얹을 가장자리] — 길가 풀과 같은 방법 (0.67) */
const SHORE = [
  [0, -1, 'n'],
  [1, 0, 'e'],
  [0, 1, 's'],
  [-1, 0, 'w'],
];

/**
 * 대각선으로만 땅이 닿은 귀퉁이 (0.68).
 *
 * [옆칸 x, 옆칸 y, 대각선 x, 대각선 y, 얹을 그림]
 * **두 변이 다 물일 때만** 얹는다. 한 변이라도 땅이면 그쪽 변 그림이
 * 이미 그 귀퉁이를 덮으므로, 겹쳐 얹으면 모래가 두 겹으로 짙어진다.
 */
const SHORE_CORNER = [
  [-1, 0, 0, -1, -1, -1, 'dnw'],
  [1, 0, 0, -1, 1, -1, 'dne'],
  [1, 0, 0, 1, 1, 1, 'dse'],
  [-1, 0, 0, 1, -1, 1, 'dsw'],
];

const VARIANTS = {
  tile_path: ['tile_path', 'tile_path2'],
  // 나무는 이제 바닥에 안 찍는다(아래 TALL 참고). 옛 저장본·다른 씬을 위해 남긴다.
  tile_tree: ['tile_tree', 'tile_tree2', 'tile_tree3'],
  tile_water: ['tile_water', 'tile_water2'],
  tile_brick: ['tile_brick', 'tile_brick2'],
  tile_castle_floor: ['tile_castle_floor', 'tile_castle_floor2'],
  tile_dungeon_floor: ['tile_dungeon_floor', 'tile_dungeon_floor2'],
  tile_waste: ['tile_waste', 'tile_waste2', 'tile_waste3'],
};

/**
 * 칸보다 큰 그림 — 사람과 같은 줄에 세운다 (0.67).
 *
 * 나무를 32×32 안에 가두면 아무리 잘 그려도 덤불로 보인다. 그래서 큰 나무
 * 그림(56×72)을 **바닥이 아니라 배우 목록**에 넣어 발밑(py) 순서로 정렬한다.
 * 그러면 나무 아래로 걸어 들어가면 사람이 앞에 서고, 나무 **뒤**로 돌아가면
 * 잎에 가린다 — 깊이가 생긴다.
 *
 * ⚠ 완전히 가리지는 않는다. 잎에 통째로 먹히면 내가 어디 있는지 놓친다.
 *   겹치는 동안에는 잎을 반쯤 비친다(FADE_ALPHA).
 */
/**
 * 사람이 다져 놓은 바닥 (0.67).
 *
 * 이 바닥끼리 맞닿은 변에는 풀 술을 얹지 않는다. 흙길이 광장으로 이어질 때
 * 그 사이에 풀이 돋으면, 없던 경계선이 생겨 두 바닥이 따로 놀아 보인다.
 */
const HARD_GROUND = new Set(['tile_path', 'tile_brick']);

const TALL = {
  tile_tree: ['tile_tree_big', 'tile_tree_big2', 'tile_tree_big3'],
};
const FADE_ALPHA = 0.45;

/**
 * 집이 비치는 정도 (0.70.1).
 *
 * 나무보다 **덜** 비친다. 나무 잎은 성기지만 지붕은 큰 덩어리라, 같은 값으로
 * 비추면 붉은 기와가 흙빛 판때기로 뭉개진다. 사람이 보일 만큼만 연다.
 */
const HOUSE_FADE = 0.62;

// 사람·몬스터가 나를 가릴 때의 밝기 (0.70.3).
// 나무(0.45)보다 진하게 둔다 — 몬스터는 **싸울 상대**라, 너무 흐려지면
// 어디에 있는지가 흐려진다. 나는 비쳐 보이되 그놈도 또렷해야 한다.
const ACTOR_FADE = 0.66;

/** 큰 나무 밑에 먼저 까는 그늘 (0.68). 사람은 이 위를 밟고 지나간다. */
const TREE_SHADE = 'tile_tree_shade';

/**
 * 지붕 마루 (0.68).
 *
 * 지붕의 **맨 윗줄만** 이 그림으로 바꿔 칸 위로 내민다. 그러면 지붕이 벽 위에
 * 얹힌 것으로 읽히고, 집 위쪽에 선 사람의 발이 마루 뒤로 살짝 들어간다.
 * (윗줄인지 아닌지는 그릴 때 이웃을 보고 정한다 — 지도에 따로 안 적는다.
 *  적어 두면 집을 옮길 때마다 두 군데를 고쳐야 하고, 반드시 한쪽을 잊는다)
 */
const ROOF = 'tile_house_roof';

/**
 * 지붕 윗줄 조각 — 왼쪽 끝 · 가운데 · 오른쪽 끝 (0.70.1).
 *
 * 6칸짜리 집을 같은 그림으로 도배하면 지붕이 아니라 **띠**로 보인다.
 * 양 끝에 처마가 있어야 한 채로 읽힌다.
 */
const ROOF_TOP = {
  l: 'tile_house_roof_top_l',
  m: 'tile_house_roof_top',
  r: 'tile_house_roof_top_r',
};

function tileSprite(tile, x, y) {
  const list = VARIANTS[tile.sprite];
  if (!list) return tile.sprite;
  return list[Math.floor(hash2(x + 7, y + 3) * list.length) % list.length];
}
