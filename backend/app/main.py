"""FastAPI 앱 조립.

프론트는 이 앱만 부른다. DB 나 토스 서버 API 를 직접 부르지 않는다.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.body_limit import BodySizeLimitMiddleware
from app.api.deps import get_verifier
from app.api.errors import install_exception_handlers
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.integrations.llm import get_llm_client
from app.modules.assets import router as assets_router
from app.modules.budgets import router as budgets_router
from app.modules.categories import router as categories_router
from app.modules.goals import router as goals_router
from app.modules.imports import router as imports_router
from app.modules.merchant_rules import router as merchant_rules_router
from app.modules.notifications import router as notifications_router
from app.modules.reports import router as reports_router
from app.modules.settings import router as settings_router
from app.modules.transactions import router as transactions_router

__all__ = ["app", "create_app"]


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    # 익명키 검증기를 여기서 한 번 만든다.
    # 요청 시점에만 만들면 설정이 잘못된 리비전도 /health 가 200 이라 배포가 성공으로 보인다.
    # 인증서가 없는 운영 배포는 첫 요청 500 이 아니라 기동 실패로 드러나야 한다.
    get_verifier(settings)
    # 어떤 모델이 도는지 기동 로그에 한 줄 남긴다. 스텁이 운영에 올라간 것을 첫 사진에서 알면 늦다.
    get_llm_client()

    # 로컬에서만 대화형 문서를 연다. 판단은 Settings 가 한다.
    interactive_docs = settings.expose_interactive_docs

    app = FastAPI(
        title="10초 가계부 API",
        version="0.1.0",
        description=(
            "앱인토스 미니앱의 백엔드. 인증은 X-Anon-Key 헤더 하나뿐이고 로그인 화면이 없다."
        ),
        docs_url="/docs" if interactive_docs else None,
        redoc_url="/redoc" if interactive_docs else None,
        openapi_url="/openapi.json" if interactive_docs else None,
    )

    # 미니앱 WebView 와 QR 테스트 origin 을 모두 허용한다.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        # 예산 저장이 PUT 이다. 빠지면 브라우저가 preflight 에서 400 을 받아 저장 자체가 막힌다.
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Anon-Key"],
    )

    # **CORS 보다 바깥에 선다.** 나중에 더한 미들웨어가 먼저 도는 구조라 이 줄이 마지막이다.
    # 본문을 읽기 전에 끊어야 의미가 있어서, 라우팅·인증보다 앞이어야 한다.
    app.add_middleware(BodySizeLimitMiddleware)

    install_exception_handlers(app)
    app.include_router(transactions_router, prefix="/api/v1")
    app.include_router(categories_router, prefix="/api/v1")
    app.include_router(budgets_router, prefix="/api/v1")
    app.include_router(settings_router, prefix="/api/v1")
    app.include_router(imports_router, prefix="/api/v1")
    app.include_router(merchant_rules_router, prefix="/api/v1")
    app.include_router(reports_router, prefix="/api/v1")
    app.include_router(assets_router, prefix="/api/v1")
    app.include_router(goals_router, prefix="/api/v1")
    app.include_router(notifications_router, prefix="/api/v1")

    @app.get("/health", tags=["meta"])
    def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    return app


app = create_app()
