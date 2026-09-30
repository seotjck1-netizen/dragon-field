#!/usr/bin/env python3
"""
바닥 · 벽 타일 새 그림 (0.70.29) — 풀 · 흙길 · 물 · 벽돌 · 성벽 · 성 바닥 · 지하감옥 · 방 바닥 · 잿더미 · 황무지 · 용암.

  python3 tools/ground-art.py            # → assets/tiles/*.png (같은 이름 · 64×64 로 덮어쓴다)
  python3 tools/ground-art.py --preview  # art/preview/ground.png (타일을 3×3 으로 이어 붙인 모습)

── 그림체 ──────────────────────────────────────────────────
  사람 · 몬스터 · 소품은 짙은 테두리 + 셀 음영이다. 바닥은 테두리가 온통 그어지면 시끄러우므로
  **무늬만** 그 붓으로 그린다:
    · 풀     — 바탕 초록 위에 세 갈래 풀포기(짙은 줄기 + 밝은 끝), 드문드문 꽃 · 클로버 · 조약돌
    · 흙길   — 모래빛 바탕 + 테두리 두른 조약돌 + 잔 금
    · 물     — 깊은 곳은 짙게, 물마루는 밝은 호 + 흰 반짝임(두 장이 번갈아 물결이 움직인다)
    · 돌 · 벽돌 — 돌마다 밝기가 조금씩 다르고, **줄눈은 짙게**, 돌 윗변은 밝게 · 아랫변은 그늘
  바탕의 평균 색은 예전 타일과 같게 맞춘다 — 물가 · 풀 가장자리 같은 겹치는 조각(shore_* ·
  edge_grass_*)과 색이 어긋나지 않게.

── 이어 붙이기 ──────────────────────────────────────────────
  모든 타일은 **이음새가 없다** — 무늬를 그릴 때 가장자리를 넘는 것은 반대편에도 그린다(wrap),
  잡음도 둘레가 이어지는 잡음을 쓴다. 4배(256px)로 그려 64px 로 줄인다.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'tiles')
PAINTED = os.path.join(ROOT, 'tools', 'painted.json')
K = 4
S = 64 * K
OL = (40, 30, 24)


# ─────────────────────────────── 연장 ───────────────────────────────
def pnoise(size, cells, seed, octaves=4):
    """둘레가 이어지는 잡음 0~1 — 격자 값을 되풀이로 이어(wrap) 부드럽게 늘린다."""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = cells * 2 ** o
        g = rng.random((n, n)).astype(np.float32)
        big = np.tile(g, (3, 3))
        im = Image.fromarray((big * 255).astype(np.uint8)).resize((size * 3, size * 3), Image.BICUBIC)
        arr = np.asarray(im, np.float32)[size:2 * size, size:2 * size] / 255
        out += amp * arr
        tot += amp
        amp *= .5
    out /= tot
    lo, hi = out.min(), out.max()
    return (out - lo) / (hi - lo + 1e-6)


class Canvas:
    """wrap 되는 캔버스 — 도형을 가장자리 너머 반대편에도 그린다."""

    def __init__(self, base_rgb):
        self.im = Image.fromarray(np.clip(base_rgb, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
        self.d = ImageDraw.Draw(self.im, 'RGBA')

    def _each(self, pts):
        for dx in (-S, 0, S):
            for dy in (-S, 0, S):
                yield [(x + dx, y + dy) for x, y in pts]

    def poly(self, pts, fill=None, outline=None, width=1):
        for q in self._each(pts):
            self.d.polygon(q, fill=fill)
            if outline:
                self.d.line(q + [q[0]], fill=outline, width=width, joint='curve')

    def line(self, pts, fill, width):
        for q in self._each(pts):
            self.d.line(q, fill=fill, width=width, joint='curve')

    def ellipse(self, cx, cy, rx, ry, fill=None, outline=None, width=1):
        for dx in (-S, 0, S):
            for dy in (-S, 0, S):
                self.d.ellipse([cx - rx + dx, cy - ry + dy, cx + rx + dx, cy + ry + dy], fill=fill, outline=outline, width=width)

    def done(self):
        return self.im.convert('RGB').resize((64, 64), Image.LANCZOS)


def base(color, var, seed, cells=3, fine=.06):
    n = pnoise(S, cells, seed)
    f = pnoise(S, 16, seed + 1, 2)
    c = np.array(color, np.float32)
    img = c[None, None, :] * (1 + var * (n[..., None] - .5) * 2) * (1 + fine * (f[..., None] - .5) * 2)
    return img


def shade(c, k):
    return tuple(int(max(0, min(255, v * k))) for v in c[:3]) + ((c[3],) if len(c) > 3 else ())


# ─────────────────────────────── 풀 ───────────────────────────────
GRASS = (70, 160, 70)


def grass(v):
    rng = random.Random(100 + v)
    cv = Canvas(base(GRASS, .09, 10 + v, 3))
    dark, mid, lite, tip = (38, 110, 44, 255), (58, 140, 56, 255), (110, 196, 88, 255), (170, 232, 128, 255)
    # 옅은 얼룩 — 햇빛 드는 자리
    n = 9 + v
    for i in range(n):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        h = rng.uniform(20, 32)
        for k in (-1, 0, 1):
            ang = k * .45 + rng.uniform(-.12, .12)
            tx, ty = x + math.sin(ang) * h, y - math.cos(ang) * h
            cv.line([(x, y), ((x + tx) / 2 + k * 1.5, (y + ty) / 2), (tx, ty)], dark, 7)
            cv.line([(x + k * .6, y - 2), (tx, ty)], lite if k else mid, 3)
            cv.line([((x + tx * 2) / 3, (y + ty * 2) / 3), (tx, ty)], tip, 3)
    if v == 1:          # 꽃 몇 송이
        for i in range(3):
            x, y = rng.uniform(10, S - 10), rng.uniform(10, S - 10)
            col = rng.choice([(255, 250, 240, 255), (255, 214, 80, 255), (250, 150, 190, 255)])
            for j in range(5):
                a = j * 2 * math.pi / 5
                cv.ellipse(x + math.cos(a) * 5, y + math.sin(a) * 5, 4, 4, fill=col, outline=(90, 70, 50, 255), width=1)
            cv.ellipse(x, y, 3, 3, fill=(255, 200, 60, 255))
    if v == 2:          # 조약돌
        for i in range(2):
            x, y = rng.uniform(10, S - 10), rng.uniform(10, S - 10)
            cv.ellipse(x, y, 9, 6, fill=(150, 150, 142, 255), outline=(60, 62, 58, 255), width=3)
            cv.ellipse(x - 3, y - 2, 3, 2, fill=(210, 210, 200, 255))
    if v == 3:          # 클로버 무더기
        for i in range(3):
            x, y = rng.uniform(10, S - 10), rng.uniform(10, S - 10)
            for j in range(3):
                a = j * 2 * math.pi / 3 - math.pi / 2
                cv.ellipse(x + math.cos(a) * 6, y + math.sin(a) * 6, 6, 6, fill=(52, 128, 50, 255), outline=(30, 80, 34, 255), width=2)
    return cv.done()


# ─────────────────────────────── 흙길 ───────────────────────────────
PATH = (186, 152, 106)


def path(v):
    rng = random.Random(200 + v)
    img = base(PATH, .07, 20 + v, 3)
    spk = pnoise(S, 40, 30 + v, 1)
    img = img * (1 - .08 * (spk[..., None] > .7))
    cv = Canvas(img)
    for i in range(6):                   # 잔 금
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        pts = [(x, y)]
        for k in range(3):
            x += rng.uniform(-14, 14)
            y += rng.uniform(6, 14)
            pts.append((x, y))
        cv.line(pts, (140, 108, 70, 160), 2)
    for i in range(4 + v % 2):           # 테두리 두른 조약돌
        x, y = rng.uniform(8, S - 8), rng.uniform(8, S - 8)
        rx, ry = rng.uniform(10, 17), rng.uniform(7, 12)
        col = rng.choice([(168, 150, 124), (150, 138, 118), (176, 162, 140)])
        cv.ellipse(x, y + 2, rx + 1, ry, fill=(120, 92, 60, 120))
        cv.ellipse(x, y, rx, ry, fill=col + (255,), outline=(92, 72, 50, 255), width=3)
        cv.ellipse(x - rx * .3, y - ry * .35, rx * .35, ry * .3, fill=(226, 212, 186, 255))
    for i in range(10):
        cv.ellipse(rng.uniform(0, S), rng.uniform(0, S), 2, 2, fill=(130, 100, 64, 200))
    return cv.done()


# ─────────────────────────────── 물 ───────────────────────────────
WATER = (48, 120, 180)


def water(v):
    rng = random.Random(300)
    img = base(WATER, .1, 40, 2)
    cv = Canvas(img)
    shift = v * 32
    for row in range(4):
        y0 = row * 64 + 20
        for col in range(2):
            x0 = col * 128 + (row % 2) * 64 + shift + rng.uniform(-8, 8)
            pts = [(x0 + t * 60, y0 + math.sin(t * math.pi) * -10) for t in np.linspace(0, 1, 8)]
            cv.line([(x, y + 6) for x, y in pts], (30, 86, 140, 255), 6)       # 물마루 밑 그늘
            cv.line(pts, (140, 200, 240, 255), 5)
            cv.line(pts[2:6], (235, 248, 255, 255), 3)
    for i in range(5):
        x, y = rng.uniform(0, S) + shift, rng.uniform(0, S)
        cv.ellipse(x, y, 3, 2, fill=(220, 240, 255, 220))
    return cv.done()


# ─────────────────────────────── 돌 · 벽돌 ───────────────────────────────
def masonry(v, seed, rows, color, var, mortar, lite_k=1.25, dark_k=.62, width=(70, 130), crack=0, moss=0, cols_fixed=None, rnd=0):
    """돌을 켜켜이 — 켜마다 돌 너비가 다르고 이음이 어긋난다. 모두 wrap."""
    rng = random.Random(seed + v * 17)
    cv = Canvas(np.zeros((S, S, 3), np.float32) + np.array(mortar, np.float32))
    rh = S / rows
    tex = pnoise(S, 8, seed + v, 3)
    for r in range(rows):
        y0, y1 = r * rh, (r + 1) * rh
        x = rng.uniform(0, 60)
        start = x
        while x < start + S - 20:
            w = cols_fixed or rng.uniform(*width)
            if x + w > start + S - width[0] * .6:
                w = start + S - x
            k = 1 + rng.uniform(-var, var)
            col = shade(color, k)
            g = 3
            if rnd:
                # 둥근 돌(자갈 바닥) — 모서리를 깎은 여덟 모
                c_ = rnd
                pts = [(x + g + c_, y0 + g), (x + w - g - c_, y0 + g), (x + w - g, y0 + g + c_), (x + w - g, y1 - g - c_),
                       (x + w - g - c_, y1 - g), (x + g + c_, y1 - g), (x + g, y1 - g - c_), (x + g, y0 + g + c_)]
            else:
                pts = [(x + g, y0 + g), (x + w - g, y0 + g), (x + w - g, y1 - g), (x + g, y1 - g)]
            cv.poly(pts, fill=col + (255,))
            # 윗변 · 왼변 빛, 아랫변 · 오른변 그늘
            cv.line([(x + g + 2, y1 - g - 3), (x + g + 2, y0 + g + 2), (x + w - g - 3, y0 + g + 2)], shade(col, lite_k) + (255,), 4)
            cv.line([(x + g + 2, y1 - g - 2), (x + w - g - 2, y1 - g - 2), (x + w - g - 2, y0 + g + 3)], shade(col, dark_k) + (255,), 5)
            cv.poly(pts, outline=shade(mortar, .7) + (255,), width=2)
            if crack and rng.random() < crack:
                cx_, cy_ = x + w * rng.uniform(.3, .7), y0 + g + 4
                cv.line([(cx_, cy_), (cx_ + rng.uniform(-10, 10), cy_ + rh * .4), (cx_ + rng.uniform(-14, 14), y1 - g - 4)], OL + (200,), 2)
            if moss and rng.random() < moss:
                cv.ellipse(x + w * rng.uniform(.2, .8), y1 - g - 6, rng.uniform(10, 18), 6, fill=(90, 130, 60, 200))
            x += w
    im = np.asarray(cv.im.convert('RGB'), np.float32)
    im = im * (0.92 + 0.16 * tex[..., None])
    out = Image.fromarray(np.clip(im, 0, 255).astype(np.uint8), 'RGB')
    return out.resize((64, 64), Image.LANCZOS)


def planks(v):
    rng = random.Random(500 + v)
    cv = Canvas(np.zeros((S, S, 3), np.float32) + np.array([100, 66, 36], np.float32))
    rows = 4
    rh = S / rows
    for r in range(rows):
        y0, y1 = r * rh, (r + 1) * rh
        x = rng.uniform(0, 80)
        start = x
        while x < start + S - 10:
            w = rng.uniform(120, 200)
            if x + w > start + S - 60:
                w = start + S - x
            col = shade((172, 124, 76), 1 + rng.uniform(-.08, .08))
            pts = [(x + 2, y0 + 3), (x + w - 2, y0 + 3), (x + w - 2, y1 - 3), (x + 2, y1 - 3)]
            cv.poly(pts, fill=col + (255,))
            for k in range(3):
                yy = y0 + rh * (.25 + .25 * k) + rng.uniform(-3, 3)
                cv.line([(x + 8, yy), (x + w * .5, yy + rng.uniform(-3, 3)), (x + w - 8, yy)], shade(col, .85) + (200,), 2)
            cv.line([(x + 4, y0 + 6), (x + w - 6, y0 + 6)], shade(col, 1.2) + (255,), 3)
            cv.poly(pts, outline=(70, 44, 24, 255), width=3)
            cv.ellipse(x + 10, (y0 + y1) / 2, 3, 3, fill=(70, 50, 36, 255))
            x += w
    return cv.done()


# ─────────────────────────────── 잿더미 · 황무지 · 용암 ───────────────────────────────
def ash(v):
    rng = random.Random(600 + v)
    img = base((56, 48, 44), .14, 60 + v, 3)
    cv = Canvas(img)
    for i in range(18):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        cv.ellipse(x, y, rng.uniform(2, 5), rng.uniform(2, 4), fill=(34, 28, 26, 220))
    for i in range(1 + v % 3):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        cv.ellipse(x, y, 3, 3, fill=(255, 120, 40, 230))
        cv.ellipse(x, y, 7, 7, fill=(255, 90, 20, 60))
    if v in (2, 4):
        x, y = rng.uniform(30, S - 30), rng.uniform(30, S - 30)
        pts = [(x, y)]
        for k in range(4):
            x += rng.uniform(-20, 20)
            y += rng.uniform(10, 22)
            pts.append((x, y))
        cv.line(pts, (20, 14, 12, 255), 5)
        cv.line(pts, (255, 110, 30, 200), 2)
    return cv.done()


def waste(v):
    rng = random.Random(700 + v)
    img = base((136, 126, 100), .1, 70 + v, 3)
    cv = Canvas(img)
    for i in range(5):                  # 마른 금
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        pts = [(x, y)]
        for k in range(3):
            x += rng.uniform(-18, 18)
            y += rng.uniform(-18, 18)
            pts.append((x, y))
        cv.line(pts, (88, 78, 60, 220), 3)
    for i in range(3):                  # 마른 풀포기
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        for k in (-1, 0, 1):
            cv.line([(x, y), (x + k * 7, y - 14)], (120, 104, 60, 255), 3)
            cv.line([(x + k * 4, y - 7), (x + k * 7, y - 14)], (190, 172, 110, 255), 2)
    for i in range(2 + v % 2):
        x, y = rng.uniform(8, S - 8), rng.uniform(8, S - 8)
        cv.ellipse(x, y, 7, 5, fill=(150, 142, 124, 255), outline=(80, 72, 58, 255), width=3)
    return cv.done()


def magma():
    rng = random.Random(800)
    n = pnoise(S, 3, 81)
    hot = np.array([255, 150, 40], np.float32)
    deep = np.array([214, 70, 20], np.float32)
    img = deep[None, None, :] * (1 - n[..., None]) + hot[None, None, :] * n[..., None]
    cv = Canvas(img)
    for i in range(5):                 # 식은 껍질 조각
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        pts = [(x + math.cos(a) * rng.uniform(16, 30), y + math.sin(a) * rng.uniform(10, 22)) for a in np.linspace(0, 2 * math.pi, 7)[:-1]]
        cv.poly(pts, fill=(70, 30, 20, 255), outline=(30, 12, 8, 255), width=4)
        cv.line(pts[:3], (130, 60, 36, 255), 3)
    for i in range(6):
        x, y = rng.uniform(0, S), rng.uniform(0, S)
        cv.ellipse(x, y, 4, 3, fill=(255, 240, 180, 230))
    return cv.done()


JOBS = {
    'grass': lambda: grass(0), 'grass2': lambda: grass(1), 'grass3': lambda: grass(2), 'grass4': lambda: grass(3),
    'path': lambda: path(0), 'path2': lambda: path(1), 'path3': lambda: path(2), 'path4': lambda: path(3),
    'water': lambda: water(0), 'water2': lambda: water(1),
    # 'brick' 은 마을 광장의 **자갈 돌바닥**이다(붉은 벽돌이 아니다) — 크림빛 둥근 돌
    'brick': lambda: masonry(0, 11, 4, (200, 184, 158), .08, (150, 134, 112), width=(84, 124), rnd=8),
    'brick2': lambda: masonry(1, 11, 4, (200, 184, 158), .08, (150, 134, 112), width=(76, 130), rnd=8, crack=.08),
    'castle_wall': lambda: masonry(0, 21, 3, (142, 148, 168), .07, (86, 88, 104), width=(120, 170)),
    'castle_wall2': lambda: masonry(1, 21, 3, (142, 148, 168), .07, (86, 88, 104), width=(100, 150), crack=.12),
    'castle_wall3': lambda: masonry(2, 21, 3, (142, 148, 168), .07, (86, 88, 104), width=(130, 180), moss=.2),
    'castle_floor': lambda: masonry(0, 31, 2, (104, 110, 132), .06, (54, 56, 70), width=(120, 136)),
    'castle_floor2': lambda: masonry(1, 31, 2, (104, 110, 132), .06, (54, 56, 70), width=(110, 150), crack=.2),
    'dungeon_wall': lambda: masonry(0, 41, 3, (58, 56, 70), .1, (30, 28, 38), width=(110, 160), lite_k=1.35),
    'dungeon_wall2': lambda: masonry(1, 41, 3, (58, 56, 70), .1, (30, 28, 38), width=(100, 150), lite_k=1.35, crack=.25),
    'dungeon_wall3': lambda: masonry(2, 41, 3, (58, 56, 70), .1, (30, 28, 38), width=(120, 170), lite_k=1.35, moss=.25),
    'dungeon_floor': lambda: masonry(0, 51, 2, (66, 64, 78), .1, (30, 28, 36), width=(110, 140), lite_k=1.3),
    'dungeon_floor2': lambda: masonry(1, 51, 2, (66, 64, 78), .1, (30, 28, 36), width=(100, 150), lite_k=1.3, crack=.3),
    'room_floor': lambda: planks(0),
    'ash': lambda: ash(0), 'ash2': lambda: ash(1), 'ash3': lambda: ash(2), 'ash4': lambda: ash(3), 'ash5': lambda: ash(4),
    'waste': lambda: waste(0), 'waste2': lambda: waste(1), 'waste3': lambda: waste(2), 'waste4': lambda: waste(3), 'waste5': lambda: waste(4),
    'magma': magma,
}


def main(names):
    written = []
    for n in names:
        im = JOBS[n]()
        im.save(os.path.join(OUT, f'{n}.png'), optimize=True)
        written.append(f'tiles/{n}.png')
    data = json.load(open(PAINTED, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | set(written))
    with open(PAINTED, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 바닥 · 벽 타일 {len(written)}장')


def preview(names):
    T = 64
    cols = 6
    rows = (len(names) + cols - 1) // cols
    out = Image.new('RGB', (cols * T * 3 + (cols - 1) * 8, rows * T * 3 + (rows - 1) * 8), (20, 20, 24))
    for i, n in enumerate(names):
        im = Image.open(os.path.join(OUT, f'{n}.png')).convert('RGB')
        ox, oy = (i % cols) * (T * 3 + 8), (i // cols) * (T * 3 + 8)
        for a in range(3):
            for b in range(3):
                out.paste(im, (ox + a * T, oy + b * T))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out.save(os.path.join(ROOT, 'art', 'preview', 'ground.png'))
    print('✓ art/preview/ground.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in JOBS] or list(JOBS)
    if '--preview' not in sys.argv:
        main(names)
    preview(names)
