"""갑옷 등급별 한 벌 — proj3d.py 에 넣을 그림 · 설정을 만든다 (0.80.27).

  python3 tools/paint3d/outfit.py WORK_DIR [--bodies m1,m2,f1,f2] [--tiers 0,1,2,3,4,dragon]

사용자 규칙(docs/CHARACTER-VIEWS.md): 장비는 **갑옷 등급별 한 벌 + 무기**. 한 벌 = 맨몸 + 갑옷 · 장화 · 장갑 · 어깨받이 · 띠 · 투구
(그 등급 층, 용린은 갑옷 · 투구 · 어깨만 용린이고 나머지는 4등급). 망토 · 목걸이는 넣지 않는다. 무기는 게임이 손에 쥐여 그린다(굽지 않는다).

WORK_DIR 에 남는 것 — 한 벌마다(o_<몸>_<등급>):
  o_<몸>_<등급>/front_160.png · back_160.png   지금 게임의 앞(stand) · 뒤(stand_b) 그대로(윤곽을 재는 그림)
  o_<몸>_<등급>/front_960.png · back_960.png   6배로 키운 것(입체에 입힐 바탕)
  o_<몸>_<등급>.json                            proj3d.py 설정

설정은 **맨몸 설정(tools/paint3d/<몸>.json, 원화 좌표)을 게임 그림 좌표(160 × 6)로 옮겨** 만든다 —
원화의 몸 윤곽과 게임 맨몸(stand)의 윤곽을 키 · 가운데로 맞춘 한 줄 변환. 그래서 키(3D 높이)가 맨몸 8방향과 같다.
갑옷이 부풀린 데(치맛자락 · 어깨)는 tools/paint3d/outfits.json 의 손질 값(몸 · 한 벌마다)을 얹는다.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ARGS = sys.argv[1:]
opt = lambda n, d: ARGS[ARGS.index(n) + 1] if n in ARGS else d
WORK = os.path.abspath(ARGS[0])
BODIES = opt('--bodies', 'm1,m2,f1,f2').split(',')
TIERS = opt('--tiers', '0,1,2,3,4,dragon').split(',')
UP = 6
D = json.load(open(os.path.join(ROOT, 'src/data/bodies.json')))
TUNE_PATH = os.path.join(os.path.dirname(__file__), 'outfits.json')
TUNE = json.load(open(TUNE_PATH)) if os.path.exists(TUNE_PATH) else {}
SLOTS = ('armor', 'boots', 'gloves', 'pads', 'belt', 'helmet')
_cache = {}


def outfit_keys(body, tier):
    layers = D['bodies'][body]['layers']
    return ['base'] + [f'{s}_{tier}' if f'{s}_{tier}' in layers else f'{s}_4' for s in SLOTS]


def layer_img(body, k):
    if (body, k) not in _cache:
        _cache[(body, k)] = Image.open(os.path.join(ROOT, f'assets/bodies/{body}/{k}.webp')).convert('RGBA')
    return _cache[(body, k)]


def compose(body, scene, keys):
    """BodyLook 과 같은 규칙으로 층을 겹친다."""
    size = D['scenes'][scene]
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    layers = D['bodies'][body]['layers']
    for k in keys:
        if k not in layers:
            continue
        r = layers[k]['rects'].get(scene) or layers[k]['rects'].get(D.get('sceneOf', {}).get(scene, ''))
        if not r:
            continue
        x, y, w, h, ox, oy = r
        im.alpha_composite(layer_img(body, k).crop((x, y, x + w, y + h)), (ox, oy))
    return im


def bbox(img, th=100):
    a = np.asarray(img)[..., 3] > th
    ys, xs = np.nonzero(a)
    return xs.min(), xs.max(), ys.min(), ys.max()


def _iou(a, b):
    return (a & b).sum() / max(1, (a | b).sum())


def _register(ref, base, step):
    """ref 윤곽을 s 배 해서 (dx, dy) 옮겼을 때 base 윤곽과 가장 겹치는 (s, dx, dy) — 거친 데서 고운 데로."""
    rx0, rx1, ry0, ry1 = bbox(ref)
    bx0, bx1, by0, by1 = bbox(base)
    s0 = (by1 - by0) / (ry1 - ry0)
    B = np.asarray(base)[..., 3] > 100
    A = np.asarray(ref)[..., 3] > 100
    best = (-1, s0, 0.0, 0.0)
    cand = [(s0 * (1 + k * 0.006), 0.0, 0.0) for k in range(-12, 13)]
    for rad in (12, 4, 1):
        scored = []
        for s, ddx, ddy in cand:
            w, h = max(1, round(A.shape[1] * s)), max(1, round(A.shape[0] * s))
            m = np.asarray(Image.fromarray(A.astype(np.uint8) * 255).resize((w, h), Image.BILINEAR)) > 127
            # 키를 맞춘 자리에서 시작
            x0 = (bx0 + bx1) / 2 - s * (rx0 + rx1) / 2 + ddx
            y0 = by0 - s * ry0 + ddy
            for dx in range(-rad, rad + 1, max(1, rad // 3)):
                for dy in range(-rad, rad + 1, max(1, rad // 3)):
                    X, Y = int(round(x0 + dx)), int(round(y0 + dy))
                    canvas = np.zeros_like(B)
                    xs, ys = max(0, X), max(0, Y)
                    xe, ye = min(B.shape[1], X + w), min(B.shape[0], Y + h)
                    if xe <= xs or ye <= ys:
                        continue
                    canvas[ys:ye, xs:xe] = m[ys - Y:ye - Y, xs - X:xe - X]
                    v = _iou(canvas, B)
                    scored.append((v, s, x0 + dx - ((bx0 + bx1) / 2 - s * (rx0 + rx1) / 2), y0 + dy - (by0 - s * ry0)))
        scored.sort(reverse=True)
        best = max(best, scored[0])
        cand = [(s, ddx, ddy) for _, s, ddx, ddy in scored[:3]]
        cand += [(s * 1.002, ddx, ddy) for _, s, ddx, ddy in scored[:1]] + [(s * 0.998, ddx, ddy) for _, s, ddx, ddy in scored[:1]]
    v, s, ddx, ddy = best
    return s, (bx0 + bx1) / 2 - s * (rx0 + rx1) / 2 + ddx, by0 - s * ry0 + ddy, v


def body_map(body):
    """원화(맨몸 설정의 좌표) → 게임 그림 × 6 좌표. 원화 윤곽을 게임 맨몸(stand) 윤곽에 가장 잘 겹치게 놓는 배율 · 자리."""
    naked = json.load(open(os.path.join(os.path.dirname(__file__), f'{body}.json')))
    ref = Image.open(os.path.join(ROOT, naked['front_mask'])).convert('RGBA')
    base = compose(body, 'stand', ['base']).resize((160 * UP, 160 * UP), Image.BICUBIC)
    # 1/4 로 줄여 맞춘 뒤 옮긴다(빠르게)
    q = 4
    small = lambda im: im.resize((im.width // q, im.height // q), Image.BILINEAR)
    s, X, Y, v = _register(small(ref), small(base), 1)
    fx = lambda x: q * X + s * x
    fy = lambda y: q * Y + s * y
    print(f'  {body}: 원화 → 게임 ×{s:.4f} · 겹침 {v:.3f}')
    return naked, s, fx, fy


def merge(dst, src):
    for k, v in src.items():
        if isinstance(v, dict) and isinstance(dst.get(k), dict):
            merge(dst[k], v)
        else:
            dst[k] = v


def make(body, tier):
    tag = f'o_{body}_{tier}'
    out = os.path.join(WORK, tag)
    os.makedirs(out, exist_ok=True)
    keys = outfit_keys(body, tier)
    for scene, side in (('stand', 'front'), ('stand_b', 'back')):
        im = compose(body, scene, keys)
        im.save(os.path.join(out, f'{side}_160.png'))
        im.resize((160 * UP, 160 * UP), Image.BICUBIC).save(os.path.join(out, f'{side}_960.png'))

    naked, s, fx, fy = body_map(body)
    R = lambda v: int(round(v))
    cuts = {}
    for k, v in naked['cuts'].items():
        if isinstance(v, list):                      # [[줄, 열], …]
            cuts[k] = [[R(fy(r)), R(fx(c))] for r, c in v]
        elif k.endswith(('_col_R', '_col_L')) or k in ('torso_l', 'torso_r', 'leg_lo'):
            cuts[k] = R(fx(v))
        else:
            cuts[k] = R(fy(v))
    front = Image.open(os.path.join(out, 'front_960.png'))
    ox0, ox1, oy0, oy1 = bbox(front)
    span = s * (naked['foot_y'] - naked['top_y'])    # 3D 키(맨몸과 같게)
    foot_y = max(fy(naked['foot_y']), oy1 + 1)
    cuts['head_top'] = R(min(oy0, fy(naked['top_y'])) - 2)
    cfg = {
        'front_mask': f'{{work}}/{tag}/front_160.png',
        'front_src': f'{{work}}/{tag}/front_960.png',
        'back_src': f'{{work}}/{tag}/back_960.png',
        'res': naked.get('res', 640), 'elev': naked.get('elev', 20), 'view': naked['view'],
        'cx': round(fx(naked['cx']), 1), 'foot_y': R(foot_y), 'top_y': R(foot_y - span),
        'height': naked.get('height', 5.9), 'cuts': cuts, 'depth': dict(naked['depth']),
        'actions': naked.get('actions', {'idle': 2, 'walk': 8, 'run': 8}),
        'erode': 7, 'smooth': naked.get('smooth', 2), 'clean': [9, 40, 6, 1],
        'hand_at': [R(fx(naked['hand_at'][0])), R(fy(naked['hand_at'][1]))],
        'foot_margin': naked.get('foot_margin', 0.4),
    }
    if naked.get('hair'):
        h = dict(naked['hair'])
        h['lock_from'], h['lock_to'] = R(fy(h['lock_from'])), R(fy(h['lock_to']))
        h['lock_gap'] = R(h['lock_gap'] * s)
        h['head_ramp'] = R(h['head_ramp'] * s)
        h['head_clip'] = [[R(fy(r)), R(fx(a)), R(fx(b))] for r, a, b in h['head_clip']]
        cfg['hair'] = h
    # 왼쪽(그림 오른쪽) 열이 없으면 오른쪽 열을 가운데로 뒤집은 값 — 손질이 왼쪽만 따로 옮길 수 있게 적어 둔다
    for k in ('sh_col', 'el_col', 'wr_col', 'leg_col'):
        if f'{k}_R' in cuts and f'{k}_L' not in cuts:
            cuts[f'{k}_L'] = R(2 * cfg['cx'] - cuts[f'{k}_R'])
    # 손질 — 몸 전체(예: "m1") 다음 그 한 벌("m1_2"). cuts 의 "+숫자" / "-숫자" 문자열은 옮긴 값에 더한다.
    for key in (body, f'{body}_{tier}'):
        t = json.loads(json.dumps(TUNE.get(key, {})))
        for k, v in list(t.get('cuts', {}).items()):
            if isinstance(v, str) and v[:1] in '+-':
                t['cuts'][k] = cfg['cuts'][k] + int(v)
        merge(cfg, t)
    # 투구 날개 · 뿔 — 머리 옆으로 떨어진 토막을 따로 세운다(proj3d.py head_side)
    cfg.setdefault('head_side', {'from': cfg['cuts']['head_top'], 'to': cfg['cuts']['chin'], 'depth': 0.45})
    json.dump(cfg, open(os.path.join(WORK, f'{tag}.json'), 'w'), ensure_ascii=False, indent=1)
    return tag, keys, s


if __name__ == '__main__':
    for b in BODIES:
        for t in TIERS:
            tag, keys, s = make(b, t)
            print(tag, f'×{s:.4f}', ' '.join(keys[1:]))
