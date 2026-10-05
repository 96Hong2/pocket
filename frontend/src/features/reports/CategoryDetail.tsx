import {
  parseDecimalOr,
  useCategories,
  useCategoryReport,
  useTags,
  type TransactionOut,
} from '../../shared/api';
import { LedgerRow } from '../../shared/ledger';
import { formatDayLabel, formatWeekday, toLedgerDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, CategoryAvatar, ErrorState, LoadingState, iconOf } from '../../shared/ui';

import { labelOf } from './reportLabels';

export interface CategoryDetailProps {
  /** `2026-09` */
  month: string;
  tab: 'expense' | 'income';
  /** 리포트 줄의 키 그대로. 카테고리 uuid, `uncategorized`, `rolled_up`. */
  rowKey: string;
  onPick: (transaction: TransactionOut) => void;
}

interface DayGroup {
  day: string;
  items: TransactionOut[];
}

/** 최근 날부터 날짜별로 묶는다. 서버가 최근 것부터 주므로 이어지는 같은 날을 모은다. */
function byDay(items: TransactionOut[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const day = toLedgerDate(new Date(item.occurred_at));
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

/**
 * 리포트 분류 줄 하나를 펼친 화면.
 *
 * 합계는 서버가 리포트 그 줄과 같은 셈으로 준다(소비는 환불을 뺀 값). 여기서 줄을 다시 더하지 않는다.
 */
export function CategoryDetail({ month, tab, rowKey, onPick }: CategoryDetailProps) {
  const [year, monthNumber] = month.split('-').map(Number);
  const report = useCategoryReport({ year, month: monthNumber, tab, key: rowKey });
  const categories = useCategories();
  const tags = useTags();
  const categoryItems = categories.data?.items ?? [];

  if (report.isPending) {
    return <LoadingState label="기록을 불러오는 중이에요" />;
  }
  if (report.isError || report.data == null) {
    return <ErrorState title="기록을 불러오지 못했어요" onRetry={() => void report.refetch()} />;
  }

  const data = report.data;
  const income = tab === 'income';
  const category = categoryItems.find((item) => item.id === data.category_id);
  const namesUnknown = categories.isError || categories.isPending;
  // 접은 줄은 몇 개를 대신하는지 응답에 없다. 목록에 나온 분류 수가 곧 그 수다.
  const rolledCount = new Set(data.transactions.map((item) => item.category_id)).size;
  const name = labelOf(
    {
      key: data.key,
      category_id: data.category_id,
      amount: data.total,
      share: null,
      rolled_count: rolledCount,
    },
    category,
    namesUnknown,
  );
  const groups = byDay(data.transactions);

  return (
    <div className="report-cat">
      <Card className="report-cat__head">
        <div className="report-cat__title">
          {category != null ? <CategoryAvatar {...iconOf(category)} size={52} /> : null}
          <div className="report-cat__title-text">
            <h2 className="report-cat__name" data-testid={TEST_IDS.reportCategoryName}>
              {name}
            </h2>
            <p className="report-cat__period" data-testid={TEST_IDS.reportCategoryPeriod}>
              {formatDayLabel(data.period_start)}~{formatDayLabel(data.period_end)}
            </p>
          </div>
        </div>
        <div className="report-cat__sum">
          <Amount
            value={parseDecimalOr(data.total, 0)}
            tone={income ? 'income' : 'neutral'}
            size={30}
            data-testid={TEST_IDS.reportCategoryTotal}
          />
          <span className="report-cat__count" data-testid={TEST_IDS.reportCategoryCount}>
            {data.count}건
          </span>
        </div>
      </Card>

      {groups.length === 0 ? (
        <Card padding="list">
          <p className="tx-list__empty" role="status">
            이 분류에 남은 기록이 없어요
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.day} className="tx-list" aria-label={formatDayLabel(group.day)}>
            <p className="tx-list__head">
              {formatDayLabel(group.day)} {formatWeekday(group.day)}요일
            </p>
            <Card padding="list">
              {group.items.map((tx, index) => (
                <LedgerRow
                  key={tx.id}
                  transaction={tx}
                  categories={categoryItems}
                  tags={tags.data?.items ?? []}
                  density="compact"
                  hideDivider={index === group.items.length - 1}
                  onClick={() => onPick(tx)}
                />
              ))}
            </Card>
          </section>
        ))
      )}
    </div>
  );
}
