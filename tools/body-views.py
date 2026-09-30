#!/usr/bin/env python3
"""
뒷모습 · 옆모습 (0.70.29) — 앞모습 그림 하나로 방향 그림을 만든다.

  python3 tools/body-views.py            # → art/views/<몸>_back.png · <몸>_drape.png · 미리보기
  (tools/body-game.py 가 이것을 불러 방향 장면을 굽는다)

── 뒷모습 ─────────────────────────────────────────────────
  받은 그림은 앞모습뿐이다. 뒤에서 본 사람은 **거울에 비친 앞모습**과 거의 같은 테두리를 갖는다
  (칼 든 손도 반대쪽으로 간다). 다른 것은 셋:
    ① 얼굴 → 뒤통수: 얼굴 자리를 머리칼로 덮는다(둘레 머리칼 색으로 메우고, 정수리에서
       흘러내리는 결을 긋는다). 짧은 머리는 귀와 목덜미가 남는다.
    ② 긴 머리는 **등 위로** 흘러내린다 — 앞에서는 몸 뒤에 숨어 있던 머리칼이 뒤에서는 옷 위에 온다.
       이것은 따로 한 겹(drape)으로 두고 갑옷보다 위에 그린다.
    ③ 옷의 앞 무늬(V 목 · 허리끈)를 지우고 뒤 목선을 긋는다.
  그리는 쪽(body-game)은 이 그림으로 **앞모습 자세 그대로** 그린 뒤 좌우를 뒤집는다.

── 옆모습 ─────────────────────────────────────────────────
  돌아선 머리는 원통처럼 돈다 — 얼굴이 가는 쪽으로 밀리고 먼 쪽은 좁아진다(warp_side).
  몸은 덜 돌고 다리는 거의 안 돈다. 모든 층(맨몸 · 장비)에 **같은 변환**을 걸어 앞뒤가 맞는다.
"""
import importlib.util
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
_sp = importlib.util.spec_from_file_location('body_rig', os.path.join(ROOT, 'tools', 'body-rig.py'))
BR = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(BR)
OUT = os.path.join(ROOT, 'art', 'views')
BW, BH = BR.BW, BR.BH


def _lum(rgb):
    return rgb[..., 0] * .3 + rgb[..., 1] * .59 + rgb[..., 2] * .11


def head_info(name, im, lab):
    rig = BR.RIGS[name]
    head = lab == 1
    ys, xs = np.where(head)
    top, bot = ys.min(), ys.max()
    cx = 384
    rgb = im[..., :3].astype(np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = _lum(rgb)
    skin = head & (r - b > 38) & (lum > 125) & (r > g)
    # 얼굴 = 살 덩어리 가운데 가장 큰 것 + 그 안의 구멍(눈 · 입 · 눈썹)
    # 살 덩어리(볼 · 이마 · 코)의 **볼록 껍질** — 그 사이의 눈 · 눈썹 · 입까지 한꺼번에 덮는다.
    # (살만 고르면 앞머리가 이마를 가른 남자 그림에서 눈이 빠져 가면을 쓴 것처럼 된다)
    n, cc, st, _ = cv2.connectedComponentsWithStats(skin.astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    if n > 1:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        by = st[big, cv2.CC_STAT_TOP] + st[big, cv2.CC_STAT_HEIGHT] / 2
        for i in range(1, n):
            if st[i, cv2.CC_STAT_AREA] > 60:
                cxi = st[i, cv2.CC_STAT_LEFT] + st[i, cv2.CC_STAT_WIDTH] / 2
                if abs(cxi - cx) < 130:
                    keep[i] = True
    core = keep[cc] if n > 1 else skin
    pts = np.column_stack(np.where(core)[::-1]).astype(np.int32)
    hull = np.zeros((BH, BW), np.uint8)
    if len(pts):
        cv2.fillPoly(hull, [cv2.convexHull(pts).reshape(-1, 2)], 1)
    face = (hull > 0) & head
    fy, fx = np.where(face)
    fcx, fcy = fx.mean(), fy.mean()
    # 귀는 남긴다 — 얼굴 한가운데에서 먼 살(가로로 얼굴 폭의 ⅔ 밖)은 귀다
    half = (fx.max() - fx.min()) / 2
    yy, xx = np.mgrid[0:BH, 0:BW]
    ears = face & (np.abs(xx - fcx) > half * 0.8) & (yy > fcy - half * .2) & (yy < fcy + half * .5)
    hair = head & ~face
    if rig['long_hair']:
        ears = np.zeros_like(ears)                  # 긴 머리는 귀를 덮는다
    return dict(head=head, face=face & ~ears, ears=ears, hair=hair, top=top, bot=bot, fcx=fcx, fcy=fcy, half=half)


def hair_palette(im, mask):
    px = im[mask][:, :3].astype(np.float32)
    lum = _lum(px)
    keep = (lum > 40) & (lum < 200)
    px, lum = px[keep], lum[keep]
    q = np.percentile(lum, [15, 50, 85])
    pick = lambda lo, hi: px[(lum >= lo) & (lum <= hi)].mean(0)
    return pick(0, q[0]), pick(q[0], q[2]), pick(q[1], 255)   # 그늘 · 바탕 · 빛


def strands(h, w, cx, top, bot, rng, n=46, curl=0.0):
    """정수리(가운데 위)에서 흘러내리는 머리결 — 가는 곡선들(0~1 세기)."""
    layer = np.zeros((h, w), np.float32)
    for i in range(n):
        t = (i + rng.uniform(0, 1)) / n
        x0 = cx + (t - .5) * 40
        ang = (t - .5) * math.pi * 1.05          # 가운데는 곧게, 가장자리는 옆으로
        ln = (bot - top) * rng.uniform(.75, 1.05)
        pts = []
        for k in range(12):
            s = k / 11
            x = x0 + math.sin(ang) * ln * s * 0.9 + math.sin(s * 3 + i) * curl
            y = top + 18 + math.cos(ang * .6) * ln * s
            pts.append((x, y))
        cv2.polylines(layer, [np.array(pts, np.int32)], False, float(rng.uniform(.5, 1)), int(rng.integers(2, 4)), cv2.LINE_AA)
    return layer


def back_image(name, im, lab):
    """앞모습 그림 → 뒷모습 그림(같은 자세 · 같은 자리). 좌우 뒤집기는 그리는 쪽에서 한다."""
    rig = BR.RIGS[name]
    out = im.copy()
    H = head_info(name, im, lab)
    head, face, hair = H['head'], H['face'], H['hair']
    dark, base, lite = hair_palette(im, hair)
    rng = np.random.default_rng(7)
    # ① 얼굴 자리 → 뒤통수. 세로줄마다 **정수리 쪽 머리칼을 아래로 늘여** 덮는다 —
    #    그려진 머리결(선 · 명암)이 그대로 길어져 뒤로 빗어 넘긴 머리가 된다(흐린 얼룩이 아니다).
    yy, xx = np.mgrid[0:BH, 0:BW]
    painted = out[..., :3].astype(np.float32).copy()
    cover = face.copy()
    nape_line = []
    rgbf = im[..., :3].astype(np.float32)
    lit_skin = face & (_lum(rgbf) > 150) & (rgbf[..., 0] - rgbf[..., 2] > 40)
    neck_c = np.median(rgbf[lit_skin], 0) if lit_skin.any() else np.array([232, 186, 150], np.float32)
    for x in range(BW):
        col = head[:, x]
        if not col.any() or not face[:, x].any():
            continue
        y_top = np.argmax(col)
        f_ys = np.where(face[:, x])[0]
        f_top, f_bot = f_ys.min(), f_ys.max()
        src_top = y_top + 9                       # 테두리(검은 선)는 늘이지 않는다
        src_bot = max(src_top + 4, int(y_top + (f_top - y_top) * 0.72))
        # 머리칼이 끝나는 줄 — 얼굴 높이의 60% 즈음, 가운데가 조금 더 내려온 둥근 선(목덜미 위)
        u = min(1.0, abs(x - H['fcx']) / max(1.0, H['half']))
        hair_end = f_bot                          # 뒤통수 전체를 덮는다(목덜미는 몸통 층의 목이 보여 준다)
        n_out = hair_end - y_top + 1
        if src_bot <= src_top or n_out <= 0:
            continue
        seg = im[src_top:src_bot, x, :3].astype(np.float32)
        seg_a = im[src_top:src_bot, x, 3] > 0
        if seg_a.sum() < 3:
            continue
        seg = seg[seg_a]
        idx = np.linspace(0, len(seg) - 1, n_out)
        colv = np.stack([np.interp(idx, np.arange(len(seg)), seg[:, c]) for c in range(3)], -1)
        # 아래로 갈수록 조금 어둡게(목덜미 그늘)
        t = np.linspace(0, 1, n_out)[:, None]
        colv = colv * (1.0 - 0.42 * t ** 1.8)     # 아래로 갈수록 그늘(뒤통수가 둥글게 보인다)
        rows = np.arange(y_top, hair_end + 1)
        m = face[rows, x] | (hair[rows, x] & (rows >= f_top - 6))
        painted[rows[m], x] = colv[m]
        cover[rows[m], x] = True
        # 그 아래(턱 자리) = 목덜미 살
        nape = np.arange(hair_end + 1, f_bot + 1)
        if len(nape):
            tt = np.linspace(0, 1, len(nape))[:, None]
            painted[nape, x] = neck_c * (0.82 + 0.18 * tt)
            cover[nape, x] = True
        nape_line.append((x, hair_end))
    # 세로 결을 한 번 더 — 늘인 결이 너무 곧으면 기계로 그은 줄처럼 보인다
    st = strands(BH, BW, H['fcx'], H['top'], H['bot'] + 10, rng, n=40, curl=5 if rig['long_hair'] else 2)
    hairpart = np.zeros((BH, BW), np.float32)
    for (x, he) in nape_line:
        hairpart[:he + 1, x] = 1
    st = st * hairpart
    painted = painted * (1 - st[..., None] * .28) + dark * (st[..., None] * .28)
    sm = cv2.GaussianBlur(cover.astype(np.float32), (0, 0), 1.5)[..., None]
    out[..., :3] = (out[..., :3] * (1 - sm * head[..., None]) + painted * sm * head[..., None]).clip(0, 255).astype(np.uint8)
    # 머리칼 끝줄(목덜미 위) — 짙은 선 + 삐죽한 머리끝 몇 가닥
    if False and nape_line:
        pts = np.array(nape_line, np.int32)
        lay = np.zeros((BH, BW), np.float32)
        cv2.polylines(lay, [pts], False, 1.0, 5, cv2.LINE_AA)
        for i in range(0, len(pts), 14):
            x0, y0 = pts[i]
            cv2.line(lay, (int(x0), int(y0)), (int(x0 + rng.integers(-4, 5)), int(y0 + rng.integers(6, 14))), 1.0, 3, cv2.LINE_AA)
        lay *= head
        out[..., :3] = (out[..., :3] * (1 - lay[..., None] * .85) + np.array([40, 26, 18]) * lay[..., None] * .85).astype(np.uint8)
    # 턱선(앞모습의 얼굴 테두리)이 목덜미 옆에 남지 않게 — 머리 아래 끝의 테두리를 다시 긋는다
    if not rig['long_hair']:
        edge = face & ~ndi.binary_erosion(face | ~head, iterations=3) & (yy > H['fcy'])
        out[edge, :3] = (out[edge, :3] * .3 + np.array([26, 18, 16]) * .7).astype(np.uint8)
    # ② 옷 앞 무늬 — 목 V · 쇄골(살색) · 허리끈을 옷 색으로 덮고 뒤 목선을 긋는다
    nx, ny = rig['neck']
    jy = int(max(p[1] for p in rig['jaw'][1:-1]))
    torso = lab == 2
    rgb = im[..., :3].astype(np.float32)
    r, g_, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    skin = (r - b > 38) & (_lum(rgb) > 125)
    box = torso & (np.abs(xx - nx) < 90) & (yy > jy + 14) & (yy < ny + 120)
    vfill = box & (skin | (_lum(rgb) < 90))
    vfill &= ~ndi.binary_erosion(torso, iterations=6) == False
    cloth = torso & ~skin & (yy > ny + 40) & (yy < ny + 170) & (np.abs(xx - nx) < 70)
    if cloth.any():
        cc = np.median(rgb[cloth], 0)
        src3 = np.ascontiguousarray(out[..., :3]).copy()
        src3[vfill] = cc.astype(np.uint8)
        out[..., :3] = np.where(vfill[..., None], cv2.inpaint(src3, vfill.astype(np.uint8), 7, cv2.INPAINT_TELEA), out[..., :3])
        # 뒤 목선 — 얕은 곡선
        pts = [(nx - 62 + k * 6.2, jy + 26 + 8 * math.sin(math.pi * k / 20)) for k in range(21)]
        lay = np.zeros((BH, BW), np.float32)
        cv2.polylines(lay, [np.array(pts, np.int32)], False, 1.0, 4, cv2.LINE_AA)
        lay *= torso
        out[..., :3] = (out[..., :3] * (1 - lay[..., None] * .8) + np.array([60, 48, 40]) * lay[..., None] * .8).astype(np.uint8)
    # 허리끈(앞 가운데 매듭) — 반바지 윗단 가운데
    wy = rig['waist'][1]
    knot = (lab == 2) & (np.abs(xx - nx) < 42) & (yy > wy - 10) & (yy < wy + 110) & (_lum(rgb) < 70)
    if knot.any():
        k2 = cv2.dilate(knot.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        k2 &= (lab == 2)
        out[..., :3] = np.where(k2[..., None], cv2.inpaint(np.ascontiguousarray(out[..., :3]), k2.astype(np.uint8), 5, cv2.INPAINT_TELEA), out[..., :3])
    return out, H, (dark, base, lite)


def drape_image(name, im, lab, H, pal):
    """긴 머리가 등 위로 흘러내린 한 겹(갑옷 위에 그린다). 짧은 머리는 목덜미 머리칼만."""
    rig = BR.RIGS[name]
    dark, base, lite = pal
    yy, xx = np.mgrid[0:BH, 0:BW]
    nx, ny = rig['neck']
    jy = int(max(p[1] for p in rig['jaw'][1:-1]))
    lay = np.zeros((BH, BW), np.uint8)
    if rig['long_hair']:
        bot = 540 if name.startswith('f') else 420
        w_top, w_bot = H['half'] * 1.25, H['half'] * 1.05
        pts = []
        n = 14
        for i in range(n + 1):           # 아래 끝은 물결
            t = i / n
            x = nx - w_bot + 2 * w_bot * t
            y = bot + (18 if i % 2 else 0) + 10 * math.sin(t * 7)
            pts.append((x, y))
        poly = [(nx - w_top, jy - 40), (nx + w_top, jy - 40)] + pts[::-1]
        cv2.fillPoly(lay, [np.array(poly, np.int32)], 1)
    else:
        # 목덜미로 조금 내려온 머리칼
        poly = [(nx - H['half'] * .75, jy - 30), (nx + H['half'] * .75, jy - 30), (nx + H['half'] * .5, jy + 22),
                (nx + 10, jy + 12), (nx - 8, jy + 26), (nx - H['half'] * .5, jy + 16)]
        cv2.fillPoly(lay, [np.array(poly, np.int32)], 1)
    m = lay > 0
    m &= ~H['head']          # 머리 위로는 머리 그림이 있다
    t = np.clip((yy - jy) / max(1, (540 - jy)), 0, 1)[..., None]
    col = base * (1.05 - 0.35 * t)
    st = strands(BH, BW, nx, jy - 60, 560 if rig['long_hair'] else jy + 40, np.random.default_rng(5), n=40, curl=10)
    col = col * (1 - st[..., None] * .5) + dark * st[..., None] * .5
    rgba = np.zeros((BH, BW, 4), np.uint8)
    rgba[..., :3] = col.clip(0, 255).astype(np.uint8)
    a = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)
    rgba[..., 3] = (a * 255).astype(np.uint8)
    # 테두리
    edge = m & ~ndi.binary_erosion(m, iterations=4) & (yy > jy + 16)   # 머리와 닿는 윗변에는 선을 안 긋는다
    rgba[edge, :3] = (rgba[edge, :3] * .3 + np.array([26, 18, 16]) * .7).astype(np.uint8)
    return rgba


def views(name):
    im = BR.load_body(name)
    lab = BR.classify(im, BR.RIGS[name])
    back, H, pal = back_image(name, im, lab)
    drape = drape_image(name, im, lab, H, pal)
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(back, 'RGBA').save(os.path.join(OUT, f'{name}_back.png'))
    Image.fromarray(drape, 'RGBA').save(os.path.join(OUT, f'{name}_drape.png'))
    return back, drape


def load_views(name):
    p = os.path.join(OUT, f'{name}_back.png')
    if not os.path.exists(p):
        views(name)
    back = np.asarray(Image.open(p).convert('RGBA'))
    drape = np.asarray(Image.open(os.path.join(OUT, f'{name}_drape.png')).convert('RGBA'))
    return back, drape


def warp_side(pm, rig, a_head=.45, a_body=.28, a_leg=.12):
    """오른쪽으로 돌아선 모습 — 굽는 틀(1280) 좌표의 그림을 가로로 휜다.
    x_src = cx + R·(u − a·(1 − u²)),  u = (x − cx)/R. 가장자리(u=±1)는 그대로라 테두리가 안 늘어난다."""
    H_, W_ = pm.shape[:2]
    cx = BR.to_canvas(rig['neck'])[0]
    jaw_y = BR.to_canvas((0, max(p[1] for p in rig['jaw'][1:-1])))[1]
    waist = BR.to_canvas(rig['waist'])[1]
    y = np.arange(H_, dtype=np.float32)

    def sm(t):
        t = np.clip(t, 0, 1)
        return t * t * (3 - 2 * t)
    a = a_leg + (a_body - a_leg) * sm((waist + 60 - y) / 80)
    a = a + (a_head - a) * sm((jaw_y + 30 - y) / 60)
    R = 150 + 110 * sm((y - (jaw_y + 10)) / 60)
    xx = np.arange(W_, dtype=np.float32)[None, :]
    u = (xx - cx) / R[:, None]
    uc = np.clip(u, -1, 1)
    g = uc - a[:, None] * (1 - uc ** 2)
    xs = np.where(np.abs(u) <= 1, cx + R[:, None] * g, xx).astype(np.float32)
    ys = np.repeat(y[:, None], W_, 1).astype(np.float32)
    return cv2.remap(pm, xs, ys, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if a in BR.RIGS] or ['m1', 'f1', 'm2', 'f2']
    tiles = []
    for n in names:
        back, drape = views(n)
        im = BR.load_body(n)
        b = back.copy()
        # 미리보기: 앞 · 뒤(드레이프 얹고 뒤집기)
        comp = Image.fromarray(b, 'RGBA')
        comp.alpha_composite(Image.fromarray(drape, 'RGBA'))
        comp = comp.transpose(Image.FLIP_LEFT_RIGHT)
        tiles += [Image.fromarray(im, 'RGBA'), comp]
        print('✓', n)
    sheet = Image.new('RGBA', (384 * len(tiles), 512), (70, 90, 110, 255))
    for i, t in enumerate(tiles):
        sheet.alpha_composite(t.resize((384, 512), Image.LANCZOS), (i * 384, 0))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    sheet.save(os.path.join(ROOT, 'art', 'preview', 'body-back.png'))
