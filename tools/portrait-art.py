#!/usr/bin/env python3
"""
대화창 얼굴 그림 (0.70.33) — 대화창 왼쪽에 뜨는 얼굴을 **크고 선명하게** 새로 굽는다.

    python3 tools/portrait-art.py              # → assets/ui/portraits/*.webp · manifest(portrait_<그림 이름>)
    python3 tools/portrait-art.py --preview    # art/preview/portraits.png 만 다시

── 왜 ─────────────────────────────────────────────────────────
0.70.32 까지 대화창 얼굴은 **들판 그림(92×92, 파일 184×184)을 그대로 키워** 흉상 자리만 보여 줬다.
얼굴이 파일에서 30점 남짓이라, 칸(66×88)에 맞춰 키우면 흐리고 작았다.

── 어떻게 ──────────────────────────────────────────────────────
  · 마을 사람: 들판 그림과 **같은 사람**(tools/npc-art.py 의 build_npc · 같은 옷 · 같은 머리색 · 같은 손에 든 것)을
    굽는 틀(1280) 크기 그대로 그린 뒤, 얼굴 둘레(머리 위 ~ 가슴)만 잘라 줄인다. 얼굴이 파일에서 100점 남짓.
  · 물건(웨이포인트 돌 · 의뢰 게시판 · 표지판): 같은 그림체의 svg 를 크게 구워 칸에 통째로 앉힌다.
  · 바탕: 사람마다 어울리는 빛(대장장이는 불빛 주황, 마녀는 보랏빛 …)의 둥근 빛 + 가장자리 어둠,
    사람 뒤에 옅은 그림자, 왼쪽 위 가장자리에 은은한 테두리 빛.
  · 파일 264×330(화면 132×165 의 두 배 — 고해상도 화면에서도 선명), webp.
  · 게임은 `portrait_<대화창이 받은 그림 이름>` 이 있으면 그것을, 없으면 예전처럼 들판 그림을 쓴다(src/ui/DialogueBox.js).
"""
import importlib.util
import json
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def _load(name, file):
    sp = importlib.util.spec_from_file_location(name, os.path.join(ROOT, 'tools', file))
    m = importlib.util.module_from_spec(sp)
    sp.loader.exec_module(m)
    return m


NA = _load('npc_art', 'npc-art.py')
BR, GA = NA.BR, NA.GA
TA = _load('tile_art', 'tile-art.py')

OUT = os.path.join(ROOT, 'assets', 'ui', 'portraits')
TMP = os.path.join(ROOT, 'art', 'portraits')
OW, OH = 264, 330           # 파일(화면 132×165 의 두 배)
WIN_W = 380                 # 굽는 틀(1280)에서 잘라 올 폭 — 얼굴 폭(161)의 2.4 배
EYE_AT = 0.46               # 눈 높이(칸 위에서 46%)

# 그림 이름(art/npc) → 게임 그림 이름(대화창이 받는 이름)
GAME = {
    'shopkeeper': 'npc_shopkeeper', 'blacksmith': 'npc_blacksmith', 'royal_smith': 'npc_royal_smith',
    'alchemist': 'npc_alchemist', 'innkeeper': 'npc_innkeeper', 'villager_elder': 'npc_elder',
    'villager_kid': 'npc_kid', 'gate_guard': 'npc_guard', 'king': 'npc_king', 'gate_merchant': 'npc_gate_merchant',
    'dungeon_warden': 'npc_warden', 'gem_gambler': 'npc_gambler', 'witch': 'npc_witch',
}
# 바탕 빛 — (가운데 빛, 바탕, 가장자리 어둠)
THEME = {
    'npc_shopkeeper': ('#f6dca0', '#b98c52', '#2e2012'),
    'npc_blacksmith': ('#ffb36a', '#b5562a', '#26100a'),
    'npc_royal_smith': ('#cfe0ff', '#4f78b4', '#101a2e'),
    'npc_alchemist': ('#b8f0dc', '#358f7c', '#0b2420'),
    'npc_innkeeper': ('#ffd2b0', '#c0684e', '#2c120e'),
    'npc_elder': ('#e6eab8', '#7d8f52', '#1a200f'),
    'npc_kid': ('#d8f0ff', '#68a8d8', '#14283e'),
    'npc_guard': ('#dce6f6', '#62809f', '#121a28'),
    'npc_king': ('#ffe7a0', '#b4404c', '#2e0a10'),
    'npc_gate_merchant': ('#d6efb8', '#548c50', '#10200f'),
    'npc_warden': ('#ffd08a', '#4f586c', '#0a0c12'),
    'npc_gambler': ('#f0d8ff', '#8a5ec4', '#180c28'),
    'npc_witch': ('#d4ffd0', '#6a4cb8', '#120a22'),
    'npc_waypoint': ('#d0ecff', '#4a8ed0', '#0a1628'),
    'npc_quest_board': ('#fbe8be', '#bf9a5c', '#2e2010'),
    'tile_signpost': ('#e2f4c8', '#78ac5c', '#162812'),
}
LABEL = {
    'npc_waypoint': '웨이포인트 돌', 'npc_quest_board': '의뢰 게시판', 'tile_signpost': '표지판',
}


def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


# ─────────────────────────────────────────────────────────────
# 바탕 · 그림자 · 테두리 빛
# ─────────────────────────────────────────────────────────────
def backdrop(key):
    lit, mid, dk = (hexf(c) for c in THEME[key])
    yy, xx = np.mgrid[0:OH, 0:OW].astype(np.float32)
    # 둥근 빛 — 얼굴 뒤(왼쪽 위로 조금)
    r = np.hypot((xx - OW * .44) / OW, (yy - OH * .36) / OH * .85)
    t = np.clip(r / .62, 0, 1)
    col = np.where(t[..., None] < .45,
                   lit * (1 - t[..., None] / .45) + mid * (t[..., None] / .45),
                   mid * (1 - (t[..., None] - .45) / .55) + dk * ((t[..., None] - .45) / .55))
    # 비스듬한 빛줄기 둘(아주 옅게)
    for off, w in ((-.05, .07), (.22, .045)):
        u = ((xx / OW) * .8 + (yy / OH) * .6) - .55 - off
        band = np.exp(-(u / w) ** 2) * (1 - yy / OH) * .10
        col = col + band[..., None] * (lit - col)
    # 아래쪽은 조금 더 어둡게(바닥) · 모서리 어둠
    col *= (1 - .28 * (yy / OH) ** 2)[..., None]
    vig = np.hypot((xx - OW / 2) / (OW / 2), (yy - OH / 2) / (OH / 2))
    col *= (1 - .32 * np.clip(vig - .55, 0, 1) ** 1.4)[..., None]
    # 띠 무늬가 안 생기게 아주 옅은 알갱이
    rng = np.random.default_rng(len(key))
    col += rng.normal(0, .008, col.shape).astype(np.float32)
    return np.clip(col, 0, 1)


def compose(key, fig):
    """fig: OW×OH RGBA(직선 알파, float 0~1) — 바탕에 그림자 · 몸 · 테두리 빛을 얹는다."""
    lit = hexf(THEME[key][0])
    bg = backdrop(key)
    a = fig[..., 3]
    # 그림자 — 오른쪽 아래로 흐리게
    sh = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))).astype(np.float32) / 255
    sh = np.roll(np.roll(sh, 6, 0), 5, 1)
    bg = bg * (1 - .38 * sh[..., None])
    rgb = fig[..., :3]
    # 테두리 빛 — 왼쪽 위에서 오는 빛이 몸 가장자리에 닿는다
    up = np.zeros_like(a)
    up[3:, 3:] = a[:-3, :-3]
    edge = np.clip(a - up, 0, 1) * (a > .5)
    edge = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(.8))).astype(np.float32) / 255
    rgb = rgb * (1 - .32 * edge[..., None]) + (lit * .55 + .45) * (.32 * edge[..., None])
    out = bg * (1 - a[..., None]) + rgb * a[..., None]
    return Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB')


def pm_to_fig(pm):
    """미리 곱한 RGBA(0~1) → OW×OH 직선 알파(0~1). 미리 곱한 채로 줄여야 가장자리에 검은 테가 안 낀다."""
    im = BR.to_image(pm, (OW, OH))
    return np.asarray(im).astype(np.float32) / 255


# ─────────────────────────────────────────────────────────────
# 마을 사람
# ─────────────────────────────────────────────────────────────
def person(nid, d):
    body = NA.build_npc(nid, d)
    # 손에 든 것은 뺀다 — 흉상 칸 가장자리에 자루 끝만 잘려 들어온다(창 · 홀 · 지팡이)
    q, gear = NA.pose_for(body, {k: v for k, v in d.items() if k != 'prop'})
    pm, _ = body.render(q, gear)
    f = NA.face_geo(GA.geo(d['body']))
    ox = oy = 256                                    # 굽는 틀(1280) 안의 몸 틀(768×1024) 자리
    cx, eye = f['cx'] + ox, f['eye'] + oy
    ww = WIN_W * (1.06 if d.get('scale', 1) < 1 else 1)   # 아이는 조금 멀리서(몸이 작다)
    wh = ww * OH / OW
    x0, y0 = int(round(cx - ww / 2)), int(round(eye - EYE_AT * wh))
    x1, y1 = int(round(x0 + ww)), int(round(y0 + wh))
    pad = np.zeros((pm.shape[0] + 800, pm.shape[1] + 800, 4), np.float32)
    pad[400:400 + pm.shape[0], 400:400 + pm.shape[1]] = pm
    crop = pad[y0 + 400:y1 + 400, x0 + 400:x1 + 400]
    return pm_to_fig(crop)


# ─────────────────────────────────────────────────────────────
# 물건 — svg 를 크게 구워 칸에 앉힌다
# ─────────────────────────────────────────────────────────────
def quest_board_svg():
    """의뢰 게시판(대화창용) — 기와 지붕 · 코르크 판 · 핀으로 꽂은 의뢰서 넷 · 두 기둥. 마을과 같은 붓."""
    P, F, L, T, shade = TA.P, TA.F, TA.L, TA.T, TA.shade
    W_, H_ = 600, 700
    cx = W_ / 2
    s = TA.shadow(cx, 668, 200, 22, .35)
    for x in (cx - 150, cx + 150):                                               # 기둥
        post = GA.poly_path([(x - 20, 330), (x + 20, 330), (x + 22, 668), (x - 22, 668)])
        s += P(post, T('wood', 'tv')) + L(f'M{x - 8} 350 L{x - 8} 650', TA.PAL['wood'][1], 5, .6)
    board = GA.poly_path([(cx - 230, 150), (cx + 230, 150), (cx + 230, 470), (cx - 230, 470)])
    s += P(board, T('wood', 'tg')) + shade(board, 'wood', 6, 10)
    cork = GA.poly_path([(cx - 200, 178), (cx + 200, 178), (cx + 200, 444), (cx - 200, 444)])
    s += P(cork, '#b98a52', 5) + GA.clip(GA.uid('ck'), cork, ''.join(
        f'<circle cx="{cx - 190 + (i * 53) % 390}" cy="{190 + (i * 37) % 250}" r="3" fill="#8e6436" opacity=".6"/>' for i in range(40)))
    papers = [(cx - 170, 196, 150, 112, -3, '#e74c3c'), (cx + 6, 204, 160, 120, 2.5, '#f1c40f'),
              (cx - 150, 320, 140, 108, 2, '#3fa7e0'), (cx + 30, 334, 150, 96, -2, '#7ac74f')]
    for x, y, w, h, rot, pin in papers:
        pg = GA.poly_path([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])
        lines = ''.join(TA.L(f'M{x + 16} {y + 30 + k * 20} L{x + w - 18 - (k % 2) * 30} {y + 30 + k * 20}', '#8a7a5e', 6, .85) for k in range(int((h - 30) / 20)))
        s += f'<g transform="rotate({rot} {x + w / 2} {y + h / 2})">{P(pg, "#f4ecd8", 4)}{F(GA.poly_path([(x, y + h - 14), (x + w, y + h - 14), (x + w, y + h), (x, y + h)]), "#d8ccb0", .8)}{lines}' \
             f'<circle cx="{x + w / 2}" cy="{y + 12}" r="10" fill="{pin}" stroke="{GA.OL}" stroke-width="3"/>' \
             f'<circle cx="{x + w / 2 - 3}" cy="{y + 9}" r="3.5" fill="#ffffff" opacity=".8"/></g>'
    roof = GA.poly_path([(cx - 270, 160), (cx, 60), (cx + 270, 160), (cx + 250, 178), (cx - 250, 178)])
    s += P(roof, '#b8413a') + GA.clip(GA.uid('rf'), roof, ''.join(
        TA.L(f'M{cx - 270 + k * 40} 200 L{cx - 230 + k * 40 + (k - 7) * 6} 60', '#8e2c28', 4, .7) for k in range(15))
        + F(GA.poly_path([(cx - 270, 160), (cx, 60), (cx, 90), (cx - 240, 170)]), '#e0685c', .55))
    s += TA.L(f'M{cx - 270} 160 L{cx} 60 L{cx + 270} 160', GA.OL, 9)
    return s, W_, H_


def svg_png(body, w, h, scale, name):
    os.makedirs(TMP, exist_ok=True)
    sp = os.path.join(TMP, f'{name}.svg')
    W2, H2 = int(w * scale), int(h * scale)
    open(sp, 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W2}" height="{H2}" viewBox="0 0 {w} {h}">'
                        f'<defs>{GA.DEFS}{GA.WDEFS}{TA.TDEFS}{NA.DEFS_EXTRA}</defs>{body}</svg>')
    out = os.path.join(TMP, f'{name}.png')
    lp = os.path.join(TMP, 'list.json')
    json.dump([{'svg': sp, 'out': out, 'w': W2, 'h': H2}], open(lp, 'w'))
    env = dict(os.environ)
    env.setdefault('NODE_PATH', '/home/claude/.npm-global/lib/node_modules')
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'svg-bake.js'), lp], check=True, env=env, stdout=subprocess.DEVNULL)
    return Image.open(out).convert('RGBA')


def thing(im, fill=.84, bottom=.07):
    """물건 하나를 칸에 통째로 앉힌다(바닥에 세운다)."""
    im = im.crop(im.getbbox())
    k = min(OW * fill / im.width, OH * fill / im.height)
    sm = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
    can = Image.new('RGBA', (OW, OH))
    can.alpha_composite(sm, ((OW - sm.width) // 2, int(OH * (1 - bottom)) - sm.height))
    return np.asarray(can).astype(np.float32) / 255


# ─────────────────────────────────────────────────────────────
def save(key, img):
    os.makedirs(OUT, exist_ok=True)
    name = key.replace('npc_', '').replace('tile_', '')
    img.save(os.path.join(OUT, f'{name}.webp'), quality=86, method=6)
    return f'assets/ui/portraits/{name}.webp'


def main():
    NA.make_props(['hammer', 'bighammer', 'mug', 'flask', 'scepter', 'broom', 'spear', 'lantern', 'gemstone', 'basket', 'keys'])
    defs = NA.npc_defs()
    made = {}
    for nid, d in defs.items():
        key = GAME[nid]
        made[key] = (save(key, compose(key, person(nid, d))), d['name'])
        print('✓', key, flush=True)
    s, w, h = NA.stone_svg()
    made['npc_waypoint'] = (save('npc_waypoint', compose('npc_waypoint', thing(svg_png(s, w, h, 1, 'waypoint')))), LABEL['npc_waypoint'])
    s, w, h = quest_board_svg()
    made['npc_quest_board'] = (save('npc_quest_board', compose('npc_quest_board', thing(svg_png(s, w, h, 1, 'quest_board')))), LABEL['npc_quest_board'])
    s, w, h = TA.signpost()
    made['tile_signpost'] = (save('tile_signpost', compose('tile_signpost', thing(svg_png(s, w, h, 2, 'signpost'), fill=.9, bottom=.1))), LABEL['tile_signpost'])
    print('✓ 물건 셋')
    # manifest — portrait_<대화창이 받는 이름>
    mp = os.path.join(ROOT, 'src', 'data', 'manifest.json')
    man = json.load(open(mp, encoding='utf-8'))
    for key, (src, label) in made.items():
        man[f'portrait_{key}'] = {'src': src, 'w': OW // 2, 'h': OH // 2, 'label': f'대화창 얼굴 — {label}'}
    with open(mp, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write('\n')
    # 새로 그린 그림 — npm run assets 가 덮지 않게
    pp = os.path.join(ROOT, 'tools', 'painted.json')
    data = json.load(open(pp, encoding='utf-8'))
    data['keep'] = sorted(set(data['keep']) | {src.replace('assets/', '') for src, _ in made.values()})
    with open(pp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    total = sum(os.path.getsize(os.path.join(ROOT, src)) for src, _ in made.values())
    print(f'✓ 대화창 얼굴 {len(made)}장 · {total / 1024:.0f}KB → assets/ui/portraits')
    preview(made)


def preview(made=None):
    man = json.load(open(os.path.join(ROOT, 'src', 'data', 'manifest.json'), encoding='utf-8'))
    keys = [k for k in man if k.startswith('portrait_')]
    font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc', 18)
    cols = 8
    rows = (len(keys) + cols - 1) // cols
    cw, ch = OW // 2 + 24, OH // 2 + 48
    out = Image.new('RGB', (cols * cw + 24, rows * ch + 24), (30, 34, 46))
    d = ImageDraw.Draw(out)
    for i, k in enumerate(keys):
        im = Image.open(os.path.join(ROOT, man[k]['src'])).convert('RGB').resize((OW // 2, OH // 2), Image.LANCZOS)
        x, y = 24 + (i % cols) * cw, 24 + (i // cols) * ch
        out.paste(im, (x, y))
        lab = man[k]['label'].replace('대화창 얼굴 — ', '')
        f_ = font
        while d.textlength(lab, font=f_) > cw - 8 and f_.size > 11:
            f_ = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc', f_.size - 1)
        d.text((x, y + OH // 2 + 6), lab, font=f_, fill=(230, 226, 214))
    os.makedirs(os.path.join(ROOT, 'art', 'preview'), exist_ok=True)
    out.save(os.path.join(ROOT, 'art', 'preview', 'portraits.png'))
    print('✓ art/preview/portraits.png')


if __name__ == '__main__':
    if '--preview' in sys.argv:
        preview()
    else:
        main()
