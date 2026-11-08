// 책임: 필드에서 벌어지는 싸움을 **보여 준다** (0.80.01 수정안 — 미리보기 단계, ?field=1 일 때만 켜진다).
// 금지: 전투 계산. 누가 언제 얼마나 때리는지는 CombatSystem.simulateBattle 이 이미 정했다.
//       여기서는 그 타임라인을 필드 위에서 박자대로 재생할 뿐이다(전투 화면 BattleScene 과 같은 자리).
//
// ── 핵앤슬래시처럼 부드럽게 — 쓰는 기법 ─────────────────────────
//   ① 예비 동작(움츠림) → 돌진(늘어남) → 닿음 → 되돌아옴(살짝 넘쳤다 가라앉음) — 모두 감속 곡선
//   ② 동작마다 그림을 갈아 낀다 — 사람: 전투 자세 · 휘두름 · 맞음 · 쓰러짐(전투 화면 그림을 줄여서)
//                                  몬스터: 움츠림 · 덤벼듦 · 맞음 · 쓰러짐(같은 그림체, 같은 틀)
//   ③ 히트스톱 — 닿는 순간 화면이 아주 잠깐 멈춘다(보통 55ms · 치명타 120ms). 손맛의 대부분이 여기서 온다
//   ④ 맞은 쪽: 하얗게 번쩍 · 뒤로 밀림 · 눌림, 화면은 세게 맞을수록 크게 흔들린다
//   ⑤ 잔상 — 돌진하는 몸 뒤로 흐린 그림 둘, 칼은 호를 그리며 지나간다
//   ⑥ 피해 숫자는 튀어 올랐다(넘침) 가라앉으며 떠오른다. HP 줄은 깎인 몫이 잠깐 남았다 따라 내려간다
//   ⑦ 쓰러짐 — 번쩍 → 눕는 그림 → 가라앉으며 사라지고, 넋과 동전이 튄다
import { hitKindOf, hitWeight, KIND_FX } from '../core/hitLook.js';
import { CONFIG } from '../config.js';

// ── 박자 ──────────────────────────────────────────────────
const LEAD_MS = 360;          // 싸움이 열리고 첫 동작까지(몬스터가 다가오고 원거리 직업이 한 발 물러나는 시간)
const TAIL_MS = 820;          // 마지막 동작 뒤 — 쓰러지는 그림이 다 눕고 사라질 때까지(동전 · 숫자는 그 뒤에도 남아서 진다)
const TAIL_LOSE_MS = 1500;    // 내가 쓰러졌으면 조금 더 누워 있는다(바로 일어서면 진 것이 안 보인다)
const RETURN_MS = 380;        // 끝나기 직전 — 살아남은 몸이 제자리(칸)로 미끄러져 돌아간다
// 휘두르기 시작에서 닿기(또는 쏘기)까지(ms)
const STRIKE_AT = { slash: 150, impact: 170, pierce: 140, fire: 210, magic: 190, guard: 150 };
// 날아가는 빠르기(px/ms) — 화살도 눈에 두세 장은 걸려야 '쐈다' 가 보인다(너무 빠르면 그냥 맞은 것처럼 보인다)
const FLY_PX_PER_MS = { pierce: 0.6, fire: 0.45, magic: 0.5 };
const HITSTOP = [50, 65, 85];  // 무게 0 · 1 · 2
const HITSTOP_CRIT = 120;
const SHAKE_PX = [0, 1.6, 3];  // 무게 1 · 2 부터 흔든다
const SHAKE_CRIT = 4.2;
const NUM_UP = 17;            // 숫자가 처음 뜨는 높이 — 머리 위 HP 줄(몸 키 + 7) 보다 위에서 시작한다

// ── 곡선 ──────────────────────────────────────────────────
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const outQuad = (t) => 1 - (1 - t) * (1 - t);
const inQuad = (t) => t * t;
const outBack = (t) => { const c = 1.6; const x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

const NEUTRAL = () => ({ x: 0, y: 0, lift: 0, rot: 0, sx: 1, sy: 1, flash: 0, alpha: 1 });

/** 싸움에 드는 하나(사람 또는 몬스터) */
class Fighter {
  constructor(actor, side, index, hp, maxHp) {
    this.actor = actor;
    this.side = side;          // 'player' | 'monster'
    this.index = index;        // 몬스터면 타임라인의 index, 사람은 -1
    this.hp = hp;
    this.maxHp = maxHp;
    this.trail = hp;           // HP 줄 — 깎인 몫이 잠깐 남는 쪽
    this.trailHold = 0;
    this.anims = [];           // { type, t0, ... }
    this.residual = null;      // 바뀐 동작이 남긴 자세 — 짧게 녹아 사라진다(뚝 끊기지 않게)
    this.dead = false;
    this.deadAt = -1;
    this.home = { x: 0, y: 0 }; // 싸움 동안 서는 자리(실제 자리에서 얼마나 비켜 섰나)
    this.from = { x: 0, y: 0 }; // 그 자리로 미끄러져 가기 시작한 곳
    this.moveT0 = 0;
    this.moveDur = 1;
    this.phase = Math.random() * 6.28;
    this.barAlpha = 0;
  }
}

export class FieldFight {
  /**
   * @param {object} o
   * @param {object} o.state       게임 상태(직업 · 표 — 무엇으로 때리나를 고른다)
   * @param {object} o.player      필드의 주인공(actor)
   * @param {object[]} o.monsters  필드의 몬스터들(actor) — 타임라인의 index 순서
   * @param {object} o.result      simulateBattle 결과
   * @param {(turn)=>void} [o.onEvent]  한 칸을 재생할 때마다(소리 · 물약 덜기 — 전투 화면과 같은 'battle:event')
   * @param {boolean} [o.shake]   화면 흔들림(설정)
   */
  constructor({ state, player, monsters, result, onEvent = null, shake = true }) {
    this.state = state;
    this.result = result;
    this.onEvent = onEvent;
    this.shakeOn = shake;
    this.clock = 0;           // 싸움 시계 — 히트스톱 동안 멈춘다
    this.wall = 0;            // 벽시계
    this.stop = 0;            // 남은 히트스톱(ms)
    this.shake = { amp: 0, t0: 0, dur: 1 };
    this.fx = [];             // 이펙트 · 날아가는 것 · 숫자 · 불티
    this.over = false;
    this.cls = (state.player && state.player.classId) || 'warrior';
    this.ranged = this.cls === 'ranger' || this.cls === 'mage';

    const snap = result.snapshot || { player: {}, monsters: [] };
    const p = snap.player || {};
    this.me = new Fighter(player, 'player', -1, p.hp ?? player.hp ?? 1, p.maxHp ?? p.hp ?? 1);
    this.foes = monsters.map((m, i) => {
      const s = (snap.monsters || [])[i] || {};
      return new Fighter(m, 'monster', i, s.hp ?? 1, s.maxHp ?? s.hp ?? 1);
    });
    this.all = [this.me, ...this.foes];
    this.byActor = new Map(this.all.map((f) => [f.actor, f]));
    this.fighters = new Set(monsters);

    // 타임라인 — 첫 동작을 LEAD_MS 에 맞춘다(전투 화면의 등장 연출 0.5초는 필드에 없다)
    const turns = result.turns || [];
    const t0 = turns.length ? turns[0].t : 0;
    this.queue = turns.map((turn) => ({ at: LEAD_MS + (turn.t - t0), turn }));
    this.qi = 0;
    const lost = result.winner === 'monster';
    this.endAt = (this.queue.length ? this.queue[this.queue.length - 1].at : 0) + (lost ? TAIL_LOSE_MS : TAIL_MS);
    this.returning = false;
    /** 끝난 뒤 — 몸은 다시 필드가 그리고, 여기서는 남은 이펙트(숫자 · 동전 · 불티)만 진다 */
    this.released = false;

    this._stage();
  }

  // ── 자리 잡기 — 몬스터는 둘레로 모이고, 원거리 직업은 한 발 물러선다 ──
  _stage() {
    const me = this.me;
    const first = this.foes[0];
    // 한 칸을 걷던 중이면 그 칸에 다 닿은 자리(칸 한가운데 · 발밑)를 기준으로 잡는다.
    //   FieldScene 이 싸우는 동안에도 그 한 걸음은 마저 걷게 둔다(멈추면 칸 사이에 박혀 버린다).
    //   비켜 선 몫 = (서고 싶은 자리 − 칸 자리) 이므로 걸음을 마치는 순간 정확히 그 자리에 선다.
    const T = CONFIG.TILE;
    const rest = (a) => (Number.isFinite(a.tx) ? { x: a.tx * T + T / 2, y: a.ty * T + T } : { x: a.px, y: a.py });
    const meR = rest(me.actor);
    const dirX = first ? (Math.sign(rest(first.actor).x - meR.x) || Math.sign(first.actor.px - me.actor.px) || 1) : 1;
    this.facing = dirX;
    // 나는 첫 상대를 본다
    me.actor.dir = dirX > 0 ? 'right' : 'left';
    me.actor.face8 = me.actor.dir;
    if (this.ranged) {
      me.from = { x: 0, y: 0 };
      me.home = { x: -dirX * 30, y: 0 };
      me.moveT0 = 40; me.moveDur = 260;
      me.hop = true;
    }
    // 끌려온 몬스터는 내 둘레의 자리로 — 첫 놈 자리를 기준으로 위아래로 벌린다
    // 앞 · 위 뒤 · 아래 뒤로 부채꼴. 둘째부터는 한 발 뒤에 서서 몸과 HP 줄이 포개지지 않는다
    const slots = [[1, 0], [1.42, -0.95], [1.42, 0.95], [-1, 0], [-1.3, -0.9]];
    const meX = meR.x + me.home.x, meY = meR.y;
    // 붙어 서는 거리 — 몸 반 폭 둘(사람 ≈ 12 · 늑대 ≈ 20) + 숨 쉴 틈. 가까우면 몸이 포개진다
    const near = this.ranged ? 44 : 42;
    this.foes.forEach((f, i) => {
      const [sx, sy] = slots[i] || slots[slots.length - 1];
      const tx = meX + sx * dirX * near;
      const ty = meY + sy * near * 0.78;
      const r = rest(f.actor);
      const ox = r.x, oy = r.y;
      // 멀리 있는 놈일수록 다가오는 데 조금 더 걸린다(한 번에 순간이동하면 안 된다)
      const d = Math.hypot(tx - f.actor.px, ty - f.actor.py);
      f.from = { x: 0, y: 0 };
      f.home = { x: tx - ox, y: ty - oy };
      f.moveT0 = 0; f.moveDur = Math.min(LEAD_MS + 120, 140 + d * 2.2);
      f.actor.dir = (meX > ox) ? 'right' : 'left';
    });
  }

  /** 지금 이 몸이 서 있는 자리(실제 자리 + 비켜 선 몫) */
  _base(f, at = this.clock) {
    const o = this._offset(f, at);
    return { x: f.actor.px + o.x, y: f.actor.py + o.y, lift: o.lift, moving: o.moving };
  }

  /** 칸 자리에서 비켜 선 몫(뛰어오른 높이 lift 는 따로 — 그림자는 땅에 남아야 한다) */
  _offset(f, at = this.clock) {
    const u = clamp01((at - f.moveT0) / f.moveDur);
    const k = outCubic(u);
    const lift = f.hop && u > 0 && u < 1 ? Math.sin(u * Math.PI) * 7 : 0;
    return { x: lerp(f.from.x, f.home.x, k), y: lerp(f.from.y, f.home.y, k), lift, moving: u > 0 && u < 1 };
  }

  // ── 시간 ──────────────────────────────────────────────────
  update(dt) {
    if (this.released) {
      // 몸은 이미 필드로 돌아갔다 — 남은 이펙트만 마저 흘려보낸다
      this.wall += dt;
      this.clock += dt;
      this.fx = this.fx.filter((e) => e.kind !== 'call' && !this._expired(e));
      return;
    }
    if (this.over) return;
    this.wall += dt;
    if (this.stop > 0) {
      this.stop = Math.max(0, this.stop - dt);
    } else {
      this.clock += dt;
    }
    // HP 줄의 남은 몫은 벽시계로 따라 내려간다(멈춰 있는 동안에도 '깎였다' 가 보이게)
    for (const f of this.all) {
      if (f.trailHold > 0) f.trailHold -= dt;
      else if (f.trail > f.hp) f.trail = Math.max(f.hp, f.trail - Math.max(f.maxHp * 0.0016, (f.trail - f.hp) * 0.012) * dt);
      else f.trail = f.hp;
      const want = f.dead && this.clock - f.deadAt > 220 ? 0 : 1;
      f.barAlpha += (want - f.barAlpha) * Math.min(1, dt / 120);
    }
    while (this.qi < this.queue.length && this.queue[this.qi].at <= this.clock) {
      this._play(this.queue[this.qi].turn, this.queue[this.qi].at);
      this.qi++;
    }
    // 예약해 둔 일(닿는 순간 · 날아가 닿기 · 쓰러짐)
    for (const e of this.fx) {
      if (e.kind === 'call' && !e.done && this.clock >= e.at) { e.done = true; e.fn(); }
    }
    this.fx = this.fx.filter((e) => !(e.kind === 'call' && e.done) && !this._expired(e));
    // 끝나기 직전 — 살아남은 몸은 제 칸으로 돌아간다(끝나는 순간 뚝 하고 제자리로 튀지 않게)
    if (!this.returning && this.clock >= this.endAt - RETURN_MS) {
      this.returning = true;
      for (const f of this.all) {
        if (f.dead) continue;
        const o = this._offset(f);
        f.from = { x: o.x, y: o.y };
        f.home = { x: 0, y: 0 };
        f.moveT0 = this.clock;
        f.moveDur = RETURN_MS - 40;
        f.hop = f === this.me && this.ranged && Math.abs(o.x) > 6;
      }
    }
    if (this.clock >= this.endAt && this.stop <= 0) this.over = true;
  }

  /** 싸움이 끝났다 — 몸은 필드가 다시 그리고, 이펙트만 남긴다. 다 지면 idle */
  release() {
    this.released = true;
    this.stop = 0;
    // 숫자 · 동전 · 불티 · 맞은 자리만 남긴다(호 · 날아가는 것 · 예약은 버린다)
    this.fx = this.fx.filter((e) => e.kind === 'num' || e.kind === 'coin' || e.kind === 'spark' || e.kind === 'sprite' || e.kind === 'ring');
  }

  get idle() { return this.released && this.fx.length === 0; }

  /**
   * 다 진 이펙트인가. 몸의 움직임은 싸움 시계(히트스톱에 멈춘다)를 따르고,
   * 불티 · 맞은 자리 · 숫자 · 동전은 **벽시계**를 따른다(wall) — 멈춘 동안에도 터져 나와야
   * '맞은 순간 시간이 멎고 그 사이로 불꽃이 튄다' 가 된다.
   */
  _expired(e) { return e.end != null && (e.wall ? this.wall : this.clock) > e.end; }

  _later(ms, fn) { this.fx.push({ kind: 'call', at: this.clock + ms, fn, done: false }); }
  _hitStop(ms) { this.stop = Math.max(this.stop, ms); }
  _shake(amp, dur = 220) {
    if (!this.shakeOn || amp <= 0) return;
    if (amp >= this._shakeNow()) this.shake = { amp, t0: this.wall, dur };
  }
  _shakeNow() {
    const u = clamp01((this.wall - this.shake.t0) / this.shake.dur);
    return this.shake.amp * (1 - u) * (1 - u);
  }
  /** 화면 흔들림 — 카메라에 더할 값 */
  shakeOffset() {
    const a = this._shakeNow();
    if (a < 0.05) return { x: 0, y: 0 };
    const t = this.wall;
    return { x: Math.sin(t / 17) * a + Math.sin(t / 7.3) * a * 0.35, y: Math.cos(t / 21) * a * 0.7 };
  }

  _fighter(side, index) {
    if (side === 'player') return this.me;
    return this.foes.find((f) => f.index === index) || this.foes[0];
  }

  /** 바꿔 끼우기 전 동작의 자세를 남겨 두었다가 짧게 녹인다 */
  _replace(f, types) {
    const keep = [];
    for (const a of f.anims) {
      if (types.includes(a.type)) {
        const p = this._animPose(f, a, this.clock);
        f.residual = { p, t0: this.clock, dur: 120 };
      } else keep.push(a);
    }
    f.anims = keep;
  }

  // ── 한 칸 재생 ─────────────────────────────────────────────
  _play(turn) {
    if (this.onEvent) this.onEvent(turn);
    if (turn.type === 'hit') this._playHit(turn);
    else if (turn.type === 'miss') this._playMiss(turn);
    else if (turn.type === 'heal') {
      const f = this.me;
      f.hp = turn.actorHpAfter ?? f.hp;
      f.trail = Math.max(f.trail, f.hp);
      f.anims.push({ type: 'glow', t0: this.clock, dur: 520, color: 'heal' });
      const b = this._base(f);
      if (turn.amount > 0) this._number(b.x, b.y - this._h(f) - NUM_UP, `+${turn.amount}`, 'heal');
      for (let i = 0; i < 9; i++) this._spark(b.x + (Math.random() - 0.5) * 22, b.y - Math.random() * 30, (Math.random() - 0.5) * 0.02, -0.04 - Math.random() * 0.05, 520, 'heal', 0);
    } else if (turn.type === 'defeat') {
      const f = this._fighter(turn.actor, turn.actorIndex);
      // 마지막 한 대가 닿은 **뒤에** 쓰러진다(날아가는 불덩이가 아직 공중이면 기다린다)
      const wait = Math.max(0, (f.lastImpact || 0) - this.clock) + 40;
      this._later(wait, () => this._die(f));
    }
  }

  _playHit(turn) {
    const A = this._fighter(turn.actor, turn.actorIndex);
    const B = this._fighter(turn.target, turn.targetIndex);
    const kind = hitKindOf(this.state, turn);
    const w = hitWeight(turn);
    const crit = !!turn.crit;
    // 광역 여파 — 휘두르지 않는다. 맞은 쪽에서 불길만 터진다.
    if (turn.tag === 'cleave') {
      B.lastImpact = this.clock + 60;
      this._later(60, () => this._impact(A, B, turn, kind, w, false, { splash: true }));
      return;
    }
    const strikeAt = turn.tag === 'counter' ? 80 : (STRIKE_AT[kind] || 160);
    this._replace(A, ['attack', 'cast', 'shoot']);
    const flying = kind === 'pierce' || kind === 'fire' || kind === 'magic';
    const type = kind === 'fire' || (kind === 'magic' && A.side === 'player') ? 'cast' : flying ? 'shoot' : 'attack';
    const aBase = this._base(A), bBase = this._base(B);
    const dist = Math.hypot(bBase.x - aBase.x, bBase.y - aBase.y);
    const dir = Math.sign(bBase.x - aBase.x) || 1;
    // 붙어 때리는 쪽은 상대 쪽으로 파고든다. 멀리서 쏘는 몬스터도 살짝은 다가온다(전투 화면 0.58 과 같은 몫)
    const reach = type === 'attack' ? Math.min(16, Math.max(8, dist * 0.42)) : A.side === 'monster' ? 6 : 0;
    A.anims.push({ type, t0: this.clock, strikeAt, dur: strikeAt + 360, dir, reach, ty: (bBase.y - aBase.y) * (reach / Math.max(1, dist)), crit, kind, pounce: A.side === 'monster' && type === 'attack' });
    // 내딛는 발에서 먼지
    if (type === 'attack') this._later(strikeAt - 40, () => this._dust(this._base(A).x, this._base(A).y, dir));
    if (flying) {
      const speed = FLY_PX_PER_MS[kind] || 0.6;
      const flight = Math.max(90, dist / speed);
      const charge = turn.tag === 'charge';
      this._later(strikeAt, () => {
        this.fx.push({ kind: 'shot', what: kind, from: A, to: B, t0: this.clock, dur: flight, crit, big: charge ? 1.6 : crit ? 1.25 : 1, end: this.clock + flight + 10 });
      });
      B.lastImpact = this.clock + strikeAt + flight;
      this._later(strikeAt + flight, () => this._impact(A, B, turn, kind, w, crit, { charge }));
    } else {
      // 칼 · 발톱이 그리는 호
      this._later(strikeAt - 45, () => this.fx.push({ kind: 'arc', who: A, dir, t0: this.clock, dur: 230, crit, monster: A.side === 'monster', end: this.clock + 240 }));
      B.lastImpact = this.clock + strikeAt;
      this._later(strikeAt, () => this._impact(A, B, turn, kind, w, crit, {}));
    }
    // 나를 때린 몬스터에게 가시가 되돌아간다
    if (turn.thornsBack > 0) {
      this._later(strikeAt + 70, () => {
        const b = this._base(A);
        this._number(b.x + 8, b.y - this._h(A) - NUM_UP, String(turn.thornsBack), 'thorns');
        A.anims.push({ type: 'hit', t0: this.clock, dur: 240, dir: -dir, push: 3, crit: false });
      });
    }
  }

  _impact(A, B, turn, kind, w, crit, { splash = false, charge = false } = {}) {
    const a = this._base(A), b = this._base(B);
    const dir = Math.sign(b.x - a.x) || (B.side === 'monster' ? 1 : -1);
    this._replace(B, ['hit', 'dodge']);
    const push = crit ? 10 : w >= 2 ? 8 : w === 1 ? 6 : splash ? 3 : 4.5;
    B.anims.push({ type: 'hit', t0: this.clock, dur: crit ? 420 : 340, dir, push, crit, heavy: w });
    B.hp = turn.targetHpAfter ?? B.hp;
    B.trailHold = 320;
    if (turn.actorHpAfter != null && A.side === 'player') A.hp = turn.actorHpAfter;
    const h = this._h(B);
    const cx = b.x, cy = b.y - h * 0.55;
    // 맞은 자리 — 무엇으로 맞았나(칼자국 · 화살 · 불길 · 마력 · 둔기)
    const fxKey = KIND_FX[kind] || 'fx_impact';
    this.fx.push({ kind: 'sprite', key: fxKey, x: cx, y: cy, t0: this.wall, dur: 300, rot: (Math.random() - 0.5) * 0.9 + (dir < 0 ? Math.PI : 0), size: (splash ? 30 : 40) * (charge ? 1.6 : 1) * (w >= 2 ? 1.15 : 1), add: true, end: this.wall + 310, wall: true });
    if (crit) {
      this.fx.push({ kind: 'sprite', key: 'fx_crit', x: cx, y: cy, t0: this.wall, dur: 400, rot: 0, size: 60, crit: true, end: this.wall + 410, wall: true });
      this.fx.push({ kind: 'ring', x: cx, y: cy, t0: this.wall, dur: 360, r0: 8, r1: 46, color: 'crit', end: this.wall + 370, wall: true });
    }
    if (kind === 'fire' || charge) this.fx.push({ kind: 'ring', x: cx, y: cy, t0: this.wall, dur: 300, r0: 6, r1: charge ? 52 : 30, color: 'fire', end: this.wall + 310, wall: true });
    // 불티 — 맞은 쪽 반대편으로 흩어진다
    const n = crit ? 16 : w >= 1 ? 10 : 7;
    for (let i = 0; i < n; i++) {
      const ang = (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.4;
      const sp = 0.06 + Math.random() * (crit ? 0.2 : 0.13);
      this._spark(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp - 0.05, 260 + Math.random() * 220, kind, 0.0004);
    }
    // 숫자
    const style = B.side === 'player' ? 'taken' : crit ? 'crit' : w >= 2 ? 'huge' : w === 1 ? 'big' : 'normal';
    this._number(b.x, b.y - h - NUM_UP, crit ? `${turn.damage}!` : String(turn.damage), style);
    if (turn.healed > 0 && A.side === 'player') this._number(a.x - 10, a.y - this._h(A) - NUM_UP, `+${turn.healed}`, 'heal');
    if (turn.survived) {
      B.anims.push({ type: 'glow', t0: this.clock, dur: 700, color: 'gold' });
      this._number(b.x, b.y - h - NUM_UP - 16, '버텼다!', 'tag');
    }
    if (turn.shielded) {
      B.shieldUntil = this.clock + 1600;
      this._number(b.x, b.y - h - NUM_UP - 16, '보호막', 'tag');
    }
    // 손맛 — 멈춤과 흔들림
    if (!splash) this._hitStop(crit ? HITSTOP_CRIT : HITSTOP[Math.min(2, w)]);
    this._shake(crit ? SHAKE_CRIT : SHAKE_PX[Math.min(2, w)] + (charge ? 2 : 0), crit ? 280 : 200);
  }

  _playMiss(turn) {
    const A = this._fighter(turn.actor, turn.actorIndex);
    const B = this._fighter(turn.target, turn.targetIndex);
    const kind = hitKindOf(this.state, { ...turn, type: 'hit' });
    const strikeAt = STRIKE_AT[kind] || 160;
    const aBase = this._base(A), bBase = this._base(B);
    const dir = Math.sign(bBase.x - aBase.x) || 1;
    this._replace(A, ['attack', 'cast', 'shoot']);
    const flying = kind === 'pierce' || kind === 'fire' || kind === 'magic';
    A.anims.push({ type: flying ? (kind === 'fire' ? 'cast' : 'shoot') : 'attack', t0: this.clock, strikeAt, dur: strikeAt + 340, dir, reach: flying ? 0 : 12, ty: 0, pounce: A.side === 'monster' && !flying });
    if (!flying) this._later(strikeAt - 45, () => this.fx.push({ kind: 'arc', who: A, dir, t0: this.clock, dur: 200, crit: false, monster: A.side === 'monster', miss: true, end: this.clock + 210 }));
    this._later(strikeAt - 30, () => {
      this._replace(B, ['dodge']);
      if (turn.tag === 'shield') {
        B.shieldUntil = Math.max(B.shieldUntil || 0, this.clock + 900);
        const b = this._base(B);
        this._number(b.x, b.y - this._h(B) - NUM_UP, '막음', 'miss');
      } else {
        B.anims.push({ type: 'dodge', t0: this.clock, dur: 360, dir });
        const b = this._base(B);
        this._number(b.x, b.y - this._h(B) - NUM_UP, turn.tag === 'guard' ? '흘림' : '빗나감', 'miss');
      }
    });
  }

  _die(f) {
    if (f.dead) return;
    f.dead = true;
    f.deadAt = this.clock;
    f.hp = 0;
    this._replace(f, ['attack', 'cast', 'shoot', 'hit', 'dodge']);
    const b = this._base(f);
    const dir = f.side === 'monster' ? (Math.sign(b.x - this._base(this.me).x) || 1) : -this.facing;
    f.anims.push({ type: 'death', t0: this.clock, dur: f.side === 'player' ? 99999 : 760, dir });
    this._hitStop(70);
    this._shake(2.2, 220);
    const h = this._h(f);
    if (f.side === 'monster') {
      // 넋 — 흐린 불빛 몇 개가 위로 흩어진다
      for (let i = 0; i < 7; i++) this._spark(b.x + (Math.random() - 0.5) * 26, b.y - Math.random() * h * 0.7, (Math.random() - 0.5) * 0.05, -0.045 - Math.random() * 0.05, 600 + Math.random() * 300, 'soul', -0.00002, 1.1 + Math.random() * 0.6);
      // 동전 — 둘셋이 포물선을 그리며 튀어 떨어진다
      const coins = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < coins; i++) {
        const vx = (dir * (0.03 + Math.random() * 0.05)) * (i % 2 ? 1 : 0.6) + (Math.random() - 0.5) * 0.03;
        this.fx.push({ kind: 'coin', x: b.x, y: b.y - 6, vx, vy: -0.16 - Math.random() * 0.06, gy: 0.0009, ground: b.y + 2 + (Math.random() - 0.5) * 8, t0: this.wall + 280 + i * 60, dur: 1100, end: this.wall + 1500, spin: Math.random() * 6, wall: true });
      }
    }
  }

  // ── 몸이 그릴 높이(숫자 · HP 줄 자리) ────────────────────────
  _h(f) { return f.actor._drawH || (f.side === 'player' ? 60 : 40); }

  _number(x, y, text, style) {
    // 같은 자리에 아직 떠 있는 숫자가 있으면 **먼저 뜬 것들을 위로 밀어 올린다**(새 숫자는 늘 같은 자리에서 튄다).
    //   새 것을 비켜 띄우면 떠오르는 옛 숫자와 다시 만나 포개진다 — 밀어 올리면 줄이 쌓이듯 읽힌다.
    for (const e of this.fx) {
      // 같은 몸 머리 위의 것만(옆 몬스터의 숫자까지 밀면 둘이 엉킨다)
      if (e.kind !== 'num' || Math.abs(e.x0 - x) > 34 || Math.abs(e.y0 - y) > 20 || this.wall - e.t0 > e.dur * 0.8) continue;
      e.bump = (e.bump || 0) + (e.style === 'crit' ? 18 : 14);
    }
    this.fx.push({ kind: 'num', x0: x + (Math.random() - 0.5) * 6, y0: y, text, style, t0: this.wall, dur: style === 'crit' ? 1050 : 820, drift: (Math.random() - 0.5) * 8, end: this.wall + 1100, wall: true, bump: 0, bumpShow: 0 });
  }

  _spark(x, y, vx, vy, life, kind, g = 0.0004, size = 0) {
    this.fx.push({ kind: 'spark', x, y, vx, vy, g, t0: this.wall, dur: life, what: kind, size: size || (1.2 + Math.random() * 1.6), end: this.wall + life, wall: true });
  }

  _dust(x, y, dir) {
    for (let i = 0; i < 3; i++) {
      this.fx.push({ kind: 'dust', x: x - dir * (4 + i * 4), y: y - 1, vx: -dir * (0.01 + Math.random() * 0.02), t0: this.clock + i * 25, dur: 380, r: 3 + Math.random() * 2, end: this.clock + 420 });
    }
  }

  // ── 자세 ──────────────────────────────────────────────────
  /** 한 동작이 지금 만드는 자세(더하기 · 곱하기로 합친다) */
  _animPose(f, a, now) {
    const u = now - a.t0;
    const p = NEUTRAL();
    p.frame = null;
    if (u < 0) return p;
    if (a.type === 'attack') {
      // 움츠림 → 돌진 → 되돌아옴
      const s = a.strikeAt;
      const wind = s * 0.62;
      if (u < wind) {
        const k = outQuad(u / wind);
        p.x = -a.dir * 3.5 * k; p.sx = 1 + 0.07 * k; p.sy = 1 - 0.07 * k; p.rot = -a.dir * 0.09 * k;
        p.frame = 'windup';
      } else if (u < s + 40) {
        const k = inQuad(clamp01((u - wind) / (s - wind)));
        p.x = lerp(-3.5, a.reach, k) * a.dir; p.y = a.ty * k;
        if (a.pounce) p.lift = Math.sin(k * Math.PI) * 6;
        p.sx = lerp(1.07, 0.93, k); p.sy = lerp(0.93, 1.07, k); p.rot = lerp(-0.09, 0.15, k) * a.dir;
        p.frame = 'attack';
        p.ghost = k > 0.2;
      } else {
        const k = outCubic(clamp01((u - s - 40) / (a.dur - s - 40)));
        p.x = lerp(a.reach, 0, k) * a.dir; p.y = lerp(a.ty, 0, k);
        p.sx = lerp(0.93, 1, outBack(k)); p.sy = lerp(1.07, 1, outBack(k)); p.rot = lerp(0.15, 0, k) * a.dir;
        p.frame = u < s + 190 ? 'attack' : null;
      }
    } else if (a.type === 'shoot') {
      // 당겼다 놓는다 — 놓는 순간 뒤로 튄다
      const s = a.strikeAt;
      if (u < s) {
        const k = outQuad(u / s);
        p.x = -a.dir * 2.5 * k + (a.reach || 0) * a.dir * k; p.rot = -a.dir * 0.06 * k; p.sx = 1 - 0.03 * k; p.sy = 1 + 0.02 * k;
        p.frame = 'windup';
      } else {
        const k = clamp01((u - s) / (a.dur - s));
        const kick = Math.sin(clamp01(k * 3) * Math.PI) * (1 - k);
        p.x = (-a.dir * (2.5 + 4 * kick)) * (1 - outCubic(k)) + (a.reach || 0) * a.dir * (1 - outCubic(k));
        p.rot = -a.dir * 0.06 * (1 - outCubic(k));
        p.frame = u < s + 200 ? 'attack' : null;
      }
    } else if (a.type === 'cast') {
      // 부풀며 모았다가 내던진다
      const s = a.strikeAt;
      if (u < s) {
        const k = outQuad(u / s);
        p.lift = 2.5 * k; p.sx = 1 + 0.05 * k; p.sy = 1 + 0.05 * k; p.flash = 0.18 * k;
        p.frame = 'windup';
        p.charge = k;
      } else {
        const k = clamp01((u - s) / (a.dur - s));
        p.x = a.dir * 3 * Math.sin(clamp01(k * 2.5) * Math.PI) * (1 - k);
        p.lift = 2.5 * (1 - outCubic(k)); p.sx = 1 + 0.05 * (1 - outCubic(k)); p.sy = p.sx;
        p.frame = u < s + 200 ? 'attack' : null;
      }
    } else if (a.type === 'hit') {
      // 밀려났다(빠르게) 돌아온다(살짝 넘쳤다 가라앉음)
      const out = 70;
      if (u < out) {
        const k = outCubic(u / out);
        p.x = a.dir * a.push * k; p.sx = 1 + 0.1 * k; p.sy = 1 - 0.1 * k; p.rot = a.dir * 0.1 * k;
      } else {
        const k = clamp01((u - out) / (a.dur - out));
        const b = outBack(k);
        p.x = a.dir * a.push * (1 - b); p.sx = 1 + 0.1 * (1 - b); p.sy = 1 - 0.1 * (1 - b); p.rot = a.dir * 0.1 * (1 - k);
      }
      p.flash = 0.85 * Math.max(0, 1 - u / (a.crit ? 200 : 130));
      p.frame = u < (a.crit ? 300 : 230) ? 'hurt' : null;
    } else if (a.type === 'dodge') {
      const k = clamp01(u / a.dur);
      const s = Math.sin(k * Math.PI);
      // 옆으로 비켜 뛴다 — 맞는 쪽 반대로(때린 쪽에서 멀어지게)
      p.x = a.dir * 7 * s; p.lift = 5 * s; p.alpha = 1 - 0.25 * s; p.rot = -a.dir * 0.05 * s;
    } else if (a.type === 'glow') {
      const k = clamp01(u / a.dur);
      p.flash = 0.45 * Math.sin(k * Math.PI);
      p.glow = a.color;
      p.glowK = Math.sin(k * Math.PI);
    } else if (a.type === 'death') {
      if (f.side === 'player') {
        const k = outCubic(clamp01(u / 420));
        p.rot = a.dir * 0.2 * k; p.flash = Math.max(0, 1 - u / 160); p.alpha = 1 - 0.25 * k;
        p.frame = 'down';
      } else {
        // 번쩍 → 눕는 그림 → 가라앉으며 사라짐
        const k = clamp01(u / a.dur);
        p.flash = Math.max(0, 1 - u / 140);
        p.frame = u < 90 ? 'hurt' : 'down';
        p.x = a.dir * 5 * outCubic(clamp01(u / 260));
        p.sy = 1 - 0.06 * outCubic(clamp01(u / 260));
        const fade = clamp01((u - 300) / (a.dur - 300));
        p.alpha = 1 - fade;
        p.y = 4 * fade;
        p.sx = 1 + 0.05 * fade;
      }
    }
    return p;
  }

  /**
   * 그릴 때 쓸 자세 — FieldScene 이 몸을 그리기 직전에 묻는다.
   * @returns {null | {x,y,rot,sx,sy,flash,alpha,frame,ghosts:[{x,y,alpha}],face:number,dead:boolean,gone:boolean}}
   */
  poseOf(actor) {
    if (this.released) return null;
    const f = this.byActor.get(actor);
    if (!f) return null;
    const now = this.clock;
    const base = this._base(f, now);
    const p = NEUTRAL();
    p.frame = null;
    let ghost = false, charge = 0, glow = null, glowK = 0;
    for (const a of f.anims) {
      if (now - a.t0 > a.dur) continue;
      const q = this._animPose(f, a, now);
      p.x += q.x; p.y += q.y; p.lift += q.lift; p.rot += q.rot; p.sx *= q.sx; p.sy *= q.sy;
      p.flash = Math.max(p.flash, q.flash); p.alpha *= q.alpha;
      if (q.frame) p.frame = q.frame;
      if (q.ghost) ghost = { a, f };
      if (q.charge) charge = q.charge;
      if (q.glow) { glow = q.glow; glowK = q.glowK; }
    }
    f.anims = f.anims.filter((a) => now - a.t0 <= a.dur);
    if (f.residual) {
      const r = f.residual;
      const k = 1 - clamp01((now - r.t0) / r.dur);
      if (k <= 0) f.residual = null;
      else {
        p.x += r.p.x * k; p.y += r.p.y * k; p.lift += r.p.lift * k; p.rot += r.p.rot * k;
        p.sx *= 1 + (r.p.sx - 1) * k; p.sy *= 1 + (r.p.sy - 1) * k;
      }
    }
    // 싸우는 동안의 숨 — 가만히 서 있어도 살아 있다
    if (!f.dead) {
      const br = Math.sin(this.wall / 260 + f.phase);
      p.sy *= 1 + 0.018 * br; p.sx *= 1 - 0.01 * br;
      if (!p.frame) p.frame = f.side === 'player' ? 'stance' : null;
      if (f.side === 'monster' && base.moving) p.frame = 'walk';
    }
    p.x += base.x - actor.px;
    p.y += base.y - actor.py;
    p.lift += base.lift;
    // 잔상 — 돌진하는 동안 지나온 자리에 흐린 그림 둘
    p.ghosts = [];
    if (ghost) {
      for (const [lag, al] of [[34, 0.34], [68, 0.18]]) {
        const q = this._animPose(f, ghost.a, now - lag);
        p.ghosts.push({ x: q.x + base.x - actor.px, y: q.y + base.y - actor.py, lift: q.lift + base.lift, alpha: al, frame: q.frame || 'attack', rot: q.rot, sx: q.sx, sy: q.sy });
      }
    }
    p.face = f.side === 'player' ? this.facing : (Math.sign(this._base(this.me).x - base.x) || 1);
    p.charge = charge;
    p.glow = glow; p.glowK = glowK;
    p.shield = (f.shieldUntil || 0) > now ? clamp01(((f.shieldUntil || 0) - now) / 300) : 0;
    p.dead = f.dead;
    p.gone = f.side === 'monster' && f.dead && now - f.deadAt > 760;
    return p;
  }

  // ── 그리기 ────────────────────────────────────────────────
  /** 몸보다 먼저(발밑) — 싸우는 자리 고리 */
  drawUnder(renderer) {
    const { ctx } = renderer;
    const cam = renderer.camera;
    ctx.save();
    for (const f of this.released ? [] : this.all) {
      if (f.dead && this.clock - f.deadAt > 400) continue;
      const b = this._base(f);
      const al = (f.side === 'player' ? 0.5 : 0.38) * f.barAlpha;
      const pulse = 1 + Math.sin(this.wall / 320 + f.phase) * 0.06;
      ctx.strokeStyle = f.side === 'player' ? `rgba(255,214,120,${al})` : `rgba(255,96,80,${al})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(b.x - cam.x, b.y - 2 - cam.y, 15 * pulse, 5.5 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // 먼지 — 발밑이라 몸보다 먼저
    for (const e of this.fx) {
      if (e.kind !== 'dust') continue;
      const u = clamp01((this.clock - e.t0) / e.dur);
      if (this.clock < e.t0) continue;
      const r = e.r * (1 + u * 1.6);
      ctx.fillStyle = `rgba(220,206,176,${0.45 * (1 - u)})`;
      ctx.beginPath();
      ctx.ellipse(e.x + e.vx * (this.clock - e.t0) - cam.x, e.y - u * 3 - cam.y, r, r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 몸 다음(위) — 호 · 날아가는 것 · 맞은 자리 · 불티 · 동전 · 숫자 · HP 줄 */
  drawOver(renderer) {
    const { ctx } = renderer;
    const cam = renderer.camera;
    const now = this.clock;
    ctx.save();
    for (const e of this.fx) {
      if (e.kind === 'arc') this._drawArc(ctx, cam, e, now);
      else if (e.kind === 'shot') this._drawShot(ctx, cam, e, now);
    }
    const at = (e) => (e.wall ? this.wall : now);
    for (const e of this.fx) {
      if (e.kind === 'sprite') this._drawFxSprite(renderer, cam, e, at(e));
      else if (e.kind === 'ring') this._drawRing(ctx, cam, e, at(e));
    }
    for (const e of this.fx) {
      if (e.kind === 'spark') this._drawSpark(ctx, cam, e, at(e));
      else if (e.kind === 'coin') this._drawCoin(ctx, cam, e, at(e));
    }
    // 보호막 · 빛
    for (const f of this.released ? [] : this.all) {
      const p = this.poseOf(f.actor);
      if (!p) continue;
      const b = this._base(f);
      if (p.glow && p.glowK > 0.02) {
        // 회복(초록) · 버텼다(금빛) — 몸 둘레에 번지는 빛
        const h = this._h(f);
        const gx = b.x - cam.x, gy = b.y - h * 0.5 - cam.y;
        const col = p.glow === 'heal' ? '120,255,150' : '255,214,110';
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(gx, gy, h * 0.1, gx, gy, h * 0.7);
        g.addColorStop(0, `rgba(${col},${0.34 * p.glowK})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(gx, gy, h * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (p.shield > 0) {
        const h = this._h(f);
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(b.x - cam.x, b.y - h * 0.5 - cam.y, h * 0.2, b.x - cam.x, b.y - h * 0.5 - cam.y, h * 0.62);
        g.addColorStop(0, 'rgba(120,190,255,0)');
        g.addColorStop(0.8, `rgba(120,190,255,${0.32 * p.shield})`);
        g.addColorStop(1, 'rgba(120,190,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(b.x - cam.x, b.y - h * 0.5 - cam.y, h * 0.62, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      if (p.charge > 0.05) {
        // 마법사 — 손끝에 모이는 불
        const hx = b.x + p.face * 12 - cam.x, hy = b.y - this._h(f) * 0.55 - cam.y;
        ctx.globalCompositeOperation = 'lighter';
        const r = 3 + 7 * p.charge;
        const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 1.8);
        g.addColorStop(0, `rgba(255,240,200,${0.9 * p.charge})`);
        g.addColorStop(0.4, `rgba(255,150,60,${0.7 * p.charge})`);
        g.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(hx, hy, r * 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    for (const e of this.fx) if (e.kind === 'num') this._drawNumber(ctx, cam, e, at(e));
    if (!this.released) for (const f of this.all) this._drawBar(ctx, cam, f);
    ctx.restore();
  }

  _drawArc(ctx, cam, e, now) {
    const u = (now - e.t0) / e.dur;
    if (u < 0 || u > 1) return;
    const b = this._base(e.who);
    const h = this._h(e.who);
    const cx = b.x + e.dir * (e.monster ? 10 : 12) - cam.x;
    const cy = b.y - h * (e.monster ? 0.45 : 0.5) - cam.y;
    const R = e.monster ? 15 : 21;
    // 휘두르는 쪽 — 위에서 앞 아래로(오른쪽을 볼 때 -120° → +45°)
    const a0 = -2.1, a1 = 0.8;
    const sweep = outCubic(clamp01(u / 0.38));
    const fade = 1 - clamp01((u - 0.3) / 0.7);
    const head = lerp(a0, a1, sweep);
    const tailA = lerp(a0, a1, Math.max(0, sweep - 0.55));
    ctx.save();
    ctx.translate(cx, cy);
    if (e.dir < 0) ctx.scale(-1, 1);
    ctx.globalCompositeOperation = 'lighter';
    const col = e.monster ? [255, 120, 110] : e.crit ? [255, 214, 120] : [210, 236, 255];
    const width = (e.crit ? 7 : 5) * (e.miss ? 0.7 : 1);
    // 초승달 — 머리 쪽이 굵고 꼬리로 갈수록 가늘어진다(가는 선 여러 겹)
    for (let i = 0; i < 8; i++) {
      const k = i / 7;
      const ang = lerp(tailA, head, k);
      const ang2 = lerp(tailA, head, Math.min(1, k + 0.16));
      ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.12 + 0.55 * k) * fade})`;
      ctx.lineWidth = width * (0.25 + 0.75 * k);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, R, ang, ang2);
      ctx.stroke();
    }
    // 가장자리 흰 날
    ctx.strokeStyle = `rgba(255,255,255,${0.75 * fade})`;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(0, 0, R + width * 0.45, Math.max(tailA, head - 0.9), head);
    ctx.stroke();
    if (e.monster) {
      // 발톱 — 같은 호 둘 더(짧게)
      for (const off of [-4, 4]) {
        ctx.strokeStyle = `rgba(255,170,160,${0.5 * fade})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, off, R - 3, Math.max(tailA, head - 0.7), head);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  _drawShot(ctx, cam, e, now) {
    const u = clamp01((now - e.t0) / e.dur);
    const A = this._base(e.from), B = this._base(e.to);
    const ah = this._h(e.from), bh = this._h(e.to);
    const dir = Math.sign(B.x - A.x) || 1;
    const x0 = A.x + dir * 12, y0 = A.y - ah * 0.55;
    const x1 = B.x, y1 = B.y - bh * 0.55;
    const arcH = e.what === 'pierce' ? 4 : 10;
    const pos = (k) => ({ x: lerp(x0, x1, k), y: lerp(y0, y1, k) - Math.sin(k * Math.PI) * arcH });
    const p = pos(u), q = pos(Math.max(0, u - 0.06));
    const ang = Math.atan2(p.y - q.y, p.x - q.x) || (dir > 0 ? 0 : Math.PI);
    const big = e.big || 1;
    ctx.save();
    if (e.what === 'pierce') {
      // 화살 — 뒤로 끌리는 빛줄기(지나온 길을 따라)
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 5; i++) {
        const t = pos(Math.max(0, u - i * 0.035));
        ctx.strokeStyle = `rgba(214,255,176,${0.32 * (1 - i / 6)})`;
        ctx.lineWidth = 2.2 * big;
        ctx.beginPath(); ctx.moveTo(t.x - cam.x, t.y - cam.y); ctx.lineTo(p.x - cam.x, p.y - cam.y); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.translate(p.x - cam.x, p.y - cam.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#d9c89a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-11 * big, 0); ctx.lineTo(3 * big, 0); ctx.stroke();
      ctx.fillStyle = '#f2f6ff';
      ctx.beginPath(); ctx.moveTo(6 * big, 0); ctx.lineTo(1 * big, -2.2 * big); ctx.lineTo(1 * big, 2.2 * big); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9be86b';
      ctx.beginPath(); ctx.moveTo(-11 * big, 0); ctx.lineTo(-8 * big, -2.6 * big); ctx.lineTo(-6 * big, 0); ctx.lineTo(-8 * big, 2.6 * big); ctx.closePath(); ctx.fill();
    } else {
      // 불덩이 · 마력탄 — 뒤로 넘실대는 꼬리, 흰 심
      const fire = e.what === 'fire';
      const r = (fire ? 6 : 5) * big * (1 + Math.sin(now / 45) * 0.1);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 6; i++) {
        const t = pos(Math.max(0, u - i * 0.04));
        const rr = r * (1 - i / 8);
        const g = ctx.createRadialGradient(t.x - cam.x, t.y - cam.y, 0, t.x - cam.x, t.y - cam.y, rr * 1.6);
        g.addColorStop(0, fire ? `rgba(255,170,70,${0.35 * (1 - i / 7)})` : `rgba(190,140,255,${0.35 * (1 - i / 7)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(t.x - cam.x, t.y - cam.y, rr * 1.6, 0, Math.PI * 2); ctx.fill();
      }
      const g = ctx.createRadialGradient(p.x - cam.x, p.y - cam.y, 0, p.x - cam.x, p.y - cam.y, r * 1.9);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.3, fire ? '#fff1bf' : '#efe2ff');
      g.addColorStop(0.6, fire ? 'rgba(255,140,50,0.85)' : 'rgba(170,110,255,0.8)');
      g.addColorStop(1, fire ? 'rgba(200,40,10,0)' : 'rgba(90,40,200,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x - cam.x, p.y - cam.y, r * 1.9, 0, Math.PI * 2); ctx.fill();
      // 불똥 — 날아가며 떨어뜨린다
      if (fire && Math.random() < 0.55) this._spark(p.x, p.y, (Math.random() - 0.5) * 0.03, -0.02 + Math.random() * 0.02, 260, 'fire', 0.0002);
    }
    ctx.restore();
  }

  _drawFxSprite(renderer, cam, e, now) {
    const u = (now - e.t0) / e.dur;
    if (u < 0 || u > 1) return;
    const asset = renderer.assets.get(e.key);
    if (!asset || !asset.image) return;
    // 크게 부딪혔다 가라앉는다
    const pop = e.crit ? (u < 0.22 ? lerp(0.45, 1.3, outQuad(u / 0.22)) : lerp(1.3, 1.05, outCubic((u - 0.22) / 0.78)))
      : (u < 0.3 ? lerp(0.55, 1.15, outQuad(u / 0.3)) : lerp(1.15, 1.0, (u - 0.3) / 0.7));
    const alpha = e.crit ? 1 - clamp01((u - 0.35) / 0.65) : 1 - clamp01((u - 0.25) / 0.75);
    const s = e.size * pop;
    const { ctx } = renderer;
    ctx.save();
    ctx.translate(e.x - cam.x, e.y - cam.y);
    ctx.rotate(e.rot || 0);
    ctx.globalAlpha = alpha;
    if (e.add) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(asset.image, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  _drawRing(ctx, cam, e, now) {
    const u = (now - e.t0) / e.dur;
    if (u < 0 || u > 1) return;
    const r = lerp(e.r0, e.r1, outCubic(u));
    const al = 1 - u;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = e.color === 'crit' ? `rgba(255,220,140,${0.7 * al})` : `rgba(255,150,70,${0.6 * al})`;
    ctx.lineWidth = 2.5 * (1 - u) + 0.6;
    ctx.beginPath();
    ctx.ellipse(e.x - cam.x, e.y - cam.y, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawSpark(ctx, cam, e, now) {
    const t = now - e.t0;
    if (t < 0) return;
    const u = clamp01(t / e.dur);
    const x = e.x + e.vx * t - cam.x;
    const y = e.y + e.vy * t + 0.5 * e.g * t * t - cam.y;
    const al = 1 - u;
    const COL = {
      slash: [220, 240, 255], pierce: [230, 255, 200], fire: [255, 170, 70], magic: [200, 160, 255],
      impact: [255, 214, 160], guard: [200, 220, 255], heal: [140, 255, 170], soul: [196, 206, 255],
    };
    const c = COL[e.what] || COL.impact;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (e.what === 'soul' || e.what === 'heal') {
      const r = e.size * (e.what === 'soul' ? 1.6 : 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.8 * al})`);
      g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
    } else {
      // 불티는 짧은 선 — 날아가는 쪽으로 늘어진다
      const vx = e.vx, vy = e.vy + e.g * t;
      const len = Math.min(7, Math.hypot(vx, vy) * 40);
      const ang = Math.atan2(vy, vx);
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${al})`;
      ctx.lineWidth = e.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawCoin(ctx, cam, e, now) {
    const t = now - e.t0;
    if (t < 0) return;
    let x = e.x + e.vx * t;
    let y = e.y + e.vy * t + 0.5 * e.gy * t * t;
    // 땅에 닿으면 한 번 튀고 선다
    if (y > e.ground) {
      const tHit = (-e.vy + Math.sqrt(Math.max(0, e.vy * e.vy + 2 * e.gy * (e.ground - e.y)))) / e.gy;
      const t2 = t - tHit;
      const vy2 = -(e.vy + e.gy * tHit) * 0.35;
      y = e.ground + vy2 * t2 + 0.5 * e.gy * t2 * t2;
      x = e.x + e.vx * tHit + e.vx * 0.4 * t2;
      if (y > e.ground) { y = e.ground; x = e.x + e.vx * tHit + e.vx * 0.4 * Math.max(0, -2 * vy2 / e.gy); }
    }
    const u = clamp01(t / e.dur);
    const al = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
    const spin = Math.abs(Math.cos(e.spin + t / 70));
    ctx.save();
    ctx.globalAlpha = al;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x - cam.x, e.ground + 1 - cam.y, 2.6, 1, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(x - 3 - cam.x, y - 3 - cam.y, x + 3 - cam.x, y + 3 - cam.y);
    g.addColorStop(0, '#fff4b0'); g.addColorStop(0.5, '#f5c542'); g.addColorStop(1, '#b07a12');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x - cam.x, y - 3 - cam.y, 3 * Math.max(0.25, spin), 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,0,0.8)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.restore();
  }

  _drawNumber(ctx, cam, e, now) {
    const t = now - e.t0;
    if (t < 0) return;
    const u = clamp01(t / e.dur);
    const S = {
      normal: { size: 12, fill: '#ffffff', stroke: '#6b1010' },
      big: { size: 14, fill: '#ffd0a0', stroke: '#7a2a10' },
      huge: { size: 16, fill: '#ffb4a0', stroke: '#7a1010' },
      crit: { size: 19, fill: '#fff3c4', stroke: '#7a4b00', glow: 'rgba(255,200,80,0.85)' },
      taken: { size: 12, fill: '#ffd9d9', stroke: '#6b1010' },
      heal: { size: 12, fill: '#b9ffc8', stroke: '#145a2a' },
      miss: { size: 10, fill: '#dfe6f2', stroke: '#2a3344' },
      thorns: { size: 10, fill: '#ffcf8a', stroke: '#5a3000' },
      tag: { size: 10, fill: '#ffe9a8', stroke: '#4a3000' },
    }[e.style] || { size: 12, fill: '#fff', stroke: '#000' };
    // 튀어 오름(넘침) → 가라앉음, 그리고 감속하며 떠오름
    const popIn = e.style === 'crit' ? 0.12 : 0.1;
    const pop = u < popIn ? lerp(0.35, e.style === 'crit' ? 1.55 : 1.25, outQuad(u / popIn))
      : u < popIn + 0.12 ? lerp(e.style === 'crit' ? 1.55 : 1.25, 1, outCubic((u - popIn) / 0.12)) : 1;
    const rise = outCubic(u) * (e.style === 'crit' ? 22 : 18);
    const al = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
    // 밀려 올라간 몫은 부드럽게 따라간다(뚝 하고 한 줄 뛰지 않게)
    e.bumpShow = (e.bumpShow || 0) + ((e.bump || 0) - (e.bumpShow || 0)) * 0.35;
    const x = e.x0 + e.drift * outCubic(u) - cam.x;
    const y = e.y0 - rise - e.bumpShow - cam.y;
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.font = `900 ${S.size}px system-ui, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (S.glow) { ctx.shadowColor = S.glow; ctx.shadowBlur = 8; }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = S.stroke;
    ctx.lineWidth = Math.max(2.4, S.size * 0.22);
    ctx.strokeText(e.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.fillStyle = S.fill;
    ctx.fillText(e.text, 0, 0);
    ctx.restore();
  }

  _drawBar(ctx, cam, f) {
    if (f.barAlpha < 0.02) return;
    const b = this._base(f);
    const boss = f.side === 'monster' && f.actor.isBoss;
    const w = boss ? 44 : f.side === 'player' ? 30 : 28;
    const h = 3.4;
    const x = b.x - w / 2 - cam.x;
    const y = b.y - this._h(f) - 7 - cam.y + (f.side === 'player' ? -2 : 0);
    const k = Math.max(0, f.hp / Math.max(1, f.maxHp));
    const kt = Math.max(k, f.trail / Math.max(1, f.maxHp));
    ctx.save();
    ctx.globalAlpha = f.barAlpha;
    ctx.fillStyle = 'rgba(10,14,22,0.78)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    // 깎인 몫 — 잠깐 남았다 따라 내려간다
    ctx.fillStyle = 'rgba(255,236,170,0.95)';
    ctx.fillRect(x, y, w * kt, h);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (f.side === 'player') { g.addColorStop(0, '#9cf59a'); g.addColorStop(1, '#3fae4a'); }
    else { g.addColorStop(0, '#ff8a7a'); g.addColorStop(1, '#c92a2a'); }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * k, h);
    ctx.restore();
  }
}
