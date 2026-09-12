import { useState } from 'react';

import type { CategoryOut } from '../../shared/api';
import { CategoryAvatar, iconOf } from '../../shared/ui';

interface CategoryChipsProps {
  categories: CategoryOut[];
  /** 금액이 비어 있거나 저장 중이면 누를 수 없다. */
  disabled?: boolean;
  onPick: (category: CategoryOut) => void;
  /** 지금 선택돼 있는 카테고리. 저장 뒤 다시 고를 때 표시한다. */
  selectedId?: string | null;
  /**
   * 새 분류를 만드는 자리. 안 넘기면 그 칩이 없다.
   *
   * 분류를 만들 수 있다는 것을 **관리 탭까지 들어가야** 알 수 있었다. 필요한 순간은
   * 적으려다 맞는 칸이 없을 때인데, 그 순간이 바로 여기다.
   */
  onCreate?: () => void;
}

/**
 * 카테고리 칩 3열.
 *
 * 칩을 누르는 것이 곧 저장이다. 저장 버튼을 따로 두면 탭이 하나 늘어난다.
 *
 * **자주 쓰는 것만 앞에 세운다.** 기본 분류만 열여섯이라 다 펼치면 키패드가 화면 밖으로
 * 밀린다. 「기록 화면에 보이기」를 끈 분류는 「더 보기」 뒤로 간다(카테고리 관리에서 정한다).
 * 없애지는 않는다. 안 보이면 그 분류로 적을 길이 아예 사라진다.
 */
export function CategoryChips({
  categories,
  disabled = false,
  onPick,
  selectedId,
  onCreate,
}: CategoryChipsProps) {
  const [showAll, setShowAll] = useState(false);

  const quick = categories.filter((item) => item.is_quick);
  const rest = categories.filter((item) => !item.is_quick);
  // 고른 것이 뒤에 숨어 있으면 눌러 둔 표시가 어디에도 안 보인다. 그때는 펼친 채로 둔다.
  const pickedIsHidden = rest.some((item) => item.id === selectedId);
  const open = showAll || pickedIsHidden;
  const shown = open ? [...quick, ...rest] : quick;

  return (
    <div className="cat-chips">
      {shown.map((category) => (
        <button
          key={category.id}
          type="button"
          className="cat-chips__item"
          aria-pressed={selectedId === undefined ? undefined : selectedId === category.id}
          disabled={disabled}
          onClick={() => onPick(category)}
        >
          <CategoryAvatar {...iconOf(category)} size={40} />
          <span className="cat-chips__name">{category.name}</span>
        </button>
      ))}

      {rest.length > 0 && !open ? (
        <button
          type="button"
          className="cat-chips__item cat-chips__item--more"
          disabled={disabled}
          onClick={() => setShowAll(true)}
        >
          <span className="cat-chips__more-mark" aria-hidden="true">
            ⋯
          </span>
          <span className="cat-chips__name">{rest.length}개 더</span>
        </button>
      ) : null}

      {onCreate ? (
        <button
          type="button"
          className="cat-chips__item cat-chips__item--new"
          disabled={disabled}
          onClick={onCreate}
        >
          <span className="cat-chips__more-mark" aria-hidden="true">
            ＋
          </span>
          <span className="cat-chips__name">새 분류</span>
        </button>
      ) : null}
    </div>
  );
}
