# 버핏 저평가 우량주 스크리너

워렌 버핏·벤저민 그레이엄식 가치투자 기준으로 **S&P 500 전 종목**을 스코어링하는 웹 스크리너입니다.
저평가 우량주를 실시간으로 스캔하는 대신, **하루 1회 정도 배치로 재계산 → 결과를 캐시해서 즉시 서빙**하는 구조입니다.

데이터는 **SEC EDGAR(미국 증권거래위원회 공식 재무제표 API)** + **Yahoo Finance(시세)** 조합으로 가져옵니다. 둘 다 완전 무료·키 불필요·일일 요청 한도 없음이라 별도 가입/설정 없이 바로 씁니다.

## 빠른 시작

```bash
npm install
npm run dev
```

키 설정 없이도 [data/fixtures.ts](data/fixtures.ts)의 **샘플 데이터**로 바로 동작합니다 (대시보드 상단에 노란 배너로 표시됩니다).

## 실제 데이터로 전환하기

키 발급이나 계정 가입 없이 바로 실행하면 됩니다:

```bash
npm run refresh
```

종목당 SEC EDGAR 1회 + Yahoo Finance 1회, 총 2회 호출이며 S&P 500 전체(503종목) 기준 약 1,000회 — 두 소스 모두 일일 한도가 없어 언제든 원하는 만큼 재실행할 수 있습니다. 종목 수가 많아 한 번 실행에 10분 이상 걸릴 수 있습니다. `npm run dev`로 확인하면 배너가 사라지고 실제 데이터가 표시됩니다.

종목 유니버스는 [data/universe.json](data/universe.json)에서 관리합니다 (티커, 회사명, 섹터). 현재는 위키피디아의 S&P 500 구성종목 목록으로 채워져 있으며, 지수 구성은 분기마다 바뀌므로 최신 상태를 유지하려면 이 파일을 주기적으로 다시 생성해야 합니다.

### 데이터 소스에 대한 참고

- SEC EDGAR는 회사가 제출한 원본 XBRL 재무제표를 그대로 제공하며, ROE·PER 같은 비율은 제공하지 않아 [lib/sec.ts](lib/sec.ts)에서 직접 계산합니다.
- 회사마다 같은 항목이라도 다른 회계 태그를 쓰는 경우가 있어([lib/sec.ts](lib/sec.ts)의 태그 우선순위 목록 참고), 일부 종목은 일부 지표가 "N/A"로 표시될 수 있습니다 (예: 복수 종류주를 발행하는 회사는 SEC의 평평한 API에서 EPS·주식수가 조회되지 않을 수 있음 — BRK-B, V 등 503종목 중 9종목).
- 은행·보험·리츠처럼 설비투자(CapEx)를 별도로 공시하지 않는 업종은 잉여현금흐름을 영업현금흐름만으로 근사합니다.
- 일부 회사는 지주회사 재편·분할 등으로 SEC 등록정보가 바뀌기도 합니다. 503종목 중 4종목(TFC, SYF — 은행 특유의 통합 매출 항목 부재, APA, HONA — 최근 분할로 신설된 법인이라 아직 연간보고서 이력 없음)은 현재 데이터를 가져오지 못합니다. 티커의 SEC CIK 자체가 잘못 연결된 경우(AEP, XOM 등)는 [lib/xbrl.ts](lib/xbrl.ts)의 `CIK_OVERRIDES`에 수동으로 매핑을 추가해 해결합니다.

## 스코어링 기준 (100점 만점)

- **우량성 (Quality) 50점**: ROE·ROIC 5년 평균, 매출총이익률 수준/안정성, 부채비율·이자보상배율, EPS 일관성(적자 여부), 잉여현금흐름, 자사주 매입 추세, 유동비율
- **저평가/안전마진 (Valuation) 50점**: 자체·업종 평균 대비 PER, PEG 비율, 그레이엄 넘버 대비 주가, 소유주이익(Owner Earnings) 기반 단순 DCF 내재가치 대비 **안전마진**

각 항목의 실제 수치·기준값·배점은 종목 상세 페이지에서 모두 투명하게 공개됩니다. 총점 70점 이상 + 안전마진 양수인 종목에 "Buy Candidate" 태그가 붙습니다.

로직은 [lib/scoring.ts](lib/scoring.ts)에서 확인/조정할 수 있습니다.

### 종목 상세 페이지의 추가 정보

스코어 breakdown 외에, 종목 상세 페이지를 열 때마다 아래 정보를 실시간으로 가져와 보여줍니다 (배치 캐시에 저장하지 않고 매 방문마다 새로 조회 — 특히 뉴스는 신선도가 중요해서):

- **회사 소개**: 위키피디아 문서 요약. 영어 문서명(`data/universe.json`)을 기준으로 언어간링크를 조회해 해당 언어(예: 한국어) 위키피디아 문서가 있으면 그 요약을, 없으면 영어 요약을 보여줍니다 ([lib/wikipedia.ts](lib/wikipedia.ts))
- **최근 뉴스**: Yahoo Finance 뉴스 검색에서 최근 30일 이내 관련 기사 ([lib/news.ts](lib/news.ts))
- **주가 차트**: TradingView의 무료 임베드 위젯 — 일봉/주봉/월봉 전환, 추세선·평행채널 등 드로잉 툴, 보조지표를 모두 기본 제공합니다 ([components/TradingViewChart.tsx](components/TradingViewChart.tsx), [lib/tradingview.ts](lib/tradingview.ts)에서 티커를 `거래소:티커` 형식으로 매핑)

## 화면 디자인

TradingView·Investing.com 같은 전문 트레이딩 화면을 기준으로 만들었습니다.

- **다크 우선 + 라이트 테마**: 색은 전부 `app/globals.css`의 시맨틱 토큰(`--surface`, `--ink-muted`, `--up`, `--down` 등)으로 정의하고, 컴포넌트는 `bg-surface`·`text-ink-muted`처럼 토큰 유틸리티만 씁니다. 테마는 `<html data-theme>` 한 곳에서 바뀌므로 `dark:` 변형을 컴포넌트마다 붙일 필요가 없습니다. 첫 페인트 전에 인라인 스크립트가 저장된 값을 적용해 흰 화면이 번쩍이지 않습니다.
- **테마 상태 관리**: `data-theme` 속성이 단일 진실 공급원이고, [components/useTheme.ts](components/useTheme.ts)가 `useSyncExternalStore`로 이를 구독합니다. 그래서 테마 토글과 TradingView 차트가 별도 상태 전달 없이 항상 같은 값을 봅니다 (차트는 생성 후 리스타일이 안 돼서 테마가 바뀌면 위젯을 다시 만듭니다).
- **숫자 표기**: 주가·점수·비율은 모두 고정폭 글꼴 + `tabular-nums`라 열이 흔들리지 않습니다. 점수는 숫자와 막대를 함께 그려 세로로 훑어보기 쉽게 했고, 상세 페이지 총점은 원형 게이지로 보여줍니다.
- **스크리너 테이블**: 열 머리글 클릭으로 정렬(데이터 없는 종목은 방향과 무관하게 항상 아래로), 티커·기업명 검색, 섹터/최소총점/Buy Candidate 필터, 60개씩 더 보기. 데스크톱에서는 표 영역이 자체 스크롤 창이 되고 머리글이 고정됩니다.
- **용어 설명 툴팁**: 지표 이름 옆의 `?`에 마우스를 올리면(모바일은 탭) 주식을 처음 보는 사람도 알아들을 수 있는 설명이 뜹니다. 문구는 `messages/*.json`의 `glossary` 네임스페이스 한 곳에 모여 있습니다. [components/InfoTip.tsx](components/InfoTip.tsx)는 말풍선을 포털 + `position: fixed`로 그리는데, 대부분의 `?`가 스크롤되는 표 안에 있어서 그냥 붙이면 잘리기 때문입니다.
- **주가 차트**: [components/PriceChartPanel.tsx](components/PriceChartPanel.tsx)가 확대 버튼과 "TradingView에서 열기" 링크를 담당합니다. 확대는 `position: fixed` 오버레이로 구현하고 그 위에 네이티브 Fullscreen API를 얹는 방식인데, iOS 사파리와 앱 내 웹뷰에는 `Element.requestFullscreen`이 없어서 그것만 믿으면 모바일에서 확대가 안 되기 때문입니다. `Esc`로 닫힙니다.
- **차트가 안 뜰 때**: 차트는 TradingView 스크립트(`s3.tradingview.com`)를 방문자 브라우저에서 직접 받아오기 때문에, 광고 차단 확장 프로그램·사내 방화벽·**PC에 설치된 보안 프로그램의 HTTPS 검사**(국내 은행/공공기관용 프로그램이 설치하는 루트 인증서 때문에 `NET::ERR_CERT_AUTHORITY_INVALID`가 납니다)로 막힐 수 있습니다. 실패하면 [components/ChartUnavailable.tsx](components/ChartUnavailable.tsx)가 원인을 확인하는 순서대로 해결 방법을 안내하고, 다시 시도 버튼과 TradingView 새 창 링크를 제공합니다. 나머지 기능(스코어·재무·즐겨찾기)은 영향받지 않습니다.

## 회원가입 · 즐겨찾기 (MY Page)

[Supabase](https://supabase.com)(무료 티어)로 이메일 회원가입/로그인과 즐겨찾기를 구현했습니다. Postgres 기반이라 나중에 모바일 앱(iOS/Android, React Native 등)에서도 같은 프로젝트의 REST API·SDK로 그대로 로그인/데이터를 공유할 수 있습니다.

### 최초 설정 (한 번만)
1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성
2. 프로젝트 SQL Editor에서 [supabase/schema.sql](supabase/schema.sql) 내용을 실행 — `favorites` 테이블 + Row Level Security 정책(내 데이터만 조회/수정 가능)을 만듭니다
3. 프로젝트의 **Connect → App Frameworks → Next.js**에서 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 확인 → `.env.local`에 채우기 (`.env.local.example` 참고)
4. Vercel에 배포 중이라면 Vercel 프로젝트 **Settings → Environment Variables**에도 같은 두 값을 추가하고 재배포해야 실제 서비스에서도 로그인이 동작합니다
5. 기본적으로 회원가입 시 이메일 인증 링크를 보냅니다 (Supabase Auth 기본 동작). 테스트 중 매번 이메일 인증이 번거로우면 프로젝트의 **Authentication → Providers → Email → "Confirm email"**을 꺼서 즉시 로그인되게 할 수 있습니다 (실제 서비스에서는 켜두는 걸 권장)

### 배포 시 추가로 해야 하는 설정
로컬에서 잘 되다가 배포하면 로그인만 안 되는 경우, 대부분 아래 두 가지 중 하나입니다.

- **Supabase → Authentication → URL Configuration**: `Site URL`을 실제 도메인으로 지정하고, `Redirect URLs`에 `https<도메인>/auth/callback`을 추가합니다. 이게 없으면 로그인 후 localhost로 돌아가려다 실패합니다. 로컬 개발을 계속하려면 `http://localhost:3000/auth/callback`도 같이 남겨두세요.
- **Google 로그인**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)의 OAuth 클라이언트 → 승인된 리디렉션 URI에 Supabase 콜백 주소(`https<프로젝트>.supabase.co/auth/v1/callback`)가 등록되어 있어야 합니다. 이 주소는 앱 도메인이 아니라 Supabase 주소이므로, 앱을 어디에 배포하든 한 번만 등록하면 됩니다. 발급받은 Client ID/Secret은 Supabase → Authentication → Providers → Google에 넣습니다.

> 카카오 로그인은 `account_email` 권한이 카카오의 **비즈니스 인증**(사업자등록번호 필요)을 거쳐야만 열리고, Supabase의 카카오 프로바이더가 이 권한을 항상 요청하기 때문에 개인 앱에서는 동작하지 않습니다. 그래서 구글 로그인만 지원합니다.

### 동작 방식
- 로그인: `/login` — 이메일+비밀번호로 로그인/회원가입 (`app/[locale]/login/page.tsx`)
- 즐겨찾기: 대시보드 행/종목 상세 페이지의 하트 버튼으로 토글. `favorites` 테이블에 `(user_id, ticker, price_at_favorite, favorited_at)`로 저장 — `price_at_favorite`는 찜한 시점의 주가입니다
- MY Page (`/mypage`): 로그인한 유저의 즐겨찾기 목록을 서버에서 조회하고, 각 티커의 실시간 현재가([lib/price.ts](lib/price.ts))를 가져와 `(현재가 − 찜한 시점 주가) / 찜한 시점 주가`로 등락률을 계산해 보여줍니다
- 로그인 세션은 `proxy.ts`(next-intl 미들웨어와 함께 실행)에서 매 요청마다 갱신됩니다 — [lib/supabase/client.ts](lib/supabase/client.ts)는 브라우저용, [lib/supabase/server.ts](lib/supabase/server.ts)는 Server Component/Route Handler용입니다

## 다국어 지원

한국어(`ko`)와 영어(`en`)를 지원합니다 (`/ko`, `/en` 경로, [next-intl](https://next-intl.dev/) 사용). 브라우저 언어를 자동 감지해 첫 방문 시 알맞은 언어로 안내하며, 우측 상단 언어 선택기로 언제든 바꿀 수 있습니다.

- `messages/ko.json`, `messages/en.json` — UI 문구 번역
- 평가 기준(라벨/기준값/설명)은 종목마다 다르지 않고 항목당 고정이라, `data/scores.json`에는 원시 숫자만 저장하고(`CriterionResult.values`) 화면에 표시할 때 [lib/criteriaText.ts](lib/criteriaText.ts)가 해당 언어·로케일 숫자 포맷(퍼센트/통화)으로 조합합니다. 새 언어를 추가할 때 `data/scores.json`을 다시 만들 필요가 없는 구조입니다.
- 회사 소개(위키피디아)는 영어 문서명 기준 언어간링크로 해당 언어 문서를 찾아 보여주며, 그 언어의 문서가 없는 회사는 영어로 표시됩니다.
- 새 언어를 추가하려면: (1) `i18n/routing.ts`의 `locales`에 추가, (2) `messages/{locale}.json` 작성, (3) `data/universe.json`의 `sector` 값에 대응하는 `sectors.*` 번역 추가.

## 프로젝트 구조

```
app/globals.css                      디자인 토큰 (다크/라이트 테마 색 정의)
app/[locale]/layout.tsx              공통 셸 (상단 네비 + 테마 초기화 스크립트)
app/[locale]/page.tsx                대시보드 (스코어 랭킹 + 필터)
app/[locale]/stock/[ticker]/page.tsx 종목 상세 (기준별 breakdown + 회사소개/뉴스/차트)
i18n/routing.ts, navigation.ts, request.ts   next-intl 설정
proxy.ts                              locale 자동 감지/라우팅 (Next.js의 구 "middleware")
messages/ko.json, messages/en.json    UI 문구 번역
lib/criteriaText.ts                   평가 기준 "실제값" 문구를 로케일에 맞게 조합
lib/xbrl.ts                           SEC EDGAR XBRL 저수준 클라이언트 (티커→CIK, 연도별 시계열 추출)
lib/price.ts                          Yahoo Finance 시세 클라이언트 (현재가·과거 종가)
lib/tradingview.ts                    티커를 TradingView 심볼(거래소:티커)로 변환
lib/sec.ts                            SEC+Yahoo를 조합해 종목별 재무 데이터 번들 생성
lib/scoring.ts                        버핏/그레이엄 스코어링 로직
lib/store.ts                          data/scores.json 캐시 read/write
lib/wikipedia.ts                      위키피디아 회사 소개 조회
lib/news.ts                           Yahoo Finance 뉴스 검색
components/Dashboard.tsx              스크리너 테이블 (정렬·검색·필터)
components/Panel.tsx                  공통 카드 프레임
components/ScoreBar.tsx, ScoreGauge.tsx  점수 막대 / 원형 게이지
components/CriteriaTable.tsx          기준별 통과여부 breakdown 패널
components/SiteHeader.tsx             상단 네비게이션 바
components/BackToListLink.tsx         "전체 목록으로" 돌아가기 링크 (상세/MY Page 공용)
components/InfoTip.tsx                지표 옆 `?` 용어 설명 툴팁
components/PriceChartPanel.tsx        차트 패널 (확대 / TradingView에서 열기)
components/ChartUnavailable.tsx       차트 로딩 실패 시 원인별 해결 방법 안내
components/TradingViewChart.tsx       TradingView 임베드 차트
components/useTheme.ts                data-theme 구독 훅
components/ThemeToggle.tsx            다크/라이트 전환 버튼
components/LocaleSwitcher.tsx         언어 선택 드롭다운
components/FavoriteButton.tsx, StockFavoriteButton.tsx  하트 즐겨찾기 버튼
components/MyFavoritesList.tsx        MY Page 즐겨찾기 목록/해제
components/SignOutButton.tsx          로그아웃 버튼
app/[locale]/login/page.tsx           로그인/회원가입
app/[locale]/mypage/page.tsx          MY Page (즐겨찾기 + 찜한 시점 대비 등락률)
app/auth/callback/route.ts            이메일 인증 콜백
lib/supabase/client.ts, server.ts     Supabase 클라이언트 (브라우저용 / 서버용)
lib/supabase/useFavorites.ts          즐겨찾기 상태 구독/토글 훅
supabase/schema.sql                   favorites 테이블 + RLS 정책 (SQL Editor에서 1회 실행)
scripts/refresh.ts                    배치 갱신 스크립트 (npm run refresh)
data/universe.json                    스크리닝 대상 티커 + 회사명/섹터/위키피디아 문서명
data/fixtures.ts                      샘플 데이터 (npm run refresh -- --fixture)
```

## 참고 사항

- 이 프로젝트가 보여주는 점수·내재가치는 모두 **참고용 계산 결과**이며 투자 조언이 아닙니다.
- v1은 웹사이트만 대상으로 하며, 모바일 앱(PWA/네이티브)은 후속 과제입니다.
- SEC EDGAR 재무제표는 분기·연간 공시 시점 기준이라 실시간이 아니며, 시세도 지연/일 단위입니다.
- 주가 차트는 TradingView 위젯을 그대로 임베드하므로, 표시되는 시세·차트 데이터의 출처는 TradingView이며 이 프로젝트가 SEC/Yahoo에서 가져온 데이터와 100% 일치하지 않을 수 있습니다.
