import { parseDecimalOr, type CategoryOut, type TransactionOut } from '../../shared/api';
import { toIsoDate } from '../../shared/lib/format';
import { Card, Chip, EmptyState, toIconName, TransactionRow } from '../../shared/ui';

interface TodayListProps {
  transactions: TransactionOut[];
  categories: CategoryOut[];
}

const KIND_LABEL: Record<string, string> = {
  income: '수입',
  transfer: '이체',
  refund: '환불',
};

/**
 * 오늘 것만 고른다.
 *
 * 서버가 준 시각에는 UTC 오프셋이 붙어 있고 여기서는 기기 시간대로 읽는다.
 * 월 경계는 서버가 사용자 시간대로 정하지만 '오늘' 한 줄까지 내려주는 조회는 없다.
 */
function isToday(occurredAt: string, today: string): boolean {
  const at = new Date(occurredAt);
  return !Number.isNaN(at.getTime()) && toIsoDate(at) === today;
}

export function TodayList({ transactions, categories }: TodayListProps) {
  const today = toIsoDate(new Date());
  const rows = transactions.filter((tx) => isToday(tx.occurred_at, today));

  return (
    <section className="home-today" aria-label="오늘">
      <h2 className="home-today__title">오늘</h2>
      {rows.length === 0 ? (
        <Card padding="md">
          <EmptyState
            size="inline"
            icon="27_clock"
            title="오늘은 아직 비어 있어요"
            description="지금 생각나는 것 하나만 적어도 충분해요."
          />
        </Card>
      ) : (
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
      )}
    </section>
  );
}
