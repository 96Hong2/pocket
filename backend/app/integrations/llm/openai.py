"""OpenAI. Gemini 가 안 맞을 때 바꿔 끼우는 예비 provider 다.

Responses API 에 json_schema strict 형식을 실어 구조화 응답을 받는다.
`store: false` 로 보낸다. 켜 두면 요청·응답이 30일 동안 OpenAI 쪽에 남는다.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.integrations.llm.port import LlmError, LlmImage, LlmSchemaError
from app.integrations.llm.remote import (
    IMAGE_LEAD,
    MAX_OUTPUT_TOKENS,
    RemoteStructuredClient,
    error_detail,
    error_param,
)

__all__ = ["OPENAI_DEFAULT_MODEL", "OPENAI_ESCALATION_MODEL", "OpenAiStructuredClient"]

# gpt-5-mini 는 2026-12-11 에 내려간다. 후속 중 이미지·strict 스키마를 다 하면서
# 가장 싼 것이 luna 다($0.20/$1.20). 재시도용은 terra($2/$12) 라 되도록 안 부른다.
OPENAI_DEFAULT_MODEL = "gpt-5.6-luna"
OPENAI_ESCALATION_MODEL = "gpt-5.6-terra"
OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

logger = logging.getLogger(__name__)

# 100만 토큰당 달러. 로그에 원화를 적어 두려고 갖고 있다. 값이 바뀌면 여기만 고친다.
# 정확한 청구액이 아니라 **어느 쪽이 값을 쓰는지** 보려는 숫자다.
_PRICES_USD: dict[str, tuple[float, float]] = {
    OPENAI_DEFAULT_MODEL: (0.20, 1.20),
    OPENAI_ESCALATION_MODEL: (2.00, 12.00),
}
_USD_TO_KRW = 1_450


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
                    # 영수증 글자가 작아서 잘게 볼수록 잘 읽히고, 잘게 볼수록 입력 토큰이 는다.
                    # 어느 쪽에 설지는 환경변수가 정한다(`LLM_IMAGE_DETAIL`).
                    "detail": get_settings().llm_image_detail,
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
        # **값의 대부분이 여기서 난다.** 출력 토큰이 전체 값의 69% 이고 그 안에 추론이 들어
        # 있다. 옮겨 적는 일에 긴 추론은 값만 드는데, 너무 낮추면 영수증 자릿수를 놓친다.
        # 어디에 설지는 환경변수가 정한다(`LLM_REASONING_EFFORT`).
        if self.model.startswith("gpt-5"):
            body["reasoning"] = {"effort": get_settings().llm_reasoning_effort}
        return body

    def _without_rejected_option(
        self, response: httpx.Response, body: dict[str, Any]
    ) -> dict[str, Any] | None:
        """이 모델이 안 받는 추론 강도면 그 칸을 빼고 한 번 더 보낸다.

        `LLM_REASONING_EFFORT` 는 **배포 없이 바꾸라고 열어 둔 값이다**(docs/SECRETS.md).
        받는 값의 목록은 모델마다 다르고 모델은 바뀐다. 못 알아듣는 값 하나 때문에 사진
        읽기가 통째로 막히는 것보다, 값이 조금 더 들더라도 읽히는 편이 낫다.

        실제로 그렇게 막혔다. 2026-09-23 밤, 이 모델에 없는 `minimal` 을 기본값으로 올려
        모든 캡처가 400 을 받았고, 화면에는 「지금은 캡처를 읽지 못했어요」 만 떴다.
        """
        reasoning = body.get("reasoning")
        effort = reasoning.get("effort") if isinstance(reasoning, dict) else None
        if response.status_code != 400 or not effort:
            return None
        # 400 은 여러 이유로 난다. 추론 강도를 짚은 것만 골라야 한다.
        #
        # **어느 칸 때문인지는 `param` 이 정본이다.** 메시지만 보면 엉뚱한 것을 뺀다.
        # 거절 메시지가 받는 값의 목록을 함께 적는데(`Supported values are: 'none', 'low', ...`)
        # 그 목록에 `low` 와 `high` 가 있고 사진 detail 도 같은 이름을 쓴다. 그래서 detail 이
        # 틀려서 난 400 을 「추론 강도가 거절당했다」 로 읽어 엉뚱한 칸을 뺄 수 있다.
        #
        # `param` 이 비는 provider 도 있어 메시지로도 가르되, 목록에 끼어 있는 것과
        # 구별되게 「그 값이 거절당했다」 는 모양을 요구한다.
        param = error_param(response)
        if param:
            if not param.startswith("reasoning"):
                return None
        elif f"'{effort}' is not supported" not in error_detail(response):
            return None
        logger.warning("openai 가 effort=%s 를 안 받아서 빼고 다시 부른다", effort)
        return {key: value for key, value in body.items() if key != "reasoning"}

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

    def _usage_summary(self, payload: dict[str, Any], body: dict[str, Any]) -> str:
        usage = payload.get("usage")
        if not isinstance(usage, dict):
            return ""
        details = usage.get("output_tokens_details")
        reasoning = details.get("reasoning_tokens", 0) if isinstance(details, dict) else 0
        sent = int(usage.get("input_tokens", 0) or 0)
        back = int(usage.get("output_tokens", 0) or 0)
        return (
            f"tokens input={sent} output={back} reasoning={reasoning}"
            # 어느 손잡이를 어디에 두고 얼마가 들었는지 한 줄에 같이 남긴다. 나중에
            # 되돌릴지 정하는 근거가 로그 두 줄을 맞춰 보는 일이 되면 아무도 안 본다.
            f" won={self._won(sent, back):.2f}"
            f" detail={get_settings().llm_image_detail}"
            # 설정값이 아니라 **이 호출에 실제로 실린 값**을 적는다. 모델이 거절해서 빼고
            # 다시 부른 호출을 설정값으로 적으면, 이 줄을 근거로 손잡이를 판정할 수 없다.
            f" effort={self._effort_of_body(body)}"
        )

    @staticmethod
    def _effort_of_body(body: dict[str, Any]) -> str:
        reasoning = body.get("reasoning")
        if not isinstance(reasoning, dict):
            return "dropped"
        return str(reasoning.get("effort", "dropped"))

    def _won(self, sent: int, back: int) -> float:
        """이 한 번에 든 값(원). 청구액이 아니라 손잡이를 비교하려는 어림수다."""
        price = _PRICES_USD.get(self.model)
        if price is None:
            return 0.0
        return (sent * price[0] + back * price[1]) / 1_000_000 * _USD_TO_KRW
