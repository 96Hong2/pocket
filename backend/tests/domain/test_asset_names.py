"""읽어 온 이름을 기존 자산 항목에 맞추는 규칙."""

from __future__ import annotations

import uuid

from app.domain.asset_names import NamedItem, match_item

SAVING = NamedItem(uuid.uuid4(), "청년도약계좌", monthly=True)
BANK = NamedItem(uuid.uuid4(), "카카오 뱅크")
STOCK = NamedItem(uuid.uuid4(), "삼성전자")
ITEMS = [SAVING, BANK, STOCK]


def test_빈칸과_대소문자가_달라도_같은_이름이다() -> None:
    assert match_item("카카오뱅크", ITEMS) == BANK.key


def test_포함은_partial_일_때만_본다() -> None:
    assert match_item("삼성전자 우선주", ITEMS) is None
    assert match_item("삼성전자 우선주", ITEMS, partial=True) == STOCK.key


def test_적금만_적었으면_매달_넣는_항목이다() -> None:
    assert match_item("적금", ITEMS, partial=True) == SAVING.key
    assert match_item("적금", ITEMS) is None


def test_둘_이상에_맞으면_매달_넣는_항목_하나만_고른다() -> None:
    one = NamedItem(uuid.uuid4(), "카카오 적금", monthly=True)
    two = NamedItem(uuid.uuid4(), "신한 적금")
    assert match_item("적금", [one, two], partial=True) == one.key
    both = NamedItem(uuid.uuid4(), "신한 적금", monthly=True)
    assert match_item("적금", [one, both], partial=True) is None


def test_맞는_것이_없으면_비운다() -> None:
    assert match_item("IRP", ITEMS, partial=True) is None
    assert match_item(None, ITEMS, partial=True) is None
    assert match_item("적금", [BANK, STOCK], partial=True) is None
