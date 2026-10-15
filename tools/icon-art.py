#!/usr/bin/env python3
"""
아이템 그림(소지품 칸) 새 그림체로 (0.70.28).

  python3 tools/gear-art.py        # 장비 그림(먼저)
  python3 tools/icon-art.py        # → assets/ui/items/<아이템>.png (128×128)

── 무엇을 하나 ───────────────────────────────────────────────
  · **입는 장비**(무기 · 투구 · 갑옷 · 어깨 · 장갑 · 신발 · 벨트 · 목걸이)는 몸에 입혀지는 그 그림
    (art/gear)을 몸 없이 떼어 칸에 맞춘다. 그래서 소지품에서 본 모양 = 몸에 입은 모양이다.
    같은 등급의 다른 아이템(용린 갑옷 · 매직 투구 · 몽둥이 …)도 제 모양으로 나온다.
  · 그 밖의 것(물약 · 보석 · 재료 · 열쇠 · 반지)은 옛 그림에 **짙은 테두리**만 두른다 —
    사람 · 몬스터 · 지도 소품과 같은 선으로 맞추는 것이다(모양은 그대로).
    테두리를 이미 두른 그림은 다시 두르지 않는다(tools/painted.json 에 적어 둔다).
"""
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sp = importlib.util.spec_from_file_location('gear_showcase', os.path.join(ROOT, 'tools', 'gear-showcase.py'))
GS = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(GS)
GA = GS.GA

ITEMS = json.load(open(os.path.join(ROOT, 'src', 'data', 'items.json'), encoding='utf-8'))
APPEAR = json.load(open(os.path.join(ROOT, 'src', 'data', 'appearance.json'), encoding='utf-8'))
OUT = os.path.join(ROOT, 'assets', 'ui', 'items')
PAINTED = os.path.join(ROOT, 'tools', 'painted.json')
TIER = {'common': 0, 'uncommon': 1, 'rare': 2, 'epic': 3, 'legendary': 4}
SHAPE = {'club': 'sword', 'sword': 'sword', 'greatsword': 'sword', 'bow': 'bow', 'staff': 'staff'}
OL = (26, 18, 16)


def piece_for(item_id, d):
    slot = d.get('slot')
    if slot not in ('weapon', 'helmet', 'armor', 'shoulder', 'gloves', 'boots', 'belt', 'necklace'):
        return None
    v = GA.ITEM_VARIANTS.get(item_id)
    t = v[1] if v else TIER.get(d.get('rarity'), 0)
    if slot == 'weapon':
        shape = (APPEAR.get('weapon', {}).get(item_id) or {}).get('shape', 'sword')
        return GS.piece_image(SHAPE.get(shape, 'sword'), t)
    return GS.piece_image(slot, t)


def icon_from_piece(im):
    """칸 그림 — 둘레 여백 · 발밑 그늘 한 겹."""
    ic = GS.crop_fit(im, 116, 6)
    out = Image.new('RGBA', (128, 128))
    a = ic.split()[3].filter(ImageFilter.GaussianBlur(3))
    sh = Image.new('RGBA', ic.size, (0, 0, 0, 0))
    sh.putalpha(a.point(lambda v: int(v * .45)))
    out.alpha_composite(sh, (8, 10))
    out.alpha_composite(ic, (6, 6))
    return out


def outline(im, width=3):
    """옛 그림에 짙은 테두리 — 모양 둘레를 넓혀 뒤에 깐다."""
    a = np.asarray(im.split()[3])
    m = Image.fromarray((a > 40).astype(np.uint8) * 255)
    grown = m.filter(ImageFilter.MaxFilter(width * 2 + 1)).filter(ImageFilter.GaussianBlur(.6))
    back = Image.new('RGBA', im.size, OL + (0,))
    back.putalpha(grown)
    out = Image.new('RGBA', im.size)
    out.alpha_composite(back)
    out.alpha_composite(im)
    return out


def main():
    data = json.load(open(PAINTED, encoding='utf-8'))
    keep = set(data.get('keep', []))
    made, lined = 0, 0
    for item_id, d in ITEMS.items():
        if not isinstance(d, dict):
            continue
        path = os.path.join(OUT, f'{item_id}.png')
        rel = f'ui/items/{item_id}.png'
        pc = piece_for(item_id, d)
        if pc is not None:
            icon_from_piece(pc).save(path, optimize=True)
            keep.add(rel)
            made += 1
            continue
        if rel in keep or not os.path.exists(path):
            continue
        im = Image.open(path).convert('RGBA')
        outline(im).save(path, optimize=True)
        keep.add(rel)
        lined += 1
    data['keep'] = sorted(keep)
    with open(PAINTED, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 장비 그림 {made}장 · 테두리 두른 그림 {lined}장')
    # 0.70.29 — png 를 webp 로 묶는다(manifest 주소도)
    __import__('subprocess').run([sys.executable, os.path.join(ROOT, 'tools', 'pack-webp.py')], check=True)


if __name__ == '__main__':
    main()
