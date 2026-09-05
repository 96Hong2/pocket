import { parseDecimalOr, type TrendPointOut } from '../../shared/api';
import { formatCurrency, formatMonthLabel } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';

/**
 * 6개월 추이 막대.
 *
 * 기록이 없는 달도 0 짜리 막대로 남는다. 빼면 막대가 밀려 다른 달로 읽힌다.
 * 그래서 서버가 늘 여섯 개를 보낸다.
 */
/**
 * 막대 높이(%).
 *
 * 음수를 그대로 넣으면 `height: -12%` 가 되어 브라우저가 통째로 무시한다. 그러면 그 달이
 * 기록 없는 달과 똑같이 보인다. 0 으로 눕히되 음수라는 사실은 표시로 남긴다.
 */
function barPercent(value: number, peak: number): number {
  if (peak <= 0 || value <= 0) return 0;
  return Math.round((value / peak) * 100);
}

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
  const values = points.map((point) =>
    parseDecimalOr(mode === 'income' ? point.income : point.expense, 0),
  );
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
            {/* 막대가 자기 몫의 칸 안에서만 큰다. 라벨과 같은 상자에 두면 100% 를 요구한
                막대가 라벨을 밀지 못해 스스로 깎이고, 높은 달들이 전부 같은 높이가 된다. */}
            <div className="report__trend-track">
              <div
                className="report__trend-bar"
                data-testid={TEST_IDS.reportTrendBar}
                data-month={month}
                data-current={month === currentMonth ? '' : undefined}
                // 가장 큰 달을 100% 로 둔다. 전부 0 이면 전부 바닥에 붙는다.
                style={{ height: `${barPercent(value, peak)}%` }}
                // 환불이 지출보다 커서 음수인 달. 바닥에 붙지만 기록이 없는 달과는 다르다.
                data-negative={value < 0 ? '' : undefined}
                aria-hidden
              />
            </div>
            <span className="report__trend-label">{shortLabel(month)}</span>
          </li>
        );
      })}
    </ul>
  );
}
