"""한 장 비교표 — python3 tools/paint3d/sheet.py PNG_ROOT OUT.png (PNG_ROOT 는 preview.py 와 같다)"""
import os, sys
from PIL import Image, ImageDraw, ImageFont
import json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PNG = os.path.abspath(sys.argv[1])
OUTP = sys.argv[2]
_D = json.load(open(os.path.join(ROOT, 'src/data/bodies.json')))


def compose(body, scene, keys):
    """지금(0.70) 몸 그림 — BodyLook 과 같은 규칙으로 층을 겹친다."""
    im = Image.new('RGBA', (_D['scenes'][scene],) * 2, (0, 0, 0, 0))
    layers = _D['bodies'][body]['layers']
    for k in keys:
        r = layers[k]['rects'].get(scene) or layers[k]['rects'].get(_D.get('sceneOf', {}).get(scene, ''))
        if r:
            x, y, w, h, ox, oy = r
            src = Image.open(os.path.join(ROOT, f'assets/bodies/{body}/{k}.webp')).convert('RGBA')
            im.alpha_composite(src.crop((x, y, x + w, y + h)), (ox, oy))
    return im


def P(sub, name):
    return Image.open(os.path.join(PNG, sub, name))
F = lambda s, b=False: ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-%s.ttc' % ('Black' if b else 'Bold'), s, index=1)
DIRS = [0, 45, 90, 135, 180, 225, 270, 315]
NAMES = ['아래', '오른쪽 아래', '오른쪽', '오른쪽 위', '위', '왼쪽 위', '왼쪽', '왼쪽 아래']
NOW = {0: 'stand', 45: 'stand_fs', 90: 'stand_s', 135: 'stand_b', 180: 'stand_b', 225: 'stand_b', 270: 'stand_sl', 315: 'stand_fsl'}
CW, CH = 180, 240
def cell(im):
    return im.crop((25, 8, 135, 160)).resize((CW - 34, int((CW - 34) * 152 / 110)), Image.LANCZOS)
rows = [
    ('지금 (0.70) 남 · 여 — 옆을 봐도 몸은 정면, 눈동자만', [compose('m1', NOW[y], ['base']) for y in DIRS[:4]] + [compose('f1', NOW[y], ['base']) for y in DIRS[:4]]),
    ('시안③ — 남자 맨몸(시작 옷)', [P('png_m1', f'idle_0_{y:03d}.png') for y in DIRS]),
    ('시안③ — 여자 깨끗한 차림', [P('png_f1', f'idle_0_{y:03d}.png') for y in DIRS]),
    ('시안③ — 여자 거친 차림', [P('png_f2', f'idle_0_{y:03d}.png') for y in DIRS]),
    ('시안③ — 기사 갑옷 · 칼(오른손) — 지금 게임 그림 그대로', [P('png_k2', f'idle_0_{y:03d}.png') for y in DIRS]),
    ('시안③ — 여자 걷기 8장(오른쪽)', [P('png_f1', f'walk_{k}_090.png') for k in range(8)]),
    ('시안③ — 기사 달리기 8장(오른쪽 아래)', [P('png_k2', f'run_{k}_045.png') for k in range(8)]),
    ('시안③ — 여자(거친) 달리기 8장(위 · 뒷모습)', [P('png_f2', f'run_{k}_180.png') for k in range(8)]),
]
W = 24 + CW * 8
H = 70 + len(rows) * (CH + 40) + 10
s = Image.new('RGBA', (W, H), (24, 30, 38, 255))
d = ImageDraw.Draw(s)
d.text((24, 18), '주인공 그림 시안③ — 0.70 손그림 + 3D 입체감 · 남녀 · 8방향 · 걷기 · 달리기 (게임 크기, 2배로 키워 보임)', font=F(24, True), fill=(255, 226, 150))
y = 70
for r, (title, ims) in enumerate(rows):
    d.text((24, y), title, font=F(19, True), fill=(220, 230, 240))
    for i, im in enumerate(ims):
        x0 = 12 + i * CW
        d.rounded_rectangle([x0 + 6, y + 30, x0 + CW - 6, y + 30 + CH - 4], radius=10, fill=(70, 108, 66, 255) if r else (88, 82, 74, 255))
        c = cell(im)
        s.alpha_composite(c, (x0 + 17, y + 32))
        lab = ((('남 ' if i < 4 else '여 ') + NAMES[i % 4]) if r == 0 else NAMES[i]) if r < 5 else f'{i + 1}'
        d.text((x0 + 14, y + 30 + CH - 30), lab, font=F(14), fill=(235, 240, 245))
    y += CH + 40
s.convert('RGB').save(OUTP)
print(s.size)
