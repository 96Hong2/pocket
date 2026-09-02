"""구조화(JSON) 로깅 설정.

OCR/LLM 원문과 사용자가 입력한 본문은 로그에 남기지 않는다.
값이 실수로 넘어와도 포매터 앞단에서 잘라낸다.
"""

from __future__ import annotations

import logging
import re
import sys
from typing import Any

from pythonjsonlogger.json import JsonFormatter

REDACTED = "[redacted]"

# 원문이 담길 수 있는 키. extra 로 들어와도 값을 지운다.
SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "raw_text",
        "ocr_text",
        "ocr_raw",
        "llm_input",
        "llm_output",
        "llm_raw",
        "prompt",
        "completion",
        "user_input",
        "input_text",
        "note",
        "memo",
        "image",
        "image_data",
        "data_uri",
        "base64",
        "anon_key",
        "authorization",
        "x_anon_key",
    }
)

# 계좌·카드번호로 보이는 긴 숫자열을 메시지에서 가린다.
_LONG_DIGITS = re.compile(r"\b(?:\d[ -]?){9,}\d\b")

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__)


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key in _RESERVED or key.startswith("_"):
                continue
            if key.lower() in SENSITIVE_KEYS:
                record.__dict__[key] = REDACTED

        if isinstance(record.msg, str):
            record.msg = _LONG_DIGITS.sub(REDACTED, record.msg)
        if record.args:
            record.msg = record.getMessage()
            record.args = ()
            record.msg = _LONG_DIGITS.sub(REDACTED, record.msg)
        return True


def build_formatter() -> JsonFormatter:
    return JsonFormatter(
        "{asctime}{levelname}{name}{message}",
        style="{",
        rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
    )


def configure_logging(level: str = "INFO") -> None:
    """루트 로거를 JSON 한 줄 출력으로 교체한다. 애플리케이션 기동 시 한 번만 호출한다."""
    handler = logging.StreamHandler(stream=sys.stdout)
    handler.setFormatter(build_formatter())
    handler.addFilter(SensitiveDataFilter())

    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
    root.addHandler(handler)
    root.setLevel(level.upper())

    # uvicorn 이 자체 핸들러를 붙여 두면 같은 줄이 두 번 찍힌다.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True


def get_logger(name: str, **context: Any) -> logging.LoggerAdapter[logging.Logger]:
    """공통 컨텍스트를 붙인 로거. 컨텍스트에 원문·개인정보를 넣지 않는다."""
    return logging.LoggerAdapter(logging.getLogger(name), context)
