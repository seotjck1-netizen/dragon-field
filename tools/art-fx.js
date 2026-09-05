// 전투 이펙트 그림 (0.43).
//
// 왜 필요한가: 예전에는 때리는 쪽이 조금 앞으로 내밀고 맞는 쪽이 흔들리는 것이
// 전부였다. 무엇으로 맞았는지, 세게 맞았는지가 그림에 하나도 안 나왔다.
// 여기서 만드는 것은 **맞는 자리에 한 번 터졌다 사라지는 그림**이다.
//
// 다섯 장뿐이다. 몬스터마다 공격 그림을 그리면 스무 장이 넘고 판마다 늘어난다 —
// 대신 "무엇으로 때렸나" 만 다섯 갈래로 나눈다(벰 · 꿰뚫음 · 마법 · 둔기 · 막음).
// 고르는 규칙은 systems 가 아니라 scenes/BattleScene.js 에 있다.

const fx = (inner, w = 128, h = 128) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;

// 벰 — 칼이 지나간 자리. 위에서 아래로 비스듬히 두 줄.
const SLASH = fx(`
  <defs>
    <linearGradient id="sl" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="0.6" stop-color="#bfe3ff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M18 14 Q70 40 112 104" stroke="url(#sl)" stroke-width="13" fill="none" stroke-linecap="round"/>
  <path d="M18 14 Q70 40 112 104" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.9"/>
  <path d="M40 8 Q84 42 118 78" stroke="url(#sl)" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.75"/>
  <g fill="#ffffff" opacity="0.85">
    <circle cx="96" cy="86" r="3"/><circle cx="106" cy="70" r="2.2"/>
    <circle cx="60" cy="44" r="2.4"/><circle cx="36" cy="26" r="1.8"/>
  </g>`);

// 꿰뚫음 — 화살이 박힌 자리. 뾰족한 쐐기와 뒤로 뻗는 잔상.
const PIERCE = fx(`
  <defs>
    <linearGradient id="pi" x1="0" y1="0.5" x2="1" y2="0.5">
      <stop offset="0" stop-color="#9be86b" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#d6ffb0" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <path d="M6 64 L92 64" stroke="url(#pi)" stroke-width="9" stroke-linecap="round"/>
  <path d="M96 64 L64 44 L74 64 L64 84 Z" fill="#eaffd6"/>
  <path d="M96 64 L74 52 L80 64 L74 76 Z" fill="#ffffff" opacity="0.9"/>
  <g stroke="#9be86b" stroke-width="3" stroke-linecap="round" opacity="0.8">
    <path d="M92 40 L110 26"/><path d="M92 88 L110 102"/><path d="M100 64 L122 64"/>
  </g>`);

// 마법 — 터지는 별. 가운데가 하얗고 바깥이 보랏빛이다.
const MAGIC = fx(`
  <defs>
    <radialGradient id="mg" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.35" stop-color="#cfa8ff" stop-opacity="0.9"/>
      <stop offset="0.75" stop-color="#7b4fd4" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#7b4fd4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="64" cy="64" r="52" fill="url(#mg)"/>
  <g stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.95">
    <path d="M64 10 L64 34"/><path d="M64 94 L64 118"/>
    <path d="M10 64 L34 64"/><path d="M94 64 L118 64"/>
  </g>
  <g stroke="#e6d2ff" stroke-width="3.4" stroke-linecap="round" opacity="0.85">
    <path d="M26 26 L42 42"/><path d="M102 26 L86 42"/>
    <path d="M26 102 L42 86"/><path d="M102 102 L86 86"/>
  </g>
  <circle cx="64" cy="64" r="13" fill="#ffffff"/>`);

// 둔기 — 퍽. 별 모양 충격과 갈라지는 금.
const IMPACT = fx(`
  <defs>
    <radialGradient id="im" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff3c4"/>
      <stop offset="0.5" stop-color="#ffb347" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#ff7a2b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M64 8 L78 46 L118 40 L86 66 L110 100 L64 82 L18 100 L42 66 L10 40 L50 46 Z"
        fill="url(#im)"/>
  <path d="M64 26 L72 50 L96 47 L76 63 L90 84 L64 73 L38 84 L52 63 L32 47 L56 50 Z"
        fill="#fff8dc" opacity="0.95"/>
  <g stroke="#ffd166" stroke-width="3" stroke-linecap="round" opacity="0.8">
    <path d="M64 84 L60 112"/><path d="M84 74 L104 92"/><path d="M44 74 L24 92"/>
  </g>`);

// 막음 — 방패에 튕겼다. 반달 모양 파란 빛.
const GUARD = fx(`
  <defs>
    <linearGradient id="gd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfe4ff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#5b78ff" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <path d="M28 94 Q64 22 100 94" stroke="url(#gd)" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M38 92 Q64 38 90 92" stroke="#ffffff" stroke-width="3.5" fill="none" opacity="0.8"/>
  <g fill="#cfe4ff" opacity="0.9">
    <circle cx="64" cy="34" r="4"/><circle cx="40" cy="60" r="2.6"/><circle cx="88" cy="60" r="2.6"/>
  </g>`);

// 불덩이가 터진 자리 — 마법사(0.56).
//
// 예전에는 마법사도 '터지는 별'(MAGIC) 을 썼다. 보랏빛 별은 '마법을 맞았다' 이지
// '불덩이가 터졌다' 가 아니다. 불은 **가운데가 희고 밖으로 갈수록 붉으며 위로 솟는다.**
// 크기도 다른 갈래보다 크게 잡는다 — 마법사의 한 방은 원래 무겁다.
const FIRE = fx(`
  <defs>
    <radialGradient id="fi" cx="0.5" cy="0.55" r="0.5">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.22" stop-color="#fff3c4"/>
      <stop offset="0.48" stop-color="#ffb347" stop-opacity="0.95"/>
      <stop offset="0.78" stop-color="#ff5a2b" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#a11f0c" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="fi2" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#ffd166" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="64" cy="66" r="60" fill="url(#fi)"/>
  <!-- 위로 솟는 불꽃 혀 -->
  <g fill="#ff8a3d" opacity="0.85">
    <path d="M64 14 Q52 40 64 56 Q76 40 64 14 Z"/>
    <path d="M34 30 Q34 54 52 62 Q48 42 34 30 Z"/>
    <path d="M94 30 Q94 54 76 62 Q80 42 94 30 Z"/>
  </g>
  <g fill="#ffd166" opacity="0.9">
    <path d="M64 26 Q57 44 64 54 Q71 44 64 26 Z"/>
  </g>
  <!-- 가운데 흰 심 -->
  <circle cx="64" cy="66" r="20" fill="url(#fi2)"/>
  <circle cx="64" cy="66" r="10" fill="#ffffff"/>
  <!-- 튀는 불똥 -->
  <g fill="#ffb347">
    <circle cx="24" cy="86" r="4"/><circle cx="104" cy="82" r="3.4"/>
    <circle cx="46" cy="112" r="3"/><circle cx="86" cy="110" r="2.6"/>
    <circle cx="64" cy="120" r="2.4"/>
  </g>
  <g stroke="#ff7a2b" stroke-width="3" stroke-linecap="round" opacity="0.75">
    <path d="M18 96 L4 106"/><path d="M110 92 L124 102"/><path d="M64 104 L64 122"/>
  </g>`);

const FX_SPRITES = {
  fx_fire: FIRE,
  fx_slash: SLASH,
  fx_pierce: PIERCE,
  fx_magic: MAGIC,
  fx_impact: IMPACT,
  fx_guard: GUARD,
};

/**
 * 가만히 선 그림을 **내지르는 자세**로 바꾼다.
 *
 * 직업마다 공격 그림을 처음부터 다시 그리는 대신, 서 있는 그림을 통째로
 * 앞으로 기울이고 무기 궤적을 하나 얹는다. 한 장을 더 그리는 값으로
 * "덤벼든다" 가 만들어진다 — 그림 스무 장을 새로 그리는 것보다 훨씬 싸고,
 * 원본이 바뀌면 이쪽도 저절로 따라온다.
 *
 * @param {string} svg heroSvg 가 만든 96x128 그림
 * @param {string} arc 무기가 지나간 자리(그 직업에 맞는 모양)
 */
function attackPose(svg, arc) {
  const open = svg.indexOf('>') + 1;
  const head = svg.slice(0, open);
  const body = svg.slice(open, svg.lastIndexOf('</svg>'));
  return `${head}
  <g transform="translate(6 2) rotate(-11 48 124)">
    ${body}
  </g>
  ${arc}
</svg>`;
}

// ⚠ 자리 잡기 — 그림은 96x128 이고 사람은 x 20~76 · y 10~124 를 쓴다.
//   궤적을 x 60 보다 왼쪽에 두면 **얼굴을 가로지른다**(처음에 그렇게 그렸다가 고쳤다).
//   그래서 셋 다 몸 **오른쪽 앞**, 손 높이(y 60~110)에 둔다.

/** 휘두른 칼이 지나간 자리 — 용사. 오른쪽 앞을 크게 쓸어내린다. */
const ARC_SWORD = `
  <g opacity="0.95">
    <path d="M62 24 Q106 62 80 108" stroke="#dff0ff" stroke-width="9" fill="none" stroke-linecap="round" opacity="0.7"/>
    <path d="M64 28 Q100 62 78 104" stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <g fill="#ffffff" opacity="0.9">
      <circle cx="94" cy="58" r="2.6"/><circle cx="86" cy="90" r="2"/>
    </g>
  </g>`;

/**
 * 시위를 놓은 자리 — 사냥꾼. 화살 한 대가 앞으로 나간다.
 *
 * ⚠ 각도가 중요하다. 이 화살은 **3시 방향(수평)** 이었는데, 실제로 날아가는
 *   화살(BattleScene 의 _drawShot)은 상대가 오른쪽 위에 서 있어 −24° 로 간다.
 *   그래서 쏘는 순간의 화살과 날아가는 화살이 서로 다른 쪽을 보고 있었다.
 *   여기서 같은 −24° 로 돌려 둘을 맞춘다(둘 다 '2시 방향').
 */
const ARC_ARROW = `
  <g opacity="0.95" transform="rotate(-24 54 76)">
    <path d="M50 76 L96 76" stroke="#d6ffb0" stroke-width="5" stroke-linecap="round"/>
    <path d="M102 76 L84 67 L89 76 L84 85 Z" fill="#eaffd6"/>
    <path d="M48 67 Q42 76 48 85" stroke="#9be86b" stroke-width="3.2" fill="none" stroke-linecap="round"/>
    <path d="M56 76 L44 76" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  </g>`;

/** 지팡이 끝에 맺힌 빛 — 마법사. 오른손 언저리에서 터진다. */
const ARC_SPARK = `
  <g opacity="0.95">
    <circle cx="78" cy="80" r="14" fill="#cfa8ff" opacity="0.5"/>
    <circle cx="78" cy="80" r="6.5" fill="#ffffff"/>
    <g stroke="#e6d2ff" stroke-width="2.8" stroke-linecap="round">
      <path d="M78 60 L78 69"/><path d="M78 91 L78 100"/>
      <path d="M58 80 L67 80"/><path d="M89 80 L98 80"/>
    </g>
  </g>`;

const ATTACK_ARC = { hero: ARC_SWORD, ranger: ARC_ARROW, mage: ARC_SPARK };

module.exports = { FX_SPRITES, attackPose, ATTACK_ARC };
