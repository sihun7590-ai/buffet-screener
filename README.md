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

- **회사 소개**: 위키피디아 문서 요약 ([lib/wikipedia.ts](lib/wikipedia.ts))
- **최근 뉴스**: Yahoo Finance 뉴스 검색에서 최근 30일 이내 관련 기사 ([lib/news.ts](lib/news.ts))
- **주가 차트**: 최근 1년 일별 종가 추이 ([components/PriceChart.tsx](components/PriceChart.tsx))

## 프로젝트 구조

```
app/page.tsx                대시보드 (스코어 랭킹 + 필터)
app/stock/[ticker]/page.tsx 종목 상세 (기준별 breakdown + 회사소개/뉴스/차트)
lib/xbrl.ts                  SEC EDGAR XBRL 저수준 클라이언트 (티커→CIK, 연도별 시계열 추출)
lib/price.ts                 Yahoo Finance 시세 클라이언트 (현재가·과거 종가·차트 시계열)
lib/sec.ts                   위 둘을 조합해 종목별 재무 데이터 번들 생성
lib/scoring.ts               버핏/그레이엄 스코어링 로직
lib/store.ts                 data/scores.json 캐시 read/write
lib/wikipedia.ts             위키피디아 회사 소개 조회
lib/news.ts                  Yahoo Finance 뉴스 검색
components/PriceChart.tsx    주가 차트 (SVG, 별도 라이브러리 없음)
scripts/refresh.ts           배치 갱신 스크립트 (npm run refresh)
data/universe.json           스크리닝 대상 티커 + 회사명/섹터/위키피디아 문서명
data/fixtures.ts             샘플 데이터 (npm run refresh -- --fixture)
```

## 참고 사항

- 이 프로젝트가 보여주는 점수·내재가치는 모두 **참고용 계산 결과**이며 투자 조언이 아닙니다.
- v1은 웹사이트만 대상으로 하며, 모바일 앱(PWA/네이티브)은 후속 과제입니다.
- SEC EDGAR 재무제표는 분기·연간 공시 시점 기준이라 실시간이 아니며, 시세도 지연/일 단위입니다.
