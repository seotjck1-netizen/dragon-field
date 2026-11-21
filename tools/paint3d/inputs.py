"""proj3d.py 에 넣을 그림을 게임 몸 그림 층에서 만든다(갑옷 한 벌 + 무기).

  python3 tools/paint3d/inputs.py WORK_DIR [--body m1] [--tier 2] [--weapon sword_2]

WORK_DIR 에 남는 것:
  k{tier}_front_160.png · k{tier}_back_160.png — 지금 게임의 앞(stand) · 뒤(stand_b) 장면 그대로(맨몸 + 갑옷 · 장화 · 장갑 · 어깨 · 띠 · 투구)
  k{tier}_front_960.png · k{tier}_back_960.png — 6배로 키운 것(입체에 입힐 바탕)
  sword_v.png — 무기 그림을 칼끝이 위로 서게 돌린 것(쥔 손가락은 지운다)
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = sys.argv[1:]
opt = lambda n, d: ARGS[ARGS.index(n) + 1] if n in ARGS else d
WORK = ARGS[0]
BODY = opt('--body', 'm1')
TIER = opt('--tier', '2')
WEAPON = opt('--weapon', 'sword_2')
os.makedirs(WORK, exist_ok=True)
D = json.load(open(os.path.join(ROOT, 'src/data/bodies.json')))
_cache = {}


def layer_img(k):
    if k not in _cache:
        _cache[k] = Image.open(os.path.join(ROOT, f'assets/bodies/{BODY}/{k}.webp')).convert('RGBA')
    return _cache[k]


def compose(scene, keys):
    """BodyLook 과 같은 규칙으로 층을 겹친다."""
    size = D['scenes'][scene]
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layers = D['bodies'][BODY]['layers']
    for k in keys:
        if k not in layers:
            continue
        r = layers[k]['rects'].get(scene) or layers[k]['rects'].get(D.get('sceneOf', {}).get(scene, ''))
        if not r:
            continue
        x, y, w, h, ox, oy = r
        im.alpha_composite(layer_img(k).crop((x, y, x + w, y + h)), (ox, oy))
    return im


keys = ['base'] + [f'{s}_{TIER}' for s in ('armor', 'boots', 'gloves', 'pads', 'belt', 'helmet')]
for scene, tag in (('stand', 'front'), ('stand_b', 'back')):
    im = compose(scene, keys)
    im.save(os.path.join(WORK, f'k{TIER}_{tag}_160.png'))
    im.resize((960, 960), Image.BICUBIC).save(os.path.join(WORK, f'k{TIER}_{tag}_960.png'))

# 무기 — 앞모습 장면의 칼 그림을 세운다
sw = compose('stand', [f'weapon_{WEAPON}'])
a = np.asarray(sw).astype(np.float32)
m = a[..., 3] > 100
ys, xs = np.nonzero(m)
x0, y0 = xs.min(), ys.min()
sw = sw.crop((x0 - 2, y0 - 2, xs.max() + 3, ys.max() + 3))
a = np.asarray(sw).astype(np.float32)
m = a[..., 3] > 100
ys, xs = np.nonzero(m)
tip = np.array([xs[ys.argmin()], ys.min()], float)       # 칼끝(맨 위)
pom = np.array([xs[ys.argmax()], ys.max()], float)       # 칼머리(맨 아래)
d = (tip - pom) / np.linalg.norm(tip - pom)
H, W = m.shape
yy, xx = np.mgrid[0:H, 0:W]
dist = np.abs((xx - pom[0]) * d[1] - (yy - pom[1]) * d[0])     # 칼 줄기에서 떨어진 거리
r, g, b = a[..., 0], a[..., 1], a[..., 2]
skin = (r > 170) & (r - b > 40) & ~((r > 200) & (g > 200) & (b > 200))
a[skin & (yy > H * 0.55) & (dist > 3.6), 3] = 0                # 칼자루 둘레의 쥔 손가락
sw = Image.fromarray(a.astype(np.uint8), 'RGBA')
ang = math.degrees(math.atan2(tip[0] - pom[0], pom[1] - tip[1]))
big = sw.resize((W * 6, H * 6), Image.BICUBIC).rotate(ang, resample=Image.BICUBIC, expand=True)
m = np.asarray(big)[..., 3] > 100
ys, xs = np.nonzero(m)
big.crop((xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5)).save(os.path.join(WORK, 'sword_v.png'))
print('inputs', WORK, keys, f'weapon_{WEAPON}', round(ang, 1))
