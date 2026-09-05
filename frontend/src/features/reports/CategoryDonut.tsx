import type { BreakdownRowOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';

/**
 * 카테고리 비중 도넛.
 *
 * 색은 무지개가 아니라 세이지에서 앰버로 가는 한 계열이다. 램프가 아홉 색이라
 * 조각도 아홉을 넘지 않는다(서버가 여덟 + 접은 하나로 잘라 준다).
 * 순환시키면 링 안에 같은 색이 두 번 나와 오히려 못 읽는다.
 *
 * 비중은 서버가 준 값을 그대로 쓴다. 여기서 금액을 다시 나누면 두 곳에서 센 것이 된다.
 */

const SIZE = 160;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** 조각이 하나뿐이면 100% 링이라 알려 주는 것이 없다. 차트를 늘리는 곳이 아니다. */
const MIN_SLICES = 2;

export function CategoryDonut({ rows }: { rows: BreakdownRowOut[] }) {
  const slices = rows.filter((row) => row.share != null);
  if (slices.length < MIN_SLICES) return null;

  let offset = 0;
  return (
    <svg
      className="report__donut"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="카테고리 비중"
      data-testid={TEST_IDS.reportDonut}
    >
      {slices.map((row, index) => {
        const share = Number(row.share);
        const length = CIRCUMFERENCE * share;
        const dash = `${length} ${CIRCUMFERENCE - length}`;
        // 앞 조각들이 먹은 만큼 뒤로 민다. 마지막 조각이 남은 각도를 채워 링이 닫힌다.
        const start = -offset;
        offset += length;
        return (
          <circle
            key={row.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={`var(--color-donut-${index + 1})`}
            strokeWidth={STROKE}
            strokeDasharray={dash}
            strokeDashoffset={start}
            // 12시에서 시작해 시계 방향으로 돈다.
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        );
      })}
    </svg>
  );
}
