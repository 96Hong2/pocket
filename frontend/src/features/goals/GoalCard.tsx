import { parseDecimal, parseDecimalOr, type GoalOut } from '../../shared/api';
import { formatCurrency, formatDayLabel, parseIsoDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Button, Chip, Gauge } from '../../shared/ui';

export interface GoalCardProps {
  goal: GoalOut;
  onEdit: () => void;
  onContribute: () => void;
}

/**
 * 목표 하나를 그리는 카드.
 *
 * 남은 금액·진행률·매달 모을 돈·도달 예상은 전부 서버가 센 값이다. `목표 - 모은 돈` 을
 * 여기서 다시 계산하지 않는다. 기여를 하나 지운 직후 게이지와 남은 금액이 서로 다른
 * 목록을 말하게 된다.
 *
 * **없는 값은 문장에서 통째로 뺀다.** 기한이 없으면 매달 모을 돈 줄이 아예 없고,
 * 기여가 없으면 도달 예상 자리에 숫자를 지어내지 않는다.
 */
export function GoalCard({ goal, onEdit, onContribute }: GoalCardProps) {
  const target = parseDecimalOr(goal.target_amount, 0);
  const current = parseDecimalOr(goal.current_amount, 0);
  const remaining = parseDecimalOr(goal.remaining, 0);
  const required = parseDecimal(goal.required_monthly_saving);

  return (
    <section className="goal-card" aria-label="목표 진행">
      <div className="goal-card__head">
        <h2 className="goal-card__title">{goal.title}</h2>
        {/* 달성은 계산으로 판정한다. 상태를 굳히지 않으니 기여를 지우면 이 배지도 사라진다. */}
        {goal.is_achieved ? <Chip variant="sage">달성했어요</Chip> : null}
      </div>

      <p className="goal-card__sum" data-numeric="">
        지금까지{' '}
        <Amount data-testid={TEST_IDS.goalCurrent} value={current} size={16} weight={800} /> / 목표{' '}
        {formatCurrency(target)}
      </p>

      {/* over 색을 쓰지 않는다. 목표를 넘겨 모은 것은 경고할 일이 아니다. */}
      <Gauge
        className="goal-card__gauge"
        data-testid={TEST_IDS.goalGauge}
        ratio={parseDecimalOr(goal.progress, 0)}
        size={6}
        label="목표 진행률"
      />

      <dl className="goal-facts">
        <div className="goal-facts__row">
          <dt className="goal-facts__label">남은 금액</dt>
          <dd className="goal-facts__value">
            <Amount data-testid={TEST_IDS.goalRemaining} value={remaining} size={15} weight={700} />
          </dd>
        </div>

        {/* 기한이 있고 아직 남았을 때만. 기한이 없으면 나눌 달 수가 없어 만들 수 없는 값이다. */}
        {required != null && goal.target_date != null ? (
          <div className="goal-facts__row">
            <dt className="goal-facts__label">{deadlineLabel(goal.target_date)}까지 매달</dt>
            <dd className="goal-facts__value">
              <Amount
                data-testid={TEST_IDS.goalRequiredMonthly}
                value={required}
                size={15}
                weight={700}
              />
            </dd>
          </div>
        ) : null}
      </dl>

      {goal.is_achieved ? null : (
        <p className="goal-card__eta" data-testid={TEST_IDS.goalEta}>
          {goal.eta_months != null ? `이 속도면 ${goal.eta_months}달 뒤` : '아직 예상하기 어려워요'}
        </p>
      )}

      {/* 기한이 지난 것을 탓하지 않는다. 바꿀 수 있다는 것만 담담하게 알린다. */}
      {goal.is_overdue && goal.target_date != null ? (
        <p className="goal-card__note">
          {deadlineLabel(goal.target_date)}이 지났어요. 기한은 언제든 바꿀 수 있어요
        </p>
      ) : null}

      <div className="goal-card__actions">
        <Button variant="outline" onClick={onEdit}>
          목표 고치기
        </Button>
        <Button className="goal-card__add" onClick={onContribute}>
          모은 돈 더하기
        </Button>
      </div>
    </section>
  );
}

/**
 * 기한 표기. 올해가 아니면 연도까지 적는다.
 *
 * `3월 1일` 만 적으면 내년 3월인 목표가 이미 지난 날처럼 읽힌다.
 */
function deadlineLabel(iso: string): string {
  const day = parseIsoDate(iso);
  const label = formatDayLabel(day);
  return day.getFullYear() === new Date().getFullYear() ? label : `${day.getFullYear()}년 ${label}`;
}
