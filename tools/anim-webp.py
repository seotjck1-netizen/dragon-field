#!/usr/bin/env python3
"""움직이는 GIF → 움직이는 WebP (0.80.27 — zip 30MB 를 지키려고).

    python3 tools/anim-webp.py IN.gif OUT.webp [품질=75]

같은 장 · 같은 간격 · 끝없이 되풀이. 품질 75 면 GIF 의 ¼ 남짓이고(전투 GIF 870KB → 260KB),
GIF 의 256색 점무늬가 없어 오히려 매끈하다. 브라우저 · GitHub 이 그대로 움직여 보여 준다.
"""
import sys

from PIL import Image, ImageSequence


def main():
    src, dst = sys.argv[1], sys.argv[2]
    q = int(sys.argv[3]) if len(sys.argv) > 3 else 75
    im = Image.open(src)
    frames, durs = [], []
    for f in ImageSequence.Iterator(im):
        frames.append(f.convert('RGB'))
        durs.append(f.info.get('duration', 80))
    frames[0].save(dst, 'WEBP', save_all=True, append_images=frames[1:], duration=durs, loop=0, quality=q, method=6)


if __name__ == '__main__':
    main()
