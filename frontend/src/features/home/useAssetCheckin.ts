import { useAssets } from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';

import { useCardDismiss } from './useCardDismiss';

export interface AssetCheckin {
  /** 설 조건이 다 맞았다. */
  show: boolean;
  /** 자산을 아직 못 받았다. 뒤의 카드는 기다린다. */
  unknown: boolean;
  /** `2026-10`. 닫기 표가 이 달이다. */
  month: string;
  dismiss: () => void;
}

/**
 * 한 달에 한 번 자산을 묻는 카드를 세울지.
 *
 * 항목이 있고, 이번 달 스냅샷이 없고, 이번 달에 닫지 않았을 때만 선다.
 * 자산 화면에는 같은 물음을 두지 않는다. 묻는 자리는 여기 한 곳이다.
 */
export function useAssetCheckin(): AssetCheckin {
  const assets = useAssets();
  const month = toLedgerDate(new Date()).slice(0, 7);
  const card = useCardDismiss('asset-checkin', month);
  const data = assets.data;
  const eligible =
    data != null && data.items.length > 0 && !(data.snapshot?.effective_on ?? '').startsWith(month);

  return {
    show: eligible && !card.hidden,
    unknown: assets.isPending,
    month,
    dismiss: card.dismiss,
  };
}
