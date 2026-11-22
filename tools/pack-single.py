#!/usr/bin/env python3
"""
한 장짜리 html 에만 쓰는 그림 다시 압축 (0.80.27 · 사용자 답 "B안으로 압축").

  python3 tools/pack-single.py LIST.json OUT_DIR QUALITY ALPHA_QUALITY

── 무엇을 하나 ───────────────────────────────────────────────
  LIST.json 의 그림(저장소 기준 주소)을 품질 QUALITY · 투명도 품질 ALPHA_QUALITY 의 webp 로 다시 구워
  OUT_DIR/<같은 주소> 에 둔다. **저장소의 그림은 건드리지 않는다** — 웹 판(서버)은 원본 그대로 보이고,
  tools/build-single-file.js 만 이 사본을 박는다.
  사본이 원본보다 새것이면 다시 굽지 않는다(두 번째부터 빠르다). 다시 구운 것이 원본보다 크면
  사본을 만들지 않는다(그러면 굽는 쪽이 원본을 쓴다).

── 왜 ───────────────────────────────────────────────────────
  한 장짜리 html 은 20MB 미만이어야 한다(0.80.26 에 19.79MB). 그림이 18.5MB 이고 그 가운데 몸 그림이 11.2MB.
  품질 60 · 투명 75 로 다시 구우면 몸 · 몬스터 · 옛 직업 · 마을 사람 · 타이틀에서 4.4MB 남짓 준다
  (2배로 키워 보면 거의 같고, 4배로 키우면 무늬가 조금 뭉개진다 — 사용자가 비교 그림을 보고 골랐다).
"""
import json
import os
import sys
from multiprocessing import Pool

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def pack(job):
    rel, out_dir, q, aq = job
    src = os.path.join(ROOT, rel)
    dst = os.path.join(out_dir, rel)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return (rel, 'keep', 0)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im = Image.open(src)
    im = im.convert('RGBA') if im.mode in ('RGBA', 'LA', 'P') or 'transparency' in im.info else im.convert('RGB')
    tmp = dst + '.tmp'
    im.save(tmp, 'WEBP', quality=q, alpha_quality=aq, method=6)
    if os.path.getsize(tmp) >= os.path.getsize(src):
        os.remove(tmp)
        if os.path.exists(dst):
            os.remove(dst)
        return (rel, 'bigger', 0)
    os.replace(tmp, dst)
    return (rel, 'new', os.path.getsize(src) - os.path.getsize(dst))


def main():
    lst, out_dir, q, aq = sys.argv[1], os.path.abspath(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
    files = json.load(open(lst, encoding='utf-8'))
    with Pool() as pool:
        res = pool.map(pack, [(f, out_dir, q, aq) for f in files])
    made = [r for r in res if r[1] == 'new']
    if made:
        print(f'  그림 다시 압축 {len(made)}장 (품질 {q} · 투명 {aq}) — {sum(r[2] for r in made) / 1e6:.2f}MB 줄임')


if __name__ == '__main__':
    main()
