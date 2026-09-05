// 책임: 조립(부트스트랩)과 오케스트레이션. 모듈들을 연결하고 이벤트를 중계한다.
//        시스템끼리 직접 import 하지 않으므로, "누가 무엇을 먼저 하는지"는 여기서만 정해진다.
// 금지: 게임 규칙 계산. 전부 systems/ 에 위임한다.
//
// 흐름:  에셋 로드 → 로그인 화면 → (계정 확인/세이브 불러오기) → runGame()

import { CONFIG, GAME_VERSION, DATA_STAMP } from './config.js';
import { EventBus } from './core/EventBus.js';
import { StateStore } from './core/StateStore.js';
import { SceneManager } from './core/SceneManager.js';
import { AssetLoader } from './core/AssetLoader.js';
import { Appearance } from './core/Appearance.js';
import { Renderer } from './core/Renderer.js';
import { Input } from './core/Input.js';
import { Pointer } from './core/Pointer.js';
import { GameLoop } from './core/GameLoop.js';
import { Storage } from './core/Storage.js';
import { Viewport } from './core/Viewport.js';
import { createRng, makeSeed } from './core/Rng.js';

import { createActor, syncPixel } from './entities/Actor.js';
import {
  computePlayerStats,
  computeMonsterStats,
  computeLook,
  toCombatant,
} from './entities/StatBlock.js';

import { FieldScene } from './scenes/FieldScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { hitKindOf, KIND_SFX, KIND_CAST } from './core/hitLook.js';

import { buildMap, spawnMonsters, spawnNpcs, nearestWalkable } from './systems/MapSystem.js';
import { EncounterSystem } from './systems/EncounterSystem.js';
import { PortalSystem } from './systems/PortalSystem.js';
import { DialogueSystem } from './systems/DialogueSystem.js';
import { NetSystem } from './systems/NetSystem.js';
import { simulateBattle } from './systems/CombatSystem.js';
import { rollRewards } from './systems/LootSystem.js';
import * as Quests from './systems/QuestSystem.js';
import * as Inventory from './systems/InventorySystem.js';
import * as Equipment from './systems/EquipmentSystem.js';
import * as Affix from './systems/AffixSystem.js';
import * as TimedBoss from './systems/TimedBossSystem.js';
import * as Progression from './systems/ProgressionSystem.js';
import * as Shop from './systems/ShopSystem.js';
import * as Account from './systems/AccountSystem.js';
import * as Buffs from './systems/BuffSystem.js';
import * as Skills from './systems/SkillSystem.js';
import * as Exchange from './systems/ExchangeSystem.js';
import * as Settings from './systems/SettingsSystem.js';
import * as Waypoints from './systems/WaypointSystem.js';
import {
  scaleMonsterStats, combatPower, powerTier, rerollCost, enhanceMaterial, BALANCE,
} from './data/formulas.js';

import { HUD } from './ui/HUD.js';
import { BattleView } from './ui/BattleView.js';
import { InventoryPanel } from './ui/InventoryPanel.js';
import { DialogueBox } from './ui/DialogueBox.js';
import { ShopPanel } from './ui/ShopPanel.js';
import { ExchangePanel } from './ui/ExchangePanel.js';
import { CharacterPanel } from './ui/CharacterPanel.js';
import { QuickSlots } from './ui/QuickSlots.js';
import { QuestPanel } from './ui/QuestPanel.js';
import { LoginScreen } from './ui/LoginScreen.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { WaypointPanel } from './ui/WaypointPanel.js';
import { MailPanel } from './ui/MailPanel.js';
import { RankPanel, timeText } from './ui/RankPanel.js';
import { AdminPanel, SEASON_GIFT } from './ui/AdminPanel.js';
import { CastBar } from './ui/CastBar.js';
import { UpdateBanner } from './ui/UpdateBanner.js';
import { TouchControls, isTouchDevice } from './ui/TouchControls.js';
import { Toast } from './ui/Toast.js';
import { Sound } from './core/Sound.js';

const DATA_FILES = {
  manifest: 'src/data/manifest.json',
  items: 'src/data/items.json',
  monsters: 'src/data/monsters.json',
  maps: 'src/data/maps.json',
  npcs: 'src/data/npcs.json',
  player: 'src/data/player.json',
  appearance: 'src/data/appearance.json',
  classes: 'src/data/classes.json',
  traits: 'src/data/traits.json',
  stats: 'src/data/stats.json',
  skills: 'src/data/skills.json',
  drops: 'src/data/drops.json',
  quests: 'src/data/quests.json',
  affixes: 'src/data/affixes.json',
};

const AUTOSAVE_MS = 20000;
// 마을 광장 안쪽. 귀환 포탈의 마을 쪽 입구가 여기에 생긴다.
const TOWN_GATE = { mapId: 'poino', x: 22, y: 17 };

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} 로드 실패 (${res.status})`);
  return res.json();
}

async function loadDatabase() {
  const keys = Object.keys(DATA_FILES);
  const values = await Promise.all(keys.map((k) => loadJson(DATA_FILES[k])));
  return prepareDatabase(Object.fromEntries(keys.map((k, i) => [k, values[i]])));
}

/**
 * 서버가 배포 중인 표를 기본 db 위에 덮어쓴다.
 * 서버에 없는 파일은 게임에 들어 있는 것을 그대로 쓰므로, 표 하나만 배포해도 된다.
 * @param {object} db
 * @param {{version:number, files:object}} content  /api/content 응답
 */
export function applyServerContent(db, content) {
  if (!content || !content.files) return db;
  const map = {
    'items.json': 'items',
    'monsters.json': 'monsters',
    'drops.json': 'drops',
    'quests.json': 'quests',
    'npcs.json': 'npcs',
    'classes.json': 'classes',
    'skills.json': 'skills',
    'traits.json': 'traits',
    'stats.json': 'stats',
    'player.json': 'player',
    'appearance.json': 'appearance',
    'maps.json': 'maps',
    'manifest.json': 'manifest',
    'affixes.json': 'affixes',
  };
  const merged = { ...db };
  for (const [file, key] of Object.entries(map)) {
    if (content.files[file]) merged[key] = content.files[file];
  }
  merged.contentVersion = content.version;
  return prepareDatabase(merged);
}

/**
 * 퀘스트 게시판은 quests.json 안에 정의돼 있다. NPC 목록에 합쳐 두면
 * 맵 배치·대화·클릭이 다른 NPC와 똑같이 동작한다.
 */
export function prepareDatabase(db) {
  const board = db.quests && db.quests['게시판'];
  if (board && !db.npcs.quest_board) {
    db.npcs.quest_board = {
      name: board.name,
      sprite: board.sprite,
      quick: true,
      lines: board.lines,
      action: { type: 'quest', label: '의뢰 확인' },
    };
  }
  return db;
}

/**
 * 표의 모든 항목을 0 으로 채운 등급 묶음.
 * "_용사" 같은 주석 줄은 표를 읽기 좋게 하려고 끼워 둔 것이므로 걸러 낸다.
 */
function emptyRanks(defs) {
  const out = {};
  for (const [key, def] of Object.entries(defs)) {
    if (key.startsWith('_') || typeof def !== 'object') continue;
    out[key] = 0;
  }
  return out;
}

/** 세이브가 없을 때의 초기 상태. */
function createInitialState(db, playerName, classId) {
  const pdef = db.player;
  const chosen = db.classes.list[classId] ? classId : db.classes.default;
  const cls = db.classes.list[chosen];
  const map = buildMap(db, pdef.startMap);

  const player = createActor({
    uid: 'player',
    kind: 'player',
    defId: pdef.id,
    name: playerName || pdef.name,
    tx: pdef.startTile.x,
    ty: pdef.startTile.y,
    sprite: cls.sprite,
    battleSprite: cls.battleSprite,
    stepMs: CONFIG.PLAYER_STEP_MS,
    extra: {
      classId: chosen,
      level: pdef.startLevel,
      exp: 0,
      gold: pdef.startGold,
      hp: 0,
      equipment: Equipment.emptyEquipment(),
      // 힘·민첩·지능 — 포인트가 아니라 레벨이 올려 준다(ProgressionSystem.growStats).
      stats: emptyRanks(db.stats.nodes),
      traits: emptyRanks(db.traits.nodes),
      skills: emptyRanks(db.skills.tree),
      traitPoints: 0,
      skillPoints: 0,
    },
  });

  const state = {
    db,
    player,
    inventory: [],
    map,
    monsters: spawnMonsters(db, map),
    npcs: spawnNpcs(db, map),
    buffs: [],
    quests: Quests.emptyQuestState(),
    quickSlots: [null, null, null, null],
    returnGate: null,
    waypoints: [], // 보스를 잡을 때마다 하나씩 열린다
    settings: Settings.defaultSettings(),
    // 우편함·랭킹은 서버가 준 것을 담아 두는 자리다(세이브에는 넣지 않는다).
    mail: { list: [], loading: false, offline: true },
    ranks: { table: {}, mine: {}, total: {}, loading: false, offline: true },
    // 캐릭터를 만든 시각. 타임어택은 여기부터 보스를 눕힌 순간까지를 잰다.
    bornAt: Date.now(),
    // 이미 기록을 올린 보스(같은 보스로 두 번 올리지 않게)
    bossFirstKill: {},
    version: 5,
  };

  for (const entry of cls.startItems || []) {
    const added = Inventory.addItem(state, entry.id, entry.count);
    const def = db.items[entry.id];
    const slots = Equipment.slotsForItem(def);
    if (slots.length && slots.some((s) => !state.player.equipment[s]) && added.length) {
      Equipment.equip(state, added[0].uid);
    }
  }

  // 소모품은 앞 칸부터 자동으로 단축키에 올려 둔다.
  let slot = 0;
  for (const entry of cls.startItems || []) {
    const def = db.items[entry.id];
    if (def && def.use && slot < state.quickSlots.length) state.quickSlots[slot++] = entry.id;
  }

  state.player.hp = computePlayerStats(state).hp;
  return state;
}

// ============================================================================
//  부트 — 로그인까지
// ============================================================================

export async function startGame(providedDb = null) {
  const bootEl = document.getElementById('boot');

  // 화면 맞추기는 데이터를 받기 전에 켠다 — 로그인 화면부터 잘리지 않게.
  if (isTouchDevice()) document.body.classList.add('is-touch');
  // 화면 방향은 설정에서 고른다(자동 / 가로 고정 / 세로 고정).
  // 설정이 아직 없을 때(접속 화면)는 'auto' 로 본다.
  // 방향과 캔버스 연결은 store · renderer 가 생긴 뒤에 붙인다(아래 참조).
  // 여기서는 접속 화면이 잘리지 않게 크기만 맞춰 둔다.
  let orientationMode = 'auto';
  const viewport = new Viewport(
    document.getElementById('stage'),
    document.getElementById('stage-frame'),
    { getMode: () => orientationMode }
  );
  viewport.attach();

  let db = providedDb || (await loadDatabase());

  const bus = new EventBus();
  const storage = new Storage('');

  // 서버가 살아 있으면 서버가 배포 중인 표를 먼저 받아 덮어쓴다.
  // (아이템·드랍표를 서버에서 고치면 새로고침만으로 반영된다)
  const mode = await storage.detect();
  if (mode === 'server') {
    const content = await storage.fetchContent();
    if (content) {
      db = applyServerContent(db, content);
      console.log(`[콘텐츠] 서버 v${content.version} 적용`);
    }
  }

  const assets = new AssetLoader();
  await assets.loadManifest(db.manifest);

  const loginScreen = new LoginScreen({ bus, assets, root: document.getElementById('login') });

  // 소리 — 접속 화면부터 산다. 설정은 계정이 아니라 이 기기에 남으므로
  // 게임이 뜨기 전에도 읽을 수 있다(음악을 끈 사람에게는 켜지지 않는다).
  const loginSettings = Settings.normalize(storage.loadSettings());
  const sound = new Sound(() => loginSettings);
  // ⚠ 브라우저는 **사람이 한 번 누르기 전에는** 소리를 못 내게 막는다.
  //   그래서 여기서 바로 켜지 않고, 접속 화면의 아무 조작에서나 열어 준다.
  const wake = () => {
    if (loginSettings.music === false) return; // 꺼 둔 사람에게는 켜지 않는다
    sound.unlock();
    sound.playBgm('login');
  };
  document.getElementById('login').addEventListener('pointerdown', wake);
  window.addEventListener('keydown', wake);

  // 접속 화면 오른쪽 위 스피커 단추 (0.57).
  //
  // 브라우저가 "사람이 한 번 누르기 전에는 소리 금지" 라서, 이 단추를 누르는 것이
  // 곧 그 '한 번'이 된다 — 눌러서 켜고, 다시 눌러서 끈다. 고른 값은 이 기기에 남으므로
  // 게임에 들어간 뒤에도(설정 창의 '배경 음악') 같은 값이다.
  bus.on('login:bgm-toggle', () => {
    const on = loginSettings.music === false;
    loginSettings.music = on;
    storage.saveSettings(loginSettings);
    sound.refresh();
    if (on) { sound.unlock(); sound.playBgm('login'); } else { sound.stopBgm(); }
    loginScreen.setBgm(on);
  });

  // 부팅 감시 타이머를 끈다(index.html 의 인라인 스크립트).
  if (window.__bootWatch) window.__bootWatch.clear();
  if (bootEl) bootEl.remove();
  loginScreen.show({
    storageLabel:
      mode === 'server'
        ? `서버${db.contentVersion ? ` · 콘텐츠 v${db.contentVersion}` : ''}`
        : '이 브라우저 안에만',
    lastId: storage.lastId(),
    classes: db.classes,
    isServer: mode === 'server',
    localAccounts: storage.localAccounts(),
    version: GAME_VERSION,
    dataStamp: DATA_STAMP,
    contentVersion: db.contentVersion || null,
    // 서버가 말하는 판. 내 파일과 다르면 접속 화면이 막고 알린다.
    serverVersion: (storage.serverInfo && storage.serverInfo.gameVersion) || null,
  });
  loginScreen.setBgm(loginSettings.music !== false);

  // 서버가 아직 깨어나는 중일 수도 있다. 접속 화면에 있는 동안 계속 두드려 본다.
  // 여기서 포기하고 로컬 계정을 만들어 버리면 그 계정은 이 기기 밖으로 못 나간다 —
  // PC 와 폰이 각자 다른 세계에서 놀게 되는 가장 흔한 원인이다.
  let stopWatching = () => {};
  if (mode !== 'server') {
    loginScreen.setStorageLabel('이 브라우저 안에만 (서버 찾는 중…)');
    stopWatching = storage.watchForServer(async () => {
      const content = await storage.fetchContent();
      if (content) {
        db = applyServerContent(db, content);
        console.log(`[콘텐츠] 서버 v${content.version} 적용 (뒤늦게 연결)`);
      }
      loginScreen.setStorageInfo({
        isServer: true,
        localAccounts: storage.localAccounts(),
        serverVersion: (storage.serverInfo && storage.serverInfo.gameVersion) || null,
      });
      loginScreen.setStorageLabel(
        `서버${db.contentVersion ? ` · 콘텐츠 v${db.contentVersion}` : ''}`
      );
    });
  }

  let started = false;

  bus.on('login:submit', async ({ mode, id, pw, nick, classId }) => {
    if (started) return;
    stopWatching();

    const idError = Account.validateId(id);
    if (idError) return loginScreen.error(idError);
    const pwError = Account.validatePassword(pw);
    if (pwError) return loginScreen.error(pwError);

    loginScreen.error('');
    loginScreen.setBusy(true);
    try {
      const hash = await Account.hashPassword(id, pw);
      const result =
        mode === 'register'
          ? await storage.register(id, hash, nick || id)
          : await storage.login(id, hash);

      storage.rememberId(id);
      loginScreen.hide();
      sound.stopBgm();
      await runGame({
        db,
        assets,
        bus,
        storage,
        account: { id, token: result.token, name: nick || result.name || id, classId },
        save: result.save || null,
        // 시즌이 넘어간 사이에 자고 있었다면, 들어오자마자 그 사실을 알려 준다.
        seasonNotice: result.seasonNotice || null,
        // 화면 맞추기는 접속 화면 때부터 돌고 있다. 그대로 넘겨서
        // 게임이 뜬 뒤 방향 설정과 캔버스를 이어 붙인다.
        viewport,
        sound,
      });
      // 게임이 실제로 뜬 뒤에야 잠근다.
      // 여기서 미리 잠그면, runGame 이 실패했을 때 접속 버튼이 영영 먹통이 된다.
      started = true;
    } catch (err) {
      // 게임을 띄우다 실패했다면 접속 화면을 다시 보여 준다(검은 화면으로 남지 않게).
      loginScreen.showAgain();
      loginScreen.setBusy(false);
      let msg = err.message || '접속에 실패했습니다.';
      // 가장 흔한 오해: 다른 컴퓨터·다른 브라우저에서 만든 계정으로 접속을 시도한 경우.
      if (!storage.isServer && mode === 'login' && /없는 아이디/.test(msg)) {
        const known = storage.localAccounts();
        msg =
          '이 기기에는 그 아이디가 없습니다.\n' +
          (known.length
            ? `이 기기에 저장된 계정: ${known.slice(0, 5).join(', ')}`
            : '이 기기에는 아직 계정이 하나도 없습니다. "새 계정"으로 시작하세요.') +
          '\n다른 컴퓨터에서 만든 계정을 쓰려면 그 컴퓨터에서 서버를 켜고 그 주소로 접속해야 합니다.';
      }
      loginScreen.error(msg);
    }
  });
}

// ============================================================================
//  실제 게임
// ============================================================================

async function runGame({ db, assets, bus, storage, account, save, viewport, sound = null, seasonNotice = null }) {
  // 직업은 **세이브가 가진 것이 먼저**다. 접속 화면에서 넘어온 classId 는
  // '새 계정' 탭에서 고른 값이라, 기존 계정으로 다시 접속할 때는 기본값(용사)이다.
  // 그걸 그대로 쓰면 마법사가 용사 얼굴로 한 번 나타났다가 바뀐다.
  const startClass = (save && save.classId) || account.classId;
  const store = new StateStore(createInitialState(db, account.name, startClass));
  // 접속 화면에서는 기기에 저장된 설정을 스냅숏으로 보고 있었다.
  // 게임이 떴으니 이제부터는 **살아 있는 설정**을 보게 갈아 끼운다.
  if (sound) sound.getSettings = () => store.state.settings || {};
  const scenes = new SceneManager();
  const canvas = document.getElementById('game-canvas');
  const renderer = new Renderer(canvas, assets);

  // 이제 판 크기가 바뀌면 캔버스도 함께 바꾼다.
  // (Viewport 는 store 나 renderer 를 모른다 — 두 함수만 건네받는다)
  // 화면 맞추기가 없을 수도 있다(시험에서 직접 부를 때). 그때는 그냥 넘어간다.
  if (viewport) {
    viewport.getMode = () => (store.state.settings && store.state.settings.orientation) || 'auto';
    viewport.onViewSize = (w, h) => {
      if (renderer.setViewSize(w, h)) bus.emit('view:resized', { w, h });
    };
    viewport.fit();
  }
  const appearance = new Appearance(assets, db.appearance);
  const input = new Input(bus);
  const pointer = new Pointer(bus, canvas, renderer);
  const rng = createRng(makeSeed());

  const encounter = new EncounterSystem(bus);

  /**
   * 포탈 통행 판정 — "이 문을 지나갈 자격이 있는가".
   *
   * 보스가 있는 단계의 동쪽 문에는 두 자물쇠가 걸려 있다.
   *   ① 그 땅의 보스를 잡았는가   — 보스를 잡으면 웨이포인트가 열리므로 그것으로 안다
   *   ② 그 보스의 퀘스트를 마쳤는가 — 잡기만 하고 보고하지 않으면 아직이다
   * 둘 다 채운 사람만 다음 구간으로 간다. 그래야 단계마다 세지는 몬스터가 의미를 갖는다.
   *
   * system 끼리 서로 import 하지 않기로 했으므로, 두 시스템을 다 아는 이곳에서 만든다.
   */
  function portalGate(state, p) {
    if (p.requireBossOf && !Waypoints.has(state, p.requireBossOf)) {
      const bossId = state.db.maps.maps[p.requireBossOf]?.boss;
      const bossName = state.db.monsters[bossId]?.name || '이 땅의 주인';
      return { ok: false, reason: `${bossName}을(를) 쓰러뜨리기 전에는\n이 길을 지날 수 없다.` };
    }
    // 열쇠로 잠긴 문 — 마녀에게서 받은 용의 열쇠가 있어야 지나간다.
    //
    // 열쇠는 **쓰지 않는다.** 한 번 열면 계속 열려 있어야, 한 시간 리젠을
    // 기다렸다 다시 오는 것이 성립한다. 매번 징표 열 개를 다시 모으게 하면
    // 그 상대는 사실상 한 번만 만날 수 있는 상대가 된다.
    if (p.requireItem) {
      const have = Inventory.countOf(state, p.requireItem);
      if (!have) {
        const name = (state.db.items[p.requireItem] || {}).name || p.requireItem;
        return { ok: false, reason: `굳게 잠겨 있다.\n${name}가 있어야 열린다.` };
      }
    }
    if (p.requireQuestOf) {
      const quest = Quests.allQuests(state).find(
        (q) => q.type === 'hunt' && q.target === p.requireQuestOf
      );
      if (quest && !(state.quests?.done || []).includes(quest.id)) {
        return { ok: false, reason: `'${quest.title}' 퀘스트를 마치고 오게.\n보고까지 끝나야 문이 열린다.` };
      }
    }
    return { ok: true };
  }

  const portal = new PortalSystem(bus, { gate: portalGate });
  const dialogue = new DialogueSystem(bus);
  const net = new NetSystem(bus);

  // --- UI 레이어 ---
  const hud = new HUD({ bus, store, root: document.getElementById('hud') });
  const battleView = new BattleView({
    bus,
    assets, // 보스 등장 연출에 그 몬스터 그림을 쓴다 (0.47)
    root: document.getElementById('battle-view'),
    getSettings: () => store.state.settings || {},
  });
  const dialogueBox = new DialogueBox({ bus, assets, root: document.getElementById('dialogue') });
  const inventoryPanel = new InventoryPanel({
    bus, store, assets, root: document.getElementById('inventory-panel'),
  });
  const shopPanel = new ShopPanel({
    bus, store, assets, root: document.getElementById('shop-panel'),
  });
  const exchangePanel = new ExchangePanel({
    bus, store, assets, root: document.getElementById('exchange-panel'),
  });
  const characterPanel = new CharacterPanel({
    bus, store, root: document.getElementById('character-panel'),
  });
  const quickSlots = new QuickSlots({
    bus, store, assets, root: document.getElementById('quickslots'),
  });
  const questPanel = new QuestPanel({
    bus, store, assets, root: document.getElementById('quest-panel'),
  });
  const settingsPanel = new SettingsPanel({
    bus, store, root: document.getElementById('settings-panel'),
  });
  const waypointPanel = new WaypointPanel({
    bus, store, root: document.getElementById('waypoint-panel'),
  });
  const mailPanel = new MailPanel({
    bus, store, root: document.getElementById('mail-panel'),
  });
  const rankPanel = new RankPanel({
    bus, store, root: document.getElementById('rank-panel'),
  });
  const adminPanel = new AdminPanel({
    bus, store, assets, root: document.getElementById('admin-panel'),
  });
  const castBar = new CastBar({ bus, root: document.getElementById('cast-bar') });
  const touchControls = new TouchControls({
    bus,
    input,
    root: document.getElementById('touch-controls'),
  });
  if (isTouchDevice()) {
    touchControls.enable();
    if (viewport) viewport.fit(); // 조작 버튼 자리를 뺀 크기로 다시 맞춘다
    // 세로로 들면 세로 판(480×640)으로 알아서 바뀐다.
    // 예전에는 "가로로 돌리라"고 했는데, 이제는 세로가 오히려 더 크게 보인다 —
    // 같은 폭에서 0.61 배 대신 0.81 배로 그려지기 때문이다.
    // 그래서 안내는 "고를 수 있다"로 바꿨다.
    if (window.innerHeight > window.innerWidth) {
      setTimeout(
        () => bus.emit('toast', {
          text: '세로 화면에 맞췄습니다. 설정 → 화면 방향에서 가로로 고정할 수도 있습니다.',
          tone: 'info',
        }),
        1800
      );
    }
  }

  const updateBanner = new UpdateBanner({
    bus,
    root: document.getElementById('update-banner'),
    onReload: async () => {
      await saveNow();
      location.reload();
    },
  });
  new Toast({ bus, root: document.getElementById('toast-root') });

  // 화면 번쩍임 — 지금은 초월 강화 대성공에만 쓴다.
  // 클래스만 붙였다 떼는 것이라 CSS 쪽에서 연출을 통째로 바꿀 수 있다.
  {
    const flashEl = document.getElementById('fx-flash');
    let flashTimer = 0;
    bus.on('fx:flash', ({ tone = 'great', ms = 900 } = {}) => {
      if (!flashEl) return;
      clearTimeout(flashTimer);
      flashEl.hidden = false;
      flashEl.className = `fx-flash is-${tone}`;
      // 같은 클래스를 다시 붙이면 애니메이션이 다시 돌지 않으므로 한 번 끊어 준다.
      void flashEl.offsetWidth;
      flashTimer = setTimeout(() => {
        flashEl.hidden = true;
        flashEl.className = 'fx-flash';
      }, ms);
    });
  }

  // --- 씬 ---
  // getSettings 를 빠뜨리면 씬은 설정을 못 읽어 '창을 열면 시간 멈춤'이 늘 켠 것처럼
  // 굳어 버린다(끄나 켜나 똑같아진다). 실제로 한 번 그랬다.
  const fieldScene = new FieldScene({
    bus, store, input, encounter, portal, rng, appearance, net,
    getSettings: () => store.state.settings || {},
  });
  fieldScene.accountId = account.id;
  // 랭킹표에서 "이게 나다"를 가려내는 데 쓴다.
  // 이게 없으면 1위를 해도 표에서 내 줄이 강조되지 않고,
  // "내 기록" 줄이 5위 안에 든 사람에게까지 겹쳐 뜬다.
  store.state.accountId = account.id;

  // 필드에 서 있는 몬스터의 "센 정도"를 씬에 알려 준다.
  // 씬은 규칙을 모른다 — 색을 칠하기 위한 값만 받아 간다.
  fieldScene.monsterPower = (actor) => {
    const state = store.state;
    const def = state.db.monsters[actor.defId];
    if (!def) return null;
    const scaled = fieldMonsterDef(state, actor);
    const power = combatPower(computeMonsterStats(scaled));
    const mine = playerPower(state);
    return { level: scaled.level, power, mine, ...powerTier(mine, power) };
  };
  const battleScene = new BattleScene({
    bus,
    isFastForward: () => input.isHeld('skip'),
    getSettings: () => store.state.settings || {},
    // 씬은 "무엇으로 때렸나" 규칙을 모른다. 잣대를 통째로 넘겨 준다 —
    // 소리(아래 battle:event)도 같은 잣대를 쓰므로 그림과 소리가 갈릴 수 없다.
    hitKind: (turn) => hitKindOf(store.state, turn),
  });
  scenes.push(fieldScene);

  const anyPanelOpen = () =>
    inventoryPanel.open || shopPanel.open || exchangePanel.open ||
    characterPanel.open || questPanel.open || dialogueBox.open || settingsPanel.open ||
    waypointPanel.open || mailPanel.open || rankPanel.open || adminPanel.open;

  // ===================== 맵 이동 =====================

  /** 귀환 게이트를 현재 맵의 포탈 목록에 얹는다(맵 데이터는 건드리지 않는다). */
  function applyReturnGate(map) {
    const g = store.state.returnGate;
    if (!g) return;
    if (map.id === g.mapId) {
      map.portals = map.portals.concat([
        { x: g.tx, y: g.ty, to: g.townMapId, toX: g.townX, toY: g.townY, label: '포이노 마을', gate: true },
      ]);
    } else if (map.id === g.townMapId) {
      map.portals = map.portals.concat([
        { x: g.townX, y: g.townY, to: g.mapId, toX: g.tx, toY: g.ty, label: g.mapName, gate: true },
      ]);
    }
  }

  /**
   * 이 땅에 어느 곡이 흐르나.
   *
   * 규칙은 maps.json 의 `bgm` 칸에 있다 — 여기서 맵 이름을 하나하나 따지면
   * 땅을 하나 늘릴 때마다 이 파일을 고쳐야 한다. 칸이 비어 있으면
   * 마을인지 아닌지로만 가른다(새 땅을 넣고 칸을 안 채웠을 때의 대비).
   */
  function bgmOf(map) {
    if (!map) return 'field';
    return map.bgm || (map.kind === 'town' ? 'town' : 'field');
  }

  /**
   * 등장 연출을 **크게** 하는 상대 (0.48).
   *
   * 고룡 둘뿐이다. 다른 보스와 같은 배너로 나오면 "그냥 조금 센 놈" 으로 보인다 —
   * 30분에 한 번 오는 상대에게는 그만한 자리를 내 준다.
   */
  const GRAND_BOSSES = new Set(['great_dragon', 'elder_dragon']);

  /**
   * 보스와 붙는 동안 흐르는 곡 (0.46).
   *
   * 고룡의 땅은 **그 땅의 곡이 이미 보스 곡**이다(느리고 크게 다가오는 소리).
   * 거기서까지 보통 보스 곡으로 바꾸면 고룡만의 무게가 사라지므로 그대로 둔다.
   */
  function bossBgmOf(map) {
    const base = bgmOf(map);
    return base === 'dragon' ? 'dragon' : 'boss';
  }

  function changeMap(mapId, toX, toY) {
    const state = store.state;
    const map = buildMap(db, mapId);
    applyReturnGate(map);
    state.map = map;
    // 보스는 죽은 시각을 기억한다 — 맵을 나갔다 와도 곧바로 되살아나지 않는다.
    state.monsters = spawnMonsters(db, map, state.bossRespawn);
    state.npcs = spawnNpcs(db, map);
    state.dragonHud = null; // 그 땅을 떠나면 상태 줄도 사라진다
    applyTimedBoss(state, map);

    const p = state.player;
    p.tx = p.fromTx = toX;
    p.ty = p.fromTy = toY;
    p.moving = false;
    p.stepT = 0;
    syncPixel(p);

    Quests.recordVisit(state, mapId);
    portal.reset(p);
    encounter.startCooldown(1400);
    fieldScene.showBanner(map.name);
    announceOmen(state);
    if (sound) {
      sound.sfx('portal');
      sound.playBgm(bgmOf(map)); // 같은 곡이면 playBgm 이 알아서 아무것도 안 한다
    }
    store.notify();
    scheduleSave();
  }

  /**
   * 마을에 있을 때 "서쪽에서 이상한 기운이 감돈다".
   *
   * 고룡은 30분마다 와서 25분만 머문다. 절벽까지 걸어가 봐야 아는 것이면
   * 헛걸음이 되므로, 마을에서 그 사실을 알 수 있어야 한다.
   * 같은 마리를 두고 되풀이해 알리지는 않는다(마을을 드나들 때마다 뜨면 시끄럽다).
   */
  let omenTold = 0;
  function announceOmen(state, { force = false } = {}) {
    if (!state.map || state.map.kind !== 'town') return;
    const at = TimedBoss.omenNow(db, state);
    if (!at || !at.present) return;
    if (!force && omenTold === at.since) return;
    omenTold = at.since;
    const left = Math.max(0, at.endsAt - Date.now());
    bus.emit('toast', {
      text: `${at.omen}\n서쪽 문으로 나가면 ${Math.ceil(left / 60000)}분 안에 만날 수 있다.`,
      tone: 'rare',
    });
  }

  bus.on('map:travel', (p) => {
    // 귀환 게이트는 일회용이다. 들어가는 순간 양쪽 입구가 모두 닫힌다.
    // (닫지 않으면 필드로 나오자마자 발밑의 게이트를 다시 밟아 마을로 되돌아간다)
    if (p.gate) {
      store.state.returnGate = null;
      bus.emit('toast', { text: '게이트가 닫혔다.', tone: 'info' });
    }
    changeMap(p.to, p.toX, p.toY);
  });

  bus.on('portal:blocked', (p) => {
    // 레벨 제한은 성문 위병이 말리고, 보스·퀘스트 자물쇠는 길 자체가 막혀 있다.
    const byLevel = !!p.requireLevel && !p.requireBossOf && !p.requireQuestOf;
    if (byLevel) {
      dialogue.start({
        name: '성문 위병',
        portrait: 'npc_guard',
        lines: [
          p.blockedText || `레벨 ${p.requireLevel} 이상만 통과할 수 있다.`,
          `그대는 지금 레벨 ${store.state.player.level}.\n동쪽 들판에서 더 강해져서 오게.`,
        ],
      });
      return;
    }
    dialogue.start({
      name: '막힌 길',
      portrait: 'npc_guard',
      lines: [
        p.blockedText || '아직 이 길은 열려 있지 않다.',
        '이 땅의 주인을 눕히고 그 일을 마을에 보고해야\n동쪽 길이 열린다.',
      ],
    });
  });

  // 웨이포인트 — 보스를 잡은 땅의 한가운데로 곧장 간다.
  bus.on('ui:waypoint-travel', ({ mapId }) => {
    const state = store.state;
    const check = Waypoints.canTravel(state, mapId);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });

    const def = state.db.maps.maps[mapId];
    const spot = Waypoints.landingSpot(def);
    // 좌표는 미리 적어 둔 것이라 나무·바위 위일 수 있다. 가까운 빈 칸으로 옮겨 준다.
    const map = buildMap(state.db, mapId);
    const safe = nearestWalkable(map, spot.x, spot.y);

    changeMap(mapId, safe.x, safe.y);
    bus.emit('toast', { text: `${def.name} 한가운데에 내려섰다.`, tone: 'good' });
  });

  // 마을로 귀환 — 시전을 마치면 서 있던 자리와 마을 광장에 게이트 한 쌍을 남긴다.
  // 시전 중에 움직이거나 전투에 걸리면 취소된다(cast 는 게임 루프에서 진행된다).
  bus.on('ui:return-town', () => {
    const state = store.state;
    if (state.map.kind === 'town') {
      return bus.emit('toast', { text: '이미 마을입니다.', tone: 'info' });
    }
    // 왜 안 되는지 알려 준다 — 조용히 무시하면 "버튼이 고장났다"로 보인다.
    if (scenes.current === battleScene || awaitingConfirm) {
      return bus.emit('toast', { text: '전투 중에는 귀환할 수 없다.', tone: 'bad' });
    }
    if (anyPanelOpen()) return;
    if (cast.active) return;

    startCast({
      label: '마을 귀환',
      ms: BALANCE.RETURN_CAST_MS,
      onDone: () => {
        const st = store.state;
        st.returnGate = {
          mapId: st.map.id,
          mapName: st.map.name,
          tx: st.player.tx,
          ty: st.player.ty,
          townMapId: TOWN_GATE.mapId,
          townX: TOWN_GATE.x,
          townY: TOWN_GATE.y,
        };
        changeMap(TOWN_GATE.mapId, 20, 20);
        bus.emit('toast', {
          text: '포이노로 귀환했다. 광장에 돌아갈 게이트가 열렸다 (1회용).',
          tone: 'rare',
        });
      },
    });
  });

  // ---- 시전(캐스팅) ----
  // 규칙은 단순하다: 정해진 시간 동안 제자리에 서 있으면 성공, 움직이면 취소.
  const cast = { active: false, t: 0, total: 0, label: '', onDone: null, tx: 0, ty: 0 };

  function startCast({ label, ms, onDone }) {
    const p = store.state.player;
    cast.active = true;
    cast.t = 0;
    cast.total = ms;
    cast.label = label;
    cast.onDone = onDone;
    cast.tx = p.tx;
    cast.ty = p.ty;
    castBar.show(label, ms);
  }

  function cancelCast(reason) {
    if (!cast.active) return;
    cast.active = false;
    cast.onDone = null;
    castBar.hide();
    if (reason) bus.emit('toast', { text: `${cast.label} 취소 — ${reason}`, tone: 'bad' });
  }

  function updateCast(dt) {
    if (!cast.active) return;
    const p = store.state.player;
    if (p.tx !== cast.tx || p.ty !== cast.ty) return cancelCast('움직였다');
    if (scenes.current === battleScene) return cancelCast('전투에 휘말렸다');

    // 시전하는 잠깐은 조우 판정을 눌러 둔다.
    // 안 그러면 돌아다니던 몬스터가 스쳐 지나가기만 해도 귀환이 계속 끊겨
    // "귀환이 안 된다"가 되어 버린다. (움직이면 취소되는 규칙은 그대로다)
    encounter.startCooldown(160);

    cast.t += dt;
    castBar.setProgress(cast.t / cast.total);
    if (cast.t >= cast.total) {
      const done = cast.onDone;
      cast.active = false;
      cast.onDone = null;
      castBar.hide();
      if (done) done();
    }
  }

  bus.on('ui:cast-cancel', () => cancelCast('취소했다'));

  // ===================== NPC 대화 =====================
  let activeNpcId = null;

  /**
   * 방금 말을 건 사람. **연달아** 한 번 더 걸면 다른 이야기를 한다(npcs.json 의 lines2).
   *
   * 왜 두 번째에 두나: 게임에 필요한 실마리를 첫 마디에 다 얹으면 대사가 안내문이 된다.
   * 한 번 더 말을 거는 것은 사람이 스스로 하는 일이라, 거기서 나온 이야기는
   * "내가 캐낸 것"이 된다. 중간에 다른 사람과 말하면 처음으로 돌아간다.
   */
  let lastTalkedId = null;

  function talkTo(npcActor) {
    const def = db.npcs[npcActor.defId];
    if (!def) return;
    const again = lastTalkedId === npcActor.defId && def.lines2 && def.lines2.length;
    activeNpcId = npcActor.defId;
    lastTalkedId = npcActor.defId;
    fieldScene.pause();
    dialogue.start({
      name: def.name,
      lines: again ? def.lines2 : def.lines,
      action: def.action,
      portrait: def.sprite,
      quick: def.quick,
    });
  }

  bus.on('dialogue:advance', () => dialogue.advance());
  bus.on('dialogue:skip', () => dialogue.finish());

  bus.on('dialogue:action', (payload) => {
    const def = db.npcs[activeNpcId];
    dialogue.close();
    // 버튼이 둘인 NPC(마녀)는 어느 쪽을 눌렀는지가 곧 무엇을 할지다.
    const act = payload && payload.alt ? def && def.action2 : def && def.action;
    if (act) runNpcAction(def, act);
  });

  bus.on('dialogue:end', ({ action }) => {
    if (!action) return;
    const def = db.npcs[activeNpcId];
    if (def) runNpcAction(def);
  });

  bus.on('dialogue:closed', () => {
    if (!anyPanelOpen()) fieldScene.resume();
  });

  function runNpcAction(def, action = null) {
    const state = store.state;
    const act = action || def.action;
    if (act.type === 'shop') return shopPanel.show({ name: def.name, stock: def.stock });
    if (act.type === 'forge') {
      return inventoryPanel.show({ mode: 'forge', title: `대장간 — ${def.name}` });
    }
    // 마녀의 초월 강화 — +10 부터 +15 까지. 대장간과 규칙이 완전히 다르므로 창을 나눈다.
    if (act.type === 'transcend') {
      return inventoryPanel.show({ mode: 'transcend', title: `초월 강화 — ${def.name}` });
    }
    if (act.type === 'exchange') {
      return exchangePanel.show({ name: def.name, recipes: def.recipes });
    }
    if (act.type === 'quest') return questPanel.show();
    if (act.type === 'waypoint') return waypointPanel.show();
    if (act.type === 'inn') {
      const stats = computePlayerStats(state);
      if (state.player.gold < BALANCE.INN_COST) {
        bus.emit('toast', { text: '골드가 부족하다.', tone: 'bad' });
      } else {
        state.player.gold -= BALANCE.INN_COST;
        state.player.hp = stats.hp;
        Buffs.addBuff(state, BALANCE.INN_BUFF);
        store.notify();
        scheduleSave();
        bus.emit('toast', {
          text: `푹 잤다. HP 완전 회복 + ${BALANCE.INN_BUFF.name} (${BALANCE.INN_BUFF.desc})`,
          tone: 'good',
        });
      }
      fieldScene.resume();
    }
  }

  /**
   * 지금 내 전투력. 몬스터 이름표를 매 프레임 칠하므로 매번 다시 계산하면 낭비다.
   * 상태가 바뀔 때만 다시 잰다(store.notify 가 불릴 때).
   */
  let cachedPower = null;
  store.subscribe(() => {
    cachedPower = null;
  });
  function playerPower(state) {
    if (cachedPower == null) {
      const st = computePlayerStats(state);
      cachedPower = combatPower(st, st.mods);
    }
    return cachedPower;
  }

  // ===================== 전투 =====================
  let awaitingConfirm = false;
  // 값을 치르지 않는 부활에서 "어디로 돌려보낼지". 결과창을 닫을 때 쓴다.
  let reviveTo = null;
  let pendingBattle = null;

  /** 몬스터 정의에 필드 단계 보정을 입힌다. */
  /**
   * 시각을 보고 내려앉는 보스(서쪽 절벽의 용)를 이 맵에 세운다.
   *
   * 30분마다 한 마리씩 온다. 잡으면 다음 주기까지 자리가 빈다.
   * 못 잡아도 깎아 둔 체력은 그대로 남으므로, 여러 번 붙어서 눕히는 상대가 된다.
   */
  function applyTimedBoss(state, map) {
    const def = TimedBoss.timedBossOf(map);
    if (!def) return;
    const at = TimedBoss.evaluate(state, map);
    if (!at.present) {
      // 아직 안 왔거나 이미 잡혔다 — 언제 오는지 알려 준다.
      fieldScene.showBanner(`${map.name} — 다음 용까지 ${TimedBoss.waitText(at.nextAt)}`);
      showDragonGone(state, map, at.nextAt, at.downed ? '이번 마리는 이미 눕었다' : null);
      // 서버가 보기엔 아직 있을 수도 있다(남이 안 잡았다면). 한 번 물어본다.
      syncDragonFromServer(state, map, null, 0);
      return;
    }
    const monDef = db.monsters[def.monster];
    if (!monDef) return;

    const spot = nearestWalkable(map, def.x ?? Math.floor(map.w / 2), def.y ?? Math.floor(map.h / 2));
    map.spawns = [{ monster: def.monster, x: spot.x, y: spot.y, boss: true }];
    state.monsters = spawnMonsters(db, map, null);

    const dragon = state.monsters[0];
    if (dragon) {
      dragon.timedBoss = true;
      // 깎아 둔 몸으로 나온다. 몇 번째 도전인지가 눈에 보여야 다시 붙을 마음이 생긴다.
      const full = computeMonsterStats(monDef).hp * (map.power || 1);
      dragon.carriedHp = TimedBoss.startingHp(state, map, Math.round(full));
      dragon.fullHp = Math.round(full);
      // 들어서자마자 "얼마나 깎였고 언제 사라지나"를 보여 준다.
      showDragonHud(state, map, dragon);
      // 서버에 접속해 있으면 체력은 서버가 들고 있다 — 여럿이 같은 놈을 때리므로.
      // 먼저 내 기록으로 세워 두고, 서버 답이 오면 그것으로 바꾼다(기다리지 않는다).
      syncDragonFromServer(state, map, dragon, Math.round(full));
    }
  }

  /**
   * 고룡 상태 줄을 세운다(HUD 가 읽는다).
   * 남은 시간은 초마다 줄어드므로 여기서 한 번 만들고, 아래 시계가 계속 고쳐 준다.
   */
  function showDragonHud(state, map, dragon) {
    const def = TimedBoss.timedBossOf(map);
    if (!def || !dragon) {
      state.dragonHud = null;
      return;
    }
    const at = TimedBoss.evaluate(state, map);
    state.dragonHud = {
      show: true,
      present: true,
      name: db.monsters[def.monster] ? db.monsters[def.monster].name : '고룡',
      hp: Math.round(dragon.carriedHp || 0),
      maxHp: dragon.fullHp || Math.round(dragon.carriedHp || 1),
      endsAt: at.endsAt,
      leftText: TimedBoss.waitText(at.endsAt),
      shared: storage.isServer,
    };
  }

  /**
   * 서버는 "아직 있다"는데 내 쪽에는 없을 때 세워 준다.
   *
   * 내 세이브에는 눕은 것으로 적혀 있어도, 서버가 진실이면 아직 살아 있다
   * (다른 사람이 마무리하지 못한 마리다). 그때 이 자리를 채운다.
   */
  function applyTimedBossFromServer(state, map, at) {
    const def = TimedBoss.timedBossOf(map);
    const monDef = def && db.monsters[def.monster];
    if (!monDef) return;
    const spot = nearestWalkable(map, def.x ?? Math.floor(map.w / 2), def.y ?? Math.floor(map.h / 2));
    map.spawns = [{ monster: def.monster, x: spot.x, y: spot.y, boss: true }];
    state.monsters = spawnMonsters(db, map, null);
    const dragon = state.monsters[0];
    if (!dragon) return;
    dragon.timedBoss = true;
    dragon.serverHp = true;
    dragon.fullHp = at.maxHp || Math.round(computeMonsterStats(monDef).hp * (map.power || 1));
    dragon.carriedHp = Math.max(1, at.hp);
    showDragonHud(state, map, dragon);
    store.notify();
  }

  /** 고룡이 없는 땅에 서 있을 때 — 언제 오는지만 적어 둔다. */
  function showDragonGone(state, map, nextAt, note) {
    const def = TimedBoss.timedBossOf(map);
    if (!def) return;
    state.dragonHud = {
      show: true,
      present: false,
      name: db.monsters[def.monster] ? db.monsters[def.monster].name : '고룡',
      note: note || `다음 마리까지 ${TimedBoss.waitText(nextAt)}`,
    };
  }

  /**
   * 한 판에서 고룡에게 준 피해를 서버에 알린다.
   * 눕혔으면 서버가 기여도대로 우편을 보내 주므로, 여기서는 우편함만 새로 받아 온다.
   */
  async function reportDragonDamage(damage) {
    if (!storage.isServer || !(damage > 0)) return;
    try {
      const res = await storage.hitDragon(account.id, account.token, damage);
      if (!res || res.offline || !res.ok) return;
      if (res.downed) {
        // 눕었으면 자리를 비운다. 다음 서버 동기화를 기다리면
        // 죽은 놈이 십여 초 더 서 있게 된다.
        const state = store.state;
        const here = state.monsters.find((m) => m.timedBoss);
        if (here) state.monsters = state.monsters.filter((m) => m !== here);
        if (state.dragonHud && state.dragonHud.show) {
          showDragonGone(state, state.map, res.nextAt, '이번 마리는 눕었다');
        }
        store.notify();
        announceDragonClear(res.rewards || []);
        refreshMail({ quiet: true });
      }
    } catch { /* 못 알려도 게임은 굴러간다 */ }
  }

  /**
   * 고룡을 눕혔을 때 — 누가 얼마나 때렸고 내가 몇 등인지 알려 준다.
   *
   * 몫은 우편으로 가지만, 그것만으로는 "여럿이 같이 눕혔다"는 느낌이 남지 않는다.
   * 등수와 함께 참여한 사람 목록을 한 번 보여 주고 나서 우편으로 넘긴다.
   */
  function announceDragonClear(rewards) {
    bus.emit('fx:flash', { tone: 'great' });
    const mine = rewards.find((r) => r.id === account.id);
    const board = rewards
      .slice(0, 5)
      .map((r) => {
        const mark = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `${r.rank}`;
        const me = r.id === account.id ? ' ←' : '';
        return `${mark} ${r.name} — ${Math.round(r.damage).toLocaleString()} · 징표 ${r.count}개${me}`;
      })
      .join('\n');

    bus.emit('toast', {
      text:
        `✦ 고룡 카르나크 토벌 ✦\n` +
        (mine ? `당신은 ${rewards.length}명 중 ${mine.rank}등\n` : '') +
        board +
        `\n몫은 우편으로 보냈다.`,
      tone: 'rare',
      ms: 7000,
    });
  }

  /**
   * 고룡의 체력을 서버에서 받아 온다.
   *
   * 혼자 하는 중이면 아무것도 하지 않는다 — 그때는 내 세이브의 값이 곧 진실이다.
   * 서버가 있으면 여럿이 같은 놈을 때리므로 서버 값이 진실이고, 그래야
   * "누가 제일 많이 때렸나"를 물을 수 있다.
   */
  async function syncDragonFromServer(state, map, dragon, fullHp) {
    if (!storage.isServer) return;
    try {
      const at = await storage.dragon();
      if (at.offline) return;
      // 그 사이에 맵을 떠났으면 버린다.
      if (store.state.map !== map) return;

      if (!at.present || at.hp <= 0) {
        // 서버가 보기엔 이미 눕었거나 떠났다 — 자리를 비운다.
        // 내가 아니라 남이 눕혔을 수도 있다. 그때도 알려 줘야 눈앞에서 사라진 이유를 안다.
        if (dragon) {
          state.monsters = state.monsters.filter((m) => m !== dragon);
          if (at.downedAt) {
            bus.emit('toast', {
              text: '고룡 카르나크가 쓰러졌다.\n함께 때렸다면 몫이 우편으로 온다.',
              tone: 'rare',
            });
            refreshMail({ quiet: true });
          }
        }
        fieldScene.showBanner(
          `${map.name} — 다음 용까지 ${TimedBoss.waitText(at.nextAt)}`
        );
        showDragonGone(state, map, at.nextAt, at.downedAt ? '이번 마리는 이미 눕었다' : null);
        store.notify();
        return;
      }
      // 서버가 아직 있다는데 내 쪽에 없으면(내 세이브만 눕은 것으로 알던 경우) 세운다.
      if (!dragon) {
        applyTimedBossFromServer(state, map, at);
        return;
      }
      dragon.carriedHp = Math.max(1, Math.min(fullHp, at.hp));
      dragon.fullHp = at.maxHp || fullHp;
      dragon.serverHp = true;
      showDragonHud(state, map, dragon);
      store.notify();
    } catch { /* 서버가 대답 못 해도 내 기록으로 계속 논다 */ }
  }

  function fieldMonsterDef(state, actor) {
    const baseDef = state.db.monsters[actor.defId];
    const power = state.map.power || 1;
    return {
      ...baseDef,
      level: baseDef.level + (state.map.levelBonus || 0),
      stats: scaleMonsterStats(baseDef.stats, power),
      exp: Math.round(baseDef.exp * power),
      gold: Math.round(baseDef.gold * power),
    };
  }

  /**
   * 전투 중 자동으로 마실 회복약 목록.
   * 전투 중에는 사람이 물약을 누르지 않는다 — CombatSystem 이 타임라인을 만들 때 알아서 마신다.
   * 그래야 "이미 진 전투에 물약을 부어 되살리는" 일이 생기지 않는다.
   */
  function autoPotionConfig(state) {
    const byId = new Map();
    for (const inst of state.inventory) {
      const def = state.db.items[inst.id];
      if (!def || !def.use || !def.use.hp) continue;
      const found = byId.get(inst.id);
      if (found) found.count += inst.count;
      else byId.set(inst.id, { id: inst.id, name: def.name, heal: def.use.hp, count: inst.count });
    }

    // 쓰는 순서는 "단축키 칸 순서"다 — 1번 칸에 올려 둔 약부터 쓴다.
    // 회복량 순으로 고르면 아껴 두려던 비싼 약이 먼저 없어져서 뜻과 어긋난다.
    // 칸에 올려 두지 않은 약은 그 뒤에 붙는다(그것마저 없을 때의 마지막 보루).
    const stock = [];
    for (const id of state.quickSlots || []) {
      const row = id && byId.get(id);
      if (row && !stock.includes(row)) stock.push(row);
    }
    for (const row of byId.values()) if (!stock.includes(row)) stock.push(row);

    return {
      stock,
      threshold: Settings.autoPotionThreshold(state.settings),
      cooldownMs: BALANCE.QUICKSLOT_BATTLE_COOLDOWN_MS,
    };
  }

  /**
   * 이번 전투에 끌려 들어올 몬스터들. 직업 특성 pull 이 0 이면 처음 부딪힌 한 마리뿐이고,
   * 마법사처럼 pull 이 있으면 주변 몇 칸 안의 몬스터가 함께 딸려 온다.
   */
  /**
   * 이번 판에 몇 마리와 붙나.
   *
   * 두 가지 규칙이 있고, 맵 쪽이 먼저다.
   *  ① 맵이 groupOdds 를 정해 두었으면(지하감옥) 그 확률로 마릿수를 굴린다.
   *     60% 한 마리, 35% 두 마리, 5% 세 마리 — 대부분 혼자지만 가끔 몰린다.
   *  ② 아니면 직업 규칙(마법사만 광역으로 끌고 온다).
   *
   * 어느 쪽이든 "가까이 있는 놈"만 끌려온다. 맵 반대편 몬스터가 끼어들면
   * 어디서 왔는지 알 수 없어 억울해진다.
   */
  function battleParty(state, firstActor, traits) {
    const party = [firstActor];
    const odds = state.map && state.map.groupOdds;

    let radius = traits.pull || 0;
    let max = Math.max(1, traits.maxPull || 1);

    if (odds && odds.length) {
      const roll = rng();
      let want = 1;
      let acc = 0;
      for (let i = 0; i < odds.length; i++) {
        acc += odds[i];
        if (roll < acc) { want = i + 1; break; }
        want = odds.length;
      }
      max = Math.max(max, want);
      // 몰려드는 판이면 조금 넓게 본다 — 좁으면 굴려 놓고 데려올 놈이 없다.
      radius = Math.max(radius, 4);
    }
    if (radius <= 0 || max <= 1) return party;

    const near = state.monsters
      .filter((m) => m.alive && m !== firstActor && !m.isBoss)
      .map((m) => ({ m, d: Math.abs(m.tx - firstActor.tx) + Math.abs(m.ty - firstActor.ty) }))
      .filter((x) => x.d <= radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, max - 1)
      .map((x) => x.m);

    return party.concat(near);
  }

  bus.on('battle:request', ({ monsterUid }) => {
    if (scenes.current === battleScene) return;

    const state = store.state;
    const firstActor = state.monsters.find((m) => m.uid === monsterUid);
    if (!firstActor || !firstActor.alive) return;

    const cls = Skills.classDef(state);
    const traits = cls.combat || {};

    // 보스전은 항상 1:1 이다(광역으로 잡몹까지 끌고 오면 난이도가 엉망이 된다).
    const actors = firstActor.isBoss ? [firstActor] : battleParty(state, firstActor, traits);
    const defs = actors.map((a) => fieldMonsterDef(state, a));

    // 누구와 붙는지를 먼저 정하고 나서 내 스탯을 잰다.
    //
    // 조건부 세트 효과(용린 4세트 — 고룡과 싸울 때 힘·민첩·지능 +100 · 피해 2배)가
    // 이 목록을 본다. 순서가 뒤집히면 그 효과가 영영 안 켜진다 —
    // 상대를 알기 전에 잰 스탯에는 '고룡과 싸우는 중' 이라는 사실이 없기 때문이다.
    const foes = actors.map((a) => a.defId).filter(Boolean);

    // "이 상대를 만나 봤다" 를 적어 둔다 — 특별 의뢰가 이걸 보고 열린다.
    // 잡았을 때가 아니라 **붙었을 때** 적는다. 고룡은 한 번에 눕는 상대가 아니라,
    // 잡아야만 열리게 두면 정작 그 의뢰가 필요한 사람에게 영영 안 열린다.
    for (const defId of foes) {
      if (!Quests.recordMet(state, defId)) continue;
      const opened = Quests.specialQuests(state).filter((q) => q.unlock.target === defId);
      for (const q of opened) {
        bus.emit('toast', { text: `새 의뢰가 열렸다 — [${q.title}]`, tone: 'rare' });
      }
    }

    const playerStats = computePlayerStats(state, foes);
    const playerMods = playerStats.mods;

    const playerCombatant = toCombatant(state.player.name, playerStats, state.player.battleSprite);
    playerCombatant.hp = state.player.hp;

    const monsterCombatants = defs.map((d, i) => {
      const c = toCombatant(d.name, computeMonsterStats(d), actors[i].battleSprite, d.school || 'physical');
      // 이 땅에서 마법으로 들어오는 몫. 보스는 제 땅보다 더 섞을 수 있다.
      // (통째로 마법인 상대는 school 이 'magic' 이라 이 값과 상관없이 전부 마법이다)
      const map = state.map || {};
      c.magicPart = actors[i].isBoss && map.bossMagicPart != null
        ? map.bossMagicPart
        : map.magicPart || 0;
      // 서쪽 절벽의 용은 지난 판에 깎아 둔 몸으로 나온다.
      // 매번 온전한 몸이면 "여러 번 붙어서 눕힌다"가 성립하지 않는다.
      //
      // 기세(±35%)는 걸지 않는다(mood 1 로 못 박는다). 남은 체력을 판마다 이어 붙이는
      // 상대에게 기세를 걸면, 체력이 적게 굴러 나온 판의 값이 그대로 "깎은 것"으로
      // 기록되어 한 대도 안 때리고 20% 를 벗겨 내는 일이 생긴다.
      if (actors[i].timedBoss) {
        c.mood = 1;
        if (actors[i].carriedHp > 0) {
          c.hp = Math.max(1, Math.min(c.maxHp, Math.round(actors[i].carriedHp)));
        }
      }
      // 상처가 남는 보스(고룡의 둥지) — 지난 판에 깎아 둔 만큼 깎인 채로 나온다.
      //
      // 왜 필요한가: 이 상대는 지하감옥 주인의 두 배로 세다. 한 판에 눕히는 것은
      // 어떤 장비로도 안 된다 — 실제로 용린 한 벌을 다 갖춘 만렙으로 재도 0% 였다.
      // 서쪽 절벽의 카르나크와 같은 방식으로, 몇 번이고 물어뜯어 눕히는 상대로 둔다.
      if (state.map.bossKeepHp && actors[i].isBoss) {
        c.mood = 1; // 기세(±35%)를 걸면 깎아 둔 값이 판마다 되살아난 것처럼 보인다
        const left = (state.bossWounds || {})[actors[i].uid];
        if (left > 0) c.hp = Math.max(1, Math.min(c.maxHp, Math.round(left)));
      }
      return c;
    });

    const seed = makeSeed();
    const result = simulateBattle({
      player: playerCombatant,
      monsters: monsterCombatants,
      seed,
      playerMods,
      playerTraits: traits,
      potions: autoPotionConfig(state),
    });

    pendingBattle = {
      monsterUids: actors.map((a) => a.uid),
      monsterDefIds: actors.map((a) => a.defId),
      monsterDefs: defs,
      monsterCombatants,
      playerCombatant,
      playerMods,
      traits,
      result,
      seed,
      isBoss: firstActor.isBoss,
    };

    scenes.push(battleScene, {
      result,
      player: {
        name: state.player.name,
        level: state.player.level,
        sprite: appearance.get(state.player.battleSprite, computeLook(state)),
        // 때리는 순간에만 바꿔 끼우는 그림. 없는 직업(운영자)은 그냥 비어 있고,
        // 씬이 알아서 서 있는 그림으로 되돌린다.
        attackSprite: appearance.get(
          String(state.player.battleSprite).replace(/_battle$/, '_attack'),
          computeLook(state)
        ),
        // 0.56 — 전투에서 **서 있는 동안** 쓰는 그림(전투 자세).
        // 없으면(운영자) 씬이 알아서 서 있는 그림을 쓴다.
        stanceSprite: appearance.get(
          String(state.player.battleSprite).replace(/_battle$/, '_stance'),
          computeLook(state)
        ),
        maxHp: playerCombatant.maxHp,
        hp: playerCombatant.hp,
        scale: 0.62,
      },
      // HP 막대는 "기세"까지 반영된 실제 수치로 그린다.
      // 계산기가 굴린 값(result.snapshot)을 쓰지 않으면 막대와 피해가 어긋난다.
      monsters: defs.map((d, i) => {
        const rolled = (result.snapshot && result.snapshot.monsters[i]) || monsterCombatants[i];
        return {
          name: d.name,
          level: d.level,
          sprite: actors[i].battleSprite,
          // 0.44 — 몬스터도 덤벼드는 그림이 따로 있다. 없으면(새 몬스터를 넣고
          // 그림을 아직 안 구웠을 때) 씬이 서 있는 그림으로 되돌린다.
          attackSprite: String(actors[i].battleSprite).replace(/_battle$/, '_attack'),
          maxHp: rolled.maxHp,
          hp: rolled.hp,
          mood: rolled.mood,
          scale: 0.78 * (d.battleScale || 1),
          boss: actors[i].isBoss,
          // 등장·쓰러짐 연출에 쓸 한 줄 (0.48). 표(monsters 시트)에 적혀 있다.
          intro: d.intro || '',
          defeat: d.defeat || '',
          // 고룡은 등장 연출을 크게 한다 — 그 둘만 다르게 굴린다.
          // 표의 def 에는 id 가 없을 수 있으므로 **필드에 서 있던 놈의 defId** 를 본다.
          grand: GRAND_BOSSES.has(actors[i].defId),
        };
      }),
    });

    if (actors.length > 1) {
      bus.emit('toast', { text: `${actors.length}마리를 한꺼번에 끌어들였다!`, tone: 'rare' });
    }

    // 설정에서 "전투 화면 건너뛰기"를 켜 두었으면 연출 없이 결과창으로 간다.
    if (store.state.settings && store.state.settings.battleSkip) battleScene.skipToEnd();
  });

  // 연출 도중 이미 덜어 낸 물약. { 아이템id → 병 수 }
  //
  // 예전에는 전투가 다 끝나고 나서야 한 번에 뺐다. 결과는 맞았지만, 싸우는 동안
  // 단축칸의 숫자가 20 그대로 붙어 있다가 전투를 나오는 순간 16 으로 뚝 떨어졌다.
  // 마시는 장면은 보이는데 개수는 안 줄어드니 "물약이 안 닳는다"고 보인다.
  // 이제 마시는 그 연출에서 한 병씩 뺀다.
  const drankLive = new Map();

  bus.on('battle:event', (turn) => {
    if (!turn || turn.type !== 'heal' || !turn.itemId) return;
    if (!pendingBattle) return;
    const state = store.state;
    if (Inventory.countOf(state, turn.itemId) <= 0) return;
    Inventory.removeItem(state, turn.itemId, 1);
    drankLive.set(turn.itemId, (drankLive.get(turn.itemId) || 0) + 1);
    store.notify(); // 단축칸·소지품이 이 자리에서 다시 그려진다
  });

  bus.on('battle:finished', () => {
    if (!pendingBattle) return;
    const { result, monsterUids, monsterDefIds, monsterDefs, seed, isBoss } = pendingBattle;
    const state = store.state;

    state.player.hp = Math.max(0, result.finalHp.player);
    const summary = { win: false, draw: false, exp: 0, gold: 0, items: [], boss: isBoss };

    // 전투 중 자동으로 마신 물약을 소지품에서 덜어 낸다.
    //
    // 대부분은 이미 연출 도중에 한 병씩 빠졌다(아래 'battle:event' 참고).
    // 여기서는 **아직 안 빠진 몫만** 덜어 낸다 — 건너뛰기로 결과창까지 단숨에
    // 갔거나, 연출을 다 보기 전에 창을 닫은 경우가 그렇다.
    // 두 번 빼면 마시지도 않은 물약이 사라지므로 반드시 남은 만큼만 뺀다.
    summary.potions = [];
    for (const p of result.potionsUsed || []) {
      const already = drankLive.get(p.id) || 0;
      const left = Math.max(0, p.count - already);
      if (left) Inventory.removeItem(state, p.id, left);
      summary.potions.push({ name: state.db.items[p.id]?.name || p.id, count: p.count });
    }
    drankLive.clear();

    // 이긴 전투가 아니어도 도중에 쓰러뜨린 놈은 있을 수 있다(광역 전투).
    const downed = result.defeated || (result.winner === 'player' ? [0] : []);

    if (downed.length) {
      const lootRng = createRng((seed ^ 0x9e3779b9) >>> 0);
      const gained = { exp: 0, gold: 0, items: [] };
      // 골드 획득 증가(특성·사냥꾼)와 재료 두 배(용사)는 이 전투 내내 같은 값을 쓴다.
      const pm = computePlayerStats(state).mods;
      const rewardMods = {
        goldFind: pm.goldFind || 0,
        materialDouble: pm.materialDouble || 0,
      };

      for (const idx of downed) {
        const uid = monsterUids[idx];
        const defId = monsterDefIds[idx];
        const monsterActor = state.monsters.find((m) => m.uid === uid);
        // 시각 보스(고룡)는 바닥에 아무것도 흘리지 않는다.
        //
        // 여럿이 스무 번을 나눠 두들기는 상대라, 마지막 일격을 넣은 사람이
        // 전리품과 경험치를 독차지하면 함께 때린 보람이 사라진다.
        // 값어치는 서버가 기여도대로 갈라 우편으로 보낸다.
        const isTimed = monsterActor && monsterActor.timedBoss;
        if (monsterActor && monsterActor.alive) {
          monsterActor.alive = false;
          monsterActor.respawnTimer = monsterActor.respawnMs ?? state.map.respawnMs;
          // 보스는 언제 되살아나는지를 따로 적어 둔다.
          // 이게 없으면 맵 밖으로 한 걸음 나갔다 오는 것만으로 다시 잡을 수 있었다.
          if (monsterActor.isBoss) {
            state.bossRespawn = state.bossRespawn || {};
            state.bossRespawn[uid] = Date.now() + monsterActor.respawnTimer;
          }
          net.reportKill(state.map.id, uid);
        }

        Quests.recordKill(state, defId);
        if (isTimed) continue; // 보상은 우편으로만 나간다

        const rewards = rollRewards(db, defId, monsterDefs[idx], state.player.level, lootRng, rewardMods);
        gained.exp += rewards.exp;
        gained.gold += rewards.gold;
        gained.items.push(...rewards.items);
      }

      state.player.gold += gained.gold;
      const engraved = engraveNew(Inventory.addItems(state, gained.items), lootRng);
      const prog = Progression.gainExp(state, gained.exp);

      summary.win = result.winner === 'player';
      summary.kills = downed.length;
      summary.exp = gained.exp;
      summary.gold = gained.gold;
      summary.items = gained.items.map((i) => ({
        name: state.db.items[i.id]?.name || i.id,
        count: i.count,
      }));
      // 각인은 전리품 줄 밑에 따로 적는다 — 같은 물건이 둘 떨어졌을 때
      // 어느 쪽에 붙었는지 줄 하나로는 말할 수 없어서, 붙은 것만 따로 세운다.
      if (engraved.length) summary.engraved = engraved;
      if (prog.leveledUp) {
        summary.levelUp = { from: prog.from, to: prog.to };
        if (prog.points.trait || prog.points.skill) {
          summary.points = prog.points;
        }
      }

      for (const i of gained.items) {
        const def = state.db.items[i.id];
        bus.emit('toast', {
          text: `${def?.name || i.id} ×${i.count} 획득`,
          tone: def?.rarity === 'rare' || def?.rarity === 'epic' ? 'rare' : 'good',
        });
      }
      if (prog.leveledUp) {
        bus.emit('toast', { text: `레벨 업! Lv.${prog.to}`, tone: 'good' });
        const grew = grownText(state, prog.grown);
        if (grew) bus.emit('toast', { text: grew, tone: 'rare' });
      }
      if (prog.points.trait) {
        bus.emit('toast', { text: `특성 포인트 +${prog.points.trait}`, tone: 'rare' });
      }
      if (prog.points.skill) {
        bus.emit('toast', { text: `스킬 포인트 +${prog.points.skill}`, tone: 'rare' });
      }
      if (isBoss && result.winner === 'player') {
        bus.emit('toast', { text: `${monsterDefs[0].name} 격파!`, tone: 'rare' });
        // 타임어택 — 이 보스를 처음 눕힌 순간까지 걸린 시간을 올린다.
        submitTimeAttack(state, monsterDefIds[0]);
        // 보스를 잡은 땅은 마을 웨이포인트 돌에 새겨진다.
        const wp = Waypoints.unlock(state, state.map.id);
        if (wp.unlocked) {
          summary.waypoint = wp.name;
          bus.emit('toast', {
            text: `웨이포인트 해금 — ${wp.name}\n마을 광장의 돌에서 곧장 올 수 있다.`,
            tone: 'rare',
          });
        }
      }
    }

    // 서쪽 절벽의 용 — 못 잡았어도 깎아 둔 만큼은 남는다.
    const timed = TimedBoss.timedBossOf(state.map);
    const dragon = timed && state.monsters.find((m) => m.timedBoss);
    if (timed && dragon && pendingBattle.monsterUids.includes(dragon.uid)) {
      const left = Math.max(0, result.monstersHp[0] ?? 0);
      const dealt = Math.max(0, (dragon.carriedHp || 0) - left);
      state.timedBoss = TimedBoss.afterBattle(state, state.map, left);
      // 서버가 체력을 들고 있으면 "이만큼 깎았다"만 알린다.
      // 남은 체력을 그대로 보내면, 그 사이 남이 때린 만큼이 되살아난다.
      reportDragonDamage(dealt);
      if (left > 0) {
        // 비율은 "온전한 몸" 대비로 적는다 — 지난 판에 깎아 둔 몸 대비로 적으면
        // 매번 90% 라고 나와서 얼마나 눕혔는지 알 수가 없다.
        const full = Math.max(1, computeMonsterStats(db.monsters[timed.monster]).hp * (state.map.power || 1));
        summary.note = `고룡의 숨이 아직 붙어 있다 — 남은 체력 ${Math.round((left / full) * 100)}%`;
        dragon.carriedHp = left;
        showDragonHud(state, state.map, dragon);
      } else {
        // 눕었다 — 자리를 비우고 상태 줄을 바꾼다.
        state.monsters = state.monsters.filter((m) => m !== dragon);
        showDragonGone(state, state.map, TimedBoss.evaluate(state, state.map).nextAt, '이번 마리는 눕었다');
      }
    }

    // 상처가 남는 보스 — 못 눕혔어도 깎아 둔 만큼은 남는다.
    let woundedBoss = null;
    if (state.map.bossKeepHp) {
      const idx = pendingBattle.monsterUids.findIndex((uid) => {
        const a = state.monsters.find((m) => m.uid === uid);
        return a && a.isBoss;
      });
      if (idx >= 0) {
        const uid = pendingBattle.monsterUids[idx];
        const left = Math.max(0, result.monstersHp[idx] ?? 0);
        state.bossWounds = state.bossWounds || {};
        if (left > 0) {
          state.bossWounds[uid] = left;
          woundedBoss = uid;
          const full = pendingBattle.monsterCombatants[idx].maxHp || 1;
          summary.note = `아직 숨이 붙어 있다 — 남은 체력 ${Math.round((left / full) * 100)}%`;
        } else {
          // 눕었다 — 상처 기록을 지운다. 한 시간 뒤에 온전한 몸으로 다시 선다.
          delete state.bossWounds[uid];
        }
      }
    }

    if (result.winner === 'monster') {
      // 시각 보스에게 진 것은 값을 치르지 않는다.
      // 열 번 붙어야 눕는 상대인데 질 때마다 골드를 뜯기면 도전 자체가 손해가 된다.
      // 상처가 남는 보스도 마찬가지다 — 몇 번이고 붙어야 눕는 상대에게
      // 질 때마다 골드를 뜯기면 도전 자체가 손해가 되어 아무도 안 간다.
      const free = (timed && timed.noPenalty && dragon
        && pendingBattle.monsterUids.includes(dragon.uid)) || !!woundedBoss;
      if (free) {
        const stats = computePlayerStats(state);
        state.player.hp = Math.max(1, Math.floor(stats.hp * 0.5));
        summary.win = false;
        summary.note = `${summary.note ? summary.note + '\n' : ''}쓰러졌지만 잃은 것은 없다. 마을에서 눈을 떴다.`;
        const back = (timed && timed.reviveAt) || state.map.reviveAt
          || { map: 'poino', x: 20, y: 17 };
        // 결과창을 닫은 뒤 마을로 옮긴다(전투 화면 위에서 맵을 갈면 그림이 엉킨다).
        reviveTo = back;
      } else {
        const rev = Progression.reviveAfterDefeat(state);
        summary.win = false;
        summary.note = `쓰러졌다... 골드 ${rev.lostGold}을(를) 잃고 겨우 정신을 차렸다.`;
      }
      encounter.startCooldown(2400);
      bus.emit('toast', { text: '패배했다...', tone: 'bad' });
    } else if (result.winner !== 'player') {
      summary.draw = true;
      summary.note = '승부가 나지 않았다. 장비를 강화해 보자.';
    }

    Progression.clampHp(state);
    store.notify();
    scheduleSave();

    awaitingConfirm = true;
    bus.emit('battle:result', summary);
  });

  const closeBattle = () => {
    if (!awaitingConfirm) return;
    awaitingConfirm = false;
    pendingBattle = null;
    bus.emit('battle:close');
    if (scenes.current === battleScene) scenes.pop();
    // 값을 치르지 않는 부활 — 결과창을 닫은 뒤에 마을로 옮긴다.
    // 전투 화면 위에서 맵을 갈면 지우다 만 그림이 남는다.
    if (reviveTo) {
      const to = reviveTo;
      reviveTo = null;
      changeMap(to.map, to.x, to.y);
      bus.emit('toast', { text: '마을에서 눈을 떴다.', tone: 'info' });
    }
  };

  bus.on('battle:confirm', closeBattle);
  bus.on('battle:skip', () => battleScene.skipToEnd());
  bus.on('battle:start', () => hud.setVisible(false));
  bus.on('battle:close', () => hud.setVisible(true));

  // ===================== 소모품 · 단축키 =====================
  let quickCooldown = 0;
  let quickCooldownMax = BALANCE.QUICKSLOT_BATTLE_COOLDOWN_MS;

  const inBattle = () => scenes.current === battleScene && !awaitingConfirm && !battleScene.finished;

  /**
   * 소모품 하나를 쓴다. 전투 중이면 남은 전투를 새 HP로 다시 계산해 이어 붙인다.
   * @returns {boolean} 실제로 썼는지
   */
  function useConsumable(itemId) {
    const state = store.state;
    const def = state.db.items[itemId];
    if (!def || !def.use) return false;
    if (Inventory.countOf(state, itemId) <= 0) {
      bus.emit('toast', { text: `${def.name}이(가) 없다.`, tone: 'bad' });
      return false;
    }

    // 전투 중에는 사람이 물약을 쓰지 않는다.
    // 예전에는 여기서 남은 전투를 다시 계산했는데, 이미 쓰러진 뒤에 눌러도 계산이 이어져
    // "진 전투가 다시 살아나는" 문제가 있었다. 이제 회복은 전투 계산 안에서만 일어난다.
    if (inBattle() || awaitingConfirm) {
      const pct = Math.round(Settings.autoPotionThreshold(state.settings) * 100);
      bus.emit('toast', {
        text: `전투 중에는 HP ${pct}% 아래로 떨어지면 회복약을 알아서 마신다. (설정에서 기준 변경)`,
        tone: 'info',
      });
      return false;
    }

    if (quickCooldown > 0) {
      bus.emit('toast', { text: `아직 쓸 수 없다 (${(quickCooldown / 1000).toFixed(1)}초)`, tone: 'bad' });
      return false;
    }

    const stats = computePlayerStats(state);
    // 필드에서 마시는 회복약도 직업 패시브(용사=2배)를 그대로 받는다.
    const potionPower = (Skills.classDef(state).combat || {}).potionPower || 1;

    if (def.use.hp) {
      if (state.player.hp >= stats.hp) {
        bus.emit('toast', { text: 'HP가 이미 가득하다.', tone: 'info' });
        return false;
      }
      Inventory.removeItem(state, itemId, 1);
      const healed = Math.min(Math.round(def.use.hp * potionPower), stats.hp - state.player.hp);
      state.player.hp += healed;
      bus.emit('toast', {
        text: `${def.name} 사용 — HP +${healed}` + (potionPower > 1 ? ' (효과 2배)' : ''),
        tone: 'good',
      });
    }

    // 버프 물약
    if (def.use.buff) {
      if (!def.use.hp) Inventory.removeItem(state, itemId, 1);
      Buffs.addBuff(state, def.use.buff);
      bus.emit('toast', { text: `${def.name} 사용 — ${def.use.buff.name}`, tone: 'good' });
    }

    quickCooldownMax = BALANCE.QUICKSLOT_FIELD_COOLDOWN_MS;
    quickCooldown = quickCooldownMax;

    store.notify();
    scheduleSave();
    return true;
  }

  bus.on('ui:quickuse', ({ index }) => {
    const itemId = (store.state.quickSlots || [])[index];
    if (!itemId) {
      return bus.emit('toast', { text: `${index + 1}번 칸이 비어 있다. 소지품에서 지정하세요.`, tone: 'info' });
    }
    useConsumable(itemId);
  });

  bus.on('ui:quickassign', ({ index, itemId }) => {
    const state = store.state;
    if (!state.db.items[itemId]?.use) return;
    // 이미 다른 칸에 있으면 비운다(중복 방지)
    state.quickSlots = state.quickSlots.map((id) => (id === itemId ? null : id));
    state.quickSlots[index] = itemId;
    store.notify();
    scheduleSave();
    bus.emit('toast', { text: `${state.db.items[itemId].name} → ${index + 1}번 칸`, tone: 'good' });
  });

  bus.on('ui:quickclear', ({ index }) => {
    store.state.quickSlots[index] = null;
    store.notify();
    scheduleSave();
  });

  bus.on('ui:use', ({ uid }) => {
    const inst = Inventory.getInstance(store.state, uid);
    if (inst) useConsumable(inst.id);
  });

  // ===================== 인벤토리 / 장비 / 강화 =====================
  bus.on('ui:equip', ({ uid, slot = null }) => {
    const state = store.state;
    const res = Equipment.equip(state, uid, slot);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
    bus.emit('toast', { text: '장착했다. 겉모습이 바뀌었다.', tone: 'good' });
  });

  bus.on('ui:unequip', ({ slot }) => {
    const state = store.state;
    const res = Equipment.unequip(state, slot);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
  });

  bus.on('ui:enhance', ({ uid }) => {
    const state = store.state;
    // 대장간에서만 강화할 수 있다.
    if (!inventoryPanel.open || inventoryPanel.mode !== 'forge') {
      return bus.emit('toast', { text: '강화는 마을 대장간에서만 할 수 있다.', tone: 'bad' });
    }

    const check = Equipment.canEnhance(state, uid);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });
    if (state.player.gold < check.gold) {
      return bus.emit('toast', { text: '골드가 부족하다.', tone: 'bad' });
    }
    if (Inventory.countOf(state, check.material.id) < check.material.count) {
      const matName = state.db.items[check.material.id]?.name || check.material.id;
      return bus.emit('toast', { text: `${matName}이(가) 부족하다.`, tone: 'bad' });
    }

    state.player.gold -= check.gold;
    Inventory.removeItem(state, check.material.id, check.material.count);

    const res = Equipment.applyEnhance(state, uid, rng);
    Progression.clampHp(state);
    store.notify();
    scheduleSave();

    if (!res.success) {
      if (sound) sound.sfx('break');
      return bus.emit('toast', { text: '강화 실패...', tone: 'bad' });
    }

    if (sound) sound.sfx('enhance');
    bus.emit('toast', { text: `강화 성공! +${res.level}`, tone: 'good' });
    // +7~+9 에서 굴린 옵션은 아이템마다 다르다 — 무엇이 떴는지 꼭 알려 준다.
    if (res.affix) {
      bus.emit('toast', { text: `무작위 옵션 — ${res.affix.text}`, tone: 'rare' });
    }
    if (res.sockets > 0 && res.level === BALANCE.ENHANCE_MAX) {
      bus.emit('toast', {
        text: `보석 홈 ${res.sockets}개가 열렸다.\n지하감옥에서 나오는 보석을 박을 수 있다.`,
        tone: 'rare',
      });
    }
  });

  // 초월 강화 — 마녀만 걸어 준다. +10 부터 +15 까지, 값은 용의 징표.
  //
  // 실패해도 부서지지 않고 한 단계 내려간다. 그래서 "질러 보는" 강화가 아니라
  // 징표를 꾸준히 모아 조금씩 올리는 강화가 된다.
  bus.on('ui:transcend', ({ uid }) => {
    const state = store.state;
    if (!inventoryPanel.open || inventoryPanel.mode !== 'transcend') {
      return bus.emit('toast', { text: '초월 강화는 성 안 왕실 대장간에서만 걸 수 있다.', tone: 'bad' });
    }
    const check = Equipment.canTranscend(state, uid);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });

    const mat = check.material;
    if (Inventory.countOf(state, mat.id) < mat.count) {
      const name = state.db.items[mat.id]?.name || mat.id;
      return bus.emit('toast', { text: `${name}이(가) 부족하다. (${mat.count}개 필요)`, tone: 'bad' });
    }
    Inventory.removeItem(state, mat.id, mat.count);

    const res = Equipment.applyTranscend(state, uid, rng);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });

    Progression.clampHp(state);
    store.notify();
    scheduleSave();

    if (res.success) {
      // +15 는 이 게임에서 갈 수 있는 끝이다. 거기 닿은 순간은 크게 알린다.
      const top = res.level >= BALANCE.TRANSCEND_MAX;
      if (top) bus.emit('fx:flash', { tone: 'great' });
      bus.emit('toast', {
        text: top
          ? `✦ +${BALANCE.TRANSCEND_MAX} ✦\n더 오를 곳이 없다 — 이 물건은 여기가 끝이다.`
          : `초월 성공 — +${res.from} → +${res.level}`,
        tone: top ? 'rare' : 'good',
      });
    } else {
      bus.emit('toast', {
        text: `불꽃이 사그라들었다... +${res.from} 그대로다. 내려가지는 않았다.`,
        tone: 'bad',
      });
    }
  });

  // 옵션 다시 굴리기 — 마음에 안 드는 자리 하나만 다시 굴린다.
  // 강화 단계는 그대로다. 값이 비싼 대신 떨어질 위험이 없다.
  bus.on('ui:reroll', ({ uid, index }) => {
    const state = store.state;
    if (!inventoryPanel.open || inventoryPanel.mode !== 'forge') {
      return bus.emit('toast', { text: '옵션 다시 굴리기는 마을 대장간에서만 할 수 있다.', tone: 'bad' });
    }
    const check = Affix.canReroll(state, uid, index);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });

    const inst = state.inventory.find((i) => i.uid === uid);
    const def = state.db.items[inst.id];
    const cost = rerollCost(index);
    const mat = enhanceMaterial(inst.enhance || 0, def.rarity || 'common');
    const need = BALANCE.REROLL_MATERIAL_COUNT;
    if (state.player.gold < cost) {
      return bus.emit('toast', { text: `골드가 부족하다. (🪙 ${cost} 필요)`, tone: 'bad' });
    }
    if (Inventory.countOf(state, mat.id) < need) {
      const matName = state.db.items[mat.id]?.name || mat.id;
      return bus.emit('toast', { text: `${matName}이(가) 부족하다. (${need}개 필요)`, tone: 'bad' });
    }

    state.player.gold -= cost;
    Inventory.removeItem(state, mat.id, need);

    const res = Affix.rerollAffix(state, uid, index, rng);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });

    Progression.clampHp(state);
    store.notify();
    scheduleSave();

    // 무엇이 무엇으로 바뀌었는지 한 줄로 보여 준다 — 굴린 보람이 보여야 한다.
    const tone = res.better === true ? 'rare' : res.better === false ? 'bad' : 'good';
    bus.emit('toast', { text: `${res.before.text} → ${res.after.text}`, tone });
  });

  // 보석 박기 — 소지품에서 보석 하나를 덜어 내고 장비 홈에 넣는다.
  bus.on('ui:socket', ({ uid, gemId }) => {
    const state = store.state;
    const res = Affix.socketGem(state, uid, gemId);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Inventory.removeItem(state, gemId, 1);
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
    const nm = res.gem.name;
    const last = nm.charCodeAt(nm.length - 1);
    const j = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 ? '을' : '를';

    // 변신 — 마지막 보석이 들어가면 그 자리에서 다른 물건이 된다.
    // 한 줄로 흘려보내지 않는다. 10만 골드와 보석 둘을 치른 순간이므로 크게 말한다.
    if (res.became) {
      bus.emit('toast', {
        text: `${nm}${j} 박는 순간, ${res.became.from.name}이(가) ${res.became.to.name}으로 깨어났다.`,
        tone: 'rare',
      });
      return;
    }
    // 아직 남았으면 다음에 무엇을 박아야 하는지 알려 준다.
    if (res.next) {
      const wantName = (Affix.gemDef(state.db, res.next) || {}).name || res.next;
      bus.emit('toast', { text: `${nm}${j} 박았다. 다음은 ${wantName}.`, tone: 'rare' });
      return;
    }
    bus.emit('toast', { text: `${nm}${j} 박았다.`, tone: 'rare' });
  });


  // 홈 뚫기 — 송곳 하나를 써서 두 번째 보석 홈을 만든다.
  bus.on('ui:drill', ({ uid }) => {
    const state = store.state;
    const res = Affix.drillSocket(state, uid);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Inventory.removeItem(state, Affix.DRILL_ITEM, 1);
    store.notify();
    scheduleSave();
    bus.emit('toast', { text: `홈을 하나 더 뚫었다. (홈 ${res.sockets}개)`, tone: 'rare' });
  });

  // ===================== 우편 · 랭킹 · 고룡 =====================
  //
  // 셋 다 서버가 들고 있는 것이다. 혼자 하는 중이면 조용히 비어 있다 —
  // 없는 기능이지 고장이 아니므로, 실패해도 붉은 글씨를 띄우지 않는다.

  const online = () => storage.isServer;

  async function refreshMail({ quiet = false } = {}) {
    const state = store.state;
    if (!online()) {
      state.mail = { list: [], loading: false, offline: true };
      return store.notify();
    }
    state.mail = { ...state.mail, loading: true, offline: false };
    store.notify();
    try {
      const res = await storage.mail(account.id, account.token);
      state.mail = { list: res.mail || [], loading: false, offline: false };
      store.notify();
      // 새로 온 것이 있으면 알려 준다 — 봉투에 숫자만 붙으면 눈치채지 못한다.
      const unread = state.mail.list.filter((m) => !m.taken).length;
      if (!quiet && unread > 0) {
        bus.emit('toast', { text: `우편함에 안 받은 편지가 ${unread}통 있다.`, tone: 'info' });
      }
    } catch (err) {
      state.mail = { ...state.mail, loading: false };
      store.notify();
      if (!quiet) bus.emit('toast', { text: `우편을 받아 오지 못했다 — ${err.message}`, tone: 'bad' });
    }
  }

  bus.on('ui:mail', () => (mailPanel.open ? mailPanel.close() : mailPanel.show()));
  bus.on('ui:mail-refresh', () => refreshMail({ quiet: true }));

  bus.on('ui:mail-claim', async ({ mid }) => {
    const state = store.state;
    if (!online()) return bus.emit('toast', { text: '우편은 서버에 접속했을 때만 받을 수 있다.', tone: 'bad' });
    try {
      // 서버가 먼저 "받음"으로 바꾼다. 소지품에 넣고 나서 표시하면
      // 넣는 도중에 끊겼을 때 같은 편지를 두 번 받을 수 있다.
      const res = await storage.claimMail(account.id, account.token, mid);
      const got = [];
      for (const it of res.mail.items || []) {
        if (!state.db.items[it.id]) continue;
        Inventory.addItem(state, it.id, it.count);
        got.push(`${state.db.items[it.id].name} ×${it.count}`);
      }
      // 경험치·골드도 우편으로 온다(고룡은 바닥에 아무것도 흘리지 않으므로).
      if (res.mail.gold > 0) {
        state.player.gold += res.mail.gold;
        got.push(`🪙 ${res.mail.gold.toLocaleString()}`);
      }
      let prog = null;
      if (res.mail.exp > 0) {
        prog = Progression.gainExp(state, res.mail.exp);
        got.push(`경험치 ${res.mail.exp.toLocaleString()}`);
      }
      const box = state.mail.list.find((m) => m.mid === mid);
      if (box) box.taken = true;
      Progression.clampHp(state);
      store.notify();
      scheduleSave();
      bus.emit('toast', {
        text: got.length ? `우편을 받았다 — ${got.join(', ')}` : '우편을 받았다.',
        tone: 'rare',
      });
      if (prog && prog.leveledUp) {
        bus.emit('toast', { text: `레벨 업! Lv.${state.player.level}`, tone: 'rare' });
        const grew = grownText(state, prog.grown);
        if (grew) bus.emit('toast', { text: grew, tone: 'rare' });
      }
    } catch (err) {
      bus.emit('toast', { text: err.message, tone: 'bad' });
      refreshMail({ quiet: true });
    }
  });

  bus.on('ui:mail-delete', async ({ mid }) => {
    const state = store.state;
    state.mail.list = state.mail.list.filter((m) => m.mid !== mid);
    store.notify();
    if (online()) storage.deleteMail(account.id, account.token, mid).catch(() => {});
  });

  async function refreshRanks() {
    const state = store.state;
    if (!online()) {
      state.ranks = {
        table: {}, mine: {}, total: {},
        prev: { table: {}, mine: {}, total: {} }, season: null,
        loading: false, offline: true,
      };
      return store.notify();
    }
    state.ranks = { ...state.ranks, loading: true, offline: false };
    store.notify();
    try {
      // 내 자리도 함께 받아 온다 — 5위 밖이면 표에는 안 나오지만 아래 줄에 뜬다.
      const res = await storage.ranks(account.id, account.token);
      state.ranks = {
        table: res.rank || {},
        mine: res.mine || {},
        total: res.total || {},
        // 지난 시즌 표 — 초기화하면 지금 표가 그대로 이리로 넘어온다.
        prev: res.prev || { table: {}, mine: {}, total: {} },
        season: res.season || null,
        loading: false,
        offline: false,
      };
    } catch {
      state.ranks = { ...state.ranks, loading: false };
    }
    store.notify();
  }

  bus.on('ui:rank', () => (rankPanel.open ? rankPanel.close() : rankPanel.show()));
  bus.on('ui:rank-refresh', () => refreshRanks());

  // ===================== 운영자 창 =====================
  //
  // 열쇠(ADMIN_KEY)는 이쪽으로 내려오지 않는다. 보내는 것은 내 세션 토큰뿐이고,
  // "이 토큰이 운영자의 것인가"는 서버만 판단한다(server.js 의 adminOnly).
  // 그래서 여기 코드를 읽어도 아무 권한이 생기지 않는다.
  let isAdmin = false;

  async function checkAdmin() {
    if (!online()) return;
    try {
      const res = await storage.adminMe(account.id, account.token);
      isAdmin = !!(res && res.admin);
      hud.setAdmin(isAdmin);
      if (isAdmin) applyAdminLook();
    } catch {
      isAdmin = false;
    }
  }

  /**
   * 운영자의 모습으로 갈아입힌다.
   *
   * 직업 스프라이트 대신 '빛의 심판관'을 쓰고, 장비를 얹지 않는다(rawSprite).
   * 그리고 **기본은 투명**이다 — 운영자가 마을에 서 있으면 그것만으로
   * 사람들이 몰려들거나 말을 걸어서, 보러 온 사람이 볼 수가 없어진다.
   */
  function applyAdminLook() {
    const p = store.state.player;
    p.sprite = 'chr_admin_field';
    p.battleSprite = 'chr_admin_battle';
    p.rawSprite = true;
    if (p.hidden === undefined) p.hidden = true;
    adminPanel.setHidden(p.hidden);
    store.notify();
  }

  bus.on('admin:toggle-hidden', () => {
    const p = store.state.player;
    p.hidden = !p.hidden;
    adminPanel.setHidden(p.hidden);
    store.notify();
    bus.emit('toast', {
      text: p.hidden ? '투명해졌습니다 — 남에게 보이지 않습니다.' : '모습을 드러냈습니다.',
      tone: 'info',
    });
  });

  bus.on('ui:admin', () => {
    if (!isAdmin) return bus.emit('toast', { text: '운영자만 열 수 있습니다.', tone: 'bad' });
    adminPanel.open ? adminPanel.close() : adminPanel.show();
  });

  bus.on('admin:accounts', async () => {
    try {
      const res = await storage.adminAccounts(account.id, account.token);
      adminPanel.setAccounts((res && res.accounts) || []);
    } catch (err) {
      adminPanel.setAccounts([]);
      adminPanel.setStatus(err.message || '계정 목록을 받지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:send-mail', async (mail) => {
    try {
      const res = await storage.adminMail(account.id, account.token, mail);
      if (!res || !res.ok) throw new Error((res && res.error) || '보내지 못했습니다.');
      const n = (mail.items || []).length;
      const who =
        res.mode === 'some'
          ? `${res.sent.length}명에게` +
            (res.missing && res.missing.length ? ` (못 찾음: ${res.missing.join(', ')})` : '')
          : '전 유저에게';
      adminPanel.setStatus(
        `${who} 보냈습니다 — "${mail.subject}"${n ? ` · 아이템 ${n}종` : ''}` +
          `${mail.days ? ` · ${mail.days}일 뒤 사라짐` : ' · 안 사라짐'}`,
        'good'
      );
      adminPanel.clearMail();
      bus.emit('toast', { text: `${who} 우편을 보냈습니다.`, tone: 'good' });
      // 나에게도 바로 들어오는지 확인할 수 있게 우편함을 한 번 새로 받는다.
      refreshMail();
    } catch (err) {
      adminPanel.setStatus(err.message || '보내지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:rank-reset', async ({ boss }) => {
    try {
      const res = await storage.adminRankReset(account.id, account.token, boss || null);
      if (!res || !res.ok) throw new Error((res && res.error) || '초기화하지 못했습니다.');
      adminPanel.setStatus(
        boss
          ? `표 하나를 지웠습니다 (${res.cleared.join(', ') || '없음'}).`
          : `시즌을 넘겼습니다 — ${res.cleared.length}개 표가 지난 시즌으로 옮겨졌습니다.`,
        'good'
      );
      refreshRanks();
    } catch (err) {
      adminPanel.setStatus(err.message || '초기화하지 못했습니다.', 'bad');
    }
  });

  // 고른 계정 지우기 (0.46).
  bus.on('admin:account-delete', async ({ ids }) => {
    try {
      const res = await storage.adminAccountDelete(account.id, account.token, ids);
      if (!res || !res.ok) throw new Error((res && res.error) || '지우지 못했습니다.');
      const gone = (res.deleted || []).map((d) => d.id);
      const fail = res.failed || [];
      adminPanel.delIds.clear();
      // 목록을 다시 받아 온다 — 안 그러면 지운 사람이 화면에 그대로 남아 있다.
      adminPanel.setAccounts(null);
      bus.emit('admin:accounts');
      adminPanel.setStatus(
        `${gone.length}개 계정을 지웠습니다${gone.length ? ` — ${gone.slice(0, 8).join(', ')}` : ''}`
        + (fail.length ? `\n못 지운 것 ${fail.length}개 — ${fail.map((f) => `${f.id}(${f.reason})`).join(', ')}` : ''),
        fail.length ? 'bad' : 'good'
      );
    } catch (err) {
      adminPanel.setStatus(err.message || '지우지 못했습니다.', 'bad');
    }
  });

  // 여태 보낸 우편 모두 지우기 (0.45).
  bus.on('admin:mail-clear', async () => {
    try {
      const res = await storage.adminMailClear(account.id, account.token);
      if (!res || !res.ok) throw new Error((res && res.error) || '지우지 못했습니다.');
      adminPanel.setStatus(
        `우편을 전부 지웠습니다 — ${res.accounts}명의 우편함 ${res.mails}통`
        + (res.events ? ` · 배달 대기 ${res.events}건` : ''),
        'good'
      );
      // 내 우편함도 비었다. 안 다시 읽으면 지워진 우편이 화면에 남아 있다.
      refreshMail();
    } catch (err) {
      adminPanel.setStatus(err.message || '지우지 못했습니다.', 'bad');
    }
  });

  // 시즌 고정 — 켜 두면 어떤 초기화도 시즌을 안 넘긴다 (0.45).
  bus.on('admin:season-lock', async ({ locked }) => {
    try {
      const res = await storage.adminSeasonLock(account.id, account.token, locked);
      if (!res || !res.ok) throw new Error((res && res.error) || '바꾸지 못했습니다.');
      adminPanel.setStatus(
        res.locked
          ? `시즌을 고정했습니다 — 초기화해도 ${res.season} 시즌 그대로입니다.`
          : '시즌 고정을 껐습니다 — 이제 전체 초기화가 시즌을 넘깁니다.',
        'good'
      );
      refreshRanks();
    } catch (err) {
      adminPanel.setStatus(err.message || '바꾸지 못했습니다.', 'bad');
      refreshRanks(); // 체크 표시를 서버가 아는 값으로 되돌린다
    }
  });

  // 시즌 번호 되돌리기 — 기록과 세이브는 안 지운다. 번호와 '지난 시즌' 만 되돌린다.
  bus.on('admin:season-set', async ({ season }) => {
    try {
      const res = await storage.adminSeasonSet(account.id, account.token, season);
      if (!res || !res.ok) throw new Error((res && res.error) || '되돌리지 못했습니다.');
      adminPanel.setStatus(
        `${res.from} 시즌 → ${res.season} 시즌으로 되돌렸습니다.`
        + (res.notices ? ` 못 본 알림 ${res.notices}개도 치웠습니다.` : '')
        + ' 기록과 세이브는 그대로입니다.',
        'good'
      );
      refreshRanks();
    } catch (err) {
      adminPanel.setStatus(err.message || '되돌리지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:season-reset', async ({ gift = false } = {}) => {
    try {
      const res = await storage.adminSeasonReset(account.id, account.token);
      if (!res || !res.ok) throw new Error((res && res.error) || '초기화하지 못했습니다.');

      // 0.42 — 초기화한 그 자리에서 선물까지. 화면을 덮기 **전에** 보낸다:
      // 아래에서 곧 새로고침이 걸리므로, 여기서 안 보내면 영영 못 보낸다.
      let giftNote = '';
      if (gift) {
        try {
          const g = await storage.adminMail(account.id, account.token, { ...SEASON_GIFT, to: [] });
          giftNote = g && g.ok ? ' · 시작 선물도 보냈습니다' : ' · ⚠ 선물은 못 보냈습니다';
        } catch {
          giftNote = ' · ⚠ 선물은 못 보냈습니다';
        }
      }

      const line = res.locked
        ? `${res.season} 시즌이 다시 시작되었습니다`
        : '다음 시즌이 시작되었습니다';
      adminPanel.setStatus(
        `${res.accounts}명을 처음으로 되돌렸습니다 — ${line}.${giftNote}`,
        'good'
      );
      // 운영자 자신도 초기화 대상이다. 방송은 남에게만 가므로 여기서 직접 건다.
      savingStopped = true;
      clearTimeout(saveTimer);
      showSeasonVeil(line);
    } catch (err) {
      adminPanel.setStatus(err.message || '초기화하지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:season-gift', async () => {
    try {
      // 전 유저에게 — to 를 비워 두면 서버가 '이벤트' 로 넣어 두었다가
      // 각자 접속할 때 우편함으로 옮겨 준다. 지금 안 켜 둔 사람에게도 도착한다.
      const res = await storage.adminMail(account.id, account.token, { ...SEASON_GIFT, to: [] });
      if (!res || !res.ok) throw new Error((res && res.error) || '보내지 못했습니다.');
      adminPanel.setStatus(
        `시즌 시작 선물을 전 유저에게 보냈습니다 — "${SEASON_GIFT.subject}"`,
        'good'
      );
      bus.emit('toast', { text: '시즌 시작 선물을 보냈습니다.', tone: 'good' });
      refreshMail();
    } catch (err) {
      adminPanel.setStatus(err.message || '보내지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:sheet-info', async () => {
    try {
      const res = await storage.adminSheetInfo(account.id, account.token);
      if (res && res.ok) adminPanel.setSheetInfo(res);
    } catch { /* 못 물어봐도 나머지 기능은 그대로 쓴다 */ }
  });

  bus.on('admin:sheet-set', async ({ url }) => {
    try {
      const res = await storage.adminSheetSet(account.id, account.token, url);
      if (!res || !res.ok) throw new Error((res && res.error) || '바꾸지 못했습니다.');
      adminPanel.setSheetInfo(res);
      adminPanel.setStatus(
        res.id ? `이 문서를 봅니다 — ${res.id}` : '원래대로 되돌렸습니다.',
        'good'
      );
    } catch (err) {
      adminPanel.setStatus(err.message || '바꾸지 못했습니다.', 'bad');
    }
  });

  bus.on('admin:sheet-pull', async () => {
    try {
      const res = await storage.adminSheetPull(account.id, account.token);
      if (!res || !res.ok) throw new Error((res && res.error) || '읽지 못했습니다.');
      adminPanel.setStatus(
        res.message || `반영했습니다 — v${res.version} · ${(res.changed || []).join(', ')}`,
        'good'
      );
    } catch (err) {
      adminPanel.setStatus(err.message || '읽지 못했습니다.', 'bad');
    }
  });

  /**
   * 보스를 눕혔다고 서버에 알린다.
   *
   * ⚠ 걸린 시간은 여기서 재지 않는다. "잡았다"만 알리고 시간은 서버가 잰다 —
   *   게임이 잰 값을 그대로 올리면, 브라우저 콘솔 한 줄이면 1초 기록이 되는 표가 된다.
   *   처음 잡은 것만 세는 규칙도 서버가 지킨다(여기 기록은 화면 표시용일 뿐이다).
   */
  async function submitTimeAttack(state, monsterDefId) {
    if (!monsterDefId) return;
    if (!online()) return;
    try {
      const res = await storage.submitRank(account.id, account.token, monsterDefId);
      if (!res || !res.ok) return;

      // 서버가 준 시간을 그대로 화면에도 쓴다(두 곳의 숫자가 갈리지 않게).
      state.bossFirstKill = state.bossFirstKill || {};
      state.bossFirstKill[monsterDefId] = res.ms;
      scheduleSave();

      if (res.first && res.rank) {
        bus.emit('toast', {
          text: `타임어택 ${res.rank}위! — ${state.db.monsters[monsterDefId].name} ${timeText(res.ms)}`,
          tone: 'rare',
        });
      }
    } catch { /* 랭킹은 못 올려도 게임은 굴러간다 */ }
  }

  // ===================== 상점 · 교환 =====================
  /**
   * 방금 가방에 들어온 장비에 '각인'을 굴려 준다.
   *
   * 열에 하나꼴로 그 부위에 붙을 수 있는 옵션 한 줄을 더 갖고 나온다.
   * 바닥에서 주운 것이든 상점에서 산 것이든 규칙은 같다 —
   * 상점 물건만 늘 밋밋하면 사람들은 상점을 쳐다보지 않는다.
   *
   * 0.39 — **초월은 따로 알린다.** 예전에는 초월도 같은 연보라 알림 한 줄이라,
   * 열에 하나의 열에 하나(=백에 하나)로 나오는 물건이 지나가는 줄에 묻혔다.
   * 마법사가 각인 확률을 올리는 이유도 눈에 보여야 값어치가 산다.
   *
   * @param {Array} entries Inventory.addItem/addItems 가 돌려준 칸들
   * @param {function} r 난수(전리품은 전투 씨앗에서, 상점은 전역 난수에서)
   * @returns {Array<{id:string, name:string, text:string, perfect:boolean}>} 각인이 붙은 것들
   */
  function engraveNew(entries, r) {
    const state = store.state;
    // 마법사 패시브는 이 확률을 10% → 20% 로 올린다(지능 1점마다 0.2%p 더).
    const bonus = computePlayerStats(state).mods.engraveBonus || 0;
    const made = [];
    for (const inst of entries || []) {
      if (!inst || inst.bonus) continue;
      const def = state.db.items[inst.id];
      if (!def || !def.slot) continue; // 장비만
      const rolled = Affix.rollBonusAffix(state.db, def, r, bonus);
      if (!rolled) continue;
      inst.bonus = rolled;
      const d = Affix.describe(state.db, def, rolled);
      const perfect = !!rolled.p;
      made.push({ id: inst.id, uid: inst.uid, name: def.name, text: d.text, perfect });
      bus.emit('toast', perfect
        // 붉은 알림에 조금 더 오래 머문다 — 이건 그냥 지나가면 안 되는 물건이다.
        ? { text: `✦✦ 초월 각인! ${def.name} — ${d.text} (최대치)`, tone: 'perfect', ms: 4200 }
        : { text: `✦ 각인된 ${def.name} — ${d.text}`, tone: 'rare' });
    }
    return made;
  }

  /**
   * 지금 이 캐릭터의 '골드 획득 증가'.
   * 특성('골드 획득 증가')과 사냥꾼 패시브가 여기 한 곳에 모여 있고,
   * 몬스터가 떨구는 골드와 상점에 파는 값이 같은 값을 본다.
   */
  function goldFindOf(state) {
    return computePlayerStats(state).mods.goldFind || 0;
  }

  /**
   * 이번 레벨업에 오른 힘·민첩·지능을 한 줄로.
   *
   * 왜 필요한가: 이 셋은 이제 자동으로 자라는데, 자라는 장면이 아무 데도 안 보이면
   * "레벨업했는데 스탯이 안 올랐다" 로 보인다. 실제로 그런 신고가 있었다 —
   * 값은 오르고 있었고 말해 주는 사람이 없었을 뿐이다.
   */
  function grownText(state, grown) {
    const nodes = (state.db.stats && state.db.stats.nodes) || {};
    const parts = [];
    for (const [id, n] of Object.entries(grown || {})) {
      if (!n) continue;
      parts.push(`${(nodes[id] && nodes[id].name) || id} +${n}`);
    }
    return parts.join(' · ');
  }

  bus.on('ui:buy', ({ id, qty = 1 }) => {
    const state = store.state;
    const check = Shop.canBuy(state, id, qty);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });
    state.player.gold -= check.price;
    if (sound) sound.sfx('coin');
    engraveNew(Inventory.addItem(state, id, check.qty), rng);
    store.notify();
    scheduleSave();
    const name = state.db.items[id].name;
    bus.emit('toast', {
      text: check.qty > 1 ? `${name} ×${check.qty} 구매 — 🪙 ${check.price}` : `${name} 구매`,
      tone: 'good',
    });
  });

  /** 뭉치에서 몇 개를 덜어 낸다(다 덜면 칸 자체를 지운다). */
  function takeFromStack(state, uid, count) {
    const inst = Inventory.getInstance(state, uid);
    if (!inst) return;
    if ((inst.count || 1) > count) inst.count -= count;
    else Inventory.removeByUid(state, uid);
  }

  bus.on('ui:sell', ({ uid, qty = 1 }) => {
    const state = store.state;
    const equipped = Equipment.SLOTS.map((s) => state.player.equipment[s]).filter(Boolean);
    const check = Shop.canSell(state, uid, equipped, qty, goldFindOf(state));
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });
    if (sound) sound.sfx('coin');

    const inst = Inventory.getInstance(state, uid);
    const name = state.db.items[inst.id].name;
    takeFromStack(state, uid, check.qty);

    state.player.gold += check.price;
    store.notify();
    scheduleSave();
    bus.emit('toast', {
      text: `${name}${check.qty > 1 ? ` ×${check.qty}` : ''} 판매 — 🪙 ${check.price}`,
      tone: 'good',
    });
  });

  // 판매 탭에서 여러 개를 골라 한 번에 판다.
  bus.on('ui:sell-many', ({ picks }) => {
    const state = store.state;
    const equipped = Equipment.SLOTS.map((s) => state.player.equipment[s]).filter(Boolean);
    const quote = Shop.quoteSell(state, picks, equipped, goldFindOf(state));
    if (!quote.lines.length) {
      return bus.emit('toast', { text: '팔 것을 고르지 않았다.', tone: 'bad' });
    }

    // 계산이 끝난 뒤에 한 번에 덜어 낸다(중간에 목록이 바뀌지 않게).
    for (const line of quote.lines) takeFromStack(state, line.uid, line.qty);
    state.player.gold += quote.total;
    store.notify();
    scheduleSave();

    const head = quote.lines.length === 1 ? quote.lines[0].name : `${quote.lines[0].name} 외 ${quote.lines.length - 1}종`;
    bus.emit('toast', { text: `${head} ${quote.count}개 판매 — 🪙 ${quote.total}`, tone: 'good' });
    if (quote.blocked.length) {
      bus.emit('toast', { text: `${quote.blocked.length}개는 팔 수 없어 남겨 두었다.`, tone: 'info' });
    }
  });

  bus.on('ui:exchange', ({ index, all = false }) => {
    const state = store.state;
    // 교환표는 지금 열려 있는 창에서 가져온다.
    // 예전에는 "마지막으로 말을 건 NPC"에서 찾았는데, 창은 열려 있는데 그 값이
    // 바뀌거나 비어 있으면 버튼이 아무 반응도 하지 않았다(무엇이 잘못됐는지도 안 보인다).
    // 사람이 보고 있는 표가 곧 기준이다.
    const recipe =
      exchangePanel.recipes?.[index] || db.npcs[activeNpcId]?.recipes?.[index];
    const check = Exchange.canExchange(state, recipe);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });

    // '전부' 는 가진 재료로 할 수 있는 만큼. 아니면 한 번.
    const times = all ? Exchange.maxTimes(state, recipe) : 1;
    if (times <= 0) return;

    for (const g of recipe.give) Inventory.removeItem(state, g.id, g.count * times);
    const made = Inventory.addItem(state, recipe.get.id, recipe.get.count * times);

    // 전설 장비는 태어날 때 무작위 옵션 한 줄을 반드시 달고 나온다.
    // (각인처럼 열에 하나가 아니라 언제나 하나, 값도 그 자리에서 굴린다)
    for (const inst of made) {
      const def = state.db.items[inst.id];
      if (!def || def.rarity !== 'legendary' || inst.bonus) continue;
      const rolled = Affix.grantRandomBonus(state.db, def, rng);
      if (!rolled) continue;
      inst.bonus = rolled;
      const d = Affix.describe(state.db, def, rolled);
      bus.emit('toast', { text: `${def.name} — ${d.text}`, tone: 'rare' });
    }

    store.notify();
    scheduleSave();
    bus.emit('toast', {
      text:
        `${state.db.items[recipe.get.id].name} ×${recipe.get.count * times} 교환 완료` +
        (times > 1 ? ` (${times}번)` : ''),
      tone: 'good',
    });
  });

  // ===================== 특성 · 스킬 =====================
  bus.on('ui:trait', ({ id }) => {
    const state = store.state;
    const res = Skills.spendTrait(state, id);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
    bus.emit('toast', { text: `${state.db.traits.nodes[id].name} ${res.rank}단계`, tone: 'good' });
  });

  bus.on('ui:skill', ({ id }) => {
    const state = store.state;
    const res = Skills.learnSkill(state, id);
    if (!res.ok) return bus.emit('toast', { text: res.reason, tone: 'bad' });
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
    bus.emit('toast', { text: `${state.db.skills.tree[id].name} ${res.rank}단계 습득`, tone: 'rare' });
  });

  // 특성/스킬 초기화 — 비용 판정은 SkillSystem, 골드 차감은 여기서.
  bus.on('ui:reset', ({ kind }) => {
    const state = store.state;
    const check = Skills.canReset(state, kind);
    if (!check.ok) return bus.emit('toast', { text: check.reason, tone: 'bad' });

    state.player.gold -= check.gold;
    const res = Skills.applyReset(state, kind);
    Progression.clampHp(state);
    store.notify();
    scheduleSave();
    bus.emit('toast', {
      text: `${kind === 'trait' ? '특성' : '스킬'} 초기화 — ${res.points}포인트 반환 (🪙 ${check.gold})`,
      tone: 'good',
    });
  });

  bus.on('ui:character', () => characterPanel.toggle());
  bus.on('ui:inventory', () => {
    if (scenes.current === battleScene) return;
    inventoryPanel.open ? inventoryPanel.close() : inventoryPanel.show();
  });
  bus.on('ui:settings', () => settingsPanel.toggle());

  // ===================== 설정 =====================
  bus.on('ui:setting', ({ key, value }) => {
    const state = store.state;
    state.settings = Settings.withValue(state.settings, key, value);
    storage.saveSettings(state.settings);
    // 화면 방향은 고르는 즉시 보여야 한다. 저장만 하고 넘어가면
    // 창 크기를 한 번 건드릴 때까지 아무 일도 안 일어난다.
    if (key === 'orientation' && viewport) viewport.fit();
    // 음량·켜짐을 그 자리에서 반영한다(다음 소리를 기다리지 않게).
    if (sound) sound.refresh();
    store.notify();
  });

  // ---- 세이브 옮기기 (서버 없이 다른 컴퓨터로) ----
  bus.on('ui:save-export', ({ done }) => {
    const data = Account.serializeSave(store.state);
    const code = Account.encodeSave({ id: account.id, name: account.name, save: data });
    if (done) done(code);
  });

  bus.on('ui:save-import', ({ code, done }) => {
    const parsed = Account.decodeSave(code);
    if (!parsed.ok) return done && done(false, parsed.reason);

    try {
      const where = Account.applySave(store.state, parsed.save);
      Progression.backfillStats(store.state);
      Progression.reconcilePoints(store.state);
      changeMap(where.mapId, where.tx, where.ty);
      Progression.clampHp(store.state);
      store.notify();
      scheduleSave(0);
      settingsPanel.close();
      bus.emit('toast', {
        text: `${parsed.name || '세이브'} 를 불러왔습니다 (Lv.${parsed.save.level || 1})`,
        tone: 'rare',
      });
      if (done) done(true, '불러왔습니다.');
    } catch (err) {
      if (done) done(false, `불러오지 못했습니다 — ${err.message}`);
    }
  });

  bus.on('ui:settings-defaults', () => {
    store.state.settings = Settings.defaultSettings();
    storage.saveSettings(store.state.settings);
    if (sound) sound.refresh();
    store.notify();
    bus.emit('toast', { text: '설정을 기본값으로 되돌렸습니다.', tone: 'info' });
  });

  // ===================== 퀘스트 =====================
  bus.on('ui:quest-complete', ({ choice = null, id = null } = {}) => {
    const state = store.state;
    // id 가 오면 특별 의뢰다(게시판 차례와 상관없이 따로 열리는 줄).
    const quest = id ? Quests.questById(state, id) : Quests.currentQuest(state);
    const plan = Quests.completionPlan(state, quest, choice);
    if (!plan.ok) return bus.emit('toast', { text: `아직이다 — ${plan.reason}`, tone: 'bad' });

    for (const c of plan.consume) Inventory.removeItem(state, c.id, c.count);
    state.player.gold += plan.gold;
    // ⚠ 퀘스트 보상도 **상점에서 산 것과 똑같이** 태어나야 한다.
    //   예전에는 여기서 각인을 안 굴렸다. 그래서 같은 '용린 어깨갑옷'인데
    //   상점 것에는 각인이 붙고 퀘스트로 받은 것에는 안 붙어, 다른 물건처럼 보였다.
    if (plan.item) engraveNew(Inventory.addItem(state, plan.item.id, plan.item.count), rng);
    const prog = Progression.gainExp(state, plan.exp);

    const next = Quests.advance(state, quest);

    // 각 5단계 보스 퀘스트는 특성 포인트를 하나 더 준다.
    // 레벨만으로는 만렙까지 다섯 점뿐이라, 여섯 갈래 중 둘도 채우지 못한다 —
    // 보스를 넘는 일에 값을 붙여야 특성이 실제로 굴러간다.
    // (어느 퀘스트인지는 traits.json 의 questPoints 에 적혀 있다)
    let questTrait = 0;
    if ((state.db.traits.questPoints || []).includes(quest.id)) {
      questTrait = 1;
      state.player.traitPoints = (state.player.traitPoints || 0) + 1;
    }

    Progression.clampHp(state);
    store.notify();
    scheduleSave();

    if (sound) sound.sfx('quest');
    bus.emit('toast', { text: `[${quest.title}] 완료! +${plan.exp} EXP · 🪙 ${plan.gold}`, tone: 'rare' });
    if (questTrait) {
      bus.emit('toast', { text: `보스를 넘은 값 — 특성 포인트 +${questTrait}`, tone: 'rare' });
    }
    if (plan.item) {
      const def = state.db.items[plan.item.id];
      bus.emit('toast', { text: `${def.name} ×${plan.item.count} 획득`, tone: 'good' });
    }
    if (prog.leveledUp) {
      bus.emit('toast', { text: `레벨 업! Lv.${prog.to}`, tone: 'good' });
      const grew = grownText(state, prog.grown);
      if (grew) bus.emit('toast', { text: grew, tone: 'rare' });
    }
    if (prog.points.trait) bus.emit('toast', { text: `특성 포인트 +${prog.points.trait}`, tone: 'rare' });
    if (prog.points.skill) bus.emit('toast', { text: `스킬 포인트 +${prog.points.skill}`, tone: 'rare' });
    if (next) bus.emit('toast', { text: `다음 의뢰 — ${next.title}`, tone: 'info' });
    else bus.emit('toast', { text: '게시판의 의뢰를 모두 끝냈다.', tone: 'rare' });
  });

  bus.on('shop:opened', () => fieldScene.pause());
  bus.on('shop:closed', () => fieldScene.resume());
  bus.on('exchange:opened', () => fieldScene.pause());
  bus.on('exchange:closed', () => fieldScene.resume());
  bus.on('quest:opened', () => fieldScene.pause());
  bus.on('quest:closed', () => fieldScene.resume());
  bus.on('character:opened', () => fieldScene.pause());
  bus.on('character:closed', () => fieldScene.resume());
  bus.on('inventory:opened', () => fieldScene.pause());
  bus.on('inventory:closed', () => fieldScene.resume());
  bus.on('admin:opened', () => fieldScene.pause());
  bus.on('admin:closed', () => fieldScene.resume());

  bus.on('buff:expired', (ids) => {
    for (const id of ids) bus.emit('toast', { text: '효과가 끝났다.', tone: 'info' });
  });

  // ===================== 멀티플레이 =====================
  const wsUrl = storage.isServer
    ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
    : null;
  net.connect(
    { id: `${account.id}@${Math.random().toString(36).slice(2, 7)}`, name: account.name },
    { wsUrl }
  );

  bus.on('net:kill', ({ map, uid }) => {
    const state = store.state;
    if (state.map.id !== map) return;
    const monster = state.monsters.find((m) => m.uid === uid);
    if (!monster || !monster.alive) return;
    monster.alive = false;
    monster.respawnTimer = monster.respawnMs ?? state.map.respawnMs;
  });

  bus.on('net:respawn', ({ map, uid, tx, ty }) => {
    const state = store.state;
    if (state.map.id !== map) return;
    const monster = state.monsters.find((m) => m.uid === uid);
    if (!monster || monster.alive) return;
    monster.tx = monster.fromTx = tx;
    monster.ty = monster.fromTy = ty;
    monster.alive = true;
    monster.moving = false;
    monster.stepT = 0;
    syncPixel(monster);
  });

  bus.on('field:respawned', ({ uid, tx, ty }) => {
    net.reportRespawn(store.state.map.id, uid, tx, ty);
  });

  // ── 막혔을 때 빠져나오는 길 (HUD 의 ? → '막혔을 때') ──────────
  //
  // 마을에서 이따금 발이 안 떨어진다는 이야기가 있었다. 원인은 하나가 아니다 —
  // 창을 여닫는 짝(pause/resume)이 어긋나거나, 대화가 닫히면서 알림이 빠지거나,
  // 시전(마을 귀환) 이 중간에 멈춰 있으면 조작이 꺼진 채로 남는다.
  // 그래서 **원인마다 고치는 대신, 언제든 되살릴 수 있는 손잡이**를 만들어 둔다.
  function unstick({ quiet = false } = {}) {
    cancelCast();
    awaitingConfirm = false;
    // 열려 있는 창을 전부 닫는다 — 안 보이는데 열려 있는 창이 원인일 수 있다.
    for (const panel of Object.values({
      inventoryPanel, shopPanel, exchangePanel, characterPanel, questPanel,
      settingsPanel, waypointPanel, mailPanel, rankPanel, adminPanel,
    })) {
      if (panel && panel.open && panel.close) panel.close();
    }
    if (dialogueBox.open && dialogueBox.close) dialogueBox.close();
    // 전투 화면에 갇혀 있으면 필드로 되돌린다.
    if (scenes.current !== fieldScene) scenes.replace(fieldScene);
    fieldScene.active = true;
    fieldScene.resume();
    input.releaseAll?.();
    if (!quiet) bus.emit('toast', { text: '조작을 되살렸습니다.', tone: 'good' });
  }

  bus.on('ui:unstick', () => unstick());

  bus.on('ui:restart-town', async () => {
    unstick({ quiet: true });
    changeMap(TOWN_GATE.mapId, TOWN_GATE.x, TOWN_GATE.y);
    await saveNow();
    bus.emit('toast', { text: '마을에서 다시 시작했습니다.', tone: 'good' });
  });

  // 설정 → 그만하기.
  //
  // 둘 다 **저장이 먼저**다. 저장이 실패해도 나가기는 한다 — 못 나가고 갇히는 것보다
  // 마지막 몇 초를 잃는 편이 낫고, 자동 저장이 20초마다 돌기 때문에 잃을 것도 적다.
  bus.on('ui:logout', async () => {
    bus.emit('toast', { text: '저장하고 접속 화면으로 갑니다…', tone: 'info' });
    try { await saveNow(); } catch { /* 저장 실패해도 나간다 */ }
    // 세션 토큰은 메모리에만 있으므로 새로고침이 곧 로그아웃이다.
    const url = new URL(location.href);
    url.searchParams.delete('v');
    location.replace(url.toString());
  });

  bus.on('ui:quit', async () => {
    bus.emit('toast', { text: '저장하고 종료합니다…', tone: 'info' });
    try { await saveNow(); } catch { /* 저장 실패해도 나간다 */ }
    // 브라우저는 스스로 연 창만 닫게 해 준다. 막히면 접속 화면으로 돌려보낸다 —
    // 아무 일도 안 일어나면 "버튼이 고장났다"로 읽힌다.
    const before = Date.now();
    window.close();
    setTimeout(() => {
      if (Date.now() - before < 3000 && !window.closed) {
        bus.emit('toast', { text: '브라우저가 창 닫기를 막았습니다. 접속 화면으로 갑니다.', tone: 'info' });
        setTimeout(() => location.replace(location.pathname), 900);
      }
    }, 400);
  });

  bus.on('ui:reconnect', async () => {
    bus.emit('toast', { text: '저장하고 다시 접속합니다…', tone: 'info' });
    try { await saveNow(); } catch { /* 저장에 실패해도 새로고침은 한다 */ }
    location.reload();
  });

  // 스스로 알아채는 안전장치.
  //
  // 창도 안 열려 있고 대화도 아니고 전투도 아닌데 조작만 꺼져 있으면, 그건 버그다.
  // 사람이 물음표를 찾아 들어가기 전에 여기서 먼저 되돌린다. 1.5초를 기다리는 이유는
  // 창을 닫는 그 찰나에도 잠깐 이 상태가 되기 때문이다.
  let stuckSince = 0;
  setInterval(() => {
    const idle =
      scenes.current === fieldScene &&
      !anyPanelOpen() &&
      !awaitingConfirm &&
      !cast.active &&
      fieldScene.active &&
      !fieldScene.controls;
    if (!idle) { stuckSince = 0; return; }
    if (!stuckSince) { stuckSince = Date.now(); return; }
    if (Date.now() - stuckSince < 1500) return;
    stuckSince = 0;
    fieldScene.resume();
    bus.emit('toast', { text: '조작이 멈춰 있어 되살렸습니다.', tone: 'info' });
    console.log('[안전장치] 창이 닫혔는데 조작이 꺼져 있어 resume() 했습니다.');
  }, 500);

  // 서버가 콘텐츠(아이템 표 등)를 새로 배포했다 — 새로고침하면 반영된다.
  bus.on('net:content', ({ version }) => {
    if (db.contentVersion && version <= db.contentVersion) return;
    updateBanner.show(version);
  });

  /**
   * 운영자가 시즌을 넘겼다 — 지금 이 순간부터 이 화면의 세이브는 옛것이다.
   *
   * 가장 먼저 하는 일은 **저장을 멈추는 것**이다. 안 그러면 20초 뒤 자동 저장이
   * 방금 비운 서버 자리에 옛 캐릭터를 도로 써넣는다 — 접속 중이던 한 사람만
   * 초기화가 안 되는, 찾기 어려운 사고가 된다.
   */
  bus.on('net:season', (msg) => {
    savingStopped = true;
    clearTimeout(saveTimer);
    showSeasonVeil(msg && msg.text);
  });

  function showSeasonVeil(text) {
    const line = text || '다음 시즌이 시작되었습니다';
    bus.emit('toast', { text: `${line}\n잠시 뒤 처음 화면으로 돌아갑니다.`, tone: 'rare', ms: 5000 });
    const veil = document.createElement('div');
    veil.className = 'season-veil';
    veil.innerHTML = `<div class="season-card">
        <h2>${line}</h2>
        <p>모두가 같은 자리에서 다시 시작합니다.<br>아이디와 비밀번호는 그대로입니다.</p>
        <p class="season-sub">잠시 뒤 처음 화면으로 돌아갑니다…</p>
      </div>`;
    document.body.appendChild(veil);
    requestAnimationFrame(() => veil.classList.add('is-in'));
    setTimeout(() => window.location.reload(), 4200);
  }

  // ── 그 밖의 소리 (0.44) ────────────────────────────────────
  //
  // 소리를 붙이는 자리를 **한 곳에 모아** 둔다. 여기저기 흩어 두면
  // "이 소리 왜 나지" 를 찾을 때 온 파일을 뒤져야 한다.
  //
  // 알림(toast)은 이미 거의 모든 일에 뜨고 있고 색(tone)까지 붙어 있다.
  // 그래서 알림 하나만 붙잡아도 "좋은 일 / 나쁜 일 / 귀한 일" 이 대부분 덮인다 —
  // 일마다 따로 붙이는 것은 그것만으로 모자란 몇 가지뿐이다.
  const TOAST_SFX = { rare: 'rare', perfect: 'rare', great: 'loot', good: 'loot', bad: 'error' };
  bus.on('toast', ({ tone }) => {
    if (!sound) return;
    const name = TOAST_SFX[tone];
    if (name) sound.sfx(name);
  });

  // 창을 열고 닫는 소리. 패널마다 붙이면 열 군데가 되므로 한 곳에서 지켜본다.
  if (sound) {
    let wasOpen = false;
    bus.on('ui:panel-sound', (open) => {
      if (open === wasOpen) return;
      wasOpen = open;
      sound.sfx(open ? 'open' : 'close');
    });
  }

  // 보스전에는 곡이 바뀐다. 끝나면 그 땅의 곡으로 돌아온다(아래 battle:close).
  bus.on('battle:start', (payload) => {
    if (!sound) return;
    sound.sfx('encounter');
    const boss = !!(payload && (payload.monsters || []).some((m) => m.boss));
    // 울음소리는 **연출이 뜨는 그 자리**에서 낸다(위 'battle:intro' 참고).
    // 여기서도 내면 두 번 겹친다 — 연출을 안 보는 사람(건너뛰기)은 조용한 편이 낫다.
    if (boss) sound.playBgm(bossBgmOf(store.state.map));
  });
  bus.on('battle:close', () => {
    if (sound) sound.playBgm(bgmOf(store.state.map));
  });
  bus.on('battle:result', (s) => {
    if (!sound) return;
    // 결과창이 뜨는 순간 — 알림 소리와 겹치지 않게 조금 늦춘다.
    setTimeout(() => {
      sound.sfx(s && s.win ? 'victory' : 'lose');
      if (s && s.levelUp) setTimeout(() => sound.sfx('levelup'), 520);
    }, 120);
  });

  // ── 전투 소리 ──────────────────────────────────────────────
  //
  // 때리는 쪽에서 기합, 맞는 쪽에서 타격음. 두 소리를 살짝 어긋나게 낸다 —
  // 같은 순간에 겹치면 한 덩어리로 뭉쳐 들려서 무엇이 무엇인지 알 수 없다.
  //
  // 무슨 소리를 낼지는 **무엇으로 때렸나**가 정한다(BattleScene 의 그림과 같은 잣대).
  bus.on('battle:event', (turn) => {
    if (!sound) return;
    if (turn.type === 'hit') {
      const kind = hitKindOf(store.state, turn);
      // 떠나는 소리 — 칼바람 · 시위 · 날아가는 불덩이. 사람이 때릴 때만 낸다
      // (몬스터까지 내면 여럿이 붙는 판에서 소리가 통째로 뭉친다).
      if (turn.actor === 'player') {
        sound.sfx('swing');
        const cast = KIND_CAST[kind];
        if (cast) sound.sfx(cast);
      }
      // 닿는 소리는 **닿을 때** 낸다. 날아가는 것은 그림도 늦게 닿으므로
      // 소리도 그만큼(FLIGHT_MS) 늦춰야 눈과 귀가 같은 순간을 가리킨다.
      const flying = kind === 'magic' || kind === 'fire' || kind === 'pierce';
      setTimeout(() => sound.sfx(turn.crit ? 'crit' : KIND_SFX[kind] || 'hit'),
        flying ? 170 : 90);
    } else if (turn.type === 'miss') {
      sound.sfx('guard');
    } else if (turn.type === 'heal') {
      sound.sfx('heal');
    } else if (turn.type === 'defeat') {
      sound.sfx('defeat');
    }
  });

  bus.on('net:status', ({ online }) => {
    bus.emit('toast', {
      text: online ? '서버에 연결되었습니다.' : '서버 연결이 끊겼습니다. (같은 브라우저 탭끼리는 계속 동작)',
      tone: online ? 'good' : 'bad',
    });
  });

  // 웹소켓 알림이 막힌 환경을 대비한 가벼운 폴링(30초).
  if (storage.isServer) {
    setInterval(async () => {
      const v = await storage.contentVersion();
      if (v && db.contentVersion && v > db.contentVersion) updateBanner.show(v);
    }, 30000);
  }

  // ===================== 저장 =====================
  let saveTimer = null;
  let saving = false;
  // 시즌이 넘어가면 여기서 저장을 통째로 끈다(net:season 참고).
  let savingStopped = false;

  function scheduleSave(delay = 1200) {
    if (savingStopped) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, delay);
  }

  async function saveNow() {
    if (saving || savingStopped) return;
    saving = true;
    try {
      await storage.save(account.id, account.token, Account.serializeSave(store.state));
      bus.emit('save:done');
    } catch (err) {
      console.warn('[save]', err.message);
    } finally {
      saving = false;
    }
  }

  setInterval(saveNow, AUTOSAVE_MS);
  window.addEventListener('beforeunload', () => {
    if (!storage.isServer && !savingStopped) {
      try {
        storage.save(account.id, account.token, Account.serializeSave(store.state));
      } catch {
        /* 무시 */
      }
    }
  });

  // 설정은 계정이 아니라 "이 기기"에 남는다. 게임 시작할 때 한 번 읽는다.
  store.state.settings = Settings.normalize(storage.loadSettings());

  // 브라우저 저장이 막힌 곳(미리보기 창·프라이빗 브라우징)에서는 진행이 남지 않는다.
  if (storage.memoryOnly && !storage.isServer) {
    setTimeout(
      () =>
        bus.emit('toast', {
          text: '이 창에서는 진행이 저장되지 않습니다.\n파일을 저장해 브라우저에서 직접 열어 주세요.',
          tone: 'bad',
        }),
      1200
    );
  }

  // 시즌이 넘어간 사이에 자고 있던 사람. 이미 새 캐릭터로 시작하고 있으므로
  // 화면을 덮지 않고 한 줄만 알린다 — 덮으면 "또 초기화되나" 로 읽힌다.
  if (seasonNotice) {
    setTimeout(() => bus.emit('toast', {
      text: `${seasonNotice} 시즌이 시작되었습니다\n모두가 처음부터 다시 시작합니다.`,
      tone: 'rare',
      ms: 6000,
    }), 900);
  }

  // 세이브가 있으면 그 상태로 복원한다.
  if (save) {
    const where = Account.applySave(store.state, save);
    Progression.backfillStats(store.state);
    Progression.reconcilePoints(store.state);
    changeMap(where.mapId, where.tx, where.ty);
    Progression.clampHp(store.state);
    store.notify();
  }

  // ===================== 입력 라우팅 =====================
  bus.on('input:action', (action) => {
    // 단축키는 어디서든(전투 중 포함) 먼저 처리한다
    if (action.startsWith('quick')) {
      const index = Number(action.slice(5)) - 1;
      if (!anyPanelOpen()) bus.emit('ui:quickuse', { index });
      return;
    }

    if (shopPanel.open) {
      if (action === 'cancel' || action === 'inventory') shopPanel.close();
      return;
    }
    if (exchangePanel.open) {
      if (action === 'cancel' || action === 'inventory') exchangePanel.close();
      return;
    }
    if (waypointPanel.open) {
      if (action === 'cancel' || action === 'inventory') waypointPanel.close();
      return;
    }
    if (mailPanel.open) {
      if (action === 'cancel' || action === 'mail') mailPanel.close();
      return;
    }
    if (rankPanel.open) {
      if (action === 'cancel' || action === 'rank') rankPanel.close();
      return;
    }
    if (questPanel.open) {
      if (action === 'cancel' || action === 'inventory') questPanel.close();
      return;
    }
    if (settingsPanel.open) {
      if (action === 'cancel' || action === 'settings') settingsPanel.close();
      return;
    }
    if (characterPanel.open) {
      if (action === 'cancel' || action === 'character') characterPanel.close();
      return;
    }
    if (inventoryPanel.open) {
      if (action === 'cancel' || action === 'inventory') inventoryPanel.close();
      return;
    }
    if (dialogueBox.open) {
      if (action === 'confirm') dialogueBox.advanceOrFinishTyping();
      else if (action === 'cancel') dialogue.close();
      return;
    }
    if (awaitingConfirm) {
      if (action === 'confirm' || action === 'cancel') closeBattle();
      return;
    }
    if (action === 'settings') {
      settingsPanel.toggle();
      return;
    }
    if (action === 'character') {
      if (scenes.current !== battleScene) characterPanel.toggle();
      return;
    }
    if (action === 'inventory') {
      if (scenes.current !== battleScene) inventoryPanel.show();
      return;
    }
    if (action === 'mail') {
      if (scenes.current !== battleScene) mailPanel.show();
      return;
    }
    if (action === 'rank') {
      if (scenes.current !== battleScene) rankPanel.show();
      return;
    }
    if (action === 'confirm' && scenes.current === fieldScene) {
      const npc = fieldScene.facingNpc();
      if (npc) return talkTo(npc);
    }
    scenes.onAction(action);
  });

  bus.on('input:click', ({ wx, wy }) => {
    if (anyPanelOpen() || awaitingConfirm || scenes.current !== fieldScene) return;
    const npc = fieldScene.npcAt(wx, wy);
    if (!npc) return;
    if (!fieldScene.inRange(npc)) {
      return bus.emit('toast', { text: '조금 더 가까이 가야 한다.', tone: 'info' });
    }
    talkTo(npc);
  });

  bus.on('input:hover', ({ wx, wy }) => {
    if (scenes.current !== fieldScene) return;
    fieldScene.setHover(wx, wy);
    const npc = fieldScene.npcAt(wx, wy);
    canvas.style.cursor = npc && fieldScene.inRange(npc) ? 'pointer' : 'default';
  });

  // ===================== 루프 =====================
  let uiAcc = 0;
  // 발소리를 낼 때 쓰는 기억(위 update 참고).
  let lastTile = '';
  let stepParity = 0;

  // 보스 연출이 도는 동안에는 전투 재생을 멈춘다 (0.47).
  // 안 그러면 배너 뒤에서 첫 대가 오가고, 배너가 걷히면 이미 피가 깎여 있다.
  //
  // 연출이 **무엇인지**도 함께 오므로(등장 / 쓰러짐 / 고룡) 그 자리의 소리를 여기서 낸다.
  // BattleView 는 소리를 모르고, Sound 는 전투를 모른다 — 둘을 잇는 자리가 여기다.
  let bossIntro = false;
  bus.on('battle:intro', (e) => {
    const on = !!(e && e.on);
    bossIntro = on;
    if (!on || !sound) return;
    if (e.kind === 'out') sound.sfx('bossfall');
    else sound.sfx(e.grand ? 'dragonroar' : 'bossroar');
  });

  const loop = new GameLoop({
    update: (dt) => {
      // 창이 열려 있거나 대화 중이어도 씬은 계속 돈다 — 다만 'paused' 로 알려 주어
      // 시계(버프·리젠)만 흐르고 발과 전투는 멈추게 한다.
      const panelOpen = anyPanelOpen();
      scenes.update(dt, { paused: panelOpen || bossIntro });
      // 창이 열리고 닫히는 순간에만 소리를 낸다(위 'ui:panel-sound' 참고).
      bus.emit('ui:panel-sound', panelOpen);
      // 발소리. **두 칸에 한 번**만 낸다 — 한 칸마다 내면 걷는 내내 딱딱거린다.
      // (Movement 는 systems 라 소리를 못 낸다. 칸이 바뀌었는지만 여기서 본다)
      if (sound && !panelOpen && scenes.current === fieldScene) {
        const p = store.state.player;
        const tile = `${p.tx},${p.ty}`;
        if (tile !== lastTile) {
          lastTile = tile;
          if ((stepParity ^= 1)) sound.sfx('step');
        }
      }

      updateCast(dt);

      if (quickCooldown > 0) {
        quickCooldown = Math.max(0, quickCooldown - dt);
        quickSlots.setCooldown(quickCooldown, quickCooldownMax);
      }

      const state = store.state;
      // 투명한 동안에는 내 자리를 아예 안 보낸다. 보내 놓고 상대 쪽에서 안 그리는 것과
      // 다르다 — 안 보내면 상대의 브라우저 콘솔에도 내가 없다.
      // (2초마다 오는 소식이 끊기면 상대 쪽에서 스스로 지운다 — PEER_TIMEOUT_MS)
      if (state.player.hidden) {
        net.update(dt, null);
      } else {
      net.update(dt, {
        map: state.map.id,
        name: state.player.name,
        account: account.id,
        level: state.player.level,
        tx: state.player.tx,
        ty: state.player.ty,
        px: Math.round(state.player.px),
        py: Math.round(state.player.py),
        dir: state.player.dir,
        moving: state.player.moving,
        look: computeLook(state),
        // 남의 화면에 내 얼굴이 제대로 나오게 직업도 같이 보낸다.
        // 없으면 모두가 보는 사람의 직업 얼굴로 그려진다.
        cls: state.player.classId,
      });
      }

      uiAcc += dt;
      if (uiAcc > 500) {
        uiAcc = 0;
        hud.setNet(net.peersOnMap(state.map.id).length, net.online, !!wsUrl);
        if ((state.buffs || []).length) hud.render(); // 남은 시간 갱신
      }
    },
    render: () => scenes.render(renderer),
  });

  input.attach();
  pointer.attach();
  loop.start();
  hud.render();
  quickSlots.render();
  fieldScene.showBanner(store.state.map.name);
  // 접속 화면의 곡을 끄고 서 있는 땅의 곡으로 갈아탄다.
  // (맵을 옮길 때는 changeMap 이 알아서 한다 — 여기는 처음 들어온 자리뿐이다)
  if (sound) sound.playBgm(bgmOf(store.state.map));

  // 디버깅·자동 테스트용 창구. 게임 로직은 이걸 쓰지 않는다.
  window.__game = {
    bus, store, scenes, assets, renderer, input, loop, changeMap, net, appearance, saveNow,
    battleScene, fieldScene, useConsumable, portal, encounter, autoPotionConfig, playerPower, battleParty,
    sound,
    // 시험과 진단에서 쓰는 통로(게임 코드는 이걸 쓰지 않는다)
    storageRef: storage, accountRef: account, submitTimeAttackRef: submitTimeAttack,
    refreshMailRef: refreshMail, announceOmenRef: announceOmen, refreshRanksRef: refreshRanks,
    reportDragonDamageRef: reportDragonDamage,
    talkToRef: talkTo,
    panels: {
      inventoryPanel, shopPanel, exchangePanel, characterPanel, questPanel,
      settingsPanel, waypointPanel, mailPanel, rankPanel, adminPanel,
    },
  };

  // 접속하자마자 우편함을 한 번 확인한다 — 자고 있는 사이에 온 것이 있을 수 있다.
  // (이벤트 선물도 이때 서버가 우편함으로 옮겨 준다)
  setTimeout(() => refreshMail(), 1500);

  // 운영자 계정인지 서버에 한 번 물어본다. 맞으면 HUD 에 톱니 옆으로 버튼이 하나 생긴다.
  checkAdmin();

  // 고룡이 와 있는 동안 마을에 있으면 알린다.
  // 마을에 서 있는 채로 용이 내려앉는 경우가 있어서, 맵을 옮길 때만 보면 놓친다.
  const omenTimer = setInterval(() => {
    if (store.state && store.state.map) announceOmen(store.state);
  }, 30000);

  // 고룡 상태 줄의 "남은 시간"을 1초마다 고친다.
  // 25분만 머무는 상대라 남은 시간이 멈춰 있으면 언제 떠날지 가늠할 수가 없다.
  const dragonTick = setInterval(() => {
    const state = store.state;
    const hud = state && state.dragonHud;
    if (!hud || !hud.show || !hud.present) return;
    const left = hud.endsAt - Date.now();
    if (left <= 0) {
      // 시간이 다 됐다 — 눈앞에서 떠난다.
      const dragon = state.monsters.find((m) => m.timedBoss);
      if (dragon) state.monsters = state.monsters.filter((m) => m !== dragon);
      showDragonGone(state, state.map, TimedBoss.evaluate(state, state.map).nextAt, '날아가 버렸다');
      bus.emit('toast', { text: `${hud.name}이(가) 날개를 펴고 사라졌다.`, tone: 'info' });
      store.notify();
      return;
    }
    hud.leftText = TimedBoss.waitText(hud.endsAt);
    store.notify();
  }, 1000);

  // 남이 때린 만큼도 보여야 한다 — 서버에 붙어 있으면 체력을 이따금 다시 받아 온다.
  const dragonSync = setInterval(() => {
    const state = store.state;
    if (!state || !state.dragonHud || !state.dragonHud.show || !storage.isServer) return;
    const dragon = state.monsters.find((m) => m.timedBoss);
    syncDragonFromServer(state, state.map, dragon || null, dragon ? dragon.fullHp : 0);
  }, 12000);

  window.addEventListener('beforeunload', () => {
    clearInterval(omenTimer);
    clearInterval(dragonTick);
    clearInterval(dragonSync);
  });

  bus.emit('toast', {
    text: save ? `다시 오셨군요, ${account.name}님.` : `${account.name}님, 포이노에 오신 걸 환영합니다.`,
    tone: 'good',
  });

  // 겹친 아이템 번호를 고쳤다면 알려 준다 — 말없이 고치면 무엇이 달라졌는지 알 수 없다.
  if (store.state.uidRepair) {
    setTimeout(() => {
      bus.emit('toast', {
        text: `소지품 ${store.state.uidRepair}칸의 번호가 겹쳐 있어 고쳤습니다.\n장착 표시가 어긋나던 문제가 사라집니다.`,
        tone: 'info',
      });
    }, 900);
  }

  // 특성·스킬이 바뀌어 포인트를 돌려받았다면 그 사실을 알려 준다.
  // 말없이 바뀌면 "내 캐릭터가 왜 약해졌지" 가 된다.
  const refund = store.state.rankRefund || { trait: 0, skill: 0 };
  const back = (refund.trait || 0) + (refund.skill || 0);
  if (save && back > 0) {
    setTimeout(() => {
      bus.emit('toast', {
        text: refund.reborn
          ? `특성과 스킬이 개편되었습니다.\n찍어 두었던 ${back}포인트를 모두 돌려드렸습니다 — 캐릭터 창에서 다시 골라 주세요.`
          : `스킬·특성 표가 바뀌어 ${back}포인트를 돌려드렸습니다.\n최대 단계가 줄어든 것이 있습니다 — 캐릭터 창에서 다시 찍어 주세요.`,
        tone: 'rare',
      });
    }, 1200);
  }
}

/** 실행 진입점에서 호출한다(src/entry.js). 실패해도 화면에 이유를 남긴다. */
export function bootstrap(providedDb = null) {
  return startGame(providedDb).catch((err) => {
    console.error(err);
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.textContent = `실행 실패: ${err.message}`;
  });
}
