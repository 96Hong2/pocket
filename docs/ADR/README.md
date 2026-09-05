# Architecture Decision Records

되돌리기 어려운 결정과 그 이유를 남긴다. 나중에 "왜 이렇게 했지"를 다시 논쟁하지 않으려고 쓴다.

| 번호 | 결정 | 상태 |
|---|---|---|
| [0001](0001-vite-webview-base.md) | Apps in Toss WebView + 기존 Vite/React 프로젝트를 기반으로 한다 | 확정 |
| [0002](0002-no-tds-in-mvp.md) | TDS 를 MVP 에 도입하지 않는다 | 확정 |
| [0003](0003-anonymous-key-identity.md) | 익명 식별키로 사용자를 구분하고 로그인 화면을 만들지 않는다 | 확정 (서버 검증은 보류) |
| [0004](0004-no-ad-hide-button.md) | 광고 배너에 X(숨기기) 버튼을 넣지 않는다 | 확정 |
| [0005](0005-transfer-refund-aggregation.md) | transfer 는 집계에서 빼고 refund 는 지출을 차감한다 | 확정 (PRD 미정 → 우리 결정) |
| [0006](0006-immediate-feedback-thresholds.md) | Immediate Feedback 임계값 | 확정 (PRD 미정 → 우리 결정, 데이터 쌓이면 재조정) |
| [0007](0007-remaining-days-include-today.md) | 남은 일수에 오늘을 포함한다 | 확정 (PRD 미정 → 우리 결정) |
| [0008](0008-idempotent-seed-and-budget-upsert.md) | 이미 자리를 차지한 행을 만나면 덮어쓴다 (카테고리 시드 · 예산 저장) | 확정 (PRD 미정 → 우리 결정) |
| [0009](0009-refund-inherits-target.md) | 환불은 되돌리는 지출의 성격을 물려받고 그 금액을 넘지 못한다 | 확정 (PRD 미정 → 우리 결정, 0005 보완) |
| [0010](0010-capture-image-lifetime.md) | 캡처 이미지는 요청이 끝나면 사라지고, 한 번에 한 장만 받는다 | 확정 (PRD 미정 → 우리 결정) |

새 ADR 은 다음 번호를 붙이고 `배경 / 결정 / 근거 / 대안 / 결과` 순서로 짧게 쓴다.
PRD 가 정하지 않아 우리가 정한 것은 그 사실을 반드시 적는다.
