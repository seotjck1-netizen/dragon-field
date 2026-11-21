# 서버 깨우기 — cron-job.org 설정 · 점검 기록

> 2026-10-15 정리. 무료 Render 서버가 잠들지 않게 하는 방법과, 지금 걸어 둔 설정을 적어 둔다.
> 깨우는 도구가 다시 멈추면 이 문서부터 본다.

## 왜 필요한가

- Render 무료 요금제는 **15분 동안 아무 요청이 없으면 서버를 재운다.** 다시 깨어나는 데 **1분쯤** 걸리고,
  그동안 첫 접속자는 하얀 화면을 본다.
- 그래서 15분보다 짧은 간격으로 서버 주소를 두드려 주는 도구를 걸어 둔다.
- 두드리는 주소는 **`/api/ping`** 이다. 계정 저장소를 건드리지 않는 가벼운 주소이고, GET · HEAD 둘 다 200 으로 답한다
  (판 번호 · 저장소 종류 · 접속자 수만 돌려준다).

## 지금 걸어 둔 설정 (2026-10-15 확인)

| 항목 | 값 |
|---|---|
| 도구 | cron-job.org (무료) |
| 작업 이름 | `dragonfield` |
| 주소 | `https://dragon-field.onrender.com/api/ping` |
| 주기 | 10분마다 (예: 10:20 → 10:30) |
| 최근 실행 | `Successful (200 OK)` · 실패 0 · 꺼진 작업 0 |
| 서버 응답 | `{"ok":true,"gameVersion":"0.70.33","storage":"upstash","players":1}` |

`storage` 가 `upstash` 이면 계정이 바깥 저장소에 있어서, 서버가 잠들거나 재시작해도 캐릭터가 사라지지 않는다.

## 예전 도구가 멈춘 까닭 (짐작)

어느 도구가 왜 멈췄는지 그 계정을 직접 보지는 못했다. 흔한 원인은 셋이다.

1. **cron-job.org 자동 꺼짐** — 요청 하나를 **30초**까지만 기다리고, **25번 넘게 연속 실패**하면 작업을 스스로 끈다.
   서버가 한 번 잠들면 깨어나는 1분 동안 요청이 계속 시간 초과로 실패해서, 결국 꺼진 채로 남는다 → "만료"처럼 보인다.
2. **GitHub Actions 예약 작업** — 공개 저장소에 **60일** 동안 활동이 없으면 예약 작업이 자동으로 꺼진다.
3. **Render 무료 시간 소진** — 무료 시간은 Render 계정 전체에서 **한 달 750시간**이다. 다 쓰면 다음 달까지 서버가 정지되고,
   이때는 아무리 두드려도 안 깨어난다. Render 화면에 정지 안내가 있는지 먼저 본다.

## cron-job.org 설정하는 법 (주 도구 · 무료)

1. https://cron-job.org 에 가입하고 이메일 인증을 한다.
2. Dashboard → **CREATE CRONJOB**.
3. Title `dragonfield`, URL `https://dragon-field.onrender.com/api/ping`.
4. 실행 주기 **Every 10 minutes**.
5. **Notifications** 에서 두 가지를 켠다 — 지난번처럼 조용히 꺼지는 일을 메일로 바로 안다.
   - 실행이 실패하면 메일 받기
   - 실패가 많아 작업이 꺼지면 메일 받기
6. 저장 → **TEST RUN** → 200 과 `{"ok":true,...}` 가 나오면 성공.
7. 이미 만든 작업이 꺼져 있으면 새로 만들지 말고 그 작업의 **Enabled** 스위치만 다시 켠다.

## UptimeRobot (예비 · 무료)

cron-job.org 가 또 멈춰도 한 번 더 두드려 주는 예비.

1. https://uptimerobot.com 가입.
2. **+ New monitor** → 종류 **HTTP(s)** → URL 은 위와 같은 `/api/ping` 주소.
3. 주기 **5분**(무료는 5분만 된다) → 알림 메일 켜고 만든다.
4. 무료 요금제는 2024년 10월부터 **개인 · 비영리 용도만** 허용한다(취미로 운영하는 게임은 해당).

## 점검하는 법

- 브라우저에서 `https://dragon-field.onrender.com/api/ping` 를 연다. `"gameVersion"` 이 보이면 깨어 있는 것.
- 30분쯤 뒤에 다시 열었을 때 1초 안에 뜨면 깨우기가 잘 돌고 있는 것.
- cron-job.org Dashboard 의 **Last Events** 가 계속 `Successful (200 OK)` 이고, **failed cronjobs** 가 0 이면 정상.

## 가끔 실패가 찍혀도 괜찮은 경우

- `upload.bat` 으로 새 판을 올린 직후, 또는 Render 가 무료 서버를 스스로 재시작할 때 1~2번 `Failed (timeout)` 이 찍힐 수 있다.
  바로 다음 실행이 성공하면 문제없다. 실패가 **계속 이어질 때만** Render 화면에서 서버 상태를 본다.
- 실패 메일이 오고 작업이 꺼졌으면 → 그 작업의 **Enabled** 스위치를 다시 켠다.

## 주의

- 서버 하나를 한 달 내내 깨워 두면 750시간 가운데 **720~744시간**을 쓴다.
  같은 Render 계정에 다른 무료 서비스가 함께 돌면 시간이 모자랄 수 있다.
- 깨워 두어도 Render 가 무료 서버를 가끔 스스로 재시작할 수 있어서, 드물게 1분 기다리는 일은 남는다.
- 깨우는 주소로 **메인 주소(`/`)나 `robots.txt` 는 쓰지 않는다.**
  `robots.txt` 는 서버가 잠든 동안 Render 가 대신 답해 버려서, 도구에는 정상으로 보이는데 서버는 계속 잠들어 있다.

## 남은 추천 작업

1. **운영자 창에 "깨우기 상태" 보이기** — 서버가 언제부터 깨어 있었는지와 마지막으로 두드린 시각을 게임 안에서 바로 본다.
2. **UptimeRobot 예비 걸기** — 위 방법 그대로.

## 출처

- [How to Keep a Render Free Service From Sleeping (odown)](https://odown.com/blog/how-to-keep-a-render-free-service-from-sleeping/)
- [Cron-job.org Free Tier 2026 (agentdeals)](https://agentdeals.dev/vendor/cron-job-org)
- [UptimeRobot Pricing 2026 (notifier)](https://notifier.so/guides/uptimerobot-pricing-2026/)
- [GitHub Docs — Disabling and enabling a workflow](https://docs.github.com/en/enterprise-server@3.20/actions/using-workflows/disabling-and-enabling-a-workflow)
