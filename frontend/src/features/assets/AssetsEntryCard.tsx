import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { parseDecimalOr, useAssetHistory, useAssets } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { CategoryAvatar } from '../../shared/ui';

import { trendValues } from './assetView';
import { Sparkline } from './TrendCharts';

/**
 * 관리 탭의 자산 입구. 숫자와 작은 추이를 그 자리에서 보여 준다.
 *
 * **못 불러오면 숫자 없이 이름만 남긴다.** 카드를 통째로 감추면 자산으로 가는 길이 사라진다.
 * 들어가는 길에 광고를 세우지 않는다(ADR-0039).
 */
export function AssetsEntryCard() {
  const assets = useAssets();
  const history = useAssetHistory();
  const data = assets.data;
  const written = data != null && data.snapshot != null && data.items.length > 0;
  const values = written ? trendValues(history.data?.points ?? []) : [];
  // 오는 중에 권유 문구를 먼저 그리면, 적어 둔 사람에게 안 적었다고 말했다가 숫자로 바뀐다.
  const sub = assets.isPending
    ? ''
    : data == null
      ? ''
      : written
        ? `순자산 ${formatCurrency(parseDecimalOr(data.summary.net_worth, 0))}`
        : '캡처 한 장이면 순자산이 보여요';

  return (
    <Link className="assets-entry" to={ROUTES.assets}>
      <CategoryAvatar icon="28_cash" size={52} />
      <span className="assets-entry__body">
        <span className="assets-entry__title">자산관리</span>
        <span className="assets-entry__sub">{sub}</span>
      </span>
      {values.length > 0 ? (
        <Sparkline className="assets-entry__spark" values={values} width={72} height={28} />
      ) : null}
    </Link>
  );
}
