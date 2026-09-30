import type { TagColor } from '../api';

/**
 * 태그 색을 CSS 변수 이름으로 바꾸는 **유일한** 자리.
 *
 * 값 자체는 `shared/ui/ui.css` 가 갖고 있다. 칩·점은 파스텔을, 카테고리 아바타는 같은 색의
 * 옅은 쪽(`-tint`)을 쓴다. 여기서 hex 를 다시 적으면 어긋난다.
 *
 * 색 목록의 정본은 서버(`app/domain/tags.py`)다. 여기서는 그 키를 그대로 쓴다.
 *
 * `features/tags` 가 아니라 `shared` 에 있는 이유: 목록 한 줄(`shared/ledger/LedgerRow`)과
 * 카테고리 아바타(`shared/ui/CategoryAvatar`)도 이 색을 그린다. shared 가 features 를
 * 가리키면 계층이 뒤집힌다. **값(css)도 같은 이유로 2026-09-21 에 shared 로 올렸다.**
 */

/** 칩·점·도넛 조각의 파스텔 바탕. */
export function tagColorVar(color: TagColor): string {
  return `var(--tag-${color})`;
}

/** 그 바탕 위에 얹는 글자색. 같은 계열의 진한 색이고, 대비는 tags.css 가 맞춰 뒀다. */
export function tagInkVar(color: TagColor): string {
  return `var(--tag-${color}-ink)`;
}

/** 더 옅은 바탕. 목록 줄의 작은 칩이 쓴다. */
export function tagSoftVar(color: TagColor): string {
  return `var(--tag-${color}-soft)`;
}

/**
 * 분류 동그라미의 바탕. 명도를 색을 안 고른 기본 동그라미에 가깝게 둔 옅은 쪽이다.
 * 파스텔 그대로 깔면 그 분류만 칩 줄에서 튄다.
 */
export function tagTintVar(color: TagColor): string {
  // 색이 하나 늘 때 `-tint` 를 빠뜨리면 동그라미가 투명해진다. 그때는 파스텔로 칠한다.
  return `var(--tag-${color}-tint, var(--tag-${color}))`;
}

/**
 * 고를 수 있는 색. 순서가 곧 고르는 화면의 순서다.
 *
 * 일곱씩 두 줄로 선다. 윗줄이 따뜻한 쪽, 아랫줄이 찬 쪽이라 줄만 봐도 반은 갈린다.
 * 서버(`app/domain/tags.py`)의 선언 순서와 같다.
 */
export const TAG_COLORS: TagColor[] = [
  'rose',
  'coral',
  'amber',
  'sand',
  'olive',
  'sage',
  'mint',
  'teal',
  'sky',
  'ocean',
  'indigo',
  'lilac',
  'plum',
  'slate',
];

/** 한 줄에 몇 개가 서나. 색 고르는 자리의 CSS 와 같은 값이다(`tags.css`). */
export const TAG_COLORS_PER_ROW = 7;

/** 색 이름. 스크린리더가 「연두」 라고 읽어야 무엇을 고르는지 안다. */
export const TAG_COLOR_NAMES: Record<TagColor, string> = {
  rose: '분홍',
  coral: '살구',
  amber: '노랑',
  sand: '모래',
  olive: '올리브',
  sage: '연두',
  mint: '민트',
  teal: '청록',
  sky: '하늘',
  ocean: '파랑',
  indigo: '남색',
  lilac: '라벤더',
  plum: '자두',
  slate: '회색',
};
