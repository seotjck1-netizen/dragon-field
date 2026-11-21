# 지금 손그림 그대로 → 진짜로 돌린 8방향 (0.80.01 시안 ②)

`tools/hero3d/`(3D 인형을 셀 음영으로)의 그림체는 사용자가 물렸다 — **"그림체는 이전으로, 걷기 8방향은 시안으로"**.
그래서 0.70 의 **앞 · 뒤 손그림을 그대로 입체에 입혀** 돌리고 걷게 한다. 앞 · 뒤에서 보면 지금 그림과 같고,
옆 · 대각은 그 그림이 입체를 따라 돌아간 모습이다.

| 파일 | 하는 일 |
|---|---|
| `inputs.py` | 게임 몸 그림 층(`assets/bodies/`)을 BodyLook 규칙대로 겹쳐 **갑옷 한 벌**의 앞(stand) · 뒤(stand_b) 그림과, 칼끝이 위로 서게 돌린 **무기 그림**을 만든다 |
| `proj3d.py` | ① 앞 그림의 윤곽(줄마다 왼끝 · 오른끝)을 타원 고리로 부풀려 조각(머리 · 몸통 · 위팔 · 아래팔 · 허벅지 · 정강이 · 발)을 만든다 ② 앞 그림 · 뒤 그림(좌우 뒤집어)을 입히고 쉬는 자세의 법선으로 섞는다 ③ 관절에 붙여 서기 · 걷기 8장 · 달리기 8장 × 8방향을 EXR 로 굽는다 |
| `toon.py` | EXR → PNG(160 들판 · 320 전투). 그림을 입힌 조각(700~799)은 손그림의 빛 · 그늘을 그대로 쓰고 바깥 윤곽만 긋는다 |
| `preview.py` · `sheet.py` | 진짜 들판 위 영상(MP4) · 한 장 비교표 |
| `m1.json` · `k2.json` · `f1.json` · `f2.json` | 남자 맨몸(768 원화) · 기사 갑옷 + 칼(게임 160 그림을 6배) · 여자 깨끗한 · 거친(768 원화, 긴 머리 다발) — 자르는 줄 · 관절 열 · 두께 |

```bash
# 저장소 맨 위에서. bpy 는 hero3d 와 같은 venv + scipy
/tmp/bpyenv/bin/pip install scipy
python3 tools/paint3d/inputs.py /tmp/p3 --body m1 --tier 2 --weapon sword_2
/tmp/bpyenv/bin/python tools/paint3d/proj3d.py tools/paint3d/m1.json --out /tmp/p3/exr_m1
/tmp/bpyenv/bin/python tools/paint3d/proj3d.py tools/paint3d/k2.json --out /tmp/p3/exr_k2 --work /tmp/p3
for s in 160 320; do /tmp/bpyenv/bin/python tools/paint3d/toon.py /tmp/p3/exr_m1 /tmp/p3/png_m1$([ $s = 320 ] && echo _320) --size $s; done   # k2 도 같게
python3 tools/paint3d/preview.py /tmp/p3 /tmp/p3/video --bg field.png      # field.png = tools/hero3d/bgshot.js
```

자르는 줄을 맞출 때는 `--quick`(쉬는 자세 8방향 한 장씩, 10초 남짓).

## 시안③ — 손그림 + 3D 입체감 · 여자

사용자: "0.70 그림체에 3D 시안을 섞어 줘, 여자도 같이" → 손그림은 그대로 두고 시안①(hero3d)의 빛을 얹는다.

- `toon.py --cel 1` — 그림 조각에 셀 음영 두 단(빛 · 보랏빛 그늘, 빛 받는 면 +8%), 가장자리 빛, 겹친 조각 둘레 선, 조금 굵은 바깥 윤곽.
  빛은 왼쪽 위 **앞**에서(−0.55, 0.3, 0.78) — hero3d 의 빛(위에서 많이)을 그대로 쓰면 20° 내려다보는 카메라라 몸 앞면이 반쯤 그늘이 되어 옷이 반으로 갈렸다.
  `--cel-th` 로 그늘 문턱(기본 0.3).
- 설정 `clean: [지름, 색 시그마, 자리 시그마, 횟수]` — 그림에 쌍방 필터(OpenCV)를 걸어 긁힌 자국 · 얼룩을 걷는다(선 · 눈은 남는다). 3D 면처럼 깔끔해진다. `pip install opencv-python-headless`
- 설정 `smooth: 2` — 고리 너비를 위아래 두 줄씩 고르게(머리칼 · 어깨에 계단 같은 턱이 생기지 않게).
- **여자(f1 · f2)** — 긴 머리칼이 어깨 밖으로 늘어진다. 설정 `hair` 로 머리칼 빛깔(어둡고 붉은 갈색)인 데를 따로 재서
  ① 팔 · 손은 머리칼을 뺀 자리에서 자르고 ② 어깨 밖 머리 다발 두 조각(`lock_L/R`, 가슴에 붙어 몸과 함께 돈다, 조금 뒤로)을 세우고
  ③ 머리 조각은 `head_clip` 줄부터 얼굴 · 목 열로 서서히 좁힌다(`head_ramp`). 몸통 · 팔 가르는 열(`torso_l`)은 줄마다 다르게 `[[줄, 열], …]` 로 준다.

## 게임에 넣기 (0.80.01)

```bash
for b in m1 m2 f1 f2; do
  /tmp/bpyenv/bin/python tools/paint3d/proj3d.py tools/paint3d/$b.json --out /tmp/g8/exr_$b
  /tmp/bpyenv/bin/python tools/paint3d/toon.py /tmp/g8/exr_$b /tmp/g8/png_$b --size 160 --cel 1
done
python3 tools/paint3d/atlas.py /tmp/g8          # → assets/bodies/*/dir8.webp · src/data/dir8.json · manifest(dir8:*)
```

- 설정의 `view` · `foot_margin` 은 **지금 맨몸 앞모습과 키가 같게** 맞춘 값이다(남 115 · 여 111px 안팎, 160 틀). atlas.py 가 발바닥 · 가운데를 마지막으로 맞춘다.
- `hand_at` — 오른손 가운데(그림 좌표). proj3d.py 가 장마다 손 자리와 칼 · 활 · 지팡이 방향(옆에서 본 온 길이 1), 몸 앞인지 뒤인지를 meta.json 에 적는다.
- atlas.py 는 한 장짜리 html 이 20MB 안에 들게 **서기 1장 · 걷기 8장 · 달리기 4장(8장 가운데 한 장 걸러)** 만 담는다(`--idle` · `--run-step`). 품질 76.
- 게임: `BodyLook.dir8Eligible` 이 참이면(무기 말고 보이는 장비 층이 없음) `FieldScene._dir8Frame` → `BodyLook.getDir8`.
  그림 표(manifest)가 `dir8:*` 를 모르면(서버가 옛 표를 내려줌) 예전 그림으로 — 몸이 비지 않는다.

## 알아 둘 것

- **옆면 얼룩** — 옆면은 조각의 끝 열을 길게 늘여 쓴다. 그 열에 그림 윤곽선이나 옆 조각(팔 · 손) 색이 있으면 옆에서 검은 줄 · 얼룩이 된다.
  그래서 **조각마다 바탕 그림을 따로** 만든다: 그 조각이 차지한 자리만 남기고 둘레 `erode` px 를 깎은 뒤 가장 가까운 안쪽 색으로 번지게 한다.
  윤곽은 toon.py 가 다시 긋는다.
- **두께** — 앞뒤 반지름 = 가로 반지름 × `depth`. 0.62 쯤이면 옆에서 종잇장(첫 시도), 몸통 0.88 · 팔다리 1.0 으로 맞췄다.
- **다리 · 손** — 손이 허벅지 줄과 같은 높이에 있으면 다리 조각에 손이 끼어 반바지가 날개처럼 펄럭였다. 다리는 `leg_lo` 열 안쪽만 쓴다.
- **무기** — 그림 칼을 십자 판 둘로(앞에서도 옆에서도 보인다), 해부학적 오른손(앞모습에서 화면 왼쪽)에 쥔다.
  서 있을 때 팔꿈치 50° · 칼은 앞 위로, 걸을 때 덜 흔든다.
- **얼굴 옆모습은 없다** — 앞 · 뒤 그림만 있으니 정옆(오른쪽 · 왼쪽)에서는 얼굴이 머리칼 앞쪽 끝에 조금 보인다. 대각에서는 얼굴이 잘 보인다.
- **아직 게임에 굽지 않았다** — 사용자가 정한 뒤 bodies.json 장면으로 넣는다(그때 m2 · f1 · f2 · 다른 등급도).
