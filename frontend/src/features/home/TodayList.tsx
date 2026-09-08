import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import {
  ApiError,
  parseDecimalOr,
  useCreateTransaction,
  useDeleteTransaction,
  type CategoryOut,
  type TransactionOut,
} from '../../shared/api';
import { LedgerRow, NoSpendRow, splitNoSpend } from '../../shared/ledger';
import { formatCurrency, toLedgerDate, toLedgerNoonIso } from '../../shared/lib/format';
import { Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui';

interface TodayListProps {
  transactions: TransactionOut[];
  categories: CategoryOut[];
  /** 아직 오는 중인가. 오는 중을 "비어 있어요" 로 덮지 않으려고 받는다. */
  loading?: boolean;
  /** 조회가 실패했나. 실패를 "비어 있어요" 로 덮지 않으려고 받는다. */
  loadFailed?: boolean;
  onRetry?: () => void;
  /** 한 줄을 누르면 고치기로 간다. 안 넘기면 줄이 눌리지 않는다. */
  onPick?: (transaction: TransactionOut) => void;
}

/**
 * 오늘 것만 고른다.
 *
 * 서버가 준 시각에는 UTC 오프셋이 붙어 있고, 서버는 '오늘'과 월 경계를 사용자 시간대로 정한다.
 * 기기 시간대로 날짜를 뽑으면 해외에서 앱을 열었을 때 히어로 숫자와 이 목록이 서로 다른 날을 본다.
 */
function isToday(occurredAt: string, today: string): boolean {
  const at = new Date(occurredAt);
  return !Number.isNaN(at.getTime()) && toLedgerDate(at) === today;
}

/**
 * 오늘 쓴 돈 합계.
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

export function TodayList({
  transactions,
  categories,
  loading = false,
  loadFailed = false,
  onRetry,
  onPick,
}: TodayListProps) {
  const today = toLedgerDate(new Date());
  const rows = transactions.filter((tx) => isToday(tx.occurred_at, today));
  // 안 쓴 날 표시는 금액이 0 이라 다른 줄과 같은 모양으로 그릴 수 없다. 달력과 같은 규칙으로 가른다.
  const { noSpend: noSpendRows, spent } = splitNoSpend(rows);
  const noSpend = noSpendRows[0] ?? null;
  const spentTotal = sumSpent(spent);

  const markNoSpend = useCreateTransaction();
  const cancelNoSpend = useDeleteTransaction();
  const noSpendError =
    markNoSpend.error instanceof ApiError
      ? markNoSpend.error
      : cancelNoSpend.error instanceof ApiError
        ? cancelNoSpend.error
        : null;

  return (
    <section className="home-today" aria-label="오늘">
      <div className="home-today__head">
        <h2 className="home-today__title">오늘</h2>
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
              title="오늘은 안 썼어요"
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
          <LoadingState variant="rows" rows={2} label="오늘 기록을 불러오는 중이에요" />
        </Card>
      ) : loadFailed ? (
        <Card padding="md">
          <ErrorState
            size="inline"
            title="오늘 기록을 불러오지 못했어요"
            description="적어 둔 것이 사라진 게 아니에요. 다시 시도해 주세요."
            onRetry={onRetry}
          />
        </Card>
      ) : (
        <Card padding="md">
          {/*
            안 쓴 날에도 남길 것이 있어야 한다. 적을 게 없다고 그냥 닫으면 그 날은 '안 적은 날'
            로만 남아, 안 썼는데도 기록이 빈 날이 된다.
          */}
          <EmptyState
            size="inline"
            icon="27_clock"
            title="오늘은 아직 비어 있어요"
            description="지금 생각나는 것 하나만 적어도 충분해요."
            actionLabel={markNoSpend.isPending ? '적는 중이에요' : '오늘은 안 썼어요'}
            onAction={() => {
              if (markNoSpend.isPending) return;
              markNoSpend.mutate({
                occurred_at: toLedgerNoonIso(today),
                amount: '0',
                type: 'expense',
                category_id: null,
                source: 'no_spend',
                confidence: 1,
                excluded_from_budget: false,
              });
            }}
          />
          {noSpendError ? <ErrorLine message={noSpendError.message} /> : null}
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
