import { useIdentity } from '../../app/providers';
import { parseDecimal, parseDecimalOr, useBook, useBookReport } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, ErrorState, LoadingState, MonthStepper } from '../../shared/ui';

import { BookInsightCard } from './BookInsightCard';
import { CategoryDonut } from './CategoryDonut';
import { donutColors } from './donutColors';
import { donutCenter, type ReportCategory } from './reportLabels';
import { BreakdownItem, BudgetLine, EmptyIcon } from './reportParts';

export interface BookReportProps {
  bookId: string;
  month: string;
  onMonthChange: (next: string) => void;
}

/**
 * 공유 가계부 한 달 리포트.
 *
 * 쓴 돈, 예산, 분류 비중은 광고 없이 바로 보인다. 그 아래 「자세히 보기」 카드 하나만
 * 광고 한 편 뒤에 열린다. 달을 옮기거나 가계부를 바꾸는 것만으로는 광고가 뜨지 않는다.
 *
 * 개인 리포트에 있는 결산, 6개월 흐름, 태그, 결제 수단, 큰 지출은 없다. 모두 개인 기록만
 * 세는 자리다.
 */
export function BookReport({ bookId, month, onMonthChange }: BookReportProps) {
  const thisMonth = toLedgerDate(new Date()).slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const { state: identity } = useIdentity();
  const book = useBook(bookId);
  const report = useBookReport(bookId, { year, month: monthNumber });

  // 월 선택기는 어떤 상태에서도 남긴다. 개인 리포트와 같은 규칙이다.
  const stepper = (
    <MonthStepper value={month} onChange={onMonthChange} maxMonth={thisMonth} jumpTo={thisMonth} />
  );

  if (identity.status !== 'ready' || report.isPending) {
    return (
      <div className="report">
        {stepper}
        <div className="report__slot">
          {identity.status === 'ready' || identity.status === 'loading' ? (
            <LoadingState label="리포트를 불러오는 중이에요" />
          ) : null}
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
  const rows = data.breakdown;
  const byId = new Map<string, ReportCategory>(
    (book.data?.categories ?? []).map((category) => [category.id, category]),
  );
  const namesUnknown = book.data == null;
  const colors = donutColors(rows);
  // 두 달 중 한쪽이라도 쓴 돈이 있어야 견줄 것이 있다. 빈 카드를 광고로 열게 하지 않는다.
  const hasInsight = data.insight.category_changes.length > 0;

  return (
    <div className="report">
      {stepper}

      <Card className="report__headline">
        <p className="report__headline-label" data-testid={TEST_IDS.reportHeadlineLabel}>
          {monthNumber}월에 같이 쓴 돈
        </p>
        <Amount
          className="report__headline-value"
          value={parseDecimalOr(data.spent, 0)}
          size={34}
          data-testid={TEST_IDS.reportTotal}
        />
        <BudgetLine budget={{ amount: data.budget, spend_progress: data.spend_progress }} />
      </Card>

      {rows.length === 0 ? (
        <Card className="report__empty">
          <EmptyIcon />
          <p className="report__empty-title">이 달엔 같이 쓴 돈이 없어요</p>
          <p className="report__empty-hint">같이 쓴 돈을 적으면 여기에 모여요</p>
        </Card>
      ) : (
        <Card className="report__breakdown">
          <CategoryDonut rows={rows} center={donutCenter(rows, byId, namesUnknown, false)} />
          <ul className="report__list">
            {rows.map((row) => (
              <BreakdownItem
                key={row.key}
                row={row}
                category={byId.get(row.category_id ?? '')}
                namesUnknown={namesUnknown}
                income={false}
                color={colors.get(row.key)}
                topShare={parseDecimal(rows[0]?.share ?? null) ?? 0}
              />
            ))}
          </ul>
        </Card>
      )}

      {hasInsight ? (
        <BookInsightCard
          bookName={book.data?.name ?? '가계부'}
          insight={data.insight}
          byId={byId}
          namesUnknown={namesUnknown}
        />
      ) : null}
    </div>
  );
}
