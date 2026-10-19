#!/usr/bin/env python3
"""
여덟 방향 몸 (0.70.30).

    python3 tools/body-turn.py              # 미리보기 → art/preview/body-turn.png
    python3 tools/body-turn.py --2          # 한 등급(0~4) 장비를 입혀서
    (tools/body-game.py 가 이것을 불러 방향 장면을 굽는다)

⚠ **규칙은 docs/CHARACTER-VIEWS.md** (사용자가 정한 것). 고치기 전에 먼저 읽는다. 요약:
    · 옆 · 앞대각 = **앞모습 그대로**, 눈동자만 가는 쪽으로 살짝(glance). 몸 · 얼굴 · 팔 · 다리 · 걸음 모두 앞모습.
    · 무기는 **오른손(화면 오른쪽 손)에만** — 그림을 좌우로 뒤집지 않는다. 왼쪽을 보는 그림도 따로 굽는다.
    · 뒷모습은 머리부터 발까지 — 뒤통수 · 등 머리칼 + 다리는 무릎 뒤 · 발은 뒤꿈치(backify_legs).
      뒤대각(오른쪽 위 · 왼쪽 위)은 뒷모습 그대로.
    · 뒤에서는 망토가 등을 덮는다(BACK_ORDER · 게임은 BodyLook 이 같은 차례로 겹친다).

── 여덟 방향 → 장면 꼬리 ─────────────────────────────────────
    아래 ''  · 오른쪽 아래 _fs · 오른쪽 _s · 왼쪽 아래 _fsl · 왼쪽 _sl · 위 · 오른쪽 위 · 왼쪽 위 _b
  _fs · _s · _fsl · _sl 은 **맨몸 층(base)만** 따로 굽는다(눈만 다르다). 장비 · 무기 · 망토 층은
  앞모습 장면의 것을 그대로 쓴다 — bodies.json 의 sceneOf 가 그 짝을 적는다.
"""
import importlib.util
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def _load(name, file):
    sp = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', file))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


BR = None

# 눈동자를 옮기는 점(굽는 틀 1280 기준 — 들판 그림 160 에서는 1/8). + 는 화면 오른쪽.
#   옆은 눈동자가 눈꼬리에 닿을 만큼, 앞대각은 그 절반 남짓 — "살짝".
GLANCE = {'fs': 4, 's': 7, 'fsl': -4, 'sl': -7}
VIEWS = ('fs', 's', 'fsl', 'sl', 'b')


def init(br):
    global BR
    BR = br


def mk_layer(name, pm, bones, weight_fn):
    L = BR.Layer.__new__(BR.Layer)
    L.name = name
    L.bones = bones
    L.weight_fn = weight_fn
    L.set_pm(pm)
    return L


# ─────────────────────────────────────────────────────────────
# 눈동자 — 앞모습 그대로, 눈 안에서 눈동자만 옆으로
# ─────────────────────────────────────────────────────────────
def eyes_of(pm):
    """머리 층에서 두 눈의 **눈 틈**(흰자 · 눈동자가 보이는 자리, 눈꺼풀 선 안쪽) — [bool H×W, …].
    흰자(밝고 빛깔이 옅다) 덩어리 가운데 큰 둘을 눈으로 보고, 거기 붙은 살빛 아닌 · 아주 어둡지 않은 자리
    (눈동자 · 눈꺼풀 밑 그늘)까지 넓힌 뒤 볼록 껍질로 감싼다. 눈을 못 찾으면(뒤통수 · 투구가 가리면) 빈 목록."""
    from scipy.ndimage import label
    a = pm[..., 3]
    rgb = pm[..., :3] / np.maximum(a[..., None], 1e-4)
    mx, mn = rgb.max(-1), rgb.min(-1)
    lum = rgb @ np.array([.3, .59, .11])
    white = (mn > .74) & (mx - mn < .2) & (a > .9)
    skin = (rgb[..., 0] - rgb[..., 2] > .12) & (rgb[..., 0] > .7) & (lum > .5)
    cand = (a > .5) & (lum >= .2) & ~skin
    lab, nl = label(white)
    if nl == 0:
        return []
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    out = []
    for i in [i for i in np.argsort(sizes)[::-1][:2] if sizes[i] >= 80]:
        comp = lab == i
        ys, xs = np.where(comp)
        box = np.zeros_like(comp)
        box[ys.min() - 14:ys.max() + 5, xs.min() - 6:xs.max() + 7] = True
        cl, _ = label(cand & box)
        hit = np.unique(cl[comp & (cl > 0)])
        grown = np.isin(cl, hit[hit > 0]) | comp
        ys, xs = np.where(grown)
        hull = cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32))
        O = np.zeros(a.shape, np.uint8)
        cv2.fillConvexPoly(O, hull, 1)
        out.append(cv2.erode(O, np.ones((3, 3), np.uint8)).astype(bool))    # 눈꺼풀 선은 건드리지 않게 한 점 안쪽
    return out


def glance(pm, dx):
    """눈 틈 안의 그림을 dx 점 옮긴다(눈동자가 그쪽으로 간다). 눈 틈 밖으로 나간 몫은 눈꼬리에 가리고,
    비는 쪽은 둘레(흰자 · 눈꺼풀 그늘)로 메운다(inpaint). 눈 틈 밖은 한 점도 바꾸지 않는다."""
    if not dx:
        return pm
    out_pm = pm.copy()
    for O in eyes_of(pm):
        ys, xs = np.where(O)
        x0, x1, y0, y1 = xs.min() - 8, xs.max() + 9, ys.min() - 8, ys.max() + 9
        crop = pm[y0:y1, x0:x1]
        Oc = O[y0:y1, x0:x1]
        a = crop[..., 3:4]
        rgb = crop[..., :3] / np.maximum(a, 1e-4)
        h, w = Oc.shape
        out = rgb.copy()
        hole = np.zeros((h, w), np.uint8)
        yy, xx = np.where(Oc)
        sx = xx - dx
        ok = (sx >= 0) & (sx < w)
        ok[ok] &= Oc[yy[ok], sx[ok]]
        out[yy[ok], xx[ok]] = rgb[yy[ok], sx[ok]]
        hole[yy[~ok], xx[~ok]] = 1
        u8 = (out * 255).clip(0, 255).astype(np.uint8)
        fill = cv2.inpaint(u8, hole, 3, cv2.INPAINT_TELEA).astype(np.float32) / 255
        out[hole > 0] = fill[hole > 0]
        out_pm[y0:y1, x0:x1, :3] = np.where(Oc[..., None], out * a, crop[..., :3])
    return out_pm


class GlanceBody:
    """앞 몸(BR.Body)과 모든 것이 같고 **머리 층의 눈동자만** 옮긴 몸 — render · solve 는 앞 몸의 것을 빌린다."""

    def __init__(self, front, view):
        self.view = view
        self.front = front
        self.L = dict(front.L)
        h = front.L['head']
        self.L['head'] = mk_layer('head', glance(h.full(), GLANCE[view]), h.bones, h.weight_fn)

    def __getattr__(self, k):            # rig · sk · weapons · solve 에 쓰는 것은 앞 몸의 것
        return getattr(self.__dict__['front'], k)

    def solve(self, pose):
        return BR.Body.solve(self, pose)

    def render(self, pose, gear=None, order=None, fx=None):
        return BR.Body.render(self, pose, gear, order=order, fx=fx)


# ─────────────────────────────────────────────────────────────
# 뒷모습 — 머리부터 발까지
# ─────────────────────────────────────────────────────────────
def backify_legs(body):
    """뒷모습 다리 · 발 — 무릎뼈 대신 **무릎 뒤 주름**, 발가락 대신 **뒤꿈치** (docs/CHARACTER-VIEWS.md 7).
    맨발도 신발(장비 층이 입혀진 다리)도 같은 방법으로: 발을 조금 좁히고, 발가락 쪽 아래 절반을 둥근 뒤꿈치로 바꾼다."""
    from scipy.ndimage import binary_erosion
    rig = body.rig
    gy = BR.to_canvas(rig['ground'])[1]
    for s in 'LR':
        key = 'leg' + s
        if key not in body.L:
            continue
        lay = body.L[key]
        pm = lay.full()
        G = rig[key]
        ax, ay = BR.to_canvas(G['ankle'])
        kx, ky = BR.to_canvas(G['knee'])
        a = pm[..., 3]
        H, W = a.shape
        # ① 무릎 — 무릎뼈 선을 흐리게 지우고 뒤쪽 주름 두 줄
        y0, y1 = int(ky - 36), int(ky + 30)
        inner = binary_erosion(a > .5, iterations=8)
        blur = cv2.GaussianBlur(pm[y0:y1], (0, 0), 6)
        reg = inner[y0:y1]
        pm[y0:y1][reg] = blur[reg]
        rowk = a[int(ky + 8)] > .5
        xsk = np.where(rowk)[0]
        if len(xsk):
            kl, kr = xsk.min(), xsk.max()
            img = np.zeros((H, W), np.float32)
            w = kr - kl
            cv2.ellipse(img, (int((kl + kr) / 2), int(ky + 2)), (int(w * .26), 9), 0, 20, 160, 1.0, 3, cv2.LINE_AA)
            img *= inner
            col = np.array([.36, .22, .17, 1.0], np.float32)
            pm = pm * (1 - img[..., None] * .7) + col * pm[..., 3:4] * img[..., None] * .7
        # ② 발 — 발목 아래를 좁히고, 발가락 쪽을 둥근 뒤꿈치로
        fy0 = int(ay + 10)
        rows = a[fy0:int(gy + 6)] > .3
        xs_f = np.where(rows.any(0))[0]
        if not len(xs_f):
            lay.set_pm(pm)
            continue
        fcx = (xs_f.min() + xs_f.max()) / 2
        out = pm.copy()
        k = .8
        xx = np.arange(W, dtype=np.float64)
        for y in range(fy0, min(H, int(gy + 8))):
            t = min(1.0, (y - fy0) / 24.0)              # 발목에서 아래로 갈수록 좁힌다
            kk = 1 - (1 - k) * t
            src = fcx + (xx - fcx) / kk
            out[y] = cv2.remap(pm[y:y + 1], src.astype(np.float32)[None, :], np.zeros((1, W), np.float32),
                               cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)[0]
        pm = out
        a = pm[..., 3]
        # 뒤꿈치 색 — 살이 보이면 살빛, 아니면(신발) 그 발의 바탕색
        reg = pm[fy0:int(gy)]
        al = reg[..., 3] > .9
        rgb = np.where(reg[..., 3:4] > 1e-3, reg[..., :3] / np.maximum(reg[..., 3:4], 1e-3), 0)[al]
        if len(rgb):
            lum = rgb @ np.array([.3, .59, .11])
            skin = (rgb[:, 0] - rgb[:, 2] > .16) & (lum > .52)
            base = np.median(rgb[skin], 0) if skin.sum() > 30 else np.median(rgb[lum > .25], 0)
        else:
            base = np.array([.9, .7, .58])
        ty0 = int(fy0 + .42 * (gy - fy0))
        row = a[ty0] > .3
        xr = np.where(row)[0]
        if len(xr):
            hw0 = (xr.max() - xr.min()) / 2 * .86
            hcx = (xr.max() + xr.min()) / 2
        else:
            hw0, hcx = 30, fcx
        heel = np.zeros((H, W), np.float32)
        hh = gy - 2 - ty0
        for y in range(ty0, int(gy - 1)):
            t = (y - ty0) / max(1, hh)
            hw = hw0 * (1 - t ** 3) ** .5
            heel[y, int(hcx - hw):int(hcx + hw) + 1] = 1
        heel = cv2.GaussianBlur(heel, (0, 0), 1.0)
        # 발가락 쪽(아래)은 지우고 뒤꿈치만
        low = np.zeros((H, W), bool)
        low[ty0:] = True
        pm[low] *= 0
        yy = np.arange(H, dtype=np.float32)[:, None]
        sh = np.clip((yy - ty0) / max(1, hh), 0, 1)
        col = base[None, None, :] * (1.06 - .32 * sh[..., None])
        hl = np.exp(-(((np.arange(W)[None, :] - (hcx - hw0 * .25)) / (hw0 * .45)) ** 2 + ((yy - (ty0 + hh * .35)) / (hh * .35)) ** 2))
        col = col * (1 + .14 * hl[..., None])
        heel_pm = np.dstack([np.clip(col, 0, 1) * heel[..., None], heel]).astype(np.float32)
        pm = heel_pm * (1 - pm[..., 3:4]) * low[..., None] + pm
        # 테두리
        m = pm[..., 3] > .5
        edge = m & ~binary_erosion(m, iterations=3)
        edge[:ty0 - 6] = False
        ol = np.array([26 / 255, 18 / 255, 16 / 255], np.float32)
        pm[edge, :3] = pm[edge, :3] * .15 + ol * pm[edge, 3:4] * .85
        lay.set_pm(pm.astype(np.float32))
    return body

# 뒤 — 망토가 등을 덮고, 긴 머리칼(drape)은 망토 위로 (규칙 5). 게임에서는 BodyLook 이 같은 차례로 겹친다.
BACK_ORDER = ['hairback', 'legL', 'legR', 'pitL', 'pitR', 'armL', 'armR', 'torso', 'cape', 'drape',
              'armL_front', 'armR_front', 'padL', 'padR', 'head']


def gear_sets(GA, name, tier):
    """미리보기용 — 한 등급을 한 벌 입힌 gear(body-rig 꼴)."""
    if tier is None:
        return None
    return GA.gear_for(name, {k: tier for k in ('armor', 'helmet', 'boots', 'gloves', 'belt', 'necklace', 'shoulder')})


def views_of(name, gear, BV):
    """앞 · 뒤 몸 + 눈동자만 옮긴 넷(fs · s · fsl · sl). 뒤 몸은 뒤통수 그림 + 등 머리칼(drape) + 뒤 다리."""
    back_im, drape = BV.load_views(name)
    g = gear or {'parts': {}, 'layers': {}}
    # 0.70.31 — 갑옷 · 허리띠는 뒷면(gear-art 의 armorB · beltB)을 입는다 — 앞 문장 · 버클이 뒤에서 안 보이게
    g2 = {'parts': g.get('back_parts', g.get('parts', {})), 'layers': {k: v for k, v in g.get('layers', {}).items() if k != 'hairfront'},
          'image': back_im}
    g2['layers']['drape'] = drape
    if g.get('pit') is not None:
        g2['pit'] = g['pit']
    front, back = BR.Body(name, g), BR.Body(name, g2)
    backify_legs(back)
    return {'': front, 'b': back, **{v: GlanceBody(front, v) for v in GLANCE}}


def render_view(V, view, pose, gear=None, fx=None):
    """미리보기 한 장 — 게임과 같은 차례. **뒤집지 않는다**(무기는 언제나 화면 오른쪽 손)."""
    order = BACK_ORDER if view == 'b' else None
    return V[view].render(pose, gear, order=order, fx=fx)


if __name__ == '__main__':
    import math
    BA = _load('body_anim', 'body-anim.py')
    init(BA.BR)
    GA = _load('gear_art', 'gear-art.py')
    GA.BR = BR
    GA.register_weapons()
    BV = _load('body_views', 'body-views.py')
    BV.BR = BR
    args = sys.argv[1:]
    names = [a for a in args if a in BR.RIGS] or ['m1', 'f1', 'm2', 'f2']
    tier = next((int(a[2:]) for a in args if a.startswith('--') and a[2:].isdigit()), None)
    HOLD = {'sword': 148, 'bow': 180, 'staff': 176}
    KIND = {'m1': 'sword', 'f1': 'staff', 'm2': 'bow', 'f2': 'sword'}
    stand = BA.P(uarmR=-12)
    rows = []
    for n in names:
        V = views_of(n, gear_sets(GA, n, tier), BV)
        kind = KIND[n]
        gear = {'R': (f'{kind}:{tier}', HOLD[kind], 'world')} if tier is not None else None
        fx = [BA.fx_string()] if gear and kind == 'bow' else None
        # 여덟 방향: 앞 · 앞오른 · 오른 · 뒤오른 · 뒤 · 뒤왼 · 왼 · 앞왼
        seq = ['', 'fs', 's', 'b', 'b', 'b', 'sl', 'fsl']
        rows.append([render_view(V, v, stand, gear, fx)[0] for v in seq])
    S = 180
    sheet = Image.new('RGBA', (S * len(rows[0]), int(S * 1.3) * len(rows)), (74, 96, 120, 255))
    for j, tiles in enumerate(rows):
        for i, pm in enumerate(tiles):
            im = BR.to_image(pm, (320, 320)).crop((48, 48, 272, 339)).resize((S, int(S * 1.3)), Image.LANCZOS)
            sheet.alpha_composite(im, (i * S, j * int(S * 1.3)))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out = os.path.join(ROOT, 'art', 'preview', f'body-turn{"-t%d" % tier if tier is not None else ""}.png')
    sheet.save(out)
    print('✓', os.path.relpath(out, ROOT))
