import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { parseDecimalOr, type GoalOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { Gauge } from '../../shared/ui';

interface GoalStatusCardProps {
  /** 진행 중인 목표. 없으면 이 카드를 아예 그리지 않는다. */
  goal: GoalOut;
}

/**
 * 홈에 놓는 목표 한 줄.
 *
 * 목표가 있을 때만 그린다. 없는 사람 홈에 "목표를 정해 보세요" 를 두지 않는다.
 * 홈은 기록하러 오는 자리라, 아직 안 정한 것을 여기서 권하면 할 일이 하나 늘어난다.
 *
 * 숫자는 서버가 준 값을 그대로 그린다. 자세한 것은 눌러서 목표 화면에서 본다.
 */
export function GoalStatusCard({ goal }: GoalStatusCardProps) {
  const remaining = parseDecimalOr(goal.remaining, 0);

  return (
    <Link className="home-goal" to={ROUTES.goal}>
      <span className="home-goal__label">목표</span>
      <span className="home-goal__title">{goal.title}</span>
      {/* 예산 게이지와 크기가 다르다. 홈의 주인공은 예산이고 이건 곁들여 보는 값이다. */}
      <Gauge
        className="home-goal__gauge"
        ratio={parseDecimalOr(goal.progress, 0)}
        size={6}
        label="목표 진행률"
      />
      <span className="home-goal__foot" data-numeric="">
        {goal.is_achieved ? '다 모았어요' : `남은 ${formatCurrency(remaining)}`}
      </span>
      {/* 링크 이름은 안쪽 글자가 만든다. 갈 곳은 이름 끝에 덧붙여 읽어 준다. */}
      <span className="home-goal__sr">, 목표 자세히 보기</span>
    </Link>
  );
}
