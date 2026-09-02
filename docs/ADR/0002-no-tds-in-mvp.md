# 0002. TDS 를 MVP 에 도입하지 않는다

상태: 확정 · 2026-09-03

## 배경

토스 미니앱은 토스 디자인 시스템(TDS, `@toss/tds-mobile`)을 쓸 수 있다.
토스 안에서 도는 앱이니 TDS 를 깔면 이질감이 줄고 컴포넌트를 공짜로 얻을 것 같았다.

## 결정

MVP 에서 `@toss/tds-mobile` 을 설치하지 않는다. 세이지/앰버 커스텀 디자인을 직접 구현한다.

## 근거

- **React 19 를 막는다.** `@toss/tds-mobile` 2.5.1 의 peer 는 `react: ^16.8.3 || ^17 || ^18` 이다(`npm view` 로 확인). 넣으려면 React 를 18 로 내려야 한다.
- **정작 필요한 두 개가 없다.** 상단 네비게이션 바는 플랫폼이 그리고 코드 컴포넌트가 없다. 하단 탭바는 "토스가 제공하는 플로팅 형태로 직접 구현" 하라고 공식 가이드가 말한다. TDS 에 탭바 컴포넌트가 없다.
- **나머지는 우리 디자인이다.** 시안은 배경 `#F7F5F0`, 세이지 `#3F5A40`, 앰버 `#E8CE9C` 로 잡힌 커스텀이다. TDS 컴포넌트를 가져와도 대부분 덮어쓴다.
- 남는 것에 비해 React 를 한 메이저 내리는 비용이 크다.

## 대안

- **React 18 로 내리고 TDS 도입**: 이질감은 줄지만 React 19 기능을 포기하고, 정작 탭바와 네비게이션은 여전히 직접 만들어야 한다.
- **TDS 를 일부만 사용**: peer 충돌은 `--legacy-peer-deps` 로 넘길 수 있지만 런타임 호환을 보장할 수 없다. 미니앱 심사 중에 터지면 손해가 크다.

## 결과

- `shared/ui` 에 우리 컴포넌트를 직접 만든다: Card, SageCard, Button, TransactionRow, Gauge, Chip, BottomSheet, SegmentedControl, TabBar, Toggle.
- 색은 hex 를 화면에 쓰지 않고 `shared/tokens` 의 토큰만 쓴다.
- **나중에 TDS 를 넣으려면 React 를 18 로 내려야 한다.** peer 범위가 React 19 를 포함하도록 갱신되기 전에는 이 비용이 그대로다. 도입을 다시 검토할 때 가장 먼저 확인할 것은 `npm view @toss/tds-mobile peerDependencies` 다.
