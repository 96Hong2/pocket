"""자산 API 가 목록을 통째로 갈아 끼우고 순자산을 서버가 세는지.

화면은 이 응답을 그대로 그린다. 소계나 순자산을 화면이 다시 더하면 접힌 줄을 빼고
세게 되므로, 그 숫자가 전부 여기서 나오는지를 본다.
하루에 스냅샷 하나라는 규칙도 여기서 지킨다. 저장할 때마다 쌓이면 순자산 추이가
같은 날에 여러 점이 된다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

AUTH = {"X-Anon-Key": "test-anon-key"}
ASSETS = "/api/v1/assets"


def _put(client: TestClient, items: list[dict]) -> dict:
    res = client.put(ASSETS, json={"items": items}, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


def _totals(body: dict) -> dict[str, str]:
    return {row["group"]: row["total"] for row in body["groups"]}


def test_한_번도_안_적었으면_스냅샷이_없고_전부_0_이다(client: TestClient) -> None:
    """적지 않은 것은 정상이다. 404 로 답하면 화면이 오류 자리를 그린다."""
    res = client.get(ASSETS, headers=AUTH)

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["snapshot"] is None
    assert body["items"] == []
    assert body["summary"] == {
        "total_assets": "0",
        "total_liabilities": "0",
        "net_worth": "0",
    }
    # 항목이 없는 그룹도 0 으로 실린다. 빠지면 화면이 구획을 못 그린다.
    assert _totals(body) == {"cash": "0", "investment": "0", "deposit": "0", "debt": "0"}


def test_부채는_양수로_보내도_순자산에서_빠진다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {"group": "cash", "label": "토스뱅크", "amount": "1000000"},
            {"group": "debt", "label": "학자금", "amount": "300000"},
        ],
    )

    assert body["summary"]["total_assets"] == "1000000"
    assert body["summary"]["total_liabilities"] == "300000"
    assert body["summary"]["net_worth"] == "700000"


def test_그룹_소계를_서버가_센다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {"group": "cash", "label": "예금", "amount": "1000000"},
            {"group": "cash", "label": "비상금", "amount": "500000"},
            {"group": "investment", "label": None, "amount": "2000000"},
        ],
    )

    assert _totals(body) == {
        "cash": "1500000",
        "investment": "2000000",
        "deposit": "0",
        "debt": "0",
    }


def test_같은_날_다시_저장하면_스냅샷이_늘지_않고_항목만_바뀐다(client: TestClient) -> None:
    first = _put(client, [{"group": "cash", "label": "예금", "amount": "1000000"}])
    second = _put(client, [{"group": "investment", "label": "주식", "amount": "700000"}])

    # 같은 스냅샷이어야 한다. 새로 쌓이면 같은 날에 순자산이 두 점이 된다.
    assert second["snapshot"]["id"] == first["snapshot"]["id"]
    assert second["snapshot"]["effective_on"] == first["snapshot"]["effective_on"]
    assert [(row["group"], row["label"]) for row in second["items"]] == [("investment", "주식")]
    assert second["summary"]["net_worth"] == "700000"


def test_빈_목록을_보내면_전부_지워진다(client: TestClient) -> None:
    """화면이 목록을 들고 있으니 빈 배열은 '전부 지웠다' 는 뜻이다."""
    _put(client, [{"group": "cash", "label": "예금", "amount": "1000000"}])

    body = _put(client, [])

    assert body["items"] == []
    assert body["summary"]["net_worth"] == "0"
    # 스냅샷 자체는 남는다. 오늘 비웠다는 것도 사실이다.
    assert body["snapshot"] is not None


def test_다시_조회해도_그대로_남는다(client: TestClient) -> None:
    """저장 응답만 맞고 다음 조회가 비어 있으면 화면에서만 잠깐 보인 것이 된다."""
    _put(
        client,
        [
            {"group": "deposit", "label": "전월세 보증금", "amount": "50000000"},
            {"group": "debt", "label": None, "amount": "5000000"},
        ],
    )

    body = client.get(ASSETS, headers=AUTH).json()

    assert body["summary"]["net_worth"] == "45000000"
    assert [row["sort_order"] for row in body["items"]] == [0, 1]
    assert body["items"][1]["label"] is None


def test_보낸_순서가_sort_order_로_남는다(client: TestClient) -> None:
    body = _put(
        client,
        [
            {"group": "debt", "label": "카드 할부", "amount": "100000"},
            {"group": "cash", "label": "월급 통장", "amount": "200000"},
        ],
    )

    assert [(row["sort_order"], row["group"]) for row in body["items"]] == [
        (0, "debt"),
        (1, "cash"),
    ]


def test_이름을_빈칸으로_보내면_없는_것으로_본다(client: TestClient) -> None:
    body = _put(client, [{"group": "cash", "label": "   ", "amount": "1000"}])

    assert body["items"][0]["label"] is None


def test_음수_금액은_거절한다(client: TestClient) -> None:
    """부채도 양수로 저장한다. 음수를 받으면 순자산에서 두 번 빠진다."""
    res = client.put(ASSETS, json={"items": [{"group": "debt", "amount": "-1000"}]}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_원_단위가_아닌_금액은_거절한다(client: TestClient) -> None:
    res = client.put(ASSETS, json={"items": [{"group": "cash", "amount": "1000.5"}]}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_목록에_없는_그룹은_거절한다(client: TestClient) -> None:
    """DB 에는 문자열로 들어간다. 스키마가 막지 않으면 화면이 모르는 구획이 생긴다."""
    res = client.put(ASSETS, json={"items": [{"group": "crypto", "amount": "1000"}]}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_항목이_너무_많으면_거절한다(client: TestClient) -> None:
    items = [{"group": "cash", "amount": "1000"} for _ in range(41)]

    res = client.put(ASSETS, json={"items": items}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"


def test_식별키가_없으면_401_이다(unauthenticated_client: TestClient) -> None:
    assert unauthenticated_client.get(ASSETS).status_code == 401
