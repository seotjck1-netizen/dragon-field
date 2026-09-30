#!/usr/bin/env python3
"""
마을 사람(NPC) 새 그림 — 기본 몸에 머리색 · 수염 · 모자 · 옷 · 손에 든 물건 (0.70.26 미리보기).

    python3 tools/gear-art.py        # 장비 그림(위병이 입는다) — 먼저
    python3 tools/npc-art.py         # → art/npc/<id>.png (320×320 · 80×80 틀) · art/preview/npc-lineup.png

사람마다 몸 넷(남·여 × 깨끗·거친) 가운데 하나를 골라
  ① 머리색을 바꾸고(hair_mask — 눈·얼굴·옷은 안 건드린다)
  ② 수염 · 모자 · 옷을 새로 그려 몸 조각에 입히고(gear-art 의 Geo 로 몸 윤곽을 잰다)
  ③ 손에 물건(망치 · 잔 · 약병 · 지팡이 …)을 쥐여 준다.
그래서 **움직일 수 있다** — 몸과 같은 뼈대를 쓴다(걷기 한 번을 같이 굽는다).
"""
import importlib.util, json, math, os, subprocess, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')


def _load(name, file):
    sp = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', file))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


BA = _load('body_anim', 'body-anim.py')
BR = BA.BR
GA = _load('gear_art', 'gear-art.py')
GA.BR = BR
GA.register_weapons()
from importlib import reload  # noqa

P, F, L, G, PB = GA.P, GA.F, GA.L, GA.G, GA.PB
smooth_path, poly_path, clip, bevel, gem, rivet, uid = GA.smooth_path, GA.poly_path, GA.clip, GA.bevel, GA.gem, GA.rivet, GA.uid
MAT, OL, LW, W, H = GA.MAT, GA.OL, GA.LW, GA.W, GA.H
OUT = os.path.join(ROOT, 'art', 'npc')

# 옷감 몇 가지 더
MAT.update({
    'dressG': ('#4f7d45', '#73a663', '#385c31', '#243d20'),
    'dressR': ('#8e2f3a', '#b54a55', '#6a1f28', '#471219'),
    'apron': ('#efe8d8', '#ffffff', '#cfc5ad', '#a79d85'),
    'robeB': ('#7a5236', '#9c7050', '#5b3b25', '#3d2618'),
    'robeG': ('#3b6b5a', '#58917b', '#2a4f42', '#1a342b'),
    'royal': ('#a3172a', '#d0354a', '#76101f', '#4d0913'),
    'ermine': ('#f4f1ea', '#ffffff', '#d8d2c4', '#aea593'),
    'witch': ('#3a2a55', '#56417c', '#281c3d', '#180f27'),
    'turban': ('#6b3d9e', '#9165c7', '#4d2a75', '#321a50'),
    'iron': MAT['iron'],
    'hood': ('#3b3a44', '#575663', '#282730', '#18171d'),
    'scarf': ('#c23b2c', '#e2604f', '#8f2a1f', '#5e1a12'),
    'blueS': ('#3c6fae', '#5d91d0', '#2a5186', '#1a355c'),
    'glass': ('#bfe6ff', '#ffffff', '#86b8da', '#4f7e9e'),
})
_NEW = ['dressG', 'dressR', 'apron', 'robeB', 'robeG', 'royal', 'ermine', 'witch', 'turban', 'hood', 'scarf', 'blueS', 'glass']


def _grads_for(keys):
    saved = dict(MAT)
    try:
        for k in list(MAT.keys()):
            if k not in keys:
                del MAT[k]
        return GA._grads()
    finally:
        MAT.clear()
        MAT.update(saved)


DEFS_EXTRA = _grads_for(_NEW) + """
<radialGradient id="potion" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#e6ffd6"/><stop offset=".45" stop-color="#6fe07a"/><stop offset="1" stop-color="#1f7a3a"/></radialGradient>
<radialGradient id="flame" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffb640"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></radialGradient>
<radialGradient id="stoneG" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#b9c0c9"/><stop offset=".55" stop-color="#7d8591"/><stop offset="1" stop-color="#4b525c"/></radialGradient>
<pattern id="ermineP" width="26" height="22" patternUnits="userSpaceOnUse">
  <rect width="26" height="22" fill="#f4f1ea"/><path d="M8 5 l3 7 l-3 -2 l-3 2 z M21 15 l3 7 l-3 -2 l-3 2 z" fill="#1a1210"/>
</pattern>
"""


def svg(body, w=W, h=H):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{GA.DEFS}{GA.WDEFS}{DEFS_EXTRA}</defs>{body}</svg>')


# ─────────────────────────────────────────────────────────────
# 머리색
# ─────────────────────────────────────────────────────────────
HAIR = {
    'black': ('#1d1a22', '#3a3445', '#6a6180'),
    'auburn': ('#4a160c', '#8a3218', '#d0663a'),
    'blonde': ('#6b4a18', '#c79a3c', '#f6dc8a'),
    'grey': ('#3b3b40', '#8a8a92', '#d6d6dc'),
    'white': ('#6b6b74', '#c9c9d0', '#ffffff'),
    'teal': ('#10353a', '#2f7f84', '#8fe0d8'),
    'plum': ('#1e0f2c', '#4d2a6e', '#9a6cc8'),
    'ginger': ('#5a220a', '#c0591d', '#f7a25a'),
    'darkbrown': ('#1f120b', '#4a2d1c', '#8a5a3a'),
}


def hair_mask(g):
    im = g.im.astype(int)
    r, gg, b = im[..., 0], im[..., 1], im[..., 2]
    lum = 0.3 * r + 0.59 * gg + 0.11 * b
    mx, mn = im[..., :3].max(-1), im[..., :3].min(-1)
    yy, xx = np.mgrid[0:H, 0:W]
    headp = (g.lab == 1) | (g.lab == 3)
    region = headp | ((g.lab == 2) & (yy < g.neck[1] + 230) & (((lum < 135) & ((mx - mn) > 26)) | (lum < 60)))
    skin = g.skin & (g.lab == 1)
    n_, cc, st, _ = cv2.connectedComponentsWithStats(skin.astype(np.uint8), connectivity=8)
    big = 1 + np.argmax(st[1:, 4])
    face = ndi.binary_fill_holes(cc == big)
    for k in range(1, n_):
        if k != big and st[k, 4] > 300:
            face |= ndi.binary_fill_holes(cc == k)
    face = ndi.binary_dilation(face, iterations=2)
    fx0, fy0, fx1, fy1 = g.face_box
    white = (g.lab == 1) & (lum > 185) & ((mx - mn) < 40) & (xx > fx0) & (xx < fx1) & (yy > fy0 + 30) & (yy < fy1 - 30)
    n2, c2, s2, _ = cv2.connectedComponentsWithStats(white.astype(np.uint8), connectivity=8)
    eyes = np.zeros_like(white)
    for k in range(1, n2):
        if s2[k, 4] > 25:
            eyes |= c2 == k
    eyes = ndi.binary_dilation(eyes, iterations=16)
    brown = (r >= gg - 3) & (gg >= b - 8) & (((r - b) > 10) | (lum < 70)) & (lum < 215)
    grey = ((mx - mn) < 14) & (lum > 70)
    cand = region & brown & ~grey & ~face & ~eyes
    n3, c3, s3, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), connectivity=8)
    touch = np.zeros(n3, bool)
    touch[np.unique(c3[cand & headp])] = True
    touch[0] = False
    return touch[c3]


def _hex(c):
    c = c.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def recolor_hair(g, color):
    """머리칼만 새 색으로 — 밝기를 새 색의 세 단(그늘·바탕·빛)에 옮긴다. 선(아주 어두운 점)은 그대로."""
    im = g.im.copy()
    if not color:
        return im
    m = hair_mask(g)
    rgb = im[..., :3].astype(np.float32)
    lum = rgb @ np.array([.3, .59, .11], np.float32)
    lo, hi = np.percentile(lum[m], [4, 98])
    t = np.clip((lum - lo) / max(1, hi - lo), 0, 1)
    dk, md, lt = [_hex(c) for c in HAIR[color]]
    line = _hex(OL)
    c1 = np.where(t[..., None] < .5, dk + (md - dk) * (t[..., None] * 2), md + (lt - md) * ((t[..., None] - .5) * 2))
    ink = np.clip((lum - 18) / 40, 0, 1)[..., None]      # 거의 검은 선은 선으로 남긴다
    new = line * (1 - ink) + c1 * ink
    im[m, :3] = new[m].clip(0, 255).astype(np.uint8)
    return im


# ─────────────────────────────────────────────────────────────
# 얼굴 · 머리 장식
# ─────────────────────────────────────────────────────────────
def face_geo(g):
    c = GA.geo(GA.CLEAN[g.name])
    fx0, fy0, fx1, fy1 = c.face_box
    return {'cx': (fx0 + fx1) / 2, 'x0': fx0, 'x1': fx1, 'chin': fy1, 'brow': c.brow_y, 'top': c.hair_top,
            'mouth': fy1 - (38 if not c.female else 30), 'eye': c.brow_y + 0.46 * (fy1 - c.brow_y)}


def beard(g, color, kind='long'):
    f = face_geo(g)
    cx, ch, x0, x1, my = f['cx'], f['chin'], f['x0'], f['x1'], f['mouth']
    dk, md, lt = HAIR[color]
    out = ''
    # 안쪽 선은 **아랫입술 바로 밑**을 지난다 — 턱을 덮고 입은 보인다
    inner = [(x1 - 26, my - 30), (cx + 30, my + 10), (cx, my + 16), (cx - 30, my + 10), (x0 + 26, my - 30)]
    if kind == 'long':
        pts = [(x0 + 14, my - 40), (x0 + 24, my + 16), (cx - 46, ch + 40), (cx - 24, ch + 110), (cx, ch + 150), (cx + 24, ch + 110),
               (cx + 46, ch + 40), (x1 - 24, my + 16), (x1 - 14, my - 40)] + inner
    elif kind == 'full':
        pts = [(x0 + 12, my - 44), (x0 + 20, my + 20), (cx - 44, ch + 30), (cx, ch + 46), (cx + 44, ch + 30),
               (x1 - 20, my + 20), (x1 - 12, my - 44)] + inner
    else:   # goatee
        pts = [(cx - 26, my + 14), (cx - 16, ch + 18), (cx, ch + 58), (cx + 16, ch + 18), (cx + 26, my + 14), (cx, my + 22)]
    d = smooth_path(pts, k=.4)
    out += P(d, md, 4)
    out += clip(uid('bd'), d, ''.join(L(f'M{cx + dx} {my + 14} Q{cx + dx * 1.3} {ch + 40} {cx + dx * .8} {ch + 110}', dk, 3, .7)
                                     for dx in (-26, -10, 8, 24)) + F(poly_path([(x0, 0), (cx - 30, 0), (cx - 30, H), (x0, H)]), lt, .35))
    # 콧수염
    for sx in (-1, 1):
        mu = smooth_path([(cx + sx * 4, my - 14), (cx + sx * 34, my - 20), (cx + sx * 54, my - 4), (cx + sx * 40, my + 2), (cx + sx * 10, my - 2)], k=.4)
        out += P(mu, md, 3.5)
    return out


def hat(g, kind):
    h = GA.head_geo(g)
    cx, top, b, x0, x1 = h['cx'], h['top'], h['brim'], h['x0'], h['x1']
    out = ''
    if kind == 'witch':
        brim = smooth_path([(x0 - 70, b + 12), (cx, b - 30), (x1 + 70, b + 12), (x1 + 40, b + 30), (cx, b + 14), (x0 - 40, b + 30)], k=.4)
        cone = smooth_path([(x0 + 10, b + 2), (cx - 30, top - 30), (cx + 10, top - 140), (cx + 70, top - 200), (cx + 60, top - 150), (cx + 40, top - 40), (x1 - 6, b + 2)], k=.35)
        out += PB(brim, G('witch'), 'witch') + PB(cone, G('witch'), 'witch')
        band = smooth_path([(x0 + 8, b - 14), (x1 - 8, b - 14), (x1 - 4, b + 6), (x0 + 4, b + 6)], k=.2)
        out += P(band, G('purple'), 4) + P(poly_path([(cx - 14, b - 20), (cx + 14, b - 20), (cx + 14, b + 10), (cx - 14, b + 10)]), 'none', 5, f'stroke="{MAT["gold"][0]}"')
        out += gem(cx + 66, top - 196, 6, 'purple')
    elif kind == 'crown':
        base = smooth_path([(x0 + 10, b - 4), (x1 - 10, b - 4), (x1 - 12, b - 44), (x0 + 12, b - 44)], k=.1)
        pts = [(x0 + 8, b - 40)]
        n = 5
        for i in range(n + 1):
            x = x0 + 8 + (x1 - x0 - 16) * i / n
            pts += [(x, b - 40 - (70 if i % 2 == 0 else 34))]
        pts += [(x1 - 8, b - 40)]
        spikes = poly_path(pts + [(x1 - 8, b - 30), (x0 + 8, b - 30)])
        out += PB(spikes, G('gold', 'lv'), 'gold')
        for i in range(0, n + 1, 2):
            x = x0 + 8 + (x1 - x0 - 16) * i / n
            out += f'<circle cx="{x}" cy="{b - 110}" r="9" fill="{G("gold", "rg")}" stroke="{OL}" stroke-width="3"/>'
        out += PB(base, G('gold', 'lv'), 'gold')
        for i, k in enumerate(('red', 'blue', 'red')):
            out += gem(cx + (i - 1) * 56, b - 24, 10 if i == 1 else 8, k, glow=False)
    elif kind == 'kerchief':
        d = GA.dome_path(h, lift=-8, widen=6, brim_dip=4)
        out += PB(d, G('scarf'), 'scarf')
        out += clip(uid('kc'), d, ''.join(f'<circle cx="{x0 + 20 + i * 34}" cy="{top + 50 + (i % 2) * 40}" r="7" fill="#ffffff" opacity=".85"/>' for i in range(8)))
        kx, ky = x1 - 6, b - 18
        out += P(smooth_path([(kx, ky), (kx + 40, ky + 20), (kx + 30, ky + 60), (kx + 14, ky + 24)], k=.4), G('scarf'), 4)
        out += f'<ellipse cx="{kx}" cy="{ky}" rx="13" ry="11" fill="{MAT["scarf"][0]}" stroke="{OL}" stroke-width="4"/>'
    elif kind == 'bandana':
        band = smooth_path([(x0 - 2, b - 10), (cx, b - 30), (x1 + 2, b - 10), (x1 + 4, b + 18), (cx, b), (x0 - 4, b + 18)], k=.3)
        out += PB(band, G('scarf'), 'scarf')
        kx, ky = x0 + 2, b + 4
        out += P(smooth_path([(kx, ky), (kx - 34, ky + 18), (kx - 40, ky + 50), (kx - 14, ky + 20)], k=.4), G('scarf'), 4)
        out += P(smooth_path([(kx, ky), (kx - 20, ky + 34), (kx - 8, ky + 60), (kx + 2, ky + 24)], k=.4), MAT['scarf'][2], 4)
    elif kind == 'goggles':
        for sx in (-1, 1):
            out += f'<circle cx="{cx + sx * 42}" cy="{b - 36}" r="24" fill="{G("glass", "rg")}" stroke="{OL}" stroke-width="5"/>'
            out += f'<circle cx="{cx + sx * 42}" cy="{b - 36}" r="24" fill="none" stroke="{MAT["gold"][0]}" stroke-width="6"/>'
        out = L(f'M{x0 - 4} {b - 30} Q{cx} {b - 60} {x1 + 4} {b - 30}', MAT['leatherD'][0], 12) + out
    elif kind == 'turban':
        d = GA.dome_path(h, lift=10, widen=16, brim_dip=0)
        out += PB(d, G('turban'), 'turban')
        for k in range(4):
            y = b - 20 - k * 32
            out += clip(uid('tb'), d, L(f'M{x0 - 20} {y + 20} Q{cx} {y - 16} {x1 + 20} {y + 12}', MAT['turban'][3], 5, .7))
        out += gem(cx, b - 44, 15, 'amber')
        out += P(smooth_path([(cx - 6, b - 60), (cx + 4, top - 50), (cx + 24, top - 70), (cx + 14, top - 20), (cx + 10, b - 60)], k=.3), G('bone'), 3)
    elif kind == 'hood':
        d = smooth_path([(x0 - 30, b + 110), (x0 - 36, b - 40), (cx - 40, top - 16), (cx + 40, top - 16), (x1 + 36, b - 40), (x1 + 30, b + 110),
                         (x1 - 6, b + 40), (x1 - 12, b - 20), (cx, b - 34), (x0 + 12, b - 20), (x0 + 6, b + 40)], k=.35)
        out += PB(d, G('hood'), 'hood')
    elif kind == 'glasses':
        e = face_geo(g)
        for sx in (-1, 1):
            out += f'<circle cx="{e["cx"] + sx * 50}" cy="{e["eye"] + 4}" r="30" fill="#bfe6ff" fill-opacity=".18" stroke="{MAT["gold"][2]}" stroke-width="5"/>'
        out += L(f'M{e["cx"] - 20} {e["eye"]} Q{e["cx"]} {e["eye"] - 10} {e["cx"] + 20} {e["eye"]}', MAT['gold'][2], 4)
    elif kind == 'strawhat':
        brim = smooth_path([(x0 - 50, b + 6), (cx, b - 24), (x1 + 50, b + 6), (x1 + 20, b + 24), (cx, b + 10), (x0 - 20, b + 24)], k=.4)
        crown_ = smooth_path([(x0 + 22, b + 2), (x0 + 30, top + 30), (cx, top + 10), (x1 - 30, top + 30), (x1 - 22, b + 2)], k=.4)
        out += PB(brim, G('rope'), 'rope') + PB(crown_, G('rope'), 'rope')
        out += P(smooth_path([(x0 + 24, b - 20), (x1 - 24, b - 20), (x1 - 22, b - 2), (x0 + 22, b - 2)], k=.2), G('scarf'), 3.5)
    return out


# ─────────────────────────────────────────────────────────────
# 옷
# ─────────────────────────────────────────────────────────────
def robe(g, mat, bottom=None, flare=46, collar='round', trim=None, sleeves='long', belt=None, fur=False):
    """긴 옷(로브·드레스) — 몸통 조각에 발목까지. 소매는 팔 조각에."""
    r = g.rig
    ank = min(r['legL']['ankle'][1], r['legR']['ankle'][1])
    bot = bottom if bottom is not None else ank - 16
    x0, x1 = g.torso(g.hem_y - 6)
    pts, _ = GA.torso_outline(g, collar, pad=6, bottom=bot, flare=flare,
                              hem_pts=GA.hem_zigzag(x0 - 6 - flare - 2, x1 + 6 + flare + 2, bot, 10, 5))
    d = smooth_path(pts, k=0.32)
    c = MAT[mat]
    cx = g.cx
    body = P(d, G(mat))
    inner = F(poly_path([(cx + 30, 0), (W, 0), (W, H), (cx + 60, H)]), c[2], .55)
    for dx in (-60, -22, 22, 60):
        inner += L(f'M{cx + dx * .5} {g.waist_y + 40} Q{cx + dx * .9} {(g.waist_y + bot) / 2} {cx + dx * 1.3} {bot}', c[3], 3.5, .55)
    if trim:
        inner += L(d, MAT[trim][0], 14, 1) + L(d, MAT[trim][1], 3, .9)
    if fur:
        inner += L(poly_path(GA.hem_zigzag(x0 - 60, x1 + 60, bot, 10, 5), closed=False), 'url(#ermineP)', 40, 1)
        inner += L(f'M{cx} {g.neck[1] + 20} L{cx} {bot}', 'url(#ermineP)', 36, 1)
    body += clip(uid('rb'), d, inner) + bevel(d, mat, 6, 10) + L(d, OL, LW)
    if belt:
        by = g.waist_y + 4
        l_, r_ = g.torso(by)
        bd = smooth_path([(l_ - 14, by - 12), (cx, by - 8), (r_ + 14, by - 12), (r_ + 14, by + 12), (cx, by + 16), (l_ - 14, by + 12)], k=.3)
        body += PB(bd, G(belt), belt, k=3, bw=5)
    out = {'torso': body}
    if sleeves:
        for s in 'LR':
            h0 = r[s]['armhole'][0][1] + 10
            y1 = r[s]['wrist'][1] - 6 if sleeves == 'long' else r[s]['elbow'][1] - 10
            wave = 14 if sleeves == 'long' else 6
            da = smooth_path(GA.arm_band(g, s, h0, y1, pad=6 if sleeves == 'long' else 5, bottom_wave=wave), k=.3)
            sv = P(da, G(mat)) + bevel(da, mat, 4, 7) + L(da, OL, LW)
            if trim:
                al, ar = g.armw(s, y1 - 8)
                sv += L(f'M{al - 8} {y1 - 6} L{ar + 8} {y1 - 6}', MAT[trim][0], 9)
            if fur:
                al, ar = g.armw(s, y1 - 8)
                sv += L(f'M{al - 10} {y1 - 4} L{ar + 10} {y1 - 4}', 'url(#ermineP)', 22)
            out['arm' + s] = sv
    return out


def apron(g, mat='apron', top=None, bottom=None, bib=True, pocket=True, trim=None):
    cx = g.cx
    r = g.rig
    wy = g.waist_y
    bot = bottom if bottom is not None else r['legL']['knee'][1] + 30
    l_, r_ = g.torso(wy + 30)
    hw = (r_ - l_) / 2 + 6
    pts = [(cx - hw * .9, wy - 6), (cx + hw * .9, wy - 6), (cx + hw * 1.15, bot), (cx - hw * 1.15, bot)]
    d = smooth_path(pts, k=.12)
    out = P(d, G(mat)) + bevel(d, mat, 5, 8)
    if trim:
        out += clip(uid('ap'), d, L(d, MAT[trim][0], 12))
    if pocket:
        pk = poly_path([(cx - 36, wy + 50), (cx + 36, wy + 50), (cx + 34, wy + 96), (cx - 34, wy + 96)])
        out += P(pk, MAT[mat][2], 3) + L(f'M{cx} {wy + 50} L{cx} {wy + 96}', MAT[mat][3], 2.5)
    out += L(d, OL, LW)
    if bib:
        by = top if top is not None else g.neck[1] + 70
        bd = smooth_path([(cx - 48, by), (cx + 48, by), (cx + 52, wy + 2), (cx - 52, wy + 2)], k=.1)
        out = P(bd, G(mat)) + bevel(bd, mat, 4, 7) + L(bd, OL, LW) + out
        for sx in (-1, 1):
            out += L(f'M{cx + sx * 44} {by + 4} L{cx + sx * 64} {g.neck[1] + 16}', OL, 11) + L(f'M{cx + sx * 44} {by + 4} L{cx + sx * 64} {g.neck[1] + 16}', MAT[mat][2], 6)
    # 허리끈
    l0, r0 = g.torso(wy)
    out += L(f'M{l0 - 8} {wy - 2} Q{cx} {wy + 6} {r0 + 8} {wy - 2}', OL, 12) + L(f'M{l0 - 8} {wy - 2} Q{cx} {wy + 6} {r0 + 8} {wy - 2}', MAT[mat][2], 7)
    return out


def vest(g, mat, collar='V', bottom=None, trim=None, buttons=None):
    pts, _ = GA.torso_outline(g, collar, pad=8, bottom=bottom or g.waist_y + 40, flare=6)
    d = smooth_path(pts, k=.3)
    out = P(d, G(mat)) + bevel(d, mat, 5, 9)
    if trim:
        out += clip(uid('vs'), d, L(d, MAT[trim][0], 12) + L(d, MAT[trim][1], 3, .9))
    out += L(d, OL, LW)
    if buttons:
        for k in range(4):
            out += f'<circle cx="{g.cx}" cy="{g.neck[1] + 70 + k * 36}" r="6" fill="{MAT[buttons][0]}" stroke="{OL}" stroke-width="2.5"/>'
    return out


def cloak(g, mat, length=None, spread=150, trim=None):
    c = GA.geo(GA.CLEAN[g.name])
    r = c.rig
    hl, hr = r['L']['armhole'][0], r['R']['armhole'][0]
    ytop = hl[1] + 2
    length = length or g.hem_y + 80
    cx = g.cx
    pts = [(hl[0] + 10, ytop), (cx, ytop - 6), (hr[0] - 10, ytop), (hr[0] + 44, ytop + 60), (cx + spread * .8, (ytop + length) / 2),
           (cx + spread, length - 8)]
    for i in range(1, 6):
        pts.append((cx + spread - 2 * spread * i / 6, length + (12 if i % 2 else -4)))
    pts += [(cx - spread, length - 8), (cx - spread * .8, (ytop + length) / 2), (hl[0] - 44, ytop + 60)]
    d = smooth_path(pts, k=.4)
    out = P(d, G(mat)) + clip(uid('ck'), d, F(poly_path([(cx - 110, 0), (cx + 110, 0), (cx + 140, H), (cx - 140, H)]), MAT[mat][3], .45))
    if trim:
        out += L(d, MAT[trim][0], 10)
    out += L(d, OL, 4)
    return out


def merge_parts(*ds):
    out = {}
    for d in ds:
        for k, v in d.items():
            out[k] = out.get(k, '') + v
    return out


# ─────────────────────────────────────────────────────────────
# 손에 드는 것
# ─────────────────────────────────────────────────────────────
def prop_svg(kind):
    """(속, 정보) — 무기와 같은 꼴: 제 틀에 세워 그리고 grip(쥐는 점)·tip(끝) 을 준다."""
    s = ''
    if kind == 'hammer':
        Wc, Hc = 220, 520
        cx, gy = 110, 380
        s += PB(poly_path([(cx - 9, 150), (cx + 9, 150), (cx + 10, 470), (cx - 10, 470)]), G('wood'), 'wood', 2, 4)
        head = smooth_path([(cx - 70, 70), (cx + 60, 70), (cx + 64, 150), (cx - 74, 150)], k=.08)
        s += PB(head, G('iron', 'lv'), 'iron', 3, 6)
        s += PB(poly_path([(cx - 90, 84), (cx - 70, 80), (cx - 70, 140), (cx - 90, 136)]), G('iron'), 'iron', 2, 3)
        for k in range(3):
            s += L(f'M{cx - 10} {gy - 30 + k * 26} L{cx + 10} {gy - 24 + k * 26}', MAT['leather'][3], 3)
        return s, {'grip': (cx, gy), 'tip': (cx, 70), 'w': Wc, 'h': Hc}
    if kind == 'bighammer':
        Wc, Hc = 260, 600
        cx, gy = 130, 450
        s += PB(poly_path([(cx - 10, 150), (cx + 10, 150), (cx + 11, 560), (cx - 11, 560)]), G('leatherD'), 'leatherD', 2, 4)
        head = smooth_path([(cx - 84, 60), (cx + 84, 60), (cx + 90, 156), (cx - 90, 156)], k=.08)
        s += PB(head, G('steel', 'lv'), 'steel', 3, 6)
        s += clip(uid('bh'), head, L(f'M{cx - 90} 108 L{cx + 90} 108', MAT['gold'][0], 14) + L(f'M{cx - 90} 104 L{cx + 90} 104', MAT['gold'][1], 3))
        s += gem(cx, 108, 11, 'blue', glow=False)
        return s, {'grip': (cx, gy), 'tip': (cx, 60), 'w': Wc, 'h': Hc}
    if kind == 'mug':
        Wc, Hc = 200, 200
        cx, gy = 80, 110
        body = smooth_path([(cx - 42, 60), (cx + 42, 60), (cx + 40, 170), (cx - 40, 170)], k=.1)
        s += f'<path d="M{cx + 40} 84 q44 6 40 40 q-4 34 -40 30" fill="none" stroke="{OL}" stroke-width="16"/><path d="M{cx + 40} 84 q44 6 40 40 q-4 34 -40 30" fill="none" stroke="{MAT["wood"][0]}" stroke-width="9"/>'
        s += PB(body, G('wood'), 'wood', 3, 5)
        for y in (80, 150):
            s += L(f'M{cx - 42} {y} L{cx + 42} {y}', MAT['iron'][2], 7)
        foam = smooth_path([(cx - 50, 64), (cx - 40, 30), (cx - 10, 36), (cx + 10, 22), (cx + 40, 34), (cx + 52, 62)], k=.4)
        s += P(foam, '#fffaf0', 4) + F(smooth_path([(cx - 36, 48), (cx - 10, 42), (cx + 20, 40), (cx + 34, 52)], closed=False), '#e9dcc0', .6)
        return s, {'grip': (cx, gy), 'tip': (cx, 20), 'w': Wc, 'h': Hc}
    if kind == 'flask':
        Wc, Hc = 180, 240
        cx, gy = 90, 190
        s += f'<circle cx="{cx}" cy="120" r="70" fill="#6fe07a" opacity=".35" filter="url(#blur8)"/>'
        fl = smooth_path([(cx - 14, 40), (cx + 14, 40), (cx + 14, 80), (cx + 54, 130), (cx + 40, 190), (cx - 40, 190), (cx - 54, 130), (cx - 14, 80)], k=.3)
        s += P(fl, 'url(#potion)', 5) + F(smooth_path([(cx - 30, 120), (cx - 18, 96), (cx - 8, 104), (cx - 20, 150)], k=.4), '#ffffff', .7)
        s += P(poly_path([(cx - 18, 26), (cx + 18, 26), (cx + 16, 46), (cx - 16, 46)]), G('wood'), 3)
        for (x, y, r) in ((cx + 8, 12, 7), (cx - 10, -4, 5), (cx + 16, -18, 4)):
            s += f'<circle cx="{x}" cy="{y + 20}" r="{r}" fill="#b9ffc2" stroke="{OL}" stroke-width="2"/>'
        return s, {'grip': (cx, gy), 'tip': (cx, 0), 'w': Wc, 'h': Hc}
    if kind == 'scepter':
        Wc, Hc = 180, 520
        cx, gy = 90, 380
        s += PB(poly_path([(cx - 9, 100), (cx + 9, 100), (cx + 9, 500), (cx - 9, 500)]), G('gold', 'lg'), 'gold', 2, 4)
        for y in (160, 300, 440):
            s += PB(smooth_path([(cx - 16, y), (cx + 16, y), (cx + 16, y + 16), (cx - 16, y + 16)], k=.2), G('gold', 'lv'), 'gold', 2, 3)
        s += f'<circle cx="{cx}" cy="70" r="46" fill="#ff5a5a" opacity=".35" filter="url(#blur8)"/>'
        cr = smooth_path([(cx - 40, 100), (cx - 44, 50), (cx - 16, 70), (cx, 26), (cx + 16, 70), (cx + 44, 50), (cx + 40, 100)], k=.2)
        s += PB(cr, G('gold', 'lv'), 'gold', 2, 4) + gem(cx, 84, 13, 'red', glow=False)
        return s, {'grip': (cx, gy), 'tip': (cx, 26), 'w': Wc, 'h': Hc}
    if kind == 'broom':
        Wc, Hc = 220, 640
        cx, gy = 110, 330
        s += PB(poly_path([(cx - 8, 30), (cx + 8, 30), (cx + 9, 470), (cx - 9, 470)]), G('wood'), 'wood', 2, 4)
        br = smooth_path([(cx - 20, 460), (cx + 20, 460), (cx + 60, 620), (cx, 632), (cx - 60, 620)], k=.3)
        s += PB(br, G('rope'), 'rope', 3, 5)
        for dx in (-40, -20, 0, 20, 40):
            s += L(f'M{cx + dx * .3} 470 L{cx + dx} 624', MAT['rope'][3], 2.5, .8)
        s += L(f'M{cx - 22} 480 L{cx + 22} 480', MAT['witch'][0], 10) + gem(cx, 60, 8, 'purple')
        return s, {'grip': (cx, gy), 'tip': (cx, 30), 'w': Wc, 'h': Hc}
    if kind == 'spear':
        Wc, Hc = 200, 780
        cx, gy = 100, 470
        s += PB(poly_path([(cx - 8, 120), (cx + 8, 120), (cx + 8, 760), (cx - 8, 760)]), G('wood'), 'wood', 2, 4)
        head = smooth_path([(cx, 20), (cx + 26, 90), (cx + 12, 130), (cx - 12, 130), (cx - 26, 90)], k=.2)
        s += PB(head, G('steel', 'lg'), 'steel', 2, 4) + L(f'M{cx} 30 L{cx} 126', MAT['steel'][1], 3)
        s += PB(poly_path([(cx - 44, 126), (cx + 44, 126), (cx + 30, 146), (cx - 30, 146)]), G('silver'), 'silver', 2, 3)
        s += P(smooth_path([(cx + 10, 148), (cx + 44, 170), (cx + 36, 220), (cx + 12, 184)], k=.4), G('blue'), 3.5)
        return s, {'grip': (cx, gy), 'tip': (cx, 20), 'w': Wc, 'h': Hc}
    if kind == 'lantern':
        Wc, Hc = 200, 300
        cx, gy = 100, 40
        s += f'<circle cx="{cx}" cy="170" r="80" fill="url(#flame)" opacity=".9"/>'
        s += L(f'M{cx} 30 L{cx} 90', OL, 8) + f'<circle cx="{cx}" cy="40" r="16" fill="none" stroke="{OL}" stroke-width="8"/><circle cx="{cx}" cy="40" r="16" fill="none" stroke="{MAT["iron"][0]}" stroke-width="4"/>'
        cage = poly_path([(cx - 40, 110), (cx + 40, 110), (cx + 46, 240), (cx - 46, 240)])
        s += P(cage, '#ffd06a', 5) + f'<ellipse cx="{cx}" cy="180" rx="16" ry="26" fill="#fff4c0"/>'
        for x in (cx - 20, cx, cx + 20):
            s += L(f'M{x} 110 L{x * 1.0 + (x - cx) * .15} 240', OL, 4)
        s += PB(smooth_path([(cx - 52, 90), (cx + 52, 90), (cx + 44, 114), (cx - 44, 114)], k=.2), G('iron'), 'iron', 2, 3)
        s += PB(smooth_path([(cx - 54, 238), (cx + 54, 238), (cx + 50, 258), (cx - 50, 258)], k=.2), G('iron'), 'iron', 2, 3)
        return s, {'grip': (cx, gy), 'tip': (cx, 300), 'w': Wc, 'h': Hc}
    if kind == 'gemstone':
        Wc, Hc = 200, 200
        cx, gy = 100, 140
        s += f'<circle cx="{cx}" cy="80" r="66" fill="#ffc46a" opacity=".45" filter="url(#blur8)"/>'
        pts = [(cx, 20), (cx + 44, 60), (cx + 30, 130), (cx - 30, 130), (cx - 44, 60)]
        s += P(poly_path(pts), GA.GEM['amber'][0], 4)
        s += F(poly_path([(cx, 20), (cx - 44, 60), (cx - 10, 70)]), '#fff0c0', .8) + F(poly_path([(cx, 20), (cx + 44, 60), (cx + 10, 70)]), '#ffb24a', .8)
        s += L(f'M{cx - 44} 60 L{cx + 44} 60 M{cx - 10} 70 L{cx} 130 L{cx + 10} 70', '#a8621a', 2.5)
        return s, {'grip': (cx, gy), 'tip': (cx, 20), 'w': Wc, 'h': Hc}
    if kind == 'basket':
        Wc, Hc = 240, 240
        cx, gy = 120, 40
        s += f'<path d="M{cx - 70} 120 Q{cx} -10 {cx + 70} 120" fill="none" stroke="{OL}" stroke-width="16"/><path d="M{cx - 70} 120 Q{cx} -10 {cx + 70} 120" fill="none" stroke="{MAT["rope"][0]}" stroke-width="8"/>'
        for (x, y, c) in ((cx - 36, 116, '#d9362c'), (cx, 108, '#e8b23a'), (cx + 36, 116, '#d9362c'), (cx - 16, 96, '#7cc04a')):
            s += f'<circle cx="{x}" cy="{y}" r="22" fill="{c}" stroke="{OL}" stroke-width="3.5"/><ellipse cx="{x - 7}" cy="{y - 8}" rx="6" ry="4" fill="#fff" opacity=".6"/>'
        bk = smooth_path([(cx - 84, 120), (cx + 84, 120), (cx + 70, 210), (cx - 70, 210)], k=.15)
        s += PB(bk, G('rope'), 'rope', 3, 5)
        for k in range(4):
            s += clip(uid('bk'), bk, L(f'M0 {136 + k * 20} L{Wc} {140 + k * 20}', MAT['rope'][3], 3))
        return s, {'grip': (cx, gy), 'tip': (cx, 220), 'w': Wc, 'h': Hc}
    if kind == 'keys':
        Wc, Hc = 160, 200
        cx, gy = 80, 30
        s += f'<circle cx="{cx}" cy="50" r="26" fill="none" stroke="{OL}" stroke-width="10"/><circle cx="{cx}" cy="50" r="26" fill="none" stroke="{MAT["iron"][0]}" stroke-width="5"/>'
        for k, ang in enumerate((-24, 0, 24)):
            a = math.radians(90 + ang)
            x1_, y1_ = cx + math.cos(a) * 28, 50 + math.sin(a) * 28
            x2_, y2_ = cx + math.cos(a) * 130, 50 + math.sin(a) * 130
            s += L(f'M{x1_} {y1_} L{x2_} {y2_}', OL, 10) + L(f'M{x1_} {y1_} L{x2_} {y2_}', MAT['iron'][1], 5)
            s += L(f'M{x2_} {y2_} l{12} 0 M{x2_ - 8 * math.cos(a)} {y2_ - 8 * math.sin(a)} l12 0', OL, 5)
        return s, {'grip': (cx, gy), 'tip': (cx, 190), 'w': Wc, 'h': Hc}
    raise KeyError(kind)


def make_props(kinds):
    d = os.path.join(OUT, '_props')
    os.makedirs(d, exist_ok=True)
    jobs, meta = [], {}
    for k in kinds:
        body, info = prop_svg(k)
        png = os.path.join(d, f'{k}.png')
        jobs.append((svg(body, info['w'], info['h']), png, info['w'], info['h']))
        meta[k] = info
    GA.bake_svgs(jobs)
    for k, info in meta.items():
        BR.register_weapon(f'prop:{k}', os.path.join(d, f'{k}.png'), info['grip'], info['tip'])


# ─────────────────────────────────────────────────────────────
# 마을 사람들
# ─────────────────────────────────────────────────────────────
def npc_defs():
    return {
        'shopkeeper': dict(name='잡화상 마르타', body='f1', hair='auburn', hat='kerchief',
                           outfit=lambda g: merge_parts(robe(g, 'dressG', flare=38, sleeves='short', trim='gold'), {'torso': apron(g)}),
                           gear={'boots': 1}, prop=('basket', 12)),
        'blacksmith': dict(name='대장장이 고르드', body='m1', hair='black', hat='bandana', beard=('black', 'full'),
                           outfit=lambda g: {'torso': apron(g, 'leatherD', bottom=g.rig['legL']['knee'][1] + 20, trim='iron')},
                           gear={'gloves': 1, 'boots': 1}, prop=('hammer', 150)),
        'royal_smith': dict(name='왕실 대장장이 도르한', body='m1', hair='grey', hat='goggles', beard=('grey', 'full'),
                            outfit=lambda g: merge_parts({'torso': vest(g, 'blueS', collar='round', bottom=g.waist_y + 20, trim='gold')},
                                                         {'torso': apron(g, 'leather', bib=False, trim='gold')}),
                            gear={'gloves': 2, 'boots': 2}, prop=('bighammer', 150)),
        'alchemist': dict(name='연금술사 세피', body='f1', hair='teal', hat='glasses',
                          outfit=lambda g: robe(g, 'robeG', flare=44, trim='gold', belt='leather'),
                          gear={'necklace': 2, 'boots': 1}, prop=('flask', 176)),
        'innkeeper': dict(name='여관 주인 리사', body='f1', hair='blonde',
                          outfit=lambda g: merge_parts(robe(g, 'dressR', flare=36, sleeves='short'), {'torso': apron(g, top=g.neck[1] + 86)}),
                          gear={'boots': 1}, prop=('mug', 170)),
        'villager_elder': dict(name='촌장 하렌', body='m1', hair='white', beard=('white', 'long'),
                               outfit=lambda g: robe(g, 'robeB', flare=40, belt='rope', trim=None),
                               gear={'boots': 0}, prop=('staff:0', 176)),
        'villager_kid': dict(name='마을 아이', body='m1', hair='ginger', hat='strawhat', scale=0.8,
                             outfit=lambda g: {'torso': vest(g, 'scarf', collar='round', bottom=g.waist_y + 60, buttons='gold')},
                             gear={'boots': 0}, prop=('sword:0', 150)),
        'gate_guard': dict(name='성문 위병', body='m1', hair='darkbrown',
                           outfit=None, gear={'armor': 2, 'helmet': 2, 'shoulder': 2, 'gloves': 2, 'boots': 2, 'belt': 2},
                           prop=('spear', 176)),
        'king': dict(name='포이노 국왕', body='m1', hair='white', hat='crown', beard=('white', 'full'),
                     outfit=lambda g: merge_parts(robe(g, 'royal', flare=58, trim='gold', belt='gold', fur=True),
                                                  {'cape': cloak(g, 'royal', length=g.rig['legL']['ankle'][1] + 20, spread=200, trim='gold')}),
                     gear={'necklace': 4, 'boots': 3}, prop=('scepter', 176)),
        'gate_merchant': dict(name='무기상 카일', body='m2', hair=None,
                              outfit=lambda g: {'cape': cloak(g, 'dressG', length=g.hem_y + 60, spread=140)},
                              gear={'armor': 1, 'belt': 1, 'boots': 1, 'gloves': 1}, prop=('sword:1', 150)),
        'dungeon_warden': dict(name='지하감옥 간수', body='m2', hair='black', hat='hood',
                               outfit=lambda g: merge_parts(robe(g, 'hood', bottom=g.rig['legL']['knee'][1] + 40, flare=30, sleeves='short'),
                                                            {'cape': cloak(g, 'hood', length=g.rig['legL']['knee'][1] + 90, spread=150)}),
                               gear={'gloves': 2, 'boots': 1, 'belt': 1}, prop=('lantern', 0)),
        'gem_gambler': dict(name='보석 노인 바르한', body='m1', hair='grey', hat='turban', beard=('grey', 'goatee'),
                            outfit=lambda g: robe(g, 'turban', flare=40, trim='gold', belt='gold'),
                            gear={'necklace': 3, 'boots': 1}, prop=('gemstone', 176)),
        'witch': dict(name='마녀 이올린', body='f1', hair='plum', hat='witch',
                      outfit=lambda g: robe(g, 'witch', flare=50, trim='purple', belt='dark'),
                      gear={'necklace': 3, 'boots': 3}, prop=('broom', 176)),
    }


def build_npc(nid, d):
    g = GA.geo(d['body'])
    gear = GA.gear_for(d['body'], d.get('gear') or {})
    gear['image'] = recolor_hair(g, d.get('hair'))
    parts_svg = {}
    if d.get('outfit'):
        for k, v in d['outfit'](g).items():
            parts_svg[k] = parts_svg.get(k, '') + v
    headsvg = ''
    if d.get('beard'):
        headsvg += beard(g, *d['beard'])
    if d.get('hat'):
        headsvg += hat(g, d['hat'])
    if headsvg:
        parts_svg['head'] = parts_svg.get('head', '') + headsvg
    # 굽기
    jobs = []
    tmp = os.path.join(OUT, '_parts', nid)
    os.makedirs(tmp, exist_ok=True)
    for k, body in parts_svg.items():
        jobs.append((svg(body), os.path.join(tmp, f'{k}.png')))
    if jobs:
        GA.bake_svgs(jobs)
    for k in parts_svg:
        img = np.asarray(Image.open(os.path.join(tmp, f'{k}.png')).convert('RGBA'))
        if k == 'cape':
            gear['layers']['cape'] = img
        else:
            gear['parts'].setdefault(k, []).append(img)
    return BR.Body(d['body'], gear)


def pose_for(body, d, walk=None):
    idle, _ = BA.anim_idle(body)
    q = idle[0].pose if walk is None else walk
    gear = {}
    if d.get('prop'):
        key, ang = d['prop']
        wk = key if ':' in key else f'prop:{key}'
        gear = {'R': (wk, ang, 'world')}
        q = dict(q)
        r = dict(q.get('uarmR', {}))
        r['rot'] = r.get('rot', 0.0) - (12 if ang else 4)
        q['uarmR'] = r
        if ang == 0:          # 늘어뜨려 드는 것(등불) — 팔을 조금 앞으로 굽힌다
            q['farmR'] = {'rot': -28.0}
    return q, gear


def render_npc(body, d, walk=None):
    q, gear = pose_for(body, d, walk)
    pm, info = body.render(q, gear)
    k = d.get('scale', 1.0)
    if k == 1.0:
        return BR.to_image(pm, (320, 320))
    # 아이 — 비율은 그대로 두고 통째로 줄인다(굽는 틀에서 바로 줄여야 흐리지 않다)
    w = int(320 * k)
    small = BR.to_image(pm, (w, w))
    out = Image.new('RGBA', (320, 320))
    out.alpha_composite(small, ((320 - w) // 2, 320 - w))
    return out


def main(ids=None):
    os.makedirs(OUT, exist_ok=True)
    make_props(['hammer', 'bighammer', 'mug', 'flask', 'scepter', 'broom', 'spear', 'lantern', 'gemstone', 'basket', 'keys'])
    defs = npc_defs()
    mp = os.path.join(OUT, 'npcs.json')
    meta = json.load(open(mp)) if (ids and os.path.exists(mp)) else {}
    for nid, d in defs.items():
        if ids and nid not in ids:
            continue
        body = build_npc(nid, d)
        img = render_npc(body, d)
        img.save(os.path.join(OUT, f'{nid}.png'))
        walk, _ = BA.anim_walk(body)
        for i, fi in enumerate((2, 6)):
            render_npc(body, d, walk[fi].pose).save(os.path.join(OUT, f'{nid}_walk{i + 1}.png'))
        meta[nid] = {'name': d['name'], 'body': d['body']}
        print('✓', nid, flush=True)
    stone()
    meta.pop('waypoint_stone', None)
    # 순서는 표(npc_defs)의 순서로 — 몇 명만 다시 구워도 미리보기의 자리가 바뀌지 않게
    meta = {k: meta[k] for k in defs if k in meta}
    json.dump(meta | {'waypoint_stone': {'name': '웨이포인트 돌', 'body': None}}, open(mp, 'w'), ensure_ascii=False)


def stone():
    """웨이포인트 돌 — 사람이 아니라 물건. 같은 그림체(굵은 선 · 면 그늘 · 빛나는 룬)로."""
    Wc = Hc = 1280
    ox, oy = 256, 256
    cx = ox + 384
    gy = oy + 975
    s = f'<ellipse cx="{cx}" cy="{gy - 4}" rx="190" ry="40" fill="{MAT["iron"][3]}" stroke="{OL}" stroke-width="6"/>'
    base = smooth_path([(cx - 180, gy - 10), (cx - 150, gy - 70), (cx + 150, gy - 70), (cx + 180, gy - 10), (cx, gy + 20)], k=.3)
    s += PB(base, G('iron'), 'iron')
    body = smooth_path([(cx - 120, gy - 60), (cx - 138, gy - 330), (cx - 96, gy - 560), (cx - 20, gy - 640), (cx + 60, gy - 600),
                        (cx + 120, gy - 420), (cx + 130, gy - 60)], k=.35)
    s += P(body, 'url(#stoneG)') + bevel(body, 'iron', 8, 14)
    for d_ in (f'M{cx - 90} {gy - 200} Q{cx - 70} {gy - 260} {cx - 100} {gy - 320}', f'M{cx + 70} {gy - 120} Q{cx + 96} {gy - 200} {cx + 80} {gy - 280}'):
        s += L(d_, MAT['iron'][3], 5, .8)
    runes = [f'M{cx - 30} {gy - 470} L{cx} {gy - 510} L{cx + 30} {gy - 470} M{cx} {gy - 510} L{cx} {gy - 420}',
             f'M{cx - 34} {gy - 360} L{cx + 34} {gy - 360} M{cx - 20} {gy - 390} L{cx + 20} {gy - 330}',
             f'M{cx - 28} {gy - 260} Q{cx} {gy - 300} {cx + 28} {gy - 260} Q{cx} {gy - 220} {cx - 28} {gy - 260}',
             f'M{cx} {gy - 190} L{cx} {gy - 120} M{cx - 24} {gy - 160} L{cx + 24} {gy - 160}']
    for r_ in runes:
        s += GA.glow_line(r_, '#7cc4ff', 5, '#e8f7ff')
    s += L(body, OL, 6)
    s += f'<circle cx="{cx}" cy="{gy - 600}" r="60" fill="#7cc4ff" opacity=".35" filter="url(#blur8)"/>'
    s += GA.gem(cx - 8, gy - 610, 22, 'blue')
    out = os.path.join(OUT, 'waypoint_stone_big.png')
    GA.bake_svgs([(svg(s, Wc, Hc), out, Wc, Hc)])
    im = Image.open(out).convert('RGBA')
    f = np.asarray(im).astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    BR.to_image(f, (320, 320)).save(os.path.join(OUT, 'waypoint_stone.png'))
    os.remove(out)


# ─────────────────────────────────────────────────────────────
# 미리보기
# ─────────────────────────────────────────────────────────────
def lineup():
    meta = json.load(open(os.path.join(OUT, 'npcs.json')))
    npcs = json.load(open(os.path.join(ROOT, 'src', 'data', 'npcs.json')))
    man = json.load(open(os.path.join(ROOT, 'src', 'data', 'manifest.json')))
    import glob
    fs = glob.glob('/usr/share/fonts/**/*CJK*Bold*', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True)
    font = ImageFont.truetype(fs[0], 22) if fs else ImageFont.load_default()
    small = ImageFont.truetype(fs[0], 15) if fs else ImageFont.load_default()
    ids = list(meta.keys())
    cols = 5
    CW_, CH_ = 300, 420
    rows = (len(ids) + cols - 1) // cols
    S = Image.new('RGB', (cols * CW_ + 20, rows * CH_ + 90), (23, 29, 25))
    d = ImageDraw.Draw(S)
    d.text((20, 18), '마을 사람들 — 새 그림 (큰 그림 · 게임 크기 · 지금 그림)', fill=(239, 233, 218), font=font)
    d.text((20, 52), '가운데 아래 작은 두 칸: 왼쪽이 새 그림의 게임 크기(80×80 틀), 오른쪽이 지금 게임의 그림(48×64).', fill=(170, 181, 164), font=small)
    for i, nid in enumerate(ids):
        x0 = 10 + (i % cols) * CW_
        y0 = 84 + (i // cols) * CH_
        card = Image.new('RGBA', (CW_ - 12, CH_ - 12), (0, 0, 0, 0))
        cd = ImageDraw.Draw(card)
        cd.rounded_rectangle((0, 0, CW_ - 13, CH_ - 13), 14, fill=(79, 138, 62, 255), outline=(230, 195, 92, 255), width=2)
        big = Image.open(os.path.join(OUT, f'{nid}.png')).convert('RGBA')
        big = big.crop((40, 10, 280, 318))
        card.alpha_composite(big.resize((210, 270), Image.LANCZOS), ((CW_ - 12 - 210) // 2, 6))
        g_small = Image.open(os.path.join(OUT, f'{nid}.png')).convert('RGBA')
        fsm = np.asarray(g_small).astype(np.float32) / 255
        fsm[..., :3] *= fsm[..., 3:4]
        gs = BR.to_image(fsm, (80, 80))
        cd.rounded_rectangle((34, 282, 134, 372), 8, fill=(0, 0, 0, 70))
        card.alpha_composite(gs, (44, 288))
        spr = (npcs.get(nid) or {}).get('sprite')
        if spr and spr in man and os.path.exists(os.path.join(ROOT, man[spr]['src'])):
            old = Image.open(os.path.join(ROOT, man[spr]['src'])).convert('RGBA')
            k = min(64 / old.height, 48 / old.width)
            old = old.resize((max(1, int(old.width * k)), max(1, int(old.height * k))), Image.LANCZOS)
            cd.rounded_rectangle((154, 282, 254, 372), 8, fill=(0, 0, 0, 70))
            card.alpha_composite(old, (204 - old.width // 2, 364 - old.height))
        S.paste(card, (x0, y0), card)
        name = meta[nid]['name']
        tw = d.textlength(name, font=small)
        d.text((x0 + (CW_ - 12 - tw) / 2, y0 + CH_ - 42), name, fill=(239, 233, 218), font=small)
    p = os.path.join(ROOT, 'art', 'preview', 'npc-lineup.png')
    S.save(p)
    print('✓', p)


def walk_gif():
    meta = json.load(open(os.path.join(OUT, 'npcs.json')))
    ids = [k for k in meta if k != 'waypoint_stone']
    S = 150
    frames = []
    for f in ('', '_walk1', '', '_walk2'):
        c = Image.new('RGBA', (S * 7, S * 2), (70, 120, 70, 255))
        for i, nid in enumerate(ids):
            im = Image.open(os.path.join(OUT, f'{nid}{f}.png')).convert('RGBA').resize((S, S), Image.LANCZOS)
            c.alpha_composite(im, ((i % 7) * S, (i // 7) * S))
        frames.append(c.convert('RGB'))
    frames[0].save(os.path.join(ROOT, 'art', 'preview', 'npc-walk.gif'), save_all=True, append_images=frames[1:], duration=[170] * 4, loop=0)
    print('✓ npc-walk.gif')


if __name__ == '__main__':
    args = sys.argv[1:]
    if '--lineup' in args:
        lineup()
        walk_gif()
    else:
        main([a for a in args] or None)
        lineup()
        walk_gif()
