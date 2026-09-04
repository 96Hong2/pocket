import {
  parseDecimal,
  parseDecimalOr,
  type CategoryBudgetOut,
  type CategoryOut,
} from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, CategoryAvatar, Chip, Gauge, toIconName } from '../../shared/ui';

/** 이 비율을 넘으면 한 줄에 '주의' 를 붙인다. 넘긴 뒤가 아니라 넘기기 전에 보여야 한다. */
const CAUTION_RATIO = 0.8;

export interface CategoryBudgetListProps {
  rows: CategoryBudgetOut[];
  /** 이름과 아이콘을 찾는 데 쓴다. */
  categories: CategoryOut[];
  editable: boolean;
  /** 전체 예산 한도. 합이 이걸 넘으면 한 줄로 알려 준다. */
  totalAmount: number;
  onPick: (row: CategoryBudgetOut) => void;
  onAdd: () => void;
}

/**
 * 카테고리 예산 목록.
 *
 * 한도를 정한 카테고리만 나온다. 정하지 않은 카테고리를 0원으로 채워 넣으면
 * 모든 카테고리가 초과로 보인다.
 */
export function CategoryBudgetList({
  rows,
  categories,
  editable,
  totalAmount,
  onPick,
  onAdd,
}: CategoryBudgetListProps) {
  const sum = rows.reduce((total, row) => total + parseDecimalOr(row.amount, 0), 0);

  return (
    <section className="budget-cats" aria-label="카테고리 예산">
      <div className="budget-cats__head">
        <h3 className="budget-cats__title">카테고리 예산</h3>
        <Chip variant="kind">{rows.length}개</Chip>
      </div>

      <ul className="budget-cats__list">
        {rows.map((row) => (
          <CategoryBudgetRow
            key={row.category_id}
            row={row}
            category={categories.find((item) => item.id === row.category_id)}
            editable={editable}
            onPick={onPick}
          />
        ))}
      </ul>

      {editable ? (
        <button type="button" className="budget-cats__add" onClick={onAdd}>
          ＋ 카테고리 예산 추가
        </button>
      ) : null}

      {sum > totalAmount ? (
        <p className="budget-cats__sum" data-testid={TEST_IDS.categoryBudgetSum}>
          {`카테고리 예산 합(${formatCurrency(sum)})이 전체 예산(${formatCurrency(totalAmount)})보다 커요`}
        </p>
      ) : null}
    </section>
  );
}

interface CategoryBudgetRowProps {
  row: CategoryBudgetOut;
  /** 목록에서 못 찾으면 이름 없이 그린다. 줄을 감추면 정한 예산이 사라진 것처럼 보인다. */
  category?: CategoryOut;
  editable: boolean;
  onPick: (row: CategoryBudgetOut) => void;
}

function CategoryBudgetRow({ row, category, editable, onPick }: CategoryBudgetRowProps) {
  const name = category?.name ?? '카테고리';
  const progress = parseDecimal(row.spend_progress);

  const inner = (
    <>
      <CategoryAvatar icon={toIconName(category?.icon_key)} size={36} />
      <div className="budget-cat__body">
        <div className="budget-cat__head">
          <span className="budget-cat__name">{name}</span>
          {progress != null && progress >= CAUTION_RATIO ? (
            <Chip variant="caution">주의</Chip>
          ) : null}
        </div>
        <Gauge
          size={8}
          ratio={progress ?? 0}
          over={row.is_over_budget}
          label={`${name} 예산 사용률`}
        />
        <div className="budget-cat__nums">
          <Amount
            data-testid={TEST_IDS.categoryBudgetUsed}
            value={parseDecimalOr(row.budgeted_spend, 0)}
            size={12}
            weight={700}
          />
          {' / '}
          <Amount
            className="budget-cat__cap"
            data-testid={TEST_IDS.categoryBudgetCap}
            value={parseDecimalOr(row.amount, 0)}
            size={12}
            weight={600}
          />
        </div>
      </div>
    </>
  );

  return (
    <li className="budget-cat" data-testid={TEST_IDS.categoryBudgetRow}>
      {editable ? (
        <button
          type="button"
          className="budget-cat__hit"
          onClick={() => onPick(row)}
          aria-label={`${name} 예산 수정`}
        >
          {inner}
        </button>
      ) : (
        <div className="budget-cat__hit">{inner}</div>
      )}
    </li>
  );
}
