import type { ReactNode } from 'react';

import { cx } from '../../shared/lib/cx';
import { Amount } from '../../shared/ui';

export interface ShareBarRow {
  key: string;
  name: ReactNode;
  amount: number;
  /** 합에서 차지하는 몫, 0~1. */
  share: number;
}

/**
 * 이름, 막대, 금액, 비중 네 칸 한 줄짜리 가로 막대 목록. 큰 것부터 받은 순서 그대로다.
 *
 * 막대는 첫 줄을 꽉 차게 그린다. 비중 그대로 그리면 몇 %짜리 줄이 안 보인다.
 */
export function ShareBars({
  rows,
  testId,
  className,
}: {
  rows: ShareBarRow[];
  testId?: string;
  className?: string;
}) {
  const top = rows[0]?.share ?? 0;
  return (
    <ul className={cx('report__methods', className)} data-testid={testId}>
      {rows.map((row) => (
        <li key={row.key} className="report__method">
          <span className="report__method-name">{row.name}</span>
          <span className="report__method-bar" aria-hidden="true">
            <span
              className="report__method-fill"
              style={{ width: `${top > 0 ? Math.max((row.share / top) * 100, 3) : 0}%` }}
            />
          </span>
          <Amount className="report__method-amount" value={row.amount} />
          <span className="report__method-share">{formatShare(row.share)}</span>
        </li>
      ))}
    </ul>
  );
}

/** 비중 한 자리. 0.5% 를 0% 로 적으면 있는 줄이 없는 것처럼 보인다. */
function formatShare(share: number): string {
  if (share <= 0) return '0%';
  const percent = share * 100;
  return percent < 1 ? '1% 미만' : `${Math.round(percent)}%`;
}
