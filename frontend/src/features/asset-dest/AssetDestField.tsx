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
  /**
   * 저장된 곳이 목록에 없을 때(지운 항목, 부채, 목록 실패) 접힌 줄에 보일 이름.
   * 고르기 전까지는 그 곳을 그대로 둔 것으로 본다.
   */
  savedName?: string | null;
}

/** 저장된 곳이 목록에 없을 때 접힌 줄을 펼친 표시. */
const SAVED_OPEN = 'saved';

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
  savedName = null,
}: AssetDestFieldProps) {
  // 펼친 상태를 고른 값마다 둔다. 다른 곳에서 값이 바뀌면 저절로 접힌다.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const valueKey = destKeyOf(value);

  const collapsed =
    value != null && openFor !== valueKey
      ? {
          icon: ASSET_GROUP_VIEWS[destGroupOf(value)].icon,
          name: destNameOf(value),
          sub: destSubOf(value),
          open: valueKey,
        }
      : value == null && savedName != null && openFor !== SAVED_OPEN
        ? { icon: null, name: savedName, sub: '', open: SAVED_OPEN }
        : null;

  if (collapsed != null) {
    const { icon, name, sub } = collapsed;
    return (
      <button
        type="button"
        className="asset-dest__picked"
        aria-expanded={false}
        aria-label={`어디에: ${name}${sub === '' ? '' : `, ${sub}`}. 눌러서 바꾸기`}
        onClick={() => setOpenFor(collapsed.open)}
      >
        {icon != null ? (
          <img className="asset-dest__picked-icon" src={iconUrl(icon)} alt="" />
        ) : null}
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
