"""LLM 스텁. 결정적으로 같은 결과가 나오고, 스텁이라는 사실이 드러나야 한다."""

from __future__ import annotations

from datetime import date

import pytest

from app.integrations.llm.contracts import (
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


async def test_image_input_returns_nothing_because_stub_cannot_read_it(
    client,
) -> None:
    result = await client.extract(
        prompt="p",
        schema=TransactionExtraction,
        image=LlmImage(media_type="image/png", data=b"\x89PNG"),
    )
    assert result.candidates == []


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
