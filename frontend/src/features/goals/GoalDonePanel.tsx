import { ApiError, parseDecimalOr, useFinishGoal, type GoalOut } from '../../shared/api';
import { EVENTS, useAnalytics } from '../../shared/analytics';
import { formatCurrency } from '../../shared/lib/format';
import { Button, iconUrl } from '../../shared/ui';
import { goalDoneLine, ShareButton } from '../share';

export interface GoalDonePanelProps {
  goal: GoalOut;
  /** 마치고 나서. 새 목표를 정하는 자리를 여는 데 쓴다. */
  onFinished: () => void;
}

/**
 * 다 모았을 때 목표 화면 맨 위에 서는 축하.
 *
 * 게이지가 꽉 찬 것만으로는 「끝났다」가 안 읽힌다. 다 모은 그 순간이 이 기능에서 유일하게
 * 기쁜 자리라, 결산처럼 한 화면을 통째로 내준다.
 *
 * **여기서 끝낼 수 있다.** 마치면 지난 목표로 옮겨 가고 새 목표를 정할 수 있다.
 * 지우기와 다르다. 지운 것은 어디에도 안 남지만 마친 것은 남는다.
 */
export function GoalDonePanel({ goal, onFinished }: GoalDonePanelProps) {
  const analytics = useAnalytics();
  const finish = useFinishGoal();
  const saved = parseDecimalOr(goal.current_amount, 0);
  const message = finish.error instanceof ApiError ? finish.error.message : null;

  return (
    <section className="goal-done" aria-label="목표 달성">
      <img className="goal-done__icon" src={iconUrl('26_sparkles')} alt="" aria-hidden="true" />
      <p className="goal-done__title">{goal.title}, 다 모았어요</p>
      <p className="goal-done__sum" data-numeric="">
        {formatCurrency(saved)}
      </p>

      {message ? (
        <p className="goal-done__notice" role="alert">
          {message}
        </p>
      ) : null}

      <Button
        className="goal-done__finish"
        fullWidth
        disabled={finish.isPending}
        onClick={() => {
          analytics.log(EVENTS.goalFinished, { where: 'goal' }, { kind: 'click' });
          finish.mutate(goal.id, { onSuccess: onFinished });
        }}
      >
        {finish.isPending ? '마치는 중이에요' : '이 목표 마치기'}
      </Button>
      {/*
        다 모은 그 순간이 이 앱에서 가장 자랑할 만한 자리다. 여기서만 세게 그린다.
        「마치기」 위가 아니라 아래에 둔다. 공유가 이 화면의 할 일을 가리면 안 된다.
      */}
      <ShareButton
        className="goal-done__share"
        kind="goal_done"
        where="goal_done"
        tone="strong"
        label="이 목표 친구에게 공유하기"
        message={goalDoneLine(goal.title)}
      />

      {/* 마치기가 무엇을 하는지 한 줄. 지우기와 헷갈리면 다 모은 기록이 사라진다. */}
      <p className="goal-done__aside">마친 목표는 아래 「지난 목표」에 남아요</p>
    </section>
  );
}
