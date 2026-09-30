#!/usr/bin/env python3
"""
몬스터 새 그림 (0.70.28) — 사람(새 몸 · 마을 사람)과 **같은 그림체**로 다시 그린다.

  python3 tools/monster-art.py                 # 전부 → assets/sprites/monsters/*.png + 미리보기
  python3 tools/monster-art.py slime wolf      # 고른 것만
  python3 tools/monster-art.py --preview       # 미리보기(art/preview/monsters.png)만

── 그림체 ──────────────────────────────────────────────────
  사람 장비 그림(tools/gear-art.py)과 같은 붓을 쓴다.
    · 짙은 밤색 테두리(OL) — 굵은 바깥선, 가는 안쪽 선
    · 재질마다 네 단 색(바탕 · 밝은 면 · 그늘 · 짙은 그늘) + 왼쪽 위에서 오는 빛(bevel)
    · 눈은 크고 또렷하게, 반짝이는 흰 점 — 3등신 사람들과 한 세상에 있어야 한다
  예전 몬스터는 테두리 없는 둥근 도형이라 사람 옆에 서면 **다른 게임에서 온 것처럼** 보였다.

── 그리는 장 ────────────────────────────────────────────────
  한 마리당 다섯 장: field(서기) · walk1 · walk2 · battle(전투 서기) · attack(때리는 순간)
  모두 1024×1024 캔버스에 왼쪽(주인공 쪽)을 보고 그린다. 발은 아래 변 근처(y≈960).
    battle · attack  → 512×512 (게임에서 256×256)
    field · walk     → 128×128 (게임에서 64×64)
  그림자는 그리지 않는다 — 게임이 발밑에 따로 깐다.
  tools/painted.json 에 적어 두어 `npm run assets` 가 옛 그림으로 덮지 않게 한다.
"""
import importlib.util
import json
import math
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sp = importlib.util.spec_from_file_location('gear_art', os.path.join(ROOT, 'tools', 'gear-art.py'))
GA = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(GA)

MAT, GEM, OL = GA.MAT, GA.GEM, GA.OL
smooth_path, poly_path, clip, uid, glow_line = GA.smooth_path, GA.poly_path, GA.clip, GA.uid, GA.glow_line
G = GA.G

C = 1024          # 캔버스
LWM = 11          # 바깥선 굵기(1024 캔버스 — 게임에서 사람 테두리와 같은 굵기가 되게)
LWI = 5           # 안쪽 선
OUT = os.path.join(ROOT, 'assets', 'sprites', 'monsters')
PREVIEW = os.path.join(ROOT, 'art', 'preview')
SVGDIR = os.path.join(ROOT, 'art', 'monsters', '_svg')

# 몬스터 재질 — 바탕 · 밝은 면 · 그늘 · 짙은 그늘 (gear-art 의 MAT 와 같은 꼴)
MON = {
    'gel':      ('#3aa6e8', '#9fe0ff', '#1f73b8', '#154f86'),
    'gelIn':    ('#63c3f5', '#c8f0ff', '#3a93d6', '#2a6aa6'),
    'batfur':   ('#6b4c9e', '#9677c8', '#4d3478', '#33204f'),
    'batwing':  ('#4a2f73', '#6f4ea0', '#352055', '#22143a'),
    'cap':      ('#d8352a', '#ff6a55', '#a4221c', '#6e1410'),
    'stem':     ('#efe2c2', '#fff8e6', '#cdbb94', '#9b8963'),
    'wolf':     ('#8b8f9c', '#c3c7d2', '#62666f', '#43464d'),
    'wolfD':    ('#5a5d68', '#80848f', '#3e4048', '#2a2c32'),
    'wolfL':    ('#d6d8de', '#f4f5f8', '#aeb1ba', '#83868f'),
    'imp':      ('#d8463a', '#ff7a5e', '#a52d25', '#6e1a15'),
    'impW':     ('#8e2230', '#bf3a48', '#661521', '#420c15'),
    'bone':     ('#eadfc6', '#fffaf0', '#c4b594', '#8f8163'),
    'rustI':    ('#8a6a52', '#b48c6c', '#654a38', '#433024'),
    'woodS':    ('#8a5a33', '#b07a4a', '#65401f', '#432a14'),
    'dArmor':   ('#3e3552', '#62567e', '#2a2339', '#1a1524'),
    'dSkin':    ('#b8322e', '#e05a4a', '#86211e', '#571412'),
    'gold':     MAT['gold'],
    'steel':    MAT['steel'],
    'iron':     MAT['iron'],
    'purple':   MAT['purple'],
    'cloth':    MAT['cloth'],
    'leather':  MAT['leather'],
    'crimson':  MAT['crimson'],
    'dragonR':  ('#c8392c', '#f06a4e', '#94261d', '#5f1712'),
    'dragonB':  ('#f0b45a', '#ffe0a0', '#c98838', '#8e5a1e'),
    'dragonW':  ('#8e2a22', '#bb4636', '#661b16', '#42100d'),
    'elder':    ('#4a3f86', '#7466b8', '#342b63', '#221c43'),
    'elderB':   ('#8fb8d8', '#d0ecff', '#6690b4', '#46688a'),
    'elderW':   ('#2e2752', '#4a4082', '#211b3c', '#140f27'),
    'chain':    ('#8a8f99', '#c9ced6', '#5f646d', '#3f434a'),
}


def _grads():
    out = ''
    for k, (b, lit, sh, dk) in MON.items():
        out += (f'<linearGradient id="mg_{k}" x1="0" y1="0" x2="1" y2="1">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".35" stop-color="{b}"/>'
                f'<stop offset=".75" stop-color="{b}"/><stop offset="1" stop-color="{sh}"/></linearGradient>')
        out += (f'<radialGradient id="mr_{k}" cx=".36" cy=".3" r=".78">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".45" stop-color="{b}"/>'
                f'<stop offset="1" stop-color="{sh}"/></radialGradient>')
        out += (f'<linearGradient id="mv_{k}" x1="0" y1="0" x2="0" y2="1">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".45" stop-color="{b}"/>'
                f'<stop offset="1" stop-color="{sh}"/></linearGradient>')
    return out


MDEFS = _grads() + '''
<radialGradient id="fireG" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#fff6d0"/><stop offset=".35" stop-color="#ffc44a"/><stop offset=".7" stop-color="#ff6a1a"/><stop offset="1" stop-color="#d2280a" stop-opacity="0"/></radialGradient>
<radialGradient id="voidG" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#f6e6ff"/><stop offset=".35" stop-color="#c77dff"/><stop offset=".7" stop-color="#6a2bd0"/><stop offset="1" stop-color="#2a0a6a" stop-opacity="0"/></radialGradient>
<radialGradient id="sporeG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f4ffb0" stop-opacity=".95"/><stop offset=".6" stop-color="#b8e05a" stop-opacity=".6"/><stop offset="1" stop-color="#8ab83a" stop-opacity="0"/></radialGradient>
<radialGradient id="auraP" cx=".5" cy=".55" r=".5"><stop offset="0" stop-color="#b86bff" stop-opacity=".55"/><stop offset="1" stop-color="#5a1aa0" stop-opacity="0"/></radialGradient>
<filter id="mblur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="mblur10" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="mblur18" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
<pattern id="scalesM" width="30" height="22" patternUnits="userSpaceOnUse">
  <rect width="30" height="22" fill="#94261d"/>
  <path d="M-15 22 a15 15 0 0 1 30 0 M15 22 a15 15 0 0 1 30 0" fill="#b83327" stroke="#5f1712" stroke-width="2.4"/>
  <path d="M0 11 a15 15 0 0 1 30 0" fill="#c8392c" stroke="#661b16" stroke-width="2.4"/>
  <path d="M8 8 q7 -5 14 0" fill="none" stroke="#ff8a6a" stroke-width="2" opacity=".55"/>
</pattern>
<pattern id="scalesE" width="30" height="22" patternUnits="userSpaceOnUse">
  <rect width="30" height="22" fill="#2a2252"/>
  <path d="M-15 22 a15 15 0 0 1 30 0 M15 22 a15 15 0 0 1 30 0" fill="#3c3272" stroke="#171233" stroke-width="2.4"/>
  <path d="M0 11 a15 15 0 0 1 30 0" fill="#4a3f86" stroke="#1c163c" stroke-width="2.4"/>
  <path d="M8 8 q7 -5 14 0" fill="none" stroke="#9d8ff0" stroke-width="2" opacity=".55"/>
</pattern>
<pattern id="furW" width="26" height="30" patternUnits="userSpaceOnUse">
  <path d="M4 26 q6 -12 3 -22 M16 28 q6 -12 2 -24" fill="none" stroke="#43464d" stroke-width="2.4" opacity=".35"/>
</pattern>
'''


def MG(mat, kind='mg'):
    return f'url(#{kind}_{mat})'


def P(d, fill, w=LWM, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{OL}" stroke-width="{w}" stroke-linejoin="round" {extra}/>'


def F(d, fill, op=1.0, extra=''):
    return f'<path d="{d}" fill="{fill}" opacity="{op}" {extra}/>'


def L(d, color, w=LWI, op=1.0, extra=''):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" '
            f'stroke-linejoin="round" opacity="{op}" {extra}/>')


def E(cx, cy, rx, ry, fill, w=LWM, extra=''):
    return f'<ellipse cx="{cx:.1f}" cy="{cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}" fill="{fill}" stroke="{OL}" stroke-width="{w}" {extra}/>'


def shade(d, mat, k=9, w=16, lit=.5, dk=.42):
    """부피 — 왼쪽 위 안쪽은 밝게, 오른쪽 아래 안쪽은 어둡게(gear-art 의 bevel 과 같은 방식, 굵게)."""
    c = MON[mat]
    return clip(uid('sh'), d, L(d, c[1], w, lit, f'transform="translate({k} {k})"')
                + L(d, c[3], w + 4, dk, f'transform="translate({-k} {-k})"'))


def body(d, mat, kind='mr', w=LWM, k=9, bw=16):
    """선 두른 몸통 + 부피."""
    return P(d, MG(mat, kind), w) + shade(d, mat, k, bw) + L(d, OL, w)


# 0.70.29 — 표정(맞은 순간 · 쓰러짐). 모든 몬스터가 eye() · glowing_eye() 로 눈을 그리므로
# 여기 한 곳만 바꾸면 모두의 표정이 바뀐다.
EXPR = {'mode': 'normal', 'n': 0}


def _shut_eye(x, y, r):
    """질끈 감은 눈 — 왼눈 >, 오른눈 < (그리는 차례로 가른다)."""
    k = 1 if EXPR['n'] % 2 == 0 else -1
    EXPR['n'] += 1
    d = f'M{x - k * r * .9} {y - r * .55} L{x + k * r * .35} {y} L{x - k * r * .9} {y + r * .55}'
    return L(d, OL, LWI + 5)


def _ko_eye(x, y, r):
    """기절한 눈 — ×."""
    d = f'M{x - r * .7} {y - r * .7} L{x + r * .7} {y + r * .7} M{x + r * .7} {y - r * .7} L{x - r * .7} {y + r * .7}'
    return L(d, OL, LWI + 5)


def eye(x, y, r, iris='#ffd23a', pupil='#1a0e06', look=(-0.25, 0.05), angry=0, slit=False, glow=None):
    if EXPR['mode'] == 'hurt':
        return _shut_eye(x, y, r)
    if EXPR['mode'] == 'ko':
        return _ko_eye(x, y, r)
    return _eye(x, y, r, iris, pupil, look, angry, slit, glow)


def _eye(x, y, r, iris='#ffd23a', pupil='#1a0e06', look=(-0.25, 0.05), angry=0, slit=False, glow=None):
    """큰 눈 — 흰자 · 홍채 · 눈동자 · 반짝이. angry>0 이면 위 눈꺼풀을 비스듬히 덮는다."""
    s = ''
    if glow:
        s += f'<circle cx="{x}" cy="{y}" r="{r * 1.7}" fill="{glow}" opacity=".55" filter="url(#mblur10)"/>'
    s += E(x, y, r, r * 1.08, '#fffdf6', LWI + 1)
    ix, iy = x + look[0] * r, y + look[1] * r
    s += f'<circle cx="{ix:.1f}" cy="{iy:.1f}" r="{r * .68:.1f}" fill="{iris}"/>'
    if slit:
        s += f'<ellipse cx="{ix:.1f}" cy="{iy:.1f}" rx="{r * .16:.1f}" ry="{r * .56:.1f}" fill="{pupil}"/>'
    else:
        s += f'<circle cx="{ix:.1f}" cy="{iy:.1f}" r="{r * .38:.1f}" fill="{pupil}"/>'
    s += f'<circle cx="{ix - r * .26:.1f}" cy="{iy - r * .28:.1f}" r="{r * .2:.1f}" fill="#ffffff"/>'
    s += f'<circle cx="{ix + r * .22:.1f}" cy="{iy + r * .24:.1f}" r="{r * .09:.1f}" fill="#ffffff" opacity=".8"/>'
    if angry:
        # 눈꺼풀: 바깥쪽(-) 이 높고 코 쪽이 내려온 사선
        lid = poly_path([(x - r * 1.3, y - r * 1.25), (x + r * 1.3, y - r * 1.25), (x + r * 1.3, y - r * (1.1 - angry * .9)),
                         (x - r * 1.3, y - r * (0.45 + angry * .2))])
        s += clip(uid('ey'), f'M{x - r} {y} a{r} {r * 1.08} 0 1 0 {2 * r} 0 a{r} {r * 1.08} 0 1 0 {-2 * r} 0', F(lid, OL, 1))
        s += L(f'M{x - r * 1.25} {y - r * (0.5 + angry * .2)} L{x + r * 1.25} {y - r * (1.12 - angry * .9)}', OL, LWI + 3)
    s += E(x, y, r, r * 1.08, 'none', LWI + 1)
    return s


def glowing_eye(x, y, r, color, core='#ffffff'):
    """빛나는 눈(해골 · 망령 · 악마 투구 안). 맞으면 가늘게 떨고, 쓰러지면 꺼진다."""
    if EXPR['mode'] == 'ko':
        return f'<ellipse cx="{x}" cy="{y}" rx="{r * .5}" ry="{r * .3}" fill="#3a3f48"/>'
    if EXPR['mode'] == 'hurt':
        return (f'<circle cx="{x}" cy="{y}" r="{r * 1.4}" fill="{color}" opacity=".35" filter="url(#mblur10)"/>'
                f'<ellipse cx="{x}" cy="{y}" rx="{r * .9}" ry="{r * .25}" fill="{color}"/>')
    return (f'<circle cx="{x}" cy="{y}" r="{r * 2.2}" fill="{color}" opacity=".5" filter="url(#mblur10)"/>'
            f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r * .8}" fill="{color}"/>'
            f'<ellipse cx="{x - r * .15}" cy="{y - r * .1}" rx="{r * .45}" ry="{r * .35}" fill="{core}"/>')


def fang(x, y, w, h, flip=False):
    sgn = -1 if flip else 1
    return P(poly_path([(x - w / 2, y), (x, y + sgn * h), (x + w / 2, y)]), '#fffaf0', LWI)


def rot(pts, cx, cy, a):
    ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
    return [(cx + (x - cx) * ca - (y - cy) * sa, cy + (x - cx) * sa + (y - cy) * ca) for x, y in pts]


def g(inner, tx=0, ty=0, r=0, cx=0, cy=0, sx=1, sy=1):
    t = f'translate({tx:.1f} {ty:.1f})'
    if r:
        t += f' rotate({r:.1f} {cx:.1f} {cy:.1f})'
    if sx != 1 or sy != 1:
        t += f' translate({cx:.1f} {cy:.1f}) scale({sx:.3f} {sy:.3f}) translate({-cx:.1f} {-cy:.1f})'
    return f'<g transform="{t}">{inner}</g>'


def doc(inner):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{C}" height="{C}" viewBox="0 0 {C} {C}">'
            f'<defs>{GA.DEFS}{MDEFS}</defs>{inner}</svg>')


# ═════════════════════════════════════════════════════════════
# 한 마리씩 — ph: idle · walk1 · walk2 · attack
# ═════════════════════════════════════════════════════════════
def slime(ph):
    """슬라임 — 말랑한 푸른 젤. 안에 기포, 위에 큰 윤기. 걸으면 눌렸다 늘어난다."""
    sx, sy, lean = {'idle': (1, 1, 0), 'walk1': (1.1, .9, 0), 'walk2': (.93, 1.08, 0), 'attack': (1.02, 1.04, -1)}[ph]
    cx, base = 520, 950
    w, h = 300 * sx, 330 * sy
    top = base - h
    lx = -60 * lean
    pts = [(cx - w, base), (cx - w * .98 + lx * .3, base - h * .35), (cx - w * .72 + lx * .6, base - h * .75), (cx - w * .25 + lx, top + 6),
           (cx + w * .12 + lx, top - 4), (cx + w * .52 + lx * .6, base - h * .8), (cx + w * .88 + lx * .3, base - h * .4), (cx + w, base)]
    d = smooth_path(pts + [(cx + w * .6, base + 16), (cx - w * .6, base + 16)], k=.42)
    s = ''
    if ph == 'attack':
        for (x, y, r) in [(cx - w - 70, base - h * .6, 22), (cx - w - 130, base - h * .45, 14), (cx - w - 40, base - h * .9, 16)]:
            s += E(x, y, r, r * 1.2, MG('gel', 'mr'), LWI + 2) + f'<circle cx="{x - r * .3}" cy="{y - r * .4}" r="{r * .3}" fill="#ffffff" opacity=".85"/>'
    s += P(d, MG('gel', 'mr'))
    inner = F(smooth_path([(cx - w * .7, base - 20), (cx - w * .5, base - h * .55), (cx + w * .3, base - h * .62), (cx + w * .8, base - 30)], k=.4), MON['gelIn'][0], .45)
    for (x, y, r) in [(cx + 150, base - 90, 20), (cx + 190, base - 150, 11), (cx - 170, base - 70, 14), (cx + 90, base - 50, 9)]:
        inner += f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="#e8fbff" stroke-width="4" opacity=".7"/>'
    inner += F(smooth_path([(cx - w, base - 30), (cx + w, base - 30), (cx + w, base + 40), (cx - w, base + 40)], k=.1), MON['gel'][3], .35)
    s += clip(uid('sl'), d, inner)
    s += shade(d, 'gel', 10, 20, .45, .45)
    # 큰 윤기
    s += F(smooth_path([(cx - w * .62 + lx * .5, base - h * .55), (cx - w * .5 + lx * .7, base - h * .82), (cx - w * .22 + lx, base - h * .92),
                        (cx - w * .3 + lx * .8, base - h * .76)], k=.5), '#ffffff', .75)
    s += f'<circle cx="{cx - w * .1 + lx}" cy="{base - h * .9}" r="12" fill="#ffffff" opacity=".85"/>'
    s += L(d, OL, LWM)
    # 얼굴 — 왼쪽(주인공 쪽)으로 치우친 눈
    ey = base - h * .5
    ex = cx - 70 + lx * .6
    s += eye(ex - 58, ey, 40, iris='#1d3f7a', look=(-.3, .08))
    s += eye(ex + 58, ey, 40, iris='#1d3f7a', look=(-.3, .08))
    if ph == 'attack':
        s += P(smooth_path([(ex - 40, ey + 62), (ex + 36, ey + 58), (ex + 20, ey + 118), (ex - 26, ey + 118)], k=.5), '#5a1020', LWI + 1)
        s += F(smooth_path([(ex - 20, ey + 100), (ex + 16, ey + 98), (ex + 8, ey + 114), (ex - 14, ey + 114)], k=.5), '#ff7a8a', .9)
    else:
        s += L(f'M{ex - 30} {ey + 62} Q{ex} {ey + 88} {ex + 30} {ey + 62}', OL, LWI + 2)
    s += f'<ellipse cx="{ex - 104}" cy="{ey + 50}" rx="22" ry="13" fill="#ff7aa0" opacity=".45"/>'
    s += f'<ellipse cx="{ex + 104}" cy="{ey + 50}" rx="22" ry="13" fill="#ff7aa0" opacity=".45"/>'
    return s


def bat(ph):
    """동굴 박쥐 — 보랏빛 털뭉치, 큰 귀, 노란 눈, 송곳니. 날개 뼈 사이 막이 파여 있다."""
    up = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': .4}[ph]
    tx, ty, r = (0, 0, 0) if ph != 'attack' else (-60, 40, -14)
    cx, cy = 520, 520 - 30 * up
    s = ''

    def wing(side):
        k = side
        sh = (cx + k * 90, cy - 20)
        wr = (cx + k * 250, cy - 170 - 140 * up)
        tips = [(cx + k * 440, cy - 150 - 170 * up), (cx + k * 470, cy + 10 - 120 * up), (cx + k * 400, cy + 150 - 60 * up), (cx + k * 250, cy + 170)]
        root = (cx + k * 90, cy + 90)
        dd = f'M{sh[0]} {sh[1]} L{wr[0]} {wr[1]} L{tips[0][0]} {tips[0][1]}'
        prev = tips[0]
        for nx in tips[1:] + [root]:
            mx, my = (prev[0] + nx[0]) / 2, (prev[1] + nx[1]) / 2
            q = (mx + (wr[0] - mx) * .3, my + (wr[1] - my) * .3)
            dd += f' Q{q[0]:.1f} {q[1]:.1f} {nx[0]:.1f} {nx[1]:.1f}'
            prev = nx
        dd += ' Z'
        o = P(dd, MG('batwing', 'mv'))
        o += shade(dd, 'batwing', 8, 14, .45, .35)
        for tp in tips:
            o += L(f'M{wr[0]} {wr[1]} L{tp[0]} {tp[1]}', MON['batfur'][1], 5, .8)
        o += L(f'M{sh[0]} {sh[1]} L{wr[0]} {wr[1]}', MON['batfur'][2], 12) + L(f'M{sh[0]} {sh[1]} L{wr[0]} {wr[1]}', MON['batfur'][0], 6)
        o += P(poly_path([(wr[0], wr[1]), (wr[0] - k * 30, wr[1] - 30), (wr[0] + k * 6, wr[1] - 14)]), '#fffaf0', LWI)
        o += L(dd, OL, LWM)
        return o
    s += wing(1) + wing(-1)
    # 몸 — 털뭉치(가장자리가 삐죽)
    pts = []
    for i in range(22):
        a = 2 * math.pi * i / 22
        rr = 150 + (16 if i % 2 else 0)
        pts.append((cx + math.cos(a) * rr, cy + 20 + math.sin(a) * rr * .95))
    d = smooth_path(pts, k=.25)
    # 귀
    for k in (-1, 1):
        ear = smooth_path([(cx + k * 40, cy - 110), (cx + k * 90, cy - 290), (cx + k * 150, cy - 120)], k=.2)
        s += P(ear, MG('batfur')) + F(smooth_path([(cx + k * 64, cy - 130), (cx + k * 92, cy - 240), (cx + k * 126, cy - 130)], k=.2), '#d9a0c8', .8)
    s += body(d, 'batfur')
    s += F(smooth_path([(cx - 70, cy + 60), (cx, cy + 20), (cx + 70, cy + 60), (cx, cy + 150)], k=.5), MON['batfur'][1], .35)
    # 발
    for k in (-1, 1):
        s += L(f'M{cx + k * 40} {cy + 160} l{k * 6} 40 M{cx + k * 40} {cy + 196} l{-k * 14} 16 M{cx + k * 46} {cy + 198} l{k * 12} 14', OL, 7)
    ex, ey = cx - 30, cy - 10
    s += eye(ex - 56, ey, 36, iris='#ffd23a', look=(-.35, .1), angry=.6)
    s += eye(ex + 56, ey, 36, iris='#ffd23a', look=(-.35, .1), angry=.6)
    if ph == 'attack':
        m = smooth_path([(ex - 50, ey + 60), (ex + 40, ey + 60), (ex + 20, ey + 130), (ex - 34, ey + 130)], k=.5)
        s += P(m, '#4a0a18', LWI + 1) + fang(ex - 28, ey + 62, 18, 36) + fang(ex + 18, ey + 62, 18, 36)
    else:
        s += L(f'M{ex - 44} {ey + 66} Q{ex - 2} {ey + 84} {ex + 40} {ey + 64}', OL, LWI + 2)
        s += fang(ex - 26, ey + 70, 16, 28) + fang(ex + 18, ey + 70, 16, 28)
    return g(s, tx, ty, r, cx, cy)


def mushroom(ph):
    """성난 버섯 — 흰 점 박힌 빨간 갓, 갓 아래 주름, 성난 눈썹, 짧은 팔다리."""
    lean = {'idle': 0, 'walk1': 0, 'walk2': 0, 'attack': -16}[ph]
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    cx, base = 520, 960
    s = ''
    # 다리
    for k in (-1, 1):
        lift = 30 if step == k else 0
        leg = smooth_path([(cx + k * 60 - 26, base - 150), (cx + k * 60 + 26, base - 150), (cx + k * 64 + 28, base - 30 - lift), (cx + k * 64 - 30, base - 30 - lift)], k=.2)
        s += P(leg, MG('stem', 'mv'))
        s += E(cx + k * 64 + (-14 if k < 0 else 4), base - 22 - lift, 46, 24, MG('woodS', 'mr'))
    inner = ''
    # 몸(줄기)
    stem = smooth_path([(cx - 130, base - 130), (cx - 150, base - 330), (cx - 110, base - 470), (cx + 110, base - 470), (cx + 150, base - 330), (cx + 130, base - 130)], k=.35)
    inner += body(stem, 'stem', 'mv')
    # 팔
    for k in (-1, 1):
        raise_ = -60 if (ph == 'attack' and k < 0) else 0
        arm = smooth_path([(cx + k * 130, base - 330), (cx + k * 200, base - 280 + raise_), (cx + k * 214, base - 240 + raise_), (cx + k * 130, base - 280)], k=.3)
        inner += P(arm, MG('stem', 'mv'))
        inner += E(cx + k * 214, base - 246 + raise_, 26, 24, MG('stem', 'mr'), LWI + 2)
    # 얼굴(줄기 위)
    fx, fy = cx - 26, base - 330
    inner += eye(fx - 50, fy, 30, iris='#3a2a12', look=(-.3, .1), angry=.95)
    inner += eye(fx + 50, fy, 30, iris='#3a2a12', look=(-.3, .1), angry=.95)
    if ph == 'attack':
        inner += P(smooth_path([(fx - 40, fy + 58), (fx + 40, fy + 58), (fx + 26, fy + 108), (fx - 30, fy + 104)], k=.5), '#4a1a0a', LWI + 1)
        inner += F(poly_path([(fx - 30, fy + 60), (fx + 30, fy + 60), (fx + 26, fy + 72), (fx - 26, fy + 72)]), '#fffaf0', 1)
    else:
        inner += L(f'M{fx - 36} {fy + 78} Q{fx} {fy + 56} {fx + 36} {fy + 78}', OL, LWI + 3)
    inner += f'<ellipse cx="{fx - 96}" cy="{fy + 44}" rx="20" ry="11" fill="#ff8a70" opacity=".45"/>'
    # 갓 — 아래 주름부터
    capy = base - 470
    gills = smooth_path([(cx - 250, capy + 10), (cx - 120, capy + 60), (cx + 120, capy + 60), (cx + 250, capy + 10), (cx + 200, capy - 10), (cx - 200, capy - 10)], k=.3)
    inner += P(gills, MG('stem', 'mv'))
    for i in range(-5, 6):
        inner += L(f'M{cx + i * 20} {capy + 44} L{cx + i * 44} {capy + 4}', MON['stem'][3], 3.5, .8)
    cap = smooth_path([(cx - 290, capy + 6), (cx - 270, capy - 120), (cx - 150, capy - 250), (cx + 40, capy - 290), (cx + 210, capy - 220),
                       (cx + 290, capy - 90), (cx + 290, capy + 6), (cx, capy + 30)], k=.38)
    inner += P(cap, MG('cap', 'mr'))
    spots = ''
    for (x, y, rx, ry) in [(-150, -150, 46, 38), (20, -220, 54, 40), (170, -130, 42, 36), (-40, -90, 30, 24), (80, -60, 24, 20), (-230, -50, 22, 26), (240, -40, 20, 24)]:
        spots += f'<ellipse cx="{cx + x}" cy="{capy + y}" rx="{rx}" ry="{ry}" fill="#fff8ea" stroke="{MON["cap"][3]}" stroke-width="3"/>'
    inner += clip(uid('cp'), cap, spots)
    inner += shade(cap, 'cap', 12, 22, .45, .45)
    inner += F(smooth_path([(cx - 200, capy - 170), (cx - 120, capy - 236), (cx - 40, capy - 256), (cx - 110, capy - 200)], k=.5), '#ffffff', .5)
    inner += L(cap, OL, LWM)
    s += g(inner, 0, 0, lean, cx, base - 100)
    if ph == 'attack':
        for (x, y, r) in [(cx - 330, capy - 30, 60), (cx - 400, capy + 60, 44), (cx - 290, capy + 120, 36), (cx - 450, capy - 60, 30)]:
            s += f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#sporeG)"/>'
            s += f'<circle cx="{x - r * .2}" cy="{y - r * .2}" r="{r * .18}" fill="#fbffd8" opacity=".9"/>'
    return s


def wolf(ph):
    """잿빛 늑대 — 왼쪽을 보고 선 3/4 옆모습. 머리가 큰 3등신 짐승, 목에 털 갈기, 북슬한 꼬리."""
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    atk = ph == 'attack'
    s = ''
    base = 955
    dx, dy = (0, 50) if not atk else (-40, 30)

    def fur_blob(cx_, cy_, rx, ry, n, jag, a0=0, a1=360):
        pts = []
        for i in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * i / n)
            r = 1 + (jag if i % 2 else 0)
            pts.append((cx_ + math.cos(a) * rx * r, cy_ + math.sin(a) * ry * r))
        return pts

    # 꼬리 — 북슬북슬, 끝이 희다
    tx, ty = 760 + dx, 620 + dy
    tail = smooth_path([(tx - 40, ty + 50), (tx + 30, ty - 40), (tx + 100, ty - 170), (tx + 150, ty - 250), (tx + 150, ty - 200), (tx + 200, ty - 210),
                        (tx + 170, ty - 150), (tx + 200, ty - 110), (tx + 150, ty - 70), (tx + 120, ty + 30), (tx + 30, ty + 100)], k=.35)
    s += body(tail, 'wolf', 'mg')
    s += clip(uid('tl'), tail, F(smooth_path([(tx + 80, ty - 280), (tx + 200, ty - 260), (tx + 190, ty - 150), (tx + 100, ty - 170)], k=.4), MON['wolfL'][0], 1))
    s += L(tail, OL, LWM)

    def leg(x, top, ang, near, paw_off=0):
        mat = 'wolf' if near else 'wolfD'
        L0 = smooth_path([(x - 36, top), (x + 36, top), (x + 30, top + 90), (x + 22, base - 50), (x - 22, base - 50), (x - 32, top + 90)], k=.35)
        o = P(L0, MG(mat, 'mv'))
        o += E(x + paw_off - 8, base - 30, 42, 26, MG('wolfL' if near else 'wolfD', 'mr'), LWI + 3)
        for k in (-1, 0, 1):
            o += L(f'M{x + paw_off - 8 + k * 15} {base - 14} l-3 10', OL, 4)
        return g(o, 0, 0, ang, x, top)
    a1 = 16 * step if not atk else -26
    # 먼 쪽 다리
    s += leg(650 + dx, 700 + dy, -a1, False) + leg(430 + dx, 700 + dy, a1, False)
    # 몸통 — 둥근 통, 등을 따라 털끝
    bx, by = 580 + dx, 660 + dy
    back = fur_blob(bx, by, 210, 120, 16, .08, 190, 350)
    torso = smooth_path(back + [(bx + 200, by + 60), (bx + 120, by + 120), (bx - 60, by + 124), (bx - 200, by + 80)], k=.3)
    s += P(torso, MG('wolf', 'mg'))
    s += clip(uid('wf'), torso, f'<rect x="0" y="0" width="{C}" height="{C}" fill="url(#furW)"/>'
              + F(smooth_path([(bx - 210, by + 40), (bx + 60, by + 70), (bx + 200, by + 60), (bx + 200, by + 200), (bx - 210, by + 200)], k=.35), MON['wolfL'][0], .85))
    s += shade(torso, 'wolf', 10, 18) + L(torso, OL, LWM)
    # 가까운 다리
    s += leg(680 + dx, 720 + dy, a1, True) + leg(450 + dx, 720 + dy, -a1, True, -6)
    # 목 갈기 — 머리 둘레를 두른 밝은 털 뭉치
    hx, hy = 340 + dx, 470 + dy
    if atk:
        hx, hy = hx - 30, hy + 10
    ruff = smooth_path(fur_blob(hx + 60, hy + 70, 170, 150, 22, .16, -10, 350), k=.2)
    s += body(ruff, 'wolfL', 'mr')
    # 귀
    for ex_, mat in ((70, 'wolfD'), (-30, 'wolf')):
        ear = smooth_path([(hx + ex_ - 50, hy - 90), (hx + ex_ - 10, hy - 250), (hx + ex_ + 50, hy - 100)], k=.15)
        s += P(ear, MG(mat, 'mg')) + F(smooth_path([(hx + ex_ - 26, hy - 100), (hx + ex_ - 8, hy - 200), (hx + ex_ + 22, hy - 104)], k=.15), '#b07a86', .85)
    # 머리 — 둥근 이마, 짧은 주둥이
    head = smooth_path([(hx + 130, hy - 20), (hx + 80, hy - 120), (hx - 30, hy - 140), (hx - 120, hy - 90), (hx - 150, hy - 20),
                        (hx - 250, hy + 20), (hx - 262, hy + 70), (hx - 210, hy + 100), (hx - 100, hy + 110), (hx + 40, hy + 120), (hx + 130, hy + 60)], k=.35)
    s += body(head, 'wolf', 'mg')
    # 볼 · 주둥이 밝은 털
    s += F(smooth_path([(hx - 256, hy + 64), (hx - 150, hy + 36), (hx - 40, hy + 70), (hx + 40, hy + 112), (hx - 100, hy + 112), (hx - 210, hy + 100)], k=.4), MON['wolfL'][0], .95)
    s += F(smooth_path([(hx + 60, hy + 40), (hx + 130, hy + 20), (hx + 120, hy + 100), (hx + 40, hy + 118)], k=.3), MON['wolfL'][0], .8)
    # 이마 무늬
    s += F(smooth_path([(hx - 80, hy - 110), (hx - 20, hy - 130), (hx + 10, hy - 60), (hx - 60, hy - 40)], k=.4), MON['wolfD'][0], .5)
    # 코 · 입
    s += E(hx - 256, hy + 36, 24, 18, '#1e1a1c', LWI)
    s += f'<circle cx="{hx - 262}" cy="{hy + 30}" r="6" fill="#8a8a96"/>'
    if atk:
        jaw = smooth_path([(hx - 236, hy + 90), (hx - 120, hy + 84), (hx - 60, hy + 120), (hx - 150, hy + 180), (hx - 240, hy + 150)], k=.35)
        s += P(jaw, MG('wolfL', 'mg'))
        mouth = smooth_path([(hx - 232, hy + 76), (hx - 90, hy + 70), (hx - 80, hy + 110), (hx - 224, hy + 138)], k=.4)
        s += P(mouth, '#5a0e14', LWI + 1)
        for x in (-212, -180, -148, -116):
            s += fang(hx + x, hy + 76, 14, 26) + fang(hx + x + 8, hy + 134, 14, 20, flip=True)
        for k in range(3):
            s += L(f'M{hx - 330 - k * 10} {hy + 40 + k * 44} q-40 -20 -80 -10', '#ffffff', 6, .55)
    else:
        s += L(f'M{hx - 240} {hy + 80} Q{hx - 180} {hy + 98} {hx - 110} {hy + 84}', OL, LWI + 2)
        s += fang(hx - 200, hy + 86, 14, 24) + fang(hx - 140, hy + 90, 14, 22)
    s += eye(hx - 130, hy - 24, 34, iris='#ffcf3a', look=(-.4, .05), angry=.75, slit=True)
    s += eye(hx - 20, hy - 30, 30, iris='#ffcf3a', look=(-.4, .05), angry=.75, slit=True)
    return s


def trident(x0, y0, x1, y1, mat='iron', w=16):
    """삼지창 — (x0,y0) 자루 끝 → (x1,y1) 창끝."""
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))
    ln = math.hypot(x1 - x0, y1 - y0)
    o = P(poly_path([(0, -w / 2), (ln - 70, -w / 2), (ln - 70, w / 2), (0, w / 2)]), MG('woodS', 'mv'), LWI + 2)
    head = smooth_path([(ln - 80, -44), (ln - 60, -44), (ln - 40, -30), (ln + 10, -34), (ln - 30, -18), (ln + 40, 0), (ln - 30, 18), (ln + 10, 34),
                        (ln - 40, 30), (ln - 60, 44), (ln - 80, 44), (ln - 70, 0)], k=.15)
    o += P(head, MG(mat, 'mv'), LWI + 2) + L(f'M{ln - 60} 0 L{ln + 26} 0', MON[mat][1], 4, .9)
    return f'<g transform="translate({x0} {y0}) rotate({ang:.1f})">{o}</g>'


def imp_like(ph, captain=False):
    """꼬마 악마 · 정찰대장 — 큰 머리에 뿔, 뾰족 귀, 작은 박쥐 날개, 끝이 창 모양인 꼬리."""
    atk = ph == 'attack'
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    flap = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': .6}[ph]
    S = 1.12 if captain else 1.0
    cx, base = 520, 960
    s = ''
    hx, hy = cx - 10, 420
    if atk:
        hx -= 30
    wingm = 'impW'
    # 날개
    for k in (1, -1):
        wx, wy = cx + k * 70, 600
        tip_up = 120 * flap
        dd = smooth_path([(wx, wy), (wx + k * 150, wy - 170 - tip_up), (wx + k * 250, wy - 230 - tip_up), (wx + k * 230, wy - 120 - tip_up * .5),
                          (wx + k * 270, wy - 70 - tip_up * .3), (wx + k * 190, wy - 40), (wx + k * 210, wy + 20), (wx + k * 110, wy + 10)], k=.25)
        s += P(dd, MG(wingm, 'mv')) + shade(dd, wingm, 8, 12, .4, .3)
        s += L(f'M{wx} {wy} L{wx + k * 250} {wy - 230 - tip_up} M{wx + k * 120} {wy - 110 - tip_up * .6} L{wx + k * 270} {wy - 70 - tip_up * .3} M{wx + k * 110} {wy - 60} L{wx + k * 210} {wy + 20}', MON[wingm][1], 5, .7)
        s += L(dd, OL, LWM)
    # 꼬리
    tail = f'M{cx + 60} 820 Q{cx + 260} 860 {cx + 250} 720 Q{cx + 240} 620 {cx + 330} 600'
    s += L(tail, OL, 26) + L(tail, MON['imp'][0], 14)
    s += P(poly_path([(cx + 320, 560), (cx + 380, 600), (cx + 330, 640), (cx + 300, 600)]), MG('imp'), LWI + 2)
    # 망토(대장)
    if captain:
        cape = smooth_path([(cx - 110, 610), (cx + 110, 610), (cx + 190, 900), (cx + 120, 880), (cx + 60, 930), (cx - 20, 890), (cx - 110, 930), (cx - 170, 880)], k=.3)
        s += P(cape, MG('crimson', 'mv')) + shade(cape, 'crimson', 8, 14, .35, .35) + L(cape, OL, LWM)
    # 다리
    for k in (-1, 1):
        lift = 26 if step == k else 0
        leg = smooth_path([(cx + k * 44 - 30, 760), (cx + k * 44 + 30, 760), (cx + k * 52 + 26, base - 40 - lift), (cx + k * 52 - 26, base - 40 - lift)], k=.25)
        s += P(leg, MG('imp', 'mv'))
        hoof = smooth_path([(cx + k * 52 - 40, base - 44 - lift), (cx + k * 52 + 30, base - 44 - lift), (cx + k * 52 + 34, base - 8 - lift), (cx + k * 52 - 46, base - 8 - lift)], k=.2)
        s += P(hoof, MG('dArmor', 'mv'), LWI + 3)
    # 몸통
    torso = smooth_path([(cx - 100 * S, 600), (cx + 100 * S, 600), (cx + 120 * S, 700), (cx + 90, 800), (cx - 90, 800), (cx - 120 * S, 700)], k=.35)
    s += body(torso, 'imp', 'mr')
    s += F(smooth_path([(cx - 60, 660), (cx + 30, 650), (cx + 50, 760), (cx - 50, 770)], k=.4), MON['imp'][1], .35)
    if captain:
        # 금 테 두른 가죽 띠 + 해골 버클
        belt_ = poly_path([(cx - 110, 740), (cx + 110, 740), (cx + 104, 776), (cx - 104, 776)])
        s += P(belt_, MG('dArmor', 'mv'), LWI + 3) + L(f'M{cx - 106} 746 L{cx + 106} 746', MON['gold'][0], 4)
        s += E(cx, 758, 26, 24, MG('bone', 'mr'), LWI + 2) + f'<circle cx="{cx - 8}" cy="756" r="5" fill="{OL}"/><circle cx="{cx + 8}" cy="756" r="5" fill="{OL}"/>'
    # 팔 + 무기
    if captain:
        # 오른손(화면 오른쪽)은 허리에, 왼손(주인공 쪽)은 불덩이를 든다
        ax, ay = (cx - 190, 620) if not atk else (cx - 250, 560)
        s += L(f'M{cx - 90} 640 Q{cx - 150} 660 {ax} {ay}', OL, 44) + L(f'M{cx - 90} 640 Q{cx - 150} 660 {ax} {ay}', MON['imp'][0], 30)
        r_ = 60 if not atk else 110
        fxx, fyy = ax - (10 if not atk else 90), ay - 40
        s += f'<circle cx="{fxx}" cy="{fyy}" r="{r_ * 1.8}" fill="url(#fireG)" opacity=".8" filter="url(#mblur10)"/>'
        s += f'<circle cx="{fxx}" cy="{fyy}" r="{r_}" fill="url(#fireG)"/>'
        for i in range(6):
            a = math.radians(-90 + (i - 2.5) * 22)
            s += F(smooth_path([(fxx + math.cos(a) * r_ * .5, fyy + math.sin(a) * r_ * .5), (fxx + math.cos(a) * r_ * 1.25, fyy + math.sin(a) * r_ * 1.3 - 20),
                                (fxx + math.cos(a + .2) * r_ * .6, fyy + math.sin(a + .2) * r_ * .6)], k=.4), '#ffb030', .8)
        s += E(ax, ay, 26, 24, MG('imp', 'mr'), LWI + 2)
        s += L(f'M{cx + 90} 640 Q{cx + 160} 700 {cx + 120} 760', OL, 44) + L(f'M{cx + 90} 640 Q{cx + 160} 700 {cx + 120} 760', MON['imp'][0], 30)
    else:
        if atk:
            s += trident(cx + 60, 700, cx - 440, 560)
            hand = (cx - 90, 660)
        else:
            s += trident(cx - 150, 860, cx - 200, 330)
            hand = (cx - 170, 650)
        s += L(f'M{cx - 90} 640 Q{cx - 130} 660 {hand[0]} {hand[1]}', OL, 44) + L(f'M{cx - 90} 640 Q{cx - 130} 660 {hand[0]} {hand[1]}', MON['imp'][0], 30)
        s += E(hand[0], hand[1], 26, 24, MG('imp', 'mr'), LWI + 2)
        s += L(f'M{cx + 90} 640 Q{cx + 150} 700 {cx + 120} 760', OL, 44) + L(f'M{cx + 90} 640 Q{cx + 150} 700 {cx + 120} 760', MON['imp'][0], 30)
    # 머리
    R = 175 * S
    # 뿔
    for k in (-1, 1):
        horn = smooth_path([(hx + k * 70, hy - R * .72), (hx + k * 140, hy - R * 1.2), (hx + k * 150, hy - R * 1.55), (hx + k * 118, hy - R * 1.2), (hx + k * 30, hy - R * .82)], k=.3)
        s += P(horn, MG('bone' if not captain else 'dArmor', 'mv'), LWI + 3)
    # 귀
    for k in (-1, 1):
        ear = smooth_path([(hx + k * R * .8, hy - 30), (hx + k * R * 1.45, hy - 110), (hx + k * R * .9, hy + 30)], k=.2)
        s += P(ear, MG('imp', 'mg'))
    head = smooth_path([(hx - R, hy), (hx - R * .8, hy - R * .72), (hx, hy - R), (hx + R * .8, hy - R * .72), (hx + R, hy), (hx + R * .72, hy + R * .78),
                        (hx, hy + R * .98), (hx - R * .72, hy + R * .78)], k=.4)
    s += body(head, 'imp', 'mr')
    if captain:
        band = f'M{hx - R * .96} {hy - R * .28} Q{hx} {hy - R * .6} {hx + R * .96} {hy - R * .28}'
        s += L(band, OL, 40) + L(band, MON['gold'][0], 26) + L(band, MON['gold'][1], 6, .8)
        s += GA.gem(hx - 10, hy - R * .48, 20, 'red', glow=True, shape='diamond')
    ex, ey = hx - 40, hy + 10
    s += eye(ex - 60, ey, 44, iris='#ffd23a', look=(-.35, .08), angry=.7)
    s += eye(ex + 64, ey, 40, iris='#ffd23a', look=(-.35, .08), angry=.7)
    if atk:
        m = smooth_path([(ex - 70, ey + 70), (ex + 70, ey + 66), (ex + 40, ey + 130), (ex - 50, ey + 132)], k=.5)
        s += P(m, '#4a0a12', LWI + 1) + fang(ex - 44, ey + 70, 20, 30) + fang(ex + 40, ey + 68, 20, 30)
    else:
        s += L(f'M{ex - 76} {ey + 70} Q{ex} {ey + 116} {ex + 70} {ey + 64}', OL, LWI + 3)
        s += fang(ex - 40, ey + 84, 18, 28) + fang(ex + 36, ey + 82, 18, 28)
    return s


def imp(ph):
    return imp_like(ph, captain=False)


def imp_captain(ph):
    return imp_like(ph, captain=True)


def rusty_sword(x, y, ang, ln=380):
    o = P(poly_path([(0, -22), (ln - 50, -24), (ln, 0), (ln - 50, 24), (0, 22)]), MG('rustI', 'mv'), LWI + 2)
    o += L(f'M10 0 L{ln - 60} 0', MON['rustI'][1], 5, .8)
    for (px, py) in [(ln * .3, -22), (ln * .55, 20), (ln * .72, -18)]:
        o += F(poly_path([(px - 10, py), (px, py + (10 if py < 0 else -10)), (px + 10, py)]), OL, 1)
    o += P(poly_path([(-10, -60), (10, -60), (10, 60), (-10, 60)]), MG('rustI', 'mv'), LWI + 2)
    o += P(poly_path([(-80, -14), (-8, -14), (-8, 14), (-80, 14)]), MG('leather', 'mv'), LWI + 2)
    o += E(-92, 0, 18, 18, MG('rustI', 'mr'), LWI + 2)
    return f'<g transform="translate({x} {y}) rotate({ang})">{o}</g>'


def skeleton(ph):
    """해골 병사 — 큰 해골(금 간 이마, 푸르게 빛나는 눈), 찌그러진 쇠 투구, 녹슨 칼과 나무 방패."""
    atk = ph == 'attack'
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    cx, base = 520, 960
    s = ''
    bone = MG('bone', 'mv')
    # 방패(뒤, 화면 오른쪽 팔)
    shx, shy = cx + 170, 700
    s += E(shx, shy, 118, 126, MG('woodS', 'mr'))
    for k in (-1, 1):
        s += L(f'M{shx + k * 40} {shy - 118} L{shx + k * 40} {shy + 120}', MON['woodS'][3], 5, .8)
    s += E(shx, shy, 118, 126, 'none', 14, f'stroke="{MON["iron"][2]}"') + E(shx, shy, 118, 126, 'none', LWI)
    s += E(shx, shy, 34, 34, MG('iron', 'mr'), LWI + 2)
    for a in range(0, 360, 60):
        s += GA.rivet(shx + math.cos(math.radians(a)) * 100, shy + math.sin(math.radians(a)) * 106, 7, 'iron')
    # 다리 뼈
    for k in (-1, 1):
        lift = 26 if step == k else 0
        x0, x1 = cx + k * 50, cx + k * 60
        s += L(f'M{x0} 790 L{x1} {base - 40 - lift}', OL, 34) + L(f'M{x0} 790 L{x1} {base - 40 - lift}', MON['bone'][0], 20)
        s += E(x1 + (-18 if k < 0 else 8), base - 30 - lift, 46, 20, bone, LWI + 2)
        s += E(x0 + (x1 - x0) * .5, 880 - lift / 2, 18, 16, bone, LWI)
    # 골반
    s += P(smooth_path([(cx - 90, 760), (cx + 90, 760), (cx + 70, 820), (cx, 836), (cx - 70, 820)], k=.3), bone)
    # 척추 · 갈비뼈
    s += L(f'M{cx} 600 L{cx} 770', OL, 30) + L(f'M{cx} 600 L{cx} 770', MON['bone'][0], 16)
    for i in range(4):
        y = 620 + i * 34
        wv = 104 - i * 12
        rib = f'M{cx} {y} Q{cx - wv} {y - 6} {cx - wv + 10} {y + 26} M{cx} {y} Q{cx + wv} {y - 6} {cx + wv - 10} {y + 26}'
        s += L(rib, OL, 22) + L(rib, MON['bone'][0], 10)
    # 칼 든 팔(주인공 쪽)
    if atk:
        s += L(f'M{cx - 80} 610 L{cx - 170} 470', OL, 30) + L(f'M{cx - 80} 610 L{cx - 170} 470', MON['bone'][0], 16)
        s += rusty_sword(cx - 180, 460, -150, 400)
        s += L(f'M{cx - 520} 300 Q{cx - 600} 520 {cx - 460} 700', '#ffffff', 8, .5) + L(f'M{cx - 500} 330 Q{cx - 560} 520 {cx - 440} 660', '#cfe9ff', 5, .4)
        s += E(cx - 172, 468, 24, 22, bone, LWI + 2)
    else:
        s += L(f'M{cx - 80} 610 L{cx - 150} 720', OL, 30) + L(f'M{cx - 80} 610 L{cx - 150} 720', MON['bone'][0], 16)
        s += rusty_sword(cx - 160, 720, -70, 400)
        s += E(cx - 156, 726, 24, 22, bone, LWI + 2)
    s += L(f'M{cx + 80} 610 L{cx + 150} 690', OL, 30) + L(f'M{cx + 80} 610 L{cx + 150} 690', MON['bone'][0], 16)
    # 어깨 뼈
    for k in (-1, 1):
        s += E(cx + k * 84, 610, 30, 26, bone, LWI + 2)
    # 해골
    hx, hy, R = cx - 20, 400, 185
    if atk:
        hx -= 20
    skull = smooth_path([(hx - R, hy), (hx - R * .85, hy - R * .7), (hx, hy - R), (hx + R * .85, hy - R * .7), (hx + R, hy), (hx + R * .8, hy + R * .55),
                         (hx + R * .5, hy + R * .72), (hx + R * .45, hy + R), (hx - R * .45, hy + R), (hx - R * .5, hy + R * .72), (hx - R * .8, hy + R * .55)], k=.35)
    s += body(skull, 'bone', 'mr')
    s += L(f'M{hx + 40} {hy - R * .95} l-20 50 l24 26 l-14 40', OL, 5)
    for k, rr in ((-1, 50), (1, 44)):
        ex = hx - 50 + k * 72
        s += E(ex, hy + 20, rr, rr * 1.05, '#20161a', LWI + 2)
        s += glowing_eye(ex - 8, hy + 22, 18, '#5ff0ff')
    s += P(poly_path([(hx - 60, hy + 92), (hx - 40, hy + 60), (hx - 20, hy + 92)]), '#20161a', LWI)
    for i in range(6):
        x = hx - 120 + i * 40
        s += P(poly_path([(x, hy + R * .72), (x + 34, hy + R * .72), (x + 30, hy + R * .96), (x + 4, hy + R * .96)]), MG('bone', 'mv'), LWI)
    # 찌그러진 투구
    helm = smooth_path([(hx - R * 1.04, hy - R * .18), (hx - R * .9, hy - R * .82), (hx - R * .1, hy - R * 1.12), (hx + R * .8, hy - R * .9),
                        (hx + R * 1.06, hy - R * .22), (hx + R * .6, hy - R * .3), (hx, hy - R * .38), (hx - R * .6, hy - R * .28)], k=.35)
    s += P(helm, MG('rustI', 'mr')) + shade(helm, 'rustI', 8, 14) + L(helm, OL, LWM)
    s += L(f'M{hx - R * .9} {hy - R * .34} Q{hx} {hy - R * .5} {hx + R * .96} {hy - R * .36}', MON['rustI'][3], 8, .8)
    for i in range(5):
        s += GA.rivet(hx - R * .7 + i * R * .35, hy - R * .4 + abs(i - 2) * -4, 7, 'iron')
    s += L(f'M{hx + 20} {hy - R * 1.0} l30 30 l-14 20', OL, 5)
    return s




def axe(x, y, ang, ln=420, mat='iron'):
    """도끼창(할버드) — 자루 끝 (x,y)."""
    o = P(poly_path([(0, -12), (ln, -12), (ln, 12), (0, 12)]), MG('woodS', 'mv'), LWI + 2)
    for i in range(3):
        o += L(f'M{40 + i * 22} -12 l14 24', MON['leather'][3], 5)
    blade = smooth_path([(ln - 120, -12), (ln - 150, -110), (ln - 60, -140), (ln - 10, -60), (ln - 20, -12)], k=.3)
    o += P(blade, MG(mat, 'mg'), LWI + 2) + L(f'M{ln - 140} -104 Q{ln - 70} -130 {ln - 16} -58', MON[mat][1], 5, .9)
    o += P(poly_path([(ln - 10, -14), (ln + 70, 0), (ln - 10, 14)]), MG(mat, 'mv'), LWI + 2)
    o += P(poly_path([(ln - 100, 12), (ln - 90, 70), (ln - 70, 12)]), MG(mat, 'mv'), LWI + 2)
    return f'<g transform="translate({x} {y}) rotate({ang})">{o}</g>'


def dark_blade(x, y, ang, ln=480, w=64):
    """발가르의 검 — 톱니 날의 검보라 대검, 가운데 보랏빛 룬."""
    pts_t, pts_b = [], []
    n = 8
    for i in range(n + 1):
        t = i / n
        xx = 60 + (ln - 60 - w) * t
        tooth = 10 if i % 2 else 0
        pts_t.append((xx, -w / 2 - tooth))
        pts_b.append((xx, w / 2 + tooth))
    blade = poly_path(pts_t + [(ln, 0)] + pts_b[::-1])
    o = L(blade, GEM['violet'][2], 26, .45, 'filter="url(#mblur10)"')
    o += P(blade, 'url(#demonG)', LWI + 2)
    o += L(f'M70 0 L{ln - 50} 0', '#0e0716', 12)
    o += glow_line(f'M74 0 L{ln - 56} 0', GEM['violet'][2], 4, '#f6dcff')
    for k in range(5):
        xx = 110 + k * (ln - 180) / 5
        o += glow_line(f'M{xx} -12 L{xx + 16} 0 L{xx} 12', GEM['violet'][2], 2.5, '#f6dcff')
    guard = smooth_path([(60, 0), (50, -60), (30, -100), (70, -60), (74, 0), (70, 60), (30, 100), (50, 60)], k=.3)
    o += P(guard, MG('dArmor', 'mv'), LWI + 2)
    o += E(58, 0, 18, 18, '#6a2bd0', LWI) + f'<circle cx="54" cy="-4" r="6" fill="#f6dcff"/>'
    o += P(poly_path([(-90, -14), (50, -14), (50, 14), (-90, 14)]), MG('dArmor', 'mv'), LWI + 2)
    o += P(poly_path([(-90, -20), (-130, 0), (-90, 20)]), MG('dArmor', 'mv'), LWI + 2)
    return f'<g transform="translate({x} {y}) rotate({ang})">{o}</g>'


def demon_knight(ph, general=False):
    """악마 병사 · 장군 발가르 — 검보라 갑옷, 붉은 얼굴에 빛나는 눈, 뿔 투구. 장군은 망토 · 가시 어깨 · 마검 · 보랏빛 기운."""
    atk = ph == 'attack'
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    cx, base = 520, 960
    S = 1.1 if general else 1.0
    s = ''
    if general:
        s += f'<ellipse cx="{cx}" cy="600" rx="380" ry="420" fill="url(#auraP)"/>'
        # 망토
        cape = smooth_path([(cx - 150, 520), (cx + 150, 520), (cx + 280, 940), (cx + 190, 900), (cx + 120, 960), (cx + 30, 910), (cx - 60, 960),
                            (cx - 150, 900), (cx - 250, 940)], k=.3)
        s += P(cape, MG('crimson', 'mv')) + shade(cape, 'crimson', 8, 16, .35, .4)
        s += clip(uid('cp'), cape, L(f'M{cx - 250} 930 L{cx + 280} 930', MON['gold'][0], 14))
        s += L(cape, OL, LWM)
    # 다리
    for k in (-1, 1):
        lift = 26 if step == k else 0
        leg = smooth_path([(cx + k * 60 - 44, 760), (cx + k * 60 + 44, 760), (cx + k * 66 + 40, base - 60 - lift), (cx + k * 66 - 40, base - 60 - lift)], k=.2)
        s += P(leg, MG('dArmor', 'mv')) + shade(leg, 'dArmor', 6, 10)
        boot = smooth_path([(cx + k * 66 - 62, base - 70 - lift), (cx + k * 66 + 46, base - 70 - lift), (cx + k * 66 + 50, base - 10 - lift), (cx + k * 66 - 72, base - 10 - lift)], k=.2)
        s += P(boot, MG('dArmor', 'mv'), LWI + 3) + L(f'M{cx + k * 66 - 64} {base - 60 - lift} L{cx + k * 66 + 46} {base - 60 - lift}', MON['gold' if general else 'iron'][0], 5)
        kn = smooth_path([(cx + k * 64 - 34, 830 - lift / 2), (cx + k * 64 + 34, 830 - lift / 2), (cx + k * 64 + 26, 880 - lift / 2), (cx + k * 64, 896 - lift / 2), (cx + k * 64 - 26, 880 - lift / 2)], k=.3)
        s += P(kn, MG('iron' if not general else 'dArmor', 'mr'), LWI + 2)
    # 몸통 갑옷
    torso = smooth_path([(cx - 150 * S, 560), (cx + 150 * S, 560), (cx + 140 * S, 700), (cx + 110, 790), (cx - 110, 790), (cx - 140 * S, 700)], k=.3)
    s += body(torso, 'dArmor', 'mg')
    s += L(f'M{cx} 580 L{cx} 780', MON['dArmor'][1], 6, .6)
    s += L(f'M{cx - 120} 700 Q{cx} 730 {cx + 120} 700', MON['gold' if general else 'iron'][0], 8)
    s += GA.gem(cx, 640, 26, 'red' if not general else 'violet', glow=True)
    # 치마 판
    for i in range(-2, 3):
        pl = poly_path([(cx + i * 50 - 26, 780), (cx + i * 50 + 26, 780), (cx + i * 54 + 22, 850), (cx + i * 54 - 22, 850)])
        s += P(pl, MG('dArmor', 'mv'), LWI + 2)
    # 뒤 팔(화면 오른쪽)
    s += L(f'M{cx + 130} 600 Q{cx + 200} 680 {cx + 170} 760', OL, 64) + L(f'M{cx + 130} 600 Q{cx + 200} 680 {cx + 170} 760', MON['dArmor'][0], 46)
    s += E(cx + 170, 770, 34, 32, MG('dSkin', 'mr'), LWI + 2)
    # 무기 + 앞 팔
    if general:
        if atk:
            s += dark_blade(cx - 120, 560, -160, 520)
            s += L(f'M{cx - 40} 360 Q{cx - 520} 360 {cx - 520} 760', '#d09bff', 16, .45, 'filter="url(#mblur4)"')
            s += L(f'M{cx - 60} 400 Q{cx - 470} 400 {cx - 480} 740', '#f6dcff', 6, .8)
            hand = (cx - 120, 560)
        else:
            s += dark_blade(cx - 170, 760, -64, 520)
            hand = (cx - 170, 760)
    else:
        if atk:
            s += axe(cx - 60, 700, -150, 460)
            s += L(f'M{cx - 520} 250 Q{cx - 600} 560 {cx - 420} 800', '#ffffff', 8, .5)
            hand = (cx - 130, 620)
        else:
            s += axe(cx - 170, 940, -84, 520)
            hand = (cx - 180, 720)
    s += L(f'M{cx - 130} 600 Q{cx - 180} 640 {hand[0]} {hand[1]}', OL, 64) + L(f'M{cx - 130} 600 Q{cx - 180} 640 {hand[0]} {hand[1]}', MON['dArmor'][0], 46)
    s += E(hand[0], hand[1], 36, 34, MG('dSkin', 'mr'), LWI + 2)
    # 어깨받이
    for k in (1, -1):
        pad = smooth_path([(cx + k * 70, 540), (cx + k * 200 * S, 520), (cx + k * 230 * S, 600), (cx + k * 160, 650), (cx + k * 90, 620)], k=.35)
        s += P(pad, MG('dArmor', 'mr')) + shade(pad, 'dArmor', 6, 10) + L(pad, OL, LWM)
        s += L(f'M{cx + k * 90} 560 Q{cx + k * 170} 546 {cx + k * 214 * S} 596', MON['gold' if general else 'iron'][0], 6)
        if general:
            for j in range(3):
                bx_ = cx + k * (120 + j * 40)
                s += P(poly_path([(bx_ - 16, 546 - j * 4), (bx_ + k * 12, 470 - j * 14), (bx_ + 16, 540 - j * 4)]), MG('bone', 'mv'), LWI + 1)
    # 머리 — 투구 속 붉은 얼굴
    hx, hy, R = cx - 20, 400, 170 * S
    if atk:
        hx -= 20
    face = smooth_path([(hx - R * .8, hy - 10), (hx - R * .7, hy - R * .6), (hx, hy - R * .8), (hx + R * .7, hy - R * .6), (hx + R * .8, hy),
                        (hx + R * .6, hy + R * .72), (hx, hy + R * .92), (hx - R * .6, hy + R * .72)], k=.4)
    s += body(face, 'dSkin' if not general else 'dArmor', 'mr')
    if general:
        s += glowing_eye(hx - 80, hy + 20, 26, '#ff3b3b', '#ffe0c0') + glowing_eye(hx + 40, hy + 18, 24, '#ff3b3b', '#ffe0c0')
    else:
        s += eye(hx - 78, hy + 26, 38, iris='#ffd23a', look=(-.35, .08), angry=.9)
        s += eye(hx + 40, hy + 24, 34, iris='#ffd23a', look=(-.35, .08), angry=.9)
    if atk:
        s += P(smooth_path([(hx - 90, hy + 92), (hx + 40, hy + 88), (hx + 20, hy + 140), (hx - 70, hy + 140)], k=.5), '#3a0808', LWI + 1)
        s += fang(hx - 70, hy + 92, 18, 26) + fang(hx + 16, hy + 90, 18, 26)
    else:
        s += L(f'M{hx - 90} {hy + 104} L{hx + 40} {hy + 96}', OL, LWI + 3) + fang(hx - 60, hy + 102, 16, 22) + fang(hx + 14, hy + 98, 16, 22)
    # 투구: 이마 위를 덮고 볼을 감싼다, 양옆에 뿔
    for k in (-1, 1):
        horn = smooth_path([(hx + k * R * .55, hy - R * .7), (hx + k * R * 1.2, hy - R * 1.0), (hx + k * R * 1.5, hy - R * 1.6), (hx + k * R * 1.12, hy - R * 1.22),
                            (hx + k * R * .45, hy - R * .98)], k=.3)
        s += P(horn, MG('bone' if not general else 'dArmor', 'mv'), LWI + 3)
        if general:
            s += L(f'M{hx + k * R * .8} {hy - R * .9} Q{hx + k * R * 1.2} {hy - R * 1.1} {hx + k * R * 1.46} {hy - R * 1.55}', MON['gold'][0], 5)
    helm = smooth_path([(hx - R * 1.02, hy + R * .5), (hx - R * 1.04, hy - R * .5), (hx - R * .6, hy - R * 1.02), (hx + R * .6, hy - R * 1.02),
                        (hx + R * 1.04, hy - R * .5), (hx + R * 1.02, hy + R * .5), (hx + R * .74, hy + R * .52), (hx + R * .74, hy - R * .08),
                        (hx, hy - R * .3), (hx - R * .74, hy - R * .08), (hx - R * .74, hy + R * .52)], k=.25)
    s += P(helm, MG('dArmor', 'mr')) + shade(helm, 'dArmor', 8, 14) + L(helm, OL, LWM)
    trim = MON['gold' if general else 'iron'][0]
    s += L(f'M{hx - R * .74} {hy - R * .08} L{hx} {hy - R * .3} L{hx + R * .74} {hy - R * .08}', trim, 8)
    s += L(f'M{hx} {hy - R * 1.0} L{hx} {hy - R * .34}', trim, 10) + L(f'M{hx - 2} {hy - R * .98} L{hx - 2} {hy - R * .36}', '#ffffff', 2.5, .5)
    if general:
        s += GA.gem(hx, hy - R * .6, 18, 'violet', glow=True, shape='diamond')
    return s


def demon_soldier(ph):
    return demon_knight(ph, general=False)


def demon_general(ph):
    return demon_knight(ph, general=True)


def dragon(ph, elder=False):
    """고룡 — 왼쪽을 보고 앉아 날개를 편 용. 아그라모스(잠겨 있던 용)는 쪽빛 비늘 · 푸른 수정 뿔 · 끊어진 사슬 · 룬."""
    atk = ph == 'attack'
    flap = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': -.4}[ph]
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    main, belly, wingm = ('elder', 'elderB', 'elderW') if elder else ('dragonR', 'dragonB', 'dragonW')
    pat = 'url(#scalesE)' if elder else 'url(#scalesM)'
    hornm = 'elderB' if elder else 'bone'
    s = ''
    cx, base = 560, 960
    # 날개 — 뒤(먼 쪽)부터

    def wing(k, far):
        sh = (cx + (80 if k > 0 else 10), 520)
        up = 150 * flap
        ex = 1.0 if k > 0 else .5          # 가까운 날개는 머리 뒤로 솟는다(옆으로 뻗으면 머리를 가린다)
        wr = (sh[0] + k * 150 * ex, 170 - up)
        tips = [(sh[0] + k * 420 * ex, 40 - up * 1.2), (sh[0] + k * 460 * ex, 260 - up * .6), (sh[0] + k * 400 * ex, 450 - up * .2), (sh[0] + k * 260 * ex, 560)]
        root = (sh[0] + k * 40 * ex, 640)
        dd = f'M{sh[0]} {sh[1]} Q{sh[0] + k * 40} {(sh[1] + wr[1]) / 2 - 20} {wr[0]} {wr[1]} L{tips[0][0]} {tips[0][1]}'
        prev = tips[0]
        for nx in tips[1:] + [root]:
            mx, my = (prev[0] + nx[0]) / 2, (prev[1] + nx[1]) / 2
            q = (mx + (wr[0] - mx) * .3, my + (wr[1] - my) * .3)
            dd += f' Q{q[0]:.1f} {q[1]:.1f} {nx[0]:.1f} {nx[1]:.1f}'
            prev = nx
        dd += ' Z'
        o = P(dd, MG(wingm, 'mv'))
        o += shade(dd, wingm, 10, 16, .4, .35)
        for tp in tips:
            o += L(f'M{wr[0]} {wr[1]} L{tp[0]} {tp[1]}', MON[main][2], 12) + L(f'M{wr[0]} {wr[1]} L{tp[0]} {tp[1]}', MON[main][0], 6)
        o += L(f'M{sh[0]} {sh[1]} Q{sh[0] + k * 40} {(sh[1] + wr[1]) / 2 - 20} {wr[0]} {wr[1]}', OL, 30) + L(f'M{sh[0]} {sh[1]} Q{sh[0] + k * 40} {(sh[1] + wr[1]) / 2 - 20} {wr[0]} {wr[1]}', MON[main][0], 18)
        o += P(poly_path([(wr[0], wr[1]), (wr[0] - k * 10, wr[1] - 50), (wr[0] + k * 20, wr[1] - 10)]), MG(hornm, 'mv'), LWI + 1)
        o += L(dd, OL, LWM)
        if far:
            o = f'<g opacity=".92">{o}</g>'
        return o
    s += wing(1, True)
    # 꼬리
    tail = smooth_path([(cx + 150, 820), (cx + 300, 880), (cx + 420, 860), (cx + 470, 760), (cx + 450, 700), (cx + 430, 760), (cx + 390, 820),
                        (cx + 300, 830), (cx + 180, 760)], k=.35)
    s += P(tail, pat) + shade(tail, main, 8, 14) + L(tail, OL, LWM)
    s += P(poly_path([(cx + 440, 720), (cx + 470, 620), (cx + 500, 720), (cx + 470, 700)]), MG(hornm, 'mv'), LWI + 2)
    # 뒷다리
    for k, (lx, dy) in enumerate([(cx + 150, 0), (cx - 40, 0)]):
        lift = 24 if (step == (1 if k == 0 else -1)) else 0
        thigh = smooth_path([(lx - 90, 700), (lx + 80, 690), (lx + 90, 820), (lx + 40, base - 60 - lift), (lx - 60, base - 60 - lift), (lx - 100, 820)], k=.35)
        s += P(thigh, MG(main, 'mr')) + shade(thigh, main, 8, 14) + L(thigh, OL, LWM)
        for j in range(3):
            fx_ = lx - 80 + j * 40
            s += P(smooth_path([(fx_, base - 70 - lift), (fx_ + 36, base - 70 - lift), (fx_ + 34, base - 20 - lift), (fx_ - 6, base - 20 - lift)], k=.3), MG(main, 'mv'), LWI + 2)
            s += P(poly_path([(fx_ - 6, base - 30 - lift), (fx_ - 26, base - 10 - lift), (fx_ + 4, base - 16 - lift)]), MG(hornm, 'mv'), LWI)
    # 몸통 — 배는 밝은 띠 비늘
    torso = smooth_path([(cx - 200, 560), (cx - 60, 470), (cx + 140, 500), (cx + 220, 640), (cx + 180, 800), (cx, 860), (cx - 170, 820), (cx - 230, 690)], k=.35)
    s += P(torso, pat)
    s += clip(uid('dt'), torso, F(smooth_path([(cx + 60, 460), (cx + 260, 560), (cx + 240, 880), (cx + 60, 880)], k=.3), '#000000', .22))
    bel = smooth_path([(cx - 180, 590), (cx - 60, 560), (cx + 10, 640), (cx + 30, 780), (cx - 40, 850), (cx - 160, 800), (cx - 210, 690)], k=.35)
    s += P(bel, MG(belly, 'mv'), LWI + 2)
    for j in range(6):
        y = 600 + j * 42
        s += L(f'M{cx - 200 + j * 6} {y} Q{cx - 90} {y + 20} {cx + 10 - j * 4} {y - 6}', MON[belly][2], 5, .9)
    s += shade(torso, main, 10, 18, .35, .35) + L(torso, OL, LWM)
    # 앞다리
    armx = cx - 170 if not atk else cx - 210
    arm = smooth_path([(cx - 140, 620), (cx - 80, 640), (armx + 30, 860), (armx - 50, 870), (cx - 200, 700)], k=.35)
    s += P(arm, MG(main, 'mr')) + shade(arm, main, 6, 10) + L(arm, OL, LWM)
    for j in range(3):
        fx_ = armx - 60 + j * 34
        s += P(smooth_path([(fx_, 850), (fx_ + 34, 850), (fx_ + 30, base - 40), (fx_ - 4, base - 40)], k=.3), MG(main, 'mv'), LWI + 2)
        s += P(poly_path([(fx_ - 4, base - 50), (fx_ - 24, base - 28), (fx_ + 6, base - 34)]), MG(hornm, 'mv'), LWI)
    # 가까운 날개 — 몸 앞, 목 · 머리 뒤
    s += wing(-1, False)
    # 목 · 머리
    hx, hy = (cx - 250, 360) if not atk else (cx - 290, 380)
    neck = smooth_path([(cx - 150, 560), (cx - 60, 480), (hx + 130, hy - 10), (hx + 80, hy + 90), (cx - 190, 600)], k=.4)
    s += P(neck, pat) + shade(neck, main, 8, 14, .35, .35) + L(neck, OL, LWM)
    nb = smooth_path([(cx - 190, 590), (hx + 70, hy + 90), (hx + 100, hy + 120), (cx - 150, 610)], k=.4)
    s += P(nb, MG(belly, 'mv'), LWI + 2)
    # 등 가시
    for j in range(5):
        t = j / 4
        bx_ = (cx - 40) + (hx + 110 - (cx - 40)) * t
        by_ = 480 + (hy - 20 - 480) * t
        s += P(poly_path([(bx_ - 16, by_ + 6), (bx_ + 6, by_ - 44), (bx_ + 22, by_ + 4)]), MG(hornm, 'mv'), LWI + 1)
    # 머리 — 조금 크게(3등신 세상의 용이다)
    head_start = len(s)
    jaw_open = 60 if atk else 0
    skull = smooth_path([(hx + 110, hy - 40), (hx + 40, hy - 100), (hx - 70, hy - 90), (hx - 150, hy - 50), (hx - 220, hy - 20), (hx - 240, hy + 20),
                         (hx - 200, hy + 40), (hx - 80, hy + 50), (hx + 60, hy + 70), (hx + 120, hy + 30)], k=.35)
    jaw = smooth_path([(hx - 200, hy + 40 + jaw_open * .3), (hx - 220, hy + 70 + jaw_open), (hx - 110, hy + 100 + jaw_open * .8), (hx + 40, hy + 110),
                       (hx + 90, hy + 70), (hx - 60, hy + 56)], k=.35)
    # 뿔
    for k in (1, -1):
        horn = smooth_path([(hx + 30 + k * 10, hy - 80), (hx + 120 + k * 20, hy - 180 - (k > 0) * 30), (hx + 200 + k * 20, hy - 220 - (k > 0) * 40),
                            (hx + 150 + k * 20, hy - 160), (hx + 70 + k * 10, hy - 60)], k=.35)
        s += P(horn, MG(hornm, 'mv'), LWI + 3)
        if elder:
            s += L(f'M{hx + 60 + k * 10} {hy - 90} L{hx + 180 + k * 20} {hy - 200 - (k > 0) * 36}', '#ffffff', 4, .7)
    if atk:
        s += P(smooth_path([(hx - 206, hy + 42), (hx + 40, hy + 64), (hx - 110, hy + 90 + jaw_open * .6), (hx - 214, hy + 64 + jaw_open * .8)], k=.4), '#3a0808', LWI)
    s += P(jaw, pat) + shade(jaw, main, 6, 10) + L(jaw, OL, LWM)
    s += P(skull, pat) + shade(skull, main, 8, 14, .4, .35) + L(skull, OL, LWM)
    s += F(smooth_path([(hx - 220, hy + 10), (hx - 120, hy - 10), (hx + 40, hy + 30), (hx - 80, hy + 44), (hx - 200, hy + 36)], k=.4), MON[belly][0], .5)
    for x in (-190, -150, -110, -70):
        s += fang(hx + x, hy + 44, 16, 24)
        if atk:
            s += fang(hx + x - 10, hy + 70 + jaw_open * .7, 14, 22, flip=True)
    s += E(hx - 222, hy - 2, 10, 7, OL, 0)
    # 눈 — 노려보는 뱀눈
    s += eye(hx - 70, hy - 36, 34, iris='#ffcf3a' if not elder else '#7cf0ff', look=(-.4, .1), angry=.85, slit=True,
             glow='#ff8a3a' if not elder else '#7cc4ff')
    # 볏 · 턱가시
    for j in range(3):
        s += P(poly_path([(hx + 40 + j * 30, hy + 60 + j * 6), (hx + 70 + j * 36, hy + 130 + j * 8), (hx + 60 + j * 30, hy + 64 + j * 6)]), MG(hornm, 'mv'), LWI + 1)
    s = s[:head_start] + g(s[head_start:], 0, 0, 0, hx + 60, hy + 40, 1.22, 1.22)
    if elder:
        # 끊어진 사슬(목 · 앞다리) + 몸의 룬
        for (x0, y0, x1, y1) in [(cx - 200, 520, cx - 40, 620), (armx - 60, 800, armx + 60, 790)]:
            n = 5
            for i in range(n):
                t = i / (n - 1)
                x = x0 + (x1 - x0) * t
                y = y0 + (y1 - y0) * t + math.sin(t * math.pi) * 20
                s += E(x, y, 22, 14, 'none', 12, f'stroke="{OL}" transform="rotate({(i % 2) * 90} {x} {y})"')
                s += E(x, y, 22, 14, 'none', 6, f'stroke="{MON["chain"][1]}" transform="rotate({(i % 2) * 90} {x} {y})"')
        for (x, y) in [(cx + 60, 620), (cx + 110, 700), (cx - 10, 520), (cx + 380, 790)]:
            s += glow_line(f'M{x - 14} {y + 10} L{x} {y - 16} L{x + 14} {y + 10} M{x} {y - 16} L{x} {y + 18}', GEM['violet'][2], 3, '#f6dcff')
    if atk:
        # 입김 — 불(고룡) · 보랏빛 허공(아그라모스)
        fill = 'url(#fireG)' if not elder else 'url(#voidG)'
        mx, my = hx - 230, hy + 70
        s += f'<ellipse cx="{mx - 180}" cy="{my + 30}" rx="240" ry="120" fill="{fill}" opacity=".9" filter="url(#mblur10)"/>'
        s += f'<ellipse cx="{mx - 120}" cy="{my + 20}" rx="160" ry="80" fill="{fill}"/>'
        for i in range(5):
            a = math.radians(170 + (i - 2) * 9)
            s += F(smooth_path([(mx, my), (mx + math.cos(a) * 380, my + math.sin(a) * 380 - 30), (mx + math.cos(a + .08) * 300, my + math.sin(a + .08) * 300 + 20)], k=.4),
                   '#ffd060' if not elder else '#d9a6ff', .6)
    return s


def great_dragon(ph):
    return g(dragon(ph, elder=False), 20, 0, 0, 512, 960, .8, .8)


def elder_dragon(ph):
    return g(dragon(ph, elder=True), 20, 0, 0, 512, 960, .8, .8)


def wraith(ph):
    """지하의 망령 — 떠다니는 두건 쓴 유령. 몸이 비치고, 끝자락이 너덜하며, 손목에 끊어진 족쇄."""
    atk = ph == 'attack'
    bob = {'idle': 0, 'walk1': -20, 'walk2': 14, 'attack': -10}[ph]
    cx, cy = 520, 520 + bob
    s = f'<ellipse cx="{cx}" cy="{cy + 40}" rx="300" ry="360" fill="#7cc4ff" opacity=".18" filter="url(#mblur18)"/>'
    # 몸(두건 + 옷자락) — 아래로 갈수록 흐려지는 너덜한 끝
    hem = []
    for i in range(9):
        x = cx - 230 + i * 57
        hem.append((x, cy + 360 + (50 if i % 2 else 0) + (i % 3) * 10))
    robe = smooth_path([(cx - 150, cy - 220), (cx - 40, cy - 330), (cx + 110, cy - 300), (cx + 190, cy - 160), (cx + 230, cy + 120), (cx + 240, cy + 360)]
                       + hem[::-1] + [(cx - 250, cy + 300), (cx - 220, cy + 60)], k=.3)
    s += f'<defs><linearGradient id="wrF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3a5a"/><stop offset=".6" stop-color="#4a6a9a" stop-opacity=".85"/><stop offset="1" stop-color="#9fd0ff" stop-opacity=".15"/></linearGradient></defs>'
    s += P(robe, 'url(#wrF)', LWM, 'stroke-opacity=".85"')
    s += clip(uid('wr'), robe, L(f'M{cx - 100} {cy - 100} Q{cx - 60} {cy + 120} {cx - 120} {cy + 340} M{cx + 60} {cy - 60} Q{cx + 110} {cy + 140} {cx + 80} {cy + 360}', '#9fd0ff', 8, .35))
    # 두건 속 어둠 + 눈
    hood_in = smooth_path([(cx - 120, cy - 150), (cx - 40, cy - 250), (cx + 70, cy - 230), (cx + 110, cy - 120), (cx + 60, cy - 30), (cx - 70, cy - 30)], k=.4)
    s += P(hood_in, '#0b0e1a', LWI + 2)
    s += glowing_eye(cx - 50, cy - 130, 20, '#7cf0ff') + glowing_eye(cx + 30, cy - 134, 17, '#7cf0ff')
    s += L(f'M{cx - 50} {cy - 80} Q{cx - 10} {cy - 64} {cx + 30} {cy - 84}', '#7cf0ff', 5, .7)
    # 팔 — 뼈만 남은 손, 손목에 족쇄
    for k in (-1, 1):
        if atk and k < 0:
            ax, ay = cx - 360, cy - 40
        else:
            ax, ay = cx + k * 250, cy + 60
        sleeve = smooth_path([(cx + k * 120, cy - 120), (cx + k * 200, cy - 60), (ax + k * 10, ay - 20), (ax - k * 40, ay + 30), (cx + k * 110, cy + 20)], k=.35)
        s += P(sleeve, 'url(#wrF)', LWM, 'stroke-opacity=".85"')
        s += E(ax, ay, 34, 20, MG('chain', 'mv'), LWI + 2)
        for j in range(4):
            fx_ = ax - k * 10 - k * 26 + (j - 1.5) * 16
            s += L(f'M{fx_} {ay + 14} l{-k * 10 - 4} 56 l{-k * 12} 16', OL, 12) + L(f'M{fx_} {ay + 14} l{-k * 10 - 4} 56 l{-k * 12} 16', MON['bone'][0], 6)
        # 끊어진 사슬
        for j in range(3):
            x, y = ax + k * (30 + j * 34), ay + 40 + j * 30
            s += E(x, y, 18, 11, 'none', 10, f'stroke="{OL}" transform="rotate({45 + j * 90} {x} {y})"') + E(x, y, 18, 11, 'none', 5, f'stroke="{MON["chain"][1]}" transform="rotate({45 + j * 90} {x} {y})"')
    if atk:
        s += f'<circle cx="{cx - 420}" cy="{cy - 30}" r="80" fill="#7cc4ff" opacity=".5" filter="url(#mblur10)"/>'
        for i in range(4):
            s += L(f'M{cx - 330} {cy - 60 + i * 26} q-60 -10 -120 {-20 + i * 12}', '#cfeaff', 6, .6)
    return s


def golem(ph):
    """감옥 석상 — 금 간 돌로 된 거인. 이끼가 끼었고, 가슴의 룬과 눈이 푸르게 탄다. 주먹이 크다."""
    atk = ph == 'attack'
    step = {'idle': 0, 'walk1': 1, 'walk2': -1, 'attack': 0}[ph]
    cx, base = 520, 960
    stone = ('#8b8a86', '#b9b7b0', '#64635f', '#43423f')
    MON['stoneG'] = stone
    s = ''

    def block(pts, k=.2):
        d = smooth_path(pts, k=k)
        return P(d, f'url(#stn)') + shade(d, 'stoneG', 8, 14, .45, .45) + L(d, OL, LWM), d
    s += ('<defs><linearGradient id="stn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9b7b0"/>'
          '<stop offset=".4" stop-color="#8b8a86"/><stop offset="1" stop-color="#5a5955"/></linearGradient></defs>')
    # 다리
    for k in (-1, 1):
        lift = 22 if step == k else 0
        o, _ = block([(cx + k * 90 - 60, 740), (cx + k * 90 + 60, 740), (cx + k * 96 + 66, base - 16 - lift), (cx + k * 96 - 70, base - 16 - lift)], .1)
        s += o
    # 몸통
    o, torso = block([(cx - 230, 470), (cx + 230, 470), (cx + 200, 640), (cx + 150, 770), (cx - 150, 770), (cx - 200, 640)], .15)
    s += o
    s += clip(uid('gm'), torso, L(f'M{cx - 120} 480 l30 70 l-26 60 l40 50 M{cx + 90} 500 l-24 60 l30 40 M{cx + 160} 640 l-40 30', OL, 5, .8)
              + F(smooth_path([(cx - 230, 470), (cx - 60, 470), (cx - 100, 520), (cx - 200, 540)], k=.4), '#5f8a3a', .75)
              + F(smooth_path([(cx + 120, 470), (cx + 230, 470), (cx + 220, 520), (cx + 150, 510)], k=.4), '#5f8a3a', .7))
    s += f'<circle cx="{cx}" cy="600" r="70" fill="#5fd0ff" opacity=".35" filter="url(#mblur10)"/>'
    s += glow_line(f'M{cx - 40} 560 L{cx} 620 L{cx + 40} 560 M{cx} 540 L{cx} 660 M{cx - 30} 640 L{cx + 30} 640', '#6ee0ff', 6, '#e8fbff')
    # 팔 · 주먹
    for k in (1, -1):
        raise_ = (-150 if (atk and k < 0) else 0)
        ax = cx + k * 300 + (-40 if (atk and k < 0) else 0)
        o, _ = block([(cx + k * 200, 470), (cx + k * 300, 490), (ax + k * 40, 690 + raise_), (ax - k * 40, 700 + raise_), (cx + k * 200, 600)], .15)
        s += o
        o, _ = block([(ax - 80, 680 + raise_), (ax + 80, 680 + raise_), (ax + 90, 800 + raise_), (ax - 90, 800 + raise_)], .3)
        s += o
        for j in range(3):
            s += L(f'M{ax - 60 + j * 50} {700 + raise_} l0 60', OL, 5, .7)
    # 머리 — 작고 네모진, 눈이 빛난다
    hx, hy = cx - 20, 380
    o, _ = block([(hx - 110, hy - 100), (hx + 110, hy - 110), (hx + 130, hy + 60), (hx + 90, hy + 100), (hx - 90, hy + 100), (hx - 130, hy + 60)], .15)
    s += o
    s += F(smooth_path([(hx - 110, hy - 100), (hx + 20, hy - 108), (hx - 20, hy - 60), (hx - 100, hy - 50)], k=.4), '#5f8a3a', .75)
    s += glowing_eye(hx - 50, hy + 10, 18, '#6ee0ff') + glowing_eye(hx + 40, hy + 8, 16, '#6ee0ff')
    s += L(f'M{hx - 60} {hy + 60} L{hx + 50} {hy + 58}', OL, 8)
    if atk:
        for i in range(3):
            s += L(f'M{cx - 470 + i * 30} {500 + i * 40} l-60 {-10 + i * 10}', '#ffffff', 6, .55)
    return s


MONSTERS = {
    'slime': slime,
    'bat': bat,
    'mushroom': mushroom,
    'wolf': wolf,
    'imp': imp,
    'skeleton': skeleton,
    'imp_captain': imp_captain,
    'demon_soldier': demon_soldier,
    'demon_general': demon_general,
    'great_dragon': great_dragon,
    'elder_dragon': elder_dragon,
    'wraith': wraith,
    'golem': golem,
}


# ═════════════════════════════════════════════════════════════
# 굽기
# ═════════════════════════════════════════════════════════════
FRAMES = [('field', 'idle', 128), ('walk1', 'walk1', 128), ('walk2', 'walk2', 128), ('battle', 'idle', 512), ('attack', 'attack', 512),
          ('windup', 'windup', 512), ('hurt', 'hurt', 512), ('down', 'down', 512)]
EXT = 'webp'       # 0.70.29 — png 의 ¼ 크기(한 장짜리 html 을 줄인다)


def frame_svg(fn, ph):
    """그리는 장 하나. windup · hurt · down 은 서 있는 그림(idle)을 **기울이고 표정을 바꿔** 만든다.
      windup  덤벼들기 직전 — 뒤로 젖히며 움츠린다(주인공 반대쪽 = 오른쪽으로 기운다)
      hurt    맞은 순간 — 크게 젖혀지고 눈을 질끈 감는다 · 땀방울 · 충격 별
      down    쓰러짐 — 뒤로 넘어가 옆으로 눕고 눈이 × · 머리 위에 빙빙 도는 별"""
    EXPR['n'] = 0
    if ph in ('idle', 'walk1', 'walk2', 'attack'):
        EXPR['mode'] = 'normal'
        return fn(ph)
    if ph == 'windup':
        EXPR['mode'] = 'normal'
        return g(fn('idle'), 12, 8, 8, 512, 960, .96, .92)
    if ph == 'hurt':
        EXPR['mode'] = 'hurt'
        body_ = g(fn('idle'), 10, 8, 10, 512, 960, .9, .93)
        EXPR['mode'] = 'normal'
        fx = ''
        for (x, y, r) in [(300, 330, 34), (250, 420, 22)]:
            fx += (f'<path d="M{x} {y - r} L{x + r * .3} {y - r * .3} L{x + r} {y} L{x + r * .3} {y + r * .3} L{x} {y + r} '
                   f'L{x - r * .3} {y + r * .3} L{x - r} {y} L{x - r * .3} {y - r * .3} Z" fill="#fff4b0" stroke="{OL}" stroke-width="5"/>')
        fx += P(smooth_path([(700, 300), (720, 350), (700, 372), (680, 350)], k=.5), '#bfe6ff', LWI)
        return body_ + fx
    if ph == 'down' and fn in (MONSTERS.get('wolf'), MONSTERS.get('great_dragon'), MONSTERS.get('elder_dragon')):
        # 네 발 짐승 · 용은 뒤집히지 않고 **옆으로 주저앉는다** — 낮게 눌리고 머리가 떨어진다
        EXPR['mode'] = 'ko'
        body_ = g(fn('idle'), 0, 0, 7, 512, 960, 1.04, .6)
        EXPR['mode'] = 'normal'
        fx = ''
        for i, (x, y) in enumerate([(300, 560), (390, 530), (480, 560)]):
            r = 18 - i * 2
            fx += (f'<path d="M{x} {y - r} L{x + r * .3} {y - r * .3} L{x + r} {y} L{x + r * .3} {y + r * .3} L{x} {y + r} '
                   f'L{x - r * .3} {y + r * .3} L{x - r} {y} L{x - r * .3} {y - r * .3} Z" fill="#ffe27a" stroke="{OL}" stroke-width="4"/>')
        return body_ + fx
    if ph == 'down' and fn is MONSTERS.get('slime'):
        EXPR['mode'] = 'ko'
        body_ = g(fn('idle'), 0, 0, 0, 512, 955, 1.28, .42)      # 슬라임은 넘어지지 않고 퍼진다
        EXPR['mode'] = 'normal'
        return body_
    if ph == 'down':
        EXPR['mode'] = 'ko'
        # 뒤(오른쪽)로 넘어간다: 오른쪽 끝(발 옆 980)을 축으로 시계 방향 84° → 왼쪽으로 옮겨 틀 안에 눕힌다
        body_ = g(fn('idle'), -760, 0, 84, 980, 955, .78, .78)
        EXPR['mode'] = 'normal'
        fx = ''
        for i, (x, y) in enumerate([(540, 470), (650, 440), (760, 470)]):
            r = 20 - i * 2
            fx += (f'<path d="M{x} {y - r} L{x + r * .3} {y - r * .3} L{x + r} {y} L{x + r * .3} {y + r * .3} L{x} {y + r} '
                   f'L{x - r * .3} {y + r * .3} L{x - r} {y} L{x - r * .3} {y - r * .3} Z" fill="#ffe27a" stroke="{OL}" stroke-width="4"/>')
        return body_ + fx
    raise ValueError(ph)


def bake(names):
    os.makedirs(SVGDIR, exist_ok=True)
    jobs = []
    for n in names:
        fn = MONSTERS[n]
        for out, ph, size in FRAMES:
            sp = os.path.join(SVGDIR, f'{n}_{out}.svg')
            open(sp, 'w').write(doc(frame_svg(fn, ph)))
            jobs.append({'svg': sp, 'out': os.path.join(SVGDIR, f'{n}_{out}.png'), 'w': C, 'h': C, 'size': size,
                         'final': os.path.join(OUT, f'{n}_{out}.{EXT}'), 'old': os.path.join(OUT, f'{n}_{out}.png')})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(jobs, open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env)
    written = []
    for j in jobs:
        im = Image.open(j['out']).convert('RGBA').resize((j['size'], j['size']), Image.LANCZOS)
        if j['final'].endswith(f'_down.{EXT}'):
            # 누운 몸은 돌린 뒤의 자리가 놈마다 다르다 — 그림의 상자를 재어 **바닥에 붙이고 가운데로**
            bb = im.getbbox()
            if bb:
                piece = im.crop(bb)
                im = Image.new('RGBA', im.size)
                S_ = j['size']
                im.alpha_composite(piece, (max(0, (S_ - piece.width) // 2), max(0, int(S_ * 0.94) - piece.height)))
        im.save(j['final'], 'WEBP', quality=86, method=6, alpha_quality=92)
        if os.path.exists(j['old']):
            os.remove(j['old'])                  # 옛 png — manifest 는 webp 를 가리킨다
        # gen-assets 는 png 이름으로 굽는다 — 그 이름을 적어 두어야 건너뛴다
        written.append(os.path.relpath(j['old'], os.path.join(ROOT, 'assets')))
    painted_add(written)
    update_manifest(names)
    print(f'✓ 몬스터 {len(names)}종 · {len(jobs)}장')


def update_manifest(names):
    """manifest 의 몬스터 그림 주소를 webp 로 · 새 장(windup · hurt · down)을 더한다."""
    p = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    m = json.load(open(p, encoding='utf-8'))
    for n in names:
        for out, ph, size in FRAMES:
            key = f'mon_{n}_{out}'
            old = m.get(key, {})
            label = old.get('label') or f'{n} — {out}'
            logical = 64 if size <= 128 else 256
            m[key] = {**old, 'src': f'assets/sprites/monsters/{n}_{out}.{EXT}', 'w': logical, 'h': logical, 'label': label}
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
        f.write('\n')


def painted_add(paths):
    p = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {'note': '', 'keep': []}
    keep = set(data.get('keep', []))
    keep.update(paths)
    data['keep'] = sorted(keep)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')


def preview(names):
    """한 줄: 서기 · 걷기1 · 걷기2 · 때리기 (전투 크기) — 어두운 바탕."""
    rows = []
    for n in names:
        ims = [Image.open(os.path.join(OUT, f'{n}_{k}.{EXT}')).convert('RGBA') for k in ('battle', 'windup', 'attack', 'hurt', 'down')]
        ims += [Image.open(os.path.join(OUT, f'{n}_{k}.{EXT}')).convert('RGBA').resize((256, 256), Image.NEAREST) for k in ('field', 'walk1', 'walk2')]
        rows.append(ims)
    S = 256
    out = Image.new('RGBA', (S * 8, S * len(rows)), (44, 50, 66, 255))
    for r, ims in enumerate(rows):
        for c, im in enumerate(ims):
            out.alpha_composite(im.resize((S, S), Image.LANCZOS) if im.width != S else im, (c * S, r * S))
    os.makedirs(PREVIEW, exist_ok=True)
    out.save(os.path.join(PREVIEW, 'monsters.png'))
    print('✓ art/preview/monsters.png')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    names = [a for a in args if a in MONSTERS] or list(MONSTERS)
    if '--preview' not in sys.argv:
        bake(names)
    preview(names)
