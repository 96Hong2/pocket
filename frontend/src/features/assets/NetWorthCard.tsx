import {
  parseDecimalOr,
  type AssetHistoryPointOut,
  type AssetSnapshotOut,
  type AssetSummaryOut,
} from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount } from '../../shared/ui';

import { formatSignedWon, monthOverMonth, trendValues } from './assetView';
import { Sparkline } from './TrendCharts';

export interface NetWorthCardProps {
  summary: AssetSummaryOut;
  /** 언제 적은 것인지. 아직 스냅샷이 없으면 기준일을 적지 않는다. */
  snapshot: AssetSnapshotOut | null;
  /** 달마다 월말 점. 못 받았으면 빈 배열이고 추이만 빠진다. */
  points: readonly AssetHistoryPointOut[];
  onOpen: () => void;
}

/**
 * 순자산 카드. 누르면 상세 시트가 열린다.
 * 합계는 서버가 센 값 그대로다. 화면이 줄 금액을 다시 더하지 않는다.
 */
export function NetWorthCard({ summary, snapshot, points, onOpen }: NetWorthCardProps) {
  const netWorth = parseDecimalOr(summary.net_worth, 0);
  const saved = parseDecimalOr(summary.month_saved, 0);
  const diff = monthOverMonth(points);

  return (
    <section className="net-worth-wrap" aria-label="순자산">
      <button type="button" className="net-worth" onClick={onOpen}>
        <span className="net-worth__top">
          <span className="net-worth__main">
            <span className="net-worth__label">
              {snapshot == null
                ? '내 순자산'
                : `내 순자산 · ${formatDayLabel(snapshot.effective_on)} 기준`}
              <i className="net-worth__chev" aria-hidden="true">
                ›
              </i>
            </span>
            <Amount
              className="net-worth__amount"
              data-testid={TEST_IDS.netWorth}
              value={netWorth}
              size={28}
              weight={800}
            />
          </span>
          <Sparkline values={trendValues(points)} width={120} height={44} />
        </span>
        <span className="net-worth__row">
          {diff != null ? (
            <span>
              지난달보다{' '}
              <b className={diff >= 0 ? 'net-worth__up' : 'net-worth__down'}>
                {formatSignedWon(diff)}
              </b>
            </span>
          ) : null}
          <span>
            이번 달 모은 돈 <b>{formatCurrency(saved)}</b>
          </span>
        </span>
      </button>
    </section>
  );
}
