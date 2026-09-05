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

// 아이디 색: 1레벨은 흰색, 이 레벨에서 완전한 파란색이 된다.
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
 * 이름표에 쓸 글자.
 *   mode 'id'   → 계정 아이디 (기본). 접속 구분용 꼬리표(@xxxxx)는 떼고 보여 준다.
 *   mode 'name' → 캐릭터 이름
 * 아이디를 모르는 상대(옛 버전 접속자 등)면 캐릭터 이름으로 대신한다.
 */
export function nameTagText(actor, mode = 'id') {
  const account = String(actor.account || '').split('@')[0];
  if (mode === 'name') return actor.name || account || '모험가';
  return account || actor.name || '모험가';
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
    this.accountId = null; // main.js 가 로그인 후 넣어 준다(머리 위 아이디 표시용)
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
      const w = 48;
      const h = 64;
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
    const y1 = Math.min(map.h - 1, Math.ceil((renderer.camera.y + renderer.height) / T));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = map.tileset[map.grid[ty][tx]];
        if (!tile) continue;
        renderer.drawSprite(tile.sprite, tx * T, ty * T, { anchor: 'topleft' });
      }
    }

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
    ];
    actors.sort((a, b) => a.py - b.py);

    const myLook = computeLook(state);

    for (const actor of actors) {
      const bob = actor.moving ? Math.sin((actor.bobT / 90) * Math.PI) * 2 : 0;
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
      const tagMode = settings.nameTagShows || 'id';
      if (actor.kind === 'peer' && settings.showNames !== false) {
        this._drawNameTag(renderer, actor, tagMode);
      }
      if (actor.kind === 'player' && settings.showOwnName) {
        this._drawNameTag(
          renderer,
          { ...actor, account: this.accountId, level: state.player.level },
          tagMode
        );
      }
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
    }

    this._drawBanner(renderer, map);
  }

  /**
   * 이 맵에서 실제로 보이는 거리(칸).
   * 표에 적힌 값에 장비가 넓혀 주는 몫(mods.sightBonus)을 더한다.
   */
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
   * 머리 위 이름표. 기본은 "계정 아이디"이고, 설정에서 캐릭터 이름으로 바꿀 수 있다.
   * 레벨이 오를수록 흰색 → 파란색으로 짙어지고 NAME_FULL_BLUE_LEVEL 에서 완전히 파래진다.
   */
  _drawNameTag(renderer, actor, mode = 'id') {
    const label = `${nameTagText(actor, mode)} Lv.${actor.level || 1}`;
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
