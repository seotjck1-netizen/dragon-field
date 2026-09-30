#!/usr/bin/env python3
"""
장비 그림 — 희귀도 다섯 단계 × 칸마다 새로 그린다 (0.70.26 미리보기).

    python3 tools/gear-art.py            # 모든 몸 × 모든 칸 × 모든 등급 → art/gear/...
    python3 tools/gear-art.py m1 armor   # 골라서

만드는 것
  art/gear/<몸>/<칸>_<등급>.npz   조각별 덧그림(몸 틀 768×1024 RGBA) — body-rig 가 몸 조각에 얹는다
  art/gear/weapons/<무기>_<등급>.png + weapons.json   새 무기(손잡이·끝 좌표)
  art/gear/icons/<칸>_<등급>.png   아이템 그림(미리보기 도감)

── 등급 (게임의 희귀도 이름 · 색을 그대로) ─────────────────────────
  0 일반 common    천·거친 가죽.  쇠붙이 없음.                       (#cfd6e6)
  1 고급 uncommon  무두질한 가죽 · 쇠 버클 · 초록 천 덧댐.            (#6ee7a8)
  2 희귀 rare      강철 판 · 파란 기사 천 · 은 리벳 · 파란 보석.      (#7cc4ff)
  3 영웅 epic      검은 강철 · 금 테두리 · 보랏빛으로 **빛나는 룬**.   (#d09bff)
  4 전설 legendary 붉은 용비늘 · 금 · 붉게 타오르는 보석 · 불티.      (#ff3b3b)
  이름은 게임 아이템(src/data/items.json)을 따랐다 — 천 옷 · 가죽 갑옷 · 기사 갑옷 · 룬 갑옷 · 용비늘 성갑 …

── 어떻게 몸에 맞추나 ───────────────────────────────────────
  몸마다 **몸통·팔·다리·머리의 윤곽을 재어**(body-rig 의 조각) 그 윤곽을 따라 판을 그린다.
  그래서 네 몸(남·여 × 기본·거친) 모두에 꼭 맞는다. 손·발은 원래 그림의 손발 모양을 그대로 두고
  **색만 장갑·신발 재질로** 바꾼 뒤 그 위에 토시·장화목을 그린다(손가락 모양이 살아 있다).
"""
import importlib.util, json, math, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')
spec = importlib.util.spec_from_file_location('body_rig', os.path.join(ROOT, 'tools', 'body-rig.py'))
BR = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BR)
W, H = BR.BW, BR.BH
OUT = os.path.join(ROOT, 'art', 'gear')
SVGDIR = os.path.join(OUT, '_svg')
BODIES = ['m1', 'f1', 'm2', 'f2']
SLOTS = ['armor', 'helmet', 'shoulder', 'gloves', 'boots', 'belt', 'necklace']
TIERS = [0, 1, 2, 3, 4]
TIER_KEY = ['common', 'uncommon', 'rare', 'epic', 'legendary']
TIER_NAME = ['일반', '고급', '희귀', '영웅', '전설']
TIER_COLOR = ['#cfd6e6', '#6ee7a8', '#7cc4ff', '#d09bff', '#ff3b3b']

OL = '#1a1210'
LW = 5

# ─────────────────────────────────────────────────────────────
# 재질 — 바탕 · 밝은 면 · 그늘 · 짙은 그늘
# ─────────────────────────────────────────────────────────────
MAT = {
    'cloth':   ('#cdb892', '#e6d7b4', '#a89170', '#7a684d'),
    'rag':     ('#a58f6c', '#c3ae88', '#83704f', '#5d4f37'),
    'rope':    ('#b99c69', '#dcc28f', '#8e7449', '#62502f'),
    'hide':    ('#7a5638', '#9c7650', '#5c3f28', '#3e2a1b'),
    'leather': ('#8d5a33', '#b37b47', '#6a4126', '#472a18'),
    'leatherD': ('#5e3d27', '#7d5436', '#43291a', '#2c1b10'),
    'green':   ('#3f8a5a', '#62b27c', '#2c6843', '#1d4a2f'),
    'iron':    ('#8f96a0', '#c7cdd5', '#666d78', '#454b54'),
    'steel':   ('#b8c2cf', '#eef3f8', '#8591a1', '#5a6574'),
    'blue':    ('#2d64b0', '#4f8ed8', '#1f4a86', '#143260'),
    'silver':  ('#d5dde8', '#ffffff', '#a4afbf', '#737f90'),
    'dark':    ('#434763', '#666c93', '#2c2f44', '#1b1d2b'),
    'purple':  ('#6a3a9e', '#8f5dc9', '#4c2876', '#341b54'),
    'gold':    ('#e0b24a', '#fbe391', '#aa7d2b', '#735216'),
    'scale':   ('#b8222e', '#e3505a', '#7e1420', '#4f0b14'),
    'crimson': ('#6e0f1d', '#971b2c', '#4d0914', '#300510'),
    'bone':    ('#e8dcc0', '#fff8e6', '#bfae8c', '#8e7f62'),
    'wood':    ('#8a5a33', '#b07a4a', '#65401f', '#432a14'),
    'navy':    ('#3d4a66', '#5a6a8c', '#2a3348', '#1b2130'),
    'darkcloth': ('#2e2f40', '#474a63', '#1f2030', '#141520'),
    # 0.70.28 — 아이템마다 다른 모양(같은 등급 안)에 쓰는 재질
    'copper':  ('#b8733a', '#e6a868', '#8a5226', '#5a3316'),     # 용린(희귀) 테 — 전설의 금과 다르게 구리빛
    'wyrm':    ('#c65a22', '#ee8a48', '#933c14', '#5e240b'),     # 용린 비늘 — 전설의 핏빛과 다르게 주황
    'rust':    ('#8a5a3c', '#b27c55', '#6a4029', '#46291a'),     # 녹슨 쇠
    'arcane':  ('#6f63c9', '#a79cf0', '#4d449a', '#322c6b'),     # 마력 강철
    'cyan':    ('#2fb8c9', '#8eeaf2', '#1f8795', '#135862'),
    'rustcloth': ('#7a3a1c', '#a0542c', '#5a2812', '#3a1a0b'),
    'demon':   ('#2a1838', '#4a2a63', '#1a0e24', '#0e0716'),     # 마검 — 검보라
}
GEM = {  # 바탕 · 빛 · 번짐
    'green': ('#39c47e', '#c8ffe0', '#6ee7a8'),
    'blue': ('#3a8fe8', '#d6f0ff', '#7cc4ff'),
    'purple': ('#a95cf0', '#f3e0ff', '#d09bff'),
    'red': ('#e8202a', '#ffe0c0', '#ff3b3b'),
    'amber': ('#e89a2a', '#fff0c0', '#ffc46a'),
    'orange': ('#ff7a22', '#ffe6c0', '#ff9a3a'),
    'violet': ('#b43cff', '#f6dcff', '#c86bff'),
}


# ─────────────────────────────────────────────────────────────
# SVG 연장
# ─────────────────────────────────────────────────────────────
def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def smooth_path(pts, closed=True, k=0.5):
    """점들을 매끈한 곡선으로(캣멀-롬 → 베지어)."""
    pts = [tuple(map(float, p)) for p in pts]
    n = len(pts)
    if n < 3:
        return 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts) + (' Z' if closed else '')
    d = f'M{fmt(pts[0][0])} {fmt(pts[0][1])}'
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[i]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3)
        d += f' C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}'
    return d + (' Z' if closed else '')


def poly_path(pts, closed=True):
    return 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts) + (' Z' if closed else '')


def P(d, fill, w=LW, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{OL}" stroke-width="{w}" stroke-linejoin="round" {extra}/>'


def F(d, fill, op=1.0, extra=''):
    return f'<path d="{d}" fill="{fill}" opacity="{op}" {extra}/>'


def L(d, color, w=3, op=1.0, extra=''):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" '
            f'stroke-linejoin="round" opacity="{op}" {extra}/>')


def circ(x, y, r, fill, stroke=OL, w=3):
    return f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{fill}" stroke="{stroke}" stroke-width="{w}"/>'


def rivet(x, y, r, mat):
    c = MAT[mat]
    return (f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r)}" fill="{c[2]}" stroke="{OL}" stroke-width="2"/>'
            f'<circle cx="{fmt(x - r * .3)}" cy="{fmt(y - r * .3)}" r="{fmt(r * .45)}" fill="{c[1]}"/>')


def gem(x, y, r, kind, glow=True, shape='oval'):
    b, hi, gl = GEM[kind]
    s = ''
    if glow:
        s += f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(r * 2.6)}" fill="{gl}" opacity=".45" filter="url(#blur8)"/>'
    if shape == 'diamond':
        d = poly_path([(x, y - r * 1.25), (x + r, y), (x, y + r * 1.25), (x - r, y)])
        s += P(d, b, 3)
        s += F(poly_path([(x, y - r * 1.25), (x - r, y), (x - r * .2, y - r * .1)]), hi, .7)
    else:
        s += f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="{fmt(r)}" ry="{fmt(r * 1.12)}" fill="{b}" stroke="{OL}" stroke-width="3"/>'
        s += f'<ellipse cx="{fmt(x - r * .3)}" cy="{fmt(y - r * .35)}" rx="{fmt(r * .38)}" ry="{fmt(r * .3)}" fill="{hi}" opacity=".9"/>'
    return s


def glow_line(d, color, w=4, core='#ffffff'):
    """빛나는 룬 줄 — 번짐 · 색 · 흰 속."""
    return (L(d, color, w * 3.2, .55, 'filter="url(#blur6)"') + L(d, color, w, 1) + L(d, core, max(1, w * .35), .9))


DEFS = '''
<filter id="blur6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
<filter id="blur8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="blur3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
<pattern id="quilt" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <path d="M0 0 L0 26" stroke="#7a684d" stroke-width="2.4" opacity=".55"/>
  <path d="M0 0 L26 0" stroke="#7a684d" stroke-width="2.4" opacity=".55"/>
</pattern>
<pattern id="mailS" width="12" height="9" patternUnits="userSpaceOnUse">
  <rect width="12" height="9" fill="#8591a1"/>
  <path d="M0 5 q3 -5 6 0 q3 -5 6 0" fill="none" stroke="#4d5664" stroke-width="1.8"/>
  <path d="M-3 10 q3 -5 6 0 q3 -5 6 0 q3 -5 6 0" fill="none" stroke="#4d5664" stroke-width="1.8"/>
  <circle cx="3" cy="2.6" r="1.1" fill="#e6ecf3"/>
</pattern>
<pattern id="mailD" width="12" height="9" patternUnits="userSpaceOnUse">
  <rect width="12" height="9" fill="#3a3d55"/>
  <path d="M0 5 q3 -5 6 0 q3 -5 6 0" fill="none" stroke="#1b1d2b" stroke-width="1.8"/>
  <path d="M-3 10 q3 -5 6 0 q3 -5 6 0 q3 -5 6 0" fill="none" stroke="#1b1d2b" stroke-width="1.8"/>
  <circle cx="3" cy="2.6" r="1.1" fill="#8d8fb8"/>
</pattern>
<pattern id="scales" width="24" height="17" patternUnits="userSpaceOnUse">
  <rect width="24" height="17" fill="#3c0810"/>
  <path d="M-12 17 a12 12 0 0 1 24 0 M12 17 a12 12 0 0 1 24 0" fill="#7a1420" stroke="#2a0409" stroke-width="2"/>
  <path d="M0 8.5 a12 12 0 0 1 24 0" fill="#931b27" stroke="#35060c" stroke-width="2"/>
  <path d="M6 6.5 q6 -4.5 12 0" fill="none" stroke="#e0646b" stroke-width="1.8" opacity=".55"/>
  <path d="M-6 15 q6 -4.5 12 0 M18 15 q6 -4.5 12 0" fill="none" stroke="#c9434b" stroke-width="1.5" opacity=".5"/>
</pattern>
<pattern id="scalesBig" width="36" height="25" patternUnits="userSpaceOnUse">
  <rect width="36" height="25" fill="#380710"/>
  <path d="M-18 25 a18 18 0 0 1 36 0 M18 25 a18 18 0 0 1 36 0" fill="#761320" stroke="#2a0409" stroke-width="2.4"/>
  <path d="M0 12.5 a18 18 0 0 1 36 0" fill="#8f1b27" stroke="#35060c" stroke-width="2.4"/>
  <path d="M9 10 q9 -6.5 18 0" fill="none" stroke="#e9747a" stroke-width="2.2" opacity=".6"/>
</pattern>
<pattern id="scalesO" width="24" height="17" patternUnits="userSpaceOnUse">
  <rect width="24" height="17" fill="#4a1c08"/>
  <path d="M-12 17 a12 12 0 0 1 24 0 M12 17 a12 12 0 0 1 24 0" fill="#a8461a" stroke="#321004" stroke-width="2"/>
  <path d="M0 8.5 a12 12 0 0 1 24 0" fill="#c65a22" stroke="#3a1406" stroke-width="2"/>
  <path d="M6 6.5 q6 -4.5 12 0" fill="none" stroke="#ffb070" stroke-width="1.8" opacity=".6"/>
  <path d="M-6 15 q6 -4.5 12 0 M18 15 q6 -4.5 12 0" fill="none" stroke="#e8864a" stroke-width="1.5" opacity=".5"/>
</pattern>
<pattern id="scalesOBig" width="36" height="25" patternUnits="userSpaceOnUse">
  <rect width="36" height="25" fill="#461a07"/>
  <path d="M-18 25 a18 18 0 0 1 36 0 M18 25 a18 18 0 0 1 36 0" fill="#a3431a" stroke="#321004" stroke-width="2.4"/>
  <path d="M0 12.5 a18 18 0 0 1 36 0" fill="#c25520" stroke="#3a1406" stroke-width="2.4"/>
  <path d="M9 10 q9 -6.5 18 0" fill="none" stroke="#ffb27a" stroke-width="2.2" opacity=".6"/>
</pattern>
<pattern id="runesV" width="30" height="40" patternUnits="userSpaceOnUse">
  <path d="M8 6 l6 8 l-6 8 M20 20 l-4 10 l6 4" fill="none" stroke="#c86bff" stroke-width="2" opacity=".55"/>
</pattern>
<pattern id="weave" width="10" height="10" patternUnits="userSpaceOnUse">
  <path d="M0 5 L10 5 M5 0 L5 10" stroke="#000" stroke-width="1" opacity=".08"/>
</pattern>
'''


def _grads():
    out = ''
    for k, (b, lit, sh, dk) in MAT.items():
        out += (f'<linearGradient id="lg_{k}" x1="0" y1="0" x2="1" y2="0">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".32" stop-color="{b}"/>'
                f'<stop offset=".7" stop-color="{b}"/><stop offset="1" stop-color="{sh}"/></linearGradient>')
        out += (f'<linearGradient id="lv_{k}" x1="0" y1="0" x2="0" y2="1">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".4" stop-color="{b}"/>'
                f'<stop offset="1" stop-color="{sh}"/></linearGradient>')
        out += (f'<radialGradient id="rg_{k}" cx=".38" cy=".32" r=".75">'
                f'<stop offset="0" stop-color="{lit}"/><stop offset=".45" stop-color="{b}"/>'
                f'<stop offset="1" stop-color="{sh}"/></radialGradient>')
    return out


DEFS += _grads()


def G(mat, kind='lg'):
    return f'url(#{kind}_{mat})'


def svg_doc(body, w=W, h=H):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{DEFS}</defs>{body}</svg>')


_UID = [0]


def uid(p='u'):
    _UID[0] += 1
    return f'{p}{_UID[0]}'


def bevel(d, mat, k=5, w=8, lit_op=.55, dk_op=.45):
    """판의 부피 — 왼쪽 위 안쪽에 빛, 오른쪽 아래 안쪽에 그늘."""
    c = MAT[mat]
    return clip(uid('bv'), d, L(d, c[1], w, lit_op, f'transform="translate({k} {k})"')
                + L(d, c[3], w + 2, dk_op, f'transform="translate({-k} {-k})"'))


def PB(d, fill, mat, w=LW, k=5, bw=8):
    """선을 두른 판 + 부피."""
    return P(d, fill, w) + bevel(d, mat, k, bw) + L(d, OL, w)


def clip(cid, d, inner):
    return f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})">{inner}</g>'


def shade_band(d_clip, cid, x0, x1, y0, y1, mat, side='both'):
    """판 안쪽에 밝은 띠(왼쪽) · 그늘(오른쪽) — 빛은 왼쪽 위에서 온다."""
    c = MAT[mat]
    wdt = x1 - x0
    inner = ''
    if side in ('both', 'lit'):
        inner += F(poly_path([(x0, y0), (x0 + wdt * .22, y0), (x0 + wdt * .16, y1), (x0, y1)]), c[1], .55)
    if side in ('both', 'shade'):
        inner += F(poly_path([(x1 - wdt * .3, y0), (x1, y0), (x1, y1), (x1 - wdt * .22, y1)]), c[2], .7)
    return clip(cid, d_clip, inner)


# ─────────────────────────────────────────────────────────────
# 몸 재기
# ─────────────────────────────────────────────────────────────
class Geo:
    """몸 하나의 윤곽 — 쉬는 자세(몸 틀 좌표)."""

    def __init__(self, name):
        self.name = name
        self.rig = BR.RIGS[name]
        im, lab, sk, L_ = BR.build_layers(name)
        self.im, self.lab = im, lab
        self.a = im[..., 3] > 0
        r = self.rig
        self.female = r['long_hair']
        self.cx = 384.0
        self.neck = r['neck']
        self.waist_y = r['waist'][1] + (3 if not self.female else 0)
        self.hem_y = max(r['legL']['hem'], r['legR']['hem'])
        self.ground = r['ground'][1]
        # 몸통 — 두 팔 안쪽 경계 사이의 몸통 조각만(긴 머리칼 부스러기를 뺀다)
        T = lab == 2
        yy, xx = np.mgrid[0:H, 0:W]
        armL, armR = lab == 4, lab == 5
        lim_l = np.full(H, -1)
        lim_r = np.full(H, W)
        for y in range(H):
            xl = np.where(armL[y])[0]
            xr = np.where(armR[y])[0]
            if len(xl):
                lim_l[y] = xl.max()
            if len(xr):
                lim_r[y] = xr.min()
        T &= (xx > lim_l[:, None]) & (xx < lim_r[:, None])
        # 겨드랑이 위(어깨) — armhole 선 안쪽만
        for s in 'LR':
            hole = r[s]['armhole']
            for y in range(hole[0][1] - 20, hole[-1][1] + 1):
                xb = BR.polyline_x(hole, y)
                if s == 'L':
                    T[y, :int(xb) - 2] = False
                else:
                    T[y, int(xb) + 3:] = False
        T = cv2.morphologyEx(T.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
        self.T = T
        self.tl = np.full(H, np.nan)
        self.tr = np.full(H, np.nan)
        for y in range(H):
            xs = np.where(T[y])[0]
            if len(xs) > 20:
                self.tl[y], self.tr[y] = xs.min(), xs.max()
        self.tl = self._smooth(self.tl)
        self.tr = self._smooth(self.tr)
        # 팔
        self.arm = {'L': armL, 'R': armR}
        self.al, self.ar = {}, {}
        for s in 'LR':
            m = self.arm[s]
            lo, hi = np.full(H, np.nan), np.full(H, np.nan)
            for y in range(H):
                xs = np.where(m[y])[0]
                if len(xs) > 3:
                    lo[y], hi[y] = xs.min(), xs.max()
            self.al[s], self.ar[s] = self._smooth(lo, 9), self._smooth(hi, 9)
        # 다리
        self.leg = {'L': lab == 6, 'R': lab == 7}
        self.ll, self.lr = {}, {}
        for s in 'LR':
            m = self.leg[s]
            lo, hi = np.full(H, np.nan), np.full(H, np.nan)
            for y in range(H):
                xs = np.where(m[y])[0]
                if len(xs) > 3:
                    lo[y], hi[y] = xs.min(), xs.max()
            self.ll[s], self.lr[s] = self._smooth(lo, 7), self._smooth(hi, 7)
        # 머리
        self.head = lab == 1
        rr, gg, bb = [im[..., c].astype(int) for c in range(3)]
        self.skin = self.a & (rr - bb > 45) & (rr > 170) & (gg > 110)
        face = self.head & self.skin
        ys, xs = np.where(face)
        self.face_box = (xs.min(), ys.min(), xs.max(), ys.max())
        hy, hx = np.where(self.head)
        self.head_box = (hx.min(), hy.min(), hx.max(), hy.max())
        # 이마(앞머리 끝) — 가운데 줄에서 살이 처음 나오는 높이
        col = face[:, 370:400].any(1)
        self.brow_y = int(np.argmax(col))
        self.hair_top = int(hy.min())

    @staticmethod
    def _smooth(v, k=7):
        out = v.copy()
        ok = ~np.isnan(v)
        if ok.sum() < 3:
            return out
        idx = np.arange(len(v))
        filled = np.interp(idx, idx[ok], v[ok])
        sm = ndi.uniform_filter1d(filled, k)
        out[ok] = sm[ok]
        return out

    def torso(self, y):
        y = int(np.clip(y, 0, H - 1))
        l, r = self.tl[y], self.tr[y]
        if np.isnan(l):
            ok = np.where(~np.isnan(self.tl))[0]
            j = ok[np.argmin(np.abs(ok - y))]
            l, r = self.tl[j], self.tr[j]
        return float(l), float(r)

    def armw(self, s, y):
        y = int(np.clip(y, 0, H - 1))
        l, r = self.al[s][y], self.ar[s][y]
        if np.isnan(l):
            ok = np.where(~np.isnan(self.al[s]))[0]
            j = ok[np.argmin(np.abs(ok - y))]
            l, r = self.al[s][j], self.ar[s][j]
        return float(l), float(r)

    def legw(self, s, y):
        y = int(np.clip(y, 0, H - 1))
        l, r = self.ll[s][y], self.lr[s][y]
        if np.isnan(l):
            ok = np.where(~np.isnan(self.ll[s]))[0]
            j = ok[np.argmin(np.abs(ok - y))]
            l, r = self.ll[s][j], self.lr[s][j]
        return float(l), float(r)

    def side_pts(self, y0, y1, pad, step=12, fn=None, flare=0.0):
        """몸통 옆선 — 왼쪽(위→아래) · 오른쪽(아래→위) 점들. flare: 아래로 갈수록 더 벌린다."""
        fn = fn or self.torso
        ys = list(np.arange(y0, y1, step)) + [y1]
        left, right = [], []
        for y in ys:
            l, r = fn(y)
            t = (y - y0) / max(1, (y1 - y0))
            e = pad + flare * t
            left.append((l - e, y))
            right.append((r + e, y))
        return left, right[::-1]


_GEO = {}


def geo(name):
    if name not in _GEO:
        _GEO[name] = Geo(name)
    return _GEO[name]


# ─────────────────────────────────────────────────────────────
# 갑옷 — 몸통(+치마) · 윗팔(사슬 소매) · 다리(바지·무릎)
# ─────────────────────────────────────────────────────────────
def torso_outline(g, top_style='round', pad=6, bottom=None, flare=12, hem_pts=None, collar_drop=14, extra_top=0):
    """갑옷의 바깥선 — 어깨 → 목둘레 → 반대 어깨 → 옆선 → 치맛단."""
    cx = g.cx
    r = g.rig
    hl, hr = r['L']['armhole'], r['R']['armhole']
    col_y = g.neck[1] + (16 if not g.female else 18) - extra_top
    nhw = 40 if not g.female else 36
    bot = bottom if bottom is not None else g.hem_y + 8
    pit_y = hl[-1][1]
    top = [(hl[0][0] - 4, hl[0][1] + 6 - extra_top), (cx - nhw - 8, col_y - 2)]
    if top_style == 'V':
        top += [(cx - nhw + 4, col_y + 6), (cx, col_y + 46), (cx + nhw - 4, col_y + 6)]
    elif top_style == 'high':
        top += [(cx - nhw + 6, col_y - 16), (cx, col_y - 8), (cx + nhw - 6, col_y - 16)]
    else:
        top += [(cx - nhw + 2, col_y + 4), (cx, col_y + collar_drop), (cx + nhw - 2, col_y + 4)]
    top += [(cx + nhw + 8, col_y - 2), (hr[0][0] + 4, hr[0][1] + 6 - extra_top)]
    # 오른쪽 옆선(위 → 아래)
    right = [(x + 3, y) for x, y in hr[1:]]
    ys = list(range(pit_y + 14, int(bot) - 10, 14))
    for y in ys:
        l, rr = g.torso(min(y, g.hem_y - 6))
        t = max(0, (y - g.waist_y)) / max(1, bot - g.waist_y)
        right.append((rr + pad + flare * t, y))
    l_end, r_end = g.torso(g.hem_y - 6)
    right.append((r_end + pad + flare, bot))
    left = [(x - 3, y) for x, y in hl[1:]]
    for y in ys:
        l, rr = g.torso(min(y, g.hem_y - 6))
        t = max(0, (y - g.waist_y)) / max(1, bot - g.waist_y)
        left.append((l - pad - flare * t, y))
    left.append((l_end - pad - flare, bot))
    hem = hem_pts or []
    pts = top + right + hem + left[::-1]
    return pts, (l_end - pad - flare, r_end + pad + flare, bot)


def hem_zigzag(x0, x1, y, n=9, amp=8):
    """치맛단 — 오른쪽에서 왼쪽으로(바깥선 순서)."""
    pts = []
    for i in range(n + 1):
        x = x1 - (x1 - x0) * i / n
        pts.append((x, y + (amp if i % 2 else 0)))
    return pts


def hem_scallop(x0, x1, y, n=6, depth=22):
    pts = []
    for i in range(n):
        xa = x1 - (x1 - x0) * i / n
        xb = x1 - (x1 - x0) * (i + 1) / n
        pts += [(xa, y), ((xa + xb) / 2, y + depth), ]
    pts.append((x0, y))
    return pts


def arm_band(g, s, y0, y1, pad=4, bottom_wave=0.0):
    """윗팔을 감싸는 소매 — 팔 윤곽을 따라."""
    ys = list(range(int(y0), int(y1), 8)) + [int(y1)]
    left = [(g.armw(s, y)[0] - pad, y) for y in ys]
    right = [(g.armw(s, y)[1] + pad, y) for y in ys]
    lo = left[-1]
    ro = right[-1]
    bottom = []
    if bottom_wave:
        n = 4
        for i in range(1, n):
            x = ro[0] + (lo[0] - ro[0]) * i / n
            bottom.append((x, y1 + (bottom_wave if i % 2 else 0)))
    return left + bottom[::-1] + right[::-1]


def leg_shape(g, s, y0, y1, pad=3, knee_bulge=0):
    ys = list(range(int(y0), int(y1), 10)) + [int(y1)]
    left, right = [], []
    for y in ys:
        yy = max(y, (g.rig['leg' + s]['hem'] + 12))
        l, r = g.legw(s, yy)
        left.append((l - pad, y))
        right.append((r + pad, y))
    return left + right[::-1]


def armor(g, t):
    """갑옷 한 벌(등급 t) → {조각: svg 속}"""
    cx = g.cx
    r = g.rig
    out = {}
    wy = g.waist_y
    hem = g.hem_y
    ey = {s: r[s]['elbow'][1] for s in 'LR'}
    knee = {s: r['leg' + s]['knee'] for s in 'LR'}
    ank = {s: r['leg' + s]['ankle'] for s in 'LR'}
    col_y = g.neck[1] + (16 if not g.female else 18)
    body = ''
    if t == 0:
        # ── 천 옷 — 누빈 천(갬비슨), 목둘레 끈, 너덜한 단
        bot = hem + 4
        x0, x1 = g.torso(hem - 6)
        pts, (bl, br, by) = torso_outline(g, 'round', pad=5, bottom=bot, flare=12,
                                          hem_pts=hem_zigzag(x0 - 17, x1 + 17, bot, 10, 7))
        d = smooth_path(pts, k=0.35)
        c = MAT['cloth']
        body += P(d, G('cloth'))
        inner = f'<rect x="0" y="0" width="{W}" height="{H}" fill="url(#quilt)"/>'
        inner += F(poly_path([(0, 0), (cx - 40, 0), (cx - 70, H), (0, H)]), c[1], .35)
        inner += F(poly_path([(cx + 60, 0), (W, 0), (W, H), (cx + 90, H)]), c[2], .55)
        inner += F(poly_path([(0, bot - 26), (W, bot - 26), (W, H), (0, H)]), MAT['rag'][0], .9)
        inner += L(f'M0 {bot - 26} L{W} {bot - 26}', MAT['rag'][3], 3, .8)
        inner += L(f'M0 {bot - 18} L{W} {bot - 18}', MAT['rag'][1], 2, .7, 'stroke-dasharray="7 6"')
        # 가운데 여밈 + 끈
        inner += L(f'M{cx} {col_y + 12} L{cx} {wy - 4}', c[3], 3, .8)
        for i in range(3):
            yy = col_y + 20 + i * 18
            inner += L(f'M{cx - 12} {yy} L{cx + 12} {yy + 12} M{cx + 12} {yy} L{cx - 12} {yy + 12}', MAT['rope'][3], 4)
            inner += L(f'M{cx - 12} {yy} L{cx + 12} {yy + 12} M{cx + 12} {yy} L{cx - 12} {yy + 12}', MAT['rope'][1], 2)
        # 기운 자국
        px, py = g.torso(wy + 40)[0] + 22, wy + 40
        inner += P(poly_path([(px, py), (px + 30, py - 4), (px + 32, py + 24), (px + 2, py + 26)]), MAT['rag'][2], 3)
        inner += L(f'M{px + 4} {py + 3} L{px + 28} {py + 1} M{px + 4} {py + 22} L{px + 28} {py + 21}', MAT['rag'][1], 2, 1, 'stroke-dasharray="4 4"')
        body += clip(f'ar0{g.name}', d, inner)
        body += bevel(d, 'cloth', 6, 10)
        body += L(d, OL, LW)
        out['torso'] = body
        out['pit'] = c[2]
        return out

    if t == 1:
        # ── 가죽 갑옷 — 초록 속치마 · 가죽 조끼 · 가죽 늘어뜨림(타셋) · 가죽 바지
        bot = hem + 10
        x0, x1 = g.torso(hem - 6)
        # 속치마(초록 천)
        sk_pts, _ = torso_outline(g, 'round', pad=4, bottom=bot + 2, flare=14,
                                  hem_pts=hem_zigzag(x0 - 18, x1 + 18, bot + 2, 8, 6))
        dsk = smooth_path(sk_pts, k=0.35)
        gc = MAT['green']
        body += P(dsk, gc[0])
        body += clip(f'ar1s{g.name}', dsk, F(poly_path([(cx + 40, 0), (W, 0), (W, H), (cx + 70, H)]), gc[2], .6)
                     + L(f'M0 {bot - 8} L{W} {bot - 8}', gc[1], 3, .8, 'stroke-dasharray="6 5"'))
        # 조끼
        vest_bot = wy + 16
        pts, _ = torso_outline(g, 'V', pad=7, bottom=vest_bot, flare=0,
                               hem_pts=[(g.torso(vest_bot)[1] + 7, vest_bot), (cx, vest_bot + 14), (g.torso(vest_bot)[0] - 7, vest_bot)])
        d = smooth_path(pts, k=0.3)
        c = MAT['leather']
        body += P(d, G('leather'))
        l0, r0 = g.torso(wy)
        inner = F(poly_path([(0, 0), (cx - 50, 0), (cx - 70, H), (0, H)]), c[1], .45)
        inner += F(poly_path([(cx + 50, 0), (W, 0), (W, H), (cx + 70, H)]), c[2], .6)
        inner += L(d, MAT['leather'][1], 3, .9, f'stroke-dasharray="7 6" transform="translate(0 0)"')
        # 가슴 이음선 · 쇠 징
        inner += L(f'M{l0 - 10} {col_y + 70} Q{cx} {col_y + 92} {r0 + 10} {col_y + 70}', c[3], 3, .8)
        for k in range(3):
            for sx in (-1, 1):
                inner += rivet(cx + sx * (46 + k * 18), col_y + 58 + k * 3, 4.5, 'iron')
        # 가운데 끈
        for i in range(4):
            yy = col_y + 52 + i * 18
            inner += L(f'M{cx - 10} {yy} L{cx + 10} {yy + 12} M{cx + 10} {yy} L{cx - 10} {yy + 12}', MAT['leatherD'][3], 4)
            inner += L(f'M{cx - 10} {yy} L{cx + 10} {yy + 12} M{cx + 10} {yy} L{cx - 10} {yy + 12}', MAT['bone'][2], 2)
        body += clip(f'ar1{g.name}', d, inner)
        body += bevel(d, 'leather', 5, 9)
        body += L(d, OL, LW)
        # 가죽 늘어뜨림 — 네 쪽
        tl_, tr_ = g.torso(wy + 20)
        span_l, span_r = tl_ - 8, tr_ + 8
        n = 4
        gap = 6
        wseg = (span_r - span_l - gap * (n - 1)) / n
        for i in range(n):
            xa = span_l + i * (wseg + gap)
            xb = xa + wseg
            fl = (i - 1.5) * 6
            seg = [(xa, vest_bot - 4), (xb, vest_bot - 4), (xb + fl + 3, bot - 16), (xb + fl, bot - 4),
                   ((xa + xb) / 2 + fl, bot + 4), (xa + fl, bot - 4), (xa + fl - 3, bot - 16)]
            ds = smooth_path(seg, k=0.25)
            body += P(ds, G('leather') if i % 2 == 0 else G('leatherD')) + bevel(ds, 'leather', 4, 7)
            body += clip(f'ar1t{i}{g.name}', ds, F(poly_path([(xb - 12, 0), (xb + 20, 0), (xb + 20, H), (xb - 12, H)]), c[2], .7)
                         + rivet((xa + xb) / 2 + fl * .5, vest_bot + 12, 4, 'iron'))
        out['torso'] = body
        # 가죽 바지 + 무릎 덧댐
        for s in 'LR':
            top = g.rig['leg' + s]['hem'] - 90
            dl = smooth_path(leg_shape(g, s, top, ank[s][1] + 4, pad=3), k=0.3)
            lc = MAT['leatherD']
            kx = sum(g.legw(s, knee[s][1])) / 2
            inner = F(poly_path([(0, 0), (kx - 18, 0), (kx - 22, H), (0, H)]), lc[1], .45)
            inner += F(poly_path([(kx + 16, 0), (W, 0), (W, H), (kx + 20, H)]), lc[2], .7)
            inner += P(smooth_path([(kx - 20, knee[s][1] - 26), (kx + 20, knee[s][1] - 26), (kx + 24, knee[s][1] + 18), (kx - 22, knee[s][1] + 20)], k=.4), MAT['leather'][0], 3)
            inner += L(f'M{kx - 16} {knee[s][1] - 20} L{kx + 16} {knee[s][1] - 20}', MAT['leather'][1], 2, 1, 'stroke-dasharray="4 4"')
            inner += L(f'M{kx} {top} L{kx - 2} {ank[s][1]}', lc[3], 2, .6)
            out['leg' + s] = P(dl, G('leatherD')) + clip(f'ar1l{s}{g.name}', dl, inner) + bevel(dl, 'leatherD', 4, 8) + L(dl, OL, LW)
        out['pit'] = c[2]
        return out

    if t == 2:
        # ── 기사 갑옷 — 파란 겉옷(타바드) · 강철 흉갑 · 허리 판 · 사슬 소매 · 무릎 판
        bot = hem + 16
        x0, x1 = g.torso(hem - 6)
        bc = MAT['blue']
        tab_pts, _ = torso_outline(g, 'round', pad=5, bottom=bot, flare=18,
                                   hem_pts=[(x1 + 23, bot), (cx + 18, bot), (cx, bot + 22), (cx - 18, bot), (x0 - 23, bot)])
        dt = smooth_path(tab_pts, k=0.3)
        body += P(dt, G('blue'))
        inner = F(poly_path([(0, 0), (cx - 60, 0), (cx - 80, H), (0, H)]), bc[1], .45)
        inner += F(poly_path([(cx + 50, 0), (W, 0), (W, H), (cx + 70, H)]), bc[2], .7)
        inner += L(f'M{x0 - 30} {bot - 14} L{x1 + 30} {bot - 14}', MAT['silver'][1], 7, .95)
        inner += L(f'M{x0 - 30} {bot - 14} L{x1 + 30} {bot - 14}', MAT['silver'][2], 2.5, .9)
        inner += L(f'M{cx} {wy + 30} L{cx} {bot + 20}', bc[3], 3, .8)        # 앞 트임
        body += clip(f'ar2t{g.name}', dt, inner) + bevel(dt, 'blue', 5, 9) + L(dt, OL, LW)
        # 흉갑
        pb = wy + 20
        l1, r1 = g.torso(pb)
        bp_pts, _ = torso_outline(g, 'high', pad=9, bottom=pb, flare=0,
                                  hem_pts=[(r1 + 9, pb - 8), (cx, pb + 16), (l1 - 9, pb - 8)])
        db = smooth_path(bp_pts, k=0.3)
        sc = MAT['steel']
        body += P(db, G('steel'))
        inner = F(poly_path([(0, 0), (cx - 30, 0), (cx - 34, H), (0, H)]), sc[1], .55)
        inner += F(poly_path([(cx + 26, 0), (W, 0), (W, H), (cx + 30, H)]), sc[2], .8)
        inner += F(poly_path([(cx - 6, 0), (cx + 4, 0), (cx + 4, H), (cx - 6, H)]), sc[1], .9)   # 가운데 능선
        inner += L(db, MAT['silver'][1], 4, .9, 'transform="translate(0 0)"')
        # 가슴 곡면 — 두 판이 가운데 능선에서 만난다
        for sx in (-1, 1):
            pec = f'M{cx + sx * 8} {col_y + 96} Q{cx + sx * 52} {col_y + 112} {cx + sx * 86} {col_y + 70}'
            inner += L(pec, sc[3], 4, .6) + L(pec, sc[1], 2, .9, 'transform="translate(0 -4)"')
        # 가슴 문장 — 방패 + 파란 보석
        sy = col_y + 64
        shield = [(cx - 22, sy - 20), (cx + 22, sy - 20), (cx + 20, sy + 8), (cx, sy + 30), (cx - 20, sy + 8)]
        inner += P(smooth_path(shield, k=.2), bc[0], 3) + L(smooth_path(shield, k=.2), MAT['silver'][1], 2, .9)
        inner += gem(cx, sy - 2, 8, 'blue', glow=False)
        for sx in (-1, 1):
            for k in range(4):
                yy = col_y + 10 + k * 34
                xx = (l1 - 2 if sx < 0 else r1 + 2) - sx * 2 if k else cx + sx * 44
                if k:
                    lx, rx = g.torso(yy)
                    xx = (lx + 4) if sx < 0 else (rx - 4)
                inner += rivet(xx, yy, 4.5, 'silver')
        body += clip(f'ar2b{g.name}', db, inner) + bevel(db, 'steel', 6, 10) + L(db, OL, LW)
        # 허리 판 두 겹
        for k in range(2):
            yy = pb - 4 + k * 22
            la, ra = g.torso(yy + 10)
            dd = smooth_path([(la - 12 - k * 3, yy), (cx, yy + 12), (ra + 12 + k * 3, yy), (ra + 13 + k * 3, yy + 22),
                              (cx, yy + 34), (la - 13 - k * 3, yy + 22)], k=.3)
            body += P(dd, sc[0 if k else 2]) + clip(f'ar2f{k}{g.name}', dd, F(poly_path([(0, yy - 5), (W, yy - 5), (W, yy + 8), (0, yy + 8)]), sc[1], .7))
            body += rivet(la - 4, yy + 12, 4, 'silver') + rivet(ra + 4, yy + 12, 4, 'silver')
        out['torso'] = body
        # 사슬 소매
        for s in 'LR':
            h0 = r[s]['armhole'][0][1] + 14
            da = smooth_path(arm_band(g, s, h0, ey[s] - 6, pad=4, bottom_wave=6), k=.3)
            out['arm' + s] = P(da, 'url(#mailS)') + clip(f'ar2a{s}{g.name}', da, F(poly_path([(0, ey[s] - 16), (W, ey[s] - 16), (W, H), (0, H)]), MAT['steel'][3], .25))
        # 바지 + 무릎 판
        for s in 'LR':
            top = g.rig['leg' + s]['hem'] - 90
            dl = smooth_path(leg_shape(g, s, top, ank[s][1] + 4, pad=3), k=0.3)
            lc = ('#3d4a66', '#5a6a8c', '#2a3348', '#1b2130')
            kx = sum(g.legw(s, knee[s][1])) / 2
            ky = knee[s][1]
            inner = F(poly_path([(0, 0), (kx - 18, 0), (kx - 22, H), (0, H)]), lc[1], .45)
            inner += F(poly_path([(kx + 16, 0), (W, 0), (W, H), (kx + 20, H)]), lc[2], .7)
            leg = P(dl, G('navy')) + clip(f'ar2l{s}{g.name}', dl, inner) + bevel(dl, 'navy', 4, 8) + L(dl, OL, LW)
            wkn = (g.legw(s, ky)[1] - g.legw(s, ky)[0]) / 2 + 8
            kp = smooth_path([(kx - wkn, ky - 10), (kx, ky - 30), (kx + wkn, ky - 10), (kx + wkn - 4, ky + 18), (kx, ky + 30), (kx - wkn + 4, ky + 18)], k=.35)
            leg += P(kp, G('steel', 'rg')) + bevel(kp, 'steel', 4, 6) + L(kp, OL, LW) + rivet(kx, ky, 5, 'silver')
            out['leg' + s] = leg
        out['pit'] = MAT['blue'][2]
        return out

    if t == 3:
        # ── 룬 갑옷 — 검은 강철 판 · 금 테 · 보랏빛 룬 · 사슬 치마 + 보라 앞자락
        bot = hem + 18
        x0, x1 = g.torso(hem - 6)
        sk_pts, _ = torso_outline(g, 'round', pad=5, bottom=bot, flare=20,
                                  hem_pts=hem_zigzag(x0 - 25, x1 + 25, bot, 12, 6))
        dsk = smooth_path(sk_pts, k=0.3)
        body += P(dsk, 'url(#mailD)')
        # 보라 앞자락(가운데) · 금 테
        pw = 34
        apron = [(cx - pw, wy + 10), (cx + pw, wy + 10), (cx + pw + 6, bot + 4), (cx, bot + 26), (cx - pw - 6, bot + 4)]
        da = smooth_path(apron, k=.2)
        pc = MAT['purple']
        body += P(da, pc[0]) + clip(f'ar3p{g.name}', da, F(poly_path([(cx + 8, 0), (W, 0), (W, H), (cx + 12, H)]), pc[2], .7)
                                  + L(smooth_path(apron, k=.2), MAT['gold'][0], 10, 1))
        body += L(da, OL, 4)
        body += glow_line(f'M{cx} {wy + 40} L{cx} {bot - 6} M{cx - 12} {wy + 64} L{cx + 12} {wy + 64} M{cx - 9} {bot - 26} L{cx} {bot - 14} L{cx + 9} {bot - 26}', GEM['purple'][2], 3)
        # 흉갑
        pb = wy + 12
        l1, r1 = g.torso(pb)
        bp_pts, _ = torso_outline(g, 'high', pad=10, bottom=pb, flare=0, extra_top=4,
                                  hem_pts=[(r1 + 10, pb - 12), (cx + 30, pb + 4), (cx, pb + 20), (cx - 30, pb + 4), (l1 - 10, pb - 12)])
        db = smooth_path(bp_pts, k=0.3)
        dc = MAT['dark']
        body += P(db, G('dark'))
        inner = F(poly_path([(0, 0), (cx - 40, 0), (cx - 44, H), (0, H)]), dc[1], .5)
        inner += F(poly_path([(cx + 30, 0), (W, 0), (W, H), (cx + 34, H)]), dc[2], .8)
        # 가슴 두 판(대흉근)
        cy_ = col_y + 62
        for sx in (-1, 1):
            pec = [(cx + sx * 6, col_y + 26), (cx + sx * 70, col_y + 30), (cx + sx * 84, cy_ + 10), (cx + sx * 50, cy_ + 34), (cx + sx * 8, cy_ + 26)]
            inner += L(smooth_path(pec, k=.35), MAT['gold'][2], 6, 1) + L(smooth_path(pec, k=.35), MAT['gold'][1], 2, .9)
        # 배 판 세 줄
        for k in range(3):
            yy = cy_ + 44 + k * 22
            la, ra = g.torso(yy)
            inner += L(f'M{la - 12} {yy} Q{cx} {yy + 12} {ra + 12} {yy}', MAT['gold'][2], 5, 1)
            inner += L(f'M{la - 12} {yy - 2} Q{cx} {yy + 10} {ra + 12} {yy - 2}', MAT['gold'][1], 1.6, .9)
        # 룬 — 가슴 옆 두 줄
        for sx in (-1, 1):
            rx = cx + sx * 52
            inner += glow_line(f'M{rx} {cy_ - 22} L{rx + sx * 8} {cy_ - 8} L{rx} {cy_ + 6} M{rx - sx * 10} {cy_ - 14} L{rx + sx * 4} {cy_ - 14}', GEM['purple'][2], 3)
        inner += L(db, MAT['gold'][0], 12, 1)
        inner += L(db, MAT['gold'][1], 3, .8, 'transform="translate(-1 -1)"')
        body += clip(f'ar3b{g.name}', db, inner) + bevel(db, 'dark', 6, 10) + L(db, OL, LW)
        body += gem(cx, cy_ + 6, 13, 'purple', shape='diamond')
        out['torso'] = body
        # 소매 — 검은 사슬 + 금 팔찌
        for s in 'LR':
            h0 = r[s]['armhole'][0][1] + 14
            da_ = smooth_path(arm_band(g, s, h0, ey[s] - 4, pad=4), k=.3)
            yb = ey[s] - 22
            al_, ar_ = g.armw(s, yb)
            band = poly_path([(al_ - 6, yb - 10), (ar_ + 6, yb - 10), (ar_ + 6, yb + 8), (al_ - 6, yb + 8)])
            out['arm' + s] = (P(da_, 'url(#mailD)') + P(band, MAT['gold'][0], 3)
                              + F(poly_path([(al_ - 6, yb - 10), (ar_ + 6, yb - 10), (ar_ + 6, yb - 4), (al_ - 6, yb - 4)]), MAT['gold'][1], .8))
        for s in 'LR':
            top = g.rig['leg' + s]['hem'] - 90
            dl = smooth_path(leg_shape(g, s, top, ank[s][1] + 4, pad=3), k=0.3)
            lc = ('#2e2f40', '#474a63', '#1f2030', '#141520')
            kx = sum(g.legw(s, knee[s][1])) / 2
            ky = knee[s][1]
            inner = F(poly_path([(0, 0), (kx - 18, 0), (kx - 22, H), (0, H)]), lc[1], .45)
            leg = P(dl, G('darkcloth')) + clip(f'ar3l{s}{g.name}', dl, inner) + bevel(dl, 'darkcloth', 4, 8) + L(dl, OL, LW)
            # 허벅지 판
            ty0 = g.rig['leg' + s]['hem'] - 20
            tl_, tr_ = g.legw(s, ty0 + 30)
            thigh = smooth_path([(tl_ - 6, ty0), (tr_ + 6, ty0), (tr_ + 7, ky - 34), (kx, ky - 22), (tl_ - 7, ky - 34)], k=.25)
            leg += P(thigh, dc[0]) + clip(f'ar3th{s}{g.name}', thigh, F(poly_path([(0, 0), (kx - 6, 0), (kx - 10, H), (0, H)]), dc[1], .55)
                                       + L(thigh, MAT['gold'][0], 8, 1))
            wkn = (g.legw(s, ky)[1] - g.legw(s, ky)[0]) / 2 + 9
            kp = smooth_path([(kx - wkn, ky - 8), (kx, ky - 30), (kx + wkn, ky - 8), (kx + wkn - 4, ky + 20), (kx, ky + 34), (kx - wkn + 4, ky + 20)], k=.35)
            leg += P(kp, MAT['gold'][0]) + clip(f'ar3k{s}{g.name}', kp, F(poly_path([(0, 0), (kx - 4, 0), (kx - 8, H), (0, H)]), MAT['gold'][1], .6)
                                              + F(poly_path([(kx + 8, 0), (W, 0), (W, H), (kx + 10, H)]), MAT['gold'][2], .6))
            leg += gem(kx, ky + 2, 6, 'purple')
            out['leg' + s] = leg
        out['pit'] = MAT['dark'][2]
        return out

    # ── 용비늘 성갑 — 붉은 비늘 · 금 갈비 판 · 가슴의 붉은 용안 · 비늘 치마
    bot = hem + 22
    x0, x1 = g.torso(hem - 6)
    sk_pts, (bl, br, by) = torso_outline(g, 'round', pad=6, bottom=bot, flare=26,
                                         hem_pts=hem_scallop(x0 - 32, x1 + 32, bot - 6, 7, 22))
    dsk = smooth_path(sk_pts, k=0.25)
    body += P(dsk, 'url(#scalesBig)')
    body += clip(f'ar4s{g.name}', dsk, F(poly_path([(cx + 40, 0), (W, 0), (W, H), (cx + 60, H)]), MAT['scale'][3], .35)
                 + L(hem_path := poly_path(hem_scallop(x0 - 32, x1 + 32, bot - 6, 7, 22), closed=False), MAT['gold'][0], 12, 1)
                 + L(hem_path, MAT['gold'][1], 3, .9, 'transform="translate(0 -3)"'))
    body += L(dsk, OL, LW)
    # 몸통 비늘
    pb = wy + 16
    l1, r1 = g.torso(pb)
    bp_pts, _ = torso_outline(g, 'high', pad=10, bottom=pb, flare=0, extra_top=6,
                              hem_pts=[(r1 + 10, pb - 10), (cx + 36, pb + 2), (cx, pb + 22), (cx - 36, pb + 2), (l1 - 10, pb - 10)])
    db = smooth_path(bp_pts, k=0.3)
    body += P(db, 'url(#scales)')
    inner = F(poly_path([(0, 0), (cx - 60, 0), (cx - 64, H), (0, H)]), '#ff8a8a', .18)
    inner += F(poly_path([(cx + 40, 0), (W, 0), (W, H), (cx + 44, H)]), MAT['scale'][3], .45)
    # 금 갈비 판 — 가운데 능선 + 세 쌍
    cy_ = col_y + 70
    gc = MAT['gold']
    ridge = f'M{cx} {col_y + 4} L{cx} {pb + 14}'
    inner += L(ridge, gc[2], 16, 1) + L(ridge, gc[0], 11, 1) + L(ridge, gc[1], 3, .9, 'transform="translate(-2 0)"')
    for k in range(3):
        yy = col_y + 40 + k * 30
        for sx in (-1, 1):
            la, ra = g.torso(yy + 20)
            ex = (la - 6) if sx < 0 else (ra + 6)
            rib = f'M{cx + sx * 6} {yy} Q{cx + sx * 48} {yy - 6} {ex} {yy + 24 + k * 4}'
            inner += L(rib, gc[3], 13, 1) + L(rib, gc[0], 9, 1) + L(rib, gc[1], 2.5, .9)
    inner += L(db, gc[0], 14, 1) + L(db, gc[1], 3, .9)
    body += clip(f'ar4b{g.name}', db, inner) + bevel(db, 'scale', 6, 10) + L(db, OL, LW)
    # 용안 — 금 발톱 틀 + 붉은 보석
    for sx in (-1, 1):
        claw = f'M{cx + sx * 4} {cy_ - 24} Q{cx + sx * 30} {cy_ - 20} {cx + sx * 26} {cy_ + 4} Q{cx + sx * 24} {cy_ + 20} {cx + sx * 6} {cy_ + 26}'
        body += L(claw, OL, 11) + L(claw, gc[0], 7) + L(claw, gc[1], 2, .9)
    body += gem(cx, cy_, 16, 'red')
    body += f'<ellipse cx="{cx}" cy="{cy_}" rx="3.5" ry="11" fill="#2a0306"/>'
    out['torso'] = body
    for s in 'LR':
        h0 = r[s]['armhole'][0][1] + 14
        da_ = smooth_path(arm_band(g, s, h0, ey[s] - 4, pad=4), k=.3)
        yb = ey[s] - 20
        al_, ar_ = g.armw(s, yb)
        band = poly_path([(al_ - 7, yb - 11), (ar_ + 7, yb - 11), (ar_ + 7, yb + 9), (al_ - 7, yb + 9)])
        out['arm' + s] = (P(da_, 'url(#scales)') + P(band, gc[0], 3)
                          + F(poly_path([(al_ - 7, yb - 11), (ar_ + 7, yb - 11), (ar_ + 7, yb - 5), (al_ - 7, yb - 5)]), gc[1], .8)
                          + gem((al_ + ar_) / 2, yb - 1, 5, 'red', glow=False))
    for s in 'LR':
        top = g.rig['leg' + s]['hem'] - 90
        dl = smooth_path(leg_shape(g, s, top, ank[s][1] + 4, pad=4), k=0.3)
        kx = sum(g.legw(s, knee[s][1])) / 2
        ky = knee[s][1]
        leg = P(dl, G('darkcloth')) + clip(f'ar4l{s}{g.name}', dl, L(f'M{kx} {top} L{kx - 2} {ank[s][1]}', MAT['crimson'][1], 3, .7)) + bevel(dl, 'darkcloth', 4, 8) + L(dl, OL, LW)
        wkn = (g.legw(s, ky)[1] - g.legw(s, ky)[0]) / 2 + 10
        kp = smooth_path([(kx - wkn, ky - 8), (kx, ky - 32), (kx + wkn, ky - 8),
                          (kx + wkn - 4, ky + 22), (kx, ky + 36), (kx - wkn + 4, ky + 22)], k=.35)
        horn = smooth_path([(kx - 9, ky - 18), (kx - 4, ky - 50), (kx + 10, ky - 68), (kx + 4, ky - 40), (kx + 9, ky - 16)], k=.3)
        leg += PB(horn, G('gold'), 'gold', k=3, bw=5)
        leg += P(kp, gc[0]) + clip(f'ar4k{s}{g.name}', kp, F(poly_path([(0, 0), (kx - 4, 0), (kx - 8, H), (0, H)]), gc[1], .6)
                                     + F(poly_path([(kx + 8, 0), (W, 0), (W, H), (kx + 10, H)]), gc[2], .6))
        leg += gem(kx, ky + 4, 6, 'red')
        out['leg' + s] = leg
    out['pit'] = MAT['scale'][3]
    return out



# ─────────────────────────────────────────────────────────────
# 투구
# ─────────────────────────────────────────────────────────────
CLEAN = {'m1': 'm1', 'f1': 'f1', 'm2': 'm1', 'f2': 'f1'}      # 거친 차림은 깨끗한 차림과 자세가 같다


def head_geo(g):
    c = geo(CLEAN[g.name])
    fx0, fy0, fx1, fy1 = c.face_box
    cxh = (fx0 + fx1) / 2
    eye_y = (c.brow_y + fy1) / 2 - 6
    return {
        'cx': cxh, 'top': c.hair_top - 8, 'brim': eye_y - 46, 'x0': fx0 - 12, 'x1': fx1 + 12,
        'eye': eye_y, 'chin': fy1,
    }


def dome_path(h, lift=0, widen=0, brim_dip=18):
    x0, x1, cx, top, b = h['x0'] - widen, h['x1'] + widen, h['cx'], h['top'] - lift, h['brim']
    pts = [(x0, b + brim_dip), (x0 - 6, b - 44), (x0 + 12, top + 52), (cx - 64, top + 8), (cx, top),
           (cx + 64, top + 8), (x1 - 12, top + 52), (x1 + 6, b - 44), (x1, b + brim_dip),
           (cx + 72, b + 4), (cx, b), (cx - 72, b + 4)]
    return smooth_path(pts, k=0.45)


def helmet(g, t):
    h = head_geo(g)
    cx, top, b, x0, x1 = h['cx'], h['top'], h['brim'], h['x0'], h['x1']
    out = ''
    if t == 0:
        # 천 두건 — 머리를 감싼 천 + 오른쪽 매듭과 두 가닥
        d = dome_path(h, lift=-4, widen=4, brim_dip=10)
        c = MAT['cloth']
        out += P(d, G('cloth'))
        inner = L(f'M{x0 + 30} {top + 60} Q{cx} {top + 20} {x1 - 20} {top + 70}', c[3], 3, .6)
        inner += L(f'M{x0 + 50} {b - 40} Q{cx} {b - 70} {x1 - 40} {b - 36}', c[3], 3, .5)
        inner += F(poly_path([(0, b - 20), (W, b - 20), (W, H), (0, H)]), MAT['rag'][0], 1)
        inner += L(f'M0 {b - 20} L{W} {b - 20}', MAT['rag'][3], 3)
        inner += L(f'M0 {b - 8} L{W} {b - 8}', MAT['rag'][1], 2, .8, 'stroke-dasharray="6 5"')
        out += clip(f'hm0{g.name}', d, inner) + bevel(d, 'cloth', 5, 9) + L(d, OL, LW)
        kx, ky = x1 - 2, b - 6
        tail1 = smooth_path([(kx, ky), (kx + 26, ky + 24), (kx + 36, ky + 70), (kx + 18, ky + 64), (kx + 8, ky + 22)], k=.4)
        tail2 = smooth_path([(kx, ky), (kx + 34, ky + 6), (kx + 58, ky + 40), (kx + 42, ky + 44), (kx + 18, ky + 16)], k=.4)
        out += P(tail1, MAT['rag'][0], 4) + P(tail2, MAT['cloth'][0], 4)
        out += f'<ellipse cx="{kx}" cy="{ky}" rx="15" ry="12" fill="{MAT["rag"][0]}" stroke="{OL}" stroke-width="4"/>'
        return {'head': out}
    if t == 1:
        # 가죽 모자 — 둥근 가죽 모자 · 말아 올린 챙 · 초록 깃
        d = dome_path(h, lift=2, widen=6, brim_dip=6)
        c = MAT['leather']
        feather = smooth_path([(x0 + 26, b - 24), (x0 - 6, top + 60), (x0 - 30, top + 6), (x0 - 18, top - 10), (x0 + 6, top + 30), (x0 + 36, b - 30)], k=.4)
        out += P(feather, G('green'), 4) + L(f'M{x0 + 30} {b - 26} Q{x0 - 8} {top + 50} {x0 - 22} {top}', MAT['green'][3], 2.5)
        out += P(d, G('leather'))
        inner = L(f'M{cx - 50} {b - 10} Q{cx - 40} {top + 30} {cx} {top + 2}', c[3], 3, .7)
        inner += L(f'M{cx + 50} {b - 10} Q{cx + 40} {top + 30} {cx} {top + 2}', c[3], 3, .7)
        inner += L(f'M{cx - 46} {b - 14} Q{cx - 36} {top + 34} {cx - 4} {top + 8}', c[1], 2, .8, 'stroke-dasharray="6 5"')
        inner += F(poly_path([(0, b - 24), (W, b - 24), (W, H), (0, H)]), MAT['leatherD'][0], 1)
        inner += L(f'M0 {b - 24} L{W} {b - 24}', MAT['leatherD'][3], 3)
        inner += L(f'M0 {b - 17} L{W} {b - 17}', MAT['leatherD'][1], 2, .9)
        out += clip(f'hm1{g.name}', d, inner) + bevel(d, 'leather', 5, 9) + L(d, OL, LW)
        out += rivet(cx, top + 10, 6, 'iron')
        return {'head': out}
    if t == 2:
        # 기사 투구 — 강철 · 가운데 능선 · 볼가리개 · 파란 깃털 장식
        sc = MAT['steel']
        plume = smooth_path([(cx - 16, top + 16), (cx - 26, top - 30), (cx - 4, top - 74), (cx + 36, top - 90),
                             (cx + 64, top - 70), (cx + 40, top - 56), (cx + 24, top - 20), (cx + 18, top + 16)], k=.4)
        out += P(plume, G('blue'), 4)
        for k in range(4):
            out += L(f'M{cx - 8 + k * 10} {top + 6} Q{cx - 6 + k * 14} {top - 40} {cx + 16 + k * 12} {top - 70 + k * 8}', MAT['blue'][3], 2.5, .8)
        for sx in (-1, 1):
            xa = x0 if sx < 0 else x1
            guard = smooth_path([(xa - sx * 2, b - 6), (xa + sx * 6, b + 62), (xa - sx * 22, b + 86), (xa - sx * 34, b + 30), (xa - sx * 30, b - 4)], k=.35)
            out += PB(guard, G('steel'), 'steel', k=4, bw=6) + rivet(xa - sx * 14, b + 44, 4.5, 'silver')
        d = dome_path(h, lift=6, widen=8, brim_dip=8)
        out += P(d, G('steel', 'rg'))
        inner = F(poly_path([(cx - 7, 0), (cx + 7, 0), (cx + 7, H), (cx - 7, H)]), sc[1], .9)
        inner += L(f'M{cx + 8} {top} L{cx + 8} {b}', sc[3], 2, .7)
        inner += F(poly_path([(0, b - 22), (W, b - 22), (W, H), (0, H)]), MAT['silver'][0], 1)
        inner += L(f'M0 {b - 22} L{W} {b - 22}', MAT['silver'][3], 2.5)
        for k in range(7):
            inner += rivet(x0 + 14 + k * (x1 - x0 - 28) / 6, b - 11, 4, 'steel')
        out += clip(f'hm2{g.name}', d, inner) + bevel(d, 'steel', 6, 10) + L(d, OL, LW)
        return {'head': out}
    if t == 3:
        # 룬 투구 — 검은 강철 · 금 테 · 휜 뿔 · 이마의 보랏빛 룬 보석
        dc, gc = MAT['dark'], MAT['gold']
        for sx in (-1, 1):
            xa = x0 if sx < 0 else x1
            horn = smooth_path([(xa + sx * 4, b - 30), (xa + sx * 30, b - 58), (xa + sx * 56, top + 10), (xa + sx * 50, top - 50),
                                (xa + sx * 34, top - 70), (xa + sx * 36, top - 20), (xa + sx * 20, top + 40), (xa - sx * 8, b - 62)], k=.35)
            out += PB(horn, G('dark'), 'dark', k=4, bw=6)
            tip = smooth_path([(xa + sx * 52, top - 30), (xa + sx * 50, top - 50), (xa + sx * 34, top - 70), (xa + sx * 38, top - 36)], k=.3)
            out += P(tip, G('gold'), 3)
            for k in range(3):
                yy = b - 44 - k * 30
                out += L(f'M{xa + sx * (10 + k * 14)} {yy} l{sx * 16} {-6}', gc[0], 3, .9)
            guard = smooth_path([(xa - sx * 2, b - 6), (xa + sx * 6, b + 64), (xa - sx * 24, b + 90), (xa - sx * 36, b + 30), (xa - sx * 30, b - 4)], k=.35)
            out += PB(guard, G('dark'), 'dark', k=4, bw=6) + L(guard, gc[0], 3, .9)
        d = dome_path(h, lift=8, widen=8, brim_dip=8)
        out += P(d, G('dark', 'rg'))
        inner = L(f'M{cx} {top + 4} L{cx} {b - 20}', gc[0], 8, 1) + L(f'M{cx - 2} {top + 4} L{cx - 2} {b - 20}', gc[1], 2, .9)
        inner += F(poly_path([(0, b - 24), (W, b - 24), (W, H), (0, H)]), gc[0], 1)
        inner += L(f'M0 {b - 24} L{W} {b - 24}', gc[3], 2.5) + L(f'M0 {b - 20} L{W} {b - 20}', gc[1], 2, .9)
        for sx in (-1, 1):
            inner += glow_line(f'M{cx + sx * 24} {b - 44} L{cx + sx * 40} {b - 60} L{cx + sx * 56} {b - 44}', GEM['purple'][2], 3)
        out += clip(f'hm3{g.name}', d, inner) + bevel(d, 'dark', 6, 10) + L(d, OL, LW)
        out += gem(cx, b - 30, 11, 'purple', shape='diamond')
        return {'head': out}
    # 용비늘 투구 — 붉은 비늘 · 금 볏 · 뒤로 뻗은 날개 뿔 · 이마의 용안
    gc = MAT['gold']
    for sx in (-1, 1):
        xa = x0 if sx < 0 else x1
        wing = smooth_path([(xa + sx * 2, b - 20), (xa + sx * 40, b - 30), (xa + sx * 92, top + 30), (xa + sx * 100, top - 40),
                            (xa + sx * 70, top + 6), (xa + sx * 76, top - 60), (xa + sx * 44, top + 12), (xa + sx * 34, top - 34),
                            (xa + sx * 14, top + 40), (xa - sx * 10, b - 60)], k=.3)
        out += PB(wing, G('scale'), 'scale', k=4, bw=7)
        out += L(f'M{xa + sx * 4} {b - 26} Q{xa + sx * 60} {top + 60} {xa + sx * 100} {top - 40}', gc[0], 6, 1)
        out += L(f'M{xa + sx * 10} {b - 40} Q{xa + sx * 50} {top + 40} {xa + sx * 76} {top - 60}', gc[0], 4, 1)
        out += L(f'M{xa + sx * 10} {b - 50} Q{xa + sx * 30} {top + 30} {xa + sx * 34} {top - 34}', gc[0], 3.5, 1)
        guard = smooth_path([(xa - sx * 2, b - 6), (xa + sx * 8, b + 64), (xa - sx * 24, b + 92), (xa - sx * 38, b + 30), (xa - sx * 30, b - 4)], k=.35)
        out += PB(guard, G('gold'), 'gold', k=4, bw=6) + L(f'M{xa - sx * 6} {b + 20} l{-sx * 16} {30}', gc[2], 3, .8)
    fin = smooth_path([(cx - 14, top + 20), (cx - 10, top - 40), (cx + 2, top - 70), (cx + 10, top - 34), (cx + 16, top - 56), (cx + 22, top - 20), (cx + 16, top + 20)], k=.3)
    out += P(fin, G('gold'), 4)
    d = dome_path(h, lift=8, widen=8, brim_dip=8)
    out += P(d, 'url(#scales)')
    inner = F(poly_path([(cx + 30, 0), (W, 0), (W, H), (cx + 40, H)]), MAT['scale'][3], .4)
    inner += F(poly_path([(0, b - 26), (W, b - 26), (W, H), (0, H)]), gc[0], 1)
    inner += L(f'M0 {b - 26} L{W} {b - 26}', gc[3], 2.5) + L(f'M0 {b - 22} L{W} {b - 22}', gc[1], 2, .9)
    inner += L(f'M{cx} {top} L{cx} {b - 26}', gc[0], 10, 1) + L(f'M{cx - 2} {top} L{cx - 2} {b - 26}', gc[1], 2.5, .9)
    out += clip(f'hm4{g.name}', d, inner) + bevel(d, 'scale', 6, 10) + L(d, OL, LW)
    for sx in (-1, 1):
        out += L(f'M{cx + sx * 6} {b - 50} Q{cx + sx * 26} {b - 46} {cx + sx * 22} {b - 26}', OL, 9) + L(f'M{cx + sx * 6} {b - 50} Q{cx + sx * 26} {b - 46} {cx + sx * 22} {b - 26}', gc[0], 5)
    out += gem(cx, b - 34, 12, 'red')
    out += f'<ellipse cx="{cx}" cy="{b - 34}" rx="2.6" ry="8" fill="#2a0306"/>'
    return {'head': out}


# ─────────────────────────────────────────────────────────────
# 어깨 — 어깨받이(따로 도는 층) + 망토(몸 뒤)
# ─────────────────────────────────────────────────────────────
def pad_geo(g, s):
    c = geo(CLEAN[g.name])
    r = c.rig
    hole = r[s]['armhole'][0]
    shy = r[s]['shoulder'][1]
    al, ar = c.armw(s, shy - 16)
    cxp = (al + ar) / 2 + (-6 if s == 'L' else 6)
    top = hole[1] - 4
    bot = shy + 22
    hw = (ar - al) / 2 + 13
    return cxp, top, bot, hw, (1 if s == 'L' else -1)   # o: 바깥쪽이 −x 이면 1


def pad_shape(cxp, top, bot, hw, o, scale=1.0):
    """o=1 → 왼어깨(바깥이 왼쪽)."""
    hw *= scale
    pts = [(cxp + o * hw * .6, top + 14), (cxp, top), (cxp - o * hw * .8, top + 16), (cxp - o * (hw + 6), top + (bot - top) * .55),
           (cxp - o * (hw + 2), bot - 4), (cxp - o * hw * .3, bot + 6), (cxp + o * hw * .5, bot - 6), (cxp + o * hw * .8, top + (bot - top) * .5)]
    return smooth_path(pts, k=.45)


def lame(cxp, y, hw, o, dy=10):
    return f'M{cxp + o * hw * .75} {y - dy * .4} Q{cxp - o * hw * .1} {y + dy} {cxp - o * (hw + 5)} {y - dy * .2}'


def cape(g, t):
    c = geo(CLEAN[g.name])
    r = c.rig
    hl, hr = r['L']['armhole'][0], r['R']['armhole'][0]
    ytop = hl[1] + 2
    length = {2: g.hem_y + 50, 3: r['legL']['knee'][1] + 90, 4: r['legL']['ankle'][1] - 6}[t]
    mat, edge = {2: ('blue', 'silver'), 3: ('purple', 'gold'), 4: ('crimson', 'gold')}[t]
    spread = {2: 150, 3: 172, 4: 196}[t]
    cx = g.cx
    pts = [(hl[0] + 10, ytop), (cx, ytop - 6), (hr[0] - 10, ytop), (hr[0] + 50, ytop + 60), (cx + spread * .8, (ytop + length) / 2),
           (cx + spread, length - 8)]
    n = 6
    for i in range(1, n):
        x = cx + spread - 2 * spread * i / n
        pts.append((x, length + (14 if i % 2 else -4)))
    pts += [(cx - spread, length - 8), (cx - spread * .8, (ytop + length) / 2), (hl[0] - 50, ytop + 60)]
    d = smooth_path(pts, k=.4)
    mc = MAT[mat]
    out = P(d, G(mat))
    inner = ''
    for k, xx in enumerate((-0.62, -0.3, 0.3, 0.62)):
        inner += L(f'M{cx + xx * spread * .5} {ytop + 60} Q{cx + xx * spread * .85} {length - 120} {cx + xx * spread * 1.05} {length}', mc[3], 5, .5)
    inner += F(poly_path([(cx - 120, 0), (cx + 120, 0), (cx + 150, H), (cx - 150, H)]), mc[3], .45)
    out += clip(f'cp{t}{g.name}', d, inner)
    out += L(d, MAT[edge][0], 12, 1) + L(d, MAT[edge][1], 3, .9) + L(d, OL, 4)
    return out


def shoulder(g, t):
    out = {}
    for s in 'LR':
        cxp, top, bot, hw, o = pad_geo(g, s)
        sv = ''
        if t == 0:
            d = pad_shape(cxp, top + 6, bot - 6, hw - 4, o)
            sv += P(d, G('cloth', 'rg'))
            sv += clip(f'pd0{s}{g.name}', d, f'<rect width="{W}" height="{H}" fill="url(#quilt)"/>')
            sv += bevel(d, 'cloth', 5, 9) + L(d, OL, LW)
            sv += L(f'M{cxp + o * hw * .5} {top + 20} L{cxp + o * (hw + 20)} {top + 40}', MAT['rope'][3], 6) + L(f'M{cxp + o * hw * .5} {top + 20} L{cxp + o * (hw + 20)} {top + 40}', MAT['rope'][1], 3)
        elif t == 1:
            d = pad_shape(cxp, top + 2, bot - 2, hw, o)
            sv += P(d, G('leather', 'rg'))
            sv += clip(f'pd1{s}{g.name}', d, L(lame(cxp, bot - 16, hw, o), MAT['leather'][3], 4) + L(lame(cxp, bot - 22, hw - 6, o), MAT['leather'][1], 2, .9, 'stroke-dasharray="5 5"'))
            sv += bevel(d, 'leather', 5, 9) + L(d, OL, LW) + rivet(cxp - o * 4, top + 26, 5, 'iron')
            sv += P(poly_path([(cxp + o * hw * .5, top + 36), (cxp + o * (hw + 24), top + 44), (cxp + o * (hw + 22), top + 56), (cxp + o * hw * .5, top + 50)]), MAT['leatherD'][0], 3)
        elif t == 2:
            trim = pad_shape(cxp, top + 16, bot + 12, hw + 2, o)
            sv += P(trim, G('blue'))
            for k, (dy, sc_) in enumerate(((0, 1.0),)):
                d = pad_shape(cxp, top, bot, hw, o)
                sv += P(d, G('steel', 'rg'))
                inner = ''
                for j, yy in enumerate((top + (bot - top) * .45, top + (bot - top) * .68, top + (bot - top) * .88)):
                    inner += L(lame(cxp, yy, hw, o), MAT['steel'][3], 4) + L(lame(cxp, yy + 4, hw, o), MAT['steel'][1], 2, .8)
                sv += clip(f'pd2{s}{g.name}', d, inner) + bevel(d, 'steel', 5, 9) + L(d, OL, LW)
                sv += rivet(cxp - o * 6, top + 24, 5, 'silver') + rivet(cxp - o * (hw - 4), top + (bot - top) * .45, 4, 'silver')
        elif t == 3:
            spike = smooth_path([(cxp - o * 6, top + 22), (cxp - o * 30, top - 36), (cxp - o * 44, top - 60), (cxp - o * 32, top - 18), (cxp - o * 26, top + 18)], k=.3)
            sv += P(spike, G('gold'), 4)
            d = pad_shape(cxp, top, bot + 4, hw + 4, o)
            sv += P(d, G('dark', 'rg'))
            inner = L(lame(cxp, top + (bot - top) * .6, hw + 4, o, 12), MAT['gold'][0], 7) + L(lame(cxp, top + (bot - top) * .6 - 2, hw + 4, o, 12), MAT['gold'][1], 2, .9)
            inner += L(d, MAT['gold'][0], 10) + L(d, MAT['gold'][1], 2.5, .9)
            inner += glow_line(f'M{cxp + o * 10} {top + 26} L{cxp - o * 6} {top + 40} L{cxp + o * 4} {top + 54}', GEM['purple'][2], 3)
            sv += clip(f'pd3{s}{g.name}', d, inner) + bevel(d, 'dark', 5, 9) + L(d, OL, LW)
            sv += gem(cxp - o * (hw - 8), top + (bot - top) * .66, 6, 'purple')
        else:
            for k, (dy, sc_) in enumerate(((22, .92), (0, 1.0))):
                horn = smooth_path([(cxp - o * (8 + k * 18), top + 18), (cxp - o * (26 + k * 22), top - 40 + k * 20), (cxp - o * (60 + k * 16), top - 70 + k * 26),
                                    (cxp - o * (42 + k * 20), top - 30 + k * 20), (cxp - o * (28 + k * 18), top + 16)], k=.3)
                sv += P(horn, G('gold'), 4)
            for k, (dy, sc_) in enumerate(((26, 1.05), (12, 1.0), (0, .92))):
                d = pad_shape(cxp, top + dy, bot + dy * .6, hw + 6, o, sc_)
                sv += P(d, 'url(#scalesBig)')
                sv += clip(f'pd4{k}{s}{g.name}', d, L(d, MAT['gold'][0], 12) + L(d, MAT['gold'][1], 3, .9)
                           + F(poly_path([(cxp - o * 200, 0), (cxp + o * 6, 0), (cxp + o * 6, H), (cxp - o * 200, H)]), MAT['scale'][3], .0))
                sv += L(d, OL, 4)
            sv += gem(cxp - o * 4, top + 20, 7, 'red')
        out['pad' + s] = sv
    if t >= 2:
        out['cape'] = cape(g, t)
    return out


# ─────────────────────────────────────────────────────────────
# 허리띠 · 목걸이
# ─────────────────────────────────────────────────────────────
def belt(g, t):
    cx = g.cx
    by = g.waist_y + 4
    xl, xr = g.torso(by)
    xl -= 14
    xr += 14
    hh = 13 if t < 2 else 15
    top = [(xl, by - hh), (cx, by - hh + 5), (xr, by - hh)]
    bot = [(xr, by + hh), (cx, by + hh + 5), (xl, by + hh)]
    d = smooth_path(top + bot, k=.3)
    out = ''
    if t == 0:
        # 가죽 허리띠 — 매듭으로 묶은 가죽끈
        out += PB(d, G('hide'), 'hide', k=3, bw=5) + clip(f'bt0{g.name}', d, L(f'M{xl} {by - hh + 5} Q{cx} {by - hh + 10} {xr} {by - hh + 5}', MAT['hide'][1], 2, .8, 'stroke-dasharray="6 6"'))
        kx = cx - 30
        out += P(smooth_path([(kx, by - 4), (kx - 18, by + 26), (kx - 10, by + 52), (kx - 2, by + 30), (kx + 6, by + 4)], k=.4), MAT['hide'][0], 4)
        out += P(smooth_path([(kx, by - 4), (kx + 12, by + 30), (kx + 26, by + 46), (kx + 20, by + 20), (kx + 10, by)], k=.4), MAT['hide'][2], 4)
        out += f'<ellipse cx="{kx}" cy="{by}" rx="12" ry="11" fill="{MAT["hide"][0]}" stroke="{OL}" stroke-width="4"/>'
        return {'torso': out}
    if t == 1:
        # 주머니 허리띠 — 네모 쇠 버클 · 왼허리 주머니
        out += PB(d, G('leather'), 'leather', k=3, bw=5) + clip(f'bt1{g.name}', d, L(f'M{xl} {by - hh + 4} Q{cx} {by - hh + 9} {xr} {by - hh + 4}', MAT['leather'][1], 2, .9, 'stroke-dasharray="6 5"')
                                           + L(f'M{xl} {by + hh - 4} Q{cx} {by + hh + 1} {xr} {by + hh - 4}', MAT['leather'][1], 2, .9, 'stroke-dasharray="6 5"'))
        px = xl + 22
        pouch = smooth_path([(px - 26, by - 4), (px + 26, by - 4), (px + 28, by + 44), (px, by + 54), (px - 28, by + 44)], k=.35)
        out += P(pouch, G('leatherD')) + P(smooth_path([(px - 28, by - 8), (px + 28, by - 8), (px + 24, by + 20), (px, by + 26), (px - 24, by + 20)], k=.35), G('leather'), 4)
        out += L(f'M{px - 18} {by + 4} Q{px} {by + 14} {px + 18} {by + 4}', MAT['green'][1], 2.5, 1, 'stroke-dasharray="4 4"') + rivet(px, by + 16, 4, 'iron')
        out += P(poly_path([(cx - 18, by - hh - 3), (cx + 18, by - hh - 3), (cx + 18, by + hh + 7), (cx - 18, by + hh + 7)]), 'none', 7, f'stroke="{MAT["iron"][2]}"')
        out += L(poly_path([(cx - 18, by - hh - 3), (cx + 18, by - hh - 3), (cx + 18, by + hh + 7), (cx - 18, by + hh + 7)]), MAT['iron'][1], 2.5, .9)
        out += L(f'M{cx} {by - hh} L{cx} {by + hh + 4}', MAT['iron'][2], 4)
        return {'torso': out}
    if t == 2:
        # 마력의 허리띠 — 은 징 · 은 버클에 파란 보석
        out += PB(d, G('leatherD'), 'leatherD', k=3, bw=5)
        inner = ''
        for k in range(12):
            x = xl + 12 + k * (xr - xl - 24) / 11
            if abs(x - cx) < 34:
                continue
            inner += rivet(x, by + 2 + 5 * (1 - ((x - cx) / (xr - xl) * 2) ** 2), 4, 'silver')
        out += clip(f'bt2{g.name}', d, inner)
        px = xr - 24
        pch = smooth_path([(px - 22, by), (px + 22, by), (px + 22, by + 44), (px, by + 52), (px - 22, by + 44)], k=.35)
        out += PB(pch, G('leatherD'), 'leatherD', k=3, bw=5)
        out += P(smooth_path([(px - 24, by - 4), (px + 24, by - 4), (px + 20, by + 18), (px, by + 24), (px - 20, by + 18)], k=.35), G('blue'), 3.5)
        out += rivet(px, by + 14, 4.5, 'silver')
        buckle = smooth_path([(cx - 30, by - hh - 6), (cx + 30, by - hh - 6), (cx + 34, by + 4), (cx + 26, by + hh + 10), (cx - 26, by + hh + 10), (cx - 34, by + 4)], k=.3)
        out += PB(buckle, G('silver', 'rg'), 'silver', k=3, bw=6)
        out += gem(cx, by + 3, 11, 'blue')
        return {'torso': out}
    if t == 3:
        # 룬 허리띠 — 검은 띠 · 금 판 · 둥근 룬 버클 · 금 사슬
        out += PB(d, G('dark'), 'dark', k=3, bw=5)
        inner = ''
        for k in range(6):
            x = xl + 20 + k * (xr - xl - 40) / 5
            if abs(x - cx) < 40:
                continue
            inner += P(poly_path([(x - 12, by - hh + 3), (x + 12, by - hh + 3), (x + 12, by + hh + 1), (x - 12, by + hh + 1)]), G('gold'), 2.5)
        out += clip(f'bt3{g.name}', d, inner + L(f'M{xl} {by - hh + 2} Q{cx} {by - hh + 7} {xr} {by - hh + 2}', MAT['gold'][0], 3))
        ch = f'M{xr - 30} {by + 10} Q{xr - 10} {by + 60} {xr + 14} {by + 16}'
        out += L(ch, MAT['gold'][2], 6, 1, 'stroke-dasharray="7 4"') + L(ch, MAT['gold'][1], 2.5, 1, 'stroke-dasharray="7 4"')
        out += f'<circle cx="{cx}" cy="{by + 3}" r="{hh + 12}" fill="{G("gold", "rg")}" stroke="{OL}" stroke-width="4"/>'
        out += f'<circle cx="{cx}" cy="{by + 3}" r="{hh + 3}" fill="{MAT["dark"][3]}" stroke="{OL}" stroke-width="3"/>'
        out += glow_line(f'M{cx - 10} {by - 6} L{cx} {by + 12} L{cx + 10} {by - 6} M{cx - 12} {by + 3} L{cx + 12} {by + 3}', GEM['purple'][2], 3)
        return {'torso': out}
    # 용의 허리띠 — 금 띠 · 용머리 버클(붉은 눈) · 앞에 드리운 비늘 자락
    flap = smooth_path([(cx - 34, by), (cx + 34, by), (cx + 40, by + 70), (cx, by + 92), (cx - 40, by + 70)], k=.25)
    out += P(flap, 'url(#scalesBig)') + L(flap, MAT['gold'][0], 7) + L(flap, OL, 4)
    out += PB(d, G('gold', 'lv'), 'gold', k=3, bw=5)
    out += clip(f'bt4{g.name}', d, L(f'M{xl} {by - hh + 4} Q{cx} {by - hh + 9} {xr} {by - hh + 4}', MAT['gold'][1], 3)
                + L(f'M{xl} {by + hh - 3} Q{cx} {by + hh + 2} {xr} {by + hh - 3}', MAT['gold'][3], 3))
    head = smooth_path([(cx - 34, by - hh - 10), (cx - 14, by - hh - 2), (cx, by - hh - 16), (cx + 14, by - hh - 2), (cx + 34, by - hh - 10),
                        (cx + 30, by + 12), (cx + 12, by + hh + 16), (cx, by + hh + 24), (cx - 12, by + hh + 16), (cx - 30, by + 12)], k=.25)
    out += PB(head, G('gold', 'rg'), 'gold', k=3, bw=6)
    out += gem(cx, by + 4, 10, 'red')
    out += f'<ellipse cx="{cx}" cy="{by + 4}" rx="2.4" ry="7" fill="#2a0306"/>'
    return {'torso': out}


def necklace(g, t):
    cx = g.cx
    ny = g.neck[1] + (16 if not g.female else 18)
    py = ny + (56 if not g.female else 60)
    cord = f'M{cx - 38} {ny - 4} Q{cx - 30} {py - 6} {cx} {py - 2} Q{cx + 30} {py - 6} {cx + 38} {ny - 4}'
    out = ''
    if t == 0:
        out += L(cord, OL, 5) + L(cord, MAT['rope'][0], 2.5)
        out += f'<circle cx="{cx}" cy="{py + 12}" r="14" fill="{G("wood", "rg")}" stroke="{OL}" stroke-width="3.5"/>'
        out += L(f'M{cx - 6} {py + 6} L{cx + 6} {py + 18} M{cx + 6} {py + 6} L{cx - 6} {py + 18}', MAT['wood'][3], 2.5)
    elif t == 1:
        out += L(cord, OL, 5) + L(cord, MAT['hide'][1], 2.5)
        for k, sx in enumerate((-1, 0, 1)):
            x = cx + sx * 16
            y = py - 3 + abs(sx) * -3
            out += P(smooth_path([(x - 5, y), (x + 5, y), (x + 1, y + 22 - abs(sx) * 5)], k=.2), G('bone'), 2.5)
        out += f'<circle cx="{cx - 30}" cy="{py - 12}" r="5" fill="{GEM["green"][0]}" stroke="{OL}" stroke-width="2"/>'
        out += f'<circle cx="{cx + 30}" cy="{py - 12}" r="5" fill="{GEM["green"][0]}" stroke="{OL}" stroke-width="2"/>'
    elif t == 2:
        out += L(cord, OL, 5) + L(cord, MAT['silver'][1], 2.5, 1, 'stroke-dasharray="4 2"')
        sh = [(cx - 16, py), (cx + 16, py), (cx + 15, py + 18), (cx, py + 32), (cx - 15, py + 18)]
        out += P(smooth_path(sh, k=.2), G('silver', 'rg'), 3.5) + gem(cx, py + 13, 7, 'blue')
    elif t == 3:
        out += L(cord, OL, 5) + L(cord, MAT['gold'][0], 3, 1, 'stroke-dasharray="5 2"')
        hexa = [(cx + 17 * math.cos(math.radians(a)), py + 16 + 17 * math.sin(math.radians(a))) for a in range(-90, 270, 60)]
        out += P(poly_path(hexa), G('dark'), 3.5) + L(poly_path(hexa), MAT['gold'][0], 3)
        out += glow_line(f'M{cx} {py + 4} L{cx} {py + 28} M{cx - 8} {py + 12} L{cx + 8} {py + 20}', GEM['purple'][2], 2.5)
    else:
        out += L(cord, OL, 6) + L(cord, MAT['gold'][0], 3.5, 1, 'stroke-dasharray="6 2"')
        for sx in (-1, 1):
            cl = f'M{cx + sx * 4} {py - 2} Q{cx + sx * 24} {py + 4} {cx + sx * 18} {py + 26} Q{cx + sx * 12} {py + 36} {cx + sx * 4} {py + 38}'
            out += L(cl, OL, 8) + L(cl, MAT['gold'][0], 4.5)
        out += gem(cx, py + 18, 11, 'red')
        out += f'<ellipse cx="{cx}" cy="{py + 18}" rx="2" ry="7" fill="#2a0306"/>'
    return {'torso': out}


# ─────────────────────────────────────────────────────────────
# 신발 — 발 모양(발가락까지 덮는 둥근 덮개) + 장화목
# ─────────────────────────────────────────────────────────────
def foot_hull(g, s):
    c = geo(g.name)
    ank = c.rig['leg' + s]['ankle'][1]
    m = c.leg[s].copy()
    m[:ank + 8] = False
    pts = np.column_stack(np.where(m)[::-1]).astype(np.int32)
    hull = cv2.convexHull(pts).reshape(-1, 2)
    # 조금 부풀린다(발가락이 삐져나오지 않게)
    cxh, cyh = hull.mean(0)
    out = [(x + (x - cxh) * .06, y + (y - cyh) * .05 + 1) for x, y in hull]
    return out, ank


def boots(g, t):
    r = g.rig
    out = {}
    for s in 'LR':
        foot, ank = foot_hull(g, s)
        knee = r['leg' + s]['knee'][1]
        topy = {0: ank - 16, 1: knee + 46, 2: knee + 34, 3: knee + 18, 4: knee + 40}[t]
        pad = {0: 5, 1: 7, 2: 7, 3: 8, 4: 9}[t]
        ys = list(range(int(topy), int(ank) + 24, 10))
        left = [(g.legw(s, y)[0] - pad - (4 if y == ys[0] and t in (1, 4) else 0), y) for y in ys]
        right = [(g.legw(s, y)[1] + pad + (4 if y == ys[0] and t in (1, 4) else 0), y) for y in ys]
        shaft = smooth_path(left + right[::-1], k=.3)
        fp = smooth_path(foot, k=.5)
        fx0 = min(x for x, y in foot)
        fx1 = max(x for x, y in foot)
        fyb = max(y for x, y in foot)
        mx = (fx0 + fx1) / 2
        kx = sum(g.legw(s, ank - 30)) / 2
        sv = ''
        mat = {0: 'hide', 1: 'leather', 2: 'steel', 3: 'dark', 4: 'scale'}[t]
        sole = MAT['leatherD'][3] if t < 2 else (MAT['steel'][3] if t == 2 else (MAT['gold'][2] if t >= 3 else OL))
        if t == 4:
            sv += P(shaft, 'url(#scales)') + clip(f'bo4s{s}{g.name}', shaft, F(poly_path([(kx + 10, 0), (W, 0), (W, H), (kx + 14, H)]), MAT['scale'][3], .45))
        else:
            sv += P(shaft, G(mat))
        sv += bevel(shaft, mat, 4, 8) + L(shaft, OL, LW)
        # 발
        sv += P(fp, G(mat, 'rg') if t != 4 else 'url(#scales)')
        sv += clip(f'bo{t}f{s}{g.name}', fp, F(poly_path([(0, fyb - 12), (W, fyb - 12), (W, H), (0, H)]), sole, 1)
                   + L(f'M0 {fyb - 12} L{W} {fyb - 12}', OL, 3))
        sv += bevel(fp, mat, 5, 9) + L(fp, OL, LW)
        if t == 0:
            for k in range(3):
                yy = ank - 8 + k * 12
                sv += L(f'M{kx - 12} {yy} L{kx + 12} {yy + 8} M{kx + 12} {yy} L{kx - 12} {yy + 8}', MAT['rope'][1], 2.5)
            sv += L(f'M{left[0][0]} {topy + 4} L{right[0][0]} {topy + 4}', MAT['hide'][1], 3)
        elif t == 1:
            cuff = smooth_path([(left[0][0] - 3, topy - 4), (right[0][0] + 3, topy - 4), (right[2][0] + 2, topy + 22), (left[2][0] - 2, topy + 22)], k=.2)
            sv += P(cuff, G('leather', 'lv'), 4)
            for k in range(2):
                yy = topy + 50 + k * 50
                la, ra = g.legw(s, yy)
                sv += P(poly_path([(la - pad - 2, yy), (ra + pad + 2, yy), (ra + pad + 2, yy + 12), (la - pad - 2, yy + 12)]), MAT['leatherD'][0], 3)
                sv += P(poly_path([(kx - 7, yy - 3), (kx + 7, yy - 3), (kx + 7, yy + 15), (kx - 7, yy + 15)]), 'none', 4, f'stroke="{MAT["iron"][1]}"')
        elif t == 2:
            plate = smooth_path([(kx - 20, topy + 4), (kx + 20, topy + 4), (kx + 18, ank + 6), (kx, ank + 16), (kx - 18, ank + 6)], k=.25)
            sv += P(plate, G('steel')) + L(f'M{kx} {topy + 10} L{kx} {ank + 8}', MAT['steel'][1], 3, .9)
            for k in range(3):
                yy = ank + 22 + k * 12
                sv += clip(f'bo2l{k}{s}{g.name}', fp, L(f'M0 {yy} Q{mx} {yy + 8} {W} {yy}', MAT['steel'][3], 3))
            o = -1 if s == 'L' else 1
            xw = (left[-3][0] if s == 'L' else right[-3][0])
            wing = smooth_path([(xw, ank - 4), (xw + o * 30, ank - 34), (xw + o * 40, ank - 30), (xw + o * 26, ank - 12), (xw + o * 34, ank - 10), (xw + o * 18, ank + 6)], k=.3)
            sv += P(wing, G('silver'), 3.5) + L(f'M{xw + o * 6} {ank - 6} L{xw + o * 30} {ank - 26}', MAT['silver'][2], 2)
        elif t == 3:
            sv += L(shaft, MAT['gold'][0], 0)
            sv += L(f'M{left[0][0]} {topy + 3} L{right[0][0]} {topy + 3}', MAT['gold'][0], 7) + L(f'M{left[0][0]} {topy + 1} L{right[0][0]} {topy + 1}', MAT['gold'][1], 2)
            sv += glow_line(f'M{kx} {topy + 22} L{kx} {ank - 18} M{kx - 8} {topy + 44} L{kx} {topy + 54} L{kx + 8} {topy + 44}', GEM['purple'][2], 3)
            cap = smooth_path([(fx0 + 6, fyb - 22), (mx, fyb - 38), (fx1 - 6, fyb - 22), (fx1 - 2, fyb - 12), (fx0 + 2, fyb - 12)], k=.3)
            sv += P(cap, G('gold'), 3.5)
        else:
            for k, xx in enumerate((fx0 + 12, mx, fx1 - 12)):
                claw = smooth_path([(xx - 8, fyb - 20), (xx + 8, fyb - 20), (xx + 2, fyb - 4), (xx, fyb + 4)], k=.2)
                sv += P(claw, G('gold'), 3)
            band = poly_path([(left[0][0] - 4, topy - 2), (right[0][0] + 4, topy - 2), (right[1][0] + 3, topy + 16), (left[1][0] - 3, topy + 16)])
            sv += PB(band, G('gold', 'lv'), 'gold', k=3, bw=5) + gem(kx, topy + 7, 5, 'red', glow=False)
            ridge = f'M{kx} {topy + 20} L{kx} {ank + 4}'
            sv += L(ridge, OL, 9) + L(ridge, MAT['gold'][0], 5)
        out['leg' + s] = sv
    return out


# ─────────────────────────────────────────────────────────────
# 장갑 — 손 모양은 그대로(색만 재질로) + 손목·팔뚝 토시
# ─────────────────────────────────────────────────────────────
GLOVE_MAT = {0: 'cloth', 1: 'leather', 2: 'steel', 3: 'dark', 4: 'scale'}


def gloves(g, t):
    r = g.rig
    out = {'_handmat': GLOVE_MAT[t]}
    for s in 'LR':
        wy = r[s]['wrist'][1]
        ey = r[s]['elbow'][1]
        y0 = {0: wy - 34, 1: wy - 40, 2: ey + 40, 3: ey + 30, 4: ey + 24}[t]
        pad = {0: 4, 1: 5, 2: 6, 3: 7, 4: 7}[t]
        ys = list(range(int(y0), int(wy) + 14, 8))
        flare = {0: 0, 1: 8, 2: 6, 3: 10, 4: 12}[t]
        left = [(g.armw(s, y)[0] - pad - flare * (1 - (y - y0) / max(1, wy + 14 - y0)), y) for y in ys]
        right = [(g.armw(s, y)[1] + pad + flare * (1 - (y - y0) / max(1, wy + 14 - y0)), y) for y in ys]
        cuff = smooth_path(left + right[::-1], k=.3)
        ax = sum(g.armw(s, wy - 10)) / 2
        mat = GLOVE_MAT[t]
        sv = ''
        det = ''
        if t == 0:
            sv += PB(cuff, G('cloth'), 'cloth', k=4, bw=7)
            for k in range(4):
                yy = y0 + 6 + k * 11
                sv += clip(f'gl0{k}{s}{g.name}', cuff, L(f'M0 {yy} L{W} {yy + 9}', MAT['cloth'][3], 2.5, .8))
            for k in range(3):
                yy = wy + 14 + k * 14
                det += L(f'M0 {yy} L{W} {yy + 10}', MAT['cloth'][3], 3, .8)
        elif t == 1:
            sv += PB(cuff, G('leather'), 'leather', k=4, bw=7)
            sv += L(f'M{left[0][0] + 2} {y0 + 6} L{right[0][0] - 2} {y0 + 6}', MAT['leather'][1], 2.5, .9, 'stroke-dasharray="5 4"')
            det += L(f'M0 {wy + 20} L{W} {wy + 20}', MAT['leather'][3], 3, .8)
        elif t == 2:
            sv += PB(cuff, G('steel'), 'steel', k=4, bw=7)
            sv += clip(f'gl2{s}{g.name}', cuff, L(f'M{ax} {y0} L{ax} {wy + 14}', MAT['steel'][1], 3.5, .9)
                       + L(f'M0 {y0 + (wy - y0) * .5} L{W} {y0 + (wy - y0) * .5 + 6}', MAT['steel'][3], 3))
            sv += rivet(ax - 10, y0 + 12, 3.5, 'silver') + rivet(ax + 10, y0 + 12, 3.5, 'silver')
            for k in range(3):
                yy = wy + 16 + k * 13
                det += L(f'M0 {yy} Q{ax} {yy + 8} {W} {yy}', MAT['steel'][3], 3.5) + L(f'M0 {yy + 3} Q{ax} {yy + 11} {W} {yy + 3}', MAT['steel'][1], 1.5, .8)
        elif t == 3:
            sv += PB(cuff, G('dark'), 'dark', k=4, bw=7)
            sv += clip(f'gl3{s}{g.name}', cuff, L(cuff, MAT['gold'][0], 9) + L(cuff, MAT['gold'][1], 2, .9))
            sv += glow_line(f'M{ax - 8} {y0 + 16} L{ax} {y0 + 30} L{ax + 8} {y0 + 16} M{ax} {y0 + 30} L{ax} {wy}', GEM['purple'][2], 2.5)
            for k in range(2):
                yy = wy + 18 + k * 16
                det += L(f'M0 {yy} Q{ax} {yy + 8} {W} {yy}', MAT['gold'][0], 3.5)
            det += f'<circle cx="{ax}" cy="{wy + 30}" r="5" fill="{GEM["purple"][2]}" filter="url(#blur3)"/>'
        else:
            sv += P(cuff, 'url(#scales)') + clip(f'gl4{s}{g.name}', cuff, L(cuff, MAT['gold'][0], 10) + L(cuff, MAT['gold'][1], 2.5, .9))
            o = -1 if s == 'L' else 1
            xs_ = left[0][0] if s == 'L' else right[0][0]
            for k in range(3):
                yy = y0 + 8 + k * 16
                sp = smooth_path([(xs_ + o * 2, yy), (xs_ + o * 22, yy - 8), (xs_ + o * 4, yy + 12)], k=.2)
                sv += P(sp, G('gold'), 3)
            sv += gem(ax, y0 + 26, 6, 'red', glow=True)
            for k in range(2):
                yy = wy + 16 + k * 14
                det += L(f'M0 {yy} Q{ax} {yy + 8} {W} {yy}', MAT['gold'][0], 4)
        out['arm' + s] = sv
        out['arm' + s + '_det'] = det
    return out



# ─────────────────────────────────────────────────────────────
# 무기 — 제 틀에 세워 그린다(끝이 위). grip = 손이 쥐는 점
# ─────────────────────────────────────────────────────────────
WEAPON_NAMES = {
    'sword': ['나무 검', '강철 검', '화염검', '서리검', '용살자'],
    'bow': ['낡은 사냥활', '사냥용 활', '바람의 장궁', '뇌전궁', '천공궁'],
    'staff': ['옹이 지팡이', '견습 지팡이', '대마법사의 지팡이', '성염 지팡이', '세계수 지팡이'],
}


def sword(t):
    Wc, Hc = 240, 620
    cx = Wc / 2
    gy = 470                      # 손잡이 가운데
    guard_y = gy - 58
    blen = [320, 350, 360, 370, 400][t]
    bw = [34, 38, 44, 46, 64][t]
    tip_y = guard_y - blen
    s = ''
    glow = {2: GEM['amber'][2], 3: GEM['purple'][2], 4: GEM['red'][2]}.get(t)
    blade_pts = [(cx - bw / 2, guard_y), (cx - bw / 2, tip_y + bw * 1.1), (cx, tip_y), (cx + bw / 2, tip_y + bw * 1.1), (cx + bw / 2, guard_y)]
    if t == 0:
        blade_pts = [(cx - bw / 2, guard_y), (cx - bw / 2 + 2, tip_y + 20), (cx, tip_y), (cx + bw / 2 - 2, tip_y + 20), (cx + bw / 2, guard_y)]
    if t == 2:   # 불꽃 날 — 물결 가장자리
        pts_l, pts_r = [], []
        n = 7
        for i in range(n + 1):
            y = guard_y - (guard_y - tip_y - bw) * i / n
            wv = 5 if i % 2 else 0
            pts_l.append((cx - bw / 2 - wv, y))
            pts_r.append((cx + bw / 2 + wv, y))
        blade_pts = pts_l + [(cx, tip_y)] + pts_r[::-1]
    if t == 3:   # 얼음 결정 날 — 각진 면
        blade_pts = [(cx - bw / 2, guard_y), (cx - bw / 2 - 10, guard_y - 60), (cx - bw / 2 + 2, guard_y - 90), (cx - bw / 2 - 4, tip_y + 120),
                     (cx - 6, tip_y + 20), (cx, tip_y), (cx + 8, tip_y + 30), (cx + bw / 2 + 4, tip_y + 110), (cx + bw / 2 - 2, guard_y - 100),
                     (cx + bw / 2 + 12, guard_y - 56), (cx + bw / 2, guard_y)]
    bd = poly_path(blade_pts) if t in (0, 3) else poly_path(blade_pts)
    if glow:
        s += L(bd, glow, 22, .5, 'filter="url(#blur8)"')
    mat = {0: 'wood', 1: 'steel', 2: 'steel', 3: 'silver', 4: 'dark'}[t]
    if t == 3:
        s += P(bd, 'url(#iceG)')
        s += L(f'M{cx} {tip_y + 10} L{cx - 4} {guard_y - 10}', '#ffffff', 3, .9)
        s += L(f'M{cx - bw / 2 + 4} {guard_y - 80} L{cx + 2} {tip_y + 40} M{cx + bw / 2 - 4} {guard_y - 90} L{cx + 4} {tip_y + 60}', '#b9d8ff', 2, .8)
        s += glow_line(f'M{cx} {guard_y - 30} L{cx} {guard_y - 150} M{cx - 8} {guard_y - 70} L{cx + 8} {guard_y - 90}', GEM['purple'][2], 2.5)
    else:
        s += P(bd, G(mat))
        s += bevel(bd, mat, 3, 5)
        if t == 0:
            s += L(f'M{cx - 6} {guard_y - 20} Q{cx - 2} {(guard_y + tip_y) / 2} {cx - 5} {tip_y + 40}', MAT['wood'][3], 2, .7)
            s += L(f'M{cx + 7} {guard_y - 60} Q{cx + 9} {(guard_y + tip_y) / 2} {cx + 4} {tip_y + 70}', MAT['wood'][3], 2, .6)
        elif t == 1:
            s += L(f'M{cx} {guard_y - 8} L{cx} {tip_y + 50}', MAT['steel'][3], 5, .8) + L(f'M{cx - 2} {guard_y - 8} L{cx - 2} {tip_y + 50}', MAT['steel'][1], 1.5, .9)
        elif t == 2:
            s += clip(uid('fl'), bd, L(poly_path(blade_pts), '#ff7a2a', 14, .85) + L(poly_path(blade_pts), '#ffd27a', 4, .9))
            for k in range(4):
                y0 = guard_y - 30 - k * 70
                s += glow_line(f'M{cx} {y0} q-10 -20 0 -34 q10 -16 0 -30', '#ff9a3a', 2.5, '#fff0c0')
        else:
            s += L(f'M{cx} {guard_y - 10} L{cx} {tip_y + 70}', '#1b1d2b', 12, 1)
            s += glow_line(f'M{cx} {guard_y - 14} L{cx} {tip_y + 76}', GEM['red'][2], 4, '#ffe0c0')
            for k in range(5):
                y0 = guard_y - 50 - k * 60
                s += glow_line(f'M{cx - 9} {y0} L{cx} {y0 - 12} L{cx + 9} {y0}', GEM['red'][2], 2.5, '#ffe0c0')
            s += L(bd, MAT['gold'][0], 4, 1, 'transform="translate(0 0)"')
    s += L(bd, OL, 5)
    # 날밑
    gw = [70, 92, 104, 112, 170][t]
    if t == 0:
        gd = poly_path([(cx - gw / 2, guard_y - 8), (cx + gw / 2, guard_y - 8), (cx + gw / 2, guard_y + 10), (cx - gw / 2, guard_y + 10)])
        s += PB(gd, G('wood', 'lv'), 'wood', 2, 4)
    elif t == 1:
        gd = smooth_path([(cx - gw / 2, guard_y - 6), (cx, guard_y - 10), (cx + gw / 2, guard_y - 6), (cx + gw / 2, guard_y + 10), (cx, guard_y + 8), (cx - gw / 2, guard_y + 10)], k=.2)
        s += PB(gd, G('iron', 'lv'), 'iron', 2, 4) + circ(cx - gw / 2, guard_y + 2, 9, MAT['iron'][0]) + circ(cx + gw / 2, guard_y + 2, 9, MAT['iron'][0])
    elif t == 2:
        gd = smooth_path([(cx - gw / 2, guard_y - 16), (cx - 20, guard_y - 4), (cx, guard_y - 14), (cx + 20, guard_y - 4), (cx + gw / 2, guard_y - 16),
                          (cx + gw / 2 - 6, guard_y + 8), (cx, guard_y + 14), (cx - gw / 2 + 6, guard_y + 8)], k=.3)
        s += PB(gd, G('gold', 'lv'), 'gold', 2, 4) + gem(cx, guard_y, 9, 'red', glow=False)
    elif t == 3:
        gd = smooth_path([(cx - gw / 2, guard_y - 26), (cx - 24, guard_y - 6), (cx, guard_y - 12), (cx + 24, guard_y - 6), (cx + gw / 2, guard_y - 26),
                          (cx + gw / 2 - 14, guard_y + 6), (cx, guard_y + 14), (cx - gw / 2 + 14, guard_y + 6)], k=.3)
        s += PB(gd, G('silver', 'lv'), 'silver', 2, 4) + gem(cx, guard_y, 10, 'purple', shape='diamond')
    else:
        wing = []
        for sx in (-1, 1):
            wd = smooth_path([(cx, guard_y), (cx + sx * 30, guard_y - 30), (cx + sx * 70, guard_y - 58), (cx + sx * 88, guard_y - 44),
                              (cx + sx * 74, guard_y - 30), (cx + sx * 86, guard_y - 16), (cx + sx * 60, guard_y - 6), (cx + sx * 70, guard_y + 8),
                              (cx + sx * 30, guard_y + 10)], k=.3)
            s += PB(wd, G('gold', 'lv'), 'gold', 2, 4)
        s += circ(cx, guard_y, 17, MAT['gold'][0], OL, 4) + gem(cx, guard_y, 11, 'red')
    # 자루 · 끝구슬
    hl = [96, 100, 100, 104, 118][t]
    hw = [18, 20, 20, 20, 22][t]
    hd = poly_path([(cx - hw / 2, guard_y + 10), (cx + hw / 2, guard_y + 10), (cx + hw / 2, guard_y + 10 + hl), (cx - hw / 2, guard_y + 10 + hl)])
    gripmat = {0: 'rope', 1: 'leather', 2: 'crimson', 3: 'blue', 4: 'crimson'}[t]
    s += P(hd, G(gripmat), 4)
    for k in range(6):
        y = guard_y + 18 + k * hl / 6
        s += L(f'M{cx - hw / 2} {y} L{cx + hw / 2} {y + 8}', MAT[gripmat][3], 2.5, .9)
    py = guard_y + 10 + hl + 10
    pr = [11, 13, 14, 14, 17][t]
    pm = {0: 'wood', 1: 'iron', 2: 'gold', 3: 'silver', 4: 'gold'}[t]
    s += f'<circle cx="{cx}" cy="{py}" r="{pr}" fill="{G(pm, "rg")}" stroke="{OL}" stroke-width="4"/>'
    if t >= 2:
        s += gem(cx, py, pr * .5, {2: 'red', 3: 'purple', 4: 'red'}[t], glow=False)
    info = {'grip': (cx, gy), 'tip': (cx, tip_y), 'w': Wc, 'h': Hc}
    return s, info


def bow(t):
    Wc, Hc = 300, 800
    gx, gy = 168, 400
    top_y, bot_y = [70, 50, 26, 40, 20][t], [730, 750, 774, 760, 780][t]
    ex = 132                      # 시위가 매이는 x
    bulge = [30, 34, 40, 40, 44][t]
    s = ''
    glow = {3: GEM['purple'][2], 4: GEM['red'][2]}.get(t)

    def limb(y_end, sign):
        # 손잡이 → 끝. sign −1 위, +1 아래
        mid = gy + sign * (abs(y_end - gy) * .55)
        rec = {0: 0, 1: -14, 2: -6, 3: -18, 4: -10}[t]
        gh_ = [60, 70, 70, 74, 80][t]
        return [(gx, gy + sign * (gh_ / 2 - 6)), (gx + 2, gy + sign * (gh_ / 2 + 50)), (gx - 6, mid), (ex + bulge * .5, mid + sign * 90), (ex + rec, y_end)]

    up = limb(top_y, -1)
    dn = limb(bot_y, 1)
    th = [12, 14, 13, 16, 18][t]
    mat = {0: 'wood', 1: 'wood', 2: 'bone', 3: 'dark', 4: 'gold'}[t]

    def ribbon(pts, w):
        # 가운데 선을 따라 두께 w 인 판
        L_, R_ = [], []
        for i, (x, y) in enumerate(pts):
            x2, y2 = pts[min(i + 1, len(pts) - 1)]
            x1, y1 = pts[max(i - 1, 0)]
            dx, dy = x2 - x1, y2 - y1
            n = math.hypot(dx, dy) or 1
            nx, ny = -dy / n, dx / n
            ww = w * (1 - .55 * (i / (len(pts) - 1)))
            L_.append((x + nx * ww / 2, y + ny * ww / 2))
            R_.append((x - nx * ww / 2, y - ny * ww / 2))
        return smooth_path(L_ + R_[::-1], k=.35)

    for pts in (up, dn):
        d = ribbon(pts, th)
        if glow:
            s += L(d, glow, 18, .45, 'filter="url(#blur8)"')
        s += P(d, G(mat), 4) + bevel(d, mat, 2, 4)
        if t == 2:
            s += L(smooth_path(pts, closed=False, k=.35), GEM['blue'][0], 2.5, .9, 'stroke-dasharray="10 8"')
        if t == 3:
            zz = ''.join(f' L{x + (6 if i % 2 else -6)} {y}' for i, (x, y) in enumerate(pts))
            s += glow_line('M' + zz[2:], GEM['purple'][2], 2.2)
        if t == 4:
            # 날개 — 손잡이 가까이에서 바깥으로 펼친 흰 깃
            sgn = -1 if pts[-1][1] < gy else 1
            x0_, y0_ = pts[1]
            wing = smooth_path([(x0_ + 4, y0_), (x0_ + 50, y0_ + sgn * 40), (x0_ + 78, y0_ + sgn * 120), (x0_ + 56, y0_ + sgn * 104),
                                (x0_ + 60, y0_ + sgn * 150), (x0_ + 36, y0_ + sgn * 120), (x0_ + 34, y0_ + sgn * 170), (x0_ + 14, y0_ + sgn * 120),
                                (x0_ + 2, y0_ + sgn * 60)], k=.3)
            s = P(wing, G('bone'), 3.5) + L(f'M{x0_ + 6} {y0_ + sgn * 10} Q{x0_ + 50} {y0_ + sgn * 60} {x0_ + 70} {y0_ + sgn * 116}', MAT['gold'][0], 3) + s
    # 끝 장식
    for (x, y), sgn in ((up[-1], -1), (dn[-1], 1)):
        if t == 1:
            s += P(smooth_path([(x - 6, y), (x + 8, y - sgn * 4), (x + 12, y + sgn * 14), (x - 2, y + sgn * 10)], k=.3), G('bone'), 3)
        elif t == 2:
            s += P(smooth_path([(x, y), (x + 14, y + sgn * 10), (x + 4, y + sgn * 30), (x - 8, y + sgn * 12)], k=.35), G('silver'), 3)
        elif t == 3:
            s += P(poly_path([(x - 6, y), (x + 14, y - sgn * 26), (x + 8, y + sgn * 8)]), G('silver'), 3)
        elif t == 4:
            s += gem(x + 2, y, 6, 'red', glow=False)
    # 손잡이
    gh = [60, 70, 70, 74, 80][t]
    gd = smooth_path([(gx - 12, gy - gh / 2), (gx + 12, gy - gh / 2), (gx + 13, gy + gh / 2), (gx - 13, gy + gh / 2)], k=.2)
    gm = {0: 'rope', 1: 'leather', 2: 'blue', 3: 'dark', 4: 'crimson'}[t]
    s += PB(gd, G(gm), gm, 2, 4)
    for k in range(5):
        y = gy - gh / 2 + 6 + k * gh / 5
        s += L(f'M{gx - 12} {y} L{gx + 12} {y + 7}', MAT[gm][3], 2.5, .9)
    if t >= 2:
        s += gem(gx + 14, gy, 7, {2: 'blue', 3: 'purple', 4: 'red'}[t])
    info = {'grip': (gx, gy), 'tip': (gx, top_y), 'ends': [(up[-1][0], up[-1][1]), (dn[-1][0], dn[-1][1])], 'w': Wc, 'h': Hc}
    return s, info


def staff(t):
    Wc, Hc = 280, 780
    cx = 140
    gy = 440
    top = [150, 170, 190, 190, 200][t]
    bot = 760
    s = ''
    mat = {0: 'wood', 1: 'wood', 2: 'leatherD', 3: 'dark', 4: 'wood'}[t]
    # 자루
    if t == 0:
        pts = [(cx + 4, bot), (cx - 6, bot - 120), (cx + 8, bot - 260), (cx - 4, gy), (cx + 6, top + 120), (cx - 8, top + 40)]
    else:
        pts = [(cx, bot), (cx, top + 10)]
    wd = [20, 18, 18, 20, 24][t]

    def rod(pts, w):
        L_, R_ = [], []
        for i, (x, y) in enumerate(pts):
            x2, y2 = pts[min(i + 1, len(pts) - 1)]
            x1, y1 = pts[max(i - 1, 0)]
            dx, dy = x2 - x1, y2 - y1
            n = math.hypot(dx, dy) or 1
            nx, ny = -dy / n, dx / n
            L_.append((x + nx * w / 2, y + ny * w / 2))
            R_.append((x - nx * w / 2, y - ny * w / 2))
        return smooth_path(L_ + R_[::-1], k=.35)

    d = rod(pts, wd)
    s += P(d, G(mat), 4) + bevel(d, mat, 2, 4) + L(d, OL, 4)
    if t == 0:
        for (x, y) in ((cx - 4, bot - 180), (cx + 6, gy - 90), (cx - 2, top + 160)):
            s += f'<ellipse cx="{x}" cy="{y}" rx="12" ry="8" fill="{MAT["wood"][2]}" stroke="{OL}" stroke-width="3"/>'
        hook = smooth_path([(cx - 8, top + 50), (cx - 26, top), (cx - 4, top - 44), (cx + 38, top - 36), (cx + 44, top + 6), (cx + 20, top + 20),
                            (cx + 24, top - 8), (cx + 4, top - 16), (cx - 6, top + 6), (cx + 6, top + 50)], k=.35)
        s += PB(hook, G('wood'), 'wood', 2, 4)
    elif t == 1:
        s += PB(smooth_path([(cx - 16, top + 50), (cx + 16, top + 50), (cx + 14, top + 90), (cx - 14, top + 90)], k=.2), G('leather'), 'leather', 2, 4)
        for k in range(3):
            s += L(f'M{cx - 15} {top + 58 + k * 11} L{cx + 15} {top + 64 + k * 11}', MAT['leather'][3], 2.5)
        for sx in (-1, 1):
            s += L(f'M{cx + sx * 8} {top + 50} Q{cx + sx * 22} {top + 10} {cx + sx * 6} {top - 24}', OL, 9) + L(f'M{cx + sx * 8} {top + 50} Q{cx + sx * 22} {top + 10} {cx + sx * 6} {top - 24}', MAT['wood'][1], 5)
        s += gem(cx, top + 4, 17, 'green')
    elif t == 2:
        s += PB(smooth_path([(cx - 18, top + 40), (cx + 18, top + 40), (cx + 14, top + 70), (cx - 14, top + 70)], k=.2), G('silver'), 'silver', 2, 4)
        s += f'<circle cx="{cx}" cy="{top - 16}" r="44" fill="{GEM["blue"][2]}" opacity=".45" filter="url(#blur8)"/>'
        s += f'<circle cx="{cx}" cy="{top - 16}" r="30" fill="url(#orbB)" stroke="{OL}" stroke-width="4"/>'
        s += f'<ellipse cx="{cx - 10}" cy="{top - 28}" rx="9" ry="7" fill="#ffffff" opacity=".85"/>'
        for sx in (-1, 0, 1):
            cl = f'M{cx + sx * 10} {top + 42} Q{cx + sx * 44} {top + 4} {cx + sx * 26} {top - 36}'
            if sx == 0:
                cl = f'M{cx} {top + 42} L{cx} {top + 16}'
            s += L(cl, OL, 10) + L(cl, MAT['silver'][0], 6) + L(cl, MAT['silver'][1], 2)
    elif t == 3:
        s += f'<ellipse cx="{cx}" cy="{top - 30}" rx="60" ry="66" fill="{GEM["purple"][2]}" opacity=".5" filter="url(#blur8)"/>'
        flame = smooth_path([(cx, top + 26), (cx - 30, top - 6), (cx - 20, top - 50), (cx - 6, top - 34), (cx - 4, top - 84), (cx + 16, top - 50),
                             (cx + 30, top - 64), (cx + 30, top - 10)], k=.4)
        s += P(flame, 'url(#flameP)', 4)
        s += f'<ellipse cx="{cx}" cy="{top - 10}" rx="44" ry="15" fill="none" stroke="{OL}" stroke-width="10"/>'
        s += f'<ellipse cx="{cx}" cy="{top - 10}" rx="44" ry="15" fill="none" stroke="{MAT["gold"][0]}" stroke-width="6"/>'
        s += f'<ellipse cx="{cx}" cy="{top - 12}" rx="44" ry="15" fill="none" stroke="{MAT["gold"][1]}" stroke-width="1.6"/>'
        s += PB(smooth_path([(cx - 20, top + 24), (cx + 20, top + 24), (cx + 12, top + 60), (cx - 12, top + 60)], k=.2), G('gold'), 'gold', 2, 4)
        s += gem(cx, top + 40, 7, 'purple', glow=False)
    else:
        # 세계수 — 두 가지가 요람처럼 감싼 붉은 심장 수정 · 금빛 잎
        s += f'<circle cx="{cx}" cy="{top - 44}" r="40" fill="{GEM["red"][2]}" opacity=".35" filter="url(#blur8)"/>'
        s += gem(cx, top - 44, 15, 'red', glow=False)
        s += f'<ellipse cx="{cx - 5}" cy="{top - 52}" rx="5" ry="3.5" fill="#ffffff" opacity=".8"/>'
        for sx in (-1, 1):
            br = f'M{cx + sx * 4} {top + 40} Q{cx + sx * 50} {top + 4} {cx + sx * 34} {top - 50} Q{cx + sx * 24} {top - 86} {cx - sx * 4} {top - 94}'
            s += L(br, OL, 17) + L(br, MAT['wood'][0], 11) + L(br, MAT['wood'][1], 3, .8)
            tw = f'M{cx + sx * 36} {top - 20} Q{cx + sx * 62} {top - 34} {cx + sx * 70} {top - 62}'
            s += L(tw, OL, 10) + L(tw, MAT['wood'][0], 5)
            for (lx, ly) in ((70, -64), (58, -30), (40, -86), (18, -100)):
                x, y = cx + sx * lx, top + ly
                leaf = smooth_path([(x, y + 6), (x + sx * 10, y - 12), (x + sx * 26, y - 14), (x + sx * 18, y + 4)], k=.4)
                s += P(leaf, G('gold'), 3) + L(f'M{x} {y + 6} L{x + sx * 20} {y - 10}', MAT['gold'][2], 1.5)
        for k in range(3):
            s += L(f'M{cx - 12} {top + 70 + k * 16} L{cx + 12} {top + 76 + k * 16}', OL, 8) + L(f'M{cx - 12} {top + 70 + k * 16} L{cx + 12} {top + 76 + k * 16}', MAT['gold'][0], 4)
    info = {'grip': (cx, gy), 'tip': (cx, top - 40), 'w': Wc, 'h': Hc}
    return s, info


WDEFS = """
<linearGradient id="iceG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4fbff"/><stop offset=".45" stop-color="#bfe3ff"/><stop offset="1" stop-color="#7fa6e6"/></linearGradient>
<radialGradient id="orbB" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#e8f7ff"/><stop offset=".4" stop-color="#6cc0ff"/><stop offset="1" stop-color="#1d5fb0"/></radialGradient>
<radialGradient id="orbA" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fff4e0"/><stop offset=".4" stop-color="#ffa24a"/><stop offset="1" stop-color="#b0420e"/></radialGradient>
<linearGradient id="demonG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6a3d8f"/><stop offset=".5" stop-color="#2a1838"/><stop offset="1" stop-color="#120a1c"/></linearGradient>
<linearGradient id="flameP" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff1ff"/><stop offset=".35" stop-color="#e3a6ff"/><stop offset="1" stop-color="#8a3de0"/></linearGradient>
"""
WEAPON_GEN = {'sword': sword, 'bow': bow, 'staff': staff}


# ─────────────────────────────────────────────────────────────
# 아이템마다 다른 모양 — 같은 등급 안에서 (0.70.28)
# ─────────────────────────────────────────────────────────────
# 등급 그림(0~4)은 그 등급의 **대표 아이템**을 보고 그렸다(기사 갑옷 · 화염검 …).
# 같은 등급에 아이템이 둘 이상이면 나머지는 대표 그림을 입고 있었다 — 용린 갑옷이 기사 갑옷으로 보였다.
# 이제 그런 아이템은 제 그림(변형)을 갖는다. 두 가지 방법으로 만든다.
#   · 색 갈아 끼우기 — 바탕 그림(어느 등급)의 재질 · 무늬 · 보석 색을 통째로 바꾼다.
#     용린(희귀) 한 벌: 전설 용비늘의 **핏빛 비늘 · 금** → **주황 비늘 · 구리**. 모양은 닮고 색 · 무늬가 다르다.
#   · 새로 그리기 — 몽둥이 · 쓸모없는 검 · 용린 기사검 · 마검 · 매직 투구.
# 게임은 bodies.json 의 variants(아이템 → 변형 이름)로 층을 고른다(src/core/BodyLook.js).

def _mat_pairs(src, dst):
    out = [(f'url(#{k}_{src})', f'url(#{k}_{dst})') for k in ('lg', 'lv', 'rg')]
    out += list(zip(MAT[src], MAT[dst]))
    return out


def _gem_pairs(src, dst):
    return list(zip(GEM[src], GEM[dst]))


def swap(svg, pairs):
    """색 · 그라데이션 · 무늬 이름을 한꺼번에 갈아 끼운다(바꾼 것을 다시 바꾸지 않게 자리표를 거친다)."""
    import re as _re
    pairs = sorted(pairs, key=lambda p: -len(p[0]))
    for i, (a, _) in enumerate(pairs):
        svg = _re.sub(_re.escape(a), f'@@{i}@@', svg, flags=_re.I)
    for i, (_, b) in enumerate(pairs):
        svg = svg.replace(f'@@{i}@@', b)
    return svg


def swap_piece(res, pairs):
    return {k: (swap(v, pairs) if isinstance(v, str) else v) for k, v in res.items()}


DRAGON_RARE = (_mat_pairs('scale', 'wyrm') + _mat_pairs('gold', 'copper') + _mat_pairs('crimson', 'rustcloth')
               + [('url(#scalesBig)', 'url(#scalesOBig)'), ('url(#scales)', 'url(#scalesO)')]
               + _gem_pairs('red', 'orange'))


def helmet_magic(g):
    """매직 투구 — 보랏빛 마력 강철 · 뾰족한 정수리 · 이마의 푸른 결정 · 흘러내리는 빛 띠."""
    h = head_geo(g)
    cx, top, b, x0, x1 = h['cx'], h['top'], h['brim'], h['x0'], h['x1']
    out = ''
    ac, sv = MAT['arcane'], MAT['silver']
    # 뒤로 흘러내리는 빛 띠 두 줄
    for sx in (-1, 1):
        xa = x0 if sx < 0 else x1
        rib = smooth_path([(xa - sx * 10, b - 30), (xa + sx * 20, b + 10), (xa + sx * 34, b + 70), (xa + sx * 22, b + 76),
                           (xa + sx * 8, b + 20), (xa - sx * 18, b - 20)], k=.4)
        out += P(rib, G('cyan'), 3.5)
        out += glow_line(f'M{xa - sx * 4} {b - 24} Q{xa + sx * 22} {b + 20} {xa + sx * 28} {b + 66}', GEM['blue'][2], 2)
        guard = smooth_path([(xa - sx * 2, b - 6), (xa + sx * 4, b + 50), (xa - sx * 18, b + 70), (xa - sx * 30, b + 24), (xa - sx * 28, b - 4)], k=.35)
        out += PB(guard, G('arcane'), 'arcane', k=4, bw=6) + L(guard, sv[0], 2.5, .9)
    # 뾰족한 정수리 — 돔 위로 솟은 뿔 하나
    spike = smooth_path([(cx - 30, top + 30), (cx - 10, top - 40), (cx + 4, top - 96), (cx + 14, top - 40), (cx + 32, top + 30)], k=.25)
    out += PB(spike, G('arcane'), 'arcane', k=4, bw=6) + L(f'M{cx + 2} {top - 86} L{cx + 2} {top + 20}', sv[1], 2, .8)
    out += gem(cx + 3, top - 90, 7, 'blue', glow=True, shape='diamond')
    d = dome_path(h, lift=6, widen=6, brim_dip=10)
    out += P(d, G('arcane', 'rg'))
    inner = F(poly_path([(cx + 36, 0), (W, 0), (W, H), (cx + 46, H)]), ac[3], .35)
    inner += F(poly_path([(0, b - 22), (W, b - 22), (W, H), (0, H)]), sv[0], 1)
    inner += L(f'M0 {b - 22} L{W} {b - 22}', sv[3], 2.5)
    for k in range(5):
        xx = x0 + 24 + k * (x1 - x0 - 48) / 4
        inner += glow_line(f'M{xx - 6} {b - 6} L{xx} {b - 16} L{xx + 6} {b - 6}', GEM['blue'][2], 1.8)
    for sx in (-1, 1):
        inner += glow_line(f'M{cx + sx * 18} {top + 30} Q{cx + sx * 44} {top + 60} {cx + sx * 40} {b - 34}', GEM['blue'][2], 2)
    out += clip(f'hmM{g.name}', d, inner) + bevel(d, 'arcane', 6, 10) + L(d, OL, LW)
    out += gem(cx, b - 34, 12, 'blue', shape='diamond')
    return {'head': out}


# 칸 · 변형 이름 → 만드는 법
VARIANTS = {
    ('armor', 'dragon'): lambda g: swap_piece(armor(g, 4), DRAGON_RARE),
    ('helmet', 'dragon'): lambda g: swap_piece(helmet(g, 3), _mat_pairs('gold', 'copper')
                                               + [('url(#rg_dark)', 'url(#scalesO)')] + _mat_pairs('dark', 'wyrm')
                                               + _gem_pairs('purple', 'orange')),
    ('helmet', 'magic'): helmet_magic,
    ('shoulder', 'dragon'): lambda g: swap_piece(shoulder(g, 4), DRAGON_RARE),
}


def sword_club():
    """낡은 몽둥이 — 끝이 굵은 나무 몽둥이, 쇠테 하나와 징 몇 개."""
    Wc, Hc = 240, 620
    cx, gy = 120, 470
    top = 96
    s = ''
    rng = __import__('random').Random(7)
    L_, R_ = [], []
    for i in range(13):
        y = gy + 70 - (gy + 70 - top) * i / 12
        k = i / 12
        w = 11 + 22 * k ** 1.6 + rng.uniform(-2, 2)
        L_.append((cx - w + rng.uniform(-2, 2), y))
        R_.append((cx + w + rng.uniform(-2, 2), y))
    d = smooth_path(L_ + [(cx - 20, top - 18), (cx + 4, top - 26), (cx + 26, top - 14)] + R_[::-1], k=.3)
    s += P(d, G('wood'), 4) + bevel(d, 'wood', 3, 5)
    for k in range(5):
        y0 = top + 40 + k * 60
        s += L(f'M{cx - 18 + k * 3} {y0} q6 30 2 56', MAT['wood'][3], 2.5, .7)
    band_y = top + 70
    band = poly_path([(cx - 33, band_y), (cx + 33, band_y), (cx + 31, band_y + 24), (cx - 31, band_y + 24)])
    s += PB(band, G('iron', 'lv'), 'iron', 2, 3)
    for dx in (-18, 0, 18):
        s += rivet(cx + dx, band_y + 12, 5, 'steel')
    for (dx, dy) in [(-26, top + 20), (22, top + 30), (-6, top - 4), (28, top + 140), (-30, top + 170)]:
        s += f'<path d="M{cx + dx - 6} {dy + 6} L{cx + dx} {dy - 8} L{cx + dx + 6} {dy + 6} Z" fill="{MAT["iron"][1]}" stroke="{OL}" stroke-width="3"/>'
    # 손잡이 — 새끼줄
    for k in range(5):
        y = gy - 20 + k * 14
        s += L(f'M{cx - 12} {y} L{cx + 12} {y + 7}', OL, 7) + L(f'M{cx - 12} {y} L{cx + 12} {y + 7}', MAT['rope'][0], 4)
    return s, {'grip': (cx, gy), 'tip': (cx, top - 20), 'w': Wc, 'h': Hc}


def sword_useless():
    """쓸모없는 검 — 녹슬고 이 빠진 짧은 칼, 헝겊 감은 자루."""
    Wc, Hc = 240, 620
    cx, gy = 120, 470
    guard_y = gy - 58
    blen, bw = 290, 38
    tip_y = guard_y - blen
    s = ''
    lt = [(cx - bw / 2, guard_y), (cx - bw / 2 + 1, guard_y - 70), (cx - bw / 2 + 9, guard_y - 82), (cx - bw / 2 + 2, guard_y - 96),
          (cx - bw / 2 + 2, tip_y + 110), (cx - bw / 2 + 11, tip_y + 96), (cx - bw / 2 + 3, tip_y + 80), (cx - bw / 2 + 4, tip_y + 40)]
    rt = [(cx + bw / 2 - 2, tip_y + 50), (cx + bw / 2 - 1, tip_y + 150), (cx + bw / 2 - 10, tip_y + 164), (cx + bw / 2 - 1, tip_y + 180),
          (cx + bw / 2, guard_y)]
    bd = poly_path(lt + [(cx - 6, tip_y + 8), (cx + 8, tip_y + 20)] + rt)
    s += P(bd, G('rust')) + bevel(bd, 'rust', 3, 5)
    inner = ''
    rng = __import__('random').Random(3)
    for k in range(7):
        x = cx + rng.uniform(-12, 12)
        y = guard_y - 30 - k * 36 + rng.uniform(-8, 8)
        inner += f'<ellipse cx="{x}" cy="{y}" rx="{rng.uniform(5, 10)}" ry="{rng.uniform(4, 9)}" fill="{MAT["rust"][3]}" opacity=".55"/>'
        inner += f'<ellipse cx="{x + 3}" cy="{y + 2}" rx="3" ry="2" fill="#c47a3a" opacity=".6"/>'
    s += clip(uid('rs'), bd, inner)
    s += L(bd, OL, 5)
    gd = poly_path([(cx - 44, guard_y - 4), (cx + 40, guard_y - 10), (cx + 42, guard_y + 8), (cx - 42, guard_y + 12)])
    s += PB(gd, G('rust', 'lv'), 'rust', 2, 3)
    hd = poly_path([(cx - 9, guard_y + 10), (cx + 9, guard_y + 10), (cx + 9, guard_y + 106), (cx - 9, guard_y + 106)])
    s += P(hd, G('rag'), 4)
    for k in range(5):
        y = guard_y + 18 + k * 18
        s += L(f'M{cx - 10} {y} L{cx + 10} {y + 10}', MAT['rag'][3], 3, .9)
    s += L(f'M{cx + 8} {guard_y + 60} q18 10 10 34', MAT['rag'][2], 4, 1)
    s += f'<circle cx="{cx}" cy="{guard_y + 118}" r="10" fill="{G("rust", "rg")}" stroke="{OL}" stroke-width="4"/>'
    return s, {'grip': (cx, gy), 'tip': (cx, tip_y), 'w': Wc, 'h': Hc}


def sword_dragon():
    """용린 기사검 — 넓은 대검. 날 가운데에 주황 용비늘, 가장자리는 강철, 구리 날개 날밑."""
    Wc, Hc = 240, 620
    cx, gy = 120, 470
    guard_y = gy - 58
    blen, bw = 372, 58
    tip_y = guard_y - blen
    s = ''
    bd = poly_path([(cx - bw / 2, guard_y), (cx - bw / 2 - 4, guard_y - 120), (cx - bw / 2, tip_y + bw * 1.3), (cx, tip_y),
                    (cx + bw / 2, tip_y + bw * 1.3), (cx + bw / 2 + 4, guard_y - 120), (cx + bw / 2, guard_y)])
    s += P(bd, G('steel')) + bevel(bd, 'steel', 3, 5)
    fuller = poly_path([(cx - bw / 2 + 11, guard_y - 6), (cx - bw / 2 + 10, tip_y + bw * 1.4), (cx, tip_y + 30),
                        (cx + bw / 2 - 10, tip_y + bw * 1.4), (cx + bw / 2 - 11, guard_y - 6)])
    s += P(fuller, 'url(#scalesO)', 3)
    s += clip(uid('dk'), fuller, F(poly_path([(cx + 6, 0), (Wc, 0), (Wc, Hc), (cx + 6, Hc)]), '#2a0c02', .28))
    s += L(fuller, MAT['copper'][0], 2.5, .9)
    s += L(bd, OL, 5)
    gw = 132
    for sx in (-1, 1):
        wd = smooth_path([(cx, guard_y - 2), (cx + sx * 26, guard_y - 20), (cx + sx * 56, guard_y - 40), (cx + sx * 66, guard_y - 26),
                          (cx + sx * 56, guard_y - 16), (cx + sx * 64, guard_y - 4), (cx + sx * 44, guard_y + 4), (cx + sx * 20, guard_y + 12)], k=.3)
        s += PB(wd, G('copper', 'lv'), 'copper', 2, 4)
    s += circ(cx, guard_y, 15, MAT['copper'][0], OL, 4) + gem(cx, guard_y, 9, 'orange', glow=False)
    hl, hw = 108, 22
    hd = poly_path([(cx - hw / 2, guard_y + 12), (cx + hw / 2, guard_y + 12), (cx + hw / 2, guard_y + 12 + hl), (cx - hw / 2, guard_y + 12 + hl)])
    s += P(hd, G('leatherD'), 4)
    for k in range(6):
        y = guard_y + 20 + k * hl / 6
        s += L(f'M{cx - hw / 2} {y} L{cx + hw / 2} {y + 8}', MAT['copper'][0], 3, .9)
    py = guard_y + 12 + hl + 12
    s += f'<circle cx="{cx}" cy="{py}" r="15" fill="{G("copper", "rg")}" stroke="{OL}" stroke-width="4"/>' + gem(cx, py, 7, 'orange', glow=False)
    return s, {'grip': (cx, gy), 'tip': (cx, tip_y), 'w': Wc, 'h': Hc}


def sword_demon():
    """마검 발가르 — 톱니 날의 검보라 대검, 가운데 룬이 보랏빛으로 타고 날밑에 눈 하나."""
    Wc, Hc = 240, 620
    cx, gy = 120, 470
    guard_y = gy - 58
    blen, bw = 384, 56
    tip_y = guard_y - blen
    s = ''
    lt, rt = [], []
    n = 9
    for i in range(n + 1):
        y = guard_y - (guard_y - tip_y - bw) * i / n
        tooth = 9 if i % 2 else 0
        lt.append((cx - bw / 2 - tooth, y - (6 if tooth else 0)))
        rt.append((cx + bw / 2 + tooth, y - (6 if tooth else 0)))
    bd = poly_path(lt + [(cx, tip_y)] + rt[::-1])
    s += L(bd, GEM['violet'][2], 22, .45, 'filter="url(#blur8)"')
    s += P(bd, 'url(#demonG)')
    s += clip(uid('dm'), bd, f'<rect x="0" y="0" width="{Wc}" height="{Hc}" fill="url(#runesV)"/>')
    s += L(f'M{cx} {guard_y - 10} L{cx} {tip_y + 60}', '#0e0716', 12, 1)
    s += glow_line(f'M{cx} {guard_y - 14} L{cx} {tip_y + 66}', GEM['violet'][2], 3.5, '#f6dcff')
    for k in range(5):
        y0 = guard_y - 44 - k * 62
        s += glow_line(f'M{cx - 10} {y0} L{cx} {y0 - 14} L{cx + 10} {y0} M{cx} {y0 - 14} L{cx} {y0 - 24}', GEM['violet'][2], 2.2, '#f6dcff')
    s += L(bd, OL, 5)
    for sx in (-1, 1):
        horn = smooth_path([(cx, guard_y + 4), (cx + sx * 30, guard_y - 6), (cx + sx * 62, guard_y - 30), (cx + sx * 84, guard_y - 62),
                            (cx + sx * 70, guard_y - 26), (cx + sx * 48, guard_y + 2), (cx + sx * 24, guard_y + 14)], k=.3)
        s += PB(horn, G('demon', 'lv'), 'demon', 2, 4) + L(horn, GEM['violet'][2], 1.6, .7)
    s += f'<ellipse cx="{cx}" cy="{guard_y + 2}" rx="20" ry="14" fill="{MAT["demon"][2]}" stroke="{OL}" stroke-width="4"/>'
    s += gem(cx, guard_y + 2, 9, 'violet', glow=True)
    s += f'<ellipse cx="{cx}" cy="{guard_y + 2}" rx="2.4" ry="8" fill="#140420"/>'
    hl, hw = 110, 22
    hd = poly_path([(cx - hw / 2, guard_y + 16), (cx + hw / 2, guard_y + 16), (cx + hw / 2, guard_y + 16 + hl), (cx - hw / 2, guard_y + 16 + hl)])
    s += P(hd, G('demon'), 4)
    for k in range(6):
        y = guard_y + 24 + k * hl / 6
        s += L(f'M{cx - hw / 2} {y} L{cx + hw / 2} {y + 8}', GEM['violet'][0], 2.5, .8)
    py = guard_y + 16 + hl + 6
    s += f'<path d="M{cx - 14} {py} L{cx + 14} {py} L{cx} {py + 34} Z" fill="{G("demon", "lv")}" stroke="{OL}" stroke-width="4"/>'
    return s, {'grip': (cx, gy), 'tip': (cx, tip_y), 'w': Wc, 'h': Hc}


WEAPON_VARIANTS = {
    # 종류 · 변형 이름 → (만드는 법, 이름, 비교용 등급)
    ('sword', 'club'): (sword_club, '낡은 몽둥이', 0),
    ('sword', 'useless'): (sword_useless, '쓸모없는 검', 2),
    ('sword', 'dragon'): (sword_dragon, '용린 기사검', 2),
    ('sword', 'demon'): (sword_demon, '마검 발가르', 3),
    ('bow', 'dragon'): (lambda: _swap_weapon(bow(2), _mat_pairs('bone', 'wyrm') + _mat_pairs('silver', 'copper')
                                            + _mat_pairs('blue', 'rustcloth') + _gem_pairs('blue', 'orange')), '용린 기사궁', 2),
    ('staff', 'dragon'): (lambda: _swap_weapon(staff(2), _mat_pairs('leatherD', 'rustcloth') + _mat_pairs('silver', 'copper')
                                              + [('url(#orbB)', 'url(#orbA)')] + _gem_pairs('blue', 'orange')), '용린 기사장', 2),
}


def _swap_weapon(res, pairs):
    body, info = res
    return swap(body, pairs), info


# 아이템 → (칸, 변형) — body-game.py 가 bodies.json 에 옮겨 적고, 게임이 이것으로 층을 고른다
ITEM_VARIANTS = {
    'dragon_mail': ('armor', 'dragon'),
    'dragon_helm': ('helmet', 'dragon'),
    'magic_helm': ('helmet', 'magic'),
    'dragon_pauldron': ('shoulder', 'dragon'),
    'club': ('weapon', 'club'),
    'useless_sword': ('weapon', 'useless'),
    'dragon_knight_sword': ('weapon', 'dragon'),
    'dragon_knight_bow': ('weapon', 'dragon'),
    'dragon_knight_staff': ('weapon', 'dragon'),
    'demon_blade': ('weapon', 'demon'),
}


def make_weapons():
    jobs, meta = [], {}
    d = os.path.join(OUT, 'weapons')
    os.makedirs(d, exist_ok=True)
    for key, fn in WEAPON_GEN.items():
        for t in TIERS:
            body, info = fn(t)
            png = os.path.join(d, f'{key}_{t}.png')
            svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{info["w"]}" height="{info["h"]}" viewBox="0 0 {info["w"]} {info["h"]}">'
                   f'<defs>{DEFS}{WDEFS}</defs>{body}</svg>')
            jobs.append((svg, png, info['w'], info['h']))
            meta[f'{key}_{t}'] = {k: v for k, v in info.items() if k not in ('w', 'h')} | {'name': WEAPON_NAMES[key][t], 'tier': t}
    for (key, v), (fn, label, t) in WEAPON_VARIANTS.items():
        body, info = fn()
        png = os.path.join(d, f'{key}_{v}.png')
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{info["w"]}" height="{info["h"]}" viewBox="0 0 {info["w"]} {info["h"]}">'
               f'<defs>{DEFS}{WDEFS}</defs>{body}</svg>')
        jobs.append((svg, png, info['w'], info['h']))
        meta[f'{key}_{v}'] = {k: val for k, val in info.items() if k not in ('w', 'h')} | {'name': label, 'tier': t, 'variant': v}
    bake_svgs(jobs)
    json.dump(meta, open(os.path.join(d, 'weapons.json'), 'w'), ensure_ascii=False, indent=1)
    print('✓ 무기', len(meta))


def register_weapons():
    """body-rig 에 새 무기를 알린다 → 'sword:2' 같은 이름으로 쓴다."""
    meta = json.load(open(os.path.join(OUT, 'weapons', 'weapons.json')))
    for key, m in meta.items():
        kind, t = key.split('_')
        BR.register_weapon(f'{kind}:{t}', os.path.join(OUT, 'weapons', f'{key}.png'), m['grip'], m['tip'], m.get('ends'))
    return meta


# ─────────────────────────────────────────────────────────────
# 굽기 · 모으기
# ─────────────────────────────────────────────────────────────
GEN = {'armor': armor, 'helmet': helmet, 'shoulder': shoulder, 'belt': belt, 'necklace': necklace, 'boots': boots, 'gloves': gloves}
PART_ORDER = {'torso': ['armor', 'belt', 'necklace'], 'armL': ['armor', 'gloves'], 'armR': ['armor', 'gloves'],
              'legL': ['armor', 'boots'], 'legR': ['armor', 'boots'], 'head': ['helmet']}


def bake_svgs(jobs):
    """jobs: [(svg 문자열, 출력 png[, 너비, 높이])] → 한 번에 굽는다."""
    os.makedirs(SVGDIR, exist_ok=True)
    lst = []
    for i, job in enumerate(jobs):
        svg, out = job[0], job[1]
        w, h = (job[2], job[3]) if len(job) > 2 else (W, H)
        sp = os.path.join(SVGDIR, f'{i:04d}.svg')
        open(sp, 'w').write(svg)
        lst.append({'svg': sp, 'out': out, 'w': w, 'h': h})
    lp = os.path.join(SVGDIR, 'list.json')
    json.dump(lst, open(lp, 'w'))
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True)


def _hex(c):
    c = c.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def recolor_hand(g, s, mat):
    """손 그림(쉬는 자세)을 재질 색으로 — 밝기를 재질의 네 단 색에 옮긴다. 선은 그대로 검게."""
    wy = g.rig[s]['wrist'][1]
    m = g.arm[s].copy()
    m[:wy - 4] = False
    rgb = g.im[..., :3].astype(np.float32)
    lum = rgb @ np.array([.3, .59, .11], np.float32)
    line = lum < 55
    body = m & ~line
    lo, hi = np.percentile(lum[body], [5, 97]) if body.sum() > 30 else (60, 230)
    t = np.clip((lum - lo) / max(1, hi - lo), 0, 1)
    b, lit, sh, dk = [_hex(c) for c in MAT[mat]]
    stops = [dk, sh, b, lit]
    tt = t * 3
    i0 = np.clip(np.floor(tt).astype(int), 0, 2)
    fr = (tt - i0)[..., None]
    lut = np.stack(stops)
    col = lut[i0] * (1 - fr) + lut[i0 + 1] * fr
    col[line] = _hex(OL) * .6 + rgb[line] * .4
    out = np.zeros((H, W, 4), np.uint8)
    out[m, :3] = col[m].clip(0, 255).astype(np.uint8)
    out[m, 3] = g.im[m, 3]
    return out, m


def post(name, slot, tier):
    """장갑 — 손 그림을 재질 색으로 칠하고, 손등 무늬(손 모양으로 오린다)와 토시를 얹는다."""
    if slot != 'gloves':
        return
    g = geo(name)
    d = os.path.join(OUT, name, f'{slot}_{tier}')
    info = json.load(open(os.path.join(d, 'info.json')))
    for s in 'LR':
        hand, m = recolor_hand(g, s, info['_handmat'])
        det = np.asarray(Image.open(os.path.join(d, f'arm{s}_det.png')).convert('RGBA')).copy()
        det[..., 3] = (det[..., 3].astype(np.float32) * (hand[..., 3] / 255.0) * (~(g.im[..., :3].astype(np.float32) @ np.array([.3, .59, .11]) < 55))).astype(np.uint8)
        cuff = np.asarray(Image.open(os.path.join(d, f'arm{s}.png')).convert('RGBA'))
        comp = BR._over(BR._over(hand, det), cuff)
        Image.fromarray(comp, 'RGBA').save(os.path.join(d, f'arm{s}.png'))


def make(names, slots, tiers):
    jobs, meta = [], []
    for n in names:
        g = geo(n)
        for slot in slots:
            if slot not in GEN:
                continue
            for t in tiers:
                res = GEN[slot](g, t)
                d = os.path.join(OUT, n, f'{slot}_{t}')
                os.makedirs(d, exist_ok=True)
                info = {}
                for part, body in res.items():
                    if part == 'pit':
                        info['pit'] = body
                        continue
                    if part.startswith('_'):
                        info[part] = body
                        continue
                    png = os.path.join(d, f'{part}.png')
                    jobs.append((svg_doc(body), png))
                    if not part.endswith('_det'):
                        info.setdefault('parts', []).append(part)
                json.dump(info, open(os.path.join(d, 'info.json'), 'w'))
                meta.append((n, slot, t))
            # 0.70.28 — 같은 등급 안의 다른 아이템(변형)
            for (vs, vname), fn in VARIANTS.items():
                if vs != slot:
                    continue
                res = fn(g)
                d = os.path.join(OUT, n, f'{slot}_{vname}')
                os.makedirs(d, exist_ok=True)
                info = {}
                for part, body in res.items():
                    if part == 'pit' or part.startswith('_'):
                        info[part] = body
                        continue
                    png = os.path.join(d, f'{part}.png')
                    jobs.append((svg_doc(body), png))
                    if not part.endswith('_det'):
                        info.setdefault('parts', []).append(part)
                json.dump(info, open(os.path.join(d, 'info.json'), 'w'))
                meta.append((n, slot, vname))
    bake_svgs(jobs)
    for n, slot, t in meta:
        post(n, slot, t)
    print('✓ gear', len(meta), '벌')


def load_piece(name, slot, tier):
    d = os.path.join(OUT, name, f'{slot}_{tier}')
    info = json.load(open(os.path.join(d, 'info.json')))
    parts = {p: np.asarray(Image.open(os.path.join(d, f'{p}.png')).convert('RGBA')) for p in info.get('parts', [])}
    return parts, info


def gear_for(name, tiers):
    """tiers: {칸: 등급} → body-rig 의 gear 딕셔너리."""
    g = {'parts': {}, 'layers': {}}
    for part, order in PART_ORDER.items():
        for slot in order:
            if slot in tiers:
                parts, info = load_piece(name, slot, tiers[slot])
                if part in parts:
                    g['parts'].setdefault(part, []).append(parts[part])
    for slot in ('shoulder',):
        if slot in tiers:
            parts, info = load_piece(name, slot, tiers[slot])
            for k in ('cape', 'padL', 'padR'):
                if k in parts:
                    g['layers'][k] = parts[k]
    if 'armor' in tiers:
        _, info = load_piece(name, 'armor', tiers['armor'])
        if info.get('pit'):
            c = info['pit'].lstrip('#')
            g['pit'] = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    if 'helmet' in tiers:
        parts, _ = load_piece(name, 'helmet', tiers['helmet'])
        if 'hairfront' in parts:
            g['layers']['hairfront'] = parts['hairfront']
    return g


if __name__ == '__main__':
    args = sys.argv[1:]
    names = [a for a in args if a in BODIES] or BODIES
    slots = [a for a in args if a in SLOTS] or SLOTS
    if 'weapons' in args or not [a for a in args if a in SLOTS]:
        make_weapons()
    if [a for a in args if a in SLOTS] or 'weapons' not in args:
        make(names, slots, TIERS)
