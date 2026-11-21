#!/usr/bin/env python3
"""
게임이 겹쳐 그리는 방식(src/core/BodyLook.js)을 그대로 흉내 내어 한 장을 만든다 — 층이 맞는지 눈으로 본다.

    python3 tools/body-compose-check.py m1 bstand 3 sword  → art/preview/compose-<몸>-<장면>-<등급>.png
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
ORDER = ['cape', 'base', 'armor', 'boots', 'belt', 'necklace', 'gloves', 'pads', 'helmet', 'weapon']


def compose(body, scene, tiers, kind):
    d = os.path.join(ROOT, 'assets', 'bodies', body)
    atlas = json.load(open(os.path.join(d, 'atlas.json')))
    size = 160 if scene in ('stand', 'walk1', 'walk2') else 320
    out = Image.new('RGBA', (size, size))
    for slot in ORDER:
        if slot == 'base':
            key = 'base'
        elif slot == 'weapon':
            if kind in (None, 'fist') or 'weapon' not in tiers:
                continue
            key = f'weapon_{kind}_{tiers["weapon"]}'
        elif slot == 'cape':
            t = tiers.get('shoulder')
            if t is None or t < 2:
                continue
            key = f'cape_{t}'
        elif slot == 'pads':
            if 'shoulder' not in tiers:
                continue
            key = f'pads_{tiers["shoulder"]}'
        else:
            if slot not in tiers:
                continue
            key = f'{slot}_{tiers[slot]}'
        m = atlas.get(key)
        if not m or scene not in m['rects']:
            continue
        x, y, w, h, ox, oy = m['rects'][scene]
        sheet = Image.open(os.path.join(d, f'{key}.webp')).convert('RGBA')
        out.alpha_composite(sheet.crop((x, y, x + w, y + h)), (ox, oy))
    return out


if __name__ == '__main__':
    body, scene, t = sys.argv[1], sys.argv[2], int(sys.argv[3])
    kind = sys.argv[4] if len(sys.argv) > 4 else 'sword'
    tiers = {s: t for s in ('armor', 'helmet', 'shoulder', 'gloves', 'boots', 'belt', 'necklace', 'weapon')}
    im = compose(body, scene, tiers, kind)
    p = os.path.join(ROOT, 'art', 'preview', f'compose-{body}-{scene}-{t}.png')
    im.save(p)
    print(p)
