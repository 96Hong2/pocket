"""알림 잡이 무엇을 골라 쓰는지.

이 셋은 배포 안전 결정 자체다. 코드 없으면 스텁(정상 상태), 코드는 있는데 인증서가 없으면
**멈춘다**(배포 사고). 조용히 스텁으로 내려가면 배포는 초록이고 알림만 안 간다.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.config import Settings  # noqa: E402
from scripts.send_reminders import (  # noqa: E402
    ReminderSenderMisconfigured,
    build_sender,
)


def _settings(**kwargs: object) -> Settings:
    base: dict[str, object] = {
        "toss_reminder_template_set_code": None,
        "toss_mtls_cert_path": None,
        "toss_mtls_key_path": None,
    }
    base.update(kwargs)
    return Settings(**base)  # type: ignore[arg-type]


def test_템플릿_코드가_없으면_로그_스텁이다() -> None:
    """아직 콘솔 절차가 안 끝난 정상 상태다. 잡은 정상 종료한다."""
    sender, client = build_sender(_settings())

    assert sender.is_stub is True
    assert client is None


def test_코드는_있는데_인증서가_없으면_멈춘다() -> None:
    """배포가 잘못된 것이다. 여기서 안 막으면 배포는 성공으로 보이고 알림만 안 간다."""
    with pytest.raises(ReminderSenderMisconfigured):
        build_sender(_settings(toss_reminder_template_set_code="pocket-ledger-remind"))


def test_인증서_경로가_있어도_실물이_없으면_멈춘다(tmp_path: Path) -> None:
    """경로만 맞고 파일이 없는 경우가 실제 사고 모양이다."""
    with pytest.raises(ReminderSenderMisconfigured):
        build_sender(
            _settings(
                toss_reminder_template_set_code="pocket-ledger-remind",
                toss_mtls_cert_path=str(tmp_path / "없는.crt"),
                toss_mtls_key_path=str(tmp_path / "없는.key"),
            )
        )


def test_코드와_인증서가_다_있으면_스텁으로_안_내려간다(tmp_path: Path) -> None:
    """설정 검사를 지나면 그 다음은 TLS 의 몫이다. 여기서 조용히 스텁이 되면 안 된다.

    가짜 인증서라 httpx 가 로드하다 터진다. 그 예외가 나온다는 것 자체가
    '설정 검사를 통과해 진짜 클라이언트를 만들려 했다' 는 증거다.
    """
    cert = tmp_path / "client.crt"
    key = tmp_path / "client.key"
    cert.write_text("not a real certificate")
    key.write_text("not a real key")

    # TLS 계층 예외라 형이 고정이 아니다.
    with pytest.raises(Exception) as caught:
        build_sender(
            _settings(
                toss_reminder_template_set_code="pocket-ledger-remind",
                toss_mtls_cert_path=str(cert),
                toss_mtls_key_path=str(key),
            )
        )

    # 설정 문제가 아니라 인증서 내용 문제로 터져야 한다.
    assert not isinstance(caught.value, ReminderSenderMisconfigured)
