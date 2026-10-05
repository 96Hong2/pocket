import type { ReactNode } from 'react';

import type { AssetSideLog } from '../../shared/analytics';
import type { AssetItemOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { SegmentedControl } from '../../shared/ui';
import { useAssetDestinations, type AssetDestinations, type SellPreview } from '../asset-dest';
import { formatQuantity, formatSignedWon, unitOf } from '../assets';

import { averageCostOf, rateText } from './saveInvest';

/**
 * 「어디에」 목록을 받는 자리. 저축·투자를 고른 화면에서만 그려져, 다른 기록은 자산을 부르지 않는다.
 */
export function AssetDestSource({
  children,
}: {
  children: (destinations: AssetDestinations) => ReactNode;
}) {
  return <>{children(useAssetDestinations())}</>;
}

const SIDE_OPTIONS: { value: AssetSideLog; label: string }[] = [
  { value: 'buy', label: '넣었어요' },
  { value: 'sell', label: '팔았어요' },
];

export interface SaveLotRowProps {
  /** 「넣었어요 | 팔았어요」 를 세우나. 저장 전 새 항목은 팔 것이 없어 안 세운다. */
  showSide: boolean;
  side: AssetSideLog;
  onSide: (side: AssetSideLog) => void;
  /** 수량 칸. 주식, ETF, 코인일 때만. */
  quantity: { text: string; unit: string; focused: boolean; onFocus: () => void } | null;
  /** 팔 때 「전부」. 보유가 있을 때만. */
  onAll?: () => void;
}

/** 「넣었어요 | 팔았어요」 와 수량 칸, 「전부」 한 줄. */
export function SaveLotRow({ showSide, side, onSide, quantity, onAll }: SaveLotRowProps) {
  if (!showSide && quantity == null) return null;
  return (
    <div className="record-lot">
      {showSide ? (
        <SegmentedControl
          className="record-lot__side"
          options={SIDE_OPTIONS}
          value={side}
          onChange={onSide}
          ariaLabel="넣었나 팔았나"
        />
      ) : null}
      {quantity != null ? (
        <button
          type="button"
          className={quantity.focused ? 'record-lot__qty record-lot__qty--on' : 'record-lot__qty'}
          aria-pressed={quantity.focused}
          aria-label={`수량 ${quantity.text === '' ? '0' : quantity.text}${quantity.unit}`}
          onClick={quantity.onFocus}
        >
          <span className="record-lot__qty-label">수량</span>
          <b className="record-lot__qty-value" data-numeric="">
            {quantity.text === '' ? '0' : quantity.text}
            {quantity.focused ? <i className="record-lot__caret" aria-hidden="true" /> : null}
            {quantity.unit}
          </b>
        </button>
      ) : null}
      {onAll != null ? (
        <button type="button" className="record-lot__all" onClick={onAll}>
          전부
        </button>
      ) : null}
    </div>
  );
}

/** 팔 때 저장 전에 크게 보이는 수익. 수량 종목은 평균 넣은 돈, 금액 종목은 판 몫의 넣은 돈을 앞에 적는다. */
export function SellPreviewCard({
  item,
  preview,
  soldQuantity,
}: {
  item: AssetItemOut;
  preview: SellPreview;
  /** 수량 종목이면 판 수량, 금액 종목이면 null. */
  soldQuantity: string | null;
}) {
  const average =
    soldQuantity == null ? null : averageCostOf(item.cost_basis ?? item.amount, item.quantity);
  const basis =
    soldQuantity == null || average == null
      ? `넣은 돈 ${formatCurrency(preview.soldCost)}어치`
      : `평균 ${formatCurrency(average)}에 산 ${formatQuantity(soldQuantity)}${unitOf(item.kind)}`;
  const tone = preview.gain >= 0 ? 'up' : 'down';
  return (
    <div className={`record-profit record-profit--${tone}`} data-testid={TEST_IDS.recordSellPreview}>
      <span className="record-profit__basis" data-numeric="">
        {basis}
      </span>
      <b className="record-profit__gain" data-numeric="">
        {formatSignedWon(preview.gain)}
        {preview.rate == null ? null : <em className="record-profit__rate">{rateText(preview.rate)}</em>}
      </b>
    </div>
  );
}
