// 책임: 타임어택 랭킹 화면 — 보스마다 "잡기까지 걸린 시간" 상위 5명.
// 금지: 기록 판정·서버 호출. main.js 가 받아 온 것을 보여 주기만 한다.
//
// ── 무엇을 재는가 ──────────────────────────────────────────
// 캐릭터를 만든 순간부터 그 보스를 처음 눕힌 순간까지의 시간이다.
// "몇 번 만에 이겼나"가 아니라 "얼마 만에 여기까지 왔나"를 겨루는 판이라,
// 레벨을 올리는 속도·장비를 갖추는 속도가 전부 여기에 들어간다.
// 처음 눕힌 기록만 센다 — 다 키운 캐릭터로 다시 잡아도 기록은 바뀌지 않는다.

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

const MEDAL = ['🥇', '🥈', '🥉', '4', '5'];

export class RankPanel {
  constructor({ bus, store, root }) {
    this.bus = bus;
    this.store = store;
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
    this.bus.emit('rank:opened');
    this.bus.emit('ui:rank-refresh');
  }

  close() {
    this.open = false;
    this.root.hidden = true;
    this.bus.emit('rank:closed');
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
            board.offline ? '서버에 접속했을 때만 보입니다' : '캐릭터를 만든 뒤 처음 눕히기까지'
          }</span>
          <button class="inv-close" data-close>✕</button>
        </header>
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
   * 5위 밖이면 위 표에는 내가 없다. 그때 "5위 안에 없습니다"만 보여 주면
   * 얼마나 모자란지도, 다음에 뭘 해야 할지도 알 수 없다.
   * 그래서 몇 위인지·몇 명 중인지·1위와 얼마나 벌어졌는지를 한 줄로 적어 준다.
   * 이미 5위 안에 있으면 위 표에서 이미 강조되므로 이 줄은 띄우지 않는다.
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
    if (rows.some((r) => r.id === me)) return ''; // 위 표에 이미 있다

    const best = rows.length ? rows[0].ms : mine.ms;
    const behind = Math.max(0, mine.ms - best);
    return `<div class="rank-mine">
      <span class="rank-mine-label">내 기록</span>
      <span class="rank-mine-rank">${mine.rank}위<i> / ${total}명</i></span>
      <span class="rank-mine-time">${timeText(mine.ms)}</span>
      ${behind > 0 ? `<span class="rank-mine-gap">1위와 ${timeText(behind)} 차이</span>` : ''}
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
          <span class="rank-name">${r.name}</span>
          <span class="rank-time">${timeText(r.ms)}</span>
        </li>`
      )
      .join('')}</ol>`;
  }
}
