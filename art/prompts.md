# 그림 주문서 — 320장

> 만든 것: `node tools/art-prompts.js`. 표(items/monsters/npcs)가 바뀌면 다시 돌린다.
> **구울크기**가 받아야 할 파일 크기다. 그릴크기는 화면에 줄여 그리는 크기라 참고만 한다.

## 바닥 타일(이어 붙음) — 36장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Seamless repeating floor tile, straight top-down view (camera exactly overhead). The image fills the entire canvas edge to edge with no border, no frame, no margin. ⚠ CRITICAL: the tile is laid in a 40x32 grid, so it must tile seamlessly — left edge must continue into the right edge and top into bottom. ABSOLUTELY NO directional light (no brighter-top/darker-bottom), NO vignette, NO border or outline on any edge, NO single big feature in the centre. Keep the base colour perfectly flat and put all variation into small scattered speckles and marks that do not touch the edges.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `tile_grass` | assets/tiles/grass.png | 64x64 | lush short meadow grass, scattered blades and a few tiny clover leaves |
| `tile_path` | assets/tiles/path.png | 64x64 | packed dry dirt path, warm brown, fine grit |
| `tile_water` | assets/tiles/water.png | 64x64 | calm shallow fresh water, gentle ripples |
| `tile_brick` | assets/tiles/brick.png | 64x64 | fitted grey flagstone paving |
| `tile_house_wall` | assets/tiles/house_wall.png | 64x64 | plastered cottage wall with exposed timber framing |
| `tile_house_roof` | assets/tiles/house_roof.png | 64x64 | terracotta roof tiles laid in rows |
| `tile_castle_wall` | assets/tiles/castle_wall.png | 64x64 | dressed pale stone castle masonry |
| `tile_castle_top` | assets/tiles/castle_top.png | 64x64 | the crenellated top course of a castle wall |
| `tile_castle_floor` | assets/tiles/castle_floor.png | 64x64 | polished pale stone hall flooring |
| `tile_dungeon_floor` | assets/tiles/dungeon_floor.png | 64x64 | damp dark prison flagstones |
| `tile_dungeon_wall` | assets/tiles/dungeon_wall.png | 64x64 | cold dungeon block masonry, faintly damp |
| `tile_ash` | assets/tiles/ash.png | 64x64 | a floor of cold grey volcanic ash |
| `tile_ash_path` | assets/tiles/ash_path.png | 64x64 | a trodden path through volcanic ash, slightly darker and packed |
| `tile_charred` | assets/tiles/charred.png | 64x64 | scorched blackened ground, still faintly warm |
| `tile_basalt` | assets/tiles/basalt.png | 64x64 | cracked black basalt rock |
| `tile_magma` | assets/tiles/magma.png | 64x64 | molten magma glowing orange through a black crust |
| `tile_ember` | assets/tiles/ember.png | 64x64 | cooling embers, dark with orange cracks |
| `tile_waste` | assets/tiles/waste.png | 64x64 | barren cracked wasteland dirt, pale and dry |
| `tile_grass2` | assets/tiles/grass2.png | 64x64 | the same meadow grass with a different scatter of blades and one small dirt scuff |
| `tile_grass3` | assets/tiles/grass3.png | 64x64 | the same meadow grass with a different scatter of blades and two tiny pebbles |
| `tile_grass4` | assets/tiles/grass4.png | 64x64 | the same meadow grass with a different scatter of blades and a few tiny yellow flowers |
| `tile_path2` | assets/tiles/path2.png | 64x64 | the same dirt path with a slightly different grit scatter |
| `tile_water2` | assets/tiles/water2.png | 64x64 | the same water with a different ripple pattern |
| `tile_brick2` | assets/tiles/brick2.png | 64x64 | the same flagstone paving with different worn marks |
| `tile_castle_floor2` | assets/tiles/castle_floor2.png | 64x64 | the same hall flooring with a different wear pattern |
| `tile_dungeon_floor2` | assets/tiles/dungeon_floor2.png | 64x64 | the same prison flagstones with different cracks |
| `tile_waste2` | assets/tiles/waste2.png | 64x64 | the same wasteland dirt with a different crack pattern |
| `tile_waste3` | assets/tiles/waste3.png | 64x64 | the same wasteland dirt with a different crack pattern and a dry stain |
| `tile_room_floor` | assets/tiles/room_floor.png | 64x64 | warm wooden interior floorboards |
| `tile_room_wall` | assets/tiles/room_wall.png | 64x64 | a plastered interior wall with a wooden wainscot |
| `tile_path3` | assets/tiles/path3.png | 64x64 | A path3 |
| `tile_path4` | assets/tiles/path4.png | 64x64 | A path4 |
| `tile_waste4` | assets/tiles/waste4.png | 64x64 | A waste4 |
| `tile_waste5` | assets/tiles/waste5.png | 64x64 | A waste5 |
| `tile_ash2` | assets/tiles/ash2.png | 64x64 | A ash2 |
| `tile_ash3` | assets/tiles/ash3.png | 64x64 | A ash3 |

## 얹는 타일 — 48장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Single object drawn small and centred, seen from a 3/4 top-down angle. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. The outer edge of the object must be ragged and irregular (not a filled square), because this is layered on top of a ground tile and the ground shows through around it. No ground, no grass, no base plate underneath.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `tile_tree` | assets/tiles/tree.png | 64x64 | a small round-canopy broadleaf tree seen from above-behind |
| `tile_rock` | assets/tiles/rock.png | 64x64 | a grey weathered boulder |
| `tile_flower` | assets/tiles/flower.png | 64x64 | a small patch of wildflowers in white, yellow and pink |
| `tile_door` | assets/tiles/door.png | 64x64 | a sturdy wooden cottage door with iron hinges |
| `tile_castle_gate` | assets/tiles/castle_gate.png | 64x64 | a heavy iron-banded castle gate |
| `tile_fence` | assets/tiles/fence.png | 64x64 | a low wooden picket fence running left to right |
| `tile_gate_exit` | assets/tiles/gate_exit.png | 64x64 | a stone archway marking the way out of town |
| `tile_signpost` | assets/tiles/signpost.png | 64x64 | a wooden signpost with a blank board |
| `tile_sign_item` | assets/tiles/sign_item.png | 64x64 | a hanging shop sign showing a potion bottle |
| `tile_sign_weapon` | assets/tiles/sign_weapon.png | 64x64 | a hanging shop sign showing a crossed sword and hammer |
| `tile_sign_alchemy` | assets/tiles/sign_alchemy.png | 64x64 | a hanging shop sign showing a bubbling flask |
| `tile_sign_inn` | assets/tiles/sign_inn.png | 64x64 | a hanging shop sign showing a bed and a mug |
| `tile_stairs_down` | assets/tiles/stairs_down.png | 64x64 | a stone staircase descending into darkness |
| `tile_stairs_up` | assets/tiles/stairs_up.png | 64x64 | a stone staircase climbing up toward light |
| `tile_waypoint_pad` | assets/tiles/waypoint_pad.png | 64x64 | a circular stone teleport pad inlaid with glowing blue runes |
| `tile_cliff` | assets/tiles/cliff.png | 64x64 | a sheer pale cliff face seen from above |
| `tile_cliff_edge` | assets/tiles/cliff_edge.png | 64x64 | the lip of a cliff where the ground drops away |
| `tile_wind_rock` | assets/tiles/wind_rock.png | 64x64 | a wind-scoured standing rock, pale and streaked |
| `tile_lair_gate` | assets/tiles/lair_gate.png | 64x64 | a colossal sealed stone gate carved with a dragon, faint red light in the seams |
| `tile_pebble` | assets/tiles/pebble.png | 64x64 | a handful of small grey pebbles lying loose |
| `tile_bush` | assets/tiles/bush.png | 64x64 | a low round leafy bush |
| `tile_stump` | assets/tiles/stump.png | 64x64 | a cut tree stump with visible rings |
| `tile_grass_tall` | assets/tiles/grass_tall.png | 64x64 | a clump of tall wild grass growing up out of the ground |
| `tile_tree2` | assets/tiles/tree2.png | 64x64 | a small conifer with a darker needled canopy |
| `tile_tree3` | assets/tiles/tree3.png | 64x64 | a small broadleaf tree with a lighter, yellower canopy |
| `tile_castle_gate_ul` | assets/tiles/castle_gate_ul.png | 64x64 | TOP-LEFT quarter of a great arched castle gatehouse (iron-banded double doors under a stone arch) |
| `tile_castle_gate_ur` | assets/tiles/castle_gate_ur.png | 64x64 | TOP-RIGHT quarter of that same great arched castle gatehouse |
| `tile_castle_gate_dl` | assets/tiles/castle_gate_dl.png | 64x64 | BOTTOM-LEFT quarter of that same great arched castle gatehouse |
| `tile_castle_gate_dr` | assets/tiles/castle_gate_dr.png | 64x64 | BOTTOM-RIGHT quarter of that same great arched castle gatehouse |
| `tile_castle_tower_tl` | assets/tiles/castle_tower_tl.png | 64x64 | TOP-LEFT quarter of a round castle watchtower with a conical roof |
| `tile_castle_tower_tr` | assets/tiles/castle_tower_tr.png | 64x64 | TOP-RIGHT quarter of that same round castle watchtower |
| `tile_castle_tower_bl` | assets/tiles/castle_tower_bl.png | 64x64 | BOTTOM-LEFT quarter of that same round castle watchtower |
| `tile_castle_tower_br` | assets/tiles/castle_tower_br.png | 64x64 | BOTTOM-RIGHT quarter of that same round castle watchtower |
| `tile_castle_batt` | assets/tiles/castle_batt.png | 64x64 | a battlement merlon seen from above |
| `tile_castle_window` | assets/tiles/castle_window.png | 64x64 | a narrow arched castle window with dark glass |
| `tile_castle_rug` | assets/tiles/castle_rug.png | 64x64 | a long red-and-gold royal carpet runner, seen from above |
| `tile_castle_rug_end` | assets/tiles/castle_rug_end.png | 64x64 | the fringed end piece of that royal carpet runner |
| `tile_castle_pillar` | assets/tiles/castle_pillar.png | 64x64 | a fluted stone pillar |
| `tile_castle_glass` | assets/tiles/castle_glass.png | 64x64 | a stained-glass castle window in blue and gold |
| `tile_wall_torch` | assets/tiles/wall_torch.png | 64x64 | an iron wall bracket holding a lit torch |
| `tile_dungeon_torch` | assets/tiles/dungeon_torch.png | 64x64 | a guttering dungeon torch in an iron ring, greenish flame |
| `tile_ash_rubble` | assets/tiles/ash_rubble.png | 64x64 | a scatter of burnt rubble on ash |
| `tile_charred_stump` | assets/tiles/charred_stump.png | 64x64 | the blackened stump of a burnt tree |
| `tile_ash_vent` | assets/tiles/ash_vent.png | 64x64 | a small vent in the ash breathing faint smoke |
| `tile_waste_rubble` | assets/tiles/waste_rubble.png | 64x64 | a scatter of broken stone on wasteland dirt |
| `tile_waste_bones` | assets/tiles/waste_bones.png | 64x64 | a few bleached bones half buried in wasteland dirt |
| `tile_room_exit` | assets/tiles/room_exit.png | 64x64 | an interior doorway leading out to the street |
| `tile_counter` | assets/tiles/counter.png | 64x64 | a wooden shop counter seen from above |

## 이음새 타일 — 20장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Transition tile: one single edge of the square carries the second material, the rest of the tile is the first material. Straight top-down view. The image fills the entire canvas edge to edge with no border, no frame, no margin. The wavy boundary must start and end exactly at the two side edges so that neighbouring copies line up. No directional light, no border.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `tile_edge_grass_n` | assets/tiles/edge_grass_n.png | 64x64 | short meadow grass on the top edge meeting bare dirt across the rest of the tile |
| `tile_edge_grass_e` | assets/tiles/edge_grass_e.png | 64x64 | short meadow grass on the right edge meeting bare dirt across the rest of the tile |
| `tile_edge_grass_s` | assets/tiles/edge_grass_s.png | 64x64 | short meadow grass on the bottom edge meeting bare dirt across the rest of the tile |
| `tile_edge_grass_w` | assets/tiles/edge_grass_w.png | 64x64 | short meadow grass on the left edge meeting bare dirt across the rest of the tile |
| `tile_shore_dnw` | assets/tiles/shore_dnw.png | 64x64 | shallow water with a foam line meeting wet sand around the top-left corner of the tile |
| `tile_shore_dne` | assets/tiles/shore_dne.png | 64x64 | shallow water with a foam line meeting wet sand around the top-right corner of the tile |
| `tile_shore_dse` | assets/tiles/shore_dse.png | 64x64 | shallow water with a foam line meeting wet sand around the bottom-right corner of the tile |
| `tile_shore_dsw` | assets/tiles/shore_dsw.png | 64x64 | shallow water with a foam line meeting wet sand around the bottom-left corner of the tile |
| `tile_crust_n` | assets/tiles/crust_n.png | 64x64 | glowing magma on the top edge meeting black basalt crust across the rest of the tile |
| `tile_crust_e` | assets/tiles/crust_e.png | 64x64 | glowing magma on the right edge meeting black basalt crust across the rest of the tile |
| `tile_crust_s` | assets/tiles/crust_s.png | 64x64 | glowing magma on the bottom edge meeting black basalt crust across the rest of the tile |
| `tile_crust_w` | assets/tiles/crust_w.png | 64x64 | glowing magma on the left edge meeting black basalt crust across the rest of the tile |
| `tile_crust_dnw` | assets/tiles/crust_dnw.png | 64x64 | glowing magma meeting black basalt crust around the top-left corner of the tile |
| `tile_crust_dne` | assets/tiles/crust_dne.png | 64x64 | glowing magma meeting black basalt crust around the top-right corner of the tile |
| `tile_crust_dse` | assets/tiles/crust_dse.png | 64x64 | glowing magma meeting black basalt crust around the bottom-right corner of the tile |
| `tile_crust_dsw` | assets/tiles/crust_dsw.png | 64x64 | glowing magma meeting black basalt crust around the bottom-left corner of the tile |
| `tile_shore_n` | assets/tiles/shore_n.png | 64x64 | shallow water with a foam line on the top edge meeting wet sand across the rest of the tile |
| `tile_shore_e` | assets/tiles/shore_e.png | 64x64 | shallow water with a foam line on the right edge meeting wet sand across the rest of the tile |
| `tile_shore_s` | assets/tiles/shore_s.png | 64x64 | shallow water with a foam line on the bottom edge meeting wet sand across the rest of the tile |
| `tile_shore_w` | assets/tiles/shore_w.png | 64x64 | shallow water with a foam line on the left edge meeting wet sand across the rest of the tile |

## 키 큰 타일 — 17장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Tall object standing on the ground, seen from a 3/4 top-down angle, drawn so that the base sits at the very bottom edge of the canvas and the top is free. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. No ground plate, no shadow disc under it.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `tile_forge_hearth` | assets/tiles/forge_hearth.png | 96x96 | a blacksmith forge hearth glowing with coals |
| `tile_forge_anvil` | assets/tiles/forge_anvil.png | 90x90 | a blacksmith anvil on a wooden block |
| `tile_stall_weapon` | assets/tiles/stall_weapon.png | 90x90 | an open-air market stall with weapons racked on it |
| `tile_stall_armor` | assets/tiles/stall_armor.png | 90x90 | an open-air market stall with armour pieces laid out |
| `tile_tree_shade` | assets/tiles/tree_shade.png | 112x80 | a soft pool of dappled tree shade, semi-transparent dark green |
| `tile_house_roof_top` | assets/tiles/house_roof_top.png | 64x240 | the ridge cap of a terracotta roof, running left to right |
| `tile_house_roof_top_l` | assets/tiles/house_roof_top_l.png | 64x240 | the left end cap of a terracotta roof ridge |
| `tile_house_roof_top_r` | assets/tiles/house_roof_top_r.png | 64x240 | the right end cap of a terracotta roof ridge |
| `tile_tree_big` | assets/tiles/tree_big.png | 112x144 | a tall mature broadleaf tree, thick trunk at the bottom, wide canopy at the top |
| `tile_tree_big2` | assets/tiles/tree_big2.png | 112x144 | a tall old conifer, dark needled tiers stacked up the trunk |
| `tile_tree_big3` | assets/tiles/tree_big3.png | 112x144 | a tall gnarled broadleaf tree with a twisted trunk and an autumn-tinted canopy |
| `tile_room_window` | assets/tiles/room_window.png | 92x92 | a small interior window with daylight outside |
| `tile_shelf` | assets/tiles/shelf.png | 90x90 | a wooden shelf stocked with jars and bundles |
| `tile_barrel` | assets/tiles/barrel.png | 84x84 | a wooden barrel with iron bands |
| `tile_bed` | assets/tiles/bed.png | 124x124 | a simple inn bed with a folded blanket |
| `tile_table` | assets/tiles/table.png | 102x102 | a wooden table with a candle on it |
| `tile_cauldron` | assets/tiles/cauldron.png | 100x100 | an alchemist cauldron with green liquid bubbling |

## 들판 그림 — 15장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
3/4 top-down view as seen in a JRPG overworld, the character standing and facing the camera-left, feet touching the very bottom edge of the canvas, head near the top with a small margin. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. Whole body in frame, symmetrical readable silhouette, no motion blur.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `chr_hero_field` | assets/sprites/characters/hero_field.png | 192x256 | A sword-and-shield hero knight — the player character of this game, an adventurer |
| `chr_admin_field` | assets/sprites/characters/admin_field.png | 192x256 | A game master in dark robes — the player character of this game, an adventurer |
| `mon_slime_field` | assets/sprites/monsters/slime_field.png | 256x256 | A slime — a fantasy RPG monster, a level 1 creature |
| `mon_bat_field` | assets/sprites/monsters/bat_field.png | 256x256 | A bat — a fantasy RPG monster, a level 3 creature |
| `mon_mushroom_field` | assets/sprites/monsters/mushroom_field.png | 256x256 | A mushroom — a fantasy RPG monster, a level 9 creature |
| `mon_wolf_field` | assets/sprites/monsters/wolf_field.png | 256x256 | A wolf — a fantasy RPG monster, a level 6 creature |
| `mon_imp_field` | assets/sprites/monsters/imp_field.png | 256x256 | A imp — a fantasy RPG monster, a level 13 creature that casts spells |
| `mon_skeleton_field` | assets/sprites/monsters/skeleton_field.png | 256x256 | A skeleton — a fantasy RPG monster, a level 17 creature |
| `mon_demon_soldier_field` | assets/sprites/monsters/demon_soldier_field.png | 256x256 | A demon soldier — a fantasy RPG monster, a level 21 creature |
| `mon_imp_captain_field` | assets/sprites/monsters/imp_captain_field.png | 256x256 | A imp scout captain — a fantasy RPG monster, a level 15 creature that casts spells |
| `mon_demon_general_field` | assets/sprites/monsters/demon_general_field.png | 256x256 | A demon general warlord — a fantasy RPG monster, a level 30 creature that casts spells |
| `chr_ranger_field` | assets/sprites/characters/ranger_field.png | 192x256 | A hooded bow ranger — the player character of this game, an adventurer |
| `chr_mage_field` | assets/sprites/characters/mage_field.png | 192x256 | A staff-wielding mage — the player character of this game, an adventurer |
| `mon_great_dragon_field` | assets/sprites/monsters/great_dragon_field.png | 256x256 | A colossal ancient dragon — a fantasy RPG monster, a level 99 creature that casts spells |
| `mon_elder_dragon_field` | assets/sprites/monsters/elder_dragon_field.png | 256x256 | A elder dragon, even larger and older — a fantasy RPG monster, a level 110 creature that casts spells |

## 전투 그림 — 15장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Side view battle portrait, full body, standing in an idle ready stance and FACING LEFT (the enemy is off-frame to the left). Feet touch the very bottom edge of the canvas, head near the top. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. Dramatic but still, no motion lines.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `chr_hero_battle` | assets/sprites/characters/hero_battle.png | 768x1024 | A sword-and-shield hero knight — the player character of this game, an adventurer |
| `chr_admin_battle` | assets/sprites/characters/admin_battle.png | 768x1024 | A game master in dark robes — the player character of this game, an adventurer |
| `mon_slime_battle` | assets/sprites/monsters/slime_battle.png | 512x512 | A slime — a fantasy RPG monster, a level 1 creature |
| `mon_bat_battle` | assets/sprites/monsters/bat_battle.png | 512x512 | A bat — a fantasy RPG monster, a level 3 creature |
| `mon_mushroom_battle` | assets/sprites/monsters/mushroom_battle.png | 512x512 | A mushroom — a fantasy RPG monster, a level 9 creature |
| `mon_wolf_battle` | assets/sprites/monsters/wolf_battle.png | 512x512 | A wolf — a fantasy RPG monster, a level 6 creature |
| `mon_imp_battle` | assets/sprites/monsters/imp_battle.png | 512x512 | A imp — a fantasy RPG monster, a level 13 creature that casts spells |
| `mon_skeleton_battle` | assets/sprites/monsters/skeleton_battle.png | 512x512 | A skeleton — a fantasy RPG monster, a level 17 creature |
| `mon_demon_soldier_battle` | assets/sprites/monsters/demon_soldier_battle.png | 512x512 | A demon soldier — a fantasy RPG monster, a level 21 creature |
| `mon_imp_captain_battle` | assets/sprites/monsters/imp_captain_battle.png | 512x512 | A imp scout captain — a fantasy RPG monster, a level 15 creature that casts spells |
| `mon_demon_general_battle` | assets/sprites/monsters/demon_general_battle.png | 512x512 | A demon general warlord — a fantasy RPG monster, a level 30 creature that casts spells |
| `chr_ranger_battle` | assets/sprites/characters/ranger_battle.png | 768x1024 | A hooded bow ranger — the player character of this game, an adventurer |
| `chr_mage_battle` | assets/sprites/characters/mage_battle.png | 768x1024 | A staff-wielding mage — the player character of this game, an adventurer |
| `mon_great_dragon_battle` | assets/sprites/monsters/great_dragon_battle.png | 512x512 | A colossal ancient dragon — a fantasy RPG monster, a level 99 creature that casts spells |
| `mon_elder_dragon_battle` | assets/sprites/monsters/elder_dragon_battle.png | 512x512 | A elder dragon, even larger and older — a fantasy RPG monster, a level 110 creature that casts spells |

## 공격 자세 — 14장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Side view, full body, caught at the peak of a forward lunging attack toward the LEFT, weight thrown forward, weapon or limb extended left. Same character, same colours and same proportions as the idle version — only the pose changes. Feet near the bottom edge. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `chr_hero_attack` | assets/sprites/characters/hero_attack.png | 768x1024 | A sword-and-shield hero knight — the player character of this game, an adventurer |
| `chr_ranger_attack` | assets/sprites/characters/ranger_attack.png | 768x1024 | A hooded bow ranger — the player character of this game, an adventurer |
| `chr_mage_attack` | assets/sprites/characters/mage_attack.png | 768x1024 | A staff-wielding mage — the player character of this game, an adventurer |
| `mon_slime_attack` | assets/sprites/monsters/slime_attack.png | 512x512 | A slime — a fantasy RPG monster, a level 1 creature |
| `mon_bat_attack` | assets/sprites/monsters/bat_attack.png | 512x512 | A bat — a fantasy RPG monster, a level 3 creature |
| `mon_mushroom_attack` | assets/sprites/monsters/mushroom_attack.png | 512x512 | A mushroom — a fantasy RPG monster, a level 9 creature |
| `mon_wolf_attack` | assets/sprites/monsters/wolf_attack.png | 512x512 | A wolf — a fantasy RPG monster, a level 6 creature |
| `mon_imp_attack` | assets/sprites/monsters/imp_attack.png | 512x512 | A imp — a fantasy RPG monster, a level 13 creature that casts spells |
| `mon_skeleton_attack` | assets/sprites/monsters/skeleton_attack.png | 512x512 | A skeleton — a fantasy RPG monster, a level 17 creature |
| `mon_demon_soldier_attack` | assets/sprites/monsters/demon_soldier_attack.png | 512x512 | A demon soldier — a fantasy RPG monster, a level 21 creature |
| `mon_imp_captain_attack` | assets/sprites/monsters/imp_captain_attack.png | 512x512 | A imp scout captain — a fantasy RPG monster, a level 15 creature that casts spells |
| `mon_demon_general_attack` | assets/sprites/monsters/demon_general_attack.png | 512x512 | A demon general warlord — a fantasy RPG monster, a level 30 creature that casts spells |
| `mon_great_dragon_attack` | assets/sprites/monsters/great_dragon_attack.png | 512x512 | A colossal ancient dragon — a fantasy RPG monster, a level 99 creature that casts spells |
| `mon_elder_dragon_attack` | assets/sprites/monsters/elder_dragon_attack.png | 512x512 | A elder dragon, even larger and older — a fantasy RPG monster, a level 110 creature that casts spells |

## 방어 자세 — 3장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Side view, full body, braced defensive stance facing LEFT — knees bent, guard raised. Same character, same colours and same proportions as the idle version — only the pose changes. Feet near the bottom edge. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `chr_hero_stance` | assets/sprites/characters/hero_stance.png | 768x1024 | A sword-and-shield hero knight — the player character of this game, an adventurer |
| `chr_ranger_stance` | assets/sprites/characters/ranger_stance.png | 768x1024 | A hooded bow ranger — the player character of this game, an adventurer |
| `chr_mage_stance` | assets/sprites/characters/mage_stance.png | 768x1024 | A staff-wielding mage — the player character of this game, an adventurer |

## 걷는 자세 — 30장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
The SAME character as the standing version — identical colours, proportions, clothing and silhouette — caught mid-stride in a walk cycle, seen from the same 3/4 top-down angle. One leg is forward and slightly lower in frame, the other is back; the arms swing the OPPOSITE way to the legs. Feet stay at the very bottom edge of the canvas. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. This is one frame of a looping walk, so keep the pose readable and symmetrical in weight.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `chr_hero_walk1` | assets/sprites/characters/hero_walk1.png | 192x256 | A hero walk1 |
| `chr_hero_walk2` | assets/sprites/characters/hero_walk2.png | 192x256 | A hero walk2 |
| `chr_ranger_walk1` | assets/sprites/characters/ranger_walk1.png | 192x256 | A ranger walk1 |
| `chr_ranger_walk2` | assets/sprites/characters/ranger_walk2.png | 192x256 | A ranger walk2 |
| `chr_mage_walk1` | assets/sprites/characters/mage_walk1.png | 192x256 | A mage walk1 |
| `chr_mage_walk2` | assets/sprites/characters/mage_walk2.png | 192x256 | A mage walk2 |
| `chr_admin_walk1` | assets/sprites/characters/admin_walk1.png | 192x256 | A admin walk1 |
| `chr_admin_walk2` | assets/sprites/characters/admin_walk2.png | 192x256 | A admin walk2 |
| `mon_slime_walk1` | assets/sprites/monsters/slime_walk1.png | 256x256 | A slime walk1 |
| `mon_slime_walk2` | assets/sprites/monsters/slime_walk2.png | 256x256 | A slime walk2 |
| `mon_bat_walk1` | assets/sprites/monsters/bat_walk1.png | 256x256 | A bat walk1 |
| `mon_bat_walk2` | assets/sprites/monsters/bat_walk2.png | 256x256 | A bat walk2 |
| `mon_mushroom_walk1` | assets/sprites/monsters/mushroom_walk1.png | 256x256 | A mushroom walk1 |
| `mon_mushroom_walk2` | assets/sprites/monsters/mushroom_walk2.png | 256x256 | A mushroom walk2 |
| `mon_wolf_walk1` | assets/sprites/monsters/wolf_walk1.png | 256x256 | A wolf walk1 |
| `mon_wolf_walk2` | assets/sprites/monsters/wolf_walk2.png | 256x256 | A wolf walk2 |
| `mon_imp_walk1` | assets/sprites/monsters/imp_walk1.png | 256x256 | A imp walk1 |
| `mon_imp_walk2` | assets/sprites/monsters/imp_walk2.png | 256x256 | A imp walk2 |
| `mon_skeleton_walk1` | assets/sprites/monsters/skeleton_walk1.png | 256x256 | A skeleton walk1 |
| `mon_skeleton_walk2` | assets/sprites/monsters/skeleton_walk2.png | 256x256 | A skeleton walk2 |
| `mon_demon_soldier_walk1` | assets/sprites/monsters/demon_soldier_walk1.png | 256x256 | A demon soldier walk1 |
| `mon_demon_soldier_walk2` | assets/sprites/monsters/demon_soldier_walk2.png | 256x256 | A demon soldier walk2 |
| `mon_imp_captain_walk1` | assets/sprites/monsters/imp_captain_walk1.png | 256x256 | A imp captain walk1 |
| `mon_imp_captain_walk2` | assets/sprites/monsters/imp_captain_walk2.png | 256x256 | A imp captain walk2 |
| `mon_demon_general_walk1` | assets/sprites/monsters/demon_general_walk1.png | 256x256 | A demon general walk1 |
| `mon_demon_general_walk2` | assets/sprites/monsters/demon_general_walk2.png | 256x256 | A demon general walk2 |
| `mon_great_dragon_walk1` | assets/sprites/monsters/great_dragon_walk1.png | 256x256 | A great dragon walk1 |
| `mon_great_dragon_walk2` | assets/sprites/monsters/great_dragon_walk2.png | 256x256 | A great dragon walk2 |
| `mon_elder_dragon_walk1` | assets/sprites/monsters/elder_dragon_walk1.png | 256x256 | A elder dragon walk1 |
| `mon_elder_dragon_walk2` | assets/sprites/monsters/elder_dragon_walk2.png | 256x256 | A elder dragon walk2 |

## 마을 사람 — 41장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
3/4 top-down view, full body, standing still and facing the camera, feet at the very bottom edge of the canvas. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. Friendly readable silhouette; the clothing colour is what players recognise them by, so keep one strong signature colour.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `npc_shopkeeper` | assets/sprites/npc/shopkeeper.png | 192x256 | A shopkeeper, one of the townsfolk of a small medieval fantasy town |
| `npc_blacksmith` | assets/sprites/npc/blacksmith.png | 192x256 | A blacksmith, one of the townsfolk of a small medieval fantasy town |
| `npc_innkeeper` | assets/sprites/npc/innkeeper.png | 192x256 | A innkeeper, one of the townsfolk of a small medieval fantasy town |
| `npc_villager` | assets/sprites/npc/villager.png | 192x256 | A townsfolk villager, one of the townsfolk of a small medieval fantasy town |
| `npc_elder` | assets/sprites/npc/elder.png | 192x256 | A village elder, one of the townsfolk of a small medieval fantasy town |
| `npc_gambler` | assets/sprites/npc/gambler.png | 192x256 | A old gem gambler, one of the townsfolk of a small medieval fantasy town |
| `npc_kid` | assets/sprites/npc/kid.png | 192x256 | A village child, one of the townsfolk of a small medieval fantasy town |
| `npc_guard` | assets/sprites/npc/guard.png | 192x256 | A town gate guard, one of the townsfolk of a small medieval fantasy town |
| `npc_king` | assets/sprites/npc/king.png | 192x256 | A king, one of the townsfolk of a small medieval fantasy town |
| `npc_alchemist` | assets/sprites/npc/alchemist.png | 192x256 | A alchemist, one of the townsfolk of a small medieval fantasy town |
| `npc_quest_board` | assets/sprites/npc/quest_board.png | 192x256 | A wooden quest board, one of the townsfolk of a small medieval fantasy town |
| `npc_waypoint` | assets/sprites/npc/waypoint.png | 192x256 | A standing waypoint stone, one of the townsfolk of a small medieval fantasy town |
| `npc_gate_merchant` | assets/sprites/npc/gate_merchant.png | 192x256 | A merchant camped at the gate, one of the townsfolk of a small medieval fantasy town |
| `npc_witch` | assets/sprites/npc/witch.png | 192x256 | A swamp witch, one of the townsfolk of a small medieval fantasy town |
| `npc_royal_smith` | assets/sprites/npc/royal_smith.png | 192x256 | A royal smith, one of the townsfolk of a small medieval fantasy town |
| `npc_shopkeeper_walk1` | assets/sprites/npc/shopkeeper_walk1.png | 192x256 | A shopkeeper walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_shopkeeper_walk2` | assets/sprites/npc/shopkeeper_walk2.png | 192x256 | A shopkeeper walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_blacksmith_walk1` | assets/sprites/npc/blacksmith_walk1.png | 192x256 | A blacksmith walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_blacksmith_walk2` | assets/sprites/npc/blacksmith_walk2.png | 192x256 | A blacksmith walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_innkeeper_walk1` | assets/sprites/npc/innkeeper_walk1.png | 192x256 | A innkeeper walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_innkeeper_walk2` | assets/sprites/npc/innkeeper_walk2.png | 192x256 | A innkeeper walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_villager_walk1` | assets/sprites/npc/villager_walk1.png | 192x256 | A villager walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_villager_walk2` | assets/sprites/npc/villager_walk2.png | 192x256 | A villager walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_elder_walk1` | assets/sprites/npc/elder_walk1.png | 192x256 | A elder walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_elder_walk2` | assets/sprites/npc/elder_walk2.png | 192x256 | A elder walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_gambler_walk1` | assets/sprites/npc/gambler_walk1.png | 192x256 | A gambler walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_gambler_walk2` | assets/sprites/npc/gambler_walk2.png | 192x256 | A gambler walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_kid_walk1` | assets/sprites/npc/kid_walk1.png | 192x256 | A kid walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_kid_walk2` | assets/sprites/npc/kid_walk2.png | 192x256 | A kid walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_guard_walk1` | assets/sprites/npc/guard_walk1.png | 192x256 | A guard walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_guard_walk2` | assets/sprites/npc/guard_walk2.png | 192x256 | A guard walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_king_walk1` | assets/sprites/npc/king_walk1.png | 192x256 | A king walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_king_walk2` | assets/sprites/npc/king_walk2.png | 192x256 | A king walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_alchemist_walk1` | assets/sprites/npc/alchemist_walk1.png | 192x256 | A alchemist walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_alchemist_walk2` | assets/sprites/npc/alchemist_walk2.png | 192x256 | A alchemist walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_gate_merchant_walk1` | assets/sprites/npc/gate_merchant_walk1.png | 192x256 | A gate merchant walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_gate_merchant_walk2` | assets/sprites/npc/gate_merchant_walk2.png | 192x256 | A gate merchant walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_witch_walk1` | assets/sprites/npc/witch_walk1.png | 192x256 | A witch walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_witch_walk2` | assets/sprites/npc/witch_walk2.png | 192x256 | A witch walk2, one of the townsfolk of a small medieval fantasy town |
| `npc_royal_smith_walk1` | assets/sprites/npc/royal_smith_walk1.png | 192x256 | A royal smith walk1, one of the townsfolk of a small medieval fantasy town |
| `npc_royal_smith_walk2` | assets/sprites/npc/royal_smith_walk2.png | 192x256 | A royal smith walk2, one of the townsfolk of a small medieval fantasy town |

## 물건 아이콘 — 71장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Single game inventory icon, one object only, floating centred with a small even margin on all four sides, seen from a slight 3/4 angle. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. No hand holding it, no pedestal, no text, no rarity frame, no glow border. It must still be recognisable shrunk to 1/4 size, so keep the silhouette simple and the local colour strong.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `item_wooden_sword` | assets/ui/items/wooden_sword.png | 128x128 | A wooden sword (weapon) — plain everyday craftsmanship, muted colours, no gems. |
| `item_iron_sword` | assets/ui/items/iron_sword.png | 128x128 | A iron sword (weapon) — decent craftsmanship, one small accent colour. |
| `item_flame_sword` | assets/ui/items/flame_sword.png | 128x128 | A flame sword (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_demon_blade` | assets/ui/items/demon_blade.png | 128x128 | A demon blade (weapon) — ornate, purple-arcane accents and engraved patterns. |
| `item_cloth_armor` | assets/ui/items/cloth_armor.png | 128x128 | A cloth armor (armor) — plain everyday craftsmanship, muted colours, no gems. |
| `item_leather_armor` | assets/ui/items/leather_armor.png | 128x128 | A leather armor (armor) — decent craftsmanship, one small accent colour. |
| `item_knight_armor` | assets/ui/items/knight_armor.png | 128x128 | A knight armor (armor) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_mail` | assets/ui/items/dragon_mail.png | 128x128 | A dragon mail (armor) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_swift_ring` | assets/ui/items/swift_ring.png | 128x128 | A swift ring (accessory, worn on the ring) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_power_ring` | assets/ui/items/power_ring.png | 128x128 | A power ring (accessory, worn on the ring) — ornate, purple-arcane accents and engraved patterns. |
| `item_potion` | assets/ui/items/potion.png | 128x128 | A potion (consumable) — plain everyday craftsmanship, muted colours, no gems. |
| `item_herb` | assets/ui/items/herb.png | 128x128 | A herb (material) — plain everyday craftsmanship, muted colours, no gems. |
| `item_magic_stone` | assets/ui/items/magic_stone.png | 128x128 | A glowing arcane stone (material) — decent craftsmanship, one small accent colour. |
| `item_demon_core` | assets/ui/items/demon_core.png | 128x128 | A dark demon core (material) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_slime_jelly` | assets/ui/items/slime_jelly.png | 128x128 | A blob of slime jelly (material) — plain everyday craftsmanship, muted colours, no gems. |
| `item_bat_fang` | assets/ui/items/bat_fang.png | 128x128 | A curved bat fang (material) — decent craftsmanship, one small accent colour. |
| `item_speed_potion` | assets/ui/items/speed_potion.png | 128x128 | A speed potion (consumable) — plain everyday craftsmanship, muted colours, no gems. |
| `item_club` | assets/ui/items/club.png | 128x128 | A club (weapon) — plain everyday craftsmanship, muted colours, no gems. |
| `item_leather_pauldron` | assets/ui/items/leather_pauldron.png | 128x128 | A leather pauldron (armor, worn on the shoulder) — decent craftsmanship, one small accent colour. |
| `item_steel_pauldron` | assets/ui/items/steel_pauldron.png | 128x128 | A steel pauldron (armor, worn on the shoulder) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_cloth_gloves` | assets/ui/items/cloth_gloves.png | 128x128 | A cloth gloves (armor, worn on the gloves) — plain everyday craftsmanship, muted colours, no gems. |
| `item_steel_gauntlet` | assets/ui/items/steel_gauntlet.png | 128x128 | A steel gauntlet (armor, worn on the gloves) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_leather_boots` | assets/ui/items/leather_boots.png | 128x128 | A leather boots (armor, worn on the boots) — plain everyday craftsmanship, muted colours, no gems. |
| `item_swift_boots` | assets/ui/items/swift_boots.png | 128x128 | A swift boots (armor, worn on the boots) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_leather_belt` | assets/ui/items/leather_belt.png | 128x128 | A leather belt (accessory, worn on the belt) — plain everyday craftsmanship, muted colours, no gems. |
| `item_mana_belt` | assets/ui/items/mana_belt.png | 128x128 | A mana belt (accessory, worn on the belt) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_wood_amulet` | assets/ui/items/wood_amulet.png | 128x128 | A wood amulet (accessory, worn on the necklace) — plain everyday craftsmanship, muted colours, no gems. |
| `item_guard_amulet` | assets/ui/items/guard_amulet.png | 128x128 | A guard amulet (accessory, worn on the necklace) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_short_bow` | assets/ui/items/short_bow.png | 128x128 | A short bow (weapon) — plain everyday craftsmanship, muted colours, no gems. |
| `item_hunting_bow` | assets/ui/items/hunting_bow.png | 128x128 | A hunting bow (weapon) — decent craftsmanship, one small accent colour. |
| `item_elven_bow` | assets/ui/items/elven_bow.png | 128x128 | A elven bow (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_gnarled_staff` | assets/ui/items/gnarled_staff.png | 128x128 | A gnarled staff (weapon) — plain everyday craftsmanship, muted colours, no gems. |
| `item_apprentice_staff` | assets/ui/items/apprentice_staff.png | 128x128 | A apprentice staff (weapon) — decent craftsmanship, one small accent colour. |
| `item_archmage_staff` | assets/ui/items/archmage_staff.png | 128x128 | A archmage staff (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_helm` | assets/ui/items/dragon_helm.png | 128x128 | A dragon helm (armor, worn on the helmet) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_pauldron` | assets/ui/items/dragon_pauldron.png | 128x128 | A dragon pauldron (armor, worn on the shoulder) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_useless_sword` | assets/ui/items/useless_sword.png | 128x128 | A bent and notched junk sword (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_knight_sword` | assets/ui/items/dragon_knight_sword.png | 128x128 | A dragon knight sword (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_knight_bow` | assets/ui/items/dragon_knight_bow.png | 128x128 | A dragon knight bow (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_knight_staff` | assets/ui/items/dragon_knight_staff.png | 128x128 | A dragon knight staff (weapon) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_magic_helm` | assets/ui/items/magic_helm.png | 128x128 | A magic helm (armor, worn on the helmet) — fine craftsmanship, blue-steel sheen and a small inlaid stone. Enchanted: a warm protective golden aura. |
| `item_cloth_hood` | assets/ui/items/cloth_hood.png | 128x128 | A cloth hood (armor, worn on the helmet) — plain everyday craftsmanship, muted colours, no gems. |
| `item_leather_cap` | assets/ui/items/leather_cap.png | 128x128 | A leather cap (armor, worn on the helmet) — decent craftsmanship, one small accent colour. |
| `item_knight_helm` | assets/ui/items/knight_helm.png | 128x128 | A knight helm (armor, worn on the helmet) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_rune_helm` | assets/ui/items/rune_helm.png | 128x128 | A rune helm (armor, worn on the helmet) — ornate, purple-arcane accents and engraved patterns. Enchanted: a warm protective golden aura. |
| `item_mega_potion` | assets/ui/items/mega_potion.png | 128x128 | A mega potion (consumable) — ornate, purple-arcane accents and engraved patterns. |
| `item_socket_drill` | assets/ui/items/socket_drill.png | 128x128 | A jeweller socket drill (material) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. |
| `item_frost_blade` | assets/ui/items/frost_blade.png | 128x128 | A frost blade (weapon) — ornate, purple-arcane accents and engraved patterns. Enchanted: pale blue frost creeping along it. |
| `item_storm_bow` | assets/ui/items/storm_bow.png | 128x128 | A storm bow (weapon) — ornate, purple-arcane accents and engraved patterns. Enchanted: crackling white-violet lightning. |
| `item_ember_staff` | assets/ui/items/ember_staff.png | 128x128 | A ember staff (weapon) — ornate, purple-arcane accents and engraved patterns. Enchanted: holy white-gold flame. |
| `item_rune_mail` | assets/ui/items/rune_mail.png | 128x128 | A rune mail (armor) — ornate, purple-arcane accents and engraved patterns. Enchanted: a warm protective golden aura. |
| `item_dragonslayer` | assets/ui/items/dragonslayer.png | 128x128 | A dragonslayer (weapon) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. Enchanted: pale blue frost creeping along it. |
| `item_skypiercer` | assets/ui/items/skypiercer.png | 128x128 | A skypiercer (weapon) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. Enchanted: crackling white-violet lightning. |
| `item_worldtree_staff` | assets/ui/items/worldtree_staff.png | 128x128 | A worldtree staff (weapon) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. Enchanted: holy white-gold flame. |
| `item_dragonscale_plate` | assets/ui/items/dragonscale_plate.png | 128x128 | A dragonscale plate (armor) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. Enchanted: a warm protective golden aura. |
| `item_rune_pauldron` | assets/ui/items/rune_pauldron.png | 128x128 | A rune pauldron (armor, worn on the shoulder) — ornate, purple-arcane accents and engraved patterns. Enchanted: a warm protective golden aura. |
| `item_rune_gauntlet` | assets/ui/items/rune_gauntlet.png | 128x128 | A rune gauntlet (armor, worn on the gloves) — ornate, purple-arcane accents and engraved patterns. Enchanted: heavy red-hot strength runes. |
| `item_rune_boots` | assets/ui/items/rune_boots.png | 128x128 | A rune boots (armor, worn on the boots) — ornate, purple-arcane accents and engraved patterns. Enchanted: streaks of pale green wind. |
| `item_rune_belt` | assets/ui/items/rune_belt.png | 128x128 | A rune belt (accessory, worn on the belt) — ornate, purple-arcane accents and engraved patterns. Enchanted: swirling violet arcane light. |
| `item_rune_amulet` | assets/ui/items/rune_amulet.png | 128x128 | A rune amulet (accessory, worn on the necklace) — ornate, purple-arcane accents and engraved patterns. Enchanted: a soft white blessing glow. |
| `item_greater_potion` | assets/ui/items/greater_potion.png | 128x128 | A greater potion (consumable) — fine craftsmanship, blue-steel sheen and a small inlaid stone. |
| `item_dragon_ring` | assets/ui/items/dragon_ring.png | 128x128 | A dragon ring (accessory, worn on the ring) — ornate, purple-arcane accents and engraved patterns. Enchanted: deep red dragon-blood veins glowing through it. |
| `item_gem_ruby` | assets/ui/items/gem_ruby.png | 128x128 | A gem ruby (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_sapphire` | assets/ui/items/gem_sapphire.png | 128x128 | A gem sapphire (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_emerald` | assets/ui/items/gem_emerald.png | 128x128 | A gem emerald (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_topaz` | assets/ui/items/gem_topaz.png | 128x128 | A gem topaz (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_amethyst` | assets/ui/items/gem_amethyst.png | 128x128 | A gem amethyst (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_onyx` | assets/ui/items/gem_onyx.png | 128x128 | A gem onyx (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_gem_diamond` | assets/ui/items/gem_diamond.png | 128x128 | A gem diamond (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_dragon_token` | assets/ui/items/dragon_token.png | 128x128 | A dragon-scale token (material) — ornate, purple-arcane accents and engraved patterns. |
| `item_dragon_gate_key` | assets/ui/items/dragon_gate_key.png | 128x128 | A ornate dragon gate key (material) — unmistakably legendary — gold filigree, glowing core, dramatic silhouette. |

## 전투 효과 — 6장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
A single combat effect shape on its own — a burst/streak of light and colour with nothing behind it. Centred, radiating outward, fading to nothing before the canvas edge. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. No character, no weapon, no background, no text.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `fx_slash` | assets/fx/fx_slash.png | 384x384 | a wide curved sword slash arc, white-hot core fading to pale gold |
| `fx_pierce` | assets/fx/fx_pierce.png | 384x384 | a straight sharp thrust streak, thin white core with cyan edges |
| `fx_magic` | assets/fx/fx_magic.png | 384x384 | a swirling arcane burst, violet #c58cff with white sparks |
| `fx_fire` | assets/fx/fx_fire.png | 384x384 | a blooming fire burst, orange-red core fading to smoke-less embers |
| `fx_impact` | assets/fx/fx_impact.png | 384x384 | a blunt radial impact starburst, pale grey-white shards |
| `fx_guard` | assets/fx/fx_guard.png | 384x384 | a hexagonal shield flare, pale blue #7cc4ff with a bright rim |

## 작은 표식 — 3장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Tiny flat emblem/badge, one simple symbol only, heavy shapes, no fine detail, because it is shown at 24x24 pixels. Subject fully isolated on a pure flat #00FF00 background (nothing else in frame), so the background can be keyed out to transparent. Do not crop any part of the subject. No text, no border ring.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `mark_warrior` | assets/ui/marks/warrior.png | 48x48 | a sword crossed over a shield |
| `mark_ranger` | assets/ui/marks/ranger.png | 48x48 | a drawn bow with one arrow |
| `mark_mage` | assets/ui/marks/mage.png | 48x48 | a staff topped with a glowing orb |

## 전투 배경 — 1장

**이 갈래의 형식 규칙** (아래 모든 장에 공통으로 붙는다)

```
Wide battle backdrop painted as scenery only — no characters, no creatures, no UI. The image fills the entire canvas edge to edge with no border, no frame, no margin. The bottom third is the ground the fighters stand on and must stay uncluttered and low-contrast; the interesting shapes belong in the upper two thirds. Slightly desaturated so that sprites drawn on top of it stand out.
```

| 키 | 파일 | 구울크기 | 무엇을 그리나 |
|---|---|---|---|
| `bg_battle_field` | assets/ui/battle_bg_field.png | 1280x960 | a grassy field on the edge of a forest under an open sky, distant hills |

