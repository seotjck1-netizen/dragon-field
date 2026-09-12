// 책임: CombatSystem 이 만든 "타임라인"을 시간축에 맞춰 재생하는 연출 씬.
//        전투 결과를 계산하지 않는다. 이미 정해진 결과를 보여주기만 한다.
//        단, 전투 도중 물약을 쓰면 남은 타임라인을 통째로 갈아끼울 수 있게 창구(interrupt)를 연다.
// 금지: 데미지/승패 계산 → systems/CombatSystem.js 담당.
// 금지: HP바·데미지 숫자 같은 HTML UI → ui/BattleView.js 담당(이벤트로 알려준다).

import { CONFIG } from '../config.js';
import { KIND_FX, hitWeight } from '../core/hitLook.js';

const FAST_FORWARD_RATE = 4;

/** 맞은 자리에 터지는 그림이 살아 있는 시간(ms). 짧아야 다음 타격과 안 겹친다. */
const HIT_FX_LIFE = 300;

/**
 * 한 사람(또는 한 마리)의 연출 상태.
 * - shake  맞아서 떨린다
 * - lunge  때리려고 내지른다 (이 값이 살아 있는 동안 공격 그림으로 바뀐다)
 * - flash  하얗게 달아오른다 (치명타·쓰러짐)
 * - glow   초록 고리 (회복·흡혈)
 * - hit/kind/crit/weight  맞은 자리에 터지는 그림 (0.43) 과 그 한 대의 무게 (0.44)
 */
function newFx() {
  return {
    shake: 0, lunge: 0, flash: 0, glow: 0, hit: 0, kind: 'impact', crit: false, weight: 0,
    // 0.54 — 액티브한 동작들
    swing: 0,   // 무기를 휘두른 자국(때리는 쪽에 그린다)
    dodge: 0,   // 옆으로 미끄러지며 잔상을 남긴다(피한 쪽)
    revive: 0,  // 1 HP 로 버텼다 — 금빛 고리가 퍼진다(용사)
    aura: 0,    // 보호막 무적 — 오로라가 감싼다(마법사)
    chargeTo: null, // 근접 공격이면 이 상대 쪽으로 달려나간다(index, -1 = 사람)
    chargePart: 1,  // 그 거리의 몇 몫만 갈 것인가(1 = 중간까지, 0.3 = 살짝만)
  };
}

/** 날아가는 것이 목표에 닿기까지(ms). 이 시간만큼 맞는 연출을 미룬다. */
const FLIGHT_MS = 170;
/** 휘두른 자국이 남아 있는 시간(ms). */
const SWING_MS = 260;

/** 잔상 — 이만큼보다 멀리 움직일 때만 남긴다(활·마법의 26px 에는 안 남는다). */
const TRAIL_MIN_PX = 40;
/** 몇 장을 남기나. 많을수록 부드럽지만 화면이 지저분해진다. */
const TRAIL_COUNT = 3;
/** 가장 진한 잔상의 투명도. */
const TRAIL_ALPHA = 0.3;

export class BattleScene {
  /**
   * @param {object} o
   * @param {() => boolean} o.isFastForward  Shift 를 누르고 있는가
   * @param {() => object}  o.getSettings    설정값(전투 속도·화면 흔들림 등)
   * @param {(turn:object) => string} o.hitKind  이 한 대는 무엇으로 때린 것인가
   *        (core/hitLook.js 의 잣대. 소리도 글씨도 같은 것을 쓴다)
   */
  constructor({
    bus,
    isFastForward = () => false,
    getSettings = () => ({}),
    hitKind = () => 'impact',
  }) {
    this.bus = bus;
    this.isFastForward = isFastForward;
    this.getSettings = getSettings;
    this.hitKind = hitKind;
    this._fxQueue = []; // 이번 프레임에 사람 위로 덧그릴 이펙트(그리는 중에 채운다)
    // 0.54 — 날아가는 것들과, 그것이 닿은 뒤에 할 일들.
    //
    // 왜 '나중에' 가 필요한가: 예전에는 때리는 순간 맞는 쪽이 곧바로 흔들렸다.
    // 화살이나 마법탄이 날아가는 그림을 넣으려면 **닿을 때** 흔들려야 한다.
    // 그래서 맞는 연출을 FLIGHT_MS 만큼 미룬다. 시계(this.clock)로 재므로
    // 배속을 올리면 날아가는 것도 함께 빨라진다.
    this._shots = [];
    this._later = [];
    this.payload = null;
    this.clock = 0;
    this.cursor = 0;
    this.finished = false;
    this.hp = { player: 0, monster: 0 };
    this.monsterHp = []; // 여러 마리일 때 각자의 HP
    this.fx = { player: newFx(), monster: newFx() };
    this.monsterFx = []; // 마리별 연출 상태
    this.fade = 0;
  }

  /** dt 뒤에 할 일을 적어 둔다(날아가는 것이 닿은 뒤의 연출). */
  _after(ms, run) {
    if (ms <= 0) { run(); return; }
    this._later.push({ at: this.clock + ms, run });
  }

  /** 미뤄 둔 일을 전부 지금 해 버린다(스킵). */
  _flushLater() {
    for (const job of this._later) job.run();
    this._later.length = 0;
    this._shots.length = 0;
  }

  /** @param {{result:object, player:object, monsters:object[]}} payload */
  enter(payload) {
    this.payload = payload;
    this.clock = 0;
    this.cursor = 0;
    this.finished = false;
    this.fade = 0;

    this._shots.length = 0;
    this._later.length = 0;

    const list = monsterList(payload);
    this.monsterHp = list.map((m) => m.hp);
    this.monsterFx = list.map(() => (newFx()));
    this.hp = { player: payload.player.hp, monster: this.monsterHp[0] || 0 };
    this.fx.player = newFx();
    this.fx.monster = this.monsterFx[0] || newFx();
    this.bus.emit('battle:start', payload);
  }

  exit() {
    this.payload = null;
  }

  onAction(action) {
    if (action === 'confirm' || action === 'cancel') this.skipToEnd();
  }

  /** 지금까지 재생된 시점의 HP. 전투 중 회복량을 계산할 때 오케스트레이터가 읽는다. */
  liveState() {
    return {
      hp: { ...this.hp },
      monsterHp: [...this.monsterHp],
      clock: this.clock,
      active: !!this.payload && !this.finished,
    };
  }

  /**
   * 전투 도중 개입한다(물약 등). 이미 재생된 부분은 그대로 두고,
   * 회복 연출을 하나 끼운 뒤 남은 전투를 새 타임라인으로 교체한다.
   * @param {{healAmount:number, playerHp:number, result:object}} args
   */
  interrupt({ healAmount, playerHp, result }) {
    if (!this.payload || this.finished) return false;

    const kept = this.payload.result.turns.slice(0, this.cursor);
    const healEvent = {
      t: this.clock,
      type: 'heal',
      actor: 'player',
      actorName: this.payload.player.name,
      amount: healAmount,
      actorHpAfter: playerHp,
      actorMaxHp: this.payload.player.maxHp,
    };

    this.payload.result = {
      ...result,
      turns: kept.concat([healEvent], result.turns),
    };
    this.cursor = kept.length; // 다음 틱에 회복 연출부터 재생된다
    this.hp.player = playerHp;
    return true;
  }

  skipToEnd() {
    if (!this.payload || this.finished) return;
    const { turns, duration } = this.payload.result;
    while (this.cursor < turns.length) this._fire(turns[this.cursor++]);
    this._flushLater();
    this.clock = duration;
    this._finish();
  }

  update(dt, { paused = false } = {}) {
    if (!this.payload || this.finished) return;
    // 창을 열어 두었으면 연출은 멈춘다 — 연출은 시간이 아니라 보여 주는 일이다.
    if (paused) return;

    // 배속: 설정값 × (Shift 를 누르고 있으면 추가 가속)
    const setting = (this.getSettings().battleSpeed || 100) / 100;
    const speed = setting * (this.isFastForward() ? FAST_FORWARD_RATE : 1);
    this.clock += dt * speed;
    this.fade = Math.min(1, this.fade + dt / 220);

    const { turns, duration } = this.payload.result;
    while (this.cursor < turns.length && turns[this.cursor].t <= this.clock) {
      this._fire(turns[this.cursor++]);
    }

    // 닿을 때가 된 것들을 처리한다(날아가던 화살·마법탄).
    if (this._later.length) {
      const due = this._later.filter((j) => j.at <= this.clock);
      if (due.length) {
        this._later = this._later.filter((j) => j.at > this.clock);
        for (const j of due) j.run();
      }
    }
    this._shots = this._shots.filter((s2) => this.clock < s2.at);

    const step = dt * speed;
    for (const f of [this.fx.player, ...this.monsterFx]) {
      f.shake = Math.max(0, f.shake - step);
      f.lunge = Math.max(0, f.lunge - step);
      f.flash = Math.max(0, f.flash - step);
      f.glow = Math.max(0, f.glow - step);
      f.hit = Math.max(0, f.hit - step);
      f.swing = Math.max(0, f.swing - step);
      f.dodge = Math.max(0, f.dodge - step);
      f.revive = Math.max(0, f.revive - step);
      f.aura = Math.max(0, f.aura - step);
    }

    if (this.cursor >= turns.length && this.clock >= duration) this._finish();
  }

  /** 이벤트가 가리키는 대상의 연출 상태. 몬스터는 index 로 고른다. */
  _fxOf(side, index) {
    if (side === 'player') return this.fx.player;
    return this.monsterFx[index] || this.monsterFx[0] || this.fx.monster;
  }

  _fire(turn) {
    if (turn.type === 'hit') {
      const kind = this.hitKind(turn);
      const af = this._fxOf(turn.actor, turn.actorIndex);
      af.lunge = 220;
      // 0.54 — 손에 든 것으로 **휘두른다.** 칼과 둔기는 자국이 남고,
      //        마법과 화살은 날아간다(아래 _shots).
      if (kind === 'slash' || kind === 'impact') af.swing = SWING_MS;
      // 0.57 — **붙어서 때리는 쪽은 실제로 달려간다.**
      //
      // 활과 마법은 멀리서 쏘는 것이라 제자리가 맞다. 그런데 검은 제자리에서
      // 허공을 갈랐다 — 닿지도 않는 거리에서 칼을 휘두르니 "때렸다"로 안 읽혔다.
      // 이제 상대와 나의 **중간까지** 뛰어나갔다 돌아온다.
      //
      // 0.58 — **몬스터는 원거리라도 조금 다가온다.**
      //
      // 24마리 중 11마리가 school: 'magic' 이다(임프·악마 장군·지하감옥 것들·두 용).
      // 그 갈래는 kind 가 'magic' 이라 여기서 chargeTo 가 null 이 되었고,
      // 그래서 **중반 이후 몬스터는 한 번도 움직이지 않았다.** 제자리에서 숫자만 떴다.
      //
      // 그렇다고 마법사가 코앞까지 뛰어드는 것도 이상하다. 그래서 몫을 나눈다 —
      // 붙어 때리는 것은 중간까지(1), 멀리서 쏘는 것은 살짝만(0.3).
      //
      // ⚠ 사람 쪽은 다르다. 사냥꾼과 마법사는 **제자리가 맞다**(0.57 에서 그렇게 정했다).
      //   멀리서 쏘는 맛이 그 직업의 몫이라서다. 그래서 이 완화는 몬스터에만 준다.
      const melee = kind === 'slash' || kind === 'impact';
      const monsterRanged = !melee && turn.actor === 'monster';
      af.chargeTo = (melee || monsterRanged)
        ? (turn.target === 'monster' ? (turn.targetIndex ?? 0) : -1)
        : null;
      af.chargePart = melee ? 1 : 0.3;

      const flying = kind === 'magic' || kind === 'fire' || kind === 'pierce';
      if (flying) {
        this._shots.push({
          from: { side: turn.actor, index: turn.actorIndex },
          to: { side: turn.target, index: turn.targetIndex },
          kind,
          crit: !!turn.crit,
          born: this.clock,
          at: this.clock + FLIGHT_MS,
        });
      }

      const tf = this._fxOf(turn.target, turn.targetIndex);
      const w = hitWeight(turn);
      // 맞는 연출은 **닿을 때** 한다. 날아가는 그림이 아직 반쯤 왔는데
      // 상대가 먼저 흔들리면 무엇에 맞은 것인지가 안 보인다.
      this._after(flying ? FLIGHT_MS : 0, () => {
        // 0.44 — 세게 맞을수록 크게 흔들린다. 예전에는 스치든 반토막이 나든 똑같이 흔들렸다.
        if (this.getSettings().screenShake !== false) tf.shake = 260 + w * 90;
        if (turn.crit || w >= 2) tf.flash = 180;
        // 맞은 자리에 터질 그림. 흔들림 설정을 꺼도 이건 남는다 —
        // 흔들림은 화면이 흔들려 어지러운 것이고, 이것은 "무엇에 맞았는지"라서 다른 얘기다.
        tf.hit = HIT_FX_LIFE;
        tf.kind = kind;
        tf.crit = !!turn.crit;
        tf.weight = w;
        // 용사의 최후의 버팀 — 1 HP 로 살아남으면 금빛이 퍼진다.
        if (turn.survived) tf.revive = 620;
        // 마법사의 보호막이 터졌다 — 그 뒤로 몇 대를 막는 동안 오로라가 감싼다.
        if (turn.shielded) tf.aura = 3200;
      });
      if (turn.healed) af.glow = 260;

      if (turn.target === 'monster') {
        const i = turn.targetIndex ?? 0;
        this.monsterHp[i] = turn.targetHpAfter;
        this.hp.monster = this.monsterHp[i];
      } else {
        this.hp.player = turn.targetHpAfter;
      }
      if (turn.actorHpAfter != null && turn.actor === 'player') this.hp.player = turn.actorHpAfter;
    } else if (turn.type === 'miss') {
      this._fxOf(turn.actor, turn.actorIndex).lunge = 160;
      // 피한 쪽에 반달 빛. 아무 일도 안 일어난 것처럼 보이던 빗나감이 이제 눈에 띈다.
      const mf = this._fxOf(turn.target, turn.targetIndex);
      mf.hit = HIT_FX_LIFE;
      mf.kind = 'guard';
      mf.crit = false;
      mf.weight = 0;
      // 0.54 — **몸을 뺀다.** 빛만 뜨던 것에 움직임을 붙인다.
      //   보호막으로 막은 것은 피한 것이 아니다 — 그때는 오로라만 다시 밝힌다.
      if (turn.tag === 'shield') mf.aura = Math.max(mf.aura, 1200);
      else mf.dodge = 300;
    } else if (turn.type === 'heal') {
      this.fx.player.glow = 420;
      this.hp.player = turn.actorHpAfter;
    } else if (turn.type === 'defeat') {
      this._fxOf(turn.actor, turn.actorIndex).flash = 400;
      if (turn.actor === 'monster' && turn.actorIndex != null) {
        this.monsterHp[turn.actorIndex] = 0;
      }
    }
    this.bus.emit('battle:event', turn);
  }

  _finish() {
    if (this.finished) return;
    this.finished = true;
    this.bus.emit('battle:finished', this.payload);
  }

  render(renderer) {
    if (!this.payload) return;
    const { ctx } = renderer;
    const W = renderer.width;
    const H = renderer.height;

    renderer.resetCamera();

    // ⚠ 전투 배경은 화면을 **끝까지 덮어야** 한다 (0.53).
    //
    //   씬은 스택 전체를 아래에서부터 그린다 — 전투 아래에 필드가 그대로 있다.
    //   그런데 배경 그림은 640×480 인데 세로 화면은 480×640 이라, topleft 에
    //   그대로 놓으면 **아래 160px 이 안 덮여 필드가 비쳐 보였다.**
    //   전투 중에 뒤에서 몬스터가 걸어 다니면 눈이 그리로 간다.
    //
    //   ① 먼저 어두운 색으로 화면을 통째로 지운다(그림이 없어도 안 비친다)
    //   ② 그림은 가로세로 비를 지키며 **넘치게(cover)** 키워 가운데에 놓는다
    ctx.save();
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    const bg = renderer.assets.get('bg_battle_field');
    if (bg && bg.ok) {
      const k = Math.max(W / (bg.w || W), H / (bg.h || H));
      renderer.drawSprite('bg_battle_field',
        (W - (bg.w || W) * k) / 2, (H - (bg.h || H) * k) / 2,
        { anchor: 'topleft', world: false, scale: k });
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#1b2a4a');
      grad.addColorStop(0.55, '#24344f');
      grad.addColorStop(1, '#101827');
      ctx.save();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(30,48,36,0.85)';
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 0.92, W * 0.85, H * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.fade < 1) {
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${1 - this.fade})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    const list = monsterList(this.payload);
    const playerPos = { x: W * 0.28, y: H * 0.86 };

    // 여러 마리는 앞뒤로 살짝 어긋나게 늘어세운다(뒤쪽이 작고 위에 있다).
    const placed = list.map((m, i) => ({ m, i, ...monsterSlot(W, H, i, list.length) }));
    // 날아가는 것이 어디서 어디로 갈지 — 이번 프레임의 자리를 적어 둔다.
    this._slots = {
      player: { x: playerPos.x, y: playerPos.y - 46 },
      monsters: placed.map(({ i, x, y }) => ({ i, x, y: y - 34 })),
    };
    placed.sort((a, b) => a.y - b.y); // 위에 있는 놈부터 그려야 앞뒤가 맞는다

    for (const { m, i, x, y, scale } of placed) {
      const dead = (this.monsterHp[i] ?? m.hp) <= 0;
      this._drawCombatant(
        renderer,
        m.sprite,
        { x, y },
        this.monsterFx[i] || this.fx.monster,
        {
          scale: (m.scale ?? 0.78) * scale,
          lungeDir: -1,
          dead,
          shadowW: 120 * scale,
          attackSprite: m.attackSprite,
        }
      );
    }

    this._drawCombatant(renderer, this.payload.player.sprite, playerPos, this.fx.player, {
      scale: this.payload.player.scale ?? 0.62,
      lungeDir: 1,
      stance: true, // 상대를 향해 몸을 기울인 전투 자세로 서 있는다
      stanceSprite: this.payload.player.stanceSprite,
      dead: this.payload.result.winner === 'monster' && this.finished,
      shadowW: 90,
      attackSprite: this.payload.player.attackSprite,
    });

    // 이펙트는 **맨 마지막에** 그린다. 사람을 그리는 도중에 끼워 넣으면
    // 뒤에 선 몬스터가 나중에 그려지며 이펙트를 덮어 버린다.
    for (const e of this._fxQueue) this._drawHitFx(renderer, e);
    this._fxQueue.length = 0;
    for (const shot of this._shots) this._drawShot(renderer, shot);
  }

  /** 그 사람(마리)이 지금 서 있는 자리. 없으면 화면 가운데. */
  _slotOf(ref, renderer) {
    const s = this._slots;
    if (!s) return { x: renderer.width / 2, y: renderer.height / 2 };
    if (ref.side === 'player') return s.player;
    const i = ref.index ?? 0;
    return s.monsters.find((m) => m.i === i) || s.monsters[0] || s.player;
  }

  /**
   * 날아가는 것 — 마법탄과 화살 (0.54).
   *
   * 그림을 새로 굽지 않고 캔버스로 그린다. 방향에 따라 돌아가야 하는데,
   * 미리 구운 그림은 한 방향으로만 누워 있어서 되레 어색하다.
   */
  _drawShot(renderer, shot) {
    const { ctx } = renderer;
    const a = this._slotOf(shot.from, renderer);
    const b = this._slotOf(shot.to, renderer);
    const p = Math.max(0, Math.min(1, (this.clock - shot.born) / FLIGHT_MS));
    const x = a.x + (b.x - a.x) * p;
    // 살짝 포물선을 그린다 — 곧게 가면 미끄러지는 것처럼 보인다.
    const y = a.y + (b.y - a.y) * p - Math.sin(p * Math.PI) * 26;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const big = shot.crit ? 1.35 : 1;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (shot.kind === 'pierce') {
      // 화살 — 촉과 깃, 그리고 뒤로 끌리는 잔상.
      ctx.strokeStyle = 'rgba(214,255,176,0.55)';
      ctx.lineWidth = 3 * big;
      ctx.beginPath(); ctx.moveTo(-30 * big, 0); ctx.lineTo(-6 * big, 0); ctx.stroke();
      ctx.fillStyle = '#eaffd0';
      ctx.beginPath();
      ctx.moveTo(14 * big, 0); ctx.lineTo(-4 * big, -4.5 * big); ctx.lineTo(-4 * big, 4.5 * big);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9be86b';
      ctx.lineWidth = 2 * big;
      ctx.beginPath(); ctx.moveTo(-6 * big, 0); ctx.lineTo(-20 * big, 0); ctx.stroke();
    } else if (shot.kind === 'fire') {
      // 불덩이 (0.56) — 마법사가 던지는 것. 푸른 구슬보다 크고, 뒤로 불꼬리가 끌린다.
      // 날아가는 동안 저 혼자 넘실거려야 '불' 로 보인다.
      const wob = Math.sin(this.clock / 55) * 0.12 + 1;
      const r = 17 * big * wob;
      ctx.globalCompositeOperation = 'lighter';
      // 꼬리 — 뒤로 갈수록 붉고 옅어진다
      const tail = ctx.createLinearGradient(-r * 4.2, 0, 0, 0);
      tail.addColorStop(0, 'rgba(160,30,10,0)');
      tail.addColorStop(0.55, 'rgba(255,110,40,0.45)');
      tail.addColorStop(1, 'rgba(255,200,110,0.9)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(-r * 4.2, 0);
      ctx.quadraticCurveTo(-r * 1.6, -r * 0.95, 0, -r * 0.75);
      ctx.lineTo(0, r * 0.75);
      ctx.quadraticCurveTo(-r * 1.6, r * 0.95, -r * 4.2, 0);
      ctx.closePath(); ctx.fill();
      // 불덩이 — 흰 심 → 노랑 → 주황 → 사라짐
      const orb = ctx.createRadialGradient(r * 0.15, -r * 0.15, 1, 0, 0, r);
      orb.addColorStop(0, '#ffffff');
      orb.addColorStop(0.28, '#fff3c4');
      orb.addColorStop(0.55, '#ffa63d');
      orb.addColorStop(1, 'rgba(200,40,10,0)');
      ctx.fillStyle = orb;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      // 앞머리에 튀는 불똥
      ctx.fillStyle = 'rgba(255,214,102,0.8)';
      for (let i = 0; i < 3; i++) {
        const a = (this.clock / 90) + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.7, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // 마법탄 — 가운데가 하얗고 밖으로 갈수록 푸른 구슬, 뒤로 꼬리.
      // (마법을 쓰는 **몬스터** 몫이다 — 마법사는 위의 불덩이를 쓴다)
      const r = 11 * big;
      const tail = ctx.createLinearGradient(-38 * big, 0, 0, 0);
      tail.addColorStop(0, 'rgba(123,160,255,0)');
      tail.addColorStop(1, 'rgba(168,200,255,0.75)');
      ctx.fillStyle = tail;
      ctx.beginPath();
      ctx.moveTo(-38 * big, -4 * big); ctx.lineTo(0, -r * 0.6);
      ctx.lineTo(0, r * 0.6); ctx.lineTo(-38 * big, 4 * big);
      ctx.closePath(); ctx.fill();
      const orb = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
      orb.addColorStop(0, '#ffffff');
      orb.addColorStop(0.45, '#cfe0ff');
      orb.addColorStop(1, 'rgba(91,120,255,0)');
      ctx.fillStyle = orb;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /** 맞은 자리에 한 번 터졌다 사라지는 그림. 커지면서 옅어진다. */
  _drawHitFx(renderer, { fx, x, y, scale }) {
    const key = KIND_FX[fx.kind] || KIND_FX.impact;
    const asset = renderer.assets.get(key);
    if (!asset || !asset.ok) return;

    const p = 1 - fx.hit / HIT_FX_LIFE; // 0 → 1
    // 크기는 몸집을 따라가되 너무 작아지지 않게 한다 —
    // 처음엔 작게 그렸더니 슬라임 위의 벤 자국이 실오라기처럼 보였다.
    // 치명타와 **큰 한 방**이 함께 크기를 정한다. 글씨(ui/BattleView)와 같은 잣대를
    // 쓰므로 "글씨는 큰데 이펙트는 작다" 가 생기지 않는다.
    // 0.56 — **더 크게 터진다.** 0.54 까지는 몸집의 절반쯤이라 슬라임 위에 얹히면
    // 눈에 잘 안 띄었다. 불덩이(마법사)는 그중에서도 한 번 더 크다 —
    // 한 방이 무거운 직업이라 터지는 것도 그렇게 보여야 한다.
    const kindGrow = fx.kind === 'fire' ? 1.5 : 1;
    const grow = ((fx.crit ? 1.9 : 1.5) + (fx.weight || 0) * 0.26) * kindGrow;
    // 위 천장이 없으면 작은 몸(플레이어 0.62 배)에 터질 때 사람이 통째로 덮인다.
    const size = Math.min(2.6, grow * scale * (0.72 + p * 0.7));
    // 투명도는 drawSprite 에 **넘겨야** 한다. 밖에서 globalAlpha 를 만져 봐야
    // drawSprite 가 제 alpha 로 덮어쓴다(그렇게 하다 이펙트가 안 옅어졌다).
    renderer.drawSprite(key, x, y, {
      anchor: 'center',
      world: false,
      scale: size,
      alpha: Math.max(0, Math.min(1, 1 - p * p)), // 또렷하게 나타났다 끝에서 빨리 사라진다
    });
  }

  _drawCombatant(renderer, sprite, pos, fx, opts) {
    const shakeAmp = fx.shake > 0 ? Math.sin(fx.shake / 22) * (fx.shake / 26) : 0;
    const lungeP = fx.lunge > 0 ? Math.sin((1 - fx.lunge / 220) * Math.PI) : 0;
    // 붙어서 때리는 한 대면 상대와 나의 **중간까지** 간다. 아니면 예전처럼 살짝 내민다.
    // (sin 곡선이라 갔다가 저절로 돌아온다 — 따로 되돌리는 코드가 없다)
    const charge = fx.lunge > 0 ? this._chargeDist(fx, pos, opts) : 0;
    const lunge = lungeP * (charge || 26) * opts.lungeDir;
    // 0.54 — 피할 때는 **몸을 뒤로 뺀다.** 빛만 뜨던 것에 움직임이 붙는다.
    const dodgeP = fx.dodge > 0 ? Math.sin((1 - fx.dodge / 300) * Math.PI) : 0;
    const dodge = dodgeP * -30 * opts.lungeDir;
    const x = pos.x + shakeAmp + lunge + dodge;
    const y = pos.y;

    // 내지르는 중이면 공격 그림으로 바꿔 끼운다.
    // 이름(문자열)으로 올 수도 있고 이미 만들어진 그림 객체로 올 수도 있다 —
    // 몬스터는 이름, 사람은 장비가 반영된 객체다.
    const attack = opts.attackSprite;
    const resolved = typeof attack === 'string' ? renderer.assets.get(attack) : attack;
    const hasAttack = !!(resolved && resolved.image);
    // 0.56 — 서 있는 동안은 **전투 자세** 그림을 쓴다(팔을 굽혀 손을 앞으로 올린 몸).
    // 없으면(운영자·몬스터) 예전처럼 서 있는 그림 그대로다.
    const stanceRaw = opts.stanceSprite;
    const stanceImg = typeof stanceRaw === 'string' ? renderer.assets.get(stanceRaw) : stanceRaw;
    const idleSprite = stanceImg && stanceImg.image ? stanceImg : sprite;
    const shown = hasAttack && fx.lunge > 0 ? resolved : idleSprite;

    // 공격 그림이 없는 쪽(운영자, 아직 안 구운 몬스터)은 **기울여서** 대신한다.
    const lungeRot = hasAttack ? 0 : lungeP * 0.16 * opts.lungeDir;

    // ── 전투 기본 자세 (0.56) ──────────────────────────────
    //
    // 예전에는 싸움이 시작되면 **정면을 보고 차렷** 으로 서 있었다. 필드를 걷던
    // 그림 그대로라서, 때릴 때만 잠깐 기울고 나머지 시간은 얼어 있는 사람이었다.
    // 이제 상대 쪽으로 몸을 기울인 채 서서, 숨쉬듯 아주 조금씩 흔들린다.
    // (공격 그림으로 바뀌어 있는 동안에는 그 그림이 이미 기울어 있으므로 안 건드린다)
    const idle = opts.stance && shown === idleSprite;
    const breath = idle ? Math.sin(this.clock / 700) : 0;
    // 자세 그림이 따로 있으면 몸이 이미 싸울 준비를 하고 있으므로 조금만 기울인다.
    const lean = stanceImg && stanceImg.image ? 0.06 : 0.11;
    const stanceRot = idle ? (lean + breath * 0.018) * opts.lungeDir : 0;
    const stanceX = idle ? opts.lungeDir * 4 : 0;
    const stanceY = idle ? breath * 2.4 : 0;
    const rotate = lungeRot + stanceRot;

    // ── 보호막 오로라 (0.54) ────────────────────────────────
    //
    // 마법사가 1 HP 로 버틴 뒤 몇 대를 막는 동안 켜져 있다.
    // "왜 안 맞지" 가 화면에 보여야 그 패시브가 있다는 것을 안다.
    if (fx.aura > 0) {
      const { ctx } = renderer;
      const k = Math.min(1, fx.aura / 900);
      const spin = (this.clock / 260) % (Math.PI * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = spin + (i * Math.PI * 2) / 3;
        const rw = opts.shadowW * (0.62 + i * 0.08);
        const rh = opts.shadowW * (0.86 + i * 0.06);
        ctx.globalAlpha = 0.16 * k;
        ctx.strokeStyle = ['#8fd4ff', '#b79bff', '#7ef0e0'][i];
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.ellipse(pos.x, y - opts.shadowW * 0.5, rw, rh, a, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── 1 HP 로 버텼다 (0.54) ──────────────────────────────
    // 금빛 고리가 밖으로 퍼진다. 로그의 '버텨냈다!' 와 짝이다.
    if (fx.revive > 0) {
      const { ctx } = renderer;
      const p = 1 - fx.revive / 620;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.9;
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 4 - p * 2;
      ctx.beginPath();
      ctx.ellipse(pos.x, y - opts.shadowW * 0.45,
        opts.shadowW * (0.3 + p * 1.1), opts.shadowW * (0.42 + p * 1.3), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 회복 시 초록빛 고리
    if (fx.glow > 0) {
      const { ctx } = renderer;
      ctx.save();
      ctx.globalAlpha = (fx.glow / 420) * 0.7;
      ctx.strokeStyle = '#7ef0b0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(pos.x, y - 4, opts.shadowW * 0.62, opts.shadowW * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 그림자도 같이 간다 — 안 그러면 크게 달려나갈 때 사람이 제 그림자를 두고 간다.
    renderer.drawShadow(pos.x + lunge + dodge, y - 2, opts.shadowW, { world: false, alpha: 0.32 });

    // ── 달려나갈 때의 잔상 (0.58) ──────────────────────────
    //
    // 크게 뛰어나가면 두 프레임 사이의 거리가 멀어서 **순간이동처럼** 보인다.
    // 지나온 자리에 옅은 그림을 두엇 남기면 그 사이가 메워져 속도로 읽힌다.
    // 조금만 움직이는 것(활·마법의 26px)에는 안 그린다 — 지저분하기만 하다.
    if (this.trail !== false && Math.abs(lunge) > TRAIL_MIN_PX) {
      for (let i = 1; i <= TRAIL_COUNT; i++) {
        const back = (lunge * i) / (TRAIL_COUNT + 1); // 지나온 자리
        renderer.drawSprite(shown, x + stanceX - back, y + stanceY, {
          anchor: 'bottom',
          world: false,
          scale: opts.scale,
          alpha: (opts.dead ? 0.35 : 1) * TRAIL_ALPHA * (1 - i / (TRAIL_COUNT + 1)),
          rotate,
        });
      }
    }

    renderer.drawSprite(shown, x + stanceX, y + stanceY, {
      anchor: 'bottom',
      world: false,
      scale: opts.scale,
      alpha: opts.dead ? 0.35 : 1,
      flash: fx.flash > 0 ? Math.min(1, (fx.flash / 400) * 0.9) : 0,
      rotate,
    });

    // ── 휘두른 자국 (0.54) ─────────────────────────────────
    //
    // 예전에는 그림만 앞으로 기울었다. 무기가 지나간 자리가 없어서
    // "때렸다" 가 아니라 "다가갔다" 로 보였다. 앞쪽에 호를 하나 긋는다.
    if (fx.swing > 0) {
      const { ctx } = renderer;
      const p = 1 - fx.swing / SWING_MS;      // 0 → 1
      const reach = opts.shadowW * 0.62;
      const cx = pos.x + opts.lungeDir * reach * 0.75 + lunge;
      const cy = y - opts.shadowW * 0.55;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - p) * 0.85;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5 - p * 3;
      ctx.lineCap = 'round';
      // 위에서 아래로 베어 내린다. p 가 커질수록 호가 아래로 돌아간다.
      const from = -Math.PI * 0.75 + p * Math.PI * 0.55;
      const to = from + Math.PI * 0.62;
      ctx.beginPath();
      ctx.ellipse(cx, cy, reach * 0.8, reach, 0,
        opts.lungeDir > 0 ? from : Math.PI - to,
        opts.lungeDir > 0 ? to : Math.PI - from);
      ctx.stroke();
      ctx.globalAlpha *= 0.5;
      ctx.strokeStyle = '#bfe3ff';
      ctx.lineWidth = 11 - p * 6;
      ctx.stroke();
      ctx.restore();
    }

    // 맞았으면 이펙트 자리를 적어 둔다(그리는 것은 render 의 맨 끝).
    // 몸통 한가운데 — 그림 높이의 절반쯤 위. 크기는 몬스터마다 다르므로 그림에서 잰다.
    if (fx.hit > 0) {
      const a = typeof shown === 'string' ? renderer.assets.get(shown) : shown;
      const bodyH = ((a && a.h) || 220) * opts.scale;
      this._fxQueue.push({
        fx,
        x: pos.x + shakeAmp,
        y: y - bodyH * 0.52,
        scale: Math.max(0.55, Math.min(1.8, bodyH / 170)),
      });
    }
  }

  /**
   * 이번 한 대에 몇 픽셀을 달려나가나.
   *
   * 근접(칼·둔기)일 때만 값이 있다. 상대가 서는 자리는 마리 수에 따라 달라지므로
   * 미리 못 정한다 — 이번 프레임의 _slots 에서 읽는다.
   * @returns {number} 0 이면 예전처럼 살짝 내밀기만 한다
   */
  _chargeDist(fx, pos, opts) {
    if (fx.chargeTo == null || !this._slots) return 0;
    const to = fx.chargeTo < 0
      ? this._slots.player
      : (this._slots.monsters.find((m) => m.i === fx.chargeTo) || this._slots.monsters[0]);
    if (!to) return 0;
    const half = Math.abs(to.x - pos.x) * 0.5;
    // 너무 가까이 붙으면 두 그림이 겹친다. 몸집만큼은 남긴다.
    const full = Math.max(26, half - opts.shadowW * 0.35);
    // chargePart 로 몫을 줄인다(멀리서 쏘는 몬스터는 살짝만 다가온다).
    return full * (fx.chargePart == null ? 1 : fx.chargePart);
  }
}

/** payload 에서 몬스터 목록을 꺼낸다(한 마리만 넘어온 예전 형식도 받아 준다). */
export function monsterList(payload) {
  if (!payload) return [];
  if (payload.monsters && payload.monsters.length) return payload.monsters;
  return payload.monster ? [payload.monster] : [];
}

/**
 * 몬스터 i 번째가 설 자리. 마리 수가 늘면 뒤로 물러나며 작아진다.
 * 화면 오른쪽에 부채꼴로 늘어선다.
 */
export function monsterSlot(W, H, i, total) {
  if (total <= 1) return { x: W * 0.68, y: H * 0.6, scale: 1 };
  const spreadX = [0.72, 0.56, 0.84, 0.64];
  const spreadY = [0.62, 0.5, 0.52, 0.42];
  const shrink = [1, 0.84, 0.8, 0.7];
  const k = i % 4;
  return { x: W * spreadX[k], y: H * spreadY[k], scale: shrink[k] };
}

export const BATTLE_LAYOUT = { TILE: CONFIG.TILE };
