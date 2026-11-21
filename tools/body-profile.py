#!/usr/bin/env python3
"""
옆얼굴(90°) — 앞모습 그림에 없는 것을 새로 그린다 (0.70.30).

    python3 tools/body-profile.py          # → art/views/<몸>_side_*.png · art/preview/body-profile.png
    (tools/body-turn.py 가 불러 쓴다)

── 무엇을 그리나 ─────────────────────────────────────────────
  옆에서 본 머리는 **머리칼 덩어리 + 앞쪽 아래의 얼굴 + 가운데의 귀** 다.
    머리칼  앞모습 머리칼을 그대로 쓴다(그린 결 · 삐친 끝 · 머리띠 · 깃털이 그대로 남는다).
           가르마를 정수리로 옮기고 가로로 조금 늘이면, 오른쪽 절반은 뒤통수로 흘러내리는 머리가 되고
           왼쪽 절반은 이마를 덮는 앞머리가 된다. 얼굴 자리는 뒤통수 그림(body-views)의 머리칼로 채운다.
    얼굴   SVG 로 새로 그린다 — 이마 · 눈두덩 · 코끝 · 입술 · 턱 · 턱선 · 목, 옆에서 본 큰 눈(홍채 · 반짝임) ·
           눈썹 · 입 · 볼 홍조 · 귀. 색은 앞모습에서 뽑는다(살 밝은 면 · 그늘 · 테두리 · 눈동자).
    긴 머리 귀를 덮고 등 뒤로 흘러내린다(hairside 한 겹 — 몸통 위, 가까운 팔 아래).
  얼굴은 **왼쪽**을 본다(굽는 틀의 옆모습은 왼쪽을 보고, 게임에 넣을 때 뒤집는다).

── 투구 ─────────────────────────────────────────────────────
  투구 그림도 머리칼과 같은 자리로 옮기고, 앞모습의 얼굴 구멍을 둘레 색으로 메운 뒤 옆얼굴 자리만 비운다.
"""
import importlib.util
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'art', 'views')
SVGDIR = os.path.join(ROOT, 'art', 'views', '_svg')
BW, BH = 768, 1024
XN = 384            # 목(몸 틀) — 옆얼굴은 이 줄을 기준으로 그린다
K = 0.94            # 머리칼을 가로로 늘이는 배율(옆에서 본 머리 = 앞에서 본 폭과 거의 같다)
XC = XN + 10        # 가르마가 가는 자리(정수리)

# 몸마다 앞모습에서 잰 높이(몸 틀 y) — 눈썹 B · 눈 E · 코끝 N · 입 Mo · 턱 C · 앞머리 끝 F
PROF = {
    'm1': dict(T=68, B=209, E=239, N=269, Mo=293, C=333, F=202, sex='m', long=False, iris='#4a6c92', brow=6),
    'f1': dict(T=94, B=212, E=240, N=262, Mo=280, C=311, F=184, sex='f', long=True, iris='#7a6f5c', brow=4.5),
    'm2': dict(T=59, B=212, E=240, N=273, Mo=291, C=333, F=198, sex='m', long=False, iris='#4a6c92', brow=6.5,
               band=True),
    'f2': dict(T=81, B=215, E=241, N=263, Mo=282, C=308, F=192, sex='f', long=True, iris='#7a7260', brow=4.5),
}
# 머리칼 네 단 — 앞모습 머리칼의 채도 높은 점에서 뽑았다(짙은 그늘 · 바탕 · 밝은 면 · 윤기)
HAIR = {'m1': ((54, 35, 29), (78, 52, 39), (114, 77, 53), (152, 110, 81)),
        'f1': ((54, 36, 29), (76, 51, 39), (111, 74, 52), (140, 100, 72)),
        'm2': ((54, 35, 29), (80, 55, 42), (120, 83, 59), (160, 118, 89)),
        'f2': ((54, 37, 30), (79, 55, 43), (112, 78, 56), (144, 108, 85))}


def _hex(c):
    return '#%02x%02x%02x' % tuple(int(max(0, min(255, v))) for v in c[:3])


def _mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def smooth(pts, closed=True, k=0.5):
    pts = [tuple(map(float, p)) for p in pts]
    n = len(pts)
    f = lambda v: f'{v:.1f}'
    d = f'M{f(pts[0][0])} {f(pts[0][1])}'
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[i]
        p1, p2 = pts[i], pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3)
        d += f' C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}'
    return d + (' Z' if closed else '')


def poly(pts):
    return 'M' + ' L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + ' Z'


def colors(name, im, lab, BV):
    H = BV.head_info(name, im, lab)
    rgb = im[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = BV._lum(rgb)
    face = H['face']
    skin = face & (r - b > 38) & (lum > 125)
    sk = rgb[skin]
    sl = BV._lum(sk)
    lite = np.median(sk[sl > np.percentile(sl, 60)], 0)
    mid = np.median(sk[(sl > np.percentile(sl, 30)) & (sl < np.percentile(sl, 60))], 0)
    shade = np.median(sk[sl < np.percentile(sl, 15)], 0)
    ol = np.median(rgb[H['head'] & (lum < 45)], 0)
    hair = BV.hair_palette(im, H['hair'])
    return dict(lite=lite, mid=mid, shade=shade, ol=ol, hair=hair)


# ─────────────────────────────────────────────────────────────
# 옆얼굴 SVG — 왼쪽을 본다. 점은 (목에서 가로로 몇 점, 세로 y)
# ─────────────────────────────────────────────────────────────
def face_pts(p):
    B, E, N, Mo, C, F = p['B'], p['E'], p['N'], p['Mo'], p['C'], p['F']
    f = p['sex'] == 'f'
    x = lambda dx: XN + dx
    return [
        (x(-90), F - 34), (x(-99), B - 20), (x(-103), B - 1),          # 이마 · 눈두덩
        (x(-97), E - 4), (x(-100), E + 12),                            # 눈 옆 · 콧등
        (x(-110 if f else -112), N - 3), (x(-106), N + 3), (x(-99), N + 7),   # 코끝 · 콧방울 밑
        (x(-102), Mo - 5), (x(-104 if f else -102), Mo - 2), (x(-98), Mo + 1),   # 윗입술 · 입
        (x(-102 if f else -101), Mo + 6), (x(-96), Mo + 13),           # 아랫입술 · 턱 주름
        (x(-99), C - 12), (x(-92), C - 3), (x(-78), C + 1),            # 턱끝
        (x(-52), C - 7), (x(-22), C - 22), (x(-4), N + 8),             # 턱선 → 귀 밑
        (x(26), E + 10), (x(30), B - 40), (x(-40), F - 50),            # 머리칼 밑으로(보이지 않는 곳)
    ]


def neck_pts(p):
    C, N = p['C'], p['N']
    x = lambda dx: XN + dx
    bx = 4 if p['long'] else 26          # 긴 머리는 목덜미를 덮는다 — 목 뒤쪽은 머리칼 밑
    # 0.70.30 — 짧고 가늘게: 턱 밑에서 옷깃까지만(길게 내리면 옆모습이 막대 위에 얹힌 머리처럼 보였다)
    # 목은 뒤통수 아래에서 어깨 쪽으로 **조금 앞으로 기울어** 내려간다(곧은 기둥이면 머리를 꽂아 둔 것처럼 보인다)
    return [(x(-38), C - 16), (x(-36), C + 8), (x(-24), C + 26), (x(bx + 8), C + 24), (x(bx + 2), C + 4), (x(14), N + 8)]


def ear_pts(p):
    E, N = p['E'], p['N']
    x = lambda dx: XN + dx
    return [(x(6), E - 10), (x(24), E - 20), (x(42), E - 10), (x(46), E + 12), (x(40), N + 2),
            (x(28), N + 16), (x(12), N + 14), (x(4), N - 4)]


def svg_face(p, col):
    """얼굴 · 목 · 눈 · 눈썹 · 입 · 코 · 홍조 · 귀(짧은 머리) — 한 장."""
    B, E, N, Mo, C, F = p['B'], p['E'], p['N'], p['Mo'], p['C'], p['F']
    f = p['sex'] == 'f'
    x = lambda dx: XN + dx
    OL = _hex(col['ol'])
    lite, mid, shade = _hex(col['lite']), _hex(col['mid']), _hex(col['shade'])
    deep = _hex(_mix(col['shade'], col['ol'], .25))
    s = []
    # 목 — 턱 밑은 그늘
    nd = smooth(neck_pts(p))
    s.append(f'<linearGradient id="ng" x1="0" y1="{C - 20}" x2="0" y2="{C + 50}" gradientUnits="userSpaceOnUse">'
             f'<stop offset="0" stop-color="{shade}"/><stop offset=".55" stop-color="{mid}"/><stop offset="1" stop-color="{mid}"/></linearGradient>')
    s.append(f'<path d="{nd}" fill="url(#ng)" stroke="{OL}" stroke-width="5" stroke-linejoin="round"/>')
    # 얼굴
    fd = smooth(face_pts(p), k=.55)
    s.append(f'<radialGradient id="fg" cx="{x(-70)}" cy="{E + 10}" r="120" gradientUnits="userSpaceOnUse">'
             f'<stop offset="0" stop-color="{lite}"/><stop offset=".62" stop-color="{lite}"/><stop offset="1" stop-color="{mid}"/></radialGradient>')
    s.append(f'<clipPath id="fc"><path d="{fd}"/></clipPath>')
    s.append(f'<path d="{fd}" fill="url(#fg)"/>')
    # 셀 그늘 — 턱선 안쪽 · 귀 앞(머리칼 그늘)
    sh = smooth([(x(-70), C - 4), (x(-40), C - 12), (x(-10), C - 34), (x(8), N - 10), (x(10), E - 30),
                 (x(-18), E - 22), (x(-20), N + 2), (x(-44), C - 26)], k=.6)
    s.append(f'<g clip-path="url(#fc)"><path d="{sh}" fill="{mid}" opacity=".85"/>'
             f'<path d="{smooth([(x(-110), F - 8), (x(-40), F - 14), (x(10), F - 10), (x(10), F + 14), (x(-50), F + 12), (x(-110), F + 10)], k=.5)}" fill="{shade}" opacity=".55"/></g>')
    s.append(f'<path d="{fd}" fill="none" stroke="{OL}" stroke-width="5" stroke-linejoin="round"/>')
    # 볼 홍조
    s.append(f'<filter id="bl"><feGaussianBlur stdDeviation="4"/></filter>'
             f'<ellipse cx="{x(-70)}" cy="{N - 4}" rx="16" ry="8" fill="#f07a6a" opacity=".38" filter="url(#bl)"/>')
    # 눈 — 앞(왼쪽)이 둥근 D 꼴. 흰자 · 홍채 · 동공 · 반짝임 · 윗눈꺼풀(굵게) · 속눈썹
    ew = smooth([(x(-90), E - 7), (x(-78), E - 14), (x(-62), E - 13), (x(-60), E - 1), (x(-66), E + 11),
                 (x(-79), E + 13), (x(-89), E + 8), (x(-92), E)], k=.6)
    iris = p['iris']
    s.append(f'<clipPath id="ec"><path d="{ew}"/></clipPath>')
    s.append(f'<path d="{ew}" fill="#fbf7f2"/>')
    s.append(f'<g clip-path="url(#ec)">'
             f'<ellipse cx="{x(-81)}" cy="{E + 1}" rx="10" ry="14" fill="{iris}" stroke="{OL}" stroke-width="2.5"/>'
             f'<ellipse cx="{x(-82)}" cy="{E + 4}" rx="5" ry="8" fill="#15100e"/>'
             f'<ellipse cx="{x(-81)}" cy="{E - 8}" rx="10" ry="5" fill="{OL}" opacity=".45"/>'
             f'<circle cx="{x(-78)}" cy="{E - 4}" r="3.6" fill="#ffffff"/>'
             f'<circle cx="{x(-85)}" cy="{E + 7}" r="1.8" fill="#ffffff" opacity=".85"/></g>')
    s.append(f'<path d="{smooth([(x(-93), E - 3), (x(-84), E - 12), (x(-70), E - 15), (x(-58), E - 13)], closed=False)}" '
             f'fill="none" stroke="{OL}" stroke-width="{6 if f else 5.5}" stroke-linecap="round"/>')
    lash = [(x(-58), E - 13), (x(-51), E - 19)] if not f else [(x(-58), E - 13), (x(-49), E - 20)]
    s.append(f'<path d="{smooth(lash, closed=False)}" fill="none" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>')
    if f:
        s.append(f'<path d="M{x(-61)} {E - 8} L{x(-52)} {E - 10}" stroke="{OL}" stroke-width="3" stroke-linecap="round"/>')
    s.append(f'<path d="{smooth([(x(-86), E + 10), (x(-76), E + 13), (x(-66), E + 11)], closed=False)}" '
             f'fill="none" stroke="{deep}" stroke-width="2.5" stroke-linecap="round"/>')
    # 눈썹
    bw = p['brow']
    if f:
        bp = [(x(-58), B - 4), (x(-76), B - 9), (x(-96), B - 5)]
    else:
        bp = [(x(-56), B - 6), (x(-76), B - 7), (x(-98), B + 1)]
    s.append(f'<path d="{smooth(bp, closed=False)}" fill="none" stroke="{_hex(_mix(col["hair"][0], col["ol"], .4))}" '
             f'stroke-width="{bw}" stroke-linecap="round"/>')
    # 코 · 입
    s.append(f'<path d="M{x(-104)} {N + 2} Q{x(-100)} {N + 5} {x(-97)} {N + 3}" fill="none" stroke="{deep}" stroke-width="2.5" stroke-linecap="round"/>')
    s.append(f'<path d="M{x(-98)} {Mo + 1} Q{x(-91)} {Mo + 3} {x(-85)} {Mo - 1}" fill="none" stroke="{OL}" stroke-width="3.2" stroke-linecap="round"/>')
    if f:
        s.append(f'<path d="M{x(-101)} {Mo + 5} Q{x(-96)} {Mo + 8} {x(-92)} {Mo + 5}" fill="none" stroke="#c46a5e" stroke-width="2" opacity=".7"/>')
    # 귀 — 짧은 머리만(긴 머리는 덮는다)
    if not p['long']:
        ed = smooth(ear_pts(p), k=.6)
        s.append(f'<path d="{ed}" fill="{mid}" stroke="{OL}" stroke-width="5" stroke-linejoin="round"/>')
        s.append(f'<path d="{smooth([(x(16), E - 6), (x(32), E - 8), (x(37), E + 10), (x(30), N - 4)], closed=False)}" '
                 f'fill="none" stroke="{deep}" stroke-width="3" stroke-linecap="round"/>')
        s.append(f'<ellipse cx="{x(24)}" cy="{E + 16}" rx="6" ry="9" fill="{shade}" opacity=".7"/>')
    return ''.join(s)


_ID = [0]


def lock(root, tip, w, bend, pal, ol, fade=.28, wave=0.0):
    """머리 한 가닥(덩어리) — 뿌리에서 끝으로 가늘어지는 잎 꼴. 뿌리 쪽은 흐려서 그린 머리칼에 스민다."""
    _ID[0] += 1
    i = _ID[0]
    (x0, y0), (x1, y1) = root, tip
    dx, dy = x1 - x0, y1 - y0
    L = max(1.0, (dx * dx + dy * dy) ** .5)
    nx, ny = -dy / L, dx / L
    cxm, cym = (x0 + x1) / 2 + nx * bend, (y0 + y1) / 2 + ny * bend
    left, right = [], []
    n = 9
    for k in range(n + 1):
        t = k / n
        # 이차 베지어 위의 점
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cxm + t * t * x1
        py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cym + t * t * y1
        px += nx * wave * np.sin(t * np.pi * 2)
        py += ny * wave * np.sin(t * np.pi * 2)
        hw = w / 2 * (1 - t) ** .75 * (.6 + .4 * np.sin(min(1, t * 3 + .2) * np.pi / 2))
        left.append((px + nx * hw, py + ny * hw))
        right.append((px - nx * hw, py - ny * hw))
    pts = left + right[::-1][1:-1]
    d = smooth(pts, k=.45)
    dark, base, lite, gloss = (_hex(c) for c in pal)
    g = (f'<linearGradient id="lg{i}" x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" gradientUnits="userSpaceOnUse">'
         f'<stop offset="0" stop-color="{lite}"/><stop offset=".35" stop-color="{base}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'
         f'<linearGradient id="lm{i}" x1="{x0:.1f}" y1="{y0:.1f}" x2="{x1:.1f}" y2="{y1:.1f}" gradientUnits="userSpaceOnUse">'
         f'<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="{fade}" stop-color="#fff" stop-opacity="1"/></linearGradient>'
         f'<mask id="lk{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="{BW}" height="{BH}">'
         f'<rect x="0" y="0" width="{BW}" height="{BH}" fill="url(#lm{i})"/></mask>')
    # 윤기 — 가닥 가운데 조금 위를 따라 밝은 줄
    hl = []
    for k in range(2, 6):
        t = k / n
        px = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cxm + t * t * x1 + nx * w * .12
        py = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cym + t * t * y1 + ny * w * .12
        hl.append((px, py))
    body = (f'<path d="{d}" fill="url(#lg{i})" stroke="{ol}" stroke-width="3.6" stroke-linejoin="round"/>'
            f'<path d="{smooth(hl, closed=False)}" fill="none" stroke="{gloss}" stroke-width="{max(2.5, w * .13):.1f}" '
            f'stroke-linecap="round" opacity=".55"/>')
    return g + f'<g mask="url(#lk{i})">{body}</g>'


def spiky(pts, k=.42):
    """('tip'|'pt', x, y) 목록 → 닫힌 길. 끝(tip)은 뾰족하게(점을 두 번 넣으면 캣멀-롬이 꺾인다)."""
    out = []
    for kind, x, y in pts:
        out.append((x, y))
        if kind == 'tip':
            out.append((x, y))
    return smooth(out, k=k)


def strands(lines, color, w=3.2, op=.85):
    s = ''
    for ln in lines:
        s += (f'<path d="{smooth(ln, closed=False, k=.5)}" fill="none" stroke="{color}" stroke-width="{w}" '
              f'stroke-linecap="round" opacity="{op}"/>')
    return s


def hair_style(name, p):
    """옆(90°) 머리칼 — 바깥 선(끝은 뾰족) · 가닥 선 · 윤기. 왼쪽을 본다. 점은 (목에서 가로, y)."""
    T, B, E, N, C, F = p['T'], p['B'], p['E'], p['N'], p['C'], p['F']
    if name in ('m1', 'm2'):
        wild = name == 'm2'
        w = 10 if wild else 0          # 거친 머리 — 끝이 더 멀리 뻗는다
        out = [('tip', -108, F + 4), ('pt', -122, F - 34), ('pt', -120, T + 62), ('pt', -100, T + 30),
               ('pt', -70, T + 14), ('tip', -44 - w, T - 6 - w), ('pt', -24, T + 12), ('tip', 4, T - 16 - w),
               ('pt', 20, T + 10), ('tip', 58 + w, T - 4 - w), ('pt', 72, T + 18), ('pt', 108, T + 30),
               ('tip', 162 + w, T + 30), ('pt', 136, T + 58), ('tip', 180 + w, T + 92), ('pt', 148, T + 112),
               ('tip', 168 + w, E - 12), ('pt', 138, E + 6), ('tip', 152 + w, N + 8), ('pt', 120, N + 12),
               ('tip', 124 + w, C - 8 + w), ('pt', 98, C - 20), ('tip', 86, C + 2 + w), ('pt', 64, N + 22),
               ('pt', 50, N + 2), ('pt', 48, E - 12), ('pt', 30, E - 22), ('pt', 8, E - 18), ('tip', -4, E + 24),
               ('pt', -18, E - 20), ('pt', -34, F + 8), ('tip', -50, F + 12), ('pt', -60, F - 8),
               ('tip', -74, F + 10), ('pt', -84, F - 6), ('tip', -96, F + 8), ('pt', -100, F - 4)]
        lines = [[(-6, T + 50), (-40, T + 44), (-58, F - 26)], [(4, T + 44), (-56, T + 70), (-82, F - 12)],
                 [(10, T + 40), (90, T + 44), (148 + w, T + 36)], [(16, T + 50), (118, T + 88), (166 + w, T + 94)],
                 [(16, T + 62), (112, E - 36), (156 + w, E - 12)], [(12, T + 76), (96, N - 34), (140 + w, N + 6)],
                 [(8, T + 88), (74, N - 6), (112, C - 12)], [(2, T + 98), (34, E), (60, N + 14)],
                 [(-12, T + 92), (-8, E - 38), (-2, E + 16)], [(-30, T + 70), (-40, F - 10), (-44, F + 6)]]
        gloss = [[(-92, T + 70), (-70, T + 56)], [(-58, T + 50), (-30, T + 44)], [(-14, T + 42), (14, T + 40)],
                 [(30, T + 44), (60, T + 50)], [(78, T + 58), (104, T + 70)]]
        hide_ear = False
    else:
        wild = name == 'f2'
        w = 8 if wild else 0
        out = [('tip', -102, F + 18), ('pt', -118, F - 24), ('pt', -116, T + 54), ('pt', -94, T + 20),
               ('pt', -52, T + 2), ('pt', 0, T - 2 - w), ('pt', 50, T + 6), ('pt', 100, T + 28), ('pt', 140, T + 68),
               ('pt', 160, E - 16), ('pt', 170, N + 24), ('pt', 174, 380), ('tip', 186 + w, 430),
               ('pt', 172, 470), ('tip', 190 + w, 530), ('pt', 158, 516), ('tip', 150, 556 + w), ('pt', 124, 520),
               ('tip', 100, 552), ('pt', 86, 506), ('tip', 60 - w, 536), ('pt', 52, 480), ('pt', 44, 420),
               ('pt', 32, 370), ('pt', 20, C + 24), ('tip', -18, C + 30), ('pt', -26, C - 4), ('pt', -30, N),
               ('pt', -32, E - 18), ('pt', -40, F + 6), ('tip', -54, F + 18), ('pt', -66, F), ('tip', -80, F + 16),
               ('pt', -90, F)]
        if wild:        # 거친 머리 — 바깥으로 삐친 가닥 몇
            out[5:5] = [('tip', -30, T - 20)]
            out[9:9] = [('tip', 128, T + 26)]
        lines = [[(-4, T + 36), (-50, T + 40), (-84, F - 6)], [(4, T + 34), (-30, T + 70), (-60, F + 8)],
                 [(10, T + 30), (90, T + 40), (150, E - 20)], [(14, T + 40), (120, E - 10), (160, 400)],
                 [(14, T + 52), (100, N), (130, 470)], [(12, T + 66), (70, C), (104, 530)],
                 [(8, T + 80), (40, C + 10), (70, 500)], [(0, T + 90), (-8, N), (-10, C + 20)],
                 [(150, 440), (160, 490), (176, 520)], [(96, 420), (110, 470), (128, 510)]]
        gloss = [[(-96, T + 64), (-72, T + 44)], [(-58, T + 36), (-28, T + 28)], [(-10, T + 26), (22, T + 26)],
                 [(40, T + 30), (70, T + 38)], [(88, T + 48), (112, T + 62)]]
        hide_ear = True
    x = lambda pts: [(XN + a, b) for a, b in pts]
    outline = [(k, XN + a, b) for k, a, b in out]
    return outline, [x(l) for l in lines], [x(g) for g in gloss], hide_ear


def svg_hair(name, p, pal, ol):
    outline, lines, gloss, _ = hair_style(name, p)
    dark, base, lite, glo = (_hex(c) for c in pal)
    T, C = p['T'], p['C']
    d = spiky(outline)
    s = (f'<linearGradient id="hg" x1="0" y1="{T}" x2="0" y2="{C + 40}" gradientUnits="userSpaceOnUse">'
         f'<stop offset="0" stop-color="{lite}"/><stop offset=".3" stop-color="{base}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'
         f'<radialGradient id="hs" cx="{XN - 40}" cy="{T + 40}" r="260" gradientUnits="userSpaceOnUse">'
         f'<stop offset=".55" stop-color="{dark}" stop-opacity="0"/><stop offset="1" stop-color="{dark}" stop-opacity=".75"/></radialGradient>'
         f'<clipPath id="hc"><path d="{d}"/></clipPath>')
    s += f'<path d="{d}" fill="url(#hg)"/>'
    s += f'<g clip-path="url(#hc)"><path d="{d}" fill="url(#hs)"/>'
    s += strands(lines, _hex(_mix(pal[0], (0, 0, 0), .3)), w=3.4, op=.9)
    s += strands([[(a + 4, b + 3) for a, b in l] for l in lines], lite, w=2.2, op=.35)
    s += strands(gloss, glo, w=7, op=.75)
    s += '</g>'
    s += f'<path d="{d}" fill="none" stroke="{ol}" stroke-width="5" stroke-linejoin="round"/>'
    return s


def lock2(root, ctrl, tip, w, pal, ol, fade=.22, wave=0.0, tone=1.0):
    """머리 한 덩어리 — 휘어진 잎 꼴(가운데가 가장 넓고 끝이 뾰족). 폭을 가로질러 밝은 쪽 → 그늘.
    뿌리 쪽은 흐려서(fade) 그린 머리칼에 스민다."""
    _ID[0] += 1
    i = _ID[0]
    P0, P1, P2 = np.array(root, float), np.array(ctrl, float), np.array(tip, float)
    n = 14
    ts = np.linspace(0, 1, n + 1)
    pts = [((1 - t) ** 2) * P0 + 2 * (1 - t) * t * P1 + t * t * P2 for t in ts]
    tans = [2 * (1 - t) * (P1 - P0) + 2 * t * (P2 - P1) for t in ts]
    left, right, mid = [], [], []
    for t, q, d in zip(ts, pts, tans):
        d = d / max(1e-6, np.linalg.norm(d))
        nrm = np.array([-d[1], d[0]])
        q = q + nrm * wave * np.sin(t * np.pi * 2.2)
        hw = w / 2 * min(1.0, (t + .12) * 2.4) * (1 - t) ** .75
        left.append(q + nrm * hw)
        right.append(q - nrm * hw)
        mid.append(q + nrm * hw * .35)
    outline = [tuple(v) for v in left] + [tuple(v) for v in right[::-1][1:-1]]
    d = smooth(outline, k=.4)
    dark, base, lite, glo = (_hex(_mix(c, (0, 0, 0), 1 - tone)) for c in pal)
    # 폭을 가로지르는 명암 — 가운데 쯤의 법선 방향
    q, dd = pts[n // 3], tans[n // 3]
    dd = dd / max(1e-6, np.linalg.norm(dd))
    nrm = np.array([-dd[1], dd[0]])
    a, b = q + nrm * w * .55, q - nrm * w * .55
    g = (f'<linearGradient id="lx{i}" x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" gradientUnits="userSpaceOnUse">'
         f'<stop offset="0" stop-color="{lite}"/><stop offset=".45" stop-color="{base}"/><stop offset="1" stop-color="{dark}"/></linearGradient>'
         f'<linearGradient id="lm{i}" x1="{P0[0]:.1f}" y1="{P0[1]:.1f}" x2="{P2[0]:.1f}" y2="{P2[1]:.1f}" gradientUnits="userSpaceOnUse">'
         f'<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="{fade}" stop-color="#fff" stop-opacity="1"/></linearGradient>'
         f'<mask id="lk{i}" maskUnits="userSpaceOnUse" x="0" y="0" width="{BW}" height="{BH}">'
         f'<rect x="0" y="0" width="{BW}" height="{BH}" fill="url(#lm{i})"/></mask>')
    hl = [tuple(v) for v in mid[3:8]]
    body = (f'<path d="{d}" fill="url(#lx{i})" stroke="{ol}" stroke-width="3.4" stroke-linejoin="round"/>'
            f'<path d="{smooth(hl, closed=False)}" fill="none" stroke="{glo}" stroke-width="{max(2.2, w * .09):.1f}" '
            f'stroke-linecap="round" opacity=".5"/>')
    return g + f'<g mask="url(#lk{i})">{body}</g>'


def side_locks2(name, p, pal, ol):
    """옆(90°) — 앞모습에서 옮긴 머리칼 위에, 정수리에서 뒤 · 아래로 흐르는 덩어리를 얹는다(뒤의 것부터)."""
    T, E, N, C, F = p['T'], p['E'], p['N'], p['C'], p['F']
    X = lambda dx, y: (XN + dx, y)
    wild = 8 if name in ('m2', 'f2') else 0
    if not p['long']:
        L = [(X(40, T + 50), X(118, T + 60), X(132 + wild, E - 18), 60, 0, 1.0),
             (X(34, T + 64), X(112, E - 40), X(122 + wild, N + 2), 56, 0, .95),
             (X(26, T + 80), X(96, N - 30), X(98, C - 14), 52, 0, .92),
             (X(16, T + 92), X(80, N - 10), X(80, C - 4), 48, 0, .95),
             (X(6, T + 100), X(50, E + 10), X(54, N + 18), 42, 0, 1.0),
             (X(-4, T + 96), X(24, E - 40), X(26, E - 12), 40, 0, 1.05),
             (X(-16, T + 90), X(-14, E - 30), X(-8, E + 24), 36, 0, 1.05),
             (X(-30, T + 80), X(-40, F - 20), X(-40, F + 12), 34, 0, 1.08),
             (X(-40, T + 52), X(-92, T + 70), X(-106, F + 6), 42, 0, 1.1),
             (X(-30, T + 60), X(-70, F - 40), X(-80, F + 10), 38, 0, 1.08),
             (X(-20, T + 66), X(-50, F - 30), X(-58, F + 12), 34, 0, 1.05)]
    else:
        L = [(X(40, T + 44), X(128, T + 80), X(124 + wild, N + 50), 76, 3, .92),
             (X(30, T + 60), X(116, E), X(108, C + 50), 70, 4, .95),
             (X(16, T + 74), X(90, N), X(84, C + 60), 62, 6, .97),
             (X(2, T + 84), X(30, N), X(32, C + 50), 56, 5, 1.0),
             (X(-12, T + 84), X(-14, N), X(-20, C + 26), 46, 3, 1.04),
             (X(-40, T + 30), X(-108, T + 50), X(-106, F + 10), 50, 0, 1.12),
             (X(-30, T + 40), X(-84, T + 70), X(-86, F + 16), 46, 0, 1.1),
             (X(-20, T + 50), X(-60, F - 30), X(-62, F + 14), 40, 0, 1.07),
             (X(-10, T + 56), X(-36, F - 20), X(-40, F + 16), 34, 0, 1.04)]
    out = ''.join(lock2(r, c, t, w, pal, ol, wave=wv, tone=tn) for r, c, t, w, wv, tn in L)
    if p.get('band'):
        out += headband(p, ol)
    return out


def headband(p, ol):
    """거친 차림(남) — 이마를 두른 가죽 띠. 옆에서는 머리를 비스듬히 가로질러 뒤통수에서 매듭 · 두 가닥.
    띠 위로 앞머리 몇 가닥이 삐져 내려온다."""
    F = p['F']
    X = lambda dx, y: (XN + dx, y)
    top = [X(-110, F - 32), X(-60, F - 36), X(0, F - 36), X(60, F - 32), X(116, F - 26), X(126, F - 24)]
    bot = [X(128, F - 6), X(116, F - 7), X(60, F - 10), X(0, F - 12), X(-60, F - 10), X(-108, F - 8)]
    d = smooth(top + bot, k=.35)
    out = ''
    for (a_, b_, c_) in ((X(122, F - 16), X(150, F + 6), X(158, F + 52)), (X(118, F - 12), X(136, F + 20), X(134, F + 66))):
        out += (f'<path d="{smooth([a_, b_, c_], closed=False)}" fill="none" stroke="{ol}" stroke-width="12" stroke-linecap="round"/>'
                f'<path d="{smooth([a_, b_, c_], closed=False)}" fill="none" stroke="#5f4533" stroke-width="6" stroke-linecap="round"/>')
    out += f'<path d="{d}" fill="#5c4331" stroke="{ol}" stroke-width="4" stroke-linejoin="round"/>'
    out += (f'<path d="{smooth([X(-100, F - 28), X(-20, F - 30), X(60, F - 26), X(114, F - 20)], closed=False)}" fill="none" '
            f'stroke="#86684d" stroke-width="3" opacity=".7"/>')
    for k in range(-90, 110, 34):         # 해진 자국
        out += f'<path d="M{XN + k} {F - 30} l5 16" stroke="#2e2018" stroke-width="2.2" opacity=".55"/>'
    out += f'<ellipse cx="{XN + 124}" cy="{F - 15}" rx="10" ry="12" fill="#4e3829" stroke="{ol}" stroke-width="3.5"/>'
    # 띠 위로 흘러내린 앞머리
    pal = HAIR['m2']
    for r, c, t, w in (((XN - 70, F - 70), (XN - 90, F - 40), (XN - 98, F - 6), 26),
                       ((XN - 30, F - 76), (XN - 44, F - 40), (XN - 50, F - 4), 24),
                       ((XN + 20, F - 80), (XN + 22, F - 44), (XN + 16, F - 8), 22)):
        out += lock2(r, c, t, w, pal, ol, fade=.35, tone=1.08)
    return out


# ─────────────────────────────────────────────────────────────
# 뒷모습(180°) 머리 — 얼굴 자리를 덮는 뒤통수 머리칼 · 등 위로 흘러내린 긴 머리 (몸 틀, 앞모습과 같은 자리)
# ─────────────────────────────────────────────────────────────
def svg_back(name, p, pal, ol, box):
    """정수리 가마에서 목덜미로 부채처럼 흘러내리는 덩어리. box = 얼굴 자리 (x0, x1, y0, y1)."""
    T, E, N, C = p['T'], p['E'], p['N'], p['C']
    x0, x1, y0, y1 = box
    W = np.array([XN + 6, T + 52], float)
    cx = (x0 + x1) / 2
    if not p['long']:
        tips = [(x0 - 8, E + 6, 50), (x1 + 8, E + 6, 50), (x0 + 4, N + 12, 54), (x1 - 4, N + 12, 54),
                (x0 + 34, C - 8, 56), (x1 - 34, C - 8, 56), (cx - 26, C + 2, 58), (cx + 30, C + 2, 58), (cx + 2, C + 8, 56)]
    else:
        tips = [(x0 - 14, N + 30, 56), (x1 + 14, N + 30, 56), (x0 + 10, C + 36, 60), (x1 - 10, C + 36, 60),
                (cx - 40, C + 44, 62), (cx + 40, C + 44, 62), (cx, C + 50, 62)]
    s = ''
    for i, (tx, ty, w) in enumerate(tips):
        tip = np.array([tx, ty], float)
        d = tip - W
        d /= np.linalg.norm(d)
        root = W + d * 26
        mid = (root + tip) / 2
        out = mid - np.array([cx, mid[1]])
        side = np.sign(out[0]) if abs(out[0]) > 4 else 0
        ctrl = mid + np.array([side * 34, -10])            # 둥근 뒤통수를 따라 바깥으로 불룩
        s += lock2(tuple(root), tuple(ctrl), (tx, ty), w, pal, ol, fade=.2, wave=3 if p['long'] else 0,
                   tone=.94 + .03 * (i % 3))
    # 가운데 — 맨 위에 넓게 한 덩어리(가닥 사이 틈이 비지 않게)
    ty = C + (50 if p['long'] else 6)
    s += lock2((W[0], W[1] + 22), (cx + 6, (W[1] + ty) / 2), (cx - 4, ty), 78, pal, ol, fade=.24, wave=3 if p['long'] else 0, tone=1.0)
    # 윤기 — 가마 둘레의 고리 자리에 **결을 따라** 짧은 밝은 획(띠처럼 이어 긋지 않는다)
    glo = _hex(pal[3])
    for k in range(-4, 5):
        t = k * .19
        px, py = XN + 6 + 112 * np.sin(t), T + 100 - 30 * np.cos(t)
        d = np.array([px, py]) - W
        d /= np.linalg.norm(d)
        a0, a1 = (px - d[0] * 12, py - d[1] * 12), (px + d[0] * 14, py + d[1] * 14)
        s += (f'<path d="M{a0[0]:.1f} {a0[1]:.1f} L{a1[0]:.1f} {a1[1]:.1f}" stroke="{glo}" stroke-width="{6 - abs(k) * .5:.1f}" '
              f'stroke-linecap="round" opacity="{.5 - abs(k) * .04:.2f}"/>')
    return s


def svg_drape(name, p, pal, ol, half, jy):
    """긴 머리 — 등 위로 흘러내린 물결 덩어리(갑옷 위)."""
    bot = 540 if name.startswith('f') else 420
    s = ''
    xs = np.linspace(XN - half * 1.05, XN + half * 1.05, 7)
    order = [0, 6, 1, 5, 2, 4, 3]
    for i in order:
        x = xs[i]
        root = (XN + (x - XN) * .7, jy - 50)
        tip = (x + (x - XN) * .15, bot + (18 if i % 2 else 0) + (10 if name == 'f2' else 0))
        ctrl = ((root[0] + tip[0]) / 2 + (x - XN) * .25, (root[1] + tip[1]) / 2)
        s += lock2(root, ctrl, tip, 64, pal, ol, fade=.02, wave=7, tone=.9 + .04 * (i % 3))
    # 가는 가닥 몇 — 결을 살린다
    for i, x in enumerate(np.linspace(XN - half * .8, XN + half * .8, 4)):
        s += lock2((x, jy - 10), (x + 10, (jy + bot) / 2), (x - 6, bot - 20), 30, pal, ol, fade=.2, wave=9, tone=1.05)
    return s


def back_hair(name, H, jy, pal=None, tag=None):
    """→ (뒤통수 덩어리 RGBA, 등 머리칼 RGBA 또는 None) — 몸 틀 크기. pal: 머리색을 바꾼 몸(마을 사람)의 네 단."""
    p = PROF[name]
    pal = pal or HAIR[name]
    tag = tag or ('' if pal is HAIR[name] else '_%02x%02x%02x' % tuple(int(c) for c in pal[1]))
    ol = '#221612'
    fy, fx = np.where(H['face'] | H['ears']) if p['long'] else np.where(H['face'])
    box = (fx.min(), fx.max(), fy.min(), fy.max())
    os.makedirs(SVGDIR, exist_ok=True)
    o1 = os.path.join(SVGDIR, f'{name}{tag}_back.png')
    o2 = os.path.join(SVGDIR, f'{name}{tag}_drape.png')
    jobs = [(doc(svg_back(name, p, pal, ol, box)), o1)]
    if p['long']:
        jobs.append((doc(svg_drape(name, p, pal, ol, H['half'] * 1.25, jy)), o2))
    bake_svgs(jobs)
    back = np.asarray(Image.open(o1).convert('RGBA'))
    drape = np.asarray(Image.open(o2).convert('RGBA')) if p['long'] else None
    return back, drape


def svg_cut(p):
    """머리칼을 **지울** 자리(흰색) — 보이는 얼굴 · 얼굴 앞 · 목덜미 아래 · 귀."""
    B, E, N, Mo, C, F = p['B'], p['E'], p['N'], p['Mo'], p['C'], p['F']
    x = lambda dx: XN + dx
    if p['long']:
        pts = [(x(-30), F + 8), (x(-56), F - 2), (x(-84), F - 14), (x(-104), F - 30), (x(-260), F - 30), (x(-260), 900), (x(-40), 900),
               (x(-34), C + 40), (x(-26), C - 10), (x(-24), N), (x(-28), E - 20)]
    else:
        pts = [(x(10), E - 16), (x(-6), E - 24), (x(-12), E + 22), (x(-20), E + 20), (x(-26), E - 20),
               (x(-50), F), (x(-78), F - 6), (x(-260), F - 8), (x(-260), 900), (x(320), 900), (x(320), E - 30),
               (x(172), E - 30), (x(148), E - 18), (x(136), N - 6), (x(110), C - 16), (x(78), C - 6),
               (x(56), N + 22), (x(46), N + 4), (x(48), E - 10), (x(30), E - 20)]
    return f'<path d="{smooth(pts, k=.25)}" fill="#fff"/>'


def svg_helmcut(p):
    """투구를 지울 자리 — 눈부터 아래의 얼굴 앞쪽."""
    B, E, C = p['B'], p['E'], p['C']
    x = lambda dx: XN + dx
    pts = [(x(-50), B - 2), (x(-260), B - 2), (x(-260), 900), (x(-36), 900), (x(-36), C - 20), (x(-44), E + 20)]
    return f'<path d="{smooth(pts, k=.2)}" fill="#fff"/>'


def doc(inner):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{BW}" height="{BH}" viewBox="0 0 {BW} {BH}">{inner}</svg>'


def bake_svgs(jobs):
    os.makedirs(SVGDIR, exist_ok=True)
    lst = []
    for svg, out in jobs:
        sp = out[:-4] + '.svg'
        open(sp, 'w').write(svg)
        lst.append({'svg': sp, 'out': out, 'w': BW, 'h': BH})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(lst, open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env, stdout=subprocess.DEVNULL)


# ─────────────────────────────────────────────────────────────
# 머리칼 옮기기 — 앞모습(몸 틀) → 옆얼굴 자리
# ─────────────────────────────────────────────────────────────
def map_side(img):
    """가르마(x=384)를 정수리(XC)로, 가로로 K 배."""
    H, W = img.shape[:2]
    xx = np.arange(W, dtype=np.float32)
    xs = np.repeat(((xx - XC) / K + XN)[None, :], H, 0)
    ys = np.repeat(np.arange(H, dtype=np.float32)[:, None], W, 1)
    return cv2.remap(img, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def map_back(img):
    """긴 머리(몸 옆으로 흘러내린 것) → 등 뒤로. 오른쪽은 그대로 옮기고, 왼쪽은 뒤집어 겹친다."""
    right = img.copy()
    right[:, :XN] = 0
    left = img.copy()
    left[:, XN:] = 0
    left = left[:, ::-1]
    a = map_side(right).astype(np.float32) / 255
    b = map_side(np.ascontiguousarray(left)).astype(np.float32) / 255
    b[..., :3] *= .82                                  # 뒤쪽 머리칼은 조금 어둡게
    out = a.copy()
    out[..., :3] = a[..., :3] * a[..., 3:4] + b[..., :3] * b[..., 3:4] * (1 - a[..., 3:4])
    out[..., 3] = a[..., 3] + b[..., 3] * (1 - a[..., 3])
    out[..., :3] /= np.maximum(out[..., 3:4], 1e-4)
    return (out * 255).clip(0, 255).astype(np.uint8)


def over(dst, src):
    a = src[..., 3:4].astype(np.float32) / 255
    da = dst[..., 3:4].astype(np.float32) / 255
    oa = a + da * (1 - a)
    rgb = (src[..., :3] * a + dst[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6)
    return np.dstack([rgb, oa * 255]).clip(0, 255).astype(np.uint8)


def hairline(hair, cut, ol, w=3):
    """머리칼이 얼굴 · 귀와 닿는 가장자리에 짙은 선."""
    a = hair[..., 3] > 60
    edge = a & ndi.binary_dilation(cut & ~a, iterations=w)
    out = hair.copy()
    out[edge, :3] = (out[edge, :3] * .25 + np.array(ol) * .75).astype(np.uint8)
    return out


def build(name, BR, BV):
    """→ {'head': RGBA, 'hairside': RGBA 또는 None, 'helmcut': 마스크} (몸 틀 크기)."""
    p = PROF[name]
    im = BR.load_body(name)
    lab = BR.classify(im, BR.RIGS[name])
    col = colors(name, im, lab, BV)
    back, _ = BV.load_views(name)
    os.makedirs(SVGDIR, exist_ok=True)
    outs = {k: os.path.join(SVGDIR, f'{name}_{k}.png') for k in ('face', 'cut', 'helmcut', 'locks')}
    ol = _hex(col['ol'])
    bake_svgs([(doc(svg_face(p, col)), outs['face']), (doc(svg_cut(p)), outs['cut']), (doc(svg_helmcut(p)), outs['helmcut']),
               (doc(side_locks2(name, p, HAIR[name], ol)), outs['locks'])])
    face = np.asarray(Image.open(outs['face']).convert('RGBA'))
    cut = np.asarray(Image.open(outs['cut']).convert('RGBA'))[..., 3] > 127
    helmcut = np.asarray(Image.open(outs['helmcut']).convert('RGBA'))[..., 3] > 127
    locks = np.asarray(Image.open(outs['locks']).convert('RGBA'))
    # 머리칼 — 앞모습 머리. 얼굴 자리는 둘레 머리칼을 **흐리게** 번져 메운다(줄무늬가 서지 않게 — 위에 덩어리가 얹힌다)
    H = BV.head_info(name, im, lab)
    tex = im.copy()
    tex[lab != 1] = 0
    hole = (H['face'] | H['ears']) & (lab == 1)
    known = (lab == 1) & ~hole & (tex[..., 3] > 0)
    rgb = tex[..., :3].astype(np.float32) * known[..., None]
    wgt = known.astype(np.float32)
    blur = cv2.GaussianBlur(rgb, (0, 0), 28) / np.maximum(cv2.GaussianBlur(wgt, (0, 0), 28), 1e-4)[..., None]
    tex[hole, :3] = (blur[hole] * .85).clip(0, 255).astype(np.uint8)
    tex[hole, 3] = 255
    hair = map_side(tex)
    soft = cv2.GaussianBlur(cut.astype(np.float32), (0, 0), 1.0)
    hair[..., 3] = (hair[..., 3] * (1 - soft)).astype(np.uint8)
    hair = hairline(hair, cut, col['ol'])
    head = over(face, hair)
    if not p['long']:
        ear = face.copy()
        em = np.zeros((BH, BW), np.uint8)
        cv2.fillPoly(em, [np.array(ear_pts(p), np.int32)], 1)
        em = cv2.dilate(em, np.ones((7, 7), np.uint8)) > 0
        ear[~em] = 0
        head = over(head, ear)
    head = over(head, locks)
    side = None
    if p['long']:
        hb = im.copy()
        hb[lab != 3] = 0
        side = map_back(hb)
        side[..., :3] = (side[..., :3] * .92).astype(np.uint8)
        # 덩어리 가운데 턱 아래로 내려온 끝은 뒤로 흘러내린 머리(side)에 넣는다
        cut_y = p['C'] + 14
        low = head.copy()
        low[:cut_y] = 0
        low[..., 3] = np.where(face[..., 3] > 0, 0, low[..., 3])
        side = over(side, low)
        head[cut_y:] = np.where(face[cut_y:, :, 3:4] > 0, face[cut_y:], 0)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(head, 'RGBA').save(os.path.join(OUT, f'{name}_side_head.png'))
    if side is not None:
        Image.fromarray(side, 'RGBA').save(os.path.join(OUT, f'{name}_side_hair.png'))
    Image.fromarray((helmcut * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_side_helmcut.png'))
    return {'head': head, 'hairside': side, 'helmcut': helmcut}


def load(name, BR, BV):
    ph = os.path.join(OUT, f'{name}_side_head.png')
    if not os.path.exists(ph):
        return build(name, BR, BV)
    head = np.asarray(Image.open(ph).convert('RGBA'))
    ps = os.path.join(OUT, f'{name}_side_hair.png')
    side = np.asarray(Image.open(ps).convert('RGBA')) if os.path.exists(ps) else None
    helmcut = np.asarray(Image.open(os.path.join(OUT, f'{name}_side_helmcut.png'))) > 127
    return {'head': head, 'hairside': side, 'helmcut': helmcut}


def helmet(img, helmcut):
    """투구(앞모습 몸 틀) → 옆얼굴 자리. 얼굴 구멍을 메우고 옆얼굴 앞쪽만 비운다."""
    a = img[..., 3] > 100
    if not a.any():
        return img
    filled = ndi.binary_fill_holes(a)
    hole = filled & ~a
    out = img.copy()
    if hole.any():
        rgb = cv2.inpaint(np.ascontiguousarray(img[..., :3]), hole.astype(np.uint8), 9, cv2.INPAINT_TELEA)
        out[hole, :3] = rgb[hole]
        out[hole, 3] = 255
    out = map_side(out)
    soft = cv2.GaussianBlur(helmcut.astype(np.float32), (0, 0), 1.0)
    out[..., 3] = (out[..., 3] * (1 - soft)).astype(np.uint8)
    # 잘린 가장자리에 선
    m = out[..., 3] > 60
    edge = m & ndi.binary_dilation(helmcut & ~m, iterations=3)
    out[edge, :3] = (out[edge, :3] * .3 + np.array([26, 18, 16]) * .7).astype(np.uint8)
    return out


if __name__ == '__main__':
    def _load(n, f):
        sp = importlib.util.spec_from_file_location(n, os.path.join(ROOT, 'tools', f))
        m = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(m)
        return m
    BV = _load('body_views', 'body-views.py')
    BR = BV.BR
    names = [a for a in sys.argv[1:] if a in PROF] or list(PROF)
    tiles = []
    for n in names:
        r = build(n, BR, BV)
        im = BR.load_body(n)
        comp = Image.new('RGBA', (BW, BH))
        if r['hairside'] is not None:
            comp.alpha_composite(Image.fromarray(r['hairside']))
        comp.alpha_composite(Image.fromarray(r['head']))
        tiles += [Image.fromarray(im).crop((180, 40, 600, 420)), comp.crop((180, 40, 600, 420))]
        print('✓', n)
    sheet = Image.new('RGBA', (420 * len(tiles), 380), (80, 100, 122, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t, (i * 420, 0))
    sheet.save(os.path.join(ROOT, 'art', 'preview', 'body-profile.png'))
