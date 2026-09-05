"""영수증 촬영: 분석 → 검토 → 저장.

화면으로 볼 수 있는 것은 e2e 가 본다. 여기서 지키는 것은 화면에 안 보이는 자리다.
영수증 지시가 실제로 모델에게 갔는지, 저장한 거래의 출처가 캡처와 갈리는지,
그리고 상호·날짜를 못 읽은 영수증에서 총액이 살아남는지가 그렇다.

스텁이 이미지를 읽지 않고 정해 둔 한 건을 내므로, 여기서 인식 정확도를 재지 않는다.
"""

from __future__ import annotations

import base64
from collections.abc import Callable
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.llm import RECEIPT_TASK_MARKER, get_llm_client
from app.integrations.llm.contracts import (
    ExtractedTransaction,
    TransactionExtraction,
    TransactionType,
)
from app.integrations.llm.stub import StubLlmStructuredClient
from app.models import ParseUsage, Transaction
from app.modules import ledger

AUTH = {"X-Anon-Key": "test-anon-key"}
TZ = ZoneInfo(ledger.DEFAULT_TIMEZONE)

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
IMAGE = f"data:image/png;base64,{base64.b64encode(PNG_BYTES).decode()}"

# 스텁이 영수증에 대해 늘 내는 한 건. 상호를 못 읽은 모양이다.
SAMPLE_AMOUNT = "23500"


def _analyze(client: TestClient, path: str = "receipt") -> dict:
    response = client.post(f"/api/v1/imports/{path}", json={"image": IMAGE}, headers=AUTH)
    assert response.status_code == 201, response.text
    return response.json()


def test_영수증_한_장에서_상호_없는_한_건이_나온다(client: TestClient, default_categories) -> None:
    batch = _analyze(client)

    # 캡처 예시 다섯 건이 그대로 나오면 영수증 지시가 안 간 것이다.
    assert batch["detected_count"] == 1
    assert batch["source"] == "receipt"

    (row,) = batch["candidates"]
    # 상호를 못 읽어도 총액은 살아남는다. 이 줄을 버리면 사용자가 다시 찍어야 한다.
    assert row["merchant"] is None
    assert row["amount"] == SAMPLE_AMOUNT
    # 서버가 스스로 켜 둔다. 확신이 낮지 않고 이미 있는 것도 아니다.
    assert row["is_selected"] is True
    assert batch["selected_expense_total"] == SAMPLE_AMOUNT


def test_영수증으로_저장한_거래의_출처가_영수증이다(
    client: TestClient, db: Session, default_categories
) -> None:
    batch = _analyze(client)

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    assert committed.json()["created_count"] == 1

    transaction = db.scalars(select(Transaction)).one()
    # 출처가 캡처로 남으면 나중에 어느 입력이 얼마나 쓰였는지 셀 수 없다.
    assert transaction.source == "receipt"
    assert str(transaction.amount) == SAMPLE_AMOUNT

    usage = db.scalars(select(ParseUsage)).one()
    assert usage.source == "receipt"
    assert usage.candidate_count == 1


def test_상호도_날짜도_못_읽어도_금액은_남고_날짜는_오늘로_들어간다(
    client: TestClient, db: Session, default_categories
) -> None:
    with _using(client, _BlurryReceipt):
        batch = _analyze(client)

    (row,) = batch["candidates"]
    assert row["merchant"] is None
    assert row["amount"] == "8700"
    # 날짜를 못 읽었다고 후보를 버리지 않는다. 찍은 날이 가장 그럴듯한 값이다.
    occurred = datetime.fromisoformat(row["occurred_at"]).astimezone(TZ).date()
    assert occurred == datetime.now(TZ).date()

    committed = client.post(f"/api/v1/imports/{batch['id']}/commit", headers=AUTH)
    assert committed.status_code == 200, committed.text
    assert committed.json()["created_count"] == 1
    assert str(db.scalars(select(Transaction)).one().amount) == "8700"


def test_영수증_경로는_영수증_지시를_보내고_캡처_경로는_안_보낸다(
    client: TestClient, default_categories
) -> None:
    recorder = _PromptRecorder()

    with _using(client, lambda: recorder):
        _analyze(client, "receipt")
        _analyze(client, "capture")

    receipt_prompt, capture_prompt = recorder.prompts
    assert RECEIPT_TASK_MARKER in receipt_prompt
    # 캡처에까지 영수증 지시가 실리면 캡처가 한 건만 읽는 화면이 된다.
    assert RECEIPT_TASK_MARKER not in capture_prompt


@contextmanager
def _using(client: TestClient, factory: Callable[[], StubLlmStructuredClient]):
    """이번 요청 동안만 모델을 갈아 끼운다. 픽스처가 앱을 새로 만들므로 그 앱에 건다."""
    overrides = client.app.dependency_overrides  # type: ignore[attr-defined]
    overrides[get_llm_client] = factory
    try:
        yield
    finally:
        overrides.pop(get_llm_client, None)


class _PromptRecorder(StubLlmStructuredClient):
    """스텁 동작은 그대로 두고 어떤 지시를 보냈는지만 받아 적는다."""

    def __init__(self) -> None:
        super().__init__()
        self.prompts: list[str] = []

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        self.prompts.append(prompt)
        return await super().extract(
            prompt=prompt, schema=schema, text=text, image=image, today=today
        )


class _BlurryReceipt(StubLlmStructuredClient):
    """상호도 날짜도 못 읽고 총액만 읽어 온 모델.

    스텁 예시는 날짜를 늘 채워 주므로 그 자리를 이 모델이 대신 비운다.
    """

    async def extract(self, *, prompt, schema, text=None, image=None, today=None):  # type: ignore[no-untyped-def]
        del prompt, schema, text, image, today
        return TransactionExtraction(
            candidates=[
                ExtractedTransaction(
                    occurred_at=None,
                    amount=8_700,
                    type=TransactionType.EXPENSE,
                    merchant=None,
                    category=None,
                    confidence=0.61,
                )
            ]
        )
