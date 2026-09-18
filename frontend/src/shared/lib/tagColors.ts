import type { TagColor } from '../api';

/**
 * 태그 색을 CSS 변수 이름으로 바꾸는 **유일한** 자리.
 *
 * 값 자체는 `features/tags/tags.css` 가 갖고 있다. 칩·점·도넛 조각이 같은 변수를 쓰므로,
 * 색을 하나 고치면 세 자리가 함께 바뀐다. 여기서 hex 를 다시 적으면 어긋난다.
 *
 * 색 목록의 정본은 서버(`app/domain/tags.py`)다. 여기서는 그 키를 그대로 쓴다.
 *
 * `features/tags` 가 아니라 `shared` 에 있는 이유: 목록 한 줄(`shared/ledger/LedgerRow`)도
 * 태그 색을 그린다. shared 가 features 를 가리키면 계층이 뒤집힌다.
 */

/** 칩 배경·도넛 조각에 쓰는 진한 색. */
export function tagColorVar(color: TagColor): string {
  return `var(--tag-${color})`;
}

/** 그 색 위에 얹는 글자색. 대비는 tags.css 가 맞춰 뒀다. */
export function tagInkVar(color: TagColor): string {
  return `var(--tag-${color}-ink)`;
}

/** 옅은 배경. 목록 줄의 작은 칩이 쓴다. */
export function tagSoftVar(color: TagColor): string {
  return `var(--tag-${color}-soft)`;
}

/** 고를 수 있는 색. 순서가 곧 고르는 화면의 순서다. */
export const TAG_COLORS: TagColor[] = [
  'sage',
  'ocean',
  'lilac',
  'coral',
  'amber',
  'mint',
  'rose',
  'slate',
];

/** 색 이름. 스크린리더가 「초록」 이라고 읽어야 무엇을 고르는지 안다. */
export const TAG_COLOR_NAMES: Record<TagColor, string> = {
  sage: '초록',
  ocean: '파랑',
  lilac: '보라',
  coral: '주황',
  amber: '노랑',
  mint: '민트',
  rose: '분홍',
  slate: '회색',
};
