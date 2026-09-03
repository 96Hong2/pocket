import { parseDecimalOr, type CategoryOut, type TransactionOut } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { Card, Chip, EmptyState, ErrorState, toIconName, TransactionRow } from '../../shared/ui';

interface TodayListProps {
  transactions: TransactionOut[];
  categories: CategoryOut[];
  /** 조회가 실패했나. 실패를 "비어 있어요" 로 덮지 않으려고 받는다. */
  loadFailed?: boolean;
  onRetry?: () => void;
}

const KIND_LABEL: Record<string, string> = {
  income: '수입',
  transfer: '이체',
  refund: '환불',
};

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

export function TodayList({
  transactions,
  categories,
  loadFailed = false,
  onRetry,
}: TodayListProps) {
  const today = toLedgerDate(new Date());
  const rows = transactions.filter((tx) => isToday(tx.occurred_at, today));

  return (
    <section className="home-today" aria-label="오늘">
      <h2 className="home-today__title">오늘</h2>
      {rows.length > 0 ? (
        <Card padding="list">
          {rows.map((tx, index) => {
            const category = tx.category_id
              ? categories.find((item) => item.id === tx.category_id)
              : undefined;
            const kind = KIND_LABEL[tx.type];

            return (
              <TransactionRow
                key={tx.id}
                icon={toIconName(category?.icon_key)}
                title={tx.merchant ?? category?.name ?? '기록'}
                subtitle={tx.merchant ? category?.name : undefined}
                amount={parseDecimalOr(tx.amount, 0)}
                tone={tx.type}
                excluded={tx.excluded_from_budget}
                avatarSize={54}
                density="compact"
                hideDivider={index === rows.length - 1}
                chips={
                  tx.excluded_from_budget || kind ? (
                    <>
                      {tx.excluded_from_budget ? <Chip variant="excluded">예산 제외</Chip> : null}
                      {kind ? <Chip variant="kind">{kind}</Chip> : null}
                    </>
                  ) : undefined
                }
              />
            );
          })}
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
          <EmptyState
            size="inline"
            icon="27_clock"
            title="오늘은 아직 비어 있어요"
            description="지금 생각나는 것 하나만 적어도 충분해요."
          />
        </Card>
      )}
    </section>
  );
}
