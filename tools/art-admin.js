// 운영자 전용 모습 — "빛의 심판관".
//
// 왜 따로 그리나:
//   운영자는 게임을 하는 사람이 아니라 **보러 온 사람**이다. 셋 중 하나로 보이면
//   "저 마법사 왜 안 죽지" 같은 오해가 생긴다. 한눈에 다른 존재로 보여야 한다.
//
// 왜 heroSvg 를 안 쓰나:
//   heroSvg 는 파란 상의를 갑옷 색으로 갈아끼우는 규칙(core/Appearance.js) 위에 서 있다.
//   운영자는 장비를 갈아입지 않으므로 그 규칙이 필요 없고, 오히려 흰 갑옷이
//   장비 색으로 물들면 곤란하다. 그래서 통째로 따로 그린다.
//
// 96x128 로 그려 필드는 48x64, 전투는 384x512 로 굽는다(다른 캐릭터와 같은 규격).

const ADMIN = `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 96 128">
  <defs>
    <linearGradient id="ad_plate" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#e8eefb"/>
      <stop offset="1" stop-color="#c2cee6"/>
    </linearGradient>
    <linearGradient id="ad_gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffe9a8"/>
      <stop offset="1" stop-color="#c9962e"/>
    </linearGradient>
    <linearGradient id="ad_wing" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dff0ff" stop-opacity="0.95"/>
      <stop offset="0.6" stop-color="#8fc9ff" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#4a86ff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="ad_cloak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fb6ff" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#2a4fa8" stop-opacity="0.75"/>
    </linearGradient>
    <radialGradient id="ad_halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6d0" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="#ffd97a" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#ffd97a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ad_shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.5"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- 바닥 그림자 -->
  <ellipse cx="48" cy="118" rx="21" ry="5" fill="#000" opacity="0.18"/>

  <!-- ── 빛의 날개 (몸 뒤) ──────────────────────────────
       깃털을 하나하나 그리지 않는다. 48px 로 줄이면 뭉개져서
       그냥 파란 얼룩이 된다. 굵은 빛줄기 몇 가닥이 훨씬 또렷하다. -->
  <g>
    <path d="M44 44 Q16 20 2 26 Q18 34 24 46 Q8 44 2 56 Q20 56 30 62 Q18 68 14 80 Q34 66 44 64 Z" fill="url(#ad_wing)"/>
    <path d="M52 44 Q80 20 94 26 Q78 34 72 46 Q88 44 94 56 Q76 56 66 62 Q78 68 82 80 Q62 66 52 64 Z" fill="url(#ad_wing)"/>
    <g stroke="#f2faff" stroke-width="1.6" fill="none" opacity="0.9" stroke-linecap="round">
      <path d="M44 46 Q26 34 8 27M44 54 Q26 50 8 54M44 61 Q28 62 16 72"/>
      <path d="M52 46 Q70 34 88 27M52 54 Q70 50 88 54M52 61 Q68 62 80 72"/>
    </g>
  </g>

  <!-- ── 뒤로 흐르는 망토 ────────────────────────────── -->
  <!-- 망토는 몸 옆으로만 나오게 좁힌다. 넓히면 치마로 읽힌다. -->
  <path d="M34 52 Q48 58 62 52 L68 106 Q48 112 28 106 Z" fill="url(#ad_cloak)" opacity="0.8"/>
  <path d="M31 102 Q48 108 65 102" stroke="#a8d0ff" stroke-width="1.6" fill="none" opacity="0.7"/>
  <path d="M40 56 Q48 60 56 56 L56 104 Q48 108 40 104 Z" fill="#0d1730" opacity="0.16"/>

  <!-- ── 다리 · 정강이받이 ───────────────────────────── -->
  <path d="M38 92 L46 92 L45 112 L39 112 Z" fill="url(#ad_plate)"/>
  <path d="M50 92 L58 92 L57 112 L51 112 Z" fill="url(#ad_plate)"/>
  <path d="M38 92 h8 v3 h-8 Z" fill="url(#ad_gold)"/>
  <path d="M50 92 h8 v3 h-8 Z" fill="url(#ad_gold)"/>
  <ellipse cx="42" cy="114" rx="7" ry="4" fill="#b9c6dd"/>
  <ellipse cx="54" cy="114" rx="7" ry="4" fill="#b9c6dd"/>

  <!-- ── 허리 ───────────────────────────────────────── -->
  <path d="M33 76 L63 76 L61 92 L35 92 Z" fill="url(#ad_plate)"/>
  <rect x="32" y="74" width="32" height="6" rx="3" fill="url(#ad_gold)"/>
  <path d="M44 80 h8 v10 l-4 4 -4 -4 Z" fill="url(#ad_gold)"/>

  <!-- ── 팔 ─────────────────────────────────────────── -->
  <path d="M24 54 Q20 70 24 88 Q29 91 34 88 Q31 70 33 54 Z" fill="url(#ad_plate)"/>
  <path d="M72 54 Q76 70 72 88 Q67 91 62 88 Q65 70 63 54 Z" fill="url(#ad_plate)"/>
  <circle cx="29" cy="90" r="5" fill="#d6dfef"/>
  <circle cx="67" cy="90" r="5" fill="#d6dfef"/>
  <path d="M23 56 h11 v4 h-11 Z" fill="url(#ad_gold)"/>
  <path d="M62 56 h11 v4 h-11 Z" fill="url(#ad_gold)"/>

  <!-- ── 몸통 ───────────────────────────────────────── -->
  <path d="M33 50 Q48 44 63 50 L64 78 Q48 84 32 78 Z" fill="url(#ad_plate)"/>
  <path d="M33 50 Q48 44 63 50 L63 60 Q48 66 33 60 Z" fill="url(#ad_shine)"/>
  <!-- 가슴의 심판 문양 — 눈 하나와 저울. 세밀하게 그리면 작은 크기에서 뭉갠다. -->
  <path d="M40 62 q8 -6 16 0 q-8 6 -16 0 Z" fill="url(#ad_gold)"/>
  <circle cx="48" cy="62" r="2.6" fill="#2a4fa8"/>
  <circle cx="47.2" cy="61.2" r="1" fill="#fff"/>
  <path d="M48 66 v8M42 70 h12" stroke="url(#ad_gold)" stroke-width="1.6" stroke-linecap="round"/>

  <!-- 어깨 -->
  <path d="M28 52 Q34 44 42 47 L40 55 Q34 52 29 57 Z" fill="url(#ad_plate)"/>
  <path d="M68 52 Q62 44 54 47 L56 55 Q62 52 67 57 Z" fill="url(#ad_plate)"/>
  <path d="M28 52 Q34 44 42 47 L41 50 Q34 48 30 55 Z" fill="url(#ad_gold)"/>
  <path d="M68 52 Q62 44 54 47 L55 50 Q62 48 66 55 Z" fill="url(#ad_gold)"/>

  <!-- ── 투구 — 얼굴이 없다 ──────────────────────────
       눈코입을 안 그리는 것이 핵심이다. 사람 얼굴을 넣는 순간
       "흰 갑옷 입은 사람"이 되고, 다른 존재라는 느낌이 사라진다. -->
  <ellipse cx="48" cy="34" rx="30" ry="30" fill="url(#ad_halo)"/>
  <path d="M32 34 Q32 16 48 16 Q64 16 64 34 Q64 46 48 50 Q32 46 32 34 Z" fill="url(#ad_plate)"/>
  <path d="M32 34 Q32 16 48 16 Q64 16 64 34 Q60 24 48 23 Q36 24 32 34 Z" fill="url(#ad_shine)"/>
  <!-- 얼굴 자리는 텅 빈 빛 -->
  <path d="M37 32 Q37 24 48 24 Q59 24 59 32 Q59 42 48 45 Q37 42 37 32 Z" fill="#0d1730" opacity="0.55"/>
  <path d="M39 33 Q39 26 48 26 Q57 26 57 33 Q57 41 48 43 Q39 41 39 33 Z" fill="#cfe6ff" opacity="0.35"/>
  <path d="M41 34 h14" stroke="#eaf6ff" stroke-width="2.6" stroke-linecap="round" opacity="0.95"/>
  <!-- 투구의 금테와 뿔 -->
  <path d="M32 34 Q48 40 64 34 L64 38 Q48 44 32 38 Z" fill="url(#ad_gold)"/>
  <!-- 뿔은 뒤로 눕혀 얇게. 위로 세우면 토끼 귀처럼 보인다. -->
  <path d="M35 26 Q22 20 10 8 Q28 14 41 22 Z" fill="url(#ad_gold)"/>
  <path d="M61 26 Q74 20 86 8 Q68 14 55 22 Z" fill="url(#ad_gold)"/>
  <path d="M35 26 Q24 21 14 12 Q28 17 39 23 Z" fill="#fff6d0" opacity="0.55"/>
  <path d="M61 26 Q72 21 82 12 Q68 17 57 23 Z" fill="#fff6d0" opacity="0.55"/>
  <circle cx="48" cy="18" r="3" fill="#fff6d0"/>
  <circle cx="48" cy="18" r="1.4" fill="#7cc4ff"/>

  <!-- ── 손에 든 빛의 검 ─────────────────────────────
       장비 파츠가 얹히지 않으므로 여기서 직접 그린다. -->
  <g transform="rotate(14 70 78)">
    <rect x="67" y="34" width="6" height="46" rx="3" fill="#eaf6ff"/>
    <rect x="67" y="34" width="2.4" height="46" rx="1.2" fill="#fff"/>
    <path d="M70 28 l3 6 h-6 Z" fill="#fff6d0"/>
    <rect x="62" y="80" width="16" height="4.6" rx="2.3" fill="url(#ad_gold)"/>
    <rect x="68" y="84" width="4.4" height="10" rx="2.2" fill="#8a6a2a"/>
    <circle cx="70.2" cy="94" r="2.6" fill="#7cc4ff"/>
  </g>
</svg>`;

module.exports = { ADMIN };
