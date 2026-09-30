#!/usr/bin/env python3
"""
접속 화면 타이틀 그림 (0.70.27) — 배경 · 용 · 로고 · 영웅 셋.

  python3 tools/title-art.py            # 전부
  python3 tools/title-art.py bg dragon  # 고른 것만 (bg · dragon · logo · heroes)

만드는 것 (assets/ui/title/):
  bg_wide.webp   1920×1080  가로 화면 배경 — 달 · 구름 · 산맥 · 성 · 앞 언덕
  bg_tall.webp   1080×1920  세로 화면 배경 — 같은 풍경을 세로로 다시 짠 것(잘라 쓴 것이 아니다)
  dragon.webp    달을 가로지르는 용 그림자(따로 떠서 천천히 난다)
  logo.webp      금빛 "드래곤 필드" + DRAGON FIELD (tools/title-logo.js 가 크로미움으로 굽는다)
  heroes.webp    용사 · 사냥꾼 · 마법사 — art/reference/*_ref_cut.png 를 줄여 한 줄로 세운 것

── 왜 사진처럼 한 장을 그리지 않고 겹으로 나눴나 ──────────────
  화면 비율이 폰(세로)부터 넓은 모니터까지 제각각이다. 한 장에 다 그려 넣으면
  어느 화면에서는 영웅이 접속 창 뒤에 숨고, 어느 화면에서는 로고가 달 위에 얹혀 안 읽힌다.
  그래서 배경(풍경)만 가로·세로 두 벌로 굽고, 로고 · 영웅 · 용은 화면에서 제자리를 잡게 따로 둔다.

그림은 전부 이 파일이 **숫자로** 만든다(외부 그림 없음). 영웅만 사용자가 준 참고 그림을 쓴다.
"""
import math
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui', 'title')
PREVIEW = os.path.join(ROOT, 'art', 'preview')


# ───────────────────────── 잡음 ─────────────────────────
def fbm(h, w, cells, octaves=5, seed=0, gain=0.5, aspect=1.0):
    """부드러운 프랙탈 잡음 0~1. cells = 가장 굵은 결의 칸 수(세로), aspect>1 이면 가로로 늘어난 결."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gh = max(2, int(cells * 2 ** o))
        gw = max(2, int(gh * w / h / aspect))
        grid = rng.random((gh + 3, gw + 3)).astype(np.float32)
        up = cv2.resize(grid, (w + int(w * 3 / gw) + 1, h + int(h * 3 / gh) + 1), interpolation=cv2.INTER_CUBIC)
        oy, ox = int(h * 1.5 / gh), int(w * 1.5 / gw)
        out += amp * up[oy:oy + h, ox:ox + w]
        tot += amp
        amp *= gain
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo + 1e-6), 0, 1)


def ridge(w, base, amp, seed, octaves=7, rough=0.52, cells=3, jag=0.45):
    """산 능선 — x 마다 높이(y). base 에서 amp 만큼 오르내린다.
    굵은 결(봉우리 몇 개)은 부드러운 잡음, 잔 결은 중점 변위로 톱날처럼 — 산은 둥글지 않다."""
    rng = np.random.default_rng(seed)
    x = np.arange(w, dtype=np.float32)
    n = cells + 3
    pts = rng.random(n).astype(np.float32)
    big = cv2.resize(pts[None, :], (w, 1), interpolation=cv2.INTER_CUBIC)[0]
    big = (big - big.min()) / (big.max() - big.min() + 1e-6)
    # 중점 변위
    size = 1
    while size < w:
        size *= 2
    d = np.zeros(size + 1, np.float32)
    step, a = size, 1.0
    while step > 1:
        half = step // 2
        mids = (d[0:size:step] + d[step:size + 1:step]) / 2
        d[half:size:step] = mids + rng.normal(0, a, mids.shape).astype(np.float32)
        step, a = half, a * rough
    d = d[:w]
    d = (d - d.mean()) / (d.std() + 1e-6)
    y = base - amp * (big ** 1.4 * (1 - jag) + (d * 0.18 + 0.5) * jag)
    return y


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def over(dst, color, alpha):
    """dst(H,W,3) 위에 색(색 하나 또는 H,W,3)을 alpha(H,W) 만큼 덮는다."""
    a = alpha[..., None]
    dst *= (1 - a)
    dst += np.asarray(color, np.float32) * a
    return dst


def poly_mask(h, w, polys, ss=4):
    """다각형들 → 부드러운 가장자리 가림막(0~1). ss 배로 크게 그려 줄인다."""
    im = Image.new('L', (w * ss, h * ss), 0)
    d = ImageDraw.Draw(im)
    for p in polys:
        d.polygon([(x * ss, y * ss) for x, y in p], fill=255)
    im = im.resize((w, h), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255


def blur(a, r):
    if r <= 0:
        return a
    k = int(r * 3) | 1
    return cv2.GaussianBlur(a, (k, k), r)


# ───────────────────────── 성 ─────────────────────────
def castle_polys(cx, by, s):
    """성 그림자 — 가운데 탑 · 양옆 탑 · 성벽. (cx, by) 가 밑동 가운데, s 는 크기.
    돌려주는 것: (다각형 목록, 창 불빛 목록[(x,y,w,h)])"""
    P = []
    win = []

    def rect(x0, y0, x1, y1):
        P.append([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def crenel(x0, x1, y, h, n):
        step = (x1 - x0) / (2 * n - 1)
        for i in range(n):
            a = x0 + i * 2 * step
            rect(a, y - h, a + step, y + 1)

    def tower(x, w, top, roof, flag=False):
        rect(x - w / 2, top, x + w / 2, by)
        # 뾰족 지붕 — 살짝 처마가 나온다
        P.append([(x - w / 2 - w * 0.12, top + 1), (x, top - roof), (x + w / 2 + w * 0.12, top + 1)])
        if flag:
            P.append([(x - 0.6 * s, top - roof - 1), (x + 0.6 * s, top - roof - 1),
                      (x + 0.6 * s, top - roof - 14 * s), (x - 0.6 * s, top - roof - 14 * s)])
            P.append([(x + 0.6 * s, top - roof - 13.5 * s), (x + 9 * s, top - roof - 11 * s),
                      (x + 0.6 * s, top - roof - 8.5 * s)])

    # 성벽
    rect(cx - 150 * s, by - 46 * s, cx + 150 * s, by)
    crenel(cx - 150 * s, cx + 150 * s, by - 46 * s, 7 * s, 17)
    # 안쪽 높은 벽
    rect(cx - 70 * s, by - 92 * s, cx + 76 * s, by)
    crenel(cx - 70 * s, cx + 76 * s, by - 92 * s, 7 * s, 9)
    # 탑들: (x, 너비, 꼭대기, 지붕 높이)
    tower(cx - 150 * s, 30 * s, by - 88 * s, 34 * s)
    tower(cx + 150 * s, 30 * s, by - 80 * s, 32 * s)
    tower(cx - 92 * s, 26 * s, by - 132 * s, 40 * s)
    tower(cx + 100 * s, 28 * s, by - 124 * s, 38 * s)
    # 본성(가장 높은 탑)
    tower(cx + 6 * s, 46 * s, by - 186 * s, 70 * s, flag=True)
    tower(cx - 36 * s, 22 * s, by - 156 * s, 44 * s)
    tower(cx + 44 * s, 20 * s, by - 150 * s, 40 * s)
    # 창 — 높은 탑들에 몇 개씩
    for (x, y) in [(-150, -70), (150, -62), (-92, -110), (-92, -88), (100, -104), (100, -80),
                   (6, -168), (6, -140), (-4, -112), (16, -112), (-36, -136), (44, -130),
                   (-40, -70), (-10, -70), (22, -70), (52, -70), (-120, -30), (120, -30)]:
        win.append((cx + x * s, by + y * s, 3.2 * s, 6.5 * s))
    return P, win


# ───────────────────────── 배경 ─────────────────────────
LAYOUTS = {
    # 비율은 화면 가로·세로에 대한 몫.
    # 가로: 접속 창이 오른쪽 ⅓ 을 덮는다. 왼쪽 ⅔ 가운데(0.36)에 영웅이 서고, 그 뒤로 큰 달이 떠오른다.
    #       로고는 달 위 어두운 하늘에 — 달 앞에 금빛 글자를 얹으면 안 읽힌다.
    # 세로: 로고가 맨 위, 그 아래 달과 영웅, 접속 창은 아래쪽.
    'wide': dict(W=1920, H=1080, moon=(0.36, 0.49), moon_r=0.175, horizon=0.64,
                 castle=(0.07, 0.43), castle_s=0.8, glow=(0.66, 0.64),
                 hill=dict(left=0.86, right=0.86, amp=0.05, mound=0.36)),
    'tall': dict(W=1080, H=1920, moon=(0.5, 0.30), moon_r=0.28, horizon=0.43,
                 castle=(0.12, 0.33), castle_s=0.55, glow=(0.78, 0.43),
                 hill=dict(left=0.53, right=0.55, amp=0.02, mound=0.5)),
}


def sky(W, H, L):
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    hz = L['horizon']
    # 위 → 아래: 깊은 남색 → 푸른 보라 → 지평선 근처 불빛에 물든 자줏빛
    stops = [
        (0.00, (3, 5, 16)),
        (0.35 * hz, (10, 15, 40)),
        (0.70 * hz, (24, 28, 66)),
        (0.90 * hz, (56, 42, 84)),
        (hz, (120, 66, 70)),
        (1.00, (40, 26, 44)),
    ]
    img = np.zeros((H, W, 3), np.float32)
    ys = np.array([s[0] for s in stops], np.float32)
    for c in range(3):
        img[..., c] = np.interp(y, ys, [s[1][c] for s in stops]).astype(np.float32)
    # 지평선 불빛 — 먼 들판을 태우는 용의 불길(왼쪽 가운데). 달의 찬빛과 맞서는 따뜻한 빛.
    gx, gy = L['glow'][0] * W, L['glow'][1] * H
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    d = ((xx - gx) / (W * 0.42)) ** 2 + ((yy - gy) / (H * 0.13)) ** 2
    img += np.exp(-d)[..., None] * np.array([170, 72, 20], np.float32)
    d2 = ((xx - gx) / (W * 0.9)) ** 2 + ((yy - gy) / (H * 0.32)) ** 2
    img += np.exp(-d2)[..., None] * np.array([46, 18, 18], np.float32)
    return img, xx, yy


def stars(img, W, H, L, mo=None, seed=3):
    rng = np.random.default_rng(seed)
    n = int(W * H / 650)
    xs = rng.random(n) * W
    ys = (rng.random(n) ** 1.5) * H * L['horizon'] * 0.95
    mag = rng.random(n) ** 7
    layer = np.zeros((H, W), np.float32)
    for x, y, m in zip(xs, ys, mag):
        layer[int(y), int(x)] += 0.22 + 1.8 * m
    xx, yy = np.meshgrid(np.linspace(0, 1, W, dtype=np.float32), np.linspace(0, 1, H, dtype=np.float32))
    # 은하수 — 비스듬한 흐린 띠
    slope = 0.42 if W > H else 0.9
    band = np.exp(-(((yy * H) - (0.02 * H + (1 - xx) * W * slope * 0.5)) / (H * 0.08)) ** 2).astype(np.float32)
    band *= fbm(H, W, 3, 6, seed + 1, aspect=2) ** 1.6
    band *= smooth(1 - yy / L['horizon'])
    m2 = rng.random((H, W)).astype(np.float32)
    layer += (m2 > 0.996) * band * 0.8
    fade = smooth((L['horizon'] - yy) / (L['horizon'] * 0.35))
    if mo is not None:
        mx, my, r = mo
        dm = np.sqrt((xx * W - mx) ** 2 + (yy * H - my) ** 2)
        fade *= smooth((dm - r * 1.1) / (r * 2.2))  # 달빛이 둘레의 별을 지운다
    core = cv2.GaussianBlur(layer, (3, 3), 0.55)
    halo = cv2.GaussianBlur(layer, (0, 0), 2.0) * 0.7
    s = (core * 0.9 + halo) * fade
    img += s[..., None] * np.array([225, 232, 255], np.float32)
    img += (band * 22 * fade)[..., None] * np.array([0.75, 0.8, 1.0], np.float32)
    return img


def moon_pos(W, H, L):
    mx, my = L['moon'][0] * W, L['moon'][1] * H
    r = L['moon_r'] * min(W, H)
    return mx, my, r


def moon(img, xx, yy, W, H, L):
    mx, my, r = moon_pos(W, H, L)
    d = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
    # 달무리 — 가까운 곳은 희고, 멀어질수록 푸르게 번진다
    img += np.exp(-np.maximum(d - r, 0) / (r * 0.28))[..., None] * np.array([90, 96, 118], np.float32)
    img += np.exp(-np.maximum(d - r, 0) / (r * 1.4))[..., None] * np.array([38, 50, 92], np.float32)
    img += np.exp(-np.maximum(d - r, 0) / (r * 4.5))[..., None] * np.array([14, 20, 48], np.float32)
    # 달 표면 — 바다(어두운 얼룩) · 잔 무늬 · 가장자리 어둡게
    size = int(r * 2) + 4
    tex = fbm(size, size, 2.2, 6, 11)
    mar = smooth((fbm(size, size, 1.5, 4, 12) - 0.5) * 3.2)
    crater = fbm(size, size, 14, 3, 13)
    t = 0.97 - 0.2 * mar + 0.06 * (tex - 0.5) + 0.05 * (crater - 0.5)
    face = np.zeros((H, W), np.float32)
    x0, y0 = int(mx - size / 2), int(my - size / 2)
    ys0, xs0 = max(0, y0), max(0, x0)
    ys1, xs1 = min(H, y0 + size), min(W, x0 + size)
    face[ys0:ys1, xs0:xs1] = t[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
    limb = np.sqrt(np.clip(1 - (d / r) ** 2, 0, 1))
    shade = face * (0.8 + 0.2 * limb)
    a = np.clip((r - d) + 0.5, 0, 1)
    col = np.stack([shade * 252, shade * 250, shade * 242], -1)
    over(img, col, a)
    return img, (mx, my, r)


def clouds(img, xx, yy, W, H, L, mo, seed=31, front=False):
    """구름 — 달 둘레에 흩어진 조각구름. 달 쪽 가장자리는 은빛, 아래는 불빛에 물든다."""
    mx, my, r = mo
    hz = L['horizon'] * H
    n = fbm(H, W, 2.6, 7, seed, aspect=3.0, gain=0.55)
    if not front:
        rows = [(H * 0.10, H * 0.028, 0.7), (H * 0.2, H * 0.03, 0.6),
                (hz - H * 0.12, H * 0.04, 0.95), (my - r * 1.15, H * 0.022, 0.55)]
    else:
        rows = [(my + r * 0.42, r * 0.045, 0.75)]
    band = np.zeros((H, W), np.float32)
    for cy, sd, k in rows:
        # 띠의 높이가 가로로 조금씩 흔들린다
        wob = noise1(W, 3, abs(int(cy)) + seed) * sd * 2.4
        band = np.maximum(band, k * np.exp(-((yy - cy - wob[None, :]) / sd) ** 2))
    dens = smooth((n - 0.62 + band * 0.42) * 4.2) * np.clip(band * 1.6, 0, 1)
    dm0 = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
    if front:
        dens *= np.clip(1 - np.abs(xx - mx) / (r * 2.2), 0, 1)
    else:
        # 뒤 구름 띠는 달 면을 비껴간다 — 달이 흐리면 화면 전체가 흐려 보인다
        dens *= 0.15 + 0.85 * smooth((dm0 - r * 0.9) / (r * 0.5))
    # 빛: 윗가장자리(달 쪽)는 밝고 안쪽·아래는 어둡다
    below = np.clip(dens - np.roll(dens, -6, axis=0), 0, 1)  # 위쪽 테
    dm = np.sqrt((xx - mx) ** 2 + (yy - my) ** 2)
    moonlit = np.exp(-dm / (r * 3.2))
    gx, gy = L['glow'][0] * W, L['glow'][1] * H
    fire = np.exp(-(((xx - gx) / (W * 0.45)) ** 2 + ((yy - gy) / (H * 0.18)) ** 2))
    base = np.array([22, 26, 54], np.float32)
    lit = np.array([200, 208, 236], np.float32)
    warm = np.array([210, 104, 52], np.float32)
    k = (0.08 + 0.7 * moonlit + below * 0.9 * (0.3 + moonlit))[..., None]
    col = base * (1 - np.clip(k, 0, 1)) + lit * np.clip(k, 0, 1)
    col = col + (fire * 0.75 * (1 - moonlit))[..., None] * (warm - base)
    over(img, col, dens * (0.92 if not front else 0.45))
    return img


def noise1(w, cells, seed, octaves=4):
    """1줄짜리 부드러운 잡음 -0.5~0.5."""
    rng = np.random.default_rng(seed)
    x = np.arange(w, dtype=np.float32)
    out = np.zeros(w, np.float32)
    a, tot = 1.0, 0.0
    for o in range(octaves):
        n = int(cells * 2 ** o) + 4
        pts = rng.random(n).astype(np.float32)
        out += a * cv2.resize(pts[None, :], (w, 1), interpolation=cv2.INTER_CUBIC)[0]
        tot += a
        a *= 0.5
    out /= tot
    return out - out.mean()


def peaks_ridge(W, base, amp, seed, n, jag, sc):
    """봉우리 n 개를 세우고(좌우 비탈 기울기가 다르다) 가장 높은 것을 고른다 + 잔 톱니.
    돌려주는 것: 능선 y, 봉우리 목록[(x, y꼭대기)], 기둥마다 주인 봉우리 번호."""
    rng = np.random.default_rng(seed)
    x = np.arange(W, dtype=np.float32)
    xs = (np.arange(n) + 0.5 + rng.uniform(-0.35, 0.35, n)) * W / n
    hs = amp * (0.45 + 0.55 * rng.random(n))
    best = np.full(W, -1e9, np.float32)
    owner = np.zeros(W, np.int32)
    for k in range(n):
        sl, sr = rng.uniform(0.6, 1.5), rng.uniform(0.6, 1.5)
        dxk = np.abs(x - xs[k])
        # 꼭대기는 뾰족하고 아래로 갈수록 비탈이 눕는다(오목한 비탈) — 곧은 삼각형은 종이 오린 것 같다
        prof = hs[k] - np.where(x < xs[k], dxk * sl, dxk * sr) * (1.25 - 0.45 * np.clip(dxk / (amp * 1.6), 0, 1))
        prof += noise1(W, 5, seed * 7 + k, 3) * amp * 0.45
        better = prof > best
        owner[better] = k
        best = np.maximum(best, prof)
    # 잔 톱니 — 중점 변위
    d = ridge(W, 0, 1, seed + 99, cells=n * 2, jag=1.0)
    y = base - best - d * jag * sc
    tops = [(float(xs[k]), float(base - hs[k])) for k in range(n)]
    return y, tops, owner, xs


def mountains(img, xx, yy, W, H, L, mo):
    """산맥 셋 — 멀수록 푸르고 흐리다. 봉우리마다 달 쪽 비탈은 밝고 반대쪽은 그늘, 꼭대기엔 눈."""
    mx, my, r = mo
    hz = L['horizon'] * H
    gx = L['glow'][0] * W
    sc = H / 1080 if W > H else W / 1080 * 0.95
    lx = 1.0 if mx > W * 0.5 else -1.0
    layers = [
        # (능선 기준, 봉우리 높이, 색(밝은 면), 그늘 색, 안개, 씨앗, 봉우리 수, 눈)
        (hz + 10 * sc, 250 * sc, (58, 60, 104), (32, 32, 68), 0.5, 41, int(6 * W / 1920 + 2), True),
        (hz + 64 * sc, 160 * sc, (38, 38, 74), (18, 17, 42), 0.45, 47, int(8 * W / 1920 + 2), True),
    ]
    out = []
    for i, (base, amp, lit_c, dark_c, fog, seed, n, snow) in enumerate(layers):
        y, tops, owner, xs = peaks_ridge(W, base, amp, seed, n, 24 * (1 - i * 0.2), sc)
        m = np.clip(yy - y[None, :] + 0.5, 0, 1)
        below = np.clip(yy - y[None, :], 0, None)
        # 봉우리의 등줄기: 꼭대기에서 아래로 내려오며 흔들리는 선. 달 쪽이 밝은 면.
        px = xs[owner][None, :]
        wob = noise1(H, 6, seed + 5, 4)[:, None] * 90 * sc + noise1(H, 20, seed + 6, 3)[:, None] * 20 * sc
        spine = px + wob * np.clip(below / (amp + 1), 0, 1) + below * 0.25 * lx * 0
        side = np.where((xx - spine) * lx > 0, 1.0, 0.0)
        side = blur(side.astype(np.float32), 1.2)
        # 아래로 내려갈수록 밝은 면 · 그늘 면의 구분이 흐려진다(세로 줄무늬가 생기지 않게)
        fade_s = np.exp(-below / (amp * 0.9 + 1))
        side = 0.5 + (side - 0.5) * fade_s
        # 골짜기 결 — 비탈을 따라 내려가는 줄
        gul = fbm(H, W, 10, 4, seed + 7, aspect=0.45)
        tone = side[..., None] * np.array(lit_c, np.float32) + (1 - side[..., None]) * np.array(dark_c, np.float32)
        tone = tone * (0.85 + 0.3 * gul[..., None])
        if snow:
            rel = np.clip((base - y) / amp, 0, 1)[None, :]
            depth_s = (4 + 46 * rel ** 2) * sc * (0.3 + 1.2 * gul ** 1.5)
            cap = smooth((depth_s - below) / (5 * sc)) * smooth(rel * 2.4 - 0.5)
            snowc = side[..., None] * np.array([170, 180, 222], np.float32) + (1 - side[..., None]) * np.array([66, 72, 124], np.float32)
            k = (cap * (1 - i * 0.3))[..., None]
            tone = tone * (1 - k) + snowc * k
        # 지평선 불빛이 능선을 물들인다
        fire = np.exp(-((xx - gx) / (W * 0.42)) ** 2) * np.exp(-below / (H * 0.035))
        tone = tone + (fire * 100 * (1 - i * 0.25))[..., None] * np.array([1.0, 0.42, 0.14], np.float32)
        # 아래로 갈수록 안개
        fogc = np.array([40, 34, 70], np.float32) * (1 - i * 0.25) \
            + np.exp(-((xx - gx) / (W * 0.5)) ** 2)[..., None] * np.array([34, 12, 4], np.float32) * (1 - i * 0.3)
        fa = smooth(below / (H * 0.2) * 1.2) * fog
        tone = tone * (1 - fa[..., None]) + fogc * fa[..., None]
        over(img, tone * 0.88, m)
        out.append(y)
        # 층 사이 낮게 깔린 안개 띠
        mist = np.exp(-((yy - (base + 10 * sc)) / (H * 0.03)) ** 2) * fbm(H, W, 2, 5, seed + 9, aspect=5)
        over(img, np.array([96, 82, 124], np.float32), smooth(mist * 1.4 - 0.2) * 0.65)
    return img, out


def forest(img, xx, yy, W, H, L, mo):
    """산 앞의 전나무 숲 — 낮게 구르는 언덕 위로 뾰족한 나무 그림자가 빼곡하다.
    맨 앞 산을 삼각형 하나 더 겹치는 것보다 거리감이 훨씬 잘 산다."""
    mx, my, r = mo
    hz = L['horizon'] * H
    sc = H / 1080 if W > H else W / 1080 * 0.95
    rng = np.random.default_rng(71)
    x = np.arange(W, dtype=np.float32)
    ground = hz + 104 * sc + noise1(W, 4, 72, 4) * 80 * sc
    polys = [list(zip(x, ground)) + [(W, H), (0, H)]]
    px = 0.0
    while px < W:
        step = rng.uniform(5, 13) * sc
        px += step
        gy = float(np.interp(px, x, ground)) + 4 * sc
        h = rng.uniform(34, 84) * sc * (0.7 + 0.6 * rng.random() ** 2)
        w = h * rng.uniform(0.26, 0.36)
        # 전나무: 가지 층 세 개(아래가 넓다)
        tiers = 3
        for k in range(tiers):
            t0 = k / tiers
            yb = gy - h * (t0 * 0.8)
            yt = gy - h * (0.45 + t0 * 0.55) if k < tiers - 1 else gy - h
            ww = w * (1 - t0 * 0.45)
            polys.append([(px - ww, yb), (px, yt), (px + ww, yb)])
        polys.append([(px - 1.2 * sc, gy), (px - 1.2 * sc, gy + 6 * sc), (px + 1.2 * sc, gy + 6 * sc), (px + 1.2 * sc, gy)])
    m = poly_mask(H, W, polys, ss=2)
    depth = np.clip((yy - ground[None, :]) / (H * 0.15), 0, 1)
    col = np.array([16, 15, 34], np.float32)[None, None, :] * (1 - 0.4 * depth[..., None])
    over(img, col, m)
    # 달 쪽 가장자리 · 불빛 쪽 가장자리
    lx = 3 if mx > W * 0.5 else -3
    rim = np.clip(m - np.roll(np.roll(blur(m, 1.0), 2, axis=0), lx, axis=1), 0, 1)
    dmoon = np.exp(-np.abs(xx - mx) / (W * 0.3))
    gx = L['glow'][0] * W
    fire = np.exp(-((xx - gx) / (W * 0.3)) ** 2)
    img += (rim * 70 * dmoon)[..., None] * np.array([0.7, 0.8, 1.0], np.float32)
    img += (rim * 80 * fire)[..., None] * np.array([1.0, 0.45, 0.18], np.float32)
    # 숲 사이로 깔린 안개
    mist = np.exp(-((yy - (ground[None, :] - 8 * sc)) / (22 * sc)) ** 2) * fbm(H, W, 2, 5, 73, aspect=5)
    over(img, np.array([84, 72, 118], np.float32), smooth(mist * 1.5 - 0.25) * 0.5)
    return img


def castle(img, xx, yy, W, H, L, mo):
    cx = L['castle'][0] * W
    s = L['castle_s'] * (W / 1920 if W > H else W / 1080)
    by = L['castle'][1] * H
    polys, wins = castle_polys(cx, by, s)
    # 성을 받치는 바위 봉우리 — 꼭대기는 성벽 폭만큼, 아래로 내려가며 제멋대로 넓어진다.
    # 층층이 고른 계단은 사람이 쌓은 탑처럼 보인다 — 폭이 늘어나는 빠르기를 구간마다 바꾸고,
    # 가장자리에 크고 작은 들쭉날쭉을 겹친다.
    rng = np.random.default_rng(55)
    top_y = by + 3 * s
    ys = np.linspace(top_y, H * 1.05, 70)
    t = (ys - top_y) / (H * 1.05 - top_y)

    def edge(seed, spread):
        r_ = np.random.default_rng(seed)
        # 구간마다 다른 기울기(바위가 떨어져 나간 자리)
        knots = np.sort(r_.random(6))
        slopes = r_.uniform(0.2, 1.6, 7)
        g = np.zeros_like(t)
        for j, tt in enumerate(t):
            k = np.searchsorted(knots, tt)
            g[j] = slopes[k]
        w = np.cumsum(g) / np.sum(g) * spread
        w = w + noise1(len(t), 6, seed + 1, 4) * 110 * s * np.sqrt(t) + r_.normal(0, 7 * s, len(t)) * np.sqrt(t)
        return 160 * s + np.maximum(w, 0)
    rw = edge(61, 380 * s)
    lw = edge(62, 420 * s)
    right_side = [(cx + w, y) for w, y in zip(rw, ys)]
    left_side = [(cx - w, y) for w, y in zip(lw, ys)]
    cliff = [(cx - 160 * s, top_y), (cx + 160 * s, top_y)] + right_side + left_side[::-1]
    mc = poly_mask(H, W, [cliff])
    mk = poly_mask(H, W, polys)
    # 절벽 바위결 — 세로로 갈라진 면, 달 쪽 면이 밝다
    det = fbm(H, W, 10, 5, 57, aspect=0.4) * 30 * s
    gy_, gx_ = np.gradient(det)
    lx = 1.0 if mo[0] > cx else -1.0
    light = np.clip(gx_ * lx * 1.2, -1, 1)
    depth = np.clip((yy - by) / (H * 0.35), 0, 1)
    rock = np.array([19, 18, 38], np.float32)[None, None, :] * (1 + 0.6 * light[..., None]) * (1 - 0.4 * depth[..., None])
    over(img, rock, mc)
    col = np.array([12, 11, 26], np.float32)
    over(img, col, mk)
    m = np.clip(mc + mk, 0, 1)
    # 달 쪽 가장자리 테
    sh = int(max(2, 3 * s)) * (1 if mo[0] > cx else -1)
    rim = np.clip(m - np.roll(np.roll(blur(m, 1.2), sh, axis=1), 2, axis=0), 0, 1)
    img += (rim * 70)[..., None] * np.array([0.72, 0.82, 1.0], np.float32)
    # 창 불빛
    im = Image.new('L', (W * 2, H * 2), 0)
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(9)
    for (x, y, w, h) in wins:
        if rng.random() < 0.18:
            continue
        d.rounded_rectangle([(x - w / 2) * 2, (y - h / 2) * 2, (x + w / 2) * 2, (y + h / 2) * 2], radius=w, fill=255)
    wl = np.asarray(im.resize((W, H), Image.LANCZOS), np.float32) / 255
    img += (wl * 255)[..., None] * np.array([1.0, 0.78, 0.4], np.float32)
    img += (blur(wl, 5 * s) * 240)[..., None] * np.array([1.0, 0.55, 0.2], np.float32)
    # 성 발치를 감는 안개
    mist = np.exp(-((yy - (by + 150 * s)) / (40 * s)) ** 2) * np.exp(-((xx - cx) / (420 * s)) ** 2)
    mist *= fbm(H, W, 3, 5, 77, aspect=4)
    over(img, np.array([80, 72, 118], np.float32), smooth(mist * 1.5 - 0.2) * 0.5)
    return img


def hill(img, xx, yy, W, H, L, mo):
    """맨 앞 언덕 — 영웅들이 서는 자리. 풀잎 그림자와 달빛 테두리."""
    mx, my, r = mo
    h = L['hill']
    x = np.arange(W, dtype=np.float32)
    t = x / W
    base = H * (h['left'] + (h['right'] - h['left']) * smooth(t)) \
        - H * h['amp'] * np.exp(-((t - h['mound']) / 0.22) ** 2)
    y = base + ridge(W, 0, H * 0.012, 91, cells=6)
    # 풀잎 — 능선을 따라 촘촘한 뾰족 잎
    rng = np.random.default_rng(92)
    blades = []
    for i in range(int(W * 1.6)):
        bx = rng.random() * W
        by = np.interp(bx, x, y) + 2
        bh = (4 + rng.random() ** 2 * 18) * (H / 1080)
        lean = rng.normal(0, 0.35) * bh
        bw = 1.2 + rng.random() * 1.6
        blades.append([(bx - bw, by), (bx + lean, by - bh), (bx + bw, by)])
    m = poly_mask(H, W, [list(zip(x, y)) + [(W, H), (0, H)]] + blades, ss=2)
    depth = np.clip((yy - y[None, :]) / (H * 0.18), 0, 1)
    tex = fbm(H, W, 10, 4, 93, aspect=2.5)
    col = np.array([13, 16, 30], np.float32)[None, None, :] * (0.8 + 0.4 * tex[..., None]) * (1 - 0.5 * depth[..., None])
    over(img, col, m)
    # 달빛 테두리 — 능선 바로 아래 얇게
    rim = np.clip(m - np.roll(blur(m, 1.2), 3, axis=0), 0, 1)
    img += (rim * 90)[..., None] * np.array([0.75, 0.85, 1.0], np.float32)
    # 지평선 불빛이 왼쪽 가장자리를 데운다
    gx = L['glow'][0] * W
    img += (rim * 60 * np.exp(-((xx - gx) / (W * 0.4)) ** 2))[..., None] * np.array([1.0, 0.5, 0.2], np.float32)
    return img, y


def embers(img, W, H, L, seed=101):
    """떠오르는 불티(정지 화면용 — 움직이는 불티는 화면에서 따로 그린다)."""
    rng = np.random.default_rng(seed)
    layer = np.zeros((H, W), np.float32)
    gx, gy = L['glow'][0] * W, L['glow'][1] * H
    for i in range(int(W * H / 26000)):
        x = rng.normal(gx, W * 0.28)
        y = gy - abs(rng.normal(0, H * 0.35))
        if not (0 <= x < W and 0 <= y < H):
            continue
        cv2.circle(layer, (int(x), int(y)), int(1 + rng.random() * 1.5), 0.4 + rng.random() * 0.8, -1, cv2.LINE_AA)
    glow = blur(layer, 3) * 2.2 + layer
    img += glow[..., None] * np.array([255, 150, 60], np.float32)
    return img


def vignette(img, xx, yy, W, H):
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.45) / (H * 0.7)) ** 2)
    v = 1 - smooth((d - 0.55) * 1.4) * 0.55
    img *= v[..., None]
    return img


def grade(img):
    """색 보정 — 어두운 곳은 푸르게, 밝은 곳은 금빛으로(영화 포스터의 청록·주황 대비)."""
    x = np.clip(img / 255, 0, None)
    x = x / (1 + x * 0.22) * 1.2  # 부드러운 톤 매핑
    lum = x.mean(-1, keepdims=True)
    x = x + (0.03 - lum * 0.03) * np.array([-0.4, 0.1, 0.6]) + np.clip(lum - 0.6, 0, 1) * np.array([0.02, 0.01, -0.01])
    return np.clip(x * 255, 0, 255)


def paint_bg(kind):
    L = LAYOUTS[kind]
    W, H = L['W'], L['H']
    img, xx, yy = sky(W, H, L)
    mo = moon_pos(W, H, L)
    img = stars(img, W, H, L, mo)
    img, mo = moon(img, xx, yy, W, H, L)
    img = clouds(img, xx, yy, W, H, L, mo)
    img = clouds(img, xx, yy, W, H, L, mo, seed=35, front=True)
    img, ridges = mountains(img, xx, yy, W, H, L, mo)
    img = forest(img, xx, yy, W, H, L, mo)
    img = castle(img, xx, yy, W, H, L, mo)
    img, hy = hill(img, xx, yy, W, H, L, mo)
    img = vignette(img, xx, yy, W, H)
    img = grade(img)
    return Image.fromarray(img.astype(np.uint8), 'RGB'), mo


# ───────────────────────── 용 ─────────────────────────
def dragon_polys():
    """왼쪽으로 나는 용의 그림자 — 날개를 높이 든 순간. 좌표계 x 0~1000, y -160~480.
    돌려주는 것: (뒤 날개, 몸, 앞 날개) 다각형 목록."""

    def bez(p0, p1, p2, n=16):
        return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                 (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]

    def strip(pts, w0, w1):
        """곡선을 따라 굵기가 w0 → w1 로 변하는 띠."""
        pts = np.asarray(pts, np.float32)
        d = np.gradient(pts, axis=0)
        n = np.stack([-d[:, 1], d[:, 0]], 1) / (np.hypot(d[:, 0], d[:, 1])[:, None] + 1e-6)
        w = np.linspace(w0, w1, len(pts))[:, None]
        a = pts + n * w
        b = pts - n * w
        return [tuple(p) for p in a] + [tuple(p) for p in b[::-1]]

    body = []
    # ── 몸통: 등뼈 곡선 + 두께 ──
    spine = [(130, 250), (175, 246), (222, 264), (268, 296), (320, 320), (382, 334), (450, 338),
             (520, 333), (585, 320), (650, 312), (720, 320), (790, 342), (850, 354), (905, 342),
             (950, 314), (982, 284)]
    width = [11, 12, 15, 22, 33, 44, 48, 44, 35, 24, 15, 10, 7, 5, 3, 1.6]
    sp = np.array(spine, np.float32)
    tt = np.linspace(0, 1, len(sp))
    tf = np.linspace(0, 1, 200)
    sx = np.convolve(np.pad(np.interp(tf, tt, sp[:, 0]), 7, mode='edge'), np.ones(15) / 15, 'valid')
    sy = np.convolve(np.pad(np.interp(tf, tt, sp[:, 1]), 7, mode='edge'), np.ones(15) / 15, 'valid')
    wf = np.interp(tf, tt, width)
    dx, dy = np.gradient(sx), np.gradient(sy)
    ln = np.hypot(dx, dy) + 1e-6
    nx, ny = -dy / ln, dx / ln          # 진행 방향(오른쪽)의 왼손 = 화면 위쪽
    up = [(x + nx_ * w * 0.85, y + ny_ * w * 0.85) for x, y, nx_, ny_, w in zip(sx, sy, nx, ny, wf)]
    dn = [(x - nx_ * w * 1.1, y - ny_ * w * 1.1) for x, y, nx_, ny_, w in zip(sx, sy, nx, ny, wf)]
    # 위/아래를 화면 기준으로 고른다(ny<0 이면 up 이 화면 위)
    if np.mean([p[1] for p in up]) > np.mean([p[1] for p in dn]):
        up, dn = dn, up
    body.append(up + dn[::-1])
    # 등 가시 — 목에서 꼬리까지
    for i in range(14, 190, 8):
        ax, ay = up[i]
        h = 5 + wf[i] * 0.32
        tx, ty = dx[i] / ln[i], dy[i] / ln[i]
        body.append([(ax - tx * 5, ay - ty * 5 + 1), (ax + tx * 3 + (up[i][0] - sx[i]) * 0.0, ay - h), (ax + tx * 6, ay + ty * 6 + 1)])
    # 꼬리 끝 — 창날
    ex, ey = sx[-1], sy[-1]
    body.append([(ex - 14, ey + 10), (ex + 4, ey - 26), (ex + 30, ey - 34), (ex + 22, ey - 8), (ex + 10, ey + 14)])

    # ── 머리: 머리 밑동을 원점으로 그려 돌려 붙인다 ──
    def place(pts, ox, oy, ang):
        c, s = math.cos(ang), math.sin(ang)
        return [(ox + x * c - y * s, oy + x * s + y * c) for x, y in pts]
    head = [(4, -13), (-16, -17), (-30, -15), (-46, -11), (-62, -7), (-76, -3), (-80, 1), (-74, 4),
            (-56, 5), (-44, 6), (-70, 15), (-72, 19), (-50, 18), (-30, 16), (-12, 15), (4, 13)]
    ang = math.radians(-6)
    hx, hy = spine[0]
    body.append(place(head, hx + 8, hy, ang))
    horn1 = bez((-12, -14), (14, -44), (52, -52), 14) + bez((52, -50), (18, -34), (0, -8), 14)
    horn2 = bez((-26, -13), (-10, -38), (18, -46), 12) + bez((18, -44), (-4, -30), (-16, -10), 12)
    body.append(place(horn1, hx + 8, hy, ang))
    body.append(place(horn2, hx + 8, hy, ang))
    for (a, b, c) in [((-40, 16), (-36, 30), (-30, 16)), ((-24, 15), (-18, 28), (-12, 15)), ((-8, 14), (0, 26), (4, 12))]:
        body.append(place([a, b, c], hx + 8, hy, ang))
    # 볏 — 머리 뒤에서 목으로 이어지는 가시 몇 개
    for (x0, h) in [(-6, 14), (2, 12)]:
        body.append(place([(x0 - 4, -12), (x0 + 6, -12 - h), (x0 + 6, -10)], hx + 8, hy, ang))

    # ── 다리: 앞다리는 가슴 밑에 접고, 뒷다리는 뒤로 늘어뜨린다 ──
    body.append(strip(bez((370, 350), (392, 382), (368, 404), 10), 9, 5))
    body.append([(360, 400), (350, 414), (366, 408), (362, 420), (374, 408), (380, 402)])
    body.append(strip(bez((600, 332), (660, 372), (640, 420), 12), 15, 6))
    body.append(strip(bez((640, 418), (668, 430), (700, 424), 8), 6, 4))
    body.append([(696, 416), (716, 420), (704, 426), (716, 434), (696, 432)])

    # ── 날개: 어깨 → 팔꿈치 → 손목, 손목에서 휜 손가락 뼈 넷이 **꼬리 쪽으로** 부챗살처럼 ──
    def wing(sh, el, wr, tips, root, thick):
        P = []   # 뼈(팔 · 손가락 · 발톱)
        M = []   # 막
        P.append(strip(bez(sh, ((sh[0] + el[0]) / 2 - 6, (sh[1] + el[1]) / 2), el, 10), thick, thick * 0.75))
        P.append(strip(bez(el, ((el[0] + wr[0]) / 2 - 10, (el[1] + wr[1]) / 2), wr, 10), thick * 0.75, thick * 0.5))
        # 엄지 발톱(손목 앞)
        P.append([(wr[0] + 4, wr[1] + 10), (wr[0] - 22, wr[1] + 2), (wr[0] - 30, wr[1] - 10), (wr[0] - 12, wr[1] - 4), (wr[0] + 6, wr[1] - 6)])
        # 손가락 뼈 — 가운데가 바깥(위)으로 조금 휜다
        bones = []
        for tp in tips:
            mx_, my_ = (wr[0] + tp[0]) / 2, (wr[1] + tp[1]) / 2
            vx, vy = tp[0] - wr[0], tp[1] - wr[1]
            ctrl = (mx_ + vy * 0.08, my_ - vx * 0.08)
            b = bez(wr, ctrl, tp, 14)
            bones.append(b)
            P.append(strip(b, thick * 0.42, 1.2))
        # 막: 손목 → 첫 뼈 끝 → (파임) → 다음 뼈 끝 … → 몸(엉덩이)
        pts = list(bones[0])
        prev = tips[0]
        for nxt in tips[1:] + [root]:
            mx_, my_ = (prev[0] + nxt[0]) / 2, (prev[1] + nxt[1]) / 2
            k = 0.36 if nxt is not root else 0.22
            ctrl = (mx_ + (wr[0] - mx_) * k, my_ + (wr[1] - my_) * k)
            pts += bez(prev, ctrl, nxt, 16)[1:]
            prev = nxt
        pts += [sh, el]
        M.append(pts)
        return M, P

    # 먼 쪽 날개 — 앞 날개보다 앞·위로 비껴 올라가 끝이 보인다
    back = wing(sh=(392, 318), el=(300, 200), wr=(336, -30),
                tips=[(520, -160), (636, -128), (700, -40), (690, 80)], root=(560, 318), thick=8)
    front = wing(sh=(424, 330), el=(344, 204), wr=(446, -18),
                 tips=[(708, -130), (832, -28), (878, 110), (812, 236)], root=(640, 322), thick=11)
    return back, body, front


def paint_dragon(scale=1.0):
    back, body, front = dragon_polys()
    x0, y0, x1, y1 = 10, -160, 1030, 470
    W, H = int((x1 - x0) * scale), int((y1 - y0) * scale)

    def tf(polys):
        return [[((x - x0) * scale, (y - y0) * scale) for x, y in p] for p in polys]

    bM, bB = back
    fM, fB = front
    m_bm = poly_mask(H, W, tf(bM), ss=4)
    m_bb = poly_mask(H, W, tf(bB), ss=4)
    m_body = poly_mask(H, W, tf(body), ss=4)
    m_fm = poly_mask(H, W, tf(fM), ss=4)
    m_fb = poly_mask(H, W, tf(fB), ss=4)
    # 먼 날개는 공기가 끼어 밝고, 막은 달빛이 살짝 비쳐 뼈보다 밝다 — 그래야 날개 뼈대가 읽힌다
    img = np.zeros((H, W, 3), np.float32)
    a = np.zeros((H, W), np.float32)
    for m, col, al in [(m_bm, (44, 42, 72), 0.9), (m_bb, (30, 28, 52), 1.0),
                       (m_body, (9, 8, 18), 1.0), (m_fm, (22, 19, 38), 0.96), (m_fb, (8, 7, 16), 1.0)]:
        img = over(img, np.array(col, np.float32), m * al)
        a = a + m * al * (1 - a)
    mm = np.clip(m_body + m_fm + m_fb, 0, 1)
    # 아래 가장자리에 아주 얇은 붉은 테 — 지평선의 불빛을 받는다
    rim = np.clip(mm - np.roll(blur(mm, 1.0), -2, axis=0), 0, 1)
    img += (rim * 110)[..., None] * np.array([1.0, 0.42, 0.16], np.float32)
    rgba = np.dstack([np.clip(img, 0, 255), a * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


# ───────────────────────── 영웅 ─────────────────────────
def paint_heroes(height=620):
    """참고 그림 셋을 줄여 나란히 — 가운데(사냥꾼)가 조금 뒤에 선다."""
    names = ['ranger', 'warrior', 'mage']
    ims = []
    for n in names:
        im = Image.open(os.path.join(ROOT, 'art', 'reference', f'{n}_ref_cut.png')).convert('RGBA')
        bb = im.getbbox()
        ims.append(im.crop(bb))
    hmax = max(i.height for i in ims)
    sc = height / hmax
    ims = [i.resize((max(1, int(i.width * sc)), max(1, int(i.height * sc))), Image.LANCZOS) for i in ims]
    # 배치: 가운데 용사가 앞, 왼쪽 사냥꾼 · 오른쪽 마법사가 조금 뒤(작고 위)
    back_s = 0.86
    L_ = ims[0].resize((int(ims[0].width * back_s), int(ims[0].height * back_s)), Image.LANCZOS)
    R_ = ims[2].resize((int(ims[2].width * back_s), int(ims[2].height * back_s)), Image.LANCZOS)
    C_ = ims[1]
    over_x = int(C_.width * 0.20)
    W = L_.width + C_.width + R_.width - over_x * 2
    H = C_.height + 8
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    base = H - 4
    # 발밑 그림자
    sh = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(sh)
    for cx, w in [(L_.width / 2, L_.width * 0.6), (L_.width - over_x + C_.width / 2, C_.width * 0.62),
                  (W - R_.width / 2, R_.width * 0.6)]:
        d.ellipse([cx - w / 2, base - 14, cx + w / 2, base + 4], fill=150)
    sh = sh.resize((W, H)).filter(__import__('PIL.ImageFilter', fromlist=['GaussianBlur']).GaussianBlur(6))
    shadow = Image.new('RGBA', (W, H), (4, 4, 12, 0))
    shadow.putalpha(sh)
    out.alpha_composite(shadow)
    # 뒤에 선 둘은 살짝 어둡고 푸르게(달밤의 공기) — 앞에 선 용사가 주인공으로 선다
    def dim(im, k):
        a = np.asarray(im, np.float32)
        a[..., :3] = a[..., :3] * k + np.array([8, 10, 24]) * (1 - k)
        return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    out.alpha_composite(dim(L_, 0.8), (0, base - L_.height - 6))
    out.alpha_composite(dim(R_, 0.8), (W - R_.width, base - R_.height - 6))
    out.alpha_composite(C_, (L_.width - over_x, base - C_.height))
    return out


def save_webp(im, path, q=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=6)
    print(f'✓ {os.path.relpath(path, ROOT)}  {im.size[0]}×{im.size[1]}  {os.path.getsize(path) // 1024} KB')


def main(argv):
    want = set(argv) or {'bg', 'dragon', 'logo', 'heroes'}
    if 'bg' in want:
        for kind in ('wide', 'tall'):
            im, _ = paint_bg(kind)
            save_webp(im, os.path.join(OUT, f'bg_{kind}.webp'), q=80)
    if 'dragon' in want:
        save_webp(paint_dragon(0.62), os.path.join(OUT, 'dragon.webp'), q=85)
    if 'heroes' in want:
        save_webp(paint_heroes(620), os.path.join(OUT, 'heroes.webp'), q=86)
    if 'logo' in want:
        env = dict(os.environ)
        env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
        subprocess.run(['node', os.path.join(ROOT, 'tools', 'title-logo.js')], check=True, env=env)
        png = os.path.join(OUT, 'logo.png')
        im = Image.open(png).convert('RGBA')
        x0, y0, x1, y1 = im.getbbox()
        im = im.crop((max(0, x0 - 6), max(0, y0 - 6), min(im.width, x1 + 6), min(im.height, y1 + 6)))
        save_webp(im, os.path.join(OUT, 'logo.webp'), q=90)
        os.remove(png)


if __name__ == '__main__' and 'battle' not in sys.argv[1:]:
    main(sys.argv[1:])


# ───────────────────────── 전투 배경 (0.70.28) ─────────────────────────
# 들판의 낮. 타이틀 그림과 같은 붓(잡음 · 봉우리 · 숲 · 풀)을 낮 빛으로 쓴다.
# 주인공은 왼쪽 28%, 몬스터는 오른쪽 60~85% 에 선다(BattleScene). 발은 화면 높이 76~88%.
# 그래서 땅(풀밭)이 아래 45% 를 차지하고, 서는 자리는 밝고 조용하게(무늬가 싸움을 가리지 않게) 둔다.
def paint_battle(W=1280, H=960, kind='field'):
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    hz = 0.5
    img = np.zeros((H, W, 3), np.float32)
    stops = [(0.0, (58, 118, 206)), (0.28, (96, 160, 228)), (0.46, (170, 210, 240)), (hz, (214, 230, 236)), (1.0, (214, 230, 236))]
    ys = np.array([s[0] for s in stops], np.float32)
    for c in range(3):
        img[..., c] = np.interp(y, ys, [s[1][c] for s in stops]).astype(np.float32)
    # 해 — 왼쪽 위, 따뜻한 번짐
    sx, sy = W * 0.2, H * 0.12
    d = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
    img += np.exp(-d / (W * 0.18))[..., None] * np.array([70, 60, 30], np.float32)
    img += np.exp(-d / (W * 0.04))[..., None] * np.array([60, 55, 40], np.float32)
    # 뭉게구름 — 위는 햇빛에 희고 아래는 푸른 그늘
    n = fbm(H, W, 3.0, 6, 211, aspect=2.2, gain=0.55)
    band = np.exp(-((yy - H * 0.2) / (H * 0.09)) ** 2) * 0.9 + np.exp(-((yy - H * 0.36) / (H * 0.05)) ** 2) * 0.7
    dens = smooth((n - 0.58 + band * 0.4) * 5) * np.clip(band * 1.5, 0, 1)
    top_lit = np.clip(dens - np.roll(dens, 10, axis=0), 0, 1)
    ccol = np.array([236, 242, 250], np.float32) * (0.9 + 0.1 * n[..., None]) - (np.clip(np.roll(dens, -18, axis=0) - dens, 0, 1) * 40)[..., None] * np.array([0.8, 0.7, 0.3])
    over(img, ccol, dens * 0.95)
    img += (top_lit * 30)[..., None]
    # 먼 산 — 푸르게 흐린 봉우리, 꼭대기 눈
    sc = H / 1080
    for i, (base, amp, lit_c, dark_c, seed, npk) in enumerate([
            (H * hz + 20 * sc, 200 * sc, (150, 176, 214), (116, 140, 186), 301, 6),
            (H * hz + 60 * sc, 130 * sc, (110, 140, 170), (84, 110, 146), 307, 8)]):
        yr, tops, owner, pxs = peaks_ridge(W, base, amp, seed, npk, 14, sc)
        m = np.clip(yy - yr[None, :] + 0.5, 0, 1)
        below = np.clip(yy - yr[None, :], 0, None)
        spine = pxs[owner][None, :] + noise1(H, 6, seed + 5, 4)[:, None] * 60 * sc * np.clip(below / (amp + 1), 0, 1)
        side = blur(np.where(xx - spine < 0, 1.0, 0.0).astype(np.float32), 1.2)   # 해가 왼쪽 — 왼쪽 비탈이 밝다
        side = 0.5 + (side - 0.5) * np.exp(-below / (amp * 0.9 + 1))
        tone = side[..., None] * np.array(lit_c, np.float32) + (1 - side[..., None]) * np.array(dark_c, np.float32)
        rel = np.clip((base - yr) / amp, 0, 1)[None, :]
        gul = fbm(H, W, 10, 4, seed + 7, aspect=0.45)
        cap = smooth(((4 + 40 * rel ** 2) * sc * (0.3 + 1.2 * gul ** 1.5) - below) / (5 * sc)) * smooth(rel * 2.4 - 0.5)
        snow = side[..., None] * np.array([248, 250, 255], np.float32) + (1 - side[..., None]) * np.array([196, 210, 232], np.float32)
        tone = tone * (1 - cap[..., None]) + snow * cap[..., None]
        haze = smooth(below / (H * 0.12)) * 0.5
        tone = tone * (1 - haze[..., None]) + np.array([200, 222, 236], np.float32) * haze[..., None]
        over(img, tone, m)
    # 숲 띠 — 둥근 나무와 전나무가 섞인 짙은 초록
    rng = np.random.default_rng(311)
    x = np.arange(W, dtype=np.float32)
    ground = H * hz + 110 * sc + noise1(W, 3, 312, 4) * 40 * sc
    polys = [list(zip(x, ground)) + [(W, H), (0, H)]]
    px_ = -10.0
    crowns = []
    while px_ < W + 10:
        px_ += rng.uniform(10, 22) * sc
        gy = float(np.interp(px_, x, ground)) + 6 * sc
        h = rng.uniform(40, 90) * sc
        if rng.random() < 0.55:
            w = h * 0.3
            for k in range(3):
                t0 = k / 3
                polys.append([(px_ - w * (1 - t0 * .45), gy - h * t0 * .8), (px_, gy - h * (0.45 + t0 * .55) if k < 2 else gy - h), (px_ + w * (1 - t0 * .45), gy - h * t0 * .8)])
        else:
            r = h * 0.38
            crowns.append((px_, gy - h * 0.62, r))
    m = poly_mask(H, W, polys, ss=2)
    im = Image.new('L', (W * 2, H * 2), 0)
    dr = ImageDraw.Draw(im)
    for (cx_, cy_, r) in crowns:
        for j in range(3):
            ox = (j - 1) * r * 0.55
            oy = abs(j - 1) * r * 0.25
            dr.ellipse([(cx_ + ox - r * .7) * 2, (cy_ + oy - r * .7) * 2, (cx_ + ox + r * .7) * 2, (cy_ + oy + r * .7) * 2], fill=255)
    m = np.clip(m + np.asarray(im.resize((W, H), Image.LANCZOS), np.float32) / 255, 0, 1)
    tex = fbm(H, W, 18, 4, 313)
    lit = np.clip(m - np.roll(np.roll(blur(m, 1.5), 3, axis=0), 3, axis=1), 0, 1) * (yy < ground[None, :] - 4)
    fcol = np.array([46, 92, 60], np.float32)[None, None, :] * (0.8 + 0.4 * tex[..., None])
    over(img, fcol, m)
    img += (lit * 70)[..., None] * np.array([0.6, 1.0, 0.45], np.float32)
    mist = np.exp(-((yy - (ground[None, :] + 4)) / (16 * sc)) ** 2) * fbm(H, W, 2, 4, 314, aspect=5)
    over(img, np.array([200, 226, 220], np.float32), smooth(mist * 1.6 - 0.3) * 0.45)
    # 풀밭 — 멀수록 옅고 가까울수록 짙다, 굵은 얼룩과 잔 결
    gtop = H * hz + 118 * sc
    field = np.clip((yy - gtop) / (H - gtop), 0, 1)
    gm = np.clip(yy - (gtop + noise1(W, 3, 315)[None, :] * 10 * sc), 0, 1)
    big = fbm(H, W, 3, 5, 316, aspect=3)
    fine = fbm(H, W, 40, 3, 317, aspect=2.5)
    far_c = np.array([128, 178, 96], np.float32)
    near_c = np.array([70, 128, 60], np.float32)
    gcol = far_c * (1 - field[..., None]) + near_c * field[..., None]
    gcol = gcol * (0.86 + 0.24 * big[..., None]) * (0.94 + 0.12 * fine[..., None])
    # 햇빛 드는 자리(싸우는 자리 둘레)는 밝게
    spot = np.exp(-(((xx - W * 0.55) / (W * 0.45)) ** 2 + ((yy - H * 0.82) / (H * 0.16)) ** 2))
    gcol = gcol * (1 + 0.12 * spot[..., None])
    over(img, gcol, gm)
    # 흙길 — 가운데를 비스듬히 지나는 옅은 흙(서는 자리 바로 밑은 비워 둔다)
    path_y = gtop + (H - gtop) * (0.18 + 0.1 * np.sin(xx / W * 3.2 + 0.4))
    pw = (8 + 26 * field) * sc
    pm = np.clip(1 - np.abs(yy - path_y) / pw, 0, 1) ** 0.6 * np.clip((fine - 0.2) * 3, 0.55, 1)
    pm = blur(pm.astype(np.float32), 1.5)
    over(img, np.array([196, 170, 120], np.float32) * (0.9 + 0.2 * big[..., None]), pm * 0.8 * gm)
    # 풀잎 · 꽃 — 아래로 갈수록 크게
    rng = np.random.default_rng(318)
    blades = []
    flowers = []
    for i in range(int(W * H / 700)):
        bx = rng.random() * W
        by = gtop + (rng.random() ** 0.7) * (H - gtop)
        t = (by - gtop) / (H - gtop)
        bh = (3 + 16 * t) * sc * (0.6 + rng.random() * 0.8)
        lean = rng.normal(0, 0.4) * bh
        blades.append([(bx - (0.8 + t), by), (bx + lean, by - bh), (bx + (0.8 + t), by)])
        if rng.random() < 0.04:
            flowers.append((bx + lean, by - bh, (1.5 + 4 * t) * sc, rng.integers(0, 4)))
    bm = poly_mask(H, W, blades, ss=2)
    over(img, np.array([52, 104, 46], np.float32) * (0.85 + 0.3 * big[..., None]), bm * 0.8)
    lit = np.clip(bm - np.roll(blur(bm, 1.0), 2, axis=1), 0, 1)
    img += (lit * 60)[..., None] * np.array([0.8, 1.0, 0.5], np.float32)
    fl = Image.new('RGB', (W, H), (0, 0, 0))
    fa = Image.new('L', (W, H), 0)
    dfl, dfa = ImageDraw.Draw(fl), ImageDraw.Draw(fa)
    cols = [(255, 250, 240), (255, 220, 90), (250, 150, 190), (170, 200, 255)]
    for (fx, fy, r, ci) in flowers:
        dfl.ellipse([fx - r, fy - r, fx + r, fy + r], fill=cols[ci])
        dfa.ellipse([fx - r, fy - r, fx + r, fy + r], fill=235)
    over(img, np.asarray(fl, np.float32), np.asarray(fa, np.float32) / 255)
    # 가장자리 어둡게(가운데 싸움에 눈이 가게)
    v = np.sqrt(((xx - W / 2) / (W * 0.7)) ** 2 + ((yy - H * 0.6) / (H * 0.75)) ** 2)
    img *= (1 - smooth((v - 0.6) * 1.6) * 0.35)[..., None]
    x = np.clip(img / 255, 0, None)
    x = x / (1 + x * 0.12) * 1.1
    return Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8), 'RGB')


def main_battle():
    im = paint_battle()
    out = os.path.join(ROOT, 'assets', 'ui', 'battle_bg_field.png')
    im.save(out, optimize=True)
    print(f'✓ {os.path.relpath(out, ROOT)}  {im.size[0]}×{im.size[1]}  {os.path.getsize(out) // 1024} KB')


if __name__ == '__main__' and 'battle' in sys.argv[1:]:
    main_battle()


def paint_battle_volcano(W=1280, H=960):
    """붉은 황야 · 화산 — 연기 낀 붉은 하늘, 용암이 흐르는 검은 산, 갈라진 현무암 바닥에 불티."""
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    hz = 0.52
    img = np.zeros((H, W, 3), np.float32)
    stops = [(0.0, (34, 14, 20)), (0.25, (84, 26, 22)), (0.45, (170, 60, 28)), (hz, (230, 110, 40)), (1.0, (60, 22, 16))]
    ys = np.array([s[0] for s in stops], np.float32)
    for c in range(3):
        img[..., c] = np.interp(y, ys, [s[1][c] for s in stops]).astype(np.float32)
    # 연기 — 위로 퍼지는 검붉은 구름
    n = fbm(H, W, 3.2, 6, 411, aspect=1.8, gain=0.55)
    band = np.exp(-((yy - H * 0.16) / (H * 0.14)) ** 2) + np.exp(-((yy - H * 0.36) / (H * 0.06)) ** 2) * 0.6
    dens = smooth((n - 0.55 + band * 0.35) * 4) * np.clip(band * 1.4, 0, 1)
    under = np.clip(np.roll(dens, -14, axis=0) - dens, 0, 1)
    scol = np.array([48, 24, 26], np.float32) + (under * 140)[..., None] * np.array([1, .45, .15])
    over(img, scol, dens * 0.9)
    sc = H / 1080
    for i, (base, amp, col, seed, npk) in enumerate([(H * hz + 10 * sc, 280 * sc, (44, 24, 30), 421, 3), (H * hz + 70 * sc, 150 * sc, (26, 16, 20), 427, 6)]):
        yr, tops, owner, pxs = peaks_ridge(W, base, amp, seed, npk, 18, sc)
        m = np.clip(yy - yr[None, :] + 0.5, 0, 1)
        below = np.clip(yy - yr[None, :], 0, None)
        tone = np.array(col, np.float32)[None, None, :] * (0.85 + 0.3 * fbm(H, W, 12, 4, seed + 1)[..., None])
        # 용암 줄기 — 봉우리에서 흘러내린다
        lava = np.zeros((H, W), np.float32)
        for (tx_, ty_) in tops[: max(1, npk // 2)]:
            wig = noise1(H, 8, int(tx_) + seed, 4) * 60 * sc
            lx = tx_ + wig[:, None] * np.clip((yy - ty_) / (amp + 1), 0, 1)
            lava = np.maximum(lava, np.exp(-((xx - lx) / (6 * sc)) ** 2) * (yy > ty_ + 10) * np.exp(-below / (amp * 1.4)))
        tone = tone + (lava * 255)[..., None] * np.array([1.0, 0.55, 0.15], np.float32)
        tone = tone + (np.exp(-below / (10 * sc)) * 120 * (1 - i * 0.4))[..., None] * np.array([1.0, 0.4, 0.12], np.float32)
        over(img, tone, m)
        img += (blur(lava * m, 8) * 140)[..., None] * np.array([1.0, 0.45, 0.1], np.float32)
    gtop = H * hz + 130 * sc
    gm = np.clip(yy - (gtop + noise1(W, 4, 431)[None, :] * 14 * sc), 0, 1)
    field = np.clip((yy - gtop) / (H - gtop), 0, 1)
    big = fbm(H, W, 4, 5, 432, aspect=2.5)
    gcol = (np.array([70, 40, 36], np.float32) * (1 - field[..., None]) + np.array([34, 22, 22], np.float32) * field[..., None]) * (0.8 + 0.35 * big[..., None])
    over(img, gcol, gm)
    # 갈라진 틈 — 용암빛
    cr = fbm(H, W, 7, 5, 433, aspect=1.6)
    crack = np.exp(-((cr - 0.5) / 0.012) ** 2) * gm * (field > 0.02)
    crack = blur(crack.astype(np.float32), 0.8)
    img += (crack * 230)[..., None] * np.array([1.0, 0.5, 0.12], np.float32)
    img += (blur(crack, 6) * 90)[..., None] * np.array([1.0, 0.4, 0.1], np.float32)
    # 불티
    rng = np.random.default_rng(434)
    lay = np.zeros((H, W), np.float32)
    for i in range(260):
        x, yv = rng.random() * W, rng.random() * H * 0.9
        cv2.circle(lay, (int(x), int(yv)), int(1 + rng.random() * 2), 0.5 + rng.random() * 0.6, -1, cv2.LINE_AA)
    img += (blur(lay, 2.5) * 2 + lay)[..., None] * np.array([255, 150, 60], np.float32) * 0.6
    v = np.sqrt(((xx - W / 2) / (W * 0.7)) ** 2 + ((yy - H * 0.6) / (H * 0.75)) ** 2)
    img *= (1 - smooth((v - 0.55) * 1.6) * 0.45)[..., None]
    x = np.clip(img / 255, 0, None)
    x = x / (1 + x * 0.2) * 1.15
    return Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8), 'RGB')


def paint_battle_dungeon(W=1280, H=960):
    """지하감옥 — 아치 진 돌벽, 벽에 걸린 횃불, 원근이 선 바닥 돌판, 고인 물 · 사슬."""
    xx, yy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    img = np.zeros((H, W, 3), np.float32)
    wall_b = H * 0.6
    # 벽돌 — 줄마다 어긋나게, 돌마다 밝기가 다르다
    rng = np.random.default_rng(511)
    bh = 46
    wall = np.zeros((H, W), np.float32)
    mortar = np.zeros((H, W), np.float32)
    for r in range(int(wall_b // bh) + 1):
        y0 = r * bh
        off = (r % 2) * 60
        x0 = -off
        while x0 < W:
            bw = rng.integers(90, 150)
            wall[y0:y0 + bh, max(0, x0):max(0, x0 + bw)] = 0.75 + rng.random() * 0.35
            mortar[y0:y0 + 3, max(0, x0):max(0, x0 + bw)] = 1
            mortar[y0:y0 + bh, max(0, x0):max(0, x0 + 3)] = 1
            x0 += bw
    tex = fbm(H, W, 20, 4, 512)
    stone = np.array([50, 48, 60], np.float32)[None, None, :] * (wall * (0.8 + 0.4 * tex))[..., None]
    stone = stone * (1 - 0.7 * blur(mortar, 1.0)[..., None])
    img = stone
    # 아치 두 개(어두운 복도 입구)
    for ax in (W * 0.3, W * 0.72):
        aw, ah = W * 0.12, H * 0.34
        top = wall_b - ah
        inside = ((xx - ax) / aw) ** 2 + ((yy - (top + aw * 0.7)) / (aw * 0.85)) ** 2 < 1
        inside = inside | ((np.abs(xx - ax) < aw) & (yy > top + aw * 0.7) & (yy < wall_b))
        m = blur(inside.astype(np.float32), 1.2)
        depth = np.clip((yy - top) / ah, 0, 1)
        over(img, np.array([10, 10, 18], np.float32) + depth[..., None] * np.array([10, 8, 10]), m)
        ring = blur((np.abs(np.sqrt(((xx - ax) / aw) ** 2 + ((yy - (top + aw * 0.7)) / (aw * 0.85)) ** 2) - 1.08) < 0.08).astype(np.float32) * (yy < top + aw * 0.7), 1)
        over(img, np.array([100, 96, 110], np.float32), ring * 0.8)
    # 횃불 — 벽의 따뜻한 빛
    for tx_ in (W * 0.1, W * 0.51, W * 0.92):
        ty_ = H * 0.3
        d = np.sqrt((xx - tx_) ** 2 + ((yy - ty_) * 1.2) ** 2)
        img += np.exp(-d / (W * 0.14))[..., None] * np.array([150, 80, 24], np.float32)
        img += np.exp(-d / (W * 0.03))[..., None] * np.array([120, 90, 40], np.float32)
        hold = (np.abs(xx - tx_) < 7) & (yy > ty_) & (yy < ty_ + 60)
        over(img, np.array([40, 30, 26], np.float32), hold.astype(np.float32))
        flame = np.exp(-(((xx - tx_) / 14) ** 2 + ((yy - (ty_ - 16)) / 26) ** 2))
        img += (flame * 255)[..., None] * np.array([1.0, 0.75, 0.3], np.float32)
    # 바닥 — 원근 돌판
    fm = (yy > wall_b).astype(np.float32)
    t = np.clip((yy - wall_b) / (H - wall_b), 0, 1)
    vx = W / 2
    u = (xx - vx) / (0.25 + t * 1.2)
    rows = np.floor((1 / (t + 0.08)) * 3)
    cols = np.floor(u / 90 + rows * 0.5)
    tile = (np.sin(rows * 12.9898 + cols * 78.233) * 43758.5453) % 1
    gl = np.abs(((1 / (t + 0.08)) * 3) % 1 - 0.5) > 0.46
    gl2 = np.abs((u / 90 + rows * 0.5) % 1 - 0.5) > 0.47
    floor = np.array([66, 62, 72], np.float32)[None, None, :] * (0.7 + 0.4 * tile[..., None]) * (0.55 + 0.6 * t[..., None])
    floor = floor * (1 - 0.6 * (gl | gl2)[..., None])
    over(img, floor, fm)
    # 고인 물 — 횃불빛이 비친다
    pud = smooth((fbm(H, W, 3, 4, 513, aspect=2.5) - 0.62) * 8) * fm * (t > 0.25)
    over(img, np.array([30, 36, 52], np.float32) + blur(img, 0)[..., :] * 0.35, pud * 0.6)
    # 벽 밑 그늘
    img *= (1 - np.exp(-np.abs(yy - wall_b) / 30) * 0.4 * (yy > wall_b))[..., None]
    v = np.sqrt(((xx - W / 2) / (W * 0.65)) ** 2 + ((yy - H * 0.55) / (H * 0.7)) ** 2)
    img *= (1 - smooth((v - 0.5) * 1.6) * 0.55)[..., None]
    x = np.clip(img / 255, 0, None)
    x = x / (1 + x * 0.2) * 1.15
    return Image.fromarray(np.clip(x * 255, 0, 255).astype(np.uint8), 'RGB')


if __name__ == '__main__' and 'battle' in sys.argv[1:]:
    for name, fn in (('volcano', paint_battle_volcano), ('dungeon', paint_battle_dungeon)):
        im = fn()
        out = os.path.join(ROOT, 'assets', 'ui', f'battle_bg_{name}.png')
        im.save(out, optimize=True)
        print(f'✓ {os.path.relpath(out, ROOT)}  {os.path.getsize(out) // 1024} KB')
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'pack-webp.py')], check=True)   # 0.70.29 — webp 로
