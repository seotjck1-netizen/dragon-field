#!/usr/bin/env python3
"""주인공 그림 시안 ② — 지금 손그림(0.70) 그대로 입체에 입혀 8방향 · 걷기 · 달리기. 진짜 들판 위 영상.

  python3 tools/paint3d/preview.py PNG_ROOT OUT_DIR --bg FIELD.png
  PNG_ROOT 안: png_m1(남 맨몸) · png_k2(기사 갑옷 + 칼) · png_f1(여 깨끗한) · png_f2(여 거친) 과 각각의 _320 — toon.py 가 만든 것
  FIELD.png: 들판 화면 1280x960(tools/hero3d/bgshot.js 로 찍는다)
"""
import math
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

import json
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.abspath(sys.argv[1])
OUT = sys.argv[2]
BG_PATH = sys.argv[sys.argv.index('--bg') + 1]
_D = json.load(open(os.path.join(ROOT, 'src/data/bodies.json')))
_L = {}


def compose(body, scene, keys):
    """지금(0.70) 몸 그림 — BodyLook 과 같은 규칙으로 층을 겹친다."""
    im = Image.new('RGBA', (_D['scenes'][scene],) * 2, (0, 0, 0, 0))
    layers = _D['bodies'][body]['layers']
    for k in keys:
        r = layers[k]['rects'].get(scene) or layers[k]['rects'].get(_D.get('sceneOf', {}).get(scene, ''))
        if not r:
            continue
        if (body, k) not in _L:
            _L[(body, k)] = Image.open(os.path.join(ROOT, f'assets/bodies/{body}/{k}.webp')).convert('RGBA')
        x, y, w, h, ox, oy = r
        im.alpha_composite(_L[(body, k)].crop((x, y, x + w, y + h)), (ox, oy))
    return im

os.makedirs(OUT, exist_ok=True)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
FONTB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc'
f = lambda size, black=False: ImageFont.truetype(FONTB if black else FONT, size, index=1)

BG = Image.open(BG_PATH).convert('RGBA')
VIEW = (0, 120, 1280, 840)
SPR = 184           # 160 틀 → 92 논리 픽셀 × 2배 화면
FOOT = 157 / 160    # 틀 안 발바닥 높이
TILE = 64
FPS = 30
CACHE = {}


def sprite(kind, action, k, yaw):
    key = (kind, action, k, yaw)
    if key not in CACHE:
        d = KIND_DIR[kind]
        im = Image.open(os.path.join(HERE, d, f'{action}_{k}_{yaw:03d}.png')).convert('RGBA')
        CACHE[key] = im.resize((SPR, SPR), Image.LANCZOS)
    return CACHE[key]


KIND_DIR = {'m': 'png_m1', 'k': 'png_k2', 'f': 'png_f1', 'g': 'png_f2'}
NOW_SCENE = {0: 'stand', 45: 'stand_fs', 90: 'stand_s', 135: 'stand_b', 180: 'stand_b', 225: 'stand_b', 270: 'stand_sl', 315: 'stand_fsl'}
NOW_WALK = {0: '', 45: '_fs', 90: '_s', 135: '_b', 180: '_b', 225: '_b', 270: '_sl', 315: '_fsl'}


def now_sprite(yaw, phase=None, body='m1'):
    """지금(0.70) 그림 — 맨몸. phase 가 있으면 걷는 박자(walk1 · stand · walk2 · stand)"""
    if phase is None:
        scene = NOW_SCENE[yaw]
    else:
        beat = ['walk1', 'stand', 'walk2', 'stand'][phase % 4]
        scene = beat + NOW_WALK[yaw]
    key = ('now', body, scene)
    if key not in CACHE:
        CACHE[key] = compose(body, scene, ['base']).resize((SPR, SPR), Image.LANCZOS)
    return CACHE[key]


def shadow(canvas, x, y):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([x - 23, y - 9, x + 23, y + 9], fill=(0, 0, 0, 70))
    canvas.alpha_composite(sh)


def put(canvas, im, x, y):
    canvas.alpha_composite(im, (int(round(x - SPR / 2)), int(round(y - SPR * FOOT))))


def caption(canvas, title, sub):
    d = ImageDraw.Draw(canvas, 'RGBA')
    w = max(d.textlength(title, font=f(26, True)), d.textlength(sub, font=f(19))) + 40
    d.rounded_rectangle([20, 20, 20 + w, 104], radius=14, fill=(10, 14, 22, 200))
    d.text((38, 28), title, font=f(26, True), fill=(255, 226, 150))
    d.text((38, 68), sub, font=f(19), fill=(220, 230, 240))


def label(canvas, x, y, text):
    d = ImageDraw.Draw(canvas, 'RGBA')
    w = d.textlength(text, font=f(20, True)) + 24
    d.rounded_rectangle([x - w / 2, y, x + w / 2, y + 34], radius=10, fill=(10, 14, 22, 190))
    d.text((x - w / 2 + 12, y + 4), text, font=f(20, True), fill=(255, 236, 190))


def frame_bg():
    return BG.crop(VIEW).copy()


class Seq:
    def __init__(self, path):
        self.path = path
        shutil.rmtree(path, ignore_errors=True)
        os.makedirs(path)
        self.n = 0

    def add(self, im, times=1):
        rgb = im.convert('RGB')
        for _ in range(times):
            rgb.save(os.path.join(self.path, f'{self.n:05d}.jpg'), quality=92)
            self.n += 1


def title_card(seq, title, sub, secs=1.6):
    im = Image.new('RGBA', (1280, 720), (14, 18, 26, 255))
    d = ImageDraw.Draw(im)
    t0 = '주인공 그림 시안 ② · 0.80.01 — 그림체는 지금 그대로'
    d.text(((1280 - d.textlength(t0, font=f(24))) / 2, 250), t0, font=f(24), fill=(150, 165, 185))
    d.text(((1280 - d.textlength(title, font=f(52, True))) / 2, 292), title, font=f(52, True), fill=(255, 226, 150))
    d.text(((1280 - d.textlength(sub, font=f(22))) / 2, 372), sub, font=f(22), fill=(215, 225, 235))
    seq.add(im, int(secs * FPS))


DIR_NAME = {0: '아래', 45: '오른쪽 아래', 90: '오른쪽', 135: '오른쪽 위', 180: '위', 225: '왼쪽 위', 270: '왼쪽', 315: '왼쪽 아래'}
TURN = [0, 45, 90, 135, 180, 225, 270, 315]


def turn_compare(seq, secs_per=0.6):
    """제자리에서 돌기 — 지금(0.70) 남 · 여 와 시안③ 넷"""
    per = int(secs_per * FPS)
    for yaw in TURN + [0]:
        for i in range(per):
            im = frame_bg()
            k = (i // 9) % 2
            cy = 470
            cast = ((150, now_sprite(yaw), '지금 남'), (290, now_sprite(yaw, body='f1'), '지금 여'),
                    (500, sprite('m', 'idle', k, yaw), '시안③ 남'), (650, sprite('f', 'idle', k, yaw), '시안③ 여'),
                    (800, sprite('g', 'idle', k, yaw), '시안③ 여 거친'), (960, sprite('k', 'idle', k, yaw), '시안③ 기사'))
            for (x, spr, name) in cast:
                shadow(im, x, cy - 3)
                put(im, spr, x, cy)
                label(im, x, cy + 24, name)
            caption(im, '제자리에서 돌아서기 — 8방향', f'지금 보는 쪽: {DIR_NAME[yaw]}  ·  지금은 옆을 봐도 몸이 정면 그대로 · 시안③ 은 손그림 그대로 몸 전체가 돌고, 빛 · 그늘이 입체를 따른다')
            seq.add(im)


def octagon(cx, cy, L):
    """E SE S SW W NW N NE 순서로 한 바퀴(시작점 = 끝점)."""
    dirs = [(90, 1, 0), (45, 1, 1), (0, 0, 1), (315, -1, 1), (270, -1, 0), (225, -1, -1), (180, 0, -1), (135, 1, -1)]
    pts = [(0.0, 0.0)]
    for _, dx, dy in dirs:
        n = math.hypot(dx, dy)
        x, y = pts[-1]
        pts.append((x + dx / n * L, y + dy / n * L))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    ox = cx - (min(xs) + max(xs)) / 2
    oy = cy - (min(ys) + max(ys)) / 2
    return [(dirs[i][0], (pts[i][0] + ox, pts[i][1] + oy), (pts[i + 1][0] + ox, pts[i + 1][1] + oy)) for i in range(8)]


def loop(seq, kind, action, speed_px_s, title, sub, L=150, laps=1):
    segs = octagon(560, 385, L)
    cycle = 4 * TILE / speed_px_s     # 네 칸에 걸음 한 바퀴(지금 게임과 같은 박자)
    t = 0.0
    dt = 1 / FPS
    for _ in range(laps):
        for yaw, a, b in segs:
            dist = math.hypot(b[0] - a[0], b[1] - a[1])
            T = dist / speed_px_s
            s = 0.0
            while s < T:
                u = s / T
                x = a[0] + (b[0] - a[0]) * u
                y = a[1] + (b[1] - a[1]) * u
                k = int((t / cycle) * 8) % 8
                im = frame_bg()
                shadow(im, x, y - 3)
                put(im, sprite(kind, action, k, yaw), x, y)
                caption(im, title, f'{sub}  ·  지금 가는 쪽: {DIR_NAME[yaw]}')
                seq.add(im)
                s += dt
                t += dt
    # 멈춰 선다
    yaw, a, b = segs[-1]
    for i in range(int(0.6 * FPS)):
        im = frame_bg()
        shadow(im, b[0], b[1] - 3)
        put(im, sprite(kind, 'idle', (i // 9) % 2, yaw), b[0], b[1])
        caption(im, title, sub)
        seq.add(im)


def encode(seq_dir, out):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(seq_dir, '%05d.jpg'),
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', out], check=True)


BIG = {}
def big(kind, action, k, yaw):
    key = (kind, action, k, yaw)
    if key not in BIG:
        d = KIND_DIR[kind] + '_320'
        BIG[key] = Image.open(os.path.join(HERE, d, f'{action}_{k}_{yaw:03d}.png')).convert('RGBA')
    return BIG[key]


GRID_ORDER = [225, 180, 135, 270, 90, 315, 0, 45]   # 화면 방향 그대로 놓는다(가운데 빈 칸)
GRID_POS = [(0, 0), (1, 0), (2, 0), (0, 1), (2, 1), (0, 2), (1, 2), (2, 2)]


def eight(seq, kind, action, secs, title, sub, frame_ms):
    """8방향을 한꺼번에 — 3×3 칸에 보는 쪽 그대로(가운데 칸은 비움). 크게(2배)."""
    bgc = BG.crop((200, 200, 1000, 760)).resize((1600, 1120), Image.NEAREST).crop((160, 200, 1440, 920))
    shade = Image.new('RGBA', bgc.size, (8, 12, 18, 110))
    base = bgc.copy()
    base.alpha_composite(shade)
    cw, chh = 300, 192
    ox, oy = (1280 - cw * 3) // 2, 112
    for i in range(int(secs * FPS)):
        im = base.copy()
        k = int(i * 1000 / FPS / frame_ms) % (2 if action == 'idle' else 8)
        for yaw, (cx, cy) in zip(GRID_ORDER, GRID_POS):
            x0, y0 = ox + cx * cw, oy + cy * chh
            spr = big(kind, action, k, yaw).crop((60, 20, 260, 320)).resize((133, 200), Image.LANCZOS)
            sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
            ImageDraw.Draw(sh).ellipse([x0 + cw / 2 - 30, y0 + 190, x0 + cw / 2 + 30, y0 + 204], fill=(0, 0, 0, 80))
            im.alpha_composite(sh)
            im.alpha_composite(spr, (int(x0 + cw / 2 - 66), int(y0 + 2)))
        d = ImageDraw.Draw(im)
        arrow = '↖ ↑ ↗  ← · →  ↙ ↓ ↘'
        d.text((ox + cw + 40, oy + chh + 80), '8방향', font=f(30, True), fill=(255, 226, 150))
        caption(im, title, sub)
        seq.add(im)


if __name__ == '__main__':
    WALK = 452   # 2배 화면 px/s — 기본 120%(한 칸 141.7ms)
    RUN = 565    # 150%(날랜 발 다섯 점)
    seq = Seq(os.path.join(OUT, '_seq'))
    title_card(seq, '시안③ — 0.70 손그림 + 3D 입체감 · 남녀', '지금 앞 · 뒤 손그림을 입체에 입혀 돌리고, 시안① 의 빛 · 그늘(셀 음영)과 선을 얹었다 — 실제 들판 화면 위')
    turn_compare(seq)
    eight(seq, 'f', 'walk', 3.0, '8방향 한꺼번에 — 여자 걷기(가까이)', '긴 머리칼이 어깨 밖으로 늘어지고, 뒤 · 옆이 한눈에 갈린다', 71)
    eight(seq, 'k', 'walk', 3.0, '8방향 한꺼번에 — 기사 갑옷 걷기(가까이)', '칸마다 그쪽으로 걸을 때의 모습 · 무기는 늘 오른손', 71)
    eight(seq, 'm', 'run', 2.6, '8방향 한꺼번에 — 남자 달리기(가까이)', '날랜 발 셋째 점부터 · 다섯 점이면 150%', 57)
    eight(seq, 'g', 'run', 2.6, '8방향 한꺼번에 — 여자(거친) 달리기(가까이)', '앞으로 기울고 팔을 접어 흔든다', 57)
    loop(seq, 'f', 'walk', WALK, '걷기 — 여자(깨끗한 차림)', '기본 이동 120%')
    loop(seq, 'k', 'walk', WALK, '걷기 — 기사 갑옷 · 칼(오른손)', '기본 이동 120%')
    loop(seq, 'g', 'run', RUN, '달리기 — 여자(거친 차림)', '날랜 발 다섯 점 150%')
    loop(seq, 'm', 'walk', WALK, '걷기 — 남자 맨몸(시작 옷)', '앞머리 · 뒤통수 · 옆얼굴이 방향마다 다르게')
    encode(seq.path, os.path.join(OUT, 'hero-8dir.mp4'))
    shutil.rmtree(seq.path)
    print('ok', seq.n)
