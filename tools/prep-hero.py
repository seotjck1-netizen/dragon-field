# 첨부된 캐릭터 원본 그림 → 게임용 스프라이트(투명 배경)로 가공한다.
# 사용: python3 tools/prep-hero.py <field_src.png> <battle_src.png>
# 결과: assets/sprites/characters/hero_field.png / hero_battle.png
#
# 배경 제거 방식:
#   1) 흑백 기울기(edge)를 구해 "캐릭터의 진한 외곽선"을 찾는다.
#   2) 이미지 가장자리에서 안쪽으로 번져 나가되, 기울기가 큰 곳에서 멈춘다.
#      → 배경의 부드러운 명암(비네팅·낙서)은 통과하고 캐릭터에서는 멈춘다.
#   3) 남은 덩어리 중 가장 큰 것만 남겨 소품(상자·바닥선)을 버린다.
import sys, os
from collections import deque
from PIL import Image, ImageFilter, ImageEnhance

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sprites', 'characters')


def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def sat(c):
    mx, mn = max(c), min(c)
    return 0 if mx == 0 else (mx - mn) / mx


def gradient_map(im):
    w, h = im.size
    px = im.convert('RGB').load()
    g = [[0] * h for _ in range(w)]
    for x in range(w):
        for y in range(h):
            c = lum(px[x, y])
            gx = abs(c - lum(px[min(w - 1, x + 1), y]))
            gy = abs(c - lum(px[x, min(h - 1, y + 1)]))
            g[x][y] = gx + gy
    return g


def remove_background(im, edge_thresh=42, lum_step=26, min_lum=112, max_sat=0.28):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    rgb = [[px[x, y][:3] for y in range(h)] for x in range(w)]
    grad = gradient_map(im)

    def passable(c):
        # 배경 후보: 밝고, 채도가 낮고, 따뜻한 색
        return lum(c) >= min_lum and sat(c) <= max_sat and c[0] >= c[2] - 4

    visited = [[False] * h for _ in range(w)]
    q = deque()

    def seed(x, y):
        if not visited[x][y] and passable(rgb[x][y]) and grad[x][y] < edge_thresh:
            visited[x][y] = True
            q.append((x, y))

    for x in range(w):
        seed(x, 0); seed(x, h - 1)
    for y in range(h):
        seed(0, y); seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        cur = rgb[x][y]
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h) or visited[nx][ny]:
                continue
            c = rgb[nx][ny]
            if not passable(c):
                continue
            if grad[nx][ny] >= edge_thresh:      # 외곽선에서 멈춘다
                continue
            if abs(lum(c) - lum(cur)) > lum_step:  # 급격한 밝기 변화도 경계로 본다
                continue
            visited[nx][ny] = True
            q.append((nx, ny))
    return im


def keep_main_body(im, erode=2):
    """
    캐릭터와 소품(상자·바닥선)이 1픽셀짜리 실선으로 붙어 있을 때를 대비해,
    마스크를 살짝 깎아 연결을 끊고 → 가장 큰 덩어리를 고른 뒤 → 다시 부풀려 원래 모양을 되돌린다.
    (원본 픽셀은 건드리지 않고 어떤 픽셀을 남길지만 고른다)
    """
    w, h = im.size
    px = im.load()
    mask = [[px[x, y][3] >= 24 for y in range(h)] for x in range(w)]

    def neighbors(x, y, m):
        n = 0
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and m[nx][ny]:
                n += 1
        return n

    eroded = [row[:] for row in mask]
    for _ in range(erode):
        prev = [row[:] for row in eroded]
        for x in range(w):
            for y in range(h):
                if prev[x][y] and neighbors(x, y, prev) < 5:
                    eroded[x][y] = False

    # 깎인 마스크에서 가장 큰 덩어리
    seen = [[False] * h for _ in range(w)]
    best, best_size = [], 0
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or not eroded[sx][sy]:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and eroded[nx][ny]:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            if len(comp) > best_size:
                best, best_size = comp, len(comp)

    if not best:
        return im

    keep = [[False] * h for _ in range(w)]
    for x, y in best:
        keep[x][y] = True
    # 원래 마스크 안에서 다시 부풀린다
    for _ in range(erode + 1):
        prev = [row[:] for row in keep]
        for x in range(w):
            for y in range(h):
                if keep[x][y] or not mask[x][y]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and prev[nx][ny]:
                        keep[x][y] = True
                        break

    for x in range(w):
        for y in range(h):
            if not keep[x][y]:
                px[x, y] = (0, 0, 0, 0)
    return im


def largest_blob(im):
    """남은 불투명 덩어리 중 가장 큰 것만 남긴다(배경 소품 제거)."""
    w, h = im.size
    px = im.load()
    seen = [[False] * h for _ in range(w)]
    best, best_size = None, 0
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or px[sx, sy][3] < 24:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and px[nx, ny][3] >= 24:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            if len(comp) > best_size:
                best, best_size = comp, len(comp)
    keep = set(best or [])
    for x in range(w):
        for y in range(h):
            if (x, y) not in keep:
                px[x, y] = (0, 0, 0, 0)
    return im


def despeckle(im, min_size=6):
    """가장자리에 남은 자잘한 배경 부스러기를 없앤다."""
    w, h = im.size
    px = im.load()
    seen = [[False] * h for _ in range(w)]
    for sx in range(w):
        for sy in range(h):
            if seen[sx][sy] or px[sx, sy][3] < 24:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sx][sy] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and not seen[nx][ny] and px[nx, ny][3] >= 24:
                        seen[nx][ny] = True
                        q.append((nx, ny))
            if len(comp) < min_size:
                for p in comp:
                    px[p] = (0, 0, 0, 0)
    return im


def trim(im, pad=1):
    box = im.getbbox()
    if not box:
        return im
    l, t, r, b = box
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))


def fit(im, w, h, brighten=1.0):
    """비율을 유지한 채 (w,h) 안에 넣고 바닥 중앙에 정렬한다."""
    scale = min(w / im.width, h / im.height)
    nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.1, percent=105, threshold=2))
    if brighten != 1.0:
        # 작게 그려지는 필드 스프라이트는 조금 밝혀야 배경 위에서 읽힌다
        rgb = ImageEnhance.Brightness(im.convert('RGB')).enhance(brighten)
        rgb = ImageEnhance.Color(rgb).enhance(1.12)
        im = Image.merge('RGBA', (*rgb.split(), im.split()[3]))
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.paste(im, ((w - nw) // 2, h - nh), im)
    return canvas


def process(src, out, size, crop=None, brighten=1.0):
    im = Image.open(src)
    if crop:
        im = im.crop(crop)  # 원본의 소품(상자·바닥선)을 미리 잘라낸다
    im = remove_background(im)
    im = keep_main_body(im)
    im = largest_blob(im)
    im = despeckle(im)
    im = trim(im)
    im = fit(im, *size, brighten=brighten)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, out)
    im.save(path)
    print(f'✓ {out}  {im.size}')


if __name__ == '__main__':
    field_src, battle_src = sys.argv[1], sys.argv[2]
    # 표시 크기의 2배(레티나)로 저장한다. manifest 의 w/h 가 실제 그릴 크기.
    process(field_src, 'hero_field.png', (108, 144), crop=(3, 1, 26, 38), brighten=1.22)
    process(battle_src, 'hero_battle.png', (384, 512), crop=(11, 2, 77, 112))
