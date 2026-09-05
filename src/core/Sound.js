// 책임: 소리 — 전투 효과음과 접속 화면의 배경 음악.
// 금지: 게임 상태 읽기·쓰기. 불러 주면 소리만 낸다.
// 금지: 소리 파일. **한 바이트도 안 싣는다** — 전부 그 자리에서 만들어 낸다.
//
// ── 왜 파일을 안 쓰나 ──────────────────────────────────────
// 이 게임은 파일 하나(dragon-field.html)로도 돌아간다. 1분짜리 음악을 wav 로
// 넣으면 그 한 파일이 3MB 에서 10MB 를 넘어간다 — 그러면 폰에서 여는 데만 한참이다.
// 웹오디오로 그 자리에서 만들면 **0 바이트**이고, 반복 이음매도 완벽하다
// (마디를 계산해 이어 붙이므로 파일 끝에서 튀는 일이 없다).
//
// ── 소리를 켜려면 사람이 먼저 눌러야 한다 ─────────────────
// 브라우저는 사람이 화면을 한 번 누르기 전에는 소리를 못 내게 막는다(자동재생 정책).
// 그래서 AudioContext 를 미리 만들지 않고, 첫 조작에서 unlock() 이 불릴 때 만든다.
// 접속 화면의 '접속' 단추가 그 첫 조작이라 음악이 자연스럽게 그때 시작된다.

const A4 = 440;

/** 음이름 → 주파수. 'A4' · 'C#5' · 'Eb3' 를 읽는다. */
export function noteFreq(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).trim());
  if (!m) return 440;
  const base = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 }[m[1]];
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return A4 * Math.pow(2, (base + accidental + (octave - 4) * 12) / 12);
}

export class Sound {
  /** @param {() => object} getSettings 설정값(music · sfx · volume)을 읽어 온다 */
  constructor(getSettings = () => ({})) {
    this.getSettings = getSettings;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this._plucks = new Map(); // 주파수별로 한 번만 만들어 두고 돌려 쓴다
    this._bgm = null; // { name, stopAt, timer }
    this._failed = false;
  }

  /**
   * 소리를 낼 수 있게 연다. **사람이 무언가를 누른 순간**에 부른다.
   * 여러 번 불러도 안전하다.
   */
  unlock() {
    if (this._failed) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this._failed = true; return null; }
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.musicGain.connect(this.master);
        this.sfxGain.connect(this.master);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this._applyVolume();
      return this.ctx;
    } catch {
      // 소리를 못 내는 환경(정책·기기)에서도 게임은 그대로 돌아가야 한다.
      this._failed = true;
      return null;
    }
  }

  /** 설정이 바뀌면 불러 준다. 음량·켜짐을 바로 반영한다. */
  refresh() {
    if (this.ctx) this._applyVolume();
  }

  _applyVolume() {
    const s = this.getSettings() || {};
    const vol = Math.max(0, Math.min(1, (s.volume ?? 60) / 100));
    this.master.gain.value = vol;
    this.musicGain.gain.value = s.music === false ? 0 : 0.5;
    this.sfxGain.gain.value = s.sfx === false ? 0 : 1;
  }

  // ───────────────────────────────────────────────────────────
  // 뜯는 소리 — 하프·활시위처럼 튕겨서 잦아드는 音
  //
  // 카플러스-스트롱: 짧은 잡음을 만들어 놓고 그것을 조금씩 흐리게 하며
  // 되풀이한다. 줄 하나가 떨다 잦아드는 것과 같은 방식이라, 사인파를 겹치는
  // 것보다 훨씬 '줄' 처럼 들린다. 값이 열 줄이면 끝난다.
  // ───────────────────────────────────────────────────────────
  _pluckBuffer(freq, seconds = 2.2, bright = 0.5) {
    const key = `${Math.round(freq)}_${Math.round(seconds * 10)}_${Math.round(bright * 10)}`;
    const hit = this._plucks.get(key);
    if (hit) return hit;

    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const n = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(1, n, rate);
    const out = buf.getChannelData(0);

    const period = Math.max(2, Math.round(rate / freq));
    const line = new Float32Array(period);
    // 처음 채워 넣는 잡음이 곧 '뜯는 순간' 이다. bright 가 낮으면 부드럽게 시작한다.
    let prev = 0;
    for (let i = 0; i < period; i++) {
      const white = Math.random() * 2 - 1;
      prev = prev * (1 - bright) + white * bright;
      line[i] = prev;
    }

    // 잦아드는 정도 — 낮은 음은 오래, 높은 음은 짧게 남는다(실제 줄과 같다).
    const damp = 0.5 - Math.min(0.12, freq / 12000);
    let idx = 0;
    let last = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % period];
      // 두 칸을 섞어 조금씩 흐리게 — 이 한 줄이 '잦아듦' 을 만든다.
      const val = cur * damp + next * (1 - damp) * 0.995;
      line[idx] = val;
      idx = (idx + 1) % period;
      // 아주 낮은 흔들림을 빼 준다(스피커에서 웅웅거리지 않게)
      last = 0.996 * (last + val - (out[i - 1] || 0));
      out[i] = val;
    }

    // 끝을 부드럽게 닫는다 — 딱 끊기면 '틱' 소리가 난다.
    const tail = Math.min(n, Math.floor(rate * 0.25));
    for (let i = 0; i < tail; i++) out[n - tail + i] *= 1 - i / tail;

    this._plucks.set(key, buf);
    return buf;
  }

  /** 뜯은 음 하나를 정해진 시각에 울린다. */
  _pluckAt(freq, at, { gain = 0.5, seconds = 2.2, bright = 0.5, dest = null } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._pluckBuffer(freq, seconds, bright);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(dest || this.musicGain);
    src.start(at);
    return src;
  }

  // ───────────────────────────────────────────────────────────
  // 효과음
  // ───────────────────────────────────────────────────────────

  /**
   * 짧은 소리 하나.
   *
   * @param {'swing'|'hit'|'crit'|'magic'|'arrow'|'guard'|'heal'|'defeat'|'ui'
   *         |'open'|'close'|'error'|'coin'|'loot'|'rare'|'levelup'|'quest'
   *         |'enhance'|'break'|'victory'|'lose'|'encounter'|'portal'|'step'
   *         |'bossroar'|'dragonroar'|'bossfall'
   *         |'sword'|'bowshot'|'firecast'|'castmagic'} name
   */
  sfx(name) {
    const s = this.getSettings() || {};
    if (s.sfx === false) return;
    const ctx = this.unlock();
    if (!ctx) return;
    const t = ctx.currentTime;
    const to = this.sfxGain;

    if (name === 'swing') {
      // 기합 — 사람 소리를 흉내 낸 짧은 "핫". 목소리를 넣을 수는 없으니
      // 낮은 음이 빠르게 올라갔다 닫히는 모양으로 그 느낌만 만든다.
      this._voice(t, to);
      this._noise(t, to, { dur: 0.12, from: 900, to: 2600, gain: 0.1, q: 1.2 });
      return;
    }
    // ── 0.57 — **날아가는 소리** (맞는 소리와 다르다) ───────────
    //
    // 여태 나던 것은 전부 '닿았을 때' 나는 소리였다. 그래서 검을 휘두르는 순간,
    // 화살이 시위를 떠나 날아가는 동안, 불덩이가 허공을 가르는 동안은 조용했다.
    // 아래 셋은 **떠나는 순간**에 난다(BattleScene 의 그림과 짝을 이룬다).

    if (name === 'sword') {
      // 칼바람 — 날이 공기를 가르는 소리. 높은 데서 시작해 훅 내려간다.
      // 그 뒤에 아주 짧은 쇳소리를 얹어야 '막대기'가 아니라 '칼'로 들린다.
      this._noise(t, to, { dur: 0.2, from: 2600, to: 420, gain: 0.24, q: 1.3 });
      this._noise(t + 0.02, to, { dur: 0.13, from: 5200, to: 1400, gain: 0.1, q: 3.5 });
      this._ping(t + 0.05, to, { freq: 2400, dur: 0.16, gain: 0.05, slideTo: 1500 });
      return;
    }
    if (name === 'bowshot') {
      // 시위를 놓고 화살이 날아간다 — 먼저 '탁'(시위), 이어 가늘고 긴 '슈웅'.
      this._thump(t, to, { freq: 220, dur: 0.06, gain: 0.22 });
      this._noise(t + 0.02, to, { dur: 0.26, from: 3400, to: 900, gain: 0.16, q: 6 });
      return;
    }
    if (name === 'firecast') {
      // 불덩이가 허공을 가른다 — 낮은 울림 위에 잔불이 타닥거린다.
      this._noise(t, to, { dur: 0.34, from: 420, to: 160, gain: 0.26, q: 0.8 });
      this._noise(t + 0.03, to, { dur: 0.26, from: 1900, to: 700, gain: 0.13, q: 1.6 });
      this._ping(t, to, { freq: 180, dur: 0.3, gain: 0.1, slideTo: 90 });
      return;
    }
    if (name === 'castmagic') {
      // 마법이 날아간다(마법사가 아닌 것들) — 맑은 음이 올라가며 떠난다.
      this._ping(t, to, { freq: 520, dur: 0.28, gain: 0.12, slideTo: 1400 });
      this._noise(t, to, { dur: 0.22, from: 900, to: 3600, gain: 0.08, q: 2.4 });
      return;
    }

    if (name === 'hit') {
      // 맞는 소리 — 퍽. 낮은 몸통 소리와 짧은 잡음을 겹친다.
      this._thump(t, to, { freq: 150, dur: 0.16, gain: 0.5 });
      this._noise(t, to, { dur: 0.09, from: 2400, to: 400, gain: 0.28, q: 0.9 });
      return;
    }
    if (name === 'crit') {
      this._thump(t, to, { freq: 110, dur: 0.24, gain: 0.62 });
      this._noise(t, to, { dur: 0.16, from: 4200, to: 500, gain: 0.34, q: 0.8 });
      this._ping(t + 0.03, to, { freq: 1320, dur: 0.3, gain: 0.16 });
      return;
    }
    if (name === 'magic') {
      this._ping(t, to, { freq: 660, dur: 0.5, gain: 0.16, slideTo: 1760 });
      this._noise(t, to, { dur: 0.3, from: 600, to: 5200, gain: 0.12, q: 2.5 });
      return;
    }
    if (name === 'arrow') {
      this._noise(t, to, { dur: 0.14, from: 5200, to: 1200, gain: 0.2, q: 3 });
      this._ping(t + 0.06, to, { freq: 880, dur: 0.12, gain: 0.1 });
      return;
    }
    if (name === 'guard') {
      this._ping(t, to, { freq: 1180, dur: 0.35, gain: 0.16, slideTo: 780 });
      this._noise(t, to, { dur: 0.08, from: 3000, to: 900, gain: 0.14, q: 2 });
      return;
    }
    if (name === 'heal') {
      this._pluckAt(noteFreq('C5'), t, { gain: 0.28, seconds: 1.2, dest: to });
      this._pluckAt(noteFreq('E5'), t + 0.07, { gain: 0.26, seconds: 1.2, dest: to });
      this._pluckAt(noteFreq('G5'), t + 0.14, { gain: 0.24, seconds: 1.4, dest: to });
      return;
    }
    if (name === 'defeat') {
      this._thump(t, to, { freq: 90, dur: 0.5, gain: 0.6 });
      this._ping(t + 0.05, to, { freq: 320, dur: 0.6, gain: 0.14, slideTo: 120 });
      return;
    }
    if (name === 'ui') {
      this._ping(t, to, { freq: 1046, dur: 0.09, gain: 0.09 });
      return;
    }

    // ── 0.44 — 전투 밖의 소리들 ────────────────────────────
    //
    // 고르는 규칙 하나: **좋은 일은 올라가고 나쁜 일은 내려간다.**
    // 무슨 소리인지 배우지 않아도 방향만으로 알 수 있어야 한다.

    if (name === 'open') { // 창이 열린다 — 짧게 올라간다
      this._ping(t, to, { freq: 620, dur: 0.14, gain: 0.09, slideTo: 980 });
      return;
    }
    if (name === 'close') { // 창이 닫힌다 — 짧게 내려간다
      this._ping(t, to, { freq: 900, dur: 0.12, gain: 0.08, slideTo: 560 });
      return;
    }
    if (name === 'error') { // 안 되는 짓 — 낮게 두 번 튕긴다
      this._ping(t, to, { freq: 300, dur: 0.1, gain: 0.12 });
      this._ping(t + 0.11, to, { freq: 230, dur: 0.14, gain: 0.12 });
      return;
    }
    if (name === 'coin') { // 사고팔기 — 동전이 부딪힌다
      this._ping(t, to, { freq: 2100, dur: 0.1, gain: 0.09 });
      this._ping(t + 0.05, to, { freq: 2800, dur: 0.12, gain: 0.07 });
      this._noise(t, to, { dur: 0.09, from: 4000, to: 2000, gain: 0.06, q: 4 });
      return;
    }
    if (name === 'loot') { // 무언가 주웠다 — 짧고 밝게
      this._pluckAt(noteFreq('E5'), t, { gain: 0.2, seconds: 0.8, dest: to });
      this._pluckAt(noteFreq('B5'), t + 0.06, { gain: 0.16, seconds: 0.9, dest: to });
      return;
    }
    if (name === 'rare') { // 귀한 것이 나왔다 — 네 음이 훑고 올라간다
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
        this._pluckAt(noteFreq(n), t + i * 0.07, { gain: 0.24 - i * 0.02, seconds: 1.6, dest: to });
      });
      this._noise(t + 0.2, to, { dur: 0.4, from: 3000, to: 7000, gain: 0.05, q: 3 });
      return;
    }
    if (name === 'levelup') { // 레벨이 올랐다 — 다섯 음이 끝까지 올라간다
      ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => {
        this._pluckAt(noteFreq(n), t + i * 0.085, { gain: 0.26, seconds: 1.8, dest: to });
      });
      return;
    }
    if (name === 'quest') { // 의뢰를 끝냈다 — 종 두 번
      this._ping(t, to, { freq: 1046, dur: 0.5, gain: 0.14 });
      this._ping(t + 0.16, to, { freq: 1568, dur: 0.7, gain: 0.12 });
      return;
    }
    if (name === 'enhance') { // 강화 성공 — 쇠가 울리며 올라간다
      this._ping(t, to, { freq: 700, dur: 0.35, gain: 0.16, slideTo: 1400 });
      this._noise(t, to, { dur: 0.18, from: 2000, to: 6000, gain: 0.12, q: 2 });
      this._pluckAt(noteFreq('G5'), t + 0.1, { gain: 0.2, seconds: 1.4, dest: to });
      return;
    }
    if (name === 'break') { // 강화 실패 — 쇠가 갈라진다
      this._noise(t, to, { dur: 0.22, from: 5000, to: 300, gain: 0.24, q: 1 });
      this._thump(t, to, { freq: 120, dur: 0.28, gain: 0.42 });
      this._ping(t + 0.04, to, { freq: 520, dur: 0.35, gain: 0.1, slideTo: 180 });
      return;
    }
    if (name === 'victory') { // 이겼다
      ['C5', 'E5', 'G5'].forEach((n, i) => {
        this._pluckAt(noteFreq(n), t + i * 0.09, { gain: 0.26, seconds: 1.8, dest: to });
      });
      ['C6', 'G5', 'E5', 'C5'].forEach((n, i) => {
        this._pluckAt(noteFreq(n), t + 0.34 + i * 0.03, { gain: 0.2, seconds: 2.2, dest: to });
      });
      return;
    }
    if (name === 'lose') { // 졌다 — 반대로 내려간다
      ['A4', 'F4', 'D4', 'A3'].forEach((n, i) => {
        this._pluckAt(noteFreq(n), t + i * 0.13, { gain: 0.24, seconds: 2.2, dest: to });
      });
      return;
    }
    if (name === 'encounter') { // 몬스터에게 걸렸다 — 짧게 조이는 두 음
      this._ping(t, to, { freq: 420, dur: 0.12, gain: 0.13 });
      this._ping(t + 0.1, to, { freq: 560, dur: 0.22, gain: 0.13 });
      this._thump(t, to, { freq: 130, dur: 0.2, gain: 0.3 });
      return;
    }
    if (name === 'portal') { // 다른 땅으로 — 휘익
      this._ping(t, to, { freq: 400, dur: 0.5, gain: 0.12, slideTo: 1800 });
      this._noise(t, to, { dur: 0.45, from: 500, to: 6000, gain: 0.08, q: 2 });
      return;
    }
    if (name === 'bossroar') {
      // 보스가 나온다 — 낮게 깔리는 울림 하나와 그 위를 스치는 바람.
      // 짧은 '퍽'(hit)과 헷갈리지 않게 **길고 느리게** 잡는다.
      this._thump(t, to, { freq: 70, dur: 1.1, gain: 0.7 });
      this._thump(t + 0.08, to, { freq: 104, dur: 0.9, gain: 0.34 });
      this._noise(t, to, { dur: 0.9, from: 300, to: 90, gain: 0.16, q: 0.7 });
      this._ping(t + 0.12, to, { freq: 220, dur: 1.2, gain: 0.1, slideTo: 82 });
      return;
    }
    if (name === 'dragonroar') {
      // 고룡 — 보스 울음보다 **더 낮고 더 길다.** 크게 만들려고 소리를 키우는 대신
      // 아래로 내리고 늘인다. 낮은 소리는 몸으로 듣는다.
      this._thump(t, to, { freq: 46, dur: 2.0, gain: 0.8 });
      this._thump(t + 0.14, to, { freq: 62, dur: 1.7, gain: 0.42 });
      this._thump(t + 0.5, to, { freq: 88, dur: 1.2, gain: 0.26 });
      this._noise(t, to, { dur: 1.6, from: 260, to: 60, gain: 0.2, q: 0.6 });
      this._ping(t + 0.18, to, { freq: 180, dur: 2.0, gain: 0.12, slideTo: 55 });
      return;
    }
    if (name === 'bossfall') {
      // 쓰러진다 — 무너져 내리는 소리. 울음과 **반대로** 아래로 떨어진다.
      this._ping(t, to, { freq: 420, dur: 0.9, gain: 0.16, slideTo: 90 });
      this._noise(t, to, { dur: 0.7, from: 1800, to: 120, gain: 0.2, q: 0.8 });
      this._thump(t + 0.22, to, { freq: 80, dur: 0.8, gain: 0.6 });
      return;
    }
    if (name === 'step') { // 발소리 — 아주 짧고 낮다. 자주 나므로 작아야 한다
      this._noise(t, to, { dur: 0.06, from: 900, to: 260, gain: 0.05, q: 1.4 });
      return;
    }
  }

  /** 낮게 울리는 몸통 소리(북 같은 것). */
  _thump(t, dest, { freq, dur, gain }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.6), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** 걸러 낸 잡음 — 스치는 소리·바람 소리. */
  _noise(t, dest, { dur, from, to, gain, q }) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, to), t + dur);
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t);
  }

  /** 맑게 울리는 한 점. */
  _ping(t, dest, { freq, dur, gain, slideTo = null }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /**
   * 기합 — 목소리 흉내.
   *
   * 진짜 사람 소리는 넣을 수 없다(소리 파일을 안 싣기로 했고, 목소리는 만들어
   * 낼 수도 없다). 대신 사람 목의 울림을 아주 거칠게 흉내 낸다 —
   * 톱니파 하나에 입 모양에 해당하는 필터 둘을 물리고, 짧게 열었다 닫는다.
   */
  _voice(t, dest) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.16);

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.2);
  }

  // ───────────────────────────────────────────────────────────
  // 배경 음악
  // ───────────────────────────────────────────────────────────

  /**
   * 배경 음악을 켠다. 이미 같은 곡이 돌고 있으면 아무것도 안 한다.
   * @param {'login'} name
   */
  playBgm(name = 'login') {
    const s = this.getSettings() || {};
    if (s.music === false) return;
    if (this._bgm && this._bgm.name === name) return;
    const ctx = this.unlock();
    if (!ctx) return;
    this.stopBgm();
    this._bgm = { name, sources: [], timer: null };
    this._scheduleLoop(name, ctx.currentTime + 0.25);
  }

  stopBgm() {
    if (!this._bgm) return;
    clearTimeout(this._bgm.timer);
    for (const s of this._bgm.sources) {
      try { s.stop(); } catch { /* 이미 끝난 소리 */ }
    }
    this._bgm = null;
  }

  /** 한 바퀴를 예약하고, 끝나기 조금 전에 스스로 다음 바퀴를 예약한다. */
  _scheduleLoop(name, startAt) {
    if (!this._bgm || this._bgm.name !== name) return;
    const length = this._scheduleSong(name, startAt);
    const ctx = this.ctx;
    // 끝나기 1.5초 전에 다음 바퀴를 건다 — 이음매에서 끊기지 않게.
    const wait = Math.max(200, (startAt + length - 1.5 - ctx.currentTime) * 1000);
    this._bgm.timer = setTimeout(() => this._scheduleLoop(name, startAt + length), wait);
  }

  /**
   * 곡 하나를 통째로 예약한다.
   * @returns {number} 이 곡의 길이(초)
   */
  _scheduleSong(name, at) {
    const song = SONGS[name];
    if (!song) return 30;
    const beat = 60 / song.bpm;
    for (const [when, note, dur, gain] of song.notes) {
      const t = at + when * beat;
      const src = this._pluckAt(noteFreq(note), t, {
        gain: gain * 0.5,
        seconds: Math.max(0.8, dur * beat + 1.1),
        bright: 0.35,
      });
      if (this._bgm) this._bgm.sources.push(src);
    }
    return song.bars * 4 * beat;
  }
}

// ─────────────────────────────────────────────────────────────
// 곡
//
// 접속 화면에 흐르는 하프 한 곡. **직접 지은 것**이다 —
// 남의 곡을 옮겨 적으면 그 곡의 권리를 그대로 가져오는 셈이라 쓰지 않는다.
//
// 짜임새: Am – F – C – G 를 도는 여덟 마디(A) → 손이 빨라지는 여덟 마디(B) →
// 다시 A 로 돌아와 여섯 마디로 닫는다. 마지막 마디는 Am 으로 내려앉아
// 처음으로 이어져도 어색하지 않다(반복 이음매).
//
// 적는 법: [몇 박째, 음이름, 길이(박), 크기]
// ─────────────────────────────────────────────────────────────

/** 아르페지오 한 마디를 만든다. 낮은음 → 화음 → 높은음으로 훑어 올린다. */
function arp(startBeat, chord, { spread = 0.5, gain = 0.5 } = {}) {
  const out = [];
  chord.forEach((n, i) => {
    out.push([startBeat + i * spread, n, spread * 1.6, gain * (i === 0 ? 1 : 0.78)]);
  });
  return out;
}

/** 화음 하나를 한꺼번에 뜯는다(마디를 닫을 때). */
function strum(startBeat, chord, { gain = 0.55, roll = 0.045 } = {}) {
  return chord.map((n, i) => [startBeat + i * roll, n, 3, gain * (i === 0 ? 1 : 0.8)]);
}

const Am = ['A2', 'E3', 'A3', 'C4'];
const F = ['F2', 'C3', 'F3', 'A3'];
const C = ['C3', 'G3', 'C4', 'E4'];
const G = ['G2', 'D3', 'G3', 'B3'];

const notes = [];
// ── A 부분: 여덟 마디. 왼손 아르페지오 위에 느린 가락 ──
[Am, F, C, G, Am, F, C, G].forEach((chord, bar) => {
  notes.push(...arp(bar * 4, chord, { spread: 0.5, gain: 0.42 }));
  notes.push(...arp(bar * 4 + 2, chord, { spread: 0.5, gain: 0.34 }));
});
// 가락 — 두 마디에 한 소절씩. 흥얼거릴 수 있게 음을 아낀다.
[
  [0, 'A4', 2], [2, 'C5', 1.5], [3.5, 'B4', 0.5],
  [4, 'A4', 2], [6, 'G4', 2],
  [8, 'E4', 1.5], [9.5, 'G4', 0.5], [10, 'A4', 2],
  [12, 'B4', 1.5], [13.5, 'A4', 0.5], [14, 'G4', 2],
  [16, 'A4', 2], [18, 'C5', 1.5], [19.5, 'E5', 0.5],
  [20, 'D5', 2], [22, 'C5', 2],
  [24, 'B4', 1.5], [25.5, 'A4', 0.5], [26, 'G4', 2],
  [28, 'A4', 4],
].forEach(([b, n, d]) => notes.push([b, n, d, 0.62]));

// ── B 부분: 여덟 마디. 손이 빨라지는 자리 ──
const B0 = 32;
[Am, F, C, G, F, C, G, Am].forEach((chord, bar) => {
  // 열여섯 개로 잘게 훑는다 — 하프의 손가락이 바쁘게 오가는 소리
  const up = [...chord, ...chord.slice(0, 3).reverse()];
  up.forEach((n, i) => notes.push([B0 + bar * 4 + i * 0.5, n, 0.9, 0.3]));
});
[
  [0, 'E5', 1], [1, 'D5', 0.5], [1.5, 'C5', 0.5], [2, 'B4', 1], [3, 'C5', 1],
  [4, 'A4', 1.5], [5.5, 'C5', 0.5], [6, 'E5', 2],
  [8, 'G5', 1], [9, 'E5', 0.5], [9.5, 'D5', 0.5], [10, 'C5', 2],
  [12, 'D5', 1], [13, 'B4', 1], [14, 'G4', 2],
  [16, 'F5', 1], [17, 'E5', 0.5], [17.5, 'D5', 0.5], [18, 'C5', 2],
  [20, 'E5', 1], [21, 'G5', 1], [22, 'A5', 2],
  [24, 'G5', 1], [25, 'F5', 0.5], [25.5, 'E5', 0.5], [26, 'D5', 2],
  [28, 'C5', 1.5], [29.5, 'B4', 0.5], [30, 'A4', 2],
].forEach(([b, n, d]) => notes.push([B0 + b, n, d, 0.66]));

// ── 닫는 여섯 마디: A 로 돌아와 Am 에 내려앉는다 ──
const C0 = 64;
[Am, F, C, G, F, Am].forEach((chord, bar) => {
  notes.push(...arp(C0 + bar * 4, chord, { spread: 0.5, gain: 0.4 }));
  if (bar < 5) notes.push(...arp(C0 + bar * 4 + 2, chord, { spread: 0.5, gain: 0.32 }));
});
[
  [0, 'A4', 2], [2, 'C5', 2],
  [4, 'A4', 1.5], [5.5, 'G4', 0.5], [6, 'F4', 2],
  [8, 'E4', 2], [10, 'G4', 2],
  [12, 'D5', 1.5], [14, 'B4', 2],
  [16, 'C5', 2], [18, 'A4', 2],
].forEach(([b, n, d]) => notes.push([C0 + b, n, d, 0.6]));
// 마지막 마디 — 화음을 훑어 내리며 닫는다. 여기서 처음으로 이어진다.
notes.push(...strum(C0 + 20, ['A2', 'E3', 'A3', 'C4', 'E4', 'A4'], { gain: 0.5 }));

// ── 땅마다 흐르는 곡 (0.44) ────────────────────────────────
//
// 넷 다 같은 방식으로 짓는다 — 화음 진행을 정하고, 왼손이 그 화음을 훑고,
// 오른손이 그 위에 가락 한 줄을 얹는다. 짧게(12마디) 짓고 되풀이한다.
//
// 마지막 마디의 화음이 첫 마디로 자연스럽게 이어지도록 진행을 닫아 두었다 —
// 그래야 되풀이될 때 "다시 시작했다" 가 안 들린다.

const D = ['D3', 'A3', 'D4', 'F#4'];
const Em = ['E3', 'B3', 'E4', 'G4'];
const Dm = ['D3', 'A3', 'D4', 'F4'];
const Bb = ['A#2', 'F3', 'A#3', 'D4'];
const Gm = ['G2', 'D3', 'G3', 'A#3'];
const A = ['A2', 'E3', 'A3', 'C#4'];
const E = ['E2', 'B2', 'E3', 'G#3'];

/**
 * 왼손 + 오른손을 엮어 곡 하나를 만든다.
 *
 * @param {string[][]} prog  마디마다 짚을 화음
 * @param {Array} melody     [몇 박째, 음이름, 길이] 목록
 * @param {object} o
 * @param {number} o.spread  화음을 얼마나 벌려 훑나 (작을수록 바쁘다)
 * @param {number} o.bass    왼손 크기
 * @param {number} o.lead    오른손 크기
 * @param {boolean} o.twice  한 마디에 두 번 훑나 (느린 곡은 한 번만)
 */
function weave(prog, melody, { spread = 0.5, bass = 0.4, lead = 0.6, twice = true } = {}) {
  const out = [];
  prog.forEach((chord, bar) => {
    out.push(...arp(bar * 4, chord, { spread, gain: bass }));
    if (twice) out.push(...arp(bar * 4 + 2, chord, { spread, gain: bass * 0.78 }));
  });
  for (const [b, n, d] of melody) out.push([b, n, d, lead]);
  return out;
}

// 마을 — 따뜻하고 느리다. 다장조.
const TOWN = weave(
  [C, F, G, C, Am, F, G, C, F, C, G, C],
  [
    [0, 'E4', 2], [2, 'G4', 2],
    [4, 'A4', 1.5], [5.5, 'G4', 0.5], [6, 'F4', 2],
    [8, 'G4', 2], [10, 'E4', 2],
    [12, 'C4', 4],
    [16, 'A4', 2], [18, 'C5', 2],
    [20, 'F4', 1.5], [21.5, 'A4', 0.5], [22, 'G4', 2],
    [24, 'B4', 2], [26, 'D5', 2],
    [28, 'C5', 4],
    [32, 'A4', 2], [34, 'F4', 2],
    [36, 'E4', 2], [38, 'G4', 2],
    [40, 'D5', 1.5], [41.5, 'B4', 0.5], [42, 'G4', 2],
    [44, 'C5', 2], [46, 'E4', 2],
  ],
  { bass: 0.36, lead: 0.58 }
);

// 들판 — 걷는 걸음에 맞춘다. 사장조.
const FIELD = weave(
  [G, D, Em, C, G, D, C, G, Em, C, D, G],
  [
    [0, 'D5', 1], [1, 'B4', 1], [2, 'G4', 2],
    [4, 'A4', 1], [5, 'F#4', 1], [6, 'D4', 2],
    [8, 'E4', 1], [9, 'G4', 1], [10, 'B4', 2],
    [12, 'C5', 1], [13, 'B4', 1], [14, 'G4', 2],
    [16, 'D5', 1], [17, 'E5', 1], [18, 'D5', 2],
    [20, 'A4', 1], [21, 'B4', 1], [22, 'A4', 2],
    [24, 'G4', 1], [25, 'E4', 1], [26, 'C5', 2],
    [28, 'B4', 4],
    [32, 'E5', 1], [33, 'D5', 1], [34, 'B4', 2],
    [36, 'C5', 1], [37, 'E5', 1], [38, 'G5', 2],
    [40, 'F#5', 1], [41, 'D5', 1], [42, 'A4', 2],
    [44, 'G4', 4],
  ],
  { spread: 0.5, bass: 0.34, lead: 0.55 }
);

// 지하감옥 — 낮고 성기다. 라단조. 한 마디에 한 번만 훑어 텅 빈 느낌을 낸다.
const DUNGEON = weave(
  [Dm, Bb, F, A, Dm, Bb, Gm, A, Dm, Bb, A, Dm],
  [
    [0, 'D4', 3], [3, 'F4', 1],
    [6, 'A4', 2],
    [10, 'F4', 2],
    [12, 'C#4', 2], [14, 'D4', 2],
    [18, 'A3', 2],
    [22, 'D4', 2],
    [26, 'A#3', 2], [28, 'C#4', 2],
    [32, 'D4', 3],
    [38, 'F4', 2],
    [42, 'C#4', 2],
    [44, 'D4', 4],
  ],
  { spread: 0.75, bass: 0.4, lead: 0.5, twice: false }
);

// 고룡 — 몰아붙인다. 가단조. 왼손이 바쁘고 낮다.
const DRAGON = weave(
  [Am, Am, F, F, G, G, E, E, Am, F, G, Am],
  [
    [0, 'A4', 1], [1, 'C5', 0.5], [1.5, 'B4', 0.5], [2, 'A4', 2],
    [4, 'E5', 1], [5, 'D5', 1], [6, 'C5', 2],
    [8, 'F5', 1], [9, 'E5', 0.5], [9.5, 'D5', 0.5], [10, 'C5', 2],
    [12, 'A4', 2], [14, 'C5', 2],
    [16, 'D5', 1], [17, 'B4', 1], [18, 'G4', 2],
    [20, 'B4', 1], [21, 'D5', 1], [22, 'G5', 2],
    [24, 'G#4', 2], [26, 'B4', 2],
    [28, 'E5', 2], [30, 'G#4', 2],
    [32, 'A4', 1], [33, 'E5', 1], [34, 'A5', 2],
    [36, 'F5', 1], [37, 'C5', 1], [38, 'A4', 2],
    [40, 'G5', 1], [41, 'D5', 1], [42, 'B4', 2],
    [44, 'A4', 4],
  ],
  { spread: 0.25, bass: 0.3, lead: 0.62 }
);

// 보스 — 몰아붙인다. 라단조. 왼손이 잘게 구르고 가락은 좁게 오르내린다.
//
// 고룡 곡(DRAGON)과 무엇이 다른가: 고룡은 **큰 것이 다가오는** 소리라 화음이 넓고
// 느리게 걷는다. 이쪽은 **당장 눈앞의 한 판**이라 더 빠르고 음이 좁다.
// 한 판이 오래 안 가므로 마디도 짧게(8마디) 잡는다 — 길면 첫 바퀴도 못 돌고 끝난다.
const BOSS = weave(
  [Dm, Dm, Bb, A, Gm, Bb, A, Dm],
  [
    [0, 'D5', 0.5], [0.5, 'F5', 0.5], [1, 'E5', 1], [2, 'D5', 1], [3, 'C#5', 1],
    [4, 'D5', 1], [5, 'A4', 1], [6, 'D5', 2],
    [8, 'A#4', 0.5], [8.5, 'D5', 0.5], [9, 'F5', 1], [10, 'D5', 2],
    [12, 'C#5', 1], [13, 'E5', 1], [14, 'A4', 2],
    [16, 'G4', 0.5], [16.5, 'A#4', 0.5], [17, 'D5', 1], [18, 'A#4', 2],
    [20, 'F5', 1], [21, 'D5', 1], [22, 'A#4', 2],
    [24, 'E5', 1], [25, 'C#5', 1], [26, 'A4', 2],
    [28, 'D5', 1], [29, 'A4', 1], [30, 'D4', 2],
  ],
  { spread: 0.25, bass: 0.32, lead: 0.66 }
);

export const SONGS = {
  // 22 마디 · 92 BPM ≈ 57초
  login: { bpm: 92, bars: 22, notes },
  // 아래 넷은 12 마디짜리다 — 오래 머무는 곳이라 짧게 돌린다.
  town: { bpm: 84, bars: 12, notes: TOWN },
  field: { bpm: 100, bars: 12, notes: FIELD },
  dungeon: { bpm: 70, bars: 12, notes: DUNGEON },
  dragon: { bpm: 112, bars: 12, notes: DRAGON },
  // 보스전 — 8 마디짜리. 싸움이 짧아서 길게 만들면 한 바퀴도 못 돈다.
  boss: { bpm: 126, bars: 8, notes: BOSS },
};
