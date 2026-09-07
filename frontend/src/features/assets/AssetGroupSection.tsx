import { parseDecimalOr, type AssetGroup, type AssetItemOut } from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Card, CategoryAvatar } from '../../shared/ui';

import { ASSET_GROUP_VIEWS, assetItemName } from './assetGroups';

export interface AssetGroupSectionProps {
  group: AssetGroup;
  /** 그룹 소계. 서버가 센 값이다. */
  total: string;
  /** 이 그룹의 항목. 목록에서의 자리(`sort_order`)를 그대로 들고 온다. */
  items: AssetItemOut[];
  onPick: (item: AssetItemOut) => void;
  onAdd: (group: AssetGroup) => void;
}

/**
 * 자산 그룹 한 구획.
 *
 * 항목이 없는 그룹도 그린다. 감추면 어디에 무엇을 적을 수 있는지 알 수 없고,
 * 부채 구획이 사라지면 순자산에서 빠지는 것이 무엇인지도 보이지 않는다.
 */
export function AssetGroupSection({ group, total, items, onPick, onAdd }: AssetGroupSectionProps) {
  const view = ASSET_GROUP_VIEWS[group];

  return (
    <section className="asset-group" aria-label={view.label}>
      <div className="asset-group__head">
        <CategoryAvatar icon={view.icon} size={36} />
        <div className="asset-group__title">
          <h2 className="asset-group__name">{view.label}</h2>
          <span className="asset-group__hint">{view.hint}</span>
        </div>
        <Amount
          data-testid={TEST_IDS.assetGroupTotal}
          value={parseDecimalOr(total, 0)}
          size={15}
          weight={800}
        />
      </div>

      {items.length > 0 ? (
        <Card padding="list">
          <ul className="asset-list">
            {items.map((item) => {
              const name = assetItemName(item.group, item.label);
              return (
                <li key={item.sort_order} data-testid={TEST_IDS.assetItemRow}>
                  <button
                    type="button"
                    className="asset-row"
                    aria-label={`${name} 고치기`}
                    onClick={() => onPick(item)}
                  >
                    <span className="asset-row__name">{name}</span>
                    <Amount value={parseDecimalOr(item.amount, 0)} size={14} weight={700} />
                    <span className="asset-row__go">고치기</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {/* 구획마다 이름이 달라야 어느 그룹에 더하는 것인지 스크린리더로도 갈린다. */}
      <button
        type="button"
        className="asset-group__add"
        aria-label={`${view.label} 항목 추가`}
        onClick={() => onAdd(group)}
      >
        ＋ 항목 추가
      </button>
    </section>
  );
}
