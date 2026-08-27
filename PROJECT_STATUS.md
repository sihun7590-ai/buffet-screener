# 프로젝트 현재 상태

**마지막 갱신: 2026-08-27** · 커밋 `9a81c28` (main)

이 문서는 **현재 코드에서 직접 확인한 사실만** 기록합니다. 과거 세션의 의도나 계획은 추측하지 않았습니다.
근거(파일·줄번호) 없는 주장은 이 문서에 넣지 않았습니다.

---

## 0. 작업 로그

> **갱신 규칙:** 작업을 끝내고 커밋할 때마다 **맨 위에 한 줄** 추가하세요 (최신이 위).
> 날짜 · 무엇을 · **왜**. 커밋 해시가 있으면 함께. 확인한 것만 적고, 추측은 적지 않습니다.
> 이 로그가 `/clear` 이후 맥락을 복구하는 1차 자료입니다.

| 날짜 | 작업 | 커밋 |
|---|---|---|
| 2026-08-27 | **모바일 레이아웃 대응 (M1~M3)** — 사이드바가 `w-[236px]`로 반응형 접두사 없이 고정돼 375px 화면의 63%를 먹고 있었음. `hidden lg:flex`로 숨기고 내비 3개를 헤더 아래 가로줄(`MobileNav`)로 이동. 헤더 축소 대응 + 백테스트 고정 4열 그리드 수정. 375·820·1280px 실측 (TASKS M1~M3) | — |
| 2026-08-27 | **`useTheme.ts` 삭제 (T6)** — 리디자인이 남긴 마지막 테마 잔재. 아무도 쓰지 않는 `data-theme`를 `MutationObserver`로 구독하며 항상 `"dark"`만 반환하던 훅. `TradingViewChart`가 상수를 직접 쓰도록 바꿈. 사이드바 정리와 같은 뿌리(`48654dd`) | — |
| 2026-08-27 | **사이드바의 죽은 컨트롤 4개 전부 제거** — 종목상세·계정·가중치설정(전부 아무 데도 못 가는 링크) + 다크모드(핸들러 없는 `<div>` 장식). 조작 가능해 보이는데 아무 일도 안 일어나면 사용자는 기능이 없다고 느끼는 게 아니라 **사이트가 고장 났다고 느낌**. 미사용 i18n 키와 `theme` 네임스페이스도 함께 삭제. 남은 항목 4개는 전부 실제 경로로 이동 (TASKS T15) | — |
| 2026-08-27 | **Phase 2 완료 (P2-5~P2-7)** — 포트폴리오 추적 · Thesis Breaker · 알림 기준 설정. Supabase 테이블 3개 추가 (마이그레이션 `004`). ⚠️ **SQL Editor에서 004를 실행해야 동작** — 미실행 시 빈 상태로 표시되고 기존 기능은 정상. Breaker 조건은 P1-4 조건 검색의 지표 레지스트리를 재사용해 두 곳이 어긋나지 않게 함 | — |
| 2026-08-27 | **Phase 1 완료 (P1-1~P1-4)** — Bull/Bear Case · Peer 지표 확장 · Fair Value 4방법 가중평균 · Custom Strategy Builder. 제품 스펙 27개 항목을 전수 대조해 Phase 1·2만 하기로 확정한 뒤 착수. **새 외부 데이터 소스 0개, 버핏 점수 계산 무변경** — 전부 기존 스냅샷을 읽어 파생. 상세는 [TASKS.md](TASKS.md) | — |
| 2026-08-27 | **상태 문서 5종 신설** (CLAUDE / PROJECT_STATUS / ARCHITECTURE / ROADMAP / TASKS). 이전 세션 컨텍스트가 소실되어, 코드를 유일한 사실 출처로 삼아 전수 분석 후 문서화. 세션 간 상태 복구를 파일로 해결하는 것이 목적 | — |
| 2026-08-27 | **Supabase 인증 URL 설정** — 프로덕션 로그인 복구. 코드가 아니라 대시보드 설정 문제였음 (5-① 참고) | 코드 변경 없음 |
| 2026-08-27 | **`vercel.json`의 잘못된 `env` 블록 제거** — `3c1ea87` 이후 모든 배포가 빌드 전에 Error로 죽던 원인. 로컬 빌드는 계속 성공해서 발견이 늦었음 | `9a81c28` |
| 2026-08-27 | 점수 갱신 (GitHub Actions 자동) | `bea6259` |
| 2026-08-26 | 다크-퍼플 디자인 시스템 전면 리디자인 — 사이드바+슬림헤더, 라이트 테마 제거, CSV 내보내기 추가 | `48654dd` |

---

## 1. 한 줄 요약

Next.js 16 + TypeScript로 만든 **S&P 500 가치투자 스크리너**.
SEC EDGAR(재무) + Yahoo Finance(시세)를 배치로 긁어 5개 축 100점 스코어링 → `data/scores.json`에 캐시 → 즉시 서빙.
로그인·즐겨찾기·점수 히스토리는 Supabase. **전 구간 무료 스택이고 결제 시스템은 없습니다.**

---

## 2. 구현 완료

| 기능 | 코드 근거 | 비고 |
|---|---|---|
| 5축 스코어링 엔진 | `lib/scoring.ts` (563줄) | `SCORING_VERSION = 4` |
| 측정불가 / 0점 구분 + 축별 커버리지 | `lib/scoring.ts:140` `unavailable()`, `:518` `axisScore()` | 커버리지 50% 미만이면 분모 고정 |
| 내재가치(DCF) + 안전마진 | `lib/scoring.ts:144` `computeIntrinsicValue()` | 할인율 9.5%, 영구성장 2.5%, 5년 투영 |
| Buy Candidate 판정 | `lib/scoring.ts:490-500` | 70점 + 안전마진>0 + 전 축 커버리지≥70% |
| SEC EDGAR XBRL 파싱 | `lib/xbrl.ts`, `lib/sec.ts` (20KB) | 태그 우선순위 목록 + `CIK_OVERRIDES` |
| 분기 재무 TTM 조립 | `lib/quarterly.ts` | `periodType: "ttm" \| "annual"` |
| Yahoo Finance 시세 | `lib/price.ts` | 9년치 일봉 1콜 |
| 스크리너 대시보드 | `components/Dashboard.tsx` (32KB) | 정렬·검색·섹터/총점/BuyCandidate 필터·60개씩 더보기 |
| CSV 내보내기 | `Dashboard.tsx:69-71` `csvCell()` | |
| 사용자 가중치 조정 | `lib/customWeights.ts` + Dashboard 슬라이더 | localStorage 저장, 브라우저에서 재블렌딩 |
| 종목 상세 페이지 | `app/[locale]/stock/[ticker]/page.tsx` | 6개 소스 병렬 fetch |
| 항목별 breakdown 표 | `components/CriteriaTable.tsx`, `lib/criteriaText.ts` | |
| 용어 툴팁 | `components/InfoTip.tsx` | 포털 + `position:fixed` |
| TradingView 차트 임베드 | `components/TradingViewChart.tsx`, `PriceChartPanel.tsx` | 확대·풀스크린 폴백 |
| 차트 실패 진단 안내 | `components/ChartUnavailable.tsx` | HTTPS 검사/광고차단 원인별 안내 |
| 위키피디아 회사 소개 | `lib/wikipedia.ts` | 언어간링크로 로케일 대응 |
| 최근 뉴스 (30일) | `lib/news.ts` | Yahoo search 엔드포인트 |
| 인사이더 매매 (Form 4) | `lib/insiderTrading.ts` (12.7KB) | `fast-xml-parser`, nonDerivative만 |
| 동종업계 비교 | `lib/peers.ts`, `components/PeerComparison.tsx` | |
| 점수 히스토리 차트 | `lib/scoreHistoryQuery.ts`, `components/ScoreHistoryChart.tsx` | 2점 미만이면 패널 미표시 |
| 관심종목 변화 감지 | `lib/alerts.ts` (8.2KB), `components/WatchlistAlerts.tsx` | 9종 알림, 페이지 방문 시 계산 |
| 백테스트 (4전략) | `lib/backtest.ts`, `app/[locale]/backtest/page.tsx` | look-ahead bias 없음이 설계 핵심 |
| Sharpe·연도별수익률·기간상세 | `lib/backtest.ts:275-297` | 이미 계산된 분기수익률 위의 순수함수 |
| DCA 시뮬레이터 (종목별) | `lib/dca.ts`, `components/DcaSimulator.tsx` | 일/주/월, 월 29-31일 클램프 |
| 이메일 로그인/회원가입 | `app/[locale]/login/page.tsx` | Supabase Auth |
| Google OAuth 로그인 | `login/page.tsx:84` `signInWithOAuth` | |
| 전 사이트 로그인 게이트 | `proxy.ts:18-63` | 비로그인은 `/login?next=...`로 리다이렉트 |
| 즐겨찾기 + MY Page | `app/[locale]/mypage/page.tsx`, `lib/supabase/useFavorites.ts` | 찜한 시점 주가 대비 등락률 |
| 다국어 (ko/en) | `i18n/`, `messages/*.json` (66KB) | `defaultLocale: "en"` |
| 다크 전용 디자인 시스템 | `app/globals.css` | 시맨틱 토큰 + `@theme inline` |
| 배치 실패 안전장치 | `scripts/refresh.ts:26-37` | `--max-failures=25` |
| 자동 갱신 스케줄 | `.github/workflows/refresh.yml` | 평일 23:00 UTC |

**빌드 상태 (2026-08-27 검증):** `npm run build` 성공 · `npx tsc --noEmit` 에러 0 · `npm run lint` 경고 0

---

## 3. 부분 구현

| 항목 | 현재 상태 | 코드 근거 |
|---|---|---|
| **종목 커버리지** | 유니버스 503종목 중 **498종목만** 점수 있음. 누락 5개: `APA`, `EQR`, `HONA`, `SYF`, `TFC` | `data/scores.json` vs `data/universe.json` 대조 |
| **백테스트 기간** | 14개 분기말(2023-03-31 ~ 2026-06-30)뿐. 일간 forward 행 499개는 **의도적으로 미사용** | `lib/backtest.ts:30-38` |
| **점수 히스토리 상세** | `criteria` jsonb는 분기 백필 행에만 있음. 일간 행은 null (용량 때문) | `supabase/migrations/003_*.sql` |
| **알림** | 화면에서만 표시. 이메일·푸시 없음 (주석에 "won't be without a budget"로 명시) | `lib/alerts.ts:3` |
| **섹터 평균 PER** | 실시간 조회가 아니라 **하드코딩된 근사치 11개** | `lib/scoring.ts:28-41` `SECTOR_AVG_PE` |
| **테마 전환** | 다크 전용. `useTheme.ts`는 남아있으나 `data-theme`를 **쓰는 코드가 없어** 항상 "dark" 반환 | `components/useTheme.ts` (아래 5-③) |

---

## 4. 미구현 (코드에 존재하지 않음)

- **결제/구독 시스템** — Stripe·결제·요금제 코드가 저장소 전체에 **하나도 없습니다**. (grep 확인)
- **테스트 코드** — 테스트 파일·테스트 러너·테스트 스크립트 없음.
- **이메일/푸시 알림** — 위 3번 참고.
- **관리자 화면** — 없음.
- **포트폴리오/보유종목 기록** — 즐겨찾기(찜)만 있고 수량·매수가 관리는 없음.
- **S&P 500 외 유니버스** — `data/universe.json` 고정. 자동 갱신 스크립트 없음.
- **API 라우트** — `app/auth/callback/route.ts` 하나뿐. 외부에 노출된 데이터 API 없음.

---

## 5. 현재 문제점

### ① Supabase 로그인 리다이렉트가 localhost로 감 — **2026-08-27 해결됨**

증상: 로그인 후 `localhost:3000/?code=...`로 튕기며 `ERR_CONNECTION_REFUSED`.
코드는 `window.location.origin`을 쓰므로 처음부터 정상이었고 (`login/page.tsx:86`),
원인은 Supabase 프로젝트의 URL 설정이었습니다.

Supabase → Authentication → URL Configuration에서 `Site URL`과 `Redirect URLs`를
프로덕션 도메인으로 지정해 해결. 프로덕션 로그인 동작 확인했습니다.
(README 99-105줄에 같은 안내가 있습니다. 로컬 개발을 계속하려면
`http://localhost:3000/auth/callback`도 Redirect URLs에 남겨두세요.)

### ② Vercel 배포 전량 실패 — **2026-08-27 해결됨**

`3c1ea87`에서 추가된 `vercel.json`의 `env` 블록이 Vercel 스키마 위반(문자열 대신 객체)이라
**빌드 시작 전에** 모든 배포가 Error로 죽었습니다. 로컬 빌드는 계속 성공했기 때문에 발견이 늦었습니다.
`09a45fc`에서 `env` 블록 제거 → 배포 성공 확인 (사이트 HTML에 리디자인 전용 클래스 `w-[236px] bg-canvas-sidebar` 존재).

### ③ `useTheme.ts`가 유명무실 — 동작엔 지장 없음

리디자인에서 라이트 테마를 걷어내며 `ThemeToggle.tsx` 삭제 + layout의 인라인 테마 스크립트 제거.
그 결과 `data-theme`를 **쓰는 코드가 아무 데도 없어** `useTheme()`은 항상 `"dark"`를 반환하고,
`applyTheme()`는 호출자가 없는 죽은 코드입니다. 주석은 아직 존재하지 않는 토글을 설명합니다.
TradingView 차트가 "dark"를 받는 결과 자체는 맞아서 **버그는 아닙니다.**

### ④ 종목 상세 페이지가 방문마다 외부 6곳을 호출

`stock/[ticker]/page.tsx:61`에서 위키·뉴스·Form4·거래소·히스토리·주가를 매 요청 병렬 호출하고
전 페이지가 `force-dynamic`입니다. 캐시가 없어 새로고침마다 반복됩니다.
현재 트래픽에선 문제 없으나 **확장 시 첫 번째 병목**입니다.

### ⑤ SEC User-Agent에 개인 이메일이 하드코딩

`lib/insiderTrading.ts:36`에 `sihun7590@gmail.com`이 들어 있고 저장소는 **Public**입니다.
SEC가 신원 표기를 요구하므로 의도된 것이지만, 공개 노출을 원치 않으면 환경변수로 뺄 수 있습니다.

### ⑥ `Fmp*` 타입 이름이 실제 소스와 불일치

FMP(유료 API)는 **이미 제거되었고 호출 코드·API 키가 저장소에 없습니다.**
`lib/types.ts`의 `FmpProfile` / `FmpRatios` 등 **이름만** 남아 SEC+Yahoo에서 만든 데이터를 담고 있습니다.
동작에 문제 없으나 처음 읽는 사람이 유료 API를 쓰는 줄 오해합니다.

---

## 6. 비용 현황 — **현재 유료 결제 요소 0건**

요청하신 "비용 발생 부분 제거"를 기준으로 전수 점검한 결과, **제거할 유료 항목이 없었습니다.**
따라서 이번 작업에서 코드를 삭제하지 않았습니다. 근거는 아래와 같습니다.

| 항목 | 비용 | 확인 방법 |
|---|---|---|
| SEC EDGAR | **무료·키 불필요** | `lib/xbrl.ts`, `lib/insiderTrading.ts` — User-Agent만 요구 |
| Yahoo Finance | **무료·키 불필요** | `lib/price.ts`, `news.ts`, `tradingview.ts` |
| Wikipedia | **무료·키 불필요** | `lib/wikipedia.ts` |
| TradingView 위젯 | **무료** (브라우저가 직접 로드) | `components/TradingViewChart.tsx` |
| Supabase | **무료 티어** | 코드가 참조하는 환경변수는 Supabase 3개가 전부 |
| Vercel | **Hobby (무료)** | `vercel.json` — `crons: []` 비어 있어 크론 과금 없음 |
| GitHub Actions | **무료** (Public 저장소는 무제한) | `.github/workflows/refresh.yml` |
| Google Fonts | **무료** (`next/font`가 빌드 시 자체 호스팅) | `app/[locale]/layout.tsx:11-21` |
| **FMP (유료 API)** | **이미 제거됨** | 호출 코드·API 키 grep 결과 0건. 타입 이름만 잔존 |
| 결제 시스템 | **없음** | stripe/payment/billing/subscription grep 0건 |

**코드에서 참조하는 환경변수 전체 (3개, 모두 Supabase):**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### 앞으로 비용이 생길 수 있는 지점 (지금은 0원, 감시 대상)

1. **Vercel Hobby는 상업적 이용 불가** — 수익화하면 Pro($20/월)로 강제 전환됩니다.
2. **`force-dynamic` 전면 적용** — 모든 페이지뷰가 서버리스 함수 실행. Hobby 한도(100GB-hours/월)를 쓰는 유일한 축.
3. **Supabase 무료 티어 500MB** — `score_history` 일간 적재가 계속 쌓입니다. README는 수십 MB/년으로 추정.
4. **저장소를 Private으로 바꾸면** GitHub Actions가 유료 분(月 2,000분 무료)으로 전환. 현재 배치는 회당 ~30분 × 주 5회 = 월 ~600분.

---

## 7. 커밋 이력 (git 로그 그대로)

> 0번 "작업 로그"가 **왜 했는지**를 적는 곳이라면, 여기는 **git이 말하는 사실**입니다.
> 새 커밋은 0번에 적으면 되고, 이 표는 굳이 손대지 않아도 `git log`로 언제든 다시 만들 수 있습니다.

| 커밋 | 내용 |
|---|---|
| `9a81c28` | `vercel.json`의 잘못된 `env` 블록 제거 → 배포 복구 (2026-08-27) |
| `bea6259` | 점수 갱신 2026-08-27 (GitHub Actions 자동 커밋) |
| `48654dd` | **다크-퍼플 디자인 시스템 전면 리디자인** — 사이드바+슬림헤더 도입, 라이트 테마 제거, `ThemeToggle` 삭제, `HeaderSearch`/`Sidebar`/`SidebarNav` 신규, CSV 내보내기 추가 |
| `c1ab35b` | 점수 갱신 2026-08-25 |
| `bde6aea` | 월간 DCA 29-31일 허용 |
| `cb08b65` | 수제 SVG 차트 커서/호버 불일치 수정 |
| `452c30f` | 전 사이트 로그인 필수화 + 종목별 DCA 시뮬레이터 |
| `3c1ea87` | Vercel 배포 준비 + 문서화 (**여기서 vercel.json 문제 유입**) |

---

## 8. 데이터 현황 (2026-08-27 실측)

```
data/scores.json     498종목 · source: "live" · scoringVersion: 4 · Buy Candidate 21개
                     generatedAt 2026-08-27T04:26:39Z · 3.3MB
data/universe.json   503종목 (ticker, companyName, sector, wikiTitle)
data/backtest.json   14개 분기말 (2023-03-31 ~ 2026-06-30) · 4전략
data/fixtures.ts     키 없이 개발용 샘플 데이터
```
