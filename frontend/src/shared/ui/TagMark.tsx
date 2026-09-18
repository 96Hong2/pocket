import type { CSSProperties } from 'react';

import type { TagOut } from '../api';
import { tagColorVar, tagSoftVar } from '../lib/tagColors';

/**
 * 목록 한 줄에 붙는 작은 태그 표식.
 *
 * 옅은 바탕에 그 태그 색 글자다. 진한 칩으로 두면 목록에서 태그가 금액보다 도드라진다.
 * 이름이 길어도 폭을 안 늘린다. 줄이 밀리면 금액이 화면 밖으로 나간다.
 */
export function TagMark({ tag }: { tag: TagOut }) {
  return (
    <span
      className="tag-mark"
      style={
        {
          '--tag-color': tagColorVar(tag.color),
          '--tag-soft': tagSoftVar(tag.color),
        } as CSSProperties
      }
    >
      {tag.name}
    </span>
  );
}
