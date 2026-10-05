import { useNavigate } from 'react-router';

import { assetAnalysisPath, type AssetAnalysisScope } from '../../app/router/routes';
import { useAssetAnalysis } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Button, Card, iconUrl } from '../../shared/ui';

import { ANALYSIS_KINDS } from './analysisKinds';
import { useAssetAnalysisUnlock } from './useAssetAnalysisUnlock';

export interface AnalysisEntryProps {
  scope?: AssetAnalysisScope;
}

/**
 * 자산 화면의 「내 자산 분석」 입구.
 *
 * 잠김이면 카드, 본 숫자 그대로면 줄 하나, 숫자가 바뀌었으면 다시 카드다.
 * 카드에는 광고 이야기를 적지 않는다. 광고는 누른 뒤 확인 창이 묻는다.
 */
export function AnalysisEntry({ scope = 'all' }: AnalysisEntryProps) {
  const navigate = useNavigate();
  const analysis = useAssetAnalysis(scope);
  const unlock = useAssetAnalysisUnlock();
  const kind = ANALYSIS_KINDS[scope];
  const fingerprint = analysis.data?.fingerprint ?? null;
  const state = unlock.stateOf(scope, fingerprint);

  const open = () => {
    const go = () => void navigate(assetAnalysisPath(scope));
    // 지문을 못 받았으면 분석 화면이 잠금을 대신 판정한다. 여기서 광고를 띄우면 두 번 본다.
    if (fingerprint == null) {
      go();
      return;
    }
    unlock.request({ scope, fingerprint }, go);
  };

  if (state === 'open') {
    return (
      <Card padding="none" className="analysis-row-card">
        <button
          type="button"
          className="analysis-row"
          data-testid={TEST_IDS.analysisEntry}
          data-state="open"
          onClick={open}
        >
          <img className="analysis-row__icon" src={iconUrl(kind.icon)} alt="" aria-hidden="true" />
          <span className="analysis-row__label">{kind.label}</span>
          <span className="analysis-row__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </Card>
    );
  }

  return (
    <>
      <AnalysisLockedCard
        scope={scope}
        stale={state === 'stale'}
        busy={unlock.busy || analysis.isPending}
        onOpen={open}
      />
      {unlock.prompt}
    </>
  );
}

/** 잠김 카드. 자산 화면 입구와 경로로 바로 들어온 분석 화면이 같이 쓴다. */
export function AnalysisLockedCard({
  scope,
  stale,
  busy,
  onOpen,
}: {
  scope: AssetAnalysisScope;
  stale: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const kind = ANALYSIS_KINDS[scope];
  return (
    <Card
      className="analysis-entry"
      data-testid={TEST_IDS.analysisEntry}
      data-state={stale ? 'stale' : 'locked'}
    >
      <span className="analysis-entry__kicker">{kind.label}</span>
      <b className="analysis-entry__title">
        {stale ? '자산이 바뀌어서 분석을 다시 해요' : kind.hint}
      </b>
      <Button variant="primarySmall" fullWidth disabled={busy} onClick={onOpen}>
        {kind.label}
      </Button>
    </Card>
  );
}
