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


def test_지출_카테고리가_열한_개다() -> None:
    """기본 지출 분류 수. 늘리거나 줄이면 PRD 도 같이 고쳐야 한다.

    PRD 의 아홉에 편의점·구독 둘이 더해졌다(2026-09-12). 둘 다 '기타' 나 '쇼핑' 한 칸에
    몰려 리포트에서 무엇에 썼는지 읽히지 않던 갈래다. 같은 날 넣었던 '주유' 는 다시 뺐다.
    차가 없으면 아예 안 쓰는 갈래라 모두에게 보이는 자리에 둘 것이 아니었다.
    """
    expense = [c for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.EXPENSE]
    assert len(expense) == 11


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
    """목록에서 이체와 수입을 눈으로 구분할 수 있어야 한다.

    수입이 셋으로 갈렸으니 셋 다 이체와 달라야 하고, 서로도 달라야 한다.
    같은 그림이 둘이면 목록에서 어느 쪽인지 알 수 없다.
    """
    icons = default_category_icons()
    income = [c.name for c in DEFAULT_CATEGORIES if c.kind is CategoryKind.INCOME]
    assert len(income) >= 2
    for name in income:
        assert icons[name] != icons["이체"], name
    assert len({icons[name] for name in income}) == len(income)


def test_json_으로_옮겨도_깨지지_않는다() -> None:
    """시드 마이그레이션이 이 목록을 그대로 쓴다."""
    payload = [
        {"name": c.name, "kind": c.kind.value, "icon_key": c.icon_key, "sort": c.sort_order}
        for c in DEFAULT_CATEGORIES
    ]
    assert json.loads(json.dumps(payload, ensure_ascii=False)) == payload


@pytest.mark.skipif(not ICONS_DIR.is_dir(), reason="프론트 아이콘 폴더가 없다")
def test_아이콘이_다_비슷한_크기다() -> None:
    """세트가 섞이면서 어떤 것은 크고 어떤 것은 작아 목록이 들쭉날쭉했다.

    파일마다 그림이 캔버스(128px)를 차지하는 비율이 달라서 생긴 일이다. 사용자가 화면을
    보고 신고했다(2026-09-12). 파일 자체를 다시 그려 맞췄으므로, 새 아이콘을 넣을 때도
    같은 규격을 지키게 여기서 잰다.

    긴 변 하나만 본다. 세로로 긴 것과 가로로 긴 것을 한 값으로 묶는 기준이 그것뿐이다.
    """
    from PIL import Image  # 아이콘 규격을 잴 때만 쓴다. 서버 코드에는 안 들어간다.

    longs = {}
    for path in sorted(ICONS_DIR.glob("*.png")):
        with Image.open(path) as image:
            image = image.convert("RGBA")
            box = image.getchannel("A").point(lambda v: 255 if v > 16 else 0).getbbox()
        assert box is not None, f"{path.name} 이 비어 있다"
        assert image.size == (128, 128), f"{path.name} 이 128px 정사각이 아니다"
        longs[path.name] = max(box[2] - box[0], box[3] - box[1])

    small = {name: value for name, value in longs.items() if value < 92}
    big = {name: value for name, value in longs.items() if value > 112}
    assert small == {}, f"그림이 너무 작다(긴 변 92px 미만): {small}"
    assert big == {}, f"캔버스를 뚫는다(긴 변 112px 초과): {big}"
