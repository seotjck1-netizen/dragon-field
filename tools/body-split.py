#!/usr/bin/env python3
"""
기본 몸 견본(두 사람이 한 장에) → 한 사람씩 768×1024 틀에 앉힌다 (0.70.26 미리보기).

    python3 tools/ref-cut.py base_clean base_rugged     # 체크무늬 배경 걷기
    python3 tools/body-split.py                         # → art/reference/body_<이름>.png

틀은 장비 그림(art/reference/*_ref.png)과 같은 768×1024 — 게임 그림(48×64)과 같은 3:4 다.
크기는 **그대로** 둔다(줄이지 않는다). 사람의 가운데를 x=384 에, 발바닥을 원래 높이에 둔다.
"""
import os
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'art', 'reference')
W, H = 768, 1024
PAIRS = {'base_clean': ('m1', 'f1'), 'base_rugged': ('m2', 'f2')}   # 왼쪽 사람, 오른쪽 사람
# 거친 차림(m2·f2)은 깨끗한 차림(m1·f1)과 **자세가 같다**. 뼈대 좌표를 같이 쓰려고 몸통·팔이
# 꼭 겹치게 옮긴다(발 모양이 달라 다리로 잰 가운데가 몇 점 어긋난다 — m2 는 7점).
ALIGN = {'m2': 'm1', 'f2': 'f1'}

for src, names in PAIRS.items():
    im = np.asarray(Image.open(os.path.join(REF, f'{src}_ref_cut.png')).convert('RGBA'))
    a = im[..., 3] > 0
    # 두 사람 사이 — 가운데 근처에서 **알파가 가장 적은 세로줄**
    cols = a.sum(0)
    mid = im.shape[1] // 2
    lo, hi = mid - 60, mid + 60
    cut = lo + int(np.argmin(cols[lo:hi]))
    for k, name in enumerate(names):
        part = im.copy()
        if k == 0:
            part[:, cut:] = 0
        else:
            part[:, :cut] = 0
        pa = part[..., 3] > 0
        ys, xs = np.where(pa)
        # 몸의 가운데 — 머리카락이 한쪽으로 뻗어도 흔들리지 않게 **다리(아래 1/4)** 로 잰다
        low = ys > ys.max() - (ys.max() - ys.min()) // 4
        cx = int(round((xs[low].min() + xs[low].max()) / 2))
        out = np.zeros((H, W, 4), np.uint8)
        dx = W // 2 - cx
        x0, x1 = max(0, -dx), min(im.shape[1], W - dx)
        out[:im.shape[0], x0 + dx:x1 + dx] = part[:, x0:x1]
        if name in ALIGN:
            ref = np.asarray(Image.open(os.path.join(REF, f'body_{ALIGN[name]}.png')))[..., 3] > 0
            box = (200, 340, 570, 690)         # 어깨~손 — 옷차림이 달라도 팔은 같다
            x0b, y0b, x1b, y1b = box
            P = ref[y0b:y1b, x0b:x1b]
            Q = out[..., 3] > 0
            best = max(((((P & Q[y0b + dy:y1b + dy, x0b + dx:x1b + dx]).sum()) /
                          max(1, (P | Q[y0b + dy:y1b + dy, x0b + dx:x1b + dx]).sum()), dx, dy)
                        for dy in range(-12, 13) for dx in range(-14, 15)))
            _, bx, by = best
            out = np.roll(out, (-by, -bx), (0, 1))
            print('  맞춤', name, '→', ALIGN[name], (-bx, -by), f'IoU {best[0]:.3f}')
        Image.fromarray(out, 'RGBA').save(os.path.join(REF, f'body_{name}.png'))
        print('✓', name, 'cut at', cut, 'center', cx, 'bbox', Image.fromarray(out).getbbox())
