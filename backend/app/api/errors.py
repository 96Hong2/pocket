"""도메인·연동 오류를 하나의 HTTP 응답 형태로 옮긴다.

응답 본문은 항상 {"error": {"code": ..., "message": ...}} 다.
화면은 code 로 분기하고 message 는 사람이 읽는 용도로만 쓴다.

code 값의 정본은 아래 ErrorCode 다. 문자열을 라우터·서비스에 흩어 적지 않는다.
ErrorEnvelope 를 라우터의 responses 에 걸어야 openapi.json 에 실려서
프론트 생성 타입에서도 code 가 문자열이 아니라 값 목록으로 남는다.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.exc import DataError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import get_settings
from app.integrations.apps_in_toss.anon_key import (
    AnonKeyAuthError,
    AnonKeyVerificationUnavailable,
)

logger = logging.getLogger(__name__)

__all__ = [
    "ERROR_RESPONSES",
    "ApiError",
    "ErrorBody",
    "ErrorCode",
    "ErrorEnvelope",
    "install_exception_handlers",
]


class ErrorCode(StrEnum):
    """오류 code 의 유일한 정의. docs/API_CONTRACT.md 의 표가 이 값을 설명한다."""

    UNAUTHORIZED = "UNAUTHORIZED"
    VERIFY_UNAVAILABLE = "VERIFY_UNAVAILABLE"
    NOT_FOUND = "NOT_FOUND"
    UNDO_EXPIRED = "UNDO_EXPIRED"
    CONFLICT = "CONFLICT"
    INVALID_REQUEST = "INVALID_REQUEST"
    INVALID_CATEGORY = "INVALID_CATEGORY"
    INVALID_REFUND_TARGET = "INVALID_REFUND_TARGET"
    HTTP_ERROR = "HTTP_ERROR"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ErrorBody(BaseModel):
    code: ErrorCode
    message: str


class ErrorEnvelope(BaseModel):
    error: ErrorBody


# 라우터에 걸어 스펙에 오류 봉투를 싣는다.
# 422 를 반드시 넣는다. 빠지면 FastAPI 가 기본 HTTPValidationError 를 대신 채워 넣어
# 실제로 나가는 봉투와 다른 모양이 스펙에 남는다.
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorEnvelope, "description": "식별키가 없거나 검증에 실패"},
    404: {"model": ErrorEnvelope, "description": "없거나 내 것이 아님"},
    409: {"model": ErrorEnvelope, "description": "되돌리기 만료·동시 저장"},
    422: {"model": ErrorEnvelope, "description": "요청 값 오류"},
    500: {"model": ErrorEnvelope, "description": "서버 오류"},
    503: {"model": ErrorEnvelope, "description": "검증 서버가 일시적으로 응답하지 않음"},
}


class ApiError(Exception):
    """라우터·서비스가 던지는 오류. code 가 화면 분기의 기준이다."""

    def __init__(self, code: ErrorCode, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _body(code: ErrorCode, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code.value, "message": message}}


def _cors_headers(request: Request) -> dict[str, str]:
    """500 응답에 CORS 헤더를 직접 붙인다.

    미처리 예외는 starlette 의 ServerErrorMiddleware 가 잡고, 그 미들웨어가
    CORSMiddleware 보다 바깥에 있다. 그래서 500 만 CORS 헤더 없이 나가고,
    브라우저는 본문을 읽기 전에 차단한다. 화면이 INTERNAL_ERROR 분기를 한 번도
    타지 못하고 늘 "연결이 불안정해요" 로 잘못 말하게 된다.
    """
    origin = request.headers.get("origin")
    if origin is None:
        return {}
    allowed = get_settings().cors_origins
    if origin not in allowed and "*" not in allowed:
        return {}
    return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message))

    @app.exception_handler(AnonKeyAuthError)
    async def _auth_error(_: Request, exc: AnonKeyAuthError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content=_body(ErrorCode.UNAUTHORIZED, "사용자 정보를 확인하지 못했어요."),
        )

    @app.exception_handler(AnonKeyVerificationUnavailable)
    async def _verify_unavailable(_: Request, exc: AnonKeyVerificationUnavailable) -> JSONResponse:
        # 토스 서버가 잠깐 안 될 때다. 사용자 잘못이 아니므로 재시도를 권한다.
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_body(ErrorCode.VERIFY_UNAVAILABLE, "잠시 후 다시 시도해 주세요."),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body(ErrorCode.INVALID_REQUEST, "요청 형식이 올바르지 않아요."),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body(ErrorCode.HTTP_ERROR, str(exc.detail)),
        )

    @app.exception_handler(DataError)
    async def _data_error(_: Request, exc: DataError) -> JSONResponse:
        # 값이 컬럼에 들어갈 수 없을 때다(예: text 에 NUL 바이트).
        # 스키마에서 먼저 막지만, 새 필드가 늘 때 여기가 안전망이다. 500 으로 새지 않게 한다.
        logger.exception("DB 가 받지 못하는 값")
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body(ErrorCode.INVALID_REQUEST, "보낸 값을 저장할 수 없어요."),
        )

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, exc: IntegrityError) -> JSONResponse:
        # 원인 문자열에 값이 섞여 있어 그대로 내보내지 않는다.
        logger.exception("DB 제약 위반")
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=_body(
                ErrorCode.CONFLICT, "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # 이 핸들러가 없으면 500 이 text/plain 으로 나가 오류 봉투 계약이 깨진다.
        # 여기는 CORSMiddleware 밖이라 헤더를 직접 붙여야 브라우저가 본문을 읽는다.
        logger.exception("처리하지 못한 오류")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_body(ErrorCode.INTERNAL_ERROR, "잠시 후 다시 시도해 주세요."),
            headers=_cors_headers(request),
        )
