# 기여 가이드

버핏 저평가 우량주 스크리너에 기여해주셔서 감사합니다! 이 문서는 개발 환경 설정, 코드 스타일, 그리고 풀 리퀘스트 프로세스를 안내합니다.

## 개발 환경 설정

### 1단계: 저장소 fork 및 clone

```bash
# 본 저장소를 GitHub 계정으로 fork한 후
git clone https://github.com/your-username/buffett-screener.git
cd buffett-screener
```

### 2단계: 의존성 설치

```bash
npm install
```

### 3단계: 환경 변수 설정

```bash
cp .env.local.example .env.local
```

`.env.local`을 편집해 필요한 변수를 채웁니다 (선택사항):

- **Supabase**: 회원 기능(로그인/즐겨찾기)을 테스트하려면 설정하세요
- **비운 상태**: 대시보드와 종목 상세 페이지는 샘플 데이터로 작동합니다

### 4단계: 개발 서버 시작

```bash
npm run dev
```

`http://localhost:3000`에서 사이트를 확인할 수 있습니다.

## 작업 흐름

### 기능 개발

1. `main` 브랜치에서 새로운 feature 브랜치 생성:
   ```bash
   git checkout -b feature/brief-description
   ```

2. 코드 작성 및 테스트

3. 커밋 (간결한 커밋 메시지):
   ```bash
   git commit -m "Add brief description of change"
   ```

4. 로컬에서 검증:
   ```bash
   npm run lint    # ESLint 체크
   npm run build   # 빌드 성공 확인
   npm run dev     # 브라우저에서 동작 확인
   ```

5. 저장소에 push:
   ```bash
   git push origin feature/brief-description
   ```

6. GitHub에서 풀 리퀘스트(PR) 생성

### 풀 리퀘스트 가이드

PR을 생성할 때는 다음을 포함해주세요:

**제목**: 변경 사항을 간결하게 설명
- Good: "Add insider trading Form 4 display"
- Avoid: "Bug fixes" 또는 "Updates"

**본문**:
```markdown
## 설명
무엇을 변경했고 왜 변경했는지 설명해주세요.

## 변경 사항
- 항목 1
- 항목 2

## 테스트 방법
이 변경을 검증하는 방법을 설명해주세요.

## 스크린샷 (필요시)
UI 변경이 있으면 before/after 스크린샷 첨부
```

## 코드 스타일

### TypeScript

- **타입 안전성**: `any` 사용 회피, 명시적 타입 선언 선호
- **파일 구조**: 관련 로직은 `lib/` 폴더에, UI는 `components/`에 배치
- **네이밍**: camelCase 함수/변수, PascalCase 컴포넌트/인터페이스

### React/Next.js

- **Server Components**: 기본값. 데이터 페칭/민감한 로직은 Server Component에서
- **Client Components**: `'use client'` 지시문은 최상단. 인터랙션/상태 관리 필요시만 사용
- **useTransition/useDeferredValue**: 큰 목록 정렬/필터링 시 성능 최적화에 활용

### Tailwind CSS

- **토큰 유틸리티 우선**: `bg-surface`, `text-ink-muted` 등 의미 있는 토큰 사용
- **다크 모드**: `dark:` 변형 사용 금지 (토큰이 이미 테마 반영)
- **반응형**: `md:` 등으로 모바일/데스크톱 분기

### 파일 포맷

- **들여쓰기**: 2칸 스페이스
- **줄 길이**: 100칸 이상은 주의 깊게 검토
- **임포트**: 표준 라이브러리 → 외부 라이브러리 → 로컬 파일 순으로 정렬

## 주요 코드베이스 가이드

### 점수 계산 로직 수정

점수 기준을 변경하려면:

1. `lib/scoring.ts` 상단의 `SCORING_VERSION`을 올립니다 (중요!)
2. 기준값/가중치를 수정합니다
3. `npm run refresh`로 현재 점수를 재계산합니다 (배치)
4. `npm run backfill`로 과거 시점을 역사적으로 재구성합니다 (선택사항)

**주의**: 기준을 바꾸면 모든 종목의 점수가 달라집니다. 변경이 의도한 결과를 가져오는지 확인하세요.

### 새 데이터 소스 추가

1. `lib/` 폴더에 새 파일 생성 (예: `lib/newSource.ts`)
2. 필요시 `lib/types.ts`에 타입 추가
3. 에러 핸들링 및 폴백 구현 (데이터 소스 실패는 언제든 가능)
4. 배치에 통합하려면 `scripts/refresh.ts` 또는 `scripts/backfill.ts` 수정

### 다국어 지원 추가

새로운 언어를 추가하려면:

1. `i18n/routing.ts`의 `locales` 배열에 언어 코드 추가 (예: `'ja'`)
2. `messages/ja.json` 생성 (기존 `messages/ko.json`을 복사한 후 번역)
3. `messages/ko.json`의 `sectors.*` 번역을 `messages/ja.json`에도 추가
4. `data/universe.json`의 `sector` 번역 추가

## 테스트

현재 자동 테스트 스위트가 없으므로, 수동 테스트로 검증해주세요:

### 체크리스트

- [ ] `npm run lint`가 오류 없음
- [ ] `npm run build`가 성공
- [ ] `npm run dev`로 개발 서버 시작 후:
  - [ ] 대시보드 페이지 로드 및 정렬/필터 동작
  - [ ] 종목 상세 페이지 로드 및 차트 표시
  - [ ] 테마 전환 (다크/라이트)
  - [ ] 언어 전환 (한국어/영어)
  - [ ] (Supabase 설정 시) 로그인 및 즐겨찾기 토글

### 신규 기능 테스트

새 기능을 추가했다면:

- [ ] 의도한 동작이 정상적으로 작동
- [ ] 모바일(375px 너비)과 데스크톱(1280px)에서 모두 테스트
- [ ] 라이트 테마와 다크 테마에서 모두 테스트
- [ ] 에러 상황 테스트 (네트워크 오류 시뮬레이션 등)

## 배포 파이프라인

모든 PR이 `main` 브랜치로 merge되면:

1. GitHub Actions이 `npm run lint` 및 `npm run build` 실행
2. 성공하면 Vercel이 자동 재배포
3. 점수 갱신 워크플로우는 평일 23:00 UTC마다 자동 실행

## 주의사항

### 보안

- **절대 커밋하지 말 것**:
  - `.env.local` (환경 변수)
  - API 키, 토큰, 비밀번호
  - 민감한 사용자 정보

- **NEXT_PUBLIC_ 접두사 주의**:
  - `SUPABASE_SERVICE_ROLE_KEY`는 절대 NEXT_PUBLIC_ 붙이면 안 됨
  - 이 키가 클라이언트에 노출되면 누구든 DB를 수정 가능

### 성능

- **번들 크기**: 의존성 추가 시 크기 증가 검토 (`npm list package-name`)
- **네트워크 요청**: 불필요한 중복 요청 제거
- **렌더링**: 큰 목록은 pagination/virtualization 고려

### 데이터

- **SEC EDGAR**: 일부 종목은 데이터 부족으로 실패 (정상)
- **야후 파이낸스**: 가끔 네트워크 오류 발생 (재시도 로직 포함)
- **히스토리 정합성**: 배치 버전이 바뀌면 과거 점수도 재구성되므로 주의

## 질문 및 논의

- **버그 보고**: [Issues](https://github.com/sihuny/buffett-screener/issues) 탭에서 새 issue 생성
- **기능 제안**: Issue에 `enhancement` 레이블 붙이고 토론
- **코드 리뷰**: PR 코멘트에서 자유롭게 논의 가능

## 라이선스

본 프로젝트는 MIT 라이선스 아래 공개되어 있습니다. 기여한 코드도 동일 라이선스 적용을 동의하는 것으로 간주합니다.

---

다시 한번 감사합니다! 🎉
