import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useCreateTransaction,
  useDeleteTransaction,
  type CategoryOut,
  type TransactionOut,
} from '../../shared/api';
import { LedgerRow, NoSpendRow, splitNoSpend } from '../../shared/ledger';
import {
  formatCurrency,
  formatRelativeDay,
  shiftDay,
  toLedgerDate,
  toLedgerNoonIso,
  withTopic,
} from '../../shared/lib/format';
import { Button, Card, ErrorState, LoadingState, iconUrl } from '../../shared/ui';

interface TodayListProps {
  /** 보고 있는 날. `2026-09-08` */
  day: string;
  onDayChange: (day: string) => void;
  transactions: TransactionOut[];
  categories: CategoryOut[];
  /** 아직 오는 중인가. 오는 중을 "비어 있어요" 로 덮지 않으려고 받는다. */
  loading?: boolean;
  /** 조회가 실패했나. 실패를 "비어 있어요" 로 덮지 않으려고 받는다. */
  loadFailed?: boolean;
  onRetry?: () => void;
  /** 한 줄을 누르면 고치기로 간다. 안 넘기면 줄이 눌리지 않는다. */
  onPick?: (transaction: TransactionOut) => void;
  /** 비었을 때 여는 기록 시트. 위 큰 버튼과 같은 자리로 간다. */
  /**
   * 빈 날 카드의 기록 입구.
   *
   * **보고 있는 날을 함께 넘긴다.** 「어제 기록하기」 를 눌렀는데 오늘에 적히면
   * 사람은 적은 것이 사라진 줄 안다. 버튼 이름이 곧 적힐 날이어야 한다.
   */
  onRecord: (day: string) => void;
}

/**
 * 고른 날 것만 고른다.
 *
 * 서버가 준 시각에는 UTC 오프셋이 붙어 있고, 서버는 '오늘'과 월 경계를 사용자 시간대로 정한다.
 * 기기 시간대로 날짜를 뽑으면 해외에서 앱을 열었을 때 히어로 숫자와 이 목록이 서로 다른 날을 본다.
 */
function isOn(occurredAt: string, day: string): boolean {
  const at = new Date(occurredAt);
  return !Number.isNaN(at.getTime()) && toLedgerDate(at) === day;
}

/**
 * 그날 쓴 돈 합계.
 *
 * 예산에서 뺀 줄은 세지 않는다. 시안이 그 줄을 흐리게 그리고 합계에서도 빼고 있어,
 * 여기서만 더하면 화면에 보이는 줄과 위 숫자가 서로 다른 말을 한다.
 * 수입·이체는 쓴 돈이 아니라 지출만 센다.
 */
function sumSpent(rows: TransactionOut[]): number {
  return rows.reduce(
    (total, row) =>
      row.type === 'expense' && !row.excluded_from_budget
        ? total + parseDecimalOr(row.amount, 0)
        : total,
    0,
  );
}

/** 오늘 카드의 마지막 줄. 카드 밖에 두면 오늘과 그 전이 서로 다른 덩어리로 갈린다. */
function MoreLink() {
  return (
    <Link className="home-more" to={ROUTES.calendar}>
      전체 내역 보기
    </Link>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M11 4L6 9l5 5' : 'M7 4l5 5-5 5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TodayList({
  day,
  onDayChange,
  transactions,
  categories,
  loading = false,
  loadFailed = false,
  onRetry,
  onPick,
  onRecord,
}: TodayListProps) {
  const today = toLedgerDate(new Date());
  const isToday = day === today;
  const label = formatRelativeDay(day);
  const rows = transactions.filter((tx) => isOn(tx.occurred_at, day));
  // 안 쓴 날 표시는 금액이 0 이라 다른 줄과 같은 모양으로 그릴 수 없다. 달력과 같은 규칙으로 가른다.
  const { noSpend: noSpendRows, spent } = splitNoSpend(rows);
  const noSpend = noSpendRows[0] ?? null;
  const spentTotal = sumSpent(spent);
  // '오늘' 은 받침이 있어 조사가 '은' 이다. 오늘 화면의 문구는 예전 그대로 「오늘은 안 썼어요」다.
  const noSpendLabel = `${withTopic(label)} 안 썼어요`;

  const analytics = useAnalytics();
  const markNoSpend = useCreateTransaction();
  const cancelNoSpend = useDeleteTransaction();
  const noSpendError =
    markNoSpend.error instanceof ApiError
      ? markNoSpend.error
      : cancelNoSpend.error instanceof ApiError
        ? cancelNoSpend.error
        : null;

  return (
    <section className="home-today" aria-label={label}>
      <div className="home-today__head">
        {/*
          오늘 적은 것이 없어도 어제를 바로 볼 수 있어야 한다. 달력까지 들어가면 그냥 안 본다.
          앞으로는 오늘까지만 간다. 아직 오지 않은 날에는 적을 것이 없다.
        */}
        <div className="home-today__nav">
          <button
            type="button"
            className="home-today__step"
            aria-label={`${formatRelativeDay(shiftDay(day, -1))} 보기`}
            onClick={() => onDayChange(shiftDay(day, -1))}
          >
            <Chevron direction="left" />
          </button>
          <h2 className="home-today__title" aria-live="polite">
            {label}
          </h2>
          <button
            type="button"
            className="home-today__step"
            disabled={isToday}
            aria-label={`${formatRelativeDay(shiftDay(day, 1))} 보기`}
            onClick={() => onDayChange(shiftDay(day, 1))}
          >
            <Chevron direction="right" />
          </button>
          {/*
            **며칠 뒤로 넘어갔으면 한 번에 돌아온다.**
            화살표로 한 칸씩 되짚으면 지난 주를 보고 온 사람은 예닐곱 번을 눌러야 한다.
            오늘 보고 있을 때는 갈 곳이 없어 자리를 비워 둔다.
          */}
          {!isToday ? (
            <button type="button" className="home-today__jump" onClick={() => onDayChange(today)}>
              오늘로
            </button>
          ) : null}
        </div>
        {/* 적은 줄이 없으면 0원을 적지 않는다. 아직 아무 일도 없었다는 말이 먼저다.
            줄은 있는데 합이 0 인 날(예산 제외만 있거나 안 썼다고만 적은 날)에는 0원을 적는다. */}
        {rows.length > 0 ? (
          <span className="home-today__total" data-numeric="">
            {formatCurrency(spentTotal)} 씀
          </span>
        ) : null}
      </div>
      {rows.length > 0 ? (
        <Card padding="list">
          {spent.map((tx) => (
            <LedgerRow
              key={tx.id}
              transaction={tx}
              categories={categories}
              avatarSize={54}
              density="compact"
              onClick={onPick ? () => onPick(tx) : undefined}
            />
          ))}
          {/* 아래에 전체 내역 줄이 붙으니 구분선을 감추지 않는다. */}
          {noSpend != null ? (
            <NoSpendRow
              title={noSpendLabel}
              avatarSize={54}
              density="compact"
              canceling={cancelNoSpend.isPending}
              onCancel={() => cancelNoSpend.mutate(noSpend.id)}
              hideDivider={false}
            />
          ) : null}
          {noSpendError ? <ErrorLine message={noSpendError.message} /> : null}
          <MoreLink />
        </Card>
      ) : loading ? (
        <Card padding="md">
          <LoadingState variant="rows" rows={2} label={`${label} 기록을 불러오는 중이에요`} />
        </Card>
      ) : loadFailed ? (
        <Card padding="md">
          <ErrorState
            size="inline"
            title={`${label} 기록을 불러오지 못했어요`}
            description="적어 둔 것이 사라진 게 아니에요. 다시 시도해 주세요."
            onRetry={onRetry}
          />
        </Card>
      ) : (
        <Card padding="md">
          {/*
            **빈 날에 할 일은 둘뿐이다. 지금 적거나, 안 썼다고 남기거나.**

            예전에는 「비어 있어요」 안내와 「안 썼어요」가 같은 말투로 위아래에 서 있었다.
            둘 다 문장이라 어느 쪽이 버튼인지 읽히지 않았고, 비었다는 안내인 줄 알고
            눌렀다가 안 쓴 날 기록이 저장되는 일이 있었다.

            그래서 안내를 지우고 둘만 남긴다. 기록은 **이름이 붙은 버튼**이 맡아
            무엇을 하는 자리인지 더 고민할 것이 없고, 남은 한 줄은 안 썼다는 표시 하나뿐이라
            무엇을 누른 것인지 헷갈리지 않는다.
          */}
          <button
            type="button"
            className="home-today__nospend"
            disabled={markNoSpend.isPending}
            onClick={() => {
              if (markNoSpend.isPending) return;
              analytics.log(EVENTS.noSpendMarked, { where: 'home', day }, { kind: 'click' });
              markNoSpend.mutate({
                occurred_at: toLedgerNoonIso(day),
                amount: '0',
                type: 'expense',
                category_id: null,
                source: 'no_spend',
                confidence: 1,
                excluded_from_budget: false,
              });
            }}
          >
            <img
              className="home-today__nospend-icon"
              src={iconUrl('27_clock')}
              alt=""
              aria-hidden="true"
            />
            <span>{markNoSpend.isPending ? '적는 중이에요' : noSpendLabel}</span>
          </button>
          {noSpendError ? <ErrorLine message={noSpendError.message} /> : null}
          <Button
            className="home-today__record"
            variant="outline"
            fullWidth
            onClick={() => onRecord(day)}
          >
            {label} 기록하기
          </Button>
          <MoreLink />
        </Card>
      )}
    </section>
  );
}

/** 안 쓴 날 표시가 저장·취소되지 않았을 때 그 자리에 남기는 한 줄. */
function ErrorLine({ message }: { message: string }) {
  return (
    <p className="home-today__notice" role="alert">
      {message}
    </p>
  );
}
