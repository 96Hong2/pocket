/**
 * 공유 가계부 화면들이 같이 쓰는 이름과 작은 규칙.
 *
 * 홈·기록 시트·설정·리포트가 같은 가계부를 같은 말로 부르게 한 곳에 둔다.
 * 화면마다 적으면 한 곳은 「연인·부부」, 다른 곳은 「커플」 이 된다.
 */

import type { MembersBucket } from '../../shared/analytics';
import type { BookKind, BookMemberOut, BookOut, SettleRule } from '../../shared/api';
import type { BookNotice } from '../../shared/lib/bookSeenState';
import type { IconName } from '../../shared/ui';

/** 만들기 화면에 서는 순서. */
export const BOOK_KINDS: readonly BookKind[] = ['couple', 'family', 'trip', 'room'];

const KIND_LABEL: Record<BookKind, string> = {
  couple: '연인·부부',
  family: '가족',
  trip: '여행·모임',
  room: '룸메이트',
};

const KIND_ICON: Record<BookKind, IconName> = {
  couple: '07_heart',
  family: '13_family',
  trip: '40_airplane',
  room: '12_house',
};

/**
 * 이름 칸을 비워 두지 않는다. 만드는 사람이 이름을 고민하지 않게 유형마다 미리 채운다.
 * 누구에게나 맞는 평범한 말로 둔다. 연인이 같이 사는 집이 있다고 가정하지 않는다.
 * 서버 `domain/books.py` 의 `DEFAULT_BOOK_NAMES` 와 같은 값이다.
 */
const DEFAULT_NAME: Record<BookKind, string> = {
  couple: '둘이 쓰는 돈',
  family: '가족 생활비',
  trip: '여행 경비',
  room: '공동 생활비',
};

/** 미리 골라 두는 돈 나누기. 가족은 같이 모은 돈으로 쓰는 경우가 많다. */
const DEFAULT_RULE: Record<BookKind, SettleRule> = {
  couple: 'even',
  family: 'none',
  trip: 'even',
  room: 'even',
};

/** 목록과 고르기 창에서 「내 가계부」 옆에 서는 그림. */
export const MY_BOOK_ICON: IconName = '51_wallet';
export const MY_BOOK_NAME = '내 가계부';

/** 나간 멤버는 서버가 이름을 보내지 않는다. 그 자리에 이 말을 쓴다. */
export const LEFT_MEMBER_NAME = '나간 멤버';

export function bookKindLabel(kind: BookKind): string {
  return KIND_LABEL[kind];
}

export function bookKindIcon(kind: BookKind): IconName {
  return KIND_ICON[kind];
}

export function defaultBookName(kind: BookKind): string {
  return DEFAULT_NAME[kind];
}

export function defaultSettleRule(kind: BookKind): SettleRule {
  return DEFAULT_RULE[kind];
}

/**
 * 예산 이름. 여행은 달이 아니라 여행 전체로 세므로 「여행 예산」 이다. 나머지는 매달 같은 금액이라 「한 달 예산」 이다.
 */
export function budgetLabel(kind: BookKind): string {
  return kind === 'trip' ? '여행 예산' : '한 달 예산';
}

/**
 * 돈 나누기 이름. 둘이 쓰는 가계부는 「반반」, 여럿이 쓰는 가계부는 「똑같이 나눠요」 다.
 * 같은 규칙인데 인원이 다르면 사람들이 부르는 말이 다르다.
 */
export function settleRuleLabel(kind: BookKind, rule: SettleRule): string {
  if (rule === 'none') return '같이 모은 돈';
  return kind === 'couple' || kind === 'room' ? '반반' : '똑같이 나눠요';
}

/** 멤버 이름. 나갔거나 행이 사라진 멤버는 「나간 멤버」 다. */
export function memberName(member: BookMemberOut | null | undefined): string {
  if (member == null || member.left || member.name == null) return LEFT_MEMBER_NAME;
  return member.name;
}

export function findMember(
  book: BookOut,
  memberId: string | null | undefined,
): BookMemberOut | null {
  if (memberId == null) return null;
  return book.members.find((member) => member.id === memberId) ?? null;
}

export function myMember(book: BookOut): BookMemberOut | null {
  return book.members.find((member) => member.is_me) ?? null;
}

/** 나 말고 지금 남아 있는 멤버. 「준호도 바로 볼 수 있어요」 같은 말이 이걸 센다. */
export function otherActiveMembers(book: BookOut): BookMemberOut[] {
  return book.members.filter((member) => !member.is_me && !member.left);
}

/**
 * 다른 가계부에서 쓰던 내 이름. 만들기와 초대 화면의 이름 칸을 미리 채운다.
 * 같은 사람이 가계부마다 이름을 다시 적지 않게 한다. 없으면 null 이다.
 */
export function myNameIn(books: readonly BookOut[]): string | null {
  for (const book of books) {
    const name = myMember(book)?.name;
    if (name != null && name.trim() !== '') return name;
  }
  return null;
}

/** 멤버 수를 로그에 싣는 구간. 값 그대로 싣지 않는다. */
export function membersBucket(count: number): MembersBucket {
  if (count <= 1) return '1';
  if (count === 2) return '2';
  if (count <= 5) return '3-5';
  return '6-10';
}

/** 안 끝난 것과 끝난 것. 서버가 준 순서(최근 것이 먼저)를 그대로 둔다. */
export function splitBooks(items: readonly BookOut[]): { active: BookOut[]; ended: BookOut[] } {
  return {
    active: items.filter((book) => !book.ended),
    ended: items.filter((book) => book.ended),
  };
}

/** 우리 집 홈 맨 위 한 줄 알림. */
export function noticeText(notice: BookNotice): string {
  if (notice.kind === 'joined') return `${notice.name}님이 들어왔어요`;
  return notice.name == null ? '가계부가 끝났어요' : `${notice.name}님이 가계부를 끝냈어요`;
}
