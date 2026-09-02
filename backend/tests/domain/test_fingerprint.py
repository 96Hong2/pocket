from datetime import date

from app.domain.aggregation import TransactionType
from app.domain.fingerprint import (
    build_fingerprint,
    is_duplicate_candidate,
    normalize_merchant,
    select_duplicate_candidates,
)
from app.domain.money import won

DAY = date(2026, 9, 10)


def fp(
    *,
    day: date = DAY,
    amount: int = 12_000,
    merchant: str | None = "스타벅스",
    type: TransactionType = TransactionType.EXPENSE,
):
    return build_fingerprint(occurred_on=day, amount=won(amount), merchant=merchant, type=type)


def test_같은_거래는_같은_지문이_나온다():
    assert fp().value == fp().value
    assert len(fp().value) == 64


def test_상점명_표기가_흔들려도_같은_지문이다():
    assert fp(merchant=" 스타 벅스 ").value == fp(merchant="스타벅스").value
    assert fp(merchant="STARBUCKS").value == fp(merchant="starbucks").value
    assert normalize_merchant("ＧＳ２５ 편의점") == "gs25편의점"
    assert normalize_merchant(None) == ""


def test_종류가_다르면_지문도_다르다():
    assert fp(type=TransactionType.EXPENSE).value != fp(type=TransactionType.REFUND).value
    assert fp(type=TransactionType.EXPENSE).value != fp(type=TransactionType.TRANSFER).value


def test_금액이나_날짜가_다르면_지문도_다르다():
    assert fp(amount=12_000).value != fp(amount=12_001).value
    assert fp(day=date(2026, 9, 11)).value != fp(day=DAY).value


def test_상점명이_비면_지문은_만들되_중복_후보에서_뺀다():
    blank = fp(merchant="   ")
    assert blank.value
    assert blank.merchant_normalized == ""
    assert blank.duplicate_eligible is False
    assert is_duplicate_candidate(blank, fp(merchant=None)) is False


def test_상점명이_있고_정확히_같을_때만_중복_후보다():
    assert is_duplicate_candidate(fp(), fp()) is True
    assert is_duplicate_candidate(fp(), fp(amount=13_000)) is False


def test_기존_거래_중_중복_후보만_골라낸다():
    existing = {
        "tx-1": fp(),
        "tx-2": fp(amount=99_000),
        "tx-3": fp(merchant="스타 벅스"),
        "tx-4": fp(merchant=None),
    }
    assert select_duplicate_candidates(fp(), existing) == ("tx-1", "tx-3")
    assert select_duplicate_candidates(fp(merchant=None), existing) == ()
