import { useMemo } from 'react';

import { useAssets } from '../../shared/api';
import type { IconName } from '../../shared/ui';

import { ASSET_GROUP_VIEWS } from './assetGroups';

/**
 * 저축·투자 기록 줄에 그릴 그림. 「어디에」 항목 키 → 그 항목 그룹의 그림.
 *
 * 저축·투자는 분류 없이 적혀 분류 그림으로 그리면 「기타」 와 같은 그림이 된다.
 * 목록을 못 받았거나 지운 항목이면 비어 있고, 줄이 투자 그림으로 떨어진다.
 */
export function useAssetIcons(): ReadonlyMap<string, IconName> {
  const assets = useAssets();
  return useMemo(() => {
    const icons = new Map<string, IconName>();
    for (const item of assets.data?.items ?? []) {
      if (item.item_key != null) icons.set(item.item_key, ASSET_GROUP_VIEWS[item.group].icon);
    }
    return icons;
  }, [assets.data]);
}
