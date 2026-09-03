# API 계약

정본은 `docs/openapi.json` 이다. 이 문서는 읽기 쉬운 안내다. 둘이 어긋나면 openapi.json 이 맞다.
스펙은 백엔드에서 뽑는다: `ALLOW_UNVERIFIED_ANON_KEY=true uv run python scripts/export_openapi.py`

## 인증

로그인 화면이 없다. 모든 요청에 헤더 하나를 붙인다.

```
X-Anon-Key: <User.getAnonymousKey() 가 돌려준 hash>
```

서버는 이 값을 앱인토스 서버에 검증한 뒤(mTLS), 해시로 사용자를 찾거나 만든다.
가입 절차가 없다. 첫 요청이 곧 가입이다.
서버는 식별키 원문을 저장하지 않고 SHA-256 해시만 남긴다.

헤더가 없으면 `401 UNAUTHORIZED`.

## 오류 형태

성공이 아닌 응답은 항상 이 모양이다.

```json
{ "error": { "code": "UNDO_EXPIRED", "message": "되돌릴 수 있는 시간이 지났어요." } }
```

화면은 `code` 로 분기한다. `message` 는 사람이 읽는 용도다.

**code 값의 정본은 `backend/app/api/errors.py` 의 `ErrorCode` 다.** 그 enum 이 `openapi.json` 의
`ErrorCode` 로 실려서, 생성 타입에서도 값이 문자열로 뭉개지지 않고 분기 근거로 남는다.
모든 라우터가 이 봉투를 `responses` 로 선언한다.

| code | 상태 | 언제 |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | X-Anon-Key 가 없거나 검증에 실패 |
| `VERIFY_UNAVAILABLE` | 503 | 토스 검증 서버가 일시적으로 응답하지 않음. 재시도하면 된다 |
| `NOT_FOUND` | 404 | 남의 거래이거나 이미 지워진 것 |
| `UNDO_EXPIRED` | 409 | 되돌리기 가능 시간이 지남 |
| `CONFLICT` | 409 | 같은 자원을 동시에 만들려다 부딪힘. 다시 부르면 된다 |
| `INVALID_REQUEST` | 422 | 요청 형식 오류 |
| `INVALID_CATEGORY` | 422 | 내 카테고리도 기본 카테고리도 아닌 값 |
| `INVALID_REFUND_TARGET` | 422 | 환불 대상이 내 지출이 아님 |
| `HTTP_ERROR` | 그대로 | 라우팅 단계에서 난 오류(없는 경로, 허용하지 않는 메서드) |
| `INTERNAL_ERROR` | 500 | 서버 오류. 본문 형태는 위와 같다 |

## 엔드포인트

모두 `/api/v1` 아래에 있다.

### 거래

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| POST | `/transactions` | 거래 하나 저장. **응답에 즉시 피드백 판정과 예산 상태가 함께 온다** |
| PATCH | `/transactions/{id}` | 보낸 필드만 수정. 응답 형태는 저장과 같다(되돌리기 값만 없다) |
| GET | `/transactions` | 목록. 아래 「목록 조회」 참고 |
| GET | `/transactions/calendar` | 달력 격자용 날짜별 지출·수입. 기록이 있는 날만 온다 |
| GET | `/transactions/summary` | 그 달의 지출·수입·차액 **+ 예산 상태** |
| DELETE | `/transactions/{id}` | 삭제(표시만 남긴다) |
| POST | `/transactions/{id}/undo` | 방금 저장한 것 되돌리기 |

**금액과 비율은 JSON 에서 문자열로 온다.** 부동소수 오차를 만들지 않으려고 서버가 Decimal 로
다루기 때문이다. 화면은 `Number()` 로 바꿔 쓴다.

- 금액은 원 단위 정수 문자열이다: `"12000"`, `"-3000"`. 소수점이 붙지 않는다.
- 비율(`spend_progress`, `pace_ratio`)은 소수점 넷째 자리까지 고정이다: `"0.0240"`, `"0.0000"`.
  자릿수를 고정하지 않으면 0 나눗셈 결과가 `"0E+1"` 같은 지수 표기로 나가서 값이 깨져 보인다.

### 목록 조회

`GET /transactions` 의 질의 파라미터.

| 이름 | 뜻 |
| --- | --- |
| `year`·`month` | 그 달만. **둘을 함께 보내야 한다.** 한쪽만 보내면 422 다 |
| `day` | `2026-09-10`. 그 날 하루만. 달 필터와 함께 걸린다(AND) |
| `q` | 상호나 카테고리 이름 부분일치. 대소문자를 가리지 않는다. 60자까지 |
| `limit` | 1~200, 기본 50 |
| `cursor` | 앞 응답의 `next_cursor` 를 그대로 넘긴다 |

정렬은 `(occurred_at, id)` 내림차순이다. 시각만으로 정렬하면 같은 시각 거래에서
페이지 경계가 흔들려 행이 빠지거나 겹친다(캡처 일괄 등록이 실제로 같은 시각을 만든다).

`next_cursor` 가 `null` 이면 끝이다. 마지막 페이지에는 커서를 주지 않으므로,
화면이 빈 페이지를 한 번 더 받는 일이 없다.

날짜와 달의 경계는 **사용자 시간대**로 판단한다. 서버가 UTC 로 돌아도 마찬가지다.

### 저장 요청

입력 경로(키패드·줄글·캡처·영수증)가 달라도 서버로 오는 형태는 하나다.

```json
{
  "occurred_at": "2026-09-03T12:30:00+09:00",
  "amount": "12000",
  "type": "expense",
  "merchant": "김밥천국",
  "category_id": null,
  "source": "keypad",
  "confidence": 1.0,
  "excluded_from_budget": false
}
```

- `occurred_at` 은 **시간대를 반드시 붙인다.** 없으면 422 다. 서버가 임의로 해석하면 월 귀속이 어긋난다.
- 월 경계와 '오늘'은 사용자 시간대(`users.timezone`, 기본 `Asia/Seoul`) 기준이다. 저장은 UTC 로 한다.
- `amount` 는 **원 단위 정수**이고 항상 양수다. 소수점은 반올림하지 않고 422 로 거절한다.
  0 은 `source: "no_spend"` 일 때만 받는다. 상한은 14자리다.
- 의미는 `type` 이 정한다: `expense` `income` `transfer` `refund`
- `source`: `keypad` `nl` `screenshot` `receipt` `asset_screenshot` `no_spend`
- `confidence` 는 0~1. 손으로 넣은 값은 1.0
- `category_id` 는 내 카테고리이거나 기본 카테고리(`user_id` 없음)여야 한다. 아니면 422.
- `refund_of_transaction_id` 는 내 지출이어야 한다. 아니면 404·422.

### 저장 응답

```json
{
  "transaction": { "id": "...", "amount": "12000", "type": "expense", ... },
  "feedback": {
    "kind": "on_track",
    "remaining_budget": "488000",
    "daily_allowance": "17428",
    "remaining_days": 28,
    "pace_ratio": "0.2400"
  },
  "budget": {
    "period_start": "2026-09-01", "period_end": "2026-09-30",
    "amount": "500000", "budgeted_spend": "12000",
    "remaining_budget": "488000", "daily_allowance": "17428",
    "total_days": 30, "elapsed_days": 3, "remaining_days": 28,
    "spend_progress": "0.0240", "pace_ratio": "0.2400",
    "projected_month_end": "120000",
    "is_projection_reliable": true, "is_over_budget": false
  },
  "undo_window_seconds": 8,
  "undo_until": "2026-09-03T03:51:21.611884Z"
}
```

### 예산 상태 블록

`budget` 은 홈 히어로가 그대로 쓰는 한 덩어리다. **거래 저장·거래 수정·기간 요약·예산 조회가
전부 같은 모양으로 준다.** 앱을 다시 열거나 되돌리기를 눌러 홈을 다시 그릴 때, 어느 응답에서든
같은 필드로 채울 수 있어야 하기 때문이다.

- `amount` 가 `null` 이면 예산을 정하지 않은 것이다. 그때 `remaining_budget`·`daily_allowance`·
  `spend_progress`·`pace_ratio` 도 전부 `null` 이다. 진행도(`elapsed_days` 등)와
  `projected_month_end` 는 예산이 없어도 나온다.
- **`spend_progress` 가 게이지 비율이다.** 화면이 계산하지 말고 이 값을 쓴다.
  `budget = remaining_budget + month_expense` 로 역산하면 틀린다. `month_expense` 는 예산에서
  뺀 거래(`excluded_from_budget`)를 포함하고 `budgeted_spend` 는 포함하지 않는다.
- `budgeted_spend` 는 예산에 반영되는 지출이다. 환불은 빼고 이체는 아예 세지 않는다.
- **남은 예산(`remaining_budget`)·이번 달 차액(`monthly_delta`)·순자산은 서로 다른 개념이라
  절대 한 필드로 합치지 않는다.**

거래 저장·수정 응답에서 `budget` 이 `null` 인 경우가 하나 있다. 저장은 성공했는데 그 뒤의
판정이 실패해 서버가 흡수했을 때다. 그때 `feedback.kind` 도 `month_fact` 로 떨어지고 숫자가
비어 있다. 화면은 이 조합을 만나면 저장은 됐다고 본다. 빈 `budget` 을 캐시에 덮어쓰지 않고
예산·요약·목록 캐시를 한꺼번에 무효화해, 홈이 보고 있는 값을 서버에서 다시 받는다.

### 되돌리기 카운트다운

**화면은 응답을 받은 시각 + `undo_window_seconds` 로 센다.** 서버는 기기 시계를 보지 않는다.
판정은 서버가 가진 `created_at` 과 서버의 현재 시각만 쓴다. 기기 시계가 어긋나 있어도 화면이
보여 준 시간과 서버 판정이 갈리지 않는다.

`undo_until` 은 서버가 계산한 마감 시각(UTC)이다. 카운트다운의 기준이 아니라, 화면이
백그라운드에 다녀와 남은 시간을 다시 맞출 때 쓰는 보정값이다.

서버 판정에는 왕복 지연을 감안한 여유 3초가 더 붙는다. 화면에 보인 8초 안에 눌렀는데
네트워크 때문에 늦게 도착한 요청이 거절되면 안 되기 때문이다. 실제로 거절이 시작되는 지점은
11.0초다. 이 여유를 화면이 카운트다운에 더해 보여주지는 않는다.

**피드백은 문장이 아니라 숫자와 종류만 온다.** 문장 조립은 화면이 한다.
서버가 문장을 만들면 톤을 바꿀 때마다 배포해야 하고, 금지어 검사도 두 곳에서 하게 된다.

`kind` 우선순위: `over_budget`(초과) → `pace_warning`(주의) → `large_expense`(큰 지출) →
`achievement`(성취) → `on_track`(적정). 예산이 없으면 `month_fact`(이번 달 지출 사실만) 다.
한 번에 하나만 온다. 값 목록의 정본은 `docs/openapi.json` 의 `FeedbackKind` enum 이다.

⚠ **아직 배선되지 않은 입력이 둘 있다.** 저장 경로가 `category_median_90d` 와 `achievement` 를
넘기지 않아서, 큰 지출 임계값은 `max(30,000원, 예산의 10%)` 로만 계산되고 `achievement` 는
나오지 않는다. 90일 중앙값 조회와 성취 근거 조회는 다음 slice 몫이다(ADR-0006 이 정본).

### 카테고리

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/categories` | 기본 카테고리 + 내 카테고리. `sort_order`, `name` 순 |

기본 카테고리 11개는 마이그레이션이 심는다(`user_id` 가 NULL 이라 모든 사용자에게 보인다).
목록 정본은 `app/domain/categories.py` 다. 응답의 `icon_key` 가
`frontend/public/icons/sm/<icon_key>.png` 와 1:1 이고, `is_default` 는 `user_id` 가 없다는 뜻이다.

### 예산

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| GET | `/budgets?year=&month=` | 그 달의 예산 상태. 기본은 사용자 시간대 이번 달 |
| PUT | `/budgets?year=&month=` | 예산 저장. 바디는 `{"amount": "600000"}` |

- **예산을 정하지 않은 것은 정상 상태다.** 조회는 200 이고 `budget.amount` 가 `null` 이다.
  404 가 아니다.
- **PUT 은 멱등이다.** 같은 기간에 몇 번을 보내도 409 가 나지 않는다. `(user_id, period_start)`
  가 unique 이고 소프트 삭제한 행도 그 자리를 지키므로, 새로 만들지 않고 있던 행을 덮어쓴다.
  지웠던 기간을 다시 정하면 그 행을 되살린다(ADR-0008).
- 금액은 원 단위 정수이고 **1원 이상**이다. 0원은 받지 않는다. '예산 없음'과 구분되지 않는데다
  게이지 비율의 분모가 0 이 되어 화면이 그릴 수 없다.

두 엔드포인트의 응답은 같은 모양이다.

```json
{
  "budget": { "amount": "500000", "spend_progress": "0.0240", ... },
  "month_expense": "12000",
  "month_income": "0",
  "monthly_delta": "-12000",
  "has_any_transaction": true,
  "days_since_last_transaction": 0
}
```

`has_any_transaction` 과 `days_since_last_transaction` 은 홈이 첫 사용·기본·복귀 중 어느
화면을 그릴지 고르는 근거다. 둘 다 사용자 시간대 기준이고, 오늘 기록했으면 0 이다.
기록이 하나도 없으면 `has_any_transaction` 이 false 이고 날짜는 `null` 이다.
되돌리기로 지운 기록은 세지 않는다.

## 아직 없는 것

- 리포트·설정·캡처·자산·목표 엔드포인트. 도메인 계산과 데이터 모델은 준비돼 있어 라우터만 붙이면 된다.
  `backend/app/modules/` 아래 각 폴더가 자리만 잡혀 있다.
- 카테고리 생성·수정·삭제. 지금은 조회만 있다.
- 카테고리별 예산(`category_budgets`)과 예산 자동 이어쓰기. 도메인(`domain/carryover.py`)은
  있지만 아직 아무도 부르지 않는다.
- 예산 삭제. 지금은 `PUT` 으로 금액을 바꾸는 것만 된다.
- 요청 본문 크기 제한. 이미지 업로드가 들어오는 시점에 프록시나 미들웨어로 건다.
