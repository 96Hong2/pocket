"""읽어 온 이름을 기존 자산 항목에 맞춘다.

줄글·캡처·영수증의 저축·투자 줄과 자산 캡처가 같은 규칙을 쓴다. 확신이 없으면 비워 둔다.
비워 두면 사람이 「어디에」 를 고르거나 새 항목이 된다. 엉뚱한 항목에 붙는 것보다 낫다.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

__all__ = ["NamedItem", "match_item", "normalize_name"]

_NOISE = re.compile(r"[\s·\-_().,/]+")

# 어디인지 안 적은 말. 실제 모델도 「적금 30만 넣음」 을 asset_name 「적금」 으로 읽는다.
_GENERIC = frozenset({"적금", "저축", "예금"})


@dataclass(frozen=True, slots=True)
class NamedItem:
    key: uuid.UUID
    label: str | None
    # 매달 넣는 돈을 적어 둔 항목. 이름이 둘 이상에 맞을 때 이쪽을 고른다.
    monthly: bool = False


def normalize_name(name: str | None) -> str:
    """빈칸과 문장부호를 떼고 대소문자를 접는다. 「카카오 뱅크」 와 「카카오뱅크」 가 같다."""
    if not name:
        return ""
    return _NOISE.sub("", name).casefold()


def match_item(
    name: str | None, items: Sequence[NamedItem], *, partial: bool = False
) -> uuid.UUID | None:
    """이름이 같은 항목의 키. partial 이면 한쪽이 다른 쪽에 들어 있는 것도 본다.

    둘 이상에 맞으면 매달 넣는 항목이 하나일 때만 그것을 고르고, 아니면 비운다.
    「적금」 「저축」 처럼 어디인지 안 적은 말도 매달 넣는 항목이 하나면 그것으로 본다.
    """
    target = normalize_name(name)
    if not target:
        return None
    exact = [item for item in items if normalize_name(item.label) == target]
    if exact:
        return _pick(exact)
    if not partial or len(target) < 2:
        return None
    found = []
    for item in items:
        label = normalize_name(item.label)
        if len(label) >= 2 and (target in label or label in target):
            found.append(item)
    if found:
        return _pick(found)
    if target in _GENERIC:
        # 「적금」 만 적었으면 매달 넣는 항목이 하나일 때 그것이다.
        monthly = [item for item in items if item.monthly]
        return monthly[0].key if len(monthly) == 1 else None
    return None


def _pick(found: Sequence[NamedItem]) -> uuid.UUID | None:
    if len(found) == 1:
        return found[0].key
    monthly = [item for item in found if item.monthly]
    return monthly[0].key if len(monthly) == 1 else None
