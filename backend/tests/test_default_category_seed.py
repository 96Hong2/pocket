"""시드 마이그레이션이 도메인 목록과 어긋나지 않는지 본다.

마이그레이션은 값을 자기 안에 박아 둔다. 적용이 끝난 리비전의 의미가 나중에 바뀌면 안 되기
때문이다. 대신 도메인 목록을 고치고 시드를 안 고치면 여기가 깨져서 드러난다.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest

from app.domain.categories import DEFAULT_CATEGORIES

SEED_FILE = (
    Path(__file__).resolve().parents[1]
    / "migrations"
    / "versions"
    / "20260903_1200_c4a1b8f2d7e3_seed_default_categories.py"
)


def _seed_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location("seed_default_categories", SEED_FILE)
    if spec is None or spec.loader is None:
        pytest.fail(f"{SEED_FILE.name} 을 읽지 못했다")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_시드가_도메인_목록과_같다() -> None:
    seeded = _seed_module().DEFAULT_CATEGORIES
    expected = [(c.name, c.kind.value, c.icon_key, c.sort_order) for c in DEFAULT_CATEGORIES]
    assert list(seeded) == expected


def test_시드_id_가_환경마다_같다() -> None:
    """이미 배포된 DB 의 id 다. 네임스페이스를 바꾸면 여기가 깨져서 드러난다."""
    seed_id = _seed_module().seed_id
    assert str(seed_id("식비")) == "9223902f-6093-5f93-bee3-d384a85a38db"
    assert str(seed_id("이체")) == "62dab2e8-5291-5e74-9925-059b63858e4d"
