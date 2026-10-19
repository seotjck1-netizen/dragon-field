#!/usr/bin/env python3
"""
지하감옥 다섯 층을 꾸민다 (0.70.31) — maps.json 의 지하감옥 격자에 꾸밈 칸을 얹는다.

    python3 tools/dungeon-decor.py          # src/data/maps.json 을 고친다(같은 씨앗 → 언제나 같은 자리)

층마다 이름에 맞게:
  1층 무너진 감방   감방 쇠창살 · 무너진 돌 · 뼈 · 벽 사슬
  2층 물 고인 복도   물웅덩이(많이) · 벽 사슬 · 뼈
  3층 석상의 방     방 구석의 석상 · 무너진 돌
  4층 봉인된 층     방 가운데의 봉인 룬 · 벽 사슬 · 감방 쇠창살
  5층 주인의 자리   뼈 · 벽 사슬 · 감방 쇠창살 · 봉인 룬 · 석상

지키는 것
  · 길을 막지 않는다 — 바닥에 얹는 것(뼈 · 물웅덩이 · 돌 · 룬)은 밟고 지나가고, 막는 것(석상)은 방 **구석**에만,
    놓을 때마다 계단 · 포탈 · 웨이포인트에서 모든 바닥이 닿는지 다시 잰다.
  · 벽에 거는 것(쇠창살 · 사슬)은 **아래가 바닥인 벽**(방 안에서 보이는 벽)에만, 횃불(x) 자리는 피한다.
  · 계단 · 포탈 · 웨이포인트 칸과 그 둘레 한 칸은 비운다.
  · 이미 꾸민 격자에 다시 돌려도 같은 결과(꾸밈 칸을 먼저 바닥 · 벽으로 되돌리고 놓는다).
"""
import json
import os
import random
import re
from collections import deque

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MAPS = os.path.join(ROOT, 'src', 'data', 'maps.json')
FLOOR, WALL = 'd', 'Z'
DECAL = {'bones': 'κ', 'puddle': 'λ', 'rubble': 'μ', 'rune': 'ξ'}
MOUNT = {'bars': 'θ', 'chains': 'ι'}
STATUE = 'ν'
PLAN = {
    1: {'mount': {'bars': 6, 'chains': 4}, 'decal': {'rubble': 10, 'bones': 7}, 'statue': 0, 'rune': 0},
    2: {'mount': {'chains': 6}, 'decal': {'puddle': 18, 'bones': 5}, 'statue': 0, 'rune': 0},
    3: {'mount': {'chains': 3}, 'decal': {'rubble': 8, 'bones': 3}, 'statue': 8, 'rune': 0},
    4: {'mount': {'chains': 5, 'bars': 3}, 'decal': {'bones': 4}, 'statue': 0, 'rune': 99},
    5: {'mount': {'chains': 6, 'bars': 4}, 'decal': {'bones': 10}, 'statue': 4, 'rune': 3},
}


def main():
    s = open(MAPS, encoding='utf-8').read()
    data = json.loads(s)
    ts = data['tileset']
    undo = {v: FLOOR for v in list(DECAL.values()) + [STATUE]}
    undo.update({v: WALL for v in MOUNT.values()})
    for floor, plan in PLAN.items():
        mid = f'dungeon_{floor}'
        m = data['maps'][mid]
        g = [[undo.get(c, c) for c in row] for row in m['grid']]
        H, W = len(g), len(g[0])
        rng = random.Random(4100 + floor)
        keep = set()
        for p in m.get('portals', []):
            keep.add((p['x'], p['y']))
        if m.get('waypoint'):
            keep.add((m['waypoint']['x'], m['waypoint']['y']))
        for y in range(H):
            for x in range(W):
                if g[y][x] in 'su':
                    keep.add((x, y))
        near = {(x + dx, y + dy) for (x, y) in keep for dx in (-1, 0, 1) for dy in (-1, 0, 1)}
        fl = lambda x, y: 0 <= x < W and 0 <= y < H and g[y][x] == FLOOR
        roomy = lambda x, y: sum(fl(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)) >= 7
        cells = [(x, y) for y in range(H) for x in range(W) if fl(x, y) and (x, y) not in near]
        rng.shuffle(cells)

        def walkable(x, y):
            c = g[y][x]
            t = ts.get(c)
            return t is not None and not t.get('solid', False)

        def connected():
            starts = [k for k in keep if walkable(*k)]
            if not starts:
                return True
            seen = {starts[0]}
            q = deque([starts[0]])
            while q:
                x, y = q.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = x + dx, y + dy
                    if 0 <= a < W and 0 <= b < H and (a, b) not in seen and walkable(a, b):
                        seen.add((a, b))
                        q.append((a, b))
            allw = {(x, y) for y in range(H) for x in range(W) if walkable(x, y)}
            return allw <= seen

        used = set()
        # 바닥에 얹는 것
        for kind, n in plan['decal'].items():
            put = 0
            for (x, y) in cells:
                if put >= n:
                    break
                if (x, y) in used or not roomy(x, y):
                    continue
                if any((x + dx, y + dy) in used for dx in (-1, 0, 1) for dy in (-1, 0, 1)) and kind != 'puddle':
                    continue
                g[y][x] = DECAL[kind]
                used.add((x, y))
                put += 1
        # 봉인 룬 — 방 한가운데(둘레 3×3 이 모두 바닥인 칸 중 방 가운데에 가까운 곳)
        if plan['rune']:
            put = 0
            for r in m.get('rooms', []):
                if put >= plan['rune']:
                    break
                x, y = r['x'], r['y']
                if (x, y) in near or not fl(x, y) or not roomy(x, y):
                    continue
                g[y][x] = DECAL['rune']
                used.add((x, y))
                put += 1
        # 석상 — 방 구석(위 · 옆이 벽), 놓을 때마다 길이 이어지는지 잰다
        if plan['statue']:
            put = 0
            for (x, y) in cells:
                if put >= plan['statue']:
                    break
                if (x, y) in used or g[y][x] != FLOOR:
                    continue
                up_wall = 0 <= y - 1 and g[y - 1][x] in (WALL, 'x')
                side_wall = (0 <= x - 1 and g[y][x - 1] in (WALL, 'x')) or (x + 1 < W and g[y][x + 1] in (WALL, 'x'))
                if not (up_wall and side_wall):
                    continue
                if sum(fl(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)) < 4:
                    continue
                g[y][x] = STATUE
                if not connected():
                    g[y][x] = FLOOR
                    continue
                used.add((x, y))
                put += 1
        # 벽에 거는 것 — 아래가 바닥인 벽
        walls = [(x, y) for y in range(1, H - 1) for x in range(1, W - 1)
                 if g[y][x] == WALL and fl(x, y + 1) and roomy(x, y + 1) and (x, y + 1) not in near]
        rng.shuffle(walls)
        hung = set()
        for kind, n in plan['mount'].items():
            put = 0
            for (x, y) in walls:
                if put >= n:
                    break
                if (x, y) in hung or any((x + dx, y) in hung for dx in (-2, -1, 1, 2)):
                    continue
                if g[y][x - 1] == 'x' or g[y][x + 1] == 'x':
                    continue
                g[y][x] = MOUNT[kind]
                hung.add((x, y))
                put += 1
        assert connected(), mid
        m['_new'] = [''.join(r) for r in g]
    # 격자만 글자 그대로 갈아 끼운다(다른 줄 · 들여쓰기는 그대로)
    for floor in PLAN:
        mid = f'dungeon_{floor}'
        ng = data['maps'][mid].pop('_new')
        i = s.index(f'\n    "{mid}": {{')
        j = s.index('"grid"', i)
        a = s.index('[', j)
        k = s.index(']', a)
        block = s[a:k + 1]
        parts, last = [], 0
        for m_, row in zip(re.finditer(r'"([^"]*)"', block), ng):
            parts.append(block[last:m_.start()])
            parts.append('"' + row + '"')
            last = m_.end()
        parts.append(block[last:])
        s = s[:a] + ''.join(parts) + s[k + 1:]
        assert json.loads(s)['maps'][mid]['grid'] == ng
    open(MAPS, 'w', encoding='utf-8').write(s)
    d2 = json.loads(s)
    for floor in PLAN:
        g = d2['maps'][f'dungeon_{floor}']['grid']
        cnt = {c: sum(r.count(c) for r in g) for c in list(DECAL.values()) + list(MOUNT.values()) + [STATUE]}
        print(f'✓ {floor}층', {k: v for k, v in cnt.items() if v})


if __name__ == '__main__':
    main()
