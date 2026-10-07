import { useOverlayBackClose } from '../../app/providers';
import {
  parseDecimalOr,
  type AssetHistoryPointOut,
  type AssetSnapshotOut,
  type AssetSummaryOut,
} from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import { BottomSheet, Button, SheetHeader } from '../../shared/ui';

import { pointLabel } from './assetView';
import { NetWorthLineChart } from './TrendCharts';

export interface NetWorthDetailSheetProps {
  open: boolean;
  summary: AssetSummaryOut;
  snapshot: AssetSnapshotOut | null;
  points: readonly AssetHistoryPointOut[];
  onClose: () => void;
}

/** 순자산 상세. 큰 선 그래프와 자산, 부채, 순자산 한 줄씩. */
export function NetWorthDetailSheet({
  open,
  summary,
  snapshot,
  points,
  onClose,
}: NetWorthDetailSheetProps) {
  useOverlayBackClose(open, onClose);

  const chart = points.map((point, index) => ({
    label: pointLabel(point.month, index === points.length - 1),
    value: parseDecimalOr(point.net_worth, 0),
  }));

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="순자산" className="nw-sheet">
      <SheetHeader title="순자산" />
      {snapshot != null ? (
        <p className="nw-sheet__lead">{`${formatDayLabel(snapshot.effective_on)} 기준`}</p>
      ) : null}
      <NetWorthLineChart points={chart} />
      <div className="nw-sheet__rows">
        <div className="nw-sheet__row">
          <span>자산</span>
          <b>{formatCurrency(parseDecimalOr(summary.total_assets, 0))}</b>
        </div>
        <div className="nw-sheet__row">
          <span>부채</span>
          <b>{`− ${formatCurrency(parseDecimalOr(summary.total_liabilities, 0))}`}</b>
        </div>
        <div className="nw-sheet__row nw-sheet__row--total">
          <span>순자산</span>
          <b>{formatCurrency(parseDecimalOr(summary.net_worth, 0))}</b>
        </div>
      </div>
      <Button fullWidth className="nw-sheet__close" onClick={onClose}>
        닫기
      </Button>
    </BottomSheet>
  );
}
