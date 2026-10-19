#!/usr/bin/env python3
"""
준 그림(art/reference/warrior_ref.png)의 **머리 부분**만 선으로 떠 온다 (0.70.26).

    python3 tools/trace-ref.py      → tools/art-hero2-traced.json

왜 머리만 뜨나:
  머리카락과 얼굴은 모양이 제멋대로(뻗친 머리끝 · 앞머리 끝)라, 눈대중으로 따라 그리면
  첫 판처럼 **밥그릇 머리**가 된다. 그 사람이 그 사람으로 보이는 것도 여기서 정해진다.
  그래서 이 두 곳은 준 그림의 윤곽을 그대로 떠 온다.
  몸통·망토·팔·장비는 **손으로 그린 부품**으로 둔다 — 장비를 바꿔 끼워야 하는 자리라
  한 덩어리로 떠 오면 칼을 활로 바꿀 수가 없다.

필요한 것: opencv-python-headless, numpy, Pillow  (게임을 돌리는 데는 필요 없다 — 결과 JSON 만 쓴다)
"""
import json, os, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
REF = os.path.join(ROOT, 'art', 'reference', 'warrior_ref.png')
CUT = os.path.join(ROOT, 'art', 'reference', 'warrior_ref_cut.png')
OUT = os.path.join(ROOT, 'tools', 'art-hero2-traced.json')

rgb = np.asarray(Image.open(REF).convert('RGB')).astype(np.int32)
alpha = np.asarray(Image.open(CUT).convert('RGBA'))[..., 3] > 0
H, W = alpha.shape
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
lum = 0.3 * r + 0.59 * g + 0.11 * b
mx, mn = rgb.max(-1), rgb.min(-1)
yy, xx = np.mgrid[0:H, 0:W]

def paths(mask, eps=1.2, min_area=40, holes=False):
    m = (mask.astype(np.uint8)) * 255
    mode = cv2.RETR_CCOMP if holes else cv2.RETR_EXTERNAL
    cs, hier = cv2.findContours(m, mode, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if cv2.contourArea(c) < min_area:
            continue
        c = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(c) < 3:
            continue
        out.append('M' + ' L'.join(f'{x} {y}' for x, y in c) + ' Z')
    return out

def clean(mask, k=3, op='open'):
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    m = mask.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN if op == 'open' else cv2.MORPH_CLOSE, ker)
    return m.astype(bool)

def largest(mask):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if n <= 1:
        return mask
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return lab == i

def fill_holes(mask):
    m = mask.astype(np.uint8) * 255
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = np.zeros_like(m)
    cv2.drawContours(out, cs, -1, 255, -1)
    return out > 0

head = alpha & (yy < 392)
red = (r > 110) & (g < 70) & (b < 90) & (r > g * 1.8)
blue = (b > r + 25) & (b > 90)
# ── 살 ─────────────────────────────────────────────────
skin = head & (r > 185) & (g > 120) & (b > 90) & (r > g) & (g > b) & ((r - b) > 35) & (yy > 150)
skin = clean(clean(skin, 3, 'close'), 3)
skin = fill_holes(largest(skin) | (skin & (yy > 240) & ((xx < 290) | (xx > 480))))   # 귀도 함께
skin_dark = skin & (r < 236) & (g < 176)
# ── 머리띠 · 보석 ───────────────────────────────────────
band_zone = head & (yy > 175) & (yy < 236) & (xx > 280) & (xx < 490)
metal = band_zone & (mx - mn < 80) & (lum > 62) & (lum < 175) & ~skin & (r >= b)
band = clean(clean(metal, 3, 'close'), 3)
gem = band_zone & (b > r + 30) & (b > 110) & (xx > 360) & (xx < 408)
# ── 머리카락 ────────────────────────────────────────────
hair_sil = fill_holes(largest(clean(head & ~red & ~blue, 5, 'close')))
# 눈 자리 — 눈은 살 속의 구멍이다.
# ⚠ 속눈썹 선이 눈썹에 · 눈썹이 머리에 닿아 있어서 구멍이 안 막힌다. 그대로 두면
#   눈 자리에 머리카락 층이 깔린다. 그렇다고 살의 볼록 껍질로 메우면(두 번째 판)
#   귀까지 포함한 넓은 판이 되어 **앞머리 끝이 일자로 잘리고 옆머리가 먹힌다.**
#   눈 둘레만 타원으로 살로 돌린다 — 눈·눈썹은 손으로 그려 그 위에 얹는다.
eyes = np.zeros((H, W), np.uint8)
cv2.ellipse(eyes, (329, 282), (40, 30), 0, 0, 360, 1, -1)
cv2.ellipse(eyes, (440, 282), (40, 30), 0, 0, 360, 1, -1)
skin = skin | ((eyes > 0) & hair_sil)
hair_zone = hair_sil & ~skin & ~band & ~gem
brownish = (r > g) & (g >= b - 4)
# 어두운 것을 둘로 가른다 — **선**(거의 검정)과 **그늘**(짙은 갈색).
# 한 층으로 두면 준 그림의 가운데 갈색(명도 77 쯤)까지 검게 먹혀 머리가 까맣게 된다.
hair_line = hair_zone & (lum < 30)
hair_shade = hair_zone & (lum >= 30) & (lum < 50)
hair_light = hair_zone & brownish & (lum > 76)
hair_hi = hair_zone & brownish & (lum > 108)

data = {
    'note': 'tools/trace-ref.py 가 만든다 — 손으로 고치지 말 것',
    'hair_sil': paths(hair_sil, 1.0, 400),
    'hair_shade': paths(clean(hair_shade, 3), 1.2, 40),
    'hair_line': paths(clean(hair_line, 2), 0.8, 12),
    'hair_light': paths(clean(hair_light, 3), 1.2, 40),
    'hair_hi': paths(clean(hair_hi, 3), 1.2, 30),
    'skin': paths(skin, 1.0, 300),
    'skin_dark': paths(clean(skin_dark, 5), 1.4, 60),
    'band': paths(band, 1.2, 60),
    'gem': paths(clean(gem, 3), 1.0, 20),
}
json.dump(data, open(OUT, 'w'), ensure_ascii=False)
print('✓', OUT, {k: len(v) for k, v in data.items() if isinstance(v, list)},
      f"{os.path.getsize(OUT) // 1024}KB")
