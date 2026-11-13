#!/usr/bin/env python3
"""
고룡의 둥지 · 지하감옥 꾸밈 (0.70.31) — 금은보화 더미 · 용 머리뼈 · 알 둥지 · 흑요석 · 뼈 무더기 · 용암 틈 · 흩어진 금화,
감방 쇠창살 · 벽 사슬 · 바닥 뼈 · 물웅덩이 · 무너진 돌 · 석상 · 봉인 룬.

    python3 tools/decor-art.py              # → assets/tiles/*.png · manifest · painted.json
    python3 tools/decor-art.py --preview    # art/preview/decor-art.png 만

붓은 마을 · 집 안과 같다(tools/interior-art.py 의 도우미를 그대로 쓴다): 짙은 테두리 · 셀 음영 · 왼쪽 위 빛.
바닥에 얹는 것(용암 틈 · 금화 · 뼈 · 물웅덩이 · 돌 · 룬)은 **테두리를 옅게** — 서 있는 것이 아니라 바닥의 일부라서.
"""
import importlib.util
import math
import os
import random
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sp = importlib.util.spec_from_file_location('interior_art', os.path.join(ROOT, 'tools', 'interior-art.py'))
IA = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(IA)
GA, TA = IA.GA, IA.TA
OL = GA.OL
smooth_path, poly_path, clip, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.uid
P, F, L, T, shadow, blob, R, fit, flame, hx = IA.P, IA.F, IA.L, IA.T, IA.shadow, IA.blob, IA.R, IA.fit, IA.flame, IA.hx
PAL = IA.PAL
K, LW = IA.K, IA.LW

PAL.update({
    'coin': ('#f0c040', '#fff09a', '#c08a18', '#7a5408'),
    'boneW': ('#e8e0c8', '#fffaf0', '#c4b898', '#8e8268'),
    'obsid': ('#2a2438', '#5a4e78', '#1a1624', '#0c0a12'),
    'egg': ('#c8a070', '#f0d4a4', '#9a7444', '#644824'),
    'eggR': ('#a84a3a', '#e08068', '#7a2c20', '#4e1a12'),
    'stoneD': ('#5c5a68', '#8a8898', '#42404c', '#2a2832'),
    'rune': ('#a070ff', '#f0e0ff', '#7040d0', '#401c80'),
    # 0.70.31 — 어두운 지하감옥에서 보이게: 쇠 · 돌을 벽(짙은 보랏빛 회색)보다 한결 밝게
    'ironL': ('#727888', '#b4bac8', '#4c505c', '#2c2e36'),
    'stoneL': ('#827e90', '#b4b0c2', '#5e5c6c', '#3c3a46'),
    'woodT': ('#7a5034', '#a87452', '#55361f', '#33200f'),
})
TA.TDEFS = (TA._grads()
            + '<filter id="tblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>'
            + '<filter id="glow12" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="12"/></filter>'
            + '<filter id="glow24" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="24"/></filter>'
            + '<filter id="soft3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>')
TS = 64 * K


def coin(x, y, r=13, rng=None):
    tilt = rng.uniform(.55, 1) if rng else .8
    return (f'<ellipse cx="{x:.1f}" cy="{y:.1f}" rx="{r}" ry="{r * tilt:.1f}" fill="{hx("coin", 0)}" stroke="{OL}" stroke-width="3"/>'
            f'<ellipse cx="{x - r * .25:.1f}" cy="{y - r * .25 * tilt:.1f}" rx="{r * .45:.1f}" ry="{r * .3 * tilt:.1f}" fill="{hx("coin", 1)}"/>')


def gem(x, y, r, col):
    return (P(poly_path([(x, y - r), (x + r * .9, y), (x, y + r), (x - r * .9, y)]), col, 3)
            + F(poly_path([(x, y - r), (x + r * .4, y - r * .2), (x, y), (x - r * .4, y - r * .2)]), '#ffffff', .6))


def bone(x0, y0, x1, y1, w=10):
    s = L(f'M{x0} {y0} L{x1} {y1}', OL, w + 7) + L(f'M{x0} {y0} L{x1} {y1}', hx('boneW', 0), w)
    for (x, y) in ((x0, y0), (x1, y1)):
        s += f'<circle cx="{x}" cy="{y}" r="{w * .9}" fill="{hx("boneW", 0)}" stroke="{OL}" stroke-width="3"/>'
    return s


def skull(cx, cy, r):
    d = smooth_path([(cx - r, cy), (cx - r * .9, cy - r * .8), (cx, cy - r * 1.1), (cx + r * .9, cy - r * .8), (cx + r, cy),
                     (cx + r * .6, cy + r * .5), (cx + r * .5, cy + r * .85), (cx - r * .5, cy + r * .85), (cx - r * .6, cy + r * .5)], k=.35)
    s = P(d, T('boneW', 'tr'), 4)
    for sx in (-1, 1):
        s += f'<ellipse cx="{cx + sx * r * .38}" cy="{cy - r * .05}" rx="{r * .26}" ry="{r * .3}" fill="#2a2018"/>'
    s += P(poly_path([(cx, cy + r * .2), (cx + r * .1, cy + r * .42), (cx - r * .1, cy + r * .42)]), '#2a2018', 2)
    for k in range(-2, 3):
        s += L(f'M{cx + k * r * .17} {cy + r * .6} L{cx + k * r * .17} {cy + r * .82}', '#5a4a38', 2.5)
    return s


# ═════════════════════════════════════════════════════════════
# 고룡의 둥지
# ═════════════════════════════════════════════════════════════
def hoard():
    """금은보화 더미 — 금화 산 · 금잔 · 왕관 · 보석 · 꽂힌 칼."""
    W_, H_ = 128 * K, 80 * K
    cx, base = W_ / 2, H_ - 24
    rng = random.Random(3)
    s = shadow(cx, base - 6, 230, 26, .35)
    s += f'<ellipse cx="{cx}" cy="{base - 90}" rx="220" ry="110" fill="#ffd060" opacity=".25" filter="url(#glow24)"/>'
    pile = smooth_path([(cx - 236, base - 4), (cx - 190, base - 70), (cx - 90, base - 150), (cx + 10, base - 176),
                        (cx + 110, base - 140), (cx + 200, base - 70), (cx + 240, base - 4)], k=.35)
    s += P(pile, T('coin', 'tr'))
    inner = ''
    for _ in range(80):
        x = rng.uniform(cx - 220, cx + 220)
        top = base - 170 * max(0, 1 - ((x - cx) / 240) ** 2)
        y = rng.uniform(top + 10, base - 4)
        inner += coin(x, y, rng.uniform(10, 15), rng)
    s += clip(uid('hd'), pile, inner) + L(pile, OL, LW)
    # 꽂힌 칼
    s += P(poly_path([(cx + 96, base - 150), (cx + 108, base - 150), (cx + 132, base - 330), (cx + 122, base - 344), (cx + 114, base - 330)]), T('steel', 'tv'), 5)
    s += P(R(cx + 76, base - 160, cx + 128, base - 146), T('coin', 'tv'), 4)
    s += P(R(cx + 94, base - 146, cx + 110, base - 108), T('leather', 'tv'), 4)
    # 금잔 · 왕관 · 보석
    gx = cx - 110
    s += P(f'M{gx - 34} {base - 176} Q{gx} {base - 120} {gx + 34} {base - 176} Z', T('coin', 'tr'), 5)
    s += P(R(gx - 6, base - 132, gx + 6, base - 100), T('coin', 'tv'), 4) + P(R(gx - 24, base - 104, gx + 24, base - 92), T('coin', 'tv'), 4)
    s += gem(gx, base - 156, 10, '#d8343c')
    kx, ky = cx - 10, base - 186
    crown = poly_path([(kx - 48, ky), (kx - 48, ky - 40), (kx - 24, ky - 18), (kx, ky - 52), (kx + 24, ky - 18), (kx + 48, ky - 40), (kx + 48, ky)])
    s += P(crown, T('coin', 'tv'))
    for x, col in ((kx - 26, '#3a8fe8'), (kx, '#d8343c'), (kx + 26, '#39c47e')):
        s += gem(x, ky - 12, 8, col)
    for x, y, col in ((cx + 40, base - 60, '#a95cf0'), (cx - 160, base - 40, '#3a8fe8'), (cx + 170, base - 50, '#d8343c'), (cx - 60, base - 96, '#39c47e')):
        s += gem(x, y, 12, col)
    return s, W_, H_


def dragon_skull():
    """오래된 용 머리뼈 — 뿔 · 이빨 · 빈 눈구멍."""
    W_, H_ = 64 * K * 2, 44 * K * 2
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 6, 220, 24, .35)
    head = smooth_path([(cx - 220, base - 40), (cx - 200, base - 150), (cx - 100, base - 230), (cx + 40, base - 240), (cx + 160, base - 190),
                        (cx + 230, base - 110), (cx + 220, base - 40), (cx + 140, base - 20), (cx - 120, base - 20)], k=.3)
    s += P(head, T('boneW', 'tr'))
    inner = F(R(cx + 60, base - 260, cx + 260, base), hx('boneW', 2), .45)
    inner += L(f'M{cx - 160} {base - 120} Q{cx} {base - 170} {cx + 180} {base - 120}', hx('boneW', 3), 4, .6)
    s += clip(uid('sk'), head, inner) + L(head, OL, LW)
    for sx, ex in ((-1, cx - 70), (1, cx + 80)):                       # 눈구멍
        s += f'<ellipse cx="{ex}" cy="{base - 140}" rx="42" ry="34" fill="#1c140e" stroke="{OL}" stroke-width="5"/>'
        s += f'<ellipse cx="{ex}" cy="{base - 140}" rx="10" ry="8" fill="#ff5a20" opacity=".7" filter="url(#soft3)"/>'
    for k in range(9):                                                  # 이빨
        x = cx - 150 + k * 38
        s += P(poly_path([(x - 12, base - 40), (x + 12, base - 40), (x, base - 2 - (k % 2) * 14)]), T('boneW', 'tv'), 4)
    for sx in (-1, 1):                                                  # 뿔
        hx0 = cx + sx * 120
        horn = smooth_path([(hx0 - 26, base - 200), (hx0 + 26, base - 210), (hx0 + sx * 120, base - 320), (hx0 + sx * 150, base - 300)], k=.35)
        s += P(horn, T('boneW', 'tv'))
    s += P(f'M{cx - 30} {base - 70} a14 10 0 1 0 28 0 a14 10 0 1 0 -28 0', '#2a2018', 3)
    s += P(f'M{cx + 10} {base - 70} a14 10 0 1 0 28 0 a14 10 0 1 0 -28 0', '#2a2018', 3)
    return s, W_, H_


def egg_nest():
    W_, H_ = 48 * K * 2, 40 * K * 2
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 6, 170, 22, .35)
    rng = random.Random(6)
    nest = smooth_path([(cx - 170, base - 30), (cx - 130, base - 110), (cx + 130, base - 110), (cx + 170, base - 30), (cx, base)], k=.35)
    s += P(nest, T('wood', 'tv'))
    inner = ''
    for _ in range(26):
        x, y = rng.uniform(cx - 170, cx + 170), rng.uniform(base - 110, base)
        a = rng.uniform(-.4, .4)
        inner += L(f'M{x - 60 * math.cos(a)} {y - 60 * math.sin(a)} L{x + 60 * math.cos(a)} {y + 60 * math.sin(a)}', hx('wood', 3), 6, .9)
        inner += L(f'M{x - 50 * math.cos(a)} {y - 50 * math.sin(a) - 3} L{x + 50 * math.cos(a)} {y + 50 * math.sin(a) - 3}', hx('wood', 1), 3, .6)
    s += clip(uid('ns'), nest, inner) + L(nest, OL, LW)
    s += f'<ellipse cx="{cx}" cy="{base - 150}" rx="140" ry="90" fill="#ff8040" opacity=".25" filter="url(#glow24)"/>'
    for ex, ey, r, mat in ((cx - 70, base - 110, 52, 'eggR'), (cx + 70, base - 112, 50, 'egg'), (cx, base - 140, 60, 'eggR')):
        d = f'M{ex} {ey - r * 1.35} C{ex + r} {ey - r * 1.3} {ex + r} {ey + r * .5} {ex} {ey + r * .55} C{ex - r} {ey + r * .5} {ex - r} {ey - r * 1.3} {ex} {ey - r * 1.35} Z'
        s += P(d, T(mat, 'tr'))
        s += clip(uid('eg'), d, ''.join(f'<circle cx="{ex + rng.uniform(-r, r):.1f}" cy="{ey + rng.uniform(-r * 1.2, r * .4):.1f}" r="{rng.uniform(4, 9):.1f}" fill="{hx(mat, 2)}" opacity=".7"/>' for _ in range(7)))
        s += L(f'M{ex - r * .35} {ey - r * .9} Q{ex - r * .5} {ey - r * .4} {ex - r * .3} {ey}', hx(mat, 1), 6, .8)
    return s, W_, H_


def obsidian():
    W_, H_ = 40 * K * 2, 60 * K * 2
    cx, base = W_ / 2, H_ - 24
    s = shadow(cx, base - 6, 130, 20, .4)
    for (x, top, w, k) in ((cx - 60, base - 300, 46, 0), (cx + 50, base - 360, 54, 1), (cx - 4, base - 440, 62, 2), (cx + 96, base - 200, 34, 3), (cx - 104, base - 180, 32, 4)):
        d = poly_path([(x - w, base - 6), (x - w * .55, top + 60), (x, top), (x + w * .55, top + 60), (x + w, base - 6)])
        s += P(d, T('obsid', 'tv'))
        s += clip(uid('ob'), d, F(poly_path([(x, top), (x + w, base), (x + w * 2, base), (x + w, top)]), hx('obsid', 3), .55)
                  + L(f'M{x - w * .3} {top + 70} L{x - w * .55} {base - 30}', hx('obsid', 1), 5, .8))
        s += L(d, OL, LW)
    s += f'<ellipse cx="{cx}" cy="{base - 30}" rx="80" ry="20" fill="#ff5020" opacity=".3" filter="url(#glow12)"/>'
    return s, W_, H_


def bone_pile():
    W_, H_ = 44 * K * 2, 34 * K * 2
    cx, base = W_ / 2, H_ - 22
    s = shadow(cx, base - 6, 150, 18, .32)
    rng = random.Random(12)
    for _ in range(9):
        x, y = cx + rng.uniform(-110, 110), base - rng.uniform(20, 70)
        a = rng.uniform(0, math.pi)
        ln = rng.uniform(40, 80)
        s += bone(x - ln * math.cos(a), y - ln * math.sin(a) * .4, x + ln * math.cos(a), y + ln * math.sin(a) * .4, rng.uniform(9, 13))
    s += skull(cx - 30, base - 96, 46) + skull(cx + 70, base - 60, 34)
    return s, W_, H_


def lava_crack():
    """바닥의 용암 틈(밟고 지나간다) — 테두리 없이, 가운데가 빛난다."""
    rng = random.Random(21)
    s = ''
    pts = [(30, 70), (90, 110), (120, 100), (160, 150), (210, 170), (230, 220)]
    d = ' '.join(f'{x},{y}' for x, y in pts)
    s += f'<polyline points="{d}" fill="none" stroke="#ff6a20" stroke-width="34" opacity=".35" filter="url(#glow12)" stroke-linecap="round"/>'
    s += f'<polyline points="{d}" fill="none" stroke="#2a120a" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<polyline points="{d}" fill="none" stroke="#ff7a24" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
    s += f'<polyline points="{d}" fill="none" stroke="#ffd870" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'
    for (x, y) in ((120, 100), (160, 150)):
        b = [(x, y), (x + rng.uniform(-40, -20), y + rng.uniform(20, 40))]
        bd = ' '.join(f'{a},{c}' for a, c in b)
        s += f'<polyline points="{bd}" fill="none" stroke="#2a120a" stroke-width="10" stroke-linecap="round"/>'
        s += f'<polyline points="{bd}" fill="none" stroke="#ff8a30" stroke-width="4" stroke-linecap="round"/>'
    return s, TS, TS


def coins():
    rng = random.Random(9)
    s = ''
    for _ in range(9):
        s += coin(rng.uniform(50, 206), rng.uniform(60, 210), rng.uniform(11, 15), rng)
    s += gem(150, 120, 11, '#3a8fe8')
    return s, TS, TS


# ═════════════════════════════════════════════════════════════
# 지하감옥
# ═════════════════════════════════════════════════════════════
def cell_bars():
    """감방 쇠창살 — 벽에 난 감방 입구(어두운 안 · 쇠창살 · 돌 문틀). 벽 칸에 얹는다."""
    s = ''
    x0, x1, y0, y1 = 36, TS - 36, 30, TS
    s += P(f'M{x0 - 14} {y1} L{x0 - 14} {y0 + 50} Q{x0 - 14} {y0 - 14} {TS / 2} {y0 - 14} Q{x1 + 14} {y0 - 14} {x1 + 14} {y0 + 50} L{x1 + 14} {y1} Z', T('stoneL', 'tv'), 6)
    s += F(f'M{x0} {y1} L{x0} {y0 + 50} Q{x0} {y0} {TS / 2} {y0} Q{x1} {y0} {x1} {y0 + 50} L{x1} {y1} Z', '#0c0a10')
    s += f'<ellipse cx="{TS / 2}" cy="{y1 - 20}" rx="60" ry="16" fill="#3a3448" opacity=".6"/>'
    for k in range(5):
        x = x0 + 16 + k * (x1 - x0 - 32) / 4
        s += L(f'M{x} {y0 + 6} L{x} {y1}', OL, 14) + L(f'M{x} {y0 + 6} L{x} {y1}', hx('ironL', 0), 8) + L(f'M{x - 2} {y0 + 6} L{x - 2} {y1}', hx('ironL', 1), 3, .9)
    for y in (y0 + 70, y1 - 50):
        s += L(f'M{x0} {y} L{x1} {y}', OL, 14) + L(f'M{x0} {y} L{x1} {y}', hx('ironL', 0), 8) + L(f'M{x0} {y - 2} L{x1} {y - 2}', hx('ironL', 1), 2, .8)
    s += f'<circle cx="{x1 - 22}" cy="{(y0 + y1) / 2 + 10}" r="9" fill="{hx("ironL", 1)}" stroke="{OL}" stroke-width="4"/>'
    return s, TS, TS


def wall_chains():
    """벽 사슬 — 벽에 박은 쇠고리에서 늘어진 사슬 둘(끝에 족쇄). 0.70.31: 어둠 속에서도 보이게 굵고 밝은 쇠로."""
    s = ''
    for cx_, ln in ((80, 150), (176, 120)):
        s += P(R(cx_ - 18, 20, cx_ + 18, 46), T('ironL', 'tv'), 5)
        s += f'<circle cx="{cx_}" cy="33" r="5" fill="{hx("ironL", 1)}" stroke="{OL}" stroke-width="3"/>'
        for k in range(int(ln / 22)):
            y = 50 + k * 22
            if k % 2 == 0:
                s += (f'<ellipse cx="{cx_}" cy="{y}" rx="9" ry="13" fill="none" stroke="{OL}" stroke-width="11"/>'
                      f'<ellipse cx="{cx_}" cy="{y}" rx="9" ry="13" fill="none" stroke="{hx("ironL", 0)}" stroke-width="6"/>'
                      f'<path d="M{cx_ - 7} {y - 6} Q{cx_ - 6} {y - 12} {cx_} {y - 12}" fill="none" stroke="{hx("ironL", 1)}" stroke-width="2.5"/>')
            else:
                s += L(f'M{cx_ - 11} {y} L{cx_ + 11} {y}', OL, 11) + L(f'M{cx_ - 11} {y} L{cx_ + 11} {y}', hx('ironL', 0), 6) + L(f'M{cx_ - 9} {y - 2} L{cx_ + 6} {y - 2}', hx('ironL', 1), 2)
        y = 50 + ln
        s += (f'<path d="M{cx_ - 24} {y} a24 19 0 1 0 48 0" fill="none" stroke="{OL}" stroke-width="15"/>'
              f'<path d="M{cx_ - 24} {y} a24 19 0 1 0 48 0" fill="none" stroke="{hx("ironL", 0)}" stroke-width="8"/>'
              f'<path d="M{cx_ - 20} {y + 6} a22 16 0 0 0 14 12" fill="none" stroke="{hx("ironL", 1)}" stroke-width="3"/>')
    return s, TS, TS


def dungeon_torch():
    """벽 횃불 (0.70.31) — 벽에 박은 쇠 받침 · 나무 자루 · 기름 먹인 천 · 불꽃. 배경 없음(벽 위에 얹는다).
    둘레의 불빛은 게임이 그린다(FieldScene.LIGHT.torch · Renderer.drawLighting) — 칸 안에 구워 두면 네모로 잘린다."""
    cx = TS / 2
    s = ''
    s += P(R(cx - 26, 150, cx + 26, 214), T('ironL', 'tv'), 5)                                     # 벽 받침판
    s += ''.join(f'<circle cx="{cx + dx}" cy="{dy}" r="5" fill="{hx("ironL", 1)}" stroke="{OL}" stroke-width="3"/>' for dx, dy in ((-15, 162), (15, 162), (-15, 202), (15, 202)))
    s += L(f'M{cx} 182 L{cx} 150', OL, 16) + L(f'M{cx} 182 L{cx} 150', hx('ironL', 0), 9)             # 팔
    s += P(poly_path([(cx - 13, 168), (cx + 13, 168), (cx + 9, 96), (cx - 9, 96)]), T('woodT', 'tv'), 5)  # 자루
    s += P(f'M{cx - 30} 104 L{cx + 30} 104 L{cx + 22} 126 L{cx - 22} 126 Z', T('ironL', 'tv'), 5)        # 받침 잔
    s += P(R(cx - 22, 84, cx + 22, 106), T('woodT', 'tr'), 4)                                      # 감은 천
    s += L(f'M{cx - 20} 92 L{cx + 20} 98', OL, 3, .7)
    s += flame(cx, 92, 76, 30, glow=False)
    s += f'<ellipse cx="{cx}" cy="70" rx="10" ry="16" fill="#fff6c8" opacity=".85"/>'
    return s, TS, TS


def floor_bones():
    s = shadow(TS / 2, 210, 100, 16, .3)
    s += bone(40, 176, 160, 214, 11) + bone(100, 110, 214, 150, 10)
    s += skull(176, 196, 40)
    return s, TS, TS


def puddle():
    """물웅덩이 — 타원 셋을 겹친 **둥근 덩어리**(모서리 · 울퉁불퉁함 없이). 물은 얕아서 바닥이 비친다(반투명),
    가장자리는 칼선 대신 젖은 바닥 그늘이 부드럽게 번지고, 물낯에 천장 빛이 길게 비친다."""
    W_, H_ = 56 * K * 2, 40 * K * 2                 # 칸보다 크게(56×40) — 발밑에 세워 바닥에 굽는다(FieldScene.GROWN)
    cx, cy = W_ / 2, H_ / 2 + 14
    blobs = [(cx, cy, 140, 86), (cx - 100, cy + 22, 72, 52), (cx + 98, cy - 14, 74, 54)]
    shape = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}"/>' for x, y, rx, ry in blobs)
    s = f'<defs><clipPath id="pdc">{shape}</clipPath></defs>'
    s += ''.join(f'<ellipse cx="{x}" cy="{y + 4}" rx="{rx + 12}" ry="{ry + 9}" fill="#0a0c12" opacity=".28" filter="url(#tblur)"/>' for x, y, rx, ry in blobs)
    s += f'<g filter="url(#soft3)" opacity=".62">' + ''.join(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#2c3c56"/>' for x, y, rx, ry in blobs) + '</g>'
    s += (f'<g clip-path="url(#pdc)"><ellipse cx="{cx - 30}" cy="{cy - 30}" rx="120" ry="12" fill="#b8d0f0" opacity=".36" filter="url(#soft3)"/>'
          f'<ellipse cx="{cx + 60}" cy="{cy + 24}" rx="44" ry="6" fill="#b8d0f0" opacity=".3"/></g>')
    return s, W_, H_


def floor_rubble():
    rng = random.Random(14)
    s = ''
    for _ in range(8):
        x, y = rng.uniform(44, 212), rng.uniform(70, 214)
        r = rng.uniform(18, 36)
        d = blob(x, y, r, 7, .25, rng.randint(0, 99), .75)
        s += P(d, T('stoneL', 'tr'), 4)
    return s, TS, TS


def statue():
    """감옥 석상 — 칼을 짚고 선 기사(이끼 · 금 간 돌)."""
    W_, H_ = 40 * K * 2, 64 * K * 2
    cx, base = W_ / 2, H_ - 22
    s = shadow(cx, base - 6, 120, 18, .38)
    s += P(R(cx - 110, base - 70, cx + 110, base - 6), T('stoneD', 'tv'))
    s += L(f'M{cx - 100} {base - 56} L{cx + 100} {base - 56}', hx('stoneD', 1), 4, .7)
    body = smooth_path([(cx - 70, base - 70), (cx - 84, base - 260), (cx - 60, base - 330), (cx + 60, base - 330), (cx + 84, base - 260), (cx + 70, base - 70)], k=.25)
    s += P(body, T('stoneD', 'tg'))
    s += clip(uid('st'), body, F(R(cx + 20, base - 340, cx + 100, base - 60), hx('stoneD', 3), .5)
              + L(f'M{cx - 50} {base - 200} L{cx - 20} {base - 160} L{cx - 36} {base - 120}', '#1c1a22', 3, .8)
              + ''.join(f'<circle cx="{cx + dx}" cy="{base - dy}" r="{r}" fill="#5a7a3a" opacity=".7"/>' for dx, dy, r in ((-60, 90, 14), (-40, 80, 10), (50, 110, 12))))
    s += P(f'M{cx - 46} {base - 330} Q{cx} {base - 360} {cx + 46} {base - 330} L{cx + 40} {base - 410} Q{cx} {base - 450} {cx - 40} {base - 410} Z', T('stoneD', 'tr'))
    s += L(f'M{cx - 30} {base - 380} L{cx + 30} {base - 380}', OL, 8)
    s += P(poly_path([(cx - 8, base - 300), (cx + 8, base - 300), (cx + 8, base - 80), (cx, base - 64), (cx - 8, base - 80)]), T('stoneD', 'tv'), 4)
    s += P(R(cx - 40, base - 306, cx + 40, base - 292), T('stoneD', 'tv'), 4)
    s += f'<circle cx="{cx}" cy="{base - 200}" r="10" fill="#7cc4ff" opacity=".85" filter="url(#soft3)"/>'
    return s, W_, H_


def seal_rune():
    s = f'<circle cx="{TS / 2}" cy="{TS / 2}" r="110" fill="#a070ff" opacity=".22" filter="url(#glow12)"/>'
    for r_, w in ((100, 5), (78, 3)):
        s += f'<circle cx="{TS / 2}" cy="{TS / 2}" r="{r_}" fill="none" stroke="#c8a8ff" stroke-width="{w}" opacity=".85"/>'
    for rot in (-math.pi / 2, math.pi / 2):                                       # 두 세모(겹쳐 별 여섯)
        tri = [(TS / 2 + 74 * math.cos(rot + 2 * math.pi * k / 3), TS / 2 + 74 * math.sin(rot + 2 * math.pi * k / 3)) for k in range(4)]
        s += f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in tri)}" fill="none" stroke="#e8dcff" stroke-width="3" opacity=".9"/>'
    for k in range(8):
        a = 2 * math.pi * k / 8
        x, y = TS / 2 + 90 * math.cos(a), TS / 2 + 90 * math.sin(a)
        s += L(f'M{x - 5:.1f} {y - 6:.1f} L{x + 5:.1f} {y + 6:.1f} M{x + 5:.1f} {y - 6:.1f} L{x:.1f} {y:.1f}', '#f0e8ff', 2.5, .9)
    return s, TS, TS


JOBS = {
    'hoard': (hoard, '고룡의 금은보화'),
    'dragon_skull': (dragon_skull, '오래된 용 머리뼈'),
    'egg_nest': (egg_nest, '용 알 둥지'),
    'obsidian': (obsidian, '흑요석 바위'),
    'bone_pile': (bone_pile, '뼈 무더기'),
    'lava_crack': (lava_crack, '용암 틈'),
    'coins': (coins, '흩어진 금화'),
    'cell_bars': (cell_bars, '감방 쇠창살'),
    'wall_chains': (wall_chains, '벽 사슬'),
    'floor_bones': (floor_bones, '바닥 뼈'),
    'puddle': (puddle, '물웅덩이'),
    'floor_rubble': (floor_rubble, '무너진 돌'),
    'statue': (statue, '감옥 석상'),
    'seal_rune': (seal_rune, '봉인 룬'),
    'dungeon_torch': (dungeon_torch, '지하감옥 벽 횃불'),
}


# 0.70.31 — 어둠 속에서 모양이 읽히게: 위 · 왼쪽 가장자리에 횃불빛이 닿은 듯한 밝은 테(은은하게).
RIM = ('cell_bars', 'wall_chains', 'floor_bones', 'floor_rubble', 'statue', 'dungeon_torch')


def rim_light(names):
    import numpy as np
    for n in names:
        if n not in RIM:
            continue
        p = os.path.join(IA.OUT, f'{n}.png')
        im = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32)
        a = im[..., 3] / 255
        up = np.zeros_like(a)
        up[2:, 1:] = a[:-2, :-1]                      # 왼쪽 위 2점의 알파
        edge = np.clip(a - up, 0, 1) * (a > .5)
        k = (edge * .55)[..., None]
        warm = np.array([255, 224, 176], np.float32)
        im[..., :3] = im[..., :3] * (1 - k) + warm * k
        Image.fromarray(im.clip(0, 255).astype(np.uint8), 'RGBA').save(p, optimize=True)
    print('✓ 테두리 빛', ', '.join(n for n in names if n in RIM))


def preview():
    names = list(JOBS)
    ims = [Image.open(os.path.join(IA.OUT, f'{n}.png')).convert('RGBA') for n in names]
    S = 260
    cols = 7
    rows = (len(ims) + cols - 1) // cols
    out = Image.new('RGBA', (S * cols, S * rows), (70, 58, 54, 255))
    for i, im in enumerate(ims):
        k = min(1.6, (S - 20) / max(im.width, im.height))
        im2 = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
        out.alpha_composite(im2, ((i % cols) * S + (S - im2.width) // 2, (i // cols) * S + S - im2.height - 10))
    out.save(os.path.join(ROOT, 'art', 'preview', 'decor-art.png'))
    print('✓ art/preview/decor-art.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in JOBS] or list(JOBS)
    if '--preview' not in sys.argv:
        IA.SVGDIR = os.path.join(ROOT, 'art', 'decor', '_svg')
        IA.bake(names, JOBS, '둥지 · 지하감옥 꾸밈')
        rim_light(names)
    preview()
