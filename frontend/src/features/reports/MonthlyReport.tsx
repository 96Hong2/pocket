import { useState } from 'react';

import {
  useCategories,
  useMonthlyReport,
  type BreakdownRowOut,
  type CategoryOut,
  type PeriodComparisonOut,
} from '../../shared/api';
import { formatCurrency, formatMonthLabel, formatShortDate, toLedgerDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
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

export function MonthlyReport({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (next: string) => void;
}) {
  // 아직 오지 않은 달은 볼 수 없다. 가면 안 끝난 이번 달을 "지난달 전체" 로 견주는 거짓말이 나온다.
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const report = useMonthlyReport({ year, month: monthNumber });
  const categories = useCategories();
  // 저장하는 취향이 아니라 그 화면에서 한 번 눌러 곁눈질하는 동작이다.
  const [mode, setMode] = useState<Mode>('expense');

  // 월 선택기는 어떤 상태에서도 남긴다. 지우면 오류 난 달에 갇혀 다른 달로 갈 수 없다.
  const stepper = <MonthStepper value={month} onChange={onMonthChange} maxMonth={thisMonth} />;

  if (report.isPending) {
    return (
      <div className="report">
        {stepper}
        <LoadingState label="리포트를 불러오는 중이에요" />
      </div>
    );
  }
  if (report.isError || report.data == null) {
    return (
      <div className="report">
        {stepper}
        <ErrorState title="리포트를 불러오지 못했어요" onRetry={() => void report.refetch()} />
      </div>
    );
  }

  const data = report.data;
  const income = mode === 'income';
  const rows = income ? data.income_breakdown : data.expense_breakdown;
  const sliceTotal = Number(income ? data.income_breakdown_total : data.expense_breakdown_total);
  const headline = Number(income ? data.month_income : data.month_expense);
  const byId = new Map((categories.data?.items ?? []).map((item) => [item.id, item]));
  // 분류 목록을 못 받으면 모든 줄이 '분류 없음' 이 된다. 조용히 그러면 진짜 미분류와 못 가른다.
  const namesUnknown = categories.isError;

  return (
    <div className="report">
      {stepper}

      <SegmentedControl
        className="report__modes"
        options={MODES}
        value={mode}
        onChange={setMode}
        ariaLabel="보는 것"
      />

      <Card className="report__headline">
        <p className="report__headline-label" data-testid={TEST_IDS.reportHeadlineLabel}>
          {formatMonthLabel(month)}에 {income ? '번 돈' : '쓴 돈'}
        </p>
        <Amount
          className="report__headline-value"
          value={headline}
          tone={income ? 'income' : 'neutral'}
          size={34}
          data-testid={TEST_IDS.reportTotal}
        />
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
          {namesUnknown ? (
            <p className="report__note" role="status">
              분류 이름을 불러오지 못해 이름 자리가 비어 있어요
            </p>
          ) : null}
          <CategoryDonut rows={rows} />
          {/* 환불이 지출보다 큰 분류는 합계가 음수라 호를 그릴 수 없어 목록에서 빠진다.
              그래서 조각 합이 위 금액보다 크다. 이유를 안 적으면 둘 중 하나가 틀린 것처럼 보인다. */}
          {!income && sliceTotal !== headline ? (
            <p className="report__note">
              환불이 더 큰 분류는 목록에서 빠져요. 그래서 아래 합({formatCurrency(sliceTotal)})이 위
              금액과 달라요
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
