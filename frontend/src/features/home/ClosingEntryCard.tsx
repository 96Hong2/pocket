import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { formatMonthLabel } from '../../shared/lib/format';
import { CardClose } from '../../shared/ui';

/**
 * 홈에 놓는 결산 진입 카드. 세울지는 `useClosingEntry` 가 정한다.
 *
 * **저절로 열리지 않는다.** 누르면 그때 리포트로 가서 결산이 열린다.
 * 오른쪽 위 ✕ 로 그 달 안내를 닫을 수 있다. 다른 홈 카드와 같은 자리, 같은 모양이다.
 */
export function ClosingEntryCard({ month, onDismiss }: { month: string; onDismiss: () => void }) {
  const label = formatMonthLabel(month);
  return (
    <div className="home-closing-wrap">
      <Link className="home-closing" to={`${ROUTES.report}?month=${month}&closing=1`}>
        <span className="home-closing__title">{label} 결산이 도착했어요</span>
        <span className="home-closing__hint">잘한 것부터 열어봐요</span>
      </Link>
      <CardClose label={`${label} 결산 안내 닫기`} onClick={onDismiss} />
    </div>
  );
}
