#!/usr/bin/env python3
"""
지도 소품 새 그림 (0.70.28) — 나무 · 덤불 · 바위 · 그루터기 · 통 · 표지판 · 울타리 · 꽃 · 풀.

  python3 tools/tile-art.py            # → assets/tiles/*.png (같은 이름 · 같은 크기로 덮어쓴다)
  python3 tools/tile-art.py --preview  # art/preview/tiles.png 만

── 왜 ────────────────────────────────────────────────────
  사람 · 몬스터는 이제 **짙은 테두리 + 세 단 명암(셀 음영)** 으로 그린다. 지도 소품은 테두리 없는
  둥근 도형이라, 사람 옆에 서면 종이 오린 무대 소품처럼 떠 보였다. 같은 붓으로 다시 그린다.
  바닥(풀 · 흙길 · 물)은 원래 테두리가 없는 것이 맞아서 그대로 둔다 — 테두리는 **서 있는 것**에만.

── 그리는 법 ───────────────────────────────────────────────
  그림 크기의 4배 캔버스에 SVG 로 그리고 줄인다. 테두리는 4배 캔버스에서 7px(게임에서 약 2px,
  사람 · 몬스터 테두리와 같은 굵기). 발밑 그림자는 예전처럼 그림에 넣는다(지도는 소품 그림자를 따로 안 깐다).
  tools/painted.json 에 적어 `npm run assets` 가 옛 그림으로 덮지 않게 한다.
"""
import importlib.util
import json
import math
import os
import random
import subprocess
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sp = importlib.util.spec_from_file_location('gear_art', os.path.join(ROOT, 'tools', 'gear-art.py'))
GA = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(GA)
OL = GA.OL
smooth_path, poly_path, clip, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.uid

K = 4          # 캔버스 배율
LW = 7         # 테두리(4배 캔버스)
OUT = os.path.join(ROOT, 'assets', 'tiles')
SVGDIR = os.path.join(ROOT, 'art', 'tiles', '_svg')

PAL = {
    'leaf':   ('#3f8f45', '#78c95e', '#2c6a36', '#1c4a28'),
    'leafY':  ('#6a9a38', '#a8cf58', '#4d7428', '#33501a'),
    'leafD':  ('#2f7a4a', '#5aae6a', '#215c38', '#143e26'),
    'bark':   ('#7a4f2e', '#a5714a', '#5a3820', '#3a2414'),
    'barkC':  ('#2b2320', '#4a3c36', '#1c1614', '#0e0a09'),
    'stone':  ('#8e939c', '#c5cad2', '#686d76', '#474b52'),
    'stoneW': ('#9aa4b4', '#d4dce8', '#727c8e', '#4e5666'),
    'wood':   ('#9a6a3e', '#c8955e', '#744c28', '#4c3018'),
    'woodL':  ('#d6b684', '#f0dcb0', '#b09060', '#806440'),
    'iron':   ('#6a6f78', '#9ca2ac', '#4c5058', '#30333a'),
    'moss':   ('#6a9a3a', '#9ccb5a', '#4a7228', '#30501a'),
    'berry':  ('#d8343c', '#ff7a70', '#a2222a', '#6a1418'),
    'grass':  ('#4f9a3e', '#8ad06a', '#3a782e', '#26521e'),
}


def _grads():
    out = ''
    for k, (b, lit, sh, dk) in PAL.items():
        out += (f'<linearGradient id="tg_{k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{lit}"/>'
                f'<stop offset=".4" stop-color="{b}"/><stop offset="1" stop-color="{sh}"/></linearGradient>')
        out += (f'<radialGradient id="tr_{k}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="{lit}"/>'
                f'<stop offset=".5" stop-color="{b}"/><stop offset="1" stop-color="{sh}"/></radialGradient>')
        out += (f'<linearGradient id="tv_{k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{lit}"/>'
                f'<stop offset=".45" stop-color="{b}"/><stop offset="1" stop-color="{sh}"/></linearGradient>')
    return out


TDEFS = _grads() + '<filter id="tblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'


def T(mat, kind='tg'):
    return f'url(#{kind}_{mat})'


def P(d, fill, w=LW, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{OL}" stroke-width="{w}" stroke-linejoin="round" {extra}/>'


def F(d, fill, op=1.0):
    return f'<path d="{d}" fill="{fill}" opacity="{op}"/>'


def L(d, color, w=4, op=1.0):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="{op}"/>'


def shade(d, mat, k=6, w=10, lit=.5, dk=.45):
    c = PAL[mat]
    return clip(uid('ts'), d, L(d, c[1], w, lit).replace('/>', f' transform="translate({k} {k})"/>')
                + L(d, c[3], w + 3, dk).replace('/>', f' transform="translate({-k} {-k})"/>'))


def solid(d, mat, kind='tr', w=LW, k=6, bw=10):
    return P(d, T(mat, kind), w) + shade(d, mat, k, bw) + L(d, OL, w)


def shadow(cx, cy, rx, ry, op=.28):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#10200e" opacity="{op}" filter="url(#tblur)"/>'


def blob(cx, cy, r, n=9, jag=.12, seed=0, sq=1.0):
    rng = random.Random(seed)
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + rng.uniform(-.12, .12)
        rr = r * (1 + rng.uniform(-jag, jag))
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr * sq))
    return smooth_path(pts, k=.45)


def leaf_clump(cx, cy, r, mat, seed):
    """잎 뭉치 — 둥근 덩이 + 위 왼쪽에 햇빛 받은 작은 잎 무더기 + 아래 그늘."""
    d = blob(cx, cy, r, 11, .1, seed)
    c = PAL[mat]
    s = P(d, T(mat, 'tr'))
    inner = F(blob(cx + r * .25, cy + r * .35, r * .8, 9, .15, seed + 1), c[2], .55)
    rng = random.Random(seed + 7)
    for i in range(5):
        a = rng.uniform(math.pi * 1.05, math.pi * 1.65)
        rr = r * rng.uniform(.3, .62)
        inner += F(blob(cx + math.cos(a) * rr, cy + math.sin(a) * rr, r * rng.uniform(.18, .28), 7, .2, seed + 10 + i), c[1], .8)
    for i in range(6):
        x, y = cx + rng.uniform(-r * .7, r * .7), cy + rng.uniform(-r * .6, r * .7)
        inner += L(f'M{x - 6} {y} q6 -8 12 0', c[3], 3, .45)
    s += clip(uid('lc'), d, inner)
    s += L(d, OL, LW)
    return s


def trunk(cx, top, base, w, mat='bark', roots=True):
    d = smooth_path([(cx - w * .45, top), (cx + w * .45, top), (cx + w * .55, base - 20), (cx + w * 1.1 if roots else cx + w * .6, base),
                     (cx - w * 1.1 if roots else cx - w * .6, base), (cx - w * .55, base - 20)], k=.25)
    s = P(d, T(mat, 'tv'))
    s += clip(uid('tk'), d, F(poly_path([(cx + w * .1, top), (cx + w, top), (cx + w, base), (cx + w * .15, base)]), PAL[mat][3], .45)
              + L(f'M{cx - w * .2} {top + 20} q-6 {(base - top) * .3} 4 {(base - top) * .6}', PAL[mat][3], 4, .7)
              + L(f'M{cx - w * .3} {top + 10} l0 {(base - top) * .5}', PAL[mat][1], 3, .5))
    s += L(d, OL, LW)
    return s


# ─────────────────────────────────────────────────────────────
# 소품들 — (이름, 그림 px 크기) → svg 속
# ─────────────────────────────────────────────────────────────
def tree_big(v):
    """큰 나무(56×72) — 줄기 + 잎 뭉치 여럿. v 로 모양을 바꾼다(둥근 · 높은 · 노란빛)."""
    W_, H_ = 112 * K, 144 * K
    cx, base = W_ / 2, H_ - 24
    s = ''       # 그늘은 따로 깐다(tile_tree_shade — FieldScene 의 TALL)
    mats = ['leaf', 'leafD', 'leafY'][v]
    s += trunk(cx, base - 250, base, 50)
    if v == 0:
        clumps = [(cx - 110, base - 310, 100), (cx + 110, base - 300, 100), (cx, base - 400, 125), (cx - 60, base - 230, 85), (cx + 70, base - 230, 85)]
    elif v == 1:
        clumps = [(cx - 90, base - 280, 95), (cx + 90, base - 290, 95), (cx - 40, base - 385, 100), (cx + 50, base - 400, 100), (cx, base - 455, 80)]
    else:
        clumps = [(cx - 130, base - 300, 100), (cx + 130, base - 300, 100), (cx - 60, base - 400, 120), (cx + 70, base - 410, 120), (cx, base - 250, 110)]
    order = sorted(clumps, key=lambda c: (c[1]))      # 위쪽 먼저 → 아래쪽이 덮는다
    for i, (x, y, r) in enumerate(order):
        s += leaf_clump(x, y, r, mats, 100 * v + i)
    if v == 2:
        rng = random.Random(9)
        for i in range(7):
            x, y = cx + rng.uniform(-170, 170), base - rng.uniform(220, 470)
            s += f'<circle cx="{x}" cy="{y}" r="11" fill="#e8483a" stroke="{OL}" stroke-width="4"/><circle cx="{x - 3}" cy="{y - 4}" r="3" fill="#ffd0c0"/>'
    return s, W_, H_


def charred_big(v):
    """타 버린 큰 나무 — 검은 줄기, 갈라진 가지, 불씨가 남은 끝."""
    W_, H_ = 112 * K, 144 * K
    cx, base = W_ / 2, H_ - 24
    s = trunk(cx, base - 330, base, 44, 'barkC')
    rng = random.Random(40 + v)
    branches = [(-1, 300, 200, -60), (1, 280, 190, -50), (-1, 380, 120, -80), (1, 400, 140, -70), (0, 460, 90, 0)]
    for (k, y0, ln, ang) in branches[: 4 + v % 2]:
        x0, yy0 = cx + k * 16, base - y0
        a = math.radians(-90 + k * (40 + rng.uniform(-10, 10)))
        x1, y1 = x0 + math.cos(a) * ln, yy0 + math.sin(a) * ln
        d = f'M{x0} {yy0} Q{(x0 + x1) / 2 + k * 20} {(yy0 + y1) / 2 + 20} {x1} {y1}'
        s += L(d, OL, 30) + L(d, PAL['barkC'][0], 18) + L(d, PAL['barkC'][1], 5, .6)
        s += f'<circle cx="{x1}" cy="{y1}" r="9" fill="#ff7a2a" opacity=".9"/><circle cx="{x1}" cy="{y1}" r="20" fill="#ff5a1a" opacity=".35" filter="url(#tblur)"/>'
    s += L(f'M{cx - 10} {base - 120} q20 -14 10 -40', '#ff8a3a', 5, .8)
    return s, W_, H_


def bush():
    W_, H_ = 64 * K, 64 * K
    cx, base = W_ / 2, H_ - 16
    s = shadow(cx, base - 4, 100, 22)
    for i, (x, y, r) in enumerate([(cx - 50, base - 60, 50), (cx + 50, base - 58, 50), (cx, base - 90, 62)]):
        s += leaf_clump(x, y, r, 'leaf', 300 + i)
    rng = random.Random(3)
    for i in range(5):
        x, y = cx + rng.uniform(-80, 80), base - rng.uniform(40, 130)
        s += f'<circle cx="{x}" cy="{y}" r="9" fill="{PAL["berry"][0]}" stroke="{OL}" stroke-width="3.5"/><circle cx="{x - 3}" cy="{y - 3}" r="2.5" fill="#ffd0d0"/>'
    return s, W_, H_


def rock(kind='stone', w=90):
    W_, H_ = w * K, w * K
    cx, base = W_ / 2, H_ - 20
    s = shadow(cx, base - 6, 130, 30)
    d = smooth_path([(cx - 140, base - 10), (cx - 120, base - 120), (cx - 40, base - 200), (cx + 60, base - 190), (cx + 130, base - 100), (cx + 140, base - 10)], k=.2)
    s += P(d, T(kind, 'tr'))
    c = PAL[kind]
    inner = F(poly_path([(cx + 10, base - 190), (cx + 140, base - 100), (cx + 150, base), (cx + 30, base)]), c[2], .7)
    inner += F(poly_path([(cx - 120, base - 120), (cx - 40, base - 200), (cx + 10, base - 190), (cx - 30, base - 110)]), c[1], .7)
    inner += L(f'M{cx - 30} {base - 110} L{cx + 10} {base - 190} M{cx - 30} {base - 110} L{cx + 30} {base} M{cx - 30} {base - 110} L{cx - 140} {base - 60}', c[3], 4, .7)
    inner += F(blob(cx - 60, base - 40, 40, 7, .2, 5, .5), PAL['moss'][0], .8) + F(blob(cx - 70, base - 50, 20, 6, .2, 6, .5), PAL['moss'][1], .8)
    s += clip(uid('rk'), d, inner) + L(d, OL, LW)
    return s, W_, H_


def stump(charred=False):
    W_, H_ = 86 * K, 86 * K
    cx, base = W_ / 2, H_ - 30
    mat = 'barkC' if charred else 'bark'
    s = shadow(cx, base - 4, 110, 26)
    d = smooth_path([(cx - 90, base - 150), (cx + 90, base - 150), (cx + 100, base - 30), (cx + 140, base), (cx - 140, base), (cx - 100, base - 30)], k=.25)
    s += P(d, T(mat, 'tv')) + clip(uid('st'), d, F(poly_path([(cx + 20, base - 150), (cx + 150, base - 150), (cx + 150, base), (cx + 30, base)]), PAL[mat][3], .45)) + L(d, OL, LW)
    top = f'M{cx - 90} {base - 150} a90 30 0 1 0 180 0 a90 30 0 1 0 -180 0'
    s += P(top, '#d6b07a' if not charred else '#2a1e1a')
    for r in (60, 36, 14):
        s += f'<ellipse cx="{cx}" cy="{base - 150}" rx="{r * 1.3}" ry="{r * .42}" fill="none" stroke="{"#9a7040" if not charred else "#ff6a2a"}" stroke-width="3.5" opacity=".8"/>'
    if not charred:
        s += F(blob(cx + 110, base - 30, 26, 6, .2, 8, .6), PAL['moss'][0], .9)
    return s, W_, H_


def barrel():
    W_, H_ = 84 * K, 84 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 110, 24)
    d = smooth_path([(cx - 100, base - 250), (cx + 100, base - 250), (cx + 118, base - 125), (cx + 100, base), (cx - 100, base), (cx - 118, base - 125)], k=.3)
    s += P(d, T('wood', 'tg'))
    inner = ''.join(L(f'M{cx + x} {base - 250} Q{cx + x * 1.15} {base - 125} {cx + x} {base}', PAL['wood'][3], 4, .7) for x in (-60, -20, 20, 60))
    inner += F(poly_path([(cx + 40, base - 260), (cx + 130, base - 260), (cx + 130, base), (cx + 40, base)]), PAL['wood'][3], .35)
    for y in (base - 215, base - 40):
        inner += L(f'M{cx - 130} {y} L{cx + 130} {y}', OL, 22) + L(f'M{cx - 130} {y} L{cx + 130} {y}', PAL['iron'][0], 14) + L(f'M{cx - 130} {y - 4} L{cx + 130} {y - 4}', PAL['iron'][1], 3, .8)
    s += clip(uid('br'), d, inner) + L(d, OL, LW)
    s += P(f'M{cx - 100} {base - 250} a100 26 0 1 0 200 0 a100 26 0 1 0 -200 0', T('woodL', 'tr'))
    return s, W_, H_


def signpost():
    W_, H_ = 92 * K, 92 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 70, 18)
    post = poly_path([(cx - 16, base - 200), (cx + 16, base - 200), (cx + 18, base), (cx - 18, base)])
    s += P(post, T('wood', 'tv'))
    board = smooth_path([(cx - 150, base - 320), (cx + 130, base - 320), (cx + 170, base - 270), (cx + 130, base - 220), (cx - 150, base - 220)], k=.05)
    s += P(board, T('woodL', 'tg')) + shade(board, 'woodL', 5, 8)
    for i, y in enumerate((base - 290, base - 258)):
        s += L(f'M{cx - 110} {y} L{cx + 80 - i * 40} {y}', PAL['wood'][3], 7)
    s += L(board, OL, LW)
    for x in (cx - 130, cx + 110):
        s += GA.rivet(x, base - 270, 7, 'iron')
    return s, W_, H_


def fence():
    W_, H_ = 64 * K, 64 * K
    s = ''
    for y in (H_ * .38, H_ * .62):
        rail = poly_path([(-10, y - 16), (W_ + 10, y - 16), (W_ + 10, y + 16), (-10, y + 16)])
        s += P(rail, T('wood', 'tv'))
    for x in (W_ * .2, W_ * .8):
        post = poly_path([(x - 20, H_ * .18), (x, H_ * .1), (x + 20, H_ * .18), (x + 20, H_ * .9), (x - 20, H_ * .9)])
        s += P(post, T('wood', 'tg')) + L(f'M{x - 8} {H_ * .22} L{x - 8} {H_ * .84}', PAL['wood'][1], 4, .6)
    return s, W_, H_


def flower():
    W_, H_ = 64 * K, 64 * K
    s = ''
    rng = random.Random(21)
    cols = [('#ff9ac0', '#ffe0ec'), ('#ffd84a', '#fff6c0'), ('#b89aff', '#ece0ff'), ('#8fd0ff', '#e0f4ff')]
    for i, (x, y) in enumerate([(70, 150), (150, 110), (190, 180), (110, 200)]):
        s += L(f'M{x} {y + 10} q-6 30 4 60', OL, 9) + L(f'M{x} {y + 10} q-6 30 4 60', PAL['grass'][0], 5)
        c, lc = cols[i % 4]
        for j in range(5):
            a = 2 * math.pi * j / 5
            s += f'<ellipse cx="{x + math.cos(a) * 14}" cy="{y + math.sin(a) * 14}" rx="12" ry="9" fill="{c}" stroke="{OL}" stroke-width="3.5" transform="rotate({math.degrees(a)} {x + math.cos(a) * 14} {y + math.sin(a) * 14})"/>'
        s += f'<circle cx="{x}" cy="{y}" r="8" fill="#ffcf3a" stroke="{OL}" stroke-width="3"/>'
    return s, W_, H_


def grass_tall():
    W_, H_ = 64 * K, 64 * K
    s = ''
    rng = random.Random(5)
    for i in range(9):
        x = 50 + i * 20 + rng.uniform(-6, 6)
        h = rng.uniform(110, 190)
        lean = rng.uniform(-40, 40)
        d = smooth_path([(x - 9, H_ - 20), (x + lean * .5, H_ - 20 - h * .6), (x + lean, H_ - 20 - h), (x + lean * .5 + 6, H_ - 20 - h * .55), (x + 9, H_ - 20)], k=.3)
        s += P(d, T('grass', 'tv'), 4.5)
    return s, W_, H_


def pebble():
    W_, H_ = 64 * K, 64 * K
    s = ''
    for (x, y, r) in [(80, 170, 22), (150, 190, 16), (190, 130, 12), (120, 120, 9)]:
        d = blob(x, y, r, 7, .15, int(x), .7)
        s += P(d, T('stone', 'tr'), 4) + F(blob(x - r * .3, y - r * .3, r * .35, 6, .2, int(y), .6), PAL['stone'][1], .8)
    return s, W_, H_


def tree_small(v):
    W_, H_ = 64 * K, 64 * K
    cx, base = W_ / 2, H_ - 14
    s = shadow(cx, base - 4, 80, 18)
    s += trunk(cx, base - 90, base, 26)
    mats = ['leaf', 'leafD', 'leafY'][v]
    for i, (x, y, r) in enumerate([(cx - 40, base - 120, 50), (cx + 40, base - 120, 50), (cx, base - 160, 62)]):
        s += leaf_clump(x, y, r, mats, 500 + 10 * v + i)
    return s, W_, H_


JOBS = {
    'tree_big': lambda: tree_big(0), 'tree_big2': lambda: tree_big(1), 'tree_big3': lambda: tree_big(2),
    'charred_big': lambda: charred_big(0), 'charred_big2': lambda: charred_big(1), 'charred_big3': lambda: charred_big(2),
    'tree': lambda: tree_small(0), 'tree2': lambda: tree_small(1), 'tree3': lambda: tree_small(2),
    'bush': bush, 'rock': lambda: rock('stone', 90), 'wind_rock': lambda: rock('stoneW', 90),
    'stump': lambda: stump(False), 'charred_stump': lambda: stump(True), 'barrel': barrel, 'signpost': signpost,
    'fence': fence, 'flower': flower, 'grass_tall': grass_tall, 'pebble': pebble,
}


def bake(names):
    os.makedirs(SVGDIR, exist_ok=True)
    jobs = []
    for n in names:
        body, w, h = JOBS[n]()
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
               f'<defs>{GA.DEFS}{TDEFS}</defs>{body}</svg>')
        sp = os.path.join(SVGDIR, f'{n}.svg')
        open(sp, 'w').write(svg)
        jobs.append({'svg': sp, 'out': os.path.join(SVGDIR, f'{n}.png'), 'w': w, 'h': h, 'name': n})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(jobs, open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env)
    written = []
    for j in jobs:
        final = os.path.join(OUT, f'{j["name"]}.png')
        old = Image.open(final).size if os.path.exists(final) else (j['w'] // K, j['h'] // K)
        im = Image.open(j['out']).convert('RGBA').resize(old, Image.LANCZOS)
        im.save(final, optimize=True)
        written.append(f'tiles/{j["name"]}.png')
    p = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(p, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | set(written))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 지도 소품 {len(written)}장')


def preview(names):
    ims = [Image.open(os.path.join(OUT, f'{n}.png')).convert('RGBA') for n in names]
    S = 150
    cols = 10
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGBA', (S * cols, S * rows), (104, 150, 86, 255))
    for i, im in enumerate(ims):
        out.alpha_composite(im, ((i % cols) * S + (S - im.width) // 2, (i // cols) * S + S - im.height - 4))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out.save(os.path.join(ROOT, 'art', 'preview', 'tiles.png'))
    print('✓ art/preview/tiles.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in JOBS] or list(JOBS)
    if '--preview' not in sys.argv:
        bake(names)
    preview(names)
