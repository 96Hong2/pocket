"""목록 조회의 페이지 경계와 검색을 고정한다.

여기 있는 것은 화면으로 증명하기 어려운 자리다. 같은 시각 거래를 여러 건 만들어야
페이지 경계가 흔들리는 것을 볼 수 있고, 검색어에 `%` 를 넣는 일은 화면에서 잘 안 일어난다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Category

AUTH = {"X-Anon-Key": "test-anon-key"}
SAME_MOMENT = "2026-09-15T12:30:00+09:00"


def _add(client: TestClient, **over: object) -> dict:
    body: dict = {
        "occurred_at": SAME_MOMENT,
        "amount": "1000",
        "type": "expense",
        "source": "keypad",
    }
    body.update(over)
    response = client.post("/api/v1/transactions", json=body, headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()["transaction"]


def _page(client: TestClient, **params: object) -> dict:
    query = "&".join(f"{k}={v}" for k, v in params.items())
    response = client.get(f"/api/v1/transactions?{query}", headers=AUTH)
    assert response.status_code == 200, response.text
    return response.json()


# ── 페이지 경계 ─────────────────────────────────────────


def test_같은_시각_거래도_커서로_빠짐없이_받는다(client: TestClient) -> None:
    """정렬 키가 시각 하나면 여기서 행이 빠지거나 겹친다.

    캡처 일괄 등록은 한 번에 여러 건을 같은 시각으로 넣는다. 그때 실제로 같아진다.
    """
    made = {_add(client, merchant=f"가게{i}")["id"] for i in range(7)}

    seen: list[str] = []
    cursor: str | None = None
    for _ in range(10):
        page = _page(client, limit=3, **({"cursor": cursor} if cursor else {}))
        seen.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break

    assert cursor is None, "커서가 끝나지 않았다"
    assert len(seen) == len(set(seen)), "같은 행을 두 번 받았다"
    assert set(seen) == made


def test_마지막_페이지는_커서를_주지_않는다(client: TestClient) -> None:
    """딱 맞아떨어질 때 커서를 계속 주면 화면이 빈 페이지를 한 번 더 받는다."""
    for i in range(3):
        _add(client, merchant=f"가게{i}")

    page = _page(client, limit=3)
    assert len(page["items"]) == 3
    assert page["next_cursor"] is None


def test_limit_를_넘겨_주지_않는다(client: TestClient) -> None:
    for i in range(5):
        _add(client, merchant=f"가게{i}")

    page = _page(client, limit=2)
    assert len(page["items"]) == 2
    assert page["next_cursor"] is not None


def test_망가진_커서는_422_다(client: TestClient) -> None:
    """500 이 나면 화면은 서버 잘못으로 읽고 재시도한다. 요청이 잘못된 것이라고 말해야 한다."""
    response = client.get("/api/v1/transactions?cursor=이건커서가아니다", headers=AUTH)
    assert response.status_code == 422, response.text
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


# ── 검색 ────────────────────────────────────────────────


def test_상호로_찾는다(client: TestClient) -> None:
    _add(client, merchant="스타벅스 강남")
    _add(client, merchant="이마트")

    found = _page(client, q="스타벅스")["items"]
    assert [item["merchant"] for item in found] == ["스타벅스 강남"]


def test_대소문자를_가리지_않는다(client: TestClient) -> None:
    _add(client, merchant="Starbucks")

    assert len(_page(client, q="starbucks")["items"]) == 1
    assert len(_page(client, q="STARBUCKS")["items"]) == 1


def test_카테고리_이름으로도_찾는다(
    client: TestClient, db: Session, default_categories: list[Category]
) -> None:
    """화면 안내가 '상호나 카테고리로 검색' 이다. 상호만 보면 그 약속이 깨진다."""
    food = next(c for c in default_categories if c.name == "식비")
    _add(client, merchant="이름없는가게", category_id=str(food.id))
    _add(client, merchant="이마트")

    found = _page(client, q="식비")["items"]
    assert [item["merchant"] for item in found] == ["이름없는가게"]


def test_퍼센트를_와일드카드로_쓰지_않는다(client: TestClient) -> None:
    """`%` 를 그대로 넘기면 전부 걸린다. 검색이 아니라 목록이 된다."""
    _add(client, merchant="스타벅스")
    _add(client, merchant="100% 주스")

    found = _page(client, q="%")["items"]
    assert [item["merchant"] for item in found] == ["100% 주스"]


def test_검색해도_그_달_안에서만_찾는다(client: TestClient) -> None:
    """달력 화면 안의 검색이다. 합계 띠가 9월을 말하는데 8월 것이 섞이면 어긋난다."""
    _add(client, merchant="스타벅스", occurred_at="2026-09-10T12:00:00+09:00")
    _add(client, merchant="스타벅스", occurred_at="2026-08-10T12:00:00+09:00")

    found = _page(client, q="스타벅스", year=2026, month=9)["items"]
    assert len(found) == 1


def test_되돌린_거래는_검색에도_안_나온다(client: TestClient) -> None:
    tx = _add(client, merchant="스타벅스")
    assert client.post(f"/api/v1/transactions/{tx['id']}/undo", headers=AUTH).status_code == 204

    assert _page(client, q="스타벅스")["items"] == []


# ── 달력 ────────────────────────────────────────────────


def test_달력은_날짜별로_접어_준다(client: TestClient) -> None:
    _add(client, amount="3000", occurred_at="2026-09-10T12:00:00+09:00")
    _add(client, amount="2000", occurred_at="2026-09-10T20:00:00+09:00")
    _add(client, amount="500000", type="income", occurred_at="2026-09-11T09:00:00+09:00")

    body = client.get("/api/v1/transactions/calendar?year=2026&month=9", headers=AUTH).json()
    days = {d["day"]: d for d in body["days"]}

    assert body["period_start"] == "2026-09-01"
    assert body["period_end"] == "2026-09-30"
    assert days["2026-09-10"]["expense"] == "5000"
    assert days["2026-09-10"]["income"] == "0"
    assert days["2026-09-11"]["income"] == "500000"


def test_달력_날짜는_사용자_시간대로_접는다(client: TestClient) -> None:
    """KST 10일 00:30 은 UTC 로 9일 15:30 이다. 9일 칸에 붙으면 사용자가 못 알아본다."""
    _add(client, amount="3000", occurred_at="2026-09-10T00:30:00+09:00")

    body = client.get("/api/v1/transactions/calendar?year=2026&month=9", headers=AUTH).json()
    assert [d["day"] for d in body["days"]] == ["2026-09-10"]


def test_이체만_있는_날은_달력에_칸을_만들지_않는다(client: TestClient) -> None:
    """이체는 지출도 수입도 아니다. 0원 칸을 만들면 안 쓴 날과 구분이 안 된다."""
    _add(client, amount="200000", type="transfer", occurred_at="2026-09-12T12:00:00+09:00")

    body = client.get("/api/v1/transactions/calendar?year=2026&month=9", headers=AUTH).json()
    assert body["days"] == []


# ── 하루만 ──────────────────────────────────────────────


def test_하루만_골라_받는다(client: TestClient) -> None:
    """달력에서 날짜를 누르면 그 날만 본다. 달을 통째로 받아 화면에서 자르면
    달 뒤쪽 날짜가 아직 안 받아진 상태에서 '기록 없음' 으로 보인다."""
    _add(client, merchant="10일것", occurred_at="2026-09-10T12:00:00+09:00")
    _add(client, merchant="11일것", occurred_at="2026-09-11T12:00:00+09:00")

    found = _page(client, day="2026-09-10")["items"]
    assert [item["merchant"] for item in found] == ["10일것"]


def test_하루_경계도_사용자_시간대로_본다(client: TestClient) -> None:
    """KST 10일 23:30 은 UTC 로 10일 14:30 이고, KST 11일 00:30 은 UTC 로 10일 15:30 이다.
    UTC 날짜로 자르면 둘이 같은 날로 묶인다."""
    _add(client, merchant="늦은밤", occurred_at="2026-09-10T23:30:00+09:00")
    _add(client, merchant="자정넘어", occurred_at="2026-09-11T00:30:00+09:00")

    tenth = _page(client, day="2026-09-10")["items"]
    eleventh = _page(client, day="2026-09-11")["items"]
    assert [item["merchant"] for item in tenth] == ["늦은밤"]
    assert [item["merchant"] for item in eleventh] == ["자정넘어"]
