"""설정 API 가 값을 그대로 저장하고 되돌려 주는지.

홈 표시 방식은 컬럼과 enum 만 있고 읽고 쓰는 코드가 없었다. 홈이 이 값을 보고 무엇을
크게 보여줄지 정하므로, 저장이 안 되면 사용자가 고른 화면이 다시 열 때 사라진다.
설정 화면은 토글 하나만 보내니, 안 보낸 값이 기본값으로 되돌아가지 않는 것도 함께 본다.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

AUTH = {"X-Anon-Key": "test-anon-key"}
PREFERENCES = "/api/v1/preferences"


def test_홈_표시_방식_기본값은_남은_예산이다(client: TestClient) -> None:
    """첫 기록 전에 아무것도 묻지 않으므로 고르지 않은 사용자도 값이 있어야 한다."""
    res = client.get(PREFERENCES, headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.json()["home_hero"] == "remaining_budget"


def test_홈_표시_방식을_바꾸면_다시_조회해도_그대로다(client: TestClient) -> None:
    """저장 응답만 맞고 다음 조회가 기본값을 주면 화면에서만 잠깐 바뀐 것처럼 보인다."""
    patched = client.patch(PREFERENCES, json={"home_hero": "income_expense"}, headers=AUTH)
    assert patched.status_code == 200, patched.text
    assert patched.json()["home_hero"] == "income_expense"

    again = client.get(PREFERENCES, headers=AUTH)
    assert again.json()["home_hero"] == "income_expense"


def test_홈_표시_방식만_보내면_이어쓰기는_안_바뀐다(client: TestClient) -> None:
    client.patch(PREFERENCES, json={"budget_auto_carryover": False}, headers=AUTH)

    res = client.patch(PREFERENCES, json={"home_hero": "income_and_budget"}, headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.json()["home_hero"] == "income_and_budget"
    assert res.json()["budget_auto_carryover"] is False


def test_이어쓰기만_보내면_홈_표시_방식은_안_바뀐다(client: TestClient) -> None:
    client.patch(PREFERENCES, json={"home_hero": "income_expense"}, headers=AUTH)

    res = client.patch(PREFERENCES, json={"budget_auto_carryover": False}, headers=AUTH)

    assert res.status_code == 200, res.text
    assert res.json()["budget_auto_carryover"] is False
    assert res.json()["home_hero"] == "income_expense"


def test_null_을_보내면_그대로_둔다(client: TestClient) -> None:
    """전부 기본값이 있는 컬럼이라 비울 자리가 없다. null 은 '안 보낸 것' 으로 본다."""
    client.patch(PREFERENCES, json={"home_hero": "income_expense"}, headers=AUTH)

    res = client.patch(
        PREFERENCES, json={"home_hero": None, "budget_auto_carryover": None}, headers=AUTH
    )

    assert res.status_code == 200, res.text
    assert res.json()["home_hero"] == "income_expense"
    assert res.json()["budget_auto_carryover"] is True


def test_목록에_없는_홈_표시_방식은_거절한다(client: TestClient) -> None:
    """DB 에는 문자열로 들어간다. 스키마가 막지 않으면 홈이 모르는 값을 읽게 된다."""
    res = client.patch(PREFERENCES, json={"home_hero": "net_worth"}, headers=AUTH)

    assert res.status_code == 422, res.text
    assert res.json()["error"]["code"] == "INVALID_REQUEST"
    assert client.get(PREFERENCES, headers=AUTH).json()["home_hero"] == "remaining_budget"


def test_홈_표시_방식에_null_을_보내면_지금_값을_그대로_둔다(client: TestClient) -> None:
    """필드를 빼는 것과 null 이 같다는 계약이 새 필드에도 적용되는지."""
    client.patch(PREFERENCES, json={"home_hero": "income_expense"}, headers=AUTH)

    kept = client.patch(PREFERENCES, json={"home_hero": None}, headers=AUTH)

    assert kept.status_code == 200, kept.text
    assert kept.json()["home_hero"] == "income_expense"


def _save(client: TestClient, source: str, *, amount: str = "12000") -> None:
    body = {
        "occurred_at": "2026-09-15T12:30:00+09:00",
        "amount": amount,
        "type": "expense",
        "merchant": "테스트 가게",
        "source": source,
    }
    if source == "no_spend":
        # 쓴 기록이 있는 날에는 무지출 표시를 남길 수 없다. 그날과 겹치지 않게 하루 옮긴다.
        body |= {"amount": "0", "merchant": None, "occurred_at": "2026-09-16T12:30:00+09:00"}
    res = client.post("/api/v1/transactions", json=body, headers=AUTH)
    assert res.status_code == 201, res.text


def _method(client: TestClient) -> str | None:
    return client.get(PREFERENCES, headers=AUTH).json()["last_record_method"]


def test_한_번도_안_적었으면_마지막_방식이_없다(client: TestClient) -> None:
    """없으면 화면이 키패드로 연다. 기본값을 서버가 정하면 그 판단이 두 곳으로 갈린다."""
    assert _method(client) is None


def test_저장한_방식이_그대로_남는다(client: TestClient) -> None:
    for source in ("nl", "screenshot", "receipt", "keypad"):
        _save(client, source)
        assert _method(client) == source


def test_시트에_탭이_없는_방식은_기억하지_않는다(client: TestClient) -> None:
    """자산 캡처와 무지출일은 기록 시트에서 오지 않는다.

    기억해 두면 다음번에 열 수 없는 탭을 가리켜 시트가 빈 채로 열린다.
    """
    _save(client, "nl")
    _save(client, "no_spend")

    assert _method(client) == "nl"


def test_마지막_방식은_화면이_고칠_수_없다(client: TestClient) -> None:
    """사용자가 고르는 값이 아니라 저장할 때 서버가 남기는 흔적이다.

    화면이 쓸 수 있으면 실제로 쓴 방식과 어긋난 값이 들어올 자리가 생긴다.
    """
    _save(client, "nl")
    res = client.patch(PREFERENCES, json={"last_record_method": "receipt"}, headers=AUTH)

    assert res.status_code == 200, res.text
    assert _method(client) == "nl"
