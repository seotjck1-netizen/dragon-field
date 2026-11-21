// 책임: 판이 크게 바뀔 때 **세이브를 한 번 새로 시작한다**(계정 · 비밀번호는 남긴다).
//       그 전에 옛 것을 통째로 **보관**한다 — 지우지 않는다.
// 금지: 계정(아이디 · 비밀번호)을 지우는 일. 그건 운영자 단추의 일이다(world.deleteAccount).
//
// ── 0.80.20 ─────────────────────────────────────────────────
// 장비 셋 · 강화 · 전투가 통째로 바뀌었다(docs/SPEC-0.80.md). 옛 장비는 새 규칙에서 값이
// 맞지 않으므로 모두 새로 시작한다 — 사용자가 2026-11-11 에 정했다(docs/HANDOFF-0.80.md 답 1).
//
//   ① 보관   파일 저장소 → server/data-<옛 판>/ 에 폴더째 복사
//            Upstash     → poino:* 키를 arch:<옛 판>:poino:* 로 복사(문자열 · 집합 둘 다)
//   ② 비우기 랭킹 표를 지난 시즌으로 넘기고(world.resetRanks), 모든 계정의 세이브 · 우편 ·
//            처음 잡은 기록을 비운다(world.resetAllSaves — 시즌 초기화와 같은 절차). 계정은 그대로.
//   ③ 표시   세상 문서 'saveEpoch' 에 { epoch, at, archivedAs, accounts } 를 남긴다.
//            서버가 다시 떠도 이 표시가 있으면 아무것도 하지 않는다(한 번뿐).
//
// 옛 판으로 롤백하려면: 보관해 둔 것을 되돌린 뒤(server/data-<옛 판>/ → server/data/,
// Upstash 는 arch:<옛 판>: 키를 원래 이름으로) 옛 판을 올린다. 표시 문서 'saveEpoch' 도 지운다.

const fs = require('fs');
const path = require('path');

/** 이 판에서 세이브를 새로 시작한다. 바꾸면 그 판이 처음 뜰 때 또 한 번 새로 시작한다. */
const SAVE_EPOCH = '0.80.20';
const EPOCH_DOC = 'saveEpoch';

function safeTag(s) {
  return String(s || 'old').replace(/[^0-9A-Za-z._-]/g, '_').slice(0, 40) || 'old';
}

/**
 * 파일 저장소 보관 — DATA_DIR 를 형제 폴더 data-<tag> 로 복사한다. 이미 있으면 -2, -3 …
 * @returns {{where:string, files:number}|null} 보관할 것이 없으면 null
 */
function archiveFiles(dataDir, tag) {
  if (!fs.existsSync(dataDir)) return null;
  const names = fs.readdirSync(dataDir);
  if (!names.length) return null;
  const parent = path.dirname(dataDir);
  let dest = path.join(parent, `data-${tag}`);
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(parent, `data-${tag}-${n}`);
  fs.cpSync(dataDir, dest, { recursive: true });
  return { where: dest, files: names.length };
}

/**
 * Upstash 보관 — poino:* 를 arch:<tag>:poino:* 로 복사한다.
 * @param {(args:string[])=>Promise<any>} cmd Redis 명령 하나
 */
async function archiveUpstash(cmd, tag) {
  const keys = [];
  let cursor = '0';
  for (let guard = 0; guard < 10000; guard++) {
    const res = await cmd(['SCAN', cursor, 'MATCH', 'poino:*', 'COUNT', '200']);
    cursor = String(res[0]);
    keys.push(...(res[1] || []));
    if (cursor === '0') break;
  }
  const prefix = `arch:${tag}:`;
  let copied = 0;
  for (const key of keys) {
    const type = await cmd(['TYPE', key]);
    if (type === 'string') {
      const v = await cmd(['GET', key]);
      if (v != null) { await cmd(['SET', prefix + key, v]); copied++; }
    } else if (type === 'set') {
      const members = await cmd(['SMEMBERS', key]);
      if (Array.isArray(members) && members.length) { await cmd(['SADD', prefix + key, ...members]); copied++; }
    }
  }
  return { where: `${prefix}*`, files: copied };
}

/**
 * 서버가 뜰 때 한 번 부른다(store.init 뒤, listen 앞).
 * @param {{store:object, world:object, oldVersion:string, rollover:()=>Promise<object>, log?:Function}} o
 * @returns {Promise<{skipped?:boolean, epoch:string, archivedAs?:string, accounts?:number}>}
 */
async function ensureSaveEpoch({ store, world, oldVersion, rollover, log = console.log }) {
  const done = await store.getDoc(EPOCH_DOC);
  if (done && done.epoch === SAVE_EPOCH) return { skipped: true, epoch: SAVE_EPOCH };

  const ids = typeof store.ids === 'function' ? await store.ids() : [];
  const tag = safeTag(oldVersion || (done && done.epoch) || 'before-' + SAVE_EPOCH);
  let archived = null;
  if (ids.length) {
    if (store.kind === 'file' && store.dataDir) archived = archiveFiles(store.dataDir, tag);
    else if (store.kind === 'upstash' && typeof store.raw === 'function') archived = await archiveUpstash(store.raw, tag);
    // 보관하지 못했으면 **비우지 않는다** — 지우지 않고 보관한다는 약속이 먼저다.
    if (!archived) {
      log(`⚠ 세이브 새로 시작(${SAVE_EPOCH})을 미뤘습니다 — 옛 세이브를 보관하지 못했습니다(저장소: ${store.kind}).`);
      return { skipped: true, epoch: SAVE_EPOCH, failed: true };
    }
  }
  const res = ids.length ? await rollover() : { accounts: 0 };
  const mark = {
    epoch: SAVE_EPOCH,
    at: new Date().toISOString(),
    from: oldVersion || null,
    archivedAs: archived ? archived.where : null,
    accounts: res.accounts || 0,
  };
  await store.setDoc(EPOCH_DOC, mark);
  log(`✓ 세이브 새로 시작(${SAVE_EPOCH}) — 계정 ${mark.accounts}개는 그대로, 캐릭터는 처음부터`
    + (archived ? ` · 옛 것 보관: ${archived.where}` : ''));
  return { epoch: SAVE_EPOCH, archivedAs: mark.archivedAs, accounts: mark.accounts };
}

/** 이 세이브가 지금 판의 것인가 — 옛 판에서 열어 둔 창이 옛 세이브를 다시 올리지 못하게. */
function isCurrentSave(save) {
  return !!(save && typeof save === 'object' && save.epoch === SAVE_EPOCH);
}

module.exports = { SAVE_EPOCH, EPOCH_DOC, ensureSaveEpoch, isCurrentSave, archiveFiles, archiveUpstash };
