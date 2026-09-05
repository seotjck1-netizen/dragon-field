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
  face: `
  <!-- 각진 사각턱. 광대에서 턱까지 거의 곧게 내려오다 아래에서 한 번 꺾인다. -->
  <path d="M29.5 30 Q29.5 44 32.5 50 Q37 56 48 57 Q59 56 63.5 50 Q66.5 44 66.5 30
           Q66.5 15 48 15 Q29.5 15 29.5 30 Z" fill="url(#face_w)"/>
  <!-- 광대와 턱선 그늘 — 얼굴을 깎아 보이게 한다 -->
  <path d="M31.5 36 Q34 45 40 50" stroke="#c98a5c" stroke-width="3" fill="none" opacity="0.26" stroke-linecap="round"/>
  <path d="M64.5 36 Q62 45 56 50" stroke="#c98a5c" stroke-width="3" fill="none" opacity="0.26" stroke-linecap="round"/>
  <!-- 턱 가운데 홈 -->
  <path d="M48 52.6 l0 2.6" stroke="#c07f52" stroke-width="1.5" stroke-linecap="round" opacity="0.55"/>
  <!-- 짙고 곧은 눈썹.
       ⚠ 안쪽(코 쪽)이 **낮아야** 결의로 읽힌다. 반대로 하면 그대로 걱정하는 얼굴이 된다
       (처음에 그렇게 그렸다가 눈썹만 뒤집었더니 사람이 달라졌다). -->
  <path d="M34 27.6 L45.4 29.8" stroke="#3a2010" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <path d="M62 27.6 L50.6 29.8" stroke="#3a2010" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <!-- 눈 — 흰자를 넓히고 푸른 홍채를 넣었다 -->
  <path d="M34.8 35.4 q5.4 -4.2 10.8 -0.4 q-5.2 4.4 -10.8 0.4 Z" fill="#fdfbf6"/>
  <path d="M61.2 35.4 q-5.4 -4.2 -10.8 -0.4 q5.2 4.4 10.8 0.4 Z" fill="#fdfbf6"/>
  <circle cx="40.2" cy="35" r="2.8" fill="#3f6fa8"/>
  <circle cx="55.8" cy="35" r="2.8" fill="#3f6fa8"/>
  <circle cx="40.2" cy="35" r="1.25" fill="#101a26"/>
  <circle cx="55.8" cy="35" r="1.25" fill="#101a26"/>
  <circle cx="39.1" cy="33.8" r="1" fill="#fff"/>
  <circle cx="54.7" cy="33.8" r="1" fill="#fff"/>
  <circle cx="41.6" cy="36.4" r="0.6" fill="#cfe4ff" opacity="0.9"/>
  <circle cx="57.2" cy="36.4" r="0.6" fill="#cfe4ff" opacity="0.9"/>
  <!-- 쌍꺼풀 선 -->
  <path d="M34.4 34.4 q5.6 -4 11.2 -0.4" stroke="#5c3a1c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M61.6 34.4 q-5.6 -4 -11.2 -0.4" stroke="#5c3a1c" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- 곧은 콧대. 선은 코끝에만 — 길게 그으면 흉터로 보인다 -->
  <path d="M47.6 37.4 L47 42.8" stroke="#cd8f61" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.5"/>
  <path d="M45.9 43.6 q2.1 1.5 4.2 0" stroke="#a86a40" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <!-- 굳게 다문 입 — 곧고 짧게. 끝이 처지면 그대로 우는 얼굴이 된다 -->
  <path d="M42.6 48 L53.4 48" stroke="#8f4f36" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M43.6 49.6 q4.4 0.9 8.8 0" stroke="#c98a5c" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.45"/>
  <!-- 수염 자국 — 턱선을 따라 옅게. 예전에는 볼까지 번져 얼룩처럼 보였다 -->
  <path d="M36 45 Q38 53 48 55 Q58 53 60 45 Q57 51 48 52.4 Q39 51 36 45 Z" fill="#3a2010" opacity="0.16"/>
  <path d="M42.5 44.6 q5.5 -1.4 11 0" stroke="#3a2010" stroke-width="2" fill="none" opacity="0.14" stroke-linecap="round"/>
  <!-- 눈썹 위 흉터 -->
  <path d="M63 20.5 l-3 7.5" stroke="#e0a87c" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M60.6 23.4 l3 1.2" stroke="#e0a87c" stroke-width="1.4" stroke-linecap="round"/>`,
  // 0.58 — **앞머리를 만들었다.**
  //
  // 그 전에는 머리를 통째로 뒤로 넘겨서 이마가 y=15.6 부터 눈썹(y=27.6)까지
  // 훤히 드러났다. 넓은 이마 하나로 얼굴이 그대로 나이 들어 보였다
  // ("용사는 머리가 늙어보이니"). 눈·코·입은 손대지 않았다 — 고칠 곳은 이마였다.
  //
  // 앞머리는 **뾰족뾰족한 갈래**로 내린다. 통짜로 덮으면 바가지 머리가 되고,
  // 갈래를 내면 젊고 거칠어 보인다. 눈썹(y≈27.6)보다는 위에서 끊는다 —
  // 눈썹을 덮으면 표정이 사라진다.
  //
  // 오른쪽(x 60~66)은 일부러 짧게 남겼다. 그 자리에 눈썹 위 흉터가 있다.
  // ⚠ 갈래를 **직선 톱니**로 그리면 왕관처럼 보인다(처음에 그렇게 그렸다).
  //   갈래마다 길이를 다르게 하고 옆선을 곡선으로 둬야 머리카락으로 읽힌다.
  hairShape:
    'M27 28 Q26 9 48 8 Q70 9 69 28'
    + ' Q67.5 21.5 65.5 19'
    + ' Q64.8 22.5 63.6 25.2 Q62.4 21.5 61 18.6'
    + ' Q60 23 58.4 27 Q57.2 22 56 18.4'
    + ' Q54.6 22.5 53 25.6 Q51.6 21 50.2 18.2'
    + ' Q49 23.5 47.4 27.4 Q46 22 44.6 18.5'
    + ' Q43.4 22.5 42 25.4 Q40.6 21 39.2 18.8'
    + ' Q38 23.5 36.4 26.8 Q35 22 33.6 19.2'
    + ' Q32 22.5 30.6 25.6 Q28.8 22.5 27 28 Z',
  headgear: `
  <!-- 머릿결 — 가르마에서 앞머리 갈래로 흐른다 -->
  <path d="M46 10.5 Q40 14 36.5 21.5" stroke="#5b3518" stroke-width="1.8" fill="none" opacity="0.5" stroke-linecap="round"/>
  <path d="M50 10.5 Q53 15 54.5 22" stroke="#5b3518" stroke-width="1.8" fill="none" opacity="0.5" stroke-linecap="round"/>
  <path d="M43.5 11.5 Q37 15.5 32.5 22.5" stroke="#a97038" stroke-width="1.8" fill="none" opacity="0.7" stroke-linecap="round"/>
  <path d="M53.5 11.5 Q59.5 14 63 20" stroke="#a97038" stroke-width="1.5" fill="none" opacity="0.55" stroke-linecap="round"/>
  <path d="M29.5 25 Q28.5 19 31 14.5" stroke="#3a2010" stroke-width="1.6" fill="none" opacity="0.55"/>
  <path d="M66.5 25 Q67.5 19 65 14.5" stroke="#3a2010" stroke-width="1.6" fill="none" opacity="0.55"/>`,
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
  face: `
  <!-- 광대가 넓고 턱이 뾰족한 얼굴. 둥근 타원(용사·예전 사냥꾼)과 실루엣부터 다르다. -->
  <path d="M48 13 Q66 15 68 31 Q68 41 60 48 Q54 55 48 56 Q42 55 36 48 Q28 41 28 31 Q30 15 48 13 Z"
        fill="url(#face_r)"/>
  <!-- 날 선 광대 그늘 — 뺨을 깎아 보이게 한다 -->
  <path d="M32.5 34 Q36 42 42 46" stroke="#8d5528" stroke-width="3.2" fill="none" opacity="0.30" stroke-linecap="round"/>
  <path d="M63.5 34 Q60 42 54 46" stroke="#8d5528" stroke-width="3.2" fill="none" opacity="0.30" stroke-linecap="round"/>
  <!-- 얼굴에 새긴 문양 — 이 사람을 한눈에 알아보게 하는 표식이다 -->
  <path d="M33 30 l0 12" stroke="#7a2f2f" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
  <path d="M36.5 31.5 l0 8.5" stroke="#7a2f2f" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <path d="M63 30 l0 12" stroke="#7a2f2f" stroke-width="2.2" stroke-linecap="round" opacity="0.85"/>
  <path d="M59.5 31.5 l0 8.5" stroke="#7a2f2f" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
  <!-- 미간의 표식 두 줄 -->
  <path d="M46 24.5 l0 3.4M50 24.5 l0 3.4" stroke="#7a2f2f" stroke-width="1.6" stroke-linecap="round" opacity="0.75"/>
  <!-- 눈썹 — 안쪽(코 쪽)이 **내려온** 사나운 각.
       0.55 에서는 거꾸로 그려서 걱정하는 얼굴이 되어 있었다. -->
  <path d="M34.5 27.4 L45.5 30.4" stroke="#171009" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <path d="M61.5 27.4 L50.5 30.4" stroke="#171009" stroke-width="3.2" fill="none" stroke-linecap="round"/>
  <!-- 옆으로 길게 찢어진 눈 -->
  <path d="M35 35.6 q5.6 -4.2 11 -0.6 q-5.4 3.6 -11 0.6 Z" fill="#f6efe0"/>
  <path d="M61 35.6 q-5.6 -4.2 -11 -0.6 q5.4 3.6 11 0.6 Z" fill="#f6efe0"/>
  <ellipse cx="40.6" cy="34.9" rx="2.3" ry="2.6" fill="#6b8f3e"/>
  <ellipse cx="55.4" cy="34.9" rx="2.3" ry="2.6" fill="#6b8f3e"/>
  <circle cx="40.6" cy="34.9" r="1.1" fill="#12180c"/>
  <circle cx="55.4" cy="34.9" r="1.1" fill="#12180c"/>
  <circle cx="39.8" cy="34" r="0.8" fill="#fff"/>
  <circle cx="54.6" cy="34" r="0.8" fill="#fff"/>
  <!-- 짙은 아이라인. 바깥쪽 끝이 위로 치켜 올라간다 -->
  <path d="M35 35 q5.6 -4 11 -0.6" stroke="#241a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M61 35 q-5.6 -4 -11 -0.6" stroke="#241a0e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M34.8 34.8 l-2.4 -2.2" stroke="#241a0e" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M61.2 34.8 l2.4 -2.2" stroke="#241a0e" stroke-width="1.5" stroke-linecap="round"/>
  <!-- 매부리코 — 콧등이 솟았다가 코끝이 아래로 꺾인다 -->
  <path d="M47.6 30 Q50.4 36 49.2 43.4" stroke="#b0713c" stroke-width="2.4" fill="none"
        stroke-linecap="round" opacity="0.55"/>
  <path d="M45.6 43.8 q2.6 2.2 5 0.2" stroke="#8d5528" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M45.4 44.4 q1 1 2.2 1" stroke="#7a4620" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/>
  <!-- 굳게 다문 얇은 입 -->
  <path d="M42.6 49.4 q5.4 1.6 10.8 0" stroke="#7a4030" stroke-width="1.9" fill="none" stroke-linecap="round"/>
  <path d="M44 51.4 q4 1 8 0" stroke="#a8663f" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.5"/>
  <!-- 턱 밑 그늘 — 턱을 더 뾰족하게 보이게 한다 -->
  <path d="M42 52.6 q6 3.4 12 0" stroke="#8d5528" stroke-width="2.4" fill="none" opacity="0.25" stroke-linecap="round"/>`,
  // 옆을 밀고 위만 남긴 머리. 이마 선이 각지고 관자놀이가 훤하다.
  hairShape:
    'M30 28 Q31 12 48 11 Q65 12 66 28 Q63 22 57 20 Q52 22 48 21 Q44 22 39 20 Q33 22 30 28 Z'
    + ' M30 28 Q29 33 30.5 37 Q32 32 32 27 Z'
    + ' M66 28 Q67 33 65.5 37 Q64 32 64 27 Z',
  // 이마에 낮게 두른 가죽 띠 + 옆으로 늘어뜨린 깃털.
  // 투구를 끼면 덮이도록 **머리 위가 아니라 이마 선**에 둔다.
  headgear: `
  <path d="M29.5 25.5 Q48 20.5 66.5 25.5 L66 30 Q48 25 30 30 Z" fill="#6b4a2a"/>
  <path d="M29.5 25.5 Q48 20.5 66.5 25.5 Q48 23 29.5 25.5 Z" fill="#8b6238"/>
  <path d="M34 26.5 l0 3M40 25 l0 3.2M56 25 l0 3.2M62 26.5 l0 3"
        stroke="#c9a06a" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>
  <!-- 띠 가운데 짐승 이빨 -->
  <path d="M46.6 24.2 l1.4 5 1.4 -5 Z" fill="#efe3c8"/>
  <!-- 옆으로 늘어뜨린 깃털 두 개 -->
  <path d="M29 27 Q22 33 20 43 Q26 38 30 31 Z" fill="#a8452f"/>
  <path d="M29 27 Q24 33 22 41" stroke="#d6785c" stroke-width="1" fill="none" opacity="0.9"/>
  <path d="M30.5 30 Q25 36 24 45 Q29 40 32 34 Z" fill="#e8eef7" opacity="0.85"/>
  <path d="M30.5 30 Q26.5 36 25.5 43" stroke="#aebccf" stroke-width="0.9" fill="none"/>`,
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

module.exports = {
  CLASS_STANCE, CLASS_SPRITES, CLASS_ITEMS };
