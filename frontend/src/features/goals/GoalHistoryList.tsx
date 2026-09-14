import { useState } from 'react';

import { parseDecimalOr, useGoalHistory, type GoalOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { iconUrl } from '../../shared/ui';

import { GoalHistorySheet } from './GoalHistorySheet';

/**
 * 다 모으고 마친 목표들.
 *
 * **하나도 없으면 이 자리를 아예 그리지 않는다.** 대부분은 아직 하나도 안 마쳤고,
 * 그 사람에게 「지난 목표 없음」을 보여 주면 못 한 일이 하나 더 있는 것처럼 읽힌다.
 *
 * 줄을 누르면 언제부터 언제까지 어떻게 모았는지를 시트로 펼친다. 고칠 것은 없다.
 */
export function GoalHistoryList() {
  const history = useGoalHistory();
  const items = history.data?.items ?? [];
  const [picked, setPicked] = useState<GoalOut | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="goal-past" aria-label="지난 목표">
      <h2 className="goal-past__title">지난 목표</h2>
      <ul className="goal-past__list">
        {items.map((goal) => (
          <PastRow key={goal.id} goal={goal} onPick={() => setPicked(goal)} />
        ))}
      </ul>
      <GoalHistorySheet goal={picked} onClose={() => setPicked(null)} />
    </section>
  );
}

function PastRow({ goal, onPick }: { goal: GoalOut; onPick: () => void }) {
  return (
    <li>
      <button type="button" className="goal-past__row" onClick={onPick}>
        <img className="goal-past__icon" src={iconUrl('02_gold_bars')} alt="" aria-hidden="true" />
        <span className="goal-past__name">{goal.title}</span>
        <span className="goal-past__amount" data-numeric="">
          {formatCurrency(parseDecimalOr(goal.current_amount, 0))}
        </span>
      </button>
    </li>
  );
}
