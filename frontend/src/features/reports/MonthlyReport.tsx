import type { ReactNode } from 'react';

import { useIdentity } from '../../app/providers';
import {
  parseDecimal,
  parseDecimalOr,
  useCategories,
  useCurrentPeriod,
  useMonthlyReport,
  type CategoryOut,
  type MethodRowOut,
  type MonthlyReportOut,
  type PeriodComparisonOut,
} from '../../shared/api';
import { paymentMethodLabel } from '../../shared/ledger';
import { formatCurrency, formatMonthLabel, formatShortDate } from '../../shared/lib/format';
import { formatPeriodRange, periodOfMonth } from '../../shared/lib/monthPeriod';
import { TEST_IDS } from '../../shared/testIds';
import {
  Amount,
  Card,
  ErrorState,
  LoadingState,
  MonthStepper,
  PeriodRange,
  SegmentedControl,
  type SegmentedOption,
} from '../../shared/ui';

import { CategoryDonut } from './CategoryDonut';
import { ClosingSection } from './ClosingSection';
import { donutColors } from './donutColors';
import { donutCenter, toPercent } from './reportLabels';
import { BreakdownItem, BudgetLine, EmptyIcon } from './reportParts';
import { TagBreakdown } from '../tags';

import { RankList } from './RankList';
import { ShareBars } from './ShareBars';
import { TrendBars } from './TrendBars';

type Mode = 'expense' | 'income';

const MODES: SegmentedOption<Mode>[] = [
  { value: 'expense', label: '소비' },
  { value: 'income', label: '수입' },
];

export function MonthlyReport({
  month,
  onMonthChange,
  mode,
  onModeChange,
  onOpenAssets,
  onOpenCategory,
  onOpenLarge,
  autoOpenClosing = false,
  onClosingAutoOpened,
  adSlot,
  bottomAdSlot,
  onPeriodClick,
}: {
  month: string;
  onMonthChange: (next: string) => void;
  /** 달 이름 아래 기간 줄을 눌렀다. 한 달 시작일 시트를 연다. */
  onPeriodClick?: () => void;
  /** 소비·수입 탭. 페이지가 주소에 들고 있어 다른 화면에 다녀와도 그대로다. */
  mode: Mode;
  onModeChange: (next: Mode) => void;
  /** 탭 줄 오른쪽 「저축·투자」. 리포트에는 이체가 안 잡혀 자산 화면으로 보낸다. */
  onOpenAssets?: () => void;
  /** 분류 줄이나 도넛 조각을 눌렀다. 키는 리포트 줄의 키 그대로다. */
  onOpenCategory?: (key: string, from: 'row' | 'donut') => void;
  /** 큰 지출 줄을 눌렀다. */
  onOpenLarge?: (transactionId: string) => void;
  /** 홈의 결산 카드로 들어왔을 때만 참. 그 달 결산을 열어 둔 채로 시작한다. */
  autoOpenClosing?: boolean;
  /** 그 부탁을 쓴 순간 알린다. 로딩 때문에 결산 자리는 달을 옮길 때마다 다시 마운트된다. */
  onClosingAutoOpened?: () => void;
  /** 도넛 바로 위에 설 배너. 페이지가 넣어 준다. */
  adSlot?: ReactNode;
  /** 「큰 지출 Top 5」 바로 위에 설 배너. 소비 탭에만 선다. */
  bottomAdSlot?: ReactNode;
}) {
  // 아직 오지 않은 달은 볼 수 없다. 가면 안 끝난 이번 달을 "지난달 전체" 로 견주는 거짓말이 나온다.
  // 이번 달은 한 달 시작일로 정한 이름 달이다.
  const current = useCurrentPeriod();
  const thisMonth = current.period.key;
  const [year, monthNumber] = month.split('-').map(Number);
  const { state: identity } = useIdentity();
  // 시작일을 모르면 이번 달이 어느 달인지도 모른다. 받고 나서 묻는다.
  const report = useMonthlyReport({ year, month: monthNumber }, { enabled: current.known });
  const categories = useCategories();

  // 월 선택기는 어떤 상태에서도 남긴다. 지우면 오류 난 달에 갇혀 다른 달로 갈 수 없다.
  // 반년 전 리포트를 보고 온 사람이 화살표를 여섯 번 누르지 않게 한 번에 돌아온다.
  // 이번 달을 보고 있을 때는 갈 곳이 없어 알약이 뜨지 않는다.
  //
  // 한 달 시작일이 1 이 아니면 달 이름만으로는 며칠부터 며칠인지 모른다. 바로 아래에 기간을 둔다.
  // 서버와 같은 규칙으로 그 자리에서 세어, 불러오는 동안에도 줄이 서 있다.
  const stepper = (
    <div className="report__month">
      <MonthStepper
        value={month}
        onChange={onMonthChange}
        maxMonth={thisMonth}
        jumpTo={thisMonth}
      />
      {current.startDay !== 1 ? (
        <PeriodRange
          className="report__period"
          range={formatPeriodRange(periodOfMonth(month, current.startDay))}
          onClick={onPeriodClick}
          testId={TEST_IDS.reportPeriod}
        />
      ) : null}
    </div>
  );

  // 식별키가 없으면 조회가 시작되지 않아 pending 이 끝나지 않는다. 그때 "불러오는 중" 을
  // 띄우면 영원히 도는 것처럼 보인다. 실패·미지원의 이유는 위 안내가 말한다.
  if (identity.status !== 'ready') {
    return (
      <div className="report">
        {stepper}
        <div className="report__slot">
          {identity.status === 'loading' ? (
            <LoadingState label="리포트를 불러오는 중이에요" />
          ) : null}
        </div>
      </div>
    );
  }

  if (report.isPending) {
    return (
      <div className="report">
        {stepper}
        <div className="report__slot">
          <LoadingState label="리포트를 불러오는 중이에요" />
        </div>
      </div>
    );
  }
  if (report.isError || report.data == null) {
    return (
      <div className="report">
        {stepper}
        <div className="report__slot">
          <ErrorState title="리포트를 불러오지 못했어요" onRetry={() => void report.refetch()} />
        </div>
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

      <div className="report__modes-row">
        <SegmentedControl
          className="report__modes"
          options={MODES}
          value={mode}
          onChange={onModeChange}
          ariaLabel="보는 것"
        />
        {/* 탭이 아니라 다른 화면으로 가는 길이라 트랙 밖에 같은 높이의 흰 버튼으로 따로 둔다. */}
        {onOpenAssets != null ? (
          <button type="button" className="report__assets-link" onClick={onOpenAssets}>
            저축·투자
            <span className="report__chevron" aria-hidden="true">
              ›
            </span>
          </button>
        ) : null}
      </div>

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

      {/*
        배너 자리. 페이지가 넣어 준다. 조건부 형제들 사이지만 이 슬롯 자체는 늘 자리를 지켜,
        달을 옮겨 목록이 비어도 다시 마운트되지 않는다. 그것이 곧 광고 새로고침이다.
      */}
      {adSlot}

      {rows.length > 0 ? (
        <Card className="report__breakdown">
          {namesUnknown ? (
            <p className="report__note" role="status">
              분류 이름을 불러오지 못해 이름 대신 '이름 확인 중' 으로 적었어요
            </p>
          ) : null}
          <CategoryDonut
            rows={rows}
            center={donutCenter(rows, byId, namesUnknown, income)}
            onSlice={onOpenCategory != null ? (row) => onOpenCategory(row.key, 'donut') : undefined}
          />
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
                onOpen={onOpenCategory != null ? () => onOpenCategory(row.key, 'row') : undefined}
              />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="report__section">6개월 흐름</h2>
        <TrendBars points={data.trend} mode={mode} currentMonth={month} />
      </Card>

      {/*
        어떤 묶음에 갔나. 분류 도넛과 다른 질문이라 수입 모드에도 선다.
        태그를 하나도 안 만든 사람에게는 이 자리가 통째로 안 그려진다.
      */}
      <TagBreakdown
        breakdown={income ? data.income_tag_breakdown : data.expense_tag_breakdown}
        kindLabel={income ? '수입' : '지출'}
      />

      {/* 소비 이야기다. 수입에는 결제 수단도 큰 지출도 없다. */}
      {!income ? <PaymentMethods rows={data.method_breakdown} /> : null}

      {/*
        둘째 배너. **소비 탭에서만** 선다. 수입 탭에는 아래에 아무것도 없어 배너가
        화면 끝에 홀로 남는다.

        `report` 자리와 다른 이름을 쓴다. 자리 이름이 같으면 뒤에 붙는 쪽이 쿨다운에 걸려
        늘 접힌다(`AdSlot` 의 `REQUEST_COOLDOWN_MS`). 로그에서도 어느 자리인지 갈린다.
      */}
      {!income ? bottomAdSlot : null}

      {!income ? (
        <LargeExpenses
          rows={data.large_expenses}
          byId={byId}
          namesUnknown={namesUnknown}
          onOpen={onOpenLarge}
        />
      ) : null}
    </div>
  );
}

/**
 * 무엇으로 냈나.
 *
 * 같은 10만원이라도 카드로 낸 것은 다음 달에 빠지고 현금은 이미 빠졌다. 그 둘을 한
 * 숫자로 뭉개면 「이번 달에 쓴 돈」 과 「이번 달에 나간 돈」 이 구분되지 않는다.
 *
 * **안 고르고 적은 줄도 감추지 않는다.** 감추면 줄의 합이 그 달 지출과 안 맞는다.
 * 대신 언제나 맨 아래에 둔다(서버가 그 순서로 준다).
 */
function PaymentMethods({ rows }: { rows: MethodRowOut[] }) {
  // 한 줄도 없으면 카드째 그리지 않는다. 그 달에 지출이 없다는 말은 위에서 이미 했다.
  if (rows.length === 0) return null;
  // 안 고른 줄 하나뿐이면 아직 아무것도 고르지 않은 것이다. 「안 고름 100%」 한 줄은
  // 아무것도 알려 주지 않으면서 자리만 먹는다.
  if (rows.length === 1 && rows[0].key === 'none') return null;

  return (
    <Card>
      <h2 className="report__section">무엇으로 냈나</h2>
      <ShareBars
        testId={TEST_IDS.reportMethods}
        rows={rows.map((row) => ({
          key: row.key,
          name: paymentMethodLabel(row.key),
          amount: parseDecimalOr(row.amount, 0),
          share: parseDecimal(row.share) ?? 0,
        }))}
      />
    </Card>
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
  onOpen,
}: {
  rows: MonthlyReportOut['large_expenses'];
  byId: Map<string, CategoryOut>;
  namesUnknown: boolean;
  /** 줄을 누르면 그 기록의 고치기 시트를 연다. */
  onOpen?: (transactionId: string) => void;
}) {
  // 한 건도 없으면 카드째 그리지 않는다. 빈 카드는 아무것도 알려 주지 않는다.
  if (rows.length === 0) return null;

  return (
    <Card>
      <h2 className="report__section">큰 지출 Top 5</h2>
      <RankList
        rowTestId={TEST_IDS.reportLargeExpenseRow}
        amountTestId={TEST_IDS.reportLargeExpenseAmount}
        rows={rows.map((row) => {
          const category = byId.get(row.category_id ?? '');
          const categoryName =
            row.category_id == null
              ? null
              : (category?.name ?? (namesUnknown ? '이름 확인 중' : '지운 분류'));
          return {
            key: row.id,
            // 상호를 안 적은 거래가 많다. 그때는 분류로 부르고, 분류도 없으면 그 사실을 적는다.
            name: row.merchant ?? categoryName ?? '분류 없음',
            sub: row.merchant != null ? categoryName : null,
            amount: parseDecimalOr(row.amount, 0),
            onSelect: onOpen != null ? () => onOpen(row.id) : undefined,
          };
        })}
      />
    </Card>
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
