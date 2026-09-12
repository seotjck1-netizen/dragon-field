// 직업별 캐릭터 스프라이트와 직업 무기 아이콘.
//
// ── 절대 어기면 안 되는 규칙 ────────────────────────────────
// ① 몸통 상의는 반드시 "파란색"으로 그린다.
//    core/Appearance.js 가 이 파란색을 찾아 갑옷 색으로 갈아끼운다.
//    (appearance.json 의 regions.tunic — 몸통 높이 0.34~0.72 구간의 파란 픽셀)
//    → 그 구간에 파란 소품(장식·보석)을 두면 갑옷 색으로 같이 물든다. 두지 말 것.
// ② 팔·손·발의 "중심 좌표"는 세 직업이 같아야 한다.
//    소매(0.302 / 0.698) · 장갑(0.705) · 신발(0.432 / 0.568, 0.888) 파츠가
//    그 자리에 얹히기 때문이다. 굵기는 바꿔도 되지만 중심은 옮기지 말 것.
// ③ 손에 드는 무기는 여기서 그리지 않는다. 장비에 따라 Appearance 가 얹는다.
//
// 96x128 로 그려서 필드는 48x64, 전투는 384x512 로 굽는다.
// 전투 화면이 4배 확대라서 얼굴 표정까지 다 보인다 — 그래서 얼굴을 공들여 그린다.

// 얼굴 부품 — 눈·눈썹·귀·머리띠·뾰족머리. 시안판(tools/face-options.js)과 **같은 조각**을 쓴다.
const F = require('./art-face.js');

const RIM = `
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.35"/>
    <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>`;

// 팔·손·발 중심 — 세 직업 공통(파츠가 여기에 얹힌다)
const ARM_CX = [29, 67];
const HAND_CY = 90;

/**
 * @param {object} o
 * @param {string} o.id            그라디언트 id 충돌 방지용
 * @param {[string,string,string]} o.skin  [밝은살, 기본살, 그늘살]
 * @param {[string,string]} o.hair 머리색 [밝은쪽, 어두운쪽]
 * @param {number} o.armW          팔 굵기(중심은 고정)
 * @param {number} o.torso         상의 반폭
 * @param {string} o.face          얼굴(눈·코·입·수염) SVG
 * @param {string} [o.hairShape]   앞머리 path
 * @param {string} [o.behind]      몸 뒤(땋은 머리·화살통)
 * @param {string} [o.headgear]    머리 위(두건·모자)
 * @param {string} [o.body]        상의 위에 덧그릴 것(끈·여밈)
 * @param {string} [o.front]       맨 앞(목걸이 등)
 * @param {string} [o.neck]        목 모양 조정
 */
function heroSvg({
  id, skin, hair, armW, torso, face,
  hairShape, behind = '', headgear = '', body = '', front = '', neck = '',
  pose = 'idle',
}) {
  const [skinLit, skinMid, skinDark] = skin;
  const L = 48 - torso; // 상의 좌
  const R = 48 + torso; // 상의 우
  const ready = pose === 'ready';

  // ── 전투 자세 (0.56) ───────────────────────────────────────
  //
  // 전투가 시작되면 **차렷** 으로 서 있었다. 필드를 걷던 그림 그대로였기 때문이다.
  // 기울이기만으로는 차렷이 기운 것일 뿐이라, 팔을 아예 다시 그린다 —
  // 팔꿈치를 굽혀 두 손을 앞으로 올리고, 다리를 벌려 무게를 앞발에 싣는다.
  // 팔·손·발의 중심 좌표(ARM_CX / HAND_CY)는 파츠(소매·장갑)가 얹히는 자리라
  // **크게는 못 옮긴다** — 아주 조금만 당긴다.
  const READY = {
    handDX: [3.5, -2.5], // 왼손은 앞으로, 오른손은 몸 쪽으로 당긴다
    handDY: -7,          // 두 손을 함께 올린다
    elbow: 5,            // 팔꿈치를 바깥으로 민다
  };
  const hdx = (k) => (ready ? READY.handDX[k] : 0);
  const hdy = ready ? READY.handDY : 0;

  // 팔은 어깨가 굵고 손목이 가늘다. 통짜 캡슐로 그리면 풍선처럼 보인다.
  // 몸통보다 먼저 그려서 어깨가 상의 밑으로 들어가게 한다(팔이 붕 떠 보이지 않게).
  const arm = (cx, dir, k) => {
    const top = armW * 0.55;
    const wrist = armW * 0.36;
    if (!ready) {
      return `
  <path d="M${cx - top} 52 Q${cx - top - 0.6 * dir} 70 ${cx - wrist} 87
           Q${cx} 90 ${cx + wrist} 87
           Q${cx + top + 0.6 * dir} 70 ${cx + top} 52 Z" fill="url(#arm_${id})"/>
  <path d="M${cx - top * 0.55} 54 Q${cx - top * 0.5} 70 ${cx - wrist * 0.5} 85"
        stroke="${skinLit}" stroke-width="${armW * 0.34}" fill="none" stroke-linecap="round" opacity="0.4"/>
  <path d="M${cx - top * 0.5} 63 q${top * 0.5} 2.5 ${top} 0" stroke="${skinDark}" stroke-width="0.9" fill="none" opacity="0.4"/>`;
    }
    // 굽힌 팔 — 어깨에서 팔꿈치까지는 바깥으로, 팔꿈치에서 손까지는 안쪽 앞으로.
    const ex = cx + READY.elbow * dir; // 팔꿈치
    const ey = 72;
    const hx = cx + hdx(k);
    const hy = HAND_CY + hdy;
    return `
  <path d="M${cx - top} 52 L${ex - wrist} ${ey - 2} L${hx - wrist} ${hy}
           Q${hx} ${hy + 3} ${hx + wrist} ${hy}
           L${ex + wrist} ${ey + 2} L${cx + top} 52 Z" fill="url(#arm_${id})"/>
  <path d="M${cx - top * 0.5} 55 L${ex - wrist * 0.4} ${ey - 1}"
        stroke="${skinLit}" stroke-width="${armW * 0.32}" fill="none" stroke-linecap="round" opacity="0.4"/>
  <circle cx="${ex}" cy="${ey}" r="${armW * 0.44}" fill="url(#arm_${id})"/>
  <path d="M${ex - wrist * 0.6} ${ey + 3} L${hx - wrist * 0.5} ${hy - 2}"
        stroke="${skinLit}" stroke-width="${armW * 0.26}" fill="none" stroke-linecap="round" opacity="0.35"/>`;
  };
  const hand = (cx, k) => {
    const x = cx + hdx(k);
    const y = HAND_CY + hdy;
    return `
  <circle cx="${x}" cy="${y}" r="${armW * 0.5}" fill="${skinMid}"/>
  <circle cx="${x - armW * 0.12}" cy="${y - armW * 0.14}" r="${armW * 0.3}" fill="${skinLit}" opacity="0.6"/>
  <path d="M${x - armW * 0.3} ${y + armW * 0.22} q${armW * 0.3} ${armW * 0.2} ${armW * 0.6} 0"
        stroke="${skinDark}" stroke-width="0.9" fill="none" opacity="0.45"/>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="tunic_${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5b98fa"/><stop offset="0.55" stop-color="#3d76e0"/>
      <stop offset="1" stop-color="#2b5fc4"/>
    </linearGradient>
    <linearGradient id="hair_${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${hair[0]}"/><stop offset="1" stop-color="${hair[1]}"/>
    </linearGradient>
    <linearGradient id="arm_${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${skinMid}"/><stop offset="0.55" stop-color="${skinLit}"/>
      <stop offset="1" stop-color="${skinDark}"/>
    </linearGradient>
    <radialGradient id="face_${id}" cx="0.42" cy="0.36" r="0.78">
      <stop offset="0" stop-color="${skinLit}"/><stop offset="0.7" stop-color="${skinMid}"/>
      <stop offset="1" stop-color="${skinDark}"/>
    </radialGradient>
    <linearGradient id="shorts_${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9c7a4e"/><stop offset="1" stop-color="#5d4326"/>
    </linearGradient>
    ${RIM}
  </defs>

  <!-- 바닥 그림자 -->
  <ellipse cx="48" cy="118" rx="20" ry="5" fill="#000" opacity="0.20"/>

  <!-- 몸 뒤 소품 -->
  ${behind}

  <!-- 맨다리. 전투 자세에서는 앞뒤로 벌리고 무릎을 살짝 굽힌다. -->
  ${ready
    ? `<path d="M36 95 L45 95 L47 113 L38 113 Z" fill="url(#arm_${id})"/>
  <path d="M51 95 L60 95 L63 112 L54 112 Z" fill="url(#arm_${id})"/>
  <path d="M39 99 l1 9M55 99 l1 8" stroke="${skinDark}" stroke-width="1" opacity="0.4"/>`
    : `<rect x="37" y="95" width="9" height="18" rx="4.5" fill="url(#arm_${id})"/>
  <rect x="50" y="95" width="9" height="18" rx="4.5" fill="url(#arm_${id})"/>
  <path d="M39 99 l0 9M52 99 l0 9" stroke="${skinDark}" stroke-width="1" opacity="0.4"/>`}

  <!-- 샌들 -->
  ${ready
    ? `<ellipse cx="41" cy="115" rx="8.2" ry="4.2" fill="#5a3a1e" transform="rotate(-6 41 115)"/>
  <ellipse cx="58" cy="114" rx="8.2" ry="4.2" fill="#5a3a1e" transform="rotate(8 58 114)"/>
  <ellipse cx="41" cy="113.6" rx="7.6" ry="3.6" fill="#7a5230" transform="rotate(-6 41 113.6)"/>
  <ellipse cx="58" cy="112.6" rx="7.6" ry="3.6" fill="#7a5230" transform="rotate(8 58 112.6)"/>`
    : `<ellipse cx="41.5" cy="114" rx="7.6" ry="4.2" fill="#5a3a1e"/>
  <ellipse cx="54.5" cy="114" rx="7.6" ry="4.2" fill="#5a3a1e"/>
  <ellipse cx="41.5" cy="112.6" rx="7.2" ry="3.6" fill="#7a5230"/>
  <ellipse cx="54.5" cy="112.6" rx="7.2" ry="3.6" fill="#7a5230"/>
  <path d="M36 112 l11 -3M49 112 l11 -3" stroke="#9c6b3d" stroke-width="2.2" stroke-linecap="round"/>`}

  <!-- 반바지 -->
  <path d="M${L + 2} 82 L${R - 2} 82 L${R - 3} 100 L51 100 L48 90 L45 100 L${L + 3} 100 Z" fill="url(#shorts_${id})"/>
  <path d="M${L + 2} 82 L${R - 2} 82 L${R - 2.4} 88 L${L + 2.4} 88 Z" fill="#000" opacity="0.12"/>
  <rect x="${L + 1}" y="80" width="${torso * 2 - 2}" height="6" rx="3" fill="#6b4f2c"/>
  <rect x="44" y="79.5" width="8" height="7" rx="2" fill="#ffd166"/>
  <rect x="45.4" y="81" width="5.2" height="4" rx="1.4" fill="#c99a2e"/>

  <!-- 맨팔 (상의보다 먼저 — 어깨가 옷 밑으로 들어간다) -->
  ${arm(ARM_CX[0], -1, 0)}
  ${arm(ARM_CX[1], 1, 1)}

  <!-- 민소매 상의 (이 파란색이 갑옷 색으로 바뀐다) -->
  <path d="M${L} 54 Q${L + 2} 48.5 ${L + 8} 47.5 L${R - 8} 47.5 Q${R - 2} 48.5 ${R} 54 L${R + 2} 84 Q48 90 ${L - 2} 84 Z" fill="url(#tunic_${id})"/>
  <path d="M${L + 8} 47.5 Q48 56 ${R - 8} 47.5" fill="#1f4a9e" opacity="0.5"/>
  <path d="M${L} 54 Q48 60 ${R} 54 L${R} 63 Q48 69 ${L} 63 Z" fill="url(#rim)"/>
  <path d="M${L + 4} 66 Q48 72 ${R - 4} 66" stroke="#1f4a9e" stroke-width="1.2" fill="none" opacity="0.45"/>
  ${body}

  <!-- 목 -->
  ${neck || `<rect x="43" y="44" width="10" height="8" rx="4" fill="${skinDark}"/>`}

  <!-- 손 -->
  ${hand(ARM_CX[0], 0)}
  ${hand(ARM_CX[1], 1)}

  <!-- 얼굴 -->
  ${face}

  <!-- 머리카락 -->
  <path d="${hairShape}" fill="url(#hair_${id})"/>

  <!-- 머리 장식 -->
  ${headgear}
  <!-- 맨 앞 소품 -->
  ${front}
</svg>`;
}

// ════════════════════════════════════════════════════════════
//  용사 — 힘이 넘치는 남자. 각진 턱, 짙은 눈썹, 수염 자국, 흉터.
// ════════════════════════════════════════════════════════════
const WARRIOR_OPTS = ({
  id: 'w',
  // 0.56 — 얼굴을 다시 손봤다.
  //
  // 사냥꾼이 세지자 용사가 상대적으로 밋밋해 보였다. 고친 곳은 넷이다.
  //   · 턱      둥근 아래턱 → 각진 사각턱에 턱 가운데 홈
  //   · 눈      갈색 → 푸른 눈. 흰자를 넓혀 눈빛이 또렷해진다
  //   · 머리    통짜 갈색 → 뒤로 넘긴 머리에 밝은 가닥 하나
  //   · 수염    번진 얼룩 → 턱선을 따라 옅게 깔리는 자국 + 콧수염 자리
  skin: ['#f7c396', '#e6a778', '#bd7c50'],
  hair: ['#8a5628', '#3a2010'],
  armW: 13,
  torso: 17,
  // 어깨를 더 넓게, 승모근을 세워 준다
  body: `
  <path d="M31 52 Q39 46 48 48 Q57 46 65 52 L64 57 Q48 52 32 57 Z" fill="#2b5fc4" opacity="0.55"/>
  <path d="M40 60 q8 5 16 0" stroke="#1f4a9e" stroke-width="1.4" fill="none" opacity="0.5"/>`,
  neck: `<rect x="41" y="43" width="14" height="10" rx="4" fill="#bd7c50"/>
         <path d="M42 46 q6 5 12 0" stroke="#a2673f" stroke-width="1.4" fill="none"/>`,
  // 0.70.7 — **드퀘풍으로 다시 그렸다** (시안 A안).
  //
  //   0.56 의 얼굴은 실사에 가까웠다 — 가로로 긴 눈, 각진 사각턱, 수염 자국.
  //   전투 화면은 4배 확대라 그 얼굴이 그대로 보이는데, 게임의 다른 그림
  //   (둥근 몸, 큰 손, 통통한 몬스터)과 결이 맞지 않았다.
  //   고친 곳은 넷이다. 뼈대를 바꾼 것이지 색을 바꾼 것이 아니다.
  //     · 눈    가로로 긴 눈 → **세로로 큰 아니메 눈**. 홍채가 눈을 거의 채우고
  //             위 속눈썹이 굵은 한 획으로 누른다. 빛점은 두 개(크게 위, 작게 아래)
  //     · 턱    각진 사각턱 → 부드럽게 둥근 턱
  //     · 이마  앞머리를 눈썹까지 내리던 것을 y≈19.5 에서 끊고, 그 아래에
  //             **금 태양 문장 가죽 머리띠**를 둘렀다. 이마가 보여야 드퀘 얼굴이 된다
  //     · 수염  턱선의 수염 자국을 뺐다 — 그것 하나로 얼굴이 열 살 더 먹는다
  //
  //   ⚠ 흉터도 같이 뺐다. 머리띠와 같은 자리(눈썹 위 오른쪽)를 다투기 때문이다.
  //     둘을 겹쳐 놓으면 흉터가 띠 밑으로 반쯤 잘려 때가 묻은 것처럼 보인다.
  face: `
  <path d="${F.jawSoft}" fill="url(#face_w)"/>
  ${F.ears('#e6a778', '#bd7c50')}
  ${F.cheekShade()}
  ${F.brow('#5b3518', 2.4, 28.4, 1.2)}
  ${F.eye(F.EYE_L, F.EYE_CY, 5.7, 6.6, '#3f7fd0', -1, 0)}
  ${F.eye(F.EYE_R, F.EYE_CY, 5.7, 6.6, '#3f7fd0', 1, 0)}
  ${F.noseSmall}
  ${F.mouthSmile}
  <ellipse cx="34.8" cy="47.6" rx="3.6" ry="2.2" fill="#ff9a86" opacity="0.3"/>
  <ellipse cx="61.2" cy="47.6" rx="3.6" ry="2.2" fill="#ff9a86" opacity="0.3"/>`,
  // 뾰족뾰족한 갈색 머리. 갈래 끝은 y≈19.5 에서 멎고, 양 끝만 관자놀이를 감싼다.
  hairShape: F.spikes(1, 7.6),
  // 머릿결 + 이마에 두른 금 태양 문장 띠.
  // ⚠ 띠는 **머리 위가 아니라 이마 선**에 둔다 — 투구를 끼면 덮여야 한다.
  headgear: F.hairFlow() + F.band('leather', 'sun'),
});

// ════════════════════════════════════════════════════════════
//  사냥꾼 — 들에서 살아온 사람. 날 선 광대, 매부리코, 얼굴에 새긴 문양.
//
//  ⚠ 0.55 에서 통째로 다시 그렸다.
//  예전 얼굴은 용사와 너무 닮아 있었다 — 둘 다 둥근 얼굴에 갈색 수염, 갈색 눈썹,
//  같은 자리의 눈. 전투 화면에서 나란히 두면 옷만 다른 같은 사람이었다.
//  이제 **다른 종류의 얼굴**로 만든다. 닮음을 지우는 것은 색이 아니라 **뼈대**다.
//    · 얼굴형   둥근 타원 → 광대가 넓고 턱이 뾰족한 마름모
//    · 코       짧은 코 → 콧등이 솟은 매부리코
//    · 눈       동그란 눈 → 옆으로 길게 찢어진 눈 · 짙은 아이라인
//    · 살색     밝은 살 → 볕에 그을린 구릿빛
//    · 머리     짧은 갈색 → 검은 머리 · 옆을 밀고 위만 남겨 뒤로 묶었다
//    · 수염     덥수룩한 턱수염 → 없앰(용사의 수염 자국과 겹쳤다). 대신 얼굴 문양
// ════════════════════════════════════════════════════════════
const RANGER_OPTS = ({
  id: 'r',
  // 볕에 그을린 구릿빛. 용사(#e3a274)보다 붉고 어둡다.
  skin: ['#d99a63', '#bd7c44', '#8d5528'],
  hair: ['#3a2a1e', '#171009'],
  armW: 10.5,
  torso: 15,
  behind: `
  <!-- 등에 멘 화살통.
       ⚠ 0.56 — 더 눕히고 바깥으로 밀었다. 예전 각도(18°)로는 화살 깃이
       오른쪽 뺨을 가로질러 **얼굴을 가렸다.** 어깨 밖으로 비스듬히 세운다.
       0.57 — 34° 는 너무 누워 보여서 22° 로 세웠다(바깥으로 민 것은 그대로라
       얼굴은 여전히 안 가린다 — /tmp/batch41.js 가 그것을 지킨다). -->
  <g transform="translate(7 6) rotate(22 72 66)">
    <rect x="66" y="46" width="13" height="34" rx="6" fill="#5b3719"/>
    <rect x="66" y="46" width="6" height="34" rx="3" fill="#8b5a2b"/>
    <rect x="64" y="58" width="17" height="4" rx="2" fill="#3d2512"/>
    <rect x="64" y="50" width="17" height="3" rx="1.5" fill="#3d2512"/>
    <path d="M70 46 L70 30M74 47 L75 31M77 48 L79 33" stroke="#c9a06a" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M67 32 l3 -5 3 5 Z" fill="#e8eef7"/>
    <path d="M72 33 l3 -5 3 5 Z" fill="#e8eef7"/>
    <path d="M77 35 l3 -5 3 5 Z" fill="#cfd8e6"/>
  </g>
  <!-- 뒤로 높이 묶은 검은 머리 — 옆을 밀었으므로 뒤통수에서 한 갈래로만 흐른다 -->
  <path d="M60 20 Q80 26 78 50 Q84 62 76 68 Q72 52 70 40 Q66 30 59 26 Z" fill="#171009"/>
  <path d="M63 23 Q76 30 75 48 Q78 58 74 62" stroke="#3a2a1e" stroke-width="2" fill="none" opacity="0.9"/>
  <!-- 묶은 자리의 가죽 끈 -->
  <path d="M60 22 q6 3 9 6" stroke="#8b5a2b" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
  // 가슴 끈(화살통 멜빵)
  body: `
  <path d="M33 49 L62 84" stroke="#5b3719" stroke-width="4.5" opacity="0.95"/>
  <path d="M33 49 L62 84" stroke="#8b5a2b" stroke-width="2" opacity="0.9"/>
  <circle cx="47" cy="66" r="3.2" fill="#c9a06a"/>
  <circle cx="47" cy="66" r="1.5" fill="#7a4e22"/>`,
  neck: `<rect x="42.5" y="43" width="11" height="9" rx="4" fill="#8d5528"/>
         <!-- 목에 건 짐승 이빨 목걸이 -->
         <path d="M41 50 q7 5 14 0" stroke="#6b4a2a" stroke-width="1.2" fill="none"/>
         <path d="M45 52.6 l1.4 4 1.4 -4 Z" fill="#efe3c8"/>
         <path d="M49.5 52.8 l1.2 3.4 1.2 -3.4 Z" fill="#d9cbaa"/>`,
  // 0.70.7 — **드퀘풍으로 다시 그렸다** (시안 B안 '들의 아이').
  //
  //   0.55 에서 만든 '다른 종류의 얼굴'(마름모 턱 · 매부리코 · 찢어진 눈)은
  //   용사와 안 닮게 하는 데는 성공했지만, 용사가 드퀘 얼굴이 되고 나니
  //   이번에는 **혼자만 실사**였다. 그래서 눈만 용사와 같은 계열로 키우고
  //   나머지 표식은 그대로 둔다 — 둘을 가르는 것은 눈이 아니라 이것들이다.
  //     · 눈       찢어진 눈 → 용사보다 **더 큰** 아니메 눈(초록). 어린 티가 난다
  //     · 턱       마름모를 조금 눕혀 부드럽게
  //     · 얼굴 문양 그대로 — 사냥꾼을 한눈에 알아보게 하는 표식이다
  //     · 머리     **검은 머리 그대로.** 갈색으로 바꾸면 용사와 한 사람이 된다
  //     · 머리띠   가죽 띠에 금 보석 + 옆으로 늘어뜨린 깃털 두 개
  face: `
  <path d="${F.RANGER_JAW_SOFT}" fill="url(#face_r)"/>
  ${F.ears('#bd7c44', '#8d5528')}
  ${F.rangerCheek}
  ${F.warPaintFull}
  ${F.brow('#171009', 2.3, 28, 1)}
  ${F.eye(38.8, 39.8, 6, 6.8, '#7ab04a', -1, 0.4)}
  ${F.eye(57.2, 39.8, 6, 6.8, '#7ab04a', 1, 0.4)}
  ${F.rangerNose}
  ${F.rangerMouth}`,
  // 옆을 밀고 위만 남긴 검은 머리. 이마 선을 y≈21 로 올려 머리띠 자리를 냈다.
  hairShape: F.rangerShort,
  // 이마에 두른 가죽 띠(금 보석) + 옆으로 늘어뜨린 깃털.
  headgear: F.band('leather', 'gem') + F.FEATHERS,
});

// ════════════════════════════════════════════════════════════
//  마법사 — 이쁜 여자. 큰 눈, 속눈썹, 갸름한 턱, 긴 은발.
// ════════════════════════════════════════════════════════════
const MAGE_OPTS = ({
  id: 'm',
  skin: ['#ffe8d6', '#fbd3b4', '#e0aa8a'],
  hair: ['#f4f7ff', '#c2cee6'],
  armW: 7.6,
  torso: 12.2,
  behind: `
  <!-- 등 뒤로 흘러내린 긴 은발. 어깨보다 넓게 퍼져 실루엣부터 여자로 읽히게 한다.
       예전에는 모자 챙이 눈썹까지 덮고 머리카락은 얼굴 옆 가는 줄뿐이라
       "머리 큰 사람"으로 보였다. 챙을 올리고 머리를 늘렸다. -->
  <path d="M28 26 Q18 50 22 78 Q30 84 36 76 Q30 50 36 30 Z" fill="#c8d4e8"/>
  <path d="M68 26 Q78 50 74 78 Q66 84 60 76 Q66 50 60 30 Z" fill="#c8d4e8"/>
  <path d="M30 28 Q22 52 26 74" stroke="#eef3fc" stroke-width="3" fill="none" opacity="0.9"/>
  <path d="M66 28 Q74 52 70 74" stroke="#eef3fc" stroke-width="3" fill="none" opacity="0.9"/>
  <path d="M34 32 Q28 54 30 72" stroke="#aab8d2" stroke-width="1.2" fill="none" opacity="0.7"/>
  <path d="M62 32 Q68 54 66 72" stroke="#aab8d2" stroke-width="1.2" fill="none" opacity="0.7"/>
  <path d="M23 76 Q21 86 28 88" stroke="#c8d4e8" stroke-width="4" fill="none" stroke-linecap="round"/>
  <path d="M73 76 Q75 86 68 88" stroke="#c8d4e8" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  // 로브 자락 — 반바지를 덮어 치마로 만든다.
  // 이게 없으면 아래가 반바지 + 맨다리라 남자 옷차림으로 읽힌다.
  body: `
  <path d="M${34.5} 74 Q48 79 ${61.5} 74 L${61.5} 78 Q48 83 ${34.5} 78 Z" fill="#1f4a9e" opacity="0.5"/>
  <path d="M36 76 Q48 81 60 76 L70 104 Q48 110 26 104 Z" fill="url(#tunic_m)"/>
  <path d="M36 76 Q48 81 60 76 L62 86 Q48 91 34 86 Z" fill="#000" opacity="0.10"/>
  <path d="M31 96 Q48 102 65 96" stroke="#1f4a9e" stroke-width="1.6" fill="none" opacity="0.5"/>
  <path d="M40 82 q8 4 16 0" stroke="#1f4a9e" stroke-width="1.2" fill="none" opacity="0.45"/>
  <!-- 자락 끝 금실 -->
  <path d="M26 104 Q48 110 70 104" stroke="#ffd166" stroke-width="2" fill="none" opacity="0.85"/>
  <!-- 허리를 조인 띠 -->
  <path d="M35 74 Q48 79 61 74 L61 77 Q48 82 35 77 Z" fill="#ffd166" opacity="0.9"/>`,
  neck: `<rect x="44.5" y="44" width="7" height="8" rx="3.5" fill="#e0aa8a"/>`,
  face: `
  <!-- 갸름한 턱. 광대에서 턱으로 확 좁아진다 -->
  <path d="M31 32 Q31 47 48 55 Q65 47 65 32 Q65 15 48 15 Q31 15 31 32 Z" fill="url(#face_m)"/>
  <!-- 가는 눈썹 — 모자 챙을 올려서 이제 보인다.
       ⚠ 굵게 그리면 그대로 남자 얼굴이 된다. 실보다 조금 굵은 정도로. -->
  <path d="M36.2 28.6 q4.6 -2.6 8.8 -0.4" stroke="#cbb9a8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M59.8 28.6 q-4.6 -2.6 -8.8 -0.4" stroke="#cbb9a8" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <!-- 큰 눈 -->
  <ellipse cx="40" cy="36" rx="5" ry="6.2" fill="#fff"/>
  <ellipse cx="56" cy="36" rx="5" ry="6.2" fill="#fff"/>
  <ellipse cx="40.4" cy="36.2" rx="3.9" ry="5" fill="#6d8fd8"/>
  <ellipse cx="56.4" cy="36.2" rx="3.9" ry="5" fill="#6d8fd8"/>
  <ellipse cx="40.4" cy="36.6" rx="2.2" ry="3" fill="#26325a"/>
  <ellipse cx="56.4" cy="36.6" rx="2.2" ry="3" fill="#26325a"/>
  <circle cx="38.9" cy="33.9" r="1.7" fill="#fff"/>
  <circle cx="54.9" cy="33.9" r="1.7" fill="#fff"/>
  <circle cx="42" cy="39" r="0.9" fill="#fff" opacity="0.8"/>
  <circle cx="58" cy="39" r="0.9" fill="#fff" opacity="0.8"/>
  <!-- 속눈썹 — 눈 윗선에 딱 붙인 가는 선.
       예전에는 굵기 2.1 짜리가 눈 위에 떠 있어서 **짙은 눈썹**처럼 보였고,
       그 위의 진짜 눈썹과 겹쳐 남자 얼굴이 됐다. 얇게, 눈에 붙여서. -->
  <path d="M35.3 32.6 q4.7 -3.4 9.4 0" stroke="#5c4a68" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M51.3 32.6 q4.7 -3.4 9.4 0" stroke="#5c4a68" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M35.2 32.4 l-2.1 -1.6" stroke="#5c4a68" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M60.8 32.4 l2.1 -1.6" stroke="#5c4a68" stroke-width="1.2" stroke-linecap="round"/>
  <!-- 작고 낮은 코 -->
  <path d="M47.2 42.6 q0.9 0.8 1.7 0" stroke="#d79a76" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <!-- 도톰한 입술 -->
  <path d="M44.6 47.2 q3.4 2.9 6.8 0" stroke="#d1607e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M45.4 46.9 q2.6 -1.4 5.2 0 q-2.6 3.4 -5.2 0 Z" fill="#e8809c" opacity="0.75"/>
  <!-- 볼 홍조 -->
  <ellipse cx="35.6" cy="41.6" rx="4" ry="2.8" fill="#ff9fae" opacity="0.45"/>
  <ellipse cx="60.4" cy="41.6" rx="4" ry="2.8" fill="#ff9fae" opacity="0.45"/>`,
  // 가운데 가르마 + 얼굴 옆으로 내려오는 앞머리 두 갈래
  hairShape:
    'M29 34 Q29 10 48 9 Q67 10 67 34 Q66 26 61 22 Q56 25 48 24 Q40 25 35 22 Q30 26 29 34 Z'
    + ' M31 22 Q26 40 29 52 Q33 54 35 50 Q32 36 35 26 Z'
    + ' M65 22 Q70 40 67 52 Q63 54 61 50 Q64 36 61 26 Z',
  // 0.55 — **모자를 그림에서 뺐다.**
  //
  // 마법사만 스프라이트에 뾰족 모자가 박혀 있어서, 투구를 끼면 모자 위에 투구가
  // 겹쳐 머리가 둘이 되었다. 이제 마법사도 다른 직업과 똑같이 **맨머리**로 그리고,
  // 그 뾰족 모자는 '천 두건'(cloth_hood) 이라는 **아이템**이 되어 처음부터
  // 씌워져 나온다(classes.json 의 startItems). 투구를 끼면 그 자리가 바뀐다.
  headgear: '',
  front: `
  <!-- 앞으로 넘긴 머리 한 갈래 — 어깨선을 부드럽게 덮는다.
       비치게 두면 옷이 비쳐 '베일' 처럼 보인다. 꽉 채운다. -->
  <path d="M31.5 40 Q26.5 58 29.5 72 Q34.5 75 37 70 Q33.5 55 36.5 44 Z" fill="#e6ecf8"/>
  <path d="M64.5 40 Q69.5 58 66.5 72 Q61.5 75 59 70 Q62.5 55 59.5 44 Z" fill="#e6ecf8"/>
  <path d="M32.5 44 Q28.5 58 30.5 69" stroke="#c2cee6" stroke-width="1.1" fill="none" opacity="0.8"/>
  <path d="M63.5 44 Q67.5 58 65.5 69" stroke="#c2cee6" stroke-width="1.1" fill="none" opacity="0.8"/>
  <!-- 목에 건 작은 보석 -->
  <path d="M44 52 q4 3 8 0" stroke="#e0cda2" stroke-width="1.2" fill="none"/>
  <circle cx="48" cy="53.8" r="2.4" fill="#ffd166"/>
  <circle cx="48" cy="53.8" r="1.2" fill="#e0679a"/>
  <circle cx="47.2" cy="53" r="0.8" fill="#fff" opacity="0.9"/>`,
});

const WARRIOR = heroSvg(WARRIOR_OPTS);
const RANGER = heroSvg(RANGER_OPTS);
const MAGE = heroSvg(MAGE_OPTS);

const CLASS_SPRITES = {
  hero: WARRIOR, // 기존 파일명을 유지한다(세이브·manifest 호환)
  ranger: RANGER,
  mage: MAGE,
};

/**
 * 전투 기본 자세 — 같은 사람을 **싸울 준비가 된 몸**으로 다시 그린 것.
 *
 * 전투 화면은 이 그림으로 서 있고, 때리는 순간에만 _attack 으로 바뀐다.
 * 기울이기(캔버스 회전)만으로는 '차렷이 기울어진 것'일 뿐이라 팔·다리를 다시 그렸다.
 */
const CLASS_STANCE = {
  hero: heroSvg({ ...WARRIOR_OPTS, pose: 'ready' }),
  ranger: heroSvg({ ...RANGER_OPTS, pose: 'ready' }),
  mage: heroSvg({ ...MAGE_OPTS, pose: 'ready' }),
};

// ── 직업 무기 아이콘 (64x64) ────────────────────────────────
const svg64 = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${inner}</svg>`;

const bow = (limb, limbDark, stringColor, gem) => svg64(`
  <g transform="rotate(-20 32 32)">
    <path d="M22 6 Q46 32 22 58" stroke="${limb}" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M22 6 Q44 32 22 58" stroke="${limbDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M22 7 L22 57" stroke="${stringColor}" stroke-width="2" fill="none"/>
    <rect x="28" y="27" width="9" height="11" rx="4" fill="${limbDark}"/>
    ${gem ? `<circle cx="32.5" cy="32.5" r="3.4" fill="${gem}"/>` : ''}
    <path d="M14 32 L40 32" stroke="#c9a06a" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M40 32 l-5 -3 l0 6 Z" fill="#e8eef7"/>
  </g>`);

const staff = (shaft, shaftDark, orb, glow) => svg64(`
  <g transform="rotate(28 32 32)">
    <rect x="29" y="20" width="6" height="40" rx="3" fill="${shaft}"/>
    <rect x="29" y="20" width="2.6" height="40" rx="1.3" fill="${shaftDark}"/>
    <path d="M25 26 q7 4 14 0" stroke="${shaftDark}" stroke-width="2.4" fill="none"/>
    <path d="M22 18 Q22 6 32 4 Q42 6 42 18 Q32 14 22 18 Z" fill="${shaftDark}"/>
    <circle cx="32" cy="14" r="10" fill="${glow}" opacity="0.45"/>
    <circle cx="32" cy="14" r="7" fill="${orb}"/>
    <circle cx="29.6" cy="11.6" r="2.4" fill="#fff" opacity="0.8"/>
  </g>`);

const CLASS_ITEMS = {
  // 사냥꾼 무기
  short_bow: bow('#a3702f', '#6b4423', '#e6d9bd', null),
  hunting_bow: bow('#7b5a34', '#4f3a20', '#f0e6cf', '#8fd48a'),
  elven_bow: bow('#cfe6c8', '#7fae86', '#ffffff', '#7cc4ff'),
  // 마법사 무기
  gnarled_staff: staff('#9c7a4e', '#6b4f2c', '#b9c4d4', '#cfd8e6'),
  apprentice_staff: staff('#b98f56', '#7a5a34', '#7cc4ff', '#4fa8ef'),
  archmage_staff: staff('#5b4a8f', '#372c5e', '#d09bff', '#a065ff'),
};

/**
 * 직업 마크 (0.69) — 랭킹표에 한 칸으로 들어가는 작은 그림.
 *
 * 이름 옆에 **직업이 한눈에** 보여야 한다. 캐릭터 그림을 줄여 쓰면 24px 에서는
 * 다 비슷한 사람 실루엣이라 구별이 안 된다. 그래서 **무엇을 드느냐**로 그린다.
 *   용사   검 + 방패
 *   사냥꾼 활 + 화살
 *   마법사 지팡이 + 책
 *
 * 24×24 로 굽는다. 글자 옆에 서므로 획을 굵게, 색은 셋이 확실히 갈리게.
 */
const mark = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${inner}</svg>`;

const CLASS_MARKS = {
  mark_warrior: mark(`
    <circle cx="12" cy="12" r="11.4" fill="#3b4a6b"/>
    <circle cx="12" cy="12" r="11.4" fill="none" stroke="#6d88c0" stroke-width="1.2"/>
    <!-- 방패 -->
    <path d="M12 4.6 L18.4 6.8 L18.4 12.4 Q18.4 16.8 12 19.4 Q5.6 16.8 5.6 12.4 L5.6 6.8 Z"
          fill="#c9d4e8"/>
    <path d="M12 6.2 L16.9 7.9 L16.9 12.4 Q16.9 15.8 12 17.9 Q7.1 15.8 7.1 12.4 L7.1 7.9 Z"
          fill="#8ea3c9"/>
    <!-- 검 -->
    <g transform="rotate(-32 12 12)">
      <rect x="11.1" y="2.4" width="1.8" height="12.4" fill="#f2f6ff"/>
      <rect x="11.1" y="2.4" width="0.8" height="12.4" fill="#ffffff"/>
      <path d="M11.1 2.4 L12.9 2.4 L12 1 Z" fill="#ffffff"/>
      <rect x="8.6" y="14.6" width="6.8" height="1.8" rx="0.9" fill="#e0b25a"/>
      <rect x="11.2" y="16.2" width="1.6" height="4" rx="0.8" fill="#8a6a45"/>
      <circle cx="12" cy="20.6" r="1.2" fill="#e0b25a"/>
    </g>`),

  mark_ranger: mark(`
    <circle cx="12" cy="12" r="11.4" fill="#2f4f3a"/>
    <circle cx="12" cy="12" r="11.4" fill="none" stroke="#67a97e" stroke-width="1.2"/>
    <!-- 활 -->
    <path d="M7.4 3.4 Q15.4 12 7.4 20.6" stroke="#a3702f" stroke-width="2.4"
          fill="none" stroke-linecap="round"/>
    <path d="M7.4 3.4 Q13.4 12 7.4 20.6" stroke="#d0a05a" stroke-width="0.9"
          fill="none" stroke-linecap="round" opacity="0.8"/>
    <!-- 시위 -->
    <path d="M7.4 3.4 L7.4 20.6" stroke="#e8f0dc" stroke-width="1" opacity="0.85"/>
    <!-- 화살 -->
    <rect x="7.2" y="11.1" width="12.4" height="1.8" rx="0.9" fill="#f2f6ff"/>
    <path d="M19 9.2 L22.6 12 L19 14.8 Z" fill="#dfe8f5"/>
    <path d="M7.6 9.6 L10.4 12 L7.6 14.4 Z" fill="#8fd48a"/>
    <path d="M5.6 9.6 L8.4 12 L5.6 14.4 Z" fill="#67a97e"/>`),

  mark_mage: mark(`
    <circle cx="12" cy="12" r="11.4" fill="#40325f"/>
    <circle cx="12" cy="12" r="11.4" fill="none" stroke="#9a7ed6" stroke-width="1.2"/>
    <!-- 책 -->
    <path d="M3.6 13.4 Q7.4 11.8 11.4 13.4 L11.4 20 Q7.4 18.4 3.6 20 Z" fill="#c9d4e8"/>
    <path d="M11.4 13.4 Q15.4 11.8 19.2 13.4 L19.2 20 Q15.4 18.4 11.4 20 Z" fill="#a8b6d4"/>
    <path d="M11.4 13.4 L11.4 20" stroke="#6d7a99" stroke-width="1"/>
    <path d="M5.4 15.2 q3 -1 4.4 0M13.4 15.2 q3 -1 4.4 0"
          stroke="#6d7a99" stroke-width="0.8" fill="none" opacity="0.8"/>
    <!-- 지팡이 -->
    <g transform="rotate(22 12 12)">
      <rect x="15.4" y="4.4" width="2" height="15" rx="1" fill="#8a6a45"/>
      <rect x="15.4" y="4.4" width="0.8" height="15" fill="#a98a5e"/>
      <circle cx="16.4" cy="4.2" r="4.2" fill="#c58cff" opacity="0.35"/>
      <circle cx="16.4" cy="4.2" r="2.8" fill="#c58cff"/>
      <circle cx="15.5" cy="3.3" r="1" fill="#ffffff" opacity="0.85"/>
    </g>`),
};

module.exports = {
  CLASS_STANCE, CLASS_SPRITES, CLASS_ITEMS, CLASS_MARKS,
  // 얼굴 시안을 굽는 도구(tools/face-options.js)가 쓴다.
  // 같은 몸에 얼굴만 갈아 끼워 봐야 비교가 된다.
  heroSvg, WARRIOR_OPTS, RANGER_OPTS };
