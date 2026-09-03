---
name: ait-docs
description: Apps in Toss SDK·API·정책 사실을 확인하는 순서. 함수 이름, 시그니처, 최소 토스 앱 버전, 광고·심사 정책을 쓰기 전에 반드시 이 순서로 확인한다. 기억으로 API 이름을 지어내지 않는다.
---

# ait-docs

# ⚠ 기억으로 API 이름을 지어내지 마라

`Device.getPhotos` 인지 `fetchAlbumPhotos` 인지, 옵션 이름이 `maxCount` 인지 `limit` 인지를
"아마 이럴 것" 으로 쓰지 않는다. **확인하고 쓴다.** 확인할 수 없으면 쓰지 말고 TODO 로 남긴다.

이유는 실제로 겪은 것이다. 공식 문서 일부가 v2 형식으로 낡아 있었다.
`granite.config.ts`, `brand.displayName`, `brand.icon`, `web.commands`, `outdir` 는 문서에는 있지만 3.x 스키마에 **없다.**
문서를 믿고 썼으면 빌드가 깨졌다.

---

## 확인 순서

### 1. `ax search docs`

```bash
ax search docs --query "TossAds attachBanner"
```

주의 두 가지.

- **이 인덱스는 현재 결과가 비어 있다.** 안 나온다고 "그런 API 는 없다" 로 결론 내리지 말고 다음 단계로 간다.
- `ax` 가 PATH 에 없을 수도 있다(`command -v ax` 로 확인). 없으면 3단계부터 한다.

### 2. `ax search tds-web`

```bash
ax search tds-web --query "탭바"
```

이쪽 인덱스는 동작한다. 다만 TDS 웹 컴포넌트 문서라서 WebView SDK 질문에는 답이 없을 때가 많다.

### 3. 문서 페이지를 마크다운으로 직접 가져온다

개발자센터의 **모든 페이지는 URL 뒤에 `.md` 를 붙이면 마크다운으로** 온다.

```bash
curl -sS https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/ads/tossads.md
```

**중요한 함정: 없는 페이지도 HTTP 200 을 준다.** 본문이 `# Page Not Found` 로 시작한다.
상태코드로 판정하지 말고 **본문 첫 줄을 눈으로 본다.**

```bash
curl -sS "$URL" | head -3
```

### 4. 색인에서 정확한 경로를 찾는다

경로를 추측하지 말고 색인에서 고른다.

```bash
curl -sS https://developers-apps-in-toss.toss.im/llms.txt | rg -i "광고|ads|배너"
curl -sS https://developers-apps-in-toss.toss.im/llms.txt | rg -i "익명|anon|user"
curl -sS https://developers-apps-in-toss.toss.im/llms.txt | rg -i "정책|심사|checklist"
```

색인 한 줄이 `- [제목](URL.md): 요약` 형태라 URL 을 그대로 복사해 3단계에 넣으면 된다.

### 5. 가장 확실한 방법: 타입 정의를 직접 읽는다

**문서보다 정확하다. 실제로 설치된 버전이 무엇을 export 하는지가 진실이다.**

```bash
FILE=frontend/node_modules/@apps-in-toss/web-framework/dist/index.d.ts

# 이름으로 찾기
rg -n "getAnonymousKey|attachBanner|getPhotos" "$FILE"
# 앞뒤 맥락까지
rg -n -B3 -A20 "declare const TossAds" "$FILE"
# 실제로 export 되는 것 전부
rg -n "^export" "$FILE"
```

설정 파일 스키마는 따로 있다.

```bash
cat frontend/node_modules/@apps-in-toss/web-framework/dist/config.d.ts
```

버전 확인:

```bash
node -p "require('./frontend/node_modules/@apps-in-toss/web-framework/package.json').version"
```

---

## 이미 확인해 둔 것

아래는 `dist/index.d.ts` 원문에서 확인한 것이다. 이 목록에 없는 이름은 쓰기 전에 다시 확인한다.

```ts
import {
  User, Device, Environment, Storage, SafeArea, Screen,
  TossAds, partner, tdsEvent, graniteEvent,
  getOperationalEnvironment, getAppsInTossGlobals, isMinVersionSupported,
} from '@apps-in-toss/web-framework';
```

| 쓰는 것 | 최소 토스 앱 버전 | 메모 |
|---|---|---|
| `User.getAnonymousKey()` → `{ hash, type: 'HASH' }` | 5.232.0 | `.isSupported()` 있음. 실패 시 throw |
| `Device.os` / `Device.locale` | – | |
| `Device.getPhotos({ base64?, maxCount?, maxWidth? })` | – | 기본 maxCount 10 / maxWidth 1024 / base64 false |
| `Device.getAlbumItems({ types?, maxCount?, maxWidth?, base64? })` | 5.261.0 | `.isSupported()` 있음. 취소하면 빈 배열 |
| `Device.openCamera({ base64?, maxWidth? })` | – | 권한 없으면 `OpenCameraPermissionError` |
| `Environment.environment` / `tossAppVersion` / `deviceId` / `initialURL` | – | |
| `Environment.getNetworkStatus()` | – | `OFFLINE`\|`WIFI`\|`2G`~`5G`\|`WWAN`\|`UNKNOWN` |
| `Environment.getServerTime()` | 5.245.0 | `.isSupported()` 있음 |
| `Storage.getItem/setItem/removeItem/clearItems` | – | 네이티브 영속 저장소 |
| `SafeArea.get()` / `SafeArea.subscribe({ onEvent })` | – | |
| `Screen.close()` / `Screen.setIosSwipeBack({ isEnabled })` | – | |
| `partner.addAccessoryButton({ id, title, icon })` / `removeAccessoryButton()` | – | 액세서리는 최대 1개 |
| `tdsEvent.addEventListener('navigationAccessoryEvent', { onEvent })` | – | |
| `graniteEvent.addEventListener('backEvent', { onEvent })` | – | ⚠ 등록하면 플랫폼 기본 뒤로가기가 막힌다. 우리가 이동·종료를 처리해야 한다 |
| `TossAds.initialize({ callbacks })` | 5.239.0 | `.isSupported()` 있음. 멱등 |
| `TossAds.attachBanner(adGroupId, target, opts)` → `{ destroy() }` | 5.239.0 | |
| `TossAds.destroy(slotId)` / `destroyAll()` | – | |
| `Environment.environment` → `'toss' \| 'sandbox'` (속성) | – | 브라우저에서는 던진다. flat `getOperationalEnvironment()` 는 deprecated |
| `isMinVersionSupported({ android, ios })` | – | `'5.x.y'` \| `'always'` \| `'never'` |

**deprecated 라 쓰지 않는다**: `fetchAlbumPhotos`, flat `openCamera`, flat `getNetworkStatus`,
`getTossAppVersion`, flat `getServerTime`, `saveBase64Data`, `getUserKeyForGame`, `TossAds.attach`,
`getOperationalEnvironment`, flat `getAnonymousKey`, `getPlatformOS`, `getLocale`, `getSafeAreaInsets`.
전부 네임스페이스 형태(`Device.*`, `Environment.*`, `File.*`, `User.*`, `SafeArea.*`)를 쓴다.

**에러 판정은 메시지 문자열로 하지 않는다.** SDK 의 메시지는 한국어 안내문이라
`unsupported`·`permission` 같은 영어 단어가 없다. 실제 형태는 이렇다.

| 상황 | 판정 |
|---|---|
| 미지원 버전 | `error.name === 'UNSUPPORTED_APP_VERSION'` (OS 부족이면 `UNSUPPORTED_OS_VERSION`) |
| 권한 거부 | `error instanceof PermissionError` (하위 클래스 전부 포함. 패키지가 export 한다) |

`apps-in-toss.config.ts` 3.x 스키마: `appName`, `brand.primaryColor`, `permissions`, `navigationBar`, `webView`, `webBundleDir`.
`brand.displayName` 과 `brand.icon` 은 **없다.** 앱 표시 이름과 아이콘은 개발자센터 콘솔에서 설정한다.

---

## 정책은 SDK 와 별개다

함수가 있다고 써도 되는 것은 아니다. 광고·심사·개인정보는 정책 문서를 따로 본다.

```bash
curl -sS https://developers-apps-in-toss.toss.im/intro/guide.md | head -60        # 서비스 오픈 정책
curl -sS https://developers-apps-in-toss.toss.im/checklist/app-nongame.md | head -60  # 비게임 출시 가이드
curl -sS https://developers-apps-in-toss.toss.im/guide/monetization/in-app-ad.md | head -60  # 인앱 광고(정책 표)
curl -sS https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/web-banner.md | head -80  # 배너 규격 정본(100%·96px·내부 비움·자동갱신)
curl -sS https://developers-apps-in-toss.toss.im/design/consumer-ux-guide.md | head -60     # UI/UX 가이드
```

우리가 이미 정한 것은 다시 논쟁하지 않는다. `docs/ADR/0004-no-ad-hide-button.md` 를 먼저 본다.

## 확인 결과를 남긴다

새로 확인한 사실은 그 자리에서 문서에 넣는다.

- SDK 표면이 바뀌었으면 이 파일의 표를 고친다.
- 정책 판단이 바뀌었으면 해당 ADR 을 고치고 상태를 갱신한다.
- 확인 못 한 것은 **지어내지 말고** 코드에 TODO 로 남기고 무엇을 못 봤는지 적는다.
