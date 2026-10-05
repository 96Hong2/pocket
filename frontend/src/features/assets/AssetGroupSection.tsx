import { parseDecimalOr, type AssetGroup, type AssetItemOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, CategoryAvatar } from '../../shared/ui';

import { ASSET_GROUP_VIEWS, assetItemName } from './assetGroups';
import { INVEST_KIND_LABEL, isMonthly, itemMetaOf, itemValueOf, rateChipOf } from './assetView';

export interface AssetGroupSectionProps {
  group: AssetGroup;
  /** 그룹 소계. 서버가 센 값이다. */
  total: string;
  /** 이 그룹의 항목. 목록에서의 자리(`sort_order`)를 그대로 들고 온다. */
  items: AssetItemOut[];
  /** 전체 항목 수가 상한에 닿았으면 ＋ 를 끈다. */
  full: boolean;
  onPick: (item: AssetItemOut) => void;
  onAdd: (group: AssetGroup) => void;
}

/**
 * 자산 그룹 한 구획. 항목이 없는 그룹도 머리는 그린다.
 * 감추면 어디에 무엇을 적을 수 있는지, 순자산에서 빠지는 것이 무엇인지 안 보인다.
 */
export function AssetGroupSection({
  group,
  total,
  items,
  full,
  onPick,
  onAdd,
}: AssetGroupSectionProps) {
  const view = ASSET_GROUP_VIEWS[group];

  return (
    <section className="asset-group" aria-label={view.label}>
      <div className="asset-group__head">
        <CategoryAvatar icon={view.icon} size={44} />
        <h2 className="asset-group__name">{view.label}</h2>
        <Amount
          className="asset-group__sum"
          data-testid={TEST_IDS.assetGroupTotal}
          value={parseDecimalOr(total, 0)}
          size={16}
          weight={800}
        />
        <button
          type="button"
          className="asset-group__plus"
          aria-label={`${view.label} 항목 추가`}
          disabled={full}
          onClick={() => onAdd(group)}
        >
          <span aria-hidden="true">＋</span>
        </button>
      </div>

      {items.length > 0 ? (
        <Card padding="list">
          <ul className="asset-list">
            {items.map((item) => (
              <li key={item.item_key ?? item.sort_order} data-testid={TEST_IDS.assetItemRow}>
                <AssetRow item={item} onPick={onPick} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}

function AssetRow({ item, onPick }: { item: AssetItemOut; onPick: (item: AssetItemOut) => void }) {
  const name = assetItemName(item.group, item.label);
  const meta = itemMetaOf(item);
  const chip = rateChipOf(item);
  const kind =
    item.group === 'investment' && item.kind != null ? INVEST_KIND_LABEL[item.kind] : null;

  return (
    <button
      type="button"
      className="asset-row"
      aria-label={`${name} 고치기`}
      onClick={() => onPick(item)}
    >
      <span className="asset-row__main">
        <span className="asset-row__line">
          <span className="asset-row__name">{name}</span>
          {kind ? <i className="asset-chip">{kind}</i> : null}
          {isMonthly(item) ? <i className="asset-chip asset-chip--soft">매달</i> : null}
        </span>
        {meta ? <span className="asset-row__meta">{meta}</span> : null}
      </span>
      <span className="asset-row__side">
        <Amount value={itemValueOf(item)} size={15} weight={800} />
        {chip ? <i className={`asset-chip asset-chip--${chip.tone}`}>{chip.text}</i> : null}
      </span>
    </button>
  );
}
