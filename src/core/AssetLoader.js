// 책임: manifest 기반 이미지 프리로드 + 실패 시 플레이스홀더 생성.
// 금지: 게임 도메인 지식. "몬스터"인지 "타일"인지 모른다. 그냥 key → 이미지다.
// 원칙: 이미지가 없어도 절대 크래시하지 않는다. 그림이 아직 없어도 게임은 돌아가야 한다.

/**
 * manifest 항목 형식:
 *   "mon_slime_battle": { "src": "assets/sprites/monsters/slime_battle.png", "w": 256, "h": 256 }
 * 스프라이트시트로 쓰고 싶으면 frames / frameWidth를 추가한다(선택):
 *   { "src": "...", "w": 192, "h": 64, "frames": 3, "frameWidth": 64 }
 */
export class AssetLoader {
  constructor() {
    /** @type {Map<string, {key:string,image:CanvasImageSource,w:number,h:number,frames:number,frameWidth:number,frameHeight:number,ok:boolean}>} */
    this.assets = new Map();
    this.missing = [];
  }

  /**
   * manifest 객체를 받아 전부 로드한다. 실패해도 resolve된다.
   *
   * 0.70.30 — `first(key)` 를 주면 **그 그림만 먼저** 읽고 곧바로 돌아온다(접속 화면을 빨리 띄운다).
   *   나머지는 뒤에서 계속 읽고, 다 읽으면 `this.ready` 가 풀린다. 게임에 들어가기 전에
   *   `whenReady()` 로 기다린다. 품질은 그대로다 — 같은 그림을 순서만 바꿔 읽는다.
   */
  async loadManifest(manifest, { first = null } = {}) {
    // lazy 로 적힌 그림(새 몸의 장비 층 · 0.70.26)은 지금 읽지 않는다 — 누가 입을 때 loadLazy 로 읽는다.
    this.lazy = this.lazy || new Map();
    const entries = Object.entries(manifest || {}).filter(([key, def]) => {
      if (def && def.lazy) { this.lazy.set(key, def); return false; }
      return true;
    });
    const now = first ? entries.filter(([key]) => first(key)) : entries;
    const later = first ? entries.filter(([key]) => !first(key)) : [];
    this.progress = { done: 0, total: later.length };
    await Promise.all(now.map(([key, def]) => this._loadOne(key, def)));
    const tick = () => { this.progress.done++; if (this.onProgress) this.onProgress(this.progress); };
    this.ready = Promise.all(later.map(([key, def]) => this._loadOne(key, def).then(tick))).then(() => {
      if (this.missing.length) {
        console.info(
          `[AssetLoader] 이미지 ${this.missing.length}개가 없어 플레이스홀더로 대체했습니다:`,
          this.missing
        );
      }
      return this.assets;
    });
    if (!first) await this.ready;
    return this.assets;
  }

  /** 뒤에서 읽던 그림을 다 읽을 때까지 기다린다. onProgress({done, total}) 로 얼마나 왔는지 알린다. */
  whenReady(onProgress = null) {
    this.onProgress = onProgress;
    if (onProgress && this.progress) onProgress(this.progress);
    return (this.ready || Promise.resolve(this.assets)).then((a) => { this.onProgress = null; return a; });
  }

  _loadOne(key, def) {
    const w = def.w || 32;
    const h = def.h || 32;
    const frames = def.frames || 1;
    const frameWidth = def.frameWidth || Math.floor(w / frames);
    const frameHeight = def.frameHeight || h;

    return new Promise((resolve) => {
      if (!def.src) {
        this._registerPlaceholder(key, def);
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        // manifest의 w/h는 "화면에 그릴 크기"다. 실제 파일이 2배 해상도여도
        // 같은 크기로 그려지므로, 레티나용 고해상도 PNG를 그대로 넣어도 된다.
        this.assets.set(key, {
          key,
          image: img,
          w,
          h,
          srcW: img.naturalWidth,
          srcH: img.naturalHeight,
          frames,
          frameWidth: def.frameWidth || Math.floor(img.naturalWidth / frames),
          frameHeight: def.frameHeight || img.naturalHeight,
          label: def.label || key,
          ok: true,
        });
        resolve();
      };
      img.onerror = () => {
        this.missing.push(key);
        this._registerPlaceholder(key, { ...def, w, h, frames, frameWidth, frameHeight });
        resolve();
      };
      img.src = def.src;
    });
  }

  _registerPlaceholder(key, def) {
    const w = def.w || 32;
    const h = def.h || 32;
    const canvas = makePlaceholder(key, w, h, def.label || key);
    this.assets.set(key, {
      key,
      image: canvas,
      w,
      h,
      srcW: w,
      srcH: h,
      frames: 1,
      frameWidth: w,
      frameHeight: h,
      label: def.label || key,
      ok: false,
    });
  }

  /**
   * lazy 그림 하나를 읽는다. 이미 읽었거나 읽는 중이면 그 약속을 그대로 돌려준다.
   * ⚠ 실패해도 **자리표(플레이스홀더)를 등록하지 않는다** — 겹쳐 그리는 쪽이 색 상자를 몸 위에 얹게 된다.
   */
  loadLazy(key) {
    this.lazyLoading = this.lazyLoading || new Map();
    if (this.assets.has(key)) return Promise.resolve(this.assets.get(key));
    if (this.lazyLoading.has(key)) return this.lazyLoading.get(key);
    const def = this.lazy && this.lazy.get(key);
    if (!def || !def.src) return Promise.resolve(null);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const a = {
          key, image: img, w: def.w || img.naturalWidth, h: def.h || img.naturalHeight,
          srcW: img.naturalWidth, srcH: img.naturalHeight, frames: 1,
          frameWidth: img.naturalWidth, frameHeight: img.naturalHeight, label: key, ok: true,
        };
        this.assets.set(key, a);
        resolve(a);
      };
      img.onerror = () => { this.missing.push(key); resolve(null); };
      img.src = def.src;
    });
    this.lazyLoading.set(key, p);
    return p;
  }

  /**
   * 지도 빛깔 (0.70.31) — 들판마다 땅 · 풀 · 나무의 빛을 바꾼다(잿빛 숲 · 붉은 황야 · 뼈의 들판 …).
   * 그림을 따로 굽지 않고, 처음 쓸 때 **한 번** 칠해 둔 사본을 쓴다(`tile_grass@ashen`).
   * 바꾸는 것은 `tile_` 그림뿐이다 — 사람 · 몬스터 · 아이템 · 전투 배경은 그대로.
   * @param {{id:string, hue?:number, gs?:number, s?:number, l?:number, gl?:number}|null} tint
   */
  setTint(tint) {
    this.tint = tint && tint.id ? tint : null;
  }

  /** 등록되지 않은 key를 요청해도 즉석에서 플레이스홀더를 만들어 돌려준다. */
  get(key) {
    if (this.tint && typeof key === 'string' && key.startsWith('tile_') && !TINT_SKIP.test(key) && this.assets.has(key)) {
      const tk = `${key}@${this.tint.id}`;
      let a = this.assets.get(tk);
      if (!a) {
        a = tintAsset(this.assets.get(key), this.tint);
        this.assets.set(tk, a);
      }
      return a;
    }
    if (!this.assets.has(key)) {
      this.missing.push(key);
      this._registerPlaceholder(key, { w: 32, h: 32 });
    }
    return this.assets.get(key);
  }

  has(key) {
    return this.assets.has(key);
  }
}

/** 지도 빛깔을 칠하지 않는 그림 — 물(물빛은 그대로) · 표지판 · 길목 문 · 웨이포인트 */
const TINT_SKIP = /water|signpost|gate_exit|waypoint|stairs/;

/**
 * 그림 한 장에 지도 빛깔을 칠한 사본.
 *   · 초록(색상 55~175°)은 hue 쪽으로 돌린다(가운데 110° 에서 떨어진 만큼은 0.35 배만 남긴다 — 풀빛의 결을 살린다)
 *   · gs · gl: 초록에만 곱하는 채도 · 밝기,  s · l: 모든 칸에 곱하는 채도 · 밝기
 * 칠할 수 없으면(읽을 수 없는 그림) 원래 그림을 그대로 돌려준다.
 */
export function tintAsset(asset, t) {
  if (!asset || !asset.image) return asset;
  try {
    const w = asset.srcW || asset.image.width;
    const h = asset.srcH || asset.image.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.drawImage(asset.image, 0, 0, w, h);
    const im = x.getImageData(0, 0, w, h);
    const d = im.data;
    const S = t.s == null ? 1 : t.s, Lm = t.l == null ? 1 : t.l;
    const GS = t.gs == null ? 1 : t.gs, GL = t.gl == null ? 1 : t.gl;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      let hh = 0, ss = 0;
      let ll = (mx + mn) / 2;
      if (mx !== mn) {
        const dd = mx - mn;
        ss = ll > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
        hh = mx === r ? (g - b) / dd + (g < b ? 6 : 0) : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
        hh *= 60;
      }
      if (ss > 0.1 && hh >= 55 && hh <= 175) {
        if (t.hue != null) hh = (t.hue + (hh - 110) * 0.35 + 360) % 360;
        ss *= GS;
        ll *= GL;
      }
      ss = Math.min(1, ss * S);
      ll = Math.min(1, ll * Lm);
      // hsl → rgb
      const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
      const p = 2 * ll - q;
      const f = (tt) => {
        tt = (tt + 1) % 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
      };
      const H = hh / 360;
      d[i] = Math.round((ss === 0 ? ll : f(H + 1 / 3)) * 255);
      d[i + 1] = Math.round((ss === 0 ? ll : f(H)) * 255);
      d[i + 2] = Math.round((ss === 0 ? ll : f(H - 1 / 3)) * 255);
    }
    x.putImageData(im, 0, 0);
    return { ...asset, image: c, key: `${asset.key}@${t.id}` };
  } catch (e) {
    return asset;
  }
}

/** key 문자열에서 안정적인 색을 뽑는다(같은 key → 항상 같은 색). */
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 이미지가 없을 때 대신 그릴 라벨 박스를 캔버스로 만든다. */
export function makePlaceholder(key, w, h, label) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(8, w);
  canvas.height = Math.max(8, h);
  const ctx = canvas.getContext('2d');
  const hue = hashHue(key);

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `hsl(${hue} 62% 58%)`);
  grad.addColorStop(1, `hsl(${(hue + 28) % 360} 58% 38%)`);
  ctx.fillStyle = grad;
  roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, Math.min(6, canvas.width / 6));
  ctx.fill();

  ctx.strokeStyle = `hsl(${hue} 70% 82%)`;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, canvas.width - 2, canvas.height - 2, Math.min(6, canvas.width / 6));
  ctx.stroke();

  const text = String(label || key).replace(/^(mon_|chr_|tile_|item_)/, '');
  const size = Math.max(7, Math.min(13, Math.floor(canvas.width / Math.max(4, text.length) * 1.5)));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3;
  wrapText(ctx, text, canvas.width / 2, canvas.height / 2, canvas.width - 6, size + 2);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
  const words = text.split(/[_\s-]+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * lineHeight));
}
