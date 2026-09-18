import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useDismissRecurring,
  useRecordRecurring,
  useRecurringDue,
  type RecurringDueOut,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { Button, CategoryAvatar, SageCard } from '../../shared/ui';

/**
 * 곧 나갈 돈을 알려 주고, 그 자리에서 기록으로 만든다.
 *
 * **자동으로 적지 않는다.** 구독을 해지했는데 가계부에는 계속 찍히면 그 가계부가 사실이
 * 아니게 된다. 예고를 보여 주고 누르는 것은 사람이 한다.
 *
 * 한 번에 한 장만 그린다. 같은 날 셋이 걸려 있어도 카드 석 장이 서면 홈이 알림판이 된다.
 * 하나를 적으면 다음 것이 그 자리에 올라온다.
 *
 * **「이번 달은 됐어요」 가 있어야 한다.** 해지했거나 이번 달만 안 나가는 경우가 있고,
 * 그때 닫을 길이 없으면 카드가 이틀 내내 앉아 있는다. 다음 달에는 다시 묻는다.
 */
export function RecurringDueCard() {
  const analytics = useAnalytics();
  const due = useRecurringDue();
  const record = useRecordRecurring();
  const dismiss = useDismissRecurring();

  const item = due.data?.[0];
  // 걸어 둔 것이 없거나 아직 그날이 아니면 아무것도 안 그린다. 그것이 정상이다.
  // 조회가 실패해도 이 자리를 비운다. 홈에서 할 일은 기록이고 예고는 곁들이는 것이다.
  if (item == null) return null;

  const busy = record.isPending || dismiss.isPending;
  const failure = record.error instanceof ApiError ? record.error.message : null;

  return (
    <SageCard className="home-card recurring-due" role="group" aria-label="곧 나갈 돈">
      <div className="home-card__head">
        <CategoryAvatar icon="27_clock" size={44} />
        <p className="home-card__text">
          {headline(item)}
          <br />
          <strong>
            {item.name} {formatCurrency(parseDecimalOr(item.amount, 0))}
          </strong>
        </p>
      </div>

      {failure ? (
        <p className="home-card__error" role="alert">
          {failure}
        </p>
      ) : null}

      <Button
        variant="primarySmall"
        fullWidth
        disabled={busy}
        onClick={() => {
          analytics.log(
            EVENTS.recurringResult,
            { result: 'recorded', lead: item.is_today ? 'today' : 'eve' },
            { kind: 'click' },
          );
          record.mutate(item.id);
        }}
      >
        지금 기록하기
      </Button>

      <Button
        className="home-card__calc"
        variant="ghost"
        fullWidth
        disabled={busy}
        onClick={() => {
          analytics.log(EVENTS.recurringResult, { result: 'dismissed' }, { kind: 'click' });
          dismiss.mutate(item.id);
        }}
      >
        이번 달은 됐어요
      </Button>

      <p className="home-card__aside">관리 › 반복 지출에서 바꾸거나 끌 수 있어요</p>
    </SageCard>
  );
}

/**
 * 첫 줄.
 *
 * 전날과 당일의 말이 달라야 한다. 「오늘 나가요」 를 전날에 보여 주면 날짜를 잘못 적은
 * 줄 알고, 「내일」 을 당일에 보여 주면 이미 빠져나간 돈을 안 적는다.
 *
 * 서버가 전날과 당일 이틀만 보내므로(`domain/recurring.DUE_LEAD_DAYS`) 두 갈래면 된다.
 */
function headline(item: RecurringDueOut): string {
  return item.is_today ? '오늘 빠져나가는 돈이에요' : '내일 빠져나가요';
}
