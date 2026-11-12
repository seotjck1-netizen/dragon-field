# 주인공 3D 인형 → 8방향 2D 그림 (0.80.01 시안)

사용자 지정(0.80.01): **진짜로 돌린 8방향**(몸 · 팔 · 다리 · 얼굴이 실제로 그쪽을 본다), **무기는 늘 오른손**,
장비는 **갑옷 등급별 한 벌 + 무기**. 바깥 그림 도구(제미나이 · 힉스필드)는 쓰지 않고 여기서 직접 만든다.

| 파일 | 하는 일 |
|---|---|
| `hero3d.py` | 블렌더(bpy)로 인형을 세우고 8방향 × 서기 · 걷기 · 달리기를 **자료 패스 EXR** 로 굽는다(Cycles 1샘플) |
| `toon.py` | EXR → 셀 음영(밝음 · 그늘, 머리칼 윤기, 쇠 반짝임) + 외곽선 → 160(들판) · 320(전투) PNG |
| `preview.py` | 진짜 들판 화면 위에서 돌아서기 · 8방향 걷기 · 달리기 영상(MP4) |
| `bgshot.js` | 미리보기 바탕 — 게임을 띄워 주인공 · 몬스터를 치운 들판을 찍는다 |

```bash
python3 -m venv /tmp/bpyenv && /tmp/bpyenv/bin/pip install bpy==5.2.3 OpenEXR numpy pillow
/tmp/bpyenv/bin/python tools/hero3d/hero3d.py cfg.json      # {"out": "exr", "outfit": "base"|"knight", "weapon": null|"sword"}
/tmp/bpyenv/bin/python tools/hero3d/toon.py exr png --size 160
```

- 인형: 관절(빈 객체) 사슬 + 팔 · 다리 · 목은 메타볼(관절이 매끈하게 이어진다), 몸통 · 반바지는 돌림체,
  얼굴은 머리 겉면에 붙인 얇은 판(눈 · 눈썹 · 입), 머리칼은 두피를 따라 흐르다 끝이 튀는 다발 스무 개 남짓.
- 조각마다 `pass_index` 가 달라 조각 경계에 선이 생긴다(800~ 쇠, 900~ 그늘 없음).
- 카메라: 정사영 · 20° 내려다봄. 발바닥이 늘 틀 아래(157/160)에 닿게 매 장 땅에 맞춘다.
- **아직 게임에 굽지 않았다** — 미리보기를 보고 사용자가 정한 뒤 bodies.json 장면으로 넣는다.
