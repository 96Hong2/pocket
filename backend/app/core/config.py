"""애플리케이션 설정. 값은 환경변수와 .env 에서 읽고 저장소에 커밋하지 않는다."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["local", "dev", "prod"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]

# 3.x 번들이 2.x origin 으로도 서비스되므로 두 도메인을 모두 허용한다.
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "https://pocket.web.tossmini.com",
    "https://pocket.private-web.tossmini.com",
    "https://pocket.apps.tossmini.com",
    "https://pocket.private-apps.tossmini.com",
    "http://localhost:5173",
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: Environment = "local"
    log_level: LogLevel = "INFO"

    # 포트 5434 는 compose 가 띄우는 pocket-db 다. 5432·5433 은 이 맥의 다른 프로젝트 것이라,
    # 기본값을 5432 로 두면 환경변수를 빼먹은 실행이 남의 DB 에 붙는다.
    database_url: str = "postgresql+psycopg://pocket:pocket@localhost:5434/pocket"

    # 쉼표 구분 문자열과 JSON 배열을 모두 받는다.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: list(DEFAULT_CORS_ORIGINS)
    )

    toss_api_base_url: str = "https://apps-in-toss-api.toss.im"
    # mTLS 인증서는 파일 경로로만 받는다. 내용을 설정값에 담지 않는다.
    toss_mtls_cert_path: str | None = None
    toss_mtls_key_path: str | None = None

    # 익명 식별키 검증을 건너뛰는 로컬 개발용 스위치.
    allow_unverified_anon_key: bool = False

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                import json

                return json.loads(text)
            return [item.strip() for item in text.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _reject_unverified_anon_key_outside_local(self) -> Settings:
        # dev 서버도 QR 테스트로 여러 사람이 붙는 공용 서버다.
        # 검증을 끄면 아무 문자열로도 남의 데이터에 접근할 수 있어 local 에서만 허용한다.
        if self.allow_unverified_anon_key and self.environment != "local":
            raise ValueError("ALLOW_UNVERIFIED_ANON_KEY는 ENVIRONMENT=local 에서만 켤 수 있습니다.")
        return self

    @property
    def has_toss_mtls_credentials(self) -> bool:
        return bool(self.toss_mtls_cert_path and self.toss_mtls_key_path)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
