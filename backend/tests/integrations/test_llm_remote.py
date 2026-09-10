"""실제 provider 어댑터의 순수한 부분: 보내는 스키마 모양, 응답 봉투 읽기, 원문이 새지 않는 것.

네트워크는 목으로 흉내 내지 않는다. 실제 호출은 scripts/llm_smoke.py 로 사람이 한 번 본다.
"""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.integrations.llm.contracts import TransactionExtraction
from app.integrations.llm.gemini import GEMINI_DEFAULT_MODEL, GeminiStructuredClient
from app.integrations.llm.openai import OpenAiStructuredClient
from app.integrations.llm.port import LlmError, LlmImage, LlmSchemaError, LlmStructuredClient
from app.integrations.llm.schema import provider_json_schema, validate_response

SCHEMA = provider_json_schema(TransactionExtraction)


def _walk(node: Any):  # type: ignore[no-untyped-def]
    yield node
    if isinstance(node, dict):
        for value in node.values():
            yield from _walk(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk(item)


def test_보내는_스키마에는_provider_가_거부하는_키가_없다() -> None:
    for node in _walk(SCHEMA):
        if isinstance(node, dict):
            assert not {"$ref", "$defs", "title", "default", "maxLength"} & node.keys(), node
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert node["required"] == list(node["properties"])


def test_보내는_스키마가_계약의_경계를_지킨다() -> None:
    item = SCHEMA["properties"]["candidates"]["items"]
    assert item["properties"]["amount"]["minimum"] == 1
    assert item["properties"]["type"]["enum"] == ["expense", "income", "transfer", "refund"]
    assert {"type": "null"} in item["properties"]["occurred_at"]["anyOf"]


def test_응답_검증은_통과한_값만_돌려준다() -> None:
    raw = json.dumps(
        {
            "candidates": [
                {
                    "occurred_at": "2026-09-08",
                    "amount": 4500,
                    "type": "expense",
                    "merchant": "스타벅스",
                    "category": "카페·간식",
                    "confidence": 0.9,
                }
            ]
        }
    )
    result = validate_response(raw, TransactionExtraction)
    assert result.candidates[0].amount == 4500


def test_응답_검증_실패_메시지에_원문이_실리지_않는다() -> None:
    leaked = "카드 1234-5678-9012-3456 홍길동"
    raw = json.dumps({"candidates": [{"amount": leaked, "type": "expense", "confidence": 0.5}]})
    with pytest.raises(LlmSchemaError) as info:
        validate_response(raw, TransactionExtraction)
    assert leaked not in str(info.value)
    assert "1234" not in str(info.value)
    assert info.value.__cause__ is None


@pytest.fixture
def gemini() -> GeminiStructuredClient:
    return GeminiStructuredClient(api_key="test-key", model="gemini-2.5-flash", timeout_seconds=5)


@pytest.fixture
def openai() -> OpenAiStructuredClient:
    return OpenAiStructuredClient(api_key="test-key", model="gpt-5-mini", timeout_seconds=5)


def test_두_어댑터가_포트를_만족한다(gemini, openai) -> None:
    assert isinstance(gemini, LlmStructuredClient)
    assert isinstance(openai, LlmStructuredClient)
    assert gemini.is_stub is False and openai.is_stub is False


def test_gemini_요청은_이미지를_inline_으로_싣고_생각을_끈다(gemini) -> None:
    body = gemini._build_body(
        prompt="규칙",
        schema_name="TransactionExtraction",
        schema_json=SCHEMA,
        text=None,
        image=LlmImage(media_type="image/png", data=b"\x89PNG"),
    )
    assert body["systemInstruction"]["parts"][0]["text"] == "규칙"
    assert body["contents"][0]["parts"][1]["inline_data"]["mime_type"] == "image/png"
    assert body["generationConfig"]["responseJsonSchema"] is SCHEMA
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingBudget": 0}


def test_기본_모델에는_생각_끄기_필드를_안_보낸다() -> None:
    """3.x 는 끄는 방법이 달라, 2.5 의 필드를 그대로 보내면 호출이 통째로 막힌다."""
    client = GeminiStructuredClient(
        api_key="test-key", model=GEMINI_DEFAULT_MODEL, timeout_seconds=5
    )

    body = client._build_body(
        prompt="규칙",
        schema_name="TransactionExtraction",
        schema_json=SCHEMA,
        text="점심 12000",
        image=None,
    )

    assert GEMINI_DEFAULT_MODEL.startswith("gemini-3.")
    assert "thinkingConfig" not in body["generationConfig"]


def test_gemini_응답에서_생각_조각을_빼고_본문만_읽는다(gemini) -> None:
    payload = {
        "candidates": [
            {
                "finishReason": "STOP",
                "content": {
                    "parts": [{"thought": True, "text": "생각"}, {"text": '{"candidates": []}'}]
                },
            }
        ]
    }
    assert gemini._text_from(payload) == '{"candidates": []}'


def test_gemini_거부와_잘림은_예외다(gemini) -> None:
    with pytest.raises(LlmError):
        gemini._text_from({"promptFeedback": {"blockReason": "SAFETY"}})
    with pytest.raises(LlmSchemaError):
        gemini._text_from({"candidates": [{"finishReason": "MAX_TOKENS", "content": {}}]})


def test_openai_요청은_strict_스키마와_store_false_로_나간다(openai) -> None:
    body = openai._build_body(
        prompt="규칙",
        schema_name="TransactionExtraction",
        schema_json=SCHEMA,
        text="점심 12000",
        image=None,
    )
    assert body["store"] is False
    assert body["instructions"] == "규칙"
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"] is SCHEMA
    assert body["input"][0]["content"] == [{"type": "input_text", "text": "점심 12000"}]


def test_openai_응답에서_본문을_읽고_거부는_예외다(openai) -> None:
    payload = {
        "status": "completed",
        "output": [
            {"type": "reasoning", "summary": []},
            {"type": "message", "content": [{"type": "output_text", "text": '{"candidates":[]}'}]},
        ],
    }
    assert openai._text_from(payload) == '{"candidates":[]}'
    with pytest.raises(LlmError):
        openai._text_from(
            {"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "x"}]}]}
        )
    with pytest.raises(LlmSchemaError):
        openai._text_from({"status": "incomplete", "incomplete_details": {"reason": "max"}})
