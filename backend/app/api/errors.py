"""도메인·연동 오류를 하나의 HTTP 응답 형태로 옮긴다.

응답 본문은 항상 {"error": {"code": ..., "message": ...}} 다.
화면은 code 로 분기하고 message 는 사람이 읽는 용도로만 쓴다.
"""

from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.integrations.apps_in_toss.anon_key import (
    AnonKeyAuthError,
    AnonKeyVerificationUnavailable,
)

__all__ = ["ApiError", "install_exception_handlers"]


class ApiError(Exception):
    """라우터·서비스가 던지는 오류. code 가 화면 분기의 기준이다."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _body(code: str, message: str) -> dict[str, dict[str, str]]:
    return {"error": {"code": code, "message": message}}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_body(exc.code, exc.message))

    @app.exception_handler(AnonKeyAuthError)
    async def _auth_error(_: Request, exc: AnonKeyAuthError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content=_body("UNAUTHORIZED", "사용자 정보를 확인하지 못했어요."),
        )

    @app.exception_handler(AnonKeyVerificationUnavailable)
    async def _verify_unavailable(_: Request, exc: AnonKeyVerificationUnavailable) -> JSONResponse:
        # 토스 서버가 잠깐 안 될 때다. 사용자 잘못이 아니므로 재시도를 권한다.
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_body("VERIFY_UNAVAILABLE", "잠시 후 다시 시도해 주세요."),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_body("INVALID_REQUEST", "요청 형식이 올바르지 않아요."),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_body("HTTP_ERROR", str(exc.detail)),
        )
