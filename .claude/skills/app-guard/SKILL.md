---
name: app-guard
description: pocket 저장소를 고치기 전과 후에 지나가는 자가 점검. SDK 직접 호출, 음수 금액 저장, 세 금액 개념 혼용, AI 숫자 계산, P2 선구현, 광고 정책 위반, 중복 컴포넌트, 낡은 버전을 실제 grep 명령으로 잡아낸다. 이 저장소에서 코드를 만들거나 고치기 전에 항상 쓴다.
---

# app-guard

pocket 저장소에서 코드를 바꾸기 전에 지나가는 관문이다.
읽고 넘기는 체크리스트가 아니라 **명령을 실제로 돌려서** 확인한다. 결과를 안 보고 통과했다고 말하지 않는다.

모든 명령은 저장소 루트(`git rev-parse --show-toplevel`)에서 실행한다.
`rg` 가 없으면 `grep -rn` 으로 바꿔 읽는다.

---

## 1. SDK 를 화면에서 직접 부르지 않았나

`@apps-in-toss/web-framework` 를 import 해도 되는 곳은 `src/shared/toss/` 뿐이다.

```bash
rg -n "@apps-in-toss/web-framework" frontend/src --glob '!frontend/src/shared/toss/**'
```

**아무것도 안 나와야 한다.** 나오면 그 화면은 브릿지를 거치도록 고친다.

브릿지에 없는 기능이 필요하면 화면에서 직접 부르지 말고 `shared/toss/types.ts` 의 `MiniAppBridge` 에 메서드를 먼저 추가하고, `tossBridge.ts` 와 `mockBridge.ts` 를 같이 구현한다. 둘 중 하나만 고치면 브라우저 개발이 깨진다.

```bash
# 계약·실기기·목 세 파일이 같이 바뀌었는지
git diff --name-only | rg 'shared/toss/'
```

## 2. 금액을 음수로 저장하지 않았나

금액은 항상 양수다. 의미는 `type` 이 만든다.

```bash
# 모델·스키마에 음수 허용 흔적
rg -n "amount" backend/app --glob '*.py' | rg -i "negative|allow_neg|ge=-|gt=-"
# 저장 경로에서 부호를 뒤집는 코드
rg -n -- "-\s*amount|amount\s*\*\s*-1|abs\(" backend/app frontend/src
```

`amount` 컬럼에 `CheckConstraint('amount > 0')` 이 걸려 있어야 한다.

```bash
rg -n "CheckConstraint" backend/app
```

부호는 집계할 때만 만든다. 반영 규칙은 `docs/ADR/0005-transfer-refund-aggregation.md` 의 표가 정본이다.

## 3. 세 금액 개념을 합치지 않았나

`남은 예산`(remainingBudget) / `이번 달 차액`(monthlyDelta) / `순자산`(netWorth) 은 서로 다른 값이다.
`balance` 하나로 세 개를 표현하지 않는다.

```bash
# 세 값을 뭉뚱그리는 이름이 새로 생겼는지 (설명 주석은 걸려도 된다. 필드·변수 이름을 본다)
rg -n "\bbalance\b|잔액|순흐름|net ?flow" backend/app/models backend/app/modules frontend/src/pages
```

UI 문구도 이 셋만 쓴다. `순흐름`, `잔액`, `net flow` 같은 말을 화면에 쓰지 않는다.

## 4. AI 에게 숫자를 계산시키지 않았나

LLM 은 분류·요약·설명만 한다. 합계·잔액·증감·페이스는 SQL 이나 `backend/app/domain` 이 만든다.

```bash
# LLM 모듈 밖에서 provider 를 부르는 곳
# (logging.py 의 마스킹 키 목록에 'completion' 이 있어 제외한다. 항상 걸리면 결과를 안 보게 된다)
rg -n "openai|anthropic|chat\.completions" backend/app --glob '!backend/app/integrations/llm/**' --glob '!backend/app/core/logging.py'
# 프롬프트에 계산을 시키는 말이 들어갔는지
rg -n -i "계산해|합계를 구|더해서|sum up|calculate the" backend/app/integrations/llm
```

프롬프트에는 이미 계산된 값을 넣고 "이 값을 문장으로 다듬어라" 라고만 시킨다.
Structured Output + zod/pydantic 스키마 검증을 반드시 통과시킨다.

```bash
rg -n "response_format|model_validate|\.parse\(" backend/app/integrations/llm
```

## 5. P2 를 선구현하지 않았나

**P2(만들지 않는다)**: 다중 목표, 반복지출/구독 감지, 다음 달 예산 제안, 질의형 분석, 연간 리포트, 자산 배분 비교, 가족/커플 공유, 공유카드.
**P1(모델·라우트 자리표시자까지. 데이터 조회와 입력 UI 는 만들지 않는다)**: 자산관리, 목표, 행복소비, 월간 결산, 주간 가용액, 무지출일, 알림, CSV export, 풀 AI 코치.

```bash
# P2 흔적
rg -n -i "recurring|subscription|구독 감지|연간 리포트|공유카드|share.?card|가족|couple" backend/app frontend/src
# P1 화면이 데이터를 부르기 시작했는지 (자리표시자를 넘어섰다는 신호)
rg -n "useQuery|useMutation|fetch\(" frontend/src/pages/AssetsPage.tsx frontend/src/pages/GoalPage.tsx frontend/src/pages/NotificationSettingsPage.tsx
# features 폴더가 생겼다면 P1 것이 섞였는지
find frontend/src/features/assets frontend/src/features/goals frontend/src/features/recovery -name '*.tsx' 2>/dev/null
```

셋 다 안 나와야 한다. 나왔으면 멈추고 왜 필요한지 먼저 확인한다.
`frontend/src/features/*` 는 아직 빈 폴더라 마지막 명령은 아무것도 못 잡는다. 그게 정상이다.

## 6. 광고 정책을 어기지 않았나

```bash
# X(숨기기) 버튼과 자체 라벨 (목 배너에 라벨을 다시 넣는 것도 잡는다)
rg -n -i "숨기기|hideAd|dismissAd|closeAd|'AD'|\"AD\"|토스 광고|목 배너|dashed" frontend/src/features/ads frontend/src/shared
# 우리가 새로고침하는 코드
rg -n "setInterval|setTimeout" frontend/src/features/ads
# 운영 광고 ID 하드코딩
rg -n "adGroupId|ait-ad-" frontend/src --glob '!frontend/src/shared/toss/**' | rg -v "import.meta.env|ait-ad-test-banner-id"
```

전부 안 나와야 한다. 추가로 눈으로 확인할 것:

- 컨테이너가 `width: 100%`, `height: 96px` 인가. `width` 를 px 로 고정하지 않았나
- 슬롯 내부에 우리 마크업(스켈레톤·라벨·테두리)이 없는가
- `isSupported` / `onNoFill` / `onAdFailedToRender` 를 다 처리하고, 광고가 없으면 슬롯을 접는가
- 배너가 홈 한 곳에만 있는가 (화면 재마운트가 사실상 refresh 다)

근거는 `docs/ADR/0004-no-ad-hide-button.md`.

## 7. 중복 컴포넌트를 만들지 않았나

```bash
# 금지 접미사
rg --files frontend/src | rg -i "(New|V2|V3|Final|Real|Copy)\.(tsx|ts)$"
# 같은 역할이 여러 개 생겼는지
rg --files frontend/src | rg -i "transactionrow|monthselector|bottomsheet|tabbar"
# 쓰레기통 파일
rg --files frontend/src | rg -i "utils\.ts$|helpers\.ts$"
```

거래 표시는 `TransactionRow` 하나, 월 이동은 `MonthSelector` 하나다.
Bottom Sheet / Error / Empty / Loading 은 화면마다 새로 만들지 말고 공용 컴포넌트의 variant 로 만든다.
색은 hex 를 직접 쓰지 않는다.

```bash
# 토큰 정의부(shared/tokens, app/shell.css)와 아이콘 svg 는 제외하고 본다
rg -n "#[0-9A-Fa-f]{3,8}\b" frontend/src/pages frontend/src/features frontend/src/shared/ui
```

## 8. 최신 안정 버전인가

beta / rc / canary 를 직접 의존성에 넣지 않는다.

```bash
cd frontend
npm outdated || true
node -e "const l=require('./package-lock.json');for(const [k,v] of Object.entries(l.packages))if(v.version&&/-(beta|rc|canary|alpha|next)/i.test(v.version))console.log(k,v.version)"
cd ../backend
uv pip list --outdated || true
```

직접 의존성에 프리릴리즈가 나오면 멈춘다. 트리 깊은 곳의 것(`clipanion`, `gensync`)은 우리가 고른 게 아니라 그대로 둔다. 자세한 건 `docs/DEPENDENCIES.md`.

새 패키지를 넣었으면 `docs/DEPENDENCIES.md` 에 실제 resolved 버전과 이유를 적는다.

## 9. Apps in Toss 이름을 지어내지 않았나

기억으로 API 이름을 쓰지 않는다. `.claude/skills/ait-docs` 순서로 확인한다.

```bash
# 실제로 export 되는 이름인지
rg -n "^(declare|export)" frontend/node_modules/@apps-in-toss/web-framework/dist/index.d.ts | head -60
# deprecated 를 SDK 에서 import 하고 있지 않은지.
# (우리 브릿지도 getSafeAreaInsets 같은 이름을 쓰므로, 호출부가 아니라 import 문을 본다)
rg -n -U "from '@apps-in-toss/web-framework'" -B 20 frontend/src \
  | rg "fetchAlbumPhotos|getTossAppVersion|saveBase64Data|getUserKeyForGame|getOperationalEnvironment|getNetworkStatus|getPlatformOS|getLocale|getSafeAreaInsets|getAnonymousKey"
# TossAds.attach 는 attachBanner 와 헷갈리기 쉬워 따로 본다
rg -n "TossAds\.attach\b" frontend/src
```

`Device.*`, `Environment.*`, `User.*`, `File.*` 네임스페이스 형태만 쓴다.

---

## 마지막: 실제로 돌린다

말로 끝내지 않는다. 아래를 다 통과해야 완료다.

`package.json` 의 scripts 가 정본이다. CLAUDE.md·Makefile·CI 도 같은 명령을 쓴다.

```bash
cd frontend && npm run lint && npm run typecheck && npm test && npm run build:web
cd ../backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app && uv run pytest
```

`npm run build` 는 `ait build` 까지 하는 배포용이라 CI 에서는 `build:web` 만 돈다.

실패했으면 실패했다고 말한다. 못 돌린 게 있으면 무엇을 왜 못 돌렸는지 적는다.
