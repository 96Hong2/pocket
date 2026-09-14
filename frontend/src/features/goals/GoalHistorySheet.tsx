import { useOverlayBackClose } from '../../app/providers';
import { parseDecimalOr, type GoalContributionOut, type GoalOut } from '../../shared/api';
import { formatCurrency, formatMonthLabel } from '../../shared/lib/format';
import { BottomSheet, iconUrl } from '../../shared/ui';

export interface GoalHistorySheetProps {
  /** 보고 있는 지난 목표. 없으면 시트가 닫혀 있다. */
  goal: GoalOut | null;
  onClose: () => void;
}

/** `2026-09-03` → `2026.9.3`. 시작과 끝을 한 줄에 나란히 적는 자리라 짧게 쓴다. */
function dot(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}.${month}.${day}`;
}

/** 두 날짜 사이의 달 수. 양쪽 끝 달을 포함해 최소 1이다. 「3개월 동안」 의 그 3이다. */
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  return Math.max(1, (ey - sy) * 12 + (em - sm) + 1);
}

/** 달별로 모은 돈. 최근 달이 앞이다. 한 달에 여러 번 넣었어도 한 줄로 합친다. */
function byMonth(rows: GoalContributionOut[]): { month: string; amount: number; count: number }[] {
  const map = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const key = row.occurred_on.slice(0, 7);
    const item = map.get(key) ?? { amount: 0, count: 0 };
    item.amount += parseDecimalOr(row.amount, 0);
    item.count += 1;
    map.set(key, item);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, item]) => ({ month, ...item }));
}

/**
 * 지난 목표 하나를 펼쳐 보는 시트.
 *
 * 고칠 것도 이어서 할 것도 없는 목표라 버튼이 없다. **얼마를, 언제부터 언제까지, 어떻게
 * 모았나**만 적는다. 달별 한 줄이면 「어떻게」 가 읽힌다. 기여 한 건씩 늘어놓으면
 * 여섯 달 목표는 스무 줄이 넘어 요약이 아니게 된다.
 */
export function GoalHistorySheet({ goal, onClose }: GoalHistorySheetProps) {
  const open = goal != null;
  useOverlayBackClose(open, onClose);

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="지난 목표 자세히" className="goal-sheet">
      {goal ? <HistoryBody goal={goal} /> : null}
    </BottomSheet>
  );
}

function HistoryBody({ goal }: { goal: GoalOut }) {
  const saved = parseDecimalOr(goal.current_amount, 0);
  const initial = parseDecimalOr(goal.initial_amount, 0);
  const target = parseDecimalOr(goal.target_amount, 0);
  const finished = goal.finished_on ?? goal.started_on;
  const months = byMonth(goal.contributions);

  return (
    <div className="goal-history">
      <div className="goal-history__head">
        <img
          className="goal-history__icon"
          src={iconUrl('26_sparkles')}
          alt=""
          aria-hidden="true"
        />
        <h3 className="goal-history__title">{goal.title}</h3>
        <p className="goal-history__sum" data-numeric="">
          {formatCurrency(saved)}
        </p>
        <p className="goal-history__period">
          {dot(goal.started_on)} → {dot(finished)} · {monthsBetween(goal.started_on, finished)}개월
          동안
        </p>
      </div>

      <dl className="goal-history__facts">
        <div className="goal-history__fact">
          <dt>목표 금액</dt>
          <dd data-numeric="">{formatCurrency(target)}</dd>
        </div>
        {initial > 0 ? (
          <div className="goal-history__fact">
            <dt>처음에 있던 돈</dt>
            <dd data-numeric="">{formatCurrency(initial)}</dd>
          </div>
        ) : null}
        <div className="goal-history__fact">
          <dt>넣은 횟수</dt>
          <dd>{goal.contributions.length}번</dd>
        </div>
      </dl>

      {months.length > 0 ? (
        <section className="goal-history__months" aria-label="달별로 모은 돈">
          <h4 className="goal-history__months-title">달별로 모은 돈</h4>
          <ul className="goal-history__list">
            {months.map((row) => (
              <li key={row.month} className="goal-history__row">
                <span className="goal-history__month">{formatMonthLabel(row.month)}</span>
                <span className="goal-history__count">{row.count}번</span>
                <span className="goal-history__amount" data-numeric="">
                  {formatCurrency(row.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
