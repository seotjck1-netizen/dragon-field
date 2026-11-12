"""
hero3d.py 가 남긴 자료 패스(EXR)를 **셀 음영 + 외곽선** 그림으로 바꾼다.

  bpyenv/bin/python toon.py IN_DIR OUT_DIR [--size 160]

- 밝음 · 그늘 두 단계(그늘은 살짝 보랏빛), 머리칼은 윤기 한 줄, 쇠는 세 단계 + 반짝임
- 선: 조각 경계(앞에 있는 조각의 둘레) · 깊이가 크게 끊긴 곳 · 바깥 윤곽(굵게)
- 4배로 그려서 줄인다(가장자리 매끈)
"""
import json
import os
import sys

import numpy as np
import OpenEXR
from PIL import Image

IN, OUT = sys.argv[1], sys.argv[2]
SIZE = int(sys.argv[sys.argv.index('--size') + 1]) if '--size' in sys.argv else 160
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(IN, 'meta.json')))
M = np.array(meta['cam_rot'])  # 카메라 국소 → 세계(행렬)
if np.allclose(M, np.eye(3)):  # 예전 굽기(행렬을 갱신 전에 적었다) — 고도에서 다시 만든다
    e = np.radians(90 - meta['elev'])
    M = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]])

L = np.array([-0.5, 0.62, 0.6])
L /= np.linalg.norm(L)
SHADOW_TINT = np.array([0.72, 0.69, 0.84])


def read(path):
    f = OpenEXR.File(path)
    ch = {}
    for p in f.parts:
        for k, v in p.channels.items():
            ch[k.replace('ViewLayer.', '')] = v.pixels
    return ch


def lin2srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def shift(a, dy, dx, fill):
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(dy, H), slice(0, H - dy)) if dy >= 0 else (slice(0, H + dy), slice(-dy, H))
    xs, xd = (slice(dx, W), slice(0, W - dx)) if dx >= 0 else (slice(0, W + dx), slice(-dx, W))
    out[ys, xs] = a[yd, xd]
    return out


def offsets(r):
    return [(dy, dx) for dy in range(-r, r + 1) for dx in range(-r, r + 1) if (dy or dx) and dy * dy + dx * dx <= r * r + 0.5]


def toon(path):
    ch = read(path)
    a = ch['Combined'][..., 3]
    alb = ch['Diffuse Color'][..., :3]
    nx, ny, nz = ch['Normal.X'], ch['Normal.Y'], ch['Normal.Z']
    idx = np.rint(ch['Object Index.X']).astype(np.int32)
    z = ch['Depth.Z']
    on = a > 0.5
    z = np.where(on, z, 1e9)
    idx = np.where(on, idx, 0)
    # 세계 법선 → 카메라 쪽 법선
    n = np.stack([nx, ny, nz], -1) @ M  # (H,W,3) · M = M^T n
    ndl = n @ L
    col = lin2srgb(alb)
    metal = (idx >= 800) & (idx < 900)
    flat = idx >= 900
    lit = ndl > 0.08
    shade = np.where(lit[..., None], 1.0, SHADOW_TINT)
    # 머리칼 — 윤기 한 줄(빛 쪽 가장 밝은 데)
    hairish = (col[..., 0] > col[..., 2] + 0.08) & (col.mean(-1) < 0.5) & ~metal & ~flat
    shade = np.where((hairish & (ndl > 0.78))[..., None], 1.18, shade)
    # 쇠 — 세 단계 + 반짝임
    mshade = np.where(ndl[..., None] > 0.6, 1.08, np.where(ndl[..., None] > 0.05, 0.86, SHADOW_TINT * 0.82))
    shade = np.where(metal[..., None], mshade, shade)
    spec = metal & (ndl > 0.93)
    # 살짝 가장자리 빛(뒤에서 오는 빛 — 몸이 둥글게 보이게)
    rim = (n[..., 2] < 0.28) & on & ~flat
    out = col * shade
    out = np.where(rim[..., None], out * 0.92 + 0.08 * np.array([1.0, 0.97, 0.92]), out)
    out = np.where(spec[..., None], 0.75 + 0.25 * out, out)
    out = np.where(flat[..., None], col, out)
    out = np.clip(out, 0, 1)

    H, W = a.shape
    line = np.zeros((H, W), bool)
    line_col = np.zeros((H, W, 3))
    # 안쪽 선 — 이 점 둘레에 **더 앞에 있는 다른 조각**이 있으면, 그 조각의 둘레다
    r_in = max(2, round(H / 320))
    for dy, dx in offsets(r_in):
        q_idx = shift(idx, dy, dx, 0)
        q_z = shift(z, dy, dx, 1e9)
        q_col = shift(col, dy, dx, 0.0)
        both_flat = (idx >= 900) & (q_idx >= 900)
        hit = on & (q_idx > 0) & (q_idx != idx) & (q_z < z - 0.02) & ~both_flat
        # 같은 조각 안에서도 깊이가 크게 끊기면(머리칼 겹침 · 팔이 몸 앞) 선
        hit |= on & (q_idx == idx) & (q_z < z - 0.45)
        new = hit & ~line
        line |= hit
        line_col[new] = q_col[new] * 0.38
    # 바깥 윤곽 — 몸 밖 둘레(굵게)
    r_out = max(3, round(H / 200))
    outer = np.zeros((H, W), bool)
    outer_col = np.zeros((H, W, 3))
    for dy, dx in offsets(r_out):
        q_on = shift(on, dy, dx, False)
        q_col = shift(col, dy, dx, 0.0)
        hit = ~on & q_on & ~outer
        outer |= hit
        outer_col[hit] = q_col[hit] * 0.3
    rgb = np.where(line[..., None], line_col, out)
    rgb = np.where(outer[..., None], outer_col, rgb)
    alpha = np.where(on | outer, 1.0, 0.0)
    # 줄이기(미리 곱한 알파로 평균)
    f = H // SIZE
    pre = np.concatenate([rgb * alpha[..., None], alpha[..., None]], -1)
    pre = pre[:SIZE * f, :SIZE * f].reshape(SIZE, f, SIZE, f, 4).mean((1, 3))
    al = pre[..., 3:4]
    rgb_s = np.where(al > 1e-4, pre[..., :3] / np.maximum(al, 1e-4), 0)
    img = np.concatenate([rgb_s, al], -1)
    return Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    names = sorted(meta['frames'])
    for i, name in enumerate(names):
        im = toon(os.path.join(IN, name + '.exr'))
        im.save(os.path.join(OUT, name + '.png'))
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    print('toon', len(names))
