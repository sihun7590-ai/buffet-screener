@AGENTS.md

# 작업 규칙 (buffett-screener)

## 📍 세션 시작 — 이 순서로 읽으세요

대화 기록이 없어도(`/clear` 직후, 새 세션, 다른 사람) **이 세 파일만 읽으면 현재 상태를 복구**할 수 있게
유지하고 있습니다. 순서대로 읽으세요.

| 순서 | 파일 | 답하는 질문 |
|---|---|---|
| 1 | **이 파일** | 이 저장소에서 하면 안 되는 것은? |
| 2 | **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | **지금 어디까지 됐나? 최근에 뭘 했나?** ← 작업 로그가 맨 위에 있음 |
| 3 | **[TASKS.md](TASKS.md)** | 다음에 할 일은? |

필요할 때만: [ARCHITECTURE.md](ARCHITECTURE.md)(구조·데이터 흐름) · [ROADMAP.md](ROADMAP.md)(장기 방향) ·
[README.md](README.md)(제품 설명서·설치·운영. 사실상의 정본)

> 상태 문서와 실제 코드가 어긋나면 **코드가 정답입니다.** 문서를 고치세요.

## ✅ 세션 종료 — 커밋 전에 반드시

작업을 끝내고 커밋할 때 아래를 **같은 커밋에** 포함하세요. 이걸 빼먹으면 다음 세션이 다시 헤맵니다.

1. **[PROJECT_STATUS.md](PROJECT_STATUS.md)의 "작업 로그"에 한 줄 추가** — 날짜 · 무엇을 · 왜
2. **[TASKS.md](TASKS.md) 체크박스 갱신** — 끝낸 건 `[x]`로, 새로 발견한 건 항목 추가
3. 구조가 바뀌었으면 ARCHITECTURE.md, 방향이 바뀌었으면 ROADMAP.md도

**추측해서 적지 마세요.** 확인한 것만, 파일·줄번호와 함께 적습니다.

---

## 이 저장소의 규칙

프로젝트가 무엇인지·어떻게 쓰는지는 [README.md](README.md)가 정본이고, 여기에 다시 쓰지 않습니다.

## 명령어

```bash
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드 (타입체크 포함)
npm run lint       # eslint (flat config, next lint 아님)
npx tsc --noEmit   # 타입체크만
```

배치 (네트워크를 씁니다. 함부로 돌리지 마세요):

```bash
npm run refresh    # 503종목 재계산 → data/scores.json 덮어씀. 30분+ 소요
npm run archive    # 현재 scores.json을 Supabase 히스토리에 적재
npm run backfill   # 과거 분기 점수 재구성
npm run backtest   # data/backtest.json 재생성
```

## 절대 하지 말 것

- **`npm run refresh`를 확인 없이 실행하지 말 것.** `data/scores.json`(3.3MB, 사이트가 읽는 파일)을
  덮어쓰고 Supabase `score_history`에 그날 행을 영구히 남깁니다. 나쁜 실행은 안 도는 것보다 나쁩니다.
- **`vercel.json`에 `env` 블록을 넣지 말 것.** Vercel 스키마는 문자열 값만 받습니다.
  `{description, required}` 객체를 넣으면 빌드 전에 배포 전체가 Error로 죽습니다 (실제로 그랬음 — `09a45fc`).
  환경변수 설명은 README의 Deploy 버튼 쿼리 파라미터에 있습니다.
- **`SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이지 말 것.** RLS를 우회하는 키입니다.
- **유료 API를 도입하지 말 것.** 이 프로젝트는 전 구간 무료 스택이 설계 제약입니다
  ([PROJECT_STATUS.md](PROJECT_STATUS.md)의 비용 섹션). 새 데이터 소스는 키 불필요·무료여야 합니다.
- **색상 리터럴을 컴포넌트에 직접 쓰지 말 것.** 모든 색은 `app/globals.css`의 시맨틱 토큰
  (`bg-surface`, `text-ink-muted`, `border-line`, ...)으로 정의하고 컴포넌트는 토큰 유틸리티만 씁니다.
  (현재 일부 그라디언트만 예외적으로 인라인 — TASKS.md 참고)

## 조건/지표를 추가할 때

- 스크리너 조건 검색(`lib/strategy.ts`)과 Thesis Breaker(`lib/thesisBreakers.ts`)는
  **하나의 지표 레지스트리(`STRATEGY_METRICS`)를 공유**합니다. 지표를 추가하면 양쪽에 동시에 생깁니다.
  레지스트리를 복제하지 마세요 — 갈라지는 순간 같은 규칙이 두 곳에서 다른 뜻을 갖게 됩니다.
- 값의 단위는 **표시 단위**로 통일돼 있습니다 (퍼센트는 0.15가 아니라 15, 시가총액은 십억 달러).
  DB에도 표시 단위로 저장합니다. 한쪽만 바꾸면 100배 틀린 규칙이 조용히 만들어집니다.

## 스코어링을 건드릴 때

- 계산식을 바꾸면 `lib/scoring.ts`의 `SCORING_VERSION`을 **반드시** 올리세요.
  모든 점수에 함께 저장되므로, 히스토리 차트에서 "회사가 변한 것"과 "우리가 기준을 바꾼 것"이 구분됩니다.
- **"측정 불가"와 "0점"을 섞지 마세요.** 공시에 숫자가 아예 없으면 `unavailable()` (배점에서 통째로 제외),
  숫자가 있는데 나쁘면 `criterion()`으로 0점. 적자·자본잠식·매출감소는 후자입니다.
- `lib/scoring.ts`는 순수 함수만 둡니다. fetch·파일·Supabase 금지 (I/O는 `lib/sec.ts`와 `scripts/*`).

## 코드 컨벤션

- 주석은 **"왜"를 씁니다.** 이 저장소의 기존 주석이 그 기준이니 밀도와 톤을 맞추세요.
  무엇을 하는지는 코드가 말하고, 주석은 그 선택을 한 이유·버린 대안·실제로 터졌던 사례를 적습니다.
- 사용자에게 보이는 모든 문구는 `messages/ko.json` + `messages/en.json` 양쪽에 넣습니다. 하드코딩 금지.
- 서버 컴포넌트가 기본. `"use client"`는 상태·이벤트·브라우저 API가 실제로 필요할 때만.
- 외부 fetch는 실패해도 페이지 전체가 죽지 않게 합니다 (`try/catch` 후 빈 값 반환 — `lib/news.ts` 패턴).

## 배포

- `main`에 push하면 Vercel이 자동 배포합니다. GitHub Actions가 평일 23:00 UTC에
  `data/scores.json`을 커밋하므로, push 전에 `git pull --rebase`가 필요할 때가 잦습니다.
- 로컬 빌드가 통과해도 Vercel이 실패할 수 있습니다. 배포 실패 시 `vercel.json`부터 의심하세요.
