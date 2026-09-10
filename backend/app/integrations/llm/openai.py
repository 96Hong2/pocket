"""OpenAI. Gemini 가 안 맞을 때 바꿔 끼우는 예비 provider 다.

Responses API 에 json_schema strict 형식을 실어 구조화 응답을 받는다.
`store: false` 로 보낸다. 켜 두면 요청·응답이 30일 동안 OpenAI 쪽에 남는다.
"""

from __future__ import annotations

import base64
from typing import Any

from app.integrations.llm.port import LlmError, LlmImage, LlmSchemaError
from app.integrations.llm.remote import IMAGE_LEAD, MAX_OUTPUT_TOKENS, RemoteStructuredClient

__all__ = ["OPENAI_DEFAULT_MODEL", "OPENAI_ESCALATION_MODEL", "OpenAiStructuredClient"]

# gpt-5-mini 는 2026-12-11 에 내려간다. 후속 중 이미지·strict 스키마를 다 하면서
# 가장 싼 것이 luna 다($0.20/$1.20). 재시도용은 terra($2/$12) 라 되도록 안 부른다.
OPENAI_DEFAULT_MODEL = "gpt-5.6-luna"
OPENAI_ESCALATION_MODEL = "gpt-5.6-terra"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"


class OpenAiStructuredClient(RemoteStructuredClient):
    @property
    def provider(self) -> str:
        return "openai"

    def _url(self) -> str:
        return OPENAI_RESPONSES_URL

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._api_key}"}

    def _build_body(
        self,
        *,
        prompt: str,
        schema_name: str,
        schema_json: dict[str, Any],
        text: str | None,
        image: LlmImage | None,
    ) -> dict[str, Any]:
        content: list[dict[str, Any]]
        if image is not None:
            encoded = base64.b64encode(image.data).decode("ascii")
            content = [
                {"type": "input_text", "text": IMAGE_LEAD},
                {
                    "type": "input_image",
                    "image_url": f"data:{image.media_type};base64,{encoded}",
                    # 영수증 글자가 작다. 축소된 상태로 읽히면 숫자가 틀린다.
                    "detail": "high",
                },
            ]
        else:
            content = [{"type": "input_text", "text": text}]

        body: dict[str, Any] = {
            "model": self.model,
            "instructions": prompt,
            "input": [{"role": "user", "content": content}],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "schema": schema_json,
                    "strict": True,
                }
            },
            "store": False,
            "max_output_tokens": MAX_OUTPUT_TOKENS,
        }
        # 옮겨 적는 일에 긴 추론은 값만 든다. 다만 사진은 조금은 봐야 해서 아예 끄지 않는다.
        # 5.6 계열은 none 까지 받지만 영수증에서 자릿수를 놓쳐 low 로 둔다.
        if self.model.startswith("gpt-5"):
            body["reasoning"] = {"effort": "low"}
        return body

    def _text_from(self, payload: dict[str, Any]) -> str:
        if payload.get("error"):
            raise LlmError("openai 가 오류를 돌려줬다")
        if payload.get("status") == "incomplete":
            details = payload.get("incomplete_details")
            reason = details.get("reason") if isinstance(details, dict) else None
            raise LlmSchemaError(f"openai 응답이 끝나지 않았다 reason={reason}")

        texts: list[str] = []
        output = payload.get("output")
        for item in output if isinstance(output, list) else []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for part in item.get("content") or []:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "refusal":
                    raise LlmError("openai 가 요청을 거부했다")
                if part.get("type") == "output_text":
                    texts.append(str(part.get("text", "")))
        text = "".join(texts)
        if not text:
            raise LlmSchemaError("openai 응답 본문이 비었다")
        return text

    def _usage_summary(self, payload: dict[str, Any]) -> str:
        usage = payload.get("usage")
        if not isinstance(usage, dict):
            return ""
        details = usage.get("output_tokens_details")
        reasoning = details.get("reasoning_tokens", 0) if isinstance(details, dict) else 0
        return (
            f"tokens input={usage.get('input_tokens', 0)}"
            f" output={usage.get('output_tokens', 0)} reasoning={reasoning}"
        )
