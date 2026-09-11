"""LLM 스텁. 결정적으로 같은 결과가 나오고, 스텁이라는 사실이 드러나야 한다."""

from __future__ import annotations

from datetime import date

import pytest

from app.integrations.llm.contracts import (
    DEFAULT_CATEGORY_HINTS,
    TransactionExtraction,
    attach_source,
)
from app.integrations.llm.port import (
    LlmImage,
    LlmInputError,
    LlmSchemaError,
    LlmStructuredClient,
    build_meta,
)
from app.integrations.llm.prompts import natural_language_prompt
from app.integrations.llm.stub import StubLlmStructuredClient
from app.models import TransactionType

pytestmark = pytest.mark.asyncio


@pytest.fixture
def client() -> StubLlmStructuredClient:
    return StubLlmStructuredClient()


async def test_stub_satisfies_the_port(client) -> None:
    assert isinstance(client, LlmStructuredClient)


async def test_parses_amount_and_merchant(client) -> None:
    result = await client.extract(
        prompt=natural_language_prompt(),
        schema=TransactionExtraction,
        text="12000 점심",
    )

    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.amount == 12000
    assert candidate.type == "expense"
    assert candidate.merchant == "점심"
    assert candidate.category == "식비"
    assert 0.0 <= candidate.confidence <= 1.0
    assert candidate.is_low_confidence is False


async def test_same_input_gives_same_output(client) -> None:
    first = await client.extract(prompt="p", schema=TransactionExtraction, text="4,500원 커피")
    second = await client.extract(prompt="p", schema=TransactionExtraction, text="4,500원 커피")
    assert first.model_dump() == second.model_dump()
    assert first.candidates[0].amount == 4500
    assert first.candidates[0].category == "카페·간식"


async def test_amount_only_input_gets_low_confidence(client) -> None:
    result = await client.extract(prompt="p", schema=TransactionExtraction, text="12000")
    candidate = result.candidates[0]
    assert candidate.merchant is None
    assert candidate.is_low_confidence is True


async def test_unparseable_input_yields_no_candidate(client) -> None:
    result = await client.extract(prompt="p", schema=TransactionExtraction, text="오늘 뭐 먹지")
    assert result.candidates == []


async def test_explicit_date_is_read_and_not_confused_with_amount(client) -> None:
    result = await client.extract(
        prompt="p", schema=TransactionExtraction, text="2026-01-02 8000 김밥"
    )
    candidate = result.candidates[0]
    assert candidate.occurred_at == date(2026, 1, 2)
    assert candidate.amount == 8000


async def test_relative_date_is_not_guessed(client) -> None:
    result = await client.extract(prompt="p", schema=TransactionExtraction, text="어제 9000 국밥")
    assert result.candidates[0].occurred_at is None


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("30000 환불", "refund"),
        ("50000 이체", "transfer"),
        ("3000000 월급", "income"),
        ("15000 마트", "expense"),
    ],
)
async def test_type_keywords(client, text: str, expected: str) -> None:
    result = await client.extract(prompt="p", schema=TransactionExtraction, text=text)
    assert result.candidates[0].type == expected


async def test_image_input_returns_a_fixed_sample_the_stub_did_not_read(client) -> None:
    """스텁은 이미지를 읽지 않고 정해 둔 예시를 낸다.

    빈 결과를 내면 캡처 화면이 늘 '0건 인식' 이라 검토·수정·저장을 한 번도 못 본다.
    이 6건은 배관 확인용이고 인식 정확도의 근거가 아니다.
    마지막 한 줄은 카드 캐시백(환불)이다. 실제 캡처에 섞여 들어오고 그대로는 저장할 수 없는
    줄이라, 그 분기를 화면에서 볼 수 있게 예시에 넣어 뒀다.
    """
    today = date(2026, 3, 10)
    result = await client.extract(
        prompt="p",
        schema=TransactionExtraction,
        image=LlmImage(media_type="image/png", data=b"\x89PNG"),
        today=today,
    )

    assert [item.merchant for item in result.candidates] == [
        "스타벅스",
        "GS25",
        "김밥천국",
        "카카오T",
        "쿠팡",
        "MY 카드 캐시백",
    ]
    assert [item.amount for item in result.candidates] == [4500, 3200, 8000, 9800, 32900, 500]
    assert [item.occurred_at for item in result.candidates] == [
        today,
        today,
        date(2026, 3, 9),
        date(2026, 3, 9),
        date(2026, 3, 8),
        today,
    ]
    # 캐시백만 환불이다. 나머지는 전부 지출이다.
    assert [item.type for item in result.candidates][-1] == TransactionType.REFUND
    # 카카오T 한 줄만 저신뢰다. 검토 화면의 '확인 필요' 분기가 여기서 켜진다.
    assert [item.is_low_confidence for item in result.candidates] == [
        False,
        False,
        False,
        True,
        False,
        False,
    ]


async def test_image_result_ignores_the_bytes(client) -> None:
    """어떤 이미지를 넣어도 같은 결과다. 픽스처를 바꿔도 단언이 안 깨진다."""
    today = date(2026, 3, 10)
    first = await client.extract(
        prompt="p",
        schema=TransactionExtraction,
        image=LlmImage(media_type="image/png", data=b"\x89PNG-one"),
        today=today,
    )
    second = await client.extract(
        prompt="p",
        schema=TransactionExtraction,
        image=LlmImage(media_type="image/jpeg", data=b"\xff\xd8\xff-two"),
        today=today,
    )

    assert first.model_dump() == second.model_dump()


async def test_image_categories_exist_in_the_default_set(client) -> None:
    """없는 분류 이름을 지어내면 서버가 못 찾아 조용히 미분류가 된다."""
    result = await client.extract(
        prompt="p",
        schema=TransactionExtraction,
        image=LlmImage(media_type="image/png", data=b"\x89PNG"),
        today=date(2026, 3, 10),
    )

    # 환불 줄은 분류가 없다. 되돌릴 지출의 분류를 따라가므로 스텁이 지어내지 않는다.
    names = {item.category for item in result.candidates if item.category is not None}
    # 후보가 비면 검사할 이름이 없어 부분집합 비교가 진공으로 통과한다.
    assert names
    assert names <= set(DEFAULT_CATEGORY_HINTS)


async def test_both_or_neither_input_is_rejected(client) -> None:
    with pytest.raises(LlmInputError):
        await client.extract(prompt="p", schema=TransactionExtraction)
    with pytest.raises(LlmInputError):
        await client.extract(
            prompt="p",
            schema=TransactionExtraction,
            text="12000 점심",
            image=LlmImage(media_type="image/png", data=b""),
        )


async def test_unknown_schema_is_rejected(client) -> None:
    from pydantic import BaseModel

    class Other(BaseModel):
        value: int

    with pytest.raises(LlmSchemaError):
        await client.extract(prompt="p", schema=Other, text="12000 점심")


async def test_meta_says_it_is_a_stub(client) -> None:
    meta = build_meta(client, notes=["로컬 개발"])
    assert meta.provider == "stub"
    assert meta.is_stub is True


async def test_image_payload_is_not_leaked_in_repr() -> None:
    image = LlmImage(media_type="image/png", data=b"secret-bytes")
    assert "secret-bytes" not in repr(image)


async def test_attach_source_produces_candidates(client) -> None:
    extraction = await client.extract(prompt="p", schema=TransactionExtraction, text="12000 점심")
    candidates = attach_source(extraction, "nl")
    assert candidates[0].source == "nl"
    assert candidates[0].amount == 12000
