import { useState } from 'react';

import type { AssetItemOut } from '../../shared/api';
import { AssetDestList } from './AssetDestList';
import type { AssetDest, AssetDestPick } from './destinations';
import { NewAssetForm } from './NewAssetForm';

export type AssetDestStage = 'list' | 'new';

export interface AssetDestFlowProps {
  destinations: readonly AssetItemOut[];
  value: AssetDest | null;
  onPick: (pick: AssetDestPick) => void;
  /** 목록 단계의 ‹. 이 흐름을 연 화면으로 돌아간다. */
  onBack: () => void;
  /**
   * 단계를 쓰는 쪽이 쥘 때. 폰 뒤로가기가 폼에서 목록으로 한 단계만 물러나야 하면 넘긴다.
   * 안 넘기면 안에서 쥔다.
   */
  stage?: AssetDestStage;
  onStageChange?: (stage: AssetDestStage) => void;
  title?: string;
  /** 「새 종목이나 통장」 을 둘지. 새 항목을 못 받는 자리(검토 줄)는 false. */
  allowNew?: boolean;
}

/** 「다른 곳」 목록과 「새 종목이나 통장」 폼을 한 자리에서. 검토 줄, 고치기, 적금 안내가 쓴다. */
export function AssetDestFlow({
  destinations,
  value,
  onPick,
  onBack,
  stage,
  onStageChange,
  title,
  allowNew = true,
}: AssetDestFlowProps) {
  const [ownStage, setOwnStage] = useState<AssetDestStage>('list');
  const current = stage ?? ownStage;
  const go = (next: AssetDestStage) => {
    if (stage == null) setOwnStage(next);
    onStageChange?.(next);
  };

  if (current === 'new' && allowNew) {
    return <NewAssetForm destinations={destinations} onDone={onPick} onBack={() => go('list')} />;
  }
  return (
    <AssetDestList
      destinations={destinations}
      value={value}
      onPick={onPick}
      onNew={allowNew ? () => go('new') : undefined}
      onBack={onBack}
      title={title}
    />
  );
}
