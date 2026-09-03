import type { CategoryOut } from '../../shared/api';
import { CategoryAvatar, toIconName } from '../../shared/ui';

interface CategoryChipsProps {
  categories: CategoryOut[];
  /** 금액이 비어 있거나 저장 중이면 누를 수 없다. */
  disabled?: boolean;
  onPick: (category: CategoryOut) => void;
  /** 지금 선택돼 있는 카테고리. 저장 뒤 다시 고를 때 표시한다. */
  selectedId?: string | null;
}

/**
 * 카테고리 칩 3열.
 *
 * 칩을 누르는 것이 곧 저장이다. 저장 버튼을 따로 두면 탭이 하나 늘어난다.
 */
export function CategoryChips({
  categories,
  disabled = false,
  onPick,
  selectedId,
}: CategoryChipsProps) {
  return (
    <div className="cat-chips">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className="cat-chips__item"
          aria-pressed={selectedId === undefined ? undefined : selectedId === category.id}
          disabled={disabled}
          onClick={() => onPick(category)}
        >
          <CategoryAvatar icon={toIconName(category.icon_key)} size={30} />
          <span className="cat-chips__name">{category.name}</span>
        </button>
      ))}
    </div>
  );
}
