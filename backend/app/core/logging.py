"""구조화(JSON) 로깅 설정.

OCR/LLM 원문과 사용자가 입력한 본문은 로그에 남기지 않는다.
값이 실수로 넘어와도 포매터 앞단에서 잘라낸다. 메시지·extra 뿐 아니라 트레이스백도 본다.
DB 바인딩 값은 여기까지 오기 전에 엔진의 hide_parameters 가 먼저 막는다.
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
# 익명 식별키 해시처럼 긴 16진수 문자열도 가린다.
# PostgreSQL 은 unique 위반 오류의 DETAIL 줄에 값을 그대로 실어 보낸다.
_LONG_HEX = re.compile(r"\b[0-9a-fA-F]{32,}\b")
_MASKS = (_LONG_HEX, _LONG_DIGITS)

_RESERVED = frozenset(logging.LogRecord("", 0, "", 0, "", None, None).__dict__)

# 트레이스백을 미리 문자열로 만들 때 쓴다. 포매터가 붙기 전 단계라 기본 포맷이면 된다.
_TRACEBACK_FORMATTER = logging.Formatter()


def _mask(text: str) -> str:
    for pattern in _MASKS:
        text = pattern.sub(REDACTED, text)
    return text


def _mask_traceback(record: logging.LogRecord) -> None:
    """트레이스백에 실려 온 값도 가린다.

    포매터는 exc_info 가 남아 있으면 그것을 직접 포맷한다. 그래서 여기서 문자열로
    만들어 가린 뒤 exc_info 를 비워야 가린 쪽이 출력된다.
    """
    if record.exc_info:
        record.exc_text = record.exc_text or _TRACEBACK_FORMATTER.formatException(record.exc_info)
        record.exc_info = None
    if record.exc_text:
        record.exc_text = _mask(record.exc_text)
    if record.stack_info:
        record.stack_info = _mask(record.stack_info)


class SensitiveDataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(record.__dict__):
            if key in _RESERVED or key.startswith("_"):
                continue
            if key.lower() in SENSITIVE_KEYS:
                record.__dict__[key] = REDACTED

        if isinstance(record.msg, str):
            record.msg = _mask(record.msg)
        if record.args:
            record.msg = record.getMessage()
            record.args = ()
            record.msg = _mask(record.msg)
        _mask_traceback(record)
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
