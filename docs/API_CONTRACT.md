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
| `INVALID_REQUEST` | 422 | 요청 형식 오류 |

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

- `amount` 는 **항상 양수**다. 의미는 `type` 이 정한다: `expense` `income` `transfer` `refund`
- `source`: `keypad` `nl` `screenshot` `receipt` `asset_screenshot` `no_spend`
- `confidence` 는 0~1. 손으로 넣은 값은 1.0

### 저장 응답

```json
{
  "transaction": { "id": "...", "amount": "12000", "type": "expense", ... },
  "feedback": {
    "kind": "adequate",
    "remaining_budget": "84000",
    "daily_allowance": "7000",
    "remaining_days": 12,
    "month_expense": "216000"
  },
  "undo_window_seconds": 8
}
```

**피드백은 문장이 아니라 숫자와 종류만 온다.** 문장 조립은 화면이 한다.
서버가 문장을 만들면 톤을 바꿀 때마다 배포해야 하고, 금지어 검사도 두 곳에서 하게 된다.

`kind` 우선순위: `over`(초과) → `caution`(주의) → `large_expense`(큰 지출) → `achievement`(성취) → `adequate`(적정).
한 번에 하나만 온다. 예산이 없으면 `remaining_budget` 등이 `null` 이고, 화면은 이번 달 지출만 보여준다.

## 아직 없는 것

예산·리포트·설정·캡처·자산·목표 엔드포인트는 아직 없다.
도메인 계산과 데이터 모델은 준비돼 있어서 라우터만 붙이면 된다.
`backend/app/modules/` 아래 각 폴더가 자리만 잡혀 있다.
