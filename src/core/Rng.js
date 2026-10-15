// 책임: 시드 기반 난수 생성기(mulberry32). 같은 시드 → 같은 수열.
// 금지: 전역 Math.random() 사용. 재현 가능한 전투 계산을 위해 반드시 시드를 쓴다.

export function createRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  rng.float = (min, max) => min + rng() * (max - min);
  rng.chance = (p) => rng() < p;
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

/** 전투 시드처럼 "매번 달라야 하지만 재현은 가능해야 하는" 값에 쓴다. */
export function makeSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}
