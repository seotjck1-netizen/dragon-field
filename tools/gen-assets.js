// SVG로 그린 아트를 PNG로 굽는다. (게임 런타임과 무관한 빌드용 스크립트)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = '/home/claude/rpg-game/assets';

// ---------- 공통 조각 ----------
const defsShadowLift = `
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>`;

// ---------- 타일 32x32 ----------
const grassBase = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5fbf5a"/><stop offset="1" stop-color="#3d9440"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#g)"/>
  <path d="M4 26q2-5 4 0M12 21q2-5 4 0M22 27q2-5 4 0M26 14q2-5 4 0M8 12q2-5 4 0M17 8q2-5 4 0"
        stroke="#7ad46f" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.85"/>
  <rect width="32" height="32" fill="none" stroke="#000" stroke-opacity="0.05"/>`;

const TILES = {
  grass: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${grassBase}</svg>`,

  path: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d8b98a"/><stop offset="1" stop-color="#bd9a6b"/>
    </linearGradient></defs>
    <rect width="32" height="32" fill="url(#d)"/>
    <circle cx="7" cy="9" r="1.6" fill="#b08f60" opacity="0.8"/>
    <circle cx="23" cy="13" r="1.9" fill="#b08f60" opacity="0.75"/>
    <circle cx="12" cy="22" r="1.5" fill="#b08f60" opacity="0.7"/>
    <circle cx="26" cy="25" r="1.3" fill="#b08f60" opacity="0.6"/>
    <circle cx="16" cy="15" r="1" fill="#e2c79b" opacity="0.9"/>
    <circle cx="29" cy="4" r="1" fill="#e2c79b" opacity="0.8"/>
    <circle cx="4" cy="19" r="1.1" fill="#e2c79b" opacity="0.7"/>
  </svg>`,

  tree: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${grassBase}
    <ellipse cx="16" cy="29" rx="8" ry="2.6" fill="#000" opacity="0.22"/>
    <rect x="14" y="19" width="4" height="9" rx="1.6" fill="#6b4423"/>
    <circle cx="16" cy="14" r="10" fill="#20713a"/>
    <circle cx="12.5" cy="11.5" r="6.5" fill="#2c8f47"/>
    <circle cx="19.5" cy="12.5" r="6" fill="#2c8f47"/>
    <circle cx="13" cy="9" r="3.4" fill="#48b062" opacity="0.9"/>
  </svg>`,

  rock: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${grassBase}
    <ellipse cx="16" cy="27" rx="9" ry="2.6" fill="#000" opacity="0.22"/>
    <path d="M6 27 L10 12 L17 8 L25 13 L27 27 Z" fill="#8b95a6"/>
    <path d="M10 12 L17 8 L19 16 L12 18 Z" fill="#a7b1c1"/>
    <path d="M19 16 L25 13 L27 27 L20 26 Z" fill="#6f7a8c"/>
  </svg>`,

  water: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <defs><linearGradient id="w" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4aa6e0"/><stop offset="1" stop-color="#2a6fb0"/>
    </linearGradient></defs>
    <rect width="32" height="32" fill="url(#w)"/>
    <path d="M2 9q4-3 8 0t8 0 8 0 8 0" stroke="#8fd4f5" stroke-width="1.6" fill="none" opacity="0.7" stroke-linecap="round"/>
    <path d="M-2 19q4-3 8 0t8 0 8 0 8 0" stroke="#8fd4f5" stroke-width="1.4" fill="none" opacity="0.5" stroke-linecap="round"/>
    <path d="M2 27q4-3 8 0t8 0 8 0 8 0" stroke="#8fd4f5" stroke-width="1.2" fill="none" opacity="0.4" stroke-linecap="round"/>
  </svg>`,

  flower: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    ${grassBase}
    <g>
      <circle cx="10" cy="12" r="2.4" fill="#ff7ba8"/><circle cx="10" cy="12" r="1" fill="#ffe08a"/>
      <circle cx="22" cy="19" r="2.4" fill="#ffd166"/><circle cx="22" cy="19" r="1" fill="#fff3c4"/>
      <circle cx="16" cy="26" r="2" fill="#c58cff"/><circle cx="16" cy="26" r="0.8" fill="#fff"/>
    </g>
  </svg>`,
};

// ---------- 캐릭터 (viewBox 96x128) ----------
// 초기 차림: 민소매(나시) + 반바지, 맨팔·맨다리.
// 무기와 망토·소매는 여기에 그리지 않는다 — 장비에 따라 core/Appearance.js 가 얹는다.
const HERO = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="tunic" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f8ef7"/><stop offset="1" stop-color="#2b5fc4"/>
    </linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8b5a2b"/><stop offset="1" stop-color="#5e3a17"/>
    </linearGradient>
    <linearGradient id="shorts" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c7a4e"/><stop offset="1" stop-color="#6b4f2c"/>
    </linearGradient>
    ${defsShadowLift}
  </defs>

  <!-- 맨다리 -->
  <rect x="37" y="96" width="9" height="16" rx="4.5" fill="#f0c39a"/>
  <rect x="50" y="96" width="9" height="16" rx="4.5" fill="#f0c39a"/>

  <!-- 샌들 -->
  <ellipse cx="41.5" cy="114" rx="7.5" ry="4.2" fill="#6b4423"/>
  <ellipse cx="54.5" cy="114" rx="7.5" ry="4.2" fill="#6b4423"/>
  <path d="M36 112 l11 -3M49 112 l11 -3" stroke="#8b5a2b" stroke-width="2.4" stroke-linecap="round"/>

  <!-- 반바지 -->
  <path d="M32 82 L64 82 L63 99 L51 99 L48 90 L45 99 L33 99 Z" fill="url(#shorts)"/>
  <rect x="31" y="80" width="34" height="6" rx="3" fill="#7a5a34"/>
  <rect x="44" y="80" width="8" height="6" rx="2" fill="#ffd166"/>

  <!-- 민소매 상의 -->
  <path d="M34 54 Q36 49 42 48 L54 48 Q60 49 62 54 L64 84 Q48 89 32 84 Z" fill="url(#tunic)"/>
  <path d="M42 48 Q48 56 54 48" fill="#1f4a9e" opacity="0.55"/>
  <path d="M34 54 Q48 60 62 54 L62 64 Q48 70 34 64 Z" fill="url(#rim)"/>

  <!-- 맨팔 (어깨가 드러난다) -->
  <rect x="24" y="54" width="10" height="34" rx="5" fill="#f0c39a"/>
  <rect x="62" y="54" width="10" height="34" rx="5" fill="#f0c39a"/>
  <circle cx="29" cy="90" r="6" fill="#f7cfa6"/>
  <circle cx="67" cy="90" r="6" fill="#f7cfa6"/>
  <circle cx="29" cy="56" r="5.4" fill="#f7cfa6"/>
  <circle cx="67" cy="56" r="5.4" fill="#f7cfa6"/>

  <!-- 머리 -->
  <ellipse cx="48" cy="34" rx="21" ry="20" fill="#f7cfa6"/>
  <path d="M27 32 Q30 8 48 8 Q66 8 69 32 Q60 22 48 24 Q36 22 27 32 Z" fill="url(#hair)"/>
  <ellipse cx="40" cy="36" rx="3.4" ry="4.2" fill="#2a2118"/>
  <ellipse cx="56" cy="36" rx="3.4" ry="4.2" fill="#2a2118"/>
  <circle cx="41.2" cy="34.4" r="1.2" fill="#fff"/>
  <circle cx="57.2" cy="34.4" r="1.2" fill="#fff"/>
  <path d="M43 45 q5 4 10 0" stroke="#b5764c" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="42" r="3.6" fill="#ff9c9c" opacity="0.5"/>
  <circle cx="64" cy="42" r="3.6" fill="#ff9c9c" opacity="0.5"/>
</svg>`;

// ---------- 몬스터 (viewBox 128x128) ----------
const SLIME = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <radialGradient id="sl" cx="0.38" cy="0.3" r="0.85">
      <stop offset="0" stop-color="#8fe6ff"/><stop offset="0.55" stop-color="#3fb6ea"/>
      <stop offset="1" stop-color="#1d7fbd"/>
    </radialGradient>
  </defs>
  <path d="M18 104 Q10 62 40 36 Q64 16 88 36 Q118 62 110 104 Q64 116 18 104 Z" fill="url(#sl)"/>
  <path d="M18 104 Q64 116 110 104 Q64 112 18 104 Z" fill="#0f5f92" opacity="0.5"/>
  <ellipse cx="46" cy="46" rx="15" ry="10" fill="#fff" opacity="0.55" transform="rotate(-22 46 46)"/>
  <ellipse cx="48" cy="70" rx="8" ry="10" fill="#10344a"/>
  <ellipse cx="82" cy="70" rx="8" ry="10" fill="#10344a"/>
  <circle cx="51" cy="66" r="3" fill="#fff"/><circle cx="85" cy="66" r="3" fill="#fff"/>
  <path d="M56 88 q9 9 18 0" stroke="#10344a" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

const BAT = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="wing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6b4fa8"/><stop offset="1" stop-color="#3a2762"/>
    </linearGradient>
    <radialGradient id="body" cx="0.4" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#7d5fbd"/><stop offset="1" stop-color="#402a70"/>
    </radialGradient>
  </defs>
  <path d="M46 60 Q18 34 4 46 Q16 52 12 66 Q24 62 30 74 Q36 64 46 66 Z" fill="url(#wing)"/>
  <path d="M82 60 Q110 34 124 46 Q112 52 116 66 Q104 62 98 74 Q92 64 82 66 Z" fill="url(#wing)"/>
  <ellipse cx="64" cy="72" rx="26" ry="28" fill="url(#body)"/>
  <path d="M44 50 L48 24 L62 44 Z" fill="#5b3f96"/>
  <path d="M84 50 L80 24 L66 44 Z" fill="#5b3f96"/>
  <path d="M47 46 L49 32 L58 45 Z" fill="#c58cff" opacity="0.6"/>
  <path d="M81 46 L79 32 L70 45 Z" fill="#c58cff" opacity="0.6"/>
  <ellipse cx="54" cy="66" rx="7.5" ry="8.5" fill="#ffe066"/>
  <ellipse cx="76" cy="66" rx="7.5" ry="8.5" fill="#ffe066"/>
  <ellipse cx="54" cy="67" rx="3" ry="5" fill="#2a1840"/>
  <ellipse cx="76" cy="67" rx="3" ry="5" fill="#2a1840"/>
  <path d="M56 84 L60 92 L64 84 L68 92 L72 84" stroke="#fff" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
</svg>`;

const MUSHROOM = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="cap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ff7a6b"/><stop offset="1" stop-color="#c3352c"/>
    </linearGradient>
    <linearGradient id="stalk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdf0d5"/><stop offset="1" stop-color="#d9c39a"/>
    </linearGradient>
  </defs>
  <path d="M40 66 Q38 100 44 110 L84 110 Q90 100 88 66 Z" fill="url(#stalk)"/>
  <path d="M10 68 Q14 22 64 20 Q114 22 118 68 Q64 82 10 68 Z" fill="url(#cap)"/>
  <circle cx="34" cy="48" r="9" fill="#ffeede" opacity="0.95"/>
  <circle cx="66" cy="38" r="11" fill="#ffeede" opacity="0.95"/>
  <circle cx="97" cy="52" r="8" fill="#ffeede" opacity="0.95"/>
  <path d="M10 68 Q64 82 118 68 Q64 76 10 68 Z" fill="#8c211b" opacity="0.5"/>
  <path d="M44 82 L60 88" stroke="#6b5a3c" stroke-width="4" stroke-linecap="round"/>
  <path d="M84 82 L68 88" stroke="#6b5a3c" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="52" cy="94" rx="6" ry="7" fill="#3a2f1c"/>
  <ellipse cx="76" cy="94" rx="6" ry="7" fill="#3a2f1c"/>
  <circle cx="54" cy="91" r="2" fill="#fff"/><circle cx="78" cy="91" r="2" fill="#fff"/>
  <path d="M56 106 q8 -6 16 0" stroke="#3a2f1c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

// ---------- 아이템 아이콘 64x64 ----------
function itemSvg(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;
}

const ITEMS = {
  wooden_sword: itemSvg(`
    <g transform="rotate(-38 32 32)">
      <path d="M28 6 L36 6 L36 40 L32 46 L28 40 Z" fill="#c89a5e"/>
      <path d="M28 6 L32 6 L32 40 L30 43 Z" fill="#e0b87f"/>
      <rect x="20" y="40" width="24" height="5" rx="2.5" fill="#8b5a2b"/>
      <rect x="29" y="45" width="6" height="13" rx="3" fill="#6b4423"/>
      <circle cx="32" cy="58" r="4" fill="#a3702f"/>
    </g>`),
  iron_sword: itemSvg(`
    <g transform="rotate(-38 32 32)">
      <path d="M27 4 L37 4 L37 40 L32 47 L27 40 Z" fill="#b9c4d4"/>
      <path d="M27 4 L32 4 L32 40 L29.5 43.5 Z" fill="#eff4fa"/>
      <rect x="18" y="40" width="28" height="6" rx="3" fill="#ffd166"/>
      <rect x="29" y="46" width="6" height="13" rx="3" fill="#5a3a1e"/>
      <circle cx="32" cy="59" r="4.2" fill="#ffd166"/>
    </g>`),
  cloth_armor: itemSvg(`
    <path d="M20 14 L28 10 L36 10 L44 14 L48 24 L41 27 L41 52 L23 52 L23 27 L16 24 Z" fill="#e8ddc4"/>
    <path d="M28 10 L32 20 L36 10 Z" fill="#cdbf9d"/>
    <rect x="23" y="38" width="18" height="5" rx="2" fill="#b9a67f"/>`),
  leather_armor: itemSvg(`
    <path d="M20 14 L28 10 L36 10 L44 14 L48 24 L41 27 L41 52 L23 52 L23 27 L16 24 Z" fill="#9c6b3f"/>
    <path d="M28 10 L32 20 L36 10 Z" fill="#7a5230"/>
    <rect x="23" y="36" width="18" height="6" rx="3" fill="#5d3d22"/>
    <circle cx="27" cy="28" r="2" fill="#d9b48a"/><circle cx="37" cy="28" r="2" fill="#d9b48a"/>`),
  swift_ring: itemSvg(`
    <circle cx="32" cy="38" r="16" fill="none" stroke="#ffd166" stroke-width="6"/>
    <circle cx="32" cy="38" r="16" fill="none" stroke="#fff0b8" stroke-width="2"/>
    <path d="M32 8 L38 20 L26 20 Z" fill="#7cc4ff"/>
    <circle cx="32" cy="18" r="6" fill="#4fa8ef"/>
    <circle cx="30" cy="16" r="2" fill="#dff1ff"/>`),
  herb: itemSvg(`
    <path d="M32 54 Q32 34 32 20" stroke="#4a7c37" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M32 34 Q14 32 12 16 Q30 14 32 34 Z" fill="#5fbf5a"/>
    <path d="M32 30 Q50 26 54 12 Q34 12 32 30 Z" fill="#7ad46f"/>
    <path d="M32 46 Q20 46 18 36 Q30 34 32 46 Z" fill="#4a9e4a"/>`),
  slime_jelly: itemSvg(`
    <path d="M32 8 Q50 30 50 40 A18 18 0 1 1 14 40 Q14 30 32 8 Z" fill="#4fc3f7"/>
    <path d="M32 14 Q44 32 44 40 A12 12 0 0 1 22 44 Z" fill="#8fe6ff" opacity="0.6"/>
    <ellipse cx="25" cy="34" rx="5" ry="7" fill="#fff" opacity="0.75" transform="rotate(-20 25 34)"/>`),
  bat_fang: itemSvg(`
    <path d="M22 10 Q32 6 42 10 L36 34 Q32 56 28 34 Z" fill="#f2f5fa"/>
    <path d="M22 10 Q28 8 30 10 L30 40 Q27 44 26 30 Z" fill="#fff"/>
    <path d="M22 10 Q32 16 42 10" stroke="#c9d3e0" stroke-width="2.5" fill="none"/>`),
};

// ---------- 전투 배경 640x480 ----------
const BATTLE_BG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a3c6b"/><stop offset="0.45" stop-color="#3d5484"/>
      <stop offset="0.62" stop-color="#5b6f93"/><stop offset="1" stop-color="#1a2438"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3c6b45"/><stop offset="1" stop-color="#1c3325"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#ffd9a0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="640" height="480" fill="url(#sky)"/>
  <circle cx="320" cy="200" r="180" fill="url(#glow)"/>
  <path d="M0 250 L90 170 L160 250 L250 150 L340 250 L430 180 L520 250 L640 165 L640 300 L0 300 Z" fill="#243453" opacity="0.85"/>
  <path d="M0 275 L80 220 L170 280 L280 215 L380 280 L480 225 L570 285 L640 240 L640 320 L0 320 Z" fill="#1c2942" opacity="0.9"/>
  <rect y="290" width="640" height="190" fill="url(#ground)"/>
  <ellipse cx="320" cy="300" rx="420" ry="40" fill="#4a7d55" opacity="0.5"/>
  <g opacity="0.35" fill="#8fd48a">
    <path d="M60 340q4-14 8 0M140 380q4-14 8 0M420 350q4-14 8 0M560 400q4-14 8 0M250 420q4-14 8 0"/>
  </g>
  <rect y="300" width="640" height="180" fill="#000" opacity="0.12"/>
</svg>`;

// ---------- 확장 아트 (마을/NPC/보스/상위 아이템) ----------
const EXT = require('./art-town.js');
const GEAR = require('./art-gear.js');
const CLS = require('./art-class.js');
const DEEP = require('./art-deep.js');
const GEMS = require('./art-gems.js');
const VOLC = require('./art-volcano.js');
const WEST = require('./art-west.js');

// ---------- 렌더 ----------
const JOBS = [];
for (const [name, svg] of Object.entries({
  ...TILES, ...EXT.TOWN_TILES, ...GEAR.SIGN_TILES, ...DEEP.DEEP_TILES, ...VOLC.VOLCANO_TILES,
  ...WEST.WEST_TILES,
})) {
  JOBS.push({ svg, w: 32, h: 32, out: `tiles/${name}.png` });
}
// 직업별 주인공 스프라이트는 tools/art-class.js 에서 만든다.
// (원본 일러스트로 바꾸고 싶으면 tools/prep-hero.py 를 쓰고 아래 루프를 주석 처리할 것)
// 운영자 모습도 같은 규격으로 굽는다. 직업이 아니므로 CLASS_SPRITES 에 넣지 않는다
// (넣으면 접속 화면의 직업 고르기에 나타난다).
const ADMIN_ART = require('./art-admin.js');
const FX = require('./art-fx.js');
for (const [name, svg] of Object.entries({ ...CLS.CLASS_SPRITES, admin: ADMIN_ART.ADMIN })) {
  JOBS.push({ svg, w: 96, h: 128, out: `sprites/characters/${name}_field.png` });
  JOBS.push({ svg, w: 384, h: 512, out: `sprites/characters/${name}_battle.png` });
  // 0.43 — 내지르는 자세. 전투에서 때리는 순간에만 이 그림으로 바뀐다.
  // 서 있는 그림을 기울이고 무기 궤적을 얹어 만든다(따로 그리지 않는다).
  const arc = FX.ATTACK_ARC[name];
  if (arc) {
    JOBS.push({ svg: FX.attackPose(svg, arc), w: 384, h: 512,
                out: `sprites/characters/${name}_attack.png` });
  }
  // 0.56 — 전투 기본 자세. 전투 화면에서 **서 있는 동안** 쓰는 그림이다.
  // (차렷으로 서 있던 것을 팔·다리를 다시 그려 싸울 자세로 바꿨다)
  const stance = CLS.CLASS_STANCE[name];
  if (stance) {
    JOBS.push({ svg: stance, w: 384, h: 512, out: `sprites/characters/${name}_stance.png` });
  }
}

// 전투 이펙트 — 맞는 자리에 한 번 터졌다 사라지는 그림 다섯 장.
// 그리는 크기는 128 이고 파일은 192 로 굽는다(1.5배). 다른 그림은 2배로 굽지만
// 이것은 0.3초만 스치는 빛이라 그만큼 선명할 필요가 없다 —
// 256 으로 구웠더니 다섯 장이 320KB 였고, 한 장짜리 html 이 그만큼 무거워졌다.
for (const [name, svg] of Object.entries(FX.FX_SPRITES)) {
  JOBS.push({ svg, w: 192, h: 192, out: `fx/${name}.png` });
}

for (const [key, svg] of Object.entries(EXT.NPCS)) {
  const name = key.replace(/^npc_/, '');
  JOBS.push({ svg, w: 96, h: 128, out: `sprites/npc/${name}.png` });
}
JOBS.push({ svg: EXT.QUEST_BOARD, w: 96, h: 128, out: 'sprites/npc/quest_board.png' });
JOBS.push({ svg: DEEP.WAYPOINT_STONE, w: 96, h: 128, out: 'sprites/npc/waypoint.png' });
JOBS.push({ svg: DEEP.GATE_MERCHANT, w: 96, h: 128, out: 'sprites/npc/gate_merchant.png' });
JOBS.push({ svg: WEST.WITCH, w: 96, h: 128, out: 'sprites/npc/witch.png' });

const MON = {
  slime: SLIME,
  bat: BAT,
  mushroom: MUSHROOM,
  wolf: EXT.WOLF,
  imp: EXT.IMP,
  skeleton: EXT.SKELETON,
  demon_soldier: EXT.DEMON_SOLDIER,
  imp_captain: EXT.IMP_CAPTAIN,
  demon_general: EXT.DEMON_GENERAL,
  great_dragon: WEST.GREAT_DRAGON,
  elder_dragon: WEST.ELDER_DRAGON,
};
const MONFX = require('./art-monfx.js');
for (const [name, svg] of Object.entries(MON)) {
  JOBS.push({ svg, w: 48, h: 48, out: `sprites/monsters/${name}_field.png` });
  JOBS.push({ svg, w: 256, h: 256, out: `sprites/monsters/${name}_battle.png` });
  // 0.44 — 덤벼드는 자세. 전투에서 때리는 순간에만 이 그림으로 바뀐다.
  // 몬스터는 왼쪽(주인공 쪽)을 보고 서 있으므로 자국도 왼쪽 앞에 붙는다.
  const how = MONFX.MON_ATTACK[name];
  if (how) {
    JOBS.push({ svg: MONFX.attackPose(svg, how), w: 256, h: 256,
                out: `sprites/monsters/${name}_attack.png` });
  }
}
for (const [name, svg] of Object.entries({ ...ITEMS, ...EXT.NEW_ITEMS, ...GEAR.GEAR_ITEMS, ...CLS.CLASS_ITEMS, ...DEEP.DEEP_ITEMS, ...GEMS.GEM_ITEMS, ...WEST.WEST_ITEMS })) {
  JOBS.push({ svg, w: 64, h: 64, out: `ui/items/${name}.png` });
}
JOBS.push({ svg: BATTLE_BG, w: 640, h: 480, out: 'ui/battle_bg_field.png' });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  for (const job of JOBS) {
    const svg = job.svg.replace(/\{W\}/g, job.w).replace(/\{H\}/g, job.h);
    await page.setContent(
      `<body style="margin:0;background:transparent">
         <div id="t" style="width:${job.w}px;height:${job.h}px;line-height:0">${svg}</div>
       </body>`
    );
    const el = await page.$('#t');
    const file = path.join(OUT, job.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await el.screenshot({ path: file, omitBackground: true });
    console.log('✓', job.out);
  }
  await browser.close();
})();
