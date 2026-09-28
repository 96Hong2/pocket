"""로그에 값이 남지 않는지 지킨다.

가장 새기 쉬운 통로가 트레이스백이다. 예외 문자열에 값이 실려 와도 출력에는 남으면 안 된다.
DB 바인딩 값은 그 앞단에서 엔진이 먼저 막는다.
"""

from __future__ import annotations

import io
import json
import logging

import pytest

from app.core.config import get_settings
from app.core.logging import SensitiveDataFilter, build_formatter
from app.db.session import get_engine

CARD = "4111111111111111"
KEY_HASH = "e21ba60f79705726dfb97d50f312a1c4974f33eff038cf254305fbc29a0e79a9"


def _emit_exception(detail: str) -> dict:
    """configure_logging 과 같은 조합(필터 + JSON 포매터)으로 한 줄을 뽑는다."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(build_formatter())
    handler.addFilter(SensitiveDataFilter())

    logger = logging.getLogger("tests.logging.masking")
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.ERROR)
    try:
        try:
            raise RuntimeError(detail)
        except RuntimeError:
            logger.exception("DB 제약 위반")
    finally:
        logger.handlers = []
    return json.loads(stream.getvalue())


def test_트레이스백에_실린_값도_가린다() -> None:
    """PostgreSQL 은 unique 위반의 DETAIL 줄에 값을 그대로 실어 보낸다."""
    line = _emit_exception(
        f"UNIQUE 위반 [parameters: ('{CARD}',)] DETAIL:  Key (anon_key_hash)=({KEY_HASH})"
    )
    dumped = json.dumps(line, ensure_ascii=False)
    assert CARD not in dumped
    assert KEY_HASH not in dumped
    assert "[redacted]" in line["exc_info"]


def test_엔진이_SQL_파라미터를_오류에_붙이지_않는다(monkeypatch: pytest.MonkeyPatch) -> None:
    """붙으면 IntegrityError 문자열을 타고 트레이스백째 로그로 나간다.

    create_engine 은 접속하지 않으므로 붙지 않는 주소를 준다.
    """
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://none:none@127.0.0.1:1/none")
    get_settings.cache_clear()
    get_engine.cache_clear()
    try:
        assert get_engine().hide_parameters is True
    finally:
        get_settings.cache_clear()
        get_engine.cache_clear()


def test_접근_로그의_초대_코드를_가린다() -> None:
    """초대 코드는 7일 동안 누구든 합류시키는 열쇠다. uvicorn 접근 로그의 경로에 그대로 실린다."""
    code = "AbC_12-xyZ9-"
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(build_formatter())
    handler.addFilter(SensitiveDataFilter())

    logger = logging.getLogger("tests.logging.access")
    logger.handlers = [handler]
    logger.propagate = False
    logger.setLevel(logging.INFO)
    try:
        # uvicorn.access 와 같은 모양: 형식 문자열과 인자가 따로 온다.
        logger.info(
            '%s - "%s %s HTTP/%s" %d',
            "1.2.3.4:5",
            "POST",
            f"/api/v1/invites/{code}/join",
            "1.1",
            200,
        )
        logger.info(
            '%s - "%s %s HTTP/%s" %d', "1.2.3.4:5", "GET", f"/api/v1/invites/{code}", "1.1", 200
        )
    finally:
        logger.handlers = []

    lines = [json.loads(line) for line in stream.getvalue().splitlines()]
    assert [line["message"] for line in lines] == [
        '1.2.3.4:5 - "POST /api/v1/invites/[redacted]/join HTTP/1.1" 200',
        '1.2.3.4:5 - "GET /api/v1/invites/[redacted] HTTP/1.1" 200',
    ]
    assert code not in stream.getvalue()
