import type { TrendPointOut } from '../../shared/api';
import { formatCurrency, formatMonthLabel } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';

/**
 * 6개월 추이 막대.
 *
 * 기록이 없는 달도 0 짜리 막대로 남는다. 빼면 막대가 밀려 다른 달로 읽힌다.
 * 그래서 서버가 늘 여섯 개를 보낸다.
 */
/** `2026-09` → `9월`. 여섯 칸에 들어가야 해서 연도를 뺀다. */
function shortLabel(month: string): string {
  return `${Number(month.slice(5, 7))}월`;
}

export function TrendBars({
  points,
  mode,
  currentMonth,
}: {
  points: TrendPointOut[];
  mode: 'expense' | 'income';
  currentMonth: string;
}) {
  const values = points.map((point) => Number(mode === 'income' ? point.income : point.expense));
  const peak = Math.max(...values, 0);

  return (
    <ul className="report__trend">
      {points.map((point, index) => {
        const value = values[index];
        const month = point.period_start.slice(0, 7);
        const label = formatMonthLabel(month);
        return (
          <li
            key={point.period_start}
            className="report__trend-item"
            // 금액은 라벨에 안 적는다. 여섯 칸에 다 적으면 가로로 넘쳐 화면이 통째로 축소된다.
            aria-label={`${label} ${formatCurrency(value)}`}
          >
            <div
              className="report__trend-bar"
              data-testid={TEST_IDS.reportTrendBar}
              data-month={month}
              data-current={month === currentMonth ? '' : undefined}
              // 가장 큰 달을 100% 로 둔다. 전부 0 이면 전부 바닥에 붙는다.
              style={{ height: peak > 0 ? `${Math.round((value / peak) * 100)}%` : '0%' }}
              aria-hidden
            />
            <span className="report__trend-label">{shortLabel(month)}</span>
          </li>
        );
      })}
    </ul>
  );
}
