#!/usr/bin/env python3
"""
기본 몸으로 **동작**을 만든다 — 대기 · 걷기 · 달리기 · 점프 · 베기 · 주먹 · 활 · 마법 · 맞기 · 쓰러짐 · 승리 (0.70.26 미리보기).

    python3 tools/body-anim.py                    # 네 몸 × 모든 동작 → art/anim/<몸>/<동작>_<n>.png (320×320)
    python3 tools/body-anim.py m1 slash walk      # 몸·동작을 골라서
    python3 tools/body-anim.py --sheet            # 확인용 한 장 → art/preview/anim-sheet.png
    python3 tools/body-anim.py --html             # 움직이는 미리보기 → art/preview/anim.html

뼈대·조각은 tools/body-rig.py 에 있다. 여기는 **자세의 목록**이다.

── 각도 읽는 법 (화면 기준, y 는 아래로) ─────────────────────
  rot > 0 은 **시계 방향**.
    · 몸통(chest·root) rot > 0 → 오른쪽으로 기운다(적이 있는 쪽)
    · 왼팔(L = 화면 왼쪽) rot > 0 → 바깥(왼쪽)으로 든다 · rot < 0 → 몸 앞으로 가로지른다
    · 오른팔(R) 은 반대 — rot < 0 이 바깥(오른쪽)으로 들기
    · 뼈 길이(sx·sy)는 **바꾸지 않는다** — 몸·다리 비율이 무너진다(body-rig 가 막는다).
      다리를 들 때는 thigh 의 ty 를 음수로(반바지 속으로 밀어 올린다), 무릎은 rot 로 굽힌다.
  무기 각(world): 무기 끝이 화면에서 가리키는 쪽, 아래=0 · 오른쪽=90 · 위=180 · 왼쪽=270.
"""
import importlib.util, json, math, os, sys, base64, io
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
spec = importlib.util.spec_from_file_location('body_rig', os.path.join(ROOT, 'tools', 'body-rig.py'))
BR = importlib.util.module_from_spec(spec)
spec.loader.exec_module(BR)
CW, CH, BAKE = BR.CW, BR.CH, BR.BAKE
OUT = BR.OUT
BODIES = ['m1', 'f1', 'm2', 'f2']
SIG = {'m1': 'sword', 'f1': 'staff', 'm2': 'bow', 'f2': 'bow'}     # 승리 자세에 드는 무기


# ─────────────────────────────────────────────────────────────
# 자세 다루기
# ─────────────────────────────────────────────────────────────
def P(**kw):
    """P(uarmR=-80, thighL=(4, -20), root={'tx': 20}) — 숫자는 rot, (rot, ty) 는 돌리고 밀어 올리기."""
    out = {}
    for k, v in kw.items():
        if k.startswith('_'):
            out[k] = v
        elif isinstance(v, dict):
            out[k] = dict(v)
        elif isinstance(v, tuple):
            out[k] = {'rot': v[0], 'ty': v[1]}
        else:
            out[k] = {'rot': float(v)}
    return out


def merge(*ps):
    out = {}
    for p in ps:
        for k, v in p.items():
            if isinstance(v, dict):
                d = dict(out.get(k, {}))
                for kk, vv in v.items():
                    d[kk] = d.get(kk, 1.0 if kk in ('sx', 'sy') else 0.0) * vv if kk in ('sx', 'sy') else d.get(kk, 0.0) + vv
                out[k] = d
            else:
                out[k] = v
    return out


def lerp(a, b, t):
    out = {}
    for k in set(a) | set(b):
        if k.startswith('_'):
            va, vb = a.get(k), b.get(k)
            if isinstance(va, bool) or isinstance(vb, bool):
                out[k] = va if (t < 0.5 and va is not None) or vb is None else vb
            elif isinstance(va, (int, float)) or isinstance(vb, (int, float)):
                out[k] = (va or 0.0) * (1 - t) + (vb or 0.0) * t
            else:
                out[k] = va if t < 0.5 else vb
            continue
        da, db = a.get(k, {}), b.get(k, {})
        d = {}
        for kk in set(da) | set(db):
            base = 1.0 if kk in ('sx', 'sy') else 0.0
            d[kk] = da.get(kk, base) * (1 - t) + db.get(kk, base) * t
        out[k] = d
    return out


def lerp_gear(a, b, t):
    out = {}
    for s in set(a) | set(b):
        if s in a and s in b and a[s][0] == b[s][0]:
            aa, bb = a[s][1], b[s][1]
            out[s] = (a[s][0], aa * (1 - t) + bb * t, 'world')
        else:
            out[s] = (a if t < 0.5 else b).get(s) or (a.get(s) or b.get(s))
    return out


class Frame:
    def __init__(self, pose, gear=None, ms=100, fx=None, tint=None):
        self.pose, self.gear, self.ms = pose, gear or {}, ms
        self.fx = fx or []
        self.tint = tint


def ease(t):
    return t * t * (3 - 2 * t)


# ─────────────────────────────────────────────────────────────
# 효과 — 굽는 틀(1280) 위에 그린다
# ─────────────────────────────────────────────────────────────
def over(out, rgba_img):
    """PIL RGBA(굽는 틀 크기) → out(미리 곱한 float) 위에 얹기."""
    f = np.asarray(rgba_img).astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    out[...] = f + out * (1 - f[..., 3:4])


def canvas():
    return Image.new('RGBA', (CW, CH), (0, 0, 0, 0))


def fx_arc(center, r0, r1, a0, a1, color=(235, 245, 255), fade=True, width_boost=1.0):
    """초승달 모양 칼바람. 각은 화면 각(0=오른쪽, 90=아래). a0 → a1 쪽이 앞(진함)."""
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        n = 28
        cx, cy = center
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            aa0 = math.radians(a0 + (a1 - a0) * t0)
            aa1 = math.radians(a0 + (a1 - a0) * t1)
            # 앞쪽이 굵고 진하다
            w0 = (r1 - r0) * (0.25 + 0.75 * t0) * width_boost
            w1 = (r1 - r0) * (0.25 + 0.75 * t1) * width_boost
            ro0, ro1 = r1, r1
            ri0, ri1 = r1 - w0, r1 - w1
            pts = [(cx + ro0 * math.cos(aa0), cy + ro0 * math.sin(aa0)),
                   (cx + ro1 * math.cos(aa1), cy + ro1 * math.sin(aa1)),
                   (cx + ri1 * math.cos(aa1), cy + ri1 * math.sin(aa1)),
                   (cx + ri0 * math.cos(aa0), cy + ri0 * math.sin(aa0))]
            al = int(255 * (0.15 + 0.8 * t1)) if fade else 230
            d.polygon(pts, fill=color + (al,))
        # 바깥 가장자리 흰 줄
        for i in range(n):
            t0, t1 = i / n, (i + 1) / n
            aa0 = math.radians(a0 + (a1 - a0) * t0)
            aa1 = math.radians(a0 + (a1 - a0) * t1)
            d.line([(cx + r1 * math.cos(aa0), cy + r1 * math.sin(aa0)),
                    (cx + r1 * math.cos(aa1), cy + r1 * math.sin(aa1))], fill=(255, 255, 255, int(255 * t1)), width=7)
        img = img.filter(ImageFilter.GaussianBlur(1.2))
        over(out, img)
    return f


def fx_burst(pos_fn, r=70, n=8, color=(255, 240, 180), rot=0):
    """맞힌 자리의 번쩍임 — 뾰족한 별."""
    def f(out, info):
        p = pos_fn(info)
        img = canvas()
        d = ImageDraw.Draw(img)
        cx, cy = p
        pts = []
        for i in range(n * 2):
            a = math.radians(rot + i * 180 / n)
            rr = r if i % 2 == 0 else r * 0.38
            pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
        d.polygon(pts, fill=color + (235,), outline=(255, 255, 255, 255))
        d.ellipse((cx - r * .28, cy - r * .28, cx + r * .28, cy + r * .28), fill=(255, 255, 255, 255))
        over(out, img.filter(ImageFilter.GaussianBlur(1)))
    return f


def glow(out, p, r, color, core=0.8, strength=1.0):
    cx, cy = p
    x0, x1 = int(max(0, cx - r)), int(min(CW, cx + r))
    y0, y1 = int(max(0, cy - r)), int(min(CH, cy + r))
    if x1 <= x0 or y1 <= y0:
        return
    Y, X = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2 * strength
    c = np.array(color, np.float32) / 255
    white = np.clip(1 - d / 0.35, 0, 1) * core
    col = c[None, None, :] * (1 - white[..., None]) + white[..., None]
    a = np.clip(a, 0, 1)[..., None]
    dst = out[y0:y1, x0:x1]
    dst[...] = np.concatenate([col * a, a], -1) + dst * (1 - a)


def fx_glow(pos_fn, r, color, core=0.8, strength=1.0):
    def f(out, info):
        glow(out, pos_fn(info), r, color, core, strength)
    return f


def fx_sparkles(points, color=(255, 250, 200)):
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        for (x, y, s) in points:
            d.polygon([(x, y - s), (x + s * .25, y - s * .25), (x + s, y), (x + s * .25, y + s * .25),
                       (x, y + s), (x - s * .25, y + s * .25), (x - s, y), (x - s * .25, y - s * .25)],
                      fill=color + (240,))
        over(out, img.filter(ImageFilter.GaussianBlur(0.8)))
    return f


def fx_circle(center, rx, ry, color=(120, 200, 255), alpha=200, spin=0):
    """발밑 마법진."""
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        cx, cy = center
        for k, (sx, w) in enumerate(((1.0, 8), (0.8, 5), (0.55, 4))):
            d.ellipse((cx - rx * sx, cy - ry * sx, cx + rx * sx, cy + ry * sx), outline=color + (alpha,), width=w)
        for i in range(12):
            a = math.radians(spin + i * 30)
            x1, y1 = cx + rx * .8 * math.cos(a), cy + ry * .8 * math.sin(a)
            x2, y2 = cx + rx * math.cos(a), cy + ry * math.sin(a)
            d.line((x1, y1, x2, y2), fill=color + (alpha,), width=5)
        tri = [(cx + rx * .55 * math.cos(math.radians(spin + 90 + 120 * i)), cy + ry * .55 * math.sin(math.radians(spin + 90 + 120 * i))) for i in range(3)]
        d.line(tri + [tri[0]], fill=color + (alpha,), width=4)
        over(out, img.filter(ImageFilter.GaussianBlur(1.5)))
        glow(out, (cx, cy), rx * 0.9, color, core=0.0, strength=0.25)
    return f


def fx_orb(p, r, trail=220, color=(120, 210, 255)):
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        x, y = p
        for i in range(10):
            t = i / 10
            rr = r * (1 - t) * 0.8
            xx = x - trail * t
            d.ellipse((xx - rr, y - rr, xx + rr, y + rr), fill=color + (int(160 * (1 - t)),))
        over(out, img.filter(ImageFilter.GaussianBlur(4)))
        glow(out, p, r * 2.2, color, core=1.0, strength=1.0)
    return f


def fx_arrow(p, angle_deg, length=330, streak=0):
    """화살 — p 는 촉 끝, angle 은 날아가는 쪽(화면 각, 0=오른쪽)."""
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        a = math.radians(angle_deg)
        ux, uy = math.cos(a), math.sin(a)
        tip = p
        tail = (p[0] - ux * length, p[1] - uy * length)
        if streak:
            for k in range(4):
                o = (k - 1.5) * 10
                d.line((tail[0] - ux * streak + -uy * o, tail[1] - uy * streak + ux * o,
                        tail[0] + -uy * o, tail[1] + ux * o), fill=(255, 255, 255, 120), width=4)
        d.line((tail, tip), fill=(26, 18, 16, 255), width=14)
        d.line((tail, tip), fill=(150, 104, 62, 255), width=7)
        hx, hy = tip[0] - ux * 44, tip[1] - uy * 44
        d.polygon([tip, (hx + -uy * 16, hy + ux * 16), (hx - -uy * 16, hy - ux * 16)], fill=(200, 208, 220, 255), outline=(26, 18, 16, 255))
        for s in (1, -1):
            f0 = (tail[0] + ux * 50, tail[1] + uy * 50)
            f1 = (tail[0] - ux * 8 + -uy * 22 * s, tail[1] - uy * 8 + ux * 22 * s)
            f2 = (tail[0] + ux * 6, tail[1] + uy * 6)
            d.polygon([f0, f1, f2], fill=(236, 232, 220, 255), outline=(26, 18, 16, 255))
        over(out, img)
    return f


def fx_string(pull_fn=None):
    """활시위 — 활의 두 끝을 잇는다. pull_fn(info) 가 있으면 그 점까지 당긴다."""
    def f(out, info):
        if 'R' not in info['weapon']:
            return
        w, Mw = info['weapon']['R']
        if not w.key.startswith('bow'):
            return
        e0, e1 = [w.point(Mw, e) for e in w.w['ends']]
        pts = [e0, pull_fn(info), e1] if pull_fn else [e0, e1]
        img = canvas()
        d = ImageDraw.Draw(img)
        d.line(pts, fill=(40, 34, 30, 255), width=6)
        d.line(pts, fill=(210, 200, 180, 255), width=2)
        over(out, img)
    f.is_string = True
    return f


def fx_dust(points):
    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        for (x, y, r) in points:
            d.ellipse((x - r, y - r * .7, x + r, y + r * .7), fill=(225, 215, 195, 170), outline=(120, 105, 90, 170), width=4)
        over(out, img.filter(ImageFilter.GaussianBlur(1)))
    return f


def hand_pos(side):
    """손(쥐는 점)이 지금 어디 있나."""
    def f(info):
        body = info['body']
        g = BR.to_canvas(body.rig[side]['grip'])
        q = info['M']['farm' + side] @ np.array([g[0], g[1], 1.0])
        return (q[0], q[1])
    return f


def weapon_pt(side, p):
    def f(info):
        w, Mw = info['weapon'][side]
        return w.point(Mw, p)
    return f


# ─────────────────────────────────────────────────────────────
# 자세 모음
# ─────────────────────────────────────────────────────────────
STANCE = P(thighL=6, thighR=-6, shinL=-3, shinR=3)


def anim_idle(body):
    out = []
    for t in (0, .5, 1, .5):
        q = P(chest=0.8 * t, head=-1.2 * t, uarmL=2 * t, uarmR=-1.2 * t, farmL=1.5 * t, farmR=-1.0 * t)
        out.append(Frame(q, ms=260))
    return out, True


def walk_pose(ph, big=False):
    """앞모습 걸음 — 드는 다리를 반바지 속으로 **밀어 올리고**(길이는 그대로) 무릎을 살짝 밖으로."""
    s = math.sin(ph)
    sL, sR = max(0, s), max(0, -s)
    k = 1.8 if big else 1.0
    up = 24 * k                               # 몸 틀 좌표(768) 기준 몇 점 올리나
    q = P(thighL=(3 * sL * k, -up * sL), shinL=-4 * sL * k,
          thighR=(-3 * sR * k, -up * sR), shinR=4 * sR * k,
          hip=1.2 * s * k, chest=-1.8 * s * k, head=1.0 * s * k)
    # 팔 — 반대쪽 다리와 함께 흔든다. 달릴 때는 팔꿈치를 굽힌다(돌리기만 — 길이는 그대로)
    fR, bR = max(0, s), max(0, -s)
    fL, bL = max(0, -s), max(0, s)
    sw = 9 * k
    bend = 26 if big else 0
    arms = P(uarmR=sw * fR - 5 * k * bR, farmR=12 * k * fR + bend,
             uarmL=-sw * fL + 5 * k * bL, farmL=-12 * k * fL - bend)
    q = merge(q, arms)
    q['_lift'] = (22 if big else 10) * abs(s)
    return q


def anim_walk(body):
    return [Frame(walk_pose(2 * math.pi * i / 8), ms=105) for i in range(8)], True


def body_pts(body):
    """자세를 잡을 때 쓰는 몸 틀 좌표 몇 개."""
    r = body.rig
    return {
        'cx': 384.0, 'neck': r['neck'], 'waist': r['waist'], 'pelvis': r['pelvis'],
        'shL': r['L']['shoulder'], 'shR': r['R']['shoulder'],
    }


def anim_run(body):
    """달리기 — 팔다리를 **앞뒤로** 크게, 고개를 숙인다(앞모습).
    앞으로 간 팔: 주먹이 가슴 앞으로 올라온다(몸 앞에 그린다).
    뒤로 간 팔: 손이 엉덩이 뒤로 빠진다(몸 뒤에 그린다).
    앞으로 간 다리: 무릎을 높이 든다(반바지 속으로 밀어 올린다 — 길이는 그대로)."""
    B = body_pts(body)
    cx, ny, wy = B['cx'], B['neck'][1], B['waist'][1]
    ground = BR.to_canvas(body.rig['ground'])
    frames = []
    n = 6
    for i in range(n):
        ph = 2 * math.pi * i / n
        sgn = math.sin(ph)
        sL, sR = max(0, sgn), max(0, -sgn)
        up = 58
        q = P(thighL=(-5 * sL + 3 * sR, -up * sL), shinL=(8 * sL - 4 * sR),
              thighR=(5 * sR - 3 * sL, -up * sR), shinR=(-8 * sR + 4 * sL),
              hip=1.5 * sgn, chest=-2.5 * sgn,
              head={'rot': 2.5 * sgn, 'ty': 16})          # 고개 숙임 — 턱을 당긴다
        q['_lift'] = 30 * abs(sgn)
        fore, back = set(), set()
        # 왼다리가 앞이면 오른팔이 앞
        for side, fwd, bk in (('R', sL, sR), ('L', sR, sL)):
            # 각으로 흔든다 — 손 자리를 이으면 어깨 가까이를 지나 팔꿈치가 옆으로 튄다.
            # 앞: 윗팔을 살짝 안으로, 아래팔을 150° 접어 주먹이 턱 아래로 올라온다(몸 앞에 그린다).
            # 뒤: 윗팔을 밖으로, 아래팔을 조금 굽혀 손이 엉덩이 **뒤로** 들어간다(몸 뒤에 그린다).
            k = 1 if side == 'R' else -1                     # 오른팔은 +가 안쪽, 왼팔은 −가 안쪽
            u = k * (8 * fwd - 12 * bk) + k * 3
            f = k * (150 * fwd + 34 * bk) + k * 14
            q = merge(q, {'uarm' + side: {'rot': u}, 'farm' + side: {'rot': f}})
            if fwd > 0.25:
                fore.add(side)
            if bk > 0.25:
                back.add(side)
        q['_fore'], q['_back'] = fore, back
        fx = []
        if abs(sgn) > 0.7:
            # 뒤로 찬 발 뒤에 흙먼지
            fxx = BR.to_canvas(body.rig['legR' if sgn > 0 else 'legL']['ankle'])[0]
            fx.append(fx_dust([(fxx + (40 if sgn > 0 else -40), ground[1] + 4, 20), (fxx + (70 if sgn > 0 else -70), ground[1] - 6, 13)]))
        frames.append(Frame(q, ms=85, fx=fx))
    return frames, True


def anim_jump(body):
    # 웅크리기 = 무릎을 밖으로 벌려 굽힌다(허벅지·정강이 길이 그대로 — 발을 붙이면 몸이 내려앉는다)
    crouch = P(thighL=10, thighR=-10, shinL=-18, shinR=18, uarmL=16, uarmR=-16, farmL=-8, farmR=8)
    # 공중 — 두 다리를 반바지 속으로 밀어 올리고 무릎을 모은다
    tuck = P(thighL=(8, -34), thighR=(-8, -34), shinL=-14, shinR=14)
    ground = BR.to_canvas(body.rig['ground'])
    feet = [BR.to_canvas(body.rig['legL']['ankle'])[0], BR.to_canvas(body.rig['legR']['ankle'])[0]]
    dust = [(feet[0] - 60, ground[1] + 6, 26), (feet[1] + 60, ground[1] + 6, 26)]
    fr = [
        Frame(crouch, ms=120),
        Frame(merge(P(uarmL=80, uarmR=-80, farmL=20, farmR=-20), {'_lift': 70}), ms=80),
        Frame(merge(tuck, P(uarmL=128, uarmR=-128, farmL=14, farmR=-14), {'_lift': 170}), ms=90),
        Frame(merge(tuck, P(uarmL=140, uarmR=-140, farmL=10, farmR=-10), {'_lift': 200}), ms=130),
        Frame(merge(P(thighL=4, thighR=-4, uarmL=70, uarmR=-70, farmL=16, farmR=-16), {'_lift': 100}), ms=90),
        Frame(crouch, ms=110, fx=[fx_dust(dust)]),
        Frame(P(), ms=150),
    ]
    return fr, False


def sword_tip(body, pose, gear):
    M = body.solve(pose)
    side = 'R'
    key, ang = gear[side][0], gear[side][1]
    Mf = M['farm' + side]
    ang = ang + math.degrees(math.atan2(Mf[1, 0], Mf[0, 0]))
    w = body.weapon(key)
    Mw = w.matrix(Mf, BR.to_canvas(body.rig[side]['grip']), ang)
    return w.point(Mw, w.w['tip']), M


def anim_slash(body, wk='sword'):
    ready = merge(STANCE, P(uarmR=-28, farmR=58, uarmL=14, farmL=-18, chest=2))
    wind = merge(STANCE, P(chest=-7, head=-3, uarmR=-155, farmR=-30, uarmL=26, farmL=-26, root={'tx': -10}))
    swing = merge(STANCE, P(chest=6, uarmR=-100, farmR=-5, uarmL=18, farmL=-20, root={'tx': 22}))
    hit = merge(STANCE, P(chest=12, head=4, uarmR=-45, farmR=8, uarmL=12, farmL=-30, root={'tx': 38}))
    follow = merge(STANCE, P(chest=10, head=3, uarmR=8, farmR=22, uarmL=10, farmL=-30, root={'tx': 34}))
    G = lambda a: {'R': (wk, a, 'world')}
    # 칼바람 — 오른어깨를 가운데로, 칼끝까지의 거리를 반지름으로. 위(-100°)에서 오른쪽 아래로 휘두른다
    M = body.solve(swing)
    sh = BR.to_canvas(body.rig['R']['shoulder'])
    c = M['uarmR'] @ np.array([sh[0], sh[1], 1.0])
    tip, _ = sword_tip(body, swing, G(120))
    rad = min(math.hypot(tip[0] - c[0], tip[1] - c[1]) * 0.92, BR.CW - c[0] - 30)
    C = (c[0], c[1])
    fr = [
        Frame(ready, G(165), ms=140),
        Frame(lerp(ready, wind, .6), G(200), ms=80),
        Frame(wind, G(215), ms=140),
        Frame(swing, G(120), ms=50, fx=[fx_arc(C, rad * .62, rad, -115, -15)]),
        Frame(hit, G(60), ms=90, fx=[fx_arc(C, rad * .55, rad, -105, 45, width_boost=1.1),
                                    fx_burst(lambda info: (C[0] + rad * .8, C[1] + rad * .35), r=80, color=(255, 245, 200))]),
        Frame(follow, G(-20), ms=110, fx=[fx_arc(C, rad * .8, rad * .98, -30, 70, color=(210, 230, 255))]),
        Frame(lerp(follow, ready, .5), G(80), ms=110),
        Frame(ready, G(165), ms=160),
    ]
    return fr, False


def guard_pose(body, base=None):
    """가드 — 두 주먹을 턱 아래로 올린다(팔꿈치는 아래로). 주먹은 몸 앞(머리보다도 앞)."""
    B = body_pts(body)
    cx, ny = B['cx'], B['neck'][1]
    q = merge(STANCE, P(chest=1), base or {})
    q = body.ik(q, 'L', (cx - 50, ny + 46), bend='down')
    q = body.ik(q, 'R', (cx + 50, ny + 46), bend='down')
    q['_fore'] = {'L', 'R'}
    return q


def anim_punch(body):
    """가드 → 오른손 잽 → 가드 → 왼손 스트레이트(몸을 틀어 몸 앞을 가로질러) → 가드."""
    B = body_pts(body)
    cx, ny = B['cx'], B['neck'][1]
    shR = B['shR']
    guard = guard_pose(body)
    bob = merge(guard, {'_lift': 8})
    # 잽 — 오른팔을 쭉 뻗는다(적은 오른쪽)
    jab = merge(STANCE, P(chest=8, head=3, root={'tx': 22}))
    jab = body.ik(jab, 'L', (cx - 40, ny + 30), bend='down')
    jab = body.ik(jab, 'R', (shR[0] + 260, shR[1] - 6), bend='down')
    jab['_fore'] = {'L', 'R'}
    # 스트레이트 — 왼주먹이 몸 앞을 가로질러 오른쪽으로
    cross = merge(STANCE, P(chest=12, head=5, hip=3, root={'tx': 30}))
    cross = body.ik(cross, 'R', (cx + 60, ny + 44), bend='down')
    cross = body.ik(cross, 'L', (shR[0] + 150, shR[1] + 4), bend='down')
    cross['_fore'] = {'L', 'R'}
    fistR, fistL = hand_pos('R'), hand_pos('L')
    fr = [
        Frame(guard, ms=160),
        Frame(bob, ms=110),
        Frame(jab, ms=80, fx=[fx_burst(lambda info: (fistR(info)[0] + 44, fistR(info)[1]), r=78)]),
        Frame(lerp(jab, guard, .6) | {'_fore': {'L', 'R'}}, ms=80),
        Frame(guard, ms=90),
        Frame(cross, ms=90, fx=[fx_burst(lambda info: (fistL(info)[0] + 44, fistL(info)[1]), r=92, rot=20)]),
        Frame(lerp(cross, guard, .5) | {'_fore': {'L', 'R'}}, ms=90),
        Frame(guard, ms=180),
    ]
    return fr, True


def anim_shoot(body, wk='bow'):
    ready = P(uarmR=-6, farmR=4, uarmL=4)
    aim = merge(STANCE, P(uarmR=-86, farmR=0, uarmL=-62, farmL=-44, chest=3, head=2))
    draw = merge(STANCE, P(uarmR=-88, farmR=0, uarmL=-30, farmL=-110, chest=4, head=2))
    rel = merge(STANCE, P(uarmR=-88, farmR=0, uarmL=14, farmL=-40, chest=3, head=2))
    G = lambda a=180: {'R': (wk, a, 'world')}
    pull = hand_pos('L')

    def arrow_fx(out, info):
        # 시위를 당긴 손 → 활 손잡이 쪽으로 화살(촉은 손잡이 너머 70)
        w, Mw = info['weapon']['R']
        g = w.point(Mw, w.w['grip'])
        h = pull(info)
        ang = math.degrees(math.atan2(g[1] - h[1], g[0] - h[0]))
        L = math.hypot(g[0] - h[0], g[1] - h[1]) + 70
        r = math.radians(ang)
        fx_arrow((h[0] + math.cos(r) * L, h[1] + math.sin(r) * L), ang, length=L)(out, info)

    def flying(dx, streak):
        def f(out, info):
            w, Mw = info['weapon']['R']
            g = w.point(Mw, w.w['grip'])
            fx_arrow((g[0] + dx, g[1] - 6), 0, length=330, streak=streak)(out, info)
        return f

    fr = [
        Frame(ready, G(180), ms=140),
        Frame(aim, G(180), ms=110, fx=[fx_string(), arrow_fx]),
        Frame(lerp(aim, draw, .5), G(180), ms=90, fx=[fx_string(pull), arrow_fx]),
        Frame(draw, G(180), ms=220, fx=[fx_string(pull), arrow_fx]),
        Frame(rel, G(180), ms=50, fx=[fx_string(), flying(260, 160)]),
        Frame(rel, G(180), ms=80, fx=[fx_string(), flying(520, 260)]),
        Frame(lerp(rel, ready, .5), G(180), ms=110),
        Frame(ready, G(180), ms=160),
    ]
    return fr, False


CRYSTAL = (636, 205)       # 마법사 준 그림에서 지팡이 수정의 가운데


def anim_cast(body, wk='staff'):
    ready = P(uarmR=-6, farmR=4)
    raise_ = merge(STANCE, P(uarmR=-128, farmR=-12, uarmL=34, farmL=-58, chest=-2, head=-2))
    thrust = merge(STANCE, P(uarmR=-82, farmR=0, uarmL=24, farmL=-40, chest=7, head=3, root={'tx': 18}))
    G = lambda a: {'R': (wk, a, 'world')}
    crys = weapon_pt('R', CRYSTAL if wk == 'staff' else body.weapon(wk).w['tip'])
    ground = BR.to_canvas(body.rig['ground'])
    circ = lambda s, sp: fx_circle((ground[0], ground[1] + 4), 250 * s, 70 * s, spin=sp)
    rng = np.random.default_rng(3)
    sp_pts = lambda n, y0: [(ground[0] + rng.uniform(-230, 230), y0 + rng.uniform(-260, 0), rng.uniform(10, 22)) for _ in range(n)]
    fr = [
        Frame(ready, G(180), ms=140),
        Frame(lerp(ready, raise_, .6), G(186), ms=90, fx=[circ(.6, 0), fx_glow(crys, 60, (120, 210, 255))]),
        Frame(raise_, G(190), ms=120, fx=[circ(.85, 15), fx_glow(crys, 100, (120, 210, 255)), fx_sparkles(sp_pts(5, ground[1] - 40))]),
        Frame(raise_, G(190), ms=120, fx=[circ(1.0, 30), fx_glow(crys, 140, (140, 220, 255)), fx_sparkles(sp_pts(8, ground[1] - 80))]),
        Frame(thrust, G(115), ms=60, fx=[circ(1.0, 45), fx_glow(crys, 110, (160, 230, 255)),
                                        lambda out, info: fx_orb((crys(info)[0] + 150, crys(info)[1] + 10), 46, 160)(out, info)]),
        Frame(thrust, G(115), ms=90, fx=[circ(.7, 60),
                                        lambda out, info: fx_orb((crys(info)[0] + 400, crys(info)[1] + 20), 52, 300)(out, info)]),
        Frame(lerp(thrust, ready, .5), G(150), ms=110),
        Frame(ready, G(180), ms=160),
    ]
    return fr, False


def anim_hurt(body):
    hit = P(root={'tx': -34}, chest=-11, head=-9, uarmL=24, farmL=12, uarmR=-30, farmR=-14,
            thighL=3, thighR=-3)
    mid = lerp(P(), hit, .55)
    at = lambda info: (BR.to_canvas(body.rig['neck'])[0] + 90, BR.to_canvas(body.rig['waist'])[1] - 60)
    fr = [
        Frame(hit, ms=90, tint=(255, 70, 60), fx=[fx_burst(at, r=95, color=(255, 230, 160))]),
        Frame(hit, ms=90),
        Frame(mid, ms=110),
        Frame(P(), ms=160),
    ]
    return fr, False


def anim_down(body):
    """맞고 → 비틀 → 옆으로 **통째로** 넘어간다(무릎 꿇기는 뺐다 — 다리를 줄여야 해서 비율이 무너진다)."""
    hit = P(root={'tx': -30}, chest=-10, head=-9, uarmL=22, uarmR=-26)
    stagger = P(root={'tx': -24}, chest=-6, head=-12, uarmL=36, farmL=18, uarmR=-44, farmR=-20,
                thighL=4, thighR=-8, shinR=6)
    fall = P(chest=-4, head=-8, uarmL=60, farmL=20, uarmR=-70, farmR=-24, thighL=3, thighR=-3)
    lie = P(chest=-3, head=-10, uarmL=8, farmL=6, uarmR=-10, farmR=-8, thighL=2, thighR=-5)
    fr = [
        Frame(hit, ms=90, tint=(255, 70, 60)),
        Frame(stagger, ms=140),
        Frame(merge(fall, P(root={'rot': -24, 'tx': 40})), ms=90),
        Frame(merge(fall, P(root={'rot': -58}), {'_fit': True}), ms=80),
        Frame(merge(lie, P(root={'rot': -90}), {'_fit': True}), ms=120),
        Frame(merge(lie, P(root={'rot': -90, 'ty': -14}), {'_fit': True}), ms=500),
    ]
    return fr, False


def anim_victory(body, wk=None):
    key = wk or SIG[body.name]
    pose0 = merge(STANCE, P(uarmR=-168, farmR=-6, uarmL=30, farmL=-96, head=3, chest=-1))
    G = {'R': (key, 185 if not key.startswith('bow') else 180, 'world')}
    tip = (lambda info: weapon_pt('R', body.weapon(key).w['tip'])(info))
    sp = lambda info: [(tip(info)[0] + dx, tip(info)[1] + dy, s) for dx, dy, s in ((-60, 20, 20), (50, -30, 26), (20, 60, 14))]
    fr = [
        Frame(pose0, G, ms=150),
        Frame(merge(pose0, {'_lift': 30}), G, ms=120, fx=[lambda out, info: fx_sparkles(sp(info))(out, info)]),
        Frame(merge(pose0, {'_lift': 12}), G, ms=100, fx=[lambda out, info: fx_sparkles(sp(info))(out, info)]),
        Frame(pose0, G, ms=180),
    ]
    return fr, True


ANIMS = [
    ('idle', '대기', anim_idle), ('walk', '걷기', anim_walk), ('run', '달리기', anim_run),
    ('jump', '점프', anim_jump), ('slash', '베기(칼)', anim_slash), ('punch', '주먹', anim_punch),
    ('shoot', '활쏘기', anim_shoot), ('cast', '마법', anim_cast), ('hurt', '맞기', anim_hurt),
    ('down', '쓰러짐', anim_down), ('victory', '승리', anim_victory),
]


# ─────────────────────────────────────────────────────────────
# 굽기
# ─────────────────────────────────────────────────────────────
def render_frame(body, fr):
    pm, info = body.render(fr.pose, fr.gear)
    info['body'] = body
    if any(w.key.startswith('bow') for w, _ in info['weapon'].values()) and not any(getattr(f, 'is_string', False) for f in fr.fx):
        fx_string()(pm, info)          # 활을 들고만 있어도 시위는 있다
    if fr.tint:
        a = pm[..., 3:4]
        c = np.array(fr.tint, np.float32) / 255
        pm[..., :3] = pm[..., :3] * 0.72 + c * a * 0.28
    for f in fr.fx:
        f(pm, info)
    lift = 0.0
    if fr.pose.get('_lift'):
        lift = float(fr.pose['_lift'])
    return pm, lift


def bake(names, anims):
    meta = {}
    mp = os.path.join(OUT, 'anims.json')
    if os.path.exists(mp):
        meta = json.load(open(mp))
    for n in names:
        body = BR.Body(n)
        d = os.path.join(OUT, n)
        os.makedirs(d, exist_ok=True)
        meta.setdefault(n, {})
        for key, label, fn in ANIMS:
            if anims and key not in anims:
                continue
            frames, loop = fn(body)
            rows = []
            for i, fr in enumerate(frames):
                pm, lift = render_frame(body, fr)
                big = BR.to_image(pm, (CW // BAKE, CH // BAKE))
                big.save(os.path.join(d, f'{key}_{i}.png'))
                rows.append({'ms': fr.ms, 'lift': round(lift / BAKE, 1)})
            meta[n][key] = {'label': label, 'loop': loop, 'frames': rows}
            print('✓', n, key, len(frames))
    json.dump(meta, open(mp, 'w'), ensure_ascii=False, indent=1)


def sheet(only=None, S=110, path=None):
    meta = json.load(open(os.path.join(OUT, 'anims.json')))
    cols = max(len(v['frames']) for n in meta for v in meta[n].values())
    rows = []
    for n in (only or BODIES):
        for key, label, _ in ANIMS:
            if key not in meta.get(n, {}):
                continue
            rows.append((n, key))
    img = Image.new('RGB', (cols * S + 150, len(rows) * S), (32, 44, 34))
    d = ImageDraw.Draw(img)
    for r, (n, key) in enumerate(rows):
        d.text((6, r * S + 40), f'{n} {key}', fill=(240, 230, 200))
        for i, fr in enumerate(meta[n][key]['frames']):
            im = Image.open(os.path.join(OUT, n, f'{key}_{i}.png')).convert('RGBA').resize((S, S), Image.LANCZOS)
            bg = Image.new('RGBA', (S, S), (70, 120, 70, 255))
            bg.alpha_composite(im)
            img.paste(bg.convert('RGB'), (150 + i * S, r * S))
    p = path or os.path.join(ROOT, 'art', 'preview', 'anim-sheet.png')
    img.save(p)
    print('✓', p)


# ─────────────────────────────────────────────────────────────
# 장비를 입힌 동작 (0.70.26) — tools/gear-art.py 가 그린 장비를 몸에 입혀 굽는다
# ─────────────────────────────────────────────────────────────
EQUIP_WEAPON = {'m1': 'sword', 'f1': 'staff', 'm2': 'bow', 'f2': 'sword'}
HOLD = {'sword': 148, 'bow': 180, 'staff': 176}
GEAR_SLOTS = ['armor', 'helmet', 'shoulder', 'gloves', 'boots', 'belt', 'necklace']
GEAR_ANIMS = [('idle', '대기'), ('walk', '걷기'), ('run', '달리기'), ('attack', '공격'), ('hurt', '맞기'), ('victory', '승리')]


def fx_aura(tier, phase, body):
    """영웅: 보랏빛 반짝임 · 전설: 붉은 불티가 올라간다. phase 0..1 (동작 안의 위치)."""
    rng = np.random.default_rng(11)
    gx, gy = BR.to_canvas(body.rig['ground'])
    pts = rng.uniform([gx - 190, gy - 820], [gx + 190, gy - 40], (14, 2))

    def f(out, info):
        img = canvas()
        d = ImageDraw.Draw(img)
        if tier == 3:
            for k, (x, y) in enumerate(pts[:9]):
                a = 0.5 + 0.5 * math.sin(2 * math.pi * (phase + k / 9))
                if a < .25:
                    continue
                r = 8 + 10 * a
                d.polygon([(x, y - r), (x + r * .22, y - r * .22), (x + r, y), (x + r * .22, y + r * .22),
                           (x, y + r), (x - r * .22, y + r * .22), (x - r, y), (x - r * .22, y - r * .22)], fill=(230, 190, 255, int(230 * a)))
            over(out, img.filter(ImageFilter.GaussianBlur(.8)))
            glow(out, (gx, gy - 6), 230, (180, 110, 255), core=0, strength=.22)
        else:
            for k, (x, y0) in enumerate(pts):
                t = (phase + k / len(pts)) % 1.0
                y = gy - 40 - t * 780
                x2 = x + 18 * math.sin(6 * t + k)
                a = math.sin(math.pi * t)
                r = 5 + 5 * a
                d.ellipse((x2 - r, y - r, x2 + r, y + r), fill=(255, 150 + int(80 * a), 60, int(235 * a)))
            over(out, img.filter(ImageFilter.GaussianBlur(1.2)))
            glow(out, (gx, gy - 6), 250, (255, 70, 50), core=0, strength=.28)
    return f


def equipped_frames(body, tier, wkind):
    wk = f'{wkind}:{tier}'
    hold = {'R': (wk, HOLD[wkind], 'world')}
    attack = {'sword': lambda: anim_slash(body, wk), 'bow': lambda: anim_shoot(body, wk), 'staff': lambda: anim_cast(body, wk)}[wkind]
    src = {'idle': lambda: anim_idle(body), 'walk': lambda: anim_walk(body), 'run': lambda: anim_run(body),
           'attack': attack, 'hurt': lambda: anim_hurt(body), 'victory': lambda: anim_victory(body, wk)}
    out = []
    carry = {'sword': 34, 'bow': 180, 'staff': 172}[wkind]
    for key, label in GEAR_ANIMS:
        frames, loop = src[key]()
        for i, fr in enumerate(frames):
            if not fr.gear:
                fr.gear = hold
                # 무기를 든 손은 몸 **바깥으로** 조금 벌린다 — 몸통 위에 무기가 겹치면 어수선하다
                q = dict(fr.pose)
                if key == 'run':
                    # 달릴 때 무기 든 팔은 흔들지 않고 들고 간다(다른 팔만 앞뒤로)
                    q['uarmR'] = {'rot': -16.0}
                    q['farmR'] = {'rot': -8.0 if wkind != 'sword' else 10.0}
                    q['_fore'] = set(q.get('_fore', set())) - {'R'}
                    q['_back'] = set(q.get('_back', set())) - {'R'}
                    fr.gear = {'R': (wk, carry, 'world')}
                else:
                    r = dict(q.get('uarmR', {}))
                    r['rot'] = r.get('rot', 0.0) - 12
                    q['uarmR'] = r
                fr.pose = q
            if tier >= 3:
                fr.fx = [fx_aura(tier, i / len(frames), body)] + list(fr.fx)
        out.append((key, label, frames, loop))
    return out


def bake_gear(names, tiers):
    import importlib.util as _u
    sp = _u.spec_from_file_location('gear_art', os.path.join(ROOT, 'tools', 'gear-art.py'))
    GA = _u.module_from_spec(sp)
    sp.loader.exec_module(GA)
    GA.BR = BR                     # 같은 body-rig 를 쓰게 한다(무기 목록이 한 곳에 모이도록)
    GA.register_weapons()
    root = os.path.join(OUT, 'gear')
    mp = os.path.join(root, 'anims.json')
    meta = json.load(open(mp)) if os.path.exists(mp) else {}
    for n in names:
        for t in tiers:
            body = BR.Body(n, GA.gear_for(n, {s: t for s in GEAR_SLOTS}))
            d = os.path.join(root, f'{n}_{t}')
            os.makedirs(d, exist_ok=True)
            k_ = f'{n}_{t}'
            meta[k_] = {}
            for key, label, frames, loop in equipped_frames(body, t, EQUIP_WEAPON[n]):
                rows = []
                for i, fr in enumerate(frames):
                    pm, lift = render_frame(body, fr)
                    BR.to_image(pm, (CW // BAKE, CH // BAKE)).save(os.path.join(d, f'{key}_{i}.png'))
                    rows.append({'ms': fr.ms, 'lift': round(lift / BAKE, 1)})
                meta[k_][key] = {'label': label, 'loop': loop, 'frames': rows}
            print('✓', n, t)
            json.dump(meta, open(mp, 'w'), ensure_ascii=False, indent=1)


def gear_meta():
    """동작 목록(장 수 · 시간 · 뜬 높이)만 다시 적는다 — 몸마다 따로 구운 뒤 한 파일로 모은다."""
    import importlib.util as _u
    sp = _u.spec_from_file_location('gear_art', os.path.join(ROOT, 'tools', 'gear-art.py'))
    GA = _u.module_from_spec(sp)
    sp.loader.exec_module(GA)
    GA.BR = BR
    GA.register_weapons()
    meta = {}
    for n in BODIES:
        for t in range(5):
            if not os.path.isdir(os.path.join(OUT, 'gear', f'{n}_{t}')):
                continue
            body = BR.Body(n, GA.gear_for(n, {s: t for s in GEAR_SLOTS}))
            meta[f'{n}_{t}'] = {}
            for key, label, frames, loop in equipped_frames(body, t, EQUIP_WEAPON[n]):
                rows = [{'ms': fr.ms, 'lift': round(float(fr.pose.get('_lift') or 0) / BAKE, 1)} for fr in frames]
                meta[f'{n}_{t}'][key] = {'label': label, 'loop': loop, 'frames': rows}
    json.dump(meta, open(os.path.join(OUT, 'gear', 'anims.json'), 'w'), ensure_ascii=False, indent=1)
    print('✓ gear anims.json', len(meta))


def _b64(img, fmt='WEBP', q=88):
    buf = io.BytesIO()
    if fmt == 'WEBP':
        img.save(buf, 'WEBP', quality=q, method=6)
    else:
        img.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode()


def html():
    """움직이는 미리보기 — 동작(줄) × 몸(칸). 크기 · 빠르기 · 바탕을 고른다."""
    meta = json.load(open(os.path.join(OUT, 'anims.json')))
    S = CW // BAKE                    # 320
    data = {}
    for n in BODIES:
        if n not in meta:
            continue
        data[n] = {}
        for key, label, _ in ANIMS:
            if key not in meta[n]:
                continue
            fr = meta[n][key]['frames']
            sheets = {}
            for size in (S, S // 2, S // 4):
                sh = Image.new('RGBA', (size * len(fr), size))
                for i in range(len(fr)):
                    im = Image.open(os.path.join(OUT, n, f'{key}_{i}.png')).convert('RGBA')
                    if size != S:
                        im = _shrink(im, size)
                    sh.alpha_composite(im, (i * size, 0))
                sheets[size] = _b64(sh)
            data[n][key] = {'label': label, 'loop': meta[n][key]['loop'], 'frames': fr, 'sheets': sheets}
    page = HTML.replace('__DATA__', json.dumps(data)).replace('__LABELS__', json.dumps(BR.LABEL, ensure_ascii=False)) \
               .replace('__ORDER__', json.dumps([[k, l] for k, l, _ in ANIMS], ensure_ascii=False))
    p = os.path.join(ROOT, 'art', 'preview', 'anim.html')
    open(p, 'w').write(page)
    print('✓', p, f'{len(page) // 1024}KB')


def _shrink(im, size):
    """320 → 160·80. 미리 곱한 알파로 줄이고 살짝 또렷하게(게임에서 뭉개지지 않게)."""
    f = np.asarray(im).astype(np.float32) / 255
    f[..., :3] *= f[..., 3:4]
    return BR.to_image(f, (size, size))


HTML = r'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>기본 몸 동작 미리보기</title>
<style>
:root{--bg:#1c2620;--panel:#26332a;--ink:#f1ecdf;--dim:#aebba6;--acc:#e6c35c;--grass:#5b8f47;--grass2:#4f8140}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:500 14px/1.45 system-ui,"Noto Sans KR",sans-serif}
header{position:sticky;top:0;z-index:5;background:var(--panel);padding:10px 16px;display:flex;flex-wrap:wrap;gap:10px 18px;align-items:center;border-bottom:1px solid #0003}
h1{font-size:16px;margin:0 12px 0 0}
.grp{display:flex;gap:4px;align-items:center}
.grp span{color:var(--dim);font-size:12px;margin-right:4px}
button{background:#33443a;color:var(--ink);border:1px solid #0004;border-radius:6px;padding:4px 10px;font:inherit;font-size:13px;cursor:pointer}
button.on{background:var(--acc);color:#2a2410;font-weight:700}
main{padding:14px 16px 40px;overflow-x:auto}
table{border-collapse:separate;border-spacing:8px}
th{font-weight:600;color:var(--dim);font-size:13px;text-align:center}
th.row{text-align:right;padding-right:6px;white-space:nowrap;color:var(--ink)}
td{padding:0}
.cell{position:relative;border-radius:8px;overflow:hidden}
.cell canvas{display:block}
.bg-grass .cell{background:repeating-linear-gradient(45deg,var(--grass) 0 14px,var(--grass2) 14px 28px)}
.bg-dark .cell{background:#2b2f36}
.bg-light .cell{background:#e9e4d6}
.px canvas{image-rendering:pixelated}
.note{color:var(--dim);font-size:12px;margin:0 0 10px}
</style></head><body class="bg-grass">
<header>
  <h1>기본 몸 — 동작 미리보기</h1>
  <div class="grp" id="size"><span>크기</span>
    <button data-v="80" class="on">게임 1배 (80)</button><button data-v="160">2배 (160)</button><button data-v="px">4배 · 점 보기</button><button data-v="320">원본 (320)</button></div>
  <div class="grp" id="speed"><span>빠르기</span>
    <button data-v="0.5">0.5배</button><button data-v="1" class="on">1배</button><button data-v="2">2배</button></div>
  <div class="grp" id="bg"><span>바탕</span>
    <button data-v="grass" class="on">풀밭</button><button data-v="dark">어둠</button><button data-v="light">밝음</button></div>
  <div class="grp" id="shadow"><span>그림자</span><button data-v="1" class="on">켬</button><button data-v="0">끔</button></div>
</header>
<main>
<p class="note">한 칸이 게임 그림 한 장입니다(80×80 — 가운데 아래 48×64 가 몸, 둘레는 칼·효과가 나갈 자리). 그림자는 게임이 따로 그리는 것을 흉내 낸 것입니다.</p>
<table id="grid"></table>
</main>
<script>
const DATA=__DATA__, LABELS=__LABELS__, ORDER=__ORDER__;
const BODIES=Object.keys(DATA);
let size=80, speed=1, shadow=true, pixel=false;
const imgs={};
function sheet(n,k,s){const key=n+k+s; if(!imgs[key]){const im=new Image(); im.src='data:image/webp;base64,'+DATA[n][k].sheets[s]; imgs[key]=im;} return imgs[key];}
const cells=[];
function build(){
  const g=document.getElementById('grid'); g.innerHTML='';
  const hr=document.createElement('tr'); hr.appendChild(document.createElement('th'));
  for(const n of BODIES){const th=document.createElement('th'); th.textContent=LABELS[n]; hr.appendChild(th);} g.appendChild(hr);
  cells.length=0;
  for(const [k,label] of ORDER){
    if(!BODIES.some(n=>DATA[n][k])) continue;
    const tr=document.createElement('tr'); const th=document.createElement('th'); th.className='row'; th.textContent=label; tr.appendChild(th);
    for(const n of BODIES){
      const td=document.createElement('td'); const d=document.createElement('div'); d.className='cell'+(pixel?' px':'');
      const c=document.createElement('canvas'); const dpr=window.devicePixelRatio||1;
      c.width=size*dpr; c.height=size*dpr; c.style.width=size+'px'; c.style.height=size+'px';
      d.appendChild(c); td.appendChild(d); tr.appendChild(td);
      if(DATA[n][k]) cells.push({n,k,c,dpr,t0:performance.now()});
    }
    g.appendChild(tr);
  }
}
function frameAt(a,t){
  const fr=a.frames; let total=0; for(const f of fr) total+=f.ms;
  const hold=a.loop?0:700; const T=(total+hold)/speed; let x=(t%T)*speed;
  for(let i=0;i<fr.length;i++){ if(x<fr[i].ms) return i; x-=fr[i].ms; }
  return fr.length-1;
}
function tick(now){
  for(const cell of cells){
    const a=DATA[cell.n][cell.k]; const i=frameAt(a,now-cell.t0);
    const src=pixel?80:size; const im=sheet(cell.n,cell.k,src);
    const ctx=cell.c.getContext('2d'); const W=cell.c.width;
    ctx.clearRect(0,0,W,W);
    if(shadow){ // 발밑 그림자 — 뜬 만큼 작아지고 옅어진다
      const k=W/80, lift=(a.frames[i].lift||0)/4; const s=Math.max(0.55,1-lift/28);
      ctx.fillStyle='rgba(0,0,0,'+(0.28*s)+')'; ctx.beginPath();
      ctx.ellipse(40*k,76.5*k,12*k*s,3.2*k*s,0,0,Math.PI*2); ctx.fill();
    }
    ctx.imageSmoothingEnabled = !pixel; ctx.imageSmoothingQuality='high';
    if(im.complete) ctx.drawImage(im,i*src,0,src,src,0,0,W,W);
  }
  requestAnimationFrame(tick);
}
function pick(id,fn){document.querySelectorAll('#'+id+' button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#'+id+' button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fn(b.dataset.v);});}
pick('size',v=>{pixel=v==='px'; size=pixel?320:+v; build();});
pick('speed',v=>{speed=+v;});
pick('bg',v=>{document.body.className='bg-'+v;});
pick('shadow',v=>{shadow=v==='1';});
build(); requestAnimationFrame(tick);
</script></body></html>'''


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--gear-meta' in sys.argv:
        gear_meta()
    elif '--gear' in sys.argv:
        names = [a for a in args if a in BR.RIGS] or BODIES
        tiers = [int(a) for a in args if a.isdigit()] or [0, 1, 2, 3, 4]
        bake_gear(names, tiers)
    elif '--sheet' in sys.argv:
        sheet([a for a in args if a in BR.RIGS] or None, int(os.environ.get('S', 110)), os.environ.get('P'))
    elif '--html' in sys.argv:
        html()
    else:
        names = [a for a in args if a in BR.RIGS] or BODIES
        anims = [a for a in args if a not in BR.RIGS]
        bake(names, anims)
