"""FastAPI 앱 조립.

프론트는 이 앱만 부른다. DB 나 토스 서버 API 를 직접 부르지 않는다.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import install_exception_handlers
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.modules.transactions import router as transactions_router

__all__ = ["app", "create_app"]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="10초 가계부 API",
        version="0.1.0",
        description=(
            "앱인토스 미니앱의 백엔드. 인증은 X-Anon-Key 헤더 하나뿐이고 로그인 화면이 없다."
        ),
    )

    # 미니앱 WebView 와 QR 테스트 origin 을 모두 허용한다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Anon-Key"],
    )

    install_exception_handlers(app)
    app.include_router(transactions_router, prefix="/api/v1")

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    return app


app = create_app()
