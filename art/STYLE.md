# 화풍 한 덩이 (Style Anchor)

258장을 **따로따로** 만들면 화풍이 258가지가 된다. 그래서 장마다 아래 문단을
**글자 하나 바꾸지 않고** 그대로 붙인다. 프롬프트의 마지막에 붙이는 것이 좋다
(앞쪽에 있는 말일수록 모델이 세게 듣는다 — 앞은 '무엇을', 뒤는 '어떻게').

## English (그림 모델에 넣는 것)

```
Flat vector game art, hand-painted storybook look, soft cel shading with two or three tone steps per surface, NO black outlines, NO gradients across the whole image, NO photorealism, NO 3D render, NO pixel art dithering. Warm saturated fantasy palette anchored on: grass #49a34a, deep leaf #3f9642, wood #8b5a2b, dark wood #6b4423, stone #8f97ab, cold stone #b7bfd0, water #7cc4ff, pale sky #cfe4ff, gold #ffd166, pale gold #ffe9a8, ember #c98a5c, arcane #c58cff, shadow #2a0c08. Clean readable silhouette that still reads at 1/4 size. Even ambient light from above, no cast shadow on the ground unless asked.
```

## 우리말 (사람이 읽는 것)

평평한 벡터 게임 그림, 손으로 칠한 동화책 느낌, 면마다 두세 단계 셀 음영, 검은 외곽선 없음, 화면 전체를 가로지르는 그라데이션 없음, 사진 같은 묘사 없음, 3D 렌더 없음, 픽셀아트 디더링 없음. 따뜻하고 진한 판타지 색. 기준색: 풀 #49a34a, 짙은 잎 #3f9642, 나무 #8b5a2b, 짙은 나무 #6b4423, 돌 #8f97ab, 찬 돌 #b7bfd0, 물 #7cc4ff, 옅은 하늘 #cfe4ff, 금 #ffd166, 옅은 금 #ffe9a8, 잉걸 #c98a5c, 마력 #c58cff, 그림자 #2a0c08. 1/4 로 줄여도 알아볼 수 있는 또렷한 실루엣. 위에서 고르게 드는 빛, 바닥 그림자 없음.

## 절대 하면 안 되는 것 — 이 게임에서 실제로 데인 것들

1. **깔리는 타일에 한쪽으로 쏠린 밝기(그라데이션)를 넣지 않는다.**
   한 장만 보면 예쁜데 40×32 칸으로 깔면 위가 밝고 아래가 어두운 것이
   칸마다 반복되어 **가로줄 격자**가 화면에 그려진다. 실제로 그렇게 나왔고 고쳤다.
2. **타일에 테두리를 넣지 않는다.** 칸마다 선이 생겨 바둑판이 된다.
3. **얹는 그림(나무·바위·덤불)의 가장자리는 들쭉날쭉해야 한다.**
   네모로 꽉 채우면 칸 경계가 직선으로 드러난다.
4. **투명 배경은 모델에게 시키지 말고 뒤에서 빼낸다.** 아래 HOWTO 참고.
5. **발끝은 칸 아래 끝에 닿아야 한다.** 전투 화면이 그림 높이로 자리를 잡는다.
