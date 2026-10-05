"""「내 자산 분석」 셈.

지키는 것: 도넛 비율은 연금을 빼고도 다시 셀 수 있다, 수익률은 현재가나 판 기록이 있는 종목만
센다, 번 돈이 없으면 저축률을 지어내지 않는다, 지문은 숫자가 그대로면 그대로다.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal

from app.domain.asset_analysis import (
    AnalysisItem,
    AnalysisScope,
    build_analysis,
    fingerprint,
    investment_returns,
    month_change,
    saving_rate,
)
from app.domain.asset_ledger import InvestKind
from app.domain.assets import AssetGroup
from app.domain.money import won


def _cash(key: str, amount: int, monthly: int | None = None) -> AnalysisItem:
    return AnalysisItem(
        key=key,
        group=AssetGroup.CASH,
        kind=None,
        label=key,
        value=won(amount),
        monthly_amount=won(monthly) if monthly is not None else None,
    )


def _stock(
    key: str,
    *,
    kind: InvestKind = InvestKind.STOCK,
    quantity: str = "2",
    cost: int = 500_000,
    price: int | None = None,
) -> AnalysisItem:
    value = cost if price is None else int(Decimal(quantity) * price)
    return AnalysisItem(
        key=key,
        group=AssetGroup.INVESTMENT,
        kind=kind,
        label=key,
        value=won(value),
        quantity=Decimal(quantity),
        cost_basis=won(cost),
        unit_price=won(price) if price is not None else None,
    )


ITEMS = [
    _cash("a-cash", 3_000_000, monthly=300_000),
    _stock("b-samsung", price=300_000),
    AnalysisItem(
        key="c-irp", group=AssetGroup.PENSION, kind=None, label="IRP", value=won(2_000_000)
    ),
    AnalysisItem(
        key="d-loan", group=AssetGroup.DEBT, kind=None, label="대출", value=won(1_000_000)
    ),
]


def test_도넛은_부채를_빼고_연금_빼고_보기_비율을_함께_낸다() -> None:
    result = build_analysis(AnalysisScope.ALL, ITEMS)

    assert result.summary is not None
    assert result.summary.total_assets == won(5_600_000)
    assert result.summary.net_worth == won(4_600_000)
    assert result.total_without_pension == won(3_600_000)
    slices = {row.group: row for row in result.groups}
    assert list(slices) == [AssetGroup.CASH, AssetGroup.INVESTMENT, AssetGroup.PENSION]
    assert slices[AssetGroup.CASH].ratio == Decimal("53.6")
    assert slices[AssetGroup.CASH].ratio_without_pension == Decimal("83.3")
    assert slices[AssetGroup.INVESTMENT].ratio_without_pension == Decimal("16.7")
    assert slices[AssetGroup.PENSION].ratio_without_pension is None


def test_수익률은_현재가나_판_기록이_있는_종목만_센다() -> None:
    no_price = _stock("e-etf", kind=InvestKind.ETF, cost=1_000_000)
    sold = replace(
        _stock("f-coin", kind=InvestKind.COIN, quantity="0.5", cost=100_000),
        realized=won(50_000),
        sold_cost=won(250_000),
        received=won(300_000),
        sell_count=1,
    )

    result = investment_returns([ITEMS[1], no_price, sold])

    assert [row.key for row in result.rows] == ["b-samsung", "f-coin"]
    samsung, coin = result.rows
    assert (samsung.gain, samsung.rate) == (won(100_000), Decimal("20.0"))
    assert (samsung.realized, samsung.realized_rate) == (None, None)
    assert (coin.gain, coin.rate) == (None, None)
    assert (coin.realized, coin.realized_rate) == (won(50_000), Decimal("20.0"))
    assert (result.cost, result.value, result.rate) == (
        won(500_000),
        won(600_000),
        Decimal("20.0"),
    )
    assert (result.realized, result.realized_rate) == (won(50_000), Decimal("20.0"))


def test_금액_종목은_지금_금액을_적었을_때만_평가한다() -> None:
    fund = AnalysisItem(
        key="g-fund",
        group=AssetGroup.INVESTMENT,
        kind=InvestKind.FUND,
        label="펀드",
        value=won(1_100_000),
        cost_basis=won(1_000_000),
    )

    assert investment_returns([fund]).rows == []
    noted = investment_returns([replace(fund, price_noted=True)])
    assert noted.rows[0].rate == Decimal("10.0")


def test_번_돈이_없으면_저축률은_없다() -> None:
    assert saving_rate(won(300_000), won(0)).rate is None
    assert saving_rate(won(300_000), won(2_000_000)).rate == Decimal("15.0")


def test_지난달_대비는_순자산과_그룹별_증감이다() -> None:
    change = month_change(
        {AssetGroup.CASH: won(3_000_000), AssetGroup.DEBT: won(1_000_000)},
        {AssetGroup.CASH: won(2_500_000), AssetGroup.DEBT: won(1_200_000)},
    )

    assert (change.net_worth, change.previous_net_worth) == (won(2_000_000), won(1_300_000))
    assert change.delta == won(700_000)
    assert [(row.group, row.delta) for row in change.groups] == [
        (AssetGroup.CASH, won(500_000)),
        (AssetGroup.DEBT, won(-200_000)),
    ]


def test_종류별_입구는_항목이_있는_묶음만이고_코인은_주식_묶음에_안_든다() -> None:
    coin = _stock("h-coin", kind=InvestKind.COIN, quantity="0.003")
    bond = _stock("i-bond", kind=InvestKind.BOND, quantity="1")

    only_coin = build_analysis(AnalysisScope.ALL, [ITEMS[0], coin])
    assert [row.scope for row in only_coin.bundles] == [AnalysisScope.CASH]

    stock = build_analysis(AnalysisScope.STOCK, [ITEMS[0], coin, bond, ITEMS[1]])
    assert [row.key for row in stock.items] == ["b-samsung", "i-bond"]
    assert stock.returns is not None
    assert [row.key for row in stock.returns.rows] == ["b-samsung"]
    assert stock.summary is None and stock.month_change is None

    cash = build_analysis(AnalysisScope.CASH, ITEMS)
    assert [row.key for row in cash.items] == ["a-cash"]
    assert cash.monthly_total == won(300_000)


def test_지문은_순서와_무관하고_숫자가_바뀌면_바뀐다() -> None:
    same = fingerprint(list(reversed(ITEMS)))
    assert same == fingerprint(ITEMS)
    # 이름만 바뀐 것은 분석 숫자가 아니다.
    renamed = [replace(ITEMS[0], label="다른 이름"), *ITEMS[1:]]
    assert fingerprint(renamed) == same
    # 수량 표기(2 와 2.00000000)는 같은 수다.
    padded = [ITEMS[0], replace(ITEMS[1], quantity=Decimal("2.00000000")), *ITEMS[2:]]
    assert fingerprint(padded) == same

    assert fingerprint([replace(ITEMS[0], value=won(3_000_001)), *ITEMS[1:]]) != same
    assert fingerprint([ITEMS[0], replace(ITEMS[1], unit_price=won(1)), *ITEMS[2:]]) != same
    assert fingerprint(ITEMS[:-1]) != same
    sold = replace(ITEMS[1], sell_count=1, received=won(10), realized=won(1))
    assert fingerprint([ITEMS[0], sold, *ITEMS[2:]]) != same


def test_종류별_지문은_그_묶음_항목만_먹는다() -> None:
    before = build_analysis(AnalysisScope.ALL, ITEMS)
    after = build_analysis(
        AnalysisScope.ALL, [ITEMS[0], replace(ITEMS[1], unit_price=won(1)), *ITEMS[2:]]
    )

    assert before.fingerprint != after.fingerprint
    cash_before = next(row for row in before.bundles if row.scope is AnalysisScope.CASH)
    cash_after = next(row for row in after.bundles if row.scope is AnalysisScope.CASH)
    assert cash_before.fingerprint == cash_after.fingerprint
