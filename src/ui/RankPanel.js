// 책임: 타임어택 랭킹 화면 — 보스마다 "잡기까지 걸린 시간" 상위 5명.
// 금지: 기록 판정·서버 호출. main.js 가 받아 온 것을 보여 주기만 한다.
//
// ── 무엇을 재는가 ──────────────────────────────────────────
// 캐릭터를 만든 뒤 그 보스를 처음 눕히기까지, **접속해서 실제로 논 시간**이다.
// "몇 번 만에 이겼나"가 아니라 "얼마 만에 여기까지 왔나"를 겨루는 판이라,
// 레벨을 올리는 속도·장비를 갖추는 속도가 전부 여기에 들어간다.
// 처음 눕힌 기록만 센다 — 다 키운 캐릭터로 다시 잡아도 기록은 바뀌지 않는다.
//
// ⚠ 0.70.1 까지는 **벽시계**였다(지금 − 캐릭터를 만든 시각). 접속을 끊고 자는
//   동안에도 흘러서, 이어서 하는 사람은 표에 오를 수가 없었다. 0.70.2 부터
//   서버가 접속해 있는 동안만 쌓는다(server/playclock.js).

/** 밀리초를 "3시간 12분" 같은 말로. 초 단위까지 보여 주면 표가 시끄러워진다. */
export function timeText(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${h}시간 ${String(m).padStart(2, '0')}분`;
  if (m > 0) return `${m}분 ${String(s).padStart(2, '0')}초`;
  return `${s}초`;
}

/**
 * "3일 20시간 59분" — 마감까지 남은 시간 (0.70.5).
 *
 * timeText 와 다른 규칙을 쓴다. 저쪽은 **걸린 시간**(짧다, 분·초가 중요)이고
 * 이쪽은 **남은 시간**(길다, 날·시간이 중요)이라 같은 자를 쓸 수 없다.
 * 하루가 넘으면 초는 적지 않는다 — 사흘 남은 사람에게 초는 소음이다.
 */
export function leftText(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (d > 0) return `${d}일 ${h}시간 ${m}분`;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

const MEDAL = ['🥇', '🥈', '🥉', '4', '5'];

export class RankPanel {
  constructor({ bus, store, root, assets = null }) {
    this.bus = bus;
    this.store = store;
    // 직업 마크를 그리려면 그림이 있어야 한다 (0.69). 없어도 표는 나온다.
    this.assets = assets;
    this.root = root;
    this.open = false;
    this.tab = null; // 지금 보고 있는 보스
    // 'now' = 이번 시즌, 'prev' = 지난 시즌.
    // 초기화를 하면 지금 표가 지난 시즌으로 넘어가므로, 지워지는 게 아니라 옮겨진다.
    this.era = 'now';

    this.root.hidden = true;
    store.subscribe(() => {
      if (this.open) this.render();
    });
  }

  show() {
    this.open = true;
    this.root.hidden = false;
    this.render();
    // 도전 시계는 초마다 흐른다 — 멈춰 있으면 "지금도 재고 있다"가 안 보인다.
    //
    // ⚠ 창을 통째로 다시 그리지 않는다. 1초마다 innerHTML 을 갈아 끼우면
    //   탭을 누르는 그 순간에 버튼이 갈릴 수 있다. 숫자 한 칸만 고친다.
    clearInterval(this._clockTimer);
    this._clockTimer = setInterval(() => this._tickClock(), 1000);
    this.bus.emit('rank:opened');
    this.bus.emit('ui:rank-refresh');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    clearInterval(this._clockTimer);
    this._clockTimer = null;
    this.bus.emit('rank:closed');
  }

  /** 도전 시계와 마감 시계의 숫자만 고친다(창을 다시 그리지 않는다). */
  _tickClock() {
    if (!this.open) return;
    const board = this.store.state.ranks || {};

    const el = this.root.querySelector('.rank-clock b');
    if (el && typeof board.played === 'number') {
      const drift = board.playedAt ? Math.max(0, Date.now() - board.playedAt) : 0;
      el.textContent = timeText(board.played + drift);
    }

    // 마감까지 남은 시간 (0.70.5).
    //
    // ⚠ 0 이 되는 순간 **다시 그린다.** 그래야 "0초 후 종료" 로 굳지 않고
    //   '시즌 종료' 로 바뀐다. 실제 마감은 서버가 하고(시즌 시계), 여기서는
    //   그 사실이 화면에 늦게 닿지 않게만 한다.
    const dl = this.root.querySelector('[data-deadline]');
    if (!dl) return;
    const season = board.season;
    if (!season) return;
    if (season.endedAt) {
      const left = Math.max(0, (season.nextStartsAt || 0) - Date.now());
      const b = dl.querySelector('b:last-of-type');
      if (season.nextStartsAt && b) b.textContent = leftText(left);
      return;
    }
    const left = Math.max(0, (season.endsAt || 0) - Date.now());
    if (left <= 0) { this.render(); return; }
    dl.classList.toggle('is-soon', left < 3600000);
    const b = dl.querySelector('b');
    if (b) b.textContent = leftText(left);
  }

  /** 랭킹을 매기는 보스 목록. maps.json 에서 보스가 있는 맵을 순서대로 모은다. */
  _bosses() {
    const state = this.store.state;
    const maps = state.db.maps.maps;
    const out = [];
    for (const [mapId, def] of Object.entries(maps)) {
      const monId = def.boss || (def.timedBoss && def.timedBoss.monster);
      if (!monId) continue;
      const mon = state.db.monsters[monId];
      if (!mon) continue;
      out.push({
        key: monId,
        mapId,
        // 탭 이름은 짧아야 한다 — 여섯 개가 한 줄에 들어가야 하므로 최소한만 쓴다.
        // 지하감옥은 stage 가 21~25 라 "25단계"로 보이는데, 들판 20단계 옆에 두면
        // 다음 단계처럼 읽힌다. 아예 다른 곳이므로 "지하 N층"이라고 적는다.
        tab: mapId.startsWith('dungeon_')
          ? `지하 ${mapId.split('_')[1]}층`
          : def.timedBoss
            ? '고룡'
            : def.stage
              ? `${def.stage}단계`
              : def.name,
        name: mon.name,
        where: def.name,
        stage: def.stage || 99,
      });
    }
    return out.sort((a, b) => a.stage - b.stage);
  }

  render() {
    const state = this.store.state;
    const board = state.ranks || { table: {}, offline: false, loading: false };
    const bosses = this._bosses();
    if (!this.tab || !bosses.some((b) => b.key === this.tab)) {
      this.tab = bosses.length ? bosses[0].key : null;
    }
    const now = bosses.find((b) => b.key === this.tab);

    // 지난 시즌이 아예 없으면 단을 안 보여 준다 — 늘 비어 있는 탭은 방해만 된다.
    const prev = board.prev || { table: {}, mine: {}, total: {} };
    const hasPrev = Object.values(prev.table || {}).some((l) => Array.isArray(l) && l.length);
    if (this.era === 'prev' && !hasPrev) this.era = 'now';

    const src = this.era === 'prev' ? prev : board;
    const rows = (src.table && src.table[this.tab]) || [];
    const mine = (src.mine && src.mine[this.tab]) || null;
    const total = (src.total && src.total[this.tab]) || rows.length;
    const season = board.season || null;

    this.root.innerHTML = `
      <div class="wp-panel rank-panel">
        <header class="inv-header">
          <h2>타임어택</h2>
          <span class="inv-hint">${
            board.offline ? '서버에 접속했을 때만 보입니다' : '접속해서 논 시간으로 잽니다'
          }</span>
          <button class="inv-close" data-close>✕</button>
        </header>
        ${this._clockHtml(board)}
        ${
          hasPrev
            ? `<div class="rank-eras">
                 <button data-era="now" class="${this.era === 'now' ? 'is-on' : ''}">
                   현재 시즌${season && season.season ? ` <i>${season.season}</i>` : ''}
                 </button>
                 <button data-era="prev" class="${this.era === 'prev' ? 'is-on' : ''}">
                   지난 시즌${season && season.prevSeason ? ` <i>${season.prevSeason}</i>` : ''}
                 </button>
               </div>`
            : ''
        }
        ${this._eraNoteHtml(season, hasPrev)}
        ${this._deadlineHtml(season)}
        <div class="rank-tabs">${bosses
          .map(
            (b) =>
              `<button data-tab="${b.key}" class="${b.key === this.tab ? 'is-on' : ''}">${b.tab}</button>`
          )
          .join('')}</div>
        ${now ? `<p class="rank-where">${now.name} · ${now.where}</p>` : ''}
        ${this._listHtml(board, rows)}
        ${this._mineHtml(board, rows, mine, total)}
      </div>`;

    this.root.querySelector('[data-close]').addEventListener('click', () => this.close());
    for (const btn of this.root.querySelectorAll('[data-tab]')) {
      btn.addEventListener('click', () => {
        this.tab = btn.dataset.tab;
        this.render();
      });
    }
    for (const btn of this.root.querySelectorAll('[data-era]')) {
      btn.addEventListener('click', () => {
        this.era = btn.dataset.era;
        this.render();
      });
    }
  }

  /**
   * 맨 위의 "지금 도전" 줄 (0.70.2).
   *
   * ── 왜 필요한가 ────────────────────────────────────────
   * 0.70.2 부터 타임어택 시계는 **접속해 있는 동안만** 흐른다. 끊으면 멈춘다.
   * 그런데 그 값이 어디에도 안 보이면 사람은 여전히 벽시계로 짐작한다 —
   * "어제 시작했으니 벌써 열 몇 시간이겠지" 하고 도전을 접어 버린다.
   * 그래서 지금 얼마가 쌓였는지를 여기서 늘 보여 준다.
   *
   * 시간은 **서버가 잰다.** 여기서는 받아 온 값에 그 뒤로 흐른 만큼만 더해
   * 창을 열어 둔 사이에도 멈춰 보이지 않게 한다(잣대는 아니고 눈요기다).
   * 지난 시즌 표를 보고 있을 때는 안 보여 준다 — 그 시계는 이미 끝났다.
   */
  _clockHtml(board) {
    if (board.offline || this.era === 'prev' || typeof board.played !== 'number') return '';
    const since = Number(board.playedAt) || 0;
    const drift = since ? Math.max(0, Date.now() - since) : 0;
    return `<p class="rank-clock">
      <span class="rank-clock-label">지금 도전</span>
      <b>${timeText(board.played + drift)}</b>
      <i>접속해 있는 동안만 흐릅니다</i>
    </p>`;
  }

  /**
   * 탭 바로 위, 오른쪽 끝에 붙는 **마감까지 남은 시간** (0.70.5).
   *
   *   3일 20시간 59분 후 종료
   *
   * ── 왜 필요한가 ────────────────────────────────────────
   * 타임어택은 "언제까지" 가 있어야 겨루기가 된다. 끝이 안 보이면
   * 오늘 달려야 할 이유도, 내일로 미룰 이유도 생기지 않는다.
   *
   * 세 가지 상태가 있고 셋 다 다르게 적는다:
   *   · 아직 진행 중        `n일 n시간 n분 후 종료`
   *   · 끝났고 다음을 기다림 `시즌 종료 · 다음 시즌 n시간 n분 후`
   *   · 끝을 안 정했음       (아무것도 안 적는다 — 없는 마감을 지어내지 않는다)
   *
   * 지난 시즌 단을 보고 있을 때도 안 적는다. 그 시즌의 마감은 이미 지났다.
   */
  _deadlineHtml(season) {
    if (!season || this.era === 'prev') return '';
    const now = Date.now();

    if (season.endedAt) {
      const left = Math.max(0, (season.nextStartsAt || 0) - now);
      return `<p class="rank-deadline is-over" data-deadline>
        <b>시즌 종료</b>${
        season.nextStartsAt
          ? ` · 다음 시즌 <b>${leftText(left)}</b> 후`
          : ''}</p>`;
    }
    if (!season.endsAt) return '';
    const left = Math.max(0, season.endsAt - now);
    return `<p class="rank-deadline ${left < 3600000 ? 'is-soon' : ''}" data-deadline>
      <b>${leftText(left)}</b> 후 종료</p>`;
  }

  /** 지금 보고 있는 단이 언제부터 언제까지인지 한 줄로. */
  _eraNoteHtml(season, hasPrev) {
    if (!season || !hasPrev) return '';
    const d = (ms) => {
      if (!ms) return '';
      const t = new Date(Number(ms));
      return `${t.getFullYear()}. ${t.getMonth() + 1}. ${t.getDate()}.`;
    };
    if (this.era === 'prev') {
      const from = d(season.prevStartedAt);
      const to = d(season.prevEndedAt);
      return `<p class="rank-era-note">끝난 시즌입니다 — ${from || '처음'} ~ ${to || ''} · 기록은 그대로 남습니다</p>`;
    }
    const from = d(season.startedAt);
    return `<p class="rank-era-note">${from ? `${from} 부터` : '진행 중'} · 초기화하면 이 표가 지난 시즌으로 넘어갑니다</p>`;
  }

  /**
   * 표 아래의 "내 기록" 줄.
   *
   * 표에 보이는 것은 위쪽 몇 명뿐이다. 그 밖이면 내 이름은 어디에도 없다 —
   * 그때 "몇 위 안에 없습니다" 만 보여 주면 얼마나 모자란지도,
   * 다음에 뭘 해야 할지도 알 수 없다. 그래서 몇 위인지·몇 명 중인지·
   * 1위와 얼마나 벌어졌는지를 한 줄로 적어 준다.
   *
   * ⚠ 0.70.3 — **늘 붙인다.** 그 전에는 내가 표 안에 있으면 이 줄을 지웠다
   *   ("위에서 이미 강조되니까"). 그런데 이 줄은 자리를 알려 주는 곳이 아니라
   *   **내 것을 놓아 두는 자리**다. 있다 없다 하면 창을 열 때마다 눈이 그것을
   *   다시 찾아야 하고, 표 안에 든 사람은 1위와의 차이도 못 본다.
   *   자리는 늘 같은 곳에 있어야 한다.
   */
  _mineHtml(board, rows, mine, total) {
    if (board.offline || board.loading) return '';
    const me = this.store.state.accountId;

    if (!mine) {
      // 아직 못 잡았다 — 무엇을 해야 이 표에 오르는지만 적는다.
      return `<div class="rank-mine is-none">
        <span class="rank-mine-label">내 기록</span>
        <span class="rank-mine-note">${
          this.era === 'prev' ? '그 시즌에는 기록이 없습니다' : '아직 눕히지 못했습니다'
        }</span>
      </div>`;
    }
    const shown = rows.some((r) => r.id === me);
    const best = rows.length ? rows[0].ms : mine.ms;
    const behind = Math.max(0, mine.ms - best);
    return `<div class="rank-mine ${shown ? 'is-listed' : ''}">
      <span class="rank-mine-label">내 기록</span>
      <span class="rank-mine-rank">${mine.rank}위<i> / ${total}명</i></span>
      ${this._markHtml(mine.cls)}
      ${this._levelHtml(mine.lv)}
      <span class="rank-mine-time">${timeText(mine.ms)}</span>
      ${
        behind > 0
          ? `<span class="rank-mine-gap">1위와 ${timeText(behind)} 차이</span>`
          : `<span class="rank-mine-gap is-top">가장 빠른 기록입니다</span>`
      }
    </div>`;
  }

  _listHtml(board, rows) {
    if (board.offline) {
      return `<p class="wp-note">
        랭킹은 <b>서버에 접속해서 할 때만</b> 보입니다. 남과 견주는 것이 전부인 표라서요.
      </p>`;
    }
    if (board.loading && !rows.length) return `<p class="wp-note">받아 오는 중…</p>`;
    if (!rows.length) {
      return `<p class="wp-note">아직 아무도 눕히지 못했습니다.<br>
        첫 기록을 남기면 이 자리에 이름이 새겨집니다.</p>`;
    }
    const me = this.store.state.accountId;
    return `<ol class="rank-list">${rows
      .map(
        (r, i) => `
        <li class="rank-row ${r.id === me ? 'is-me' : ''}">
          <span class="rank-medal">${MEDAL[i] || i + 1}</span>
          ${this._markHtml(r.cls)}
          <span class="rank-name">${escapeHtml(r.name)}</span>
          ${this._levelHtml(r.lv)}
          <span class="rank-time">${timeText(r.ms)}</span>
        </li>`
      )
      .join('')}</ol>`;
  }

  /**
   * 직업 마크 (0.69).
   *
   * 캐릭터 그림을 줄여 쓰지 않는다 — 24px 에서는 세 직업이 다 비슷한 사람
   * 실루엣이라 구별이 안 된다. **무엇을 드느냐**로 그린 마크를 따로 굽는다.
   *
   * 옛 줄에는 직업이 안 적혀 있다. 그때는 자리만 비워 둔다 — 물음표 같은 것을
   * 채우면 "직업이 물음표인 사람" 처럼 보인다.
   */
  _markHtml(cls) {
    const list = (this.store.state.db && this.store.state.db.classes
      && this.store.state.db.classes.list) || {};
    const def = cls ? list[cls] : null;
    if (!cls || !def) return '<span class="rank-mark rank-mark--none"></span>';
    const asset = this.assets ? this.assets.get(`mark_${cls}`) : null;
    if (!asset || !asset.ok) {
      // 그림이 없으면 이름 첫 글자로 대신한다(빈칸보다는 낫다).
      return `<span class="rank-mark rank-mark--text" title="${escapeAttr(def.name)}"
        >${escapeHtml(String(def.name).slice(0, 1))}</span>`;
    }
    return `<span class="rank-mark" title="${escapeAttr(def.name)}"
      ><img src="${escapeAttr(asset.image.src)}" alt="${escapeAttr(def.name)}" /></span>`;
  }

  /** 그때의 레벨. 같은 초에 끝냈으면 **낮은 쪽이 위**라, 이 숫자가 순위를 가른다. */
  _levelHtml(lv) {
    if (!Number.isFinite(lv) || lv <= 0) return '<span class="rank-lv rank-lv--none"></span>';
    return `<span class="rank-lv">Lv.${lv}</span>`;
  }
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

const escapeAttr = escapeHtml;
