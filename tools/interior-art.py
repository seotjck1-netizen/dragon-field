#!/usr/bin/env python3
"""
집 안 · 성 안 새 그림 (0.70.30) — 마루 · 벽 · 침대 · 탁자 · 의자 · 선반 · 옷장 · 벽난로 · 가마솥 · 계산대 · 책상 ·
창 · 문턱 · 대장간 화덕 · 모루 · 무기 진열대 · 갑옷 진열대 · 성 기둥.

    python3 tools/interior-art.py              # → assets/tiles/*.png · manifest · painted.json
    python3 tools/interior-art.py --preview    # art/preview/interior-art.png 만

── 왜 ────────────────────────────────────────────────────
  마을(tools/town-art.py)은 0.70.30 에 한 채씩 새로 지었는데, 문을 열고 들어가면 0.70.3 의 납작한 그림
  (테두리 없는 도형)이 그대로였다 — 사람 · 몬스터 · 마을과 다른 게임처럼 보였다. 같은 붓
  (짙은 테두리 · 셀 음영 · 왼쪽 위 빛)으로 다시 그린다.

── 지킨 것 ─────────────────────────────────────────────────
  · 그림 크기(manifest 의 w · h)는 **예전과 같다** — 지도 · 발자리 · 막는 칸이 그대로다.
    (예외: 성 기둥은 한 칸짜리 몽당 기둥이 사람 무릎만 해서, 사람보다 큰 기둥 `tile_castle_pillar_big` 을
     새로 세우고 FieldScene.TALL 에 넣었다 — 뒤로 돌아가면 가린다)
  · 바닥 · 벽은 이어 붙여도 이음새가 없다(칸 경계를 넘는 무늬는 반대쪽에도 똑같이 그린다).
    **한 칸 전체를 가로지르는 그라데이션은 넣지 않는다**(이어 붙이면 줄무늬가 된다 — tools/art-room.js 의 교훈).
  · 침대 머리(tile_bed)와 발치(tile_bed_foot)는 **한 장으로 그려 반으로 자른다** — 이불이 이어진다.
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
_sp = importlib.util.spec_from_file_location('town_art', os.path.join(ROOT, 'tools', 'town-art.py'))
TW = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(TW)
TA, GA = TW.TA, TW.GA
OL = GA.OL
smooth_path, poly_path, clip, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.uid
P, F, L, T, shadow, blob = TA.P, TA.F, TA.L, TA.T, TA.shadow, TA.blob
PAL = TA.PAL
K = 4
LW = 7
SVGDIR = os.path.join(ROOT, 'art', 'interior', '_svg')
OUT = os.path.join(ROOT, 'assets', 'tiles')

PAL.update({
    'woodR': ('#8a5a34', '#b7834f', '#6a4224', '#452a14'),
    'woodH': ('#c08a50', '#e8b87c', '#9a6a38', '#6a4622'),
    'woodF': ('#b98552', '#d9a86f', '#a07042', '#7a5230'),
    'linen': ('#f2eee4', '#ffffff', '#d6cfc0', '#a8a090'),
    'quilt': ('#b8404a', '#e0707a', '#8e2c36', '#5e1a22'),
    'quiltB': ('#3f6aa8', '#6f9ad8', '#2e5088', '#1e365e'),
    'brass': ('#d8a640', '#ffe08a', '#a87a20', '#704e10'),
    'ironK': ('#3a3d44', '#666b75', '#26282d', '#151619'),
    'brew': ('#5ad86a', '#c8ffb8', '#34a848', '#1c6c2c'),
    'stoneC': ('#a9aec0', '#dde1ec', '#7f8498', '#585c6c'),
    'stoneF': ('#9b968c', '#c9c4b8', '#76716a', '#524e48'),
    'plasterI': ('#ecdfc4', '#fbf3e2', '#d6c6a4', '#b4a07c'),
    'curtain': ('#a83a44', '#d8646c', '#7e2630', '#541820'),
    'rug': ('#9c2f2c', '#c8524a', '#74201e', '#4c1412'),
    'leather': ('#7a4a2c', '#a8704a', '#5a3420', '#3a2014'),
    'steel': ('#b8c0cc', '#eef2f8', '#8a94a4', '#5e6878'),
    'potR': ('#d84a5a', '#ff9aa4', '#a82a3a', '#701824'),
    'potB': ('#4a8ad8', '#a4d0ff', '#2a62a8', '#1a3e70'),
    'potG': ('#5ac86a', '#b4f4b0', '#34984a', '#1c602c'),
    'book1': ('#8a2f2f', '#b85a50', '#661f1f', '#421212'),
    'book2': ('#2f5a8a', '#5a86b8', '#1f4266', '#122a42'),
    'book3': ('#3f7a3a', '#6aa85e', '#2c5a28', '#1a3a18'),
})
TA.TDEFS = (TA._grads()
            + '<filter id="tblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
            + '<filter id="glow12" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12"/></filter>'
            + '<filter id="glow24" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="24"/></filter>'
            + '<filter id="soft3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>')


def hx(mat, i=0):
    return PAL[mat][i]


def R(x0, y0, x1, y1):
    return poly_path([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def box(x0, y0, x1, y1, mat, kind='tv', w=LW):
    return P(R(x0, y0, x1, y1), T(mat, kind), w)


def bevel(x0, y0, x1, y1, mat, k=6, op=.75):
    """판 안쪽 테 — 위 · 왼쪽 밝게, 아래 · 오른쪽 어둡게(빛은 왼쪽 위)."""
    return (L(f'M{x0 + k} {y1 - k} L{x0 + k} {y0 + k} L{x1 - k} {y0 + k}', hx(mat, 1), 4, op)
            + L(f'M{x1 - k} {y0 + k} L{x1 - k} {y1 - k} L{x0 + k} {y1 - k}', hx(mat, 3), 4, op))


def fit(body, cx, base, k):
    """발밑(cx, base)을 붙박고 k 배로 줄인다 — 위로 삐져나가는 것(투구 깃 · 창끝 · 망치)을 틀 안에 넣는다."""
    return f'<g transform="translate({cx} {base}) scale({k}) translate({-cx} {-base})">{body}</g>'


def flame(cx, base, h, w, glow=True):
    s = ''
    if glow:
        s += f'<ellipse cx="{cx}" cy="{base - h * .45}" rx="{w * 2.2}" ry="{h * 1.1}" fill="#ffb040" opacity=".45" filter="url(#glow12)"/>'
    s += P(f'M{cx} {base - h} C{cx + w * .9} {base - h * .55} {cx + w} {base - h * .15} {cx} {base} '
           f'C{cx - w} {base - h * .15} {cx - w * .9} {base - h * .55} {cx} {base - h} Z', '#ff8a24', 4)
    s += F(f'M{cx} {base - h * .7} C{cx + w * .5} {base - h * .4} {cx + w * .55} {base - h * .1} {cx} {base - 3} '
           f'C{cx - w * .55} {base - h * .1} {cx - w * .5} {base - h * .4} {cx} {base - h * .7} Z', '#ffe27a')
    return s


def bottle(cx, base, h, w, mat, cork=True):
    d = smooth_path([(cx - w * .2, base - h), (cx + w * .2, base - h), (cx + w * .22, base - h * .62), (cx + w * .5, base - h * .4),
                     (cx + w * .5, base), (cx - w * .5, base), (cx - w * .5, base - h * .4), (cx - w * .22, base - h * .62)], k=.2)
    s = P(d, T(mat, 'tr'), 4)
    s += F(R(cx - w * .5 + 4, base - h * .32, cx + w * .5 - 4, base - 4), hx(mat, 2), .45)
    s += L(f'M{cx - w * .3} {base - h * .36} L{cx - w * .3} {base - h * .1}', '#ffffff', 4, .7)
    if cork:
        s += P(R(cx - w * .2, base - h - 12, cx + w * .2, base - h + 2), hx('woodH', 0), 3)
    return s


def book(x, base, w, h, mat, lean=0):
    d = poly_path([(x, base), (x + w, base), (x + w + lean, base - h), (x + lean, base - h)])
    s = P(d, T(mat, 'tv'), 4)
    s += L(f'M{x + 3 + lean * .2} {base - h * .25} L{x + w - 3 + lean * .2} {base - h * .25}', hx('brass', 1), 3, .8)
    s += L(f'M{x + 3 + lean * .8} {base - h * .75} L{x + w - 3 + lean * .8} {base - h * .75}', hx('brass', 1), 3, .8)
    return s


# ═════════════════════════════════════════════════════════════
# 바닥 · 벽 (이어 붙이는 칸 — 테두리 없이, 칸 경계를 넘는 무늬는 반대쪽에도)
# ═════════════════════════════════════════════════════════════
TS = 64 * K          # 한 칸(파일 64px) — 캔버스 256


def floor(v):
    """마루 — **세로로** 눕힌 널 세 장(88 · 88 · 80). 이음매는 옅게, 널 끝(가로 마디)은 널마다 다른 높이."""
    rng = random.Random(70 + v)
    xs = [0, 88, 176, 256]
    tones = [('#b4804c', '#a87644', '#bc8a54'), ('#ad7a47', '#b8844f', '#a37143'), ('#b7834e', '#a97745', '#b1804b')][v % 3]
    s = f'<rect width="{TS}" height="{TS}" fill="#a87543"/>'
    for i in range(3):
        x0, x1 = xs[i], xs[i + 1]
        s += f'<rect x="{x0}" y="0" width="{x1 - x0}" height="{TS}" fill="{tones[i]}"/>'
        # 나뭇결 — 위에서 아래로 끊기지 않게(시작 · 끝의 x 가 같다)
        for g in range(4):
            gx = x0 + 10 + (x1 - x0 - 20) * (g + .5) / 4 + rng.uniform(-6, 6)
            amp = rng.uniform(2, 5)
            ph = rng.uniform(0, 6.28)
            pts = ' '.join(f'{gx + amp * math.sin(ph + 2 * math.pi * k / 8):.1f},{TS * k / 8:.1f}' for k in range(9))
            s += f'<polyline points="{pts}" fill="none" stroke="#7a4e28" stroke-width="2" opacity="{rng.uniform(.18, .3):.2f}"/>'
        s += L(f'M{x0 + 3} 0 L{x0 + 3} {TS}', '#e2b47c', 3, .45)          # 널 왼쪽 빛
        # 널 끝 마디 — 널 셋 가운데 하나쯤만(널은 칸보다 길다), 널마다 다른 높이, 못 두 개
        jy = rng.uniform(30, TS - 30)
        if (i + v) % 3 == 1 or rng.random() < .25:
            s += L(f'M{x0 + 2} {jy:.1f} L{x1 - 2} {jy:.1f}', '#6a4222', 3, .55)
            s += L(f'M{x0 + 2} {jy + 3:.1f} L{x1 - 2} {jy + 3:.1f}', '#e0b07a', 2, .35)
            for nx in (x0 + 12, x1 - 12):
                s += f'<circle cx="{nx}" cy="{jy - 8:.1f}" r="3" fill="#5a3a20" opacity=".6"/><circle cx="{nx}" cy="{jy + 11:.1f}" r="3" fill="#5a3a20" opacity=".6"/>'
        # 옹이(가끔)
        if rng.random() < .45:
            kx, ky = rng.uniform(x0 + 22, x1 - 22), rng.uniform(40, TS - 40)
            for rr, op in ((12, .25), (7, .35), (3, .5)):
                s += f'<ellipse cx="{kx:.1f}" cy="{ky:.1f}" rx="{rr * .7:.1f}" ry="{rr * 1.4:.1f}" fill="none" stroke="#6a4222" stroke-width="2" opacity="{op}"/>'
    for x in xs[:-1]:                                                    # 이음매(왼쪽 변 = 이웃 칸의 오른쪽 변)
        s += f'<rect x="{x - 1.5}" y="0" width="3" height="{TS}" fill="#5a3a1e" opacity=".55"/>'
    s += f'<rect x="{TS - 1.5}" y="0" width="3" height="{TS}" fill="#5a3a1e" opacity=".55"/>'
    return s, TS, TS


def plaster_bg(seed, w=TS, h=TS):
    """회벽 — 평평한 밑색 + 칸 안에서 닫히는 얼룩(가장자리에 닿지 않게)."""
    rng = random.Random(seed)
    s = f'<rect width="{w}" height="{h}" fill="{hx("plasterI", 0)}"/>'
    for _ in range(14):
        x, y = rng.uniform(24, w - 24), rng.uniform(24, h - 24)
        r = rng.uniform(8, 18)
        col = hx('plasterI', 2) if rng.random() < .6 else hx('plasterI', 1)
        s += f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r:.1f}" ry="{r * .7:.1f}" fill="{col}" opacity="{rng.uniform(.18, .32):.2f}"/>'
    for _ in range(3):                                                   # 잔금
        x, y = rng.uniform(30, w - 60), rng.uniform(30, h - 60)
        s += L(f'M{x:.1f} {y:.1f} l{rng.uniform(8, 18):.1f} {rng.uniform(6, 14):.1f} l{rng.uniform(4, 10):.1f} {rng.uniform(-4, 8):.1f}', hx('plasterI', 3), 2, .35)
    return s


def wall_back():
    """뒷벽(아래가 마루) — 회벽 + 나무 징두리 판 + 굽도리. 가로로 이어진다."""
    s = plaster_bg(11)
    y0, y1, yb = 136, 228, 256
    s += f'<rect x="0" y="{y0 - 6}" width="{TS}" height="8" fill="#7a5a3a" opacity=".22"/>'         # 위 띠의 그늘
    s += f'<rect x="0" y="{y0}" width="{TS}" height="{y1 - y0}" fill="{hx("woodR", 0)}"/>'
    s += f'<rect x="0" y="{y0}" width="{TS}" height="16" fill="{hx("woodR", 1)}"/>'                  # 윗 난간
    s += L(f'M0 {y0} L{TS} {y0}', OL, 6) + L(f'M0 {y0 + 16} L{TS} {y0 + 16}', hx('woodR', 3), 4)
    # 판 하나(칸마다) — 들어간 판의 테
    px0, px1, py0, py1 = 26, TS - 26, y0 + 32, y1 - 16
    s += f'<rect x="{px0}" y="{py0}" width="{px1 - px0}" height="{py1 - py0}" fill="{hx("woodR", 2)}" opacity=".55"/>'
    s += bevel(px0, py0, px1, py1, 'woodR', 0, .9)
    s += f'<rect x="-2" y="{y0 + 16}" width="5" height="{y1 - y0 - 16}" fill="{hx("woodR", 3)}" opacity=".8"/>'  # 칸 사이 세로 기둥 선
    s += f'<rect x="{TS - 3}" y="{y0 + 16}" width="5" height="{y1 - y0 - 16}" fill="{hx("woodR", 3)}" opacity=".8"/>'
    # 굽도리
    s += f'<rect x="0" y="{y1}" width="{TS}" height="{yb - y1}" fill="{hx("woodR", 3)}"/>'
    s += L(f'M0 {y1} L{TS} {y1}', OL, 6) + L(f'M0 {y1 + 6} L{TS} {y1 + 6}', hx('woodR', 1), 3, .55)
    return s, TS, TS


def wall_in():
    return plaster_bg(23), TS, TS


def wall_side(right):
    """옆벽 — 회벽 + 방 쪽 변을 따라 세로 나무 띠. 세로로 이어진다. right: 띠가 오른쪽(방이 오른쪽)."""
    s = plaster_bg(31 if right else 37)
    xa, xb = (188, 236) if right else (20, 68)
    s += f'<rect x="{xa}" y="0" width="{xb - xa}" height="{TS}" fill="{hx("woodR", 0)}"/>'
    s += f'<rect x="{xa if right else xb - 12}" y="0" width="12" height="{TS}" fill="{hx("woodR", 1)}" opacity=".8"/>'
    edge_in, edge_out = (xa, xb) if right else (xb, xa)
    s += L(f'M{edge_in} 0 L{edge_in} {TS}', OL, 6)
    s += f'<rect x="{xb if right else 0}" y="0" width="{TS - xb if right else xa}" height="{TS}" fill="{hx("woodR", 3)}"/>'
    s += L(f'M{edge_out} 0 L{edge_out} {TS}', OL, 5)
    for y in (64, 192):                                                   # 띠의 나뭇결 마디
        s += L(f'M{xa + 6} {y} L{xb - 6} {y}', hx('woodR', 3), 3, .5)
    return s, TS, TS


def room_exit():
    """문턱 — 마루 위에 엮은 깔개와 문틀 그늘(밖으로 나가는 자리)."""
    s, _, _ = floor(0)
    s += f'<rect x="0" y="0" width="{TS}" height="40" fill="#2a1a10" opacity=".55"/>'
    s += P(R(14, 8, TS - 14, 30), T('woodR', 'tv'), 5)
    mat = smooth_path([(40, 70), (TS - 40, 70), (TS - 30, 200), (30, 200)], k=.08)
    s += P(mat, T('rug', 'tv'), 6)
    for y in (100, 130, 160):
        s += L(f'M48 {y} L{TS - 48} {y}', hx('brass', 0), 4, .7)
    for x in range(44, TS - 40, 16):
        s += L(f'M{x} 200 L{x} 216', hx('rug', 1), 4, .9)
    return s, TS, TS


# ═════════════════════════════════════════════════════════════
# 가구 (발밑을 칸 아래 변에 세운다 — FieldScene.GROWN)
# ═════════════════════════════════════════════════════════════
def bed_full():
    """침대 한 채(머리 + 발치) — 파일 84×128, 반으로 잘라 둘로 쓴다."""
    W_, H_ = 84 * K, 128 * K
    cx = W_ / 2
    x0, x1 = 40, W_ - 40
    base = H_ - 22
    s = shadow(cx, base - 6, 150, 22, .32)
    # 머리판
    hb = smooth_path([(x0 - 6, 150), (x0 - 6, 70), (cx - 60, 40), (cx + 60, 40), (x1 + 6, 70), (x1 + 6, 150)], k=.25)
    s += P(hb, T('woodR', 'tv'))
    s += P(R(x0 - 20, 44, x0 + 6, 230), T('woodR', 'tv'), 6) + P(R(x1 - 6, 44, x1 + 20, 230), T('woodR', 'tv'), 6)
    for x in (x0 - 7, x1 + 7):
        s += f'<circle cx="{x}" cy="38" r="15" fill="{hx("woodH", 0)}" stroke="{OL}" stroke-width="5"/>'
    s += F(R(cx - 70, 70, cx + 70, 120), hx('woodR', 2), .55) + bevel(cx - 70, 70, cx + 70, 120, 'woodR', 0)
    # 매트 · 이불(머리 쪽 접힌 흰 홑이불 → 붉은 누빈 이불)
    frame = R(x0, 130, x1, base - 70)
    s += P(frame, hx('linen', 2), 6)
    s += P(smooth_path([(x0 + 26, 150), (cx - 6, 140), (cx - 6, 220), (x0 + 22, 226)], k=.35), T('linen', 'tr'), 5)  # 베개
    s += P(smooth_path([(cx + 6, 140), (x1 - 26, 150), (x1 - 22, 226), (cx + 6, 220)], k=.35), T('linen', 'tr'), 5)
    sheet = R(x0 + 2, 238, x1 - 2, 286)
    s += P(sheet, T('linen', 'tv'), 5)
    quilt = smooth_path([(x0 - 8, 280), (x1 + 8, 280), (x1 + 12, base - 60), (x0 - 12, base - 60)], k=.06)
    s += P(quilt, T('quilt', 'tv'))
    inner = ''
    for y in range(316, int(base - 70), 44):                               # 누빔 마름모
        for x in range(int(x0 + 22), int(x1), 52):
            inner += L(f'M{x} {y} l22 18 l-22 18 l-22 -18 Z', hx('quilt', 3), 3, .6)
            inner += f'<circle cx="{x}" cy="{y + 18}" r="3" fill="{hx("quilt", 1)}" opacity=".9"/>'
    inner += F(R(x1 - 30, 280, x1 + 20, base), hx('quilt', 3), .35)
    s += clip(uid('qt'), quilt, inner) + L(quilt, OL, LW)
    s += L(f'M{x0 - 4} 292 L{x1 + 4} 292', hx('linen', 1), 7, .9) + L(f'M{x0 - 4} 300 L{x1 + 4} 300', OL, 4, .6)
    # 발치판
    fb = R(x0 - 14, base - 76, x1 + 14, base - 24)
    s += P(fb, T('woodR', 'tv')) + bevel(x0 - 14, base - 76, x1 + 14, base - 24, 'woodR', 8)
    for x in (x0 - 14, x1 - 6):
        s += P(R(x, base - 90, x + 20, base - 4), T('woodR', 'tv'), 6)
    return s, W_, H_


def table():
    W_, H_ = 102 * K, 102 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 150, 26, .3)
    s += P(poly_path([(cx - 22, base - 150), (cx + 22, base - 150), (cx + 28, base - 30), (cx - 28, base - 30)]), T('woodR', 'tv'))
    s += P(f'M{cx - 90} {base - 4} Q{cx} {base - 54} {cx + 90} {base - 4} Z', T('woodR', 'tv'), 6)
    rim = f'M{cx - 168} {base - 196} a168 58 0 1 0 336 0 L{cx + 168} {base - 176} a168 58 0 1 1 -336 0 Z'
    s += P(rim, T('woodR', 'tv'))
    top = f'M{cx - 168} {base - 196} a168 58 0 1 0 336 0 a168 58 0 1 0 -336 0'
    s += P(top, T('woodH', 'tr'))
    s += L(f'M{cx - 120} {base - 214} Q{cx} {base - 250} {cx + 120} {base - 214}', hx('woodH', 1), 4, .7)
    s += L(f'M{cx - 130} {base - 186} Q{cx} {base - 150} {cx + 140} {base - 190}', hx('woodH', 3), 3, .5)
    # 촛대 · 초 · 불
    s += P(f'M{cx - 34} {base - 186} a34 11 0 1 0 68 0 a34 11 0 1 0 -68 0', T('brass', 'tr'), 5)
    s += P(R(cx - 12, base - 262, cx + 12, base - 188), T('linen', 'tv'), 5)
    s += flame(cx, base - 266, 40, 13)
    # 잔
    mx = cx + 92
    s += P(R(mx - 22, base - 236, mx + 22, base - 184), T('woodH', 'tv'), 5)
    s += P(f'M{mx + 22} {base - 226} q22 4 0 30', 'none', 6)
    s += F(f'M{mx - 18} {base - 232} a18 6 0 1 0 36 0 a18 6 0 1 0 -36 0', '#e8c070')
    return s, W_, H_


def chair():
    W_, H_ = 86 * K, 86 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 96, 18, .3)
    for x in (cx - 82, cx + 62):                                          # 뒷다리 + 등받이 기둥
        s += P(R(x, base - 300, x + 20, base - 8), T('woodR', 'tv'), 6)
    s += P(smooth_path([(cx - 88, base - 300), (cx - 60, base - 320), (cx + 60, base - 320), (cx + 88, base - 300), (cx + 86, base - 268), (cx - 86, base - 268)], k=.2), T('woodR', 'tv'))
    for x in (cx - 40, cx, cx + 40):                                      # 등받이 살
        s += P(R(x - 9, base - 270, x + 9, base - 156), T('woodH', 'tv'), 5)
    s += P(R(cx - 92, base - 162, cx + 92, base - 126), T('woodH', 'tv'))  # 앉는 판(앞모서리)
    s += P(poly_path([(cx - 92, base - 162), (cx + 92, base - 162), (cx + 80, base - 196), (cx - 80, base - 196)]), T('woodH', 'tr'))
    for x in (cx - 88, cx + 68):
        s += P(R(x, base - 128, x + 20, base), T('woodR', 'tv'), 6)
    s += L(f'M{cx - 70} {base - 60} L{cx + 70} {base - 60}', OL, 12) + L(f'M{cx - 70} {base - 60} L{cx + 70} {base - 60}', hx('woodR', 0), 6)
    return s, W_, H_


def shelf():
    W_, H_ = 90 * K, 90 * K
    cx, base = W_ / 2, H_ - 24
    x0, x1, top = cx - 160, cx + 160, base - 320
    s = shadow(cx, base - 4, 170, 20, .3)
    s += P(R(x0, top, x1, base - 6), T('woodR', 'tv'))
    s += F(R(x0 + 18, top + 22, x1 - 18, base - 30), '#3a2414', .85)
    rng = random.Random(5)
    for k, sy in enumerate((top + 140, top + 268)):
        s += P(R(x0 + 10, sy, x1 - 10, sy + 18), T('woodH', 'tv'), 5)
        x = x0 + 30
        while x < x1 - 50:
            r = rng.random()
            if r < .45:
                w, h = rng.uniform(18, 26), rng.uniform(70, 100)
                s += book(x, sy, w, h, rng.choice(['book1', 'book2', 'book3']), rng.choice([0, 0, 8]))
                x += w + 4
            elif r < .8:
                w = rng.uniform(34, 44)
                s += bottle(x + w / 2, sy, rng.uniform(70, 90), w, rng.choice(['potR', 'potB', 'potG']))
                x += w + 10
            else:
                w = 46
                s += P(f'M{x} {sy} L{x + 4} {sy - 52} Q{x + w / 2} {sy - 66} {x + w - 4} {sy - 52} L{x + w} {sy} Z', T('stoneF', 'tr'), 4)
                x += w + 10
    s += P(R(x0 - 10, top - 18, x1 + 10, top + 8), T('woodH', 'tv'))     # 갓돌(위 판)
    s += L(f'M{x0 + 6} {base - 6} L{x0 + 6} {top}', hx('woodR', 1), 4, .6)
    return s, W_, H_


def wardrobe():
    W_, H_ = 84 * K, 112 * K
    cx, base = W_ / 2, H_ - 22
    x0, x1, top = cx - 146, cx + 146, base - 400
    s = shadow(cx, base - 4, 156, 20, .32)
    s += P(R(x0, top, x1, base - 18), T('woodR', 'tv'))
    for xa, xb in ((x0 + 16, cx - 4), (cx + 4, x1 - 16)):
        s += P(R(xa, top + 40, xb, base - 46), T('woodR', 'tg'), 5)
        s += F(R(xa + 22, top + 70, xb - 22, top + 190), hx('woodR', 2), .6) + bevel(xa + 22, top + 70, xb - 22, top + 190, 'woodR', 0)
        s += F(R(xa + 22, top + 220, xb - 22, base - 80), hx('woodR', 2), .6) + bevel(xa + 22, top + 220, xb - 22, base - 80, 'woodR', 0)
    for x in (cx - 22, cx + 22):
        s += f'<circle cx="{x}" cy="{top + 205}" r="10" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    s += P(poly_path([(x0 - 18, top + 6), (x1 + 18, top + 6), (x1 + 6, top - 30), (x0 - 6, top - 30)]), T('woodH', 'tv'))  # 갓
    s += P(R(x0 - 6, base - 46, x1 + 6, base - 16), T('woodR', 'tv'), 6)
    for x in (x0 + 4, x1 - 34):
        s += P(R(x, base - 20, x + 30, base), T('woodR', 'tv'), 5)
    return s, W_, H_


def fireplace():
    W_, H_ = 96 * K, 96 * K
    cx, base = W_ / 2, H_ - 20
    x0, x1, top = cx - 168, cx + 168, base - 340
    s = shadow(cx, base - 4, 176, 18, .3)
    body = R(x0, top + 40, x1, base - 6)
    s += P(body, T('stoneF', 'tv'))
    inner = ''
    rng = random.Random(3)
    for r, y in enumerate(range(int(top + 40), int(base), 44)):          # 돌 쌓은 줄눈
        inner += L(f'M{x0} {y} L{x1} {y}', hx('stoneF', 3), 4, .7)
        off = (r % 2) * 40
        for x in range(int(x0) + off, int(x1), 80):
            inner += L(f'M{x} {y} L{x} {y + 44}', hx('stoneF', 3), 4, .7)
            inner += F(R(x + 6, y + 6, x + 34, y + 14), hx('stoneF', 1), .5)
    s += clip(uid('fp'), body, inner) + L(body, OL, LW)
    arch = f'M{cx - 110} {base - 6} L{cx - 110} {base - 150} Q{cx - 110} {base - 236} {cx} {base - 236} Q{cx + 110} {base - 236} {cx + 110} {base - 150} L{cx + 110} {base - 6} Z'
    s += P(arch, '#1e120c')
    s += f'<ellipse cx="{cx}" cy="{base - 70}" rx="120" ry="90" fill="#ff8a30" opacity=".35" filter="url(#glow24)"/>'
    for a in (-1, 1):                                                     # 장작
        s += P(poly_path([(cx - 80, base - 20 - (a + 1) * 6), (cx + 80, base - 20 - (1 - a) * 6), (cx + 76, base - 44), (cx - 76, base - 44)]), T('wood', 'tv'), 5)
    s += flame(cx - 30, base - 40, 110, 34, glow=False) + flame(cx + 34, base - 40, 90, 28, glow=False) + flame(cx, base - 44, 140, 40)
    s += P(R(x0 - 22, top + 12, x1 + 22, top + 48), T('woodR', 'tv'))  # 선반(벽난로 위 판)
    s += P(R(cx - 40, top - 40, cx - 8, top + 12), T('brass', 'tv'), 4) + P(R(cx + 60, top - 22, cx + 96, top + 12), T('potB', 'tv'), 4)
    return s, W_, H_


def cauldron():
    W_, H_ = 100 * K, 100 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 170, 22, .32)
    s += f'<ellipse cx="{cx}" cy="{base - 30}" rx="110" ry="40" fill="#ff8a30" opacity=".4" filter="url(#glow24)"/>'
    for a in (-1, 1):
        s += P(poly_path([(cx - 90, base - 20 - (a + 1) * 6), (cx + 90, base - 20 - (1 - a) * 6), (cx + 86, base - 40), (cx - 86, base - 40)]), T('wood', 'tv'), 5)
    s += flame(cx - 40, base - 36, 70, 24, False) + flame(cx + 40, base - 36, 64, 22, False) + flame(cx, base - 40, 86, 28)
    for x in (cx - 120, cx + 100):
        s += P(poly_path([(x, base - 120), (x + 20, base - 120), (x + 26, base - 20), (x + 6, base - 20)]), T('ironK', 'tv'), 5)
    pot = smooth_path([(cx - 150, base - 280), (cx + 150, base - 280), (cx + 170, base - 190), (cx + 110, base - 96), (cx - 110, base - 96), (cx - 170, base - 190)], k=.32)
    s += P(pot, T('ironK', 'tr'))
    s += clip(uid('cd'), pot, F(R(cx + 40, base - 300, cx + 200, base - 80), hx('ironK', 3), .5)
              + L(f'M{cx - 120} {base - 236} Q{cx - 140} {base - 170} {cx - 90} {base - 120}', hx('ironK', 1), 8, .6))
    s += P(f'M{cx - 160} {base - 282} a160 40 0 1 0 320 0 a160 40 0 1 0 -320 0', T('ironK', 'tv'))
    brew = f'M{cx - 136} {base - 282} a136 30 0 1 0 272 0 a136 30 0 1 0 -272 0'
    s += f'<ellipse cx="{cx}" cy="{base - 300}" rx="170" ry="70" fill="#7aff8a" opacity=".35" filter="url(#glow24)"/>'
    s += P(brew, T('brew', 'tr'), 5)
    rng = random.Random(8)
    for _ in range(7):
        x, y, r = cx + rng.uniform(-100, 100), base - 282 + rng.uniform(-14, 14), rng.uniform(7, 16)
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{hx("brew", 1)}" stroke="{hx("brew", 3)}" stroke-width="3"/>'
    for x, y, r in ((cx - 30, base - 340, 16), (cx + 20, base - 372, 12), (cx - 6, base - 396, 9)):
        s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="#c8ffd0" opacity=".55"/>'
    for x in (cx - 150, cx + 150):
        s += f'<circle cx="{x}" cy="{base - 266}" r="14" fill="none" stroke="{OL}" stroke-width="10"/><circle cx="{x}" cy="{base - 266}" r="14" fill="none" stroke="{hx("ironK", 1)}" stroke-width="4"/>'
    return s, W_, H_


def counter():
    """계산대 한 칸 — 가로로 이어진다(왼쪽 · 오른쪽 변에는 테두리가 없다)."""
    s = ''
    top0, top1, front1 = 70, 116, 236
    s += f'<rect x="0" y="{front1}" width="{TS}" height="{TS - front1}" fill="#1a0e06" opacity=".25" filter="url(#soft3)"/>'
    s += f'<rect x="0" y="{top1}" width="{TS}" height="{front1 - top1}" fill="{hx("woodR", 0)}"/>'
    for x in (0, 64, 128, 192):                                          # 앞판 세로 널
        s += f'<rect x="{x}" y="{top1}" width="3" height="{front1 - top1}" fill="{hx("woodR", 3)}" opacity=".8"/>'
        s += f'<rect x="{x + 4}" y="{top1}" width="3" height="{front1 - top1}" fill="{hx("woodR", 1)}" opacity=".5"/>'
    s += f'<rect x="0" y="{front1 - 22}" width="{TS}" height="22" fill="{hx("woodR", 3)}"/>'
    s += f'<rect x="0" y="{top0}" width="{TS}" height="{top1 - top0}" fill="{hx("woodH", 0)}"/>'          # 윗판
    s += f'<rect x="0" y="{top0}" width="{TS}" height="10" fill="{hx("woodH", 1)}"/>'
    s += f'<rect x="0" y="{top1 - 12}" width="{TS}" height="12" fill="{hx("woodH", 3)}"/>'
    for y, w in ((top0, 6), (top1, 6), (front1, 6)):
        s += L(f'M0 {y} L{TS} {y}', OL, w)
    s += f'<rect x="168" y="{top0 - 30}" width="46" height="34" rx="6" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="5"/>'   # 금화 상자
    s += f'<circle cx="60" cy="{top0 + 14}" r="12" fill="{hx("brass", 1)}" stroke="{OL}" stroke-width="4"/><circle cx="82" cy="{top0 + 20}" r="12" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    return s, TS, TS


def desk():
    W_, H_ = 100 * K, 76 * K
    cx, base = W_ / 2, H_ - 20
    x0, x1 = cx - 170, cx + 170
    s = shadow(cx, base - 4, 176, 18, .3)
    for x in (x0 + 4, x1 - 28):
        s += P(R(x, base - 150, x + 24, base - 2), T('woodR', 'tv'), 6)
    s += P(R(x0, base - 176, x1, base - 112), T('woodR', 'tv'))
    s += P(R(cx - 60, base - 166, cx + 60, base - 124), T('woodR', 'tg'), 5)
    s += f'<circle cx="{cx}" cy="{base - 145}" r="8" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="3"/>'
    s += P(poly_path([(x0 - 10, base - 176), (x1 + 10, base - 176), (x1 - 4, base - 214), (x0 + 4, base - 214)]), T('woodH', 'tr'))
    s += P(poly_path([(cx - 120, base - 186), (cx - 20, base - 192), (cx - 24, base - 214), (cx - 116, base - 210)]), T('linen', 'tv'), 4)   # 종이
    for k in range(3):
        s += L(f'M{cx - 106} {base - 196 - k * 6} L{cx - 38} {base - 200 - k * 6}', '#7a6a5a', 2.5, .7)
    s += book(cx + 20, base - 190, 70, 18, 'book1') + book(cx + 26, base - 208, 60, 16, 'book2')
    s += P(f'M{cx + 120} {base - 186} a18 7 0 1 0 36 0 L{cx + 150} {base - 214} L{cx + 126} {base - 214} Z', T('ironK', 'tr'), 4)     # 잉크병
    s += L(f'M{cx + 140} {base - 214} Q{cx + 160} {base - 270} {cx + 186} {base - 296}', '#f2eee4', 7) + L(f'M{cx + 140} {base - 214} L{cx + 186} {base - 296}', OL, 2, .6)
    return s, W_, H_


def room_window():
    W_, H_ = 92 * K, 92 * K
    cx, base = W_ / 2, H_ - 30
    x0, x1, top = cx - 104, cx + 104, base - 240
    s = f'<rect x="{x0 - 10}" y="{top - 10}" width="{x1 - x0 + 20}" height="{base - top + 20}" fill="#ffe8a0" opacity=".35" filter="url(#glow24)"/>'
    s += P(R(x0 - 18, top - 18, x1 + 18, base + 10), T('woodR', 'tv'))
    glass = R(x0, top, x1, base - 8)
    sky = (f'<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8cc8f0"/><stop offset=".7" stop-color="#cfeaff"/>'
           f'<stop offset="1" stop-color="#e8f6ff"/></linearGradient>')
    s += f'<defs>{sky}</defs>' + P(glass, 'url(#isky)', 5)
    s += clip(uid('wg'), glass, F(f'M{x0} {base - 50} Q{cx - 40} {base - 90} {cx + 10} {base - 60} T{x1} {base - 70} L{x1} {base} L{x0} {base} Z', '#7ab86a', .9)
              + f'<circle cx="{x0 + 40}" cy="{top + 40}" r="22" fill="#ffffff" opacity=".8"/><circle cx="{x0 + 66}" cy="{top + 44}" r="16" fill="#ffffff" opacity=".8"/>'
              + L(f'M{x0 + 20} {base - 30} L{x0 + 90} {top + 20}', '#ffffff', 10, .35))
    s += L(f'M{cx} {top} L{cx} {base - 8} M{x0} {(top + base) / 2} L{x1} {(top + base) / 2}', OL, 14)
    s += L(f'M{cx} {top} L{cx} {base - 8} M{x0} {(top + base) / 2} L{x1} {(top + base) / 2}', hx('woodR', 0), 7)
    for k in (-1, 1):                                                     # 커튼
        xa = x0 - 30 if k < 0 else x1 + 30
        xb = x0 + 46 if k < 0 else x1 - 46
        d = smooth_path([(xa, top - 30), (xb, top - 30), (xb - k * 10, top + 80), (xb + k * 8, base - 30), (xa, base + 6)], k=.25)
        s += P(d, T('curtain', 'tv'), 6)
        s += clip(uid('ct'), d, ''.join(L(f'M{xa + (xb - xa) * f} {top - 30} Q{xa + (xb - xa) * f - k * 8} {top + 120} {xa + (xb - xa) * f * .8} {base}', hx('curtain', 3), 4, .6) for f in (.3, .6)))
        s += P(R(min(xa, xb) + 6, top + 120, max(xa, xb) - 2, top + 138), hx('brass', 0), 4)
    s += P(R(x0 - 48, top - 46, x1 + 48, top - 26), T('woodH', 'tv'), 6)  # 커튼 봉
    s += P(R(x0 - 30, base + 4, x1 + 30, base + 26), T('woodH', 'tv'), 6)  # 창턱
    s += P(f'M{cx + 40} {base + 4} L{cx + 46} {base - 30} L{cx + 86} {base - 30} L{cx + 92} {base + 4} Z', T('brickR', 'tv'), 4)   # 화분
    for k, col in enumerate(('#ff8ab0', '#ffd84a', '#ff6a6a')):
        x, y = cx + 52 + k * 16, base - 46 - (k % 2) * 14
        s += f'<circle cx="{x}" cy="{y + 12}" r="11" fill="{hx("leaf", 0)}" stroke="{OL}" stroke-width="3"/>'
        s += f'<circle cx="{x}" cy="{y}" r="9" fill="{col}" stroke="{OL}" stroke-width="3"/><circle cx="{x}" cy="{y}" r="3.5" fill="#fff2a0"/>'
    return s, W_, H_


def forge_hearth():
    W_, H_ = 96 * K, 96 * K
    cx, base = W_ / 2, H_ - 20
    x0, x1 = cx - 170, cx + 170
    s = shadow(cx, base - 4, 180, 20, .32)
    # 굴뚝 갓
    hood = poly_path([(cx - 90, base - 360), (cx + 90, base - 360), (cx + 150, base - 230), (cx - 150, base - 230)])
    s += P(R(cx - 54, 6, cx + 54, base - 350), T('brickR', 'tv'))
    s += P(hood, T('ironK', 'tv'))
    s += L(f'M{cx - 130} {base - 250} L{cx + 130} {base - 250}', hx('ironK', 1), 5, .6)
    body = R(x0, base - 200, x1, base - 6)
    s += P(body, T('stoneF', 'tv'))
    inner = ''
    for r, y in enumerate(range(int(base - 200), int(base), 48)):
        inner += L(f'M{x0} {y} L{x1} {y}', hx('stoneF', 3), 4, .7)
        for x in range(int(x0) + (r % 2) * 42, int(x1), 84):
            inner += L(f'M{x} {y} L{x} {y + 48}', hx('stoneF', 3), 4, .7)
    s += clip(uid('fh'), body, inner) + L(body, OL, LW)
    pit = f'M{x0 + 30} {base - 200} a{(x1 - x0) / 2 - 30} 34 0 1 0 {x1 - x0 - 60} 0 a{(x1 - x0) / 2 - 30} 34 0 1 0 {-(x1 - x0 - 60)} 0'
    s += f'<ellipse cx="{cx}" cy="{base - 220}" rx="170" ry="80" fill="#ff7a20" opacity=".55" filter="url(#glow24)"/>'
    s += P(pit, '#3a1608', 6)
    rng = random.Random(4)
    for _ in range(26):                                                   # 숯불
        x, y = cx + rng.uniform(-120, 120), base - 200 + rng.uniform(-16, 16)
        col = rng.choice(['#ff4a10', '#ff8a20', '#ffd060', '#c02a08'])
        s += f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{rng.uniform(8, 15):.1f}" fill="{col}" stroke="#401406" stroke-width="2"/>'
    s += flame(cx - 30, base - 206, 60, 20, False) + flame(cx + 40, base - 206, 50, 16, False)
    s += P(R(x1 - 20, base - 300, x1 + 6, base - 200), T('woodR', 'tv'), 5)  # 풀무 손잡이
    s += P(smooth_path([(x1 - 60, base - 150), (x1 + 20, base - 170), (x1 + 30, base - 110), (x1 - 50, base - 100)], k=.3), T('leather', 'tr'), 5)
    return s, W_, H_


def forge_anvil():
    W_, H_ = 90 * K, 90 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 150, 20, .32)
    stump = f'M{cx - 80} {base - 130} L{cx - 86} {base - 10} a86 20 0 0 0 172 0 L{cx + 80} {base - 130} Z'
    s += P(stump, T('wood', 'tv'))
    s += P(f'M{cx - 80} {base - 130} a80 18 0 1 0 160 0 a80 18 0 1 0 -160 0', T('woodL', 'tr'), 5)
    anvil = poly_path([(cx - 150, base - 230), (cx + 110, base - 230), (cx + 140, base - 214), (cx + 90, base - 196), (cx + 50, base - 196),
                       (cx + 40, base - 150), (cx + 80, base - 132), (cx - 80, base - 132), (cx - 40, base - 150), (cx - 50, base - 196),
                       (cx - 110, base - 196), (cx - 186, base - 214)])
    s += P(anvil, T('steel', 'tv'))
    s += L(f'M{cx - 140} {base - 224} L{cx + 104} {base - 224}', '#ffffff', 5, .7)
    s += F(poly_path([(cx + 10, base - 196), (cx + 50, base - 196), (cx + 40, base - 150), (cx + 80, base - 132), (cx + 20, base - 132)]), hx('steel', 3), .5)
    # 망치
    s += P(poly_path([(cx + 20, base - 250), (cx + 120, base - 330), (cx + 132, base - 316), (cx + 34, base - 236)]), T('woodH', 'tv'), 5)
    s += P(poly_path([(cx + 96, base - 362), (cx + 150, base - 316), (cx + 128, base - 292), (cx + 74, base - 338)]), T('ironK', 'tv'), 5)
    s += f'<circle cx="{cx - 110}" cy="{base - 240}" r="6" fill="#ffd060"/><circle cx="{cx - 90}" cy="{base - 262}" r="4" fill="#ff9a30"/>'
    s = fit(s, cx, base, .84)
    return s, W_, H_


def stall_weapon():
    """무기 진열대 — 나무 걸대에 칼 둘 · 창 · 활."""
    W_, H_ = 90 * K, 90 * K
    cx, base = W_ / 2, H_ - 24
    x0, x1 = cx - 160, cx + 160
    s = shadow(cx, base - 4, 170, 20, .3)
    for x in (x0, x1 - 24):
        s += P(R(x, base - 330, x + 24, base - 4), T('woodR', 'tv'), 6)
    for y in (base - 300, base - 120):
        s += P(R(x0 - 8, y, x1 + 8, y + 22), T('woodH', 'tv'), 5)
    # 칼 둘
    for k, x in enumerate((cx - 90, cx - 30)):
        blade = poly_path([(x - 12, base - 108), (x + 12, base - 108), (x + 12, base - 320), (x, base - 352), (x - 12, base - 320)])
        s += P(blade, T('steel', 'tv'), 5) + L(f'M{x} {base - 116} L{x} {base - 330}', hx('steel', 3), 3, .7)
        s += P(R(x - 34, base - 108, x + 34, base - 94), T('brass', 'tv'), 4)
        s += P(R(x - 9, base - 94, x + 9, base - 40), T('leather', 'tv'), 4)
        s += f'<circle cx="{x}" cy="{base - 34}" r="11" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    # 창
    xs = cx + 40
    s += P(R(xs - 7, base - 300, xs + 7, base - 14), T('woodH', 'tv'), 4)
    s += P(poly_path([(xs, base - 372), (xs + 20, base - 320), (xs, base - 298), (xs - 20, base - 320)]), T('steel', 'tv'), 5)
    # 활
    xb = cx + 110
    s += P(f'M{xb - 20} {base - 330} Q{xb + 46} {base - 210} {xb - 20} {base - 80} L{xb - 8} {base - 82} Q{xb + 30} {base - 210} {xb - 8} {base - 328} Z', T('woodR', 'tv'), 5)
    s += L(f'M{xb - 18} {base - 326} L{xb - 18} {base - 84}', '#f2eee4', 3)
    s = fit(s, cx, base, .86)
    return s, W_, H_


def stall_armor():
    """갑옷 진열대 — 나무 마네킹에 입힌 갑옷 · 투구 · 둥근 방패."""
    W_, H_ = 90 * K, 90 * K
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 4, 160, 20, .3)
    s += P(R(cx - 70, base - 30, cx + 70, base - 6), T('woodR', 'tv'), 6)
    s += P(R(cx - 10, base - 120, cx + 10, base - 30), T('woodR', 'tv'), 5)
    chest = smooth_path([(cx - 86, base - 300), (cx + 86, base - 300), (cx + 74, base - 190), (cx + 52, base - 116), (cx - 52, base - 116), (cx - 74, base - 190)], k=.25)
    s += P(chest, T('steel', 'tv'))
    s += clip(uid('ar'), chest, L(f'M{cx} {base - 300} L{cx} {base - 116}', hx('steel', 3), 5, .7)
              + L(f'M{cx - 70} {base - 200} Q{cx} {base - 176} {cx + 70} {base - 200}', hx('steel', 3), 5, .6)
              + F(R(cx + 30, base - 310, cx + 100, base - 100), hx('steel', 3), .35))
    for k in (-1, 1):
        s += P(f'M{cx + k * 70} {base - 302} q{k * 50} -6 {k * 62} 40 q{-k * 40} 10 {-k * 70} -4 Z', T('steel', 'tr'), 5)
    s += P(R(cx - 74, base - 160, cx + 74, base - 140), T('leather', 'tv'), 4)
    s += f'<rect x="{cx - 14}" y="{base - 164}" width="28" height="28" rx="4" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    helm = smooth_path([(cx - 54, base - 300), (cx - 58, base - 350), (cx, base - 384), (cx + 58, base - 350), (cx + 54, base - 300)], k=.35)
    s += P(helm, T('steel', 'tr'))
    s += L(f'M{cx - 40} {base - 326} L{cx + 40} {base - 326}', OL, 8)
    s += L(f'M{cx} {base - 384} L{cx} {base - 404}', OL, 10) + f'<circle cx="{cx}" cy="{base - 410}" r="10" fill="#d84a3c" stroke="{OL}" stroke-width="4"/>'
    sx = cx + 120                                                         # 둥근 방패(기대 놓은)
    s += P(f'M{sx - 52} {base - 70} a52 64 0 1 0 104 0 a52 64 0 1 0 -104 0', T('woodR', 'tr'))
    s += P(f'M{sx - 36} {base - 70} a36 46 0 1 0 72 0 a36 46 0 1 0 -72 0', T('quiltB', 'tr'), 5)
    s += f'<circle cx="{sx}" cy="{base - 70}" r="13" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    s = fit(s, cx, base, .8)
    return s, W_, H_


# ═════════════════════════════════════════════════════════════
# 성 기둥 — 사람보다 크다(FieldScene.TALL)
# ═════════════════════════════════════════════════════════════
def pillar_big():
    W_, H_ = 68 * K, 168 * K
    cx, base = W_ / 2, H_ - 18
    s = ''
    plinth = R(cx - 112, base - 70, cx + 112, base - 4)
    s += P(plinth, T('stoneC', 'tv')) + L(f'M{cx - 104} {base - 60} L{cx + 104} {base - 60}', hx('stoneC', 1), 4, .7)
    s += P(R(cx - 96, base - 104, cx + 96, base - 66), T('stoneC', 'tv'))
    shaft = R(cx - 74, base - 560, cx + 74, base - 100)
    s += P(shaft, T('stoneC', 'tg'))
    fl = ''
    for x in range(-56, 60, 28):                                          # 세로 홈
        fl += L(f'M{cx + x} {base - 548} L{cx + x} {base - 112}', hx('stoneC', 3), 6, .55)
        fl += L(f'M{cx + x - 6} {base - 548} L{cx + x - 6} {base - 112}', hx('stoneC', 1), 3, .45)
    fl += F(R(cx + 30, base - 570, cx + 90, base - 90), hx('stoneC', 3), .35) + F(R(cx - 74, base - 570, cx - 44, base - 90), hx('stoneC', 1), .3)
    s += clip(uid('pl'), shaft, fl) + L(shaft, OL, LW)
    s += P(R(cx - 94, base - 596, cx + 94, base - 556), T('stoneC', 'tv'))  # 기둥머리
    s += P(smooth_path([(cx - 118, base - 640), (cx + 118, base - 640), (cx + 102, base - 596), (cx - 102, base - 596)], k=.2), T('stoneC', 'tv'))
    for k in (-1, 1):
        s += P(f'M{cx + k * 102} {base - 622} a20 20 0 1 {1 if k > 0 else 0} {k * 4} 30 a12 12 0 1 {0 if k > 0 else 1} {-k * 2} -18', 'none', 5)
    s += f'<rect x="{cx - 26}" y="{base - 250}" width="52" height="64" rx="6" fill="#b8323a" stroke="{OL}" stroke-width="5"/>'   # 붉은 깃 장식
    s += f'<path d="M{cx - 26} {base - 186} L{cx} {base - 166} L{cx + 26} {base - 186}" fill="#b8323a" stroke="{OL}" stroke-width="5" stroke-linejoin="round"/>'
    s += f'<circle cx="{cx}" cy="{base - 222}" r="12" fill="{hx("brass", 0)}" stroke="{OL}" stroke-width="4"/>'
    return s, W_, H_


def pillar_shade():
    W_, H_ = 68 * K, 168 * K
    return f'<ellipse cx="{W_ / 2}" cy="{H_ - 26}" rx="130" ry="30" fill="#0a0c14" opacity=".35" filter="url(#tblur)"/>', W_, H_


def dais():
    """알현실 단(壇) — 옅은 대리석 판 넷 + 금 줄눈. 이어 붙여도 이음새가 없다(줄눈은 칸 가장자리 · 가운데)."""
    rng = random.Random(41)
    s = f'<rect width="{TS}" height="{TS}" fill="#e6dfcf"/>'
    for (x0, y0) in ((0, 0), (128, 0), (0, 128), (128, 128)):
        tone = rng.choice(['#ece6d8', '#e2dbca', '#e9e2d2', '#dfd7c5'])
        s += f'<rect x="{x0 + 3}" y="{y0 + 3}" width="122" height="122" fill="{tone}"/>'
        for _ in range(2):                                               # 결(판 안에서 닫힌다)
            ax, ay = x0 + rng.uniform(14, 50), y0 + rng.uniform(14, 114)
            bx, by = x0 + rng.uniform(78, 114), y0 + rng.uniform(14, 114)
            s += L(f'M{ax:.1f} {ay:.1f} Q{(ax + bx) / 2 + rng.uniform(-20, 20):.1f} {(ay + by) / 2 + rng.uniform(-30, 30):.1f} {bx:.1f} {by:.1f}', '#b8ac94', 2, .45)
        s += L(f'M{x0 + 6} {y0 + 120} L{x0 + 6} {y0 + 6} L{x0 + 120} {y0 + 6}', '#fbf8f0', 3, .8)
        s += L(f'M{x0 + 122} {y0 + 8} L{x0 + 122} {y0 + 122} L{x0 + 8} {y0 + 122}', '#b4a88e', 3, .7)
    for v in (0, 128, 256):
        s += f'<rect x="{v - 2.5}" y="0" width="5" height="{TS}" fill="#c89a3a"/><rect x="0" y="{v - 2.5}" width="{TS}" height="5" fill="#c89a3a"/>'
    for (x, y) in ((0, 0), (128, 0), (0, 128), (128, 128), (256, 0), (0, 256), (256, 256), (128, 256), (256, 128)):
        s += f'<circle cx="{x}" cy="{y}" r="7" fill="#f2cf6a" stroke="#8a6420" stroke-width="2"/>'
    return s, TS, TS


# 이름 → (그리는 함수, 라벨). 크기는 파일 px(= 게임 크기 × 2).
JOBS = {
    'room_floor': (lambda: floor(0), '방 바닥'),
    'room_floor2': (lambda: floor(1), '방 바닥 2'),
    'room_floor3': (lambda: floor(2), '방 바닥 3'),
    'room_wall': (wall_back, '방 벽'),
    'room_wall_in': (wall_in, '방 벽 (안쪽)'),
    'room_wall_edge_l': (lambda: wall_side(True), '방 옆벽 (방이 오른쪽)'),
    'room_wall_edge_r': (lambda: wall_side(False), '방 옆벽 (방이 왼쪽)'),
    'room_exit': (room_exit, '방 문턱'),
    'bed_full': (bed_full, None),
    'table': (table, '탁자'),
    'chair': (chair, '의자'),
    'shelf': (shelf, '선반'),
    'wardrobe': (wardrobe, '옷장'),
    'fireplace': (fireplace, '벽난로'),
    'cauldron': (cauldron, '가마솥'),
    'counter': (counter, '계산대'),
    'desk': (desk, '책상'),
    'room_window': (room_window, '방 창문'),
    'forge_hearth': (forge_hearth, '대장간 화덕'),
    'forge_anvil': (forge_anvil, '모루'),
    'stall_weapon': (stall_weapon, '무기 진열대'),
    'stall_armor': (stall_armor, '갑옷 진열대'),
    'castle_pillar_big': (pillar_big, '성 기둥(사람보다 크다)'),
    'dais': (dais, '알현실 단(대리석)'),
    'pillar_shade': (pillar_shade, '성 기둥 그늘'),
}


def svg_doc(body, w, h):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{GA.DEFS}{TA.TDEFS}</defs>{body}</svg>')


def bake(names, jobs=None, label='집 안 · 성 안 그림'):
    jobs_ = jobs or JOBS
    os.makedirs(SVGDIR, exist_ok=True)
    jobs = []
    for n in names:
        body, w, h = jobs_[n][0]()
        sp = os.path.join(SVGDIR, f'{n}.svg')
        open(sp, 'w').write(svg_doc(body, w, h))
        jobs.append({'svg': sp, 'out': os.path.join(SVGDIR, f'{n}.png'), 'w': int(w), 'h': int(h), 'name': n})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(jobs, open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env)
    man_p = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    man = json.load(open(man_p, encoding='utf-8'))
    written = []

    def put(name, im, label):
        fw, fh = im.size
        im.save(os.path.join(OUT, f'{name}.png'), optimize=True)
        written.append(f'tiles/{name}.png')
        key = f'tile_{name}'
        old = man.get(key, {})
        man[key] = {**old, 'src': f'assets/tiles/{name}.png', 'w': fw // 2, 'h': fh // 2, 'label': old.get('label') or label}

    for j in jobs:
        n = j['name']
        fw, fh = j['w'] // K, j['h'] // K
        im = Image.open(j['out']).convert('RGBA').resize((fw, fh), Image.LANCZOS)
        if n == 'bed_full':                                              # 머리 · 발치 반씩
            put('bed', im.crop((0, 0, fw, fh // 2)), '침대 머리맡')
            put('bed_foot', im.crop((0, fh // 2, fw, fh)), '침대 발치')
            continue
        put(n, im, jobs_[n][1])
    with open(man_p, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write('\n')
    p = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(p, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | set(written))
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ {label} {len(written)}장')


def preview():
    names = ['room_floor', 'room_floor2', 'room_wall', 'room_wall_in', 'room_wall_edge_l', 'room_wall_edge_r', 'room_exit', 'counter',
             'bed', 'bed_foot', 'table', 'chair', 'shelf', 'wardrobe', 'fireplace', 'cauldron', 'desk', 'room_window',
             'forge_hearth', 'forge_anvil', 'stall_weapon', 'stall_armor', 'castle_pillar_big']
    ims = [Image.open(os.path.join(OUT, f'{n}.png')).convert('RGBA') for n in names]
    S = 190
    cols = 8
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGBA', (S * cols, int(S * 1.9) * rows), (120, 92, 62, 255))
    for i, im in enumerate(ims):
        im2 = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        out.alpha_composite(im2, ((i % cols) * S + (S - im2.width) // 2, (i // cols) * int(S * 1.9) + int(S * 1.9) - im2.height - 6))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out.save(os.path.join(ROOT, 'art', 'preview', 'interior-art.png'))
    print('✓ art/preview/interior-art.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in JOBS] or list(JOBS)
    if '--preview' not in sys.argv:
        bake(names)
    preview()
