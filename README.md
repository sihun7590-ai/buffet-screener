# 버핏 저평가 우량주 스크리너

워렌 버핏·벤저민 그레이엄식 가치투자 기준으로 미국 대형주를 스코어링하는 웹 스크리너입니다.
저평가 우량주를 실시간으로 스캔하는 대신, **무료 API의 요청 한도에 맞춰 하루 1회 정도 배치로 재계산 → 결과를 캐시해서 즉시 서빙**하는 구조입니다.

## 빠른 시작

```bash
npm install
npm run dev
```

`FMP_API_KEY`가 없어도 [data/fixtures.ts](data/fixtures.ts)의 **샘플 데이터**로 바로 동작합니다 (대시보드 상단에 노란 배너로 표시됩니다).

## 실제 데이터로 전환하기

1. [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs)에서 무료로 가입하고 API 키를 발급받으세요. (계정 생성/키 발급은 직접 진행해야 합니다)
2. `.env.local.example`을 `.env.local`로 복사한 뒤 키를 넣습니다.

   ```bash
   cp .env.local.example .env.local
   ```

3. 스코어를 계산합니다 (종목당 API 7회 호출, 기본 유니버스 35종목 = 약 245회 — 무료 티어 일일 한도에 맞춰져 있습니다):

   ```bash
   npm run refresh
   ```

4. `npm run dev`로 확인하면 배너가 사라지고 실제 데이터가 표시됩니다.

종목 유니버스는 [data/universe.json](data/universe.json)에서 자유롭게 추가/삭제할 수 있습니다. 무료 API 한도를 넘기면 요청이 실패하니, 유니버스를 늘릴 경우 여러 날에 걸쳐 나눠 실행하거나 유료 플랜을 고려하세요.

## 스코어링 기준 (100점 만점)

- **우량성 (Quality) 50점**: ROE·ROIC 5년 평균, 매출총이익률 수준/안정성, 부채비율·이자보상배율, EPS 일관성(적자 여부), 잉여현금흐름, 자사주 매입 추세, 유동비율
- **저평가/안전마진 (Valuation) 50점**: 자체·업종 평균 대비 PER, PEG 비율, 그레이엄 넘버 대비 주가, 소유주이익(Owner Earnings) 기반 단순 DCF 내재가치 대비 **안전마진**

각 항목의 실제 수치·기준값·배점은 종목 상세 페이지에서 모두 투명하게 공개됩니다. 총점 70점 이상 + 안전마진 양수인 종목에 "Buy Candidate" 태그가 붙습니다.

로직은 [lib/scoring.ts](lib/scoring.ts)에서 확인/조정할 수 있습니다.

## 프로젝트 구조

```
app/page.tsx                대시보드 (스코어 랭킹 + 필터)
app/stock/[ticker]/page.tsx 종목 상세 (기준별 breakdown)
lib/fmp.ts                  FMP API 클라이언트
lib/scoring.ts               버핏/그레이엄 스코어링 로직
lib/store.ts                 data/scores.json 캐시 read/write
scripts/refresh.ts           배치 갱신 스크립트 (npm run refresh)
data/universe.json           스크리닝 대상 티커 목록
data/fixtures.ts             API 키 없을 때 쓰는 샘플 데이터
```

## 참고 사항

- 이 프로젝트가 보여주는 점수·내재가치는 모두 **참고용 계산 결과**이며 투자 조언이 아닙니다.
- v1은 웹사이트만 대상으로 하며, 모바일 앱(PWA/네이티브)은 후속 과제입니다.
- 무료 API 특성상 시세는 실시간이 아닌 지연/일 단위 데이터입니다.
