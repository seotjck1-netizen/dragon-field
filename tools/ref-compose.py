#!/usr/bin/env python3
"""
벗은 몸 위에 장비를 **하나씩** 얹어 본다 (0.70.26 미리보기).

    node tools/base-bake.js             # 벗은 몸 → art/parts/<직업>/base.png
    python3 tools/ref-compose.py        # → art/parts/<직업>/state_<n>.png (768×1024)
                                        #   art/parts/<직업>/state_<n>_s.png (192×256 — 게임이 굽는 크기)

한 장을 만드는 순서(뒤에서 앞으로):
  ① 몸 뒤에 가려 있던 것 — 망토 안감(어깨를 걸쳤을 때) · 마법사의 뒷머리
  ② 벗은 몸(base.png) + 준 그림의 손을 살색으로 다시 칠한 맨손
  ③ 걸친 칸의 층 — 앞뒤 순서(ref-parts.Z)대로. 층마다 **가려 있던 자리를 먼저 메운다**
     (허리띠 밑의 튜닉 · 칼 밑의 망토). 메운 자리는 그보다 앞 층의 점에만 깔리므로
     그 앞 층을 걸치면 도로 덮인다 — **다 걸치면 준 그림과 점 하나 다르지 않다.**
  ④ 칼·활·지팡이를 쥔 손(무기보다 앞)
  ⑤ 드러난 가장자리에 테두리 — 장비를 벗겨 새로 드러난 경계만 칠한다.
"""
import importlib.util, os, sys, json
import numpy as np
import cv2
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(__file__), '..')
spec = importlib.util.spec_from_file_location('ref_parts', os.path.join(ROOT, 'tools', 'ref-parts.py'))
RP = importlib.util.module_from_spec(spec)
spec.loader.exec_module(RP)
H, W = RP.H, RP.W
LID, Z = RP.LID, RP.Z

# 층 → 장비 칸 (None 은 늘 보인다)
SLOT = {
    'head': None, 'skin': None, 'gskin': None,
    'armor': 'armor', 'shoulder_b': 'shoulder', 'shoulder_f': 'shoulder',
    'gloves': 'gloves', 'ggl': 'gloves', 'boots': 'boots', 'belt': 'belt',
    'weapon': 'weapon', 'weapon_b': 'weapon',
}
# 층마다 **어느 층 밑으로 이어지는가** — 거기만 메운다.
#   갑옷은 허리띠·무기·망토깃 밑으로 이어진다. 장갑 밑으로는 안 이어진다(장갑을 벗으면 맨팔이다).
UNDER = {
    'armor': ['belt', 'weapon', 'shoulder_f', 'weapon_b', 'gloves'],
    'shoulder_b': ['weapon'],
    'shoulder_f': ['weapon'],
    'gloves': ['weapon'],
    'boots': ['weapon'],
    'belt': ['weapon'],
    'head': ['weapon'],
    'weapon_b': ['shoulder_f'],
}
REACH = {'armor': 10, 'shoulder_b': 38, 'head': 44}   # 몇 점 너비의 틈까지 메우나(반지름)

OL = np.array([26, 18, 16], np.float32)
SKIN = [np.array(c, np.float32) for c in [(150, 84, 62), (214, 144, 108), (243, 187, 146), (251, 210, 173), (255, 232, 210)]]

STATES = [
    ('기본', []),
    ('+갑옷', ['armor']),
    ('+어깨', ['armor', 'shoulder']),
    ('+장갑', ['armor', 'shoulder', 'gloves']),
    ('+신발', ['armor', 'shoulder', 'gloves', 'boots']),
    ('+벨트', ['armor', 'shoulder', 'gloves', 'boots', 'belt']),
    ('+무기', ['armor', 'shoulder', 'gloves', 'boots', 'belt', 'weapon']),
]
SOLO = [('무기만', ['weapon']), ('어깨만', ['shoulder']), ('장갑·신발만', ['gloves', 'boots']), ('벨트만', ['belt'])]


def closing(m, r):
    d1 = ndi.distance_transform_edt(~m)
    dil = d1 <= r
    d2 = ndi.distance_transform_edt(dil)
    return d2 > r


def recolor_skin(rgb, m):
    """장갑 낀 손을 맨손으로 — 밝기를 살색 사다리에 옮긴다. 선(어두운 점)과 원래 살은 그대로."""
    out = rgb.astype(np.float32).copy()
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    skin = (r > 185) & (g > 120) & (b > 85) & (r > g) & (g > b) & ((r - b) > 35)
    line = lum < 42
    body = m & ~skin & ~line
    lo, hi = (np.percentile(lum[body], [8, 97]) if body.sum() > 30 else (42, 190))
    # 장갑 가죽의 밝기 폭을 살 밝기 폭에 맞춘다 — 그대로 옮기면 짙은 가죽이 **거무튀튀한 손**이 된다
    t = np.clip((lum - lo) / max(hi - lo, 1), 0, 1)
    t = (0.35 + 0.65 * t) * (len(SKIN) - 1)
    i0 = np.floor(t).astype(int).clip(0, len(SKIN) - 2)
    fr = (t - i0)[..., None]
    lut = np.stack(SKIN)
    col = lut[i0] * (1 - fr) + lut[i0 + 1] * fr
    # 선은 **손의 테두리와 손가락 사이**만 남긴다 — 장갑 등의 바늘땀·주름선은 살로 덮는다
    edge = ndi.distance_transform_edt(m) <= 6
    near_skin = ndi.distance_transform_edt(~skin) <= 4
    keep_line = line & (edge | near_skin)
    tgt = m & ~skin & ~keep_line
    out[tgt] = col[tgt]
    # 장갑의 바늘땀·가죽 결이 살 위에 남지 않게 한 번 문지른다(선은 그대로)
    sm = cv2.medianBlur(out.clip(0, 255).astype(np.uint8), 5).astype(np.float32)
    out[tgt] = sm[tgt]
    return out


class Class:
    def __init__(self, name):
        self.name = name
        self.im, self.lab, _ = RP.segment(name)
        self.extra = RP.EXTRA.get(name, {})
        self.rgb = self.im[..., :3].astype(np.float32)
        self.alpha = self.im[..., 3] > 0
        self.z = Z[name]
        self.m = {l: self.lab == LID[l] for l in RP.LAYERS}
        base = np.asarray(Image.open(os.path.join(ROOT, 'art', 'parts', name, 'base.png')).convert('RGBA'))
        self.base_rgb = base[..., :3].astype(np.float32)
        self.base_a = (base[..., 3].astype(np.float32) / 255) * self.alpha
        torso = np.asarray(Image.open(os.path.join(ROOT, 'art', 'parts', name, 'base_torso.png')).convert('RGBA'))
        self.torso = torso[..., 3] > 128
        pose = json.load(open(os.path.join(ROOT, 'art', 'parts', name, 'pose.json')))
        tr, tg, tb = (torso[..., c].astype(int) for c in range(3))
        skinlike = (tr > 200) & (tg > 140) & (tr - tb > 50)
        yy = np.mgrid[0:H, 0:W][0]
        # 티·바지 — 갑옷을 입으면 **통째로 감춘다**. 갑옷보다 넓게 그려진 벗은 옷이 갑옷 가장자리로
        # 삐져나오면 안 되고(망토 밑 허벅지의 갈색), 갑옷이 벗은 옷을 드러내는 일은 없다.
        self.clothes = ndi.binary_dilation(self.torso & ~skinlike & (yy < pose['ankleY'] - 6), iterations=3) & ~skinlike
        # 팔 — 몸통만 구운 것과 다른 점(팔은 티 소매 밑에서 나와 손목까지)
        self.arms = (base[..., 3] > 128) & ((torso[..., 3] < 128) |
                     (np.abs(base[..., :3].astype(int) - torso[..., :3].astype(int)).sum(-1) > 30))
        # 맨손 — 왼손(늘 아래에) · 쥔 손(무기 위에)
        hand = self.extra.get('hand_l', np.zeros((H, W), bool)) & (self.m['skin'] | self.m['gloves'])
        grip = self.m['gskin'] | self.m['ggl']
        self.hand_rgb = recolor_skin(self.im[..., :3], hand) + recolor_skin(self.im[..., :3], grip) * 0
        self.hand_rgb[grip] = recolor_skin(self.im[..., :3], grip)[grip]
        self.hand_l = hand
        self.grip = grip
        # 쥔 손가락 사이로 보이던 칼자루 — 무기를 안 들면 그 자리는 **살**이다(주먹에 구멍이 나면 안 된다)
        hole = closing(grip, 10) & ~grip & self.alpha & self.m['weapon']
        self.grip_hole = hole
        if hole.any():
            _, (iy, ix) = ndi.distance_transform_edt(~(grip & self.m['gskin']) if (grip & self.m['gskin']).any() else ~grip,
                                                     return_indices=True)
            self.hand_rgb[hole] = self.hand_rgb[iy, ix][hole]
        self.fills = {}
        for layer, under in UNDER.items():
            self.fills[layer] = self._fill(layer, under)
        self.leg_ext = self._legs()
        self.backfill = self._backfill()

    # 가려 있던 자리 메우기 ─────────────────────────────────
    def _fill(self, layer, under):
        own = self.m[layer]
        if not own.any():
            return None
        over = np.zeros((H, W), bool)
        for u in under:
            over |= self.m[u]
        ext = closing(own, REACH.get(layer, 14))
        if layer == 'armor':
            # 갑옷은 **벗은 몸통이 있는 자리**(티·바지) 밑으로 이어진다 — 팔은 아니다.
            # 장갑(팔보호대) 밑도 몸통 자리는 튜닉이다 — 맨팔보다 보호대가 넓어서 그 틈에 티가 보이면 안 된다.
            ext |= self.torso & ~self.arms
            ext &= ~self.arms
        if layer in ('shoulder_b', 'weapon_b'):
            ext &= ~(self.base_a > 0.5)      # 몸 **뒤**의 것 — 벗은 몸 위로 번지면 팔 앞에 망토가 뜬다
        ext &= self.alpha & over
        if not ext.any():
            return None
        return ext, self._spread(own, ext)

    def _spread(self, own, ext):
        """own 의 색으로 ext(가려 있던 자리)를 메운다 — **둘레에서 가장 많은 색**으로 판판하게.

        만화 그림의 옷은 **판판한 색 몇 개**로 칠해져 있다. 옷의 색을 몇 개로 추리고, 메울 점마다
        둘레에서 가장 많이 보이는 색 하나를 고른다 — 가려진 튜닉은 그냥 파랗다.

        ⚠ 해 본 것들
          · cv2.inpaint — 메울 자리의 원래 색(허리띠 갈색)이 새어 나온다.
          · 가장 가까운 점의 색 — 금테·주름선이 줄무늬로 늘어난다.
          · 위아래·좌우 짧은 쪽으로 잇기 — 허리띠가 드리운 그늘과 금테가 줄로 늘어난다.
          · 구멍 바로 옆의 색까지 세면 — 허리띠의 **그늘**이 이겨서 허리에 짙은 네모가 뜬다.
            그래서 구멍에서 16점 안쪽은 세지 않는다.
        """
        lum = self.rgb.mean(-1)
        seed = own & (lum > 48)
        if seed.sum() < 20:
            seed = own
        cols = self.rgb[seed]
        k = int(min(5, max(2, len(cols) // 400)))
        sample = cols[:: max(1, len(cols) // 20000)].astype(np.float32)
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        cv2.setRNGSeed(7)
        _, _, centers = cv2.kmeans(sample, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
        d = ((cols[:, None, :] - centers[None]) ** 2).sum(-1)
        lab = d.argmin(1)
        ys, xs = np.where(seed)
        away = ndi.distance_transform_edt(~ext) > 16
        prior = np.bincount(lab, minlength=k).astype(np.float32)
        prior = (prior / prior.sum()) ** 2
        score = np.zeros((k, H, W), np.float32)
        for j in range(k):
            ind = np.zeros((H, W), np.float32)
            ind[ys[lab == j], xs[lab == j]] = 1
            score[j] = ndi.gaussian_filter(ind * away, 22.0) * prior[j]
        best = score.argmax(0)
        far = score.max(0) < 1e-5
        if far.any():
            nl = np.zeros((H, W), np.int64)
            nl[ys, xs] = lab
            _, (iy, ix) = ndi.distance_transform_edt(~seed, return_indices=True)
            best[far] = nl[iy, ix][far]
        best = ndi.median_filter(best, 13)
        img = centers[best].astype(np.float32)
        # 살짝 그늘 — 둘레 밝기를 크게 흐려 곱한다(판판하되 죽지 않게)
        sl = seed & away
        shade = ndi.gaussian_filter(np.where(sl, lum, 0), 14) / np.maximum(ndi.gaussian_filter(sl.astype(np.float32), 14), 1e-3)
        base_l = centers.mean(1)[best]
        ratio = np.clip(shade / np.maximum(base_l, 1), 0.85, 1.15)
        return img * np.where(ext, ratio, 1)[..., None]

    def _legs(self):
        """신발을 벗으면 갑옷 바지가 발목까지 내려와야 한다 — 벗은 몸의 바지 자리를 갑옷 바지 색으로."""
        yy = np.mgrid[0:H, 0:W][0]
        pose = json.load(open(os.path.join(ROOT, 'art', 'parts', self.name, 'pose.json')))
        pants_base = (self.base_a > 0.5) & (yy > 800) & (yy <= pose['ankleY'] + 3)
        ext = pants_base & self.m['boots']
        if not ext.any():
            return None
        # 갑옷 바지의 아랫단 바로 위 색
        band = self.m['armor'] & (np.mgrid[0:H, 0:W][0] > 770) & (np.mgrid[0:H, 0:W][0] < 840)
        if band.sum() < 50:
            return None
        ref_col = np.median(self.rgb[band], 0)
        lum_b = self.base_rgb.mean(-1, keepdims=True)
        img = np.clip(ref_col * (lum_b / 90.0), 0, 255)
        return ext, img

    def _backfill(self):
        """몸 뒤 — 망토 안감(몸통에 가렸던 부분)."""
        out = []
        cape = self.m['shoulder_b']
        if cape.any():
            ys, xs = np.where(cape)
            dark = cape & (self.rgb.mean(-1) < 90) & (self.rgb.mean(-1) > 25)
            col = np.median(self.rgb[dark], 0) if dark.sum() > 50 else np.array([100, 20, 35])
            # 망토 안감 = 망토(등·깃) 전체의 볼록 껍질 — 어깨에서 망토 끝까지, 몸 뒤를 통째로 덮는다
            allc = cape | self.m['shoulder_f']
            pts = np.column_stack(np.where(allc)[::-1]).astype(np.int32)
            hull = cv2.convexHull(pts)
            reg = np.zeros((H, W), np.uint8)
            cv2.fillPoly(reg, [hull.reshape(-1, 2)], 1)
            region = reg.astype(bool)
            region &= self.alpha
            img = np.zeros((H, W, 3), np.float32) + col
            out.append(('shoulder', region, img))
        return out

    # 한 장 ────────────────────────────────────────────────
    def compose(self, slots):
        on = lambda layer: SLOT[layer] is None or SLOT[layer] in slots
        rgb = np.zeros((H, W, 3), np.float32)
        a = np.zeros((H, W), np.float32)
        src = np.zeros((H, W), np.int16)          # 0 빈칸 · 1 몸 · 2 뒤채움 · 10+ 층
        def put(mask, img, code, alpha=None):
            nonlocal rgb, a
            al = mask.astype(np.float32) if alpha is None else alpha * mask
            rgb = rgb * (1 - al[..., None]) + img * al[..., None]
            a = a * (1 - al) + al
            src[al > 0.5] = code
        for slot, region, img in self.backfill:
            if slot in slots:
                put(region, img, 2)
        base_a = self.base_a * ~self.clothes if 'armor' in slots else self.base_a
        put(np.ones((H, W), bool), self.base_rgb, 1, base_a)
        put(self.hand_l, self.hand_rgb, 1)
        for layer in self.z:
            if layer in ('gskin', 'ggl'):
                continue
            if not on(layer):
                continue
            code = 10 + LID[layer]
            f = self.fills.get(layer)
            if f is not None:
                # 메운 자리는 **가리던 것이 없을 때만** 보인다 — 지팡이를 들면 지팡이 밑 머리칼은 안 그린다
                hid = np.zeros((H, W), bool)
                for u in UNDER.get(layer, []):
                    if on(u):
                        hid |= self.m[u]
                put(f[0] & ~hid, f[1], code)
            if layer == 'armor' and self.leg_ext is not None and 'boots' not in slots:
                put(self.leg_ext[0], self.leg_ext[1], code)
            put(self.m[layer], self.rgb, code)
            if layer == 'weapon':
                # 쥔 손 — 무기보다 앞
                put(self.grip, self.hand_rgb, 1)
                put(self.m['gskin'], self.rgb, 10 + LID['gskin'])
                if 'gloves' in slots:
                    put(self.m['ggl'], self.rgb, 10 + LID['ggl'])
        if 'weapon' not in self.z or not on('weapon'):
            put(self.grip | self.grip_hole, self.hand_rgb, 1)
            put(self.m['gskin'], self.rgb, 10 + LID['gskin'])
            if 'gloves' in slots:
                put(self.m['ggl'], self.rgb, 10 + LID['ggl'])
        # ⑤ 새로 드러난 경계에 테두리
        exposed = (src == 1) | ((src == 0) & self.alpha)
        d = ndi.distance_transform_edt(~exposed)
        edge = ((src >= 10) | (src == 2)) & (d <= 3.2)
        k = np.clip((3.6 - d) / 1.6, 0, 1) * edge
        rgb = rgb * (1 - k[..., None]) + OL * k[..., None]
        a = a * self.alpha
        return np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)


def shrink(img, size=(192, 256)):
    """미리 곱한 알파로 줄인다 — 가장자리에 검은 테가 끼지 않는다."""
    f = img.astype(np.float32) / 255
    pm = f.copy(); pm[..., :3] *= pm[..., 3:4]
    ims = [Image.fromarray((pm[..., c] * 255).astype(np.uint8)).resize(size, Image.LANCZOS) for c in range(4)]
    arr = np.stack([np.asarray(i).astype(np.float32) / 255 for i in ims], -1)
    al = arr[..., 3:4]
    rgb = np.where(al > 1e-3, arr[..., :3] / np.maximum(al, 1e-3), 0)
    out = Image.fromarray((np.dstack([rgb, al]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')
    rgbp = out.convert('RGB').filter(ImageFilter.UnsharpMask(0.8, 60, 2))
    out = Image.merge('RGBA', (*rgbp.split(), out.split()[3]))
    return out


def main():
    names = [a for a in sys.argv[1:] if not a.startswith('--')] or ['warrior', 'ranger', 'mage']
    meta = {}
    for nm in names:
        c = Class(nm)
        RP.save(nm, c.im, c.lab)
        out = os.path.join(ROOT, 'art', 'parts', nm)
        rows = []
        for i, (label, slots) in enumerate(STATES + SOLO):
            img = c.compose(set(slots))
            Image.fromarray(img, 'RGBA').save(os.path.join(out, f'state_{i}.png'))
            shrink(img).save(os.path.join(out, f'state_{i}_s.png'))
            rows.append({'i': i, 'label': label, 'slots': slots})
        full = c.compose({'armor', 'shoulder', 'gloves', 'boots', 'belt', 'weapon'})
        diff = np.abs(full.astype(int) - c.im.astype(int))[c.alpha].max()
        meta[nm] = {'states': rows, 'full_vs_ref_maxdiff': int(diff)}
        print('✓', nm, '다 입힘 vs 준 그림 최대 차이', int(diff))
    json.dump(meta, open(os.path.join(ROOT, 'art', 'parts', 'states.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
