// 책임: 구글 시트를 읽어 서버가 배포 중인 표로 바꿔 넣는다.
// 금지: 게임 규칙, 계정. 표를 받아 검사하고 server/content.js 에 넘기는 일만 한다.
//
// ── 무엇을 위한 것인가 ─────────────────────────────────────
// 아이템 값 하나 고치자고 GitHub 에 올리고 다시 배포되기를 기다리는 건 번거롭다.
// 구글 시트를 하나 만들어 두면 거기서 숫자를 고치는 것만으로 반영된다.
//
//   ① 구글 시트를 "링크가 있는 모든 사용자 — 뷰어" 로 공개한다
//   ② 탭 이름을 items / monsters / drops / quests 로 맞춘다
//   ③ Render 환경변수에 SHEET_ID 를 넣는다
//      (안 넣어도 된다 — 저장소의 sheets/SOURCE.txt 에 적힌 문서를 대신 읽는다)
//   ④ SHEET_POLL_MIN 분마다 서버가 알아서 읽어 온다
//      (급하면 ADMIN_KEY 를 들고 POST /api/content/pull 로 즉시)
//
// ── 안전장치 ───────────────────────────────────────────────
// 받은 표는 반드시 content.validate 를 통과해야 한다. 통과 못 하면 아무것도 바꾸지 않는다.
// 시트에 오타를 내도 놀고 있는 사람들의 게임이 깨지지 않는다.

const fs = require('fs');
const path = require('path');
const sheets = require('./sheets.js');
const content = require('./content.js');
const xlsxread = require('./xlsxread.js');

// 탭 목록은 sheets.js 의 등록표에서 그대로 온다.
// 표를 새로 하나 만들면 여기 손댈 것 없이 자동으로 함께 읽힌다.
const TABS = Object.keys(sheets.SHEETS);
const FETCH_TIMEOUT_MS = 15000;

/**
 * 시트가 안 정해져 있을 때의 안내.
 *
 * 예전에는 "SHEET_ID 가 설정되어 있지 않습니다." 한 줄이었다. 맞는 말이지만
 * **무엇을 해야 하는지가 없어서** 누른 사람이 거기서 막힌다. 길을 둘 다 적는다.
 */
const NO_SHEET_MSG = [
  '읽어 올 구글 시트가 정해져 있지 않습니다.',
  '① Render 환경변수에 SHEET_ID 를 넣거나,',
  '② 저장소에서 `node tools/sheets.js pull "<시트 주소>"` 를 한 번 돌려',
  '   sheets/SOURCE.txt 를 만든 뒤 다시 올리세요. (자세히: SHEETS.md)',
].join('\n');

/**
 * 통합문서를 통째로 내려받는 주소.
 *
 * ── 왜 탭마다 CSV 가 아니라 통합문서 한 장인가 (0.52) ──────
 *
 * 예전에는 탭마다 `gviz/tq?tqx=out:csv&sheet=…` 로 하나씩 받았다. 그런데 gviz 는
 * **열마다 자료형을 스스로 정하고, 거기 안 맞는 칸을 빈칸으로 지워서** 준다.
 * `classes` 탭의 '값' 열은 `용사`(글자)와 `48`(숫자)이 섞여 있어서, 구글이 그 열을
 * 숫자로 보고 `용사` 를 지웠다 — 서버는 "이름은 비울 수 없습니다" 로 멈췄고,
 * 사람은 멀쩡한 시트를 붙들고 헤맸다. 그 앞에는 제목 줄을 몇 줄로 볼지도
 * 스스로 짐작해서(`직업 warrior warrior warrior`) 같은 식으로 막혔다.
 *
 * **짐작하는 통로를 그만 쓴다.** `export?format=xlsx` 는 칸에 적힌 것을 그대로 준다.
 * 덤으로 요청이 열 번에서 한 번으로 줄고, 탭을 반쯤 읽다 마는 일이 없어진다.
 *
 * ⚠ 구글 응답은 중간 서버에 몇 분씩 남는다. 뒤에 매번 다른 값을 붙여 비껴간다.
 */
function workbookUrl(idOrUrl, fresh = true) {
  const s = String(idOrUrl).trim();
  const m = /\/d\/(?:e\/)?([A-Za-z0-9-_]+)/.exec(s);
  const id = m ? m[1] : s;
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`
    + (fresh ? `&_ts=${Date.now()}` : '');
}

/** SHEET_ID 만 넣고 주기를 안 정했을 때 몇 분마다 볼 것인가. */
const DEFAULT_POLL_MIN = 5;

/** 저장소가 기억하고 있는 문서(0.43 의 `tools/sheets.js pull` 이 적어 둔다). */
const SOURCE_FILE = path.join(__dirname, '..', 'sheets', 'SOURCE.txt');

/**
 * 저장소에 적혀 있는 시트 주소를 읽는다.
 *
 * 왜 있나: 환경변수를 안 넣은 서버에서 "시트 지금 읽기" 를 누르면
 * "SHEET_ID 가 설정되어 있지 않습니다" 만 나왔다. 그런데 **저장소는 이미 어느
 * 문서인지 알고 있다** — `tools/sheets.js pull` 을 한 번이라도 돌렸으면
 * sheets/SOURCE.txt 에 그 문서 아이디가 적혀 있다. 알고 있는 것을 두고
 * 사람에게 다시 물을 이유가 없다.
 *
 * 환경변수가 있으면 **그쪽이 이긴다** — 배포한 서버가 다른 문서를 보게 하려고
 * 일부러 넣는 값이므로, 저장소에 적힌 것이 그걸 덮어써서는 안 된다.
 */
function idFromFile() {
  try {
    const raw = fs.readFileSync(SOURCE_FILE, 'utf8');
    const line = raw
      .split(/\r?\n/)
      .map((t) => t.trim())
      .find((t) => t && !t.startsWith('#'));
    return line || '';
  } catch {
    return '';
  }
}

/**
 * 운영자 창에서 정해 둔 문서 아이디 (0.51).
 *
 * 왜 필요한가: 문서 아이디가 **판마다 바뀌고 있었다.** 시트를 새로 만들어 올리면
 * 아이디가 달라지는데, 그때마다 저장소의 sheets/SOURCE.txt 를 고치고 다시 배포해야
 * 서버가 새 문서를 봤다. 그 사이 서버는 없어진 문서를 계속 두드리고
 * `401` · `404` 만 돌려받았다. 다섯 판 연속으로 같은 일이 났다.
 *
 * 그래서 **살아 있는 서버에 대고 주소를 바꿀 수 있게** 한다.
 * 운영자 창 표 단에 주소를 붙여 넣고 저장하면 그때부터 그 문서를 본다.
 *
 * 여기(사람이 방금 손으로 넣은 값)가 **환경변수보다 세다.** 순서를 뒤집으면
 * 환경변수가 낡았을 때 다시 재배포 말고는 길이 없어져, 이 기능이 있으나 마나가 된다.
 * 서버가 살아 있는 동안만 여기 들고 있고, 실제 보관은 store 의 문서 칸에 한다
 * (Upstash 를 쓰면 서버가 자다 깨어나도 남는다).
 */
let savedId = '';
function setSavedId(idOrUrl) {
  savedId = idFromAny(idOrUrl);
  return savedId;
}
function getSavedId() {
  return savedId;
}

/** 주소든 아이디든 문서 아이디만 뽑아 낸다. */
function idFromAny(idOrUrl) {
  const s = String(idOrUrl || '').trim();
  if (!s) return '';
  const m = /\/d\/(?:e\/)?([A-Za-z0-9-_]{20,})/.exec(s);
  if (m) return m[1];
  return /^[A-Za-z0-9-_]{20,}$/.test(s) ? s : '';
}

function config(env = process.env) {
  const fromEnv = String(env.SHEET_ID || '').trim();
  const id = savedId || fromEnv || idFromFile();
  // 예전에는 기본이 0(안 봄)이었다. 그래서 SHEET_ID 만 넣어 둔 서버는
  // 시트를 아무리 고쳐도 **영영 읽지 않았고**, 그것이 "고쳤는데 반영이 안 된다"의
  // 가장 흔한 원인이었다. 시트를 연결했다는 것 자체가 "읽어 달라"는 뜻이므로
  // 기본을 5분으로 둔다. 끄고 싶으면 SHEET_POLL_MIN=0 을 명시한다.
  const raw = String(env.SHEET_POLL_MIN ?? '').trim();
  const pollMin = raw === '' ? DEFAULT_POLL_MIN : Number(raw);
  return {
    id,
    enabled: !!id,
    // 어디서 온 아이디인가 — 로그와 운영자 창이 "어느 문서를 보고 있나" 를 말할 때 쓴다.
    from: savedId ? 'saved' : fromEnv ? 'env' : id ? 'file' : null,
    pollMs: Number.isFinite(pollMin) && pollMin > 0 ? Math.max(1, pollMin) * 60000 : 0,
    pollDefaulted: raw === '',
    adminKey: String(env.ADMIN_KEY || '').trim(),
  };
}

/** 통합문서를 한 번에 받아 { 탭이름: 줄배열 } 로 푼다. */
async function fetchWorkbook(idOrUrl) {
  const url = workbookUrl(idOrUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      // 주소에 붙인 값만으로는 우리 쪽 캐시를 못 비껴갈 수 있다. 둘 다 건다.
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });
  } catch (err) {
    throw new Error(
      err && err.name === 'AbortError'
        ? '시트를 받는 데 너무 오래 걸립니다.'
        : '시트에 연결하지 못했습니다.'
    );
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    // 401·404 는 거의 언제나 **그 문서가 아니라 다른 문서를 보고 있다**는 뜻이다.
    // (시트를 새로 만들어 올리면 아이디가 바뀌는데 서버는 옛 아이디를 들고 있다)
    // 공개 설정만 탓하면 사람이 멀쩡한 시트를 붙들고 헤매게 된다 — 실제로 그랬다.
    const lost = res.status === 401 || res.status === 404;
    throw new Error(
      `시트를 받지 못했습니다 (${res.status}). `
      + (lost
        ? '그 문서가 없어졌거나(새로 만들어 올리면 아이디가 바뀝니다) 공개가 풀렸습니다. '
          + '운영자 창 표 단에서 지금 시트 주소를 붙여 넣고 저장해 보세요.'
        : '시트를 "링크가 있는 모든 사용자 — 뷰어" 로 공개했는지 보세요.')
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // 비공개 문서는 파일 대신 로그인 페이지(HTML)를 준다.
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error('표 대신 웹페이지가 왔습니다. 시트가 아직 비공개입니다.');
  }
  try {
    return xlsxread.readWorkbook(buf);
  } catch (err) {
    throw new Error(`시트를 푸는 데 실패했습니다 — ${err.message}`);
  }
}

/**
 * 시트를 한 번 읽어 반영한다.
 * @returns {Promise<{ok:boolean, version?:number, changed?:string[], errors?:string[], skipped?:boolean}>}
 */
async function pullOnce(env = process.env, note = '', onBeforeWrite = null) {
  const cfg = config(env);
  if (!cfg.enabled) return { ok: false, errors: [NO_SHEET_MSG] };

  content.initFromSource();
  const { files: current, errors: readErrors } = content.readAll();
  if (readErrors.length) return { ok: false, errors: readErrors };

  // ① 받아서 ② 바꿔 본다 — 아직 아무 파일도 건드리지 않는다.
  //    통합문서 한 장을 한 번만 받는다(0.52). 탭마다 따로 받던 시절에는
  //    중간에 한 탭이 실패하면 어디까지 읽었는지가 그때그때 달랐다.
  let book;
  try {
    book = await fetchWorkbook(cfg.id);
  } catch (err) {
    return { ok: false, errors: [err.message] };
  }

  const next = { ...current };
  const texts = {};
  for (const tab of TABS) {
    const def = sheets.SHEETS[tab];
    if (!def.files.every((f) => current[f])) continue;
    const rows = book[tab];
    if (!rows) {
      return { ok: false, errors: [`'${tab}' 탭이 문서에 없습니다. 탭 이름을 그대로 두세요.`] };
    }
    if (rows.length < 2) return { ok: false, errors: [`'${tab}' 탭이 비어 있습니다.`] };
    try {
      // 앞선 탭이 이미 고쳐 놓은 것 위에 얹는다.
      const produced = def.apply(rows, next);
      for (const [file, json] of Object.entries(produced)) {
        next[file] = json;
        texts[file] = sheets.stringify(tab, file, json, current[file]);
      }
    } catch (err) {
      return { ok: false, errors: [`'${tab}' 탭 — ${err.message}`] };
    }
  }

  // ③ 표끼리 앞뒤가 맞는지 본다. 여기서 걸리면 아무것도 바뀌지 않는다.
  const v = content.validate(next);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };

  // ④ 정말 달라진 것만 쓴다(같은 내용이면 버전을 괜히 올리지 않는다).
  // 파일을 건드리기 직전에 알린다 — 서버는 이때 폴더 감시자를 재워
  // 한 번 고친 것이 판 두 개로 올라가는 일을 막는다.
  if (typeof onBeforeWrite === 'function') onBeforeWrite();
  const changed = [];
  for (const [file, text] of Object.entries(texts)) {
    const dest = path.join(content.CONTENT_DIR, file);
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    if (before === text) continue;
    fs.writeFileSync(dest, text);
    changed.push(file);
  }
  if (!changed.length) return { ok: true, skipped: true, changed: [], warnings: v.warnings };

  const pub = content.publish(note || '구글 시트에서 반영');
  if (!pub.ok) return { ok: false, errors: pub.errors };
  return { ok: true, version: pub.version, changed, warnings: v.warnings };
}

/**
 * 주기적으로 시트를 확인한다.
 * @param {(result:object) => void} onPublish 새로 배포됐을 때만 부른다
 * @returns {() => void} 그만두게 하는 함수
 */
function startPolling(env, onPublish, onBeforeWrite = null) {
  const cfg = config(env);
  if (!cfg.enabled || !cfg.pollMs) return () => {};

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const r = await pullOnce(env, '구글 시트 자동 반영', onBeforeWrite);
      if (r.ok && !r.skipped) onPublish(r);
      else if (!r.ok) console.log('(시트 확인 실패:', (r.errors || []).join(' / '), ')');
    } catch (err) {
      console.log('(시트 확인 중 오류:', err.message, ')');
    } finally {
      busy = false;
    }
  };

  const timer = setInterval(tick, cfg.pollMs);
  if (timer.unref) timer.unref();
  setTimeout(tick, 5000); // 켜지고 조금 뒤 한 번
  return () => clearInterval(timer);
}

module.exports = {
  NO_SHEET_MSG, config, pullOnce, startPolling, workbookUrl, fetchWorkbook, TABS,
  setSavedId, getSavedId, idFromAny };
