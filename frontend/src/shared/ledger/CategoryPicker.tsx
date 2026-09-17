import { useState } from 'react';

import { cx } from '../lib/cx';
import { CategoryAvatar, iconOf } from '../ui';

import { splitQuick } from './quickPick';

import type { CategoryOut } from '../api';

export interface CategoryPickerProps {
  categories: CategoryOut[];
  /** 지금 고른 분류. 안 주면 눌린 표시를 하지 않는다. */
  selectedId?: string | null;
  disabled?: boolean;
  onPick: (category: CategoryOut) => void;
  /**
   * 「＋ 새 분류」를 눌렀을 때. 안 넘기면 그 칸이 없다.
   *
   * 숨긴 분류가 있으면 이 칸은 **「더 보기」 안에** 둔다. 앞자리는 고르는 자리이고
   * 만드는 자리가 아니다. 자주 쓰는 열한 개 옆에 만들기가 늘 서 있으면 고를 것이 하나 는다.
   * 숨긴 것이 없을 때만 예외로 앞자리에 세운다. 아래 `hasHidden` 을 보라.
   */
  onCreate?: () => void;
  /**
   * 「더 보기」를 폈을 때. 로그는 부르는 쪽이 남긴다.
   *
   * 이 컴포넌트가 직접 남기면 어느 화면에서 편 것인지, 어느 기록 흐름인지를 알 수 없다.
   */
  onExpand?: () => void;
  /** 작은 자리(수정 시트·검토 목록)에서는 칩을 낮게 그린다. */
  size?: 'lg' | 'sm';
  className?: string;
  ariaLabel?: string;
}

/**
 * 분류 고르기.
 *
 * 기록·수정·검토 세 화면이 같은 것을 쓴다. 같은 일을 세 모양으로 그리면 한 화면에서 배운
 * 것이 다음 화면에서 안 통한다.
 *
 * **접혀 있을 때는 앞자리 열한 개뿐이다.** 나머지는 「더 보기」 뒤로 간다. 분류를 만들수록
 * 목록이 길어져 고르기가 느려지는 것을 이 한 줄이 막는다.
 * 펼치면 전부 보이고, 거기서 새로 만들 수도 있고, 순서를 어디서 바꾸는지도 적어 둔다.
 *
 * **숨긴 것이 없으면 「더 보기」를 세우지 않는다.** 열어도 분류가 한 개도 안 나오는 버튼이라,
 * 누른 사람은 뭘 더 볼 수 있다고 믿고 눌렀다가 「새 분류」만 본다. 그 자리에 「새 분류」를
 * 바로 세워 한 번 누르는 값을 없앤다.
 */
export function CategoryPicker({
  categories,
  selectedId,
  disabled = false,
  onPick,
  onCreate,
  onExpand,
  size = 'lg',
  className,
  ariaLabel = '분류',
}: CategoryPickerProps) {
  const [showAll, setShowAll] = useState(false);

  const { front, rest } = splitQuick(categories);
  // 고른 것이 뒤에 숨어 있으면 눌러 둔 표시가 어디에도 안 보인다. 그때는 펼친 채로 둔다.
  const pickedIsHidden = rest.some((item) => item.id === selectedId);
  const open = showAll || pickedIsHidden;
  const shown = open ? [...front, ...rest] : front;
  /**
   * 뒤에 숨긴 분류가 있나.
   *
   * 없으면 「더 보기」를 눌러도 분류가 하나도 안 나온다. 열어 봐야 「새 분류」뿐이라
   * 한 번 누르는 값만 치르고 얻는 것이 없다. 그때는 그 자리에 「새 분류」를 바로 세운다.
   * 기본 분류 열한 개를 그대로 쓰는 사람이 대부분이라, 이쪽이 오히려 보통 상태다.
   */
  const hasHidden = rest.length > 0;
  // 「더 보기」는 숨긴 것이 있을 때만 있다. 그래서 open 이면 숨긴 것도 반드시 있다.
  const showCreate = onCreate != null && (open || !hasHidden);

  const avatar = size === 'lg' ? 40 : 32;

  return (
    <div
      className={cx('cat-chips', size === 'sm' && 'cat-chips--sm', className)}
      role="group"
      aria-label={ariaLabel}
    >
      {shown.map((category) => (
        <button
          key={category.id}
          type="button"
          className="cat-chips__item"
          aria-pressed={selectedId === undefined ? undefined : selectedId === category.id}
          disabled={disabled}
          onClick={() => onPick(category)}
        >
          <CategoryAvatar {...iconOf(category)} size={avatar} />
          <span className="cat-chips__name">{category.name}</span>
        </button>
      ))}

      {hasHidden && !open ? (
        <button
          type="button"
          className="cat-chips__item cat-chips__item--more"
          disabled={disabled}
          onClick={() => {
            setShowAll(true);
            onExpand?.();
          }}
        >
          <span className="cat-chips__more-mark" aria-hidden="true">
            ⋯
          </span>
          <span className="cat-chips__name">더 보기</span>
        </button>
      ) : null}

      {showCreate ? (
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

      {open ? (
        <>
          {/*
            분류가 많아 펼친 사람에게만 한다. 링크가 아니라 글이다.
            누르면 적던 금액이 사라지는 자리라, 지금 갈 곳이 아니라 **있다는 사실**만 말한다.
            숨긴 것이 없으면 이 줄도 없다. 그 사람은 관리 탭 목록에서 같은 자리를 찾는다.
          */}
          <p className="cat-chips__note">
            관리 › 카테고리 관리에서 순서를 바꾸고, 앞에 보일 분류를 고를 수 있어요
          </p>

          {pickedIsHidden ? null : (
            <button
              type="button"
              className="cat-chips__fold"
              disabled={disabled}
              onClick={() => setShowAll(false)}
            >
              접기
            </button>
          )}
        </>
      ) : null}
    </div>
  );
}
