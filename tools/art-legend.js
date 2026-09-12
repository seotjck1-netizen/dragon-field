// 전설 장비 아이콘 — 네 가지. (0.70.7)
//
// 왜 따로 만드나: 전설 넷은 지금까지 **남의 그림을 빌려 쓰고 있었다.**
//   용살자 → 서리검 · 천공궁 → 뇌전궁 · 세계수 지팡이 → 성염 지팡이
//   용비늘 성갑 → 룬 갑옷
// 가방에서 이름은 붉은데 그림은 앞 단계 물건과 똑같아서, 최고 등급을 손에 넣고도
// "뭐가 달라졌지" 가 됐다. 0.70.6 에 **입은 모습**은 붉게 바꿨으니, 이제 가방도 맞춘다.
//
// ── 네 개를 관통하는 규칙 ───────────────────────────────────
// ① 바탕은 **붉은색**이다. UI 의 전설 빨강(--legendary #ff3b3b) 과 같은 계열.
// ② **둘레가 빛난다.** 등급이 색 하나로만 갈리면 작은 칸(48px)에서는 안 보인다.
//    실루엣 바깥으로 번지는 빛을 두르면 줄지어 놓아도 이것만 눈에 든다.
// ③ 실루엣은 **빌려 쓰던 물건과 다르게** 잡는다. 색만 바꾸면 "빨간 서리검" 이다.
//    용살자는 날을 넓히고 용의 이빨 코등이를, 천공궁은 활 등에 날개를,
//    세계수 지팡이는 나뭇가지 관을, 성갑은 용 비늘을 겹쳐 준다.

const item = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 64 64">
     <defs>
       <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#fff" stop-opacity="0.45"/>
         <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
       </linearGradient>
       <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
         <stop offset="0" stop-color="#ff4a3c" stop-opacity="0.55"/>
         <stop offset="0.6" stop-color="#ff4a3c" stop-opacity="0.18"/>
         <stop offset="1" stop-color="#ff4a3c" stop-opacity="0"/>
       </radialGradient>
     </defs>
     <circle cx="32" cy="32" r="31" fill="url(#halo)"/>
     ${inner}</svg>`;

/** 붉은 룬 무늬 한 벌. 획은 부르는 쪽에서 이어 적는다. */
const rune = (c = '#ffd2c4') =>
  `<g stroke="${c}" stroke-width="1.6" fill="none" opacity="0.95" stroke-linecap="round">`;

const LEGEND_ITEMS = {
  // 용살자 — 넓은 양날에 용의 이빨 코등이.
  // 서리검(좁고 길쭉한 얼음 날)과 실루엣부터 갈린다.
  dragonslayer: item(`
    <path d="M32 3 L42 18 L42 40 L32 49 L22 40 L22 18 Z" fill="#e8483a"/>
    <path d="M32 3 L32 49 L22 40 L22 18 Z" fill="#b02a2a"/>
    <path d="M32 3 L42 18 L32 22 Z" fill="url(#shine)"/>
    <!-- 용의 이빨 코등이 — 가운데서 위로 휘어 오른다 -->
    <path d="M14 47 Q32 40 50 47 L48 52 Q32 46 16 52 Z" fill="#7a1a1d"/>
    <path d="M18 46 l-3 -7 5 5 Z" fill="#ffe0b0"/>
    <path d="M46 46 l3 -7 -5 5 Z" fill="#ffe0b0"/>
    <rect x="29" y="51" width="6" height="11" rx="3" fill="#4a2a1e"/>
    <circle cx="32" cy="57" r="3.4" fill="#ff6a4a"/>
    <circle cx="31" cy="56" r="1.3" fill="#fff2e8"/>
    ${rune()}<path d="M28 24h8M32 19v10M27 34l10 0M29 39l6 0"/></g>`),

  // 천공궁 — 활 등에 펼친 날개. 뇌전궁의 번개 자리를 날개가 대신한다.
  skypiercer: item(`
    <path d="M20 6 Q48 32 20 58" stroke="#7a1a1d" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="M20 6 Q48 32 20 58" stroke="#e8483a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M20 6 L20 58" stroke="#ffd2c4" stroke-width="1.8"/>
    <!-- 활 등에서 펼쳐진 날개 -->
    <path d="M36 26 Q50 18 58 22 Q48 26 42 32 Z" fill="#ff6a4a" opacity="0.95"/>
    <path d="M36 38 Q50 46 58 42 Q48 38 42 32 Z" fill="#c9352c" opacity="0.95"/>
    <path d="M38 27 Q48 22 55 23M38 37 Q48 42 55 41" stroke="#ffd2c4" stroke-width="1" fill="none" opacity="0.8"/>
    <circle cx="41" cy="32" r="3.6" fill="#ff8a6a"/>
    <circle cx="40" cy="31" r="1.4" fill="#fff2e8"/>
    <circle cx="20" cy="6" r="3.2" fill="#ff8a6a"/>
    <circle cx="20" cy="58" r="3.2" fill="#ff8a6a"/>`),

  // 세계수 지팡이 — 구슬을 감싼 나뭇가지 관. 성염 지팡이의 불꽃과 다른 실루엣.
  worldtree_staff: item(`
    <rect x="29" y="22" width="6" height="40" rx="3" fill="#5a2a24"/>
    <rect x="29" y="22" width="2.4" height="40" fill="#8a3d33"/>
    <path d="M24 34 q8 4 16 0M24 44 q8 4 16 0" stroke="#7a1a1d" stroke-width="2" fill="none"/>
    <!-- 가지로 엮은 관 -->
    <path d="M32 4 Q18 8 16 20 Q22 16 26 18 Q22 10 32 8 Q42 10 38 18 Q42 16 48 20 Q46 8 32 4 Z" fill="#8a3d33"/>
    <path d="M18 20 Q22 26 28 27M46 20 Q42 26 36 27" stroke="#8a3d33" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="32" cy="21" r="10" fill="#ff4a3c" opacity="0.35"/>
    <circle cx="32" cy="21" r="7" fill="#e8483a"/>
    <circle cx="29.6" cy="18.6" r="2.6" fill="#ffd2c4" opacity="0.9"/>
    <!-- 가지에 맺힌 붉은 잎 -->
    <path d="M18 14 q-5 -3 -7 1 q5 3 7 -1 Z" fill="#ff6a4a"/>
    <path d="M46 14 q5 -3 7 1 q-5 3 -7 -1 Z" fill="#ff6a4a"/>`),

  // 용비늘 성갑 — 룬 갑옷과 달리 **비늘을 겹쳐** 그린다. 목에 두 개의 뿔.
  dragonscale_plate: item(`
    <path d="M16 14 L32 7 L48 14 L48 40 Q32 58 16 40 Z" fill="#8f2222"/>
    <path d="M16 14 L32 7 L48 14 L48 21 Q32 29 16 21 Z" fill="#c23a33"/>
    <!-- 어깨 위로 솟은 용뿔 -->
    <path d="M17 15 q-5 -6 -9 -7 q3 6 8 10 Z" fill="#e8483a"/>
    <path d="M47 15 q5 -6 9 -7 q-3 6 -8 10 Z" fill="#e8483a"/>
    <!-- 겹쳐 붙인 비늘 -->
    <g fill="#a82a28">
      <path d="M22 26 q5 -5 10 0 q-5 5 -10 0 Z"/><path d="M32 26 q5 -5 10 0 q-5 5 -10 0 Z"/>
      <path d="M27 33 q5 -5 10 0 q-5 5 -10 0 Z"/><path d="M17 33 q5 -5 10 0 q-5 5 -10 0 Z"/>
      <path d="M37 33 q5 -5 10 0 q-5 5 -10 0 Z"/>
      <path d="M22 40 q5 -5 10 0 q-5 5 -10 0 Z"/><path d="M32 40 q5 -5 10 0 q-5 5 -10 0 Z"/>
      <path d="M27 47 q5 -5 10 0 q-5 5 -10 0 Z"/>
    </g>
    <path d="M16 14 L32 7 L48 14 L48 40 Q32 58 16 40 Z" fill="url(#shine)"/>
    ${rune('#ffd2c4')}<path d="M32 20v6M29 23h6"/></g>
    <circle cx="32" cy="23" r="2.2" fill="#ffe8dc"/>`),
};

module.exports = { LEGEND_ITEMS };
