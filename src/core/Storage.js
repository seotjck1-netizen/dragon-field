// 책임: 계정/세이브를 어디에 저장할지 감춘다. 서버가 살아 있으면 서버, 아니면 브라우저.
// 금지: 게임 규칙. 무엇을 저장할지는 systems/AccountSystem.js 가 정한다.
// 주의: 비밀번호는 절대 원문으로 다루지 않는다. 호출부에서 해시해서 넘긴다.

const LS_PREFIX = 'poino.account.';
const LS_LAST = 'poino.lastId';
const LS_SETTINGS = 'poino.settings';

// 사파리 "프라이빗 브라우징" 에서는 localStorage 에 쓰기만 해도 예외가 난다.
// 저장이 안 되는 것과 게임이 멈추는 것은 다른 문제이므로, 접근을 전부 감싼다.
const LS = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  keys() {
    try {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
      return out;
    } catch {
      return [];
    }
  },
  /** 쓰기가 되는 환경인가(프라이빗 브라우징이면 false). */
  usable() {
    return LS.set('poino.probe', '1');
  },
};

// 저장이 아예 막힌 환경(미리보기 창, 프라이빗 브라우징)에서 쓰는 임시 보관함.
// 새로고침하면 사라지지만, 적어도 게임은 해 볼 수 있다.
const MEMORY = new Map();

export class Storage {
  /** @param {string} baseUrl 서버 주소. 같은 출처면 '' */
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
    this.mode = 'local'; // 'local' | 'server'
    this.serverInfo = null;
    // 브라우저 저장이 막혔으면 메모리에만 담는다(진행은 저장되지 않는다).
    this.memoryOnly = !LS.usable();
  }

  /** 계정 한 건 읽기/쓰기 — 저장이 막혔으면 메모리를 쓴다. */
  _readAccount(id) {
    if (this.memoryOnly) return MEMORY.get(id) || null;
    const raw = LS.get(LS_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  }

  _writeAccount(id, record) {
    if (this.memoryOnly) {
      MEMORY.set(id, record);
      return;
    }
    LS.set(LS_PREFIX + id, JSON.stringify(record));
  }

  /** 한 번 두드려 본다. @returns {boolean} 서버가 대답했는가 */
  async _probe(timeoutMs) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl}/api/ping`, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      this.serverInfo = await res.json();
      this.mode = 'server';
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 서버가 떠 있는지 확인한다. 없으면 조용히 로컬 모드로 남는다.
   *
   * 두 번 두드리는 이유: 이 페이지가 http(s) 로 왔다면 누군가는 이걸 내려 준 것이므로
   * 서버가 있을 가능성이 높다. 무료 호스팅은 잠에서 깬 직후 첫 응답이 몇 초씩 걸리는데,
   * 거기서 포기해 버리면 "서버가 있는데도 계정을 이 브라우저에만 만드는" 최악의 상황이 된다.
   * 실제로는 다른 사람과 같이 놀 수 있는데 혼자 놀게 되는 것이라 알아채기도 어렵다.
   */
  async detect(timeoutMs = 1200) {
    if (await this._probe(timeoutMs)) return this.mode;

    const servedOverHttp = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    if (servedOverHttp && await this._probe(8000)) return this.mode;

    this.mode = 'local';
    return this.mode;
  }

  /**
   * 로컬 모드로 떨어진 뒤에도 서버를 계속 기다린다.
   *
   * 무료 호스팅은 15분 놀면 잠들고, 깨어나는 데 1분쯤 걸린다.
   * detect() 가 몇 초 만에 포기하고 로컬 모드로 가 버리면
   * 계정이 이 브라우저 안에만 만들어져서 "PC 와 폰이 따로 노는" 상황이 된다.
   * 접속 화면에 머무는 동안 조용히 두드려 보다가, 깨어나면 알려 준다.
   *
   * @param {() => void} onFound 서버를 찾았을 때 한 번 호출
   * @returns {() => void} 그만 기다리게 하는 함수
   */
  watchForServer(onFound, { everyMs = 3000, maxMs = 120000 } = {}) {
    const servedOverHttp = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    if (this.isServer || !servedOverHttp) return () => {};

    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      if (await this._probe(5000)) {
        if (!stopped) onFound();
        return;
      }
      if (stopped || Date.now() - started > maxMs) return;
      setTimeout(tick, everyMs);
    };
    setTimeout(tick, everyMs);
    return () => {
      stopped = true;
    };
  }

  get isServer() {
    return this.mode === 'server';
  }

  /**
   * 서버 요청. 반드시 시간 제한을 둔다 —
   * 제한이 없으면 서버가 응답하지 않을 때 접속 버튼이 "접속 중…" 상태로 굳어 버린다.
   */
  async _post(path, body, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      throw new Error(
        err && err.name === 'AbortError'
          ? '서버가 응답하지 않습니다. 서버가 켜져 있는지, 같은 네트워크인지 확인하세요.'
          : '서버에 연결하지 못했습니다.'
      );
    } finally {
      clearTimeout(timer);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
    return data;
  }

  // ---------- 계정 ----------

  /** @returns {{token:string, save:object|null}} */
  async register(id, hash, name) {
    if (this.isServer) return this._post('/api/register', { id, hash, name });

    if (this._readAccount(id)) throw new Error('이미 있는 아이디입니다.');
    // 저장이 막혀 있어도 막지는 않는다 — 진행이 남지 않을 뿐 게임은 할 수 있다.
    this._writeAccount(id, { id, hash, name, save: null });
    return { token: hash, save: null };
  }

  async login(id, hash) {
    if (this.isServer) return this._post('/api/login', { id, hash });

    const record = this._readAccount(id);
    if (!record) throw new Error('없는 아이디입니다.');
    if (record.hash !== hash) throw new Error('비밀번호가 다릅니다.');
    return { token: hash, save: record.save || null };
  }

  async save(id, token, data) {
    if (this.isServer) return this._post('/api/save', { id, token, save: data });

    const record = this._readAccount(id);
    if (!record) throw new Error('없는 아이디입니다.');
    if (record.hash !== token) throw new Error('인증 실패');
    record.save = data;
    this._writeAccount(id, record);
    return { ok: true };
  }

  async load(id, token) {
    if (this.isServer) return this._post('/api/load', { id, token });
    const record = this._readAccount(id);
    if (!record) throw new Error('없는 아이디입니다.');
    if (record.hash !== token) throw new Error('인증 실패');
    return { save: record.save || null };
  }

  // ---------- 우편 · 랭킹 · 고룡 ----------
  //
  // 이 셋은 서버가 있어야만 뜻이 있다(여럿이 같은 것을 본다).
  // 혼자 하는 중이면 조용히 빈 값을 준다 — 기능이 없는 것이지 고장이 아니다.

  /** 내 우편함. 아직 안 가져간 이벤트도 서버가 이때 넣어 준다. */
  async mail(id, token) {
    if (!this.isServer) return { mail: [], pulled: 0, offline: true };
    return this._post('/api/mail', { id, token });
  }

  async claimMail(id, token, mid) {
    if (!this.isServer) throw new Error('우편은 서버에 접속했을 때만 받을 수 있습니다.');
    return this._post('/api/mail/claim', { id, token, mid });
  }

  async deleteMail(id, token, mid) {
    if (!this.isServer) return { ok: true, mail: [] };
    return this._post('/api/mail/delete', { id, token, mid });
  }

  /**
   * 보스별 타임어택 기록.
   * 로그인 정보를 함께 보내면 "내 기록과 몇 위인지"도 받아 온다(5위 밖이어도).
   */
  async ranks(id = null, token = null) {
    if (!this.isServer) return { rank: {}, mine: {}, total: {}, offline: true };
    return this._post('/api/rank', id && token ? { id, token } : {});
  }

  /**
   * "이 보스를 잡았다"만 알린다. 걸린 시간은 서버가 잰다 —
   * 여기서 시간을 보내면 그 값은 곧 누구나 고칠 수 있는 값이 된다.
   */
  async submitRank(id, token, boss) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/rank/submit', { id, token, boss });
  }

  // ---------- 운영자 창 ----------
  //
  // ⚠ ADMIN_KEY 는 브라우저로 내려오지 않는다. 여기서 보내는 것은 **내 세션 토큰**뿐이고,
  //   그 토큰이 운영자 계정의 것인지는 서버만 판단한다(server.js 의 adminOnly).

  /** 나는 운영자인가. 접속 직후 한 번만 물어본다. */
  async adminMe(id, token) {
    if (!this.isServer) return { admin: false, reason: 'offline' };
    return this._post('/api/admin/me', { id, token });
  }

  /** 계정 목록(운영자만). 우편 받을 사람을 고를 때 쓴다. */
  async adminAccounts(id, token) {
    if (!this.isServer) return { accounts: [] };
    return this._post('/api/admin/accounts', { id, token }, 15000);
  }

  /** 우편 보내기. mail.to 가 비어 있으면 전체. */
  async adminMail(id, token, mail) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/mail', { id, token, ...mail }, 15000);
  }

  /** 랭킹 초기화(= 시즌 넘기기). boss 를 주면 그 표만. */
  async adminRankReset(id, token, boss = null) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/rank-reset', { id, token, boss }, 20000);
  }

  /**
   * 새 시즌 — 전체 유저 초기화. 되돌릴 수 없다.
   * 랭킹 초기화까지 함께 일어난다(서버가 한 번에 한다).
   */
  async adminSeasonReset(id, token) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/season-reset', { id, token }, 60000);
  }

  /**
   * 고른 계정을 지운다 (0.46).
   * 계정·세이브·우편함·랭킹 기록까지 통째로. 운영자 자신은 서버가 거절한다.
   */
  async adminAccountDelete(id, token, ids) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/account-delete', { id, token, ids }, 60000);
  }

  /**
   * 여태 보낸 우편을 전부 지운다 (0.45).
   * 계정 우편함과 아직 배달을 기다리는 이벤트 통을 함께 비운다.
   */
  async adminMailClear(id, token) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/mail-clear', { id, token }, 60000);
  }

  /**
   * 시즌 고정을 켜고 끈다 (0.45).
   * 켜 두면 어떤 초기화도 시즌을 넘기지 않는다 — 시험 중인 서버를 위한 스위치.
   */
  async adminSeasonLock(id, token, locked) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/season-lock', { id, token, locked: !!locked }, 20000);
  }

  /**
   * 시즌 번호를 직접 정한다 — 대개 1 로 되돌릴 때 (0.45).
   * 기록·세이브는 안 지운다. 번호와 '지난 시즌' 만 되돌린다.
   */
  async adminSeasonSet(id, token, season) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/season-set', { id, token, season }, 30000);
  }

  /** 구글 시트를 지금 읽어 반영한다. */
  async adminSheetPull(id, token) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/sheet-pull', { id, token }, 30000);
  }

  /** 지금 어느 구글 문서를 보고 있나 (0.51). */
  async adminSheetInfo(id, token) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/sheet-info', { id, token }, 20000);
  }

  /**
   * 볼 구글 문서를 바꾼다 (0.51). 빈 값을 보내면 지우고 원래 자리로 되돌린다.
   * 시트를 새로 만들어 올리면 문서 아이디가 바뀌므로, 재배포 없이 여기서 고친다.
   */
  async adminSheetSet(id, token, url) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/admin/sheet-set', { id, token, url }, 20000);
  }

  /** 지금 고룡이 와 있는가. 체력은 서버가 들고 있다. */
  async dragon() {
    if (!this.isServer) return { offline: true };
    return this._post('/api/dragon', {});
  }

  /** 한 판 싸우고 이만큼 깎았다고 알린다. */
  async hitDragon(id, token, damage) {
    if (!this.isServer) return { ok: false, offline: true };
    return this._post('/api/dragon/hit', { id, token, damage });
  }

  // ---------- 편의 ----------

  rememberId(id) {
    LS.set(LS_LAST, id);
  }

  lastId() {
    return LS.get(LS_LAST) || '';
  }

  /** 이 브라우저에 저장이 되는가(프라이빗 브라우징이면 false). */
  get canStoreLocally() {
    return LS.usable();
  }

  // ---------- 콘텐츠(서버 배포 표) ----------

  /**
   * 서버가 배포 중인 표를 받아 온다. 서버가 없으면 null.
   * @returns {{version:number, files:object}|null}
   */
  async fetchContent() {
    if (!this.isServer) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/content`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.files ? data : null;
    } catch {
      return null;
    }
  }

  /** 새 버전이 나왔는지만 확인한다(가벼운 폴링용). */
  async contentVersion() {
    if (!this.isServer) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/content-version`);
      return res.ok ? (await res.json()).version : null;
    } catch {
      return null;
    }
  }

  // ---------- 설정 ----------
  // 설정은 "이 기기"의 취향이므로 계정 세이브와 달리 항상 브라우저에만 남긴다.

  loadSettings() {
    try {
      return JSON.parse(LS.get(LS_SETTINGS) || 'null');
    } catch {
      return null;
    }
  }

  saveSettings(settings) {
    LS.set(LS_SETTINGS, JSON.stringify(settings));
  }

  /** 이 브라우저에 저장된 계정 목록(로컬 모드 안내용). */
  localAccounts() {
    if (this.memoryOnly) return [...MEMORY.keys()];
    return LS.keys()
      .filter((k) => k && k.startsWith(LS_PREFIX))
      .map((k) => k.slice(LS_PREFIX.length));
  }
}
