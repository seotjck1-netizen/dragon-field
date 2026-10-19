#!/usr/bin/env python3
"""
포이노 마을 새 단장 (0.70.30) — 집 한 채를 **한 장**으로 · 광장 분수 · 가로등 · 우물 · 벤치 · 화단 · 장터 · 텃밭.

    python3 tools/town-art.py              # → assets/town/*.png · assets/tiles/*.png · manifest · painted
    python3 tools/town-art.py --preview    # art/preview/town-art.png 만

── 왜 ────────────────────────────────────────────────────
  0.70.29 까지 집은 **칸 그림을 이어 붙인 것**이었다 — 지붕 조각 · 벽 조각 · 문 · 간판이 32px 마다 되풀이되어
  같은 벽돌 지붕 · 같은 창이 줄지어 섰다(블록을 쌓은 것처럼 보였다). 사람 · 몬스터 · 소품은 새 붓으로 다시
  그렸는데 마을의 얼굴인 집만 옛 모습이었다.
  이제 집마다 **제 얼굴**이 있다:
    잡화점     크림색 회벽 + 짙은 나무 뼈대 · 붉은 기와 · 줄무늬 차양 · 자루 간판 · 문 앞 상자
    대장간     돌벽 · 검푸른 슬레이트 · 불씨가 튀는 큰 돌 굴뚝 · 벌겋게 달아오른 화덕 창 · 망치 간판 · 장작
    연금술사   연보랏빛 회벽 · 이끼 낀 초록 지붕(앞 박공) · 둥근 색유리 창 · 말린 약초 · 초록 연기 · 물약 간판
    여관       나무 널벽 · 푸른 지붕(앞 박공) · 둥근 창 · 문 옆 등불 · 침대 간판 · 꽃 상자
    살림집     크림색 회벽 · 짚 지붕 · 꽃 상자 · 작은 굴뚝
  모두 같은 붓(짙은 테두리 · 셀 음영 · 왼쪽 위 빛)이다. 문은 지도의 문 칸(<) 자리에 정확히 선다.

── 게임에 넣는 법 ────────────────────────────────────────────
  maps.json 의 지도에 `buildings: [{x, y, w, h, sprite}]` — 발자리(칸)의 왼쪽 위와 크기, 그림 이름.
  발자리 안의 칸(지붕 O · 벽 H · 문 < · 간판)은 **막힘 · 문 판정을 그대로** 쓰고, 그리는 것만 이 한 장이
  대신한다(FieldScene._groundLayer). 사람이 집 뒤에 서면 집 전체가 함께 비친다(한 무리).
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
_sp = importlib.util.spec_from_file_location('tile_art', os.path.join(ROOT, 'tools', 'tile-art.py'))
TA = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(TA)
GA = TA.GA
OL = GA.OL
smooth_path, poly_path, clip, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.uid
P, F, L, shade, solid, shadow, blob, T = TA.P, TA.F, TA.L, TA.shade, TA.solid, TA.shadow, TA.blob, TA.T
PAL = TA.PAL
K = 4
LW = 7
SVGDIR = os.path.join(ROOT, 'art', 'town', '_svg')
OUT_B = os.path.join(ROOT, 'assets', 'town')
OUT_T = os.path.join(ROOT, 'assets', 'tiles')

PAL.update({
    'plaster': ('#efe3c8', '#fff8e8', '#d8c8a6', '#b09c78'),
    'plasterL': ('#d9cce6', '#f3ecfa', '#b9a9cd', '#8e7ea6'),
    'timber': ('#6b4428', '#8f6038', '#4e2f1a', '#301c0e'),
    'roofR': ('#c8553c', '#f08c64', '#9a3a28', '#68241a'),
    'roofS': ('#56627a', '#8793ab', '#3f485c', '#282e3c'),
    'roofG': ('#3f8a72', '#6cc0a2', '#2c6652', '#1b4536'),
    'roofB': ('#4a6cab', '#7c9ed8', '#35508a', '#223866'),
    'thatch': ('#c9a257', '#eed28c', '#a07c38', '#6e5222'),
    'stoneB': ('#9c9b94', '#cbcac2', '#76756f', '#51504b'),
    'stoneD': ('#7d7c77', '#a8a7a0', '#5c5b57', '#3e3d3a'),
    'brickR': ('#a8543c', '#cf7c5e', '#80402c', '#58281a'),
    'glass': ('#9fd4f2', '#e8f7ff', '#6aa6cc', '#3e7298'),
    'glassP': ('#b894e6', '#eedcff', '#8a66c0', '#5c3e8e'),
    'shutG': ('#4f8a5a', '#77b582', '#386a42', '#23482b'),
    'shutB': ('#4a6fa8', '#76a0d8', '#344f80', '#223558'),
    'shutR': ('#a8423c', '#d06a60', '#80302b', '#58201c'),
    'plank': ('#a8743f', '#d29c5f', '#83592e', '#5c3d1c'),
    'plankD': ('#7e5634', '#a4764a', '#5e3e22', '#3e2814'),
    'gold': ('#e2b43c', '#ffe08a', '#b08420', '#7a5810'),
    'water': ('#3f9ad8', '#9ad8ff', '#2a74b4', '#1a4f84'),
    'ironL': ('#4c5260', '#7c8394', '#353a45', '#22262e'),
    'canvasR': ('#d24a3c', '#f07a64', '#a2342a', '#70221a'),
    'canvasW': ('#f2ead8', '#ffffff', '#d4c8ae', '#a89c80'),
    'canvasB': ('#3f78c0', '#6fa4e6', '#2c5890', '#1c3c66'),
    'soil': ('#7a5236', '#9c7050', '#5c3c24', '#3e2816'),
    'cabbage': ('#6cb04a', '#a6dc78', '#4c8834', '#2e5a1e'),
    'hay': ('#dcb85a', '#f6dc94', '#b8923a', '#806422'),
    'lamp': ('#ffd878', '#fff4c8', '#f0a83c', '#c07820'),
})
TA.TDEFS = (TA._grads()
            + '<filter id="tblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
            + '<filter id="glow12" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12"/></filter>'
            + '<filter id="soft3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>')
C = {k: v for k, v in PAL.items()}


def hx(mat, i=0):
    return PAL[mat][i]


def mix(a, b, t):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#%02x%02x%02x' % tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


# ═════════════════════════════════════════════════════════════
# 집 부품
# ═════════════════════════════════════════════════════════════
BW, BH = 768, 784          # 192×196 (게임) × 4 — 연기가 굴뚝 위로 올라갈 자리까지
TOPPAD = 112               # 그림 좌표 0 위로 둔 여유(굴뚝 연기) — viewBox 가 -112 에서 시작한다
GROUND = 672
WALL_TOP, WALL_BOT = 400, 640        # 벽 60px(게임) — 문(52px)이 사람(64px)과 어울리는 높이


def shingles(d_clip, y0, y1, x0, x1, mat, row=36, w=58, seed=1, round_=True):
    """기와 · 슬레이트 — 줄마다 반 칸씩 엇갈린 조각. 위(용마루 쪽)가 밝고 처마 쪽이 어둡다."""
    rng = random.Random(seed)
    c = PAL[mat]
    s = F(poly_path([(x0, y0), (x1, y0), (x1, y1), (x0, y1)]), c[2], 1)
    y = y0
    r = 0
    while y < y1 + row:
        t = (y - y0) / max(1, y1 - y0)
        base = mix(c[1], c[0], min(1, t * 1.6)) if t < .6 else mix(c[0], c[2], (t - .6) / .4)
        off = (w / 2) * (r % 2)
        x = x0 - w + off
        while x < x1 + w:
            tone = mix(base, '#000000', rng.uniform(0, .12)) if rng.random() < .5 else mix(base, '#ffffff', rng.uniform(0, .1))
            if round_:
                d = f'M{x:.1f} {y:.1f} L{x + w:.1f} {y:.1f} L{x + w:.1f} {y + row * .7:.1f} Q{x + w:.1f} {y + row + 6:.1f} {x + w / 2:.1f} {y + row + 6:.1f} Q{x:.1f} {y + row + 6:.1f} {x:.1f} {y + row * .7:.1f} Z'
            else:
                d = poly_path([(x, y), (x + w, y), (x + w - 2, y + row + 4), (x + 2, y + row + 4)])
            s += f'<path d="{d}" fill="{tone}" stroke="{c[3]}" stroke-width="3.2"/>'
            s += L(f'M{x + 8:.1f} {y + 8:.1f} L{x + w * .55:.1f} {y + 8:.1f}', c[1], 3, .45)
            x += w
        y += row
        r += 1
    return clip(uid('sg'), d_clip, s)


def thatch(d_clip, y0, y1, x0, x1, seed=3):
    """짚 지붕 — 줄마다 삐죽한 짚 끝, 가는 결."""
    rng = random.Random(seed)
    c = PAL['thatch']
    s = F(poly_path([(x0, y0), (x1, y0), (x1, y1), (x0, y1)]), c[0], 1)
    y = y0 + 10
    while y < y1 + 20:
        pts = [(x0 - 20, y - 30)]
        x = x0 - 20
        while x < x1 + 20:
            pts += [(x, y + rng.uniform(-4, 8)), (x + 14, y + rng.uniform(10, 22))]
            x += 28
        pts += [(x1 + 20, y - 30)]
        t = (y - y0) / max(1, (y1 - y0))
        s += F(poly_path(pts), mix(c[1], c[2], t), 1)
        for _ in range(26):
            xx = rng.uniform(x0, x1)
            s += L(f'M{xx:.1f} {y - 26:.1f} l{rng.uniform(-3, 3):.1f} 26', c[3], 2.4, .55)
        s += L(poly_path(pts[1:-1]).replace(' Z', ''), c[3], 3, .7)
        y += 40
    return clip(uid('th'), d_clip, s)


def roof_side(mat, x0=-14, x1=BW + 14, top=160, eave=WALL_TOP + 8, inset=34, kind='tile'):
    """용마루가 앞과 나란한 지붕 — 앞 비탈 하나가 보인다. 양옆 박공 널 · 용마루 기와 · 처마 그늘."""
    d = poly_path([(x0, eave), (x1, eave), (x1 - inset, top), (x0 + inset, top)])
    s = ''
    if kind == 'thatch':
        s += thatch(d, top, eave, x0, x1)
    else:
        s += shingles(d, top, eave, x0, x1, mat, round_=(kind == 'tile'), seed=sum(map(ord, mat)))
    # 처마 끝 — 두꺼운 널
    fas = poly_path([(x0 - 4, eave - 16), (x1 + 4, eave - 16), (x1 + 4, eave + 10), (x0 - 4, eave + 10)])
    s += P(fas, T('timber', 'tv'), 5)
    # 박공 널(양옆)
    for (a, b) in (((x0, eave), (x0 + inset, top)), ((x1, eave), (x1 - inset, top))):
        s += L(f'M{a[0]} {a[1]} L{b[0]} {b[1]}', OL, 26) + L(f'M{a[0]} {a[1]} L{b[0]} {b[1]}', hx('timber', 0), 16)
    # 용마루
    ridge = poly_path([(x0 + inset - 12, top + 10), (x1 - inset + 12, top + 10), (x1 - inset + 8, top - 18), (x0 + inset - 8, top - 18)])
    s += P(ridge, T(mat if kind != 'thatch' else 'thatch', 'tv'), 5)
    s += L(f'M{x0 + inset} {top - 10} L{x1 - inset} {top - 10}', hx(mat if kind != 'thatch' else 'thatch', 1), 4, .7)
    s += L(d, OL, LW)
    return s


def roof_gable(mat, facade_mat, cx=BW / 2, base=WALL_TOP + 8, apex=150, halfw=406, depth=118):
    """앞 박공 지붕 — 세모난 앞벽(박공)과 그 양옆으로 뒤로 물러나는 지붕 두 면."""
    s = ''
    L_ = (cx - halfw, base)
    R_ = (cx + halfw, base)
    A_ = (cx, apex)
    # 지붕 두 면(뒤로 물러난다 = 위로)
    left = poly_path([A_, L_, (L_[0], L_[1] - depth), (A_[0], A_[1] - depth)])
    right = poly_path([A_, R_, (R_[0], R_[1] - depth), (A_[0], A_[1] - depth)])
    s += shingles(left, apex - depth, base, L_[0], cx, mat, row=34, w=54, seed=5)
    s += clip(uid('rl'), left, F(left, '#ffffff', .08))
    s += L(left, OL, LW)
    s += shingles(right, apex - depth, base, cx, R_[0], mat, row=34, w=54, seed=6)
    s += clip(uid('rr'), right, F(right, '#000000', .22))
    s += L(right, OL, LW)
    # 용마루(가운데 위로)
    s += L(f'M{A_[0]} {A_[1]} L{A_[0]} {A_[1] - depth}', OL, 24) + L(f'M{A_[0]} {A_[1]} L{A_[0]} {A_[1] - depth}', hx(mat, 1), 12)
    # 박공 앞벽(세모)
    tri = poly_path([(max(0, L_[0]) + 6, base), (min(BW, R_[0]) - 6, base), (A_[0], A_[1] + 14),
                     (A_[0] - 6, A_[1] + 16), (L_[0] + 8 + (A_[0] - L_[0]) * 0, base)])
    tri = poly_path([L_, R_, A_])
    s += P(tri, T(facade_mat, 'tv'), 5)
    s += shade(tri, facade_mat, 6, 12)
    # 박공 널(세모 둘레)
    for a, b in ((L_, A_), (R_, A_)):
        s += L(f'M{a[0]} {a[1]} L{b[0]} {b[1]}', OL, 34) + L(f'M{a[0]} {a[1]} L{b[0]} {b[1]}', hx('timber', 0), 22)
        s += L(f'M{a[0]} {a[1] - 4} L{b[0]} {b[1] - 4}', hx('timber', 1), 4, .6)
    fas = poly_path([(L_[0] + 40, base - 12), (R_[0] - 40, base - 12), (R_[0] - 40, base + 12), (L_[0] + 40, base + 12)])
    s += P(fas, T('timber', 'tv'), 5)
    return s


def chimney(x, top, bot, w, mat='brickR', smoke=None, ember=False):
    s = ''
    d = poly_path([(x - w / 2, bot), (x + w / 2, bot), (x + w / 2, top), (x - w / 2, top)])
    s += P(d, T(mat, 'tv'), 5)
    inner = ''
    for i, y in enumerate(range(int(top) + 14, int(bot), 22)):
        inner += L(f'M{x - w / 2} {y} L{x + w / 2} {y}', hx(mat, 3), 3, .7)
        off = (i % 2) * w / 3
        for xx in (x - w / 2 + off + w / 6, x - w / 2 + off + w / 2 + w / 6):
            inner += L(f'M{xx:.1f} {y - 22} L{xx:.1f} {y}', hx(mat, 3), 3, .55)
    inner += F(poly_path([(x + w * .15, top), (x + w / 2, top), (x + w / 2, bot), (x + w * .15, bot)]), '#000000', .18)
    s += clip(uid('ch'), d, inner) + L(d, OL, 5)
    cap = poly_path([(x - w / 2 - 10, top - 18), (x + w / 2 + 10, top - 18), (x + w / 2 + 10, top + 4), (x - w / 2 - 10, top + 4)])
    s += P(cap, T('stoneD', 'tv'), 5)
    if ember:
        s += f'<ellipse cx="{x}" cy="{top - 18}" rx="{w * .45}" ry="10" fill="#ff8a2a" opacity=".9"/>'
        s += f'<circle cx="{x}" cy="{top - 40}" r="{w * .7}" fill="#ff7a1a" opacity=".35" filter="url(#glow12)"/>'
        rng = random.Random(4)
        for _ in range(7):
            ex, ey = x + rng.uniform(-40, 40), top - rng.uniform(40, 120)
            s += f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{rng.uniform(3, 6):.1f}" fill="#ffc050"/>'
    if smoke:
        col, op = smoke
        for i, (dx, dy, r) in enumerate([(0, -44, 22), (14, -84, 28), (-6, -128, 32), (18, -170, 26)]):
            s += f'<circle cx="{x + dx}" cy="{top + dy}" r="{r}" fill="{col}" opacity="{op - i * .12:.2f}"/>'
            s += f'<circle cx="{x + dx - r * .3}" cy="{top + dy - r * .3}" r="{r * .45}" fill="#ffffff" opacity="{(op - i * .12) * .5:.2f}"/>'
    return s


def wall_plaster(mat='plaster', posts=(10, 250, 518, 758), braces=((10, 250), (518, 758))):
    """회벽 + 나무 뼈대(기둥 · 들보 · 버팀대)."""
    d = poly_path([(0, WALL_TOP), (BW, WALL_TOP), (BW, WALL_BOT), (0, WALL_BOT)])
    s = P(d, T(mat, 'tv'), 5)
    rng = random.Random(9)
    inner = ''
    for _ in range(40):     # 회벽 얼룩 · 결
        x, y = rng.uniform(0, BW), rng.uniform(WALL_TOP, WALL_BOT)
        inner += f'<ellipse cx="{x:.0f}" cy="{y:.0f}" rx="{rng.uniform(8, 24):.0f}" ry="{rng.uniform(3, 7):.0f}" fill="{hx(mat, 2)}" opacity=".35"/>'
    s += clip(uid('wp'), d, inner)
    for a, b in braces:
        s += L(f'M{a} {WALL_BOT - 20} L{b} {WALL_TOP + 26}', OL, 22) + L(f'M{a} {WALL_BOT - 20} L{b} {WALL_TOP + 26}', hx('timber', 0), 13)
    for x in posts:
        s += P(poly_path([(x - 14, WALL_TOP), (x + 14, WALL_TOP), (x + 14, WALL_BOT), (x - 14, WALL_BOT)]), T('timber', 'tv'), 5)
        s += L(f'M{x - 6} {WALL_TOP + 8} L{x - 6} {WALL_BOT - 8}', hx('timber', 1), 3, .6)
    for y in (WALL_TOP + 12, WALL_BOT - 12):
        s += P(poly_path([(0, y - 12), (BW, y - 12), (BW, y + 12), (0, y + 12)]), T('timber', 'tv'), 5)
    return s


def wall_stone(mat='stoneB', seed=2):
    d = poly_path([(0, WALL_TOP), (BW, WALL_TOP), (BW, WALL_BOT), (0, WALL_BOT)])
    rng = random.Random(seed)
    s = F(d, hx(mat, 3), 1)
    y = WALL_TOP
    r = 0
    while y < WALL_BOT:
        h = rng.choice([34, 40, 46])
        x = -rng.uniform(0, 40)
        while x < BW:
            w = rng.uniform(56, 96)
            st = smooth_path([(x + 4, y + 4), (x + w - 4, y + 3), (x + w - 3, y + h - 3), (x + 3, y + h - 4)], k=.12)
            tone = mix(hx(mat, 0), '#ffffff' if rng.random() < .5 else '#000000', rng.uniform(0, .12))
            s += f'<path d="{st}" fill="{tone}" stroke="{OL}" stroke-width="3.5"/>'
            s += L(f'M{x + 10:.1f} {y + 9:.1f} L{x + w * .6:.1f} {y + 9:.1f}', hx(mat, 1), 3.5, .6)
            x += w
        y += h
        r += 1
    return clip(uid('ws'), d, s) + L(d, OL, 5)


def wall_planks(mat='plank'):
    d = poly_path([(0, WALL_TOP), (BW, WALL_TOP), (BW, WALL_BOT), (0, WALL_BOT)])
    rng = random.Random(7)
    s = P(d, T(mat, 'tv'), 5)
    inner = ''
    for y in range(WALL_TOP, WALL_BOT, 30):
        tone = mix(hx(mat, 0), '#000000', rng.uniform(0, .14))
        inner += F(poly_path([(0, y), (BW, y), (BW, y + 30), (0, y + 30)]), tone, 1)
        inner += L(f'M0 {y + 29} L{BW} {y + 29}', hx(mat, 3), 4)
        inner += L(f'M0 {y + 5} L{BW} {y + 5}', hx(mat, 1), 2.5, .5)
        for x in range(int(rng.uniform(40, 120)), BW, 160):
            inner += L(f'M{x} {y} L{x} {y + 30}', hx(mat, 3), 3, .7)
            inner += f'<circle cx="{x + 8}" cy="{y + 15}" r="3" fill="{hx("ironL", 2)}"/>'
    s += clip(uid('wk'), d, inner)
    for x in (12, BW - 12):
        s += P(poly_path([(x - 14, WALL_TOP), (x + 14, WALL_TOP), (x + 14, WALL_BOT), (x - 14, WALL_BOT)]), T('timber', 'tv'), 5)
    return s


def foundation(mat='stoneD'):
    d = poly_path([(-6, WALL_BOT - 4), (BW + 6, WALL_BOT - 4), (BW + 6, GROUND), (-6, GROUND)])
    rng = random.Random(11)
    s = F(d, hx(mat, 3), 1)
    x = -6
    while x < BW:
        w = rng.uniform(50, 80)
        s += f'<path d="{smooth_path([(x + 3, WALL_BOT), (x + w - 3, WALL_BOT), (x + w - 2, GROUND - 3), (x + 2, GROUND - 3)], k=.15)}" fill="{mix(hx(mat, 0), "#ffffff", rng.uniform(0, .15))}" stroke="{OL}" stroke-width="3.5"/>'
        x += w
    return clip(uid('fd'), d, s) + L(d, OL, 5)


def eave_shadow(y=WALL_TOP):
    return F(poly_path([(0, y), (BW, y), (BW, y + 26), (0, y + 30)]), '#000000', .28)


def door(cx, style='wood', arch=True, frame='timber'):
    top, bot = 432, WALL_BOT
    w = 96
    s = ''
    fr = smooth_path([(cx - w / 2 - 16, bot), (cx - w / 2 - 16, top + 40), (cx - w / 2, top), (cx + w / 2, top), (cx + w / 2 + 16, top + 40),
                      (cx + w / 2 + 16, bot)], k=.3 if arch else .02)
    s += P(fr, T(frame, 'tv'), 5)
    leaf = smooth_path([(cx - w / 2, bot), (cx - w / 2, top + 40), (cx - w / 2 + 14, top + 14), (cx + w / 2 - 14, top + 14), (cx + w / 2, top + 40),
                        (cx + w / 2, bot)], k=.3 if arch else .02)
    s += P(leaf, T('plank' if style == 'wood' else style, 'tv'), 5)
    inner = ''
    for x in (cx - w / 4, cx, cx + w / 4):
        inner += L(f'M{x} {top + 10} L{x} {bot}', hx('plank', 3), 4, .8)
    for y in (top + 56, bot - 34):
        inner += L(f'M{cx - w / 2} {y} L{cx + w / 2} {y}', OL, 12) + L(f'M{cx - w / 2} {y} L{cx + w / 2} {y}', hx('ironL', 1), 6)
    inner += F(poly_path([(cx + 10, top), (cx + w / 2, top), (cx + w / 2, bot), (cx + 10, bot)]), '#000000', .15)
    s += clip(uid('dr'), leaf, inner) + L(leaf, OL, 5)
    s += f'<circle cx="{cx + w / 2 - 20}" cy="{(top + bot) / 2 + 12}" r="9" fill="none" stroke="{OL}" stroke-width="6"/>'
    s += f'<circle cx="{cx + w / 2 - 20}" cy="{(top + bot) / 2 + 12}" r="9" fill="none" stroke="{hx("gold", 0)}" stroke-width="3"/>'
    # 문턱 돌
    s += P(poly_path([(cx - w / 2 - 24, bot - 6), (cx + w / 2 + 24, bot - 6), (cx + w / 2 + 30, GROUND - 2), (cx - w / 2 - 30, GROUND - 2)]), T('stoneB', 'tv'), 5)
    return s


def window(cx, cy=500, w=100, h=92, glass='glass', shutters='shutG', box=True, flowers=('#ff8ab0', '#ffd84a', '#b89aff'), round_=False):
    s = ''
    if round_:
        s += f'<circle cx="{cx}" cy="{cy}" r="{w / 2 + 12}" fill="{T("timber", "tr")}" stroke="{OL}" stroke-width="5"/>'
        s += f'<circle cx="{cx}" cy="{cy}" r="{w / 2}" fill="{T(glass, "tr")}" stroke="{OL}" stroke-width="5"/>'
        s += L(f'M{cx - w / 2} {cy} L{cx + w / 2} {cy} M{cx} {cy - w / 2} L{cx} {cy + w / 2}', hx('timber', 0), 7)
        s += L(f'M{cx - w * .3} {cy - w * .15} q{w * .12} {-w * .18} {w * .3} {-w * .2}', '#ffffff', 5, .7)
        return s
    x0, y0 = cx - w / 2, cy - h / 2
    if shutters:
        for k in (-1, 1):
            sx = cx + k * (w / 2 + 22)
            sh = poly_path([(sx - 20, y0 - 4), (sx + 20, y0 - 4), (sx + 20, y0 + h + 4), (sx - 20, y0 + h + 4)])
            s += P(sh, T(shutters, 'tv'), 5)
            for yy in range(int(y0 + 8), int(y0 + h), 14):
                s += L(f'M{sx - 14} {yy} L{sx + 14} {yy + 4}', hx(shutters, 3), 3, .8)
    fr = poly_path([(x0 - 10, y0 - 10), (x0 + w + 10, y0 - 10), (x0 + w + 10, y0 + h + 10), (x0 - 10, y0 + h + 10)])
    s += P(fr, T('timber', 'tv'), 5)
    gd = poly_path([(x0, y0), (x0 + w, y0), (x0 + w, y0 + h), (x0, y0 + h)])
    s += P(gd, T(glass, 'tg'), 4)
    s += clip(uid('gl'), gd, L(f'M{x0 + 10} {y0 + h * .7} L{x0 + w * .5} {y0 + 8}', '#ffffff', 10, .45)
              + L(f'M{x0 + w * .35} {y0 + h - 6} L{x0 + w * .8} {y0 + 12}', '#ffffff', 5, .35)
              + F(poly_path([(x0, y0 + h * .55), (x0 + w, y0 + h * .3), (x0 + w, y0 + h), (x0, y0 + h)]), '#1c2c46', .25))
    s += L(f'M{cx} {y0} L{cx} {y0 + h} M{x0} {cy} L{x0 + w} {cy}', hx('timber', 0), 7)
    s += L(fr, OL, 5)
    if box:
        by = y0 + h + 10
        rng = random.Random(int(cx))
        for i in range(7):
            fx = x0 - 6 + i * (w + 12) / 6
            fy = by - rng.uniform(4, 16)
            col = flowers[i % len(flowers)]
            s += f'<circle cx="{fx:.1f}" cy="{fy + 10:.1f}" r="13" fill="{hx("leaf", 0)}" stroke="{OL}" stroke-width="3"/>'
            for j in range(5):
                a = 2 * math.pi * j / 5 + i
                s += f'<circle cx="{fx + math.cos(a) * 7:.1f}" cy="{fy + math.sin(a) * 7:.1f}" r="6" fill="{col}" stroke="{OL}" stroke-width="2"/>'
            s += f'<circle cx="{fx:.1f}" cy="{fy:.1f}" r="3.5" fill="#fff2a0"/>'
        bx = poly_path([(x0 - 16, by), (x0 + w + 16, by), (x0 + w + 10, by + 28), (x0 - 10, by + 28)])
        s += P(bx, T('plankD', 'tv'), 5) + L(f'M{x0 - 12} {by + 10} L{x0 + w + 12} {by + 10}', hx('plankD', 1), 3, .6)
    return s


def sign_board(x, icon, y=440, w=108, h=76):
    """벽에서 뻗은 쇠 팔에 매단 간판."""
    s = L(f'M{x - w / 2 - 20} {y - 34} L{x + w / 2 + 6} {y - 34}', OL, 14) + L(f'M{x - w / 2 - 20} {y - 34} L{x + w / 2 + 6} {y - 34}', hx('ironL', 1), 7)
    s += L(f'M{x - w / 2 - 20} {y - 34} q20 30 50 30', OL, 8)
    for xx in (x - w / 3, x + w / 3):
        s += L(f'M{xx} {y - 34} L{xx} {y}', OL, 5)
    b = poly_path([(x - w / 2, y), (x + w / 2, y), (x + w / 2, y + h), (x - w / 2, y + h)])
    s += P(b, T('plank', 'tg'), 5) + shade(b, 'plank', 4, 8)
    s += P(poly_path([(x - w / 2 + 8, y + 8), (x + w / 2 - 8, y + 8), (x + w / 2 - 8, y + h - 8), (x - w / 2 + 8, y + h - 8)]), 'none', 3)
    cx, cy = x, y + h / 2
    s += ICON[icon](cx, cy)
    return s


def icon_bag(cx, cy):
    d = smooth_path([(cx - 26, cy + 22), (cx - 30, cy - 2), (cx - 14, cy - 18), (cx + 14, cy - 18), (cx + 30, cy - 2), (cx + 26, cy + 22)], k=.3)
    return P(d, T('hay', 'tr'), 4) + L(f'M{cx - 16} {cy - 16} L{cx + 16} {cy - 16}', OL, 6) + f'<circle cx="{cx}" cy="{cy + 4}" r="7" fill="{hx("gold", 0)}" stroke="{OL}" stroke-width="3"/>'


def icon_hammer(cx, cy):
    s = L(f'M{cx - 22} {cy + 24} L{cx + 16} {cy - 14}', OL, 12) + L(f'M{cx - 22} {cy + 24} L{cx + 16} {cy - 14}', hx('plank', 0), 6)
    head = poly_path([(cx + 2, cy - 30), (cx + 34, cy - 2), (cx + 22, cy + 10), (cx - 10, cy - 18)])
    s += P(head, T('ironL', 'tv'), 4)
    anv = poly_path([(cx - 34, cy + 6), (cx - 4, cy + 6), (cx - 10, cy + 16), (cx - 26, cy + 16)])
    return P(anv, T('ironL', 'tv'), 3.5) + s


def icon_flask(cx, cy):
    d = smooth_path([(cx - 8, cy - 26), (cx + 8, cy - 26), (cx + 8, cy - 8), (cx + 26, cy + 18), (cx + 18, cy + 26), (cx - 18, cy + 26),
                     (cx - 26, cy + 18), (cx - 8, cy - 8)], k=.2)
    liq = smooth_path([(cx - 20, cy + 8), (cx + 20, cy + 8), (cx + 24, cy + 18), (cx + 17, cy + 24), (cx - 17, cy + 24), (cx - 24, cy + 18)], k=.3)
    return (P(d, '#e8f6ff', 4) + P(liq, '#62d46a', 3) + f'<circle cx="{cx - 6}" cy="{cy + 14}" r="4" fill="#d8ffd0"/>'
            + P(poly_path([(cx - 11, cy - 32), (cx + 11, cy - 32), (cx + 11, cy - 24), (cx - 11, cy - 24)]), T('plank', 'tv'), 3))


def icon_bed(cx, cy):
    s = P(poly_path([(cx - 32, cy + 16), (cx + 32, cy + 16), (cx + 32, cy + 4), (cx - 32, cy + 4)]), T('shutR', 'tv'), 4)
    s += P(poly_path([(cx - 34, cy - 18), (cx - 26, cy - 18), (cx - 26, cy + 24), (cx - 34, cy + 24)]), T('plankD', 'tv'), 3.5)
    s += P(smooth_path([(cx - 24, cy + 4), (cx - 24, cy - 8), (cx - 6, cy - 8), (cx - 6, cy + 4)], k=.3), '#ffffff', 3.5)
    s += L(f'M{cx + 10} {cy - 20} l8 0 l-8 8 l8 0', OL, 3.5)
    return s


ICON = {'bag': icon_bag, 'hammer': icon_hammer, 'flask': icon_flask, 'bed': icon_bed}


def crates(x, y, n=2):
    s = ''
    for i in range(n):
        cx, cy = x + i * 58, y - (i % 2) * 0
        d = poly_path([(cx - 30, cy - 56), (cx + 30, cy - 56), (cx + 30, cy), (cx - 30, cy)])
        s += P(d, T('plank', 'tv'), 5) + L(f'M{cx - 30} {cy - 56} L{cx + 30} {cy} M{cx + 30} {cy - 56} L{cx - 30} {cy}', hx('plank', 3), 5, .8)
        s += L(d, OL, 5)
    return s


def sacks(x, y):
    s = ''
    for i, (dx, sc) in enumerate(((0, 1), (40, .85))):
        cx = x + dx
        d = smooth_path([(cx - 26 * sc, y), (cx - 30 * sc, y - 40 * sc), (cx - 12 * sc, y - 62 * sc), (cx + 12 * sc, y - 62 * sc), (cx + 30 * sc, y - 40 * sc), (cx + 26 * sc, y)], k=.35)
        s += P(d, T('hay', 'tr'), 4.5) + L(f'M{cx - 12 * sc} {y - 58 * sc} L{cx + 12 * sc} {y - 58 * sc}', OL, 5)
    return s


def awning(x0, x1, y, drop=64, cols=('canvasR', 'canvasW')):
    s = ''
    n = 8
    w = (x1 - x0) / n
    for i in range(n):
        xa, xb = x0 + i * w, x0 + (i + 1) * w
        d = poly_path([(xa + 6, y), (xb + 6, y), (xb, y + drop), (xa, y + drop)])
        s += P(d, T(cols[i % 2], 'tv'), 4)
        s += P(f'M{xa} {y + drop} Q{(xa + xb) / 2} {y + drop + 22} {xb} {y + drop} Z', T(cols[i % 2], 'tv'), 4)
    s += L(f'M{x0 + 6} {y} L{x1 + 6} {y}', OL, 10) + L(f'M{x0 + 6} {y} L{x1 + 6} {y}', hx('ironL', 1), 5)
    return s


def lantern(x, y):
    s = f'<circle cx="{x}" cy="{y + 26}" r="46" fill="#ffc860" opacity=".45" filter="url(#glow12)"/>'
    s += L(f'M{x - 30} {y - 16} L{x} {y - 16} L{x} {y}', OL, 6)
    box = poly_path([(x - 18, y), (x + 18, y), (x + 14, y + 48), (x - 14, y + 48)])
    s += P(box, '#ffe79a', 4.5) + f'<circle cx="{x}" cy="{y + 26}" r="9" fill="#fff6d0"/>'
    s += P(poly_path([(x - 24, y), (x + 24, y), (x + 12, y - 12), (x - 12, y - 12)]), T('ironL', 'tv'), 4)
    s += P(poly_path([(x - 16, y + 48), (x + 16, y + 48), (x + 10, y + 56), (x - 10, y + 56)]), T('ironL', 'tv'), 4)
    return s


def herbs(x0, x1, y):
    s = L(f'M{x0} {y} L{x1} {y}', OL, 4)
    rng = random.Random(3)
    x = x0 + 16
    while x < x1 - 10:
        h = rng.uniform(26, 40)
        col = rng.choice(['#6aa04a', '#8fbf5a', '#b08a4a', '#9a5aa8'])
        s += L(f'M{x} {y} L{x} {y + 8}', OL, 3)
        s += P(smooth_path([(x - 9, y + 8), (x + 9, y + 8), (x + 4, y + h), (x - 4, y + h)], k=.3), col, 3)
        x += rng.uniform(22, 30)
    return s


def woodpile(x, y):
    s = ''
    for r in range(3):
        for i in range(4 - r):
            cx, cy = x + i * 34 + r * 17, y - 16 - r * 30
            s += f'<circle cx="{cx}" cy="{cy}" r="16" fill="{T("plank", "tr")}" stroke="{OL}" stroke-width="4"/>'
            s += f'<circle cx="{cx}" cy="{cy}" r="8" fill="none" stroke="{hx("plank", 3)}" stroke-width="3"/>'
    return s


# ═════════════════════════════════════════════════════════════
# 집 다섯 채 — (그림 이름) → svg
#   문 칸 = 발자리 왼쪽에서 셋째 칸(가운데 x = 2.5칸 = 320). 간판 칸 = 넷째 칸(448).
# ═════════════════════════════════════════════════════════════
DOOR_X = 2.5 * 128
SIGN_X = 3.5 * 128


def bld_shop():
    s = ''
    s += chimney(640, 50, 240, 70, 'brickR', smoke=('#e8e4dc', .7))
    s += wall_plaster('plaster')
    s += eave_shadow()
    s += window(128, shutters='shutG') + window(640, shutters='shutG', flowers=('#ff6a6a', '#ffd84a', '#ffffff'))
    s += awning(34, 222, 402, 62)
    s += door(DOOR_X)
    s += sign_board(SIGN_X, 'bag')
    s += foundation()
    s += roof_side('roofR')
    s += chimney(640, 50, 170, 70, 'brickR')
    s += crates(560, GROUND - 4, 2) + sacks(700, GROUND - 4)
    return s


def bld_forge():
    s = ''
    s += chimney(150, 44, 260, 110, 'stoneB', smoke=('#6a6a70', .75), ember=True)
    s += wall_stone('stoneB')
    s += eave_shadow()
    # 화덕 창 — 벌겋게 달아오른 불빛
    fx, fy = 128, 520
    s += f'<rect x="{fx - 64}" y="{fy - 50}" width="128" height="96" rx="14" fill="#ff8a2a" opacity=".45" filter="url(#glow12)"/>'
    d = smooth_path([(fx - 56, fy + 44), (fx - 56, fy - 20), (fx, fy - 50), (fx + 56, fy - 20), (fx + 56, fy + 44)], k=.3)
    s += P(d, '#2a120a', 6)
    s += clip(uid('ff'), d, f'<ellipse cx="{fx}" cy="{fy + 40}" rx="60" ry="46" fill="#ff7a1a"/><ellipse cx="{fx}" cy="{fy + 44}" rx="34" ry="24" fill="#ffd060"/>')
    s += L(d, OL, 6)
    s += window(640, shutters=None, glass='glass', box=False)
    s += door(DOOR_X, frame='stoneD')
    s += f'<path d="M{DOOR_X - 18} 480 a18 18 0 1 1 36 0" fill="none" stroke="{OL}" stroke-width="12"/><path d="M{DOOR_X - 18} 480 a18 18 0 1 1 36 0" fill="none" stroke="{hx("ironL", 1)}" stroke-width="6"/>'
    s += sign_board(SIGN_X, 'hammer')
    s += foundation('stoneD')
    s += roof_side('roofS', kind='slate')
    s += chimney(150, 44, 190, 110, 'stoneB', ember=True)
    s += woodpile(560, GROUND - 2)
    return s


def bld_alchemy():
    s = ''
    s += chimney(600, 20, 230, 64, 'stoneB', smoke=('#7ad07a', .7))
    s += wall_plaster('plasterL', posts=(10, 758), braces=())
    s += eave_shadow()
    s += window(128, glass='glassP', shutters='shutB', flowers=('#c8a0ff', '#ffffff', '#8fd0ff'))
    s += window(640, glass='glassP', shutters='shutB', flowers=('#c8a0ff', '#ffffff', '#8fd0ff'))
    s += door(DOOR_X, style='plankD')
    s += sign_board(SIGN_X, 'flask')
    s += foundation()
    s += roof_gable('roofG', 'plasterL', apex=150, depth=104)
    s += window(BW / 2, cy=300, w=84, round_=True, glass='glassP')
    s += herbs(90, 280, 420) + herbs(500, 700, 420)
    s += chimney(600, 20, 130, 64, 'stoneB')
    # 창턱의 물약병
    for i, (x, col) in enumerate([(596, '#ff6a8a'), (626, '#62d46a'), (656, '#6aa8ff')]):
        s += P(smooth_path([(x - 8, 548), (x + 8, 548), (x + 12, 568), (x - 12, 568)], k=.3), col, 3)
    return s


def bld_inn():
    s = ''
    s += chimney(130, 30, 230, 64, 'brickR', smoke=('#e8e4dc', .65))
    s += wall_planks('plank')
    s += eave_shadow()
    s += window(128, shutters='shutR', flowers=('#ff8ab0', '#ffd84a', '#ff6a6a'))
    s += window(640, shutters='shutR', flowers=('#ff8ab0', '#ffd84a', '#ff6a6a'))
    s += door(DOOR_X, style='plankD')
    s += lantern(DOOR_X - 92, 440)
    s += sign_board(SIGN_X, 'bed')
    s += foundation()
    s += roof_gable('roofB', 'plank', apex=140, depth=110)
    s += window(BW / 2, cy=290, w=92, round_=True, glass='glass')
    s += chimney(130, 30, 120, 64, 'brickR')
    return s


def bld_house():
    s = ''
    s += chimney(560, 70, 240, 56, 'brickR', smoke=('#e8e4dc', .55))
    s += wall_plaster('plaster', posts=(10, 384, 758), braces=((10, 200),))
    s += eave_shadow()
    s += window(128, shutters='shutB') + window(576, shutters='shutB', flowers=('#ffffff', '#ff9ac0', '#ffd84a'))
    s += door(DOOR_X, style='plank')
    s += foundation()
    s += roof_side('thatch', kind='thatch', top=176)
    s += chimney(560, 70, 190, 56, 'brickR')
    return s


def fountain():
    """광장 분수 — 2×2 칸(64×64) 발자리, 그림 64×84(×4)."""
    W_, H_ = 64 * K, 84 * K
    cx, base = W_ / 2, H_ - 14
    s = TA.shadow(cx, base - 10, 128, 26, .3)
    # 바깥 물통(돌 테두리 — 타원)
    outer = f'M{cx - 124} {base - 70} a124 50 0 1 0 248 0 a124 50 0 1 0 -248 0'
    s += P(f'M{cx - 124} {base - 70} L{cx - 124} {base - 30} a124 50 0 0 0 248 0 L{cx + 124} {base - 70}', T('stoneB', 'tv'), LW)
    for i in range(8):
        a = math.pi * (i + .5) / 8
        x = cx - 124 * math.cos(a)
        s += L(f'M{x:.1f} {base - 70 + 50 * math.sin(a):.1f} L{x:.1f} {base - 30 + 50 * math.sin(a):.1f}', hx('stoneB', 3), 4, .8)
    s += P(outer, T('stoneB', 'tr'), LW)
    inner = f'M{cx - 104} {base - 72} a104 38 0 1 0 208 0 a104 38 0 1 0 -208 0'
    s += P(inner, T('water', 'tg'), 5)
    s += clip(uid('fw'), inner, ''.join(f'<ellipse cx="{cx + dx}" cy="{base - 72 + dy}" rx="{rx}" ry="{rx * .3}" fill="none" stroke="#dff4ff" stroke-width="4" opacity=".7"/>'
                                         for dx, dy, rx in [(-30, 6, 40), (40, -8, 30), (0, 14, 70)]))
    # 가운데 기둥 · 윗 그릇
    col = poly_path([(cx - 22, base - 80), (cx + 22, base - 80), (cx + 16, base - 210), (cx - 16, base - 210)])
    s += P(col, T('stoneB', 'tv'), LW)
    bowl = f'M{cx - 70} {base - 216} Q{cx} {base - 170} {cx + 70} {base - 216} Z'
    s += P(bowl, T('stoneB', 'tv'), LW)
    s += P(f'M{cx - 70} {base - 216} a70 16 0 1 0 140 0 a70 16 0 1 0 -140 0', T('water', 'tr'), 5)
    s += P(poly_path([(cx - 10, base - 216), (cx + 10, base - 216), (cx + 8, base - 262), (cx - 8, base - 262)]), T('stoneB', 'tv'), 5)
    # 물줄기
    for k in (-1, 1):
        for j, sp in enumerate((1, .7)):
            d = f'M{cx} {base - 264} Q{cx + k * 60 * sp} {base - 330} {cx + k * 90 * sp} {base - 212 + j * 30}'
            s += L(d, '#bfe8ff', 9 - j * 3, .85) + L(d, '#ffffff', 3, .8)
        d = f'M{cx + k * 64} {base - 212} Q{cx + k * 96} {base - 170} {cx + k * 100} {base - 86}'
        s += L(d, '#bfe8ff', 8, .75) + L(d, '#ffffff', 2.5, .7)
    for (x, y) in [(cx - 60, base - 90), (cx + 50, base - 84), (cx + 10, base - 60), (cx - 20, base - 282)]:
        s += f'<path d="M{x} {y - 10} L{x + 3} {y - 3} L{x + 10} {y} L{x + 3} {y + 3} L{x} {y + 10} L{x - 3} {y + 3} L{x - 10} {y} L{x - 3} {y - 3} Z" fill="#ffffff" opacity=".9"/>'
    return s, W_, H_


def lamp():
    """가로등 — 쇠기둥 · 따뜻한 등불."""
    W_, H_ = 36 * K, 84 * K
    cx, base = W_ / 2, H_ - 10
    s = TA.shadow(cx, base - 4, 34, 10, .3)
    s += f'<circle cx="{cx}" cy="{base - 262}" r="60" fill="#ffd070" opacity=".5" filter="url(#glow12)"/>'
    s += P(poly_path([(cx - 26, base), (cx + 26, base), (cx + 18, base - 30), (cx - 18, base - 30)]), T('ironL', 'tv'), 5)
    s += P(poly_path([(cx - 9, base - 30), (cx + 9, base - 30), (cx + 7, base - 226), (cx - 7, base - 226)]), T('ironL', 'tv'), 5)
    for y in (base - 120, base - 200):
        s += P(poly_path([(cx - 14, y), (cx + 14, y), (cx + 14, y + 10), (cx - 14, y + 10)]), T('ironL', 'tv'), 3.5)
    box = poly_path([(cx - 30, base - 234), (cx + 30, base - 234), (cx + 24, base - 296), (cx - 24, base - 296)])
    s += P(box, '#ffe9a0', 5)
    s += f'<ellipse cx="{cx}" cy="{base - 262}" rx="14" ry="20" fill="#fff8d8"/>'
    s += L(f'M{cx} {base - 234} L{cx} {base - 296} M{cx - 27} {base - 264} L{cx + 27} {base - 264}', OL, 4)
    s += P(poly_path([(cx - 40, base - 296), (cx + 40, base - 296), (cx + 14, base - 322), (cx - 14, base - 322)]), T('ironL', 'tv'), 5)
    s += f'<circle cx="{cx}" cy="{base - 328}" r="8" fill="{hx("ironL", 0)}" stroke="{OL}" stroke-width="4"/>'
    return s, W_, H_


def lamp_shade():
    W_, H_ = 36 * K, 84 * K
    return f'<ellipse cx="{W_ / 2}" cy="{H_ - 14}" rx="60" ry="16" fill="#10200e" opacity=".3" filter="url(#tblur)"/>', W_, H_


def well():
    W_, H_ = 48 * K, 72 * K
    cx, base = W_ / 2, H_ - 12
    s = TA.shadow(cx, base - 6, 90, 18, .3)
    # 돌 우물
    s += P(f'M{cx - 76} {base - 90} L{cx - 76} {base - 20} a76 26 0 0 0 152 0 L{cx + 76} {base - 90}', T('stoneB', 'tv'), LW)
    rng = random.Random(2)
    for i in range(6):
        a = math.pi * (i + .5) / 6
        x = cx - 76 * math.cos(a)
        s += L(f'M{x:.1f} {base - 90 + 26 * math.sin(a):.1f} L{x:.1f} {base - 20 + 26 * math.sin(a):.1f}', hx('stoneB', 3), 4, .8)
    s += L(f'M{cx - 76} {base - 55} a76 26 0 0 0 152 0', hx('stoneB', 3), 4, .8)
    s += P(f'M{cx - 76} {base - 90} a76 26 0 1 0 152 0 a76 26 0 1 0 -152 0', T('stoneB', 'tr'), LW)
    s += P(f'M{cx - 58} {base - 90} a58 18 0 1 0 116 0 a58 18 0 1 0 -116 0', '#1a2a3a', 4)
    # 기둥 · 지붕
    for k in (-1, 1):
        s += P(poly_path([(cx + k * 64 - 8, base - 92), (cx + k * 64 + 8, base - 92), (cx + k * 60 + 8, base - 226), (cx + k * 60 - 8, base - 226)]), T('plank', 'tv'), 5)
    s += L(f'M{cx - 56} {base - 196} L{cx + 56} {base - 196}', OL, 12) + L(f'M{cx - 56} {base - 196} L{cx + 56} {base - 196}', hx('plank', 0), 6)
    s += L(f'M{cx + 10} {base - 196} L{cx + 10} {base - 140}', '#d8c090', 3)
    s += P(poly_path([(cx - 6, base - 140), (cx + 26, base - 140), (cx + 22, base - 110), (cx - 2, base - 110)]), T('plank', 'tv'), 4)
    roof = poly_path([(cx - 96, base - 214), (cx + 96, base - 214), (cx + 40, base - 272), (cx - 40, base - 272)])
    s += shingles(roof, base - 272, base - 214, cx - 96, cx + 96, 'roofR', row=22, w=34, seed=8) + L(roof, OL, LW)
    return s, W_, H_


def bench():
    W_, H_ = 48 * K, 36 * K
    cx, base = W_ / 2, H_ - 10
    s = TA.shadow(cx, base - 4, 84, 12, .28)
    for k in (-1, 1):
        s += P(poly_path([(cx + k * 64 - 7, base - 50), (cx + k * 64 + 7, base - 50), (cx + k * 66 + 7, base), (cx + k * 66 - 7, base)]), T('ironL', 'tv'), 4)
    s += P(poly_path([(cx - 86, base - 58), (cx + 86, base - 58), (cx + 90, base - 44), (cx - 90, base - 44)]), T('plank', 'tv'), 5)
    for y in (base - 100, base - 80):
        s += P(poly_path([(cx - 82, y), (cx + 82, y), (cx + 82, y + 14), (cx - 82, y + 14)]), T('plank', 'tv'), 4.5)
    for k in (-1, 1):
        s += P(poly_path([(cx + k * 64 - 6, base - 104), (cx + k * 64 + 6, base - 104), (cx + k * 64 + 6, base - 56), (cx + k * 64 - 6, base - 56)]), T('ironL', 'tv'), 4)
    return s, W_, H_


def planter():
    W_, H_ = 36 * K, 36 * K
    cx, base = W_ / 2, H_ - 10
    s = TA.shadow(cx, base - 4, 64, 12, .25)
    box = poly_path([(cx - 60, base - 50), (cx + 60, base - 50), (cx + 52, base), (cx - 52, base)])
    rng = random.Random(6)
    cols = ['#ff8ab0', '#ffd84a', '#b89aff', '#ffffff', '#ff6a6a']
    fl = ''
    for i in range(9):
        x, y = cx - 50 + i * 12.5 + rng.uniform(-3, 3), base - 56 - rng.uniform(0, 26)
        fl += f'<circle cx="{x:.1f}" cy="{y + 14:.1f}" r="14" fill="{hx("leaf", 0 if i % 2 else 2)}" stroke="{OL}" stroke-width="3"/>'
    for i in range(8):
        x, y = cx - 48 + i * 14 + rng.uniform(-4, 4), base - 64 - rng.uniform(0, 26)
        col = cols[i % len(cols)]
        for j in range(5):
            a = 2 * math.pi * j / 5 + i
            fl += f'<circle cx="{x + math.cos(a) * 7:.1f}" cy="{y + math.sin(a) * 7:.1f}" r="6.5" fill="{col}" stroke="{OL}" stroke-width="2"/>'
        fl += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4" fill="#fff2a0"/>'
    s += fl
    s += P(box, T('plankD', 'tv'), 5) + L(f'M{cx - 56} {base - 30} L{cx + 56} {base - 30}', hx('plankD', 3), 3.5, .8)
    s += L(f'M{cx - 56} {base - 44} L{cx + 56} {base - 44}', hx('plankD', 1), 3, .6)
    return s, W_, H_


def crop():
    W_, H_ = 32 * K, 32 * K
    s = ''
    rng = random.Random(4)
    for r in range(2):
        y = 44 + r * 60
        s += F(smooth_path([(4, y + 14), (W_ - 4, y + 14), (W_ - 4, y + 44), (4, y + 44)], k=.3), hx('soil', 0), 1)
        s += L(f'M8 {y + 40} L{W_ - 8} {y + 40}', hx('soil', 3), 4, .7)
        for i in range(3):
            x = 24 + i * 40 + (r * 18)
            if x > W_ - 16:
                continue
            for j in range(6):
                a = 2 * math.pi * j / 6 + rng.uniform(-.2, .2)
                s += P(blob(x + math.cos(a) * 10, y + 16 + math.sin(a) * 6, 13, 7, .2, i * 10 + j, .8), T('cabbage', 'tr'), 3)
            s += f'<circle cx="{x}" cy="{y + 14}" r="10" fill="{hx("cabbage", 1)}" stroke="{OL}" stroke-width="3"/>'
    return s, W_, H_


def hay():
    W_, H_ = 40 * K, 36 * K
    cx, base = W_ / 2, H_ - 10
    s = TA.shadow(cx, base - 4, 70, 12, .28)
    d = smooth_path([(cx - 66, base), (cx - 70, base - 60), (cx - 60, base - 86), (cx + 60, base - 86), (cx + 70, base - 60), (cx + 66, base)], k=.25)
    s += P(d, T('hay', 'tg'), LW)
    inner = ''
    rng = random.Random(9)
    for _ in range(40):
        x, y = rng.uniform(cx - 66, cx + 66), rng.uniform(base - 84, base)
        inner += L(f'M{x:.1f} {y:.1f} l{rng.uniform(-10, 10):.1f} {rng.uniform(-6, 6):.1f}', hx('hay', 3), 2.5, .6)
    for x in (cx - 30, cx + 30):
        inner += L(f'M{x} {base - 90} L{x} {base}', OL, 9) + L(f'M{x} {base - 90} L{x} {base}', '#b0542c', 5)
    s += clip(uid('hy'), d, inner) + L(d, OL, LW)
    return s, W_, H_


def stall(kind):
    """장터 좌판 — 2칸(64) 폭. 줄무늬 차양 · 나무 좌판 · 과일/빵 바구니."""
    W_, H_ = 64 * K, 76 * K
    cx, base = W_ / 2, H_ - 10
    cols = ('canvasB', 'canvasW') if kind == 'fruit' else ('canvasR', 'canvasW')
    s = TA.shadow(cx, base - 6, 124, 18, .3)
    for k in (-1, 1):
        s += P(poly_path([(cx + k * 110 - 7, base - 250), (cx + k * 110 + 7, base - 250), (cx + k * 110 + 7, base), (cx + k * 110 - 7, base)]), T('plank', 'tv'), 5)
    table = poly_path([(cx - 124, base - 110), (cx + 124, base - 110), (cx + 118, base - 60), (cx - 118, base - 60)])
    s += P(poly_path([(cx - 118, base - 60), (cx + 118, base - 60), (cx + 118, base - 8), (cx - 118, base - 8)]), T('plankD', 'tv'), 5)
    s += P(table, T('plank', 'tg'), 5)
    rng = random.Random(1 if kind == 'fruit' else 2)
    for i, bx in enumerate((cx - 76, cx, cx + 76)):
        by = base - 108
        s += P(f'M{bx - 34} {by} Q{bx} {by + 30} {bx + 34} {by} Z', T('hay', 'tv'), 4)
        for j in range(6):
            x, y = bx + rng.uniform(-24, 24), by - 6 - rng.uniform(0, 18)
            if kind == 'fruit':
                col = ['#e0402c', '#ffb030', '#8ccf4a', '#b04ac0'][i if i < 3 else 0]
                s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{col}" stroke="{OL}" stroke-width="3"/><circle cx="{x - 4:.1f}" cy="{y - 4:.1f}" r="3.5" fill="#ffffff" opacity=".7"/>'
            else:
                s += P(smooth_path([(x - 16, y + 6), (x - 12, y - 8), (x + 12, y - 8), (x + 16, y + 6)], k=.4), '#d8903c', 3)
                s += L(f'M{x - 6} {y - 4} l4 6 M{x + 2} {y - 5} l4 6', '#a0601c', 2.5)
    # 차양
    n = 6
    x0, x1, y = cx - 128, cx + 128, base - 262
    w = (x1 - x0) / n
    for i in range(n):
        xa, xb = x0 + i * w, x0 + (i + 1) * w
        s += P(poly_path([(xa + 12, y - 36), (xb + 12, y - 36), (xb, y + 26), (xa, y + 26)]), T(cols[i % 2], 'tv'), 4)
        s += P(f'M{xa} {y + 26} Q{(xa + xb) / 2} {y + 46} {xb} {y + 26} Z', T(cols[i % 2], 'tv'), 4)
    return s, W_, H_


BUILDINGS = {'bld_shop': bld_shop, 'bld_forge': bld_forge, 'bld_alchemy': bld_alchemy, 'bld_inn': bld_inn, 'bld_house': bld_house}
PROPS = {
    'bld_fountain': fountain, 'tile_lamp': lamp, 'tile_lamp_shade': lamp_shade, 'tile_well': well, 'tile_bench': bench,
    'tile_planter': planter, 'tile_crop': crop, 'tile_hay': hay,
    'bld_stall_fruit': lambda: stall('fruit'), 'bld_stall_bread': lambda: stall('bread'),
}
LABEL = {
    'bld_shop': '잡화점(한 채)', 'bld_forge': '대장간(한 채)', 'bld_alchemy': '연금술사의 집(한 채)', 'bld_inn': '여관(한 채)',
    'bld_house': '살림집(한 채)', 'bld_fountain': '광장 분수', 'tile_lamp': '가로등', 'tile_lamp_shade': '가로등 그늘',
    'tile_well': '우물', 'tile_bench': '벤치', 'tile_planter': '화단 상자', 'tile_crop': '텃밭', 'tile_hay': '짚단',
    'bld_stall_fruit': '과일 좌판', 'bld_stall_bread': '빵 좌판',
}


def svg_doc(body, w, h, y0=0):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 {-y0} {w} {h}">'
            f'<defs>{GA.DEFS}{TA.TDEFS}</defs>{body}</svg>')


def bake(names):
    os.makedirs(SVGDIR, exist_ok=True)
    os.makedirs(OUT_B, exist_ok=True)
    jobs = []
    for n in names:
        y0 = 0
        if n in BUILDINGS:
            body, w, h, y0 = BUILDINGS[n](), BW, BH, TOPPAD
        else:
            body, w, h = PROPS[n]()
        sp = os.path.join(SVGDIR, f'{n}.svg')
        open(sp, 'w').write(svg_doc(body, w, h, y0))
        jobs.append({'svg': sp, 'out': os.path.join(SVGDIR, f'{n}.png'), 'w': int(w), 'h': int(h), 'name': n})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(jobs, open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env)
    man_p = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    man = json.load(open(man_p, encoding='utf-8'))
    written = []
    for j in jobs:
        n = j['name']
        lw, lh = j['w'] // K, j['h'] // K            # 게임 크기
        im = Image.open(j['out']).convert('RGBA').resize((lw * 2, lh * 2), Image.LANCZOS)
        if n.startswith('bld_'):
            rel = f'town/{n[4:]}.webp'
            im.save(os.path.join(ROOT, 'assets', rel), 'WEBP', quality=90, method=6, alpha_quality=95)
        else:
            rel = f'tiles/{n[5:]}.png'
            im.save(os.path.join(ROOT, 'assets', rel), optimize=True)
        written.append(rel)
        man[n] = {**man.get(n, {}), 'src': f'assets/{rel}', 'w': lw, 'h': lh, 'label': LABEL.get(n, n)}
    with open(man_p, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write('\n')
    p = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(p, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | {w for w in written if w.endswith('.png')})
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 마을 그림 {len(written)}장')


def preview(names):
    ims = []
    for n in names:
        rel = f'town/{n[4:]}.webp' if n.startswith('bld_') else f'tiles/{n[5:]}.png'
        ims.append(Image.open(os.path.join(ROOT, 'assets', rel)).convert('RGBA'))
    S = 400
    cols = 4
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGBA', (S * cols, S * rows), (104, 150, 86, 255))
    for i, im in enumerate(ims):
        out.alpha_composite(im, ((i % cols) * S + (S - im.width) // 2, (i // cols) * S + S - im.height - 10))
    out.save(os.path.join(ROOT, 'art', 'preview', 'town-art.png'))
    print('✓ art/preview/town-art.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    allnames = list(BUILDINGS) + list(PROPS)
    names = [a for a in args if a in allnames] or allnames
    if '--preview' not in sys.argv:
        bake(names)
    preview(names)
