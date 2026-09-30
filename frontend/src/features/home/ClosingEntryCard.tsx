import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { formatMonthLabel } from '../../shared/lib/format';

/**
 * 홈에 놓는 결산 진입 카드. 세울지는 `useClosingEntry` 가 정한다.
 *
 * **저절로 열리지 않는다.** 누르면 그때 리포트로 가서 결산이 열린다.
 */
export function ClosingEntryCard({ month }: { month: string }) {
  return (
    <Link className="home-closing" to={`${ROUTES.report}?month=${month}&closing=1`}>
      <span className="home-closing__title">{formatMonthLabel(month)} 결산이 도착했어요</span>
      <span className="home-closing__hint">잘한 것부터 열어봐요</span>
    </Link>
  );
}
