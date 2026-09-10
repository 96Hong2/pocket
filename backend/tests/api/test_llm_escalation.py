"""1차가 이상할 때만 비싼 모델을 부른다.

이 파일이 지키는 것은 **값**이다. 재시도가 필요 없을 때 도는지 아닌지를 호출 횟수로 못 박는다.
"""

from __future__ import annotations

from datetime import date

import anyio.to_thread

from app.integrations.llm import TransactionExtraction
from app.integrations.llm.contracts import ExtractedTransaction
from app.modules.imports import service

TODAY = date(2026, 9, 11)


class _Recorder:
    """정해 둔 답을 차례로 내놓으며 몇 번 불렸는지 센다."""

    def __init__(self, name: str, *answers: TransactionExtraction) -> None:
        self._name = name
        self._answers = list(answers)
        self.calls: list[str] = []

    @property
    def provider(self) -> str:
        return "fake"

    @property
    def is_stub(self) -> bool:
        return False

    @property
    def model(self) -> str:
        return self._name

    async def extract(self, *, prompt: str, schema: type, **_: object) -> TransactionExtraction:
        self.calls.append(prompt)
        return self._answers.pop(0) if len(self._answers) > 1 else self._answers[0]


def _extraction(**kwargs: object) -> TransactionExtraction:
    base: dict[str, object] = {
        "occurred_at": TODAY,
        "amount": 12000,
        "type": "expense",
        "merchant": "김밥천국",
        "confidence": 0.9,
    }
    base.update(kwargs)
    return TransactionExtraction(candidates=[ExtractedTransaction(**base)])  # type: ignore[arg-type]


CLEAN = _extraction()
ODD = _extraction(amount=999_999_999_999)


async def _read(first: _Recorder, second: _Recorder | None):
    """서비스는 워커 스레드에서 도는 동기 함수다. 테스트도 같은 자리에서 부른다.

    `_extract` 가 `anyio.from_thread.run` 으로 본래 루프에 코루틴을 넘기므로,
    이벤트 루프 위에서 그냥 부르면 토큰이 없어 터진다.
    """

    def _call() -> service._ReadResult:
        return service._read_twice_if_odd(
            first, second, prompt="규칙", today=TODAY, subject="문장을", text="점심 12000"
        )

    return await anyio.to_thread.run_sync(_call)


async def test_1차가_깨끗하면_비싼_모델은_아예_안_뜬다() -> None:
    """이게 이 구조의 전부다. 값싼 쪽에서 끝나야 한다."""
    cheap = _Recorder("luna", CLEAN)
    pricey = _Recorder("terra", CLEAN)

    read = await _read(cheap, pricey)

    assert len(cheap.calls) == 1
    assert pricey.calls == []
    assert read.escalated is False
    assert read.model == "luna"


async def test_1차가_이상하면_비싼_모델을_한_번_부른다() -> None:
    cheap = _Recorder("luna", ODD)
    pricey = _Recorder("terra", CLEAN)

    read = await _read(cheap, pricey)

    assert len(pricey.calls) == 1
    assert read.escalated is True
    assert read.model == "terra"
    assert read.verdict.is_clean


async def test_무엇이_이상했는지_재시도_지시에_적어_보낸다() -> None:
    """같은 지시를 그대로 다시 주면 같은 답이 또 온다."""
    pricey = _Recorder("terra", CLEAN)

    await _read(_Recorder("luna", ODD), pricey)

    assert "상한을 넘었다" in pricey.calls[0]


async def test_다시_읽어도_이상하면_세_번째는_없다() -> None:
    cheap = _Recorder("luna", ODD)
    pricey = _Recorder("terra", ODD)

    read = await _read(cheap, pricey)

    assert len(cheap.calls) == 1
    assert len(pricey.calls) == 1
    assert read.verdict.flags(0)


async def test_재시도_모델이_없으면_1차_결과로_사람에게_넘긴다() -> None:
    cheap = _Recorder("luna", ODD)

    read = await _read(cheap, None)

    assert read.escalated is False
    assert not read.verdict.is_clean


async def test_재시도가_실패하면_1차_결과를_버리지_않는다() -> None:
    """첫 답이 있는데 두 번째 호출이 죽었다고 아무것도 못 준다고 하는 것은 과하다."""

    class _Dead(_Recorder):
        async def extract(self, **_: object) -> TransactionExtraction:
            from app.api.errors import ApiError, ErrorCode

            raise ApiError(ErrorCode.PARSE_UNAVAILABLE, "죽었다", status_code=503)

    read = await _read(_Recorder("luna", ODD), _Dead("terra", CLEAN))

    assert read.escalated is True
    assert read.model == "luna"
    assert read.extraction.candidates[0].amount == 999_999_999_999
