#!/usr/bin/env node
/**
 * 밸런스 미리보기.
 *
 * 표를 고친 결과가 "실제 전투에서" 어떻게 나오는지 넣기 전에 본다.
 * 게임이 쓰는 진짜 전투 계산기(systems/CombatSystem.js)를 그대로 돌리므로,
 * 여기 나온 숫자는 게임에서 나오는 숫자와 같다.
 *
 *   node tools/balance.js                   지금 표(src/data)로 재 본다
 *   node tools/balance.js sheets            아직 안 넣은 sheets/*.csv 로 미리 재 본다
 *   node tools/balance.js sheets --diff     시트를 넣기 전후를 나란히 비교
 *   node tools/balance.js --lv 40 --enh 7   레벨·강화를 지정
 *   node tools/balance.js --n 200           표본을 늘린다(느리지만 정확)
 *   node tools/balance.js --trash           보스 말고 잡몹 상대로
 *
 * ── 어떻게 읽나 ────────────────────────────────────────────
 * 보스는 "그 단계 장비를 갖춘 사람이 겨우 이기는" 자리가 좋다.
 *   0%        아무리 해도 못 이긴다 — 너무 세다
 *   20~70%    몇 번 도전하면 이긴다 — 보스로 알맞다
 *   100%      한 번도 안 진다 — 너무 약하거나 그 직업이 너무 세다
 *
 * 직업끼리 30%p 넘게 벌어지면 한쪽이 정답이 되어 버린다.
 */
const fs = require('fs');
const path = require('path');
const sheets = require('../server/sheets.js');
const content = require('../server/content.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'data');

// ─────────────────────────────────────────────────────────────
// 빌드 — "사람이 짤 법한" 스킬 순서.
// 앞에서부터 기계적으로 채우면 용사가 공격 스킬을 하나도 안 찍어서
// 실제보다 훨씬 약하게 나온다. 그래서 직업마다 우선순위를 적어 둔다.
// 여기를 고치면 "이렇게 찍으면 어떻게 되나"를 바로 볼 수 있다.
// ─────────────────────────────────────────────────────────────
// 순서를 잘못 잡으면 그 직업이 통째로 약해 보인다 — 예전에는 마법사 계획이
// '마력 증폭'부터였는데, 실제로 세게 굴러가는 순서는 '생명 흡수'부터였다.
// 그 탓에 마법사가 보스전에서 0% 로 나왔고, 없는 문제를 고칠 뻔했다.
// 여기 적힌 순서는 여러 순서를 다 재 본 뒤 가장 잘 버티는 것으로 골랐다.
// ⚠ 0.44 — 순서를 **하나만** 적어 두는 것을 그만뒀다.
//
// 왜: 0.44 에서 힘의 공격력이 3 → 1 로 내려가고 철벽·전투 본능이 세지자,
// 여기 적힌 한 줄짜리 순서(공격 먼저)가 통째로 낡았다. 그 순서로 재면 용사가
// 15단계에서 **3%** 로 보였는데, 방어부터 찍으면 같은 표로 **51%** 였다.
// 없는 문제를 고치러 갈 뻔했다 — 약한 것은 직업이 아니라 **자에 적힌 순서**였다.
//
// 그래서 직업마다 순서를 **여러 개** 적어 두고, 잴 때 그중 가장 잘 버티는 것을 쓴다.
// 사람은 어차피 세 판쯤 해 보고 제일 잘 되는 쪽으로 찍는다. 그 사람을 재는 것이 맞다.
// 새 스킬을 넣거나 값을 크게 바꿨으면 **여기에 후보를 하나 더 적어** 두면 된다.
const PLANS = {
  // 0.36 에서 '강타'(power_strike)를, 0.41 에서 '연발 사격'(volley)을 표에서 뺐다.
  // 여기 남겨 두면 없는 스킬에 포인트를 붓게 되어, 그 직업만 스킬을 덜 찍은 채로 재게 된다.
  warrior: [
    // ① 공격 먼저 — 0.43 까지 쓰던 순서
    ['bloodthirst', 'unbreakable', 'iron_will', 'double_slash',
     'fortress', 'battle_sense', 'executioner', 'thorn_mail'],
    // ② 방어를 공격으로 — 0.44 의 용사는 이쪽이 훨씬 세다
    ['fortress', 'battle_sense', 'unbreakable', 'iron_will',
     'bloodthirst', 'double_slash', 'executioner', 'thorn_mail'],
    // ③ 되돌려 주기 — 가시 갑옷을 끼운 변주
    ['fortress', 'battle_sense', 'thorn_mail', 'unbreakable',
     'iron_will', 'bloodthirst', 'double_slash', 'executioner'],
  ],
  ranger: [
    ['light_step', 'deadeye', 'hawk_eye', 'rapid_shot',
     'wind_walker', 'focus_hunt', 'hunters_mark', 'foresight'],
    ['deadeye', 'hawk_eye', 'foresight', 'rapid_shot',
     'light_step', 'wind_walker', 'focus_hunt', 'hunters_mark'],
  ],
  mage: [
    ['drain_life', 'arcane_bolt', 'last_ember', 'mana_shield',
     'flame_burst', 'meteor', 'arcane_armor', 'chain_spark'],
    ['arcane_bolt', 'drain_life', 'mana_shield', 'last_ember',
     'meteor', 'flame_burst', 'arcane_armor', 'chain_spark'],
  ],
};

/** 뒤쪽 코드가 "그 직업의 대표 순서" 하나를 물을 때 — 첫 후보를 준다. */
const PLAN = Object.fromEntries(Object.entries(PLANS).map(([k, v]) => [k, v[0]]));

// 특성 포인트를 어디에 쓰는가. 앞에서부터 최대치까지 채운다.
//
// 힘·민첩·지능은 이제 여기 없다 — 그 셋은 레벨이 알아서 올려 주는 '스탯'이고
// (classes.json 의 statGrowth), 사람이 고르는 것은 이 여섯 갈래뿐이다.
const TRAIT_PLAN = {
  warrior: ['might', 'bulwark', 'apothecary', 'execution', 'fortune', 'arcana'],
  ranger: ['might', 'execution', 'bulwark', 'apothecary', 'fortune', 'arcana'],
  mage: ['arcana', 'might', 'execution', 'apothecary', 'bulwark', 'fortune'],
};

// 그 단계에서 "그쯤이면 갖췄겠다" 싶은 장비 한 벌.
//
// 이걸 잘못 잡으면 측정이 통째로 틀어진다 — 예전에는 Lv.15 기준인데도
// 용린 갑옷(20단계 영웅 장비)을 입혀 놓아서 초반 보스가 전부 100% 로 나왔다.
// 단계별로 그때 실제로 구할 수 있는 것만 넣는다.
const GEAR = {
  // 갓 시작한 몸. 1~3단계를 걷는 사람은 아직 마을 뒤뜰에서 주워 온 것만 들고 있다.
  //
  // 이 칸이 없으면 2단계를 강철 검·가죽 갑옷으로 재게 되고, 그러면 "박쥐가 너무 쉽다"는
  // 잘못된 결론이 나온다(실제로 그 탓에 2단계 배율이 1.7 → 8.1 로 풀린 적이 있다).
  1: { warrior: 'club', ranger: 'short_bow', mage: 'gnarled_staff',
       wear: ['cloth_armor', 'cloth_gloves', 'leather_boots'] },
  5: { warrior: 'iron_sword', ranger: 'hunting_bow', mage: 'apprentice_staff',
       wear: ['leather_armor', 'leather_pauldron', 'cloth_gloves', 'leather_boots', 'leather_belt', 'wood_amulet'] },
  10: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff',
        wear: ['knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'swift_ring'] },
  // 0.35 부터 15단계 기준은 **용린 세트 한 벌**이다.
  // 룬 바로 앞 계단이 여기라서, 이 셋을 갖춘 사람이 16단계에 들어선다고 본다.
  // (세트 덤 — 2개 공격력 +15%, 3개 받는 마법 피해 -50% — 도 함께 재진다)
  15: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff',
        wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'steel_gauntlet', 'swift_boots', 'mana_belt', 'guard_amulet', 'power_ring'] },
  20: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
        wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet', 'dragon_ring'] },

  // ── 0.50 — **사람이 실제로 그 문 앞에 설 때의 몸** ─────────────
  //
  // 위의 1·5·10·15·20 은 "그쯤이면 갖췄겠다" 라는 짐작이었다. 그런데 짐작이
  // 실제와 어긋나 있었다 — 10단계를 Lv.24 · +5 · 여덟 점으로 재고 있었는데,
  // 정작 그 문을 지나는 사람은 **Lv.14 · +7 · 세 점**이었다.
  // 그러면 도구가 "36%" 라고 말하는 자리가 사람에게는 전혀 다른 자리가 된다.
  //
  // 아래 셋은 **사람이 직접 재 보고 알려 준 몸**이다. 짐작을 지우고 이걸 쓴다.
  //   10단계  Lv.14 · +7 · 고급(매직) 장비 세 점
  //   15단계  Lv.20 · +7 · 희귀 장비 여섯 점
  //   20단계  Lv.27 · +7 · 룬 한 벌
  // 장비 점수를 8점으로 채우지 않는 것이 핵심이다 — 반지·목걸이·허리띠까지
  // 다 끼운 몸으로 재면 어떤 보스든 실제보다 쉽게 나온다.
  play10: { warrior: 'iron_sword', ranger: 'hunting_bow', mage: 'apprentice_staff',
            wear: ['leather_armor', 'leather_pauldron'] },
  play15: { warrior: 'flame_sword', ranger: 'elven_bow', mage: 'archmage_staff',
            wear: ['magic_helm', 'knight_armor', 'steel_pauldron', 'steel_gauntlet', 'swift_boots'] },
  play20: { warrior: 'frost_blade', ranger: 'storm_bow', mage: 'ember_staff',
            wear: ['rune_mail', 'rune_pauldron', 'rune_gauntlet', 'rune_boots', 'rune_belt', 'rune_amulet'] },
  // 20단계를 용린 풀세트로 갈 때(4/4 — 세트 덤이 함께 켜진다). --gear dragon 으로 본다.
  play20dragon: { warrior: 'dragon_knight_sword', ranger: 'dragon_knight_bow', mage: 'dragon_knight_staff',
                  wear: ['dragon_helm', 'dragon_mail', 'dragon_pauldron', 'steel_gauntlet', 'swift_boots'] },
};

// 재 볼 상대. [몬스터id, 레벨, 강화, 장비단계, 이름, 목표승률]
//
// 목표는 "그 레벨·그 강화로 왔을 때 이 정도로 이겼으면 좋겠다" 는 값이다.
// 뒤로 갈수록 낮아진다 — 20단계는 다섯 번 도전해서 한 번 이기는 자리.
// 마지막 칸은 그 몬스터가 실제로 서 있는 맵의 id 다.
//
// 맵마다 단계 보정(maps.json 의 power)이 걸려 있고, 그걸 빼먹으면 재는 값이
// 게임과 통째로 어긋난다 — 발가르는 field_10(×3.9) 에 서 있으므로 표에 적힌
// HP 의 네 배 가까운 몸으로 나온다.
//
// 예전에는 배율을 여기 숫자로 적어 두었는데, 표에서 배율을 고치면 이 숫자만
// 옛날 값으로 남아 조용히 어긋났다. 이제 맵 id 만 적고 배율은 maps.json 에서 읽는다.
// ⚠ 보스를 재는 몸은 **그 보스가 서 있는 단계의 잡몹을 재는 몸과 같아야 한다.**
//   (tools/stage-solve.js 의 마지막 줄과 같은 레벨·강화·장비)
//   다르면 "보스가 제 땅의 잡몹보다 약한" 표가 만들어진다 — 실제로 10단계에서
//   잡몹 5243, 보스 4183 이 나왔다. 보스를 Lv.20 으로, 잡몹을 Lv.24 로 재고 있었다.
const MATCHES = [
  ['imp_captain',          12,  2,  5, '5단계 보스 · 악마 정찰대장',      50, 'field_5'],
  // 0.50 — 아래 셋은 사람이 실제로 그 문 앞에 설 때의 몸으로 잰다(GEAR 의 play* 참고).
  ['demon_general',        14,  7, 'play10', '10단계 보스 · 발가르',      40, 'field_10'],
  ['elite_imp_captain',    20,  7, 'play15', '15단계 보스 · 강화된 정찰대장', 30, 'field_15'],
  ['elite_demon_general',  27,  7, 'play20', '20단계 보스 · 강화된 발가르',  20, 'field_20'],
  // 룬 한 벌을 +10 까지 올리고 보석 홈을 전부 채운 사람이 기준이다.
  // (avgGemMods 가 affixes.json 의 '홈' 표를 읽어 그만큼을 보석 평균값으로 채운다.
  //  지금은 +10 에 한 개다 — 두 번째 홈은 송곳으로만 열리고, 송곳은 0.001% 라
  //  "누구나 갖춘 몸"으로 볼 수 없으므로 기준에 넣지 않는다.)
  ['dungeon_lord',         50, 10, 20, '지하감옥 5층 · 감옥의 주인',      30, 'dungeon_5'],
];
// 그 단계에서 가방에 들어 있을 법한 회복약.
// 이걸 빼놓으면 용사 패시브(물약 회복량 2배)가 통째로 없는 셈이 되어
// 용사만 유독 약하게 나온다. 실제 전투에는 늘 약이 있으므로 여기서도 채워 준다.
const POTIONS = {
  5: [['potion', 20]],
  10: [['potion', 30]],
  15: [['greater_potion', 20]],
  20: [['greater_potion', 30]],
  // 실제 몸(play*)에서는 그 레벨에 살 수 있는 약만 쥔다.
  // 희귀 회복약은 1,000골드라 Lv.14 에 서른 병을 들고 다닐 수 없다.
  play10: [['potion', 30]],
  play15: [['potion', 40]],
  play20: [['greater_potion', 20]],
  play20dragon: [['greater_potion', 20]],
};

// 기준 캐릭터는 "그 땅에 실제로 서 있을 수 있는 사람"이어야 한다.
//
// 예전에는 1단계부터 20단계까지 그냥 걸어갈 수 있었으므로, 낮은 레벨로 깊은 땅에
// 들어선 사람을 기준으로 삼는 것이 말이 됐다. 지금은 구간마다 문이 잠겨 있다 —
// 6단계에 서 있는 사람은 이미 5단계 보스를 눕히고 그 퀘스트 보상까지 받은 사람이다.
// 그래서 기준 레벨·강화·장비를 그 문턱에 맞춰 올려 잡는다.
//   6~10단계  ← 5단계 보스(Lv.15 +5)를 넘은 사람. 직업 시험 보상(화염검 계열)을 들고 있다.
//   11~15단계 ← 10단계 보스(Lv.20 +6)를 넘은 사람. 성문 상인의 룬 장비를 살 수 있다.
//   16~20단계 ← 15단계 보스(Lv.30 +8)를 넘은 사람. 룬 무기를 받아 들고 있다.
// ⚠ 여기 적는 레벨·강화·목표는 **tools/stage-solve.js 의 표와 같아야 한다.**
//   두 도구가 서로 다른 사람을 상상하면, 한쪽이 ✓ 인데 다른 쪽이 ✗ 로 뜬다.
//   (실제로 19단계를 여기서는 Lv.42 +10 으로, 저기서는 Lv.39 +9 로 재고 있어서
//    같은 표를 두고 "너무 쉬움 +43%p" 와 "목표대로" 가 동시에 나왔다.)
const TRASH = [
  // ── 얕은 땅(1~3단계)의 고비는 여기서 만든다 (0.36) ──────────
  //
  // 저렙 구간에도 약간의 고비가 있어야 한다. 그런데 그 고비를 맵 배율로 만들면
  // **경험치·골드가 같은 배수로 함께 오른다**(main.js 의 exp: baseDef.exp * power).
  // 1단계를 95% 로 맞추려면 배율이 1.3 → 5.2 가 되고, 그러면 첫 들판을 한 바퀴
  // 도는 것만으로 Lv.9 가 된다 — 4단계를 걷는 몸이다. 고비를 만들려다 2·3단계를
  // 통째로 공짜로 만드는 셈이다.
  //
  // 그래서 여기서는 **몬스터 자신의 능력치**를 푼다(--trash --solve).
  // 경험치·골드는 표에 적힌 그대로 남으므로 초반 성장 속도가 흔들리지 않는다.
  //
  // 목표는 95 → 92 → 88 로 아주 완만하게 눕힌다. 스무 판에 한 번 지는 정도라
  // 막히지는 않지만 "물약을 챙겨야겠다"는 생각은 든다.
  // 고친 뒤에는 node tools/stage-color.js 로 첫인상이 주황으로 넘어가지 않았는지 본다.
  // ⚠ 0.46 — 여기 적는 레벨을 **그 땅에 처음 발을 들이는 레벨**로 내렸다.
  //
  // 예전에는 1단계를 Lv.3 으로 쟀다. 그런데 슬라임은 **Lv.1 에** 만난다 —
  // 마을 문을 나서면 바로 거기다. 그래서 "1단계 95%" 를 맞춰 놓고도 실제
  // 첫 싸움은 **33%** 였다. 목표를 맞췄는데 사람은 첫 슬라임에게 세 번 중
  // 두 번을 졌다. 틀린 것은 몬스터가 아니라 **자에 적힌 레벨**이었다.
  //
  // 이제 "그 땅을 걸을 수 있게 된 그 순간"으로 잰다. 그러면 목표를 맞추는 것이
  // 곧 "들어서자마자 해 볼 만하다" 가 된다. 레벨이 오르면 저절로 더 쉬워진다.
  ['slime',                 1,  0,  1, '1단계 잡몹 · 슬라임',             95, 'field_1'],
  ['bat',                   3,  0,  1, '2단계 잡몹 · 동굴 박쥐',          92, 'field_2'],
  ['wolf',                  5,  0,  1, '3단계 잡몹 · 잿빛 늑대',          88, 'field_3'],
  // 0.46 — 4단계도 잰다. 여기까지가 "첫 무기 한 자루로 걷는 구간"인데
  // 재지 않으니 1~3 만 맞춰 놓고 4 에서 벽을 만드는 일이 생겼다.
  // (4단계는 배율이 3.3 이라 같은 늑대라도 3단계와 전혀 다른 몸이다)
  ['mushroom',              8,  0,  1, '4단계 잡몹 · 붉은 버섯',          84, 'field_4'],
  // 0.35 부터 7단계에는 늑대가 없다(레벨 역전이라 뺐다). 그 자리의 해골 병사로 잰다.
  ['skeleton',             18,  5, 10, '7단계 잡몹 · 해골 병사',          80, 'field_7'],
  ['demon_soldier',        22,  5, 10, '9단계 잡몹 · 악마 병사',          62, 'field_9'],
  // 11단계에 서는 사람은 이미 성문(레벨 25)을 지나 룬 장비를 갖춘 사람이다 —
  // 10단계 보스 퀘스트가 그렇게 하라고 일러 준다.
  //
  // ⚠ 여기가 지금 "너무 쉬움"으로 뜬다. 룬 한 벌과 그 앞 장비(용린 갑옷·화염검)의
  //   격차가 너무 커서, 룬을 갖추면 11~14단계가 통째로 100% 가 되고 갖추지 못하면
  //   30% 가 된다. 사이가 없다. 이것은 3구간 몬스터의 문제가 아니라 **장비 사다리에
  //   계단 하나가 비어 있는 문제**다 — 룬과 그 앞 단계 사이에 한 벌이 더 필요하다.
  //   구간 배율로 덮으면 룬을 못 갖춘 사람이 아예 못 들어가게 되므로 덮지 않는다.
  ['elite_slime',          26,  7, 20, '11단계 잡몹 · 강화된 슬라임',     88, 'field_11'],
  ['elite_wolf',           29,  7, 20, '14단계 잡몹 · 강화된 늑대',       62, 'field_14'],
  ['elite_skeleton',       35,  9, 20, '17단계 잡몹 · 강화된 해골',       80, 'field_17'],
  ['elite_demon_soldier',  39,  9, 20, '19단계 잡몹 · 강화된 악마 병사',  62, 'field_19'],
  // 지하감옥 앞층은 **파밍하는 곳**이다. 보스(5층 30%)로 가는 길이지 벽이 아니다.
  // 그 층에서 가장 센 놈으로 재고, 목표도 "잘 잡히지만 공짜는 아닌" 자리로 둔다.
  // (예전에는 그 층의 약한 놈을 재면서 목표를 50%/35% 로 잡아 놓아,
  //  설계대로 굴러가는 표가 계속 "너무 쉬움" 으로 찍혔다)
  ['elite_demon_soldier',  45, 10, 20, '지하감옥 2층 · 강화된 악마 병사',  70, 'dungeon_2'],
  ['dungeon_golem',        50, 10, 20, '지하감옥 3층 · 감옥 석상',        70, 'dungeon_3'],
];

/** 그 맵의 단계 보정. 표에서 읽으므로 여기에 숫자를 적어 둘 일이 없다. */
function powerOfMap(G, mapId) {
  const m = G['maps.json'] && G['maps.json'].maps[mapId];
  return (m && m.power) || 1;
}

// ─────────────────────────────────────────────────────────────

function loadFrom(where) {
  const all = {};
  for (const n of content.CONTENT_FILES) {
    const f = path.join(SRC, n);
    if (fs.existsSync(f)) all[n] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  if (where !== 'sheets') return all;

  // sheets/*.csv 를 파일에 쓰지 않고 메모리에서만 얹는다.
  const dir = path.join(ROOT, 'sheets');
  for (const [name, def] of Object.entries(sheets.SHEETS)) {
    const csv = path.join(dir, `${name}.csv`);
    if (!fs.existsSync(csv)) continue;
    const produced = def.apply(sheets.parseCsv(fs.readFileSync(csv, 'utf8')), all);
    Object.assign(all, produced);
  }
  return all;
}

/** 그 레벨에서 받는 포인트를 계획대로 찍었을 때의 보정값. */
function buildMods(G, cls, level, planIdx = 0) {
  const skills = G['skills.json'];
  const pts = Math.floor(level / skills.everyLevels) * skills.pointsPerGrant;
  const mods = {};
  let left = pts;
  const picked = [];
  const plan = (PLANS[cls] || [])[planIdx] || PLAN[cls] || [];
  for (const sid of plan) {
    const d = skills.tree[sid];
    if (!d) continue;
    const take = Math.min(d.max, left);
    if (take <= 0) break;
    left -= take;
    picked.push(`${d.name}${take}`);
    for (const [k, v] of Object.entries(d.effect || {})) {
      // SkillSystem 의 MAX_KEYS 와 같은 규칙 — 임계선은 쌓이지 않는다.
      if (k === 'lowHpThreshold') mods[k] = Math.max(mods[k] || 0, v);
      else mods[k] = (mods[k] || 0) + v * take;
    }
  }
  return { mods, pts, picked };
}

/**
 * 그 레벨에서 힘·민첩·지능이 얼마나 자라 있는가.
 *
 * 실제 게임은 한 번 오를 때 20% 확률로 두 점이 오른다. 미리보기에서 그걸 굴리면
 * 잴 때마다 숫자가 흔들려 비교가 안 되므로, **기댓값(1.2배)** 으로 고정해서 센다.
 */
function buildStatRanks(G, cls, level) {
  const growth = (G['classes.json'].list[cls] || {}).statGrowth || {};
  const double = Number(/STAT_DOUBLE_CHANCE:\s*([0-9.]+)/.exec(FORMULAS_SRC)?.[1] || 0.2);
  const out = {};
  for (const [id, everyN] of Object.entries(growth)) {
    const n = Number(everyN);
    if (!(n >= 1)) continue;
    out[id] = Math.floor(level / n) * (1 + double);
  }
  return out;
}

/**
 * 그 레벨에서 쥐고 있을 특성 포인트를 계획대로 나눈 결과.
 *
 * 포인트는 두 곳에서 온다 — 10레벨마다 한 점, 그리고 5단계 보스 퀘스트마다 한 점.
 * 보스 퀘스트는 그 단계를 지났으면 마쳤다고 본다(레벨 15/20/30/40 기준).
 * @returns {object} { might: 5, bulwark: 3, ... }
 */
function buildTraitRanks(G, cls, level) {
  const t = G['traits.json'];
  const fromLevels = Math.floor(level / t.everyLevels) * t.pointsPerGrant;
  // 각 보스 퀘스트를 받을 수 있는 레벨(quests.json 의 reqLevel 과 같은 자리)
  const QUEST_LEVEL = [15, 20, 25, 30];
  const fromQuests = QUEST_LEVEL.filter((lv) => level >= lv).length;

  let left = fromLevels + fromQuests;
  const out = {};
  for (const id of TRAIT_PLAN[cls] || []) {
    const node = t.nodes[id];
    if (!node || left <= 0) continue;
    const take = Math.min(node.max, left);
    out[id] = take;
    left -= take;
  }
  return out;
}

/** +10 에서 열린 보석 홈에 박힌 보석의 평균값. 홈은 두 개다. */
function avgGemMods(G, itemDef, enh) {
  const out = {};
  const table = (G['affixes.json'] || {})['홈'] || {};
  let sockets = 0;
  for (const [lvl, count] of Object.entries(table)) {
    if (lvl.startsWith('_')) continue;
    if (enh >= Number(lvl)) sockets = Math.max(sockets, Number(count));
  }
  if (!sockets || !itemDef.slot) return out;
  const all = (G['affixes.json'] || {})['보석'] || [];
  // 그 부위에 박을 수 있는 보석만(흡혈 오닉스는 무기·허리띠 홈에만 들어간다).
  const gems = all.filter(([, , key]) => {
    const [kind, prop] = String(key).split('.');
    return kind !== 'mods' || allowedOnSlot(prop, itemDef.slot);
  });
  if (!gems.length) return out;
  // 무엇을 박을지는 사람마다 다르므로 통 전체의 평균으로 센다.
  for (const [, , key, value] of gems) {
    out[key] = (out[key] || 0) + (Number(value) * sockets) / gems.length;
  }
  return out;
}

// 강화 배율 — formulas.js 에서 그대로 읽는다.
//
// 예전에는 여기에 `1 + n * 0.12` 라고 적어 두었다. 게임은 0.16 이었으므로
// 이 도구는 줄곧 장비를 실제보다 약하게 재고 있었고, 그 위에서 보스 능력치를
// 풀었으니 모든 목표 승률이 조용히 어긋나 있었다. 숫자를 두 곳에 적지 않는다.
const FORMULAS_SRC = fs.readFileSync(path.join(SRC, 'formulas.js'), 'utf8');
const ENHANCE_BASE = (() => {
  const m = /ENHANCE_BONUS_PER_LEVEL:\s*([0-9.]+)/.exec(FORMULAS_SRC);
  if (!m) throw new Error('formulas.js 에서 ENHANCE_BONUS_PER_LEVEL 을 못 찾았습니다.');
  return Number(m[1]);
})();
const ENHANCE_BY_RARITY = (() => {
  const m = /ENHANCE_BONUS_BY_RARITY:\s*\{([^}]*)\}/.exec(FORMULAS_SRC);
  if (!m) throw new Error('formulas.js 에서 ENHANCE_BONUS_BY_RARITY 를 못 찾았습니다.');
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+):\s*([0-9.]+)/g)) out[k] = Number(v);
  return out;
})();
const ENHANCE = (n, rarity = 'epic') =>
  1 + ENHANCE_BASE * (ENHANCE_BY_RARITY[rarity] != null ? ENHANCE_BY_RARITY[rarity] : 1) * n;

// 아이템의 기본 스탯 중 순수 수치가 아니라 전투 보정으로 가는 것
// (AffixSystem.STAT_TO_MOD 와 같아야 한다). 지팡이의 치명타 피해가 여기로 온다.
const STAT_TO_MOD = { critDmg: 'critMult' };
// 강화해도 소수점을 유지하는 스탯(formulas.RATIO_STATS 와 같다).
const RATIO_STATS = new Set(['crit', 'critDmg']);

/**
 * 부위를 가리는 효과 (AffixSystem 의 SLOT_ONLY 와 같아야 한다).
 *
 * 이걸 안 보면 흡혈을 반지·목걸이·갑옷에서까지 세게 되어, 실제보다 훨씬
 * 잘 버티는 캐릭터를 재게 된다 — 규칙을 고쳐 놓고도 표에는 옛날 값이 나온다.
 */
const SLOT_ONLY = { lifesteal: ['weapon', 'belt'] };
const allowedOnSlot = (prop, slot) => !SLOT_ONLY[prop] || SLOT_ONLY[prop].includes(slot);

/** 부위 → affixes.json 의 통 이름 (AffixSystem 의 POOL_OF 와 같아야 한다). */
const POOL_OF = {
  weapon: '무기', armor: '방어구', helmet: '방어구', shoulder: '방어구', gloves: '방어구', boots: '방어구',
  ring: '장신구', necklace: '장신구', belt: '장신구',
};

/**
 * +7~+9 무작위 옵션의 "평균값".
 *
 * 실제로는 통에서 아무거나 뽑히므로 판마다 다르다. 미리보기에서 그걸 그대로
 * 흉내 내면 숫자가 요동쳐서 비교가 안 된다. 그래서 통 전체의 기댓값
 * (= 각 옵션이 뽑힐 확률 × 그 옵션의 중간값)을 옵션 개수만큼 더한다.
 */
function avgAffixMods(G, itemDef, enh) {
  const out = {};
  const slots = Math.max(0, Math.min(3, enh - 6));
  if (!slots) return out;
  const all = (G['affixes.json'] || {})[POOL_OF[itemDef.slot]] || [];
  // 그 부위에 실제로 붙을 수 있는 것만 남긴다(흡혈은 무기·허리띠에서만).
  const pool = all.filter(([, , key]) => {
    const [kind, prop] = String(key).split('.');
    return kind !== 'mods' || allowedOnSlot(prop, itemDef.slot);
  });
  if (!pool.length) return out;
  for (const [, , key, min, max] of pool) {
    const mid = (min + max) / 2;
    out[key] = (out[key] || 0) + (mid * slots) / pool.length;
  }
  return out;
}

/**
 * @param {object} [gearOverride] { [cls]: 무기id, wear: [...] } — 표의 한 벌 대신 이걸 입힌다.
 *   tools/dragon2.js 가 용린 한 벌로 재려고 쓴다.
 */
function statsOf(G, cls, level, enh, tier, gearOverride = null, planIdx = 0) {
  const c = G['classes.json'].list[cls];
  const items = G['items.json'];
  const s = {};
  for (const k of ['hp', 'atk', 'def', 'spd', 'crit']) {
    s[k] = c.baseStats[k] + c.growth[k] * (level - 1);
  }
  const mods = {};
  // 장비가 얹어 주는 힘·민첩·지능(방어구 옵션의 '힘 +7' 같은 것)
  const statRanks = buildStatRanks(G, cls, level);

  // ── ① 장비 먼저. 전설 장비의 '스킬 효과 배가'를 알아야 스킬을 얹을 수 있다. ──
  const set = gearOverride || GEAR[tier];
  let skillPower = 1;
  for (const id of [set[cls], ...set.wear]) {
    const d = items[id];
    if (!d) continue;
    const mult = d.enhanceable ? ENHANCE(enh, d.rarity) : 1;
    for (const [k, v] of Object.entries(d.stats || {})) {
      // 치명타 피해처럼 배율에 해당하는 것은 스탯 칸이 없다 — mods 로 옮긴다.
      // (이걸 빠뜨리면 지팡이가 아무 특성도 없는 막대기로 측정된다)
      const to = STAT_TO_MOD[k];
      if (to) mods[to] = (mods[to] || 0) + v * mult;
      else s[k] = (s[k] || 0) + v * mult;
    }
    // 전설의 스킬 효과 배가 — 강화 배율을 태우지 않는다(AffixSystem 과 같은 규칙).
    if (d.skillPower) skillPower += d.skillPower;
    if (!d.enhanceable) continue;
    const extra = { ...avgAffixMods(G, d, enh), ...{} };
    for (const [key, v] of Object.entries(avgGemMods(G, d, enh))) {
      extra[key] = (extra[key] || 0) + v;
    }
    for (const [key, v] of Object.entries(extra)) {
      const [kind, prop] = key.split('.');
      if (kind === 'trait') statRanks[prop] = (statRanks[prop] || 0) + v;
      else mods[prop] = (mods[prop] || 0) + v;
    }
  }

  // ── ①-2 세트 덤 (AffixSystem 의 setProgress 와 같은 규칙) ──
  //
  // 여기 빠뜨리면 용린 한 벌을 입혀 놓고도 세트 효과가 없는 몸으로 재게 된다.
  // 예전에 흡혈 부위 규칙을 이 도구만 모르고 있어서 27.6% 로 재던 것과 같은 실수다.
  {
    const worn = [set[cls], ...set.wear];
    const table = (G['affixes.json'] || {})['세트'] || {};
    for (const [id, def] of Object.entries(table)) {
      if (id.startsWith('_') || !def || !Array.isArray(def['부위'])) continue;
      const have = def['부위'].filter((x) => worn.includes(x)).length;
      for (const row of def['효과'] || []) {
        // 표에 두 가지 모양으로 적을 수 있다(AffixSystem 의 toStep 과 같은 규칙).
        //   [개수, 무엇을, 얼마나, 글]
        //   { 개수, 글, 보정:{…}, 특성:{…}, 상대:[…] }
        if (Array.isArray(row)) {
          const [need, prop, value] = row;
          if (have >= need) mods[prop] = (mods[prop] || 0) + value;
          continue;
        }
        if (have < row['개수']) continue;
        // ⚠ **'상대' 가 붙은 줄은 여기서 세지 않는다.**
        //   그 줄은 정해진 상대와 붙을 때만 켜진다(용린 4세트 — 고룡전 한정).
        //   평소 사냥의 승률을 재는 이 도구가 그걸 켜 두면, 있지도 않은 힘으로
        //   재게 되어 맵 배율이 통째로 부풀려진다.
        if (Array.isArray(row['상대']) && row['상대'].length) continue;
        for (const [prop, value] of Object.entries(row['보정'] || {})) {
          mods[prop] = (mods[prop] || 0) + value;
        }
        for (const [prop, value] of Object.entries(row['특성'] || {})) {
          statRanks[prop] = (statRanks[prop] || 0) + value;
        }
      }
    }
  }

  // ── ② 스킬. 전설 장비가 있으면 그만큼 크게 먹힌다. ──
  for (const [k, v] of Object.entries(buildMods(G, cls, level, planIdx).mods)) {
    if (k === 'lowHpThreshold') mods[k] = Math.max(mods[k] || 0, v);
    else mods[k] = (mods[k] || 0) + v * skillPower;
  }

  // ── ③ 힘·민첩·지능(자동 성장 + 장비가 얹은 몫) ──
  const statNodes = (G['stats.json'] || {}).nodes || {};
  for (const [name, rank] of Object.entries(statRanks)) {
    const node = statNodes[name];
    if (!node || !rank) continue;
    for (const [k, v] of Object.entries(node.per || {})) s[k] = (s[k] || 0) + v * rank;
    for (const [k, v] of Object.entries(node.mods || {})) mods[k] = (mods[k] || 0) + v * rank;
  }

  // ── ④ 찍어 둔 특성 여섯 갈래 ──
  for (const [name, rank] of Object.entries(buildTraitRanks(G, cls, level))) {
    const node = G['traits.json'].nodes[name];
    if (!node || !rank) continue;
    for (const [k, v] of Object.entries(node.mods || {})) mods[k] = (mods[k] || 0) + v * rank;
  }

  // ── ⑤ 직업 패시브 중 스탯에 비례해 커지는 것 ──
  //
  // SkillSystem 의 3) 블록과 같은 것을 여기서도 해야 한다. 안 그러면
  // 사냥꾼의 '민첩만큼 회피'나 마법사의 '지능만큼 마력 흡수' 가 측정에서
  // 통째로 빠져서, 있지도 않은 직업을 재게 된다.
  {
    const c = G['classes.json'].list[cls].combat || {};
    const per = [
      ['evadeBonus', c.evadePerAgiBase, c.evadePerAgi, 'agility'],
      ['absorbChance', c.absorbBase, c.absorbPerInt, 'intellect'],
      ['goldFind', c.goldFind, c.goldFindPerAgi, 'agility'],
      ['materialDouble', c.materialDouble, c.materialDoublePerStr, 'strength'],
      ['engraveBonus', c.engraveBonus, c.engravePerInt, 'intellect'],
    ];
    for (const [key, base, rate, statId] of per) {
      if (!base && !rate) continue;
      const n = (base || 0) + (rate || 0) * (statRanks[statId] || 0);
      if (n) mods[key] = (mods[key] || 0) + n;
    }
  }

  // ── StatBlock.computePlayerStats 와 같은 순서로 비율을 먹인다 ──
  // 이 순서를 흉내 내지 않으면 용사 스킬(공격력%·방어력%·최대HP배율·방어→공격)이
  // 전부 사라져서, 스킬을 하나도 안 찍은 용사를 재는 꼴이 된다.
  s.def = Math.round(s.def * (1 + (mods.defPct || 0)) * (1 + (mods.defMult || 0)));
  const fromDef = mods.defToAtk > 0 ? Math.round(s.def * mods.defToAtk) : 0;
  s.atk = Math.round((s.atk + fromDef) * (1 + (mods.atkPct || 0)) * (1 + (mods.atkMult || 0)));
  s.hp = Math.round(s.hp * (1 + (mods.hpPct || 0)) * (1 + (mods.hpMult || 0)));

  // 치명타 확률의 천장과 넘친 몫의 치명타 피해 전환(StatBlock 과 같은 규칙)
  const CAP = Number(/CRIT_CAP:\s*([0-9.]+)/.exec(FORMULAS_SRC)?.[1] || 0.85);
  const OVER = Number(/CRIT_OVERFLOW_TO_DMG:\s*([0-9.]+)/.exec(FORMULAS_SRC)?.[1] || 10);
  const raw = +(s.crit + (mods.crit || 0)).toFixed(4);
  if (raw > CAP) mods.critMult = (mods.critMult || 0) + (raw - CAP) * OVER;
  s.crit = Math.min(CAP, raw);

  return { stats: s, mods };
}

/** 그 단계에서 들고 다닐 회복약. 용사 패시브가 여기서 살아난다. */
function potionsOf(G, tier) {
  const items = G['items.json'];
  const stock = [];
  for (const [id, count] of POTIONS[tier] || []) {
    const d = items[id];
    if (d && d.use && d.use.hp) stock.push({ id, name: d.name, heal: d.use.hp, count });
  }
  return { stock, threshold: 0.7, cooldownMs: 2000 };
}

/**
 * 그 직업이 **가장 잘 버티는 순서**로 잰다.
 *
 * PLANS 에 적힌 후보를 모두 돌려 보고 승률이 가장 높은 것을 돌려준다.
 * 사람은 몇 판 해 보고 잘 되는 쪽으로 찍으므로, 그 사람을 재는 것이 맞다.
 * 돌려주는 값에 `planIdx` 를 얹어 두어 "무엇을 찍었을 때의 숫자인가" 를 알 수 있게 한다.
 */
async function bestWinRate(sim, G, cls, level, enh, tier, monId, samples, where = 1) {
  const n = (PLANS[cls] || []).length || 1;
  let best = null;
  for (let i = 0; i < n; i++) {
    const r = await winRate(sim, G, cls, level, enh, tier, monId, samples, where, i);
    if (!r) continue;
    if (!best || r.rate > best.rate) best = { ...r, planIdx: i };
  }
  return best;
}

async function winRate(sim, G, cls, level, enh, tier, monId, samples, where = 1, planIdx = 0) {
  const power = typeof where === 'string' ? powerOfMap(G, where) : where;
  const base = G['monsters.json'][monId];
  if (!base) return null;
  // 맵의 단계 보정을 게임과 똑같이 먹인다(formulas.scaleMonsterStats 와 같은 식).
  const m = power === 1 ? base : {
    ...base,
    stats: {
      ...base.stats,
      hp: Math.round(base.stats.hp * power),
      atk: Math.round(base.stats.atk * power),
      def: Math.round(base.stats.def * power),
      spd: +(base.stats.spd * (1 + (power - 1) * 0.25)).toFixed(2),
    },
  };
  const { stats, mods } = statsOf(G, cls, level, enh, tier, null, planIdx);
  const potions = potionsOf(G, tier);

  // 이 땅에서 몇 할이 마법으로 들어오는가(0.37).
  //
  // 빼먹으면 **지능의 '받는 마법 피해 감소' 가 통째로 없는 셈**이 되어,
  // 지능에 기댄 몸을 실제보다 약하게 재게 된다. 게임과 같은 값으로 재야 한다.
  const mapDef = typeof where === 'string' ? (G['maps.json'].maps[where] || {}) : {};
  const isBoss = !!(base.boss || mapDef.boss === monId);
  const magicPart = isBoss && mapDef.bossMagicPart != null
    ? mapDef.bossMagicPart
    : mapDef.magicPart || 0;

  let win = 0;
  let turns = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const r = sim({
      player: { name: 'p', level, ...stats, maxHp: stats.hp },
      monster: { name: m.name, level: m.level, ...m.stats, maxHp: m.stats.hp, magicPart },
      seed,
      playerMods: mods,
      playerTraits: G['classes.json'].list[cls].combat,
      potions,
    });
    if (r.winner === 'player') win++;
    turns += (r.turns || []).length;
  }
  return { rate: Math.round((win / samples) * 100), turns: Math.round(turns / samples) };
}

// ─────────────────────────────────────────────────────────────

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
const padL = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return ' '.repeat(Math.max(0, n - w)) + String(s);
};

/**
 * 목표에 견줘 어떤가.
 * 세 직업의 평균이 목표에서 얼마나 떨어졌는지, 직업끼리 얼마나 벌어졌는지 본다.
 */
function verdict(rates, target) {
  const vals = Object.values(rates).map((r) => r.rate);
  const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  const spread = Math.max(...vals) - Math.min(...vals);
  const notes = [];

  if (target != null) {
    const off = avg - target;
    if (Math.abs(off) <= 10) notes.push(`목표 ${target}% ✓`);
    else notes.push(`목표 ${target}% (${off > 0 ? '너무 쉬움 +' : '너무 어려움 '}${off}%p)`);
  }
  if (spread >= 30) notes.push(`직업 격차 ${spread}%p`);
  return notes.join(' · ');
}

/**
 * 목표 승률에 닿는 보스 능력치를 되찾는다(--solve).
 *
 * hp 를 k 배로 밀면서 공격력·방어력은 그보다 완만하게 따라 올린다.
 * 셋을 같은 배수로 밀면 방어력이 먼저 폭발해서 "때려도 안 죽는" 벽이 되고,
 * hp 만 밀면 "오래 걸릴 뿐 절대 안 지는" 자루가 된다.
 */
const HP_ONLY = process.argv.includes('--hp-only');

const scaleMon = (m, k) => ({
  ...m,
  stats: {
    ...m.stats,
    hp: Math.round(m.stats.hp * k),
    // --hp-only 면 공격·방어는 그대로 두고 체력만 민다.
    //
    // 왜 필요한가: 여러 판에 걸쳐 --solve 를 되풀이하면 k 가 1 보다 작은 해가 쌓이면서
    // 보스의 **공격력만 유독 깎인다**(k^0.55). 그러다 보면 보스가 제 땅의 잡몹보다
    // 약하게 때리는 이상한 상태가 된다 — 실제로 10단계 발가르(공격 57)가
    // 제 땅의 악마 병사(78)보다 약했다. 그럴 때는 공격·방어를 손으로 정해 놓고
    // 체력만 풀어서 목표 승률을 맞춘다.
    atk: HP_ONLY ? m.stats.atk : Math.round(m.stats.atk * Math.pow(k, 0.55)),
    def: HP_ONLY ? m.stats.def : Math.round(m.stats.def * Math.pow(k, 0.35)),
  },
});

async function solve(sim, G, list, samples) {
  const classes = ['warrior', 'ranger', 'mage'];
  console.log('');
  console.log(`  목표 승률 되찾기 — hp ×k · 공격 ×k^0.55 · 방어 ×k^0.35  · 표본 ${samples}판`);
  console.log('  ' + '─'.repeat(72));
  const found = {};
  for (const [monId, lv, enh, tier, label, target, where = 1] of list) {
    const base = G['monsters.json'][monId];
    if (!base) continue;
    const power = typeof where === 'string' ? powerOfMap(G, where) : where;
    const avg = async (k) => {
      G['monsters.json'][monId] = scaleMon(base, k);
      let sum = 0;
      for (const c of classes) {
        sum += (await bestWinRate(sim, G, c, lv, enh, tier, monId, samples, where)).rate;
      }
      return sum / classes.length;
    };
    let lo = 0.01;
    let hi = 60;
    for (let i = 0; i < 16; i++) {
      const k = (lo + hi) / 2;
      if ((await avg(k)) > target) lo = k;
      else hi = k;
    }
    const k = +((lo + hi) / 2).toFixed(4);
    const tuned = scaleMon(base, k);
    G['monsters.json'][monId] = tuned;
    const per = [];
    for (const c of classes) {
      per.push((await bestWinRate(sim, G, c, lv, enh, tier, monId, samples, where)).rate);
    }
    G['monsters.json'][monId] = base;
    found[monId] = tuned.stats;
    console.log('  ' + pad(label, 34) + pad(`×${k}`, 9)
      + padL(per[0] + '%', 6) + padL(per[1] + '%', 8) + padL(per[2] + '%', 8)
      + `   목표 ${target}%`);
    console.log('  ' + pad('', 34)
      + `hp ${base.stats.hp}→${tuned.stats.hp} · 공격 ${base.stats.atk}→${tuned.stats.atk}`
      + ` · 방어 ${base.stats.def}→${tuned.stats.def}`
      + (power !== 1 ? `   (맵 보정 ×${power} 적용해서 잰 값)` : ''));
  }
  console.log('');
  console.log('  sheets/monsters.csv 의 hp·atk·def 를 위 값으로 고치고');
  console.log('  node tools/sheets.js check → import 하면 반영됩니다.');
  console.log('');
  return found;
}

// 명령줄로 직접 부를 때만 측정을 돌린다.
// (다른 도구가 require 로 계산만 빌려 쓸 때 표가 튀어나오지 않게)
if (require.main === module) (async () => {
  const { simulateBattle } = await import('../src/systems/CombatSystem.js');
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 ? Number(argv[i + 1]) : def;
  };
  const useSheets = argv.includes('sheets');
  const wantDiff = argv.includes('--diff');
  const samples = flag('n', 80);
  const onlyLv = flag('lv', 0);
  const onlyEnh = flag('enh', -1);
  const list = argv.includes('--trash') ? TRASH : MATCHES;

  const G = loadFrom(useSheets ? 'sheets' : 'src');
  const BEFORE = wantDiff ? loadFrom('src') : null;

  if (argv.includes('--solve')) {
    await solve(simulateBattle, G, list, samples);
    return;
  }

  console.log('');
  console.log(`  밸런스 미리보기 — ${useSheets ? 'sheets/*.csv (아직 안 넣음)' : 'src/data (지금 표)'}`
    + `  · 표본 ${samples}판`);
  console.log('  ' + '─'.repeat(72));
  console.log('  ' + pad('상대', 34) + pad('레벨/강화', 12)
    + padL('용사', 6) + padL('사냥꾼', 8) + padL('마법사', 8) + '   목표 대비');

  const classes = ['warrior', 'ranger', 'mage'];
  // 마지막으로 잰 상대에서 어느 순서가 이겼는지 — 아래 "무엇을 찍었나" 에 쓴다.
  const bestPlanIdx = {};
  const bodies = [];
  for (const [monId, lv, enh, tier, label, target, where = 1] of list) {
    if (onlyLv && lv !== onlyLv) continue;
    if (onlyEnh >= 0 && enh !== onlyEnh) continue;
    // ⚠ where 를 **맵 이름 그대로** 넘긴다. 미리 숫자(배율)로 바꿔 넘기면
    //   winRate 가 그 땅의 마법 피해 몫(magicPart)을 못 찾아 0 으로 잰다.
    //   지하감옥은 절반이 마법이라, 그 탓에 감옥의 주인이 16% 로 보였다(실제 28%).
    const now = {};
    const old = {};
    for (const c of classes) {
      now[c] = await bestWinRate(simulateBattle, G, c, lv, enh, tier, monId, samples, where);
      if (now[c] && now[c].planIdx != null) bestPlanIdx[c] = now[c].planIdx;
      if (BEFORE) {
        old[c] = await bestWinRate(simulateBattle, BEFORE, c, lv, enh, tier, monId, samples, where);
      }
    }
    const cell = (c) => {
      const a = now[c] ? `${now[c].rate}%` : '-';
      if (!BEFORE) return a;
      const b = old[c] ? `${old[c].rate}%` : '-';
      return b === a ? a : `${b}→${a}`;
    };
    console.log('  ' + pad(label, 34) + pad(`Lv.${lv} +${enh}`, 12)
      + padL(cell('warrior'), 6) + padL(cell('ranger'), 8) + padL(cell('mage'), 8)
      + '   ' + verdict(now, target));
    bodies.push({ label, lv, enh, tier, monId, where });
  }

  // ── 몸 견주기 (0.50) ──────────────────────────────────────
  //
  // 왜 이걸 찍나: 승률만 보면 "0%" 가 왜 0% 인지 알 수가 없다. 그래서
  // "이 도구가 상상한 사람" 과 "그 땅에 실제로 서 있는 상대" 의 몸을 나란히 적는다.
  // 숫자가 나란히 있으면 도구가 틀렸는지 표가 틀렸는지가 한눈에 보인다.
  // (0.49 에서 도구와 사람의 말이 정반대였는데, 이 줄이 있었으면 바로 알았다)
  console.log('');
  console.log('  몸 견주기 — 왼쪽이 사람, 오른쪽이 그 땅에 선 상대');
  console.log('  ' + '─'.repeat(72));
  for (const bd of bodies) {
    const power = typeof bd.where === 'string' ? powerOfMap(G, bd.where) : bd.where;
    const base = G['monsters.json'][bd.monId];
    const ms = {
      hp: Math.round(base.stats.hp * power),
      atk: Math.round(base.stats.atk * power),
      def: Math.round(base.stats.def * power),
    };
    const me = {};
    for (const c of classes) {
      const { stats } = statsOf(G, c, bd.lv, bd.enh, bd.tier);
      me[c] = stats;
    }
    const mid = me.mage;
    console.log('  ' + pad(bd.label, 34)
      + pad(`hp ${Math.round(mid.hp)} · atk ${Math.round(mid.atk)} · def ${Math.round(mid.def)}`, 34)
      + `hp ${ms.hp} · atk ${ms.atk} · def ${ms.def}`);
  }

  // 참고: 그 레벨에서 실제로 몇 점을 받고 무엇을 찍었나
  console.log('');
  const showLv = onlyLv || 50;
  for (const c of classes) {
    // 위 표는 후보 중 **가장 잘 버틴 순서**로 잰 값이다. 여기서도 그 순서를 보여 줘야
    // 숫자와 설명이 맞는다 — 안 그러면 "3% 인데 왜 이 스킬을 찍었지" 가 된다.
    const b = buildMods(G, c, showLv, bestPlanIdx[c] || 0);
    const t = buildTraitRanks(G, c, showLv);
    const st = buildStatRanks(G, c, showLv);
    const tNames = Object.entries(t)
      .map(([id, n]) => `${G['traits.json'].nodes[id].name}${n}`)
      .join(' ');
    const sNames = Object.entries(st)
      .map(([id, n]) => `${(G['stats.json'].nodes[id] || {}).name || id} ${Math.round(n)}`)
      .join(' · ');
    console.log(`  Lv.${showLv} ${pad(G['classes.json'].list[c].name, 8)}`
      + `스킬 ${b.pts}점 → ${b.picked.join(' ')}`);
    console.log(`${' '.repeat(16)}특성 → ${tNames}`);
    console.log(`${' '.repeat(16)}스탯 → ${sNames}`);
  }
  console.log('');
  console.log('  세 직업 평균이 목표에서 ±10%p 안이면 ✓ 입니다.');
  console.log('  직업 격차가 30%p 를 넘으면 한 직업이 정답이 되어 버립니다.');
  console.log('');
})();

// 다른 도구가 이 계산을 그대로 쓰도록 열어 둔다(측정 방법이 갈라지지 않게).
module.exports = { loadFrom, statsOf, potionsOf, winRate, bestWinRate, scaleMon, MATCHES, TRASH, GEAR, PLAN, PLANS };
