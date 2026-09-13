import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { parseDecimalOr, type GoalOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';

/**
 * 목표를 다 모았을 때 홈에 뜨는 축하.
 *
 * 결산 진입 카드와 같은 모양이다. 홈에서 스스로 나타나 한 번 누르면 그 화면으로 가는
 * 자리라, 둘이 다른 모양이면 같은 뜻의 카드를 두 번 배워야 한다.
 *
 * **닫기가 없다.** 이 카드는 할 일이 남았다는 뜻이고(마치거나 새로 정하거나), 목표를
 * 마치면 스스로 사라진다. 목표 화면 한 번이면 끝나는 일에 닫기까지 두면 자리만 는다.
 */
export function GoalDoneCard({ goal }: { goal: GoalOut }) {
  const saved = parseDecimalOr(goal.current_amount, 0);

  return (
    <Link className="home-goal-done" to={ROUTES.goal}>
      <span className="home-goal-done__title">{goal.title}, 다 모았어요</span>
      <span className="home-goal-done__hint">{formatCurrency(saved)} · 눌러서 마무리해요</span>
    </Link>
  );
}
