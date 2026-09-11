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

VERSIONS = Path(__file__).resolve().parents[1] / "migrations" / "versions"
SEED_FILE = VERSIONS / "20260903_1200_c4a1b8f2d7e3_seed_default_categories.py"
INCOME_FILE = VERSIONS / "20260907_1900_a3f1c07b52d4_income_categories.py"
SIDE_JOB_FILE = VERSIONS / "20260911_1500_d4a2e8c31b70_income_side_job.py"


def _load(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    if spec is None or spec.loader is None:
        pytest.fail(f"{path.name} 을 읽지 못했다")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _seed_module() -> ModuleType:
    return _load(SEED_FILE)


def _applied_categories() -> list[tuple[str, str, str, int]]:
    """마이그레이션을 차례로 적용했을 때 DB 에 남는 기본 카테고리.

    적용이 끝난 리비전은 고칠 수 없으므로 첫 시드 목록은 그대로 두고, 뒤 리비전이 한
    이름 옮기기와 추가를 여기서 그대로 되짚는다. 도메인 목록과 어긋나면 이 테스트가 잡는다.
    """
    income = _load(INCOME_FILE)
    side_job = _load(SIDE_JOB_FILE)
    rows = list(_seed_module().DEFAULT_CATEGORIES)

    renamed = []
    for name, kind, icon_key, sort_order in rows:
        if name == income.RENAMED_FROM:
            renamed.append(
                (income.RENAMED_TO, kind, income.RENAMED_ICON_KEY, income.RENAMED_SORT_ORDER)
            )
        else:
            renamed.append((name, kind, icon_key, sort_order))
    renamed.extend(income.ADDED_CATEGORIES)

    # '기타 수입' 을 끝자리로 밀고 '부업' 을 그 앞에 세운 리비전.
    moved = [
        (name, kind, icon_key, side_job.MOVED_SORT_ORDER if name == side_job.MOVED_NAME else order)
        for name, kind, icon_key, order in renamed
    ]
    moved.append(
        (side_job.ADDED_NAME, "income", side_job.ADDED_ICON_KEY, side_job.ADDED_SORT_ORDER)
    )
    return sorted(moved, key=lambda row: row[3])


def test_시드가_도메인_목록과_같다() -> None:
    expected = sorted(
        ((c.name, c.kind.value, c.icon_key, c.sort_order) for c in DEFAULT_CATEGORIES),
        key=lambda row: row[3],
    )
    assert _applied_categories() == expected


def test_시드_id_가_환경마다_같다() -> None:
    """이미 배포된 DB 의 id 다. 네임스페이스를 바꾸면 여기가 깨져서 드러난다."""
    seed_id = _seed_module().seed_id
    assert str(seed_id("식비")) == "9223902f-6093-5f93-bee3-d384a85a38db"
    assert str(seed_id("이체")) == "62dab2e8-5291-5e74-9925-059b63858e4d"


def test_기타_수입은_옛_수입_행을_물려받는다() -> None:
    """지우고 새로 넣으면 그 분류로 적어 둔 거래의 분류가 통째로 빠진다(FK 가 SET NULL)."""
    income = _load(INCOME_FILE)
    assert income.RENAMED_FROM == "수입"
    assert income.RENAMED_TO == "기타 수입"
    # 새로 넣는 목록에 '기타 수입' 이 있으면 이름을 옮긴 행과 두 벌이 된다.
    assert "기타 수입" not in {name for name, _, _, _ in income.ADDED_CATEGORIES}
