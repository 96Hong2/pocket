"""Gemini. 기본 provider 다.

generateContent 에 responseJsonSchema 를 실어 구조화 응답을 받는다.
유료 등급 키를 써야 한다. 무료 등급은 보낸 입력을 Google 이 제품 개선에 쓴다(docs/SECRETS.md §4).
"""

from __future__ import annotations

import base64
from typing import Any

from app.integrations.llm.port import LlmError, LlmImage, LlmSchemaError
from app.integrations.llm.remote import IMAGE_LEAD, MAX_OUTPUT_TOKENS, RemoteStructuredClient

__all__ = ["GEMINI_DEFAULT_MODEL", "GeminiStructuredClient"]

# 2026-09-10 에 2.5 Flash 로 두면 새 키에서 404 가 난다("no longer available to new users").
# 구글이 후속으로 지목한 모델이 3.6 Flash 다. ADR 0016 이 예고한 대로 따라 올린 것이다.
GEMINI_DEFAULT_MODEL = "gemini-3.6-flash"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"

_NORMAL_FINISH = frozenset({None, "STOP"})


class GeminiStructuredClient(RemoteStructuredClient):
    @property
    def provider(self) -> str:
        return "gemini"

    def _url(self) -> str:
        return f"{GEMINI_BASE_URL}/v1beta/models/{self.model}:generateContent"

    def _headers(self) -> dict[str, str]:
        return {"x-goog-api-key": self._api_key}

    def _build_body(
        self,
        *,
        prompt: str,
        schema_name: str,
        schema_json: dict[str, Any],
        text: str | None,
        image: LlmImage | None,
    ) -> dict[str, Any]:
        del schema_name
        parts: list[dict[str, Any]]
        if image is not None:
            parts = [
                {"text": IMAGE_LEAD},
                {
                    "inline_data": {
                        "mime_type": image.media_type,
                        "data": base64.b64encode(image.data).decode("ascii"),
                    }
                },
            ]
        else:
            parts = [{"text": text}]

        config: dict[str, Any] = {
            "responseMimeType": "application/json",
            "responseJsonSchema": schema_json,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        }
        # 2.5 Flash 는 기본으로 생각(thinking)을 켠다. 옮겨 적는 일에 생각 토큰은 출력 단가로
        # 값만 들고 정확도를 올리지 않는다. Pro 는 끌 수 없어 모델 이름으로 가른다.
        #
        # 3.x 는 이 필드를 여기 넣지 않는다. 끄는 방법이 달라서, 안 받는 필드를 보내면
        # 모든 호출이 통째로 막힌다. 값이 신경 쓰이면 실제 청구를 보고 나서 그때 맞춘다.
        if self.model.startswith("gemini-2.5-flash"):
            config["thinkingConfig"] = {"thinkingBudget": 0}
        return {
            "systemInstruction": {"parts": [{"text": prompt}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": config,
        }

    def _text_from(self, payload: dict[str, Any]) -> str:
        feedback = payload.get("promptFeedback")
        block = feedback.get("blockReason") if isinstance(feedback, dict) else None
        if block:
            raise LlmError(f"gemini 가 요청을 거부했다 blockReason={block}")

        candidates = payload.get("candidates")
        first = candidates[0] if isinstance(candidates, list) and candidates else None
        if not isinstance(first, dict):
            raise LlmSchemaError("gemini 응답에 후보가 없다")

        finish = first.get("finishReason")
        if finish == "MAX_TOKENS":
            raise LlmSchemaError("gemini 응답이 길이 상한에서 잘렸다")
        if finish not in _NORMAL_FINISH:
            raise LlmError(f"gemini 가 끝내지 못했다 finishReason={finish}")

        content = first.get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        text = "".join(
            str(part.get("text", ""))
            for part in (parts if isinstance(parts, list) else [])
            # 생각 조각은 본문이 아니다. 섞이면 JSON 앞에 문장이 붙는다.
            if isinstance(part, dict) and not part.get("thought")
        )
        if not text:
            raise LlmSchemaError("gemini 응답 본문이 비었다")
        return text

    def _usage_summary(self, payload: dict[str, Any]) -> str:
        usage = payload.get("usageMetadata")
        if not isinstance(usage, dict):
            return ""
        return (
            f"tokens prompt={usage.get('promptTokenCount', 0)}"
            f" output={usage.get('candidatesTokenCount', 0)}"
            f" thoughts={usage.get('thoughtsTokenCount', 0)}"
        )
