"""실제 provider 를 HTTP 로 부르는 공통 뼈대.

SDK 를 쓰지 않는다. 두 provider 모두 요청 하나·응답 하나라 httpx 로 충분하고, SDK 를 넣으면
의존성과 버전 추적이 둘로 늘어 이미지만 무거워진다.

원문(프롬프트·입력·응답 본문)을 로그와 예외에 남기지 않는다. 남기는 것은 상태코드·토큰 수·
걸린 시간뿐이다. provider 가 돌려준 오류 메시지도 앞 200자만 남긴다.
"""

from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from datetime import date
from typing import Any

import httpx

from app.integrations.llm.port import (
    LlmError,
    LlmImage,
    LlmSchemaError,
    LlmUnavailableError,
    SchemaT,
    require_single_input,
)
from app.integrations.llm.schema import provider_json_schema, validate_response

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT_SECONDS = 5.0
# 한 번만 다시 부른다. 두 번째도 안 되면 사용자에게 잠시 뒤 다시 하라고 말하는 편이 낫다.
RETRY_DELAY_SECONDS = 1.0
MAX_OUTPUT_TOKENS = 4096

_RETRYABLE_STATUS = frozenset({408, 409, 425, 429, 500, 502, 503, 504})
_ERROR_DETAIL_LIMIT = 200

# 이미지와 함께 보내는 한 줄. 규칙은 system 자리에 있고, 사용자 자리에 글자가 하나도 없으면
# 이미지만 보고 무엇을 하라는 건지 모르는 모델이 있다.
IMAGE_LEAD = "이 이미지가 입력이다. 규칙대로 읽어 JSON 으로 낸다."


class RemoteStructuredClient(ABC):
    """HTTP 로 부르는 provider 의 공통 부분. 요청 모양과 응답 봉투만 자식이 정한다."""

    def __init__(self, *, api_key: str, model: str, timeout_seconds: float) -> None:
        if not api_key:
            raise ValueError(f"{self.provider} API 키가 비어 있다")
        self._api_key = api_key
        self.model = model
        self._http = httpx.AsyncClient(
            timeout=httpx.Timeout(timeout_seconds, connect=CONNECT_TIMEOUT_SECONDS)
        )
        logger.info("LLM provider=%s model=%s", self.provider, model)

    @property
    @abstractmethod
    def provider(self) -> str: ...

    @property
    def is_stub(self) -> bool:
        return False

    async def extract(
        self,
        *,
        prompt: str,
        schema: type[SchemaT],
        text: str | None = None,
        image: LlmImage | None = None,
        today: date | None = None,
    ) -> SchemaT:
        require_single_input(text, image)
        # 오늘 날짜는 프롬프트에 이미 적혀 있다. 여기서 또 쓰면 두 값이 어긋날 자리가 생긴다.
        del today
        body = self._build_body(
            prompt=prompt,
            schema_name=schema.__name__,
            schema_json=provider_json_schema(schema),
            text=text,
            image=image,
        )
        started = time.monotonic()
        payload = await self._post(body)
        result = validate_response(self._text_from(payload), schema)
        logger.info(
            "LLM extract provider=%s model=%s input=%s elapsed_ms=%d %s",
            self.provider,
            self.model,
            "image" if image is not None else "text",
            int((time.monotonic() - started) * 1000),
            self._usage_summary(payload),
        )
        return result

    # ── 자식이 정하는 것 ──────────────────────────────────

    @abstractmethod
    def _url(self) -> str: ...

    @abstractmethod
    def _headers(self) -> dict[str, str]: ...

    @abstractmethod
    def _build_body(
        self,
        *,
        prompt: str,
        schema_name: str,
        schema_json: dict[str, Any],
        text: str | None,
        image: LlmImage | None,
    ) -> dict[str, Any]: ...

    @abstractmethod
    def _text_from(self, payload: dict[str, Any]) -> str:
        """응답 봉투에서 JSON 본문을 꺼낸다. 거부·잘림이면 예외."""

    def _usage_summary(self, payload: dict[str, Any]) -> str:
        del payload
        return ""

    # ── 공통 ──────────────────────────────────────────────

    async def _post(self, body: dict[str, Any]) -> dict[str, Any]:
        for attempt in (1, 2):
            error: LlmError
            cause: BaseException | None = None
            try:
                response = await self._http.post(self._url(), headers=self._headers(), json=body)
            except httpx.TimeoutException as exc:
                error, cause = LlmUnavailableError(f"{self.provider} 응답 시간 초과"), exc
            except httpx.HTTPError as exc:
                error, cause = LlmUnavailableError(f"{self.provider} 연결 실패"), exc
            else:
                if response.status_code == 200:
                    return self._json_object(response)
                error = self._http_error(response)
            if not error.retryable or attempt == 2:
                raise error from cause
            await asyncio.sleep(RETRY_DELAY_SECONDS)
        raise AssertionError("unreachable")

    def _json_object(self, response: httpx.Response) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError:
            raise LlmSchemaError(f"{self.provider} 응답이 JSON 이 아니다") from None
        if not isinstance(payload, dict):
            raise LlmSchemaError(f"{self.provider} 응답 봉투 모양이 다르다")
        return payload

    def _http_error(self, response: httpx.Response) -> LlmError:
        status = response.status_code
        logger.warning("LLM provider=%s HTTP %d %s", self.provider, status, _error_detail(response))
        message = f"{self.provider} HTTP {status}"
        if status in _RETRYABLE_STATUS:
            return LlmUnavailableError(message)
        return LlmError(message)


def _error_detail(response: httpx.Response) -> str:
    """provider 오류 메시지 앞부분. 키·입력이 섞일 수 있어 길이를 자른다."""
    try:
        payload = response.json()
    except ValueError:
        return ""
    error = payload.get("error") if isinstance(payload, dict) else None
    message = error.get("message") if isinstance(error, dict) else None
    return str(message)[:_ERROR_DETAIL_LIMIT] if message else ""
