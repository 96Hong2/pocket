import { parseDecimalOr, type PeriodSummaryOut } from '../../shared/api';
import { formatCurrency, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';

/**
 * 그 달의 지출·수입·차액 띠.
 *
 * 숫자는 서버가 접어 준 것을 그대로 쓴다. 이체 제외·환불 차감 규칙이 화면마다 달라지면
 * 같은 달을 두 화면이 다르게 말한다.
 */
export function MonthTotals({ summary }: { summary: PeriodSummaryOut }) {
  const expense = parseDecimalOr(summary.month_expense, 0);
  const income = parseDecimalOr(summary.month_income, 0);
  const delta = parseDecimalOr(summary.monthly_delta, 0);

  return (
    <dl className="tx-totals" aria-label="이번 달 합계">
      <div className="tx-totals__item">
        <dt>지출</dt>
        <dd className="tx-totals__value" data-testid={TEST_IDS.monthTotalExpense}>
          {formatCurrency(expense)}
        </dd>
      </div>
      <div className="tx-totals__item">
        <dt>수입</dt>
        <dd className="tx-totals__value tx-totals__value--income" data-testid={TEST_IDS.monthTotalIncome}>
          {formatCurrency(income)}
        </dd>
      </div>
      <div className="tx-totals__item">
        <dt>차액</dt>
        <dd className="tx-totals__value" data-testid={TEST_IDS.monthTotalDelta}>
          {formatSignedCurrency(delta)}
        </dd>
      </div>
    </dl>
  );
}
