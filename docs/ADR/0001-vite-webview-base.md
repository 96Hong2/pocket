# 0001. Apps in Toss WebView + 기존 Vite/React 프로젝트를 기반으로 한다

상태: 확정 · 2026-09-03

## 배경

미니앱을 시작하는 길은 둘이다.
하나는 `create-ait-app` 으로 공식 템플릿을 뽑는 것, 다른 하나는 이미 있는 웹 프로젝트에 `ait init` 으로 SDK 를 얹는 것이다.
우리에게는 이미 Vite + React 19 + TypeScript 7 로 돌아가는 프로젝트와 시안 실측 디자인 토큰이 있었다.

## 결정

기존 Vite 프로젝트를 그대로 두고 `ait init` 으로 Apps in Toss WebView SDK 를 붙인다.
React Native(Granite) 가 아니라 WebView 를 쓴다.

## 근거

- 템플릿을 새로 뽑으면 React·Vite·TypeScript 버전이 템플릿이 고정한 값으로 내려간다. 지금 우리 조합(React 19.2.8 / Vite 8.2.2 / TS 7.0.2)은 전부 최신 안정이라 내릴 이유가 없다.
- 붙는 것은 결국 `@apps-in-toss/web-framework` 의존성 하나와 `apps-in-toss.config.ts` 한 파일이다. 빌드는 `vite build` 로 `dist` 를 만들고 `ait build` 가 그걸 감싼다. 기존 파이프라인을 갈아엎지 않는다.
- WebView 는 우리가 이미 쓰는 웹 기술 그대로다. 화면 18개를 React Native 로 다시 그릴 이유가 없고, 이 앱에 네이티브 성능이 필요한 화면도 없다.
- 웹이라 브라우저에서 Mock 브릿지로 개발할 수 있다. 실기기 없이도 대부분의 작업이 돌아간다.

## 대안

- **`create-ait-app` 템플릿**: 설정이 맞춰져 있어 빠르지만, 이미 있는 코드와 토큰을 옮겨야 하고 버전이 내려간다.
- **Granite(React Native)**: 네이티브 성능과 화면 전환을 얻지만 웹 자산을 못 쓴다. 이 앱에는 과하다.

## 결과

- 빌드는 `npm run build` = `tsc -b && vite build && ait build` → `frontend/pocket.ait`.
- `apps-in-toss.config.ts` 는 3.x 스키마다. 문서에 나오는 `granite.config.ts`, `brand.displayName`, `brand.icon`, `web.commands`, `outdir` 는 v2 형식이라 쓰지 않는다. 앱 표시 이름과 아이콘은 개발자센터 콘솔에서 설정한다.
- CSR 만 쓴다. SSR 은 플랫폼이 막는다.
