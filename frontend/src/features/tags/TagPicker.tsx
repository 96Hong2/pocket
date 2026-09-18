import type { CSSProperties } from 'react';
import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import type { TagKind, TagOut } from '../../shared/api';

import { tagColorVar, tagInkVar } from '../../shared/lib/tagColors';

/**
 * 기록에 태그를 다는 칩 줄.
 *
 * **저장이 끝난 다음에 묻는다.** 적는 화면에 칸이 하나 더 서면 10초 약속이 깨진다.
 * 결제 수단과 같은 자리, 같은 규칙이다. 눌린 것을 다시 누르면 떨어진다.
 *
 * **하나만 고른다.** 여럿 달면 태그별 합계가 총액을 넘어서 「비율」 이라는 말이 거짓이 된다.
 *
 * 태그를 하나도 안 만든 사람에게는 칩 대신 만들러 가는 길 한 줄만 보인다.
 * 「태그가 없어요」 만 적으면 어디서 만드는지 모른다.
 */
export interface TagPickerProps {
  /** 그 종류의 태그만 보여준다. 지출 기록에 수입 태그를 달 수 없다. */
  kind: TagKind;
  tags: TagOut[];
  selectedId: string | null;
  disabled?: boolean;
  onChange: (tagId: string | null) => void;
  className?: string;
}

export function TagPicker({
  kind,
  tags,
  selectedId,
  disabled = false,
  onChange,
  className,
}: TagPickerProps) {
  const pickable = tags.filter((tag) => tag.kind === kind);

  return (
    <div className={className == null ? 'tag-pick' : `tag-pick ${className}`}>
      <span className="tag-pick__label">태그</span>
      {pickable.length === 0 ? (
        <p className="tag-pick__empty">
          <Link to={ROUTES.tags}>관리 › 태그</Link> 에서 만들면 여기서 바로 달 수 있어요
        </p>
      ) : (
        <div className="tag-pick__row">
          {pickable.map((tag) => {
            const picked = tag.id === selectedId;
            return (
              <button
                key={tag.id}
                type="button"
                className="tag-pick__chip"
                aria-pressed={picked}
                disabled={disabled}
                style={
                  {
                    '--tag-color': tagColorVar(tag.color),
                    '--tag-ink': tagInkVar(tag.color),
                  } as CSSProperties
                }
                // 눌린 것을 다시 누르면 뗀다. 잘못 단 태그를 되무를 길이 이것뿐이다.
                onClick={() => onChange(picked ? null : tag.id)}
              >
                <span className="tag-pick__dot" aria-hidden="true" />
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
