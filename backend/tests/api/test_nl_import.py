"""줄글 입력: 분석 → 검토 → 저장.

여기서 지키는 것은 화면으로 보기 어려운 자리다.
모델에 보내기 전에 가리는 규칙, 하루 상한, 저신뢰 자동 확정 금지가 그렇다.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
TODAY = datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).date()

THREE_ITEMS = "점심 12000 스벅 4500 어제 택시 9000"


def _analyze(client: TestClient, text: str) -> dict:
    response = client.post("/api/v1/imports/text", json={"text": text}, headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()


def test_한_줄에_적은_세_건을_따로_읽는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, THREE_ITEMS)

    assert batch["detected_count"] == 3
    amounts = [item["amount"] for item in batch["candidates"]]
    assert amounts == ["12000", "4500", "9000"]
    assert batch["selected_count"] == 3
    assert batch["selected_total"] == "25500"


def test_어제라고_적으면_어제_날짜로_잡힌다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, THREE_ITEMS)

    tz = ZoneInfo(ledger.DEFAULT_TIMEZONE)
    localized = [
        datetime.fromisoformat(item["occurred_at"]).astimezone(tz).date()
        for item in batch["candidates"]
    ]
    # 날짜를 안 쓴 앞의 둘은 오늘, '어제' 라고 쓴 것만 하루 앞이다.
    assert localized[0] == TODAY
    assert localized[1] == TODAY
    assert (TODAY - localized[2]).days == 1


def test_상호로_분류를_붙인다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, THREE_ITEMS)

    names = {str(category.id): category.name for category in default_categories}
    picked = [names.get(item["category_id"]) for item in batch["candidates"]]
    assert picked == ["식비", "카페·간식", "교통"]


def test_확신이_낮으면_스스로_켜지지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "9000")

    candidate = batch["candidates"][0]
    assert candidate["is_low_confidence"] is True
    assert candidate["is_selected"] is False
    assert batch["selected_count"] == 0


def test_금액이_없으면_후보가_없다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "오늘은 아무것도 안 썼다")

    assert batch["detected_count"] == 0
    assert batch["candidates"] == []


def test_카드번호는_후보에_남지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "카드 1234-5678-9012-3456 점심 12000")

    merchants = [item["merchant"] or "" for item in batch["candidates"]]
    assert all("1234-5678" not in merchant for merchant in merchants)
    assert all("9012" not in merchant for merchant in merchants)


def test_고르지_않은_것은_저장되지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, THREE_ITEMS)
    first = batch["candidates"][0]["id"]

    off = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{first}",
        json={"is_selected": False},
        headers=AUTH,
    )
    assert off.status_code == 200, off.text
    assert off.json()["selected_count"] == 2

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    body = committed.json()
    assert body["created_count"] == 2
    assert body["total_amount"] == "13500"

    listed = client.get("/api/v1/transactions", headers=AUTH).json()
    assert len(listed["items"]) == 2


def test_아무것도_고르지_않으면_저장을_막는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "9000")

    response = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_같은_분석을_두_번_저장하지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "점심 12000")
    client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    again = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert again.status_code == 409, again.text
    assert again.json()["error"]["code"] == "CONFLICT"


def test_이미_저장한_거래는_다음_분석에서_중복으로_표시된다(
    client: TestClient, default_categories
) -> None:
    first = _analyze(client, "점심 12000")
    client.post(f"/api/v1/imports/{first['id']}/commit", headers=AUTH)

    second = _analyze(client, "점심 12000")
    candidate = second["candidates"][0]
    assert candidate["is_duplicate"] is True
    assert candidate["is_selected"] is False


def test_분류를_바꿔_저장하면_다음번에_그_분류가_먼저다(
    client: TestClient, default_categories
) -> None:
    names = {category.name: str(category.id) for category in default_categories}
    batch = _analyze(client, "올리브영 23000")
    candidate = batch["candidates"][0]
    assert str(candidate["category_id"]) == names["건강·미용"]

    client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"category_id": names["생활"]},
        headers=AUTH,
    )
    client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    again = _analyze(client, "올리브영 5000")
    assert str(again["candidates"][0]["category_id"]) == names["생활"]


def test_규칙을_지우면_원래_분류로_돌아간다(client: TestClient, default_categories) -> None:
    names = {category.name: str(category.id) for category in default_categories}
    batch = _analyze(client, "올리브영 23000")
    candidate = batch["candidates"][0]
    client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"category_id": names["생활"]},
        headers=AUTH,
    )
    client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)

    rules = client.get("/api/v1/merchant-rules", headers=AUTH).json()["items"]
    assert [rule["merchant"] for rule in rules] == ["올리브영"]

    removed = client.request("DELETE", f"/api/v1/merchant-rules/{rules[0]['id']}", headers=AUTH)
    assert removed.status_code == 204, removed.text

    again = _analyze(client, "올리브영 5000")
    assert str(again["candidates"][0]["category_id"]) == names["건강·미용"]


def test_고치면_확신이_올라가_점선이_사라진다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "9000")
    candidate = batch["candidates"][0]

    fixed = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"merchant": "택시"},
        headers=AUTH,
    ).json()

    assert fixed["candidates"][0]["is_low_confidence"] is False
    assert fixed["candidates"][0]["is_selected"] is True


def test_하루_상한을_넘기면_429_로_막는다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("NL_PARSE_DAILY_LIMIT", "2")
    get_settings.cache_clear()
    try:
        for _ in range(2):
            assert (
                client.post(
                    "/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH
                ).status_code
                == 201
            )
        blocked = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)
        assert blocked.status_code == 429, blocked.text
        assert blocked.json()["error"]["code"] == "USAGE_LIMIT"
    finally:
        monkeypatch.delenv("NL_PARSE_DAILY_LIMIT", raising=False)
        get_settings.cache_clear()


def test_상한에_걸려도_키패드_기록은_막지_않는다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("NL_PARSE_DAILY_LIMIT", "0")
    get_settings.cache_clear()
    try:
        blocked = client.post("/api/v1/imports/text", json={"text": "점심 12000"}, headers=AUTH)
        assert blocked.status_code == 429

        saved = client.post(
            "/api/v1/transactions",
            json={
                "occurred_at": datetime.now(ZoneInfo(ledger.DEFAULT_TIMEZONE)).isoformat(),
                "amount": "12000",
                "type": "expense",
                "source": "keypad",
                "confidence": 1,
                "excluded_from_budget": False,
            },
            headers=AUTH,
        )
        assert saved.status_code == 201, saved.text
    finally:
        monkeypatch.delenv("NL_PARSE_DAILY_LIMIT", raising=False)
        get_settings.cache_clear()
