import { useState } from 'react';

import type { AssetItemOut } from '../../shared/api';
import { iconUrl } from '../../shared/ui';
import { ASSET_GROUP_VIEWS } from '../assets';
import {
  DEST_GRID_SIZE,
  destFromItem,
  destGridOf,
  destGroupOf,
  destKeyOf,
  destNameOf,
  destSubOf,
  type AssetDest,
  type AssetDestPick,
} from './destinations';

export interface AssetDestFieldProps {
  /** `destinationsOf(assets)` 나 `useAssetDestinations().destinations`. */
  destinations: readonly AssetItemOut[];
  value: AssetDest | null;
  onPick: (pick: AssetDestPick) => void;
  /** 「다른 곳」. 목록 단계를 여는 것은 쓰는 쪽이 한다. */
  onOther: () => void;
  /** 목록을 받는 중. 칸 자리만 흐리게 잡는다. */
  loading?: boolean;
}

/**
 * 「어디에」. 고르기 전에는 두 칸 격자(매달 넣는 항목 먼저 다섯 + 「다른 곳」),
 * 고른 뒤에는 한 줄로 접히고 그 줄을 누르면 다시 격자가 펼쳐진다.
 */
export function AssetDestField({
  destinations,
  value,
  onPick,
  onOther,
  loading = false,
}: AssetDestFieldProps) {
  // 펼친 상태를 고른 값마다 둔다. 다른 곳에서 값이 바뀌면 저절로 접힌다.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const valueKey = destKeyOf(value);

  if (value != null && openFor !== valueKey) {
    const icon = ASSET_GROUP_VIEWS[destGroupOf(value)].icon;
    const name = destNameOf(value);
    const sub = destSubOf(value);
    return (
      <button
        type="button"
        className="asset-dest__picked"
        aria-expanded={false}
        aria-label={`어디에: ${name}${sub === '' ? '' : `, ${sub}`}. 눌러서 바꾸기`}
        onClick={() => setOpenFor(valueKey)}
      >
        <img className="asset-dest__picked-icon" src={iconUrl(icon)} alt="" />
        <span className="asset-dest__picked-name">{name}</span>
        <span className="asset-dest__picked-sub" data-numeric="">
          {sub}
        </span>
        <span className="asset-dest__picked-caret" aria-hidden="true">
          ▾
        </span>
      </button>
    );
  }

  const pickedKey = value?.type === 'item' ? value.itemKey : null;
  const fromList = destGridOf(destinations, pickedKey).flatMap((item) => destFromItem(item) ?? []);
  // 아직 저장 전인 새 항목은 목록에 없다. 다섯째 자리에 세워 다시 고를 수 있게 둔다.
  const cells =
    value?.type === 'new' ? [...fromList.slice(0, DEST_GRID_SIZE - 1), value] : fromList;

  return (
    <div className="asset-dest__grid" role="group" aria-label="어디에" aria-busy={loading}>
      {loading && cells.length === 0 ? (
        <>
          <span className="asset-dest__cell asset-dest__cell--ghost" aria-hidden="true" />
          <span className="asset-dest__cell asset-dest__cell--ghost" aria-hidden="true" />
        </>
      ) : null}
      {cells.map((dest, index) => {
        const key = destKeyOf(dest);
        return (
          <button
            key={key}
            type="button"
            className="asset-dest__cell"
            aria-pressed={key === valueKey}
            onClick={() => {
              setOpenFor(null);
              onPick({ dest, from: dest.type === 'new' ? 'new' : 'grid', position: index + 1 });
            }}
          >
            <img
              className="asset-dest__cell-icon"
              src={iconUrl(ASSET_GROUP_VIEWS[destGroupOf(dest)].icon)}
              alt=""
            />
            <span className="asset-dest__cell-name">{destNameOf(dest)}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="asset-dest__cell asset-dest__cell--other"
        disabled={loading && cells.length === 0}
        onClick={onOther}
      >
        다른 곳
      </button>
    </div>
  );
}
