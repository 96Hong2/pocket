import { useState } from 'react';

import {
  useCategories,
  useMonthlyReport,
  type BreakdownRowOut,
  type CategoryOut,
  type PeriodComparisonOut,
} from '../../shared/api';
import { formatCurrency, formatShortDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Card,
  ErrorState,
  LoadingState,
  MonthStepper,
  SegmentedControl,
  type SegmentedOption,
} from '../../shared/ui';

import { CategoryDonut } from './CategoryDonut';
import { TrendBars } from './TrendBars';

/** 분류를 못 정한 줄과 접은 줄. 서버는 코드값만 주고 한국어는 화면이 붙인다. */
const UNCATEGORIZED = 'uncategorized';
const ROLLED_UP = 'rolled_up';

type Mode = 'expense' | 'income';

const MODES: SegmentedOption<Mode>[] = [
  { value: 'expense', label: '소비' },
  { value: 'income', label: '수입' },
];

export function MonthlyReport({ month, onMonthChange }: { month: string; onMonthChange: (next: string) => void }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const report = useMonthlyReport({ year, month: monthNumber });
  const categories = useCategories();
  // 저장하는 취향이 아니라 그 화면에서 한 번 눌러 곁눈질하는 동작이다.
  const [mode, setMode] = useState<Mode>('expense');

  if (report.isPending) return <LoadingState label="리포트를 불러오는 중이에요" />;
  if (report.isError || report.data == null) {
    return (
      <ErrorState
        title="리포트를 불러오지 못했어요"
        onRetry={() => void report.refetch()}
      />
    );
  }

  const data = report.data;
  const income = mode === 'income';
  const rows = income ? data.income_breakdown : data.expense_breakdown;
  const sliceTotal = Number(income ? data.income_breakdown_total : data.expense_breakdown_total);
  const headline = Number(income ? data.month_income : data.month_expense);
  const byId = new Map((categories.data?.items ?? []).map((item) => [item.id, item]));

  return (
    <div className="report">
      <MonthStepper value={month} onChange={onMonthChange} />

      <SegmentedControl
        className="report__modes"
        options={MODES}
        value={mode}
        onChange={setMode}
        ariaLabel="보는 것"
      />

      <Card className="report__headline">
        <p className="report__headline-label">{income ? '이번 달 번 돈' : '이번 달 쓴 돈'}</p>
        <p className="report__headline-value" data-testid={TEST_IDS.reportTotal}>
          {formatCurrency(headline)}
        </p>
        {!income ? <BudgetLine budget={data.budget} /> : null}
        {!income ? <ComparisonLine comparison={data.comparison} testId={TEST_IDS.reportComparison} /> : null}
        {!income ? <ComparisonLine comparison={data.weeks} testId={TEST_IDS.reportWeeks} weekly /> : null}
      </Card>

      {!data.has_any_transaction ? (
        <Card className="report__empty">
          <p>이 달엔 기록이 없어요</p>
          <p className="report__empty-hint">기록이 없는 달도 괜찮아요</p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          <CategoryDonut rows={rows} />
          {/* 조각 합이 총액과 다를 수 있다. 환불이 지출보다 큰 분류를 뺀 값이라서다. */}
          {!income && sliceTotal !== headline ? (
            <p className="report__note">
              환불을 빼기 전 기준이라 아래 합({formatCurrency(sliceTotal)})은 위 금액과 달라요
            </p>
          ) : null}
          <ul className="report__list">
            {rows.map((row) => (
              <BreakdownItem key={row.key} row={row} category={byId.get(row.category_id ?? '')} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="report__section">6개월 흐름</h2>
        <TrendBars points={data.trend} mode={mode} currentMonth={month} />
      </Card>
    </div>
  );
}

/** 예산이 있을 때만 뜨는 한 줄. 게이지 비율은 서버가 준다. */
function BudgetLine({ budget }: { budget: { amount: string | null; spend_progress: string | null } }) {
  if (budget.amount == null || budget.spend_progress == null) return null;
  return (
    <p className="report__meta" data-testid={TEST_IDS.reportBudgetLine}>
      예산 {formatCurrency(Number(budget.amount))} 중 {toPercent(budget.spend_progress)} 썼어요
    </p>
  );
}

/**
 * 지난 기간과 견준 한 줄.
 *
 * **무엇과 견줬는지 날짜를 적는다.** 숫자만 쓰면 서버가 달 전체를 세고 있어도 그럴듯해 보인다.
 */
function ComparisonLine({
  comparison,
  testId,
  weekly = false,
}: {
  comparison: PeriodComparisonOut | null;
  testId: string;
  weekly?: boolean;
}) {
  if (comparison == null) return null;
  const delta = Number(comparison.delta);
  const window = `${formatShortDate(comparison.previous_start)}~${formatShortDate(comparison.previous_end)}`;
  const noun = weekly ? '지난주' : '지난달';
  return (
    <p className="report__meta" data-testid={testId}>
      {noun} 같은 기간({window}) {formatCurrency(Number(comparison.previous_expense))}보다{' '}
      {delta === 0 ? '그대로예요' : `${formatCurrency(Math.abs(delta))} ${delta > 0 ? '더' : '덜'} 썼어요`}
    </p>
  );
}

function BreakdownItem({ row, category }: { row: BreakdownRowOut; category?: CategoryOut }) {
  return (
    <li className="report__row" data-testid={TEST_IDS.reportBreakdownRow}>
      <span className="report__row-name">{labelOf(row, category)}</span>
      <span className="report__row-amount" data-testid={TEST_IDS.reportRowAmount}>
        {formatCurrency(Number(row.amount))}
      </span>
      <span className="report__row-share" data-testid={TEST_IDS.reportRowShare}>
        {row.share != null ? toPercent(row.share) : '—'}
      </span>
    </li>
  );
}

function labelOf(row: BreakdownRowOut, category?: CategoryOut): string {
  if (row.key === ROLLED_UP) return `그 밖 ${row.rolled_count}개`;
  if (row.key === UNCATEGORIZED) return '분류 없음';
  return category?.name ?? '분류 없음';
}

/** `0.4211` → `42%`. 서버가 준 비율을 표시만 바꾼다. */
function toPercent(value: string): string {
  return `${Math.round(Number(value) * 100)}%`;
}
