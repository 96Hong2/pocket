"""기본 카테고리 정본이 프론트·자산과 어긋나지 않는지 본다.

카테고리 이름과 아이콘 키가 백엔드·프론트에 각각 적혀 있으면 반드시 갈라진다.
갈라지면 자동 분류가 미분류로 떨어지거나 아이콘이 안 그려진다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from app.domain.categories import DEFAULT_CATEGORIES, CategoryKind, default_category_icons

REPO_ROOT = Path(__file__).resolve().parents[3]
ICONS_TS = REPO_ROOT / "frontend" / "src" / "shared" / "ui" / "icons.ts"
ICONS_DIR = REPO_ROOT / "frontend" / "public" / "icons" / "sm"


def _frontend_mapping() -> dict[str, str]:
    """icons.ts 의 DEFAULT_CATEGORY_ICONS 를 읽는다. 파싱이 아니라 대조가 목적이다."""
    source = ICONS_TS.read_text(encoding="utf-8")
    block = re.search(
        r"DEFAULT_CATEGORY_ICONS: Record<string, IconName> = \{(.*?)\n\};",
        source,
        re.DOTALL,
    )
    assert block is not None, "icons.ts 에서 DEFAULT_CATEGORY_ICONS 를 찾지 못했다"
    pairs = re.findall(r"^\s*'?([^':\n]+)'?:\s*'([^']+)'", block.group(1), re.MULTILINE)
    return {name.strip().strip("'"): icon for name, icon in pairs}


def test_이름이_중복되지_않는다() -> None:
    names = [c.name for c in DEFAULT_CATEGORIES]
    assert len(names) == len(set(names))


def test_지출_카테고리가_아홉_개다() -> None:
    """PRD 가 정한 기본 지출 분류 수. 늘리거나 줄이면 PRD 도 같이 고쳐야 한다."""
    expense = [c for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.EXPENSE]
    assert len(expense) == 9


@pytest.mark.skipif(not ICONS_DIR.is_dir(), reason="프론트 아이콘 폴더가 없다")
def test_아이콘_파일이_실제로_있다() -> None:
    for category in DEFAULT_CATEGORIES:
        assert (ICONS_DIR / f"{category.icon_key}.png").is_file(), category.icon_key


@pytest.mark.skipif(not ICONS_TS.is_file(), reason="프론트 icons.ts 가 없다")
def test_프론트_매핑과_같다() -> None:
    assert _frontend_mapping() == default_category_icons()


@pytest.mark.skipif(not ICONS_TS.is_file(), reason="프론트 icons.ts 가 없다")
def test_프론트가_말하는_아이콘이_전부_존재한다() -> None:
    source = ICONS_TS.read_text(encoding="utf-8")
    block = re.search(r"export const SM_ICONS = \[(.*?)\n\] as const;", source, re.DOTALL)
    assert block is not None
    declared = re.findall(r"'([^']+)'", block.group(1))
    missing = [name for name in declared if not (ICONS_DIR / f"{name}.png").is_file()]
    assert missing == [], f"icons.ts 에 있는데 파일이 없다: {missing}"

    on_disk = sorted(p.stem for p in ICONS_DIR.glob("*.png"))
    assert sorted(declared) == on_disk, "파일과 목록이 다르다"


def test_이체와_수입_아이콘이_다르다() -> None:
    """목록에서 이체와 수입을 눈으로 구분할 수 있어야 한다."""
    icons = default_category_icons()
    assert icons["이체"] != icons["수입"]


def test_json_으로_옮겨도_깨지지_않는다() -> None:
    """시드 마이그레이션이 이 목록을 그대로 쓴다."""
    payload = [
        {"name": c.name, "kind": c.kind.value, "icon_key": c.icon_key, "sort": c.sort_order}
        for c in DEFAULT_CATEGORIES
    ]
    assert json.loads(json.dumps(payload, ensure_ascii=False)) == payload
