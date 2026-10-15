#!/usr/bin/env python3
"""
준 그림에서 **체크무늬 배경을 걷어 낸다** (0.70.26).

    python3 tools/ref-cut.py warrior ranger mage
      art/reference/<이름>_ref.png → art/reference/<이름>_ref_cut.png (투명 배경)

준 그림들은 투명 배경이 **체크무늬로 구워진** 그림이다(진짜 투명이 아니다).
가장자리에서부터 밝은 회색·흰색을 따라 채워 나가고, 검은 테두리에서 멈춘다.
두 번째로 한 번 더 — 발밑 그림자(회색)와, 그림자에 갇힌 다리 사이 체크무늬까지 걷는다.
게임은 제 그림자를 따로 그리므로 준 그림의 그림자는 필요 없다.
"""
import collections, os, sys
import numpy as np
import cv2
from PIL import Image

# 테두리 안에 **갇힌** 체크무늬 — 가장자리에서 채워 들어가서는 못 닿는다.
# (활대와 시위 사이 · 머리칼과 망토 사이 · 수정 발톱 사이) 눈으로 보고 한 점씩 짚는다.
POCKETS = {
    'ranger': [(560, 500), (600, 330), (612, 280), (540, 700), (520, 800), (230, 372), (575, 420), (504, 614), (490, 620), (492, 660), (498, 580), (486, 690)],
    'mage': [(165, 410), (172, 400), (166, 420), (160, 850), (595, 855), (596, 860), (598, 238), (688, 238)],
}

ROOT = os.path.join(os.path.dirname(__file__), '..')

def cut(name):
    src = os.path.join(ROOT, 'art', 'reference', f'{name}_ref.png')
    im = Image.open(src).convert('RGB'); W, H = im.size; px = im.load()

    def flood(ok, seeds, seen):
        q = collections.deque(seeds)
        while q:
            x, y = q.popleft()
            if x < 0 or y < 0 or x >= W or y >= H: continue
            i = y * W + x
            if seen[i] or not ok(px[x, y]): continue
            seen[i] = 1
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    def checker(c):
        return min(c) > 185 and max(c) - min(c) < 14
    def soft(c):   # 그림자 — 무채색이고 검은 테두리보다 밝다
        return max(c) - min(c) < 16 and (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) > 118

    seen = bytearray(W * H)
    edge = [(x, y) for x in range(W) for y in (0, H - 1)] + [(x, y) for y in range(H) for x in (0, W - 1)]
    flood(checker, edge, seen)
    first = [(i % W, i // W) for i in range(W * H) if seen[i]]
    seen2 = bytearray(seen)
    for i in range(W * H): seen2[i] = 0
    flood(lambda c: soft(c) or checker(c), first, seen2)
    pocket = bytearray(W * H)
    # ⚠ 갇힌 칸의 회색은 바깥보다 **어둡게** 구워진 곳이 있다(사냥꾼의 칼과 시위 사이는 132).
    #   밝은 것만 따라가면 흰 칸 하나에서 멈춘다 — 체크무늬는 대각선으로만 이어지기 때문이다.
    #   손으로 짚은 씨앗에서만, 테두리(어두움)보다 밝은 무채색이면 따라간다.
    flood(lambda c: max(c) - min(c) < 16 and (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) > 110,
          POCKETS.get(name, []), pocket)
    for i in range(W * H):
        if pocket[i]: seen[i] = 1
    out = im.convert('RGBA'); op = out.load()
    for i in range(W * H):
        if seen[i] or seen2[i]:
            op[i % W, i // W] = (0, 0, 0, 0)
    # 작은 부스러기(그림자의 짙은 점 · 테두리 밖 얼룩)는 버린다 — 사람과 이어진 덩어리만 남긴다
    a = (np.asarray(out)[..., 3] > 0).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(a, 8)
    keep = np.zeros(n, bool); keep[1:] = stats[1:, cv2.CC_STAT_AREA] > 800
    arr = np.asarray(out).copy(); arr[~keep[lab]] = 0
    out = Image.fromarray(arr, 'RGBA')
    dst = os.path.join(ROOT, 'art', 'reference', f'{name}_ref_cut.png')
    out.save(dst)
    print('✓', name, 'bbox', out.split()[3].getbbox())

for n in (sys.argv[1:] or ['warrior', 'ranger', 'mage']):
    cut(n)
