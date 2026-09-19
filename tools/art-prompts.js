#!/usr/bin/env node
/**
 * **그림 258장을 바깥 그림 도구(힉스필드 등)에 맡길 때 건네는 주문서**를 만든다.
 *
 *   node tools/art-prompts.js          art/ 아래에 주문서를 굽는다
 *   node tools/art-prompts.js --en     프롬프트를 영어로만 (그림 모델은 영어를 더 잘 알아듣는다)
 *
 * 만드는 것
 *   art/STYLE.md      — 258장 **전부에 똑같이** 붙이는 화풍 한 덩이. 이것이 통일감을 만든다.
 *   art/prompts.csv   — 한 줄에 한 장. 키 · 파일 · 구울 크기 · 그릴 크기 · 프롬프트
 *   art/prompts.md    — 사람이 보고 하나씩 복사해 쓰는 판
 *   art/HOWTO.md      — 넘기는 차례와 되받는 차례
 *
 * ── 왜 도구로 만드나 ───────────────────────────────────────
 * 손으로 258줄을 적으면 ① 화풍 문장이 장마다 조금씩 달라지고 ② 표(items.json,
 * monsters.json)가 바뀌어도 주문서는 안 바뀐다. 주문서를 **표에서 뽑아** 만들면
 * 화풍은 한 곳에서만 고치면 되고, 표가 바뀌면 다시 돌리기만 하면 된다.
 *
 * ⚠ manifest 의 w/h 는 **화면에 그릴 크기**지 파일 크기가 아니다.
 *   실제 파일은 2~4배로 구워져 있다(gen-assets.js 가 deviceScaleFactor 2 로 찍는다).
 *   그림을 새로 받을 때도 **지금 파일과 같은 크기**로 맞춰야 흐려지지 않는다.
 *   그래서 이 주문서는 '구울 크기(=지금 파일 크기)' 를 적는다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'art');
const EN_ONLY = process.argv.includes('--en');

const manifest = require(path.join(ROOT, 'src/data/manifest.json'));
const items = require(path.join(ROOT, 'src/data/items.json'));
const monsters = require(path.join(ROOT, 'src/data/monsters.json'));
const npcs = require(path.join(ROOT, 'src/data/npcs.json'));
const classes = require(path.join(ROOT, 'src/data/classes.json'));

/** PNG 머리에서 크기만 읽는다(라이브러리 없이). */
function pngSize(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(24);
    fs.readSync(fd, b, 0, 24, 0);
    fs.closeSync(fd);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  } catch { return null; }
}

// ────────────────────────────────────────────────────────────
// 화풍 한 덩이 — 258장 전부에 똑같이 붙는다.
//
// 이 문장이 장마다 달라지면 그림도 장마다 달라진다. 그래서 한 곳에만 둔다.
// 색은 지금 게임에서 실제로 쓰는 값을 적었다(tools/art-*.js 에서 뽑았다).
// ────────────────────────────────────────────────────────────
const STYLE_EN = [
  'Flat vector game art, hand-painted storybook look, soft cel shading with two or three',
  'tone steps per surface, NO black outlines, NO gradients across the whole image,',
  'NO photorealism, NO 3D render, NO pixel art dithering.',
  'Warm saturated fantasy palette anchored on: grass #49a34a, deep leaf #3f9642,',
  'wood #8b5a2b, dark wood #6b4423, stone #8f97ab, cold stone #b7bfd0, water #7cc4ff,',
  'pale sky #cfe4ff, gold #ffd166, pale gold #ffe9a8, ember #c98a5c, arcane #c58cff,',
  'shadow #2a0c08. Clean readable silhouette that still reads at 1/4 size.',
  'Even ambient light from above, no cast shadow on the ground unless asked.',
].join(' ');

const STYLE_KO = [
  '평평한 벡터 게임 그림, 손으로 칠한 동화책 느낌, 면마다 두세 단계 셀 음영,',
  '검은 외곽선 없음, 화면 전체를 가로지르는 그라데이션 없음,',
  '사진 같은 묘사 없음, 3D 렌더 없음, 픽셀아트 디더링 없음.',
  '따뜻하고 진한 판타지 색. 기준색: 풀 #49a34a, 짙은 잎 #3f9642, 나무 #8b5a2b,',
  '짙은 나무 #6b4423, 돌 #8f97ab, 찬 돌 #b7bfd0, 물 #7cc4ff, 옅은 하늘 #cfe4ff,',
  '금 #ffd166, 옅은 금 #ffe9a8, 잉걸 #c98a5c, 마력 #c58cff, 그림자 #2a0c08.',
  '1/4 로 줄여도 알아볼 수 있는 또렷한 실루엣. 위에서 고르게 드는 빛, 바닥 그림자 없음.',
].join(' ');

/** 배경 규칙 — 딱 두 갈래뿐이다. */
const BG_CUT = 'Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), '
  + 'so the background can be keyed out to transparent. Do not crop any part of the subject.';
const BG_FILL = 'The image fills the entire canvas edge to edge with no border, no frame, no margin.';

// ────────────────────────────────────────────────────────────
// 갈래마다의 형식 규칙
// ────────────────────────────────────────────────────────────

/** 바닥 타일 — 이어 붙는다. 여기가 제일 까다롭다. */
const RULE_GROUND = [
  'Seamless repeating floor tile, straight top-down view (camera exactly overhead).',
  BG_FILL,
  '⚠ CRITICAL: the tile is laid in a 40x32 grid, so it must tile seamlessly —',
  'left edge must continue into the right edge and top into bottom.',
  'ABSOLUTELY NO directional light (no brighter-top/darker-bottom), NO vignette,',
  'NO border or outline on any edge, NO single big feature in the centre.',
  'Keep the base colour perfectly flat and put all variation into small scattered',
  'speckles and marks that do not touch the edges.',
].join(' ');

/** 얹는 타일 — 밑의 땅이 비쳐야 한다. */
const RULE_OVERLAY = [
  'Single object drawn small and centred, seen from a 3/4 top-down angle.',
  BG_CUT,
  'The outer edge of the object must be ragged and irregular (not a filled square),',
  'because this is layered on top of a ground tile and the ground shows through around it.',
  'No ground, no grass, no base plate underneath.',
].join(' ');

/** 이음새 타일 — 한 변만 다른 땅이 물린다. */
const RULE_EDGE = [
  'Transition tile: one single edge of the square carries the second material,',
  'the rest of the tile is the first material. Straight top-down view.', BG_FILL,
  'The wavy boundary must start and end exactly at the two side edges so that',
  'neighbouring copies line up. No directional light, no border.',
].join(' ');

/** 키 큰 타일 — 칸 밖으로 자란다. */
const RULE_TALL = [
  'Tall object standing on the ground, seen from a 3/4 top-down angle, drawn so that',
  'the base sits at the very bottom edge of the canvas and the top is free.', BG_CUT,
  'No ground plate, no shadow disc under it.',
].join(' ');

/** 들판 몬스터·주인공 — 위에서 비스듬히 본다. */
const RULE_FIELD = [
  '3/4 top-down view as seen in a JRPG overworld, the character standing and facing',
  'the camera-left, feet touching the very bottom edge of the canvas,',
  'head near the top with a small margin.', BG_CUT,
  'Whole body in frame, symmetrical readable silhouette, no motion blur.',
].join(' ');

/** 전투 그림 — 옆에서 본다. 왼쪽이 주인공 쪽이다. */
const RULE_BATTLE = [
  'Side view battle portrait, full body, standing in an idle ready stance and',
  'FACING LEFT (the enemy is off-frame to the left).',
  'Feet touch the very bottom edge of the canvas, head near the top.', BG_CUT,
  'Dramatic but still, no motion lines.',
].join(' ');

/** 걷는 두 장 — 서 있는 그림과 **같은 몸**이어야 한다. 자세만 다르다. */
const RULE_WALK = [
  'The SAME character as the standing version — identical colours, proportions, clothing',
  'and silhouette — caught mid-stride in a walk cycle, seen from the same 3/4 top-down angle.',
  'One leg is forward and slightly lower in frame, the other is back; the arms swing the',
  'OPPOSITE way to the legs. Feet stay at the very bottom edge of the canvas.', BG_CUT,
  'This is one frame of a looping walk, so keep the pose readable and symmetrical in weight.',
].join(' ');

/** 뒷모습 — 같은 사람을 뒤에서 본 것. 얼굴이 없다. */
const RULE_BACK = [
  'The SAME character as the standing version, seen from BEHIND — the back of the head and',
  'body, no face at all, same colours, proportions, clothing and hair colour.',
  'Standing still, 3/4 top-down view, feet at the very bottom edge of the canvas.', BG_CUT,
  'Anything worn on the back (quiver, cloak, braid) is now clearly visible.',
].join(' ');

const RULE_ATTACK = [
  'Side view, full body, caught at the peak of a forward lunging attack toward the LEFT,',
  'weight thrown forward, weapon or limb extended left.',
  'Same character, same colours and same proportions as the idle version —',
  'only the pose changes. Feet near the bottom edge.', BG_CUT,
].join(' ');

const RULE_STANCE = [
  'Side view, full body, braced defensive stance facing LEFT — knees bent, guard raised.',
  'Same character, same colours and same proportions as the idle version —',
  'only the pose changes. Feet near the bottom edge.', BG_CUT,
].join(' ');

/** 마을 사람 — 세로로 길다. */
const RULE_NPC = [
  '3/4 top-down view, full body, standing still and facing the camera,',
  'feet at the very bottom edge of the canvas.', BG_CUT,
  'Friendly readable silhouette; the clothing colour is what players recognise them by,',
  'so keep one strong signature colour.',
].join(' ');

/** 물건 그림 — 칸 안에 담기는 아이콘이다. */
const RULE_ITEM = [
  'Single game inventory icon, one object only, floating centred with a small even margin',
  'on all four sides, seen from a slight 3/4 angle.', BG_CUT,
  'No hand holding it, no pedestal, no text, no rarity frame, no glow border.',
  'It must still be recognisable shrunk to 1/4 size, so keep the silhouette simple',
  'and the local colour strong.',
].join(' ');

const RULE_FX = [
  'A single combat effect shape on its own — a burst/streak of light and colour with',
  'nothing behind it. Centred, radiating outward, fading to nothing before the canvas edge.',
  BG_CUT, 'No character, no weapon, no background, no text.',
].join(' ');

const RULE_MARK = [
  'Tiny flat emblem/badge, one simple symbol only, heavy shapes, no fine detail,',
  'because it is shown at 24x24 pixels.', BG_CUT, 'No text, no border ring.',
].join(' ');

const RULE_BG = [
  'Wide battle backdrop painted as scenery only — no characters, no creatures, no UI.',
  BG_FILL,
  'The bottom third is the ground the fighters stand on and must stay uncluttered and',
  'low-contrast; the interesting shapes belong in the upper two thirds.',
  'Slightly desaturated so that sprites drawn on top of it stand out.',
].join(' ');

// ────────────────────────────────────────────────────────────
// 갈래 나누기
// ────────────────────────────────────────────────────────────

/** 이어 붙는 바닥으로 쓰는 타일들. 나머지 32×32 타일은 얹는 그림으로 본다. */
const GROUND = new Set([
  'grass', 'grass2', 'grass3', 'grass4', 'path', 'path2', 'path3', 'path4',
  'water', 'water2', 'brick', 'brick2',
  'castle_floor', 'castle_floor2', 'dungeon_floor', 'dungeon_floor2', 'ash', 'ash_path',
  'charred', 'basalt', 'magma', 'ember', 'waste', 'waste2', 'waste3', 'waste4', 'waste5',
  'ash2', 'ash3', 'room_floor',
  'house_wall', 'house_roof', 'castle_wall', 'castle_top', 'dungeon_wall', 'room_wall',
]);

function familyOf(key, v) {
  const name = path.basename(v.src, '.png');
  if (key.startsWith('tile_')) {
    if (v.w !== 32 || v.h !== 32) return 'tile_tall';
    if (/^tile_(edge_|shore_|crust_)/.test(key)) return 'tile_edge';
    return GROUND.has(name) ? 'tile_ground' : 'tile_overlay';
  }
  if (key.startsWith('mark_')) return 'mark';
  if (key.startsWith('fx_')) return 'fx';
  if (key.startsWith('item_')) return 'item';
  if (key.startsWith('npc_')) return 'npc';
  if (key.startsWith('bg_')) return 'bg';
  if (/_back$/.test(key)) return 'back';
  if (/_walk\d$/.test(key)) return 'walk';
  if (/_attack$/.test(key)) return 'attack';
  if (/_stance$/.test(key)) return 'stance';
  if (/_field$/.test(key)) return 'field';
  if (/_battle$/.test(key)) return 'battle';
  return 'item';
}

const RULES = {
  tile_ground: RULE_GROUND, tile_overlay: RULE_OVERLAY, tile_edge: RULE_EDGE,
  tile_tall: RULE_TALL, field: RULE_FIELD, battle: RULE_BATTLE, attack: RULE_ATTACK,
  stance: RULE_STANCE, walk: RULE_WALK, back: RULE_BACK, npc: RULE_NPC, item: RULE_ITEM, fx: RULE_FX, mark: RULE_MARK,
  bg: RULE_BG,
};

const FAMILY_KO = {
  tile_ground: '바닥 타일(이어 붙음)', tile_overlay: '얹는 타일', tile_edge: '이음새 타일',
  tile_tall: '키 큰 타일', field: '들판 그림', battle: '전투 그림', attack: '공격 자세',
  stance: '방어 자세', walk: '걷는 자세', back: '뒷모습', npc: '마을 사람', item: '물건 아이콘', fx: '전투 효과',
  mark: '작은 표식', bg: '전투 배경',
};

// ────────────────────────────────────────────────────────────
// 무엇을 그릴지 — 게임 표에서 뽑는다
// ────────────────────────────────────────────────────────────

/** key → 몬스터 한 마리(들판/전투/공격 셋이 같은 몸을 쓴다). */
const MON_BY_SPRITE = {};
for (const [id, m] of Object.entries(monsters)) {
  const base = String(m.sprite || '').replace(/^mon_/, '').replace(/_field$/, '');
  if (base && !MON_BY_SPRITE[base]) MON_BY_SPRITE[base] = { id, ...m };
}

/** key → NPC 한 사람. */
const NPC_BY_SPRITE = {};
for (const [id, n] of Object.entries(npcs)) {
  if (n.sprite) NPC_BY_SPRITE[n.sprite] = { id, ...n };
}

/** key → 물건 하나. */
const ITEM_BY_ICON = {};
for (const [id, it] of Object.entries(items)) {
  if (it.icon) ITEM_BY_ICON[it.icon] = { id, ...it };
}

const RARITY_EN = {
  common: 'plain everyday craftsmanship, muted colours, no gems',
  uncommon: 'decent craftsmanship, one small accent colour',
  rare: 'fine craftsmanship, blue-steel sheen and a small inlaid stone',
  epic: 'ornate, purple-arcane accents and engraved patterns',
  legendary: 'unmistakably legendary — gold filigree, glowing core, dramatic silhouette',
};

/** 손으로 적는 자리. 표가 모르는 것(타일·효과·표식·배경)만 여기에 있다. */
const HAND = {
  tile_grass: 'lush short meadow grass, scattered blades and a few tiny clover leaves',
  tile_grass2: 'the same meadow grass with a different scatter of blades and one small dirt scuff',
  tile_grass3: 'the same meadow grass with a different scatter of blades and two tiny pebbles',
  tile_grass4: 'the same meadow grass with a different scatter of blades and a few tiny yellow flowers',
  tile_grass_tall: 'a clump of tall wild grass growing up out of the ground',
  tile_path: 'packed dry dirt path, warm brown, fine grit',
  tile_path2: 'the same dirt path with a slightly different grit scatter',
  tile_pebble: 'a handful of small grey pebbles lying loose',
  tile_tree: 'a small round-canopy broadleaf tree seen from above-behind',
  tile_tree2: 'a small conifer with a darker needled canopy',
  tile_tree3: 'a small broadleaf tree with a lighter, yellower canopy',
  tile_tree_shade: 'a soft pool of dappled tree shade, semi-transparent dark green',
  tile_tree_big: 'a tall mature broadleaf tree, thick trunk at the bottom, wide canopy at the top',
  tile_tree_big2: 'a tall old conifer, dark needled tiers stacked up the trunk',
  tile_tree_big3: 'a tall gnarled broadleaf tree with a twisted trunk and an autumn-tinted canopy',
  tile_bush: 'a low round leafy bush',
  tile_stump: 'a cut tree stump with visible rings',
  tile_rock: 'a grey weathered boulder',
  tile_wind_rock: 'a wind-scoured standing rock, pale and streaked',
  tile_water: 'calm shallow fresh water, gentle ripples',
  tile_water2: 'the same water with a different ripple pattern',
  tile_flower: 'a small patch of wildflowers in white, yellow and pink',
  tile_brick: 'fitted grey flagstone paving',
  tile_brick2: 'the same flagstone paving with different worn marks',
  tile_house_wall: 'plastered cottage wall with exposed timber framing',
  tile_house_roof: 'terracotta roof tiles laid in rows',
  tile_house_roof_top: 'the ridge cap of a terracotta roof, running left to right',
  tile_house_roof_top_l: 'the left end cap of a terracotta roof ridge',
  tile_house_roof_top_r: 'the right end cap of a terracotta roof ridge',
  tile_door: 'a sturdy wooden cottage door with iron hinges',
  tile_castle_wall: 'dressed pale stone castle masonry',
  tile_castle_top: 'the crenellated top course of a castle wall',
  tile_castle_batt: 'a battlement merlon seen from above',
  tile_castle_window: 'a narrow arched castle window with dark glass',
  tile_castle_glass: 'a stained-glass castle window in blue and gold',
  tile_castle_gate: 'a heavy iron-banded castle gate',
  tile_castle_floor: 'polished pale stone hall flooring',
  tile_castle_floor2: 'the same hall flooring with a different wear pattern',
  tile_castle_rug: 'a long red-and-gold royal carpet runner, seen from above',
  tile_castle_rug_end: 'the fringed end piece of that royal carpet runner',
  tile_castle_pillar: 'a fluted stone pillar',
  tile_fence: 'a low wooden picket fence running left to right',
  tile_gate_exit: 'a stone archway marking the way out of town',
  tile_signpost: 'a wooden signpost with a blank board',
  tile_sign_item: 'a hanging shop sign showing a potion bottle',
  tile_sign_weapon: 'a hanging shop sign showing a crossed sword and hammer',
  tile_sign_alchemy: 'a hanging shop sign showing a bubbling flask',
  tile_sign_inn: 'a hanging shop sign showing a bed and a mug',
  tile_stall_weapon: 'an open-air market stall with weapons racked on it',
  tile_stall_armor: 'an open-air market stall with armour pieces laid out',
  tile_dungeon_floor: 'damp dark prison flagstones',
  tile_dungeon_floor2: 'the same prison flagstones with different cracks',
  tile_dungeon_wall: 'cold dungeon block masonry, faintly damp',
  tile_stairs_down: 'a stone staircase descending into darkness',
  tile_stairs_up: 'a stone staircase climbing up toward light',
  tile_wall_torch: 'an iron wall bracket holding a lit torch',
  tile_dungeon_torch: 'a guttering dungeon torch in an iron ring, greenish flame',
  tile_forge_hearth: 'a blacksmith forge hearth glowing with coals',
  tile_forge_anvil: 'a blacksmith anvil on a wooden block',
  tile_waypoint_pad: 'a circular stone teleport pad inlaid with glowing blue runes',
  tile_ash: 'a floor of cold grey volcanic ash',
  tile_ash_path: 'a trodden path through volcanic ash, slightly darker and packed',
  tile_ash_rubble: 'a scatter of burnt rubble on ash',
  tile_ash_vent: 'a small vent in the ash breathing faint smoke',
  tile_charred: 'scorched blackened ground, still faintly warm',
  tile_charred_stump: 'the blackened stump of a burnt tree',
  tile_basalt: 'cracked black basalt rock',
  tile_magma: 'molten magma glowing orange through a black crust',
  tile_ember: 'cooling embers, dark with orange cracks',
  tile_waste: 'barren cracked wasteland dirt, pale and dry',
  tile_waste2: 'the same wasteland dirt with a different crack pattern',
  tile_waste3: 'the same wasteland dirt with a different crack pattern and a dry stain',
  tile_waste_rubble: 'a scatter of broken stone on wasteland dirt',
  tile_waste_bones: 'a few bleached bones half buried in wasteland dirt',
  tile_cliff: 'a sheer pale cliff face seen from above',
  tile_cliff_edge: 'the lip of a cliff where the ground drops away',
  tile_lair_gate: 'a colossal sealed stone gate carved with a dragon, faint red light in the seams',
  tile_room_floor: 'warm wooden interior floorboards',
  tile_room_wall: 'a plastered interior wall with a wooden wainscot',
  tile_room_window: 'a small interior window with daylight outside',
  tile_room_exit: 'an interior doorway leading out to the street',
  tile_counter: 'a wooden shop counter seen from above',
  tile_shelf: 'a wooden shelf stocked with jars and bundles',
  tile_barrel: 'a wooden barrel with iron bands',
  tile_bed: 'a simple inn bed with a folded blanket',
  tile_table: 'a wooden table with a candle on it',
  tile_cauldron: 'an alchemist cauldron with green liquid bubbling',

  // ⚠ 아래 여덟 장은 **큰 그림 한 장을 넷으로 자른 것**이다. 따로 만들면 이가 안 맞는다.
  //   한 장(2칸×2칸)을 만들어 4등분해서 넣어야 한다. HOWTO.md 의 '넷으로 쪼개는 것' 참고.
  tile_castle_gate_ul: 'TOP-LEFT quarter of a great arched castle gatehouse (iron-banded double doors under a stone arch)',
  tile_castle_gate_ur: 'TOP-RIGHT quarter of that same great arched castle gatehouse',
  tile_castle_gate_dl: 'BOTTOM-LEFT quarter of that same great arched castle gatehouse',
  tile_castle_gate_dr: 'BOTTOM-RIGHT quarter of that same great arched castle gatehouse',
  tile_castle_tower_tl: 'TOP-LEFT quarter of a round castle watchtower with a conical roof',
  tile_castle_tower_tr: 'TOP-RIGHT quarter of that same round castle watchtower',
  tile_castle_tower_bl: 'BOTTOM-LEFT quarter of that same round castle watchtower',
  tile_castle_tower_br: 'BOTTOM-RIGHT quarter of that same round castle watchtower',

  fx_slash: 'a wide curved sword slash arc, white-hot core fading to pale gold',
  fx_pierce: 'a straight sharp thrust streak, thin white core with cyan edges',
  fx_magic: 'a swirling arcane burst, violet #c58cff with white sparks',
  fx_fire: 'a blooming fire burst, orange-red core fading to smoke-less embers',
  fx_impact: 'a blunt radial impact starburst, pale grey-white shards',
  fx_guard: 'a hexagonal shield flare, pale blue #7cc4ff with a bright rim',

  mark_warrior: 'a sword crossed over a shield',
  mark_ranger: 'a drawn bow with one arrow',
  mark_mage: 'a staff topped with a glowing orb',

  bg_battle_field: 'a grassy field on the edge of a forest under an open sky, distant hills',
};

/** 이음새 타일은 이름에서 방향을 읽는다. */
const DIR_EN = { n: 'top', e: 'right', s: 'bottom', w: 'left' };
function edgeSubject(key) {
  const m = /^tile_(edge_grass|shore|crust)_(d?)([nesw]{1,2})$/.exec(key);
  if (!m) return null;
  const [, kind, d, dir] = m;
  const mat = kind === 'edge_grass' ? ['short meadow grass', 'bare dirt']
    : kind === 'shore' ? ['shallow water with a foam line', 'wet sand']
      : ['glowing magma', 'black basalt crust'];
  if (d === 'd') {
    const corner = dir.split('').map((c) => DIR_EN[c]).join('-');
    return `${mat[0]} meeting ${mat[1]} around the ${corner} corner of the tile`;
  }
  return `${mat[0]} on the ${DIR_EN[dir]} edge meeting ${mat[1]} across the rest of the tile`;
}

/**
 * 키에서 **영어 이름**을 뽑는다.
 *
 * ⚠ 그림 모델에게 '화염검' 이라고 하면 알아듣지 못한다. 다행히 이 게임의 키는
 *   이미 영어다(item_flame_sword). 밑줄을 풀면 그대로 쓸 수 있다.
 *   키가 무엇인지 잘 말해 주지 못하는 몇 개만 아래 표로 바로잡는다.
 */
const EN_NAME = {
  npc_gambler: 'old gem gambler', npc_elder: 'village elder', npc_kid: 'village child',
  npc_guard: 'town gate guard', npc_witch: 'swamp witch', npc_royal_smith: 'royal smith',
  npc_waypoint: 'standing waypoint stone', npc_quest_board: 'wooden quest board',
  npc_gate_merchant: 'merchant camped at the gate', npc_villager: 'townsfolk villager',
  chr_admin: 'game master in dark robes', chr_hero: 'sword-and-shield hero knight',
  chr_ranger: 'hooded bow ranger', chr_mage: 'staff-wielding mage',
  mon_imp_captain: 'imp scout captain', mon_demon_general: 'demon general warlord',
  mon_great_dragon: 'colossal ancient dragon', mon_elder_dragon: 'elder dragon, even larger and older',
  item_useless_sword: 'bent and notched junk sword', item_socket_drill: 'jeweller socket drill',
  item_magic_stone: 'glowing arcane stone', item_demon_core: 'dark demon core',
  item_slime_jelly: 'blob of slime jelly', item_bat_fang: 'curved bat fang',
  item_dragon_token: 'dragon-scale token', item_dragon_gate_key: 'ornate dragon gate key',
};
/** 장비에 붙은 기운(items.json 의 magic). 그림에 얹을 빛깔로 옮긴다. */
const MAGIC_EN = {
  보호: 'a warm protective golden aura', 서리: 'pale blue frost creeping along it',
  뇌전: 'crackling white-violet lightning', 성염: 'holy white-gold flame',
  완력: 'heavy red-hot strength runes', 질풍: 'streaks of pale green wind',
  마력: 'swirling violet arcane light', 가호: 'a soft white blessing glow',
  용혈: 'deep red dragon-blood veins glowing through it',
};

function enName(key) {
  // ⚠ 자세(_field/_battle/…)를 먼저 떼고 표를 본다. 안 떼면 chr_hero_field 가
  //   표의 chr_hero 를 못 찾아 그냥 'hero' 가 된다(실제로 그랬다).
  const bare = key.replace(/_(field|battle|attack|stance)$/, '');
  if (EN_NAME[bare]) return EN_NAME[bare];
  return bare.replace(/^(item|npc|mon|chr|tile|fx|mark|bg)_/, '').replace(/_/g, ' ');
}

/** 무엇을 그릴지 한 줄. */
function subjectOf(key, v, family) {
  if (HAND[key]) return HAND[key];
  const es = edgeSubject(key);
  if (es) return es;

  if (family === 'npc') {
    return `A ${enName(key)}, one of the townsfolk of a small medieval fantasy town`;
  }
  const mm = /^mon_(.+?)_(field|battle|attack)$/.exec(key);
  if (mm) {
    const m = MON_BY_SPRITE[mm[1]];
    const lv = m ? `, a level ${m.level} creature` : '';
    const school = m && m.school === 'magic' ? ' that casts spells' : '';
    return `A ${enName(key)} — a fantasy RPG monster${lv}${school}`;
  }
  const cm = /^chr_(.+?)_(field|battle|attack|stance)$/.exec(key);
  if (cm) {
    return `A ${enName(key)} — the player character of this game, an adventurer`;
  }
  const it = ITEM_BY_ICON[key];
  if (it) {
    const r = RARITY_EN[it.rarity] || '';
    const mg = it.magic ? ` Enchanted: ${MAGIC_EN[it.magic] || it.magic}.` : '';
    const where = it.slot && it.slot !== it.type ? `, worn on the ${it.slot}` : '';
    return `A ${enName(key)} (${it.type}${where}) — ${r}.${mg}`;
  }
  return `A ${enName(key)}`;
}

// ────────────────────────────────────────────────────────────
// 굽기
// ────────────────────────────────────────────────────────────
const rows = [];
for (const [key, v] of Object.entries(manifest)) {
  const file = path.join(ROOT, v.src);
  const size = pngSize(file);
  const family = familyOf(key, v);
  const subject = subjectOf(key, v, family);
  const bake = size ? `${size[0]}x${size[1]}` : `${v.w * 2}x${v.h * 2}`;
  const prompt = `${String(subject).replace(/[.\s]+$/, '')}. ${RULES[family]} ${STYLE_EN}`
    .replace(/\bA ([aeiouAEIOU])/g, 'An $1')   // "A elder dragon" → "An elder dragon"
    .replace(/\s+/g, ' ').trim();
  rows.push({ key, src: v.src, bake, draw: `${v.w}x${v.h}`, family, label: v.label || '', subject, prompt });
}

fs.mkdirSync(OUT, { recursive: true });

// ── STYLE.md ───────────────────────────────────────────────
fs.writeFileSync(path.join(OUT, 'STYLE.md'), `# 화풍 한 덩이 (Style Anchor)

258장을 **따로따로** 만들면 화풍이 258가지가 된다. 그래서 장마다 아래 문단을
**글자 하나 바꾸지 않고** 그대로 붙인다. 프롬프트의 마지막에 붙이는 것이 좋다
(앞쪽에 있는 말일수록 모델이 세게 듣는다 — 앞은 '무엇을', 뒤는 '어떻게').

## English (그림 모델에 넣는 것)

\`\`\`
${STYLE_EN}
\`\`\`

## 우리말 (사람이 읽는 것)

${STYLE_KO}

## 절대 하면 안 되는 것 — 이 게임에서 실제로 데인 것들

1. **깔리는 타일에 한쪽으로 쏠린 밝기(그라데이션)를 넣지 않는다.**
   한 장만 보면 예쁜데 40×32 칸으로 깔면 위가 밝고 아래가 어두운 것이
   칸마다 반복되어 **가로줄 격자**가 화면에 그려진다. 실제로 그렇게 나왔고 고쳤다.
2. **타일에 테두리를 넣지 않는다.** 칸마다 선이 생겨 바둑판이 된다.
3. **얹는 그림(나무·바위·덤불)의 가장자리는 들쭉날쭉해야 한다.**
   네모로 꽉 채우면 칸 경계가 직선으로 드러난다.
4. **투명 배경은 모델에게 시키지 말고 뒤에서 빼낸다.** 아래 HOWTO 참고.
5. **발끝은 칸 아래 끝에 닿아야 한다.** 전투 화면이 그림 높이로 자리를 잡는다.
`);

// ── prompts.csv ────────────────────────────────────────────
const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(OUT, 'prompts.csv'),
  '﻿' + ['키', '파일', '구울크기', '그릴크기', '갈래', '이름', '프롬프트'].map(q).join(',') + '\n'
  + rows.map((r) => [r.key, r.src, r.bake, r.draw, FAMILY_KO[r.family], r.label, r.prompt]
    .map(q).join(',')).join('\n') + '\n');

// ── prompts.md ─────────────────────────────────────────────
const byFam = {};
for (const r of rows) (byFam[r.family] = byFam[r.family] || []).push(r);
let md = `# 그림 주문서 — ${rows.length}장\n\n`
  + `> 만든 것: \`node tools/art-prompts.js\`. 표(items/monsters/npcs)가 바뀌면 다시 돌린다.\n`
  + `> **구울크기**가 받아야 할 파일 크기다. 그릴크기는 화면에 줄여 그리는 크기라 참고만 한다.\n\n`;
for (const f of Object.keys(RULES)) {
  const list = byFam[f];
  if (!list || !list.length) continue;
  md += `## ${FAMILY_KO[f]} — ${list.length}장\n\n`;
  md += `**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)\n\n\`\`\`\n${RULES[f]}\n\`\`\`\n\n`;
  md += '| 키 | 파일 | 구울크기 | 무엇을 그리나 |\n|---|---|---|---|\n';
  for (const r of list) {
    md += `| \`${r.key}\` | ${r.src} | ${r.bake} | ${r.subject.replace(/\|/g, '\\|')} |\n`;
  }
  md += '\n';
}
fs.writeFileSync(path.join(OUT, 'prompts.md'), md);

// ── HOWTO.md ───────────────────────────────────────────────
const famCount = {};
for (const r of rows) famCount[FAMILY_KO[r.family]] = (famCount[FAMILY_KO[r.family]] || 0) + 1;

fs.writeFileSync(path.join(OUT, 'HOWTO.md'), `# 그림 ${rows.length}장을 바깥에 맡기고 되받는 차례

## 0. 먼저 알아야 할 것 — **manifest 의 크기는 파일 크기가 아니다**

\`src/data/manifest.json\` 의 \`w/h\` 는 **화면에 그릴 크기**다.
실제 파일은 그보다 2~4배 크게 구워져 있다(\`gen-assets.js\` 가 2배 화면비로 찍는다).
줄여 그려야 가장자리가 매끈하고, 확대해도 안 흐려진다.

| | 그릴 크기(manifest) | 실제 파일 |
|---|---|---|
| 들판 몬스터 | 64×64 | 256×256 |
| 전투 몬스터 | 256×256 | 512×512 |
| 마을 사람 | 60×80 | 192×256 |
| 물건 아이콘 | 64×64 | 128×128 |
| 바닥 타일 | 32×32 | 64×64 |

**받아야 할 크기는 \`art/prompts.csv\` 의 '구울크기' 칸에 적혀 있다.**
그보다 크게 받아도 된다(\`tools/art-in.js\` 가 줄여 준다). 작으면 안 된다.

지금 258장을 다 합쳐 **4.9 MB** 다. 한 장짜리 HTML(\`build-single-file.js\`)은 이것을
전부 base64 로 품기 때문에, 새 그림이 두 배 무거워지면 그 파일도 두 배가 된다.
받은 뒤 \`ls -la dist/\` 로 한 번 본다.

## 1. 무엇을 건네나 — 세 가지뿐

1. **화풍 한 덩이** (\`art/STYLE.md\`) — 258장 **전부**에 글자 그대로 붙인다.
   이것이 258장을 한 게임처럼 보이게 하는 유일한 장치다.
2. **갈래별 형식 규칙** (\`art/prompts.md\` 의 각 절 머리) — 시점·배경·여백.
3. **한 장의 주제 한 줄** — 표(items/monsters/npcs)에서 뽑은 것.

\`art/prompts.csv\` 의 **프롬프트 칸은 이 셋이 이미 합쳐진 것**이다. 그대로 복사해 쓰면 된다.
순서는 〈주제 → 형식 → 화풍〉. 그림 모델은 앞에 있는 말을 더 세게 듣기 때문에,
"무엇을" 이 앞, "어떻게" 가 뒤다.

## 2. 힉스필드에서 하는 차례

### ① 먼저 화풍을 고정한다 (여기가 제일 중요하다)

258장을 그냥 하나씩 만들면 화풍이 258가지가 된다. 먼저 **기준 그림 대여섯 장**을 만든다 —
풀 타일 · 슬라임 전투 · 상인 · 회복약 아이콘 · 베기 효과 정도.
마음에 들 때까지 그것만 고친다. 여기서 정해진 것이 나머지 250장을 끌고 간다.

그 다음 화풍을 붙들어 두는 방법이 둘 있다.

* **Soul ID** — 사람/캐릭터의 얼굴을 붙드는 장치다. 사진 **20장 이상**(80장까지)을
  올려 3~5분 학습시킨다. 우리 경우엔 **주인공 3직업**(용사·사냥꾼·마법사)에만 쓸 만하다.
  한 직업당 들판·전투·공격·방어 네 자세를 같은 몸으로 뽑아야 하기 때문이다.
  캐릭터 하나 학습에 25크레딧 정도.
* **참고 그림(reference/style)** — 기준 그림을 참고로 물려 주는 쪽. 타일·아이템·효과처럼
  **얼굴이 없는 250장**은 이쪽이 맞다. 새로 그리는 게 아니라 **지금 그림을 참고로 물려**
  같은 자리에 들어갈 것을 받으면 실루엣까지 닮게 나온다.

> 실제로는 **지금 있는 PNG 를 참고 그림으로 올리는 것**이 가장 잘 듣는다.
> 자리·크기·실루엣이 이미 게임에 맞게 잡혀 있기 때문이다.

### ② 배경은 모델에게 시키지 말고 **뒤에서 뺀다**

"투명 배경" 이라고 적어도 그림 모델은 보통 흰색이나 체크무늬를 그려 준다.
그래서 주문서는 전부 **순초록(#00FF00) 배경**을 시킨다. 그 다음 둘 중 하나로 뺀다.

* 힉스필드의 **Background Remover**(\`higgsfield.ai/apps/image-background-remover\`) —
  한 번 누르면 투명 PNG 로 내준다. 사람·물건에 잘 듣는다.
* 아니면 그냥 초록인 채로 \`art/in/\` 에 넣는다. **\`tools/art-in.js\` 가 알아서 뺀다.**
  가장자리에서 번져 들어가며 빼기 때문에, 그림 **안**에 있는 초록(에메랄드·풀·독)은 살아남는다.

**바닥 타일과 전투 배경은 배경을 빼지 않는다.** 그림 전체가 그림이기 때문이다.

### ③ 258장을 손으로 누르지 않는다

힉스필드에는 **API 와 CLI** 가 있다. 258번을 손으로 누르면 하루가 간다.

\`\`\`bash
npm i -g @higgsfield/cli
higgsfield auth login
\`\`\`

CLI 는 MCP 로 붙는다 — Claude Code / Cursor 안에서 바로 부를 수 있다.
API 를 직접 쓰려면 \`Authorization: Key <ID>:<SECRET>\` 로 \`api.higgsfield.ai\` 에 던지고
돌아온 표를 받아 오는 식이다(요청을 넣으면 번호가 오고, 그 번호로 나중에 찾아간다).

\`art/prompts.csv\` 가 바로 그 **먹이 표**다. 한 줄이 한 번의 요청이다.

## 3. 되받는 차례 — \`tools/art-in.js\`

받은 그림을 \`art/in/\` 에 넣는다. 파일 이름은 **manifest 의 키**(\`tile_grass.png\`) 거나
**지금 파일 이름**(\`grass.png\`) 이면 된다.

\`\`\`bash
node tools/art-in.js --dry     # 넣지 않고 검사만
node tools/art-in.js           # assets/ 에 넣는다
node tools/art-in.js --only tile_grass,item_potion
\`\`\`

이 자가 하는 일 — 그림 도구가 내주는 것과 게임이 먹는 것 사이의 **네 가지 틈**을 메운다.

1. **크기** — 1024든 2048이든 받아서 지금 파일과 같은 크기로 줄인다.
2. **배경** — 초록을 가장자리에서 번져 들어가며 뺀다. 이미 투명하면 건너뛴다.
3. **자리** — 여백을 잘라 내고 다시 앉힌다.
   · 사람·몬스터·키 큰 타일 → **발끝을 아래 끝에** 붙인다(전투 화면이 그림 높이로 자리를 잡는다)
   · 물건·효과·표식 → 가운데에 8% 여백을 두고 띄운다
   · 바닥 타일·전투 배경 → 칸을 꽉 채운다
4. **재기** — 고칠 수 없는 것은 **일러 준다**:
   · 깔리는 타일의 **이음새가 튀는지** (왼끝과 오른끝, 위끝과 아래끝을 견준다)
   · **한쪽으로 쏠린 밝기**가 있는지 (있으면 깔았을 때 가로줄이 생긴다)
   · 배경이 안 빠졌는지 / 꽉 채워야 하는데 비었는지

## 4. 이 게임에서 실제로 데인 것 — 주문서에 이미 박혀 있지만 한 번 더

1. **깔리는 타일에 그라데이션을 넣지 않는다.** 한 장만 보면 예쁜데, 40×32 칸으로 깔면
   위가 밝고 아래가 어두운 것이 칸마다 되풀이되어 **화면에 가로줄 격자가 그려진다.**
   실제로 그렇게 나왔고 고쳤다. 밑색은 평평하게 두고, 변화는 흩어 놓은 얼룩으로만 준다.
2. **타일에 테두리를 넣지 않는다.** 칸마다 선이 생겨 바둑판이 된다.
3. **얹는 그림(나무·바위·덤불)의 가장자리는 들쭉날쭉해야 한다.** 네모로 꽉 채우면
   칸 경계가 직선으로 드러난다. 가장자리를 파 두면 밑의 풀이 비쳐 경계가 녹는다.
4. **한 몸의 네 자세는 한 번에 만든다.** \`_field\` / \`_battle\` / \`_attack\` / \`_stance\` 는
   같은 몸이다. 따로 만들면 색과 비례가 어긋나 전투 중에 다른 놈으로 바뀐다.
   기준이 되는 \`_battle\` 을 먼저 만들고, 그것을 참고 그림으로 물려 나머지를 뽑는다.
5. **넷으로 쪼개는 것이 여덟 장 있다.** \`tile_castle_gate_*\`(4) · \`tile_castle_tower_*\`(4) 는
   큰 그림 한 장을 4등분한 것이다. 따로 만들면 이가 안 맞는다.
   2칸×2칸(128×128) 한 장을 만들어 잘라 넣는다.

## 5. 다 넣은 뒤

\`\`\`bash
node tools/build-single-file.js    # 한 장짜리 HTML 다시 굽기
bash /tmp/runall.sh                # 회귀 (약 45분)
\`\`\`

---

### 갈래별 장수

${Object.entries(famCount).map(([k, n]) => `* ${k} — ${n}장`).join('\n')}
`);

console.log(`✓ art/STYLE.md`);
console.log(`✓ art/HOWTO.md`);
console.log(`✓ art/prompts.csv   (${rows.length}줄)`);
console.log(`✓ art/prompts.md`);
const cnt = {};
for (const r of rows) cnt[FAMILY_KO[r.family]] = (cnt[FAMILY_KO[r.family]] || 0) + 1;
console.log('  갈래:', Object.entries(cnt).map(([k, n]) => `${k} ${n}`).join(' · '));
