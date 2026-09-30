#!/usr/bin/env python3
"""
마을 사람 새 그림을 게임에 넣는다 (0.70.28).

  python3 tools/npc-art.py        # 먼저 그림을 그린다 → art/npc/*.png (320×320 한 칸)
  python3 tools/npc-game.py       # 그 그림을 게임 그림으로 옮긴다 → assets/sprites/npc/*.png

── 무엇을 하나 ───────────────────────────────────────────────
  · art/npc/<이름>.png · _walk1 · _walk2 를 **그대로**(미리보기 그대로) 184×184 로 줄여
    assets/sprites/npc/<게임 이름>.png 에 쓴다.
  · manifest 의 그림 크기를 92×92 로 바꾼다 — 새 몸(플레이어)과 **같은 배율**이다.
    (몸 그림 한 칸 320px = 들판 92칸. 마을 사람도 같은 칸에 같은 비율로 그렸으니 같은 크기로 선다.)
  · 지하감옥 간수는 지금까지 성문 위병 그림을 빌려 썼다. 제 그림(npc_warden)이 생겼다.
  · tools/painted.json 에 이 파일들을 적는다 — `npm run assets`(tools/gen-assets.js)가
    옛 SVG 그림으로 덮어쓰지 않게.

── 왜 60×80 이 아니라 92×92 인가 ──────────────────────────────
  옛 그림은 60×80 칸에 꽉 차게 그렸다(머리가 큰 3등신). 새 그림은 몸 그림과 같은 틀
  (가운데 아래에 사람)이라 양옆 · 위가 비어 있다. 60×80 으로 자르면 왕실 대장장이의 망치처럼
  옆으로 뻗은 소품이 잘린다. 틀째 쓰면 잘릴 것이 없고, 누르는 자리(FieldScene.npcAt)는
  몸 크기(60×80)로 그대로 둔다.
"""
import json
import sys
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'art', 'npc')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'npc')
MANIFEST = os.path.join(ROOT, 'src', 'data', 'manifest.json')
NPCS = os.path.join(ROOT, 'src', 'data', 'npcs.json')
PAINTED = os.path.join(ROOT, 'tools', 'painted.json')

SIZE = 184      # 그림 크기(px)
LOGICAL = 92    # 들판에서 그리는 크기 — BodyLook 의 들판 틀(80 × 1.15)과 같다

# 그림 이름(art/npc) → 게임 이름(assets/sprites/npc, manifest 는 npc_<게임 이름>)
MAP = {
    'shopkeeper': 'shopkeeper',
    'blacksmith': 'blacksmith',
    'royal_smith': 'royal_smith',
    'alchemist': 'alchemist',
    'innkeeper': 'innkeeper',
    'villager_elder': 'elder',
    'villager_kid': 'kid',
    'gate_guard': 'guard',
    'king': 'king',
    'gate_merchant': 'gate_merchant',
    'dungeon_warden': 'warden',
    'gem_gambler': 'gambler',
    'witch': 'witch',
    'waypoint_stone': 'waypoint',
}
LABELS = {'warden': '지하감옥 간수'}


def painted_add(paths):
    """gen-assets 가 건드리지 말아야 할 파일 목록에 더한다."""
    data = {'note': '', 'keep': []}
    if os.path.exists(PAINTED):
        data = json.load(open(PAINTED, encoding='utf-8'))
    data['note'] = ('새 그림체로 다시 그린 파일들. tools/gen-assets.js 는 이 파일을 굽지 않고 건너뛴다 '
                    '(옛 SVG 그림으로 덮어쓰지 않게). 이 목록은 tools/*-game.py 가 채운다.')
    keep = set(data.get('keep', []))
    keep.update(paths)
    data['keep'] = sorted(keep)
    with open(PAINTED, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main():
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    written = []
    for art, game in MAP.items():
        for tail in ('', '_walk1', '_walk2'):
            src = os.path.join(ART, f'{art}{tail}.png')
            if not os.path.exists(src):
                continue
            im = Image.open(src).convert('RGBA')
            assert im.size == (320, 320), (src, im.size)
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
            rel = f'sprites/npc/{game}{tail}.png'
            im.save(os.path.join(ROOT, 'assets', rel), optimize=True)
            written.append(rel)
            key = f'npc_{game}{tail}'
            old = manifest.get(key, {})
            label = old.get('label') or LABELS.get(game, game)
            if tail and not old:
                label = f"{LABELS.get(game, game)} — 걷기{tail[-1]}"
            manifest[key] = {**old, 'src': f'assets/{rel}', 'w': LOGICAL, 'h': LOGICAL, 'label': label}
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write('\n')
    # 간수는 이제 제 그림을 쓴다
    # (글자만 바꾼다 — 표를 통째로 다시 쓰면 손으로 맞춘 줄바꿈이 흐트러진다)
    text = open(NPCS, encoding='utf-8').read()
    at = text.find('"dungeon_warden"')
    if at >= 0:
        hit = text.find('"sprite": "npc_guard"', at)
        nxt = text.find('\n  "', at + 5)  # 다음 NPC 시작
        if hit >= 0 and (nxt < 0 or hit < nxt):
            text = text[:hit] + '"sprite": "npc_warden"' + text[hit + len('"sprite": "npc_guard"'):]
            open(NPCS, 'w', encoding='utf-8').write(text)
    painted_add(written)
    print(f'✓ 마을 사람 그림 {len(written)}장 → assets/sprites/npc (들판 {LOGICAL}×{LOGICAL})')
    # 0.70.29 — png 를 webp 로 묶는다(manifest 주소도)
    __import__('subprocess').run([sys.executable, os.path.join(ROOT, 'tools', 'pack-webp.py')], check=True)


if __name__ == '__main__':
    main()
