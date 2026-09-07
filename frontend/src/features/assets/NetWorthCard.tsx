import { parseDecimalOr, type AssetSnapshotOut, type AssetSummaryOut } from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount } from '../../shared/ui';

export interface NetWorthCardProps {
  summary: AssetSummaryOut;
  /** 언제 적은 것인지. 아직 스냅샷이 없으면 기준일을 적지 않는다. */
  snapshot: AssetSnapshotOut | null;
}

/**
 * 순자산 카드.
 *
 * 자산 합·부채 합·순자산을 여기서 계산하지 않는다. 화면이 줄 금액을 다시 더하면
 * 서버가 센 것과 어긋날 수 있고, 그러면 어느 쪽이 맞는지 알 수 없다.
 *
 * **남은 예산·이번 달 차액을 이 카드에 넣지 않는다.** 답하는 질문이 다른 세 숫자다.
 */
export function NetWorthCard({ summary, snapshot }: NetWorthCardProps) {
  const assets = parseDecimalOr(summary.total_assets, 0);
  const liabilities = parseDecimalOr(summary.total_liabilities, 0);
  const netWorth = parseDecimalOr(summary.net_worth, 0);

  return (
    <section className="net-worth" aria-label="순자산">
      <span className="net-worth__label">
        {snapshot == null
          ? '내 순자산'
          : `내 순자산 · ${formatDayLabel(snapshot.effective_on)} 기준`}
      </span>
      <Amount
        className="net-worth__amount"
        data-testid={TEST_IDS.netWorth}
        value={netWorth}
        size={28}
        weight={800}
      />
      {/* 순자산 한 숫자만 두면 부채가 얼마인지 보이지 않는다. 뺀 근거를 함께 적는다. */}
      <span className="net-worth__breakdown">
        {`자산 ${formatCurrency(assets)} − 부채 ${formatCurrency(liabilities)}`}
      </span>
    </section>
  );
}
