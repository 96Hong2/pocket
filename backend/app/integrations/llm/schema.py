"""provider 에 보낼 JSON 스키마와 돌아온 본문을 다루는 공통 자리.

pydantic 이 만드는 스키마를 그대로 보내지 않는다. `$ref`·`title`·`default`·`maxLength` 처럼
provider 가 모르거나 거부하는 키가 섞여 있고, OpenAI strict 모드는 모든 속성을 required 로
요구한다. 여기서 한 번 다듬어 두 provider 가 같은 모양을 쓴다.

돌아온 본문을 검증할 때 원문을 예외에 싣지 않는다. pydantic 의 ValidationError 문자열에는
입력값이 들어 있어, 그대로 올리면 상호·금액이 로그에 남는다.
"""

from __future__ import annotations

from functools import cache
from typing import Any

from pydantic import BaseModel, ValidationError

from app.integrations.llm.port import LlmSchemaError, SchemaT

__all__ = ["provider_json_schema", "validate_response"]

# provider 가 모르거나(strict 모드에서) 거부하는 키. 검증은 어차피 pydantic 이 다시 한다.
_DROPPED_KEYS = frozenset({"title", "default", "maxLength", "minLength"})
_MAX_ERROR_LOCS = 5


@cache
def provider_json_schema(model: type[BaseModel]) -> dict[str, Any]:
    """provider 에 보낼 스키마. `$ref` 를 풀고 모든 속성을 required 로 만든다.

    optional 필드는 pydantic 이 이미 `anyOf: [..., null]` 로 내므로 required 에 넣어도
    모델이 null 을 낼 수 있다. 두 provider 가 이 모양을 받는다.
    """
    raw = model.model_json_schema()
    defs: dict[str, Any] = raw.pop("$defs", {})
    shaped = _shape(raw, defs)
    assert isinstance(shaped, dict)
    return shaped


def _shape(node: Any, defs: dict[str, Any]) -> Any:
    if isinstance(node, list):
        return [_shape(item, defs) for item in node]
    if not isinstance(node, dict):
        return node
    if "$ref" in node:
        name = str(node["$ref"]).rsplit("/", 1)[-1]
        merged = {**defs[name], **{k: v for k, v in node.items() if k != "$ref"}}
        return _shape(merged, defs)

    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in _DROPPED_KEYS:
            continue
        out[key] = _shape(value, defs)

    # `gt=0` 은 exclusiveMinimum 으로 나온다. 정수라면 minimum 으로 바꿔도 같은 뜻이고,
    # 지원 목록에 exclusiveMinimum 을 안 적은 provider 도 받는다.
    if out.get("type") == "integer" and "exclusiveMinimum" in out:
        out["minimum"] = out.pop("exclusiveMinimum") + 1
    if out.get("type") == "object" and "properties" in out:
        out["additionalProperties"] = False
        out["required"] = list(out["properties"])
    return out


def validate_response(raw: str, schema: type[SchemaT]) -> SchemaT:
    """본문을 스키마로 검증한다. 실패하면 어디가 틀렸는지만 남기고 값은 버린다."""
    try:
        return schema.model_validate_json(raw)
    except ValidationError as exc:
        locs = sorted(
            {
                ".".join(str(part) for part in error["loc"]) or "$"
                for error in exc.errors(include_url=False, include_input=False)
            }
        )[:_MAX_ERROR_LOCS]
        # from None 으로 원인을 끊는다. ValidationError 의 문자열에는 입력값이 들어 있다.
        raise LlmSchemaError(
            f"응답이 {schema.__name__} 스키마와 맞지 않는다: {exc.error_count()}건 {locs}"
        ) from None
