# AI_DEV_RULES.md

이 파일은 이 프로젝트를 수정하는 모든 AI/개발자가 지켜야 하는 **상시 규칙**이다. 새로운 구현 아이디어보다 이 규칙이 우선한다.

## 1. Source of Truth
1. 제품 요구사항: 레포 밖 개인 노트에 있다(PRD v5 가 정본). 경로는 인계 문서에 있다.
2. 아키텍처: `docs/ARCHITECTURE.md`
3. 데이터 모델: `docs/DATA_MODEL.md`
4. Apps in Toss 사실/SDK/API: **최신 공식 문서**
5. 문서와 코드가 충돌하면 임의 추측하지 말고 근거를 확인해 문서 또는 코드를 함께 수정한다.

Apps in Toss API/SDK 이름을 기억으로 추측하지 않는다. 확인 순서는 `.claude/skills/ait-docs` 에 있다.
설치된 패키지의 타입 정의(`frontend/node_modules/@apps-in-toss/web-framework/dist/index.d.ts`)가 가장 정확하다. 공식 문서는 일부가 2.x 기준으로 낡아 있다.

## 2. Product Invariants
- 첫 기록 전 필수 질문 0개.
- 핵심은 `10초 기록 → 즉시 피드백 → 현재 상태 이해 → 다시 기록`.
- 며칠 놓친 사용자를 벌주거나 streak 실패감을 만들지 않는다.
- 홈은 정보 과부하를 만들지 않는다.
- AI 기능을 보여주기 위해 사용자 행동을 늘리지 않는다.
- `순흐름` 등 사용자가 바로 이해하기 어려운 용어를 UI에 쓰지 않는다.
- 예산 문맥은 `남은 예산`, 수입-지출은 `이번 달 차액`, 자산-부채는 `순자산`.

## 3. Architecture Boundaries
- Frontend → FastAPI → DB 구조를 기본으로 한다.
- Frontend에서 Supabase/PostgreSQL 직접 접근 금지.
- 페이지/feature에서 Apps in Toss SDK 직접 호출 금지.
- Apps in Toss 호출은 `frontend/src/shared/toss` adapter를 통해서만 사용.
- Backend의 Toss Server API 호출은 `backend/app/integrations/apps_in_toss`에 격리.
- LLM provider 호출은 `backend/app/integrations/llm`에 격리.
- feature가 다른 feature의 내부 구현을 직접 import하지 않는다.
- 공용화할 이유가 명확한 것만 `shared`로 이동한다.

## 4. Standard Transaction Model
입력 경로가 달라도 최종 거래 후보는 하나의 `NormalizedTransaction` 형태로 변환한다.

최소 의미:
- occurredAt
- amount
- type: expense | income | transfer | refund
- merchant
- category
- source
- confidence

금액은 양수로 저장하고 `type`으로 의미를 구분한다. `balance` 하나로 남은 예산/차액/순자산을 표현하지 않는다.

## 5. AI Rules
- AI는 구조화, 분류, 요약, 설명을 담당한다.
- AI가 금액 합계/증감/예산 잔액/목표 계산을 직접 계산하지 않는다.
- 숫자는 SQL 또는 deterministic code에서 계산한 값을 AI에 전달한다.
- Structured Output + schema validation을 사용한다.
- 저신뢰 결과를 자동 확정하지 않는다.
- 사용자 수정은 개인 merchant rule에 반영할 수 있어야 한다.
- 원본 캡처/영수증과 불필요한 계좌·카드 번호를 장기 저장하지 않는다.
- OCR/LLM 원문을 analytics/error log에 남기지 않는다.

## 6. UI Rules
- 현재 세이지/앰버 브랜드 디자인을 유지한다.
- TDS로 전체 UI를 덮어씌우지 않는다.
- Apps in Toss Navigation/Tab 등 플랫폼 chrome은 공식 가이드 우선.
- 동일 거래 표시는 하나의 `TransactionRow`를 사용.
- 월 이동 UI는 하나의 `MonthStepper`를 사용.
- Bottom Sheet/Error/Empty/Loading 상태를 화면마다 새로 만들지 말고 공용 component variant로 구현.
- 색상 hex를 feature마다 하드코딩하지 말고 token 사용.
- Tailwind는 `index.css`의 `@theme` 토큰 선언에만 쓴다. 화면과 공용 컴포넌트는 `shared/ui/ui.css`·`app/shell.css`의 BEM 클래스로 그리고, tsx에 유틸리티 클래스를 쓰지 않는다. 예외는 `shared/ui/__demo__` 레이아웃뿐이다.
- 접근성: 터치 영역, contrast, 큰 글자, tabular numeric 확인.

## 7. Apps in Toss Rules
- WebView SDK는 작업 시점의 **최신 안정 3.x**를 사용. beta/rc/canary 금지.
- 새 SDK/API 사용 전 공식 문서로 지원 환경과 최소 Toss App 버전을 확인.
- Navigation을 중복 구현하지 않는다.
- 3탭은 공식 플로팅 탭 형태를 따른다.
- 앨범/카메라/광고/알림 권한과 unsupported 상태를 반드시 처리.
- Toss 서버 API는 필요한 경우 backend에서 mTLS로 호출.
- mTLS 인증서/개인키/운영 광고 ID/비밀키를 git에 커밋하지 않는다.
- CORS 실서비스와 QR 테스트 origin을 모두 고려.
- 인앱 광고 UI를 위장/변형하지 않는다. 광고 slot 내부는 SDK에 맡긴다.

## 8. Ads
- MVP는 배너만.
- 기록 CTA 위/기록/저장 중간 광고 금지.
- 최대 1개 slot부터 실험.
- `isSupported`, `NoFill`, render failure 처리.
- 광고 닫기(X) 버튼과 자체 `AD` 라벨을 넣지 않는다. 재확인은 끝났다(ADR-0004).
- 광고가 없을 때 빈 자리 유지 금지.

## 9. State & Data
- 서버 데이터는 TanStack Query.
- 로컬 화면 상태는 React state부터 사용.
- Zustand 등 전역 상태 라이브러리는 실제 필요가 생기기 전 선도입 금지.
- 새 예산기간에 예산이 없고 직전 예산이 있으면 자동 copy하는 규칙을 backend/domain logic으로 한 곳에서 처리.
- 과거 예산/리포트는 동일 데이터 모델을 월 조건으로 조회하며 별도 중복 저장을 최소화.

## 10. Code Quality
- `utils.ts`, `helpers.ts`에 무관한 로직을 계속 쌓지 않는다.
- `New`, `V2`, `Final`, `Real` 같은 이름으로 중복 component 생성 금지.
- 기존 component를 찾고 확장 가능한지 먼저 확인.
- dependency 추가 전 표준 기능/기존 dependency/유지보수 가치를 확인.
- 최신 안정 버전만 사용하고 설치 시 실제 resolved version을 기록한다.
- frontend/backend 타입 중복 수작업을 줄이고 API schema를 source of truth로 유지한다.

## 11. Testing
핵심 로직은 구현과 함께 테스트한다.

필수 우선순위:
1. transaction type / 집계
2. budget carry-over
3. duplicate import
4. immediate feedback 숫자
5. month boundaries
6. asset/goal deterministic calculations
7. SDK adapter fallback/error states

완료 전 최소:
- frontend lint
- frontend typecheck
- unit tests
- backend tests
- production build
를 실행한다.

## 12. Change Workflow
기능을 만들기 전:
1. PRD와 기존 구현 확인.
2. 관련 기존 component/module 검색.
3. Apps in Toss 관련이면 최신 공식 문서 확인.
4. 구현 범위와 데이터 흐름 결정.
5. 최소 변경으로 구현.
6. 테스트.
7. 필요하면 PRD/Architecture/ADR 동기화.

말하지 않은 기능을 “미래 확장” 명목으로 선구현하지 않는다. P2는 P0/P1 요구에 실제로 필요하지 않으면 구현하지 않는다.

## 13. Stop Conditions
아래 상황에서는 추측 구현하지 않는다.
- 공식 Apps in Toss 문서와 기억이 다름.
- 광고/결제/개인정보 정책이 애매함.
- 동일 의미의 데이터가 여러 모델로 중복될 가능성이 큼.
- 새 dependency나 infra가 MVP 문제보다 더 복잡함.

이 경우 최신 공식 문서와 현재 코드/PRD를 먼저 대조하고 가장 단순한 안전한 방식을 선택한다.
