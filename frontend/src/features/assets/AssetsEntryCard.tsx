import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { parseDecimalOr, useAssets } from '../../shared/api';
import { formatCurrency, formatDayLabel } from '../../shared/lib/format';
import { CategoryAvatar } from '../../shared/ui';

/**
 * 관리 탭 맨 위의 자산 입구.
 *
 * 숫자를 그 자리에서 보여 준다. 이름만 있는 줄로 두면 눌러 보기 전에는 안에 무엇이
 * 있는지 알 수 없어, 자산을 적어 둔 사람도 다시 안 들어온다.
 *
 * **못 불러오면 숫자 없이 이름만 남긴다.** 카드를 통째로 감추면 자산으로 가는 길이 사라진다.
 */
export function AssetsEntryCard() {
  const assets = useAssets();
  const data = assets.data;
  const netWorth = data == null ? null : parseDecimalOr(data.summary.net_worth, 0);
  const basis = data?.snapshot?.effective_on;
  // 오는 중에 권유 문구를 먼저 그리면, 적어 둔 사람에게 안 적었다고 말했다가 숫자로 바뀐다.
  const sub = assets.isPending
    ? ''
    : netWorth == null
      ? '대략 적어 두면 순자산이 한눈에 보여요'
      : basis == null
        ? `순자산 ${formatCurrency(netWorth)}`
        : `순자산 ${formatCurrency(netWorth)} · ${formatDayLabel(basis)} 기준`;

  return (
    <Link className="assets-entry" to={ROUTES.assets}>
      <CategoryAvatar icon="28_cash" size={52} />
      <span className="assets-entry__body">
        <span className="assets-entry__title">자산관리</span>
        <span className="assets-entry__sub">{sub}</span>
      </span>
    </Link>
  );
}
