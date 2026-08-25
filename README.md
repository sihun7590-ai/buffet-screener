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

## 스코어링 기준

**다섯 개 축을 각각 100점으로 따로 매기고**, 중요도에 따라 가중평균해 종합 점수를 냅니다.
하나로 뭉뚱그리지 않는 이유는, "훌륭한 기업을 적당한 가격에"와 "평범한 기업을 아주 싸게"가 전혀 다른 투자이고 총점 하나로는 그 차이가 보이지 않기 때문입니다.

| 축 | 가중치 | 항목 (배점) |
|---|---|---|
| 사업의 질 | 30% | ROE 28 · ROIC 28 · 매출총이익률 수준/안정성 16 · 영업이익률 10 · FCF 마진 10 · 자사주 매입 8 |
| 저평가 | 25% | 안전마진 40 · PER 상대비교 25 · PEG 20 · 그레이엄 넘버 15 |
| 재무 안정성 | 20% | 부채비율 30 · 이자보상배율 25 · 유동비율 20 · 순부채/EBITDA 15 · 현금/부채 10 |
| 성장성 | 15% | 매출 CAGR 35 · EPS CAGR 35 · FCF CAGR 30 |
| 일관성 | 10% | 흑자 연수 40 · FCF 흑자 연수 35 · 매출성장 일관성 25 |

각 항목은 통과/실패가 아니라 구간을 선형 환산한 **연속 점수**입니다 (`linScore()`).
실제 수치·기준값·배점은 종목 상세 페이지에서 전부 공개되고, 지표 옆 `?`에 초보자용 설명이 붙습니다.
종합 70점 이상 + 안전마진 양수 + **모든 축 커버리지 70% 이상**인 종목에 "Buy Candidate" 태그가 붙습니다.

### 측정 불가와 0점의 구분

**공시에 없는 숫자를 0점 처리하면 "확인해봤더니 나빴다"는 뜻이 됩니다.** 실제로는 우리가 못 읽은 것뿐인데 말이죠. 그래서 필요한 숫자가 공시에 아예 없는 항목은 배점에서 **통째로 빼고**, 나머지 항목만으로 축 점수를 냅니다. 화면에는 "측정 불가"로 표시되고, 실패(빨간 X)와 다른 회색 대시로 구분됩니다.

경계는 좁게 잡았습니다 — **숫자가 있는데 나쁜 것은 측정된 것**이고, 그건 받아 마땅한 0점을 받습니다. 적자, 자본잠식, 매출 감소는 전부 여기에 해당합니다. 이 구분이 없으면 적자 기업이 "PER 측정 불가"를 이유로 저평가 평가를 면제받는 일이 생깁니다.

축마다 **커버리지**(측정된 배점 비율)를 함께 저장해 화면에 표시합니다. 은행에 매출총이익률이나 유동비율이 없는 것처럼, 업종에 따라 애초에 존재하지 않는 항목이 있기 때문입니다.

**단, 절반 미만이면 환산하지 않습니다.** 측정된 항목이 나머지를 대표한다는 가정은 대부분을 측정했을 때나 성립합니다. 버크셔는 재무 안정성 5개 항목 중 1개(이자보상배율)만 읽히는데, 그 하나가 좋다고 환산하면 재무 안정성 100점이 나옵니다. 그래서 절반 아래로는 배점의 절반을 분모로 고정해, 표본이 얇으면 높은 점수가 아예 나올 수 없게 했습니다.

내재가치는 최근 3년 FCF 평균을 희석주식수로 나눈 주당 소유주이익에서 출발해, 5년 FCF CAGR(최대 12%)로 5년 투영한 뒤 할인율 9.5% · 영구성장률 2.5%로 할인합니다.

로직과 가중치는 [lib/scoring.ts](lib/scoring.ts) 상단에서 조정할 수 있습니다.
계산식을 바꿀 때는 `SCORING_VERSION`을 올리세요 — 모든 점수에 함께 저장되므로, 나중에 점수 추이 차트에서 "회사가 변한 것"과 "우리가 기준을 바꾼 것"을 구분할 수 있습니다.

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
2. 프로젝트 SQL Editor에서 [supabase/migrations/](supabase/migrations/)의 `.sql` 파일을 **번호 순서대로** 실행 (이미 실행한 파일은 건너뛰세요)
3. 프로젝트의 **Connect → App Frameworks → Next.js**에서 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 확인 → `.env.local`에 채우기 (`.env.local.example` 참고)
4. Vercel에 배포 중이라면 Vercel 프로젝트 **Settings → Environment Variables**에도 같은 두 값을 추가하고 재배포해야 실제 서비스에서도 로그인이 동작합니다
5. 기본적으로 회원가입 시 이메일 인증 링크를 보냅니다 (Supabase Auth 기본 동작). 테스트 중 매번 이메일 인증이 번거로우면 프로젝트의 **Authentication → Providers → Email → "Confirm email"**을 꺼서 즉시 로그인되게 할 수 있습니다 (실제 서비스에서는 켜두는 걸 권장)

### 배포 시 추가로 해야 하는 설정
로컬에서 잘 되다가 배포하면 로그인만 안 되는 경우, 대부분 아래 두 가지 중 하나입니다.

> 환경 변수를 빠뜨리고 배포하더라도 사이트 전체가 죽지는 않습니다 — [lib/supabase/env.ts](lib/supabase/env.ts)가 "아무도 로그인하지 않은 상태"로 떨어뜨려서 스크리너·종목 상세는 그대로 열리고, MY Page는 로그인 안내를 보여줍니다. 로그인 기능만 동작하지 않으므로, 로그인이 안 되면 이 값부터 확인하세요.

- **Supabase → Authentication → URL Configuration**: `Site URL`을 실제 도메인으로 지정하고, `Redirect URLs`에 `https<도메인>/auth/callback`을 추가합니다. 이게 없으면 로그인 후 localhost로 돌아가려다 실패합니다. 로컬 개발을 계속하려면 `http://localhost:3000/auth/callback`도 같이 남겨두세요.
- **Google 로그인**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials)의 OAuth 클라이언트 → 승인된 리디렉션 URI에 Supabase 콜백 주소(`https<프로젝트>.supabase.co/auth/v1/callback`)가 등록되어 있어야 합니다. 이 주소는 앱 도메인이 아니라 Supabase 주소이므로, 앱을 어디에 배포하든 한 번만 등록하면 됩니다. 발급받은 Client ID/Secret은 Supabase → Authentication → Providers → Google에 넣습니다.

> 카카오 로그인은 `account_email` 권한이 카카오의 **비즈니스 인증**(사업자등록번호 필요)을 거쳐야만 열리고, Supabase의 카카오 프로바이더가 이 권한을 항상 요청하기 때문에 개인 앱에서는 동작하지 않습니다. 그래서 구글 로그인만 지원합니다.

### 동작 방식
- 로그인: `/login` — 이메일+비밀번호로 로그인/회원가입 (`app/[locale]/login/page.tsx`)
- 즐겨찾기: 대시보드 행/종목 상세 페이지의 하트 버튼으로 토글. `favorites` 테이블에 `(user_id, ticker, price_at_favorite, favorited_at)`로 저장 — `price_at_favorite`는 찜한 시점의 주가입니다
- MY Page (`/mypage`): 로그인한 유저의 즐겨찾기 목록을 서버에서 조회하고, 각 티커의 실시간 현재가([lib/price.ts](lib/price.ts))를 가져와 `(현재가 − 찜한 시점 주가) / 찜한 시점 주가`로 등락률을 계산해 보여줍니다
- 로그인 세션은 `proxy.ts`(next-intl 미들웨어와 함께 실행)에서 매 요청마다 갱신됩니다 — [lib/supabase/client.ts](lib/supabase/client.ts)는 브라우저용, [lib/supabase/server.ts](lib/supabase/server.ts)는 Server Component/Route Handler용입니다

## 점수 히스토리

`data/scores.json`은 **스냅샷**이라 `npm run refresh`를 돌리면 어제 점수가 사라집니다. 그래서 같은 점수를 Supabase `score_history` 테이블에도 함께 적재합니다 — 점수 추이 차트, "점수 급등" 알림, 백테스트는 전부 과거가 남아 있어야 가능합니다.

- 화면이 읽는 경로는 지금도 `data/scores.json` 그대로입니다. DB 왕복이 없고, 기존 동작이 바뀌지 않습니다.
- 테이블에는 **축별 점수만** 저장합니다 (항목별 상세는 스냅샷에). 그래서 S&P 500 전체를 매일 쌓아도 1년에 수십 MB 수준이라 무료 티어 안에서 몇 년을 버팁니다.
- `(ticker, as_of)`가 기본키라 같은 날 배치를 다시 돌리면 그날 행을 덮어씁니다.
- 적재에는 **service_role 키**가 필요합니다 ([lib/supabase/admin.ts](lib/supabase/admin.ts)). 이 키는 RLS를 우회하므로 `.env.local`에만 두고 절대 커밋하거나 브라우저에 노출하지 마세요. `NEXT_PUBLIC_` 접두사를 붙이면 Next.js가 클라이언트 번들에 넣어버립니다.
- 키가 없으면 적재만 건너뛰고 `npm run refresh`는 정상 동작합니다. 히스토리 적재가 실패해도 스냅샷 저장은 이미 끝난 뒤라 배치 전체가 실패하지는 않습니다.
- 30분짜리 배치를 다시 돌리지 않고 적재만 재실행하려면 `npm run archive` — 현재 `scores.json`을 그 파일의 생성 시각 기준으로 적재합니다.

### 자동 갱신 (GitHub Actions)

[.github/workflows/refresh.yml](.github/workflows/refresh.yml)이 **평일 23:00 UTC**(미국 장 마감 몇 시간 뒤, 한국시간 다음 날 아침 8시)에 배치를 돌리고, 바뀐 `data/scores.json`을 커밋합니다. Vercel이 그 푸시를 받아 재배포하므로 사이트도 함께 갱신됩니다. Actions 탭에서 **Run workflow**로 수동 실행도 됩니다.

히스토리가 쌓이는 게 스케줄로 돌리는 이유입니다 — 안 돈 날은 시계열의 구멍입니다. (구멍이 생겨도 `npm run backfill`로 메울 수 있습니다. 그래서 하루 이틀 실패해도 치명적이지는 않습니다.)

저장소 **Settings → Secrets and variables → Actions**에 세 개가 등록돼 있어야 합니다: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. `.env.local`과 같은 값입니다.

**안전장치 — `--max-failures=25`.** 배치가 덮어쓰는 건 사이트가 읽는 파일이고, 동시에 그날의 히스토리로 영구히 남습니다. 그래서 **나쁜 실행은 안 도는 것보다 나쁩니다.** 개별 종목 실패는 원래 몇 개씩 나지만(SEC에 쓸 만한 데이터가 아예 없는 종목들), 유니버스의 5%를 넘으면 그건 종목 문제가 아니라 데이터 소스가 죽었거나 러너 IP를 차단한 겁니다. 이때 스크립트는 `scores.json`과 히스토리 **둘 다 손대지 않고** 종료 코드 1로 끝냅니다.

### 과거 점수 재구성 (백필)

```bash
npm run backfill                              # 최근 3년, 분기별
npm run backfill -- --years 5
npm run backfill -- --ticker LULU --dry-run   # 적재 없이 계산 결과만 출력
```

SEC의 모든 재무 수치에는 **공시일(`filed`)** 이 붙어 있습니다. 이걸로 "그 날짜에 실제로 공개돼 있던 재무제표"만 골라내고([lib/xbrl.ts](lib/xbrl.ts)의 `annualSeries(..., asOf)`), 그날 종가를 붙이면 과거 시점의 점수가 재구성됩니다. 정정 공시도 자연히 처리됩니다 — 같은 회계연도가 여러 번 공시되는데 그중 "그 날짜 기준 가장 최근 것"을 쓰므로, 나중에 수정된 숫자가 과거로 새지 않습니다.

**이 look-ahead 방지가 나중에 백테스트가 필요로 하는 바로 그 기능입니다.** 2023년 백테스트가 2026년에야 공시된 숫자를 쓰면 전략이 실제보다 좋아 보입니다.

- [lib/sec.ts](lib/sec.ts)는 네트워크 조회(`fetchTickerRawData`)와 계산(`buildTickerFinancials`)이 분리돼 있어, 종목당 한 번만 받아 여러 시점을 메모리에서 계산합니다. 몇 년치를 백필하든 비용은 유니버스 1회 순회입니다.
- 그 시점에 상장 전이거나 공시 이력이 없는 종목은 점수 없이 건너뜁니다 (2023년 484종목 → 2026년 498종목).
- 백필 행은 `is_backfilled = true`로 표시하고 차트에도 명시합니다. **그때 우리가 매긴 점수가 아니라, 그때 데이터에 현재 기준을 적용하면 나왔을 점수**입니다.

**알려진 한계**: 섹터 평균 PER이 오늘 기준 고정값이라 과거 시점에 적용하면 시대착오가 조금 있습니다 (저평가 축에만 영향).

## 분기 재무 (TTM)

연간 보고서 사이 기간에는 주가 말고 모든 숫자가 최대 1년까지 묵습니다. [lib/quarterly.ts](lib/quarterly.ts)가 10-Q에서 **최근 12개월(TTM)** 실적을 만들어 붙여, 수익성·레버리지·성장이 분기마다 움직이게 합니다.

4개 분기를 더하는 방식은 쓰지 않습니다. 4분기는 10-Q로 공시되지 않고(10-K에서 1~3분기를 뺀 나머지), 3개월치 없이 누적만 보고하는 기업도 있기 때문입니다. 대신 기업들이 안정적으로 보고하는 세 값만 쓰는 항등식을 씁니다:

```
TTM = 현재 누적(YTD) + 직전 연간 − 1년 전 같은 기간 누적
```

**설계 원칙 — 필요한 항목이 전부 같은 분기에 갖춰졌을 때만 TTM 행을 추가합니다.** 하나라도 없으면 기존 연간 방식으로 남습니다. 반쪽짜리 행(1년치 매출에 1분기치 이익 같은)은 없느니만 못하기 때문입니다. 실제로 BRK-B(주식수 태깅 불량)와 HD(분기말 부채 태그 없음)가 이 규칙에 걸려 연간 방식을 유지합니다.

주의할 함정 두 가지가 실제로 있었고, 코드에 방어가 들어가 있습니다:

- **태그 선택**: 우선순위 목록에서 "데이터가 있는 첫 태그"를 쓰면 안 됩니다. 기업이 회계 태그를 바꾸면 버려진 태그에 과거 데이터가 남아, NVDA 매출이 4년 묵은 값으로 잡혔습니다. **최신 데이터를 가진 태그 순**으로 고릅니다.
- **주식수**: 일부 기업이 백만 단위로 태깅하면서 스케일을 안 맞춥니다. 원본 대신 `순이익 ÷ EPS`로 유도하고, 직전 연간 주식수와 1.5배 이상 차이 나면 태깅 오류로 보고 TTM 행을 버립니다.

## 가중치 조정

대시보드 상단 "가중치 조정" 버튼으로 다섯 축의 상대적 중요도를 직접 정할 수 있습니다 ([lib/customWeights.ts](lib/customWeights.ts)). 성장보다 안정성을 중시한다면 재무 안정성 슬라이더를 올리면 되고, 종합 점수·순위·Buy Candidate·평균 점수가 전부 그 기준으로 즉시 다시 계산됩니다.

**서버는 이 계산에 관여하지 않습니다.** 축별 점수(0~100)는 이미 `data/scores.json`에 있는 확정된 측정값이고, 종합은 그 다섯 숫자의 가중평균일 뿐입니다. 그래서 브라우저에서 499종목을 즉시 다시 섞는 것으로 충분합니다 — 서버 왕복도, DB 스키마 변경도 없습니다. `coverage`와 안전마진처럼 가중치와 무관한 값은 그대로 두고, 블렌드에 들어가는 총점만 다시 계산합니다.

슬라이더는 **비율을 강제로 100%에 맞추지 않습니다.** "합이 100이 되게 조절하라"는 건 만질 때마다 풀어야 하는 작은 퍼즐이라서, 대신 각 슬라이더가 상대적 중요도를 나타내고 전부 합해 나눈 값이 실제 가중치입니다. 다섯 개를 전부 0으로 내리면 나눗셈이 무너지므로 그 경우에만 기본 비율로 되돌립니다.

**계정에 저장되지 않고 이 브라우저에만 남습니다.** `localStorage`에 저장하며, 로드가 끝나기 전에 기본값으로 덮어쓰지 않도록 순서를 맞췄습니다 — 그렇지 않으면 저장된 커스텀 값이 새로고침할 때마다 기본값에 덮어써지는 버그가 생깁니다.

Buy Candidate 판정 기준(70점 이상 + 안전마진 양수 + 모든 축 커버리지 70% 이상)은 `lib/scoring.ts`에서 상수로 export해 커스텀 계산도 똑같은 기준을 씁니다 — 화면에 적힌 규칙과 실제로 적용되는 규칙이 몰래 달라지는 일이 없도록.

## 관심 종목 변화 (알림)

**이메일도 푸시도 없습니다.** 그건 돈이 들거나 별도 서비스가 필요합니다. 대신 관심 종목을 **그 종목의 과거와 비교**해서, 다음에 페이지를 열었을 때 다시 볼 만한 변화를 MY Page 상단에 모아 보여줍니다 ([lib/alerts.ts](lib/alerts.ts), [components/WatchlistAlerts.tsx](components/WatchlistAlerts.tsx)).

즐겨찾기가 곧 watchlist입니다. 별도 목록을 하나 더 만들면 같은 UI가 두 벌 생길 뿐 얻는 게 없어서 그렇게 했습니다.

무엇을 알리느냐가 핵심입니다. **주가 등락은 증권사 앱이 이미 보여줍니다.** 여기서 중요한 건 관심을 갖게 된 이유를 조용히 무너뜨리는 변화입니다:

- Buy Candidate 진입/이탈
- 안전마진이 생기거나 사라짐 (부호 전환)
- 종합 점수 ±5점 이상, 축별 ±12점 이상 이동
- 즐겨찾기 시점 대비 주가 −25% 이상 **하락만**

마지막 항목이 하락만인 이유는, 즐겨찾기 목록 표에 이미 등락률 칼럼이 있어서 전부 알리면 그 칼럼을 행 수만 줄여 반복하는 셈이기 때문입니다. 자리를 얻을 만한 건 판단을 다시 하게 만드는 움직임이고, 상승은 그렇지 않습니다 — 상승이 가치에 미치는 영향은 안전마진·저평가 알림이 반대 방향에서 이미 보고합니다.

**계산식 버전이 다른 시점끼리는 비교하지 않습니다.** 그 차이는 회사가 변한 게 아니라 우리 기준이 바뀐 것이고, 그걸 회사 소식처럼 알리는 건 `SCORING_VERSION`을 두는 이유 자체를 배반하는 일입니다.

비교 기준은 **30일 이전 시점 중 가장 가까운 점수**이고, 그 날짜를 항목마다 표시합니다. 비교 시점이 백필된 행이면 그 사실도 함께 밝힙니다. 히스토리는 관심 종목 전체를 **한 번의 쿼리**로 가져옵니다 (`fetchScoreHistoryForTickers`) — 종목당 한 번씩 조회하면 이미 종목마다 시세를 기다리는 페이지에 왕복이 수십 번 더 붙습니다.

## 동종업계 비교

**62점이 좋은 점수인지 나쁜 점수인지는 그 숫자만으로는 알 수 없습니다.** 은행과 소프트웨어 회사는 같은 5개 축으로 채점해도 나오는 범위가 완전히 다릅니다. 그래서 종목 상세 페이지에 같은 GICS 섹터 안에서의 순위를 함께 보여줍니다 ([lib/peers.ts](lib/peers.ts), [components/PeerComparison.tsx](components/PeerComparison.tsx)).

축별 막대 위의 세로선은 **그 섹터의 중앙값**입니다. 순위만으로는 그 판이 촘촘한지 널널한지 알 수 없는데, 막대와 세로선 사이의 거리가 그걸 보여줍니다.

아래 표의 비교 대상은 **점수가 아니라 시가총액이 가까운 종목**입니다. 같은 섹터라도 2조 달러 기업과 80억 달러 기업은 사실상 다른 사업이고, 섹터 최고 점수 종목들과 나란히 놓는 건 아무도 묻지 않은 질문에 답하는 셈이라서요. 크기순 정렬이라 자기 회사가 표 가운데에 오는 부수 효과도 있습니다.

데이터는 전부 `data/scores.json`에 이미 있습니다 — 네트워크 조회도, 새 데이터 소스도 없습니다.

**주의할 점 두 가지를 표에 명시합니다.** 회계연도가 회사마다 달라 "기간"이 최대 1년까지 벌어질 수 있고(소매업은 분기말 재고·매입채무 주기 때문에 마감 시점이 다르면 부채비율이 원래 다르게 나옵니다), 일부 항목을 측정하지 못한 회사는 `*`로 표시됩니다.

비자와 버크셔처럼 **주식수를 못 읽어 시가총액이 없는 종목**은 크기순 정렬에서 빠지는데, 이 경우 표를 한 줄로 만들지 않고 섹터 최대 종목들 앞에 붙입니다. 축별 순위는 애초에 시가총액이 필요 없어서 정상 동작합니다.

## 백테스트

**"Buy Candidate만 담았으면 실제로 얼마나 벌었을까"를 검증합니다.** `/backtest` 페이지에서 이 사이트의 세 가지 내장 전략을 분기마다 다시 골라 담는(리밸런싱) 시뮬레이션을 돌리고, 진짜 시장 수익률(SPY)과 나란히 보여줍니다 ([lib/backtest.ts](lib/backtest.ts), [scripts/backtest.ts](scripts/backtest.ts), `app/[locale]/backtest/page.tsx`).

데이터는 새로 받지 않습니다. Supabase `score_history`에 이미 있는 **14개 분기말 백필 데이터**(`is_backfilled = true`, `scoring_version = 4`)와, 모든 종목이 이미 쓰고 있는 Yahoo Finance 엔드포인트로 받은 SPY 가격만 씁니다 ([lib/price.ts](lib/price.ts)의 `fetchPriceHistory`/`closeNear`).

```bash
npm run backtest   # score_history + SPY 가격 → data/backtest.json
```

**전략은 네 가지입니다**, 모두 각 분기말 시점에 그 시점 데이터만으로 다시 고릅니다:

- **Buy Candidate**: 그 분기 `is_buy_candidate = true`인 종목 전부를 동일가중.
- **Top 20**: 그 분기 `total`이 가장 높은 20종목을 동일가중 (동점은 티커 알파벳순).
- **전체 유니버스 (동일가중)**: 그 분기에 점수가 있는 종목 전부를 동일가중. **진짜 S&P 500이 아닙니다** — 실제 지수는 시가총액 가중이라, 최근 몇 년처럼 소수 초대형주가 지수를 끌어올린 시기엔 동일가중이 구조적으로 밀립니다. 화면과 문구 어디에도 "S&P 500"이라 부르지 않고 항상 이렇게 부릅니다.
- **S&P 500 (SPY)**: 위 셋과 달리 실제로 거래된 ETF 가격이라, 생존 편향이 없는 유일한 진짜 비교 대상입니다.

**look-ahead가 없는 이유**([lib/backtest.ts](lib/backtest.ts) 상단 주석에도 적어 뒀습니다): T 시점의 선택은 T 시점 행의 `total`/`is_buy_candidate`/`price`만 봅니다. 이 값들 자체가 `annualSeries(..., asOf: T)`로 T 이전에 공시된 것만 써서 계산된 값이라(위 "과거 점수 재구성 (백필)" 절 참고), T 시점에 서 있는 사람이 실제로 알 수 있었던 정보만으로 고른 셈입니다. 수익률은 그다음 분기말 T'의 가격을 나눠서 계산하는데, T 시점에서 T'은 아직 미래입니다. **선택은 T만 보고, 수익률만 T'을 봅니다** — 이 둘이 절대 섞이지 않는 게 이 백테스트가 실전 검증이지 커브 피팅이 아닌 이유입니다.

**알려진 한계**:

- **생존 편향.** `data/universe.json`은 배치를 돌릴 때(그리고 백필할 때)의 **오늘자** S&P 500 편입 종목 목록이고, 이걸 모든 과거 시점에 그대로 적용합니다. 2023년엔 지수에 있었지만 실적 부진으로 지금은 빠진 회사는 어떤 과거 시점의 계산에도 등장하지 않습니다. 탈락한 회사들의 부진이 통째로 안 보이니, 아래 어떤 전략의 수익률도 실제보다 체계적으로 높게 나옵니다. 이 캐비엇은 `/backtest` 페이지 상단에도 (푸터가 아니라) 눈에 띄게 띄워 둡니다.
- **분기 13번뿐입니다.** 지금 있는 백필 시점이 14개(2023-03-31 ~ 2026-06-30)라 분기 전환은 13번입니다. 매일 쌓이는 "forward" 점수(`is_backfilled = false`, 현재 499건)는 지금은 아예 쓰지 않습니다 — 분기 주기와 일 주기를 섞으면 보유 기간이 들쭉날쭉해져서 서로 비교가 안 됩니다. 시간이 지나 일별 히스토리가 두터워지면 더 촘촘한 주기로도 검증할 수 있게 될 것입니다.
- 종목 하나가 어떤 분기에 점수 계산이 실패하면(유니버스의 약 3%) 그 분기 그 전략에서만 조용히 빠집니다 — 에러로 죽이지 않습니다.
- 배당은 포함하지 않습니다. 주가 등락만의 수익률입니다.
- CAGR은 약 3.25년치 표본 기준입니다. 페이지에도 "장기간 검증된 수치가 아니다"라고 명시합니다.

## 데이터 출처와 시점

화면의 숫자마다 **어디서 왔고 언제 것인지**를 함께 표시합니다 ([components/DataSourceNote.tsx](components/DataSourceNote.tsx)). 재무는 SEC EDGAR, 주가는 Yahoo Finance이며, 재무 수치가 "최근 12개월(TTM)"인지 "연간"인지와 그 기간의 마감일, 그리고 배치 갱신 시각을 붙입니다. ROE 15%가 지난달 마감 분기 기준인지 11개월 전 사업연도 기준인지는 판단이 갈리는 지점이라, 화면에서 구분되지 않으면 안 됩니다.

출처 자체(SEC / Yahoo)는 모든 종목이 같아서 `data/scores.json`에 499번 반복하지 않고 UI 문구에만 둡니다. 종목마다 다른 기간 정보만 `dataSource`로 저장합니다.

### 부채가 0으로 읽히던 문제

이 작업에서 드러난 실제 버그입니다. 태그되지 않은 재무제표 항목을 0으로 읽는 바람에 **90개 종목이 "무차입 기업"으로 채점되고 있었습니다** — 코카콜라, GM, 포드, CSX, 골드만삭스, CVS가 전부 부채비율 0으로 재무 안정성 만점을 받았습니다.

원인은 두 가지였습니다:

- **태그 목록이 좁았습니다.** ASC 842 이후 상당수 기업이 부채를 금융리스와 묶어 태그합니다(`LongTermDebtAndCapitalLeaseObligations` 등). 코카콜라의 `LongTermDebtNoncurrent`는 2024년에 끊겨 있고 그 뒤로는 묶음 태그만 씁니다. 총부채를 한 항목으로 태그하는 기업(GM, 골드만삭스)을 위한 목록도 따로 뒀습니다 — 있으면 그걸 쓰고, 없을 때만 비유동+유동을 더합니다.
- **없는 것과 0인 것을 구분하지 않았습니다.** 이제 태그가 하나도 없으면 `NaN`(측정 불가)이고, 진짜 무차입 기업은 `ShortTermBorrowings = 0`처럼 **0으로 태그하므로** 그대로 0으로 읽힙니다. 룰루레몬이 검증에 쓰인 대조군입니다 — 수정 전후 모두 부채비율 0.00.

포드와 버크셔는 수정 후에도 총부채 태그가 없습니다. 두 회사 모두 부채를 부문별(포드 크레딧 등) 차원 태그로만 공시하는데, SEC의 `companyfacts` 추출본은 차원 없는 값만 담기 때문입니다. 이건 진짜 측정 불가이고, 그렇게 표시됩니다.

**자본잠식도 같은 부류의 버그였습니다.** 자기자본이 음수면 부채비율도 음수가 되고, "낮을수록 좋다" 구간을 그대로 통과해 만점이 나옵니다. 맥도날드·홈디포·스타벅스를 포함한 28개 종목이 이 경로로 부채비율 30/30을 받고 있었습니다. 자본잠식은 공시에 명시된 사실이라 측정 불가가 아니며, 0점으로 채점합니다.

### 그 밖에 넓힌 태그

- **영업이익**: 존슨앤드존슨의 마지막 `OperatingIncomeLoss`는 2014년입니다. 세전이익에 이자비용을 더하면 같은 EBIT가 나오므로, 태그가 없는 해에만 이 경로로 계산합니다. 두 값이 같은 정의를 가리키도록 별도 시리즈로 분리해 뒀습니다 — 연도마다 서로 다른 지표가 섞이면 성장률이 왜곡됩니다.
- **EPS**: 비자는 주식 종류별로만 EPS를 태그해서 `companyfacts`에 잡히지 않습니다. 순이익÷희석주식수로 유도합니다. 단 TTM 경로에는 넣지 않았습니다 — 희석주식수는 가중평균이고, TTM 항등식은 기간을 더하고 빼는 계산이라 평균에는 성립하지 않습니다.

**알려진 한계**: 분기말 재무상태표는 계절성을 탑니다. 소매업은 재고·매입채무 주기 때문에 1분기말과 회계연도말 수치가 원래 다릅니다. 최신 데이터를 쓰는 대가이며, 나중에 Peer 비교를 넣을 때는 같은 분기끼리 비교해야 합니다.

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
lib/supabase/admin.ts                 service_role 클라이언트 (배치 전용 — 브라우저에 절대 노출 금지)
lib/scoreHistory.ts                   점수 스냅샷을 score_history 테이블에 적재
supabase/migrations/*.sql             DB 스키마 (SQL Editor에서 번호 순서대로 1회씩 실행)
scripts/refresh.ts                    배치 갱신 스크립트 (npm run refresh)
scripts/archive.ts                    현재 scores.json만 히스토리에 적재 (npm run archive)
data/universe.json                    스크리닝 대상 티커 + 회사명/섹터/위키피디아 문서명
data/fixtures.ts                      샘플 데이터 (npm run refresh -- --fixture)
```

## 참고 사항

- 이 프로젝트가 보여주는 점수·내재가치는 모두 **참고용 계산 결과**이며 투자 조언이 아닙니다.
- v1은 웹사이트만 대상으로 하며, 모바일 앱(PWA/네이티브)은 후속 과제입니다.
- SEC EDGAR 재무제표는 분기·연간 공시 시점 기준이라 실시간이 아니며, 시세도 지연/일 단위입니다.
- 주가 차트는 TradingView 위젯을 그대로 임베드하므로, 표시되는 시세·차트 데이터의 출처는 TradingView이며 이 프로젝트가 SEC/Yahoo에서 가져온 데이터와 100% 일치하지 않을 수 있습니다.
