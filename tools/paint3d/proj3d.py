"""
지금 그림체(0.70 의 손그림) 그대로 — **앞 · 뒤 그림을 입체에 입혀** 8방향으로 돌리고 걷게 한다.

  bpyenv/bin/python tools/paint3d/proj3d.py CONFIG.json --out EXR_DIR [--work WORK_DIR] [--quick]
  (저장소 맨 위에서 돌린다 — 설정의 길은 저장소 기준, "{work}/…" 는 inputs.py 가 만든 폴더)

CONFIG: {"front_src": 앞 그림, "back_src": 뒤 그림(뒤에서 본 그대로), "front_mask": 윤곽을 잴 그림(알파),
         "cx" · "foot_y" · "top_y" · "height", "cuts": {자르는 줄 · 관절 열}, "depth": {조각 두께},
         "weapon": {"img", "len", "grip", "at", "rot"} (없으면 맨손), "res": 640, "elev": 20, "view": 7.6,
         "clean": [11, 50, 8, 2] (시안③ — 그림 면을 깔끔하게, 없으면 그대로)}
--quick 이면 쉬는 자세 한 장(8방향)만 — 자르는 줄을 맞출 때.

① 앞 그림의 윤곽(줄마다 왼끝 · 오른끝)을 그대로 부풀려 몸 조각을 만든다 — 앞에서 보면 그림과 윤곽이 똑같다.
   조각: 머리(머리칼 포함) · 몸통(반바지 포함) · 위팔 · 아래팔(손) · 허벅지 · 정강이 · 발(왼 · 오)
② 조각마다 UV 둘 — 'front'(앞 그림에서 그 자리) · 'back'(뒤 그림을 좌우로 뒤집은 자리).
   셰이더가 쉬는 자세의 법선으로 둘을 섞는다(앞을 보는 면은 앞 그림, 뒤를 보는 면은 뒤 그림, 옆은 섞임).
③ 관절에 붙여 hero3d 와 같은 걷기 · 달리기로 움직이고, 자료 패스(EXR)를 굽는다 → toon.py --paint
"""
import json
import math
import os
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Euler, Vector

ARGS = sys.argv[1:]
def _opt(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
WORK = _opt('--work', '.')
CFG = json.load(open(ARGS[0]))
def P(p):
    return os.path.abspath(p.replace('{work}', WORK)) if isinstance(p, str) else p
for _k in ('front', 'back', 'front_src', 'back_src', 'front_mask'):
    if _k in CFG:
        CFG[_k] = P(CFG[_k])
CFG.setdefault('front', CFG['front_src'])
CFG.setdefault('back', CFG['back_src'])
if CFG.get('weapon'):
    CFG['weapon']['img'] = P(CFG['weapon']['img'])
OUT = os.path.abspath(_opt('--out', CFG.get('out', 'out')))
if '--quick' in ARGS:
    CFG['actions'] = {'idle': 1}
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

# ── 그림 읽기(윤곽) ─────────────────────────────────────────
FRONT = bpy.data.images.load(CFG['front'])
BACK = bpy.data.images.load(CFG['back'])
W, H = FRONT.size
# 윤곽은 원본(알파가 살아 있는 것)에서 — 번진 바탕 그림은 알파가 다 1 이다
mask_img = bpy.data.images.load(CFG['front_mask'])
_mw, _mh = mask_img.size
px = np.array(mask_img.pixels[:], dtype=np.float32).reshape(_mh, _mw, 4)[::-1]  # 위가 0 인 줄 순서로
MASK = px[..., 3] > 0.5
if mask_img.size[0] != W:   # 작은 그림(게임 160 틀) — 키운 크기에 맞춰 부드럽게 키운다
    from PIL import Image as _I
    _m = _I.open(CFG['front_mask']).convert('RGBA').split()[3].resize((W, H), _I.BILINEAR)
    MASK = np.asarray(_m) > 127

CX = CFG.get('cx', 381.5)        # 몸 가운데 열
FOOT_Y = CFG.get('foot_y', 980)  # 발바닥 줄
TOP_Y = CFG.get('top_y', 68)
S = CFG.get('height', 5.9) / (FOOT_Y - TOP_Y)   # 그림 1px → 단위

# 긴 머리칼(여자) — 앞 그림에서 머리칼 빛깔(어둡고 붉은 갈색)인 데를 따로 잰다.
# 팔 · 손은 머리칼을 뺀 몸 자리(BODY)에서, 옆으로 늘어진 머리 다발은 머리칼 자리(HAIR)에서 자른다.
HCFG = CFG.get('hair')
HAIR = None
BODY = MASK
if HCFG:
    from PIL import Image as _I
    from scipy import ndimage as _nd
    _f = np.asarray(_I.open(CFG['front_src']).convert('RGBA').resize((W, H), _I.BICUBIC)).astype(np.float32) / 255
    _lum = 0.3 * _f[..., 0] + 0.59 * _f[..., 1] + 0.11 * _f[..., 2]
    _h = MASK & (_lum < HCFG.get('lum', 0.42)) & ((_f[..., 0] - _f[..., 2]) > HCFG.get('rb', 0.08))
    _h = _nd.binary_closing(_h, iterations=4) & MASK
    _h = _nd.binary_opening(_h, iterations=2)
    _h[:int(HCFG.get('lock_from', 0)) - 40] = False
    _h[int(HCFG.get('lock_to', H)) + 6:] = False
    HAIR = _h
    BODY = MASK & ~_nd.binary_dilation(HAIR, iterations=1)

def runs(y, m=None):
    row = (MASK if m is None else m)[int(y)]
    out, x = [], 0
    while x < W:
        if row[x]:
            s0 = x
            while x < W and row[x]:
                x += 1
            out.append((s0, x - 1))
        x += 1
    return [r for r in out if r[1] - r[0] >= 3]

def to_xz(col, y):
    return (col - CX) * S, (FOOT_Y - y) * S

# ── 재료(앞 · 뒤 섞기) ───────────────────────────────────────
def proj_material(name, FRONT=FRONT, BACK=BACK):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N = nt.nodes
    bsdf = N.get('Principled BSDF')
    def tex(img, uv):
        t = N.new('ShaderNodeTexImage')
        t.image = img
        t.interpolation = 'Linear'
        t.extension = 'EXTEND'
        u = N.new('ShaderNodeUVMap')
        u.uv_map = uv
        nt.links.new(u.outputs['UV'], t.inputs['Vector'])
        return t
    tf = tex(FRONT, 'front')
    tb = tex(BACK, 'back')
    tc = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Normal'], sep.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange')
    mr.interpolation_type = 'SMOOTHSTEP'
    mr.inputs['From Min'].default_value = -0.22
    mr.inputs['From Max'].default_value = 0.22
    nt.links.new(sep.outputs['Y'], mr.inputs['Value'])
    mix = N.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(tf.outputs['Color'], mix.inputs['A'])
    nt.links.new(tb.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    return m

PART_ROWS = {}   # 조각 이름 → [(줄, 왼끝, 오른끝)] — 조각마다 바탕 그림을 따로 만든다

_IDX = {'n': 0}
PARTS = []
def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    SC.collection.objects.link(e)
    e.parent = parent
    if parent is not None:
        # 부모의 쉬는 자리 기준 상대 좌표로
        e.location = Vector(loc) - parent_world(parent)
    else:
        e.location = loc
    e.rotation_mode = 'XYZ'
    return e

def parent_world(o):
    p = Vector((0, 0, 0))
    while o is not None:
        p += o.location
        o = o.parent
    return p

SMOOTH = CFG.get('smooth', 0)   # 고리 너비를 위아래 몇 줄씩 고르게(계단 같은 턱을 없앤다)

def loft(name, rows, joint, depth=1.0, yoff=None, seg=20, cap=True):
    """rows: [(y, xl, xr)] — 그림 줄 y 에서 열 xl..xr. 줄마다 타원 고리(앞뒤 반지름 = 가로 반지름 × depth)."""
    if SMOOTH and len(rows) > 2:
        k = int(SMOOTH)
        sm = []
        for i, (y, xl, xr) in enumerate(rows):
            lo, hi = max(0, i - k), min(len(rows), i + k + 1)
            sm.append((y, sum(r[1] for r in rows[lo:hi]) / (hi - lo), sum(r[2] for r in rows[lo:hi]) / (hi - lo)))
        rows = sm
    bm = bmesh.new()
    uv_f = bm.loops.layers.uv.new('front')
    uv_b = bm.loops.layers.uv.new('back')
    jw = parent_world(joint)
    rings = []
    for (y, xl, xr) in rows:
        a = max(0.5, (xr - xl) / 2) * S
        c = (xl + xr) / 2
        x0, z = to_xz(c, y)
        b = a * (depth(y) if callable(depth) else depth)
        dy = yoff(y) if yoff else 0.0
        ring = []
        for k in range(seg):
            t = 2 * math.pi * k / seg
            p = Vector((x0 + a * math.cos(t), dy + b * math.sin(t), z))
            ring.append(bm.verts.new(p - jw))
        rings.append(ring)
    faces = []
    for i in range(len(rings) - 1):
        for k in range(seg):
            faces.append(bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][(k + 1) % seg], rings[i][(k + 1) % seg])))
    if cap:
        faces.append(bm.faces.new(list(reversed(rings[-1]))))
        faces.append(bm.faces.new(rings[0]))
    bm.normal_update()
    for f in bm.faces:
        for l in f.loops:
            wp = l.vert.co + jw
            col = wp.x / S + CX
            yy = FOOT_Y - wp.z / S
            l[uv_f].uv = (col / W, 1 - yy / H)
            l[uv_b].uv = ((2 * CX - col) / W, 1 - yy / H)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    SC.collection.objects.link(ob)
    ob.parent = joint
    PART_ROWS[name] = list(rows)
    for p in ob.data.polygons:
        p.use_smooth = True
    md = ob.modifiers.new('sub', 'SUBSURF')
    md.levels = md.render_levels = 1
    _IDX['n'] += 1
    ob.pass_index = 700 + _IDX['n']   # 700~799 = 그림을 입힌 조각(toon.py --paint)
    PARTS.append(ob)
    return ob

def rows_between(y0, y1, step, pick):
    out = []
    y = y0
    while y <= y1:
        r = pick(y)
        if r:
            out.append((y, r[0], r[1]))
        y += step
    return out

def central(y, lo=None, hi=None, m=None):
    """가운데(몸통 · 머리) 토막 — lo · hi 가 있으면 그 열 안으로 자른다. m 이 있으면 그 자리(머리칼 뺀 몸 등)에서."""
    rs = runs(y, m)
    best = None
    for (a, b) in rs:
        if a <= CX <= b:
            best = (a, b)
    if best is None:
        return None
    a, b = best
    if lo is not None:
        a = max(a, lo)
    if hi is not None:
        b = min(b, hi)
    return (a, b) if b > a else None

def side_run(y, side, inner, outer=None, m=None):
    """팔 · 다리 토막 — side=-1 왼쪽 그림(캐릭터 오른쪽), +1 오른쪽.
    inner 보다 바깥만 · outer 가 있으면 그보다 안쪽만. 8px 이하 틈은 하나로 묶는다(엄지와 손가락 사이)."""
    got = []
    for (a, b) in runs(y, m):
        if side < 0:
            a2, b2 = a, min(b, inner)
            if outer is not None:
                a2 = max(a2, outer)
        else:
            a2, b2 = max(a, inner), b
            if outer is not None:
                b2 = min(b2, outer)
        if b2 - a2 >= 3:
            got.append((a2, b2))
    if not got:
        return None
    got.sort()
    groups = [list(got[0])]
    for a, b in got[1:]:
        if a - groups[-1][1] <= 8:          # 좁은 틈은 한 덩이
            groups[-1][1] = max(groups[-1][1], b)
        else:
            groups.append([a, b])
    if outer is not None:                   # 다리 — 가장 넓은 덩이
        g = max(groups, key=lambda g: g[1] - g[0])
    else:                                   # 팔 — 가장 바깥 덩이
        g = groups[0] if side < 0 else groups[-1]
    return tuple(g)

D = CFG.get('depth', {})  # 앞뒤 두께(가로 반지름에 곱한다)
C = CFG['cuts']   # 그림마다 다른 자르는 줄(몸마다 따로 잰다)
# ── 관절(그림 좌표로 정하고 단위로 바꾼다) ─────────────────────
def J(col, y):
    x, z = to_xz(col, y)
    return Vector((x, 0, z))

root = empty('root')
pelvis = empty('pelvis', root, J(CX, C['hip']))
spine = empty('spine', pelvis, J(CX, C['waist']))
chest = empty('chest', spine, J(CX, C['chest']))
neck = empty('neck', chest, J(CX, C['neck']))
head = empty('head', neck, J(CX, C['neck'] - 4))
sh_R = empty('sh_R', chest, J(C['sh_col_R'], C['shoulder']))
sh_L = empty('sh_L', chest, J(C.get('sh_col_L', 2 * CX - C['sh_col_R']), C['shoulder']))
el_R = empty('el_R', sh_R, J(C['el_col_R'], C['elbow']))
el_L = empty('el_L', sh_L, J(C.get('el_col_L', 2 * CX - C['el_col_R']), C['elbow']))
wr_R = empty('wr_R', el_R, J(C['wr_col_R'], C['wrist']))
wr_L = empty('wr_L', el_L, J(C.get('wr_col_L', 2 * CX - C['wr_col_R']), C['wrist']))
hip_R = empty('hip_R', pelvis, J(C['leg_col_R'], C['hip']))
hip_L = empty('hip_L', pelvis, J(C.get('leg_col_L', 2 * CX - C['leg_col_R']), C['hip']))
kn_R = empty('kn_R', hip_R, J(C['leg_col_R'], C['knee']))
kn_L = empty('kn_L', hip_L, J(C.get('leg_col_L', 2 * CX - C['leg_col_R']), C['knee']))
an_R = empty('an_R', kn_R, J(C['leg_col_R'], C['ankle']))
an_L = empty('an_L', kn_L, J(C.get('leg_col_L', 2 * CX - C['leg_col_R']), C['ankle']))

def _col_fn(v, mirror=False):
    """숫자 하나 또는 [[줄, 열], …](줄마다 이어 긋는다) → 줄 → 열. mirror 면 가운데에 비춘 열"""
    if not isinstance(v, list):
        return lambda y: v
    pts = sorted(v)
    ys = [p[0] for p in pts]
    cs = [(2 * CX - p[1]) if mirror else p[1] for p in pts]
    return lambda y: float(np.interp(y, ys, cs))
TLf = _col_fn(C['torso_l'])                                                   # 몸통 열(팔과 가르는 선)
TRf = _col_fn(C['torso_r']) if 'torso_r' in C else _col_fn(C['torso_l'], mirror=True)
# 머리(머리칼 포함) — 맨 위 ~ 목
HCLIP = sorted((HCFG or {}).get('head_clip', []))   # [[이 줄부터, 왼 열, 오른 열], …] — 옆 머리칼은 다발 조각이 맡는다
HC_RAMP = (HCFG or {}).get('head_ramp', 40)         # 그 줄 위로 몇 px 에 걸쳐 서서히 좁힌다(턱이 생기지 않게)
def head_run(y):
    r = central(y)
    if not HCLIP or r is None:
        return r
    a, b = r
    for (y0, lo, hi) in HCLIP:
        t = min(max((y - (y0 - HC_RAMP)) / HC_RAMP, 0.0), 1.0)
        if t > 0:
            a = a + (max(a, lo) - a) * t
            b = b + (min(b, hi) - b) * t
    return (a, b) if b > a else None
loft('head_p', rows_between(C.get('head_top', TOP_Y), C['neck'] + 10, 4, head_run), head, depth=lambda y: D.get('head', 1.0) if y < C['chin'] else D.get('neck', 0.8))
# 몸통(목 ~ 가랑이) — 팔이 붙은 줄은 몸통 열 안으로 자른다
loft('torso_p', rows_between(C['neck'] - 6, C['crotch'] + 14, 4,
                             (lambda y: central(y, TLf(y), TRf(y))) if HAIR is not None else
                             (lambda y: central(y, TLf(y), TRf(y)) if y >= C['neck'] + 8 else central(y))), spine,
     depth=lambda y: D.get('torso', 0.88) if y > C['shoulder'] else D.get('chest_top', 0.8))
# 팔
for side, sh, el, sgn in (('R', sh_R, el_R, -1), ('L', sh_L, el_L, 1)):
    inner = TLf if sgn < 0 else TRf
    def arm_run(y, s=sgn, i=inner):
        r = side_run(y, s, i(y), m=BODY)
        if r is None:
            return None
        a, b = r
        # 몸통과 맞닿은 쪽 끝은 몸통 열까지(그림 선 몇 px 때문에 겨드랑이에 틈이 생기지 않게)
        if s < 0 and i(y) - b < 14:
            b = i(y)
        if s > 0 and a - i(y) < 14:
            a = i(y)
        return (a, b)
    loft(f'uarm_{side}', rows_between(C['shoulder'] - 14, C['elbow'] + 10, 4, arm_run), sh, depth=D.get('uarm', 1.05))
    loft(f'farm_{side}', rows_between(C['elbow'] - 6, C['hand_end'], 4, arm_run), el, depth=D.get('farm', 1.0))
# 다리 — 가랑이 위 몇 줄은 가운데 토막을 반으로 가른다
# 긴 머리 다발(왼 · 오) — 어깨 바깥으로 늘어진 머리칼. 가슴에 붙여 몸과 함께 돈다
if HAIR is not None:
    def lock_run(y, sgn):
        got = [r for r in runs(y, HAIR) if (r[1] < CX - HCFG.get('lock_gap', 40) if sgn < 0 else r[0] > CX + HCFG.get('lock_gap', 40))]
        if not got:
            return None
        g = got[0] if sgn < 0 else got[-1]          # 가장 바깥 다발
        merged = [g]
        for r in (got[1:] if sgn < 0 else reversed(got[:-1])):
            if (r[0] - merged[-1][1] if sgn < 0 else merged[-1][0] - r[1]) <= 10:
                merged.append(r)
        return (min(r[0] for r in merged), max(r[1] for r in merged))
    lock_y = lambda y: HCFG.get('lock_yoff', 0.15) * (0.6 + 0.4 * (y - HCFG['lock_from']) / max(1, HCFG['lock_to'] - HCFG['lock_from']))
    for side, sgn in (('R', -1), ('L', 1)):
        loft(f'lock_{side}', rows_between(HCFG['lock_from'], HCFG['lock_to'], 4, lambda y, s=sgn: lock_run(y, s)), chest,
             depth=HCFG.get('lock_depth', 0.75), yoff=lock_y)

LEG_LO = C.get('leg_lo', TLf(C['crotch']) - 25)   # 다리 바깥 끝 열(손이 끼지 않게)
def leg_run(y, sgn):
    return side_run(y, sgn, CX, LEG_LO if sgn < 0 else 2 * CX - LEG_LO)
for side, hip, kn, an, sgn in (('R', hip_R, kn_R, an_R, -1), ('L', hip_L, kn_L, an_L, 1)):
    loft(f'thigh_{side}', rows_between(C['crotch'] - 20, C['knee'] + 10, 4, lambda y, s=sgn: leg_run(y, s)), hip, depth=D.get('leg', 1.0))
    loft(f'shin_{side}', rows_between(C['knee'] - 8, C['ankle'] + 6, 4, lambda y, s=sgn: leg_run(y, s)), kn, depth=D.get('leg', 1.0))
    # 발 — 앞으로 길게(아래로 갈수록 앞으로 밀린 고리)
    loft(f'foot_{side}', rows_between(C['ankle'] - 4, FOOT_Y - 2, 3, lambda y, s=sgn: leg_run(y, s)), an,
         depth=lambda y: 1.1 + 1.4 * max(0, (y - C['ankle']) / (FOOT_Y - C['ankle'])),
         yoff=lambda y: -0.22 * max(0, (y - C['ankle']) / (FOOT_Y - C['ankle'])) ** 0.8)

# ── 조각마다 바탕 그림 ─────────────────────────────────────
# 옆면은 조각의 끝 열을 길게 늘여 쓴다. 그 열에 그림 윤곽선이나 **옆 조각(팔 · 손)** 색이 있으면 옆에서 얼룩이 된다.
# 그래서 조각이 차지한 자리만 남기고(둘레 ERODE px 은 깎는다) 나머지는 가장 가까운 안쪽 색으로 번지게 한 그림을 조각마다 쓴다.
from PIL import Image as PImage
from scipy import ndimage

def _load_src(path):
    im = PImage.open(path).convert('RGBA')
    if im.size != (W, H):
        im = im.resize((W, H), PImage.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255.0

SRC_F = _load_src(CFG.get('front_src', CFG['front_mask']))
SRC_B = _load_src(CFG.get('back_src', CFG['back']))
CLEAN = CFG.get('clean')   # 시안③: [지름, 색 시그마, 자리 시그마, 횟수] — 긁힌 자국 · 얼룩을 걷어 면을 깔끔하게(선 · 눈은 남는다)
if CLEAN:
    import cv2
    def _clean(src):
        al = src[..., 3] > 0.5
        _, (iy, ix) = ndimage.distance_transform_edt(~al, return_indices=True)
        rgb = (src[..., :3][iy, ix] * 255 + 0.5).astype(np.uint8)
        for _ in range(int(CLEAN[3])):
            rgb = cv2.bilateralFilter(rgb, int(CLEAN[0]), CLEAN[1], CLEAN[2])
        out = src.copy()
        out[..., :3] = rgb.astype(np.float32) / 255.0
        return out
    SRC_F, SRC_B = _clean(SRC_F), _clean(SRC_B)
ERODE = CFG.get('erode', 6)

def region_of(rows, step=4):
    m = np.zeros((H, W), bool)
    rows = sorted(rows)
    for i, (y, xl, xr) in enumerate(rows):
        y_next, xl_n, xr_n = rows[i + 1] if i + 1 < len(rows) else (y + step, xl, xr)
        for yy in range(int(y - (step / 2 if i == 0 else 0)), int(min(y_next, y + step * 3))):
            if 0 <= yy < H:
                t = (yy - y) / max(1, y_next - y)
                t = min(max(t, 0), 1)
                a = int(round(xl + (xl_n - xl) * t))
                b = int(round(xr + (xr_n - xr) * t))
                m[yy, max(0, a):min(W, b + 1)] = True
    return m

def part_image(name, src, region):
    alpha = src[..., 3] > 0.5
    r = region & alpha
    e = ERODE
    keep = r
    while e > 0:
        keep = ndimage.binary_erosion(r, iterations=int(e))
        if keep.sum() > 0.25 * r.sum():
            break
        e -= 2
    if keep.sum() == 0:
        keep = r if r.sum() else alpha
    _, (iy, ix) = ndimage.distance_transform_edt(~keep, return_indices=True)
    rgb = src[..., :3][iy, ix]
    out = np.concatenate([rgb, np.ones((H, W, 1), np.float32)], -1)[::-1]   # 블렌더는 아래 줄부터
    img = bpy.data.images.new(name, W, H, alpha=True)
    img.pixels.foreach_set(out.ravel())
    return img

for ob in PARTS:
    reg = region_of(PART_ROWS[ob.name])
    # 뒤 그림은 좌우를 뒤집어 입힌다(uv 열 = 2*CX - 열) — 자리도 같은 식으로 옮긴다
    cols = np.arange(W)
    src_cols = np.clip(np.round(2 * CX - cols).astype(int), 0, W - 1)
    reg_b = reg[:, src_cols]
    imf = part_image(ob.name + '_f', SRC_F, reg)
    imb = part_image(ob.name + '_b', SRC_B, reg_b)
    ob.data.materials.append(proj_material('paint_' + ob.name, imf, imb))

# ── 무기(그림 칼) — 오른손(그림 왼쪽)에 쥔다. 칼끝이 위인 세운 그림을 십자 판 둘로 ──
WEAP = CFG.get('weapon')
if WEAP:
    simg = bpy.data.images.load(WEAP['img'])
    sw_, sh_ = simg.size
    spx = np.array(simg.pixels[:], dtype=np.float32).reshape(sh_, sw_, 4)   # 아래가 0 인 줄
    step = WEAP.get('step', 3)
    L_ = WEAP.get('len', 2.5)
    unit = L_ / sh_
    g0 = WEAP.get('grip', 0.2) * sh_      # 쥐는 자리(아래에서)
    sm = bpy.data.materials.new('sword')
    sm.use_nodes = True
    st = sm.node_tree.nodes.new('ShaderNodeTexImage')
    st.image = simg
    st.interpolation = 'Closest'
    sm.node_tree.links.new(st.outputs['Color'], sm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    hand_at = WEAP['at']                  # 쥔 손의 그림 자리 [열, 줄]
    hand = empty('sword', el_R, J(hand_at[0], hand_at[1]))
    for plane in ('x', 'y'):
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new('front')
        for yy in range(0, sh_ - step + 1, step):
            for xx in range(0, sw_ - step + 1, step):
                if spx[yy:yy + step, xx:xx + step, 3].mean() < 0.5:
                    continue
                cs = []
                for (ux, uy) in ((xx, yy), (xx + step, yy), (xx + step, yy + step), (xx, yy + step)):
                    h_ = (ux - sw_ / 2) * unit
                    v_ = (uy - g0) * unit
                    co = (h_, 0, v_) if plane == 'x' else (0, h_, v_)
                    cs.append(bm.verts.new(co))
                f_ = bm.faces.new(cs)
                for l, (ux, uy) in zip(f_.loops, ((xx, yy), (xx + step, yy), (xx + step, yy + step), (xx, yy + step))):
                    l[uvl].uv = ((ux + 0.0) / sw_, (uy + 0.0) / sh_)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        me = bpy.data.meshes.new('sword_' + plane)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new('sword_' + plane, me)
        SC.collection.objects.link(ob)
        ob.parent = hand
        ob.data.materials.append(sm)
        _IDX['n'] += 1
        ob.pass_index = 700 + _IDX['n']
        PARTS.append(ob)
    rx, ry, rz = WEAP.get('rot', [90, -8, 0])
    hand.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)))
ARMED = bool(WEAP)

# ── 카메라 · 굽기 설정(hero3d 와 같다) ───────────────────────
RES = CFG.get('res', 640)
ELEV = math.radians(CFG.get('elev', 20))
VIEW = CFG.get('view', 7.6)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
SC.collection.objects.link(cam)
SC.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = VIEW
zc = (VIEW / 2 - CFG.get('foot_margin', 0.12)) / math.cos(ELEV)
cam.location = (0, -30 * math.cos(ELEV), zc + 30 * math.sin(ELEV))
cam.rotation_euler = Euler((math.pi / 2 - ELEV, 0, 0))
SC.render.engine = 'CYCLES'
SC.cycles.samples = 1
SC.cycles.device = 'CPU'
SC.cycles.use_denoising = False
SC.cycles.pixel_filter_type = 'BOX'
SC.cycles.filter_width = 0.01
SC.render.film_transparent = True
SC.render.resolution_x = SC.render.resolution_y = RES
SC.render.use_compositing = False
vl = SC.view_layers[0]
vl.use_pass_normal = vl.use_pass_diffuse_color = vl.use_pass_object_index = vl.use_pass_z = True
SC.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
SC.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'

R = math.radians
JOINTS = [pelvis, spine, chest, neck, head, sh_L, sh_R, el_L, el_R, wr_L, wr_R, hip_L, hip_R, kn_L, kn_R, an_L, an_R]
REST = {j.name: Vector(j.location) for j in JOINTS}

def reset():
    for j in JOINTS:
        j.rotation_euler = Euler((0, 0, 0))
        j.location = REST[j.name]

def leg(hip, kn, an, thigh, knee, ankle):
    hip.rotation_euler = Euler((R(thigh), 0, 0))
    kn.rotation_euler = Euler((R(knee), 0, 0))
    an.rotation_euler = Euler((R(ankle), 0, 0))

def arm(sh, el, swing, bend, side):
    sh.rotation_euler = Euler((R(swing), 0, 0))
    el.rotation_euler = Euler((R(-bend), 0, 0))

def pose(action, ph):
    reset()
    tw = 2 * math.pi
    if action == 'idle':
        b = math.sin(tw * ph)
        arm(sh_L, el_L, 1, 2 + 2 * b, 'L')
        arm(sh_R, el_R, -4 if ARMED else 1, (50 if ARMED else 2) + 2 * b, 'R')
        chest.rotation_euler = Euler((R(-1.0 * b), 0, 0))
        pelvis.location = REST['pelvis'] + Vector((0, 0, 0.01 * b))
        return 0.0
    if action == 'walk':
        A, K, armA, bend, bob, lean = 24, 36, 20, 10, 0.06, 3
    else:
        A, K, armA, bend, bob, lean = 36, 78, 34, 70, 0.13, 9
    for hip, kn, an, off in ((hip_L, kn_L, an_L, 0.0), (hip_R, kn_R, an_R, 0.5)):
        q = (ph + off) % 1
        s, c = math.sin(tw * q), math.cos(tw * q)
        thigh = -A * s - (6 if action == 'run' else 0)
        knee = K * max(0.0, c) ** (1.2 if action == 'walk' else 0.8) + (4 if action == 'walk' else 12)
        if action == 'run' and s < 0:
            knee += 26 * (-s)
        ankle = -(thigh + knee) * 0.6 + (8 * s if action == 'run' else 0)
        leg(hip, kn, an, thigh, knee, ankle)
    for sh, el, side, off in ((sh_L, el_L, 'L', 0.0), (sh_R, el_R, 'R', 0.5)):
        q = (ph + off) % 1
        s = math.sin(tw * q)
        sw = armA * s * (0.55 if (ARMED and side == 'R') else 1.0)   # 칼 든 손은 덜 흔든다
        extra = 40 if (ARMED and side == 'R' and action == 'walk') else 0
        arm(sh, el, sw, bend + extra + (12 if action == 'run' else 6) * max(0, -s), side)
    twist = (4 if action == 'walk' else 7) * math.sin(tw * ph)
    spine.rotation_euler = Euler((R(lean), 0, R(twist)))
    pelvis.rotation_euler = Euler((0, 0, R(-twist * 0.8)))
    head.rotation_euler = Euler((R(-lean * 0.5), 0, R(-twist * 0.7)))
    return bob * (0.5 + 0.5 * math.cos(2 * tw * ph))

def ground(lift):
    bpy.context.view_layer.update()
    low = 1e9
    for name in ('foot_L', 'foot_R'):
        ob = bpy.data.objects[name]
        mw = ob.matrix_world
        for v in ob.data.vertices:
            low = min(low, (mw @ v.co).z)
    root.location = (0, 0, root.location.z - low + lift)
    bpy.context.view_layer.update()

# ── 오른손 자리 · 무기 방향(게임이 손그림 무기를 이 손에 쥐여 그린다) ──────────────
# 무기마다 손에 쥔 방향(팔이 늘어진 쉬는 자세의 손 기준: −Y 앞, +Z 위). 칼은 앞으로 조금 숙여, 활 · 지팡이는 세워서.
from bpy_extras.object_utils import world_to_camera_view
HAND_AT = CFG.get('hand_at')
HAND = empty('hand_R', el_R, J(*HAND_AT)) if HAND_AT else None
WDIR = {'sword': (0, -0.86, -0.5), 'bow': (0, 0.0, 1.0), 'staff': (0, 0.12, 1.0)}
WLEN = {'sword': 1.6, 'bow': 1.6, 'staff': 2.2}     # 앞뒤 가를 때 쓰는 대략 길이(단위)

def hand_info():
    """이 장의 오른손 — 틀 속 자리(px) · 무기마다 [방향 x, y(길이 1 이면 옆에서 본 온 길이), 몸 앞이면 1]"""
    if HAND is None:
        return None
    sz = CFG.get('frame', 160)
    def px(co):
        v = world_to_camera_view(SC, cam, co)
        return Vector((v.x * sz, (1 - v.y) * sz)), v.z
    H = HAND.matrix_world.translation.copy()
    hp, _ = px(H)
    _, zc_ = px(chest.matrix_world.translation)
    M3 = HAND.matrix_world.to_3x3().normalized()
    per_unit = sz / VIEW
    out = {'at': [round(hp.x, 2), round(hp.y, 2)]}
    for kind, d in WDIR.items():
        D = (M3 @ Vector(d)).normalized()
        tp, _ = px(H + D)
        _, zm = px(H + D * WLEN[kind] * 0.5)
        v = (tp - hp) / per_unit
        out[kind] = [round(v.x, 3), round(v.y, 3), 1 if zm < zc_ - 0.02 else 0]
    return out

DIRS = CFG.get('dirs', [0, 45, 90, 135, 180, 225, 270, 315])
ACTIONS = CFG.get('actions', {'idle': 2, 'walk': 8, 'run': 8})
bpy.context.view_layer.update()
meta = {'res': RES, 'elev': CFG.get('elev', 20), 'view': VIEW, 'frames': {}, 'cam_rot': [list(r) for r in cam.matrix_world.to_3x3()]}
for action, n in ACTIONS.items():
    for k in range(n):
        lift = pose(action, k / n)
        for yaw in DIRS:
            root.rotation_euler = Euler((0, 0, math.radians(yaw)))
            ground(lift if action == 'run' else 0.0)
            name = f'{action}_{k}_{yaw:03d}'
            SC.render.filepath = os.path.join(OUT, name + '.exr')
            bpy.ops.render.render(write_still=True)
            meta['frames'][name] = {'action': action, 'k': k, 'yaw': yaw}
            hi = hand_info()
            if hi:
                meta['frames'][name]['hand'] = hi
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
print('done', len(meta['frames']))
