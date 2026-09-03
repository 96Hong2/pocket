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
| `INTERNAL_ERROR` | 500 | 서버 오류. 본문 형태는 위와 같다 |

## 엔드포인트

모두 `/api/v1` 아래에 있다.

### 거래

| 메서드 | 경로 | 하는 일 |
| --- | --- | --- |
| POST | `/transactions` | 거래 하나 저장. **응답에 즉시 피드백 판정이 함께 온다** |
| GET | `/transactions` | 목록. `year`·`month` 로 기간 필터, `limit` 기본 50 |
| GET | `/transactions/summary` | 그 달의 지출·수입·차액 |
| DELETE | `/transactions/{id}` | 삭제(표시만 남긴다) |
| POST | `/transactions/{id}/undo` | 방금 저장한 것 되돌리기 |

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
    "remaining_budget": "84000",
    "daily_allowance": "7000",
    "remaining_days": 12,
    "month_expense": "216000"
  },
  "undo_window_seconds": 8,
  "undo_until": "2026-09-03T03:30:08Z"
}
```

`undo_until` 은 서버가 계산한 마감 시각이다. 화면은 이 절대 시각으로 카운트다운한다.
기기 시계가 어긋나도 되돌리기가 억울하게 만료되지 않게 하려는 것이다.
서버 판정에는 왕복 지연을 감안한 여유 3초가 더 붙는다.

**피드백은 문장이 아니라 숫자와 종류만 온다.** 문장 조립은 화면이 한다.
서버가 문장을 만들면 톤을 바꿀 때마다 배포해야 하고, 금지어 검사도 두 곳에서 하게 된다.

`kind` 우선순위: `over_budget`(초과) → `pace_warning`(주의) → `large_expense`(큰 지출) →
`achievement`(성취) → `on_track`(적정). 예산이 없으면 `month_fact`(이번 달 지출 사실만) 다.
한 번에 하나만 온다. 값 목록의 정본은 `docs/openapi.json` 의 `FeedbackKind` enum 이다.

⚠ **아직 배선되지 않은 입력이 둘 있다.** 저장 경로가 `category_median_90d` 와 `achievement` 를
넘기지 않아서, 큰 지출 임계값은 `max(30,000원, 예산의 10%)` 로만 계산되고 `achievement` 는
나오지 않는다. 90일 중앙값 조회와 성취 근거 조회는 다음 slice 몫이다(ADR-0006 이 정본).

## 아직 없는 것

- 예산·리포트·설정·캡처·자산·목표 엔드포인트. 도메인 계산과 데이터 모델은 준비돼 있어 라우터만 붙이면 된다.
  `backend/app/modules/` 아래 각 폴더가 자리만 잡혀 있다.
- 카테고리 조회(`GET /categories`)와 기본 카테고리 시드. 목록 정본은 `app/domain/categories.py` 다.
- `PATCH /transactions/{id}`. `TransactionUpdate` 스키마만 있고 라우트가 없다.
  붙일 때 소유 검사·금액 규칙·시간대 정규화를 `create` 와 공유한다.
- 요청 본문 크기 제한. 이미지 업로드가 들어오는 시점에 프록시나 미들웨어로 건다.
