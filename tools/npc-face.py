#!/usr/bin/env python3
"""
마을 사람 얼굴 (0.70.38) — 사람마다 **다른 얼굴**. 주인공(플레이어) 얼굴과도 달라야 한다.

── 왜 ─────────────────────────────────────────────────────────
0.70.37 까지 마을 사람은 주인공의 몸 넷(m1 · f1 · m2 · f2) 가운데 하나에 머리색 · 수염 · 모자 · 옷만 바꿔 입혔다.
그래서 **얼굴은 주인공과 똑같았다** — 같은 파란 눈, 같은 찌푸린 눈썹, 같은 입. 대화창 얼굴(흉상)이 커지면서
"다 같은 사람" 이 눈에 띄었다.

── 어떻게 ──────────────────────────────────────────────────────
  ① 살빛 — 몸 전체의 살(얼굴 · 목 · 팔 · 다리)을 사람마다 다른 빛으로(밝기 결은 그대로 옮긴다).
  ② 지우기 — 주인공의 눈 · 눈썹 · 입 · 볼 빗금(필요하면 코까지)을 둘레 살빛으로 메운다(cv2.inpaint).
  ③ 새로 그리기 — 같은 그림체(굵은 검은 선 · 두 단 그늘 · 흰 빛점)의 svg 로 눈 · 눈썹 · 코 · 입 · 주름 ·
     주근깨 · 볼 빛 · 흉터 · 수염 자국 · 안대 · 외알 안경 … 을 그려 **머리 조각**에 얹는다(머리와 같이 움직인다).
  자리(눈 · 코 · 입의 가운데)는 몸 틀 좌표로 한 번 재 둔 것(ANCH)을 쓴다. m2 · f2 는 m1 · f1 과 자리가 같다.

    python3 tools/npc-face.py          # → art/preview/npc-faces.png (주인공 · 지금 · 새 얼굴 비교)
"""
import math
import os

import cv2
import numpy as np

OL = '#1a1210'

# ─────────────────────────────────────────────────────────────
# 자리 — 몸 틀(768×1024) 좌표. 화면 왼쪽 눈이 L. jaw 는 눈 밑 얼굴 살의 가장자리(귀 포함, 줄마다 잰 것).
# ─────────────────────────────────────────────────────────────
ANCH = {
    'm1': dict(eye=((343, 239), (419, 239)), ew=22, eh=13, nose=(381, 271), mouth=(382, 291), mw=22, chin=331,
               cheek=((333, 259), (431, 259)), ear=((298, 262), (464, 262)),
               jaw=[(298, 248), (300, 262), (309, 270), (321, 278), (326, 286), (331, 294), (338, 302), (350, 310), (362, 318), (382, 331),
                    (402, 318), (414, 310), (424, 302), (432, 294), (438, 286), (441, 278), (453, 270), (462, 262), (466, 248)],
               brows=(((318, 204), (370, 238)), ((392, 204), (446, 238)))),
    'f1': dict(eye=((352, 236), (418, 236)), ew=21, eh=13, nose=(384, 262), mouth=(387, 278), mw=21, chin=306,
               cheek=((342, 256), (428, 256)), ear=((308, 258), (462, 258)),
               jaw=[(306, 244), (308, 252), (312, 258), (331, 266), (335, 274), (340, 282), (348, 290), (360, 298), (385, 307),
                    (409, 298), (422, 290), (431, 282), (436, 274), (439, 266), (457, 258), (463, 252), (464, 244)],
               brows=(((326, 207), (374, 227)), ((396, 205), (442, 227)))),
}
CLEAN = {'m1': 'm1', 'f1': 'f1', 'm2': 'm1', 'f2': 'f1'}
SKIN0 = np.array([250, 200, 160], np.float32)          # 주인공 살빛(이마 · 볼의 바탕)

SKIN = {                                                # 사람마다 살빛(바탕)
    'fair': (252, 214, 188), 'pale': (244, 220, 206), 'rosy': (252, 198, 170), 'peach': (250, 206, 166),
    'tan': (226, 168, 124), 'ruddy': (238, 172, 134), 'olive': (226, 186, 140), 'brown': (196, 134, 94),
    'deep': (156, 102, 72), 'ash': (230, 206, 192),
}
IRIS = {                                                # 눈동자 (짙은 · 바탕 · 밝은)
    'brown': ('#3a1f10', '#7a4a26', '#c08a52'), 'amber': ('#5a3208', '#c27a12', '#ffd166'),
    'green': ('#173a1c', '#3f8a3a', '#a6e07a'), 'hazel': ('#3a2a10', '#7d6a2a', '#c8b862'),
    'grey': ('#2a3036', '#6b7682', '#c4ced8'), 'violet': ('#2a1446', '#7448b8', '#d0a8ff'),
    'dark': ('#120c0a', '#3a2a22', '#7a6050'), 'teal': ('#0f3a3a', '#2a8a86', '#8ae6da'),
    'steel': ('#1e2a3a', '#4f6f94', '#a8c4e6'), 'gold': ('#4a3008', '#b8860b', '#ffe08a'),
}


def fmt(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def L(d, color, w=3, op=1.0, extra=''):
    return (f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{fmt(w)}" stroke-linecap="round" '
            f'stroke-linejoin="round" opacity="{op}" {extra}/>')


def F(d, fill, op=1.0, extra=''):
    return f'<path d="{d}" fill="{fill}" opacity="{op}" {extra}/>'


def P(d, fill, w=4, stroke=OL, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{fmt(w)}" stroke-linejoin="round" {extra}/>'


_ID = [0]


def uid(p):
    _ID[0] += 1
    return f'nf{p}{_ID[0]}'


def q(a, c, b):
    """a 에서 b 로, c 를 지나는(꼭짓점) 2차 곡선의 조절점."""
    return (2 * c[0] - (a[0] + b[0]) / 2, 2 * c[1] - (a[1] + b[1]) / 2)


def qpath(a, c, b, move=True):
    k = q(a, c, b)
    return (f'M{fmt(a[0])} {fmt(a[1])} ' if move else '') + f'Q{fmt(k[0])} {fmt(k[1])} {fmt(b[0])} {fmt(b[1])}'


def qpt(a, c, b, t):
    k = q(a, c, b)
    return ((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * k[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * k[1] + t * t * b[1])


def qsub(a, c, b, t0, t1, n=8):
    pts = [qpt(a, c, b, t0 + (t1 - t0) * i / n) for i in range(n + 1)]
    return 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts)


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    A, B = hexrgb(a), hexrgb(b)
    return '#' + ''.join(f'{int(round(x + (y - x) * t)):02x}' for x, y in zip(A, B))


def not_hair(base, shape):
    """머리칼이 **아닌** 자리 — 눈 밑 얼굴 안쪽(볼 · 턱)과 목(짧은 머리 몸).
    0.70.37 까지 거친 차림(m2 · f2)의 볼 · 목에 묻은 흙이 머리칼로 잡혀 머리색으로 칠해졌다
    (간수의 볼에 검푸른 얼룩, 무기상 시안의 볼에 노란 얼룩)."""
    A = ANCH[CLEAN[base]]
    m = np.zeros(shape[:2], np.uint8)
    top = A['eye'][0][1] + 6
    jaw = A['jaw']
    cx = (jaw[0][0] + jaw[-1][0]) / 2
    low = A['mouth'][1] + 8                                    # 턱 아래쪽 — 둘레에 머리칼이 없다: 얼굴 선 · 턱 그늘까지 넣는다
    pts = []
    for x, y in jaw:
        if y >= low:
            k = 7 if abs(x - cx) > 4 else 0
            pts.append((x - k if x < cx else x + k, y + (8 if abs(x - cx) <= 4 else 4)))
        else:
            pts.append((x + (2 if x < cx else -2), max(y, top)))
    pts = [(pts[0][0], top)] + pts + [(pts[-1][0], top)]
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    if base in ('m1', 'm2'):                                   # 짧은 머리 — 목 · 깃 둘레에는 머리칼이 없다
        cv2.rectangle(m, (int(cx - 48), A['chin'] - 6), (int(cx + 48), A['chin'] + 70), 1, -1)
    return m.astype(bool)


# ─────────────────────────────────────────────────────────────
# ① 살빛
# ─────────────────────────────────────────────────────────────
def skin_mask(im, hair=None):
    rgb = im[..., :3].astype(np.int32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    hsv = cv2.cvtColor(im[..., :3].astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.int32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    m = (im[..., 3] > 0) & ((h <= 22) | (h >= 172)) & (s >= 40) & (s <= 150) & (v >= 140) & (r - b >= 38) & (r >= g)
    if hair is not None:
        m &= ~cv2.dilate(hair.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    return m


def recolor_skin(im, tone, hair=None):
    if not tone:
        return im
    out = im.copy()
    m = skin_mask(im, hair)
    soft = cv2.GaussianBlur(m.astype(np.float32), (3, 3), 0)[..., None]
    gain = np.array(SKIN[tone], np.float32) / SKIN0
    rgb = im[..., :3].astype(np.float32)
    new = np.clip(rgb * gain, 0, 255)
    out[..., :3] = (rgb * (1 - soft) + new * soft).clip(0, 255).astype(np.uint8)
    return out


def skin_hex(tone, k=1.0):
    c = np.array(SKIN.get(tone) or SKIN0, np.float32) * k
    return '#' + ''.join(f'{int(v):02x}' for v in c.clip(0, 255))


# ─────────────────────────────────────────────────────────────
# ② 지우기 — 주인공의 눈 · 눈썹 · 입 · 볼 빗금
# ─────────────────────────────────────────────────────────────
def erase_mask(base, what, shape):
    A = ANCH[CLEAN[base]]
    m = np.zeros(shape[:2], np.uint8)
    if 'eyes' in what:
        for (x, y) in A['eye']:
            cv2.ellipse(m, (x, y), (A['ew'] + 7, A['eh'] + 8), 0, 0, 360, 1, -1)
    if 'mouth' in what:
        x, y = A['mouth']
        cv2.ellipse(m, (x, y + 4), (A['mw'] + 8, 13), 0, 0, 360, 1, -1)
    if 'cheeks' in what:
        for (x, y) in A['cheek']:
            cv2.ellipse(m, (x, y), (13, 6), 0, 0, 360, 1, -1)
    if 'nose' in what:
        x, y = A['nose']
        cv2.ellipse(m, (x, y - 3), (13, 14), 0, 0, 360, 1, -1)
    return m.astype(bool)


def erase(im, base, what=('eyes', 'brows', 'mouth', 'cheeks')):
    out = im.copy()
    m = erase_mask(base, what, im.shape)
    if 'brows' in what:
        A = ANCH[CLEAN[base]]
        rgb = im[..., :3].astype(np.int32)
        lum = rgb @ np.array([3, 6, 1]) / 10
        for (x0, y0), (x1, y1) in A['brows']:
            box = np.zeros_like(m)
            box[y0:y1, x0:x1] = True
            dark = box & (lum < 150)
            m |= cv2.dilate(dark.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool) & box
    rgb = np.ascontiguousarray(out[..., :3])
    fill = cv2.inpaint(rgb, m.astype(np.uint8), 9, cv2.INPAINT_TELEA)
    # 메운 자리를 살짝 흐려 붓 자국을 지운다
    blur = cv2.GaussianBlur(fill, (0, 0), 2.2)
    mm = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.2)[..., None]
    out[..., :3] = (fill * (1 - mm) + blur * mm).clip(0, 255).astype(np.uint8)
    return out


# ─────────────────────────────────────────────────────────────
# ③ 새로 그리기
# ─────────────────────────────────────────────────────────────
def iris_grad(key):
    dk, md, lt = IRIS[key]
    gid = uid('ir')
    return gid, (f'<radialGradient id="{gid}" cx=".5" cy=".62" r=".62">'
                 f'<stop offset="0" stop-color="{lt}"/><stop offset=".55" stop-color="{md}"/><stop offset="1" stop-color="{dk}"/></radialGradient>')


def eye(cx, cy, s, e, skin):
    """s: -1 화면 왼쪽 눈(바깥이 왼쪽) · +1 오른쪽 눈. e: 눈 모양 딕셔너리."""
    kind = e.get('kind', 'open')
    w, up, lo = e.get('w', 20), e.get('up', 12), e.get('lo', 9)
    tilt = e.get('tilt', 0)                       # 바깥 눈꼬리를 올린다(+) / 내린다(-)
    inner = (cx - s * w, cy + e.get('inner_dy', 2))
    outer = (cx + s * w, cy - tilt)
    peak = (cx - s * w * (1 - 2 * e.get('peak', .45)) * .9, cy - up)
    bot = (cx + s * w * .08, cy + lo)
    lash = e.get('lash', 5.5)
    out = ''
    if kind in ('happy', 'calm', 'squint'):
        # 감은 눈 — 웃는 눈(∩) · 편히 감은 눈(∪) · 실눈(얇은 틈)
        if kind == 'happy':
            mid = (cx, cy - up * .9)
            out += L(qpath(inner, mid, outer), OL, lash)
        elif kind == 'calm':
            mid = (cx, cy + lo * .55)
            out += L(qpath((inner[0], inner[1] - 2), mid, (outer[0], outer[1] - 2)), OL, lash * .85)
        else:
            mid = (cx, cy - up * .35)
            out += L(qpath(inner, mid, outer), OL, lash)
            lo_mid = (cx, cy + 3)
            out += L(qsub(inner, lo_mid, outer, .25, .9), '#6b4636', 2.2, .9)
        if e.get('lashes'):
            for t, ln, ang in ((.88, 7, 28), (.98, 8, 8)):
                x, y = qpt(inner, mid if kind != 'calm' else (cx, cy + lo * .55), outer, t)
                a = math.radians(ang)
                out += L(f'M{fmt(x)} {fmt(y)} L{fmt(x + s * ln * math.cos(a))} {fmt(y - ln * math.sin(a))}', OL, 3)
        return out
    # 뜬 눈
    shape = qpath(inner, peak, outer) + ' ' + qpath(outer, bot, inner, move=False) + ' Z'
    cid = uid('ec')
    ik = e.get('iris', 'brown')
    gid, gdef = iris_grad(ik)
    ir = e.get('r', 9.5)
    ix, iy = cx + s * e.get('look', 0) - s * 1.5, cy + e.get('iris_dy', 1)
    dk, md, lt = IRIS[ik]
    inner_svg = (f'<rect x="{fmt(cx - w - 10)}" y="{fmt(cy - up - 10)}" width="{fmt(2 * w + 20)}" height="{fmt(up + lo + 20)}" fill="#fbf8f3"/>'
                 + L(qpath(inner, peak, outer), '#cdbdb8', 10, .9)                      # 윗눈꺼풀 그늘(흰자)
                 + f'<circle cx="{fmt(ix)}" cy="{fmt(iy)}" r="{fmt(ir)}" fill="url(#{gid})"/>'
                 + f'<circle cx="{fmt(ix)}" cy="{fmt(iy)}" r="{fmt(ir - 1)}" fill="none" stroke="{dk}" stroke-width="2.4"/>'
                 + f'<circle cx="{fmt(ix)}" cy="{fmt(iy + .5)}" r="{fmt(ir * e.get("pupil", .45))}" fill="#120a08"/>'
                 + L(qpath(inner, peak, outer), dk, 9, .55)                              # 눈동자 윗몫 그늘
                 + f'<circle cx="{fmt(ix - ir * .36)}" cy="{fmt(iy - ir * .38)}" r="{fmt(max(2, ir * .32))}" fill="#ffffff"/>'
                 + f'<circle cx="{fmt(ix + ir * .36)}" cy="{fmt(iy + ir * .4)}" r="{fmt(max(1.2, ir * .15))}" fill="#ffffff" opacity=".9"/>')
    out += f'<defs>{gdef}</defs><clipPath id="{cid}"><path d="{shape}"/></clipPath><g clip-path="url(#{cid})">{inner_svg}</g>'
    # 아래 눈꺼풀(바깥쪽 몫)
    out += L(qsub(outer, bot, inner, .04, .7), e.get('lower', '#6b4636'), 2.6, .95)
    # 윗 눈꺼풀 — 안쪽은 가늘고 바깥으로 갈수록 굵은 속눈썹 선(바깥 끝은 살짝 뻗는다)
    n = 14
    top, dn = [], []
    for i in range(n + 1):
        t = i / n
        x, y = qpt(inner, peak, outer, t)
        th = lash * (.35 + .95 * t ** 1.3)
        top.append((x, y - th * .75))
        dn.append((x, y + th * .25))
    tip = (outer[0] + s * (3 + lash * .6), outer[1] - lash * .3)
    d = 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in top + [tip] + dn[::-1]) + ' Z'
    out += f'<path d="{d}" fill="{OL}" stroke="{OL}" stroke-width="1.2" stroke-linejoin="round"/>'
    if e.get('wing'):                                                 # 눈꼬리 선(마녀)
        wx, wy = outer[0] + s * e['wing'] * 1.4, outer[1] - e['wing'] * .7
        out += F(f'M{fmt(outer[0] - s * 10)} {fmt(outer[1] - lash * .9)} L{fmt(wx)} {fmt(wy)} L{fmt(outer[0] - s * 1)} {fmt(outer[1] + 2)} Z', OL)
    if e.get('lashes'):
        for t, ln, ang in ((.7, 6, 66), (.84, 7, 46), (.96, 8, 24)):
            x, y = qpt(inner, peak, outer, t)
            y -= lash * .5
            a = math.radians(ang)
            out += L(f'M{fmt(x)} {fmt(y)} L{fmt(x + s * ln * math.cos(a))} {fmt(y - ln * math.sin(a))}', OL, 3.2)
    if e.get('crease'):                                               # 쌍꺼풀 · 무거운 눈꺼풀 선
        c_in, c_pk, c_out = (inner[0] + s * 6, inner[1] - 6), (peak[0], peak[1] - e['crease'] - lash * .4), (outer[0] + s * 1, outer[1] - 6)
        out += L(qsub(c_in, c_pk, c_out, .15, .95), mix(skin, '#5a3020', .55), 2.4, .9)
    return out


def brow(cx, cy, s, b, color, line):
    """눈썹 — 안쪽(코 쪽) 끝 · 바깥 끝 · 둥근 정도 · 두께."""
    kind = b.get('kind', 'plain')
    y_in, y_out = cy - b.get('in', 20), cy - b.get('out', 22)
    x_in, x_out = cx - s * b.get('x_in', 16), cx + s * b.get('x_out', 24)
    arch = b.get('arch', 4)
    t_in, t_out = b.get('t_in', 6), b.get('t_out', 3)
    a, c = (x_in, y_in), (x_out, y_out)
    mid = ((x_in + x_out) / 2, (y_in + y_out) / 2 - arch)
    top = [qpt(a, mid, c, i / 10) for i in range(11)]
    # 두께 — 안쪽 t_in 에서 바깥 t_out 으로
    pts_up, pts_dn = [], []
    for i, (x, y) in enumerate(top):
        t = i / 10
        th = t_in + (t_out - t_in) * t
        if kind == 'bushy':
            th *= 1.0 + .18 * math.sin(t * 9.5)
        pts_up.append((x, y - th * .5))
        pts_dn.append((x, y + th * .5))
    d = 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts_up + pts_dn[::-1]) + ' Z'
    out = P(d, color, 2.2, line)
    out += L('M' + ' L'.join(f'{fmt(x)} {fmt(y - 1.2)}' for x, y in pts_dn[1:-1]), mix(color, line, .5), 2.6, .65)   # 아랫단 그늘
    if kind == 'bushy':
        # 삐친 털 몇 가닥
        for i in (1, 3, 5, 7, 9):
            x, y = pts_dn[i]
            dy = 4 + (i % 3)
            out += L(f'M{fmt(x)} {fmt(y - 2)} L{fmt(x + s * 3)} {fmt(y + dy)}', color, 2.6)
            out += L(f'M{fmt(x)} {fmt(y + dy - 1)} L{fmt(x + s * 3)} {fmt(y + dy)}', line, 1.2, .7)
        for i in (2, 6):
            x, y = pts_up[i]
            out += L(f'M{fmt(x)} {fmt(y + 2)} L{fmt(x - s * 2)} {fmt(y - 5)}', color, 2.6)
    if b.get('droop'):                                                # 늙은이 — 바깥 끝이 처져 늘어진다
        x, y = c
        tip = (x + s * 6, y + b['droop'])
        out += P(f'M{fmt(x - s * 6)} {fmt(y - 3)} Q{fmt(x + s * 6)} {fmt(y - 2)} {fmt(tip[0])} {fmt(tip[1])} '
                 f'Q{fmt(x)} {fmt(y + 4)} {fmt(x - s * 8)} {fmt(y + 3)} Z', color, 2, line)
    return out


def mouth(mx, my, m, skin):
    kind = m.get('kind', 'smile')
    w = m.get('w', 16)
    lipc = m.get('lip', mix(skin, '#a03a3a', .35))
    out = ''
    if kind == 'smile':
        out += L(qpath((mx - w, my - 2), (mx, my + m.get('curve', 5)), (mx + w, my - 2)), '#3a1a14', 3.6)
        out += L(f'M{fmt(mx - w - 2)} {fmt(my - 4)} L{fmt(mx - w + 2)} {fmt(my)}', '#3a1a14', 2.4, .8)
        out += L(f'M{fmt(mx + w + 2)} {fmt(my - 4)} L{fmt(mx + w - 2)} {fmt(my)}', '#3a1a14', 2.4, .8)
        out += F(qpath((mx - 7, my + 9), (mx, my + 12), (mx + 7, my + 9)) + ' Z', mix(skin, '#8a4030', .35), .7)
    elif kind in ('open', 'gap'):
        top_c = (mx, my - 1)
        bot = (mx, my + m.get('open', 13))
        a, b = (mx - w, my - 3), (mx + w, my - 3)
        d = qpath(a, top_c, b) + ' ' + qpath(b, bot, a, move=False) + ' Z'
        cid = uid('mo')
        teeth = (f'<rect x="{fmt(mx - w)}" y="{fmt(my - 6)}" width="{fmt(2 * w)}" height="5.5" fill="#ffffff"/>'
                 if m.get('teeth', True) else '')
        if kind == 'gap':
            teeth += f'<rect x="{fmt(mx + 2)}" y="{fmt(my - 6)}" width="5" height="6" fill="#5a1a1a"/>'
        inner = (f'<rect x="{fmt(mx - w)}" y="{fmt(my - 6)}" width="{fmt(2 * w)}" height="24" fill="#6e2222"/>'
                 f'<ellipse cx="{fmt(mx)}" cy="{fmt(bot[1] + 2)}" rx="{fmt(w * .6)}" ry="6" fill="#d8606a"/>' + teeth)
        out += f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})">{inner}</g>'
        out += P(d, 'none', 3.2, '#2a1210')
    elif kind == 'grin':                                              # 이를 드러낸 넓은 웃음(금니 하나)
        a, b = (mx - w, my - 4), (mx + w, my - 6)
        top_c, bot = (mx, my), (mx + 1, my + 8)
        d = qpath(a, top_c, b) + ' ' + qpath(b, bot, a, move=False) + ' Z'
        cid = uid('mg')
        inner = f'<rect x="{fmt(mx - w)}" y="{fmt(my - 8)}" width="{fmt(2 * w)}" height="20" fill="#ffffff"/>'
        inner += L(f'M{fmt(mx - w)} {fmt(my + 1)} L{fmt(mx + w)} {fmt(my)}', '#9a8a80', 1.6)
        for k in range(-2, 3):
            inner += L(f'M{fmt(mx + k * w / 3)} {fmt(my - 6)} L{fmt(mx + k * w / 3)} {fmt(my + 8)}', '#9a8a80', 1.3)
        if m.get('gold'):
            inner += f'<rect x="{fmt(mx + w / 3)}" y="{fmt(my - 8)}" width="{fmt(w / 3)}" height="9" fill="#f2c14e"/>'
        out += f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})">{inner}</g>'
        out += P(d, 'none', 3, '#2a1210')
    elif kind == 'smirk':
        out += L(f'M{fmt(mx - w * .8)} {fmt(my + 1)} Q{fmt(mx + w * .1)} {fmt(my + 4)} {fmt(mx + w)} {fmt(my - 6)}', '#3a1a14', 3.4)
        out += L(f'M{fmt(mx + w + 1)} {fmt(my - 9)} L{fmt(mx + w - 1)} {fmt(my - 3)}', '#3a1a14', 2.2, .8)
        out += F(qpath((mx - 6, my + 9), (mx, my + 11), (mx + 6, my + 9)) + ' Z', mix(skin, '#8a4030', .35), .6)
    elif kind == 'flat':
        out += L(f'M{fmt(mx - w * .8)} {fmt(my)} L{fmt(mx + w * .8)} {fmt(my)}', '#3a1a14', 3.4)
        out += F(qpath((mx - 7, my + 8), (mx, my + 10), (mx + 7, my + 8)) + ' Z', mix(skin, '#8a4030', .4), .7)
    elif kind == 'frown':
        out += L(qpath((mx - w * .8, my + 3), (mx, my - 2), (mx + w * .8, my + 3)), '#3a1a14', 3.4)
        out += F(qpath((mx - 7, my + 9), (mx, my + 11), (mx + 7, my + 9)) + ' Z', mix(skin, '#8a4030', .4), .7)
    elif kind == 'lips':                                              # 작은 입술(색)
        up = qpath((mx - w * .7, my), (mx, my - 3), (mx + w * .7, my))
        d = up + ' ' + qpath((mx + w * .7, my), (mx, my + 8), (mx - w * .7, my), move=False) + ' Z'
        out += P(d, lipc, 2, '#3a1a20')
        out += L(qpath((mx - w * .7, my), (mx, my + 2), (mx + w * .7, my)), '#3a1a20', 2.6)
        out += f'<ellipse cx="{fmt(mx - 3)}" cy="{fmt(my + 4)}" rx="3" ry="1.5" fill="#ffffff" opacity=".55"/>'
        if m.get('smile'):
            out += L(f'M{fmt(mx + w * .7)} {fmt(my)} L{fmt(mx + w * .7 + 4)} {fmt(my - 4)}', '#3a1a20', 2.2)
    return out


def nose(nx, ny, n, skin):
    kind = n.get('kind')
    sh = mix(skin, '#6a3020', .45)
    if not kind:
        return ''
    if kind == 'big':                                                # 둥근 큰 코
        d = f'M{fmt(nx - 4)} {fmt(ny - 22)} Q{fmt(nx - 14)} {fmt(ny - 4)} {fmt(nx - 12)} {fmt(ny + 4)} Q{fmt(nx)} {fmt(ny + 12)} {fmt(nx + 12)} {fmt(ny + 4)}'
        out = F(f'M{fmt(nx - 12)} {fmt(ny + 4)} Q{fmt(nx)} {fmt(ny + 12)} {fmt(nx + 12)} {fmt(ny + 4)} Q{fmt(nx + 2)} {fmt(ny - 6)} {fmt(nx - 12)} {fmt(ny + 4)} Z', sh, .45)
        out += L(d, '#4a2418', 3)
        out += f'<ellipse cx="{fmt(nx - 5)}" cy="{fmt(ny + 4)}" rx="2.4" ry="1.6" fill="#3a1a12"/><ellipse cx="{fmt(nx + 6)}" cy="{fmt(ny + 4)}" rx="2.4" ry="1.6" fill="#3a1a12"/>'
        out += f'<ellipse cx="{fmt(nx - 3)}" cy="{fmt(ny - 4)}" rx="3" ry="2" fill="#ffffff" opacity=".45"/>'
        if n.get('red'):
            out = f'<ellipse cx="{fmt(nx)}" cy="{fmt(ny)}" rx="12" ry="9" fill="#e0606a" opacity=".35"/>' + out
        return out
    if kind == 'hook':                                               # 매부리코
        d = f'M{fmt(nx - 2)} {fmt(ny - 26)} Q{fmt(nx + 10)} {fmt(ny - 10)} {fmt(nx + 6)} {fmt(ny + 4)} Q{fmt(nx)} {fmt(ny + 8)} {fmt(nx - 6)} {fmt(ny + 3)}'
        return L(d, '#4a2418', 3) + F(f'M{fmt(nx + 6)} {fmt(ny + 4)} Q{fmt(nx + 12)} {fmt(ny - 8)} {fmt(nx)} {fmt(ny - 22)} L{fmt(nx + 2)} {fmt(ny - 4)} Z', sh, .35)
    if kind == 'button':                                             # 동그란 들창코(아이)
        return (f'<ellipse cx="{fmt(nx)}" cy="{fmt(ny)}" rx="7" ry="5" fill="{sh}" opacity=".45"/>'
                + L(f'M{fmt(nx - 6)} {fmt(ny + 2)} Q{fmt(nx)} {fmt(ny + 7)} {fmt(nx + 6)} {fmt(ny + 2)}', '#4a2418', 2.6)
                + f'<circle cx="{fmt(nx - 2)}" cy="{fmt(ny - 3)}" r="2" fill="#ffffff" opacity=".6"/>')
    if kind == 'sharp':                                              # 곧고 가는 코
        return (L(f'M{fmt(nx + 1)} {fmt(ny - 20)} L{fmt(nx + 5)} {fmt(ny + 2)} L{fmt(nx - 3)} {fmt(ny + 4)}', '#4a2418', 2.6)
                + F(f'M{fmt(nx + 1)} {fmt(ny - 18)} L{fmt(nx + 5)} {fmt(ny + 2)} L{fmt(nx + 8)} {fmt(ny)} Z', sh, .3))
    return ''


def stubble(A, base, seed, color='#2a2020', op=.26, top=None):
    """수염 자국 — 턱 둘레 점들(얼굴 선 안쪽만)."""
    jaw = A['jaw']
    mx, my = A['mouth']
    y0 = top if top is not None else my - 12
    pts = [(jaw[0][0], y0)] + [p for p in jaw if p[1] >= y0] + [(jaw[-1][0], y0)]
    d = 'M' + ' L'.join(f'{fmt(x)} {fmt(y)}' for x, y in pts) + ' Z'
    rng = np.random.default_rng(seed)
    dots = ''
    xs = [p[0] for p in pts]
    ramp = 22.0                                           # 위 가장자리는 옅게(딱 잘린 줄이 안 보이게)
    for _ in range(820):
        x = rng.uniform(min(xs), max(xs))
        y = rng.uniform(y0, A['chin'] + 4)
        if abs(x - mx) < 18 and abs(y - my - 2) < 6:          # 입술 위는 비운다
            continue
        if rng.uniform() > min(1.0, (y - y0) / ramp):
            continue
        dots += f'<circle cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(rng.uniform(.8, 1.4))}"/>'
    cid, gid = uid('sb'), uid('sg')
    return (f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{fmt(y0)}" x2="0" y2="{fmt(y0 + ramp * 1.4)}">'
            f'<stop offset="0" stop-color="#5a6a7a" stop-opacity="0"/><stop offset="1" stop-color="#5a6a7a" stop-opacity=".22"/></linearGradient>'
            f'<clipPath id="{cid}"><path d="{d}"/></clipPath><g clip-path="url(#{cid})">'
            f'<path d="{d}" fill="url(#{gid})"/><g fill="{color}" opacity="{op}">{dots}</g></g>')


def extras(A, base, x, skin, hair_dk):
    """주근깨 · 볼 빛 · 주름 · 흉터 · 안대 · 외알 안경 · 점 · 반창고 · 그을음 · 귀고리."""
    out = ''
    (lx, ly), (rx, ry) = A['eye']
    ew = A['ew']
    nx, ny = A['nose']
    mx, my = A['mouth']
    line = mix(skin, '#5a2a1a', .5)
    if x.get('stubble'):
        out += stubble(A, base, x['stubble'])
    if 'blush' in x:
        op = x['blush']
        for (cx, cy) in A['cheek']:
            gid = uid('bl')
            out += (f'<radialGradient id="{gid}"><stop offset="0" stop-color="#ff6a6a" stop-opacity="{op}"/>'
                    f'<stop offset="1" stop-color="#ff6a6a" stop-opacity="0"/></radialGradient>'
                    f'<ellipse cx="{cx}" cy="{cy + 4}" rx="17" ry="10" fill="url(#{gid})"/>')
    if 'freckles' in x:
        rng = np.random.default_rng(x['freckles'])
        for (cx, cy) in A['cheek'] + ((nx, ny - 8),):
            n = 9 if cx != nx else 4
            for _ in range(n):
                fx, fy = cx + rng.uniform(-14, 14), cy + rng.uniform(-4, 7)
                if cx == nx:
                    fx, fy = cx + rng.uniform(-9, 9), cy + rng.uniform(-6, 2)
                out += f'<circle cx="{fmt(fx)}" cy="{fmt(fy)}" r="{fmt(rng.uniform(1.3, 2.0))}" fill="#b86a44" opacity=".6"/>'
    if x.get('crows'):                                               # 눈꼬리 주름
        for (cx, cy), s in (((lx, ly), -1), ((rx, ry), 1)):
            ox = cx + s * (ew + 5)
            for dy, ln in ((-5, 9), (1, 10), (7, 8))[:x['crows']]:
                out += L(f'M{fmt(ox)} {fmt(cy + dy)} L{fmt(ox + s * ln)} {fmt(cy + dy + dy * .5)}', line, 2.2, .8)
    if x.get('bags'):                                                # 눈 밑 주름
        for (cx, cy), s in (((lx, ly), -1), ((rx, ry), 1)):
            out += L(qpath((cx - s * 12, cy + 15), (cx + s * 2, cy + 20), (cx + s * 16, cy + 14)), line, 2.2, .75)
            if x['bags'] > 1:
                out += L(qpath((cx - s * 6, cy + 21), (cx + s * 4, cy + 25), (cx + s * 14, cy + 20)), line, 1.8, .55)
    if x.get('folds'):                                               # 팔자 주름
        for s in (-1, 1):
            out += L(qpath((nx + s * 12, ny + 2), (nx + s * 20, ny + 14), (mx + s * (A['mw'] + 4), my + 8)), line, 2.4, .7)
    if x.get('furrow'):                                              # 미간 주름
        cx = (lx + rx) / 2
        for s in (-1, 1):
            out += L(f'M{fmt(cx + s * 4)} {fmt(ly - 26)} L{fmt(cx + s * 3)} {fmt(ly - 14)}', line, 2.2, .75)
    if x.get('forehead'):                                            # 이마 주름(앞머리 아래로 보이는 만큼)
        cx = (lx + rx) / 2
        for k in range(x['forehead']):
            yy = ly - 40 - k * 7
            out += L(qpath((cx - 22, yy + 2), (cx, yy - 2), (cx + 22, yy + 2)), line, 2, .6)
    if x.get('mole'):                                                # 점
        px, py = x['mole']
        out += f'<circle cx="{fmt(mx + px)}" cy="{fmt(my + py)}" r="2.6" fill="#3a1a14"/>'
    if x.get('soot'):                                                # 그을음(대장장이)
        fid = uid('sf')
        out += (f'<filter id="{fid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>'
                f'<g filter="url(#{fid})" opacity=".55"><ellipse cx="{A["cheek"][1][0] + 4}" cy="{A["cheek"][1][1] + 6}" rx="14" ry="7" fill="#3a2a24" transform="rotate(-18 {A["cheek"][1][0]} {A["cheek"][1][1]})"/>'
                f'<ellipse cx="{nx - 26}" cy="{ny - 34}" rx="7" ry="4" fill="#3a2a24"/></g>')
    if x.get('scar'):                                                # 흉터 — (쪽, 어디)
        side, where = x['scar']
        cx, cy = (lx, ly) if side < 0 else (rx, ry)
        if where == 'eye':
            a, b = (cx - 8 * side, cy - 30), (cx + 10 * side, cy + 26)
        else:
            a, b = (cx + side * 4, cy + 14), (cx + side * 26, cy + 34)
        out += L(f'M{fmt(a[0])} {fmt(a[1])} L{fmt(b[0])} {fmt(b[1])}', '#c9706a', 4.5, .9)
        out += L(f'M{fmt(a[0])} {fmt(a[1])} L{fmt(b[0])} {fmt(b[1])}', '#7a2a2a', 1.6, .8)
        for t in (.25, .5, .75):
            px_, py_ = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            out += L(f'M{fmt(px_ - 4)} {fmt(py_ + 1)} L{fmt(px_ + 4)} {fmt(py_ - 1)}', '#7a2a2a', 1.6, .7)
    if x.get('bandaid'):                                             # 반창고(아이)
        cx, cy = A['cheek'][0]
        out += (f'<g transform="rotate(-20 {cx} {cy})"><rect x="{cx - 12}" y="{cy - 5}" width="24" height="10" rx="4" fill="#f2d2a8" stroke="{OL}" stroke-width="2"/>'
                f'<rect x="{cx - 4}" y="{cy - 4}" width="8" height="8" fill="#e6b88a"/>'
                f'<path d="M{cx - 9} {cy - 2} l2 0 M{cx - 9} {cy + 2} l2 0 M{cx + 7} {cy - 2} l2 0 M{cx + 7} {cy + 2} l2 0" stroke="#c09060" stroke-width="1.4"/></g>')
    if x.get('shadow'):                                              # 눈 둘레 짙은 그늘(간수)
        for (cx, cy) in A['eye']:
            gid = uid('sh')
            out += (f'<radialGradient id="{gid}"><stop offset=".45" stop-color="#3a2030" stop-opacity=".45"/>'
                    f'<stop offset="1" stop-color="#3a2030" stop-opacity="0"/></radialGradient>'
                    f'<ellipse cx="{cx}" cy="{cy + 2}" rx="{ew + 12}" ry="20" fill="url(#{gid})"/>')
    if x.get('shadowlid'):                                           # 눈두덩 빛깔(마녀)
        col = x['shadowlid']
        for (cx, cy) in A['eye']:
            gid = uid('sl')
            out += (f'<radialGradient id="{gid}" cy=".7"><stop offset="0" stop-color="{col}" stop-opacity=".65"/>'
                    f'<stop offset="1" stop-color="{col}" stop-opacity="0"/></radialGradient>'
                    f'<ellipse cx="{cx}" cy="{cy - 10}" rx="{ew + 6}" ry="12" fill="url(#{gid})"/>')
    return out


def gear_over(A, base, x, hair_dk):
    """눈 위에 덮는 것 — 안대 · 외알 안경 · 귀고리 (눈을 그린 뒤에 얹는다)."""
    out = ''
    (lx, ly), (rx, ry) = A['eye']
    if x.get('eyepatch'):
        side = x['eyepatch']
        cx, cy = (lx, ly) if side < 0 else (rx, ry)
        (ex0, ey0), (ex1, ey1) = A['ear']
        far = (ex0, ey0 - 10) if side < 0 else (ex1, ey1 - 10)
        # 끈 — 이마를 비스듬히 가로질러 반대쪽 머리 위로 · 같은 쪽 귀로
        other = ((lx + rx) / 2 - side * 60, ly - 70)
        out += L(f'M{fmt(cx - side * 14)} {fmt(cy - 10)} L{fmt(other[0])} {fmt(other[1])}', '#2a1a14', 7)
        out += L(f'M{fmt(cx + side * 14)} {fmt(cy - 6)} L{fmt(far[0])} {fmt(far[1])}', '#2a1a14', 7)
        out += L(f'M{fmt(cx - side * 14)} {fmt(cy - 10)} L{fmt(other[0])} {fmt(other[1])}', '#5a4034', 2.5, .7)
        d = (f'M{fmt(cx - 20)} {fmt(cy - 12)} Q{fmt(cx)} {fmt(cy - 20)} {fmt(cx + 20)} {fmt(cy - 12)} '
             f'Q{fmt(cx + 24)} {fmt(cy + 12)} {fmt(cx)} {fmt(cy + 17)} Q{fmt(cx - 24)} {fmt(cy + 12)} {fmt(cx - 20)} {fmt(cy - 12)} Z')
        out += P(d, '#2b211e', 3.5)
        out += F(f'M{fmt(cx - 13)} {fmt(cy - 9)} Q{fmt(cx - 2)} {fmt(cy - 14)} {fmt(cx + 8)} {fmt(cy - 10)} Q{fmt(cx - 2)} {fmt(cy - 6)} {fmt(cx - 13)} {fmt(cy - 3)} Z', '#6a5650', .7)
    if x.get('monocle'):
        side = x['monocle']
        cx, cy = (lx, ly) if side < 0 else (rx, ry)
        out += f'<circle cx="{fmt(cx)}" cy="{fmt(cy + 1)}" r="25" fill="#cfefff" fill-opacity=".16" stroke="{OL}" stroke-width="7"/>'
        out += f'<circle cx="{fmt(cx)}" cy="{fmt(cy + 1)}" r="25" fill="none" stroke="#e8b93a" stroke-width="4"/>'
        out += L(f'M{fmt(cx - 14)} {fmt(cy - 12)} Q{fmt(cx - 6)} {fmt(cy - 18)} {fmt(cx + 4)} {fmt(cy - 18)}', '#ffffff', 2.5, .7)
        out += L(f'M{fmt(cx + side * 22)} {fmt(cy + 12)} Q{fmt(cx + side * 34)} {fmt(cy + 60)} {fmt(cx + side * 22)} {fmt(cy + 110)}', '#c99a2e', 2.6, .95)
    if x.get('earring'):
        for (ex, ey), s in zip(A['ear'], (-1, 1)):
            if x['earring'] in (s, 2):
                out += f'<circle cx="{fmt(ex + s * 2)}" cy="{fmt(ey + 13)}" r="6" fill="none" stroke="{OL}" stroke-width="5"/>'
                out += f'<circle cx="{fmt(ex + s * 2)}" cy="{fmt(ey + 13)}" r="6" fill="none" stroke="#f2c14e" stroke-width="2.6"/>'
    return out


def face_svg(base, f, hair_dk=None, hair_md=None):
    """f: 얼굴 딕셔너리(npc_defs 의 face) → 머리 조각에 얹을 svg."""
    A = ANCH[CLEAN[base]]
    skin = skin_hex(f.get('skin'))
    out = extras(A, base, f.get('x', {}), skin, hair_dk)
    e = dict(f.get('eye', {}))
    patch = f.get('x', {}).get('eyepatch')
    for (cx, cy), s in zip(A['eye'], (-1, 1)):
        if patch and patch == s:
            continue
        out += eye(cx + s * (e.get('w', 20) - A['ew']) * .6, cy, s, e, skin)
    b = f.get('brow')
    if b:
        color = b.get('color') or hair_md or '#3b2416'
        line = b.get('line') or mix(color, '#000000', .55)
        for (cx, cy), s in zip(A['eye'], (-1, 1)):
            bb = dict(b)
            if f.get('brow_raise') and f['brow_raise'][0] == s:          # 한쪽 눈썹만 올린다
                bb['in'] = bb.get('in', 20) + f['brow_raise'][1]
                bb['out'] = bb.get('out', 22) + f['brow_raise'][1] * 1.2
            out += brow(cx, cy, s, bb, color, line)
    out += nose(*A['nose'], f.get('nose', {}), skin)
    m = f.get('mouth')
    if m:
        out += mouth(*A['mouth'], m, skin)
    out += gear_over(A, base, f.get('x', {}), hair_dk)
    return out


def apply(base, im, f, hair=None):
    """몸 그림(살빛 · 지우기) — 머리색을 바꾼 뒤에 부른다. 반환: 새 그림."""
    if not f:
        return im
    im = recolor_skin(im, f.get('skin'), hair)
    what = ['eyes', 'cheeks']
    if f.get('brow'):
        what.append('brows')
    if f.get('mouth'):
        what.append('mouth')
    if (f.get('nose') or {}).get('kind'):
        what.append('nose')
    return erase(im, base, what)


# ─────────────────────────────────────────────────────────────
# 사람마다 — 눈(모양 · 눈동자 색) · 눈썹 · 코 · 입 · 살빛 · 그 밖(x)
#   눈 kind: open(뜬 눈) · happy(웃어 감은 ∩) · calm(편히 감은 ∪) · squint(실눈)
#   w 반폭 · up 윗눈꺼풀 높이(작을수록 졸린 · 무거운 눈) · lo 아래 깊이 · tilt 눈꼬리 올림 · r 눈동자 반지름
#   look 눈동자를 바깥으로 · lashes 속눈썹 · wing 눈꼬리 선 · crease 쌍꺼풀 선 높이
#   눈썹 in/out 눈 가운데에서 위로(안쪽 끝/바깥 끝) · x_in/x_out 옆으로 · arch 둥글기 · t_in/t_out 두께 · bushy · droop
# ─────────────────────────────────────────────────────────────
WHITE_BROW = dict(color='#f0eff5', line='#5c5c68')
GREY_BROW = dict(color='#b8b8c2', line='#4a4a54')
FACES = {
    'shopkeeper': dict(skin='fair',
                       eye=dict(w=20, up=13, lo=9, tilt=2, r=10.5, iris='green', lashes=True, crease=4),
                       brow=dict(**{'in': 21, 'out': 22}, x_in=14, x_out=22, arch=5, t_in=5, t_out=2.5),
                       mouth=dict(kind='open', w=15, open=11), x=dict(freckles=3, blush=.35)),
    'blacksmith': dict(skin='ruddy',
                       eye=dict(w=18, up=10, lo=7, r=8.5, iris='brown', tilt=-1, lash=6.5, crease=4),
                       brow=dict(kind='bushy', **{'in': 15, 'out': 18}, x_in=12, x_out=24, arch=1, t_in=11, t_out=8),
                       nose=dict(kind='big'), mouth=dict(kind='grin', w=14), x=dict(soot=1, furrow=1, crows=1)),
    'royal_smith': dict(skin='deep',
                        eye=dict(w=19, up=6, lo=8, r=9, iris='steel', crease=7, lash=5.5),
                        brow=dict(kind='bushy', **GREY_BROW, **{'in': 17, 'out': 20}, x_in=12, x_out=24, arch=3, t_in=9, t_out=6),
                        nose=dict(kind='sharp'), mouth=dict(kind='flat', w=14), x=dict(bags=2, crows=2)),
    'alchemist': dict(skin='olive',
                      eye=dict(w=19, up=9, lo=8, tilt=3, r=8.5, iris='amber', lashes=True, crease=3),
                      brow=dict(**{'in': 22, 'out': 22}, x_in=14, x_out=22, arch=2, t_in=4, t_out=2),
                      mouth=dict(kind='lips', w=12, lip='#c98080'), x=dict(mole=(30, -22))),
    'innkeeper': dict(skin='rosy',
                      eye=dict(kind='happy', w=18, up=10, lashes=True),
                      brow=dict(**{'in': 26, 'out': 23}, x_in=14, x_out=22, arch=5, t_in=5, t_out=3),
                      mouth=dict(kind='open', w=17, open=14), x=dict(blush=.55)),
    'villager_elder': dict(skin='fair',
                           eye=dict(kind='squint', w=17, up=7),
                           brow=dict(kind='bushy', **WHITE_BROW, **{'in': 16, 'out': 15}, x_in=12, x_out=24, arch=4, t_in=10, t_out=8, droop=14),
                           nose=dict(kind='big'), mouth=dict(kind='smile', w=12, curve=3),
                           x=dict(crows=3, bags=1, folds=1)),
    'villager_kid': dict(skin='peach',
                         eye=dict(w=19, up=14, lo=11, r=11, iris='green', lash=5),
                         brow=dict(**{'in': 27, 'out': 25}, x_in=12, x_out=20, arch=3, t_in=5, t_out=4),
                         nose=dict(kind='button'), mouth=dict(kind='gap', w=14, open=12),
                         x=dict(freckles=7, bandaid=1, blush=.3)),
    'gate_guard': dict(skin='tan',
                       eye=dict(w=19, up=8, lo=7, r=8.5, iris='brown', tilt=2, lash=6.5, crease=3),
                       brow=dict(**{'in': 15, 'out': 22}, x_in=12, x_out=24, arch=0, t_in=9, t_out=5),
                       mouth=dict(kind='flat', w=13), x=dict(stubble=11, scar=(1, 'cheek'))),
    'king': dict(skin='fair',
                 eye=dict(w=19, up=7, lo=7, r=9, iris='grey', crease=7, lash=5.5),
                 brow=dict(kind='bushy', **WHITE_BROW, **{'in': 18, 'out': 21}, x_in=12, x_out=24, arch=5, t_in=9, t_out=7, droop=7),
                 nose=dict(kind='big', red=1), mouth=dict(kind='smile', w=12, curve=3),
                 x=dict(crows=2, bags=1, folds=1)),
    # 무기상 · 간수 — 사용자 지정(0.70.38): 미리보기의 두 얼굴을 맞바꿨다(무기상 = 흉터 · 찌푸림, 간수 = 안대 · 금니)
    'gate_merchant': dict(skin='ash',
                          eye=dict(w=18, up=7, lo=6, r=7.5, iris='grey', lash=6.5, crease=3),
                          brow=dict(**{'in': 14, 'out': 16}, x_in=12, x_out=22, arch=1, t_in=7, t_out=4, color='#7a5a26'),
                          nose=dict(kind='sharp'), mouth=dict(kind='frown', w=13),
                          x=dict(shadow=1, scar=(-1, 'eye'))),
    'dungeon_warden': dict(skin='brown',
                           eye=dict(w=19, up=8, lo=7, tilt=3, r=8.5, iris='amber', crease=3, lash=6),
                           brow=dict(kind='bushy', **{'in': 16, 'out': 22}, x_in=12, x_out=24, arch=3, t_in=9, t_out=5),
                           brow_raise=(1, 5), mouth=dict(kind='grin', w=15, gold=1),
                           x=dict(stubble=5, eyepatch=-1, earring=1)),
    'gem_gambler': dict(skin='brown',
                        eye=dict(w=20, up=7, lo=5, tilt=5, r=8, iris='gold', look=3, crease=3, lash=6),
                        brow=dict(**GREY_BROW, **{'in': 20, 'out': 24}, x_in=12, x_out=24, arch=6, t_in=5, t_out=3),
                        brow_raise=(1, 6), nose=dict(kind='hook'), mouth=dict(kind='smirk', w=13),
                        x=dict(crows=2, monocle=1, earring=-1)),
    'witch': dict(skin='pale',
                  eye=dict(w=20, up=10, lo=7, tilt=5, r=9, iris='violet', lashes=True, wing=9, crease=3),
                  brow=dict(**{'in': 22, 'out': 26}, x_in=14, x_out=22, arch=7, t_in=4, t_out=2),
                  mouth=dict(kind='lips', w=12, lip='#8a3a6a', smile=1), x=dict(shadowlid='#8a4ad0', mole=(16, 6))),
}
