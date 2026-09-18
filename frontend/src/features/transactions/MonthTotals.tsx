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

/**
 * 합계 자리를 미리 잡아 두는 띠.
 *
 * 달을 넘기는 동안 이 자리가 카드 한 장으로 부풀었다가 한 줄로 줄었다. 그 아래 달력과
 * 목록이 통째로 따라 움직여서, 지난달을 찾으려고 화살표를 여러 번 누르면 화면이
 * 출렁였다. **이름은 그대로 두고 숫자 자리만 회색 막대로 둔다.** 높이가 같다.
 */
export function MonthTotalsSkeleton() {
  return (
    <div
      className="tx-totals tx-totals--loading"
      role="status"
      aria-label="이번 달 합계를 불러오는 중이에요"
    >
      {['지출', '수입', '차액'].map((label) => (
        <div className="tx-totals__item" key={label}>
          <span className="tx-totals__label">{label}</span>
          {/* 자리만 채우는 숫자다. 글자는 안 보이고 크기만 진짜 금액과 같다. */}
          <span className="pk-skeleton tx-totals__bar" aria-hidden="true">
            000,000원
          </span>
        </div>
      ))}
    </div>
  );
}
