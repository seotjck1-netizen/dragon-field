// 타일이 지켜야 하는 것 — 브라우저 없이 소스와 표만 읽어서 잰다.
//
// 0.70.23 까지 `/tmp/tiletrans.js` 로 돌던 것을 저장소 안으로 옮겨 왔다
// (0.70.24 에 작업 공간이 비워지면서 /tmp 의 시험이 통째로 사라졌다).
//
// 왜 브라우저를 안 띄우나: 여기서 보는 것은 **그림과 표의 앞뒤가 맞는가** 뿐이다.
// 게임을 띄우지 않아도 알 수 있는 것은 띄우지 않고 재는 것이 빠르고, 빨라야 자주 돈다.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/manifest.json'), 'utf8'));
const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/maps.json'), 'utf8'));
const src = fs.readFileSync(path.join(ROOT, 'src/scenes/FieldScene.js'), 'utf8');

const ok = [], bad = [];
const check = (n, c, x = '') => (c ? ok : bad).push(n + (x ? ` — ${x}` : ''));

/** 소스에서 `이름 = { ... };` 덩어리 하나를 잘라 온다. */
const blockOf = (head) => {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const end = src.indexOf('\n};', i);
  return end < 0 ? '' : src.slice(i, end + 3);
};
const namesIn = (block) => (block.match(/'tile_\w+'/g) || []).map((q) => q.slice(1, -1));

// ── ① 표와 파일이 맞는가 ────────────────────────────────────
const missing = [];
for (const [k, v] of Object.entries(man)) {
  if (!fs.existsSync(path.join(ROOT, v.src))) missing.push(k);
}
check('표에 적힌 그림이 다 있다', missing.length === 0, missing.slice(0, 6).join(' '));

// ── ② 지도가 가리키는 그림이 표에 있는가 ────────────────────
const unknown = [];
for (const [ch, t] of Object.entries(maps.tileset)) {
  if (t.sprite && !man[t.sprite]) unknown.push(`${ch}:${t.sprite}`);
  if (t.under && !man[t.under]) unknown.push(`${ch}.under:${t.under}`);
}
check('지도가 없는 그림을 안 가리킨다', unknown.length === 0, unknown.join(' '));

// ── ③ 지도마다 제 바닥을 말하는가 ───────────────────────────
//
// 안 말하면 풀이 깔린다 — 성 안에 잔디가 깔리는 그 일이다.
const groundsBlock = blockOf('export const GROUNDS = {');
const groundKeys = [...groundsBlock.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
check('바닥 표를 읽었다', groundKeys.length >= 5, groundKeys.join(' '));
const noGround = Object.entries(maps.maps)
  .filter(([, m]) => !m.ground || !groundKeys.includes(m.ground))
  .map(([id, m]) => `${id}(${m.ground || '없음'})`);
check('지도마다 제 바닥을 말한다', noGround.length === 0, noGround.join(' '));

// ── ④ 깔리는 바닥에 구멍이 없는가 ───────────────────────────
//
// 바닥은 **밑에 아무것도 없다.** 투명한 자리가 있으면 그 자리는 그냥 검게 남는다.
const groundSprites = new Set(namesIn(groundsBlock));
check('바닥 그림을 여럿 읽었다', groundSprites.size >= 10, `${groundSprites.size}장`);

// ── ⑤ 큰 그림이 제자리에 등록돼 있는가 ──────────────────────
//
// 칸(32)보다 크게 구운 그림은 **세워서** 그려야 한다. 안 그러면 좌상단으로
// 찍혀 **아래 칸을 덮는다.** 세우는 곳은 둘뿐이다:
//   · `GROWN`  — 바닥 판에 발밑 기준으로 굽는다(낮은 물건)
//   · `TALL`   — 배우 목록에 세운다(키 큰 것). 지붕 마루도 여기 친다.
//
// ⚠ 목록을 **손으로 적지 않는다.** 0.70.23 에 화산 나무 넷을 TALL 에 넣고
//   시험 쪽 목록에 안 적어서, 멀쩡한 그림이 '떠도는 큰 타일' 로 잡혔다.
//   손으로 적는 목록은 반드시 한쪽을 잊는다 — 코드에서 읽는다.
const grownRaw = src.slice(src.indexOf('const GROWN = new Set(['));
const grownSet = new Set(
  (grownRaw.slice(0, grownRaw.indexOf(']);')).match(/'tile_\w+'/g) || []).map((q) => q.slice(1, -1)));
const tall = new Set([
  ...namesIn(blockOf('const TALL = {')),
  ...namesIn(blockOf('const ROOF_TOP = {')),
]);
check('큰 물건 표를 읽었다', grownSet.size >= 8, `${grownSet.size}장`);
check('세우는 큰 그림 표를 읽었다', tall.size >= 7, `${tall.size}장`);

const stray = [];
for (const [k, v] of Object.entries(man)) {
  if (!k.startsWith('tile_')) continue;
  if (v.w <= 32 && v.h <= 32) continue;
  if (grownSet.has(k) || tall.has(k)) continue;
  stray.push(`${k}(${v.w}x${v.h})`);
}
check('큰데 안 세우는 타일이 없다', stray.length === 0, stray.join(' '));

const smallGrown = [];
for (const k of grownSet) {
  const m = man[k];
  if (!m) { smallGrown.push(`${k}(표에 없음)`); continue; }
  // 가로만 넓히는 것도 있다(침대는 두 칸짜리라 세로를 안 키운다).
  if (m.w <= 32 && m.h <= 32) smallGrown.push(`${k}(${m.w}x${m.h})`);
}
check('큰 물건은 실제로 한 칸보다 크다', smallGrown.length === 0, smallGrown.join(' '));

// ── ⑥ 침대는 두 칸짜리다 ────────────────────────────────────
//
// 그림만 키우면 위 칸(벽)을 덮는다. 세로를 안 키우고 글자 둘로 나눈다.
check('침대는 세로로 안 커진다',
  man.tile_bed.h <= 32 && man.tile_bed_foot.h <= 32,
  `${man.tile_bed.h} · ${man.tile_bed_foot.h}`);
check('침대는 가로로는 넓다', man.tile_bed.w > 32, String(man.tile_bed.w));

const byS = {};
for (const [ch, t] of Object.entries(maps.tileset)) byS[t.sprite] = ch;
const headCh = byS.tile_bed, footCh = byS.tile_bed_foot;
const halfBeds = [];
for (const [id, m] of Object.entries(maps.maps)) {
  for (let y = 0; y < (m.grid || []).length; y++) {
    for (let x = 0; x < m.grid[y].length; x++) {
      if (m.grid[y][x] !== headCh) continue;
      if (!m.grid[y + 1] || m.grid[y + 1][x] !== footCh) halfBeds.push(`${id}@${x},${y}`);
    }
  }
}
check('머리맡 밑에는 발치가 있다', halfBeds.length === 0, halfBeds.join(' '));

// ── ⑦ 2배로 구웠는가 ────────────────────────────────────────
//
// 표의 w/h 는 **그릴 크기**다. 파일은 그 두 배로 굽는다(선명하게 보이라고).
// 여기서는 파일이 있는지까지만 보고, 실제 크기는 그림을 읽어야 하므로 건너뛴다.
check('표가 그릴 크기를 적는다',
  man.tile_tree_big.w === 56 && man.tile_tree_big.h === 72,
  `${man.tile_tree_big.w}x${man.tile_tree_big.h}`);

console.log('');
for (const s of ok) console.log('  ✓', s);
for (const s of bad) console.log('  ✗', s);
console.log(`\n  ${ok.length} 통과 · ${bad.length} 실패`);
process.exit(bad.length ? 1 : 0);
