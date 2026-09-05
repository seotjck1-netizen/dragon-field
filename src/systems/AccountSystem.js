// 책임: 계정 입력값 검증, 비밀번호 해시, 세이브 데이터의 직렬화/복원.
// 금지: DOM 접근, 저장소 접근(core/Storage.js 가 한다).
// 주의: 이 게임의 계정은 "세이브 슬롯 구분"용이다. 실제 서비스 수준의 인증이 아니므로
//       다른 곳에서 쓰는 비밀번호를 재사용하지 말라고 로그인 화면에서 안내한다.

import { prune as pruneTimedBoss } from './TimedBossSystem.js';
import { serializeBuffs } from './BuffSystem.js';
import { sha256Hex } from '../core/Sha256.js';
// 슬롯 목록은 EquipmentSystem 한 곳에만, 아이템 번호 규칙은 InventorySystem 한 곳에만 적혀 있다.
// 여기서는 그 순수 헬퍼만 빌려 쓴다(상태를 다루는 규칙을 여기로 옮겨 오지 말 것).
import { migrateEquipment, pruneEquipment } from './EquipmentSystem.js';
import { seedUids, repairUids } from './InventorySystem.js';
import { repairExtras } from './AffixSystem.js';

// 3: 장비 슬롯 9칸으로 확장(예전 저장은 migrateEquipment 가 옮겨 준다)
// 4: 웨이포인트 해금 목록 추가(예전 저장은 빈 목록으로 시작한다)
// 5: 특성(힘/민첩/지능)과 스킬 전면 개편 — 예전에 찍은 포인트는 전부 돌려준다
export const SAVE_VERSION = 6;

export function validateId(id) {
  if (!id || id.length < 3) return '아이디는 3자 이상이어야 합니다.';
  if (id.length > 16) return '아이디는 16자 이하여야 합니다.';
  if (!/^[A-Za-z0-9_가-힣]+$/.test(id)) return '아이디에 쓸 수 없는 문자가 있습니다.';
  return null;
}

export function validatePassword(pw) {
  if (!pw || pw.length < 4) return '비밀번호는 4자 이상이어야 합니다.';
  if (pw.length > 64) return '비밀번호가 너무 깁니다.';
  return null;
}

/**
 * 비밀번호는 브라우저에서 해시한 뒤에만 저장소로 나간다(원문은 어디에도 남지 않는다).
 * crypto.subtle 은 https/localhost 에서만 있으므로(아이폰에서 http:// 집 주소로 들어오면 없다),
 * 없을 때는 core/Sha256.js 의 순수 구현으로 같은 값을 만든다.
 */
export async function hashPassword(id, pw) {
  return sha256Hex(`poino/v1/${id.toLowerCase()}/${pw}`);
}

// ── 세이브 옮기기 ──────────────────────────────────────────
// 서버 없이 다른 컴퓨터로 캐릭터를 옮길 때 쓰는 글자 코드.
// 사람이 복사·붙여넣기 할 수 있어야 하므로 base64 로 감싼다(압축은 하지 않는다).

const CODE_PREFIX = 'POINO1:';

/** {id,name,save} → 붙여넣기용 글자. */
export function encodeSave(payload) {
  const json = JSON.stringify(payload);
  // 한글이 들어가므로 btoa 에 넣기 전에 UTF-8 → 바이트로 바꾼다.
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin);
}

/**
 * 붙여넣은 글자 → 세이브.
 * @returns {{ok:boolean, reason?:string, save?:object, id?:string, name?:string}}
 */
export function decodeSave(code) {
  const text = String(code || '').trim().replace(/\s+/g, '');
  if (!text.startsWith(CODE_PREFIX)) {
    return { ok: false, reason: '드래곤 필드 세이브 코드가 아닙니다.' };
  }
  try {
    const bin = atob(text.slice(CODE_PREFIX.length));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || !payload.save || typeof payload.save.level !== 'number') {
      return { ok: false, reason: '세이브 내용이 없습니다.' };
    }
    return { ok: true, save: payload.save, id: payload.id, name: payload.name };
  } catch (err) {
    return { ok: false, reason: '코드가 깨졌습니다. 처음부터 끝까지 전부 복사했는지 확인하세요.' };
  }
}

/** 지금 상태 → 저장할 데이터. */
export function serializeSave(state) {
  const p = state.player;
  return {
    v: SAVE_VERSION,
    name: p.name,
    classId: p.classId,
    level: p.level,
    exp: p.exp,
    gold: p.gold,
    hp: p.hp,
    mapId: state.map.id,
    tx: p.tx,
    ty: p.ty,
    dir: p.dir,
    equipment: { ...p.equipment },
    // 힘·민첩·지능(자동 성장)과, 포인트로 찍는 특성 여섯 갈래는 서로 다른 칸이다.
    stats: { ...(p.stats || {}) },
    traits: { ...(p.traits || {}) },
    skills: { ...(p.skills || {}) },
    traitPoints: p.traitPoints || 0,
    skillPoints: p.skillPoints || 0,
    quickSlots: [...(state.quickSlots || [])],
    quests: state.quests ? JSON.parse(JSON.stringify(state.quests)) : null,
    returnGate: state.returnGate ? { ...state.returnGate } : null,
    waypoints: [...(state.waypoints || [])],
    // 보스가 언제 되살아나는지. 이걸 저장하지 않으면 접속을 끊었다 켜는 것만으로
    // 보스를 다시 잡을 수 있다(맵 이동 파밍을 막아 놓은 뜻이 사라진다).
    bossRespawn: pruneRespawn(state.bossRespawn),
    // 상처가 남는 보스에게 깎아 둔 몸. 이걸 저장하지 않으면 접속을 끊는 것만으로
    // 보스가 온전해져서, 몇 번이고 물어뜯는다는 규칙이 통째로 사라진다.
    bossWounds: { ...(state.bossWounds || {}) },
    // 서쪽 절벽의 용에게 남긴 상처. 접속을 끊었다 와도 깎아 둔 만큼은 그대로다.
    timedBoss: state.timedBoss ? JSON.parse(JSON.stringify(state.timedBoss)) : null,
    // 타임어택 — 이미 기록을 올린 보스와 그때 서버가 잰 시간(화면 표시용).
    // 랭킹의 잣대는 서버가 가진 계정 생성 시각이다. 여기 값은 보여 주기만 한다.
    bornAt: state.bornAt || Date.now(),
    bossFirstKill: { ...(state.bossFirstKill || {}) },
    buffs: serializeBuffs(state),
    inventory: state.inventory.map((i) => {
      const out = { uid: i.uid, id: i.id, count: i.count, enhance: i.enhance || 0 };
      // 무작위 옵션과 박아 넣은 보석은 그 아이템만의 것이라 반드시 같이 저장한다.
      // 빠뜨리면 접속할 때마다 애써 굴린 옵션이 사라진다.
      if (i.affixes && i.affixes.length) out.affixes = i.affixes.map((a) => ({ a: a.a, v: a.v }));
      if (i.gems && i.gems.length) out.gems = [...i.gems];
      // 송곳으로 뚫어 둔 자국. 이걸 빠뜨리면 다시 접속했을 때 홈이 하나로 줄고,
      // 둘째 홈에 박아 둔 보석이 정리 과정에서 조용히 사라진다.
      if (i.drilled) out.drilled = 1;
      // 각인(주울 때 붙은 덤 한 줄)도 그 물건만의 것이다.
      // 각인. p:1 이면 초월 각인이다 — 이걸 빠뜨리면 다시 접속했을 때
      // 붉은 글씨가 사라지고, 그 뒤로 굴리는 옵션이 최대치가 아니게 된다.
      if (i.bonus && i.bonus.a) {
        out.bonus = { a: i.bonus.a, v: i.bonus.v, ...(i.bonus.p ? { p: 1 } : {}) };
      }
      return out;
    }),
    savedAt: null, // 저장 시점은 저장소 쪽에서 찍는다(스크립트에서 시각을 만들지 않는다)
  };
}

/**
 * 저장 데이터 → 상태. 맵 교체는 호출부(main.js)가 담당한다.
 * @returns {{mapId:string, tx:number, ty:number}} 이동해야 할 위치
 */
/**
 * 보스 부활 표에서 이미 지난 것을 걸러 낸다.
 * 지난 것을 그대로 두면 표가 끝없이 불어나고, 세이브에도 쓸모없는 줄이 쌓인다.
 */
function pruneRespawn(table) {
  if (!table) return {};
  const now = Date.now();
  const out = {};
  for (const [uid, at] of Object.entries(table)) {
    if (typeof at === 'number' && at > now) out[uid] = at;
  }
  return out;
}

/**
 * 직업이 정해지면 **얼굴(그림)도 함께** 정해진다.
 *
 * 세이브에는 직업만 들어 있고 그림 이름은 들어 있지 않다. 그래서 다시 접속하면
 * 상태를 만들 때 쓴 그림(기본값 = 용사)이 그대로 남아, 마법사인데 용사 얼굴이
 * 나오는 일이 있었다. 직업을 손대는 곳에서는 **반드시** 이걸 같이 불러서,
 * 직업과 얼굴이 따로 노는 상태 자체를 없앤다.
 *
 * 운영자 모습(rawSprite)만 예외다 — 직업과 상관없이 '빛의 심판관'을 쓴다.
 */
export function applyClassLook(state) {
  const p = state.player;
  if (!p || p.rawSprite) return;
  const list = (state.db && state.db.classes && state.db.classes.list) || {};
  const cls = list[p.classId] || list[state.db.classes.default];
  if (!cls) return;
  if (cls.sprite) p.sprite = cls.sprite;
  if (cls.battleSprite) p.battleSprite = cls.battleSprite;
}

export function applySave(state, save) {
  const p = state.player;
  p.name = save.name || p.name;
  if (save.classId && state.db.classes.list[save.classId]) p.classId = save.classId;
  // 직업이 정해졌으니 얼굴도 여기서 맞춘다(빠뜨리면 마법사가 용사 얼굴로 나온다).
  applyClassLook(state);
  p.level = save.level || 1;
  p.exp = save.exp || 0;
  p.gold = save.gold || 0;
  p.hp = save.hp || 1;
  p.dir = save.dir || 'down';
  p.equipment = migrateEquipment(save.equipment);

  // 성장 — 데이터에 없는 항목은 0으로 채워 둔다(표를 늘려도 깨지지 않게).
  // 표에서 사라진 항목에 찍혀 있던 포인트는 그냥 버리지 않고 돌려준다.
  //
  // v5 에서 특성(힘/민첩/지능)과 스킬을 전면 개편했다. 이름이 같아도 하는 일이 달라졌으므로,
  // 그 이전 세이브는 "같은 id 니까 그대로 두기"가 아니라 전부 돌려주고 다시 고르게 한다.
  // v6 에서 특성이 통째로 바뀌었다 — 힘·민첩·지능은 자동 성장 스탯이 되었고,
  // 특성 자리에는 여섯 갈래의 새 능력이 들어왔다. 옛 세이브의 특성 점수는
  // 가리키는 곳이 사라졌으므로 전부 돌려주고 다시 고르게 한다.
  const reborn = (save.v || 0) < 6;
  const traitMove = migrateRanks(state.db.traits.nodes, save.traits, reborn);
  const skillMove = migrateRanks(skillDefs(state), save.skills, (save.v || 0) < 5);
  p.traits = traitMove.ranks;
  p.skills = skillMove.ranks;

  // 힘·민첩·지능. 옛 세이브에는 없으므로 비워 두고, 아래 backfillStats 가 레벨에 맞게 채운다.
  p.stats = {};
  for (const id of Object.keys((state.db.stats && state.db.stats.nodes) || {})) {
    if (id.startsWith('_')) continue;
    const v = save.stats && Number(save.stats[id]);
    p.stats[id] = Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }
  p.traitPoints = (save.traitPoints || 0) + traitMove.refunded;
  p.skillPoints = (save.skillPoints || 0) + skillMove.refunded;

  // 돌려준 포인트가 있으면 알려 줄 수 있게 남긴다.
  // 표에서 어떤 스킬의 최대 단계를 낮추면(예: 5 → 3) 이미 그만큼 찍어 둔 사람은
  // 넘치는 만큼을 돌려받는데, 말이 없으면 "왜 갑자기 약해졌지"가 된다.
  state.rankRefund = {
    trait: traitMove.refunded,
    skill: skillMove.refunded,
    reborn,
  };

  state.inventory = (save.inventory || [])
    .filter((i) => state.db.items[i.id])
    .map((i) => {
      const out = { uid: i.uid, id: i.id, count: i.count || 1, enhance: i.enhance || 0 };
      if (Array.isArray(i.affixes)) {
        out.affixes = i.affixes
          .filter((a) => a && typeof a.a === 'string' && typeof a.v === 'number')
          .map((a) => ({ a: a.a, v: a.v }));
      }
      if (Array.isArray(i.gems)) out.gems = i.gems.map((g) => (typeof g === 'string' ? g : null));
      if (i.drilled) out.drilled = 1;
      if (i.bonus && typeof i.bonus.a === 'string' && typeof i.bonus.v === 'number') {
        out.bonus = { a: i.bonus.a, v: i.bonus.v, ...(i.bonus.p ? { p: 1 } : {}) };
      }
      return out;
    });

  // uid 는 이 뒤에 주울 물건과 절대 겹치면 안 된다.
  //   ① 번호 발급기를 이미 쓰인 번호 뒤로 민다.
  //   ② 예전 버전에서 이미 겹친 채로 저장된 세이브가 있으므로 그것도 여기서 고친다.
  //      (겹치면 "장착도 안 한 목걸이가 갑옷으로 보이는" 증상이 난다)
  seedUids(state.inventory);
  const repair = repairUids(state);
  if (repair.fixed) {
    console.warn(`[AccountSystem] 겹친 아이템 번호 ${repair.fixed}개를 고쳤습니다.`, repair.changes);
  }

  // 표에서 사라진 옵션·보석을 버리고 홈 개수를 지금 표에 맞춘다.
  const extrasFixed = repairExtras(state);
  if (extrasFixed) {
    console.warn(`[AccountSystem] 장비 옵션·보석 ${extrasFixed}칸을 지금 표에 맞췄습니다.`);
  }

  // 번호를 고친 뒤에는 장착 칸도 한 번 훑는다 —
  // 없는 물건이나 그 칸에 맞지 않는 물건을 가리키고 있으면 비운다.
  const pruned = pruneEquipment(state);
  if (pruned.cleared.length) {
    console.warn('[AccountSystem] 잘못 가리키던 장착 칸을 비웠습니다:', pruned.cleared);
  }
  state.uidRepair = repair.fixed + pruned.cleared.length;

  state.quickSlots = normalizeQuickSlots(state, save.quickSlots);
  state.returnGate = save.returnGate || null;
  // 예전 세이브에는 없던 항목이다. 없으면 빈 목록으로 시작한다(다시 잡으면 열린다).
  state.waypoints = normalizeWaypoints(state, save.waypoints);
  // 접속을 끊는 사이에 시간이 지났으면 그만큼 저절로 되살아나 있다.
  state.bossRespawn = pruneRespawn(save.bossRespawn);
  state.bossWounds = save.bossWounds && typeof save.bossWounds === 'object'
    ? { ...save.bossWounds } : {};
  // 지난 주기의 기록은 버린다 — 새 용은 온전한 몸으로 온다.
  state.timedBoss = pruneTimedBoss({ timedBoss: save.timedBoss }, state.db);
  // 화면에 "언제 시작했나"를 적을 때만 쓴다. 랭킹 계산에는 쓰이지 않는다.
  state.bornAt = Number(save.bornAt) || Date.now();
  state.bossFirstKill = save.bossFirstKill && typeof save.bossFirstKill === 'object'
    ? { ...save.bossFirstKill }
    : {};
  state.quests = save.quests && typeof save.quests.index === 'number'
    ? {
        index: save.quests.index,
        kills: save.quests.kills || {},
        reached: save.quests.reached || {},
        done: save.quests.done || [],
        // 0.37 — "그 상대를 만나 본 적이 있는가". 특별 의뢰가 이걸 본다.
        // 옛 세이브에는 없으므로 빈 채로 시작한다(다시 만나면 그때 열린다).
        met: save.quests.met || {},
      }
    : { index: 0, kills: {}, reached: {}, done: [], met: {} };
  state.buffs = (save.buffs || []).filter((b) => b && b.remaining > 0);

  return { mapId: save.mapId || 'poino', tx: save.tx ?? 20, ty: save.ty ?? 20 };
}

/** 스킬표에서 주석 줄("_용사" 같은 것)을 뺀 진짜 스킬만. */
function skillDefs(state) {
  const out = {};
  for (const [id, def] of Object.entries(state.db.skills.tree || {})) {
    if (id.startsWith('_') || typeof def !== 'object') continue;
    out[id] = def;
  }
  return out;
}

/**
 * 저장된 특성/스킬 등급을 지금 표에 맞춘다.
 *
 * 표가 개편되면 예전 id 는 사라진다. 그 자리에 찍혀 있던 포인트를 조용히 없애면
 * "레벨은 그대로인데 캐릭터가 약해졌다"가 되므로, 세어 두었다가 포인트로 돌려준다.
 * 최대치가 줄어든 경우에도 넘치는 만큼을 돌려준다.
 *
 * @param {boolean} [refundAll] 표의 뜻 자체가 바뀐 개편이면 true — id 가 같아도 전부 돌려준다.
 * @returns {{ranks:object, refunded:number}}
 */
function migrateRanks(defs, saved, refundAll = false) {
  const ranks = {};
  let refunded = 0;

  for (const key of Object.keys(defs)) {
    const want = (saved && saved[key]) || 0;
    const max = defs[key].max ?? Infinity;
    ranks[key] = refundAll ? 0 : Math.min(want, max);
    refunded += Math.max(0, want - ranks[key]);
  }
  // 지금 표에 없는 id 에 찍혀 있던 것 전부
  for (const [key, rank] of Object.entries(saved || {})) {
    if (!defs[key]) refunded += rank || 0;
  }
  return { ranks, refunded };
}

/** 저장된 웨이포인트 목록 → 지금 존재하는 보스 맵만 남긴 배열. */
function normalizeWaypoints(state, saved) {
  const maps = state.db.maps.maps;
  const out = [];
  for (const id of saved || []) {
    const def = maps[id];
    if (def && def.boss && def.waypoint && !out.includes(id)) out.push(id);
  }
  return out.sort((a, b) => (maps[a].stage || 0) - (maps[b].stage || 0));
}

function normalizeQuickSlots(state, saved) {
  const out = [null, null, null, null];
  for (let i = 0; i < out.length; i++) {
    const id = saved && saved[i];
    if (id && state.db.items[id]) out[i] = id;
  }
  return out;
}
