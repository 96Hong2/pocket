import type { ReactNode } from 'react';

import { Amount } from '../../shared/ui';

export interface RankRow {
  key: string;
  name: string;
  /** 이름 아래 작은 줄. 없으면 이름만. */
  sub?: string | null;
  /** 순위와 이름 사이 그림. */
  icon?: ReactNode;
  amount: number;
  /** 있으면 줄 전체가 버튼이다. */
  onSelect?: () => void;
}

/**
 * 큰 것부터 다섯 줄. 서버가 골라 준 순서 그대로 그린다. 여기서 다시 정렬하거나 자르지 않는다.
 */
export function RankList({
  rows,
  rowTestId,
  amountTestId,
}: {
  rows: RankRow[];
  rowTestId: string;
  amountTestId: string;
}) {
  return (
    <ol className="report__large">
      {rows.map((row, index) => {
        const body = (
          <>
            <span className="report__large-rank" aria-hidden="true">
              {index + 1}
            </span>
            {row.icon}
            <span className="report__large-text">
              <span className="report__large-name">{row.name}</span>
              {row.sub != null ? <span className="report__large-category">{row.sub}</span> : null}
            </span>
            <Amount
              className="report__large-amount"
              data-testid={amountTestId}
              value={row.amount}
              size={14}
            />
          </>
        );
        if (row.onSelect == null) {
          return (
            <li key={row.key} className="report__large-row" data-testid={rowTestId}>
              {body}
            </li>
          );
        }
        return (
          <li key={row.key} className="report__large-item">
            <button
              type="button"
              className="report__large-row report__large-button"
              data-testid={rowTestId}
              onClick={row.onSelect}
            >
              {body}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
