"""예산 조회·저장·삭제와, 홈이 되돌리기 뒤에 숫자를 되돌릴 수 있는지.

예산이 없는 것은 정상 상태다. 여기 있는 것은 전부 화면이 막히는 자리다.

기간을 실제 오늘에서 만든다. 예산 쓰기는 끝나지 않은 기간에만 되므로 달을 고정해 적으면
그 달이 지나는 순간 전부 422 가 되어, 코드가 아니라 달력 때문에 빨개진다.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.period import BudgetPeriod
from app.models import Budget, Category, CategoryBudget, CategoryKind, User
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}

TODAY = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()
PERIOD = f"year={TODAY.year}&month={TODAY.month}"
LAST_MONTH = BudgetPeriod.containing(TODAY).previous_period()
# 이미 끝난 달. 어느 시점에 돌려도 과거다.
CLOSED_PERIOD = "year=2020&month=1"


def _expense(amount: str = "12000", **over: object) -> dict:
    body: dict = {
        "occurred_at": f"{TODAY.isoformat()}T12:30:00+09:00",
        "amount": amount,
        "type": "expense",
        "merchant": "테스트 식당",
        "source": "keypad",
    }
    body.update(over)
    return body


def _category(db: Session, name: str) -> Category:
    row = db.scalar(select(Category).where(Category.name == name))
    assert row is not None
    return row


def _budget_row(db: Session) -> Budget:
    user = db.scalar(select(User))
    assert user is not None
    row = db.scalar(select(Budget).where(Budget.user_id == user.id))
    assert row is not None
    return row


def _seed_last_month(client: TestClient, db: Session, amount: str = "600000") -> None:
    """지난달 예산을 직접 심는다. 지난 기간은 API 로 저장할 수 없다.

    이걸 심어 두면 이번 달 첫 요청이 자동 이어쓰기로 예산을 만든다.
    첫 요청이 곧 가입이라 사용자를 먼저 만들어 둔다.
    """
    client.get("/api/v1/categories", headers=AUTH)
    user = db.scalar(select(User))
    assert user is not None
    db.add(
        Budget(
            user_id=user.id,
            period_start=LAST_MONTH.start,
            period_end=LAST_MONTH.end,
            amount=Decimal(amount),
        )
    )
    db.commit()


# ── 조회 ────────────────────────────────────────────────


def test_예산이_없어도_200_이고_금액이_null_이다(client: TestClient) -> None:
    """예산을 정하지 않은 사용자가 홈을 여는 첫 화면이다. 404 로 만들면 안 된다."""
    r = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["budget"]["amount"] is None
    assert body["budget"]["remaining_budget"] is None
    assert body["budget"]["spend_progress"] is None
    assert body["budget"]["budgeted_spend"] == "0"
    assert body["category_budgets"] == []
    assert body["has_any_transaction"] is False
    assert body["days_since_last_transaction"] is None


def test_기록하면_홈이_고를_근거가_바뀐다(client: TestClient) -> None:
    client.post("/api/v1/transactions", json=_expense(), headers=AUTH)
    body = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()
    assert body["has_any_transaction"] is True
    assert body["days_since_last_transaction"] is not None


def test_최근_7일_정리_진행이_늘_실린다(client: TestClient) -> None:
    """복구 카드는 빠진 날이 아니라 정리한 날을 센다. 기록이 없어도 필드는 온다."""
    body = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()
    assert body["recovery"] == {"window_days": 7, "recorded_days": 0, "progress": "0.0000"}

    client.post("/api/v1/transactions", json=_expense(), headers=AUTH)
    client.post("/api/v1/transactions", json=_expense(amount="3000"), headers=AUTH)
    body = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()
    assert body["recovery"]["recorded_days"] == 1
    assert body["recovery"]["progress"] == "0.1429"


# ── 저장 ────────────────────────────────────────────────


def test_같은_기간에_두_번_저장해도_409_가_아니다(client: TestClient) -> None:
    """PUT 은 멱등이다. unique 자리를 이미 쓴 행이 지키고 있어도 덮어써야 한다."""
    first = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    second = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "800000"}, headers=AUTH)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["budget"]["amount"] == "800000"


def test_지운_예산을_다시_정할_수_있다(client: TestClient, db: Session) -> None:
    """소프트 삭제한 행이 unique 자리를 지킨다. 되살리지 않으면 영구히 막힌다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    row = _budget_row(db)
    row.deleted_at = datetime.now(UTC)
    db.commit()

    assert client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]["amount"] is None

    again = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "500000"}, headers=AUTH)
    assert again.status_code == 200, again.text
    assert again.json()["budget"]["amount"] == "500000"


def test_예산_0원은_받지_않는다(client: TestClient) -> None:
    """'예산 없음'과 구분되지 않고 게이지 비율의 분모가 0 이 된다."""
    r = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "0"}, headers=AUTH)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_소수점_예산은_반올림하지_않고_거부한다(client: TestClient) -> None:
    r = client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "1000.5"}, headers=AUTH)
    assert r.status_code == 422


# ── 화면이 홈을 다시 그릴 수 있나 ───────────────────────


def test_저장_응답의_예산_블록이_직후_조회와_같다(client: TestClient) -> None:
    """저장 응답만 보고 홈을 갱신한다. 두 값이 어긋나면 화면이 잠깐 거짓말을 한다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    created = client.post("/api/v1/transactions", json=_expense(), headers=AUTH).json()

    fetched = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert created["budget"] == fetched
    assert created["budget"]["remaining_budget"] == "588000"
    # 12,000 / 600,000. 화면 게이지가 이 값을 그대로 쓴다.
    assert created["budget"]["spend_progress"] == "0.0200"


def test_요약에도_같은_예산_블록이_실린다(client: TestClient) -> None:
    """앱을 다시 열면 저장 응답이 없다. 요약으로 홈을 채울 수 있어야 한다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.post("/api/v1/transactions", json=_expense(), headers=AUTH)

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert summary["budget"] == budget
    # 남은 예산과 이번 달 차액은 다른 개념이라 따로 온다.
    assert summary["monthly_delta"] == "-12000"
    assert summary["budget"]["remaining_budget"] == "588000"


def test_요약의_이어쓰기_표시와_기간_잠금이_예산_조회와_같다(
    client: TestClient, db: Session
) -> None:
    """앱을 다시 열면 홈은 요약만 보고 배너와 편집 가능 여부를 정한다.

    같은 예산 블록인데 요약에서만 값이 어긋나면, 홈은 배너를 안 띄우거나 끝난 달에
    입력 버튼을 그린다. 나머지 필드가 같은지는 위 테스트가 이미 본다.
    """
    _seed_last_month(client, db, "600000")

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()["budget"]
    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert summary == budget
    # 지난달에서 이어써서 만들어진 예산이다. 배너의 근거가 참이고, 이번 달이라 고칠 수 있다.
    assert summary["is_auto_carried"] is True
    assert summary["is_editable"] is True

    closed = client.get(f"/api/v1/transactions/summary?{CLOSED_PERIOD}", headers=AUTH).json()[
        "budget"
    ]
    # 끝난 달에는 이어쓰기가 일어나지 않고 고칠 수도 없다.
    assert closed["is_auto_carried"] is False
    assert closed["is_editable"] is False


def test_되돌리면_숫자가_원래대로_돌아온다(client: TestClient) -> None:
    """되돌리기 응답에는 본문이 없다. 화면은 요약을 다시 불러 홈을 그린다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    created = client.post("/api/v1/transactions", json=_expense(), headers=AUTH).json()

    undone = client.post(f"/api/v1/transactions/{created['transaction']['id']}/undo", headers=AUTH)
    assert undone.status_code == 204

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    assert summary["budget"]["remaining_budget"] == "600000"
    assert summary["budget"]["budgeted_spend"] == "0"
    assert summary["month_expense"] == "0"


def test_예산_제외_거래는_게이지를_움직이지_않는다(client: TestClient) -> None:
    """month_expense 와 budgeted_spend 가 갈리는 자리다. 화면이 역산할 수 없는 이유이기도 하다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.post(
        "/api/v1/transactions", json=_expense("50000", excluded_from_budget=True), headers=AUTH
    )

    summary = client.get(f"/api/v1/transactions/summary?{PERIOD}", headers=AUTH).json()
    assert summary["month_expense"] == "50000"
    assert summary["budget"]["budgeted_spend"] == "0"
    assert summary["budget"]["remaining_budget"] == "600000"


def test_비율은_지수_표기로_나가지_않는다(client: TestClient) -> None:
    """0 나눗셈 결과가 '0E+1' 로 나가면 openapi 가 Decimal 에 붙인 pattern 과 어긋난다."""
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    budget = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    assert budget["spend_progress"] == "0.0000"
    assert budget["pace_ratio"] == "0.0000"


# ── 끝난 기간 ───────────────────────────────────────────


def test_지난_기간에는_예산을_저장하지도_지우지도_못한다(client: TestClient) -> None:
    """화면에서만 막으면 API 로 보낸 요청이 지난달 숫자를 조용히 바꾼다.

    저장만 막아도 부족하다. 지우기로 우회해 지난달 게이지를 통째로 없앨 수 있다.
    """
    saved = client.put(f"/api/v1/budgets?{CLOSED_PERIOD}", json={"amount": "600000"}, headers=AUTH)
    deleted = client.request("DELETE", f"/api/v1/budgets?{CLOSED_PERIOD}", headers=AUTH)
    assert saved.status_code == 422, saved.text
    assert saved.json()["error"]["code"] == "PERIOD_CLOSED"
    assert deleted.status_code == 422, deleted.text
    assert deleted.json()["error"]["code"] == "PERIOD_CLOSED"


def test_지난_기간에는_카테고리_예산도_바꿀_수_없다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """전체 예산만 잠그면 카테고리 한도로 지난달 초과 판정을 바꿀 수 있다."""
    food = _category(db, "식비")
    put = client.put(
        f"/api/v1/budgets/categories/{food.id}?{CLOSED_PERIOD}",
        json={"amount": "300000"},
        headers=AUTH,
    )
    delete = client.request(
        "DELETE", f"/api/v1/budgets/categories/{food.id}?{CLOSED_PERIOD}", headers=AUTH
    )
    assert put.status_code == 422, put.text
    assert put.json()["error"]["code"] == "PERIOD_CLOSED"
    assert delete.status_code == 422, delete.text


def test_고칠_수_있는지는_예산이_없어도_기간이_정한다(client: TestClient) -> None:
    """예산이 없는 지난달에도 화면은 '보기만 할 수 있어요' 를 그려야 한다."""
    now = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]
    closed = client.get(f"/api/v1/budgets?{CLOSED_PERIOD}", headers=AUTH).json()["budget"]
    assert now["amount"] is None
    assert now["is_editable"] is True
    assert closed["is_editable"] is False


# ── 삭제 ────────────────────────────────────────────────


def test_예산을_지우면_카테고리_한도까지_사라지고_두_번_눌러도_204(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """카테고리 행이 남아 있으면 예산을 다시 정할 때 지운 한도가 되살아난다.

    지우기는 멱등이다. 예산이 없는 기간에 한 번 더 눌러도 오류가 아니다.
    """
    food = _category(db, "식비")
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.put(
        f"/api/v1/budgets/categories/{food.id}?{PERIOD}", json={"amount": "300000"}, headers=AUTH
    )

    first = client.request("DELETE", f"/api/v1/budgets?{PERIOD}", headers=AUTH)
    second = client.request("DELETE", f"/api/v1/budgets?{PERIOD}", headers=AUTH)
    assert first.status_code == 204, first.text
    assert second.status_code == 204, second.text
    assert client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["budget"]["amount"] is None

    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "500000"}, headers=AUTH)
    body = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()
    assert body["budget"]["amount"] == "500000"
    assert body["category_budgets"] == []


# ── 카테고리 예산 ───────────────────────────────────────


def test_전체_예산_없이는_카테고리_예산을_정할_수_없다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """카테고리 한도는 전체 예산에 딸린다. 붙일 곳이 없으면 저장할 수 없다."""
    food = _category(db, "식비")
    r = client.put(
        f"/api/v1/budgets/categories/{food.id}?{PERIOD}", json={"amount": "300000"}, headers=AUTH
    )
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "INVALID_REQUEST"


def test_카테고리_예산을_두_번_정해도_409_가_아니다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """행이 unique 자리를 지키고 있다. 덮어쓰지 않으면 한도를 고칠 수 없다."""
    food = _category(db, "식비")
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    url = f"/api/v1/budgets/categories/{food.id}?{PERIOD}"

    first = client.put(url, json={"amount": "300000"}, headers=AUTH)
    second = client.put(url, json={"amount": "200000"}, headers=AUTH)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    rows = second.json()["category_budgets"]
    # 정한 카테고리만 온다. 전체를 0원으로 채워 보내면 정한 것과 안 정한 것을 구분할 수 없다.
    assert [(row["category_id"], row["amount"]) for row in rows] == [(str(food.id), "200000")]
    # 응답이 조회와 같은 모양이라 화면이 그대로 캐시에 넣는다.
    assert second.json()["budget"]["amount"] == "600000"


def test_남의_카테고리나_없는_카테고리에는_한도를_걸_수도_지울_수도_없다(
    client: TestClient, db: Session
) -> None:
    """소유 판정이 없으면 남의 분류에 내 한도가 붙고, 없는 id 는 외래키 위반으로 500 이 된다.

    삭제도 같은 규칙을 지나야 한다. 한쪽만 검사하면 같은 자원에 규칙이 둘이 되어,
    저장은 거절당한 id 로 삭제를 보내면 204 라 성공한 것처럼 보인다.
    """
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    stranger = User(anon_key_hash="다른-사람")
    db.add(stranger)
    db.flush()
    theirs = Category(
        user_id=stranger.id, name="남의 분류", kind=CategoryKind.EXPENSE, icon_key="26_sparkles"
    )
    db.add(theirs)
    db.commit()

    others = client.put(
        f"/api/v1/budgets/categories/{theirs.id}?{PERIOD}",
        json={"amount": "100000"},
        headers=AUTH,
    )
    missing = client.put(
        f"/api/v1/budgets/categories/00000000-0000-0000-0000-000000000000?{PERIOD}",
        json={"amount": "100000"},
        headers=AUTH,
    )
    others_delete = client.request(
        "DELETE", f"/api/v1/budgets/categories/{theirs.id}?{PERIOD}", headers=AUTH
    )
    missing_delete = client.request(
        "DELETE",
        f"/api/v1/budgets/categories/00000000-0000-0000-0000-000000000000?{PERIOD}",
        headers=AUTH,
    )
    assert others.status_code == 422, others.text
    assert others.json()["error"]["code"] == "INVALID_CATEGORY"
    assert missing.status_code == 422, missing.text
    assert missing.json()["error"]["code"] == "INVALID_CATEGORY"
    assert others_delete.status_code == 422, others_delete.text
    assert others_delete.json()["error"]["code"] == "INVALID_CATEGORY"
    assert missing_delete.status_code == 422, missing_delete.text
    assert missing_delete.json()["error"]["code"] == "INVALID_CATEGORY"


def test_카테고리_예산_사용액은_환불과_이체와_예산제외를_뺀다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """전체 게이지와 같은 규칙이어야 한다. 한 줄만 다르게 세면 초과 안내가 어긋난다."""
    food = _category(db, "식비")
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.put(
        f"/api/v1/budgets/categories/{food.id}?{PERIOD}", json={"amount": "300000"}, headers=AUTH
    )

    spent = client.post(
        "/api/v1/transactions", json=_expense("50000", category_id=str(food.id)), headers=AUTH
    ).json()
    client.post(
        "/api/v1/transactions",
        json=_expense(
            "20000",
            type="refund",
            refund_of_transaction_id=spent["transaction"]["id"],
        ),
        headers=AUTH,
    )
    client.post(
        "/api/v1/transactions",
        json=_expense("10000", type="transfer", category_id=str(food.id)),
        headers=AUTH,
    )
    client.post(
        "/api/v1/transactions",
        json=_expense("40000", category_id=str(food.id), excluded_from_budget=True),
        headers=AUTH,
    )

    row = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["category_budgets"][0]
    assert row["budgeted_spend"] == "30000"
    assert row["remaining"] == "270000"
    assert row["spend_progress"] == "0.1000"
    assert row["is_over_budget"] is False


def test_카테고리_예산을_넘기면_남은_금액이_음수로_온다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """0 으로 붙이면 화면이 얼마나 넘겼는지 말할 수 없다."""
    food = _category(db, "식비")
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    client.put(
        f"/api/v1/budgets/categories/{food.id}?{PERIOD}", json={"amount": "30000"}, headers=AUTH
    )
    client.post(
        "/api/v1/transactions", json=_expense("50000", category_id=str(food.id)), headers=AUTH
    )

    row = client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["category_budgets"][0]
    assert row["remaining"] == "-20000"
    assert row["is_over_budget"] is True


def test_카테고리_예산을_지우면_목록에서_빠지고_다시_정할_수_있다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """소프트 삭제한 행이 unique 자리를 지킨다. 되살리지 않으면 영구히 막힌다."""
    food = _category(db, "식비")
    client.put(f"/api/v1/budgets?{PERIOD}", json={"amount": "600000"}, headers=AUTH)
    url = f"/api/v1/budgets/categories/{food.id}?{PERIOD}"
    client.put(url, json={"amount": "300000"}, headers=AUTH)

    first = client.request("DELETE", url, headers=AUTH)
    second = client.request("DELETE", url, headers=AUTH)
    assert first.status_code == 204, first.text
    assert second.status_code == 204, second.text
    assert client.get(f"/api/v1/budgets?{PERIOD}", headers=AUTH).json()["category_budgets"] == []

    again = client.put(url, json={"amount": "150000"}, headers=AUTH)
    assert again.status_code == 200, again.text
    assert again.json()["category_budgets"][0]["amount"] == "150000"
    assert len(db.scalars(select(CategoryBudget)).all()) == 1
