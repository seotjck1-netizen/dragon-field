// 책임: "이 사람이 실제로 **논** 시간이 얼마인가" 하나만 답한다(순수 함수).
// 금지: HTTP · 저장소 접근. 계정 조각을 받아 새 조각을 돌려줄 뿐이다.
//
// ── 왜 필요한가 ────────────────────────────────────────────
// 랭킹은 타임어택이다. 0.70.1 까지는 걸린 시간을 이렇게 쟀다:
//
//     걸린 시간 = 지금 − 캐릭터가 태어난 시각(bornAt)
//
// 이건 **벽시계**다. 접속을 끊고 자는 동안에도 흐른다. 그래서 저녁에 시작해
// 다음 날 이어서 하면, 실제로는 두 시간을 놀았는데 기록은 "14시간" 이 된다.
// 하루에 몰아서 할 수 있는 사람만 표에 오를 수 있다는 뜻이라, 견줄 값이 못 된다.
//
// 이제는 **접속해 있는 동안만** 센다:
//
//     걸린 시간 = 지금까지 쌓아 둔 playMs + (지금 − 마지막으로 확인한 때)
//
// ── 왜 서버가 세는가 ───────────────────────────────────────
// 게임 쪽이 "저 3분 놀았어요" 라고 보내면 그 값은 곧 누구나 고칠 수 있는 값이다.
// 랭킹의 잣대가 그런 값이면 표 자체가 뜻을 잃는다(submitRank 의 주석도 같은 말이다).
// 그래서 서버가 자기 시계로만 잰다. 게임 쪽이 보내는 것은 "저 아직 있어요"
// (= 세이브 요청) 뿐이고, 그건 시간을 **늘리는** 쪽으로 속일 수 없다.
//
// ── 접속을 끊은 것을 어떻게 아는가 ─────────────────────────
// 브라우저는 인사도 없이 사라진다(탭을 닫으면 끝이다). 그래서 "끊겼다" 를
// 기다리지 않고, **마지막으로 소식을 들은 때**까지만 인정한다.
// 게임은 20초마다 저장하므로(main.js AUTOSAVE_MS), 소식이 끊기면 그 자리에서
// 시계도 멈춘다. 다시 접속하면 그때부터 다시 흐른다.
//
// GAP_CAP 은 그 "한 번에 인정하는 공백" 의 상한이다. 20초 주기에 넉넉한 값이면서,
// 잠깐 렉이 걸리거나 다른 탭에 가려 브라우저가 타이머를 늦춰도(1분까지 늦춘다)
// 그 시간을 잃지 않을 만큼은 되어야 한다.

/** 한 번에 인정하는 최대 공백(ms). 이보다 오래 소식이 없으면 그동안은 논 것이 아니다. */
const GAP_CAP_MS = 70000;

/** 계정에 적힌 값을 숫자로. 없거나 이상하면 0. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 옛 계정에 시계를 처음 달아 줄 때 쓰는 값.
 *
 * ⚠ **0 으로 시작하지 않는다.** 0.70.2 로 올리는 순간 이미 사흘째 키우고 있던
 *   계정의 시계가 0 초가 되면, 그 사람은 다 큰 캐릭터로 "10초 만에 잡았다" 를
 *   올릴 수 있다. 새로 시작하는 사람은 몇 시간을 놀아야 하는데 말이다.
 *   그래서 **여태 쓰던 벽시계 값을 그대로 물려받는다** — 시계가 뒤로 가는 일은 없다.
 *   제대로 잰 0 초부터 다시 하려면 '다시 도전'(restartAccount)을 누르면 된다.
 */
function seedMs(acct, now) {
  const born = Date.parse((acct && (acct.bornAt || acct.createdAt)) || '') || 0;
  if (!born || born > now) return 0;
  return now - born;
}

/**
 * 지금까지 실제로 논 시간(ms).
 *
 * 쌓아 둔 값에 **아직 안 쌓은 이번 토막**을 더해서 돌려준다. 그래야 기록을 올리는
 * 그 순간까지가 들어간다(안 그러면 마지막 저장 이후의 몇 초가 통째로 빠진다).
 */
function playedMs(acct, now = Date.now()) {
  if (!acct) return 0;
  const base = acct.playMs == null ? seedMs(acct, now) : num(acct.playMs);
  const last = Date.parse(acct.tickAt || '') || 0;
  if (!last || last > now) return base;
  return base + Math.min(Math.max(0, now - last), GAP_CAP_MS);
}

/**
 * "아직 여기 있다" 는 소식을 들었을 때 계정에 덧쓸 조각.
 * 지금까지의 토막을 쌓아 넣고, 다음 토막의 출발선을 지금으로 옮긴다.
 */
function tick(acct, now = Date.now()) {
  return { playMs: playedMs(acct, now), tickAt: new Date(now).toISOString() };
}

/**
 * 접속했을 때 계정에 덧쓸 조각.
 *
 * ⚠ 쌓기부터 하면 안 된다 — 마지막 소식과 지금 사이는 **접속이 끊겨 있던 동안**이다.
 *   그건 논 시간이 아니다. 그래서 여기서는 출발선만 지금으로 옮긴다.
 *   (옛 계정이면 이때 시계를 달아 준다)
 */
function startSession(acct, now = Date.now()) {
  const base = acct && acct.playMs == null ? seedMs(acct, now) : num(acct && acct.playMs);
  return { playMs: base, tickAt: new Date(now).toISOString() };
}

/** 시계를 0 초로. '다시 도전' 과 시즌 초기화가 쓴다. */
function resetClock(now = Date.now()) {
  return { playMs: 0, tickAt: new Date(now).toISOString() };
}

module.exports = { GAP_CAP_MS, playedMs, tick, startSession, resetClock, seedMs };
