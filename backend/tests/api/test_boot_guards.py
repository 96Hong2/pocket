"""잘못된 배포가 기동 단계에서 멈추는지 본다.

요청 시점에만 검증기를 만들면 /health 가 200 이라 Cloud Run 헬스체크가 통과한다.
설정이 틀린 리비전이 트래픽을 받게 되므로 기동에서 막아야 한다.
"""

from __future__ import annotations

import pytest

from app.api.deps import _verifier_for
from app.core.config import Settings, get_settings
from app.integrations.apps_in_toss.anon_key import AnonKeyVerifierMisconfigured
from app.integrations.llm import GeminiStructuredClient, get_llm_client
from app.integrations.llm.port import LlmMisconfigured
from app.main import create_app


@pytest.fixture(autouse=True)
def _clear_caches() -> None:
    get_settings.cache_clear()
    _verifier_for.cache_clear()
    get_llm_client.cache_clear()


def test_인증서_없이_운영으로_뜨면_기동에_실패한다(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "prod")
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "false")
    monkeypatch.delenv("TOSS_MTLS_CERT_PATH", raising=False)
    monkeypatch.delenv("TOSS_MTLS_KEY_PATH", raising=False)

    with pytest.raises(AnonKeyVerifierMisconfigured):
        create_app()


def test_local_이_아니면_검증을_끌_수_없다(monkeypatch: pytest.MonkeyPatch) -> None:
    """dev 서버도 QR 테스트로 여러 사람이 붙는 공용 서버다."""
    monkeypatch.setenv("ENVIRONMENT", "dev")
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")

    with pytest.raises(ValueError, match="local"):
        Settings()


def test_local_이_아니면_지난_기간_쓰기를_열_수_없다(monkeypatch: pytest.MonkeyPatch) -> None:
    """켜진 채로 배포되면 끝난 달의 예산이 나중에 달라진다.

    이미 보여 준 지난달 게이지와 리포트를 믿을 수 없게 되므로 기동에서 막는다.
    """
    monkeypatch.setenv("ENVIRONMENT", "dev")
    monkeypatch.setenv("ALLOW_PAST_PERIOD_BUDGET_WRITE", "true")

    with pytest.raises(ValueError, match="local"):
        Settings()


def test_키_없는_provider_는_기동에서_막힌다(monkeypatch: pytest.MonkeyPatch) -> None:
    """첫 사진 요청에서야 503 이 나면 그 리비전은 이미 트래픽을 받고 있다.

    Settings 자체는 통과한다. alembic·스크립트가 같은 설정을 읽는데 그쪽은 모델을 안 부른다.
    """
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert Settings().llm_provider == "gemini"
    with pytest.raises(LlmMisconfigured, match="GEMINI_API_KEY"):
        create_app()

    get_settings.cache_clear()
    get_llm_client.cache_clear()
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "  ")
    with pytest.raises(LlmMisconfigured, match="OPENAI_API_KEY"):
        create_app()


def test_provider_설정대로_클라이언트를_고른다(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    client = get_llm_client()
    assert isinstance(client, GeminiStructuredClient)
    assert client.is_stub is False
    assert client.model == "gemini-2.5-flash"
    # 설정을 찍어도 키는 가려진다.
    assert "test-key" not in repr(get_settings())


def test_local_에서는_검증을_끄고_뜬다(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("ALLOW_UNVERIFIED_ANON_KEY", "true")

    assert Settings().allow_unverified_anon_key is True
    assert create_app() is not None
