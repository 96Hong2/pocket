"""통합 어댑터 테스트 공통 도구. 실제 네트워크를 타지 않는다."""

from __future__ import annotations

from collections.abc import Callable

import httpx
import pytest

from app.integrations.apps_in_toss.client import TossApiClient, TossApiSettings


@pytest.fixture
def sleep_calls() -> list[float]:
    return []


@pytest.fixture
def fake_sleep(sleep_calls: list[float]):
    async def _sleep(seconds: float) -> None:
        sleep_calls.append(seconds)

    return _sleep


@pytest.fixture
def make_client(fake_sleep) -> Callable[..., TossApiClient]:
    def _make(
        handler: Callable[[httpx.Request], httpx.Response],
        *,
        max_attempts: int = 3,
    ) -> TossApiClient:
        settings = TossApiSettings(
            base_url="https://apps-in-toss-api.toss.im",
            max_attempts=max_attempts,
            retry_backoff_seconds=0.0,
        )
        return TossApiClient(
            settings,
            transport=httpx.MockTransport(handler),
            sleep=fake_sleep,
        )

    return _make
