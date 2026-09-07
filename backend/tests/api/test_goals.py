"""목표 API 가 계산값을 서버에서 내고, 진행 중인 목표를 하나로 지키는지.

화면은 이 응답을 그대로 그린다. `목표 - 모은 돈` 을 화면이 다시 계산하면 기여를 하나
지운 직후에 게이지와 남은 금액이 서로 다른 말을 한다. 그래서 그 숫자가 전부 여기서
나오는지를 본다.

'오늘' 이 걸린 값(남은 달 수·필요 월저축액·도달 예상)은 `ledger.today_for` 를 묶어 둔
다음에 본다. 묶지 않으면 달이 바뀌는 순간 기대값이 흔들린다.
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
GOALS = "/api/v1/goals"

TODAY = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()

# 계산이 걸린 검사에서 쓰는 고정된 오늘. 이 날 기준으로 12월 31일까지는 4달이다.
PINNED = date(2026, 9, 3)


@pytest.fixture
def pinned_today(monkeypatch: pytest.MonkeyPatch) -> date:
    monkeypatch.setattr(ledger, "today_for", lambda user: PINNED)
    return PINNED


def _create(client: TestClient, **body: object) -> dict:
    payload = {"title": "제주도 여행", "target_amount": "5000000"} | body
    res = client.post(GOALS, json=payload, headers=AUTH)
    assert res.status_code == 201, res.text
    return res.json()["goal"]


def _show(client: TestClient) -> dict | None:
    res = client.get(GOALS, headers=AUTH)
    assert res.status_code == 200, res.text
    goal = res.json()["goal"]
    return goal if goal is None else dict(goal)


def test_목표가_없으면_200_에_goal_null_이다(client: TestClient) -> None:
    """정하지 않은 것은 정상이다. 404 로 답하면 화면이 오류 자리를 그린다."""
    assert _show(client) is None


def test_남은_금액과_진행률과_필요_월저축액을_서버가_낸다(
    client: TestClient, pinned_today: date
) -> None:
    goal = _create(
        client,
        target_date="2026-12-31",
        initial_amount="1200000",
    )

    assert goal["current_amount"] == "1200000"
    assert goal["remaining"] == "3800000"
    # 1,200,000 / 5,000,000 = 0.24
    assert goal["progress"] == "0.2400"
    # 9월을 포함해 12월까지 넉 달. 3,800,000 을 넷으로 나누면 950,000 이다(모자라지 않게 올림).
    assert goal["months_left"] == 4
    assert goal["required_monthly_saving"] == "950000"
    assert goal["is_achieved"] is False
    assert goal["is_overdue"] is False
    # 기여가 없으면 페이스도 도달 예상도 만들어내지 않는다.
    assert goal["monthly_pace"] is None
    assert goal["eta_months"] is None
    assert goal["contributions"] == []


def test_기한이_없으면_남은_달도_필요_월저축액도_내지_않는다(
    client: TestClient, pinned_today: date
) -> None:
    """기한은 선택이다. 없는 값을 0 으로 적으면 화면이 '매달 0원' 이라고 말한다."""
    goal = _create(client)

    assert goal["target_date"] is None
    assert goal["months_left"] is None
    assert goal["required_monthly_saving"] is None


def test_진행_중인_목표가_있으면_또_만들지_못한다(client: TestClient) -> None:
    _create(client)

    res = client.post(GOALS, json={"title": "노트북", "target_amount": "2000000"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "GOAL_ALREADY_ACTIVE"


def test_기여를_더하면_모은_돈과_도달_예상이_함께_바뀐다(
    client: TestClient, pinned_today: date
) -> None:
    """지금 페이스는 `기여 합 ÷ 첫 기여 달부터 이번 달까지의 달 수` 다.

    7월·9월에 300,000 씩 넣었으니 걸친 달은 7·8·9 세 달이고 페이스는 200,000 이다.
    남은 4,400,000 을 그 페이스로 채우려면 22 달이다.
    """
    goal = _create(client)

    for day in ("2026-07-10", "2026-09-01"):
        res = client.post(
            f"{GOALS}/{goal['id']}/contributions",
            json={"amount": "300000", "occurred_on": day},
            headers=AUTH,
        )
        assert res.status_code == 201, res.text

    latest = res.json()["goal"]
    assert latest["current_amount"] == "600000"
    assert latest["remaining"] == "4400000"
    assert latest["monthly_pace"] == "200000"
    assert latest["eta_months"] == 22
    # 최근 것이 앞이다. 순서를 못 박지 않으면 화면이 지우려던 줄이 다른 줄로 바뀐다.
    assert [row["occurred_on"] for row in latest["contributions"]] == [
        "2026-09-01",
        "2026-07-10",
    ]


def test_날짜를_안_주면_오늘로_남는다(client: TestClient) -> None:
    goal = _create(client)

    res = client.post(f"{GOALS}/{goal['id']}/contributions", json={"amount": "10000"}, headers=AUTH)

    assert res.status_code == 201, res.text
    assert res.json()["goal"]["contributions"][0]["occurred_on"] == TODAY.isoformat()


def test_기여를_지우면_모은_돈이_되돌아간다(client: TestClient) -> None:
    goal = _create(client, initial_amount="100000")
    added = client.post(
        f"{GOALS}/{goal['id']}/contributions", json={"amount": "50000"}, headers=AUTH
    ).json()["goal"]
    assert added["current_amount"] == "150000"

    contribution_id = added["contributions"][0]["id"]
    res = client.delete(f"{GOALS}/{goal['id']}/contributions/{contribution_id}", headers=AUTH)

    assert res.status_code == 204, res.text
    after = _show(client)
    assert after is not None
    assert after["current_amount"] == "100000"
    assert after["contributions"] == []


def test_목표액에_닿으면_달성으로_판정하고_남은_금액은_0_이다(client: TestClient) -> None:
    """넘겨도 남은 금액을 음수로 두지 않고 진행률도 1 에서 멈춘다."""
    goal = _create(client, target_amount="1000000")
    res = client.post(
        f"{GOALS}/{goal['id']}/contributions", json={"amount": "1200000"}, headers=AUTH
    )

    latest = res.json()["goal"]
    assert latest["is_achieved"] is True
    assert latest["remaining"] == "0"
    assert latest["progress"] == "1.0000"
    # 상태는 그대로 진행 중이다. 굳혀 두면 기여를 지웠을 때 목표가 화면에서 사라진다.
    assert latest["status"] == "active"


def test_기한이_지났으면_알려주되_월저축액을_만들어내지_않는다(
    client: TestClient, pinned_today: date
) -> None:
    goal = _create(client, target_date="2026-08-31")

    assert goal["is_overdue"] is True
    assert goal["months_left"] == 0
    assert goal["required_monthly_saving"] is None


def test_보낸_필드만_고친다(client: TestClient, pinned_today: date) -> None:
    goal = _create(client, target_date="2026-12-31")

    res = client.patch(f"{GOALS}/{goal['id']}", json={"target_amount": "3000000"}, headers=AUTH)

    assert res.status_code == 200, res.text
    updated = res.json()["goal"]
    assert updated["target_amount"] == "3000000"
    assert updated["title"] == "제주도 여행"
    assert updated["target_date"] == "2026-12-31"


def test_기한에_null_을_보내면_기한이_없어진다(client: TestClient, pinned_today: date) -> None:
    """빼는 것과 null 을 보내는 것이 다르다. 기한만 없애는 길이 이것뿐이다."""
    goal = _create(client, target_date="2026-12-31")

    res = client.patch(f"{GOALS}/{goal['id']}", json={"target_date": None}, headers=AUTH)

    updated = res.json()["goal"]
    assert updated["target_date"] is None
    assert updated["months_left"] is None


def test_목표를_지우면_조회가_빈다(client: TestClient) -> None:
    """행은 남기고 표시만 지운다. 지운 뒤 새 목표를 만드는 것은 e2e 가 본다.

    여기 DB(SQLite)는 부분 유니크 인덱스를 조건 없이 만들어서, 접어 둔 목표가 남아 있으면
    두 번째 목표를 못 만든다. PostgreSQL 은 `status='active' AND deleted_at IS NULL` 만
    막으므로 실제로는 만들어진다.
    """
    goal = _create(client)

    res = client.delete(f"{GOALS}/{goal['id']}", headers=AUTH)

    assert res.status_code == 204, res.text
    assert _show(client) is None


def test_내_것이_아닌_id_로는_고치지도_지우지도_못한다(client: TestClient) -> None:
    """소유 판정이 없으면 남의 목표 id 를 아는 사람이 그것을 고친다."""
    missing = "00000000-0000-0000-0000-000000000000"

    patched = client.patch(f"{GOALS}/{missing}", json={"title": "가로채기"}, headers=AUTH)
    removed = client.delete(f"{GOALS}/{missing}", headers=AUTH)

    assert patched.status_code == 404, patched.text
    assert patched.json()["error"]["code"] == "NOT_FOUND"
    assert removed.status_code == 404, removed.text


def test_이름을_공백으로만_보내면_거절한다(client: TestClient) -> None:
    res = client.post(GOALS, json={"title": "   ", "target_amount": "1000"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_목표_금액이_0_이면_거절한다(client: TestClient) -> None:
    """0 원은 진행률의 분모가 되지 못한다. 목표라고 부를 것도 없다."""
    res = client.post(GOALS, json={"title": "무엇", "target_amount": "0"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_원_단위가_아닌_금액은_거절한다(client: TestClient) -> None:
    res = client.post(GOALS, json={"title": "무엇", "target_amount": "1000.5"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_기여_금액이_0_이면_거절한다(client: TestClient) -> None:
    goal = _create(client)

    res = client.post(f"{GOALS}/{goal['id']}/contributions", json={"amount": "0"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_식별키가_없으면_401_이다(unauthenticated_client: TestClient) -> None:
    assert unauthenticated_client.get(GOALS).status_code == 401
