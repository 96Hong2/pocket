from app.domain.assets import AssetGroup, AssetItem, summarize_assets
from app.domain.money import Money, won


def test_자산에서_부채를_빼서_순자산을_낸다():
    result = summarize_assets(
        [
            AssetItem(AssetGroup.CASH, won(12_000_000)),
            AssetItem(AssetGroup.INVESTMENT, won(8_000_000)),
            AssetItem(AssetGroup.DEPOSIT, won(50_000_000)),
            AssetItem(AssetGroup.DEBT, won(30_000_000)),
        ]
    )
    assert result.total_assets == won(70_000_000)
    assert result.total_liabilities == won(30_000_000)
    assert result.net_worth == won(40_000_000)


def test_부채가_더_크면_순자산이_음수다():
    result = summarize_assets(
        [
            AssetItem(AssetGroup.CASH, won(3_000_000)),
            AssetItem(AssetGroup.DEBT, won(50_000_000)),
        ]
    )
    assert result.net_worth == won(-47_000_000)


def test_아무것도_없으면_전부_0_이다():
    result = summarize_assets([])
    assert result.total_assets == Money.zero()
    assert result.total_liabilities == Money.zero()
    assert result.net_worth == Money.zero()
