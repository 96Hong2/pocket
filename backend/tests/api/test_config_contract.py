"""설정 문서와 코드가 어긋나지 않는지 본다.

`.env.example` 에 있는 이름을 `Settings` 가 안 읽으면 조용히 무시된다.
운영 배포에서 인증서 경로가 무시되면 원인을 찾는 데 오래 걸린다.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.core.config import Settings

BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENV_EXAMPLE = BACKEND_ROOT / ".env.example"
SECRETS_DOC = BACKEND_ROOT.parent / "docs" / "SECRETS.md"


def _env_keys() -> set[str]:
    keys = set()
    for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        keys.add(line.split("=", 1)[0].strip())
    return keys


def test_env_example_의_키를_전부_읽는다() -> None:
    fields = {name.upper() for name in Settings.model_fields}
    unread = _env_keys() - fields
    assert unread == set(), f"Settings 가 읽지 않는 키: {sorted(unread)}"


def test_secrets_문서가_없는_변수_이름을_안내하지_않는다() -> None:
    """문서에 적힌 TOSS_*·ENVIRONMENT 계열 이름이 실제 필드와 같아야 한다."""
    doc = SECRETS_DOC.read_text(encoding="utf-8")
    mentioned = set(re.findall(r"\b(TOSS_[A-Z_]+|ALLOW_[A-Z_]+|ENVIRONMENT|DATABASE_URL)\b", doc))
    # `TOSS_MTLS_*_PATH` 같은 와일드카드 표기는 이름이 아니라 설명이다.
    mentioned = {name for name in mentioned if not name.endswith("_")}
    fields = {name.upper() for name in Settings.model_fields}
    unknown = {name for name in mentioned if name not in fields}
    assert unknown == set(), f"문서에만 있는 설정 이름: {sorted(unknown)}"
