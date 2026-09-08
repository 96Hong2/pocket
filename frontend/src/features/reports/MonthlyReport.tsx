import { useState } from 'react';

import { useIdentity } from '../../app/providers';
import {
  parseDecimal,
  parseDecimalOr,
  useCategories,
  useMonthlyReport,
  type BreakdownRowOut,
  type CategoryOut,
  type MonthlyReportOut,
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
  Gauge,
  iconUrl,
  LoadingState,
  MonthStepper,
  SegmentedControl,
  toIconName,
  type SegmentedOption,
} from '../../shared/ui';

import { CategoryDonut } from './CategoryDonut';
import { ClosingSection } from './ClosingSection';
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
  autoOpenClosing = false,
  onClosingAutoOpened,
}: {
  month: string;
  onMonthChange: (next: string) => void;
  /** 홈의 결산 카드로 들어왔을 때만 참. 그 달 결산을 열어 둔 채로 시작한다. */
  autoOpenClosing?: boolean;
  /** 그 부탁을 쓴 순간 알린다. 로딩 때문에 결산 자리는 달을 옮길 때마다 다시 마운트된다. */
  onClosingAutoOpened?: () => void;
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
        {!income && (data.comparison || data.weeks) ? (
          <dl className="report__compare">
            <ComparisonLine
              comparison={data.comparison}
              testId={TEST_IDS.reportComparison}
              label="지난달 같은 기간"
            />
            <ComparisonLine
              comparison={data.weeks}
              testId={TEST_IDS.reportWeeks}
              label="지난주 같은 기간"
            />
          </dl>
        ) : null}
      </Card>

      {/* 헤드라인 바로 아래. 끝난 달에 기록이 있을 때만 그려지고, 판정은 서버가 한다. */}
      <ClosingSection month={month} autoOpen={autoOpenClosing} onAutoOpened={onClosingAutoOpened} />

      {!data.has_any_transaction ? (
        <Card className="report__empty">
          <EmptyIcon />
          <p className="report__empty-title">이 달엔 기록이 없어요</p>
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
          <EmptyIcon />
          <p className="report__empty-title">이 달엔 {income ? '수입' : '소비'} 기록이 없어요</p>
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
        <Card className="report__breakdown">
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
                topShare={parseDecimal(rows[0]?.share ?? null) ?? 0}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="report__section">6개월 흐름</h2>
        <TrendBars points={data.trend} mode={mode} currentMonth={month} />
      </Card>

      {/* 소비 이야기다. 수입에는 큰 지출이 없다. */}
      {!income ? (
        <LargeExpenses rows={data.large_expenses} byId={byId} namesUnknown={namesUnknown} />
      ) : null}

      {/*
        광고 자리는 홈 한 곳뿐이다. 시안에는 여기에도 배너가 있지만 PRD v5 가 홈으로 못 박았다.
        달을 옮길 때마다 본문을 다시 그려서 배너가 다시 붙고, 그것이 곧 광고 새로고침이 된다.
      */}
    </div>
  );
}

/** 기록이 없는 자리를 그림 하나로 알린다. 글자만 두면 못 불러온 화면처럼 보인다. */
function EmptyIcon() {
  return (
    <img className="report__empty-icon" src={iconUrl('26_sparkles')} alt="" aria-hidden />
  );
}

/**
 * 그 달에 가장 컸던 지출 다섯 건.
 *
 * 분류별 합계는 "어디에" 를 말하지만 "무엇을 샀길래" 는 못 말한다. 큰 것부터 다섯 건은
 * 서버가 골라 준다. 여기서 다시 정렬하거나 자르지 않는다.
 */
function LargeExpenses({
  rows,
  byId,
  namesUnknown,
}: {
  rows: MonthlyReportOut['large_expenses'];
  byId: Map<string, CategoryOut>;
  namesUnknown: boolean;
}) {
  // 한 건도 없으면 카드째 그리지 않는다. 빈 카드는 아무것도 알려 주지 않는다.
  if (rows.length === 0) return null;

  return (
    <Card>
      <h2 className="report__section">큰 지출 Top 5</h2>
      <ol className="report__large">
        {rows.map((row, index) => {
          const category = byId.get(row.category_id ?? '');
          const categoryName =
            row.category_id == null
              ? null
              : (category?.name ?? (namesUnknown ? '이름 확인 중' : '지운 분류'));
          // 상호를 안 적은 거래가 많다. 그때는 분류로 부르고, 분류도 없으면 그 사실을 적는다.
          const name = row.merchant ?? categoryName ?? '분류 없음';
          return (
            <li
              key={row.id}
              className="report__large-row"
              data-testid={TEST_IDS.reportLargeExpenseRow}
            >
              <span className="report__large-rank" aria-hidden="true">
                {index + 1}
              </span>
              <span className="report__large-text">
                <span className="report__large-name">{name}</span>
                {row.merchant != null && categoryName != null ? (
                  <span className="report__large-category">{categoryName}</span>
                ) : null}
              </span>
              <Amount
                className="report__large-amount"
                data-testid={TEST_IDS.reportLargeExpenseAmount}
                value={parseDecimalOr(row.amount, 0)}
                size={14}
              />
            </li>
          );
        })}
      </ol>
    </Card>
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
 * 예산이 있을 때만 뜨는 한 줄. 게이지와 '예산 X 중 N%' 를 함께 둔다. 비율은 서버가 준다.
 *
 * **예산 금액을 함께 적는다.** 비율만 두면 무엇의 몇 %인지 알 수 없다. 쓴 금액은 적지
 * 않는다. 위 헤드라인은 예산에서 뺀 거래까지 더한 값이라 이 비율의 기준과 다르다.
 */
function BudgetLine({
  budget,
}: {
  budget: { amount: string | null; spend_progress: string | null };
}) {
  const amount = parseDecimal(budget.amount);
  const progress = parseDecimal(budget.spend_progress);
  if (amount == null || progress == null) return null;
  return (
    <div className="report__budget" data-testid={TEST_IDS.reportBudgetLine}>
      <Gauge className="report__budget-gauge" ratio={progress} label="예산 사용률" />
      <p className="report__budget-text">
        예산 {formatCurrency(amount)} 중 <b>{toPercent(progress)}</b>
      </p>
    </div>
  );
}

/** 이 배율을 넘으면 견줄 지난 기간이 사실상 비어 있다는 뜻이다. 숫자를 감춘다. */
const MAX_READABLE_RATIO = 9.99;

/**
 * 지난 기간과 견준 한 줄.
 *
 * **양쪽 창의 날짜를 다 적는다.** 지난 기간만 적으면 이쪽 창이 그 달을 넘어가 있어도
 * 사용자가 알 방법이 없다. 견줄 것이 없으면 서버가 null 을 준다.
 */
function ComparisonLine({
  comparison,
  testId,
  label,
}: {
  comparison: PeriodComparisonOut | null;
  testId: string;
  label: string;
}) {
  if (comparison == null) return null;
  const delta = parseDecimalOr(comparison.delta, 0);
  const ratio = parseDecimal(comparison.delta_ratio);
  const here = `${formatShortDate(comparison.current_start)}~${formatShortDate(comparison.current_end)}`;
  const there = `${formatShortDate(comparison.previous_start)}~${formatShortDate(comparison.previous_end)}`;

  // 지난 기간이 거의 0 이면 배율이 수천 퍼센트로 튄다. 숫자는 맞지만 읽을 값이 못 된다.
  const showRatio = ratio != null && Math.abs(ratio) <= MAX_READABLE_RATIO;
  const value =
    delta === 0
      ? '그대로'
      : `${delta > 0 ? '+' : '-'}${formatCurrency(Math.abs(delta))}${showRatio ? ` (${toPercent(Math.abs(ratio))})` : ''}`;

  return (
    <div className="report__compare-row" data-testid={testId}>
      <dt className="report__compare-label">{label}</dt>
      <dd className={delta > 0 ? 'report__compare-value is-up' : 'report__compare-value'}>
        {value}
      </dd>
      {/*
        양쪽 창의 날짜를 남긴다. 지난 기간만 적거나 아예 빼면, 이쪽 창이 그 달을 넘어가
        있어도 사용자가 알 방법이 없다. 크게 읽을 값은 아니라 작은 줄로 내린다.
      */}
      <dd className="report__compare-window">
        {here} vs {there}
      </dd>
    </div>
  );
}

function BreakdownItem({
  row,
  category,
  namesUnknown,
  income,
  color,
  topShare,
}: {
  row: BreakdownRowOut;
  category?: CategoryOut;
  namesUnknown: boolean;
  income: boolean;
  /** 이 줄이 링의 어느 조각인지. 조각에 못 들어간 줄은 색이 없다. */
  color?: string;
  /** 맨 위 줄의 비중. 막대는 이 줄을 가득 채운 것으로 놓고 나머지를 견준다. */
  topShare: number;
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
        <CategoryAvatar icon={toIconName(category.icon_key)} size={44} />
      ) : (
        <span className="report__row-noicon" aria-hidden="true" />
      )}
      <span className="report__row-name">{labelOf(row, category, namesUnknown)}</span>
      {/*
        비중을 길이로도 보여준다. 숫자만 있으면 줄끼리 크기를 머릿속에서 견줘야 한다.
        조각에 못 들어간 줄(환불이 더 큰 분류)은 채울 것이 없어 트랙만 남는다.
      */}
      <span className="report__row-bar" aria-hidden="true">
        <span
          className="report__row-bar-fill"
          style={{ width: `${barWidth(share, topShare)}%`, background: color ?? 'transparent' }}
        />
      </span>
      <span className="report__row-value">
        <span className="report__row-amount" data-testid={TEST_IDS.reportRowAmount}>
          {/* 수입에만 부호를 붙인다. 헤드라인과 표기가 갈리면 같은 값이 달라 보인다. */}
          {income ? formatSignedCurrency(amount) : formatCurrency(amount)}
        </span>{' '}
        <span className="report__row-share" data-testid={TEST_IDS.reportRowShare}>
          {share != null ? toPercent(share) : '—'}
        </span>
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

/**
 * 막대가 차지할 길이(%).
 *
 * 전체 대비가 아니라 **맨 위 줄 대비**다. 분류가 아홉이면 1등도 30% 남짓이라
 * 전체 대비로 그리면 막대가 트랙의 삼분의 일도 못 채우고 아래 줄들은 점이 된다.
 * 줄끼리 크기를 견주라고 그리는 막대이므로 1등을 가득 채운 것으로 놓는다.
 * 비중을 모르는 줄과 1등이 0 인 달은 0 이라 트랙만 남는다.
 */
function barWidth(share: number | null, topShare: number): number {
  if (share == null || topShare <= 0) return 0;
  return Math.max(0, Math.min(100, (share / topShare) * 100));
}

/** `0.4211` → `42%`. 서버가 준 비율을 표시만 바꾼다. */
function toPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
