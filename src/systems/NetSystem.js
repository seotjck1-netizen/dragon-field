// 책임: 다른 플레이어와 상태를 주고받는다. 전송 수단은 두 가지를 동시에 쓴다.
//        ① BroadcastChannel — 같은 브라우저의 다른 탭 (서버 없이 즉시 동작)
//        ② WebSocket       — 서버가 떠 있으면 다른 기기·다른 사람까지
// 금지: DOM 접근, 게임 규칙 판단. 받은 내용을 이벤트로 넘기기만 한다.

const CHANNEL = 'poino-open-field';
const SEND_INTERVAL_MS = 100; // 초당 10회
const PEER_TIMEOUT_MS = 20000;

// 가만히 서 있어도 이 간격으로는 "나 여기 있다"를 보낸다.
//
// 예전에는 상태가 바뀔 때만 보냈다. 움직이는 동안에는 문제가 없지만,
// 두 사람이 동시에 멈춰 서면 양쪽 다 아무것도 안 보내게 되고
// 서로를 "끊긴 사람"으로 보고 목록에서 지워 버렸다.
// PC 와 폰이 "따로 보이던" 원인이 이것이다.
// 덤으로, 무료 호스팅의 중계기는 한동안 오가는 것이 없는 연결을 끊어 버린다.
const HEARTBEAT_MS = 2000;

// ── 남의 걸음을 부드럽게 잇기 (0.61) ────────────────────────
//
// 자리는 초당 10번만 온다. 화면은 초당 60번 그린다. 받은 자리를 그대로 쓰면
// 남은 100ms 마다 한 번씩 **툭툭 건너뛴다** — 재 보니 한 번에 19px 씩,
// 4초에 21번 튀었다(내 발은 한 프레임에 3px 쯤 움직인다).
//
// 그래서 받은 자리는 **목표**로만 두고, 그리는 자리는 매 프레임 그쪽으로 다가간다.
/** 목표까지 따라붙는 데 걸리는 시간(ms). 짧으면 딱딱하고 길면 늘어진다. */
const LERP_TAU = 70;
/** 이만큼 넘게 벌어지면 이어 붙이지 않고 그냥 옮긴다(순간이동·맵 이동). */
const SNAP_PX = 96;

/** 말풍선이 머무는 시간(ms). 짧으면 못 보고, 길면 화면이 지저분해진다. */
export const EMOTE_MS = 4000;

// 연결이 끊겼을 때 다시 붙기까지 기다리는 시간(점점 늘린다).
const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000];

export class NetSystem {
  /** @param {import('../core/EventBus.js').EventBus} bus */
  constructor(bus) {
    this.bus = bus;
    this.self = null;
    this.channel = null;
    this.socket = null;
    this.peers = new Map(); // id -> peer state
    this._acc = 0;
    this._lastSent = '';
    this._lastSentAt = -Infinity;
    this._now = 0;
    this.online = false;
    this.wsUrl = null;
    this._tries = 0;
    this._retryTimer = null;
    this._closed = false;
  }

  /**
   * @param {{id:string, name:string}} self
   * @param {{wsUrl?:string}} opts
   */
  connect(self, opts = {}) {
    this.self = self;
    this._closed = false;

    // ① 같은 브라우저의 다른 탭
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL);
        this.channel.onmessage = (e) => this._receive(e.data);
      } catch {
        this.channel = null;
      }
    }

    // ② 서버 (있을 때만)
    if (opts.wsUrl) {
      this.wsUrl = opts.wsUrl;
      this._openSocket();
    }

    // 폰은 화면을 끄거나 앱을 바꾸면 연결이 조용히 끊긴다.
    // 돌아왔을 때 스스로 다시 붙지 않으면 그때부터 혼자 놀게 된다.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this._ensureSocket();
      });
    }
    window.addEventListener('online', () => this._ensureSocket());
    window.addEventListener('focus', () => this._ensureSocket());

    // 폰 사파리에서는 beforeunload 가 오지 않는 경우가 있다. pagehide 를 함께 쓴다.
    //
    // 다만 pagehide 는 "떠난다"와 "잠깐 뒤로 물러난다"를 겸한다.
    // e.persisted 가 true 면 페이지가 살아 있는 채로 캐시에 들어간 것이고,
    // 사용자가 뒤로 가기로 돌아온다. 이때 영영 닫아 버리면
    // 돌아왔을 때부터 혼자 놀게 된다 — 정확히 우리가 고치려던 증상이다.
    window.addEventListener('pagehide', (e) => this._leave(!(e && e.persisted)));
    window.addEventListener('beforeunload', () => this._leave(true));
    window.addEventListener('pageshow', () => {
      this._closed = false;
      this._ensureSocket();
    });
  }

  /** 끊겨 있으면 즉시 다시 붙는다(기다리던 재시도는 취소). */
  _ensureSocket() {
    if (this._closed || !this.wsUrl) return;
    if (this.socket && this.socket.readyState <= 1) return; // 연결 중이거나 연결됨
    clearTimeout(this._retryTimer);
    this._tries = 0;
    this._openSocket();
  }

  _openSocket() {
    if (this._closed || !this.wsUrl) return;
    try {
      const sock = new WebSocket(this.wsUrl);
      this.socket = sock;
      sock.onopen = () => {
        if (sock !== this.socket) return;
        this._tries = 0;
        const wasOnline = this.online;
        this.online = true;
        this._say();
        // 다시 붙었으니 내 위치를 즉시 다시 알린다.
        this._lastSent = '';
        if (!wasOnline) this.bus.emit('net:status', { online: true });
      };
      sock.onmessage = (e) => {
        try {
          this._receive(JSON.parse(e.data));
        } catch {
          /* 무시 */
        }
      };
      sock.onclose = () => {
        if (sock !== this.socket) return;
        this.socket = null;
        if (this.online) {
          this.online = false;
          this.bus.emit('net:status', { online: false });
        }
        this._scheduleRetry();
      };
      sock.onerror = () => {
        /* onclose 가 뒤따른다 */
      };
    } catch {
      this.socket = null;
      this._scheduleRetry();
    }
  }

  _scheduleRetry() {
    if (this._closed || !this.wsUrl) return;
    const delay = RECONNECT_MS[Math.min(this._tries, RECONNECT_MS.length - 1)];
    this._tries++;
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this._openSocket(), delay);
  }

  /** 서버에 내가 누구인지 알린다(들어올 때·다시 붙을 때). */
  _say() {
    this._send({ t: 'hello', id: this.self.id, name: this.self.name });
  }

  /**
   * 자리를 뜬다.
   * @param {boolean} permanent 정말 떠나는가(true) / 잠깐 물러나는가(false)
   */
  _leave(permanent) {
    clearTimeout(this._retryTimer);
    this._send({ t: 'bye', id: this.self?.id });
    if (this.socket) this.socket.close();
    this.socket = null;
    this.online = false;
    if (!permanent) return;
    this._closed = true;
    if (this.channel) this.channel.close();
    this.channel = null;
  }

  disconnect() {
    this._leave(true);
  }

  _send(msg) {
    if (!msg || !this.self) return;
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch {
        /* 무시 */
      }
    }
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  _receive(msg) {
    if (!msg || !this.self || msg.id === this.self.id) return;

    if (msg.t === 'state') {
      const prev = this.peers.get(msg.id);
      const next = { ...prev, ...msg, lastSeen: this._now };
      // 새로 온 자리는 **목표**다. 그리는 자리(px·py)는 update 에서 여기로 다가간다.
      next.nx = msg.px;
      next.ny = msg.py;
      const far = prev
        && (prev.map !== msg.map
          || Math.hypot(msg.px - (prev.px ?? msg.px), msg.py - (prev.py ?? msg.py)) > SNAP_PX);
      if (!prev || far) {
        // 처음 보거나, 맵을 옮겼거나, 너무 멀리 뛰었다 — 이어 붙이지 않는다.
        next.px = msg.px;
        next.py = msg.py;
      } else {
        next.px = prev.px;
        next.py = prev.py;
      }
      this.peers.set(msg.id, next);
      if (!prev) this.bus.emit('net:peers', this.peerList());
      return;
    }
    if (msg.t === 'bye') {
      this.peers.delete(msg.id);
      this.bus.emit('net:peers', this.peerList());
      return;
    }
    if (msg.t === 'hello') {
      // 새로 들어온 사람에게 내 위치를 즉시 알린다
      this._lastSent = '';
      return;
    }
    if (msg.t === 'kill') {
      this.bus.emit('net:kill', msg);
      return;
    }
    if (msg.t === 'respawn') {
      this.bus.emit('net:respawn', msg);
      return;
    }
    if (msg.t === 'chat') {
      this.bus.emit('net:chat', msg);
      return;
    }
    // 이모티콘 — 그 사람 머리 위에 말풍선으로 띄운다 (0.62).
    // 아직 목록에 없는 사람(자리 소식이 먼저 안 온 경우)이면 버린다 —
    // 어디에 띄울지 모르는 말풍선은 그릴 자리가 없다.
    if (msg.t === 'emote') {
      const peer = this.peers.get(msg.id);
      if (peer) peer.emote = { icon: String(msg.icon || '').slice(0, 8), at: this._now };
      return;
    }
    // 모두가 함께 보는 공지 — 고룡이 눕었다 · 1~3위에 올랐다 (0.61).
    // 글은 **서버가 짓는다.** 여기서는 그대로 넘기기만 한다.
    if (msg.t === 'notice') {
      this.bus.emit('net:notice', msg);
      return;
    }
    // 서버가 새 콘텐츠(아이템 표 등)를 배포했다는 알림
    if (msg.t === 'content') {
      this.bus.emit('net:content', msg);
      return;
    }
    // 운영자가 시즌을 넘겼다 — 모든 사람이 처음으로 돌아간다.
    if (msg.t === 'season') {
      this.bus.emit('net:season', msg);
      return;
    }
    // 시즌 일정이 바뀌었다(마감 시각·쉬는 날수) — 랭킹 창의 남은 시간이 바뀐다 (0.70.5).
    // 시즌이 넘어간 것이 **아니므로** 저장을 끄지 않는다. 위와 섞으면 안 된다.
    if (msg.t === 'season-schedule') {
      this.bus.emit('net:season-schedule', msg);
    }
  }

  /**
   * 이모티콘 하나를 알린다 (0.62).
   *
   * 자리(state)에 얹어 보내지 않고 **따로** 보낸다. 자리는 초당 10번 오가는데
   * 거기에 얹으면 같은 이모티콘이 열 번 도착해서, 받는 쪽에서 "새로 띄운 것" 과
   * "아까 것이 또 온 것" 을 가릴 수가 없다.
   */
  sendEmote(icon) {
    if (!this.self || !icon) return;
    this._send({ t: 'emote', id: this.self.id, icon: String(icon).slice(0, 8) });
  }

  /** 몬스터를 잡았다고 알린다(다른 사람 화면에서도 사라지도록). */
  reportKill(mapId, monsterUid) {
    this._send({ t: 'kill', id: this.self?.id, map: mapId, uid: monsterUid });
  }

  /** 몬스터가 되살아난 위치를 알린다. */
  reportRespawn(mapId, monsterUid, tx, ty) {
    this._send({ t: 'respawn', id: this.self?.id, map: mapId, uid: monsterUid, tx, ty });
  }

  /**
   * 매 프레임 호출한다. 일정 간격으로 내 상태를 뿌리고, 끊긴 상대를 정리한다.
   * @param {number} dt
   * @param {object} snapshot 내 상태 {map, tx, ty, px, py, dir, level, name, look}
   */
  update(dt, snapshot) {
    if (!this.self) return;
    // snapshot 이 없으면 **내 자리를 알리지 않는다**(운영자의 투명 상태).
    // 끊긴 것과 같은 모양이 되므로, 상대 쪽에서는 잠시 뒤 목록에서 사라진다.
    // 그래도 남의 소식은 계속 받아야 하므로 아래 정리는 그대로 돈다.
    if (snapshot === null) {
      this._lastSent = null;
      this._pruneStale(dt);
      return;
    }
    this._now = (this._now || 0) + dt;
    this._acc += dt;

    if (this._acc >= SEND_INTERVAL_MS) {
      this._acc = 0;
      const msg = { t: 'state', id: this.self.id, ...snapshot };
      const sig = JSON.stringify(msg);
      // 바뀌었으면 바로, 안 바뀌었어도 2초에 한 번은 보낸다.
      // 이걸 빼면 서 있는 사람은 상대 화면에서 사라진다.
      if (sig !== this._lastSent || this._now - this._lastSentAt >= HEARTBEAT_MS) {
        this._lastSent = sig;
        this._lastSentAt = this._now;
        this._send(msg);
      }
    }

    this._pruneStale(0);
    this._followPeers(dt);
  }

  /**
   * 남들의 그리는 자리를 목표 쪽으로 한 걸음 옮긴다.
   *
   * 지수 완화라 정확히 도착하지는 않는다 — 반 픽셀 안으로 들어오면 붙여 준다.
   * 'moving' 도 여기서 정한다: 보내는 쪽의 깃발은 100ms 전 이야기라
   * 걸음이 끝난 뒤에도 잠깐 켜져 있고, 그러면 멈춘 사람이 계속 흔들린다.
   */
  _followPeers(dt) {
    if (!(dt > 0)) return;
    const k = 1 - Math.exp(-dt / LERP_TAU);
    for (const p of this.peers.values()) {
      // 말풍선은 잠깐만 떠 있는다.
      if (p.emote && this._now - p.emote.at > EMOTE_MS) p.emote = null;
      if (p.nx == null) continue;
      const dx = p.nx - p.px;
      const dy = p.ny - p.py;
      const gap = Math.hypot(dx, dy);
      if (gap < 0.5) {
        p.px = p.nx;
        p.py = p.ny;
        p.moving = false;
      } else {
        p.px += dx * k;
        p.py += dy * k;
        p.moving = true;
      }
    }
  }

  /** 소식이 끊긴 사람을 목록에서 지운다. */
  _pruneStale(dt) {
    if (dt) this._now = (this._now || 0) + dt;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (this._now - (peer.lastSeen || 0) > PEER_TIMEOUT_MS) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.bus.emit('net:peers', this.peerList());
  }

  /** 같은 맵에 있는 다른 플레이어들. */
  peersOnMap(mapId) {
    const out = [];
    for (const peer of this.peers.values()) {
      if (peer.map === mapId) out.push(peer);
    }
    return out;
  }

  peerList() {
    return Array.from(this.peers.values());
  }
}
