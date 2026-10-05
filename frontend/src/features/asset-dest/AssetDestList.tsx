import type { AssetItemOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { CategoryAvatar, SheetHeader } from '../../shared/ui';
import {
  ASSET_GROUP_VIEWS,
  assetGroupLabel,
  assetItemName,
  formatQuantity,
  holdingOf,
  itemValueOf,
  unitOf,
} from '../assets';
import { parseQuantity } from './assetMath';
import {
  destFromItem,
  destKeyOf,
  destSectionsOf,
  type AssetDest,
  type AssetDestPick,
} from './destinations';

export interface AssetDestListProps {
  destinations: readonly AssetItemOut[];
  value: AssetDest | null;
  onPick: (pick: AssetDestPick) => void;
  /** 「새 종목이나 통장」. 폼 단계를 여는 것은 쓰는 쪽이 한다. 안 주면 그 줄이 없다. */
  onNew?: () => void;
  onBack: () => void;
  /** 머리 제목. 기록에서는 「어디에 넣었어요?」. */
  title?: string;
}

function rowSub(item: AssetItemOut): string {
  const value = formatCurrency(itemValueOf(item));
  if (holdingOf(item.group, item.kind) !== 'quantity') return value;
  const held = parseQuantity(item.quantity) ?? 0n;
  return held > 0n ? `${value}, ${formatQuantity(item.quantity)}${unitOf(item.kind)}` : value;
}

/** 「다른 곳」 단계. 그룹마다 항목 전부와 맨 아래 「새 종목이나 통장」. */
export function AssetDestList({
  destinations,
  value,
  onPick,
  onNew,
  onBack,
  title = '어디에 넣었어요?',
}: AssetDestListProps) {
  const valueKey = destKeyOf(value);
  const sections = destSectionsOf(destinations);
  const positionOf = new Map(
    sections.flatMap((section) => section.items).map((item, index) => [item, index + 1]),
  );

  return (
    <div className="asset-dest-list" data-record-step="">
      <SheetHeader onBack={onBack} title={title} />
      {sections.map((section) => (
        <section key={section.group} className="asset-dest-list__section">
          <h3 className="asset-dest-list__group">{assetGroupLabel(section.group)}</h3>
          {section.items.map((item) => {
            const dest = destFromItem(item);
            if (dest == null) return null;
            const position = positionOf.get(item) ?? 0;
            return (
              <button
                key={dest.itemKey}
                type="button"
                className="asset-dest-list__row"
                aria-pressed={destKeyOf(dest) === valueKey}
                onClick={() => onPick({ dest, from: 'other', position })}
              >
                <CategoryAvatar icon={ASSET_GROUP_VIEWS[item.group].icon} size={44} />
                <span className="asset-dest-list__text">
                  <span className="asset-dest-list__name">
                    {assetItemName(item.group, item.label)}
                  </span>
                  <span className="asset-dest-list__sub" data-numeric="">
                    {rowSub(item)}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
      ))}
      {onNew == null ? null : (
        <button
          type="button"
          className="asset-dest-list__row asset-dest-list__row--add"
          onClick={onNew}
        >
          <span className="asset-dest-list__plus" aria-hidden="true">
            ＋
          </span>
          <span className="asset-dest-list__name">새 종목이나 통장</span>
        </button>
      )}
    </div>
  );
}
