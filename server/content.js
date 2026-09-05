// 서버가 배포하는 "콘텐츠"(아이템·드랍표·퀘스트 등 데이터 표)와 그 버전을 관리한다.
// 게임 규칙은 여기 없다. 파일을 읽고, 검사하고, 버전을 매기는 일만 한다.
//
// 폴더 구조
//   server/content/            ← 지금 배포 중인 표들. 이 파일들을 고치면 곧바로 반영된다.
//   server/content/version.json ← { version, publishedAt, note }
//   server/content/history/     ← 배포할 때마다 남는 이전 판 스냅샷
//
// 흐름
//   ① server/content/items.json 을 고친다
//   ② 서버가 파일 변경을 감지 → 검사 통과하면 버전을 올리고 접속자에게 알린다
//   ③ 접속자 화면에 "새 버전" 알림 → 새로고침하면 새 표로 논다
//
// 검사에 실패하면 이전 판을 그대로 유지한다(깨진 표가 배포되지 않는다).

const fs = require('fs');
const path = require('path');
// 스킬·특성이 쓸 수 있는 효과 이름 목록. 시트 변환기와 같은 것을 봐야 한다.
const { MOD_KEYS, STAT_KEYS } = require('./sheets.js');

const SERVER_DIR = __dirname;
const CONTENT_DIR = path.join(SERVER_DIR, 'content');
const HISTORY_DIR = path.join(CONTENT_DIR, 'history');
const VERSION_FILE = path.join(CONTENT_DIR, 'version.json');
const SRC_DATA = path.resolve(SERVER_DIR, '..', 'src', 'data');

// 서버가 배포하는 표들. 여기에 없는 파일은 클라이언트가 자기 것을 쓴다.
// (manifest·maps 처럼 그림/맵과 짝이 맞아야 하는 것도 포함해 둔다)
const CONTENT_FILES = [
  'items.json',
  'monsters.json',
  'drops.json',
  'quests.json',
  'npcs.json',
  'classes.json',
  'skills.json',
  'traits.json',
  'stats.json',
  'player.json',
  'appearance.json',
  'maps.json',
  'manifest.json',
  'affixes.json',
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDirs() {
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

/** 지금 코드의 게임 판 번호. src/config.js 한 곳에서만 읽는다. */
function gameVersion() {
  try {
    const text = fs.readFileSync(path.resolve(SERVER_DIR, '..', 'src', 'config.js'), 'utf8');
    const m = /GAME_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(text);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/**
 * 콘텐츠 폴더를 src/data 로 채운다.
 *
 * 처음 한 번은 비어 있는 것을 채우고, **판이 올라가면 전부 새로 깐다.**
 *
 * 판이 올라갈 때 다시 까는 이유: 예전에는 "파일이 있으면 건너뛴다" 였다.
 * 그래서 디스크가 남아 있는 서버(렌더의 영구 디스크 같은 것)에서는 0.15 시절
 * 표가 그대로 살아남았다. 새 코드가 기대하는 키(everyLevels 같은 것)가 없으니
 * 시트를 읽어 와도 검사에서 걸려 연결 전체가 멈추고, 새로 만든 맵·아이템은
 * 아예 나타나지 않았다. 새 코드를 올렸으면 기준 표도 새 것이어야 한다.
 *
 * 시트에서 고친 값은 이때 함께 지워지지만, 시트가 곧 다시 덮어쓴다
 * (SHEET_POLL_MIN 마다 확인하고, 급하면 /api/content/pull).
 * 즉 진짜 원본은 언제나 시트 쪽이다.
 */
function initFromSource() {
  ensureDirs();
  const stampFile = path.join(CONTENT_DIR, '.build');
  const now = gameVersion();
  let was = '';
  try {
    was = fs.readFileSync(stampFile, 'utf8').trim();
  } catch {
    /* 처음이면 없다 */
  }
  // 판 번호를 못 읽으면(무슨 사고든) 다시 깔지 않는다 — 남의 표를 함부로 지우지 않는다.
  // 표식이 아예 없으면 이 장치가 생기기 전에 만들어진 폴더다. 그 안이 바로
  // 0.15 시절 표가 남아 있는 경우이므로, 그때도 한 번은 새로 깐다.
  const reseed = !!now && was !== now;

  let copied = 0;
  for (const name of CONTENT_FILES) {
    const dest = path.join(CONTENT_DIR, name);
    if (fs.existsSync(dest) && !reseed) continue;
    const src = path.join(SRC_DATA, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, dest);
    copied++;
  }
  if (now && was !== now) fs.writeFileSync(stampFile, now);

  if (!fs.existsSync(VERSION_FILE)) {
    writeVersion({ version: 1, publishedAt: new Date().toISOString(), note: '최초 배포' });
  } else if (reseed) {
    const v = readVersion();
    writeVersion({
      version: (v.version || 0) + 1,
      publishedAt: new Date().toISOString(),
      note: `${now} 배포 — 기준 표를 새로 깔았습니다`,
    });
  }
  return copied;
}

function readVersion() {
  try {
    return readJson(VERSION_FILE);
  } catch {
    return { version: 0, publishedAt: null, note: '' };
  }
}

function writeVersion(v) {
  ensureDirs();
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2));
  return v;
}

/**
 * 표들이 서로 앞뒤가 맞는지 검사한다.
 * 여기서 걸러 내면 깨진 표가 배포되지 않는다.
 * @returns {{ok:boolean, errors:string[], warnings:string[]}}
 */
function validate(files) {
  const errors = [];
  const warnings = [];
  const items = files['items.json'];
  const monsters = files['monsters.json'];
  const drops = files['drops.json'];
  const quests = files['quests.json'];
  const classes = files['classes.json'];
  const skills = files['skills.json'];
  const traits = files['traits.json'];
  const npcs = files['npcs.json'];

  if (!items || typeof items !== 'object') errors.push('items.json 을 읽을 수 없습니다.');
  if (!monsters) errors.push('monsters.json 을 읽을 수 없습니다.');
  if (errors.length) return { ok: false, errors, warnings };

  const hasItem = (id) => Object.prototype.hasOwnProperty.call(items, id);

  // 아이템 자체 검사
  for (const [id, def] of Object.entries(items)) {
    if (!def || typeof def !== 'object') {
      errors.push(`items.json: ${id} 이 객체가 아닙니다.`);
      continue;
    }
    if (!def.name) errors.push(`items.json: ${id} 에 name 이 없습니다.`);
    if (def.price != null && (typeof def.price !== 'number' || def.price < 0)) {
      errors.push(`items.json: ${id} 의 price 가 숫자가 아닙니다.`);
    }
    if (def.stats && typeof def.stats !== 'object') {
      errors.push(`items.json: ${id} 의 stats 가 객체가 아닙니다.`);
    }
  }

  // 몬스터 자체 검사
  //
  // 시트에 음수나 0 을 적는 실수는 흔하다(빼기를 하다 말거나, 칸을 하나 밀려 적거나).
  // hp 가 0 이하인 몬스터는 태어나자마자 죽어 있어서 전투가 성립하지 않고,
  // spd 가 0 이하면 차례가 영영 돌아오지 않는다. 배포되기 전에 여기서 막는다.
  {
    // [키, 최솟값, 그 값도 되는가]
    const STAT_RULES = [
      ['hp', 0, false],
      ['atk', 0, true],
      ['def', 0, true],
      ['spd', 0, false],
    ];
    for (const [id, def] of Object.entries(monsters)) {
      if (id.startsWith('_')) continue;
      if (!def || typeof def !== 'object') {
        errors.push(`monsters.json: ${id} 이 객체가 아닙니다.`);
        continue;
      }
      const at = `monsters.json: '${id}'`;
      if (!def.name) errors.push(`${at} 에 이름이 없습니다.`);
      const st = def.stats;
      if (!st || typeof st !== 'object') {
        errors.push(`${at} 에 능력치가 없습니다.`);
        continue;
      }
      for (const [key, min, allowMin] of STAT_RULES) {
        const v = st[key];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          errors.push(`${at} 의 ${key} 가 숫자가 아닙니다.`);
        } else if (allowMin ? v < min : v <= min) {
          errors.push(`${at} 의 ${key} 가 ${min}${allowMin ? ' 이상' : ' 보다 커야'} 합니다. 지금: ${v}`);
        }
      }
      if (st.crit != null && (typeof st.crit !== 'number' || st.crit < 0 || st.crit > 1)) {
        errors.push(`${at} 의 crit 이 0~1 이 아닙니다. 지금: ${st.crit} (3% 는 0.03 입니다)`);
      }
      for (const key of ['level', 'exp', 'gold']) {
        const v = def[key];
        if (v == null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          errors.push(`${at} 의 ${key} 가 0 이상의 숫자가 아닙니다. 지금: ${v}`);
        }
      }
    }
  }

  // 드랍표
  if (drops && drops['표']) {
    for (const [mid, table] of Object.entries(drops['표'])) {
      if (!monsters[mid]) warnings.push(`drops.json: '${mid}' 은 monsters.json 에 없는 몬스터입니다.`);
      if (!Array.isArray(table)) {
        errors.push(`drops.json: '${mid}' 의 표가 배열이 아닙니다.`);
        continue;
      }
      for (const row of table) {
        if (!Array.isArray(row) || row.length < 2) {
          errors.push(`drops.json: '${mid}' 에 형식이 어긋난 줄이 있습니다.`);
          continue;
        }
        const [itemId, chance] = row;
        if (!hasItem(itemId)) errors.push(`drops.json: '${mid}' 이 없는 아이템 '${itemId}' 을 떨굽니다.`);
        if (typeof chance !== 'number' || chance < 0 || chance > 1) {
          errors.push(`drops.json: '${mid}' / '${itemId}' 의 확률이 0~1 이 아닙니다.`);
        }
      }
    }
  }

  // 퀘스트표
  if (quests && Array.isArray(quests['표'])) {
    quests['표'].forEach((row, i) => {
      const [, title, type, target, , , , rewardItem, , , , choices] = row;
      const at = `quests.json #${i + 1}(${title})`;
      if (!['collect', 'hunt', 'reach'].includes(type)) errors.push(`${at}: 알 수 없는 조건 '${type}'`);
      if (type === 'collect' && !hasItem(target)) errors.push(`${at}: 없는 아이템 '${target}'`);
      if (type === 'hunt' && !monsters[target]) errors.push(`${at}: 없는 몬스터 '${target}'`);
      if (rewardItem && !hasItem(rewardItem)) errors.push(`${at}: 없는 보상 아이템 '${rewardItem}'`);
      if (Array.isArray(choices)) {
        for (const c of choices) if (!hasItem(c)) errors.push(`${at}: 없는 선택 보상 '${c}'`);
      }
    });
  }

  // 직업 · 스킬
  if (classes && classes.list && skills && skills.tree) {
    for (const [cid, def] of Object.entries(classes.list)) {
      for (const sid of def.skills || []) {
        if (!skills.tree[sid]) errors.push(`classes.json: '${cid}' 이 없는 스킬 '${sid}' 을 가리킵니다.`);
      }
      for (const it of def.startItems || []) {
        if (!hasItem(it.id)) errors.push(`classes.json: '${cid}' 의 시작 아이템 '${it.id}' 이 없습니다.`);
      }
      if (!(def.skills || []).length) warnings.push(`classes.json: '${cid}' 이 배울 수 있는 스킬이 하나도 없습니다.`);
    }
  }

  // 직업 능력치와 전투 방식(= 패시브의 알맹이)
  if (classes && classes.list) {
    // 0~1 이어야 말이 되는 값들. 0.35 를 35 로 적는 실수가 가장 흔하다.
    const RATE = ['counter', 'lastStand', 'evade', 'cleave', 'crit'];
    for (const [cid, def] of Object.entries(classes.list)) {
      const at = `classes.json: '${cid}'`;
      for (const group of ['baseStats', 'growth']) {
        const g = def[group];
        if (!g || typeof g !== 'object') {
          errors.push(`${at} 에 ${group} 이 없습니다.`);
          continue;
        }
        for (const k of ['hp', 'atk', 'def', 'spd']) {
          if (typeof g[k] !== 'number') errors.push(`${at} 의 ${group}.${k} 가 숫자가 아닙니다.`);
        }
        if (g.crit != null && (g.crit < 0 || g.crit > 1)) {
          errors.push(`${at} 의 ${group}.crit 은 0~1 이어야 합니다(0.06 = 6%). 지금: ${g.crit}`);
        }
      }
      if (!(Number(def.baseStats && def.baseStats.hp) > 0)) errors.push(`${at} 의 기본 HP 가 0 이하입니다.`);

      for (const [k, v] of Object.entries(def.combat || {})) {
        if (k === 'school') continue;
        if (typeof v !== 'number') {
          errors.push(`${at} 의 combat.${k} 가 숫자가 아닙니다.`);
          continue;
        }
        if (RATE.includes(k) && (v < 0 || v > 1)) {
          errors.push(`${at} 의 combat.${k} 는 0~1 이어야 합니다(0.35 = 35%). 지금: ${v}`);
        }
        if (v < 0) errors.push(`${at} 의 combat.${k} 가 음수입니다.`);
      }
      if (def.combat && def.combat.maxPull != null && def.combat.maxPull < 1) {
        errors.push(`${at} 의 combat.maxPull 은 1 이상이어야 합니다.`);
      }
      if (!def.passive || !def.passive.name || !def.passive.desc) {
        warnings.push(`${at} 에 패시브 설명이 비어 있습니다(화면에 아무것도 안 나옵니다).`);
      }
    }
  }

  // 스킬 자체 — 효과 이름이 게임이 아는 것인지 본다.
  // 모르는 이름은 조용히 무시되므로, 아무 일도 안 하는 스킬이 배포되는 걸 막는다.
  if (skills && skills.tree) {
    const learnable = new Set();
    for (const def of Object.values((classes && classes.list) || {})) {
      for (const sid of def.skills || []) learnable.add(sid);
    }
    for (const [sid, def] of Object.entries(skills.tree)) {
      if (sid.startsWith('_')) continue; // 구분선
      const at = `skills.json: '${sid}'`;
      if (!def || typeof def !== 'object') {
        errors.push(`${at} 이 객체가 아닙니다.`);
        continue;
      }
      if (!def.name) errors.push(`${at} 에 name 이 없습니다.`);
      if (!(Number(def.max) >= 1)) errors.push(`${at} 의 max 가 1 이상이 아닙니다.`);
      const keys = Object.keys(def.effect || {});
      if (!keys.length) errors.push(`${at} 에 효과가 없습니다(찍어도 아무 일이 없습니다).`);
      for (const k of keys) {
        if (!MOD_KEYS.includes(k)) errors.push(`${at} 의 효과 '${k}' 을 게임이 모릅니다.`);
        else if (typeof def.effect[k] !== 'number') errors.push(`${at} 의 효과 '${k}' 값이 숫자가 아닙니다.`);
      }
      if (learnable.size && !learnable.has(sid)) {
        warnings.push(`skills.json: '${sid}' 을 배울 수 있는 직업이 없습니다.`);
      }
    }
  }

  // 특성
  if (traits && traits.nodes) {
    for (const [tid, def] of Object.entries(traits.nodes)) {
      if (tid.startsWith('_')) continue;
      const at = `traits.json: '${tid}'`;
      if (!def || typeof def !== 'object') {
        errors.push(`${at} 이 객체가 아닙니다.`);
        continue;
      }
      if (!def.name) errors.push(`${at} 에 name 이 없습니다.`);
      if (!(Number(def.max) >= 1)) errors.push(`${at} 의 max 가 1 이상이 아닙니다.`);
      for (const k of Object.keys(def.per || {})) {
        if (!STAT_KEYS.includes(k)) errors.push(`${at} 의 per '${k}' 은 hp/atk/def/spd/crit 중 하나여야 합니다.`);
      }
      for (const k of Object.keys(def.mods || {})) {
        if (!MOD_KEYS.includes(k)) errors.push(`${at} 의 mods '${k}' 을 게임이 모릅니다.`);
      }
      if (!Object.keys(def.per || {}).length && !Object.keys(def.mods || {}).length) {
        errors.push(`${at} 이 아무것도 올려 주지 않습니다.`);
      }
    }
    if (!(Number(traits.everyLevels) >= 1)) errors.push('traits.json: everyLevels 가 1 이상이 아닙니다.');
    if (!(Number(traits.pointsPerGrant) >= 1)) errors.push('traits.json: pointsPerGrant 가 1 이상이 아닙니다.');
    if (traits.questPoints && !Array.isArray(traits.questPoints)) {
      errors.push('traits.json: questPoints 는 퀘스트 id 배열이어야 합니다.');
    }
  }
  // 스탯(힘·민첩·지능) — 포인트가 없으므로 max 는 없다.
  {
    const st = files['stats.json'];
    if (st && st.nodes) {
      for (const [sid, def] of Object.entries(st.nodes)) {
        if (sid.startsWith('_')) continue;
        const at = `stats.json: '${sid}'`;
        if (!def || typeof def !== 'object') { errors.push(`${at} 이 객체가 아닙니다.`); continue; }
        if (!def.name) errors.push(`${at} 에 name 이 없습니다.`);
        for (const k of Object.keys(def.per || {})) {
          if (!STAT_KEYS.includes(k)) errors.push(`${at} 의 per '${k}' 은 hp/atk/def/spd/crit 중 하나여야 합니다.`);
        }
        for (const k of Object.keys(def.mods || {})) {
          if (!MOD_KEYS.includes(k)) errors.push(`${at} 의 mods '${k}' 을 게임이 모릅니다.`);
        }
      }
      // 직업마다 세 스탯이 몇 레벨에 하나씩 오르는지 적혀 있어야 한다
      const cls = files['classes.json'];
      for (const [cid, c] of Object.entries((cls && cls.list) || {})) {
        const g = c.statGrowth;
        if (!g) { errors.push(`classes.json: '${cid}' 에 statGrowth 가 없습니다.`); continue; }
        for (const sid of Object.keys(st.nodes)) {
          if (sid.startsWith('_')) continue;
          if (!(Number(g[sid]) >= 1)) {
            errors.push(`classes.json: '${cid}' 의 statGrowth.${sid} 가 1 이상이 아닙니다.`);
          }
        }
      }
    }
  }

  if (skills) {
    if (!(Number(skills.everyLevels) >= 1)) errors.push('skills.json: everyLevels 가 1 이상이 아닙니다.');
    if (!(Number(skills.pointsPerGrant) >= 1)) errors.push('skills.json: pointsPerGrant 가 1 이상이 아닙니다.');
  }

  // 상점 재고
  if (npcs) {
    for (const [nid, def] of Object.entries(npcs)) {
      for (const sid of def.stock || []) {
        if (!hasItem(sid)) errors.push(`npcs.json: '${nid}' 의 판매 목록에 없는 아이템 '${sid}'`);
      }
      for (const r of def.recipes || []) {
        for (const g of r.give || []) {
          if (!hasItem(g.id)) errors.push(`npcs.json: '${nid}' 교환 재료 '${g.id}' 이 없습니다.`);
        }
        if (r.get && !hasItem(r.get.id)) {
          errors.push(`npcs.json: '${nid}' 교환 결과 '${r.get.id}' 이 없습니다.`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** 콘텐츠 폴더의 표를 전부 읽는다. 읽기 실패는 errors 로 돌려준다. */
function readAll() {
  ensureDirs();
  const files = {};
  const errors = [];
  for (const name of CONTENT_FILES) {
    const file = path.join(CONTENT_DIR, name);
    if (!fs.existsSync(file)) continue;
    try {
      files[name] = readJson(file);
    } catch (err) {
      errors.push(`${name}: JSON 문법 오류 — ${err.message}`);
    }
  }
  return { files, errors };
}

/** 지금 폴더에 있는 표를 읽어 검사까지 한 결과. */
function inspect() {
  const { files, errors } = readAll();
  if (errors.length) return { ok: false, files, errors, warnings: [] };
  const v = validate(files);
  return { ok: v.ok, files, errors: v.errors, warnings: v.warnings };
}

/** 지금 판을 history 에 스냅샷으로 남긴다. */
function snapshot(version) {
  ensureDirs();
  const dir = path.join(HISTORY_DIR, `v${version}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of CONTENT_FILES) {
    const src = path.join(CONTENT_DIR, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, name));
  }
  return dir;
}

/**
 * 지금 폴더 내용을 새 버전으로 배포한다.
 * 검사에 실패하면 버전을 올리지 않는다.
 */
function publish(note = '') {
  const result = inspect();
  if (!result.ok) return { ok: false, errors: result.errors, warnings: result.warnings };

  const prev = readVersion();
  if (prev.version > 0) snapshot(prev.version);

  const next = writeVersion({
    version: prev.version + 1,
    publishedAt: new Date().toISOString(),
    note: note || '',
  });
  return { ok: true, version: next.version, warnings: result.warnings, note: next.note };
}

/** src/data 의 표를 콘텐츠 폴더로 밀어 넣는다(개발본 → 서버). */
function pushFromSource() {
  ensureDirs();
  const changed = [];
  for (const name of CONTENT_FILES) {
    const src = path.join(SRC_DATA, name);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(CONTENT_DIR, name);
    const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
    const after = fs.readFileSync(src, 'utf8');
    if (before !== after) {
      fs.writeFileSync(dest, after);
      changed.push(name);
    }
  }
  return changed;
}

/** 특정 버전으로 되돌린다(history 스냅샷에서 복사). */
function rollback(version) {
  const dir = path.join(HISTORY_DIR, `v${version}`);
  if (!fs.existsSync(dir)) return { ok: false, error: `v${version} 스냅샷이 없습니다.` };

  const prev = readVersion();
  if (prev.version > 0) snapshot(prev.version);

  for (const name of CONTENT_FILES) {
    const src = path.join(dir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(CONTENT_DIR, name));
  }
  const next = writeVersion({
    version: prev.version + 1,
    publishedAt: new Date().toISOString(),
    note: `v${version} 로 되돌림`,
  });
  return { ok: true, version: next.version };
}

/** 남아 있는 스냅샷 버전 목록. */
function history() {
  ensureDirs();
  return fs
    .readdirSync(HISTORY_DIR)
    .filter((n) => /^v\d+$/.test(n))
    .map((n) => Number(n.slice(1)))
    .sort((a, b) => b - a);
}

module.exports = {
  CONTENT_DIR,
  CONTENT_FILES,
  initFromSource,
  readVersion,
  readAll,
  inspect,
  validate,
  publish,
  pushFromSource,
  rollback,
  history,
};
