import { useMemo } from 'react';

import { useAssets, type AssetItemOut } from '../../shared/api';
import { destinationsOf } from './destinations';

export interface AssetDestinations {
  /** 고를 수 있는 항목. 부채와 키 없는 옛 항목은 빠진다. */
  destinations: AssetItemOut[];
  loading: boolean;
  failed: boolean;
}

/** GET /assets 의 항목으로 「어디에」 목록을 만든다. 공유 가계부 기록에서는 부르지 않는다. */
export function useAssetDestinations(): AssetDestinations {
  const query = useAssets();
  const destinations = useMemo(() => destinationsOf(query.data), [query.data]);
  return { destinations, loading: query.isPending, failed: query.isError };
}
