"""
드래곤 필드 — 주인공 3D 인형(블렌더)으로 8방향 · 걷기 · 달리기 그림을 굽는다. (시안 2)

  bpyenv/bin/python hero3d.py CONFIG.json

CONFIG: {"out": 폴더, "outfit": "base"|"knight", "weapon": null|"sword", "body": "m1",
         "res": 640, "elev": 20, "view": 7.6, "dirs": [...], "actions": {"idle":2,"walk":8,"run":8}}

- 팔 · 다리 · 목은 **메타볼**(관절마다 매끈하게 이어지는 살) — 관절 빈 객체에 붙어 움직인다
- 몸통 · 반바지는 돌림체(높이마다 둘레가 다른 타원), 머리는 V 턱 타원체
- 머리칼은 **두피를 따라 흐르다 끝이 튀는 다발** 스무 개 남짓(다발마다 pass_index 가 달라 사이에 선이 생긴다)
- Cycles 1샘플로 자료 패스(Diffuse Color · Normal · Object Index · Depth)만 EXR 로 남긴다 → toon.py
"""
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Euler, Vector, Quaternion

CFG = json.load(open(sys.argv[-1]))
OUT = CFG['out']
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
SC = bpy.context.scene

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)

PAL = {
    'skin': '#f6caa6', 'hair': '#7b4a2c', 'hair2': '#6a3f25', 'shirt': '#e6dbc2', 'shorts': '#5e4c3f',
    'bandage': '#ebe2d2', 'iris': '#3c86d6', 'iris2': '#2a5ea8', 'sclera': '#ffffff', 'pupil': '#16233c',
    'lash': '#2a1810', 'brow': '#5a341e', 'mouth': '#a85848', 'cord': '#f4ecdc', 'neckv': '#efbf98',
    'nose': '#e0a888', 'blush': '#f2a890',
    'steel': '#cdd6e2', 'steel_dk': '#97a4b8', 'cloth_blue': '#3d66c0', 'leather': '#7a5235',
    'gold': '#e8c060', 'boot': '#5c4232', 'blade': '#e2e9f2', 'guard': '#d0a040', 'grip': '#5a3420',
}
_MATS = {}
def mat(name):
    if name not in _MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = srgb(PAL[name])
        _MATS[name] = m
    return _MATS[name]

_IDX = {'n': 0}
def next_index(kind='n'):
    _IDX['n'] += 1
    return {'n': 0, 'metal': 800, 'flat': 900}[kind] + _IDX['n']
PARTS = []

def finish(obj, color, kind='n', subdiv=2, smooth=True):
    if obj.type == 'MESH':
        obj.data.materials.clear()
        obj.data.materials.append(mat(color))
        if smooth:
            for p in obj.data.polygons:
                p.use_smooth = True
        if subdiv:
            md = obj.modifiers.new('sub', 'SUBSURF')
            md.levels = subdiv
            md.render_levels = subdiv
    obj.pass_index = next_index(kind)
    PARTS.append((obj, kind))
    return obj

def new_obj(name, bm, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    SC.collection.objects.link(ob)
    ob.parent = parent
    ob.location = loc
    return ob

def empty(name, parent=None, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    SC.collection.objects.link(e)
    e.parent = parent
    e.location = loc
    e.rotation_mode = 'XYZ'
    return e

def ellipsoid(name, r, loc=(0, 0, 0), parent=None, color='skin', seg=16, ring=10, kind='n', deform=None, subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=ring, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        if deform:
            x, y, z = deform(x, y, z)
        v.co = Vector((x * r[0], y * r[1], z * r[2]))
    return finish(new_obj(name, bm, parent, loc), color, kind, subdiv=subdiv)

def lathe(name, prof, parent, loc=(0, 0, 0), color='shirt', kind='n', seg=24, cap_top=True, cap_bot=True, yshift=None):
    """돌림체 — prof: [(z, rx, ry)] 아래에서 위로. yshift(z) 로 앞뒤로 밀 수 있다(가슴 · 엉덩이)."""
    bm = bmesh.new()
    rings = []
    for (z, rx, ry) in prof:
        dy = yshift(z) if yshift else 0.0
        rings.append([bm.verts.new((math.cos(2 * math.pi * k / seg) * rx, math.sin(2 * math.pi * k / seg) * ry + dy, z)) for k in range(seg)])
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if cap_bot:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    return finish(new_obj(name, bm, parent, loc), color, kind, subdiv=2)

def rbox(name, size, loc=(0, 0, 0), parent=None, color='shirt', kind='n', taper=None, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co
        sx, sy = taper(z + 0.5) if taper else (1, 1)
        v.co = Vector((x * size[0] * sx, y * size[1] * sy, z * size[2]))
    return finish(new_obj(name, bm, parent, loc), color, kind, subdiv=subdiv)

# ── 메타볼 살(팔 · 다리 · 목) ─────────────────────────────────
_FAM = {}
def meat(family, parent, a, b, r, color='skin', stiff=2.0):
    """관절 parent 에 붙은 캡슐 하나(a→b, 반지름 r). 같은 family 끼리 매끈하게 이어진다."""
    n = _FAM.get(family, 0)
    _FAM[family] = n + 1
    name = family if n == 0 else f'{family}.{n:03d}'
    mb = bpy.data.metaballs.new(name)
    mb.resolution = 0.06
    mb.render_resolution = 0.025
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    SC.collection.objects.link(ob)
    ob.parent = parent
    a, b = Vector(a), Vector(b)
    el = mb.elements.new()
    el.type = 'CAPSULE'
    el.co = (a + b) / 2
    el.radius = r
    el.size_x = max(0.001, (b - a).length / 2)
    el.stiffness = stiff
    d = (b - a).normalized() if (b - a).length > 1e-6 else Vector((1, 0, 0))
    el.rotation = Vector((1, 0, 0)).rotation_difference(d)
    if n == 0:
        mb.materials.append(mat(color))
        finish(ob, color)
    return ob

# ── 몸 치수(발바닥 z=0) ────────────────────────────────────
root = empty('root')
pelvis = empty('pelvis', root, (0, 0, 2.25))
spine = empty('spine', pelvis, (0, 0, 0.3))      # 2.55 허리
chest = empty('chest', spine, (0, 0, 0.45))      # 3.0
neck = empty('neck', chest, (0, 0, 0.42))        # 3.42 목 밑
head = empty('head', neck, (0, 0, 0.28))         # 3.70 끄덕이는 축
sh_L = empty('sh_L', chest, (0.64, 0.02, 0.3))    # 캐릭터 왼쪽(+X)
sh_R = empty('sh_R', chest, (-0.64, 0.02, 0.3))
el_L = empty('el_L', sh_L, (0.02, 0, -0.62))
el_R = empty('el_R', sh_R, (-0.02, 0, -0.62))
wr_L = empty('wr_L', el_L, (0, 0, -0.55))
wr_R = empty('wr_R', el_R, (0, 0, -0.55))
hip_L = empty('hip_L', pelvis, (0.27, 0, -0.2))  # 2.05
hip_R = empty('hip_R', pelvis, (-0.27, 0, -0.2))
kn_L = empty('kn_L', hip_L, (0, 0, -0.86))       # 1.19
kn_R = empty('kn_R', hip_R, (0, 0, -0.86))
an_L = empty('an_L', kn_L, (0, 0, -0.86))        # 0.33
an_R = empty('an_R', kn_R, (0, 0, -0.86))
OUTFIT = CFG.get('outfit', 'base')

# 살 — 팔
for side, sh, el, wr in (('L', sh_L, el_L, wr_L), ('R', sh_R, el_R, wr_R)):
    s = 1 if side == 'L' else -1
    fam = f'Arm{side}'
    meat(fam, sh, (0, 0, 0.02), (0.01 * s, 0, -0.6), 0.235)
    meat(fam, el, (0, 0, 0), (0, 0, -0.52), 0.2)
    meat(fam, wr, (0, -0.01, -0.02), (0, -0.03, -0.2), 0.235, stiff=2.6)   # 주먹
# 살 — 다리
for side, hip, kn in (('L', hip_L, kn_L), ('R', hip_R, kn_R)):
    fam = f'Leg{side}'
    meat(fam, hip, (0, 0, 0.05), (0, 0, -0.84), 0.27)
    meat(fam, kn, (0, 0.02, 0), (0, 0.02, -0.82), 0.205)
meat('Neck', neck, (0, 0, -0.05), (0, 0.02, 0.42), 0.2)

# 몸통(민소매 웃옷) — 높이마다 둘레(위로 갈수록 어깨로 좁아지며 닫힌다)
lathe('shirt', [(0.0, 0.57, 0.43), (0.12, 0.55, 0.42), (0.35, 0.5, 0.39), (0.62, 0.53, 0.41),
                (0.82, 0.55, 0.42), (0.96, 0.5, 0.38), (1.04, 0.38, 0.31), (1.1, 0.22, 0.2)],
      spine, (0, 0, -0.12), 'shirt', yshift=lambda z: -0.02 if 0.4 < z < 0.95 else 0.0)
# V 넥(앞에만 — 앞뒤가 갈린다) · 목둘레
# (V 넥 판은 뺐다 — 작게 줄이면 목 밑에 덩어리로만 보였다)
# 반바지 — 엉덩이 둘레 + 다리통(허벅지를 따라 움직인다)
lathe('shorts', [(0.0, 0.56, 0.44), (0.25, 0.57, 0.45), (0.5, 0.55, 0.43), (0.62, 0.53, 0.42)],
      pelvis, (0, 0, -0.35), 'shorts')
for side, hip in (('L', hip_L), ('R', hip_R)):
    lathe(f'shortleg_{side}', [(-0.5, 0.33, 0.34), (-0.25, 0.32, 0.33), (0.0, 0.31, 0.32), (0.08, 0.28, 0.29)],
          hip, (0, 0, 0), 'shorts', cap_top=False)
for dx in (-0.05, 0.05):
    ellipsoid(f'cord{dx}', (0.03, 0.025, 0.13), (dx, -0.47, 0.16), pelvis, 'cord', seg=8, ring=6, subdiv=0)

# 발 — 붕대 감은 맨발
for side, an in (('L', an_L), ('R', an_R)):
    rbox(f'foot_{side}', (0.33, 0.62, 0.26), (0, -0.13, -0.18), an, 'bandage', taper=lambda t: (0.95, 1.0 - 0.12 * t))
    lathe(f'wrap_{side}', [(-0.18, 0.2, 0.21), (0.0, 0.2, 0.21), (0.16, 0.19, 0.2)], an, (0, 0.01, 0), 'bandage')

# ── 머리 ───────────────────────────────────────────────────
HEAD_R = (0.98, 0.92, 1.0)
def head_shape(x, y, z):
    if z < 0:
        t = (-z) ** 1.25
        x *= 1 - 0.36 * t
        y *= 1 - 0.12 * t
        if y < 0:
            y -= 0.1 * t * (-y)
        z *= 1.08
    else:
        x *= 1 + 0.03 * z   # 머리통 위가 살짝 넓게
    return x, y, z

FACE = empty('face', head, (0, 0, 0.92))   # 머리 가운데 = 4.62
ellipsoid('head', HEAD_R, (0, 0, 0), FACE, 'skin', seg=28, ring=18, deform=head_shape, subdiv=2)

def on_head(u, v, off=0.0):
    d = Vector((math.sin(u) * math.cos(v), -math.cos(u) * math.cos(v), math.sin(v)))
    x, y, z = head_shape(*d)
    p = Vector((x * HEAD_R[0], y * HEAD_R[1], z * HEAD_R[2]))
    n = Vector((x / HEAD_R[0] ** 2, y / HEAD_R[1] ** 2, z / HEAD_R[2] ** 2)).normalized()
    return p + n * off, n

def decal(name, u, v, w, h, color, off, kind='flat', shape='ellipse', arc=0.0, thick=0.0, seg=20, tilt=0.0):
    bm = bmesh.new()
    pts = []
    if shape == 'ellipse':
        for k in range(seg):
            a = 2 * math.pi * k / seg
            pts.append((math.cos(a) * w / 2, math.sin(a) * h / 2))
    else:
        top, bot = [], []
        for k in range(seg + 1):
            t = k / seg
            x = (t - 0.5) * w
            y = arc * (1 - (2 * t - 1) ** 2) + tilt * (t - 0.5)
            th = thick * (0.3 + 0.7 * math.sin(t * math.pi) ** 0.6)
            top.append((x, y + th / 2))
            bot.append((x, y - th / 2))
        pts = top + bot[::-1]
    vs = []
    for (dx, dy) in pts:
        p, n = on_head(u + dx / (HEAD_R[0] * max(0.3, math.cos(v))), v + dy / HEAD_R[2], off)
        vs.append(bm.verts.new(p))
    bm.faces.new(vs)
    return finish(new_obj(name, bm, FACE), color, kind, subdiv=0, smooth=False)

EYE_U, EYE_V = 0.37, -0.2
for side, s in (('L', 1), ('R', -1)):
    u = EYE_U * s
    decal(f'sclera_{side}', u, EYE_V, 0.3, 0.4, 'sclera', 0.012)
    decal(f'iris_{side}', u - 0.01 * s, EYE_V - 0.025, 0.25, 0.34, 'iris', 0.02)
    decal(f'iris2_{side}', u - 0.01 * s, EYE_V + 0.04, 0.23, 0.15, 'iris2', 0.024)
    decal(f'pupil_{side}', u - 0.01 * s, EYE_V - 0.03, 0.1, 0.15, 'pupil', 0.03)
    decal(f'shine_{side}', u + 0.05 * s, EYE_V + 0.07, 0.085, 0.085, 'sclera', 0.036)
    decal(f'shine2_{side}', u - 0.06 * s, EYE_V - 0.11, 0.04, 0.04, 'sclera', 0.036)
    decal(f'lash_{side}', u, EYE_V + 0.19, 0.4, 0, 'lash', 0.04, shape='arc', arc=0.05, thick=0.085, tilt=-0.05 * s)
    decal(f'brow_{side}', u + 0.03 * s, EYE_V + 0.42, 0.32, 0, 'brow', 0.03, shape='arc', arc=0.03, thick=0.055, tilt=-0.06 * s)
    decal(f'blush_{side}', u * 1.15, EYE_V - 0.3, 0.18, 0.07, 'blush', 0.008, kind='n')
    ellipsoid(f'ear_{side}', (0.09, 0.15, 0.19), (0.95 * s, 0.05, -0.12), FACE, 'skin', seg=10, ring=8, subdiv=1)
decal('nose', 0.0, -0.46, 0.05, 0.03, 'nose', 0.02, kind='n')
decal('mouth', 0.0, -0.66, 0.15, 0, 'mouth', 0.02, shape='arc', arc=-0.02, thick=0.03)

# ── 머리칼 — 두피를 따라 흐르다 끝이 튀는 다발 ─────────────────
def clump(name, u0, v0, u1, v1, width, flick=0.15, lift=0.09, color='hair', steps=10, seg=8, twist=0.0, thick=0.13):
    bm = bmesh.new()
    rings = []
    for i in range(steps + 1):
        t = i / steps
        u = u0 + (u1 - u0) * t
        v = v0 + (v1 - v0) * t
        off = lift + flick * t ** 2.6
        p, n = on_head(u, v, off)
        p2, _ = on_head(u0 + (u1 - u0) * min(1, t + 0.02), v0 + (v1 - v0) * min(1, t + 0.02), lift + flick * min(1, t + 0.02) ** 2.6)
        tan = (p2 - p).normalized() if (p2 - p).length > 1e-6 else Vector((0, 0, -1))
        side = tan.cross(n).normalized()
        nn = side.cross(tan).normalized()
        w = width * (1 - t) ** 0.75 + 0.012
        th = thick * (1 - t) ** 0.6 + 0.01
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg + twist * t
            ring.append(bm.verts.new(p + side * (math.cos(a) * w / 2) + nn * (math.sin(a) * th / 2)))
        rings.append(ring)
    for i in range(steps):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    return finish(new_obj(name, bm, FACE), color, 'n', subdiv=1)

# 두피(속) — 다발 사이로 살이 비치지 않게
def scalp(x, y, z):
    x, y, z = head_shape(x, y, z)
    return x * 1.05, y * 1.05, z * 1.05
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=1.0)
kill = [f for f in bm.faces if (lambda c: (c.y < -0.3 and c.z < 0.45) or c.z < -0.55 or (abs(c.x) > 0.7 and c.z < 0.0 and c.y < 0.45))(f.calc_center_median())]
bmesh.ops.delete(bm, geom=kill, context='FACES')
for v in bm.verts:
    x, y, z = scalp(*v.co)
    v.co = Vector((x * HEAD_R[0], y * HEAD_R[1], z * HEAD_R[2]))
finish(new_obj('scalp', bm, FACE), 'hair2', subdiv=2)

PI = math.pi
CROWN = (PI * 0.92, 1.05)
H = []
# 앞머리 — 정수리 앞에서 이마로(눈썹 위에서 끝)
for (u1, v1, w, fl) in [(-0.55, 0.3, 0.32, 0.1), (-0.3, 0.14, 0.4, 0.06), (-0.04, 0.1, 0.42, 0.05), (0.22, 0.12, 0.42, 0.06), (0.48, 0.26, 0.36, 0.09), (0.7, 0.42, 0.28, 0.14)]:
    H.append((u1 * 0.4, 1.25, u1, v1, w, fl))
# 옆머리 — 귀를 덮고 아래로
for s in (1, -1):
    H.append((1.0 * s, 1.05, 1.32 * s, 0.0, 0.34, 0.16))
    H.append((1.4 * s, 1.0, 1.62 * s, -0.25, 0.34, 0.2))
# 정수리 · 뒤 — 가마에서 사방으로, 끝이 바깥으로 튄다(뒷모습의 실루엣)
for (u1, v1, w, fl) in [(PI, -0.5, 0.42, 0.28), (PI - 0.45, -0.45, 0.4, 0.3), (PI + 0.45, -0.45, 0.4, 0.3),
                        (PI - 0.9, -0.3, 0.38, 0.3), (PI + 0.9, -0.3, 0.38, 0.3), (PI - 1.3, 0.0, 0.36, 0.26), (PI + 1.3, 0.0, 0.36, 0.26),
                        (PI - 0.2, 0.2, 0.4, 0.34), (PI + 0.25, 0.25, 0.4, 0.36)]:
    H.append((CROWN[0], CROWN[1], u1, v1, w, fl))
# 위로 뻗친 다발(정수리 실루엣)
for (u0, v0, u1, v1, w, fl) in [(0.0, 1.45, 0.9, 0.75, 0.5, 0.22), (0.0, 1.45, -0.9, 0.75, 0.5, 0.22),
                                (2.4, 1.3, 2.0, 0.55, 0.48, 0.3), (-2.4, 1.3, -2.0, 0.55, 0.48, 0.3)]:
    H.append((u0, v0, u1, v1, w, fl))
for i, (u0, v0, u1, v1, w, fl) in enumerate(H):
    clump(f'hair{i:02d}', u0, v0, u1, v1, w, flick=fl, color='hair' if i % 3 else 'hair2', twist=0.2 * ((i % 5) - 2))

# ── 갑옷(기사 — 희귀) ────────────────────────────────────────
if OUTFIT == 'knight':
    lathe('cuirass', [(0.28, 0.6, 0.46), (0.5, 0.58, 0.45), (0.75, 0.6, 0.47), (0.92, 0.57, 0.44), (1.0, 0.45, 0.37), (1.05, 0.3, 0.27)],
          spine, (0, 0, -0.12), 'steel', kind='metal', cap_bot=False, yshift=lambda z: -0.03 if 0.5 < z < 0.95 else 0.0)
    ellipsoid('emblem', (0.17, 0.04, 0.2), (0, -0.5, 0.5), spine, 'cloth_blue', seg=12, ring=8, subdiv=1)
    lathe('belt', [(0.0, 0.6, 0.46), (0.14, 0.6, 0.46)], spine, (0, 0, 0.08), 'leather')
    ellipsoid('buckle', (0.11, 0.035, 0.09), (0, -0.47, 0.15), spine, 'gold', seg=10, ring=6, kind='metal', subdiv=1)
    lathe('skirt', [(0.0, 0.68, 0.55), (0.3, 0.6, 0.48), (0.55, 0.58, 0.46)], pelvis, (0, 0, -0.4), 'cloth_blue', cap_top=False, cap_bot=False)
    for side, sh in (('L', sh_L), ('R', sh_R)):
        s = 1 if side == 'L' else -1
        ellipsoid(f'pauldron_{side}', (0.36, 0.34, 0.26), (0.06 * s, 0, 0.04), sh, 'steel', kind='metal', subdiv=1, deform=lambda x, y, z: (x, y, max(z, -0.3)))
    for side, el, wr in (('L', el_L, wr_L), ('R', el_R, wr_R)):
        lathe(f'bracer_{side}', [(-0.5, 0.21, 0.21), (-0.2, 0.22, 0.22), (0.0, 0.2, 0.2)], el, (0, 0, 0), 'steel', kind='metal')
    for side, kn, an in (('L', kn_L, an_L), ('R', kn_R, an_R)):
        lathe(f'greave_{side}', [(-0.8, 0.24, 0.25), (-0.4, 0.25, 0.27), (-0.05, 0.23, 0.24)], kn, (0, 0.02, 0), 'steel', kind='metal')
        ellipsoid(f'kneecap_{side}', (0.19, 0.14, 0.17), (0, -0.16, 0.0), kn, 'steel_dk', kind='metal', subdiv=1)
        rbox(f'boot_{side}', (0.4, 0.72, 0.34), (0, -0.14, -0.14), an, 'boot', taper=lambda t: (0.96, 1.0 - 0.16 * t))

if CFG.get('weapon') == 'sword':
    grip = empty('sword', wr_R, (0, -0.03, -0.12))
    rbox('grip', (0.09, 0.09, 0.4), (0, 0, 0.0), grip, 'grip', subdiv=1)
    rbox('guard', (0.46, 0.13, 0.09), (0, 0, 0.23), grip, 'guard', kind='metal', subdiv=1)
    rbox('blade', (0.17, 0.045, 1.45), (0, 0, 1.0), grip, 'blade', kind='metal', taper=lambda t: (1 - 0.6 * t ** 4, 1), subdiv=1)
    ellipsoid('pommel', (0.08, 0.08, 0.08), (0, 0, -0.23), grip, 'guard', kind='metal', subdiv=1)
    # 칼날을 위로 세워 쥔다(칼끝이 살짝 앞 · 바깥) — 지금 그림과 같은 '옆에 세워 든' 자세
    # 주먹에서 칼날은 팔뚝과 직각(앞으로) — 팔꿈치를 접어 팔뚝이 앞을 보면 칼이 선다
    grip.rotation_euler = Euler((math.radians(90), math.radians(-8), 0))

# ── 카메라 ─────────────────────────────────────────────────
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
SC.render.resolution_x = RES
SC.render.resolution_y = RES
SC.render.use_compositing = False
vl = SC.view_layers[0]
vl.use_pass_normal = vl.use_pass_diffuse_color = vl.use_pass_object_index = vl.use_pass_z = True
SC.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
SC.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'

# ── 자세 ───────────────────────────────────────────────────
R = math.radians
JOINTS = [pelvis, spine, chest, neck, head, sh_L, sh_R, el_L, el_R, wr_L, wr_R, hip_L, hip_R, kn_L, kn_R, an_L, an_R]
REST = {j.name: Vector(j.location) for j in JOINTS}

def reset():
    for j in JOINTS:
        j.rotation_euler = Euler((0, 0, 0))
        j.location = REST[j.name]

def leg(hip, kn, an, thigh, knee, ankle, out=0.0):
    hip.rotation_euler = Euler((R(thigh), 0, R(out)))
    kn.rotation_euler = Euler((R(knee), 0, 0))
    an.rotation_euler = Euler((R(ankle), 0, 0))

def arm(sh, el, wr, swing, bend, side, spread=13):
    s = 1 if side == 'L' else -1
    sh.rotation_euler = Euler((R(swing), R(spread * s), 0))
    el.rotation_euler = Euler((R(-bend), 0, 0))
    wr.rotation_euler = Euler((R(-bend * 0.1), 0, 0))

def pose(action, ph):
    reset()
    tw = 2 * math.pi
    if action == 'idle':
        b = math.sin(tw * ph)
        leg(hip_L, kn_L, an_L, 0, 3, -2, out=4)
        leg(hip_R, kn_R, an_R, 0, 3, -2, out=-4)
        arm(sh_L, el_L, wr_L, 3, 14 + 3 * b, 'L', spread=15)
        arm(sh_R, el_R, wr_R, 3 if not CFG.get('weapon') else -4, (14 if not CFG.get('weapon') else 74) + 3 * b, 'R', spread=15)
        chest.rotation_euler = Euler((R(-1.2 * b), 0, 0))
        pelvis.location = REST['pelvis'] + Vector((0, 0, 0.012 * b))
        return 0.0
    if action == 'walk':
        A, K, armA, bend, bob, lean = 24, 36, 20, 14, 0.06, 3
    else:
        A, K, armA, bend, bob, lean = 38, 80, 36, 80, 0.14, 10
    for hip, kn, an, off in ((hip_L, kn_L, an_L, 0.0), (hip_R, kn_R, an_R, 0.5)):
        q = (ph + off) % 1
        s, c = math.sin(tw * q), math.cos(tw * q)
        thigh = -A * s - (6 if action == 'run' else 0)
        knee = K * max(0.0, c) ** (1.2 if action == 'walk' else 0.8) + (5 if action == 'walk' else 14)
        if action == 'run' and s < 0:
            knee += 28 * (-s)
        ankle = -(thigh + knee) * 0.6 + (8 * s if action == 'run' else 0)
        leg(hip, kn, an, thigh, knee, ankle)
    armed = CFG.get('weapon') is not None
    for sh, el, wr, side, off in ((sh_L, el_L, wr_L, 'L', 0.0), (sh_R, el_R, wr_R, 'R', 0.5)):
        q = (ph + off) % 1
        s = math.sin(tw * q)
        sw = armA * s * (0.55 if (armed and side == 'R') else 1.0)   # 칼 든 손은 덜 흔든다
        extra = 52 if (armed and side == 'R' and action == 'walk') else 0
        arm(sh, el, wr, sw, bend + extra + (12 if action == 'run' else 6) * max(0, -s), side)
    twist = (5 if action == 'walk' else 8) * math.sin(tw * ph)
    spine.rotation_euler = Euler((R(lean), 0, R(twist)))
    pelvis.rotation_euler = Euler((0, 0, R(-twist * 0.8)))
    head.rotation_euler = Euler((R(-lean * 0.5), 0, R(-twist * 0.7)))
    return bob * (0.5 + 0.5 * math.cos(2 * tw * ph))

def ground(lift):
    bpy.context.view_layer.update()
    low = 1e9
    for name in ('foot_L', 'foot_R', 'boot_L', 'boot_R'):
        ob = bpy.data.objects.get(name)
        if not ob:
            continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            low = min(low, (mw @ v.co).z)
    root.location = (0, 0, root.location.z - low + lift)
    bpy.context.view_layer.update()

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
json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
json.dump({o.name: [o.pass_index, kind] for o, kind in PARTS}, open(os.path.join(OUT, 'parts.json'), 'w'), indent=1)
print('done', len(meta['frames']))
