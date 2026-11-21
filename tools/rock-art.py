#!/usr/bin/env python3
"""
바위 무더기 그림 (0.70.39) — 회색 바위 두 장 더(rock2 · rock3) · 화산 현무암 바위 석 장(basalt_rock · 2 · 3).

  python3 tools/rock-art.py             # → assets/tiles/*.png · manifest · painted.json
  python3 tools/rock-art.py --preview   # art/preview/rocks.png 만

── 왜 ──────────────────────────────────────────────────────
  들판의 막는 바위는 2×2 무더기다(MapSystem — "막는 것 = 크고 확실한 것"). 그런데 그림이 **한 장**이라
  똑같은 바위 넷이 바둑판처럼 줄 맞춰 섰다(뼈의 들판 · 서쪽 절벽에서 한눈에 보였다).
  화산 들판은 더 나빴다 — 바위 자리에 **현무암 바닥 칸**(tile_basalt, 제 바탕색이 있는 통짜 그림)을 찍어서
  돌마다 둘레에 잿더미와 다른 **네모난 바탕**이 비쳤다.

  그래서 바위를 석 장씩(모양 · 크기 · 이끼/불씨가 다르다) 만들고, FieldScene 이 무더기 안의 자리에 따라
  고르고 · 뒤집고 · 가운데로 당겨 **한 덩이로 붙은 바위 무더기**로 그린다. 바탕은 투명이다(잿더미가 그대로 비친다).

── 그림체 ──────────────────────────────────────────────────
  rock.png(0.70.22)와 같은 붓 — 짙은 테두리 · 깎인 면(왼쪽 위가 밝다) · 바닥에 옅은 그늘.
  4배(360px)로 그려 90px(게임 45px)로 줄인다.
"""
import json
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'tiles')
K = 4
S = 90 * K
OL = (32, 30, 36, 255)

GRAY = {'face': [(176, 180, 186), (150, 154, 162), (122, 126, 136), (98, 100, 112)], 'hi': (214, 218, 222), 'moss': (110, 150, 70)}
BASALT = {'face': [(84, 82, 98), (66, 64, 80), (52, 50, 64), (40, 38, 50)], 'hi': (128, 126, 150), 'ember': (255, 120, 40)}


def boulder(pal, seed, wide=1.0, tall=1.0, extra=None):
    """평평한 바닥에 앉은 둥근 돌 — 큰 면 셋(윗면 · 왼쪽 면 · 오른쪽 면)으로 깎는다(rock.png 와 같은 짜임)."""
    rng = random.Random(seed)
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([S * (.5 - .44 * wide), S * .84, S * (.5 + .44 * wide), S * .96], fill=(0, 0, 0, 120))
    im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(9)))
    j = lambda v: v + rng.uniform(-.035, .035)
    hw, top = .43 * wide, .9 - .7 * tall
    X = lambda u: S * (.5 + u * hw * 2)                  # u: -0.5 ~ 0.5
    Y = lambda v: S * (top + v * (.9 - top))             # v: 0(꼭대기) ~ 1(바닥)
    BL, LM, TL = (X(-.5), Y(1)), (X(j(-.42)), Y(j(.46))), (X(j(-.16)), Y(j(.05)))
    TR, RM, BR = (X(j(.16)), Y(j(0))), (X(j(.42)), Y(j(.4))), (X(.5), Y(1))
    P1 = (X(j(.06)), Y(j(.22)))                          # 세 면이 만나는 마루
    P2 = (X(j(.16)), Y(1))                               # 마루가 바닥에 닿는 곳
    P3 = (X(j(-.3)), Y(j(.6)))                           # 왼쪽 면의 작은 꺾임
    d = ImageDraw.Draw(im, 'RGBA')
    f = pal['face']
    d.polygon([TL, TR, P1], fill=f[0] + (255,))                     # 윗면 — 가장 밝다
    d.polygon([BL, LM, TL, P1, P3], fill=f[1] + (255,))             # 왼쪽 면
    d.polygon([BL, P3, P1, P2], fill=f[2] + (255,))                 # 왼쪽 아래 — 조금 어둡다
    d.polygon([P1, TR, RM, BR, P2], fill=f[3] + (255,))             # 오른쪽 면 — 그늘
    for a, b in ((TL, P1), (P1, TR), (P1, P2), (P1, P3), (P3, BL)):
        d.line([a, b], fill=(OL[0], OL[1], OL[2], 170), width=5)
    d.line([LM, TL, TR], fill=pal['hi'] + (255,), width=8, joint='curve')     # 왼쪽 위 모서리의 빛
    if extra == 'moss':
        mx0, my0 = (P3[0] + P2[0]) / 2, Y(.8)
        d.ellipse([mx0 - 30, my0 - 14, mx0 + 30, my0 + 14], fill=pal['moss'] + (235,))
        d.ellipse([mx0 - 20, my0 - 10, mx0 + 4, my0 + 2], fill=(150, 192, 96, 220))
    if extra == 'ember':                                 # 식다 만 틈의 불빛
        x0, y0 = P1[0] + 10, P1[1] + 30
        q = [(x0, y0)]
        for k in range(3):
            x0 += rng.uniform(8, 22)
            y0 += rng.uniform(14, 24)
            q.append((x0, y0))
        d.line(q, fill=(20, 14, 14, 255), width=11)
        d.line(q, pal['ember'] + (240,), width=4)
    d.line([BL, LM, TL, TR, RM, BR, BL], fill=OL, width=11, joint='curve')
    return im.resize((90, 90), Image.LANCZOS)


JOBS = {
    'rock2': (lambda: boulder(GRAY, 12, 1.0, .74, None), '바위 2 (넓적한 것)'),
    'rock3': (lambda: boulder(GRAY, 23, .84, .9, 'moss'), '바위 3 (이끼 낀 것)'),
    'basalt_rock': (lambda: boulder(BASALT, 31, .96, .92, 'ember'), '현무암 바위'),
    'basalt_rock2': (lambda: boulder(BASALT, 42, 1.0, .72, None), '현무암 바위 2 (넓적한 것)'),
    'basalt_rock3': (lambda: boulder(BASALT, 53, .84, .98, 'ember'), '현무암 바위 3'),
}


def main(names):
    written = []
    for n in names:
        JOBS[n][0]().save(os.path.join(OUT, f'{n}.png'), optimize=True)
        written.append(f'tiles/{n}.png')
    # manifest — 게임 쪽(src/data)과 서버가 내주는 사본(server/content) 둘 다
    for man_p in (os.path.join(ROOT, 'src', 'data', 'manifest.json'), os.path.join(ROOT, 'server', 'content', 'manifest.json')):
        if not os.path.exists(man_p):
            continue
        man = json.load(open(man_p, encoding='utf-8'))
        for n in names:
            key = f'tile_{n}'
            old = man.get(key, {})
            man[key] = {**old, 'src': f'assets/tiles/{n}.png', 'w': 45, 'h': 45, 'label': old.get('label') or JOBS[n][1]}
        with open(man_p, 'w', encoding='utf-8') as f:
            json.dump(man, f, ensure_ascii=False, indent=2)
            f.write('\n')
    p = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(p, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | set(written))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 바위 {len(written)}장')


def preview():
    names = ['rock'] + list(JOBS)
    out = Image.new('RGBA', (len(names) * 200, 220), (120, 112, 96, 255))
    for i, n in enumerate(names):
        im = Image.open(os.path.join(OUT, f'{n}.png')).convert('RGBA').resize((180, 180), Image.LANCZOS)
        out.alpha_composite(im, (i * 200 + 10, 20))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out.save(os.path.join(ROOT, 'art', 'preview', 'rocks.png'))
    print('✓ art/preview/rocks.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in JOBS] or list(JOBS)
    if '--preview' not in sys.argv:
        main(names)
    preview()
