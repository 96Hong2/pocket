"""줄글 입력: 분석 → 검토 → 저장.

여기서 지키는 것은 화면으로 보기 어려운 자리다.
모델에 보내기 전에 가리는 규칙, 하루 상한, 저신뢰 자동 확정 금지가 그렇다.
"""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.import_batch import ImportCandidate
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
    assert batch["selected_expense_total"] == "25500"


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
    assert body["expense_total"] == "13500"

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


def test_만과_천을_이어_쓴_금액을_한_건으로_읽는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "커피 3만5천원")

    assert batch["detected_count"] == 1
    assert batch["candidates"][0]["amount"] == "35000"
    assert batch["selected_expense_total"] == "35000"


def test_합계는_지출만_센다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "점심 12000 월급 2000000 입금")

    kinds = [item["type"] for item in batch["candidates"]]
    assert "income" in kinds
    # 수입을 지출과 한 덩어리로 더하면 저장 버튼이 실제로 쓴 돈과 다른 값을 말한다.
    assert batch["selected_expense_total"] == "12000"


def test_환불은_대상_없이_저장되지_않는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "스벅 환불 40000")

    candidate = batch["candidates"][0]
    assert candidate["type"] == "refund"
    # 되돌릴 지출을 고를 자리가 아직 없다. 스스로 켜지지 않는다.
    assert candidate["is_selected"] is False

    turned_on = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"is_selected": True},
        headers=AUTH,
    )
    assert turned_on.status_code == 200, turned_on.text

    blocked = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert blocked.status_code == 422, blocked.text
    assert blocked.json()["error"]["code"] == "INVALID_REFUND_TARGET"


def test_이미_있는_것의_분류만_바꿔도_켜지지_않는다(client: TestClient, default_categories) -> None:
    names = {str(category.id): category.name for category in default_categories}
    first = _analyze(client, "점심 12000")
    client.post(f"/api/v1/imports/{first['id']}/commit", headers=AUTH)

    second = _analyze(client, "점심 12000")
    candidate = second["candidates"][0]
    assert candidate["is_duplicate"] is True

    other = next(cid for cid, name in names.items() if name == "생활")
    fixed = client.patch(
        f"/api/v1/imports/{second['id']}/candidates/{candidate['id']}",
        json={"category_id": other},
        headers=AUTH,
    ).json()

    # 분류만 바꿔도 지문은 그대로다. 켜 주면 같은 거래가 두 번 저장된다.
    assert fixed["candidates"][0]["is_duplicate"] is True
    assert fixed["candidates"][0]["is_selected"] is False


def test_손으로_켠_중복_줄은_분류를_고쳐도_켜진_채_남는다(
    client: TestClient, default_categories
) -> None:
    names = {str(category.id): category.name for category in default_categories}
    first = _analyze(client, "점심 12000")
    client.post(f"/api/v1/imports/{first['id']}/commit", headers=AUTH)

    second = _analyze(client, "점심 12000")
    candidate = second["candidates"][0]
    turned_on = client.patch(
        f"/api/v1/imports/{second['id']}/candidates/{candidate['id']}",
        json={"is_selected": True},
        headers=AUTH,
    ).json()
    assert turned_on["selected_count"] == 1

    other = next(cid for cid, name in names.items() if name == "생활")
    fixed = client.patch(
        f"/api/v1/imports/{second['id']}/candidates/{candidate['id']}",
        json={"category_id": other},
        headers=AUTH,
    ).json()

    # 정말 두 번 산 것이라 손으로 켠 줄이다. 관계없는 편집이 그 선택을 되돌리면 안 된다.
    assert fixed["candidates"][0]["is_selected"] is True
    assert fixed["selected_count"] == 1
    assert fixed["selected_expense_total"] == "12000"

    committed = client.post(f"/api/v1/imports/{second['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    assert committed.json()["created_count"] == 1


def test_손으로_켠_환불_줄은_상호를_고쳐도_켜진_채_남는다(
    client: TestClient, default_categories
) -> None:
    batch = _analyze(client, "스벅 환불 40000")
    candidate = batch["candidates"][0]
    client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"is_selected": True},
        headers=AUTH,
    )

    fixed = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"merchant": "스타벅스 강남"},
        headers=AUTH,
    ).json()

    assert fixed["candidates"][0]["is_selected"] is True
    assert fixed["selected_count"] == 1


def test_손으로_끈_평범한_줄은_상호를_고쳐도_꺼진_채_남는다(
    client: TestClient, default_categories
) -> None:
    """빼기로 한 줄을 고쳤다고 되켜면, 안 넣기로 한 건이 조용히 저장된다."""
    batch = _analyze(client, "점심 12000 스벅 4500")
    candidate = batch["candidates"][1]
    assert candidate["is_selected"] is True

    turned_off = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"is_selected": False},
        headers=AUTH,
    ).json()
    assert turned_off["selected_count"] == 1

    # 상호 오타만 고친다. 뺀다는 결정과는 상관없는 편집이다.
    fixed = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"merchant": "스타벅스"},
        headers=AUTH,
    ).json()

    assert fixed["candidates"][1]["is_selected"] is False
    assert fixed["selected_count"] == 1
    assert fixed["selected_expense_total"] == "12000"

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.json()["created_count"] == 1


def test_확신이_낮아_꺼진_줄은_고치면_켜진다(client: TestClient, default_categories) -> None:
    """대조군. 서버가 꺼 둔 줄은 사람이 값을 확인해 주면 켜져야 한다."""
    batch = _analyze(client, "9000")
    candidate = batch["candidates"][0]
    assert candidate["is_selected"] is False

    fixed = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"merchant": "김밥천국"},
        headers=AUTH,
    ).json()

    assert fixed["candidates"][0]["is_selected"] is True
    assert fixed["selected_count"] == 1


def test_고쳐서_이미_있는_것과_같아지면_켜진_줄이_꺼진다(
    client: TestClient, default_categories
) -> None:
    first = _analyze(client, "점심 12000")
    client.post(f"/api/v1/imports/{first['id']}/commit", headers=AUTH)

    second = _analyze(client, "커피 4500")
    candidate = second["candidates"][0]
    assert candidate["is_selected"] is True

    fixed = client.patch(
        f"/api/v1/imports/{second['id']}/candidates/{candidate['id']}",
        json={"merchant": "점심", "amount": "12000"},
        headers=AUTH,
    ).json()

    assert fixed["candidates"][0]["is_duplicate"] is True
    assert fixed["candidates"][0]["is_selected"] is False


def test_상호가_없으면_중복으로_보지_않는다(client: TestClient, default_categories) -> None:
    first = _analyze(client, "9000")
    candidate = first["candidates"][0]
    client.patch(
        f"/api/v1/imports/{first['id']}/candidates/{candidate['id']}",
        json={"amount": "9000"},
        headers=AUTH,
    )

    # 상호가 비면 지문은 만들되 중복 판정에서 뺀다. 같은 금액이라는 이유로 묶으면 오탐이 많다.
    again = client.get("/api/v1/transactions", headers=AUTH)
    assert again.status_code == 200
    refreshed = _analyze(client, "9000")
    assert refreshed["candidates"][0]["is_duplicate"] is False


def test_비울_수_없는_값에_null_을_보내면_막는다(client: TestClient, default_categories) -> None:
    batch = _analyze(client, "점심 12000")
    candidate = batch["candidates"][0]

    for field in ("amount", "type", "is_selected"):
        response = client.patch(
            f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
            json={field: None},
            headers=AUTH,
        )
        assert response.status_code == 422, f"{field}: {response.text}"
        assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_보내기_전에_가린_문장이_모델에_넘어간다(
    client: TestClient, default_categories, monkeypatch
) -> None:
    """가리기 배선이 실제로 도는지 본다. 화면으로는 볼 수 없는 자리다."""
    from app.integrations.llm import stub

    seen: list[str] = []
    original = stub.StubLlmStructuredClient.extract

    async def spy(self, **kwargs):  # type: ignore[no-untyped-def]
        seen.append(kwargs.get("text") or "")
        return await original(self, **kwargs)

    monkeypatch.setattr(stub.StubLlmStructuredClient, "extract", spy)

    _analyze(client, "카드 1234-5678-9012-3456 으로 점심 12000")

    assert seen, "모델을 부르지 않았다"
    assert "1234-5678-9012-3456" not in seen[0]
    assert "12000" in seen[0]


# ── 지표 ────────────────────────────────────────────────


def test_사람이_고친_줄만_고친_것으로_남는다(
    client: TestClient, db: Session, default_categories
) -> None:
    """북극성('손 안 대고 저장된 비율')의 분자를 정하는 자리다.

    저장하는 순간 남기지 않으면 나중에 어떤 방법으로도 되살릴 수 없어서, 값이 아니라
    이 표시가 있는지를 본다. 무엇을 고쳤는지는 담지 않는다.
    """
    batch = _analyze(client, THREE_ITEMS)
    edited, untouched = batch["candidates"][0], batch["candidates"][1]

    response = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{edited['id']}",
        json={"amount": "13000"},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text

    rows = {str(row.id): row.was_edited for row in db.scalars(select(ImportCandidate)).all()}
    assert rows[edited["id"]] is True
    assert rows[untouched["id"]] is False


def test_선택만_껐다_켠_것은_고친_것이_아니다(
    client: TestClient, db: Session, default_categories
) -> None:
    """저장 대상에서 빼는 것은 값을 고치는 것이 아니다.

    이것까지 세면 훑어보다 하나 끈 사람이 전부 '고친 사람' 이 되어 북극성이 낮게 나온다.
    """
    batch = _analyze(client, THREE_ITEMS)
    candidate = batch["candidates"][0]

    response = client.patch(
        f"/api/v1/imports/{batch['id']}/candidates/{candidate['id']}",
        json={"is_selected": False},
        headers=AUTH,
    )
    assert response.status_code == 200, response.text

    rows = {str(row.id): row.was_edited for row in db.scalars(select(ImportCandidate)).all()}
    assert rows[candidate["id"]] is False
