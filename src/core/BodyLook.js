// 책임: 새 몸 그림(0.70.26)을 한 장으로 겹쳐 캐시한다.
//        기본 몸 넷(남·여 × 깨끗한·거친 차림) × 장면(서기·걷기·전투 자세·공격) × 장비 층(칸마다 희귀도 5단계)
// 금지: 게임 규칙 판단. 무엇을 입었는지는 look(computeLook) 으로 받는다.
// 규칙: 그림 좌표·장면 목록은 src/data/bodies.json 에만 있다(tools/body-game.py 가 만든다).
//
// ── 어떻게 겹치나 ──────────────────────────────────────────────
//   망토(몸 뒤) → 맨몸 → 갑옷 → 신발 → 벨트 → 목걸이 → 장갑 → 어깨받이 → 투구 → 무기
//   층은 "그 장비 하나만 입힌 몸" 과 "맨몸" 이 **다른 점만** 담고 있다. 그래서 팔이 갑옷 앞을
//   지나는 자리는 갑옷 층에 아예 없다 — 이 순서로 겹치기만 하면 앞뒤가 맞는다.
//
// ── 그림은 **필요할 때** 불러온다 ──────────────────────────────
//   층 그림이 216장(몸 넷 × 층 54)이라, 처음에 다 읽으면 풀어 놓은 크기만 수백 MB 가 된다.
//   manifest 에 lazy 로 적혀 있고, 누가 입고 있을 때 그 층만 읽는다(AssetLoader.loadLazy).
//   읽는 동안에는 있는 층까지만 그려 두고, 다 오면 **같은 캔버스에 다시 그린다** —
//   전투 화면처럼 그림을 한 번 받아 쥐고 있는 쪽도 저절로 바뀐다.

const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const SHAPE_KIND = { club: 'sword', sword: 'sword', greatsword: 'sword', bow: 'bow', staff: 'staff' };
const CACHE_MAX = 240;
export const FIELD_SCALE = 1.15;
export const BATTLE_SCALE = 1.1;

export class BodyLook {
  /**
   * @param {import('./AssetLoader.js').AssetLoader} assets
   * @param {object} data src/data/bodies.json
   * @param {object} db  prepareDatabase 결과(items · appearance 를 본다)
   */
  constructor(assets, data, db) {
    this.assets = assets;
    this.data = data || { bodies: {}, scenes: {} };
    this.db = db || {};
    this.cache = new Map();
    /** 층 키 → 그 층을 기다리는 캐시 항목들 */
    this.waiting = new Map();
  }

  /** 이 몸이 있는가(그림이 구워져 있는가). */
  has(bodyId) {
    return !!(bodyId && this.data.bodies && this.data.bodies[bodyId]);
  }

  /** 고를 수 있는 몸 — [{id, gender, style, label}] */
  list() {
    return Object.entries(this.data.bodies || {}).map(([id, b]) => ({
      id, gender: b.gender, style: b.style, label: b.label,
    }));
  }

  /** 성별 · 차림 → 몸 id. 없으면 null. */
  find(gender, style) {
    const hit = this.list().find((b) => b.gender === gender && b.style === style);
    return hit ? hit.id : null;
  }

  /** 아이템 id → 희귀도 단계(0~4). 모르는 것은 0. */
  tierOf(itemId) {
    const def = itemId && this.db.items && this.db.items[itemId];
    if (!def) return null;
    const t = RARITY_TIER[def.rarity];
    return t == null ? 0 : t;
  }

  /** 무기 id → sword · bow · staff (없으면 fist). */
  weaponKind(itemId) {
    if (!itemId) return 'fist';
    const ap = (this.db.appearance && this.db.appearance.weapon) || {};
    const shape = ap[itemId] && ap[itemId].shape;
    return SHAPE_KIND[shape] || 'sword';
  }

  /**
   * 그 아이템이 입는 층의 꼬리 — 제 모양(변형)이 있으면 그 이름, 없으면 등급(0~4). (0.70.28)
   *
   * 같은 등급에 아이템이 여럿이면 예전에는 모두 **등급 그림 하나**를 입었다(용린 갑옷 = 기사 갑옷).
   * 이제 bodies.json 의 variants 가 아이템마다 제 층을 가리킨다: dragon_mail → armor_dragon.
   * 그 층이 이 몸 · 이 장면에 없으면(옛 그림 파일) 등급 층으로 떨어진다 — 맨몸이 되지 않는다.
   */
  suffixOf(bodyId, prefix, itemId, scene) {
    const t = this.tierOf(itemId);
    if (t == null) return null;
    const v = (this.data.variants || {})[itemId];
    const layers = (this.data.bodies[bodyId] || {}).layers || {};
    const has = (k) => layers[k] && (!scene || layers[k].rects[scene]);
    if (v && has(`${prefix}_${v}`)) return v;
    return t;
  }

  /** 겉모습 → 층 키 목록(그 장면에 있는 것만, 겹치는 순서대로). */
  layerKeys(bodyId, scene, look) {
    const body = this.data.bodies[bodyId];
    if (!body) return [];
    const L = look || {};
    const kind = this.weaponKind(L.weapon);
    const sfx = (prefix, id) => this.suffixOf(bodyId, prefix, id, scene);
    const want = [];
    const tierSh = this.tierOf(L.shoulder);
    const cape = tierSh != null && tierSh >= 2 ? `cape_${sfx('cape', L.shoulder)}` : null;
    // 0.70.29 — 뒷모습에서는 망토가 **몸 위**에 온다(등을 덮는다). 목걸이는 뒤에서 안 보인다.
    const back = scene.endsWith('_b');
    if (cape && !back) want.push(cape);
    want.push('base');
    for (const slot of ['armor', 'boots', 'belt', 'necklace', 'gloves']) {
      if (back && slot === 'necklace') continue;
      const v = sfx(slot, L[slot]);
      if (v != null) want.push(`${slot}_${v}`);
    }
    if (cape && back) want.push(cape);
    const pv = sfx('pads', L.shoulder);
    if (pv != null) want.push(`pads_${pv}`);
    const hv = sfx('helmet', L.helmet);
    if (hv != null) want.push(`helmet_${hv}`);
    const wv = sfx(`weapon_${kind}`, L.weapon);
    if (wv != null && kind !== 'fist') want.push(`weapon_${kind}_${wv}`);
    return want.filter((k) => body.layers[k] && body.layers[k].rects[scene]);
  }

  /** 이 장면이 구워져 있는가(옛 그림 파일에는 달리기 · 점프 · 맞기 · 쓰러짐이 없다). */
  hasScene(bodyId, scene) {
    const body = this.data.bodies[bodyId];
    return !!(body && (this.data.scenes || {})[scene] && body.layers.base && body.layers.base.rects[scene]);
  }

  /** 전투 장면 이름 — 무기에 따라 stance_sword · attack_bow … */
  battleScene(kind, look) {
    const k = this.weaponKind(look && look.weapon);
    return `${kind}_${k}`;
  }

  /**
   * 한 장. 캔버스 하나를 돌려주고, 층이 다 오면 그 캔버스를 다시 그린다.
   * @returns {{key:string,image:HTMLCanvasElement,w:number,h:number,srcW:number,srcH:number,frames:number,frameWidth:number,frameHeight:number,ok:boolean}|null}
   */
  get(bodyId, scene, look) {
    if (!this.has(bodyId)) return null;
    const size = (this.data.scenes || {})[scene];
    if (!size) return null;
    const keys = this.layerKeys(bodyId, scene, look);
    const cacheKey = `${bodyId}|${scene}|${keys.join(',')}`;
    const hit = this.cache.get(cacheKey);
    if (hit) {
      // 가장 최근에 쓴 것을 뒤로 — 넘치면 앞에서부터 버린다
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, hit);
      return hit.asset;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    // 틀은 80×80 이고 그 가운데 아래 48×64 가 몸이다. 새 몸은 머리가 작고 날씬해서(8등신이 아니라
    // 3등신이지만 예전 그림보다 **폭이 좁다**) 같은 크기로 두면 옆의 NPC 보다 한 뼘 작아 보인다.
    // 그래서 틀째 키워 그린다 — 들판 1.15배(키 ≈ 66px, 예전 그림 64px 와 비슷), 전투 1.1배.
    const logical = size <= 160 ? Math.round(80 * FIELD_SCALE) : Math.round(320 * BATTLE_SCALE);
    const entry = {
      bodyId, scene, keys, canvas, pending: new Set(),
      asset: {
        key: `body:${cacheKey}`, image: canvas, w: logical, h: logical, srcW: size, srcH: size,
        frames: 1, frameWidth: size, frameHeight: size, label: bodyId, ok: true,
      },
    };
    for (const k of keys) {
      const ak = `body:${bodyId}:${k}`;
      const a = this.assets.assets.get(ak);
      if (a && a.ok) continue;
      entry.pending.add(ak);
      if (!this.waiting.has(ak)) {
        this.waiting.set(ak, new Set());
        const p = this.assets.loadLazy ? this.assets.loadLazy(ak) : null;
        if (p) p.then(() => this._arrived(ak));
      }
      this.waiting.get(ak).add(entry);
    }
    this._draw(entry);
    this.cache.set(cacheKey, entry);
    if (this.cache.size > CACHE_MAX) {
      const first = this.cache.keys().next().value;
      this.cache.delete(first);
    }
    return entry.asset;
  }

  /** 미리 읽어 두기(전투에 들어가기 전 · 장비를 바꾼 뒤). */
  prefetch(bodyId, look) {
    if (!this.has(bodyId)) return Promise.resolve();
    const all = new Set();
    for (const scene of Object.keys(this.data.scenes || {})) {
      for (const k of this.layerKeys(bodyId, scene, look)) all.add(`body:${bodyId}:${k}`);
    }
    return Promise.all([...all].map((ak) => (this.assets.loadLazy ? this.assets.loadLazy(ak) : null)));
  }

  _arrived(ak) {
    const set = this.waiting.get(ak);
    this.waiting.delete(ak);
    if (!set) return;
    for (const entry of set) {
      entry.pending.delete(ak);
      this._draw(entry);
    }
  }

  _draw(entry) {
    const body = this.data.bodies[entry.bodyId];
    const ctx = entry.canvas.getContext('2d');
    ctx.clearRect(0, 0, entry.canvas.width, entry.canvas.height);
    for (const k of entry.keys) {
      const a = this.assets.assets.get(`body:${entry.bodyId}:${k}`);
      if (!a || !a.ok) continue;
      const r = body.layers[k].rects[entry.scene];
      if (!r) continue;
      const [x, y, w, h, ox, oy] = r;
      ctx.drawImage(a.image, x, y, w, h, ox, oy, w, h);
    }
  }
}
