"""월 리포트: 한 응답이 그 화면을 다 채운다.

화면으로 볼 수 있는 것은 e2e 가 본다. 여기서 지키는 것은 화면에 안 보이는 자리다.
비교 창이 정말 「같은 날짜까지」인지, 추이가 빈 달을 빼먹지 않는지, 조각 합이 그 달 지출과
갈라지는 경우가 응답에 남는지가 그렇다.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.domain.period import BudgetPeriod
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)

TODAY = datetime.now(TZ).date()
THIS_MONTH = BudgetPeriod.containing(TODAY)
LAST_MONTH = THIS_MONTH.previous_period()


def _on(day: date) -> str:
    """그 날 정오. 주 경계를 재는 검사가 쓴다."""
    return datetime.combine(day, time(hour=12), tzinfo=TZ).isoformat()


def _at(day_of_month: int, period: BudgetPeriod) -> str:
    """그 달 며칟날 정오. 정오라야 시간대가 바뀌어도 귀속 달이 안 흔들린다."""
    return datetime.combine(_day_in(period, day_of_month), time(hour=12), tzinfo=TZ).isoformat()


def _day_in(period: BudgetPeriod, day_of_month: int) -> date:
    """그 달에 없는 날짜(2월 31일)는 말일로 붙인다. `same_day_window` 와 같은 규칙이다."""
    return period.start.replace(day=min(day_of_month, period.total_days))


def _add(
    client: TestClient,
    *,
    amount: str,
    when: str,
    kind: str = "expense",
    merchant: str | None = None,
    category_id: str | None = None,
) -> None:
    body: dict[str, object] = {
        "occurred_at": when,
        "amount": amount,
        "type": kind,
        "source": "keypad",
        "confidence": 1,
        "excluded_from_budget": False,
    }
    if merchant:
        body["merchant"] = merchant
    if category_id:
        body["category_id"] = category_id
    response = client.post("/api/v1/transactions", json=body, headers=AUTH)
    assert response.status_code == 201, response.text


def _report(client: TestClient, period: BudgetPeriod | None = None) -> dict:
    query = f"?year={period.start.year}&month={period.start.month}" if period else ""
    response = client.get(f"/api/v1/reports/monthly{query}", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


def _category(client: TestClient, name: str) -> str:
    body = client.get("/api/v1/categories", headers=AUTH).json()
    return next(item["id"] for item in body["items"] if item["name"] == name)


def test_지난달_비교는_같은_날짜까지만_센다(client: TestClient, default_categories) -> None:
    # 지난달 1일과 말일에 하나씩. 오늘이 며칟날이든 1일 것만 창에 들어와야 한다.
    _add(client, amount="10000", when=_at(1, LAST_MONTH))
    _add(client, amount="900000", when=_at(LAST_MONTH.total_days, LAST_MONTH))

    body = _report(client)
    comparison = body["comparison"]

    # 창의 끝 날짜를 응답이 실어 준다. 숫자만 보면 달 전체를 세도 그럴듯해 보인다.
    # 오늘이 31일이고 지난달이 30일까지면 말일로 붙는다. 그 규칙까지 여기서 지킨다.
    assert comparison["previous_start"] == LAST_MONTH.start.isoformat()
    assert comparison["previous_end"] == _day_in(LAST_MONTH, TODAY.day).isoformat()
    assert comparison["current_end"] == TODAY.isoformat()

    # 말일 90만 원이 새어 들어오면 이 단언이 깨진다.
    if TODAY.day < LAST_MONTH.total_days:
        assert comparison["previous_expense"] == "10000"


def test_추이는_기록이_없는_달도_0_으로_여섯_개를_준다(
    client: TestClient, default_categories
) -> None:
    _add(client, amount="5000", when=_at(10, THIS_MONTH))

    body = _report(client)
    trend = body["trend"]

    # 빈 달을 빼면 막대가 밀려 다른 달로 읽힌다.
    assert len(trend) == 6
    starts = [point["period_start"] for point in trend]
    assert starts == sorted(starts), "오래된 것부터여야 한다"
    assert trend[-1]["period_start"] == THIS_MONTH.start.isoformat()
    assert trend[-1]["expense"] == "5000"
    assert all(point["expense"] == "0" for point in trend[:-1])


def test_환불이_지출보다_큰_분류는_조각에서_빠지고_두_합계가_갈린다(
    client: TestClient, default_categories
) -> None:
    food = _category(client, "식비")
    cafe = _category(client, "카페·간식")
    _add(client, amount="10000", when=_at(3, THIS_MONTH), category_id=food)
    _add(client, amount="1000", when=_at(4, THIS_MONTH), category_id=cafe)
    _add(client, amount="5000", when=_at(5, THIS_MONTH), category_id=cafe, kind="refund")

    body = _report(client)

    # 음수 호는 그릴 수 없어 카페 줄이 빠진다.
    assert [row["category_id"] for row in body["expense_breakdown"]] == [food]
    assert body["expense_breakdown_total"] == "10000"
    # 그런데 실제로 쓴 돈은 6,000 원이다. 두 값을 함께 줘야 화면이 갈라 적을 수 있다.
    assert body["month_expense"] == "6000"


def test_기록이_없는_달도_추이는_그대로_준다(client: TestClient, default_categories) -> None:
    # 대조군: 기록이 있는 달은 참이어야 한다. 늘 거짓이면 빈 달 안내가 모든 달에 뜬다.
    _add(client, amount="1000", when=_at(1, THIS_MONTH))
    assert _report(client)["has_any_transaction"] is True

    body = _report(client, LAST_MONTH)

    assert body["has_any_transaction"] is False
    assert body["expense_breakdown"] == []
    assert len(body["trend"]) == 6


def test_수입도_분류별로_나뉜다(client: TestClient, default_categories) -> None:
    _add(client, amount="2000000", when=_at(25, THIS_MONTH), merchant="월급", kind="income")

    body = _report(client)

    assert body["month_income"] == "2000000"
    assert len(body["income_breakdown"]) == 1
    assert body["income_breakdown_total"] == "2000000"
    # 수입은 지출 조각에 섞이지 않는다.
    assert body["expense_breakdown"] == []


def test_주간_비교는_같은_요일까지만_센다(client: TestClient, default_categories) -> None:
    monday = TODAY - timedelta(days=TODAY.weekday())
    # 지난주 월요일과 지난주 일요일. 일요일 것은 오늘이 일요일일 때만 창에 들어온다.
    _add(client, amount="7000", when=_on(monday - timedelta(days=7)))
    _add(client, amount="800000", when=_on(monday - timedelta(days=1)))

    weeks = _report(client)["weeks"]

    # 이번 주는 오늘까지밖에 안 지났다. 지난주를 이레 통째로 잡으면 늘 줄어든 것처럼 보인다.
    assert weeks["current_start"] == monday.isoformat()
    assert weeks["current_end"] == TODAY.isoformat()
    assert weeks["previous_start"] == (monday - timedelta(days=7)).isoformat()
    assert weeks["previous_end"] == (TODAY - timedelta(days=7)).isoformat()

    if TODAY.weekday() < 6:
        # 지난주 일요일 80만 원은 창 밖이다. 이레를 통째로 세면 여기서 걸린다.
        assert weeks["previous_expense"] == "7000"


def test_이번_주에_쓴_것이_주간_비교에_잡힌다(client: TestClient, default_categories) -> None:
    monday = TODAY - timedelta(days=TODAY.weekday())
    _add(client, amount="3000", when=_on(monday))

    weeks = _report(client)["weeks"]

    assert weeks["current_expense"] == "3000"


def test_지난_달을_보면_주간_비교를_주지_않는다(client: TestClient, default_categories) -> None:
    body = _report(client, LAST_MONTH)

    # "이번 주" 는 지난달 화면과 상관없다. 0 으로 채워 보내면 사용자가 그 달 것으로 읽는다.
    assert body["weeks"] is None
    # 끝난 달끼리는 통째로 견준다. 자를 이유가 없다.
    assert body["comparison"]["previous_end"] == LAST_MONTH.previous_period().end.isoformat()
