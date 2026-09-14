"""메일 발송기 계약."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    def send(self, message: EmailMessage) -> None:
        """보낸다. 못 보내면 던진다. 조용히 삼키면 코드를 기다리는 사람이 영영 기다린다."""
        ...
