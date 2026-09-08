"""애플리케이션 설정. 값은 환경변수와 .env 에서 읽고 저장소에 커밋하지 않는다."""

from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["local", "dev", "prod"]
LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
# 줄글·사진을 읽는 모델. stub 은 규칙 파서라 사진을 한 바이트도 읽지 않는다.
LlmProvider = Literal["stub", "gemini", "openai"]

# 3.x 번들이 2.x origin 으로도 서비스되므로 두 도메인을 모두 허용한다.
DEFAULT_CORS_ORIGINS: tuple[str, ...] = (
    "https://pocket-ledger.web.tossmini.com",
    "https://pocket-ledger.private-web.tossmini.com",
    "https://pocket-ledger.apps.tossmini.com",
    "https://pocket-ledger.private-apps.tossmini.com",
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

    # 끝난 기간의 예산 쓰기를 열어 두는 로컬 전용 스위치. 화면 검증에만 쓴다.
    # 자동 이어쓰기를 화면으로 증명하려면 '지난달 예산이 이미 있는 상태' 가 있어야 하는데,
    # 제품 규칙이 그 기간의 쓰기를 막고 있어 만들 길이 없다. 시간을 앞당길 수도 없다.
    # 이 스위치는 쓰기 잠금만 푼다. 화면이 읽기 전용인지 판단하는 is_editable 은 그대로
    # 진짜 규칙으로 계산되므로 '끝난 달은 보기만 한다' 는 동작은 켠 채로도 검증된다.
    allow_past_period_budget_write: bool = False

    # 줄글 분석을 하루에 몇 번까지 받아 줄지. 핵심 루프를 끊지 않도록 넉넉히 잡는다.
    # 비용을 재기 전에 상한을 좁히지 않는다. 실제 사용량을 보고 나서 정한다.
    nl_parse_daily_limit: int = 300

    # 어떤 모델이 읽는지. 기본은 스텁이라 키 없이 개발·검증이 돈다. 운영은 gemini 로 띄운다.
    # 키는 SecretStr 이라 설정을 통째로 찍어도 값이 가려진다.
    # 키가 비었는지는 여기서 안 본다. alembic·스크립트도 이 설정을 읽는데 그쪽은 모델을 안 부른다.
    # 앱은 기동할 때 get_llm_client() 가 보고 멈춘다.
    llm_provider: LlmProvider = "stub"
    gemini_api_key: SecretStr | None = None
    openai_api_key: SecretStr | None = None
    # 비우면 provider 기본 모델(gemini-2.5-flash · gpt-5-mini).
    llm_model: str | None = None
    # 한 번 부르는 데 기다리는 시간. 한 번 재시도하므로 최악은 두 배다.
    llm_timeout_seconds: float = 20.0

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

    @model_validator(mode="after")
    def _reject_past_period_write_outside_local(self) -> Settings:
        # 켜진 채로 배포되면 끝난 달의 예산이 나중에 달라질 수 있다.
        # 이미 보여 준 지난달 게이지와 리포트를 믿을 수 없게 되므로 local 밖에서는 막는다.
        if self.allow_past_period_budget_write and self.environment != "local":
            raise ValueError(
                "ALLOW_PAST_PERIOD_BUDGET_WRITE는 ENVIRONMENT=local 에서만 켤 수 있습니다."
            )
        return self

    @property
    def has_toss_mtls_credentials(self) -> bool:
        return bool(self.toss_mtls_cert_path and self.toss_mtls_key_path)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
