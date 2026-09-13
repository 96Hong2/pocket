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
   * 이 칸은 **「더 보기」 안에만** 둔다. 앞자리는 고르는 자리이고 만드는 자리가 아니다.
   * 자주 쓰는 열한 개 옆에 만들기가 늘 서 있으면 고를 것이 하나 더 늘어난다.
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
 * 그 화면이 있다는 것조차 모르는 사람이 대부분이라 이 한 줄이 유일한 안내다.
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
  // 뒤에 아무것도 없고 만들 수도 없으면 「더 보기」가 열 것이 없다.
  const hasMore = rest.length > 0 || onCreate != null;

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

      {hasMore && !open ? (
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

      {open ? (
        <>
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

          {/*
            여기가 카테고리 관리를 아는 유일한 통로다. 링크가 아니라 글이다.
            누르면 적던 금액이 사라지는 자리라, 지금 갈 곳이 아니라 **있다는 사실**만 말한다.
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
