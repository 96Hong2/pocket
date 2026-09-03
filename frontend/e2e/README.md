# e2e 규약

새 spec 을 만들기 전에 이 파일을 먼저 읽는다.
여기 적힌 것을 지키면 다음 사람이 같은 것을 두 번 만들지 않는다.

## 무엇을 어디에 두나

```
e2e/
  support/     테스트 바깥 장치. 격리·가드·주소. spec 이 직접 부르지 않는다
    env.ts       포트와 주소 한 곳
    anonKey.ts   테스트별 익명키 생성과 devtools 목에 주입하는 트랩
    api.ts       화면으로 못 만드는 사전 조건을 심는다(며칠 전 기록 같은 것)
    fixtures.ts  test·expect 의 유일한 출처. 자동 가드가 여기 붙어 있다
  screens/     화면 객체. 셀렉터는 전부 여기 안에만 있다
    AppShell     마운트와 하단 3탭
    HomeScreen   히어로 숫자·게이지·기록 버튼·예산 제안·광고 자리
    RecordSheet  기록 시트. 키패드 입력·카테고리 선택·피드백·되돌리기
  specs/       테스트. 무엇을 확인하는지만 읽히게 쓴다
```

의존 방향은 한쪽이다. `specs → screens → support`. 거꾸로 부르지 않는다.

## 준비는 API, 행동은 화면, 단언도 화면

며칠 비운 상태처럼 시간이 필요한 사전 조건은 화면으로 만들 수 없다. 그것만 `support/api.ts` 로 심는다.
확인하려는 동작 자체를 API 로 대신하지 않는다. 그러면 화면을 검증하지 않는 테스트가 된다.

## 새 spec 을 만드는 순서

1. `screens/` 를 먼저 연다. 필요한 동작이 이미 있으면 그걸 쓴다.
2. 없으면 그 화면의 객체에 메서드를 **더한다.** 새 화면 객체를 만드는 것은 URL 이 바뀌는 화면일 때만이다.
3. 셀렉터가 필요하면 접근성 이름(`getByRole`)으로 잡히는지 먼저 본다. 잡히면 그걸 쓴다.
4. 이름으로 안 잡히는 값(숫자·게이지)만 `src/shared/testIds.ts` 에 키를 더하고, 화면 코드에 `data-testid` 를 붙인다.
   상수를 e2e 쪽에 다시 적지 않는다. 없는 키를 쓰면 `npm run typecheck` 가 막는다.
5. spec 은 `import { expect, test } from '../support/fixtures'` 로 시작한다.

## 금지

- **spec 에서 셀렉터를 직접 쓰지 않는다.** `page.locator(...)`·`getByRole(...)` 은 `screens/` 안에서만.
- **`@playwright/test` 를 spec 이 직접 import 하지 않는다.** `support/fixtures` 를 거친다. 안 그러면 가드가 안 걸린다.
- **`waitForTimeout` 을 쓰지 않는다.** 기다릴 것이 있으면 `expect(...).toHaveText` 나 `expect.poll` 로 상태를 기다린다.
- **`.tsx` 와 `.css` 를 e2e 에서 import 하지 않는다.** e2e 는 브라우저 밖 Node 에서 돈다.
  `src/` 에서 가져와도 되는 것은 부수효과 없는 상수 모듈뿐이다(`shared/testIds.ts`, `app/router/routes.ts`).
- **URL 과 포트를 spec 에 적지 않는다.** `support/env.ts` 를 쓴다.

## 계층을 올리는 기준 (숫자로)

- 같은 절차를 **spec 2개**가 복붙하면 그때 `screens/` 의 메서드로 올린다. 1개면 spec 안에 둔다.
- 화면 객체의 메서드가 **10개**를 넘으면 화면 안의 영역(바텀시트·키패드)을 별도 객체로 쪼갠다.
- 하나의 절차가 **화면 3개**를 가로지르면 그때 `flows/` 를 새로 만든다. 지금은 없다. 미리 만들지 않는다.
- `support/` 헬퍼는 **spec 2개**가 쓸 때 올린다. 한 spec 만 쓰는 헬퍼는 그 spec 파일 안에 둔다.

## 자동으로 걸리는 가드

`support/fixtures.ts` 의 `page` 가 모든 테스트에 아래를 건다. spec 에서 다시 쓰지 않는다.

- **콘솔 오류 검사.** 오류가 하나라도 있으면 실패한다.
  정말 눈감아야 하면 `consoleErrorAllowList` 픽스처에 정규식을 넣고 이유를 주석으로 남긴다.
- **익명키 감시.** 요청이 보낸 `X-Anon-Key` 가 이 테스트의 키와 다르면 실패한다.
  테스트가 끝날 때 devtools 목이 실제로 들고 있는 값도 확인한다.
- **개발 스택 감시.** 요청이 `localhost:5173` 이나 `localhost:8000` 으로 나가면 실패한다.
  개발 서버를 주워 쓰면 테스트가 개발 데이터에 쓴다.

## 익명키 격리

앱인토스 devtools 목은 익명키를 `mock-anon-hash-xyz789` 상수로 준다.
손대지 않으면 모든 테스트와 모든 병렬 워커가 백엔드에서 **같은 사용자**가 된다.
'새 계정으로 처음 연다' 를 재현할 수 없고, 두 번째 실행부터 숫자 단언이 깨진다.

그래서 `support/anonKey.ts` 가 `window.__ait` 에 setter 를 걸어, 목이 자기 상태를 대입하는 순간
익명키만 테스트별 유일값으로 갈아끼운다. 브릿지는 실기기와 같은 코드로 그대로 돈다.

키에는 재시도 회차가 들어간다. 없으면 CI 재시도가 앞 회차 데이터를 물려받는다.

이 장치가 살아 있는지는 `specs/anon-key-isolation.spec.ts` 가 증명한다.
devtools 를 올린 뒤 그 spec 이 깨지면 `support/anonKey.ts` 를 목 구조에 다시 맞춘다.
**`POCKET_DISABLE_AIT_DEVTOOLS=1` 로 우회하지 않는다.** 그 길로 가면 우리 MockMiniAppBridge 가 도는 탓에
실기기 브릿지 코드가 e2e 에서 한 줄도 돌지 않고, 두 모드를 같이 띄우면 vite 의존성 캐시를 서로 덮어써 앱이 빈 화면이 된다.

## e2e 가 만든 데이터

익명키가 테스트마다 다르므로 매 실행이 새 사용자를 만든다. 남의 데이터를 건드리지 않아 따로 지우지 않는다.
`pocket_e2e` DB 가 지저분해지면 `make db-reset` 으로 비운다(개발용 `pocket` DB 도 같이 비워진다).

## e2e 로 확인할 수 없는 것

- **미지원 토스 앱 버전 화면.** devtools 목은 `isSupported` 가 항상 true 다.
  권한 거부·미지원 분기는 vitest 에서 `createBridge({ forceMock: true, scenario })` 로 본다.
- **배너 실제 크기와 네이티브 권한 팝업.** 실기기에서만 보인다.
- **광고 채움/미채움(NoFill)의 실제 응답.** 목이 주는 시나리오까지만이다.

## 도구 설정 메모

- `.oxlintrc.json` 이 `e2e/**` 에서 `react/rules-of-hooks` 와 `no-empty-pattern` 을 끈다.
  Playwright 픽스처의 `async ({}, use) => {}` 모양을 oxlint 가 React 훅 호출로 잘못 읽어서다.
- `playwright.config.ts` 는 `reuseExistingServer: false` 다. 남의 서버를 주워 쓰는 사고가 없어지는 대신,
  5183·8100 이 이미 물려 있으면 "포트가 쓰이는 중" 으로 죽는다. 그때는 그 포트를 먼저 비운다.
