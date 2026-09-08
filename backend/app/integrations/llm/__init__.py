"""LLM 연동. provider SDK 는 이 패키지 밖으로 새지 않는다."""

from app.integrations.llm.contracts import (
    DEFAULT_CATEGORY_HINTS,
    LOW_CONFIDENCE_THRESHOLD,
    ExtractedTransaction,
    ParseMeta,
    ParseResult,
    TransactionCandidate,
    TransactionExtraction,
    TransactionSource,
    TransactionType,
    attach_source,
)
from app.integrations.llm.factory import get_llm_client
from app.integrations.llm.gemini import GEMINI_DEFAULT_MODEL, GeminiStructuredClient
from app.integrations.llm.openai import OPENAI_DEFAULT_MODEL, OpenAiStructuredClient
from app.integrations.llm.port import (
    LlmError,
    LlmImage,
    LlmInputError,
    LlmSchemaError,
    LlmStructuredClient,
    LlmUnavailableError,
    build_meta,
)
from app.integrations.llm.prompts import (
    RECEIPT_TASK_MARKER,
    natural_language_prompt,
    receipt_prompt,
    screenshot_prompt,
)
from app.integrations.llm.stub import StubLlmStructuredClient

__all__ = [
    "DEFAULT_CATEGORY_HINTS",
    "GEMINI_DEFAULT_MODEL",
    "LOW_CONFIDENCE_THRESHOLD",
    "OPENAI_DEFAULT_MODEL",
    "RECEIPT_TASK_MARKER",
    "ExtractedTransaction",
    "GeminiStructuredClient",
    "LlmError",
    "LlmImage",
    "LlmInputError",
    "LlmSchemaError",
    "LlmStructuredClient",
    "LlmUnavailableError",
    "OpenAiStructuredClient",
    "ParseMeta",
    "ParseResult",
    "StubLlmStructuredClient",
    "TransactionCandidate",
    "TransactionExtraction",
    "TransactionSource",
    "TransactionType",
    "attach_source",
    "build_meta",
    "get_llm_client",
    "natural_language_prompt",
    "receipt_prompt",
    "screenshot_prompt",
]
