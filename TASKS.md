# 작업 목록

**작성 기준일: 2026-08-27** · 커밋 `9a81c28`

이번 분석에서 **실제로 확인한 것**만 올렸습니다. 각 항목에 파일·줄번호가 있습니다.
큰 방향은 [ROADMAP.md](ROADMAP.md), 상태 설명은 [PROJECT_STATUS.md](PROJECT_STATUS.md).

체크박스는 비워 두었습니다 — 무엇을 할지는 결정하실 몫입니다.

---

## 🚧 진행 중인 개발 계획 (Phase 1·2 — [ROADMAP.md](ROADMAP.md) 상단 참조)

Phase 3·4는 이번 범위 밖입니다. 뺀 이유는 ROADMAP에 적혀 있습니다.

### Phase 1 — 새 데이터 소스 0, DB 스키마 변경 0

- [x] **P1-1. Bull / Bear Case (규칙 기반)** — `lib/thesis.ts` + `components/ThesisPanel.tsx`
  - LLM 미사용. `criteria` 배열에서 배점 75% 이상 = 강점, 35% 이하 = 약점으로 분류
  - 정렬 기준은 **종합 100점 중 그 항목이 실제로 좌우한 크기**(`maxPoints × 축가중치`) — 자극적인 항목이 아니라 중요한 항목이 위로
  - `Key Risks`는 점수가 아닌 **구조적 조건** 7종을 별도 판정 (자본잠식·적자연도·고레버리지·주주이익 마이너스·희석·내재가치 초과·낮은 커버리지)
  - 측정 불가 항목은 **어느 쪽에도 넣지 않음** — 공시에 없는 것을 회사 잘못으로 세지 않기 위해
  - 검증: 498종목 전수, 불변식 위반 0건 (강약점 중복 0 · 미측정 누출 0 · 21개 항목 전부 최소 1회 노출)

- [x] **P1-2. Peer 비교 지표 확장** — `lib/peers.ts` + `components/PeerComparison.tsx`
  - 추가: ROIC · 매출성장 · EPS성장 · FCF마진 · 내재가치 (기존 ROE · D/E · PER · 안전마진 · 종합)
  - 13열이라 가로 스크롤 + 종목명 열 sticky
  - ⚠️ **P/FCF · EV/EBITDA는 제외** — 스냅샷에 저장되지 않는 수치. 넣으려면 `scoring.ts` 변경 + 503종목 재계산 필요

- [x] **P1-3. Fair Value 다중 방법 + 가중평균** — `lib/fairValue.ts` + `components/FairValuePanel.tsx`
  - 4개 방법: DCF 45% · 자체 과거 PER 30% · 섹터 PER 15% · 그레이엄 넘버 10%
  - 측정 불가한 방법이 있으면 **나머지에 가중치 재배분** (JPM처럼 DCF 불가 시 42/25/33)
  - **역산 DCF**: 현재 주가를 정당화하는 성장률을 이분법으로 역산 (498종목 중 430종목 해 존재, 오차 0.1% 이내 검증)
  - 그레이엄 가중치를 20%→10%로 낮춤 — 전수 실행 결과 자산경량 기업에서 극단적 이상치 (AAPL을 $38로 평가). 이유는 코드 주석에 기록
  - 방법 간 편차가 4배 이상이면 "목표주가로 받아들이지 말라" 경고 표시 (중앙값 2.7배, 최대 134배)
  - ⚠️ **버핏 점수에는 영향 없음** — 완성된 스냅샷을 읽기만 하므로 `SCORING_VERSION` 불변, 재계산 불필요
  - 기존 단일 DCF 패널을 대체 (그 3개 수치는 첫 줄과 DCF 행에 그대로 있음)

- [x] **P1-4. Custom Strategy Builder** — `lib/strategy.ts` + `components/StrategyBuilder.tsx`
  - 지표 23종 × `≥`/`≤` 조건, AND 결합. 예시 프리셋 4종 + 이름 붙여 저장 (localStorage)
  - **"조건 불만족"과 "측정 불가"를 구분해서 표시** — 공시에 수치가 없는 종목 수를 따로 보여줌
  - 조건은 세션에 저장하지 않음 (다음 방문에 11개만 보이고 이유를 모르는 상황 방지). 저장은 이름을 붙일 때만
  - 검증: 23개 지표 전부 실데이터 커버리지 존재, 빈 조건/불가능 조건/미지 지표 엣지 케이스 통과

### Phase 2 — Supabase 스키마 추가

- [ ] **P2-5. Portfolio Tracking** — 보유수량·평균단가
- [ ] **P2-6. Thesis Breaker 사용자 정의**
- [ ] **P2-7. Alert 임계값 사용자 설정**

---

## ✅ 이번에 해결됨

- [x] **T1. Supabase 인증 URL 설정** — 프로덕션 로그인 동작 확인 (2026-08-27)
  - 증상: 로그인 후 `localhost:3000/?code=...` → `ERR_CONNECTION_REFUSED`
  - 원인: **코드가 아니라 Supabase 프로젝트 설정.** 코드는 `window.location.origin`을 정상 사용 (`app/[locale]/login/page.tsx:86`)
  - 조치: Supabase → Authentication → URL Configuration에서 `Site URL` / `Redirect URLs`를 프로덕션 도메인으로 지정
  - ⚠️ 로컬 개발을 계속하려면 `http://localhost:3000/auth/callback`도 Redirect URLs에 남겨둘 것
  - 참고: README:104

- [x] **T2. Vercel 배포 전량 실패** — `09a45fc`에서 수정, 배포 성공 확인
  - 원인: `vercel.json`의 `env` 블록이 `{description, required}` 객체 → Vercel 스키마는 문자열만 허용
  - 결과: `3c1ea87` 이후 **모든** 배포가 빌드 시작 전에 Error. 로컬 빌드는 계속 성공해서 발견이 늦었음
  - 검증: 배포된 HTML에 리디자인 전용 클래스(`w-[236px]`, `bg-canvas-sidebar`) 존재 확인
  - 재발 방지: [CLAUDE.md](CLAUDE.md)에 금지 규칙 기록

---

## 🟡 데이터 정확도

- [ ] **T3. 누락 5종목** — `APA` `EQR` `HONA` `SYF` `TFC` (유니버스 503 vs 점수 498)
  - `TFC`/`SYF`: 은행 특유의 통합 매출 항목 부재 (README:34에 진단 있음)
  - `APA`/`HONA`: 최근 분할 신설법인이라 연간보고서 이력 없음 (README:34)
  - `EQR`: **README 목록에 없음 — 원인 미확인.** 새로 생긴 실패로 보임
  - 손댈 곳: `lib/xbrl.ts`의 `CIK_OVERRIDES`, `lib/sec.ts`의 태그 우선순위 목록

- [ ] **T4. 섹터 평균 PER이 하드코딩** — `lib/scoring.ts:28-41` `SECTOR_AVG_PE`
  - 11개 섹터 근사치. 주석이 스스로 "정밀한 지수가 아닌 sanity check"라고 한계를 인정
  - 대안: `scores.json`의 498종목에서 섹터 중앙값을 직접 계산 (외부 소스 불필요)
  - ⚠️ 계산식 변경이므로 `SCORING_VERSION` 올려야 함

---

## 🟡 코드-문서 불일치 (동작엔 지장 없음)

- [ ] **T5. `Fmp*` 타입 이름 정리** — `lib/types.ts:1-73`
  - FMP(유료 API)는 **이미 제거**되어 호출 코드·API 키가 저장소에 없음. **이름만** 남음
  - 지금 이 타입들은 SEC+Yahoo에서 만든 데이터를 담고 있음
  - 문제: 처음 읽는 사람이 유료 API를 쓰는 줄 오해함
  - 영향 범위: `lib/types.ts`, `lib/sec.ts` (import 및 5개 지역변수)
  - 순수 리네이밍 — 동작 무변화, `SCORING_VERSION` 불필요

- [ ] **T6. `useTheme.ts` 유명무실** — `components/useTheme.ts`
  - 리디자인에서 `ThemeToggle.tsx` 삭제 + layout의 인라인 테마 스크립트 제거
  - 결과: `data-theme`를 **쓰는 코드가 없어** `useTheme()`은 항상 `"dark"` 반환, `applyTheme()`는 호출자 0
  - 주석은 아직 존재하지 않는 토글을 설명 중 (`useTheme.ts:7-10`, `:21-22`)
  - **버그 아님** — `TradingViewChart`가 "dark"를 받는 결과는 맞음
  - 선택지: (a) 주석만 현실에 맞게 고침 (b) 훅을 지우고 `TradingViewChart`에 "dark" 상수 (c) 그대로 둠

- [ ] **T7. 인라인 색 리터럴** — 디자인 시스템 원칙 위반 지점
  - `app/[locale]/stock/[ticker]/page.tsx:99` — `linear-gradient(140deg,#181330,#101015 60%)`
  - `app/[locale]/login/page.tsx:99` — `linear-gradient(160deg,#161228,#101015 62%)`
  - 원칙: 색 값은 `app/globals.css`에만 존재해야 함 (`--panel-grad` 토큰이 이미 있음)

---

## 🟢 확장 대비 (지금은 문제 아님)

- [ ] **T8. 종목 상세 페이지의 외부 6콜** — `app/[locale]/stock/[ticker]/page.tsx:61`
  - 매 요청 병렬 호출: 위키 · 뉴스 · Form4 · 거래소명 · 점수히스토리 · 주가
  - 전 페이지 `force-dynamic`이라 새로고침마다 반복. 캐시 없음
  - 캐시 후보는 **위키 요약 · 거래소명** (거의 안 변함) — 이 둘만으로 호출 1/3 감소
  - ⚠️ 뉴스/Form4는 건드리지 말 것 — `lib/news.ts:3`이 실시간이어야 하는 이유를 명시

- [ ] **T9. 테스트 0개**
  - 순수 함수가 이미 분리되어 있어 붙이기 유리: `scoring.ts` `backtest.ts` `dca.ts` `peers.ts` `alerts.ts` `customWeights.ts`
  - 우선순위 1위는 `scoring.ts` — 규칙이 복잡하고 회귀 위험이 가장 큼
  - `lib/backtest.ts:5`가 "네트워크 없이 단위 테스트 가능"을 설계 목표로 이미 적어둠

- [ ] **T10. SEC User-Agent의 개인 이메일** — `lib/insiderTrading.ts:36`
  - `sihun7590@gmail.com`이 하드코딩. 저장소는 **Public**
  - SEC가 신원 표기를 요구하므로 **의도된 것** — 제거하면 SEC가 차단할 수 있음
  - 공개 노출이 싫으면 환경변수로 이전 (기본값은 유지해야 배치가 계속 동작)
  - 같은 패턴이 `lib/xbrl.ts`에도 있는지 확인 필요

---

## 💰 비용 — 확인 결과 **제거할 유료 항목 없음**

요청하신 "비용 발생 부분 제거"로 전수 점검했고, **이번 작업에서 삭제한 코드는 없습니다.**
현재 유료 결제가 발생하는 요소가 하나도 없기 때문입니다.

- FMP(유료 API)는 **이미 제거된 상태** — 호출 코드·API 키 grep 0건 (타입 이름만 잔존 → T5)
- 결제/구독 시스템 **코드 자체가 없음** — stripe/payment/billing grep 0건
- 코드가 참조하는 환경변수는 **Supabase 3개가 전부**
- SEC · Yahoo · Wikipedia · TradingView 전부 무료·키 불필요
- Vercel Hobby(무료) · `crons: []` 비어 있음 · GitHub Actions는 Public 저장소라 무제한

### 감시 대상 (지금 0원이지만 조건이 바뀌면 과금)

- [ ] **T11. Vercel Hobby는 상업적 이용 불가** — 수익화 시 Pro($20/월) 강제 전환
- [ ] **T12. Supabase 무료 티어 500MB** — `score_history` 일간 적재가 계속 증가 (README 추정 수십 MB/년). 주기적 확인 필요
- [ ] **T13. 저장소를 Private으로 바꾸면** GitHub Actions 과금 시작 — 현재 회당 ~30분 × 주 5회 ≈ 월 600분 (무료 한도 2,000분)
- [ ] **T14. `force-dynamic` 전면 적용** — Hobby 함수 실행 한도(100GB-hours/월)를 쓰는 유일한 축. T8과 연결됨

---

## 참고: 검증 완료 사항 (2026-08-27)

| 항목 | 결과 |
|---|---|
| `npm run build` | ✅ 성공 |
| `npx tsc --noEmit` | ✅ 에러 0 |
| `npm run lint` | ✅ 경고 0 |
| TODO/FIXME/HACK 주석 | **0건** (`eslint-disable` 1건만 존재, 사유 주석 있음 — `Dashboard.tsx:115`) |
| `.env.local` git 추적 | ✅ 추적 안 됨, 히스토리에도 없음 |
| 프로덕션 배포 | ✅ 리디자인 반영 확인 |
