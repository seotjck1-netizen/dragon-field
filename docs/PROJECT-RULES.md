# 지켜야 할 것 — 바뀌면 일이 커지는 것들

> 새 대화(또는 압축된 대화)는 **이 문서 → `docs/HANDOFF-0.80.md` → `docs/SPEC-0.80.md`** 순서로 읽고 시작한다.
> 여기 적힌 것은 사용자가 정했거나, 어기면 사고가 났던 것들이다. 바꾸려면 **먼저 사용자에게 묻는다.**
> (2026-11-11 · 0.80.03 기준으로 정리 · 2026-11-12 0.80.20 본편을 넣으며 고침 · 0.80.21 와우식 어그로 · 도감 · 업적 · 0.80.22 끝없는 탑)

## 1. 사용자와 일하는 법

| 무엇 | 규칙 |
|---|---|
| 말 | 한국어, 짧게. 답 끝에는 늘 **「추천 작업」** 몇 줄 |
| 커밋 | **커밋할지 먼저 묻고**, 허락받으면 직접 커밋한다 |
| 푸시 | 이 작업 공간에서는 막혀 있다(403 — 저장소가 세션의 sources 에 없음). 사용자가 zip 을 풀고 `upload.bat` 으로 올린다. 세션 sources 에 저장소가 추가되면 그때 푸시를 시도한다(묻고 나서) |
| 작업 전 | 구글 시트(아래 4) 수정 시각을 확인한다 — 사용자가 시트에서 고친 것이 있으면 먼저 받아들인다 |
| 그림 | 굽기 전에 **미리보기를 먼저** 보여 주고 확인받는다. 캐릭터 방향 규칙은 `docs/CHARACTER-VIEWS.md` |
| 쓰지 말 것 | Gemini · 브라우저(사용자 지정). 다운로드 폴더는 Gemini 그림 때문에만 허락받았다 — 둘러보지 않는다 |
| 사용량 | 큰 일은 시작 전에 어림(5시간 한도 창 몇 개)을 보여 준다. 대화가 길면 한도가 빨리 찬다 — 압축을 권한다 |
| 아티팩트 | 예전에 만든 아티팩트 · 그림을 허락 없이 지우지 않는다 |

## 2. 판 내기 (매 판 같다)

| 무엇 | 규칙 |
|---|---|
| zip | **30MB 이하**, `upload.bat` 꼭 포함. 목록 = `git ls-files -co --exclude-standard`(있는 파일만) − `dragon-field-tables.xlsx`. 압축 안 맨 위에 폴더 없이 |
| 한 장짜리 html | **20MB 미만** — `node tools/build-single-file.js` → `dist/dragon-field.html`. base64 라 그림은 1.33배로 붙는다. 넘으면 `python3 tools/pack-webp.py` 로 png → webp |
| xlsx | 표가 바뀐 판에만 — `node tools/sheets.js export && node tools/make-xlsx.js` |
| 미리보기 | 바뀐 것을 보여 주는 그림 한두 장 |
| 판 번호 | `src/config.js` 의 `GAME_VERSION` · `package.json` 의 `version` 을 함께. **판 번호가 바뀌어야 서버가 `server/content` 를 새 표로 다시 깐다**(`server/content.js` 의 `initFromSource`). 이미 내보낸 번호를 다시 쓰지 않는다. 0.80 수정안 본편은 **0.80.20** 부터(그다음 0.80.21 …) |
| 올리는 법 | `upload.bat` → `tools/upload.js`: `git add .` → 커밋 `Update <판>` → 태그 `v<판>` → **main 과 태그를 강제로 푸시**. 그래서 원격 main 은 사용자 컴퓨터의 기록이다(지금 원격은 `Update 0.80.01` 한 커밋). 이 작업 공간의 main 은 그 위에 0.80.02 · 0.80.03 을 이어 붙여 두었다(옛 기록은 `history-before-0.80.03-push` 가지) |
| 되돌리기 | `rollback.bat` / `tools/rollback.js`. 0.70.39 가 무기 · 스킬 개편 전 롤백 지점(태그 · `backup/0.70.39`) |

## 3. 보안 · 계정 (어기면 사고)

- ID/PW 는 **세이브 슬롯**이지 진짜 인증이 아니다. 「다른 곳에서 쓰는 비밀번호를 재사용하지 마세요」 경고를 지우지 않는다.
- 비밀 파일(`server/data/` · `.env` · `sheets/accounts.csv`)은 **절대 커밋 · 푸시하지 않는다.** `server/` 는 정적 파일로 내주지 않는다.
- `ADMIN_KEY` 가 비어 있으면 운영자 기능은 잠긴다. 열쇠를 브라우저에 내보내지 않는다. 기본 운영자 비번 `@2222` 경고를 남긴다.
- 운영자는 자기 계정을 지울 수 없다 · 랭킹에 오르지 않는다. 공지 띠는 서버가 쓴다. 시트의 계정 지우기는 기본 꺼짐.
- 랭킹의 레벨 · 직업은 **서버 세이브에서만** 읽는다. 타임어택 시간은 서버가 잰다. 예약 아이디 막기는 가입에만.
- 세이브를 새로 시작할 때 옛 것은 **지우지 않고 보관**한다. 0.80.20 의 방법(`server/epoch.js`): 서버가 그 판으로 처음 뜰 때 한 번 — 파일 저장소는 `server/data-<옛 판>/` 에 폴더째 복사, **Upstash** 는 `poino:*` 키를 `arch:<옛 판>:poino:*` 로 복사한 뒤 `rolloverSeason`(랭킹 넘기기 + `world.resetAllSaves` — 계정은 남긴다). 세상 문서 `saveEpoch` 에 표시를 남겨 두 번 돌지 않는다. **보관을 못 하면 비우지 않는다.** 서버는 `epoch` 표시가 없는 세이브를 받지도 주지도 않는다(옛 창 막기). 다음에 또 새로 시작하려면 `SAVE_EPOCH`(server/epoch.js · AccountSystem · Storage 세 곳)를 함께 바꾼다.
- `server/data-*/` 는 비밀 파일이다 — `.gitignore` · `tools/upload.js` 가 막는다.
- 시험은 임시 폴더에서 돈다(`tests/lib/server.js` — `POINO_DATA_DIR` · `POINO_CONTENT_DIR`). 진짜 계정 폴더를 건드리는 시험을 만들지 않는다.

## 4. 표 · 구글 시트

| 무엇 | 규칙 |
|---|---|
| 시트 | `1hH3d13kXe0QLsQHdcOX1OWb37SQWWw51k-d-s6lxgQI` (이름 `dragon-field-tables-0_80_03`, 2026-11-11 에 0.80.03 표로 통째로 바꿈). 「링크가 있는 모든 사용자 · 뷰어」로 공개되어 있어야 서버가 읽는다. **새 문서를 만들지 말고 같은 문서에 덮어쓴다**(문서 아이디가 바뀌면 서버가 멎는다) |
| 탭 | items · monsters · drops · quests · skills · classes · traits · stats · engrave · config · npcs (+ 읽어보기). 서버는 탭 **이름**으로 찾는다 |
| 서버 자동 반영 | 서버가 시트를 주기적으로 읽어 `server/content` 를 덮는다. 그래서 **시트가 옛 판이면 새 값이 옛 값으로 돌아간다** — 판을 낼 때 표가 바뀌었으면 시트도 같이 바꾼다. 트리 전 옛 skills 탭은 반영을 막아 두었다(`staleSkills`) |
| JSON | `drops.json` · `quests.json` 을 `JSON.stringify` 로 통째로 다시 쓰지 않는다(손으로 맞춘 서식 · 주석이 깨진다). 표 서식은 `server/sheets.js` 의 `format*` 로 |
| 고친 뒤 | `src/data/*.json` 을 고치면 `server/content/` 도 같게. `node tools/sheets.js check` |

## 5. 시험

- `bash tests/run.sh [이름…]` — 21벌. 정적 서버 8899 를 스스로 띄운다. 결과는 `/tmp/testout`(또는 `OUT=`).
- Playwright 는 그릇에 **미리 깔려 있다**. 저장소에 `npm install playwright` 하지 않는다(로컬 node_modules/playwright 가 생기면 브라우저 시험이 깨진다). `package-lock.json` 도 만들지 않는다.
- 시험은 **성질**을 잰다(픽셀 값 · 숫자 하나를 적어 두지 않는다). 저장소 밖(`/tmp`)에 시험을 두지 않는다(0.70.24 에 122개를 잃었다).

## 6. 그림

- 캐릭터 8방향 · 무기는 오른손 · 뒤에서는 망토 · 남녀 몸매(가슴 강조 금지 — 인물이 어려 보인다) · 마을 사람 얼굴은 서로 다르게: **`docs/CHARACTER-VIEWS.md`**.
- 맨몸 8방향은 `tools/paint3d/`(블렌더) → `atlas.py` → `assets/bodies/*/dir8.webp` + `src/data/dir8.json`. 장비가 보이면 예전 그림(앞모습 + 층)이다.
- 큰 그림을 더하면 html 20MB 를 먼저 계산한다.

## 7. 게임 규칙 가운데 갈아엎으면 일이 큰 것 (지금 값)

| 무엇 | 지금 | 어디 |
|---|---|---|
| 스킬 트리 | 와우식 — 직업 포인트 25점(2레벨마다) + 공용 9점(10레벨마다 · 보스 의뢰 넷). 갈래 20점(1단 4+4 · 2단 4 · 3단 3 · 궁극 1 · 숙련 4), 문턱 3 · 6 · 12 · 16, 궁극 Lv.25. 올인 또는 1.5갈래 | `src/data/skills.json` · `SkillSystem.js` · `tools/synergy.js` |
| 장비(0.80.20) | 무기 대미지 · 방어구 방어 = 5 + 덤 + 강화. 몸 공격력 × (1 + W × 4%) · 방어력 × (1 + A × 2.2%) · HP × (1 + A × 3%). 장신구는 줄만(강화 +5%/단계). **등급은 물건마다**(inst.grade · plus · affixes · special · ups). 표의 stats 는 쓰지 않는다 | `src/data/gear.js` · `AffixSystem.rollGear` · `StatBlock` · `tools/balance.js statsOf` |
| 강화(0.80.20) | C 규칙 — +10 끝, +8 부터 실패하면 −1, +7 부터 덤. 초월 없음(`TRANSCEND_MAX = ENHANCE_MAX`) | `formulas.js` · `EquipmentSystem.applyEnhance` |
| 드롭 · 상자 | 잡몹 2% · 보스 30% · 구간 등급표 · 상자 셋 — `drops.json` 의 「장비」(시트에 없다). 세트(용린 · 룬)와 이름 붙은 장비(`named`)는 정해진 몬스터만 | `LootSystem.js` |
| 몬스터 배율 | `maps.json` 의 `mult` · `bossMult`(hp · def · atk). 경험치 · 골드는 power 만. `tools/rescale80.js` 로 풀었다(옛 판 몸과 같은 승률 · 처치 시간) — `tools/gen-maps.js` 는 옛 파일에서 옮겨 온다 | `formulas.stageMult` |
| 세이브 판 | `SAVE_VERSION = 8` — 바뀌면 옛 세이브의 스킬 · 특성 점수를 돌려주고 공짜 초기화 한 번 | `AccountSystem.js` |
| 경험치 | `EXP_GAIN 0.33`(0.80.20 — 0.6 에서) · 보스 ×0.5 · 의뢰 ×0.5. Lv.50 흉내 용사 13.9h · 사냥꾼 18.1h · 마법사 13.9h(목표: 350ms 수정안 15.7 · 17.9 · 15.5h) | `formulas.js` · `docs/BALANCE-REVIEW.md` |
| 이동 | 기본 1.2배 고정, 날랜 발로 천장 150%. 질주의 물약 없음 | `formulas.js` · `BuffSystem.js` |
| 전투 | 잡몹은 **필드 실시간**(350ms). 0.80.21 와우식 — **닿아야 열린다**, 선공은 6칸 안에서 보면 쫓고 9칸 넘게 따돌리면 놓는다, 열릴 때 2칸 안의 쫓던 놈은 **애드**(최대 둘), 싸우며 걸으면 0.45배, 사거리(검 1 · 지팡이 3 · 활 4) + 2칸 밖이면 멈추고 이어서. 보스 · 고룡은 전투 화면(620ms · Shift · 돌입 소리). `?field=0` 이면 모두 전투 화면 | `BALANCE.FIELD` · `CONFIG.MONSTER_SIGHT_TILES` · `MovementSystem.updateMonster` · `FieldFight.js` · `FieldScene.js` · `EncounterSystem.js` · `main.js battleParty` |
| 도감 · 업적(0.80.21) | 세이브 `codex`(mon · item · stat · done). 잡은 수 · 상자 · 번 골드 · 만난 것 · 얻은 것만 적고 레벨 · 강화 · 세트 · 의뢰는 지금 상태에서 읽는다. store.notify 마다 한 번 훑어 새로 해낸 것의 보상을 그 자리에서 넣는다(두 번 안 들어간다). 업적 id 를 바꾸면 해낸 것이 사라진다. 표는 시트에 없다 | `src/data/achievements.json` · `CodexSystem.js` · `CodexPanel.js` · `main.js checkAchievements` |
| 끝없는 탑(0.80.22) | 한 층 = 전투 화면 한 판, 층 짜기는 `TowerSystem.floorPlan`(주 번호 + 층으로 굴려 누구에게나 같은 상대). HP 는 도전이 기억한다(run.hp) — 보스 층을 깨면 채운다. 보상은 이번 주에 처음 깬 층만. 지면 값 없음. 서버는 층을 하나씩 · 최소 간격으로만 받고 주간 1 ~ 5위에게 우편(settle — 여러 번 불려도 한 번). 주의 셈(월요일 0시 KST)은 게임 `TowerSystem.weekOf` 와 서버 `tower.js weekOf` 가 같아야 한다 | `src/data/tower.json` · `TowerSystem.js` · `server/tower.js` · `TowerPanel.js` · `main.js 끝없는 탑` · `tools/tower.js` |

## 8. 도구 (다시 만들지 말고 쓸 것)

- 밸런스: `node tools/balance-dash.js` → `node tools/balance-page/run.js`(Lv.50 시간) · `node tools/synergy.js`(빌드 세기) · `docs/BALANCE-DASH.md`.
  0.80.20 부터 대시보드의 시간은 실제 시간이다(잡몹 필드 350ms · 보스 Shift 4배 · `BATTLE_SPEED` 1). 상점은 장비를 안 팔지만 흉내는 「한 벌 사다리를 옛 값으로 산다」로 둔다(`LADDER_SHOP`).
- 몬스터 배율 다시 풀기: `OLD_ROOT=<옛 판 사본> node tools/rescale80.js [--write]` — 옛 판에서 balance-dash 를 먼저 돌려 둔다(`git worktree add <폴더> <옛 커밋>`).
- 표: `tools/sheets.js`(export · check · import · pull) · `tools/make-xlsx.js` · `tools/print-tables.js`.
- 판: `tools/build-single-file.js` · `tools/pack-webp.py` · `tools/upload.js` · `tools/rollback.js`.
