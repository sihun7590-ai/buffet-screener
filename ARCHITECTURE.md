# 아키텍처

**작성 기준일: 2026-08-27** · 커밋 `9a81c28`
현재 코드에서 확인한 구조만 기록합니다. README의 "프로젝트 구조"가 파일별 한 줄 설명이라면, 이 문서는 **경계와 흐름**을 다룹니다.

---

## 1. 핵심 설계 결정

**실시간 스캔이 아니라 배치 + 캐시.**
S&P 500 전 종목을 요청마다 계산하면 종목당 SEC 1콜 + Yahoo 1콜 = 1,000콜이 페이지뷰마다 발생합니다.
그래서 배치가 하루 1회 전부 계산해 `data/scores.json`에 넣고, 웹은 그 파일만 읽습니다.

**결과: 읽기 경로에 DB가 없습니다.** 스크리너와 종목 상세의 점수는 전부 로컬 JSON 파일에서 옵니다.
Supabase는 *사용자별 데이터*(로그인·즐겨찾기)와 *시간이 지나야 쌓이는 데이터*(점수 히스토리)만 담당합니다.

---

## 2. 두 개의 실행 경로

```
┌─ 배치 (수동 / GitHub Actions 평일 23:00 UTC) ───────────────────────┐
│                                                                      │
│  data/universe.json (503종목)                                        │
│         │                                                            │
│         ├─→ lib/xbrl.ts ──── SEC EDGAR (data.sec.gov)                │
│         │     ticker→CIK, XBRL companyfacts, 연간 시계열              │
│         │                                                            │
│         ├─→ lib/quarterly.ts ── 분기 facts → TTM 조립                 │
│         │                                                            │
│         ├─→ lib/price.ts ───── Yahoo Finance (9년 일봉 1콜)           │
│         │                                                            │
│         └─→ lib/sec.ts ─────── 위 셋을 TickerFinancials로 조립         │
│                  │              (ROE·ROIC·PER 등 비율을 직접 계산)      │
│                  ▼                                                   │
│            lib/scoring.ts  ← 순수 함수. I/O 없음                      │
│                  │                                                   │
│         ┌────────┴────────┐                                          │
│         ▼                 ▼                                          │
│  data/scores.json   Supabase score_history                           │
│  (스냅샷, 덮어씀)    (영구, service_role 키로 적재)                     │
└──────────────────────────────────────────────────────────────────────┘

┌─ 웹 (요청마다) ──────────────────────────────────────────────────────┐
│                                                                      │
│  proxy.ts  ─ next-intl 로케일 라우팅 → Supabase 세션 갱신 → 로그인 게이트│
│      │                                                               │
│      ▼                                                               │
│  app/[locale]/*  (전부 force-dynamic)                                 │
│      │                                                               │
│      ├─ lib/store.ts → data/scores.json  (점수. DB 왕복 없음)         │
│      ├─ lib/scoreHistoryQuery.ts → Supabase (히스토리, anon 키)       │
│      └─ 종목 상세만: 위키 / 뉴스 / Form4 / 거래소 / 주가 를 병렬 실시간 호출│
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. 모듈 경계 (지켜야 하는 규칙)

| 계층 | 파일 | 규칙 |
|---|---|---|
| **순수 계산** | `scoring.ts` `backtest.ts` `peers.ts` `dca.ts` `customWeights.ts` `alerts.ts` | fetch·fs·Supabase **금지**. 네트워크 없이 테스트 가능해야 함 |
| **I/O 어댑터** | `xbrl.ts` `quarterly.ts` `sec.ts` `price.ts` `news.ts` `wikipedia.ts` `insiderTrading.ts` `tradingview.ts` | 외부 세계와 닿는 유일한 곳. 실패해도 페이지가 죽지 않게 방어 |
| **영속** | `store.ts`(파일) `backtestStore.ts`(파일) `scoreHistory.ts`(쓰기) `scoreHistoryQuery.ts`(읽기) `supabase/*` | |
| **배치 진입점** | `scripts/*.ts` | 외부 세계를 건드리는 것이 허용된 유일한 실행 단위 |
| **표현** | `app/**` `components/**` | 계산 로직을 새로 만들지 않음 |

`lib/types.ts`가 계층 간 계약입니다. `TickerFinancials`(입력) → `StockScore`(출력).

> **주의:** `types.ts`의 `Fmp*` 접두사는 **과거 유료 API(FMP) 시절의 이름 잔재**입니다.
> 지금 이 타입들은 SEC+Yahoo에서 만든 데이터를 담습니다. FMP 호출 코드는 저장소에 없습니다.

---

## 4. 스코어링 구조

5개 축을 각각 100점으로 독립 채점 → 가중평균.

| 축 | 가중 | 항목(배점) |
|---|---|---|
| quality | 30% | ROE 28 · ROIC 28 · 매출총이익률 16 · 영업이익률 10 · FCF마진 10 · 자사주매입 8 |
| valuation | 25% | 안전마진 40 · PER상대 25 · PEG 20 · 그레이엄넘버 15 |
| health | 20% | 부채비율 30 · 이자보상 25 · 유동비율 20 · 순부채/EBITDA 15 · 현금/부채 10 |
| growth | 15% | 매출CAGR 35 · EPS CAGR 35 · FCF CAGR 30 |
| consistency | 10% | 흑자연수 40 · FCF흑자연수 35 · 매출성장일관성 25 |

**핵심 메커니즘 3가지:**

1. **연속 점수** — 통과/실패가 아니라 `linScore(value, low, high, maxPoints)`로 구간 선형 환산.
2. **측정 불가 ≠ 0점** — 공시에 숫자가 없으면 `unavailable()`로 **배점에서 통째 제외**하고 축 커버리지를 낮춥니다.
   숫자가 있는데 나쁘면(적자·자본잠식·매출감소) 측정된 것이므로 0점을 받습니다. 이 경계가 좁은 게 의도입니다.
3. **얇은 표본 상한** — 커버리지가 50% 미만이면 측정분으로 환산하지 않고 *배점의 절반*을 분모로 고정
   (`MIN_MEASURED_SHARE`). 버크셔가 health 5개 중 1개만 읽혀 100점 나오던 문제를 막습니다.

**Buy Candidate** = 총점 ≥70 **AND** 안전마진 >0 **AND** 전 축 커버리지 ≥70%.

**내재가치** = 최근 3년 FCF 평균 ÷ 희석주식수 → 5년 FCF CAGR(최대 12%)로 5년 투영 → 할인율 9.5% / 영구성장 2.5%로 할인.

`SCORING_VERSION`(현재 4)이 모든 점수에 저장되어, 히스토리 차트에서 회사 변화와 기준 변화를 구분합니다.

---

## 5. 데이터베이스 (Supabase Postgres)

```sql
favorites                          -- 001_favorites.sql
  id, user_id → auth.users, ticker,
  price_at_favorite,               -- 찜한 순간의 주가. 등락률의 기준
  favorited_at
  UNIQUE(user_id, ticker)
  RLS: select/insert/delete 전부 auth.uid() = user_id

score_history                      -- 002 + 003
  PK (ticker, as_of)               -- 재실행하면 그날 행을 덮어씀
  total, quality, growth, health, consistency, valuation
  price, margin_of_safety, is_buy_candidate, scoring_version
  is_backfilled  -- true = 사후 재구성. 그날 실제로 공개했던 점수가 아님
  criteria jsonb -- 항목별 상세. 분기 백필 행에만. 일간은 null (용량)
  INDEX (as_of)  -- "그날 시장 전체" 조회 = 백테스트의 접근 패턴
  RLS: 누구나 select 가능. **insert/update/delete 정책 없음**
       → 유일한 쓰기 주체는 service_role 키를 쓰는 배치(RLS 우회)
```

**RLS 설계 의도:** 점수는 공개 데이터라 읽기는 열려 있고, 쓰기 정책을 *아예 만들지 않아서*
anon 키로는 어떤 방법으로도 점수를 위조할 수 없습니다.

---

## 6. 인증 흐름

```
요청 → proxy.ts
        ├ next-intl 미들웨어 (로케일 판정/리다이렉트)
        ├ Supabase 세션 쿠키 갱신  ← Server Component는 쿠키를 읽기만 가능하므로 여기서 해야 함
        └ user 없으면 → /{locale}/login?next=<원래경로>
```

- **전 사이트 로그인 필수** (`452c30f`). 스크리너·종목상세·백테스트 모두 게이트 뒤에 있습니다.
- 예외: `matcher`가 `/auth`를 제외 → OAuth/이메일 콜백(`app/auth/callback/route.ts`)은 게이트를 통과.
- **환경변수가 없어도 사이트가 죽지 않습니다.** `lib/supabase/env.ts`가 더미 URL로 폴백하고
  `proxy.ts`는 게이트를 건너뜁니다 → 키 없이 `npm run dev`가 됩니다.
- 클라이언트 3종: `client.ts`(브라우저) / `server.ts`(RSC·Route Handler) / `admin.ts`(service_role, 배치 전용).

---

## 7. 페이지 구성

| 경로 | 파일 | 렌더링 | 주요 데이터 |
|---|---|---|---|
| `/{locale}` | `app/[locale]/page.tsx` | force-dynamic | `scores.json` → `Dashboard` |
| `/{locale}/stock/{ticker}` | `stock/[ticker]/page.tsx` | force-dynamic | `scores.json` + 외부 6곳 병렬 |
| `/{locale}/backtest` | `backtest/page.tsx` | force-dynamic | `backtest.json` |
| `/{locale}/mypage` | `mypage/page.tsx` | force-dynamic | Supabase favorites + 실시간 시세 + 히스토리 |
| `/{locale}/login` | `login/page.tsx` | client | Supabase Auth |
| `/auth/callback` | `app/auth/callback/route.ts` | route handler | PKCE code → 세션 |

전 페이지 `force-dynamic`인 이유: `scores.json`이 배치로 바뀌므로 빌드에 굽지 않고 매 요청 새로 읽습니다.

---

## 8. 컴포넌트 구조 (29개)

**레이아웃 셸** (리디자인으로 도입) — `Sidebar` → `SidebarNav` / `SiteHeader` → `HeaderSearch`(Cmd+K) · `LocaleSwitcher` · `SignOutButton`

**표시 원자** — `Panel`(모든 카드의 공통 껍데기) · `ScoreBar` · `ScoreGauge` · `InfoTip`(포털 툴팁) · `BackToListLink`

**스크리너** — `Dashboard`(32KB, 최대 컴포넌트: 정렬·검색·필터·가중치 슬라이더·CSV·페이지네이션)

**종목 상세** — `CriteriaTable` · `PriceChartPanel` → `TradingViewChart` / `ChartUnavailable` · `ScoreHistoryChart` · `PeerComparison` · `InsiderActivity` · `DcaSimulator` → `DcaChart` · `StockFavoriteButton` · `DataSourceNote`

**MY Page** — `MyFavoritesList` · `WatchlistAlerts` · `FavoriteButton`

**백테스트** — `BacktestChart`

**차트는 전부 직접 만든 SVG입니다** (`BacktestChart`, `DcaChart`, `ScoreHistoryChart`).
차트 라이브러리 의존성이 없습니다. TradingView만 예외적으로 외부 위젯입니다.

---

## 9. 스타일 시스템

`app/globals.css` 한 곳에만 색 값이 존재합니다. **다크 단일 테마** (리디자인에서 라이트 제거).

```
:root { --canvas --surface(-2..5) --line --ink(-2/4/6) --brand --up --down --warn ... }
@theme inline { --color-surface: var(--surface); ... }   ← Tailwind 유틸리티로 노출
→ 컴포넌트는 bg-surface / text-ink-muted / border-line 만 사용
```

> 현재 예외: 히어로 카드 몇 곳이 `style={{background: "linear-gradient(...)"}}`로 리터럴 색을 씁니다
> (`stock/[ticker]/page.tsx:99`, `login/page.tsx:99`). TASKS.md에 정리 대상으로 기록했습니다.

---

## 10. 다국어

`ko` / `en`, `defaultLocale: "en"`. `messages/*.json` 66KB.
네임스페이스: `common` `dashboard` `stock` `axes` `glossary` `backtest` `mypage` `auth` `sectors` `dataSource` `history` `criteria`

**중요:** 스코어 계산 결과에는 라벨·설명 문구를 저장하지 않습니다.
`CriterionResult`는 `id`와 원시 숫자(`values`)만 갖고, 문구는 렌더 시점에 `lib/criteriaText.ts`가 메시지 카탈로그에서 찾습니다.
덕분에 `scores.json`이 언어 중립이고, 번역을 고쳐도 배치를 다시 돌릴 필요가 없습니다.

---

## 11. 의존성 (런타임 7개)

`next` 16.3.1 · `react`/`react-dom` 19.2.8 · `next-intl` 4.13.7 · `@supabase/ssr` 0.12.5 · `@supabase/supabase-js` 2.112.4 · `fast-xml-parser` 5.11.0

의존성 수를 의도적으로 적게 유지해 왔습니다 (`fast-xml-parser`는 Form 4 XML 파싱을 정규식으로 하는 위험을 피하려 7번째로 추가된 것 — `lib/insiderTrading.ts:17-24`에 도입 근거 기록).

dev: `tailwindcss` 4 · `typescript` 5 · `eslint` 9 · `tsx`
