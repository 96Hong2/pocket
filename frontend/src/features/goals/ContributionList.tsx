import {
  ApiError,
  parseDecimalOr,
  useDeleteGoalContribution,
  type GoalContributionOut,
} from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import { Amount, Card } from '../../shared/ui';

export interface ContributionListProps {
  goalId: string;
  /** 서버가 준 순서 그대로 그린다. 최근 것이 앞이다. */
  contributions: GoalContributionOut[];
}

/**
 * 모은 돈 목록.
 *
 * 지울 수 없는 기록은 잘못 적었을 때 되돌릴 길이 없다. 줄마다 지우기를 둔다.
 * 지운 결과는 서버가 다시 센 값으로 위 카드에 반영된다.
 */
export function ContributionList({ goalId, contributions }: ContributionListProps) {
  const remove = useDeleteGoalContribution();
  const message = remove.error instanceof ApiError ? remove.error.message : null;

  return (
    <section className="goal-log" aria-label="모은 돈">
      <h2 className="goal-log__title">모은 돈</h2>

      <Card padding="list">
        {contributions.length === 0 ? (
          // 카드 한 장을 따로 띄우지 않는다. 아직 없는 것은 잘못한 일이 아니라 다음 한 걸음이다.
          <p className="goal-log__empty">아직 더한 돈이 없어요</p>
        ) : (
          <ul className="goal-log__list">
            {contributions.map((row) => {
              const amount = parseDecimalOr(row.amount, 0);
              const when = formatDayLabel(row.occurred_on);
              return (
                <li className="goal-log__row" key={row.id}>
                  <span className="goal-log__when">{when}</span>
                  <Amount value={amount} size={14} weight={700} />
                  {/* 줄마다 이름이 달라야 어느 줄을 지우는지 스크린리더로도 갈린다. */}
                  <button
                    type="button"
                    className="goal-log__remove"
                    aria-label={`${when} ${formatCurrency(amount)} 지우기`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ goalId, contributionId: row.id })}
                  >
                    지우기
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 못 지웠으면 목록을 지우지 않고 이 자리에 한 줄로 알린다. */}
      {message ? (
        <p className="goal-log__notice" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
