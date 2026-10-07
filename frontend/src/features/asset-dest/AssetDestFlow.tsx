import type { AssetGroup, AssetItemOut, InvestKind } from '../../shared/api';
import { AssetDestList } from './AssetDestList';
import type { AssetDest, AssetDestPick } from './destinations';
import { NewAssetForm } from './NewAssetForm';

export type AssetDestStage = 'list' | 'new';

export interface AssetDestFlowProps {
  destinations: readonly AssetItemOut[];
  value: AssetDest | null;
  onPick: (pick: AssetDestPick) => void;
  /**
   * 단계는 쓰는 쪽이 쥔다. 이 흐름은 뒤로 버튼을 그리지 않아, 폼에서 목록으로 물러나는 일은
   * 쓰는 쪽이 토스 ‹, 폰 뒤로가기, Esc 를 받아 한다.
   */
  stage: AssetDestStage;
  onStageChange: (stage: AssetDestStage) => void;
  title?: string;
  /** 「새 종목이나 통장」 을 둘지. 새 항목을 못 받는 자리(검토 줄)는 false. */
  allowNew?: boolean;
  /** 새 항목 폼의 처음 그룹과 고를 수 있는 투자 종류. */
  newInitialGroup?: AssetGroup;
  newKinds?: readonly InvestKind[];
}

/** 「다른 곳」 목록과 「새 종목이나 통장」 폼을 한 자리에서. 검토 줄, 고치기, 적금 안내가 쓴다. */
export function AssetDestFlow({
  destinations,
  value,
  onPick,
  stage,
  onStageChange,
  title,
  allowNew = true,
  newInitialGroup,
  newKinds,
}: AssetDestFlowProps) {
  if (stage === 'new' && allowNew) {
    return (
      <NewAssetForm
        destinations={destinations}
        initialGroup={newInitialGroup}
        kinds={newKinds}
        onDone={onPick}
      />
    );
  }
  return (
    <AssetDestList
      destinations={destinations}
      value={value}
      onPick={onPick}
      onNew={allowNew ? () => onStageChange('new') : undefined}
      title={title}
    />
  );
}
