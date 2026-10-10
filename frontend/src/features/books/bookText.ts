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

import { currentPercents, pairRatioText } from './sharePercents';

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

/**
 * 미리 골라 두는 회비 방식. 가족은 먼저 모아 두고 같이 쓰는 경우가 많다.
 * 서버 `domain/books.py` 의 `DEFAULT_SETTLE_RULES` 와 같은 값이다.
 */
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
 * 회비 방식. 서버 값 이름은 옛 그대로 두고 화면 말만 바꿨다(옛 번들이 같은 서버를 쓴다).
 *
 * - `none` 각자 입금: 정한 비율대로 먼저 넣고 같이 쓴다. 정산이 없다
 * - `even` 나중에 정산: 각자 내고 기간이 끝나면 비율대로 나눈다
 */
export const SETTLE_RULES: readonly SettleRule[] = ['none', 'even'];

const RULE_LABEL: Record<SettleRule, string> = {
  none: '각자 입금',
  even: '나중에 정산',
};

/** 고르는 카드 아래 한 줄. 고르면 무엇이 달라지는지만 말한다. */
const RULE_LINE: Record<SettleRule, string> = {
  none: '정한 비율대로 먼저 넣고 같이 써요',
  even: '각자 내고 기간이 끝나면 비율대로 나눠요',
};

export function settleRuleLabel(rule: SettleRule): string {
  return RULE_LABEL[rule];
}

export function settleRuleLine(rule: SettleRule): string {
  return RULE_LINE[rule];
}

/** 정산이 있는 방식인가. 홈 정산 카드와 정산 화면이 같은 답을 내야 해서 이 한 곳만 본다. */
export function ruleSettles(rule: SettleRule): boolean {
  return rule === 'even';
}

/** 만들기 화면 순서. 유형에 맞춰 미리 골라 둔 것이 먼저 선다. */
export function settleRuleOptions(kind: BookKind): SettleRule[] {
  const first = DEFAULT_RULE[kind];
  return [first, ...SETTLE_RULES.filter((rule) => rule !== first)];
}

/** 지금 남아 있는 멤버 id. 비율의 키가 이것과 꼭 같아야 한다. */
export function activeMemberIds(book: BookOut): string[] {
  return book.members.filter((member) => !member.left).map((member) => member.id);
}

/**
 * 설정의 「회비」 줄 값. 「각자 입금, 6:4」, 「나중에 정산, 똑같이」.
 *
 * 둘이면 비율을 숫자로, 셋 이상이면 「비율」 이라고만 적는다. 혼자면 방식만 적는다.
 */
export function duesLabel(book: BookOut): string {
  const rule = settleRuleLabel(book.settle_rule);
  const ids = activeMemberIds(book);
  if (ids.length < 2) return rule;
  const percents = currentPercents(ids, book.share_percents);
  if (percents == null) return `${rule}, 똑같이`;
  return `${rule}, ${pairRatioText(ids, percents) ?? '비율'}`;
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
  return notice.name == null ? '가계부가 완료됐어요' : `${notice.name}님이 가계부를 완료했어요`;
}
