import { useState } from 'react';

import { useIdentity } from '../../app/providers';
import {
  parseDecimal,
  parseDecimalOr,
  useCategories,
  useMonthlyReport,
  type BreakdownRowOut,
  type CategoryOut,
  type PeriodComparisonOut,
} from '../../shared/api';
import {
  formatCurrency,
  formatMonthLabel,
  formatShortDate,
  formatSignedCurrency,
  toLedgerDate,
} from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
  Card,
  CategoryAvatar,
  ErrorState,
  LoadingState,
  MonthStepper,
  SegmentedControl,
  toIconName,
  type SegmentedOption,
} from '../../shared/ui';

import { AdSlot } from '../ads';

import { CategoryDonut } from './CategoryDonut';
import { donutColors } from './donutColors';
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
  const { state: identity } = useIdentity();
  const report = useMonthlyReport({ year, month: monthNumber });
  const categories = useCategories();
  // 저장하는 취향이 아니라 그 화면에서 한 번 눌러 곁눈질하는 동작이다.
  const [mode, setMode] = useState<Mode>('expense');

  // 월 선택기는 어떤 상태에서도 남긴다. 지우면 오류 난 달에 갇혀 다른 달로 갈 수 없다.
  const stepper = <MonthStepper value={month} onChange={onMonthChange} maxMonth={thisMonth} />;

  // 식별키가 없으면 조회가 시작되지 않아 pending 이 끝나지 않는다. 그때 "불러오는 중" 을
  // 띄우면 영원히 도는 것처럼 보인다. 실패·미지원의 이유는 위 안내가 말한다.
  if (identity.status !== 'ready') {
    return (
      <div className="report">
        {stepper}
        {identity.status === 'loading' ? <LoadingState label="리포트를 불러오는 중이에요" /> : null}
      </div>
    );
  }

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
  const sliceTotal = parseDecimalOr(
    income ? data.income_breakdown_total : data.expense_breakdown_total,
    0,
  );
  const headline = parseDecimalOr(income ? data.month_income : data.month_expense, 0);
  const byId = new Map((categories.data?.items ?? []).map((item) => [item.id, item]));
  // 분류 목록이 없으면 이름을 붙일 수 없다. 조용히 '분류 없음' 으로 적으면 진짜 미분류와
  // 못 가르므로, 이름을 모른다는 것을 줄에도 안내에도 그대로 적는다.
  const namesUnknown = categories.isError || categories.isPending;
  // 환불이 지출보다 큰 분류는 호를 못 그려 조각에서 빠진다. 그래서 조각 합이 위 금액과 다르다.
  const slicesDiffer = !income && sliceTotal !== headline;
  // 도넛과 목록이 같은 표를 본다. 여기서 한 번 만들어 둘에 나눠 준다.
  const colors = donutColors(rows);

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
        {!income ? (
          <ComparisonLine comparison={data.comparison} testId={TEST_IDS.reportComparison} />
        ) : null}
        {!income ? (
          <ComparisonLine comparison={data.weeks} testId={TEST_IDS.reportWeeks} weekly />
        ) : null}
      </Card>

      {!data.has_any_transaction ? (
        <Card className="report__empty">
          <p>이 달엔 기록이 없어요</p>
          {/* 아래에 아직 볼 것이 남았다고 말한다. 없으면 여기서 화면이 끝난 줄 알고 나간다. */}
          <p className="report__empty-hint">
            기록이 없는 달도 괜찮아요. 아래 6개월 흐름은 볼 수 있어요
          </p>
        </Card>
      ) : null}

      {/*
        그 달에 기록은 있는데 지금 보는 쪽만 비었을 때.
        0 원과 빈 자리만 두면 못 불러온 것인지 정말 없는 것인지 화면만 보고는 못 가른다.
      */}
      {data.has_any_transaction && rows.length === 0 ? (
        <Card className="report__empty">
          <p>이 달엔 {income ? '수입' : '소비'} 기록이 없어요</p>
          <p className="report__empty-hint">
            {income ? '번 돈을 적으면 여기에 모여요' : '쓴 돈을 적으면 여기에 모여요'}
          </p>
        </Card>
      ) : null}

      {/* 조각이 없어도 이유는 말한다. 카드 안에 두면 환불이 더 큰 달에 아무 말도 못 하고
          헤드라인만 음수로 떠 있게 된다. 그 달이야말로 설명이 가장 필요한 달이다. */}
      {slicesDiffer ? (
        <Card className="report__note-card">
          <p className="report__note" data-testid={TEST_IDS.reportSliceNote}>
            환불이 더 큰 분류는 목록에서 빠져요. 그래서 분류를 더한 값({formatCurrency(sliceTotal)}
            )이 위 금액과 달라요
          </p>
        </Card>
      ) : null}

      {rows.length > 0 ? (
        <Card>
          {namesUnknown ? (
            <p className="report__note" role="status">
              분류 이름을 불러오지 못해 이름 대신 '이름 확인 중' 으로 적었어요
            </p>
          ) : null}
          <CategoryDonut rows={rows} center={donutCenter(rows, byId, namesUnknown, income)} />
          <ul className="report__list">
            {rows.map((row) => (
              <BreakdownItem
                key={row.key}
                row={row}
                category={byId.get(row.category_id ?? '')}
                namesUnknown={namesUnknown}
                income={income}
                color={colors.get(row.key)}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="report__section">6개월 흐름</h2>
        <TrendBars points={data.trend} mode={mode} currentMonth={month} />
      </Card>

      {/* 스크롤하는 화면 맨 아래 한 자리. 채울 광고가 없으면 접혀서 자리를 안 남긴다. */}
      <AdSlot />
    </div>
  );
}

/**
 * 링 가운데에 적을 것. 가장 큰 조각 하나다.
 *
 * 조각이 없거나 비중을 모르면 아무것도 적지 않는다. 억지로 채우면 링과 다른 말이 된다.
 */
function donutCenter(
  rows: BreakdownRowOut[],
  byId: Map<string, CategoryOut>,
  namesUnknown: boolean,
  income: boolean,
): { caption: string; name: string; share: string } | null {
  const top = rows.find((row) => row.share != null);
  if (top == null) return null;
  const share = parseDecimal(top.share);
  if (share == null) return null;
  return {
    caption: income ? '가장 큰 수입' : '가장 큰 지출',
    name: labelOf(top, byId.get(top.category_id ?? ''), namesUnknown),
    share: toPercent(share),
  };
}

/**
 * 예산이 있을 때만 뜨는 한 줄. 게이지 비율은 서버가 준다.
 *
 * **쓴 금액을 함께 적는다.** 위 헤드라인은 예산에서 뺀 거래까지 더한 값이고 이 비율은
 * 그것을 뺀 값이라, 숫자만 나란히 두면 같은 카드에서 산수가 안 맞는 것처럼 보인다.
 */
function BudgetLine({
  budget,
}: {
  budget: { amount: string | null; budgeted_spend: string; spend_progress: string | null };
}) {
  const amount = parseDecimal(budget.amount);
  const progress = parseDecimal(budget.spend_progress);
  if (amount == null || progress == null) return null;
  return (
    <p className="report__meta" data-testid={TEST_IDS.reportBudgetLine}>
      예산 {formatCurrency(amount)} 중 {formatCurrency(parseDecimalOr(budget.budgeted_spend, 0))}(
      {toPercent(progress)}) 썼어요
    </p>
  );
}

/**
 * 지난 기간과 견준 한 줄.
 *
 * **양쪽 창의 날짜를 다 적는다.** 지난 기간만 적으면 이쪽 창이 그 달을 넘어가 있어도
 * 사용자가 알 방법이 없다. 견줄 것이 없으면 서버가 null 을 준다.
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
  const delta = parseDecimalOr(comparison.delta, 0);
  const ratio = parseDecimal(comparison.delta_ratio);
  const here = `${formatShortDate(comparison.current_start)}~${formatShortDate(comparison.current_end)}`;
  const there = `${formatShortDate(comparison.previous_start)}~${formatShortDate(comparison.previous_end)}`;
  const noun = weekly ? '지난주' : '지난달';
  const change =
    delta === 0
      ? '그대로예요'
      : `${formatCurrency(Math.abs(delta))}${ratio != null ? `(${toPercent(Math.abs(ratio))})` : ''} ${delta > 0 ? '더' : '덜'} 썼어요`;
  return (
    <p className="report__meta" data-testid={testId}>
      이 기간({here}) {formatCurrency(parseDecimalOr(comparison.current_expense, 0))}. {noun} 같은
      기간({there}) {formatCurrency(parseDecimalOr(comparison.previous_expense, 0))}보다 {change}
    </p>
  );
}

function BreakdownItem({
  row,
  category,
  namesUnknown,
  income,
  color,
}: {
  row: BreakdownRowOut;
  category?: CategoryOut;
  namesUnknown: boolean;
  income: boolean;
  /** 이 줄이 링의 어느 조각인지. 조각에 못 들어간 줄은 색이 없다. */
  color?: string;
}) {
  const amount = parseDecimalOr(row.amount, 0);
  const share = parseDecimal(row.share);
  return (
    <li className="report__row" data-testid={TEST_IDS.reportBreakdownRow}>
      {/*
        링의 조각과 이 줄을 잇는 표시. 세이지에서 앰버로 가는 한 계열이라 조각끼리
        색 차이가 크지 않고, 순서만으로는 어느 조각이 어느 줄인지 짚기 어렵다.
      */}
      <span
        className={color != null ? 'report__row-swatch' : 'report__row-swatch is-empty'}
        style={color != null ? { background: color } : undefined}
        aria-hidden="true"
      />
      {category != null ? (
        <CategoryAvatar icon={toIconName(category.icon_key)} size={20} />
      ) : (
        <span className="report__row-noicon" aria-hidden="true" />
      )}
      <span className="report__row-name">{labelOf(row, category, namesUnknown)}</span>
      <span className="report__row-amount" data-testid={TEST_IDS.reportRowAmount}>
        {/* 수입에만 부호를 붙인다. 헤드라인과 표기가 갈리면 같은 값이 달라 보인다. */}
        {income ? formatSignedCurrency(amount) : formatCurrency(amount)}
      </span>
      <span className="report__row-share" data-testid={TEST_IDS.reportRowShare}>
        {share != null ? toPercent(share) : '—'}
      </span>
    </li>
  );
}

function labelOf(
  row: BreakdownRowOut,
  category: CategoryOut | undefined,
  namesUnknown: boolean,
): string {
  if (row.key === ROLLED_UP) return `그 밖 ${row.rolled_count}개`;
  if (row.key === UNCATEGORIZED) return '분류 없음';
  // 셋을 갈라 적는다. 이름을 못 받은 것, 사용자가 분류를 안 정한 것(위에서 걸렀다),
  // 그리고 목록에 없는 분류를 가리키는 것. 마지막은 지운 분류라 '분류 없음' 과 다르다.
  return category?.name ?? (namesUnknown ? '이름 확인 중' : '지운 분류');
}

/** `0.4211` → `42%`. 서버가 준 비율을 표시만 바꾼다. */
function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
