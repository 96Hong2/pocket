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
    deviceMock.ts devtools 목 앨범·카메라 다이얼. 사진 심기·권한 거부와 각각의 짝 확인 함수
    aitMock.ts   그 밖의 devtools 목 다이얼. 광고 미채움·시스템 뒤로가기·미니앱 종료 감시
    servers.ts   playwright.config 가 띄우는 dev 서버 정의
    fixtures.ts  test·expect 의 유일한 출처. 자동 가드가 여기 붙어 있다. spec 은 여기서 시작한다
  fixtures/    테스트가 쓰는 파일. 지금은 사진용 PNG 한 장(capture.png). 캡처와 영수증이 함께 쓴다
  screens/     화면 객체. 셀렉터는 전부 여기 안에만 있다
    AppShell         마운트·하단 3탭·시스템 뒤로가기
    HomeScreen       홈. 안쪽을 hero·today·budget·ads·recovery 로 나눠 들고 있다
    RecordSheet      기록 시트. 안쪽이 input(키패드)·feedback(저장 후)·nl(줄글)·capture(캡처)·receipt(영수증) 다섯이다
                     capture 와 receipt 는 같은 클래스에 문구 표만 바꿔 끼운 둘이다
    ReportScreen     리포트 탭. 총액·도넛·조각 목록·6개월 흐름
    CalendarScreen   월간 달력. 안쪽을 totals·grid·list·search·edit 로 나눠 들고 있다
    ManageScreen     관리 탭의 예산 섹션. 안쪽을 total·categories·banner·settings 로 나눠 들고 있다
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

`PrepApi` 로 심을 수 있는 것.

| 부르는 것                                                                        | 심는 것                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `addTransaction` · `addSeries` · `addExpense`                                    | 거래. 종류·가맹점·예산 제외·며칠 전까지 정한다 |
| `setBudget(금액, 달?)` · `deleteBudget(달?)`                                     | 전체 예산. 달을 빼면 이번 달이다               |
| `setCategoryBudget(카테고리, 금액, 달?)` · `deleteCategoryBudget(카테고리, 달?)` | 카테고리 예산                                  |
| `setAutoCarryover(켬)`                                                           | 다음 달로 예산을 이어 쓸지                     |
| `categoryIdByName`                                                               | 이름으로 카테고리 id 찾기                      |

달은 `2026-08` 모양이고, `thisMonth()`·`lastMonth()` 로 얻는다. 기기 시간대로 만들지 않는다.
지난달 예산은 이어쓰기를 보려고 심는다. 끝난 기간의 쓰기는 제품 규칙이 막아 두므로
`support/servers.ts` 가 백엔드에 `ALLOW_PAST_PERIOD_BUDGET_WRITE=true` 를 넘겨 e2e 스택에서만 잠금을 연다.
그래서 **여기서는 `422 PERIOD_CLOSED` 를 못 본다.** 잠금 자체는 스위치가 꺼진 백엔드 API 테스트가 지킨다.
응답의 `is_editable` 은 스위치와 무관하게 진짜 규칙으로 계산되므로 "끝난 달은 보기만 한다" 는
화면 동작은 여기서 그대로 검증된다.

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
  지금 쓰는 것은 다섯이다: `shared/testIds.ts`, `app/router/routes.ts`, `shared/lib/format.ts`,
  `shared/api/types.ts`(거래 종류 같은 타입), `features/transactions/ledgerView.ts`(한 페이지 줄 수·달력 칸 계산).
  **배럴(`features/*/index.ts`)로 가져오지 않는다.** 배럴은 `.tsx` 를 함께 내보내서,
  상수 하나만 쓰려 해도 화면 컴포넌트가 Node 로 끌려온다. 순수 모듈을 경로로 직접 가져온다.
  목록에 없는 것을 가져오려면 `tsconfig.test.json` 을 먼저 본다. e2e·tests 프로그램이 그 모듈까지 타입 검사한다.
- **화면 객체에서도 CSS 클래스로 잡지 않는다.** `locator('.foo')` 는 오타를 막아 주는 검사가 없다.
  접근성 이름이나 `testIds` 를 쓴다. 잡을 이름이 없으면 4번대로 키를 더한다.
- **URL 과 포트를 spec 에 적지 않는다.** `support/env.ts` 를 쓴다.
- **날짜를 기기 시간대로 만들지 않는다.** 화면과 서버는 가계부 시간대(Asia/Seoul)로 '오늘' 과
  월 경계를 판단한다. CI 런너는 UTC 라, 기기 시간대로 날짜를 만들면 KST 로 이미 다음 날인
  시각에 돌린 실행에서 기준일이 하루 어긋난다. 로컬은 초록인데 CI 만 9건 빨개진 적이 있다.
  날짜는 `toLedgerDate` 로 얻고, 심을 시각은 `support/api.ts` 의 `seedTime`(그 날 KST 정오
  기준)을 지나게 한다.

## 계층을 올리는 기준 (숫자로)

- 같은 절차를 **spec 2개**가 복붙하면 그때 `screens/` 의 메서드로 올린다. 1개면 spec 안에 둔다.
- 화면 객체의 메서드가 **10개**를 넘으면 화면 안의 영역을 별도 객체로 쪼갠다.
  실제로 두 번 쪼갰다. `RecordSheet` 는 저장 전후와 입력 방법이 달라 `input`·`feedback`·`nl`·`capture` 로,
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

## 앨범·카메라 목

캡처 탭은 `Device.getPhotos`, 영수증 탭은 `Device.openCamera` 를 부른다. devtools 목이 그 자리를
대신하고, 분기는 `deviceModes.photos`·`deviceModes.camera` 가 정한다(둘 다 기본값 `mock`).
**둘은 같은 `mockData.images` 를 읽는다.** 그래서 사진을 따로 심을 이유가 없고, 반대로
브릿지를 잘못 불러도 사진이 나와 초록이 된다. 그 어긋남은 **사진 권한만 끄고 영수증을 돌려서** 잡는다.

`mock` 은 `mockData.images` 의 dataUri 를 그대로 돌려주고 **비어 있을 때만** 캔버스로 만든
placeholder 3장으로 바꿔친다. **파일 선택 다이얼로그가 아예 뜨지 않는다.** `web` 모드는 취소를
예외로 던져 우리 계약(취소 = 빈 값)과 어긋나고, `prompt` 모드는 패널 입력을 30초 기다린다.
그래서 `mock` 모드를 두고 사진만 심는다.

**촬영 취소는 빈 문자열 한 개(`CANCELLED_SHOT`)로 만든다.** 배열이 비지 않았으므로 placeholder 로
바뀌지 않고, `openCameraMock()` 이 `dataUri: ''` 를 내고, 그 값이 `tossBridge.captureReceipt` 의
`image?.dataUri ? ... : null` 을 **실기기와 같은 코드로** 지나 null 이 된다.
⚠ 실기기가 취소를 정말 빈 dataUri 로 주는지는 확인하지 못했다. 우리 분기가 옳게 도는 것까지다.

`support/deviceMock.ts` 는 익명키 트랩과 같은 모양이다. **다이얼마다 짝 확인 함수를 둔다.**

| 거는 것                   | 확인하는 짝                    |
| ------------------------- | ------------------------------ |
| `seedMockImages(dataUri)` | `mockImagesSeeded(page)`       |
| `denyPhotoPermission()`   | `photoPermissionDenied(page)`  |
| `denyCameraPermission()`  | `cameraPermissionDenied(page)` |

짝을 안 부르면 **다이얼이 안 걸린 채로 초록이 된다.** 목 내부 구조(슬라이스 이름)에 기대는
코드라 devtools 를 올리면 여기가 먼저 조용히 깨진다. 심는 사진은 `fixtures/capture.png` 를
base64 로 만든 data URL 이고, `addInitScript` 인자는 모든 문서마다 실리므로 작게 유지한다.
서버 스텁이 이미지 바이트를 보지 않으므로 픽스처를 바꿔도 단언은 안 깨진다. 대신 **고른 바이트가
서버까지 갔는지는 `page.route` 로 요청 본문을 들여다봐 따로 확인한다.** 그게 없으면 프론트가 빈
값을 보내도 전 구간이 초록이다.

권한 거부가 여기서 진짜로 도는 이유는 devtools unplugin 이 `@apps-in-toss/web-framework` 를
목으로 alias 하기 때문이다. `tossBridge` 가 잡는 `PermissionError` 는 목이 정의한 바로 그
클래스라 `instanceof` 분기가 실제로 지나간다.

## e2e 가 만든 데이터

익명키가 테스트마다 다르므로 매 실행이 새 사용자를 만든다. 남의 데이터를 건드리지 않아 따로 지우지 않는다.
`pocket_e2e` DB 가 지저분해지면 `make db-reset` 으로 비운다(개발용 `pocket` DB 도 같이 비워진다).

## e2e 로 확인할 수 없는 것

- **미지원 토스 앱 버전 화면.** devtools 목은 `isSupported` 가 항상 true 다. 앨범도 카메라도
  버전 게이트가 없어 `supports('albumPick')`·`supports('camera')` 가 늘 true 다.
  미지원 분기는 vitest 에서 `createBridge({ forceMock: true, scenario })` 로 본다.
- **앨범에서 아무것도 안 고르고 닫기(취소).** `mock` 모드의 앨범은 배열을 돌려주므로 빈 배열을
  만들 수 없다. 앨범 취소는 vitest 에서 `scenario: { album: 'cancel' }` 로 본다.
  (**촬영 취소는 e2e 에서 본다.** 빈 dataUri 한 개로 만든다. 위 「앨범·카메라 목」 참고)
- **실기기가 취소를 어떻게 알리는지.** 우리는 '빈 값 = 취소' 로 계약했는데 SDK 타입에 적혀 있지
  않고 devtools 의 web 모드는 예외를 던진다. **실기기가 예외를 던진다면 초록인 채로 틀린다.**
  실기기에서 취소를 한 번 눌러 보기 전까지는 미검증이다.
- **배너 실제 크기와 네이티브 권한 팝업.** 실기기에서만 보인다.
- **광고 채움/미채움(NoFill)의 실제 응답.** 목이 주는 시나리오까지만이다.
- **사진 인식 정확도.** 서버 스텁이 이미지를 읽지 않고 정해 둔 예시를 낸다(캡처 5건 · 영수증 1건).
  여기서 증명하는 것은 배관(가져온 사진이 서버까지 가고 후보가 화면에 그려지고 저장된다)까지다.

**사진 권한 거부는 목록에서 뺐다.** 예전에는 vitest 몫이었는데, devtools 가 프레임워크를 목으로
alias 해서 `instanceof PermissionError` 분기가 e2e 에서 실제로 돈다. 카메라도 같다.
위 「앨범·카메라 목」 참고.

## 탭바 클릭 실패는 그 화면이 가로로 넘친다는 신호다 (2026-09-05)

**본문이 가로로 넘치면 브라우저가 화면 전체를 축소하고, 화면 아래 고정된 탭바가 보이는 영역
밖으로 밀려나 눌리지 않는다.** `goToTab` 은 여러 spec 이 이미 쓰고 있으므로(예산 spec 들),
갑자기 안 눌리면 탭바를 의심하기 전에 **그 화면의 가로 폭**을 본다.
실제로 리포트 추이 막대에서 그렇게 잡았다. 라벨이 줄바꿈을 막아 412px 화면을 570px 로 밀었다.

가로 넘침을 직접 재려면 `innerWidth` 와 견주면 안 된다. 축소되면 `innerWidth` 도 함께 커져
둘이 늘 같아진다(항진 명제다). **`visualViewport.width` 와 견준다.**

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

| 부르는 것               | 하는 일                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `demo.open(제목, 설명)` | 영상 맨 앞 제목 카드. 페이지를 연 뒤에 부른다                     |
| `demo.step(문구)`       | 위쪽 자막. 누르기 **직전에** 부른다                               |
| `demo.clearStep()`      | 자막을 걷는다. 화면 전체를 보여줄 때                              |
| `demo.beat(n)`          | n 박자 쉰다. 한 박자는 750ms (`support/director.ts` 의 `BEAT_MS`) |

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
