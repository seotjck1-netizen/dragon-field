// 책임: 기본 캐릭터 스프라이트에 장비를 반영한 "겉모습"을 만들어 캐시한다.
//        ① 영역 색 리맵(상의)  ② 파츠 레이어(망토·소매·견갑·비늘)  ③ 손에 드는 무기
// 금지: 게임 규칙 판단. 어떤 장비를 입었는지는 인자로 받는다.
// 규칙: 무엇을 무슨 색/모양으로 그릴지는 src/data/appearance.json 에만 적는다.
//
// 그리는 순서: 뒤 파츠(망토) → 기본 스프라이트 → 앞 파츠(소매·견갑) → 무기 → 오라

const EMPTY_LOOK = {
  helmet: null,
  weapon: null,
  armor: null,
  shoulder: null,
  gloves: null,
  boots: null,
  accessory: null,
};

export class Appearance {
  /**
   * @param {import('./AssetLoader.js').AssetLoader} assets
   * @param {object} config src/data/appearance.json
   */
  constructor(assets, config) {
    this.assets = assets;
    this.config = config;
    this.cache = new Map();
  }

  static lookKey(look) {
    const l = look || EMPTY_LOOK;
    return [l.armor, l.weapon, l.shoulder, l.gloves, l.boots, l.accessory, l.helmet]
      .map((v) => v || '-')
      .join('/');
  }

  get(baseKey, look) {
    const key = `${baseKey}|${Appearance.lookKey(look)}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const base = this.assets.get(baseKey);
    if (!base || !base.ok) return base;

    const built = this._build(base, look || EMPTY_LOOK);
    this.cache.set(key, built);
    return built;
  }

  _build(base, look) {
    const cfg = this.config;
    const armor = cfg.armor[look.armor] || cfg.armor.default;
    const weapon = cfg.weapon[look.weapon] || cfg.weapon.default;
    const accessory = cfg.accessory[look.accessory] || cfg.accessory.default;

    const w = base.srcW;
    const h = base.srcH;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 부위별 장비가 각자 파츠를 얹는다.
    // 같은 파츠(견갑 등)를 둘이 요구하면 더 구체적인 쪽(어깨 장비)의 색을 쓴다.
    const sources = [
      // 투구를 맨 앞에 둔다 — 머리에 쓰는 것은 그 물건의 색으로 그려야 한다.
      (cfg.helmet && cfg.helmet[look.helmet]) || null,
      (cfg.shoulder && cfg.shoulder[look.shoulder]) || null,
      (cfg.gloves && cfg.gloves[look.gloves]) || null,
      (cfg.boots && cfg.boots[look.boots]) || null,
      armor,
    ];

    const layers = [];
    for (const src of sources) {
      if (!src) continue;
      for (const name of src.parts || []) {
        const part = cfg.parts[name];
        if (!part || layers.some((l) => l.name === name)) continue;
        layers.push({
          name,
          part,
          colors: {
            tunic: src.color || src.tunic || armor.tunic,
            cape: src.cape || armor.cape || armor.tunic,
            // 룬 장비처럼 빛나는 무늬가 있는 것만 trim 을 갖는다.
            trim: src.trim || armor.trim || null,
          },
        });
      }
    }
    const partsOf = (layer) => layers.filter((l) => (l.part.layer || 'front') === layer);

    // 그림 자체가 기울어 있으면(공격 자세) 얹는 것들도 같이 기울인다.
    //
    // ⚠ 0.57 이전에는 몸만 −11° 로 기울고 투구·견갑·무기는 **똑바로 서 있었다.**
    //   그래서 때리는 순간 투구가 머리에서 떨어져 허공에 남았다.
    //   기울이는 자리는 그림마다 다르므로 appearance.json 의 pose.by 에 적어 둔다.
    const pose = poseOf(cfg, base.key);
    const withPose = (fn) => {
      if (!pose) { fn(); return; }
      ctx.save();
      ctx.translate((pose.dx || 0) * w, (pose.dy || 0) * h);
      const px = (pose.pivot ? pose.pivot[0] : 0.5) * w;
      const py = (pose.pivot ? pose.pivot[1] : 1) * h;
      ctx.translate(px, py);
      ctx.rotate(((pose.rotate || 0) * Math.PI) / 180);
      ctx.translate(-px, -py);
      fn();
      ctx.restore();
    };

    // ① 뒤 파츠 (망토)
    withPose(() => { for (const p of partsOf('back')) drawPart(ctx, w, h, p.part, p.colors); });

    // ② 기본 스프라이트 + 상의 색 리맵
    const body = document.createElement('canvas');
    body.width = w;
    body.height = h;
    const bctx = body.getContext('2d');
    bctx.drawImage(base.image, 0, 0);
    const img = bctx.getImageData(0, 0, w, h);
    recolor(img, w, h, cfg.regions, { tunic: armor.tunic });
    bctx.putImageData(img, 0, 0);
    ctx.drawImage(body, 0, 0);

    // ③ 앞 파츠 + ④ 손에 든 무기 — 둘 다 몸을 따라 기운다.
    //
    // 손 자리는 그림 종류마다 다를 수 있다 — 전투 자세(_stance)는 팔을 굽혀
    // 손이 위앞으로 올라가 있다. 그 자리를 안 바꾸면 무기만 허공에 남는다.
    withPose(() => {
      for (const p of partsOf('front')) drawPart(ctx, w, h, p.part, p.colors);
      if (weapon.shape) drawWeapon(ctx, w, h, handAt(cfg, base.key), weapon);
    });

    // ⑤ 장신구 오라
    if (accessory.aura) drawAura(ctx, w, h, accessory.aura);

    return {
      key: `${base.key}#look`,
      image: canvas,
      w: base.w,
      h: base.h,
      srcW: w,
      srcH: h,
      frames: 1,
      frameWidth: w,
      frameHeight: h,
      label: base.label,
      ok: true,
    };
  }
}

/** 이 그림이 이미 기울어 있는가. appearance.json 의 pose.by 에 적는다. */
function poseOf(cfg, key) {
  const by = (cfg.pose && cfg.pose.by) || {};
  const name = String(key || '');
  for (const suffix of Object.keys(by)) {
    if (name.endsWith(`_${suffix}`)) return by[suffix];
  }
  return null;
}

/** 이 그림에서 손이 있는 자리. appearance.json 의 hand.by 에 예외를 적는다. */
function handAt(cfg, key) {
  const by = (cfg.hand && cfg.hand.by) || {};
  const name = String(key || '');
  for (const suffix of Object.keys(by)) {
    if (name.endsWith(`_${suffix}`)) return by[suffix];
  }
  return cfg.hand.at;
}

// ---------- 색 리맵 ----------

function lum(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function satOf(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

/**
 * 픽셀이 어느 영역에 속하는지 판정한다.
 * 살색과 머리색을 건드리지 않는 것이 가장 중요하다.
 */
function matches(rule, r, g, b, x, w, y, h) {
  // 세로 범위 제한(선택) — 예: 상의 영역은 몸통 높이에서만 찾는다.
  // 마법사 모자처럼 "몸통과 같은 색이지만 옷이 아닌" 부분을 지켜 준다.
  if (rule.minY != null && y / h < rule.minY) return false;
  if (rule.maxY != null && y / h > rule.maxY) return false;

  if (rule.type === 'blue') return b > r + rule.minDelta && b >= g;
  if (rule.type === 'crimson') {
    return (
      r > b + rule.minDelta &&
      b >= g - 6 &&
      satOf(r, g, b) >= rule.minSat &&
      lum(r, g, b) <= rule.maxLum
    );
  }
  if (rule.type === 'pale') {
    return (
      lum(r, g, b) >= rule.minLum &&
      satOf(r, g, b) <= rule.maxSat &&
      x / w >= (rule.minX ?? 0)
    );
  }
  return false;
}

/** 영역별로 색을 갈아끼운다. 원래 픽셀의 밝기 비율을 유지하므로 음영이 살아 있다. */
function recolor(imgData, w, h, regions, targets) {
  const d = imgData.data;
  const entries = Object.entries(regions)
    .filter(([name]) => targets[name])
    .map(([name, def]) => ({
      rule: def.match,
      baseLum: Math.max(1, lum(def.base[0], def.base[1], def.base[2])),
      target: targets[name],
    }));
  if (!entries.length) return;

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 24) continue;
    const px = i / 4;
    const x = px % w;
    const y = Math.floor(px / w);
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    for (const e of entries) {
      if (!matches(e.rule, r, g, b, x, w, y, h)) continue;
      if (e.target[0] === r && e.target[1] === g && e.target[2] === b) break;
      const k = lum(r, g, b) / e.baseLum;
      d[i] = clamp(e.target[0] * k);
      d[i + 1] = clamp(e.target[1] * k);
      d[i + 2] = clamp(e.target[2] * k);
      break;
    }
  }
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function rgb(c, mult = 1) {
  return `rgb(${clamp(c[0] * mult)},${clamp(c[1] * mult)},${clamp(c[2] * mult)})`;
}

// ---------- 파츠 레이어 ----------

function drawPart(ctx, w, h, part, armor) {
  const color = part.shape === 'cape' ? armor.cape || armor.tunic : armor.tunic;
  const trim = armor.trim || null; // 룬 장비의 빛나는 무늬 색(없으면 null)
  const light = rgb(color, 1.35);
  const dark = rgb(color, 0.55);
  const [pw, ph] = part.size;

  for (const [ax, ay] of part.at) {
    const cx = ax * w;
    const cy = ay * h;
    const rw = (pw * w) / 2;
    const rh = (ph * h) / 2;

    ctx.save();
    if (part.shape === 'cape') {
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh * 2);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - rw * 0.62, cy - rh * 0.5);
      ctx.quadraticCurveTo(cx - rw * 1.05, cy + rh, cx - rw * 0.86, cy + rh * 2);
      ctx.lineTo(cx + rw * 0.86, cy + rh * 2);
      ctx.quadraticCurveTo(cx + rw * 1.05, cy + rh, cx + rw * 0.62, cy - rh * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = Math.max(1, w / 110);
      ctx.stroke();
      // 목에 두른 여밈
      ctx.fillStyle = light;
      ctx.beginPath();
      ctx.ellipse(cx, cy - rh * 0.55, rw * 0.66, rh * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (part.shape === 'sleeve') {
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      roundRect(ctx, cx - rw, cy - rh, rw * 2, rh * 2, rw * 0.85);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = Math.max(1, w / 120);
      ctx.stroke();
    } else if (part.shape === 'shoulders') {
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = Math.max(1, w / 90);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,214,102,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy - rh * 0.35, Math.max(1, w / 70), 0, Math.PI * 2);
      ctx.fill();
    } else if (part.shape === 'scales') {
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.75;
      const cols = 4;
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = cx - rw + ((c + (r % 2 ? 0.5 : 0)) * (rw * 2)) / cols;
          const sy = cy - rh + (r * (rh * 2)) / rows;
          ctx.beginPath();
          ctx.arc(sx, sy, (rw / cols) * 0.9, Math.PI, 0);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (part.shape === 'sash') {
      ctx.fillStyle = dark;
      ctx.fillRect(cx - rw, cy - rh, rw * 2, rh * 2);
      ctx.fillStyle = trim ? rgb(trim, 1) : 'rgba(255,214,102,0.85)';
      ctx.fillRect(cx - rw * 0.16, cy - rh, rw * 0.32, rh * 2);
    } else if (part.shape === 'gauntlet') {
      // 손등을 덮는 토시. 손목 쪽이 넓고 손가락 쪽이 좁다.
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - rw, cy - rh);
      ctx.lineTo(cx + rw, cy - rh);
      ctx.lineTo(cx + rw * 0.72, cy + rh);
      ctx.lineTo(cx - rw * 0.72, cy + rh);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, w / 120);
      ctx.stroke();
      // 손등 장식
      ctx.fillStyle = trim ? rgb(trim, 1) : light;
      ctx.beginPath();
      ctx.arc(cx, cy - rh * 0.15, rw * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (part.shape === 'boot') {
      // 발등을 덮는 신발. 앞쪽이 살짝 길다.
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      roundRect(ctx, cx - rw, cy - rh, rw * 2, rh * 2, rh * 0.75);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, w / 120);
      ctx.stroke();
      // 발목 띠
      ctx.fillStyle = trim ? rgb(trim, 1) : rgb(color, 1.6);
      ctx.fillRect(cx - rw * 0.9, cy - rh * 0.9, rw * 1.8, rh * 0.42);
    } else if (part.shape === 'helm' || part.shape === 'hood' || part.shape === 'cap') {
      // 머리에 쓰는 것. 얼굴은 덮지 않는다 — 눈이 가려지면 누구인지 알 수 없게 된다.
      // 그래서 이마 위 반쪽만 덮고, 볼 옆으로 짧게 내려오는 가리개를 붙인다.
      //
      // 0.58 — **정수리를 반드시 덮는다.**
      // 그 전에는 쓰개가 낮아 머리카락 끝(스프라이트 96×128 기준 y=8~11)이
      // 쓰개 위로 삐져나왔다. 위가 뚫린 그릇처럼 보였다.
      // 고친 방식: appearance.json 의 at 을 올리고 size 의 높이를 키웠다.
      // 그러면 정수리는 덮이지만 **아래로 뻗는 것들(볼가리개·코가리개·챙·뿔·깃)** 이
      // 같이 늘어나 얼굴을 덮는다. 그래서 아래 배수들은 rh 가 커진 만큼 줄여
      // **절대 길이를 예전 그대로** 두었다. 배수만 보고 "짧다" 고 고치면 안 된다.
      const grad = ctx.createLinearGradient(cx, cy - rh, cx, cy + rh);
      grad.addColorStop(0, light);
      grad.addColorStop(1, dark);
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (part.shape === 'hood') {
        // 천 모자 — 챙이 있고 끝이 한쪽으로 늘어진 고깔.
        //
        // 0.55 전까지 마법사만 스프라이트에 뾰족 모자가 박혀 있었다. 그 모자를
        // 여기로 옮겼다 — 그래야 투구를 끼면 **바뀐다.** 그래서 이 모양은
        // "그냥 두건" 이 아니라 마법사가 쓰던 그 고깔이어야 한다.
        const tipX = cx - rw * 0.62;
        const tipY = cy - rh * 1.5;
        ctx.moveTo(cx - rw * 0.95, cy + rh * 0.15);
        ctx.quadraticCurveTo(cx - rw * 0.86, cy - rh * 0.9, tipX, tipY);
        // 오른쪽 어깨의 조절점을 높이 둔다 — 여기가 낮으면 그 아래로 머리가 비친다.
        ctx.quadraticCurveTo(cx + rw * 0.4, cy - rh * 1.5, cx + rw * 0.95, cy + rh * 0.15);
        ctx.closePath();
      } else if (part.shape === 'cap') {
        // 가죽 모자 — 낮게 눌러쓰고 앞에 챙이 있다.
        ctx.moveTo(cx - rw, cy + rh * 0.15);
        ctx.quadraticCurveTo(cx - rw, cy - rh * 1.1, cx, cy - rh * 1.05);
        ctx.quadraticCurveTo(cx + rw, cy - rh * 1.1, cx + rw, cy + rh * 0.15);
        ctx.closePath();
      } else {
        // 쇠 투구 — 정수리가 뾰족하고 옆이 각지다.
        ctx.moveTo(cx - rw, cy + rh * 0.55);
        ctx.lineTo(cx - rw * 0.94, cy - rh * 0.45);
        ctx.quadraticCurveTo(cx, cy - rh * 1.45, cx + rw * 0.94, cy - rh * 0.45);
        ctx.lineTo(cx + rw, cy + rh * 0.55);
        ctx.quadraticCurveTo(cx, cy + rh * 0.05, cx - rw, cy + rh * 0.55);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = Math.max(1, w / 120);
      ctx.stroke();

      if (part.shape === 'hood') {
        // 챙 — 얼굴보다 넓지 않게. 넓으면 얼굴이 작아 보이는 게 아니라 머리가 커 보인다.
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.ellipse(cx, cy + rh * 0.2, rw * 1.15, rh * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.ellipse(cx, cy + rh * 0.05, rw * 1.12, rh * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
        // 챙을 두른 띠
        ctx.fillStyle = dark;
        roundRect(ctx, cx - rw * 0.92, cy - rh * 0.55, rw * 1.84, rh * 0.5, rh * 0.25);
        ctx.fill();
        // 고깔 끝 방울
        ctx.fillStyle = trim ? rgb(trim, 1.1) : 'rgba(255,214,102,0.95)';
        ctx.beginPath();
        ctx.arc(cx - rw * 0.62, cy - rh * 1.5, Math.max(1.4, rw * 0.13), 0, Math.PI * 2);
        ctx.fill();
      } else if (part.shape === 'cap') {
        // 챙
        ctx.fillStyle = dark;
        roundRect(ctx, cx - rw * 1.12, cy + rh * 0.05, rw * 2.24, rh * 0.2, rh * 0.1);
        ctx.fill();
      } else if (part.shape === 'helm') {
        // 볼가리개 둘과 코가리개 하나 — 이것이 있어야 '투구' 로 읽힌다.
        // 눈은 절대 덮지 않는다. 볼 옆으로 길게, 코 위로 가늘게 내린다.
        ctx.fillStyle = dark;
        for (const side of [-1, 1]) {
          roundRect(ctx, cx + side * rw - (side < 0 ? 0 : rw * 0.3), cy + rh * 0.2,
            rw * 0.3, rh * 1.45, rw * 0.12);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = Math.max(1, w / 150);
          ctx.stroke();
        }
        roundRect(ctx, cx - rw * 0.075, cy + rh * 0.35, rw * 0.15, rh * 1.2, rw * 0.075);
        ctx.fill();
      }

      // 이마 장식 — 룬 장비면 그 빛깔로, 아니면 금빛으로.
      ctx.fillStyle = trim ? rgb(trim, 1.2) : 'rgba(255,214,102,0.95)';
      ctx.beginPath();
      ctx.arc(cx, part.shape === 'hood' ? cy - rh * 0.3 : cy - rh * 0.32,
        Math.max(1.4, rw * 0.16), 0, Math.PI * 2);
      ctx.fill();

      // 뿔 — 용린 투구처럼 뿔이 있는 것만.
      if (part.horns) {
        ctx.fillStyle = dark;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(cx + side * rw * 0.82, cy - rh * 0.24);
          ctx.quadraticCurveTo(cx + side * rw * 1.9, cy - rh * 0.75, cx + side * rw * 1.7, cy - rh * 1.19);
          ctx.quadraticCurveTo(cx + side * rw * 1.15, cy - rh * 0.71, cx + side * rw * 0.7, cy - rh * 0.51);
          ctx.closePath();
          ctx.fill();
        }
      }
      // 깃털 장식 — 룬 투구처럼 빛나는 것만.
      if (part.plume) {
        const g2 = trim || color;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(${g2[0]},${g2[1]},${g2[2]},0.8)`;
        ctx.lineWidth = Math.max(1.5, w / 90);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh * 0.92);
        ctx.quadraticCurveTo(cx + rw * 0.3, cy - rh * 1.43, cx - rw * 0.15, cy - rh * 1.7);
        ctx.stroke();
      }
    } else if (part.shape === 'runes') {
      // 룬 장비의 빛나는 무늬. 색이 아니라 빛으로 구분되게 겹쳐 그린다.
      const glow = trim || color;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},0.85)`;
      ctx.lineWidth = Math.max(1, w / 100);
      ctx.lineCap = 'round';
      // 북구 룬처럼 각진 획 세 개. 십자로 보이지 않게 세로획에서 가지를 친다.
      const marks = [
        // 왼쪽 룬 (ᚲ)
        [-0.62, -0.55, -0.62, 0.35],
        [-0.62, -0.1, -0.28, -0.5],
        [-0.62, -0.1, -0.28, 0.3],
        // 가운데 룬 (ᛏ)
        [0, -0.7, 0, 0.55],
        [-0.22, -0.42, 0, -0.7],
        [0.22, -0.42, 0, -0.7],
        // 오른쪽 룬 (ᚱ)
        [0.62, -0.55, 0.62, 0.35],
        [0.62, -0.5, 0.3, -0.2],
        [0.62, -0.1, 0.3, 0.3],
      ];
      for (const [x1, y1, x2, y2] of marks) {
        ctx.beginPath();
        ctx.moveTo(cx + x1 * rw, cy + y1 * rh);
        ctx.lineTo(cx + x2 * rw, cy + y2 * rh);
        ctx.stroke();
      }
      // 룬 아래 은은한 빛무리
      ctx.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},0.16)`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw * 1.1, rh * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ---------- 무기 ----------

/** 손 위치에서 위로 뻗은 무기를 그린다. shape 에 따라 실루엣이 달라진다. */
function drawWeapon(ctx, w, h, at, weapon) {
  const hx = at[0] * w;
  const hy = at[1] * h;
  const s = w / 96; // 96 기준으로 그린 뒤 스케일
  const color = weapon.color;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(0.28); // 살짝 기울여 든다
  ctx.scale(s, s);

  if (weapon.shape === 'club') {
    // 손잡이
    ctx.fillStyle = rgb(color, 0.7);
    roundRect(ctx, -3, -6, 6, 20, 3);
    ctx.fill();
    // 뭉툭한 머리
    const grad = ctx.createLinearGradient(-9, -46, 9, -6);
    grad.addColorStop(0, rgb(color, 1.25));
    grad.addColorStop(1, rgb(color, 0.75));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.quadraticCurveTo(-11, -28, -7, -44);
    ctx.quadraticCurveTo(0, -50, 7, -44);
    ctx.quadraticCurveTo(11, -28, 4, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // 나뭇결 옹이
    ctx.fillStyle = rgb(color, 0.6);
    ctx.beginPath();
    ctx.ellipse(-2, -30, 2.2, 3.4, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(3, -18, 1.6, 2.6, -0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (weapon.shape === 'sword' || weapon.shape === 'greatsword') {
    const big = weapon.shape === 'greatsword';
    const bw = big ? 7 : 4.5; // 날 반폭
    const len = big ? 62 : 50;

    // 손잡이 + 가드
    ctx.fillStyle = '#5a3a1e';
    roundRect(ctx, -2.6, -4, 5.2, 16, 2.6);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    roundRect(ctx, -(bw + 4), -8, (bw + 4) * 2, 4.4, 2.2);
    ctx.fill();

    // 날
    const grad = ctx.createLinearGradient(-bw, 0, bw, 0);
    grad.addColorStop(0, rgb(color, 0.72));
    grad.addColorStop(0.42, rgb(color, 1.18));
    grad.addColorStop(1, rgb(color, 0.85));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-bw, -8);
    ctx.lineTo(bw, -8);
    ctx.lineTo(bw * 0.72, -len);
    ctx.lineTo(0, -len - (big ? 12 : 8));
    ctx.lineTo(-bw * 0.72, -len);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // 중앙 홈
    ctx.strokeStyle = rgb(color, 1.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(0, -len + 4);
    ctx.stroke();
  } else if (weapon.shape === 'bow') {
    // 활은 세워서 든다 — 손잡이를 잡고 활대가 위아래로 뻗는다.
    // 몸에 가리지 않도록 바깥쪽으로 조금 밀어 둔다.
    ctx.rotate(-0.34);
    ctx.translate(7, -6);
    const len = 38;

    ctx.strokeStyle = rgb(color, 1.05);
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(-15, 0, 0, len);
    ctx.stroke();

    ctx.strokeStyle = rgb(color, 0.65);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(-13, 0, 0, len);
    ctx.stroke();

    // 시위
    ctx.strokeStyle = 'rgba(240,235,215,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.lineTo(0, len);
    ctx.stroke();

    // 손잡이
    ctx.fillStyle = rgb(color, 0.5);
    roundRect(ctx, -6, -6, 6, 12, 3);
    ctx.fill();
  } else if (weapon.shape === 'staff') {
    // 지팡이 — 긴 자루 끝에 구슬.
    ctx.fillStyle = rgb(color, 0.62);
    roundRect(ctx, -2.4, -46, 4.8, 62, 2.4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 자루를 감은 끈
    ctx.strokeStyle = rgb(color, 0.42);
    ctx.lineWidth = 1.6;
    for (const y of [-2, 3, 8]) {
      ctx.beginPath();
      ctx.moveTo(-3, y);
      ctx.lineTo(3, y - 2);
      ctx.stroke();
    }

    // 구슬을 감싼 갈고리
    ctx.strokeStyle = rgb(color, 0.75);
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, -50, 9, Math.PI * 0.15, Math.PI * 0.85, true);
    ctx.stroke();

    const orb = weapon.glow || color;
    const og = ctx.createRadialGradient(-2, -52, 1, 0, -50, 8);
    og.addColorStop(0, '#ffffff');
    og.addColorStop(0.45, rgb(orb, 1.15));
    og.addColorStop(1, rgb(orb, 0.65));
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(0, -50, 6.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 무기 기운
  if (weapon.glow) {
    ctx.globalCompositeOperation = 'lighter';
    const g = weapon.glow;
    const grad = ctx.createRadialGradient(0, -34, 1, 0, -34, 42);
    grad.addColorStop(0, `rgba(${g[0]},${g[1]},${g[2]},0.5)`);
    grad.addColorStop(1, `rgba(${g[0]},${g[1]},${g[2]},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, -34, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 장신구의 기운. 발밑에 은은한 고리로 표현한다. */
function drawAura(ctx, w, h, c) {
  const color = `rgba(${c[0]},${c[1]},${c[2]},`;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `${color}0.55)`;
  ctx.lineWidth = Math.max(1.5, h / 90);
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.965, w * 0.34, h * 0.035, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `${color}0.28)`;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.94, w * 0.42, h * 0.045, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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
