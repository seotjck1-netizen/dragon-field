"""시안③ 8방향 그림(toon.py 160) → 게임 그림(assets/bodies/<몸>/dir8.webp) + src/data/dir8.json + manifest.

  python3 tools/paint3d/atlas.py PNG_ROOT [--bodies m1,m2,f1,f2] [--quality 82]
  PNG_ROOT 안: png_<몸>/ (toon.py --size 160 --cel 1) — 그 옆 exr_<몸>/meta.json 에 오른손 자리가 있다.

- 장마다 투명한 둘레를 잘라 한 장(가로 1024)에 채워 넣는다. 좌표는 [x, y, w, h, 틀 속 x, y](160 틀).
- 지금 게임의 맨몸 앞모습(stand)과 발바닥 · 가운데가 맞게 통째로 옮긴다(키 · 서는 자리가 그대로).
- 오른손: 장마다 손 자리와 무기 종류(칼 · 활 · 지팡이)마다 [방향 x, y, 몸 앞이면 1].
- 무기 그림: 지금 몸 층(weapon_*)의 앞모습(stand) 조각에서 칼끝 · 칼머리 · 쥐는 자리를 잰다 — 게임이 그 조각을 손에 쥐여 그린다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = sys.argv[1:]
opt = lambda n, d: ARGS[ARGS.index(n) + 1] if n in ARGS else d
PNG_ROOT = ARGS[0]
BODIES = opt('--bodies', 'm1,m2,f1,f2').split(',')
QUALITY = int(opt('--quality', '76'))
# 한 장짜리 html 이 20MB 를 넘지 않게 장 수를 고른다 — 서기 1장 · 걷기 8장 · 달리기는 8장 가운데 한 장 걸러 4장
KEEP = {'idle': (int(opt('--idle', '1')), 1), 'walk': (99, int(opt('--walk-step', '1'))), 'run': (99, int(opt('--run-step', '2')))}
FRAME = 160
GRIP_AT = {'sword': 0.12, 'bow': 0.5, 'staff': 0.38}   # 칼머리(아래 끝)에서 칼끝 쪽으로 쥐는 자리

D = json.load(open(os.path.join(ROOT, 'src/data/bodies.json')))
MAN_PATH = os.path.join(ROOT, 'src/data/manifest.json')
man = json.load(open(MAN_PATH))
_layer = {}


def layer(body, k):
    if (body, k) not in _layer:
        _layer[(body, k)] = Image.open(os.path.join(ROOT, f'assets/bodies/{body}/{k}.webp')).convert('RGBA')
    return _layer[(body, k)]


def stand_piece(body, k):
    """그 층의 앞모습 조각 → (조각 그림, [x, y, w, h, ox, oy])"""
    r = D['bodies'][body]['layers'][k]['rects'].get('stand')
    if not r:
        return None, None
    x, y, w, h, ox, oy = r
    return layer(body, k).crop((x, y, x + w, y + h)), r


def bbox(a):
    ys, xs = np.nonzero(a)
    return xs.min(), xs.max(), ys.min(), ys.max()


def weapon_axis(img, ox, oy, kind):
    """조각의 알파로 긴 축(주성분)을 잡아 칼끝(위 끝) · 칼머리(아래 끝)를 틀 좌표로."""
    a = np.asarray(img)[..., 3] > 100
    ys, xs = np.nonzero(a)
    pts = np.stack([xs + 0.5, ys + 0.5], 1).astype(np.float64)
    c = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c, full_matrices=False)
    ax = vt[0]
    if ax[1] > 0:          # 위(−y)를 향하게
        ax = -ax
    t = (pts - c) @ ax
    tip = c + ax * t.max()
    pom = c + ax * t.min()
    grip = pom + (tip - pom) * GRIP_AT[kind]
    f = lambda p: [round(float(p[0] + ox), 2), round(float(p[1] + oy), 2)]
    return {'tip': f(tip), 'pommel': f(pom), 'grip': f(grip)}


out = {
    '_comment': 'tools/paint3d/atlas.py 가 만든다 — 손으로 고치지 말 것. 시안③(0.80.01) 맨몸 8방향 서기 · 걷기 · 달리기. '
                'frames: 이름(동작_장_방향) → [x, y, w, h, 160 틀 속 x, y]. hand: 이름 → [손 x, y, 칼 dx, dy, 앞, 활 dx, dy, 앞, 지팡이 dx, dy, 앞]. '
                'weapons: 층 이름 → 앞모습 조각의 칼끝 · 칼머리 · 쥐는 자리(160 틀 좌표).',
    'frame': FRAME,
    'yaws': [0, 45, 90, 135, 180, 225, 270, 315],
    'actions': {},
    'bodies': {},
}
total = 0
for b in BODIES:
    pdir = os.path.join(PNG_ROOT, f'png_{b}')
    meta = json.load(open(os.path.join(PNG_ROOT, f'exr_{b}', 'meta.json')))
    names, rename = [], {}
    acts = {}
    for n in sorted(meta['frames']):
        f = meta['frames'][n]
        lim, step = KEEP.get(f['action'], (99, 1))
        if f['k'] % step or f['k'] // step >= lim:
            continue
        kk = f['k'] // step
        new = f"{f['action']}_{kk}_{f['yaw']:03d}"
        names.append(n)
        rename[n] = new
        acts[f['action']] = max(acts.get(f['action'], 0), kk + 1)
    out['actions'] = acts
    # 지금 맨몸 앞모습과 맞춘다 — 발바닥(아래 끝) · 가운데
    base_img, br = stand_piece(b, 'base')
    old = np.zeros((FRAME, FRAME), bool)
    ba = np.asarray(base_img)[..., 3] > 100
    old[br[5]:br[5] + br[3], br[4]:br[4] + br[2]] = ba
    ox0, ox1, oy0, oy1 = bbox(old)
    ref = np.asarray(Image.open(os.path.join(pdir, 'idle_0_000.png')))[..., 3] > 100
    nx0, nx1, ny0, ny1 = bbox(ref)
    dx = int(round((ox0 + ox1) / 2 - (nx0 + nx1) / 2))
    dy = int(oy1 - ny1)
    print(b, 'old', (ox0, ox1, oy0, oy1), 'new', (nx0, nx1, ny0, ny1), 'shift', dx, dy)
    # 잘라 채우기(줄 단위)
    pieces = []
    for n in names:
        im = Image.open(os.path.join(pdir, n + '.png')).convert('RGBA')
        a = np.asarray(im)[..., 3] > 0
        x0, x1, y0, y1 = bbox(a)
        pieces.append((n, im.crop((x0, y0, x1 + 1, y1 + 1)), int(x0) + dx, int(y0) + dy))
    W = 1024
    order = sorted(range(len(pieces)), key=lambda i: -pieces[i][1].height)
    x = y = rowh = 0
    place = {}
    for i in order:
        n, im, fx, fy = pieces[i]
        if x + im.width + 1 > W:
            x, y, rowh = 0, y + rowh + 1, 0
        place[n] = (x, y)
        x += im.width + 1
        rowh = max(rowh, im.height)
    H = y + rowh
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for n, im, fx, fy in pieces:
        px, py = place[n]
        sheet.alpha_composite(im, (px, py))
        frames[rename[n]] = [px, py, im.width, im.height, fx, fy]
    dst = os.path.join(ROOT, f'assets/bodies/{b}/dir8.webp')
    sheet.save(dst, 'WEBP', quality=QUALITY, method=6)
    size = os.path.getsize(dst)
    total += size
    hand = {}
    for n in names:
        h = meta['frames'][n].get('hand')
        if not h:
            continue
        row = [round(h['at'][0] + dx, 1), round(h['at'][1] + dy, 1)]
        for kind in ('sword', 'bow', 'staff'):
            row += h[kind]
        hand[rename[n]] = row
    weapons = {}
    for k in D['bodies'][b]['layers']:
        if not k.startswith('weapon_'):
            continue
        kind = k.split('_')[1]
        if kind not in GRIP_AT:
            continue
        img, r = stand_piece(b, k)
        if img is None:
            continue
        weapons[k] = weapon_axis(img, r[4], r[5], kind)
    out['bodies'][b] = {'image': f'dir8:{b}', 'frames': frames, 'hand': hand, 'weapons': weapons}
    man[f'dir8:{b}'] = {'src': f'assets/bodies/{b}/dir8.webp', 'w': W, 'h': H, 'lazy': True,
                        'label': f'시안③ 맨몸 8방향 — {b}'}
    print(f'  {len(frames)}장 · {W}x{H} · {size // 1024}KB · 무기 {len(weapons)}')

json.dump(out, open(os.path.join(ROOT, 'src/data/dir8.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(man, open(MAN_PATH, 'w'), ensure_ascii=False, indent=2)
open(MAN_PATH, 'a').write('\n')
print(f'✓ dir8.json · manifest · 그림 {total // 1024}KB')
