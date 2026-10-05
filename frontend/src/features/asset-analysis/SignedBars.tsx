import { TEST_IDS } from '../../shared/testIds';

import { toneOf } from './analysisFormat';

export interface SignedBarRow {
  key: string;
  name: string;
  value: number;
  /** 줄 오른쪽에 적을 글자. 숫자를 어떻게 적을지는 부르는 쪽이 정한다. */
  text: string;
}

/**
 * 가운데 선에서 늘면 오른쪽, 줄면 왼쪽으로 뻗는 막대. 가장 크게 움직인 줄이 반 칸을 채운다.
 */
export function SignedBars({ rows, testId }: { rows: SignedBarRow[]; testId?: string }) {
  const peak = Math.max(...rows.map((row) => Math.abs(row.value)), 0);
  return (
    <ul className="analysis-signed" data-testid={testId}>
      {rows.map((row) => {
        const sign = row.value > 0 ? 'up' : row.value < 0 ? 'down' : 'flat';
        // 아주 작게 움직인 줄도 보이게 조금은 그린다.
        const width =
          peak > 0 && row.value !== 0 ? Math.max((Math.abs(row.value) / peak) * 50, 2) : 0;
        return (
          <li
            key={row.key}
            className="analysis-signed__row"
            data-sign={sign}
            data-testid={TEST_IDS.analysisSignedRow}
          >
            <span className="analysis-signed__name">{row.name}</span>
            <b className={`analysis-signed__value ${toneOf(row.value)}`}>{row.text}</b>
            <span className="analysis-signed__track" aria-hidden="true">
              <span className="analysis-signed__fill" style={{ width: `${width}%` }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
