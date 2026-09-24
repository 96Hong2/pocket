import { useEffect, useState } from 'react';

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
   * 「관리 › 카테고리 관리」 를 눌렀을 때. **안 넘기면 밑줄도 없는 그냥 글이다.**
   *
   * 화면을 옮기면 이 자리를 감싼 시트가 통째로 사라진다. 적던 금액이나 읽어 온 목록을
   * 잃어도 되는지, 묻고 나서 옮겨야 하는지는 부르는 쪽만 안다. 그래서 길도 부르는 쪽이 낸다.
   */
  onManage?: () => void;
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
  /**
   * 목록이 끝까지 펼쳐졌는지 바뀔 때.
   *
   * 펼치면 칩이 화면을 채운다. 그 아래에 무엇을 세워 둘지는 자리마다 다르므로
   * 여기서 정하지 않고 알리기만 한다(기록 시트는 이때 키패드를 접는다).
   */
  onOpenChange?: (open: boolean) => void;
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
  onManage,
  onCreate,
  onExpand,
  onOpenChange,
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

  /*
    펼쳤는지를 부르는 쪽에 알린다.

    「더 보기」 뿐 아니라 **고른 것이 뒤에 숨어 있어서 저절로 펼쳐진 경우**도 같은 상태다.
    두 길을 각각 알리면 한쪽을 빠뜨린다. 목록이 사라질 때는 접힌 것으로 알린다.
  */
  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
    // 부르는 쪽이 인라인 함수를 넘겨도 펼침이 안 바뀌면 아무것도 다시 부르지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
            분류가 많아 펼친 사람에게만 한다. 숨긴 것이 없으면 이 줄도 없다.

            **앞자리는 부르는 쪽이 길을 줄 때만 누를 수 있다.** 자리 이름을 읽고 그 자리를
            찾아가는 일이 「관리 탭을 열고 목록에서 카테고리 관리를 찾는」 왕복이라 밑줄을
            그어 바로 데려간다. 다만 이 컴포넌트는 읽어 온 목록을 든 검토 화면에도 서는데,
            거기서 화면을 옮기면 그 목록이 말없이 사라진다. **여기서 직접 링크를 걸지 않고**
            잃을 것이 있는지 아는 쪽이 `onManage` 로 길을 내준다.
          */}
          <p className="cat-chips__note">
            {onManage == null ? (
              '관리 › 카테고리 관리'
            ) : (
              <button type="button" className="cat-chips__note-link" onClick={onManage}>
                관리 › 카테고리 관리
              </button>
            )}
            에서 순서를 바꾸고, 앞에 보일 분류를 고를 수 있어요
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
