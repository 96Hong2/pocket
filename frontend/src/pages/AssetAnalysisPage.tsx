import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ASSET_SCOPE_QUERY, parseAssetScope } from '../app/router/routes';
import { ANALYSIS_KINDS, AnalysisScreen } from '../features/asset-analysis';
import { useAssets } from '../shared/api';
import { formatDayLabel } from '../shared/lib/format';
import { TEST_IDS } from '../shared/testIds';

/**
 * 내 자산 분석. 범위는 `?scope=all|stock|cash` 로 받는다.
 *
 * 경로 화면이라 ‹ 는 플랫폼이 그린다. 화면이 따로 그리지 않는다.
 */
export default function AssetAnalysisPage() {
  const [params] = useSearchParams();
  const scope = parseAssetScope(params.get(ASSET_SCOPE_QUERY));
  const assets = useAssets();
  const effectiveOn = assets.data?.snapshot?.effective_on;

  return (
    <div className="page" data-scope={scope} data-testid={TEST_IDS.analysisPage}>
      <h1 className="page__title">{ANALYSIS_KINDS[scope].label}</h1>
      {effectiveOn != null ? (
        <p className="page__lead">{formatDayLabel(effectiveOn)} 기준</p>
      ) : null}

      {/* 범위를 바꾸면 잠금 판정과 펼친 상태를 처음부터 다시 한다. */}
      <AnalysisScreen key={scope} scope={scope} />

      <IdentityNotice />
    </div>
  );
}
