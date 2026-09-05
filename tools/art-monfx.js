// 몬스터 공격 그림 (0.44).
//
// 0.43 에서는 몬스터가 때릴 때 **발밑을 축으로 살짝 기우는 것**이 전부였다.
// 늑대가 물어뜯든 마법사 악마가 주문을 던지든 화면에서는 똑같이 보였다.
// 여기서는 몬스터마다 **덤벼드는 자세 한 장**을 굽는다.
//
// 사람 그림과 같은 수법이다(art-fx.js 의 attackPose) — 서 있는 그림을 통째로
// 앞으로 옮기고 늘였다 눌렀다 하고, 그 앞에 "무엇으로 때렸나" 자국을 하나 얹는다.
// 새로 그리는 것은 자국뿐이라 열한 장이 스무 줄쯤에 나온다.
//
// ⚠ 몬스터는 **왼쪽(주인공 쪽)을 보고 서 있다.** 그래서 자국은 전부 몸 왼쪽 앞에 둔다.
//   오른쪽에 두면 등 뒤에서 터지는 꼴이 된다. (사람 그림은 반대다 — 오른쪽을 본다.)
//
// ⚠ 그리고 **몸 위가 아니라 몸 앞**이어야 한다. 처음에 x 4~56 에 그렸더니 몬스터가
//   화면 가운데를 꽉 채우고 있어서, 발톱 자국이 늑대 얼굴 위에 난 상처처럼 보였다.
//   지금은 x -10~38 — 왼쪽 테두리를 넘어가게 두어 "앞으로 뻗는다" 가 되게 했다.
//   (테두리를 넘은 부분은 잘리지만, 잘려 보이는 편이 오히려 뻗어 나가 보인다.)

/** 그림의 viewBox 한 변. 몬스터는 128, 고룡 둘은 64 다. */
function viewSize(svg) {
  const m = /viewBox="0 0 (\d+(?:\.\d+)?) /.exec(svg);
  return m ? parseFloat(m[1]) : 128;
}

/**
 * 서 있는 그림을 덤벼드는 자세로 바꾼다.
 *
 * @param {string} svg 원본 몬스터 그림
 * @param {object} o
 * @param {number} o.dx   앞(왼쪽)으로 얼마나 나가나. 음수가 왼쪽이다
 * @param {number} o.lean 발밑을 축으로 몇 도 기우나. **음수가 앞으로(왼쪽으로)** 기운다
 * @param {number} o.sx   가로로 얼마나 늘어나나 (덮치는 몸짓)
 * @param {number} o.sy   세로로 얼마나 눌리나 (웅크렸다 펴는 몸짓)
 * @param {string} o.mark 앞에 얹을 자국. **128 칸 기준**으로 그리면 알아서 줄여 준다
 */
function attackPose(svg, { dx = -5, lean = -7, sx = 1, sy = 1, mark = '' } = {}) {
  const V = viewSize(svg);
  const k = V / 128; // 자국을 이 그림 크기에 맞춘다
  const open = svg.indexOf('>') + 1;
  const head = svg.slice(0, open);
  const body = svg.slice(open, svg.lastIndexOf('</svg>'));

  // 발밑(가로 가운데 · 세로 아래)이 축이다. 머리만 움직이고 발은 땅에 붙어 있다.
  const px = V / 2;
  const py = V * 0.97;
  const squash = sx === 1 && sy === 1
    ? ''
    : ` translate(${px} ${py}) scale(${sx} ${sy}) translate(${-px} ${-py})`;

  return `${head}
  <g transform="translate(${dx * k} 0) rotate(${lean} ${px} ${py})${squash}">
    ${body}
  </g>
  <g transform="scale(${k})">${mark}</g>
</svg>`;
}

// ── 자국들 — 전부 128 칸 기준, 몸 왼쪽 앞 ─────────────────────

/** 튀어오른 자리 — 슬라임. 눌렸다 펴지며 물방울이 튄다. */
const MARK_SPLASH = `
  <g>
    <!-- 몸통이 눌리며 앞으로 밀어낸 물결. 방울만으로는 안 보여서 물결을 크게 넣었다. -->
    <path d="M40 44 C 6 52, -6 72, 2 108" stroke="#7fdcff" stroke-width="12" fill="none"
          stroke-linecap="round" opacity="0.45"/>
    <path d="M38 48 C 8 56, -2 74, 4 100" stroke="#eafcff" stroke-width="4" fill="none"
          stroke-linecap="round" opacity="0.95"/>
    <g fill="#eafcff" opacity="0.95">
      <circle cx="-6" cy="60" r="6"/><circle cx="12" cy="40" r="4.4"/>
      <circle cx="-12" cy="88" r="4"/><circle cx="20" cy="92" r="3.2"/>
    </g>
  </g>`;

/** 급강하 — 박쥐. 뒤로 늘어지는 속도선 셋. */
const MARK_DIVE = `
  <g fill="none" stroke-linecap="round">
    <g stroke="#efe6ff" stroke-width="5" opacity="0.95">
      <path d="M40 40 L-8 62"/>
      <path d="M44 62 L-4 80"/>
    </g>
    <g stroke="#a98cff" stroke-width="7" opacity="0.5">
      <path d="M40 40 L-8 62"/>
      <path d="M44 62 L-4 80"/>
      <path d="M36 84 L0 96"/>
    </g>
  </g>`;

/** 포자 — 버섯. 앞으로 뿜는 자잘한 알갱이. */
const MARK_SPORE = `
  <g>
    <g fill="#7ad98a" opacity="0.35">
      <circle cx="30" cy="64" r="15"/><circle cx="10" cy="74" r="13"/><circle cx="-4" cy="58" r="10"/>
    </g>
    <g fill="#eaffd0" opacity="0.95">
      <circle cx="34" cy="60" r="5.5"/><circle cx="18" cy="50" r="4"/>
      <circle cx="12" cy="72" r="5"/><circle cx="-2" cy="60" r="3.4"/>
      <circle cx="24" cy="80" r="3.6"/><circle cx="-8" cy="80" r="2.6"/>
    </g>
  </g>`;

/** 발톱 — 늑대. 세 줄이 나란히 지나간다. */
const MARK_CLAW = `
  <g fill="none" stroke-linecap="round">
    <g stroke="#ff9aa2" stroke-width="9" opacity="0.4">
      <path d="M34 34 Q6 60 -6 96"/>
      <path d="M46 40 Q20 64 8 100"/>
      <path d="M22 40 Q0 60 -12 84"/>
    </g>
    <g stroke="#ffffff" stroke-width="3.4" opacity="0.95">
      <path d="M34 34 Q6 60 -6 96"/>
      <path d="M46 40 Q20 64 8 100"/>
      <path d="M22 40 Q0 60 -12 84"/>
    </g>
  </g>`;

/** 손끝 불꽃 — 꼬마 악마. 작고 빠른 마법. */
const MARK_SPARK = `
  <g opacity="0.98">
    <circle cx="16" cy="70" r="22" fill="#ff7a2b" opacity="0.4"/>
    <circle cx="16" cy="70" r="11" fill="#ffd9a0" opacity="0.9"/>
    <circle cx="16" cy="70" r="5.5" fill="#fffbf0"/>
    <g stroke="#ffc78a" stroke-width="3.4" stroke-linecap="round">
      <path d="M16 42 L16 54"/><path d="M16 86 L16 98"/>
      <path d="M-12 70 L0 70"/><path d="M32 70 L44 70"/>
    </g>
  </g>`;

/** 뼈칼 — 해골. 마른 호 하나. */
const MARK_BONE = `
  <g fill="none" stroke-linecap="round">
    <path d="M40 26 Q-6 60 6 104" stroke="#9be8e0" stroke-width="10" opacity="0.4"/>
    <path d="M40 26 Q-6 60 6 104" stroke="#f2fffd" stroke-width="3.6" opacity="0.95"/>
    <g fill="#d8fff8" stroke="none" opacity="0.9">
      <circle cx="0" cy="86" r="3.4"/><circle cx="18" cy="40" r="2.6"/>
    </g>
  </g>`;

/** 내려치는 칼 — 악마 병사. 굵고 무겁다. */
const MARK_BLADE = `
  <g fill="none" stroke-linecap="round">
    <path d="M44 20 Q-8 56 4 108" stroke="#ffd9d9" stroke-width="13" opacity="0.5"/>
    <path d="M44 24 Q-2 56 6 100" stroke="#ffffff" stroke-width="4" opacity="0.95"/>
    <g fill="#ffffff" stroke="none" opacity="0.85">
      <circle cx="2" cy="86" r="3.4"/><circle cx="22" cy="38" r="2.6"/>
    </g>
  </g>`;

/** 마법진 조각 — 정찰대장. 앞에 고리가 하나 그려진다. */
const MARK_RUNE = `
  <g opacity="0.95" fill="none" stroke="#d9bcff">
    <circle cx="12" cy="68" r="30" stroke-width="4"/>
    <circle cx="12" cy="68" r="18" stroke-width="2.4" opacity="0.85"/>
    <g stroke-width="3" stroke-linecap="round">
      <path d="M12 30 L12 42"/><path d="M12 94 L12 106"/>
      <path d="M-26 68 L-14 68"/><path d="M38 68 L50 68"/>
    </g>
    <circle cx="12" cy="68" r="6" fill="#f6ecff" stroke="none"/>
  </g>`;

/** 어두운 파동 — 발가르. 두 겹으로 밀려 나간다. */
const MARK_DARK = `
  <g fill="none" stroke-linecap="round">
    <path d="M30 24 Q-16 68 30 112" stroke="#8b5cf6" stroke-width="12" opacity="0.5"/>
    <path d="M30 24 Q-16 68 30 112" stroke="#efe6ff" stroke-width="4" opacity="0.9"/>
    <path d="M40 44 Q10 68 40 92" stroke="#c4b5fd" stroke-width="3" opacity="0.8"/>
    <g fill="#e9defd" stroke="none" opacity="0.9">
      <circle cx="-8" cy="52" r="3.4"/><circle cx="-12" cy="84" r="2.8"/>
    </g>
  </g>`;

/** 숨 — 고룡. 앞으로 벌어지는 원뿔. 색만 바꿔 둘로 쓴다. */
const breath = (a, b) => `
  <defs>
    <linearGradient id="br" x1="1" y1="0.5" x2="0" y2="0.5">
      <stop offset="0" stop-color="${a}" stop-opacity="0.95"/>
      <stop offset="0.55" stop-color="${b}" stop-opacity="0.7"/>
      <stop offset="1" stop-color="${b}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <!-- 곧은 삼각형이 아니라 **갈라지는 혀** — 삼각형이면 종이 조각처럼 보인다.
       입에서 시작해 왼쪽 테두리 밖까지 뻗어 나간다. -->
  <path d="M56 64
           C 30 34, 6 22, -34 6
           C -4 40, -6 44, -44 46
           C -8 58, -8 68, -46 84
           C -6 84, -2 90, -30 118
           C 12 96, 34 84, 56 64 Z" fill="url(#br)"/>
  <path d="M50 64
           C 30 44, 14 36, -12 26
           C 8 50, 8 52, -16 58
           C 8 66, 8 70, -14 82
           C 12 78, 32 74, 50 64 Z" fill="${a}" opacity="0.85"/>
  <g fill="${a}" opacity="0.9">
    <circle cx="-30" cy="30" r="4.4"/><circle cx="-36" cy="98" r="3.6"/><circle cx="-4" cy="66" r="3"/>
  </g>`;

/**
 * 몬스터마다 어떻게 덤비나.
 *
 * 값을 고르는 규칙 하나 — **몸이 클수록 적게 움직인다.** 고룡이 늑대처럼
 * 껑충 뛰면 무게가 사라진다. 그래서 dx·lean 이 뒤로 갈수록 작다.
 */
const MON_ATTACK = {
  // 물컹한 것은 기울지 않는다. 눌렸다 펴진다.
  slime:         { dx: -7, lean: 0,  sx: 1.12, sy: 0.9,  mark: MARK_SPLASH },
  bat:           { dx: -9, lean: -12, mark: MARK_DIVE },
  mushroom:      { dx: -3, lean: -4, sx: 1.06, sy: 0.96, mark: MARK_SPORE },
  wolf:          { dx: -9, lean: -10, sx: 1.08, mark: MARK_CLAW },
  imp:           { dx: -5, lean: -8,  mark: MARK_SPARK },
  skeleton:      { dx: -6, lean: -9,  mark: MARK_BONE },
  demon_soldier: { dx: -6, lean: -8,  mark: MARK_BLADE },
  imp_captain:   { dx: -4, lean: -6,  mark: MARK_RUNE },
  demon_general: { dx: -4, lean: -6,  mark: MARK_DARK },
  // 고룡은 제자리에서 숨만 내쉰다. 큰 것이 달려들면 우스워진다.
  great_dragon:  { dx: -2, lean: -3, sx: 1.03, mark: breath('#ffd27a', '#ff7a2b') },
  elder_dragon:  { dx: -2, lean: -3, sx: 1.03, mark: breath('#a8e6ff', '#4aa3ff') },
};

module.exports = { attackPose, MON_ATTACK };
