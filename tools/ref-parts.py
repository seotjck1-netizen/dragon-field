#!/usr/bin/env python3
"""
준 그림을 **장비 칸별 층**으로 가른다 (0.70.26 미리보기).

    python3 tools/ref-parts.py [warrior ranger mage] [--view]
      art/reference/<직업>_ref_cut.png  →  art/parts/<직업>/labels.png (층 번호 한 장)
                                          art/parts/<직업>/view.png   (층을 색으로 칠한 확인용)

왜 가르나:
  사용자가 준 그림은 **다 입은** 모습이다. 게임에서는 벗은 몸(기본 티·바지)에서 시작해
  갑옷·어깨·장갑·신발·벨트·무기를 **하나씩** 얹는다. 그러려면 준 그림의 점 하나하나가
  "어느 칸의 것인가" 를 알아야 한다. 다 얹으면 **준 그림과 점 하나 다르지 않게** 된다 —
  모든 점이 제 칸의 층에 그대로 들어 있기 때문이다.

어떻게 가르나 (세 단계):
  ① 대강 — 칸마다 **대강의 다각형 + 색 조건**(빨간 망토 · 살색 · 파란 튜닉 …)을
     우선순위대로 적용한다. 남는 점은 갑옷이다.
  ② 테두리에 맞추기 — 이 그림은 부품마다 **검은 테두리**가 둘러 있다. 테두리 안쪽의
     한 덩어리(칠한 면)는 **통째로 한 칸**이다. 덩어리의 60% 이상이 한 칸이면 나머지도
     그 칸으로 돌린다 — 손으로 그은 다각형이 몇 점 빗나가도 테두리에 맞춰진다.
  ③ 테두리 나누기 — 두 부품 사이의 검은 선은 **앞에 있는 부품의 것**이다
     (허리띠의 테두리는 허리띠 것이다). 허리띠를 벗기면 그 선도 함께 사라져야
     튜닉에 줄이 남지 않는다.

층 이름:
  head 머리·얼굴(늘 보인다) · skin 드러난 살(늘) · armor 갑옷 · shoulder_b 망토(몸 뒤) ·
  shoulder_f 망토 깃·어깨받이(앞) · gloves 장갑·팔보호대 · boots 신발 · belt 허리띠·어깨끈·주머니 ·
  weapon 무기 · weapon_b 무기(등 뒤 — 화살통) · gskin/ggl 무기를 쥔 손(살/장갑, 무기보다 앞)
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')
W, H = 768, 1024

LAYERS = ['head', 'skin', 'armor', 'shoulder_b', 'shoulder_f', 'gloves', 'boots', 'belt',
          'weapon', 'weapon_b', 'gskin', 'ggl']
LID = {n: i + 1 for i, n in enumerate(LAYERS)}          # 0 = 투명
VIEW = {  # 확인용 색
    'head': (240, 200, 160), 'skin': (255, 150, 150), 'armor': (60, 110, 220),
    'shoulder_b': (150, 20, 30), 'shoulder_f': (240, 60, 80), 'gloves': (240, 160, 30),
    'boots': (120, 70, 30), 'belt': (250, 240, 60), 'weapon': (230, 230, 255),
    'weapon_b': (120, 120, 180), 'gskin': (255, 110, 200), 'ggl': (255, 120, 0),
}

# 앞뒤 — 뒤에서 앞으로. **직업마다 다르다**: 마법사의 넓은 소매는 장갑 **위**를 덮고,
# 용사의 팔보호대는 사슬 소매 **위**에 찬다.
Z = {
    'warrior': ['weapon_b', 'shoulder_b', 'armor', 'skin', 'boots', 'belt', 'gloves',
                'shoulder_f', 'weapon', 'gskin', 'ggl', 'head'],
    'ranger':  ['weapon_b', 'shoulder_b', 'armor', 'skin', 'boots', 'belt', 'gloves',
                'shoulder_f', 'weapon', 'gskin', 'ggl', 'head'],
    'mage':    ['weapon_b', 'shoulder_b', 'skin', 'gloves', 'boots', 'armor', 'belt',
                'shoulder_f', 'weapon', 'gskin', 'ggl', 'head'],
}


def load(name):
    im = np.asarray(Image.open(os.path.join(ROOT, 'art', 'reference', f'{name}_ref_cut.png')).convert('RGBA'))
    return im


def features(im):
    rgb = im[..., :3].astype(np.int32)
    a = im[..., 3] > 0
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    mx, mn = rgb.max(-1), rgb.min(-1)
    yy, xx = np.mgrid[0:H, 0:W]
    f = dict(a=a, r=r, g=g, b=b, lum=lum, mx=mx, mn=mn, yy=yy, xx=xx)
    # 망토 빨강 — 짙은 안감(58,17,33)까지. 갈색 가죽(80,45,30)은 파랑이 초록보다 낮아서 빠진다.
    f['red'] = ((r > 45) & (r > g * 1.5) & (r > b * 1.25) & (b >= g * 0.95)) | \
               ((r >= 20) & (r > g * 2) & (r > b * 1.2))          # 거의 검은 안감(27,0,2)
    f['skin'] = (r > 185) & (g > 120) & (b > 85) & (r > g) & (g > b) & ((r - b) > 35) & ((r - g) < 90)
    f['blue'] = (b > r + 20) & (b > 80)
    f['cloth_blue'] = (b > r + 15) & (b >= g) & (lum < 140)   # 튜닉(짙은 그늘까지) — 칼날의 푸른 무늬(밝다)와 가른다
    f['gold'] = (r > 150) & (g > 105) & (b < 125) & (r - b > 60)
    f['brown'] = (r > g) & (g >= b - 6) & ((r - b) > 15) & ~f['skin']
    f['steel'] = ((mx - mn) < 45) & (lum > 105)
    f['green'] = (g > r - 4) & (g > b + 4)
    return f


def poly(*pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


def stroke(pts, w):
    m = np.zeros((H, W), np.uint8)
    cv2.polylines(m, [np.array(pts, np.int32)], False, 1, int(w), cv2.LINE_8)
    return m.astype(bool)


def box(x0, y0, x1, y1):
    m = np.zeros((H, W), bool)
    m[y0:y1, x0:x1] = True
    return m


def ell(cx, cy, rx, ry):
    m = np.zeros((H, W), np.uint8)
    cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 1, -1)
    return m.astype(bool)


# ─────────────────────────────────────────────────────────────
# 직업별 규칙 — (층, 자리, 색 조건) 을 **앞 규칙부터** 적용한다. 먼저 맞은 것이 이긴다.
# 좌표는 준 그림(768×1024) 그대로다.
# ─────────────────────────────────────────────────────────────
def rules_warrior(f):
    red, skin, blue, gold, brown, steel = f['red'], f['skin'], f['blue'], f['gold'], f['brown'], f['steel']
    anyc = np.ones((H, W), bool)
    head = poly((60, 0), (590, 0), (590, 340), (500, 345), (478, 352), (460, 373), (432, 392), (384, 401),
                (336, 392), (308, 373), (290, 352), (268, 345), (60, 340))
    # 칼 — 칼끝(657,250) → 날밑(525,672) → 칼자루끝(478,803). 날 · 날밑 · 자루 · 끝구슬로 나눠 잡는다
    blade = poly((660, 232), (670, 300), (644, 470), (606, 610), (590, 650), (510, 650), (526, 560),
                 (562, 440), (600, 300))
    guard = poly((446, 626), (500, 636), (560, 650), (604, 676), (606, 700), (570, 712), (520, 706),
                 (470, 680), (446, 670))
    handle = stroke([(510, 748), (484, 790)], 26) | ell(478, 801, 19, 19)
    grip = poly((476, 690), (512, 680), (552, 690), (562, 716), (554, 748), (520, 762), (486, 752), (474, 722))
    hand_l = poly((182, 640), (262, 640), (268, 700), (256, 752), (200, 752), (180, 700))
    brace_l = poly((170, 570), (262, 570), (266, 650), (176, 652))
    brace_r = poly((500, 548), (580, 548), (584, 600), (570, 700), (520, 700), (500, 640))
    boots = poly((258, 842), (368, 842), (370, 980), (224, 982), (228, 930), (256, 904)) | \
            poly((394, 842), (508, 842), (512, 904), (548, 930), (550, 982), (388, 980))
    belt_band = poly((222, 568), (548, 568), (548, 628), (222, 628))
    buckle = box(338, 566, 432, 626)
    chain = box(296, 404, 474, 450)
    pouch = poly((250, 592), (330, 592), (330, 700), (250, 700))
    strap = stroke([(292, 440), (330, 480), (420, 540), (520, 590)], 44)
    collar_f = poly((222, 372), (548, 372), (556, 420), (540, 470), (470, 466), (384, 470),
                    (300, 466), (226, 470), (210, 430))
    pad = poly((502, 414), (528, 403), (568, 396), (568, 470), (548, 484), (518, 468), (502, 442))
    # 몸(튜닉·사슬 소매·바지) — 여기 밖에서 아무 데도 안 걸린 점은 망토다
    body = poly((330, 392), (440, 392), (540, 425), (570, 480), (568, 530), (572, 600), (540, 610),
                (526, 700), (520, 750), (502, 760), (502, 850), (402, 850), (396, 764), (372, 764),
                (360, 850), (266, 850), (262, 760), (238, 752), (248, 700), (262, 610), (190, 590),
                (186, 520), (192, 470), (228, 425))
    EXTRA['warrior'] = {'hand_l': hand_l, 'head': head}
    return [
        ('weapon', blade, ~red),
        # 짙은 머리칼·턱선은 붉은 기가 있다 — 머리 자리에서는 **밝은** 망토 빨강만 망토로 돌린다
        ('head', head, (~(red & (f['lum'] > 28)) & ~f['cloth_blue']) | (f['yy'] < 330)),
        ('weapon', blade | guard | handle, ~red & ~f['cloth_blue'] & ~(skin & grip)),
        ('gskin', grip, skin),
        ('ggl', grip, ~red),
        ('skin', hand_l, skin),
        ('gloves', hand_l, ~red),
        ('gloves', brace_l, brown | gold | (f['lum'] < 90)),
        ('gloves', brace_r, brown | gold),
        ('boots', boots, anyc),
        ('belt', buckle, anyc),
        ('belt', belt_band, ~f['cloth_blue'] & ~(steel & ~gold)),
        ('belt', pouch, brown | gold | steel),
        ('belt', strap, brown | gold),
        ('shoulder_f', pad, anyc),
        ('shoulder_f', chain, gold | steel | (f['lum'] < 60)),
        ('shoulder_f', collar_f, red | (f['lum'] < 40)),
        ('shoulder_b', anyc, red),
        ('armor', body, anyc),
        ('shoulder_b', anyc, anyc),
    ]


def rules_ranger(f):
    red, skin, gold, brown, steel = f['red'], f['skin'], f['gold'], f['brown'], f['steel']
    lum, yy = f['lum'], f['yy']
    anyc = np.ones((H, W), bool)
    green = f['green']
    grey = (f['mx'] - f['mn']) < 50
    head = poly((100, 0), (622, 0), (622, 150), (604, 300), (560, 340), (500, 340), (496, 412), (470, 414),
                (462, 378), (432, 395), (384, 405), (336, 395), (306, 374), (302, 432), (266, 436), (258, 330),
                (240, 290), (160, 270), (100, 250))
    # 화살통 — 왼 어깨 뒤. 깃털은 잿빛, 머리칼은 짙은 밤색이라 색으로 가른다
    quiver = poly((166, 340), (198, 298), (240, 288), (264, 300), (284, 342), (296, 380), (298, 404),
                  (234, 408), (222, 388), (178, 366))
    # 활 — 윗고자(636,165) · 줌통(손) · 아랫고자(488,896), 시위는 두 고자를 잇는 곧은 줄
    limb_u = stroke([(646, 160), (638, 210), (633, 256), (640, 300), (648, 352), (657, 448), (650, 520), (632, 572)], 42) | \
             poly((622, 380), (682, 380), (684, 560), (620, 570))
    limb_d = stroke([(602, 650), (595, 672), (585, 704), (575, 736), (560, 768), (540, 800), (510, 832),
                     (485, 864), (462, 902)], 44)
    tassel = poly((648, 468), (690, 458), (710, 520), (702, 578), (660, 578))
    string = stroke([(630, 168), (611, 253), (558, 517), (522, 576), (505, 704), (482, 860), (464, 900)], 9)
    grip = poly((578, 572), (620, 566), (652, 580), (662, 620), (650, 662), (612, 666), (584, 652), (574, 610))
    hand_l = poly((176, 648), (262, 648), (270, 700), (252, 754), (194, 754), (176, 700))
    brace_l = poly((168, 536), (272, 536), (270, 652), (176, 654))
    brace_r = poly((498, 536), (590, 540), (608, 572), (602, 642), (576, 652), (540, 622), (500, 582))
    arms_skin = box(190, 490, 270, 570) | box(495, 490, 580, 575)
    boots = poly((258, 830), (372, 830), (374, 984), (222, 986), (228, 930), (252, 900)) | \
            poly((388, 830), (512, 830), (516, 900), (550, 930), (552, 986), (382, 984))
    belt_band = box(256, 568, 514, 618)
    buckle = box(336, 566, 404, 620)
    pouch = poly((264, 600), (334, 600), (334, 690), (264, 690))
    tool = poly((316, 610), (352, 610), (352, 698), (316, 698))
    roll = poly((444, 548), (512, 548), (512, 606), (444, 606))
    knife = poly((438, 554), (478, 554), (482, 620), (506, 624), (508, 650), (524, 700), (524, 764), (500, 766),
                 (470, 700), (452, 650), (440, 630))
    strap_a = stroke([(315, 380), (335, 448), (362, 480), (380, 512), (418, 544), (448, 576), (470, 596)], 20)
    strap_b = stroke([(470, 420), (450, 450), (423, 480), (390, 512), (346, 544), (310, 576), (285, 598)], 20)
    rope = poly((434, 424), (472, 418), (498, 470), (500, 558), (438, 558))
    pad_l = poly((198, 394), (300, 384), (320, 440), (302, 480), (236, 490), (196, 472))
    pad_r = poly((440, 384), (542, 390), (568, 440), (562, 480), (500, 490), (454, 470))
    body = poly((300, 380), (470, 380), (560, 430), (580, 490), (560, 540), (520, 560), (520, 700),
                (512, 840), (256, 840), (250, 700), (250, 560), (210, 540), (196, 480), (220, 420))
    EXTRA['ranger'] = {'hand_l': hand_l, 'head': head}
    return [
        ('weapon_b', quiver, grey | (lum < 45) | (brown & (yy > 372))),
        ('gskin', grip, skin),
        ('ggl', grip, anyc),
        ('weapon', limb_u | limb_d | tassel, ~skin),
        ('weapon', string & (yy < 360), grey & (lum < 150) & ~skin),
        ('head', head, anyc),
        ('weapon', string, grey & (lum < 150) & ~skin),
        ('skin', hand_l, skin),
        ('gloves', hand_l, anyc),
        # 팔뚝의 맨살은 **팔보호대 몫** — 벗은 몸에 이미 팔이 있다. 살 층으로 두면 벗은 팔 위에
        # 준 그림의 팔 조각(털 끝 · 테두리)이 얼룩처럼 남는다.
        ('gloves', brace_l | brace_r | arms_skin, anyc),
        ('boots', boots, anyc),
        ('belt', buckle, anyc),
        ('belt', knife | roll | tool, anyc),
        ('belt', pouch, ~green),
        ('belt', belt_band, ~green),
        ('belt', strap_a | strap_b, ~green),
        ('belt', rope, lum > 90),
        ('shoulder_f', pad_l | pad_r, ~green & ~skin),
        ('armor', body, anyc),
        ('weapon', box(560, 0, 768, 1024), anyc),     # 몸 밖 오른쪽은 활이다
        ('weapon_b', box(0, 0, 230, 470), anyc),       # 몸 밖 왼쪽 위는 화살통이다
        ('armor', anyc, anyc),
    ]


def rules_mage(f):
    red, skin, gold, brown, steel = f['red'], f['skin'], f['gold'], f['brown'], f['steel']
    lum, yy, cb = f['lum'], f['yy'], f['cloth_blue']
    anyc = np.ones((H, W), bool)
    grey = (f['mx'] - f['mn']) < 40
    # 지팡이 — 수정 머리(580~700, 150~300) · 자루(622,320) → (563,968)
    crystal = poly((568, 148), (704, 148), (704, 300), (652, 332), (620, 344), (584, 300), (566, 240))
    shaft = stroke([(624, 330), (620, 380), (612, 450), (604, 560), (594, 700), (578, 850), (564, 972)], 40)
    grip = poly((568, 478), (612, 470), (636, 486), (642, 530), (636, 566), (600, 568), (572, 552), (564, 515))
    hand_l = poly((178, 640), (264, 640), (268, 700), (252, 754), (194, 754), (176, 700))
    head = poly((60, 0), (568, 0), (568, 360), (520, 372), (470, 378), (440, 394), (384, 404), (328, 394),
                (298, 378), (250, 372), (60, 372))
    hair_l = poly((40, 360), (256, 360), (252, 440), (206, 470), (174, 560), (160, 622), (110, 642), (30, 630))
    hair_r = poly((512, 360), (720, 360), (720, 720), (640, 720), (602, 662), (594, 560), (572, 470), (514, 440))
    shoes = poly((226, 916), (308, 916), (310, 980), (220, 980)) | poly((438, 916), (532, 916), (536, 980), (434, 980))
    belt_band = box(282, 570, 550, 620)
    buckle = box(338, 566, 432, 626)
    pouch = poly((238, 598), (320, 598), (320, 692), (238, 692))
    book = poly((450, 596), (550, 596), (550, 710), (450, 710))
    strap = stroke([(322, 440), (352, 482), (420, 532), (492, 580)], 40)
    collar_f = poly((186, 370), (584, 370), (594, 420), (562, 472), (470, 462), (384, 470), (300, 462),
                    (208, 472), (186, 430))
    chain = box(298, 404, 472, 450)
    robe = poly((250, 380), (520, 380), (600, 470), (650, 560), (620, 620), (584, 640), (584, 860), (650, 950),
                (560, 990), (200, 990), (96, 960), (180, 860), (190, 700), (130, 650), (150, 560), (200, 470))
    EXTRA['mage'] = {'hand_l': hand_l, 'head': head | hair_l | hair_r}
    hairish = ~red & ~cb & ~(gold & (f['b'] < 90) & (lum > 150))
    return [
        ('gskin', grip, skin),
        ('ggl', grip, ~red),
        ('weapon', crystal, ~red),
        ('weapon', shaft, (((f['r'] > f['g']) & (f['g'] >= f['b'] - 4)) | (lum < 40) | gold | steel) & ~skin & ~cb & ~red),
        ('head', head, ~(red & (lum > 28)) & ~cb | (yy < 330)),
        ('head', hair_l | hair_r, hairish),
        ('skin', hand_l, skin),
        ('gloves', hand_l, ~red),
        ('boots', shoes, ((f['b'] - f['r']) < 45) & ~gold),
        ('belt', buckle | book, anyc),
        ('belt', pouch, brown | gold | (lum < 50)),
        ('belt', belt_band, ~cb),
        ('belt', strap, brown | gold | steel),
        ('shoulder_f', chain, gold | steel | (lum < 50)),
        ('shoulder_f', collar_f, red | (lum < 40)),
        ('shoulder_b', anyc, red),
        ('armor', robe, anyc),
        ('shoulder_b', anyc, anyc),
    ]


RULES = {'warrior': rules_warrior, 'ranger': rules_ranger, 'mage': rules_mage}

# 다 가른 뒤 되돌리기 — (층, 색 조건, 돌려보낼 층)
VETO = {
    'mage': lambda f: [('belt', f['cloth_blue'] & (f['lum'] > 30) & ~box(450, 596, 550, 710), 'armor'),
                       ('armor', f['red'], 'shoulder_b')],
    'warrior': lambda f: [('belt', f['cloth_blue'] & (f['lum'] > 30), 'armor'),
                          ('armor', f['red'], 'shoulder_b'),
                          ('shoulder_f', f['cloth_blue'] & (f['lum'] > 30) & (f['xx'] < 500), 'armor')],
}
EXTRA = {}   # 규칙이 채운다 — 왼손 자리 등(ref-compose 가 쓴다)


def segment(name):
    """(그림, 층 번호, 대강 층) — 층 번호는 LID 를 따른다."""
    im = load(name)
    f = features(im)
    a, lum = f['a'], f['lum']
    lab = np.zeros((H, W), np.uint8)
    lab[a] = LID['armor']
    done = np.zeros((H, W), bool)
    for layer, region, pred in RULES[name](f):
        m = region & pred & a & ~done
        lab[m] = LID[layer]
        done |= m
    first = lab.copy()

    # ② 테두리 안쪽 덩어리 단위로 맞춘다
    # 테두리 = **거의 검은** 점. 튜닉의 짙은 파랑 그늘(30,50,90)은 테두리가 아니다 — 그걸 테두리로 치면
    # 허리띠 둘레의 튜닉 그늘이 허리띠 몫이 되어, 허리띠만 찼을 때 파란 부스러기가 따라온다.
    dark = (f['mx'] < 46) | (lum < 32)
    thick = cv2.morphologyEx(dark.astype(np.uint8), cv2.MORPH_OPEN,
                             cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(bool)
    # 색이 확 바뀌는 곳도 덩어리를 끊는다 — 짙은 붉은 턱선(80,15,30)은 검정이 아니어서,
    # 안 끊으면 얼굴과 망토깃이 **한 덩어리**가 되고 망토깃이 얼굴 몫으로 넘어간다.
    # 색 차이는 Lab 로 잰다 — 짙은 밤색 머리(105,70,48)와 짙은 망토 빨강(76,22,36)은 RGB 로는 가깝지만
    # 색상(a*)이 크게 다르다.
    labc = cv2.cvtColor(np.ascontiguousarray(im[..., :3]), cv2.COLOR_RGB2LAB).astype(np.float32)
    labc[..., 1:] *= 1.6
    jump = np.zeros((H, W), np.float32)
    for dy, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
        sh = np.roll(labc, (dy, dx), (0, 1))
        jump = np.maximum(jump, np.sqrt(((labc - sh) ** 2).sum(-1)))
    inner = a & ((~dark & (jump < 34)) | thick)
    n, comp = cv2.connectedComponents(inner.astype(np.uint8), connectivity=4)
    flat = comp.ravel()
    lf = first.ravel()
    cnt = np.zeros((n, len(LAYERS) + 1), np.int64)
    np.add.at(cnt, (flat, lf), 1)
    tot = cnt.sum(1)
    best = cnt.argmax(1)
    share = cnt.max(1) / np.maximum(tot, 1)
    # 큰 덩어리는 맞추지 않는다 — 짙은 색끼리는(짙은 바지 · 짙은 망토 안감) 색 차이가 작아
    # 한 덩어리로 이어지는데, 그 덩어리를 통째로 한 층에 주면 바지가 망토 몫이 된다.
    snap = (share >= 0.6) & (tot < 4000)
    snap[0] = False
    newl = np.where(snap[flat], best[flat], lf).reshape(H, W).astype(np.uint8)
    lab = np.where(inner, newl, 0).astype(np.uint8)

    # 거부 — 이 층에 있어서는 안 되는 색(허리띠 속 튜닉 파랑 · 갑옷 속 망토 빨강)은 되돌린다.
    # ⚠ 선을 나누기 **전에** 한다 — 그래야 되돌린 자리의 테두리도 제 층을 따라간다.
    for layer, pred, to in VETO.get(name, lambda f: [])(f):
        m = (lab == LID[layer]) & pred
        lab[m] = LID[to]

    # ③ 선(어두운 가는 점)은 가까운 층 중 **가장 앞 층**의 것
    line = a & ~inner
    zord = Z[name]
    R = 5
    best_z = np.full((H, W), -1, np.int32)
    best_l = np.zeros((H, W), np.uint8)
    near_d = np.full((H, W), 1e9)
    near_l = np.zeros((H, W), np.uint8)
    for li, layer in enumerate(LAYERS):
        m = lab == LID[layer]
        if not m.any():
            continue
        d = ndi.distance_transform_edt(~m)
        zi = zord.index(layer)
        take = line & (d <= R) & (zi > best_z)
        if layer == 'head' and 'head' in EXTRA.get(name, {}):
            take &= EXTRA[name]['head']      # 턱 밑 옷깃의 선까지 머리가 가져가면, 옷을 벗겼을 때 목에 검은 점이 뜬다
        best_z[take] = zi
        best_l[take] = LID[layer]
        closer = line & (d < near_d)
        near_d[closer] = d[closer]
        near_l[closer] = LID[layer]
    fill = np.where(best_l > 0, best_l, near_l)
    lab[line] = fill[line]
    # 머리 층은 **한 덩어리**여야 한다 — 떨어진 작은 조각(지팡이 틈의 점 등)은 둘레 층으로 돌린다
    hm = lab == LID['head']
    n, cc, st, _ = cv2.connectedComponentsWithStats(hm.astype(np.uint8), connectivity=8)
    for k in np.where(st[1:, cv2.CC_STAT_AREA] < 900)[0] + 1:
        piece = cc == k
        ring = ndi.binary_dilation(piece, iterations=2) & ~piece
        around = lab[ring]
        around = around[(around != LID['head']) & (around != 0)]
        if len(around):
            lab[piece] = np.bincount(around).argmax()
    # 부스러기 — 한 층의 작은 조각(60점 미만)은 둘레에서 가장 많은 층으로 돌린다
    for _ in range(2):
        for li in range(1, len(LAYERS) + 1):
            m = lab == li
            if not m.any():
                continue
            n, cc, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
            for k in np.where(st[1:, cv2.CC_STAT_AREA] < 60)[0] + 1:
                x, y, w, h = st[k, :4]
                sl = (slice(max(0, y - 3), y + h + 3), slice(max(0, x - 3), x + w + 3))
                piece = cc[sl] == k
                ring = ndi.binary_dilation(piece, iterations=2) & ~piece
                around = lab[sl][ring]
                around = around[(around != li) & (around != 0)]
                if len(around):
                    lab[sl][piece] = np.bincount(around).argmax()
    return im, lab, first


def save(name, im, lab):
    out = os.path.join(ROOT, 'art', 'parts', name)
    os.makedirs(out, exist_ok=True)
    Image.fromarray(lab, 'L').save(os.path.join(out, 'labels.png'))
    view = np.zeros((H, W, 3), np.uint8)
    for layer in LAYERS:
        view[lab == LID[layer]] = VIEW[layer]
    rgb = im[..., :3].astype(np.float32)
    mix = (rgb * 0.45 + view * 0.55).astype(np.uint8)
    mix[lab == 0] = (30, 60, 35)
    Image.fromarray(mix).save(os.path.join(out, 'view.png'))
    counts = {l: int((lab == LID[l]).sum()) for l in LAYERS if (lab == LID[l]).any()}
    print('✓', name, counts)


if __name__ == '__main__':
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or ['warrior', 'ranger', 'mage']
    for nm in names:
        im, lab, first = segment(nm)
        save(nm, im, lab)
