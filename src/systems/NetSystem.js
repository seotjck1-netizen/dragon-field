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
      this.peers.set(msg.id, {
        ...prev,
        ...msg,
        lastSeen: this._now,
      });
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
    // 서버가 새 콘텐츠(아이템 표 등)를 배포했다는 알림
    if (msg.t === 'content') {
      this.bus.emit('net:content', msg);
      return;
    }
    // 운영자가 시즌을 넘겼다 — 모든 사람이 처음으로 돌아간다.
    if (msg.t === 'season') {
      this.bus.emit('net:season', msg);
    }
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
