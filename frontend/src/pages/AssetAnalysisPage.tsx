import { useState } from 'react';
import { useSearchParams } from 'react-router';

import { IdentityNotice } from '../app/IdentityNotice';
import { ASSET_SCOPE_QUERY, parseAssetScope } from '../app/router/routes';
import { ANALYSIS_KINDS, AnalysisScreen } from '../features/asset-analysis';
import { EditSheet } from '../features/transactions';
import { useAssets, useCategories, type TransactionOut } from '../shared/api';
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
  const categories = useCategories();
  // 「큰 저축·투자 Top 5」 에서 누른 기록. 고치고 나면 분석이 새 숫자로 다시 그려진다.
  const [editing, setEditing] = useState<{
    transaction: TransactionOut;
    onSaved: () => void;
  } | null>(null);

  return (
    <div className="page" data-scope={scope} data-testid={TEST_IDS.analysisPage}>
      <h1 className="page__title">{ANALYSIS_KINDS[scope].label}</h1>
      {effectiveOn != null ? (
        <p className="page__lead">{formatDayLabel(effectiveOn)} 기준</p>
      ) : null}

      {/* 범위를 바꾸면 잠금 판정과 펼친 상태를 처음부터 다시 한다. */}
      <AnalysisScreen
        key={scope}
        scope={scope}
        onEditRecord={(transaction, onSaved) => setEditing({ transaction, onSaved })}
      />

      <EditSheet
        transaction={editing?.transaction ?? null}
        categories={categories.data?.items ?? []}
        onClose={() => setEditing(null)}
        onSaved={editing?.onSaved}
      />

      <IdentityNotice />
    </div>
  );
}
