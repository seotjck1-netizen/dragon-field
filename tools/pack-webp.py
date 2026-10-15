#!/usr/bin/env python3
"""
큰 png 그림을 webp 로 묶는다 (0.70.29) — 한 장짜리 html 을 20MB 안으로.

  python3 tools/pack-webp.py          # 그림을 다시 구운 뒤(gen-assets · npc-game · icon-art · title-art battle) 한 번

── 무엇을 하나 ───────────────────────────────────────────────
  manifest 의 그림 가운데 아래 폴더에 있는 것을 webp 로 바꾸고 manifest 주소를 고친다.
    assets/sprites/characters   예전 직업 그림(운영자 · 옛 판 접속자)
    assets/sprites/npc          마을 사람
    assets/ui/items             소지품 그림
    assets/ui/battle_bg_*       전투 배경
  png 가 webp 보다 새것이면(그림 도구가 다시 구웠으면) 다시 바꾼다 — 몇 번을 돌려도 같다.
  png 는 지운다(zip · 한 장짜리 html 에 두 벌이 들어가지 않게). 같은 png 이름을 tools/painted.json 에
  적어 두어 `npm run assets` 가 옛 그림을 다시 굽지 않게 한다.

── 왜 webp 인가 ────────────────────────────────────────────
  한 장짜리 html 은 그림을 글자(base64)로 박는다 — 파일 크기의 1.33배가 된다.
  같은 그림이 png 의 ¼~⅓ 이다(투명도까지). 몸 그림 · 몬스터는 이미 webp 로 굽는다.
"""
import json
import os

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MAN = os.path.join(ROOT, 'src', 'data', 'manifest.json')
PAINTED = os.path.join(ROOT, 'tools', 'painted.json')
GROUPS = [
    # (주소 앞부분, 품질, 투명도 품질)
    ('assets/sprites/characters/', 88, 92),
    ('assets/sprites/npc/', 88, 92),
    ('assets/ui/items/', 90, 95),
    ('assets/ui/battle_bg_', 84, 100),
]


def main():
    man = json.load(open(MAN, encoding='utf-8'))
    painted = json.load(open(PAINTED, encoding='utf-8'))
    keep = set(painted.get('keep', []))
    before = after = n = 0
    for key, d in man.items():
        src = d.get('src') or ''
        grp = next((g for g in GROUPS if src.startswith(g[0])), None)
        if not grp:
            continue
        stem = os.path.splitext(src)[0]
        png, webp = os.path.join(ROOT, stem + '.png'), os.path.join(ROOT, stem + '.webp')
        if os.path.exists(png) and (not os.path.exists(webp) or os.path.getmtime(png) > os.path.getmtime(webp)):
            before += os.path.getsize(png)
            im = Image.open(png)
            im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') else im.convert('RGB')
            im.save(webp, 'WEBP', quality=grp[1], method=6, alpha_quality=grp[2])
            after += os.path.getsize(webp)
            os.remove(png)
            n += 1
        if os.path.exists(webp):
            d['src'] = stem + '.webp'
            keep.add(os.path.relpath(png, os.path.join(ROOT, 'assets')))
    with open(MAN, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
        f.write('\n')
    painted['keep'] = sorted(keep)
    with open(PAINTED, 'w', encoding='utf-8') as f:
        json.dump(painted, f, ensure_ascii=False, indent=2)
        f.write('\n')
    if n:
        print(f'✓ webp {n}장 · {before / 1e6:.2f}MB → {after / 1e6:.2f}MB')
    else:
        print('✓ webp — 바꿀 것 없음')


if __name__ == '__main__':
    main()
