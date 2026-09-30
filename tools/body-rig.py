#!/usr/bin/env python3
"""
기본 몸(티·반바지 견본)에 **뼈대를 넣어** 움직인다 (0.70.26 미리보기).

    python3 tools/ref-cut.py base_clean base_rugged
    python3 tools/body-split.py
    python3 tools/body-rig.py --debug          # 몸을 나눈 모습 → art/anim/<몸>/_parts.png
    python3 tools/body-rig.py                  # 모든 동작 굽기 → art/anim/<몸>/<동작>_<n>.png
    node tools/anim-preview.js                 # 미리보기 → art/preview/anim.html

── 어떻게 움직이나 ─────────────────────────────────────────
  그림을 **조각(층)** 으로 나누고(머리·몸통·팔 둘·다리 둘·뒷머리) 조각마다 뼈를 붙인다.
    root(발밑) → hip(골반) → chest(허리 위) → head(목)
                            ↘ uarm(어깨) → farm(팔꿈치) → 손
               ↘ thigh(고관절) → shin(무릎)
  조각 안의 점은 **가까운 뼈 둘을 섞어** 따라간다(팔꿈치·무릎·어깨가 꺾이지 않고 휜다).
  그리는 쪽에서는 거꾸로 — 화면의 점마다 "원래 그림의 어느 점이 여기로 왔나" 를 찾는다
  (뼈마다 되돌려 보고 그 뼈가 맡은 점을 고른 뒤, 뉴턴법으로 두 번 다듬는다).

── 가려 있던 곳 ─────────────────────────────────────────
  반바지 속 허벅지 · 턱 밑 목 · 팔 뒤 머리칼은 원래 그림에 없다. 움직이면 드러나므로
  미리 채워 둔다(다리는 위로 늘이고, 목은 위로 늘이고, 머리칼은 둘레 색으로 메운다).

좌표는 모두 768×1024 몸 틀 기준이다(art/reference/body_<몸>.png).
굽는 틀은 둘레에 여유를 둔 1280×1280(칼을 휘두르면 틀 밖으로 나가므로) → 320×320 으로 줄인다.
게임 크기로는 80×80 이고, 그 가운데 아래 48×64 가 몸이다.
"""
import json, math, os, sys
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'art', 'reference')
OUT = os.path.join(ROOT, 'art', 'anim')
BW, BH = 768, 1024                 # 몸 틀
OX, OY = 256, 256                  # 몸 틀을 굽는 틀 안 어디에 두나
CW, CH = 1280, 1280                # 굽는 틀
BAKE = 4                           # 굽는 틀 → 파일 (1280 → 320)

# ─────────────────────────────────────────────────────────────
# 몸마다 잰 자리 (몸 틀 좌표). m2·f2 는 m1·f1 과 자세가 같다(body-split 이 맞춰 둔다).
# ─────────────────────────────────────────────────────────────
M1 = {
    'long_hair': False,
    'neck': (385, 322), 'waist': (384, 515), 'pelvis': (384, 600), 'ground': (384, 975),
    'jaw': [(0, 340), (296, 340), (304, 318), (318, 300), (334, 308), (350, 320), (386, 334),
            (422, 320), (438, 308), (452, 300), (466, 318), (474, 340), (768, 340)],
    'L': {'shoulder': (282, 400), 'elbow': (266, 487), 'wrist': (250, 590), 'grip': (249, 626),
          'armhole': [(289, 338), (293, 380), (298, 420), (303, 458)], 'bottom': 672},
    'R': {'shoulder': (486, 400), 'elbow': (500, 487), 'wrist': (518, 590), 'grip': (520, 626),
          'armhole': [(476, 338), (471, 380), (466, 420), (461, 458)], 'bottom': 672},
    'legL': {'hip': (330, 600), 'knee': (328, 750), 'ankle': (323, 878), 'hem': 648},
    'legR': {'hip': (438, 600), 'knee': (436, 750), 'ankle': (445, 878), 'hem': 648},
}
F1 = {
    'long_hair': True,
    'neck': (385, 314), 'waist': (384, 540), 'pelvis': (384, 612), 'ground': (384, 980),
    'jaw': [(0, 304), (292, 304), (302, 278), (326, 284), (348, 299), (385, 311),
            (422, 299), (445, 284), (468, 278), (478, 304), (768, 304)],
    'L': {'shoulder': (302, 392), 'elbow': (287, 490), 'wrist': (257, 590), 'grip': (250, 626),
          'armhole': [(324, 343), (314, 380), (309, 430), (304, 480), (298, 530), (290, 552)], 'bottom': 668},
    'R': {'shoulder': (468, 392), 'elbow': (485, 490), 'wrist': (518, 590), 'grip': (521, 626),
          'armhole': [(444, 343), (454, 380), (459, 430), (464, 480), (470, 530), (478, 552)], 'bottom': 668},
    'legL': {'hip': (337, 612), 'knee': (337, 751), 'ankle': (335, 905), 'hem': 662},
    'legR': {'hip': (430, 612), 'knee': (430, 751), 'ankle': (437, 905), 'hem': 662},
}


def _with(base, **kw):
    d = json.loads(json.dumps(base))
    for k, v in kw.items():
        if isinstance(v, dict):
            d[k].update(v)
        else:
            d[k] = v
    return d


RIGS = {
    'm1': M1,
    'f1': F1,
    # 거친 차림 — 반바지가 길고 끝이 너덜너덜하다(다리가 그만큼 아래서 나온다)
    'm2': _with(M1, legL={'hem': 722}, legR={'hem': 726},
                jaw=[(0, 342), (296, 342), (300, 330), (322, 330), (334, 306), (350, 320), (386, 334),
                     (422, 320), (436, 306), (450, 330), (470, 330), (476, 342), (768, 342)]),
    'f2': _with(F1, legL={'hem': 690}, legR={'hem': 690}),
}
LABEL = {'m1': '남 · 기본', 'f1': '여 · 기본', 'm2': '남 · 거친', 'f2': '여 · 거친'}


# ─────────────────────────────────────────────────────────────
# 작은 연장
# ─────────────────────────────────────────────────────────────
def polyline_x(poly, y):
    """세로로 내려가는 꺾은선에서 y 의 x (보간). 범위 밖이면 끝값."""
    ys = [p[1] for p in poly]
    xs = [p[0] for p in poly]
    return float(np.interp(y, ys, xs))


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def to_canvas(p):
    return (p[0] + OX, p[1] + OY)


def mat_T(x, y):
    return np.array([[1, 0, x], [0, 1, y], [0, 0, 1]], np.float64)


def mat_R(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float64)


def mat_S(sx, sy):
    return np.array([[sx, 0, 0], [0, sy, 0], [0, 0, 1]], np.float64)


def premul(rgba):
    f = rgba.astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    return f


# ─────────────────────────────────────────────────────────────
# 뼈대
# ─────────────────────────────────────────────────────────────
class Skeleton:
    """뼈 이름 → (부모, 축의 시작점, 축의 끝점). 모두 굽는 틀 좌표."""

    def __init__(self, rig):
        c = to_canvas
        self.b = {
            'root': (None, c(rig['ground']), c(rig['pelvis'])),
            'hip': ('root', c(rig['pelvis']), c(rig['waist'])),
            'chest': ('hip', c(rig['waist']), c(rig['neck'])),
            'head': ('chest', c(rig['neck']), (c(rig['neck'])[0], c(rig['neck'])[1] - 200)),
        }
        for s in 'LR':
            a = rig[s]
            self.b['uarm' + s] = ('chest', c(a['shoulder']), c(a['elbow']))
            self.b['farm' + s] = ('uarm' + s, c(a['elbow']), c(a['wrist']))
            self.b['hand' + s] = ('farm' + s, c(a['wrist']), c(a['grip']))
            g = rig['leg' + s]
            self.b['thigh' + s] = ('hip', c(g['hip']), c(g['knee']))
            self.b['shin' + s] = ('thigh' + s, c(g['knee']), c(g['ankle']))
        self.order = ['root', 'hip', 'chest', 'head'] + [f'{k}{s}' for s in 'LR' for k in ('uarm', 'farm', 'hand', 'thigh', 'shin')]

    def axis_angle(self, name):
        _, p, q = self.b[name]
        return math.degrees(math.atan2(q[0] - p[0], q[1] - p[1]))   # 아래(0,1)에서 잰 각

    def matrices(self, pose):
        """pose: 뼈 → {rot, sx, sy, tx, ty}. 반환: 뼈 → 3×3 (쉼 자세의 점 → 지금 자리)."""
        M = {}
        for name in self.order:
            parent, p, _ = self.b[name]
            q = pose.get(name, {})
            rot, sx, sy = q.get('rot', 0.0), q.get('sx', 1.0), q.get('sy', 1.0)
            # ⚠ 뼈 길이는 **바꾸지 않는다**(0.70.26 — 사용자 요청: "몸이랑 다리 비율이 이상해진 거는 빼 줘").
            #   앞모습에서 무릎을 드는 것을 다리를 줄여서(sy<1) 흉내 냈더니 짧은 다리·납작한 몸이 되었다.
            #   다리를 들 때는 반바지 속으로 **밀어 올리고**(ty), 무릎은 **돌려서**(rot) 굽힌다.
            if abs(sx - 1) > 1e-6 or abs(sy - 1) > 1e-6:
                raise ValueError(f'뼈 길이를 바꾸면 안 된다: {name} sx={sx} sy={sy}')
            tx, ty = q.get('tx', 0.0), q.get('ty', 0.0)
            phi = -self.axis_angle(name)    # 뼈 축을 세로로 돌려 놓고 늘인다
            Saxis = mat_R(-phi) @ mat_S(sx, sy) @ mat_R(phi)
            L = mat_T(tx, ty) @ mat_T(*p) @ mat_R(rot) @ Saxis @ mat_T(-p[0], -p[1])
            M[name] = (M[parent] @ L) if parent else L
        # 덧뼈 — 어깨받이는 윗팔을 **반쯤** 따라 돈다(가슴에 붙은 채로 어깨를 덮는다),
        #        망토는 목에 매달려 흔들린다. 둘 다 길이는 그대로(돌리기만).
        for sd in 'LR':
            _, S_, _ = self.b['uarm' + sd]
            r = pose.get('uarm' + sd, {}).get('rot', 0.0) * 0.55
            M['pad' + sd] = M['chest'] @ mat_T(*S_) @ mat_R(r) @ mat_T(-S_[0], -S_[1])
        _, N_, _ = self.b['head']
        r = pose.get('cape', {}).get('rot', 0.0)
        M['cape'] = M['chest'] @ mat_T(*N_) @ mat_R(r) @ mat_T(-N_[0], -N_[1])
        return M


# ─────────────────────────────────────────────────────────────
# 조각 나누기
# ─────────────────────────────────────────────────────────────
def load_body(name):
    im = np.asarray(Image.open(os.path.join(REF, f'body_{name}.png')).convert('RGBA'))
    return im


def classify(im, rig):
    """몸 틀 좌표의 조각 번호. 0 없음 1 머리 2 몸통 3 뒷머리 4 왼팔 5 오른팔 6 왼다리 7 오른다리"""
    a = im[..., 3] > 0
    rgb = im[..., :3].astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    yy, xx = np.mgrid[0:BH, 0:BW]
    lab = np.zeros((BH, BW), np.uint8)

    jaw = np.array(rig['jaw'], np.float64)
    jaw_y = np.interp(np.arange(BW), jaw[:, 0], jaw[:, 1])
    head = a & (yy < jaw_y[None, :])

    arms = {}
    for s in 'LR':
        A = rig[s]
        hole = A['armhole']
        y_top, y_pit = hole[0][1], hole[-1][1]
        bound = np.full(BH, np.nan)
        for y in range(y_top, y_pit + 1):
            bound[y] = polyline_x(hole, y)
        # 겨드랑이 아래 — 팔과 몸 사이 빈틈의 한가운데
        last = polyline_x(hole, y_pit)
        for y in range(y_pit + 1, A['bottom'] + 1):
            row = a[y]
            lo, hi = (int(last) - 40, int(last) + 40)
            xs = np.arange(max(0, lo), min(BW, hi))
            gap = xs[~row[xs]]
            if len(gap):
                # 지난 줄의 경계에 가장 가까운 빈칸 덩어리의 가운데
                runs = np.split(gap, np.where(np.diff(gap) != 1)[0] + 1)
                best = min(runs, key=lambda rr: abs((rr[0] + rr[-1]) / 2 - last))
                last = (best[0] + best[-1]) / 2
            bound[y] = last
        side = np.zeros((BH, BW), bool)
        for y in range(y_top, A['bottom'] + 1):
            if s == 'L':
                side[y, :int(round(bound[y]))] = True
            else:
                side[y, int(round(bound[y])) + 1:] = True
        arm = a & side & ~head
        if rig['long_hair']:
            # 팔 = 팔의 **밝은** 덩어리(씨앗: 팔꿈치·손목·손) + 그 둘레 6점의 선.
            # 밝기만 본다 — 손목의 붕대(잿빛)도 팔이다. 머리칼의 밝은 결은 검은 선에 막혀 안 이어진다.
            light = arm & (lum > 112)
            n, cc = cv2.connectedComponents(light.astype(np.uint8), connectivity=4)
            keep = set()
            for key in ('elbow', 'wrist', 'grip'):
                x0, y0 = A[key]
                win = cc[y0 - 6:y0 + 7, x0 - 6:x0 + 7]
                keep |= set(np.unique(win[win > 0]).tolist())
            skin = np.isin(cc, list(keep))
            skin = cv2.morphologyEx(skin.astype(np.uint8), cv2.MORPH_CLOSE,
                                    cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))).astype(bool)
            near = ndi.distance_transform_edt(~skin) <= 6
            arm = arm & (skin | (near & (lum < 90)))
            # 어깨 위 — 살 덩어리가 목까지 이어지면 안 된다(armhole 이 막는다)
        # 남은 부스러기 — 팔 쪽 자리에서 팔 둘레 12점 안의 선(뒷머리 색이 아닌 것)은 팔이다
        if rig['long_hair']:
            left = a & side & ~head & ~arm & (yy > A['armhole'][-1][1] - 20)
            brown_ = (r > g) & (g >= b - 8) & (lum < 175) & (lum > 60)
            left &= (ndi.distance_transform_edt(~arm) <= 12) & (~brown_ | (yy > 565))   # 머리칼은 545 에서 끝난다
            arm = arm | left
        arms[s] = arm
        lab[arm] = 4 if s == 'L' else 5

    legs = {}
    for s in 'LR':
        G = rig['leg' + s]
        side = (xx < 384) if s == 'L' else (xx >= 384)
        leg = a & side & (yy > G['hem']) & ~head & (lab == 0)
        legs[s] = leg
        lab[leg] = 6 if s == 'L' else 7

    rest = a & (lab == 0) & ~head
    if rig['long_hair']:
        # 뒷머리 = 턱 아래의 머리칼 중 **몸통 밖** (팔 경계 바깥)
        outside = np.zeros((BH, BW), bool)
        for s in 'LR':
            hole = rig[s]['armhole']
            for y in range(int(jaw_y.min()), BH):
                xb = polyline_x(hole, y)
                if s == 'L':
                    outside[y, :int(xb)] = True
                else:
                    outside[y, int(xb):] = True
        # 머리칼 색(갈색·짙음) 이거나 그 선. 손·팔 둘레에 남은 선 부스러기는 넣지 않는다.
        brown = (r > g) & (g >= b - 8) & (lum < 175)
        hair = rest & outside & (yy < 600) & (brown | (lum < 60))
        n, cc, st, _ = cv2.connectedComponentsWithStats(hair.astype(np.uint8), connectivity=8)
        big = np.zeros(n, bool); big[1:] = st[1:, cv2.CC_STAT_AREA] > 400
        hair = big[cc]
        lab[hair] = 3
    lab[head] = 1
    lab[a & (lab == 0)] = 2
    return lab


LAYER_NAMES = {1: 'head', 2: 'torso', 3: 'hairback', 4: 'armL', 5: 'armR', 6: 'legL', 7: 'legR'}
VIEW = {1: (240, 200, 120), 2: (80, 130, 230), 3: (150, 90, 40), 4: (240, 90, 90), 5: (240, 160, 30),
        6: (120, 220, 120), 7: (60, 200, 200)}


def debug_view(name, im, lab):
    v = np.zeros((BH, BW, 3), np.float32)
    for k, c in VIEW.items():
        v[lab == k] = c
    mix = (im[..., :3] * 0.45 + v * 0.55).astype(np.uint8)
    mix[lab == 0] = (30, 60, 35)
    return Image.fromarray(mix)


# ─────────────────────────────────────────────────────────────
# 층 — 원래 그림 + 가려 있던 곳 채움 + 뼈 섞는 비율
# ─────────────────────────────────────────────────────────────
class Layer:
    def __init__(self, name, rgba_body, bones, weight_fn):
        """rgba_body: 몸 틀 크기 RGBA(uint8). 굽는 틀로 옮겨 미리 곱한 알파로 둔다."""
        self.name = name
        canvas = np.zeros((CH, CW, 4), np.uint8)
        canvas[OY:OY + BH, OX:OX + BW] = rgba_body
        self.pm = premul(canvas)
        self.alpha = self.pm[..., 3]
        self.bones = bones
        self.weight_fn = weight_fn        # (xs, ys) → [뼈마다 비율] (합 1)
        ys, xs = np.where(self.alpha > 0.02)
        k = max(1, len(xs) // 4000)
        self.pts = np.stack([xs[::k], ys[::k]], 0).astype(np.float64) if len(xs) else np.zeros((2, 0))

    def render(self, M, out_rgba):
        """out 에 '위에 얹기'. M: 뼈 → 3×3."""
        if self.pts.shape[1] == 0:
            return
        Ms = [M[b] for b in self.bones]
        # 그릴 자리 — 층의 점을 뼈마다 옮겨 본 것의 상자
        P = np.vstack([self.pts, np.ones((1, self.pts.shape[1]))])
        xs, ys = [], []
        for Mb in Ms:
            q = Mb @ P
            xs.append(q[0]); ys.append(q[1])
        xs, ys = np.concatenate(xs), np.concatenate(ys)
        x0, x1 = int(max(0, xs.min() - 30)), int(min(CW, xs.max() + 30))
        y0, y1 = int(max(0, ys.min() - 30)), int(min(CH, ys.max() + 30))
        if x1 <= x0 or y1 <= y0:
            return
        Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float64)
        best_s = None
        best = np.full(X.shape, -1.0)
        sx = np.zeros_like(X); sy = np.zeros_like(Y)
        for bi, Mb in enumerate(Ms):
            Mi = np.linalg.inv(Mb)
            cx = Mi[0, 0] * X + Mi[0, 1] * Y + Mi[0, 2]
            cy = Mi[1, 0] * X + Mi[1, 1] * Y + Mi[1, 2]
            w = self.weight_fn(cx, cy)[bi]
            a = cv2.remap(self.alpha, cx.astype(np.float32), cy.astype(np.float32), cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            score = w * (a > 0.01) + 1e-3 * a
            take = score > best
            best[take] = score[take]
            sx[take] = cx[take]; sy[take] = cy[take]
        # 뉴턴 — F(s) = Σ w_b(s) M_b s 가 화면의 점이 되게 다듬는다
        if len(Ms) > 1:
            for _ in range(3):
                W = self.weight_fn(sx, sy)
                Fx = np.zeros_like(X); Fy = np.zeros_like(Y)
                J00 = np.zeros_like(X); J01 = np.zeros_like(X); J10 = np.zeros_like(X); J11 = np.zeros_like(X)
                for bi, Mb in enumerate(Ms):
                    w = W[bi]
                    Fx += w * (Mb[0, 0] * sx + Mb[0, 1] * sy + Mb[0, 2])
                    Fy += w * (Mb[1, 0] * sx + Mb[1, 1] * sy + Mb[1, 2])
                    J00 += w * Mb[0, 0]; J01 += w * Mb[0, 1]; J10 += w * Mb[1, 0]; J11 += w * Mb[1, 1]
                rx, ry = X - Fx, Y - Fy
                det = J00 * J11 - J01 * J10
                det = np.where(np.abs(det) < 1e-6, 1e-6, det)
                dx = (J11 * rx - J01 * ry) / det
                dy = (-J10 * rx + J00 * ry) / det
                sx = sx + np.clip(dx, -20, 20)
                sy = sy + np.clip(dy, -20, 20)
        src = cv2.remap(self.pm, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        src[best < 0.02] = 0
        dst = out_rgba[y0:y1, x0:x1]
        a = src[..., 3:4]
        dst[...] = src + dst * (1 - a)


def arm_weights(sk, s):
    """팔 한 짝 — [chest, uarm, farm] 섞는 비율. 어깨 위쪽은 가슴을, 팔꿈치 너머는 아래팔을 따른다."""
    _, sh, el = sk.b['uarm' + s]
    _, el2, wr = sk.b['farm' + s]
    u = np.array([el[0] - sh[0], el[1] - sh[1]], np.float64)
    ul = np.linalg.norm(u); u /= ul

    def fn(x, y):
        t_sh = (x - sh[0]) * u[0] + (y - sh[1]) * u[1]          # 어깨에서 팔 따라 잰 거리
        t_el = t_sh - ul                                        # 팔꿈치에서
        w_chest = 1 - smoothstep(-40, 10, t_sh)
        w_farm = smoothstep(-7, 7, t_el)          # 좁게 — 팔을 150° 접으면 넓은 섞임은 팔꿈치를 뭉갠다
        w_uarm = np.clip(1 - w_chest - w_farm, 0, 1)
        return [w_chest, w_uarm, w_farm]
    return fn


def leg_weights(sk, s):
    _, hp, kn = sk.b['thigh' + s]
    u = np.array([kn[0] - hp[0], kn[1] - hp[1]], np.float64)
    ul = np.linalg.norm(u); u /= ul

    def fn(x, y):
        t = (x - hp[0]) * u[0] + (y - hp[1]) * u[1] - ul
        w_shin = smoothstep(-22, 22, t)
        return [1 - w_shin, w_shin]
    return fn


def torso_weights(sk):
    _, waist, _ = sk.b['chest']

    def fn(x, y):
        w_chest = 1 - smoothstep(waist[1] - 30, waist[1] + 30, y)
        return [1 - w_chest, w_chest]
    return fn


def hair_weights(sk):
    _, neck, _ = sk.b['head']

    def fn(x, y):
        w_head = 1 - 0.7 * smoothstep(neck[1], neck[1] + 260, y)
        return [w_head, 1 - w_head]
    return fn


# ─────────────────────────────────────────────────────────────
# 가려 있던 곳 채우기
# ─────────────────────────────────────────────────────────────
def extend_down_up(img, mask_rows_from, x0, x1, y_from, y_to):
    """x0..x1 줄마다 y_from 의 점을 y_to..y_from 으로 위로 늘인다(다리를 반바지 속으로)."""
    out = img.copy()
    for x in range(x0, x1):
        px = img[y_from, x]
        if px[3] == 0:
            continue
        out[y_to:y_from, x] = px
    return out


def _over(dst, src):
    """RGBA(uint8) 위에 RGBA 를 얹는다(몸 틀 크기)."""
    a = src[..., 3:4].astype(np.float32) / 255
    da = dst[..., 3:4].astype(np.float32) / 255
    oa = a + da * (1 - a)
    rgb = (src[..., :3] * a + dst[..., :3] * da * (1 - a)) / np.maximum(oa, 1e-6)
    return np.dstack([rgb, oa * 255]).clip(0, 255).astype(np.uint8)


_CACHE = {}


def build_layers(name, gear=None):
    """gear: {'parts': {조각: [RGBA...]}, 'layers': {'cape'|'padL'|'padR': RGBA}, 'pit': (r,g,b)}"""
    rig = RIGS[name]
    if name not in _CACHE:
        im0 = load_body(name)
        _CACHE[name] = (im0, classify(im0, rig))
    im, lab = _CACHE[name]
    if gear and gear.get('image') is not None:
        im = gear['image']          # 머리색을 바꾼 몸 등(npc-art) — 조각 나누기는 원래 몸 그대로
    sk = Skeleton(rig)
    L = {}
    gear = gear or {}
    ov = gear.get('parts', {})

    def dress(key, p):
        for o in ov.get(key, []):
            p = _over(p, o)
        return p

    def part(k):
        p = im.copy()
        p[lab != k] = 0
        return p

    # 다리 — 반바지 속으로 90점 늘인다
    for s, k in (('L', 6), ('R', 7)):
        p = part(k)
        G = rig['leg' + s]
        ys, xs = np.where(p[..., 3] > 0)
        yf = G['hem'] + 10
        row = np.where(p[yf, :, 3] > 0)[0]
        if len(row):
            p = extend_down_up(p, None, row.min(), row.max() + 1, yf, G['hem'] - 90)
        p = dress('leg' + s, p)
        L['leg' + s] = Layer('leg' + s, p, ['thigh' + s, 'shin' + s], leg_weights(sk, s))

    # 몸통 — 목을 턱 밑으로 늘인다. **머리에 덮이는 자리만**(쉴 때는 안 보인다),
    # 목의 살 기둥만(양옆 선은 늘이지 않는다 — 늘이면 턱 옆에 세로줄이 선다).
    p = part(2)
    nx, ny = rig['neck']
    jy = int(np.interp(nx, [q[0] for q in rig['jaw']], [q[1] for q in rig['jaw']]))
    yf = jy + 10
    rgbf = im[yf, :, :3].astype(int)
    skinrow = (p[yf, :, 3] > 0) & (rgbf[:, 0] - rgbf[:, 2] > 40) & (rgbf.mean(1) > 120)
    cols = np.where(skinrow & (np.abs(np.arange(BW) - nx) < 60))[0]
    if len(cols):
        c0, c1 = cols.min() + 3, cols.max() - 3
        headm = lab == 1
        for x in range(c0, c1 + 1):
            ys = np.arange(jy - 90, yf)
            ys = ys[headm[ys, x] | (p[ys, x, 3] == 0)]
            p[ys, x] = im[yf, x]
            p[ys, x, 3] = 255
    p = dress('torso', p)
    L['torso'] = Layer('torso', p, ['hip', 'chest'], torso_weights(sk))

    # 머리
    L['head'] = Layer('head', dress('head', part(1)), ['head'], lambda x, y: [np.ones_like(x)])

    # 팔 — 뒤(어깨는 옷 밑) + 앞(겨드랑이 아래만, 몸통 위로 지나갈 때)
    for s, k in (('L', 4), ('R', 5)):
        p = part(k)
        fn = arm_weights(sk, s)
        # 어깨 속 — 팔을 들면 옷 가장자리와 팔 사이로 **겨드랑이**가 보인다. 가슴을 따라가는
        # 살색 판을 armhole 양쪽 22점에 깐다(몸통보다 뒤 — 쉴 때는 팔·옷에 가려 안 보인다).
        armm = lab == k
        lit = armm & (im[..., :3].mean(-1) > 150)
        skin_c = np.median(im[lit][:, :3], 0) if lit.any() else np.array([230, 180, 150])
        hole = rig[s]['armhole']
        fill = np.zeros((BH, BW, 4), np.uint8)
        for y in range(hole[0][1] + 12, hole[-1][1] + 1):
            xb = int(polyline_x(hole, y))
            a0, a1 = (xb - 6, xb + 24) if s == 'L' else (xb - 24, xb + 6)   # 몸통 쪽으로만
            fill[y, a0:a1, :3] = skin_c.astype(np.uint8)
            fill[y, a0:a1, 3] = 255
        # 몸 밖으로는 안 깐다 — 옷 가장자리의 **작은 홈**까지만(11점 닫기)
        solid = cv2.morphologyEx((lab == 2).astype(np.uint8), cv2.MORPH_CLOSE,
                                 cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0   # 몸통(옷) 안쪽과 그 홈만
        fill[~solid] = 0
        if gear.get('pit') is not None:
            fill[..., :3] = np.array(gear['pit'], np.uint8)     # 갑옷을 입으면 겨드랑이 속도 갑옷 색
        L['pit' + s] = Layer('pit' + s, fill, ['chest'], lambda x, y: [np.ones_like(x)])
        p = dress('arm' + s, p)
        L['arm' + s] = Layer('arm' + s, p, ['chest', 'uarm' + s, 'farm' + s], fn)
        pit = rig[s]['armhole'][-1][1]
        fr = p.copy()
        yy = np.arange(BH)[:, None]
        ramp = np.clip((yy - (pit + 10)) / 24.0, 0, 1)
        fr[..., 3] = (fr[..., 3] * ramp).astype(np.uint8)
        L['arm' + s + '_front'] = Layer('arm' + s + '_front', fr, ['chest', 'uarm' + s, 'farm' + s], fn)
        # 쥔 손가락 — 손의 아래 절반(무기 자루 위에 얹는다)
        gx, gy = rig[s]['grip']
        fg = p.copy()
        fg[..., 3] = (fg[..., 3] * np.clip((yy - (gy - 4)) / 10.0, 0, 1)).astype(np.uint8)
        L['fingers' + s] = Layer('fingers' + s, fg, ['chest', 'uarm' + s, 'farm' + s], fn)
        # 아래팔 — 팔꿈치 아래(가드·달리기에서 주먹이 **몸 앞**으로 올 때 맨 위에 그린다)
        ey = rig[s]['elbow'][1]
        fo = p.copy()
        fo[..., 3] = (fo[..., 3] * np.clip((yy - (ey - 4)) / 16.0, 0, 1)).astype(np.uint8)
        L['fore' + s] = Layer('fore' + s, fo, ['chest', 'uarm' + s, 'farm' + s], fn)

    # 뒷머리 — 팔에 가려 있던 곳을 둘레 머리칼로 메운다
    if rig['long_hair']:
        p = part(3)
        hair = p[..., 3] > 0
        hull = np.zeros((BH, BW), np.uint8)
        for side in (np.arange(BW)[None, :] < 384, np.arange(BW)[None, :] >= 384):
            hs = hair & side
            if hs.sum() > 50:
                pts = np.column_stack(np.where(hs)[::-1]).astype(np.int32)
                cv2.fillPoly(hull, [cv2.convexHull(pts).reshape(-1, 2)], 1)
        hole = (hull > 0) & ~hair & ((lab == 4) | (lab == 5) | (lab == 2))    # 빈칸(머리칼 사이 틈)은 메우지 않는다
        if hole.any():
            # 머리칼만 아는 점으로 두고 메운다 — 살·옷 색이 새어 들지 않는다
            filled = cv2.inpaint(np.ascontiguousarray(im[..., :3]), (~hair).astype(np.uint8), 9, cv2.INPAINT_TELEA)
            p[hole, :3] = filled[hole]
            p[hole, 3] = 255
        L['hairback'] = Layer('hairback', p, ['head', 'chest'], hair_weights(sk))
    for key, img in gear.get('layers', {}).items():
        if key == 'cape':
            L['cape'] = Layer('cape', img, ['cape'], lambda x, y: [np.ones_like(x)])
        elif key in ('padL', 'padR'):
            L[key] = Layer(key, img, [key], lambda x, y: [np.ones_like(x)])
        elif key == 'hairfront':
            L[key] = Layer(key, img, ['head'], lambda x, y: [np.ones_like(x)])
        elif key == 'drape':
            # 0.70.29 — 뒷모습에서 등 위로 흘러내린 머리칼(tools/body-views.py). 옷 · 갑옷보다 위.
            L[key] = Layer(key, img, ['head', 'chest'], hair_weights(sk))
    return im, lab, sk, L


# ─────────────────────────────────────────────────────────────
# 무기 — 준 그림(용사·사냥꾼·마법사)의 무기 층에서 오려 쓴다
# ─────────────────────────────────────────────────────────────
WEAPONS = {
    # grip: 무기 그림(준 그림 좌표)에서 손이 잡는 점 · tip: 끝 쪽(방향을 정한다)
    'sword': {'cls': 'warrior', 'layers': (9,), 'grip': (512, 724), 'tip': (657, 252), 'scale': 0.78},
    # 활 — 준 그림은 아래 날개가 사냥꾼 몸에 가려 조각나 있다. 위 날개를 **뒤집어** 아래 날개로 쓴다
    # (활은 위아래가 같다). 시위는 그림에서 빼고 따로 긋는다(당기면 휘어야 하므로).
    'bow': {'cls': 'ranger', 'layers': (9,), 'grip': (622, 612), 'tip': (635, 166), 'scale': 0.78,
            'ends': [(633, 172), (633, 1052)]},
    'staff': {'cls': 'mage', 'layers': (9,), 'grip': (605, 520), 'tip': (636, 170), 'scale': 0.78},
}


def build_bow():
    w = WEAPONS['bow']
    im = np.asarray(Image.open(os.path.join(REF, 'ranger_ref_cut.png')).convert('RGBA'))
    lab = np.asarray(Image.open(os.path.join(ROOT, 'art', 'parts', 'ranger', 'labels.png')))
    m = (lab == 9)
    yy, xx = np.mgrid[0:BH, 0:BW]
    up = m & (yy < 572)
    # 시위(가는 줄)를 걷는다 — 열어서 굵은 것만 남긴 뒤 원래 모양으로 되살린다
    op = cv2.morphologyEx(up.astype(np.uint8), cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, cc = cv2.connectedComponents(op, connectivity=8)
    keep = cc == cc[200, 638] if cc[200, 638] else op > 0
    limb = up & (ndi.distance_transform_edt(~keep) <= 4)
    gy = w['grip'][1]
    H2 = gy * 2 + 60
    out = np.zeros((max(H2, BH), BW, 4), np.uint8)
    out[:BH][limb] = im[limb]
    # 아래 날개 = 위 날개(술 장식 빼고)를 grip 높이에서 뒤집은 것
    body_only = limb & ~((xx > 648) & (yy > 440))
    ys, xs = np.where(body_only)
    ys2 = 2 * gy - ys
    ok = ys2 < out.shape[0]
    out[ys2[ok], xs[ok]] = im[ys[ok], xs[ok]]
    # 손잡이 — 가죽을 감은 짧은 막대(손가락이 거의 다 덮는다)
    img = Image.fromarray(out, 'RGBA')
    d = ImageDraw.Draw(img)
    gx = w['grip'][0]
    d.rounded_rectangle((gx - 19, gy - 52, gx + 19, gy + 52), radius=12, fill=(26, 18, 16, 255))
    d.rounded_rectangle((gx - 14, gy - 47, gx + 14, gy + 47), radius=9, fill=(122, 80, 52, 255))
    for k in range(-40, 41, 14):
        d.line((gx - 13, gy + k - 4, gx + 13, gy + k + 4), fill=(78, 50, 34, 255), width=4)
    return np.asarray(img)


def register_weapon(key, img_path, grip, tip, ends=None, scale=1.0):
    """새로 그린 무기(tools/gear-art.py) — 그림 한 장과 손잡이·끝 좌표."""
    WEAPONS[key] = {'img': img_path, 'grip': tuple(grip), 'tip': tuple(tip), 'scale': scale}
    if ends:
        WEAPONS[key]['ends'] = [tuple(e) for e in ends]


def load_weapon(key):
    w = WEAPONS[key]
    if 'img' in w:
        return np.asarray(Image.open(w['img']).convert('RGBA'))
    if key == 'bow':
        return build_bow()
    im = np.asarray(Image.open(os.path.join(REF, f"{w['cls']}_ref_cut.png")).convert('RGBA'))
    lab = np.asarray(Image.open(os.path.join(ROOT, 'art', 'parts', w['cls'], 'labels.png')))
    m = np.isin(lab, w['layers'])
    # 손(gskin·ggl) 자리는 무기 자루로 메운다 — 쥔 손은 몸의 손가락으로 다시 그린다
    grip_m = np.isin(lab, (11, 12))
    out = im.copy()
    out[~m] = 0
    if grip_m.any():
        hole = grip_m & (ndi.binary_dilation(m, iterations=14))
        src = im[..., :3].copy(); src[~m] = 0
        filled = cv2.inpaint(np.ascontiguousarray(src), (hole).astype(np.uint8), 7, cv2.INPAINT_TELEA)
        # 자루는 좁다 — 자루의 곧은 줄(grip → tip 반대쪽) 둘레만 메운다
        g = np.array(w['grip'], np.float64); t = np.array(w['tip'], np.float64)
        d = (t - g) / np.linalg.norm(t - g)
        yy, xx = np.mgrid[0:BH, 0:BW]
        perp = np.abs((xx - g[0]) * d[1] - (yy - g[1]) * d[0])
        shaft = hole & (perp < 14)
        out[shaft, :3] = filled[shaft]
        out[shaft, 3] = 255
    return out


class Weapon:
    def __init__(self, key):
        self.key = key
        self.w = WEAPONS[key]
        img = load_weapon(key)
        ys, xs = np.where(img[..., 3] > 0)
        x0, y0 = max(0, xs.min() - 4), max(0, ys.min() - 4)      # ⚠ 음수로 자르면 빈 그림이 된다
        x1, y1 = xs.max() + 5, ys.max() + 5
        self.img = premul(img[y0:y1, x0:x1])
        self.off = (x0, y0)
        g, t = self.w['grip'], self.w['tip']
        self.axis = math.degrees(math.atan2(t[0] - g[0], t[1] - g[1]))   # 아래에서 잰 각(끝 쪽)

    def matrix(self, M_hand, hand_grip, angle):
        """angle: 무기 끝이 가리키는 쪽(아래에서 잰 각, 손 뼈 기준). 무기 그림 → 굽는 틀."""
        k = self.w['scale']
        g = self.w['grip']
        # 무기 그림의 grip 을 원점으로 → 끝이 '아래'를 보게 → angle 만큼 → 손의 grip 으로
        A = mat_T(*hand_grip) @ mat_R(-angle) @ mat_R(self.axis) @ mat_S(k, k) @ mat_T(-(g[0] - self.off[0]), -(g[1] - self.off[1]))
        return M_hand @ A

    def render(self, Mw, out):
        H_, W_ = self.img.shape[:2]
        corners = np.array([[0, 0, 1], [W_, 0, 1], [0, H_, 1], [W_, H_, 1]], np.float64).T
        q = Mw @ corners
        x0, x1 = int(max(0, q[0].min() - 2)), int(min(CW, q[0].max() + 2))
        y0, y1 = int(max(0, q[1].min() - 2)), int(min(CH, q[1].max() + 2))
        if x1 <= x0 or y1 <= y0:
            return
        Mi = np.linalg.inv(Mw)
        Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        sx = Mi[0, 0] * X + Mi[0, 1] * Y + Mi[0, 2]
        sy = Mi[1, 0] * X + Mi[1, 1] * Y + Mi[1, 2]
        src = cv2.remap(self.img, sx.astype(np.float32), sy.astype(np.float32), cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        dst = out[y0:y1, x0:x1]
        dst[...] = src + dst * (1 - src[..., 3:4])

    def point(self, Mw, p):
        """무기 그림(준 그림 좌표)의 한 점이 지금 어디 있나."""
        v = np.array([p[0] - self.off[0], p[1] - self.off[1], 1.0])
        q = Mw @ v
        return (q[0], q[1])


if __name__ == '__main__':
    if '--debug' in sys.argv:
        for n in ('m1', 'f1', 'm2', 'f2'):
            im, lab, sk, L = build_layers(n)
            os.makedirs(os.path.join(OUT, n), exist_ok=True)
            debug_view(n, im, lab).save(os.path.join(OUT, n, '_parts.png'))
            print('✓', n, {LAYER_NAMES[k]: int((lab == k).sum()) for k in LAYER_NAMES})


# ─────────────────────────────────────────────────────────────
# 한 장 그리기
# ─────────────────────────────────────────────────────────────
# 뒤 → 앞. 팔(겨드랑이 아래)은 머리보다 **먼저** — 팔을 머리 위로 올리면 머리 뒤로 간다.
# 어깨받이는 팔 앞·머리 뒤.
DEFAULT_ORDER = ['cape', 'hairback', 'legL', 'legR', 'pitL', 'pitR', 'armL', 'armR', 'torso', 'drape',
                 'armL_front', 'armR_front', 'padL', 'padR', 'head']


class Body:
    def __init__(self, name, gear=None):
        self.name = name
        self.rig = RIGS[name]
        self.im, self.lab, self.sk, self.L = build_layers(name, gear)
        self.weapons = {}

    def ik(self, pose, side, target, bend='out'):
        """손(쥐는 점)을 target(몸 틀 좌표)에 두는 윗팔·아래팔 각을 pose 에 넣어 돌려준다.
        뼈 길이는 그대로 — 닿지 않으면 팔을 쭉 편다."""
        pose = {k: (dict(v) if isinstance(v, dict) else v) for k, v in pose.items()}
        for b in ('uarm' + side, 'farm' + side):
            pose.setdefault(b, {})['rot'] = 0.0
        # target 은 **가슴에 붙은 좌표**(쉬는 자세의 몸 틀)다 — 몸이 뛰어오르거나 기울어도
        # "주먹은 턱 아래" 가 그대로 턱 아래다.
        t = np.array([target[0] + OX, target[1] + OY], float)
        _, S, E = self.sk.b['uarm' + side]
        G = to_canvas(self.rig[side]['grip'])
        S, E, G = np.array(S, float), np.array(E, float), np.array(G, float)
        a, b = np.linalg.norm(E - S), np.linalg.norm(G - E)
        d = np.clip(np.linalg.norm(t - S), abs(a - b) + 1, a + b - 0.5)
        phi = math.atan2(t[1] - S[1], t[0] - S[0])
        alpha = math.acos(np.clip((a * a + d * d - b * b) / (2 * a * d), -1, 1))
        cands = []
        for sg in (1, -1):
            e = S + a * np.array([math.cos(phi + sg * alpha), math.sin(phi + sg * alpha)])
            cands.append(e)
        cx = OX + 384
        if bend == 'out':
            e = max(cands, key=lambda e: abs(e[0] - cx))
        elif bend == 'in':
            e = min(cands, key=lambda e: abs(e[0] - cx))
        elif bend == 'down':
            e = max(cands, key=lambda e: e[1])
        else:
            e = min(cands, key=lambda e: e[1])
        tt = S + (t - S) / max(np.linalg.norm(t - S), 1e-6) * d
        th_u = math.degrees(math.atan2(e[1] - S[1], e[0] - S[0]) - math.atan2(E[1] - S[1], E[0] - S[0]))
        th_f = math.degrees(math.atan2(tt[1] - e[1], tt[0] - e[0]) - math.atan2(G[1] - E[1], G[0] - E[0])) - th_u
        norm = lambda x: (x + 180) % 360 - 180
        pose['uarm' + side]['rot'] = norm(th_u)
        pose['farm' + side]['rot'] = norm(th_f)
        return pose

    def sole(self, M, side):
        """발바닥 한가운데가 지금 어디 있나."""
        g = self.rig['leg' + side]
        p = to_canvas((g['ankle'][0], self.rig['ground'][1]))
        q = M['shin' + side] @ np.array([p[0], p[1], 1.0])
        return q[0], q[1]

    def solve(self, pose):
        """'_plant': 낮은 발을 땅에 댄다(다리를 굽혀도 몸이 내려앉게). '_lift': 그만큼 띄운다."""
        M = self.sk.matrices(pose)
        if pose.get('_fit'):
            # 누운 자세 — 몸 전체의 상자를 재어 **바닥에 눕히고 가운데로** 옮긴다
            xs, ys = [], []
            for lay in self.L.values():
                if lay.pts.shape[1] == 0:
                    continue
                P_ = np.vstack([lay.pts, np.ones((1, lay.pts.shape[1]))])
                q = M[lay.bones[-1]] @ P_
                xs.append(q[0]); ys.append(q[1])
            xs, ys = np.concatenate(xs), np.concatenate(ys)
            gy = to_canvas(self.rig['ground'])[1]
            pose = dict(pose)
            r = dict(pose.get('root', {}))
            r['tx'] = r.get('tx', 0.0) + (CW / 2 - (xs.min() + xs.max()) / 2)
            r['ty'] = r.get('ty', 0.0) + (gy + 6 - ys.max())
            pose['root'] = r
            return self.sk.matrices(pose)
        if pose.get('_plant', True):
            gy = to_canvas(self.rig['ground'])[1]
            low = max(self.sole(M, 'L')[1], self.sole(M, 'R')[1])
            dy = gy - low - pose.get('_lift', 0.0)
            if abs(dy) > 1e-3:
                pose = dict(pose)
                r = dict(pose.get('root', {}))
                r['ty'] = r.get('ty', 0.0) + dy
                pose['root'] = r
                M = self.sk.matrices(pose)
        return M

    def weapon(self, key):
        if key not in self.weapons:
            self.weapons[key] = Weapon(key)
        return self.weapons[key]

    def render(self, pose, gear=None, order=None, fx=None):
        """pose: 뼈 → 값. gear: {'R': ('sword', 각도), 'L': ...}. 반환: 굽는 틀 크기 미리 곱한 RGBA(float)."""
        M = self.solve(pose)
        out = np.zeros((CH, CW, 4), np.float32)
        gear = gear or {}
        behind = pose.get('_weapon_behind', set())
        info = {'M': M, 'weapon': {}}
        wm = {}
        for side, spec in gear.items():
            key, ang = spec[0], spec[1]
            if len(spec) > 2 and spec[2] == 'world':
                # 화면에서 가리키는 쪽으로 준 각 → 아래팔 기준 각
                Mf = M['farm' + side]
                ang = ang + math.degrees(math.atan2(Mf[1, 0], Mf[0, 0]))
            w = self.weapon(key)
            grip = to_canvas(self.rig[side]['grip'])
            wm[side] = (w, w.matrix(M['farm' + side], grip, ang))
            info['weapon'][side] = wm[side]
        for side in behind:
            if side in wm:
                wm[side][0].render(wm[side][1], out)
        names = list(order or DEFAULT_ORDER)
        for sd in pose.get('_back', ()):          # 뒤로 흔든 팔 — 몸통 앞으로 나오지 않는다
            names = [n for n in names if n != f'arm{sd}_front']
        for sd in pose.get('_fore', ()):          # 앞으로 내민 주먹 — 맨 위(머리보다도 앞)
            names.append('fore' + sd)
        for name in names:
            if name in self.L:
                self.L[name].render(M, out)
        for side in ('L', 'R'):
            if side in wm and side not in behind:
                wm[side][0].render(wm[side][1], out)
                self.L['fingers' + side].render(M, out)
        if fx:
            for f in fx:
                f(out, info)
        return out, info


def to_image(pm, size=None):
    a = pm[..., 3:4]
    rgb = np.where(a > 1e-4, pm[..., :3] / np.maximum(a, 1e-4), 0)
    img = Image.fromarray((np.dstack([rgb, a]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
    if size:
        # 미리 곱한 채로 줄인다(가장자리에 검은 테가 안 끼게)
        chans = [Image.fromarray((pm[..., c] * 255).clip(0, 255).astype(np.uint8)) for c in range(4)]
        chans = [c.resize(size, Image.LANCZOS) for c in chans]
        arr = np.stack([np.asarray(c).astype(np.float32) / 255 for c in chans], -1)
        a = arr[..., 3:4]
        rgb = np.where(a > 1e-3, arr[..., :3] / np.maximum(a, 1e-3), 0)
        img = Image.fromarray((np.dstack([rgb, a]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
        rgbp = img.convert('RGB').filter(ImageFilter.UnsharpMask(0.6, 50, 2))
        img = Image.merge('RGBA', (*rgbp.split(), img.split()[3]))
    return img
