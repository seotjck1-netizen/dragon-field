#!/usr/bin/env python3
"""
성 양옆의 큰 건물 (0.80.27) — 끝없는 탑(성 왼쪽) · 결투장(성 오른쪽).

    python3 tools/landmark-art.py              # → assets/town/tower.webp · arena.webp · manifest(bld_tower · bld_arena)
    python3 tools/landmark-art.py --preview    # art/preview/landmark-art.png 만(굽지 않는다)

사용자(2026-11-21): 「성 왼쪽으로 거대 탑 세우고 탑관리인 이동, 성 오른쪽으로 결투장 만들고 npc 이동」.
마을 집(tools/town-art.py)과 같은 붓 — 짙은 테두리 · 셀 음영 · 왼쪽 위 빛. 그림 크기는 집마다 다르다(게임 px × 4 로 그린다).
  탑      발자리 5 × 3 칸, 그림 180 × 240 — 지도 위 끝을 뚫고 올라가 구름 속으로 사라진다(꼭대기는 안 보인다).
  결투장  발자리 7 × 4 칸, 그림 260 × 200 — 위에서 비스듬히 본 원형 투기장. 안쪽 모래 바닥 · 관중석 · 깃발 · 큰 문.
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
P, F, L, T, solid, shadow, blob = TA.P, TA.F, TA.L, TA.T, TA.solid, TA.shadow, TA.blob
smooth_path, poly_path, clip, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.uid
PAL, hx, mix = TA.PAL, TW.hx, TW.mix
K = TW.K

PAL.update({
    'towerS': ('#6c7590', '#9ba6c4', '#4f566c', '#333849'),
    'towerD': ('#4e5469', '#737b96', '#383d4e', '#232633'),
    'sandst': ('#d6b483', '#f2d9ad', '#b39062', '#856842'),
    'sandD': ('#b08c5e', '#cfae80', '#8c6c44', '#5e462a'),
    'sand': ('#e2c58e', '#f6e2b4', '#c4a56c', '#977c4a'),
    'seatR': ('#a84a3c', '#cf7464', '#84382c', '#5a241c'),
    'seatS': ('#c9b28a', '#e6d4b0', '#a8926a', '#7c6a48'),
})
TA.TDEFS = TA._grads() + TA.TDEFS[TA.TDEFS.index('<filter'):]
RUNE = '#b98cff'


def _cyl(gid, mat):
    """원기둥 — 왼쪽이 밝고 오른쪽이 어두운 가로 그라데이션"""
    c = PAL[mat]
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{c[2]}"/>'
            f'<stop offset=".18" stop-color="{c[1]}"/><stop offset=".45" stop-color="{c[0]}"/>'
            f'<stop offset=".8" stop-color="{c[2]}"/><stop offset="1" stop-color="{c[3]}"/></linearGradient>')


def torch(x, y, s=1.0):
    """세운 화로 — 쇠 받침 · 불꽃 · 빛무리"""
    o = f'<ellipse cx="{x}" cy="{y - 70 * s}" rx="{70 * s}" ry="{60 * s}" fill="#ffb040" opacity=".35" filter="url(#glow12)"/>'
    o += P(poly_path([(x - 10 * s, y), (x + 10 * s, y), (x + 6 * s, y - 50 * s), (x - 6 * s, y - 50 * s)]), hx('ironL', 0), 4)
    o += P(smooth_path([(x - 26 * s, y - 52 * s), (x + 26 * s, y - 52 * s), (x + 18 * s, y - 34 * s), (x - 18 * s, y - 34 * s)], k=.2), hx('ironL', 1), 4)
    fl = smooth_path([(x - 20 * s, y - 54 * s), (x - 12 * s, y - 86 * s), (x - 2 * s, y - 74 * s), (x + 4 * s, y - 108 * s),
                      (x + 14 * s, y - 80 * s), (x + 20 * s, y - 54 * s)], k=.35)
    o += P(fl, '#ff8a2a', 4) + F(smooth_path([(x - 9 * s, y - 56 * s), (x, y - 88 * s), (x + 9 * s, y - 56 * s)], k=.4), '#ffe080', 1)
    return o


# ═════════════════════════════════════════════════════════════
# 끝없는 탑 — 180 × 240 (게임), 발자리 5 × 3
# ═════════════════════════════════════════════════════════════
TW_W, TW_H = 180 * K, 240 * K


def bld_tower():
    W, H = TW_W, TW_H
    cx = W / 2
    rng = random.Random(5)
    s = '<defs>' + _cyl('cylT', 'towerS') + _cyl('cylB', 'towerD') + (
        '<linearGradient id="skyfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef4ff" stop-opacity=".95"/>'
        '<stop offset=".55" stop-color="#eef4ff" stop-opacity=".35"/><stop offset="1" stop-color="#eef4ff" stop-opacity="0"/></linearGradient>') + '</defs>'
    s += shadow(cx + 30, H - 20, 330, 46, .35)
    # 몸통 — 아래 반지름 232, 위로 갈수록 조금 가늘다(위 끝 200)
    top, bot = -40, H - 150
    rb, rt = 232, 200
    rx = lambda y: rt + (rb - rt) * (y - top) / (bot - top)
    body = poly_path([(cx - rt, top), (cx + rt, top), (cx + rb, bot), (cx - rb, bot)])
    s += P(body, 'url(#cylT)', 7)
    inner = ''
    # 돌 줄 — 원기둥이라 가운데가 아래로 조금 처진 곡선, 이음매는 각도로 놓아 가장자리가 좁다
    y, r = top + 10, 0
    while y < bot:
        h = rng.choice([40, 46, 52])
        R = rx(y)
        inner += L(f'M{cx - R} {y} Q{cx} {y + 22} {cx + R} {y}', hx('towerS', 3), 4, .9)
        inner += L(f'M{cx - R + 10} {y + 7} Q{cx} {y + 27} {cx + R * .2} {y + 9}', hx('towerS', 1), 3, .35)
        off = (r % 2) * .5
        for k in range(-5, 6):
            a = (k + off) * (math.pi / 12)
            if abs(a) > math.pi / 2 - .05:
                continue
            x = cx + R * math.sin(a)
            yy = y + 22 * (1 - (x - cx) ** 2 / (R * R))
            inner += L(f'M{x:.1f} {yy:.1f} L{x:.1f} {yy + h:.1f}', hx('towerS', 3), 3.5, .8)
        y += h
        r += 1
    # 띠(층마다 두른 돌띠) · 룬
    for by in (bot - 250, bot - 520, bot - 790):
        R = rx(by) + 18
        band = f'M{cx - R} {by} Q{cx} {by + 26} {cx + R} {by} L{cx + R} {by + 34} Q{cx} {by + 60} {cx - R} {by + 34} Z'
        inner += P(band, 'url(#cylB)', 5)
        inner += L(f'M{cx - R + 14} {by + 12} Q{cx} {by + 36} {cx + R - 14} {by + 12}', hx('towerD', 1), 4, .55)
        for k in range(-4, 5):
            a = k * math.pi / 10
            x = cx + (R - 10) * math.sin(a)
            yy = by + 17 + 26 * (1 - ((x - cx) / R) ** 2)
            inner += f'<circle cx="{x:.1f}" cy="{yy:.1f}" r="{7 * math.cos(a) + 2:.1f}" fill="{RUNE}" opacity=".9"/>'
        inner += f'<path d="M{cx - R} {by + 20} Q{cx} {by + 46} {cx + R} {by + 20}" fill="none" stroke="{RUNE}" stroke-width="10" opacity=".35" filter="url(#soft3)"/>'
    # 창 — 가운데와 양옆(옆은 원기둥을 따라 좁게)
    for wy in (bot - 380, bot - 650, bot - 900):
        for a, sc in ((0, 1.0), (-.95, .55), (.95, .55)):
            R = rx(wy)
            x = cx + R * math.sin(a)
            w = 40 * sc
            win = smooth_path([(x - w, wy + 70), (x - w, wy + 10), (x, wy - 20), (x + w, wy + 10), (x + w, wy + 70)], k=.3)
            inner += f'<ellipse cx="{x}" cy="{wy + 30}" rx="{w * 1.6}" ry="60" fill="#c8a0ff" opacity=".25" filter="url(#glow12)"/>'
            inner += P(win, '#2a1f48', 6) + F(smooth_path([(x - w * .55, wy + 64), (x - w * .55, wy + 18), (x, wy - 2), (x + w * .55, wy + 18), (x + w * .55, wy + 64)], k=.3), RUNE, .55)
    # 덩굴 · 이끼 — 왼쪽 아래
    for i in range(5):
        vx = cx - rb + 30 + i * 22
        inner += L(f'M{vx} {bot} Q{vx - 20} {bot - 120 - i * 30} {vx + 6} {bot - 220 - i * 40}', '#4f8a4a', 7, .8)
        for j in range(4):
            ly = bot - 40 - j * 50 - i * 20
            inner += f'<ellipse cx="{vx - 8 + (j % 2) * 16}" cy="{ly}" rx="14" ry="9" fill="#6cb04a" stroke="{OL}" stroke-width="3"/>'
    # 위 끝은 하늘빛으로 바래 구름 속으로 사라진다(몸통 안에서만)
    inner += f'<rect x="0" y="{top}" width="{W}" height="300" fill="url(#skyfade)"/>'
    s += clip(uid('tw'), body, inner)
    s += L(body, OL, 7)
    # 구름 — 위 끝을 감싼다
    for (bx, by, br, sd) in ((cx - 210, 120, 90, 1), (cx + 190, 80, 110, 2), (cx - 40, 40, 120, 3), (cx + 60, 170, 70, 4), (cx - 260, 30, 80, 5)):
        cl = blob(bx, by, br, n=11, jag=.18, seed=sd, sq=.55)
        s += f'<path d="{cl}" fill="#ffffff" opacity=".88"/>' + L(cl, '#c9d6ee', 5, .7)
    # 받침 — 팔각 돌 받침 · 계단
    base = poly_path([(cx - 300, H - 150), (cx + 300, H - 150), (cx + 330, H - 40), (cx - 330, H - 40)])
    s += P(base, T('stoneD', 'tv'), 6)
    bi = ''
    for k in range(-6, 7):
        bi += L(f'M{cx + k * 50} {H - 150} L{cx + k * 55} {H - 40}', hx('stoneD', 3), 4, .7)
    bi += L(f'M{cx - 316} {H - 96} L{cx + 316} {H - 96}', hx('stoneD', 3), 4, .8)
    bi += L(f'M{cx - 300} {H - 142} L{cx + 300} {H - 142}', hx('stoneD', 1), 4, .6)
    s += clip(uid('tb'), base, bi) + L(base, OL, 6)
    for i, (w, yy) in enumerate(((130, H - 40), (150, H - 20), (170, H))):
        s += P(poly_path([(cx - w, yy - 22), (cx + w, yy - 22), (cx + w + 6, yy), (cx - w - 6, yy)]), T('stoneB', 'tv'), 5)
    # 문 — 큰 아치, 안에서 보랏빛이 새어 나온다 · 문 위 룬 원
    dt, db = H - 330, H - 62
    fr = smooth_path([(cx - 108, db), (cx - 108, dt + 90), (cx, dt - 10), (cx + 108, dt + 90), (cx + 108, db)], k=.32)
    s += P(fr, T('towerD', 'tv'), 6)
    dr = smooth_path([(cx - 80, db), (cx - 80, dt + 96), (cx, dt + 20), (cx + 80, dt + 96), (cx + 80, db)], k=.32)
    s += P(dr, '#1c1534', 5)
    s += f'<ellipse cx="{cx}" cy="{db - 70}" rx="70" ry="90" fill="{RUNE}" opacity=".45" filter="url(#glow12)"/>'
    s += clip(uid('td'), dr, L(f'M{cx - 80} {db - 40} L{cx + 80} {db - 40}', RUNE, 6, .5) + L(f'M{cx} {dt + 30} L{cx} {db}', '#000000', 5, .3))
    s += f'<circle cx="{cx}" cy="{dt - 60}" r="44" fill="#231a3e" stroke="{OL}" stroke-width="6"/>'
    s += f'<circle cx="{cx}" cy="{dt - 60}" r="30" fill="none" stroke="{RUNE}" stroke-width="6"/>'
    s += f'<path d="M{cx} {dt - 88} L{cx + 24} {dt - 46} L{cx - 24} {dt - 46} Z" fill="none" stroke="{RUNE}" stroke-width="5"/>'
    s += f'<circle cx="{cx}" cy="{dt - 60}" r="54" fill="{RUNE}" opacity=".25" filter="url(#glow12)"/>'
    s += torch(cx - 200, H - 140, 1.1) + torch(cx + 200, H - 140, 1.1)
    return s


# ═════════════════════════════════════════════════════════════
# 결투장 — 260 × 200 (게임), 발자리 7 × 4
# ═════════════════════════════════════════════════════════════
AR_W, AR_H = 260 * K, 200 * K


def _ell(cx, cy, rx, ry, half=None):
    if half == 'front':
        return f'M{cx - rx} {cy} A{rx} {ry} 0 0 0 {cx + rx} {cy}'
    return f'M{cx - rx} {cy} A{rx} {ry} 0 1 0 {cx + rx} {cy} A{rx} {ry} 0 1 0 {cx - rx} {cy} Z'


def bld_arena():
    W, H = AR_W, AR_H
    cx = W / 2
    rx, ry = 452, 196
    rimY, baseY = 300, 596           # 테두리 타원 · 바닥 타원의 가운데 줄 — 벽 높이 296
    rng = random.Random(9)
    s = '<defs>' + _cyl('cylA', 'sandst') + '</defs>'
    s += shadow(cx + 20, H - 26, 500, 60, .35)
    # 안쪽 — 테두리 타원 안: 관중석 고리 · 모래 바닥
    rim = _ell(cx, rimY, rx, ry)
    s += P(rim, hx('sandD', 0), 6)
    inner = ''
    for i, (k, mat) in enumerate(((0.92, 'seatS'), (0.82, 'seatR'), (0.72, 'seatS'), (0.62, 'seatR'))):
        e = _ell(cx, rimY + 18 + i * 10, rx * k, ry * k)
        inner += P(e, T(mat, 'tv'), 4)
        for a in range(0, 360, 12):
            t = math.radians(a)
            x0, y0 = cx + rx * k * math.cos(t), rimY + 18 + i * 10 + ry * k * math.sin(t)
            inner += f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="5" fill="{hx(mat, 3)}" opacity=".5"/>'
    # 관중(작은 머리들) — 뒤쪽 좌석
    cols = ['#e8b48c', '#c98a5e', '#f2d0a8', '#8a5a3a']
    for a in range(200, 341, 7):
        for ring, k in ((0, .87), (1, .77)):
            t = math.radians(a + ring * 3)
            x0, y0 = cx + rx * k * math.cos(t), rimY + 22 + ring * 10 + ry * k * math.sin(t)
            inner += f'<circle cx="{x0:.1f}" cy="{y0 - 6:.1f}" r="8" fill="{rng.choice(cols)}" stroke="{OL}" stroke-width="2.5"/>'
            inner += f'<rect x="{x0 - 8:.1f}" y="{y0 + 1:.1f}" width="16" height="9" rx="3" fill="{rng.choice(["#c84a3c", "#3f78c0", "#e2b43c", "#6cb04a"])}" stroke="{OL}" stroke-width="2"/>'
    sand = _ell(cx, rimY + 52, rx * .52, ry * .48)
    inner += P(sand, T('sand', 'tr'), 5)
    sin = ''
    for i in range(40):
        a = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0, .9)
        sin += f'<circle cx="{cx + rx * .52 * rr * math.cos(a):.1f}" cy="{rimY + 52 + ry * .48 * rr * math.sin(a):.1f}" r="{rng.uniform(2, 4):.1f}" fill="{hx("sand", 2)}" opacity=".7"/>'
    sin += L(_ell(cx, rimY + 52, rx * .2, ry * .18), hx('sand', 3), 5, .55)
    sin += L(f'M{cx - 40} {rimY + 52} L{cx + 40} {rimY + 52}', hx('sand', 3), 4, .5)
    inner += clip(uid('sd'), sand, sin)
    s += clip(uid('ar'), rim, inner)
    # 바깥벽(앞쪽) — 테두리 앞 반타원 ~ 바닥 앞 반타원 사이
    wall = (f'M{cx - rx} {rimY} A{rx} {ry} 0 0 0 {cx + rx} {rimY} L{cx + rx} {baseY} '
            f'A{rx} {ry} 0 0 1 {cx - rx} {baseY} Z')
    s += P(wall, 'url(#cylA)', 7)
    wi = ''
    # 층 띠 두 줄 · 아치 두 층
    for frac in (.36, .70):
        yo = rimY + (baseY - rimY) * frac
        wi += P(f'M{cx - rx} {yo} A{rx} {ry} 0 0 0 {cx + rx} {yo} L{cx + rx} {yo + 22} A{rx} {ry} 0 0 1 {cx - rx} {yo + 22} Z', hx('sandD', 0), 4)
        wi += L(f'M{cx - rx} {yo + 6} A{rx} {ry} 0 0 0 {cx + rx} {yo + 6}', hx('sandst', 1), 4, .6)
    for tier, (f0, f1) in enumerate(((.06, .34), (.42, .68))):
        for a in range(196, 345, 12):
            t = math.radians(a)
            ca = abs(math.cos(t))
            x = cx + rx * math.cos(t)
            ybase = ry * -math.sin(t)
            y0 = rimY + (baseY - rimY) * f0 + ybase
            y1 = rimY + (baseY - rimY) * f1 + ybase
            w = 30 * math.sqrt(max(.08, 1 - ca * ca)) + 4
            if tier == 1 and abs(a - 270) < 14:
                continue
            ar = smooth_path([(x - w, y1), (x - w, y0 + w), (x, y0), (x + w, y0 + w), (x + w, y1)], k=.3)
            wi += P(ar, '#3a2a1e', 4) + F(poly_path([(x + w * .1, y0 + 4), (x + w, y0 + w), (x + w, y1), (x + w * .1, y1)]), '#000000', .25)
    # 돌 줄눈
    for frac in (.18, .52, .86):
        yo = rimY + (baseY - rimY) * frac
        wi += L(f'M{cx - rx} {yo} A{rx} {ry} 0 0 0 {cx + rx} {yo}', hx('sandst', 3), 3, .45)
    s += clip(uid('aw'), wall, wi) + L(wall, OL, 7)
    # 테두리 위 난간(앞) · 깃발
    par = ''
    for a in range(182, 359, 6):
        t = math.radians(a)
        x = cx + rx * math.cos(t)
        y = rimY - ry * math.sin(t)
        w = 16 * math.sqrt(max(.1, 1 - math.cos(t) ** 2)) + 3
        par += P(poly_path([(x - w, y + 4), (x + w, y + 4), (x + w, y - 22), (x - w, y - 22)]), hx('sandst', 1), 3.5)
    s += par
    for i, a in enumerate((205, 240, 300, 335)):
        t = math.radians(a)
        x = cx + rx * math.cos(t)
        y = rimY - ry * math.sin(t) - 18
        col = 'canvasR' if i % 2 == 0 else 'canvasB'
        s += L(f'M{x} {y} L{x} {y - 150}', OL, 10) + L(f'M{x} {y} L{x} {y - 150}', hx('timber', 1), 5)
        fl = smooth_path([(x + 3, y - 148), (x + 80, y - 136), (x + 64, y - 118), (x + 86, y - 98), (x + 3, y - 92)], k=.25)
        s += P(fl, T(col, 'tv'), 4)
        s += f'<circle cx="{x}" cy="{y - 154}" r="8" fill="{hx("gold", 0)}" stroke="{OL}" stroke-width="3"/>'
    # 깃발 — 뒤쪽(테두리 뒤 반원)에도 둘
    for a in (150, 30):
        t = math.radians(a)
        x = cx + rx * .96 * math.cos(t)
        y = rimY - ry * .96 * math.sin(t) - 10
        s += L(f'M{x} {y} L{x} {y - 110}', OL, 9) + L(f'M{x} {y} L{x} {y - 110}', hx('timber', 1), 4)
        s += P(smooth_path([(x + 3, y - 108), (x + 60, y - 98), (x + 46, y - 84), (x + 62, y - 70), (x + 3, y - 66)], k=.25), T('gold', 'tv'), 4)
    # 큰 문 — 앞 가운데, 쇠창살 · 위에 방패와 엇갈린 칼
    gx, gb = cx, baseY + ry - 6
    gt = gb - 200
    fr = smooth_path([(gx - 118, gb), (gx - 118, gt + 80), (gx, gt - 26), (gx + 118, gt + 80), (gx + 118, gb)], k=.32)
    s += P(fr, T('sandD', 'tv'), 6)
    gd = smooth_path([(gx - 88, gb), (gx - 88, gt + 84), (gx, gt + 6), (gx + 88, gt + 84), (gx + 88, gb)], k=.32)
    s += P(gd, '#22180f', 5)
    bars = ''
    for k in range(-3, 4):
        bars += L(f'M{gx + k * 24} {gt} L{gx + k * 24} {gb}', OL, 9) + L(f'M{gx + k * 24} {gt} L{gx + k * 24} {gb}', hx('ironL', 1), 4)
    for yy in (gt + 70, gt + 130):
        bars += L(f'M{gx - 90} {yy} L{gx + 90} {yy}', OL, 9) + L(f'M{gx - 90} {yy} L{gx + 90} {yy}', hx('ironL', 1), 4)
    s += clip(uid('gt'), gd, f'<ellipse cx="{gx}" cy="{gb - 40}" rx="70" ry="50" fill="#ff9a40" opacity=".35" filter="url(#glow12)"/>' + bars)
    sy = gt - 70
    for sgn in (-1, 1):
        s += L(f'M{gx - 70 * sgn} {sy + 60} L{gx + 70 * sgn} {sy - 56}', OL, 16) + L(f'M{gx - 70 * sgn} {sy + 60} L{gx + 70 * sgn} {sy - 56}', '#dfe6f0', 8)
        s += L(f'M{gx - 50 * sgn} {sy + 30} L{gx - 30 * sgn} {sy + 56}', OL, 14) + L(f'M{gx - 50 * sgn} {sy + 30} L{gx - 30 * sgn} {sy + 56}', hx('gold', 0), 7)
    sh = smooth_path([(gx - 40, sy - 34), (gx + 40, sy - 34), (gx + 40, sy + 6), (gx, sy + 44), (gx - 40, sy + 6)], k=.25)
    s += P(sh, T('canvasR', 'tv'), 6)
    s += P(smooth_path([(gx - 14, sy - 16), (gx + 14, sy - 16), (gx + 14, sy + 4), (gx, sy + 20), (gx - 14, sy + 4)], k=.25), T('gold', 'tv'), 4)
    s += torch(gx - 170, gb + 4, 1.0) + torch(gx + 170, gb + 4, 1.0)
    return s


BUILD = {'bld_tower': (bld_tower, TW_W, TW_H, '끝없는 탑(성 왼쪽)'), 'bld_arena': (bld_arena, AR_W, AR_H, '결투장(성 오른쪽)')}


def render(names, dst_dir):
    os.makedirs(dst_dir, exist_ok=True)
    jobs = []
    for n in names:
        fn, w, h, _ = BUILD[n]
        sp = os.path.join(dst_dir, f'{n}.svg')
        open(sp, 'w').write(TW.svg_doc(fn(), w, h, 0))
        jobs.append({'svg': sp, 'out': os.path.join(dst_dir, f'{n}.png'), 'w': int(w), 'h': int(h), 'name': n})
    lp = os.path.join(dst_dir, 'list.json')
    json.dump(jobs, open(lp, 'w'))
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True)
    return jobs


def bake(names):
    jobs = render(names, os.path.join(ROOT, 'art', 'town', '_svg'))
    man_p = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    man = json.load(open(man_p, encoding='utf-8'))
    for j in jobs:
        n = j['name']
        lw, lh = j['w'] // K, j['h'] // K
        im = Image.open(j['out']).convert('RGBA').resize((lw * 2, lh * 2), Image.LANCZOS)
        rel = f'town/{n[4:]}.webp'
        im.save(os.path.join(ROOT, 'assets', rel), 'WEBP', quality=90, method=6, alpha_quality=95)
        man[n] = {**man.get(n, {}), 'src': f'assets/{rel}', 'w': lw, 'h': lh, 'label': BUILD[n][3]}
    with open(man_p, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'✓ 큰 건물 {len(jobs)}장')


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in BUILD] or list(BUILD)
    if '--preview' in sys.argv:
        out = os.path.join(ROOT, 'art', 'preview')
        jobs = render(names, os.path.join(out, '_landmark'))
        ims = [Image.open(j['out']).convert('RGBA') for j in jobs]
        W = sum(i.width for i in ims) + 60 * (len(ims) + 1)
        H = max(i.height for i in ims) + 120
        sheet = Image.new('RGBA', (W, H), (104, 150, 86, 255))
        x = 60
        for im in ims:
            sheet.alpha_composite(im, (x, H - 60 - im.height))
            x += im.width + 60
        sheet.save(os.path.join(out, 'landmark-art.png'))
        print('✓ art/preview/landmark-art.png')
    else:
        bake(names)
