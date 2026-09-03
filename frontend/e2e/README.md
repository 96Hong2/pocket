# e2e 규약

새 spec 을 만들기 전에 이 파일을 먼저 읽는다.
여기 적힌 것을 지키면 다음 사람이 같은 것을 두 번 만들지 않는다.

## 무엇을 어디에 두나

```
e2e/
  support/     테스트 바깥 장치. 격리·가드·주소
    env.ts       포트와 주소 한 곳. spec 이 직접 쓴다
    anonKey.ts   테스트별 익명키 생성과 devtools 목에 주입하는 트랩.
                 보통은 fixtures 가 걸고, 이 장치 자체를 증명하는 spec 만 직접 부른다
    api.ts       사전 조건을 심는다. spec 은 `prep` 픽스처로 받는다
    fixtures.ts  test·expect 의 유일한 출처. 자동 가드가 여기 붙어 있다. spec 은 여기서 시작한다
  screens/     화면 객체. 셀렉터는 전부 여기 안에만 있다
    AppShell         마운트·하단 3탭·시스템 뒤로가기
    HomeScreen       홈. 안쪽을 hero·today·budget·ads·recovery 로 나눠 들고 있다
    RecordSheet      기록 시트. 안쪽이 input(저장 전)·feedback(저장 후) 둘이다
    CalendarScreen   월간 달력. 안쪽을 totals·grid·list·search·edit 로 나눠 들고 있다
    UiGalleryScreen  개발용 공용 UI 갤러리. URL 이 달라 별도 객체다
  specs/       테스트. 무엇을 확인하는지만 읽히게 쓴다
  demo/        화면 동작 영상을 찍는 자리. 판정이 아니라 산출물을 만든다
    support/     director(연출·영상 저장) · overlay(자막·클릭 물결)
    scenes/      장면 파일. 파일당 영상 한두 개
```

의존 방향은 한쪽이다. `specs → screens → support`. 거꾸로 부르지 않는다.

## 준비는 API, 행동은 화면, 단언도 화면

그 테스트가 확인하려는 동작은 반드시 화면으로 한다. 그것을 API 로 대신하면 화면을 검증하지 않는 테스트가 된다.
그 동작의 배경이 되는 상태는 화면으로 만들 수 있어도 `support/api.ts` 로 심어도 된다.
며칠 비운 상태처럼 화면으로는 아예 만들 수 없는 것도 여기로 심는다.

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
  `src/` 에서 가져와도 되는 것은 부수효과 없는 상수·순수 함수 모듈뿐이다.
  지금 쓰는 것은 넷이다: `shared/testIds.ts`, `app/router/routes.ts`, `shared/lib/format.ts`,
  `features/transactions/ledgerView.ts`(한 페이지 줄 수·달력 칸 계산).
  **배럴(`features/*/index.ts`)로 가져오지 않는다.** 배럴은 `.tsx` 를 함께 내보내서,
  상수 하나만 쓰려 해도 화면 컴포넌트가 Node 로 끌려온다. 순수 모듈을 경로로 직접 가져온다.
  목록에 없는 것을 가져오려면 `tsconfig.test.json` 을 먼저 본다. e2e·tests 프로그램이 그 모듈까지 타입 검사한다.
- **화면 객체에서도 CSS 클래스로 잡지 않는다.** `locator('.foo')` 는 오타를 막아 주는 검사가 없다.
  접근성 이름이나 `testIds` 를 쓴다. 잡을 이름이 없으면 4번대로 키를 더한다.
- **URL 과 포트를 spec 에 적지 않는다.** `support/env.ts` 를 쓴다.

## 계층을 올리는 기준 (숫자로)

- 같은 절차를 **spec 2개**가 복붙하면 그때 `screens/` 의 메서드로 올린다. 1개면 spec 안에 둔다.
- 화면 객체의 메서드가 **10개**를 넘으면 화면 안의 영역을 별도 객체로 쪼갠다.
  실제로 두 번 쪼갰다. `RecordSheet` 는 저장 전후로 보이는 것이 달라 `input`·`feedback` 으로,
  `HomeScreen` 은 카드가 쌓인 화면이라 `hero`·`today`·`budget`·`ads`·`recovery` 로 나눴다.
  쪼갠 뒤에도 파일은 하나다. 한 화면을 여러 파일로 흩으면 어디를 봐야 할지 알 수 없어진다.
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

## 데모 녹화

제품 화면이 실제로 도는 모습을 영상으로 남긴다. 검증과 같은 스택·같은 화면 객체를 쓰고,
목적만 다르다. 여기서 나오는 것은 통과·실패가 아니라 mp4 다.

```bash
npm run demo                              demo-videos/ 에 webm 을 모은다
POCKET_DEMO_OUT=<경로> npm run demo        그 폴더로 내보낸다
node scripts/demo-publish.mjs <폴더>       webm 을 mp4 로 옮기고 인덱스 HTML 을 만든다
```

**검증과 동시에 돌릴 수 없다.** 포트(5183·8100)가 하나뿐이라 둘 중 하나가 죽는다.

### 왜 검증과 갈라 뒀나

`playwright.config.ts` 가 `demo/` 를 제외한다. 섞어 두면 CI 가 매번 영상을 찍고,
녹화 때문에 넣은 고정 대기가 검증 시간을 늘린다. 서버를 띄우는 방법은
`support/servers.ts` 하나를 두 설정이 함께 쓴다.

### 장면 하나 더 만들 때

1. `scenes/` 에서 비슷한 장면을 먼저 연다. 같은 화면을 다루는 파일이 있으면 **그 파일에 test 를 더한다.**
2. `import { expect, test } from '../support/director';` 로 시작한다.
3. **테스트 제목이 그대로 영상 파일 이름이 된다.** `NN 무엇을 보여주는지` 형식으로 쓰고 번호는 이어서 붙인다.
4. 화면 조작은 `screens/` 의 화면 객체로 한다. 없으면 그 객체에 메서드를 더한다. 여기서 셀렉터를 쓰지 않는다.
5. 배경 상태는 `support/api.ts` 의 `prep` 으로 심는다.

### 연출

| 부르는 것 | 하는 일 |
| --- | --- |
| `demo.open(제목, 설명)` | 영상 맨 앞 제목 카드. 페이지를 연 뒤에 부른다 |
| `demo.step(문구)` | 위쪽 자막. 누르기 **직전에** 부른다 |
| `demo.clearStep()` | 자막을 걷는다. 화면 전체를 보여줄 때 |
| `demo.beat(n)` | n 박자 쉰다. 기본 한 박자는 0.9초 |

`waitForTimeout` 은 `demo` 안에서만 쓴다. 검증 spec 에서는 여전히 금지다.
영상은 사람이 보는 것이라 "상태가 됐다" 와 "눈으로 따라갔다" 가 다르다.
상태를 기다리는 것은 화면 객체의 단언이 하고, 박자는 그 뒤에 눈을 위해 붙는다.

### 영상에도 단언을 넣는다

각 단계마다 `expect` 를 하나씩 넣는다. 그래야 영상에 찍힌 화면이 검증을 통과한 화면이 된다.
단언 없이 찍으면 화면이 깨진 채로 녹화되어도 아무도 모른다.
`fixtures` 의 콘솔 오류 검사·익명키 감시·개발 스택 감시도 녹화에 그대로 걸린다.

### 오버레이

`support/overlay.ts` 가 제품 코드를 건드리지 않고 `addInitScript` 로 얹는다.

- 누른 자리에 파란 물결. 영상에는 마우스 커서가 안 찍혀서 없으면 화면이 저절로 바뀌는 것처럼 보인다
- 위쪽 자막과 맨 앞 제목 카드
- devtools 의 파란 AIT 버튼 감추기. 제품 화면이 아니라 개발 도구다

### 알아 둘 것

- 영상 크기는 뷰포트와 같아야 한다. 더 크게 잡으면 확대되지 않고 남는 자리가 회색이 된다.
  두 값은 `playwright.demo.config.ts` 의 `DEMO_VIEWPORT` 하나로 묶여 있다.
- Playwright 가 들고 있는 ffmpeg 는 webm 전용이라 mp4 를 못 만든다. 변환에는 `brew install ffmpeg` 가 필요하다.
- 인터넷이 막힌 곳에서는 폰트 CDN 을 못 받아 글꼴이 시스템 것으로 바뀐다. 레이아웃은 같다.
