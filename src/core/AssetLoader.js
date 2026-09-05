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

  /** manifest 객체를 받아 전부 로드한다. 실패해도 resolve된다. */
  async loadManifest(manifest) {
    const entries = Object.entries(manifest || {});
    await Promise.all(entries.map(([key, def]) => this._loadOne(key, def)));
    if (this.missing.length) {
      console.info(
        `[AssetLoader] 이미지 ${this.missing.length}개가 없어 플레이스홀더로 대체했습니다:`,
        this.missing
      );
    }
    return this.assets;
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

  /** 등록되지 않은 key를 요청해도 즉석에서 플레이스홀더를 만들어 돌려준다. */
  get(key) {
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
