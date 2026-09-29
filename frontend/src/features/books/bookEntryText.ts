/**
 * 공유 기록 한 줄을 화면 말로 옮기는 규칙.
 *
 * 공유 홈의 목록, 저장 뒤 화면, 기록 수정이 같은 기록을 같은 말로 부르게 한 곳에 둔다.
 * 부수효과 없는 함수만 둔다.
 */

import {
  parseDecimal,
  parseDecimalOr,
  type BookCategoryOut,
  type BookEntryOut,
  type BookMonthStateOut,
  type BookOut,
  type CategoryOut,
  type SettlementOut,
} from '../../shared/api';
import { formatCurrency, LEDGER_TIME_ZONE, toLedgerDate } from '../../shared/lib/format';
import { withJosa } from '../../shared/lib/josa';

import { findMember, memberName, otherActiveMembers } from './bookText';

/**
 * 가계부 분류를 분류 고르기(`CategoryPicker`)가 받는 모양으로 바꾼다.
 *
 * 공유 분류는 몇 개 안 돼 전부 앞자리에 선다. 멤버가 새 분류를 더할 수 있고 관리 화면은 없다.
 */
export function asPickable(categories: readonly BookCategoryOut[]): CategoryOut[] {
  return [...categories]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((category) => ({
      id: category.id,
      name: category.name,
      kind: 'expense',
      icon_key: category.icon_key,
      icon_custom: null,
      color: null,
      is_quick: true,
      sort_order: category.sort_order,
      is_default: true,
      usage_count: 0,
    }));
}

export function entryCategory(book: BookOut, entry: BookEntryOut): BookCategoryOut | null {
  if (entry.category_id == null) return null;
  return book.categories.find((category) => category.id === entry.category_id) ?? null;
}

/** 줄 제목. 적은 내용이 있으면 그것, 없으면 분류 이름이다. */
export function entryTitle(book: BookOut, entry: BookEntryOut): string {
  return entry.title ?? entryCategory(book, entry)?.name ?? '기록';
}

/** 적은 사람 이름. 나간 멤버는 「나간 멤버」 다. */
export function writerName(book: BookOut, entry: BookEntryOut): string {
  return memberName(findMember(book, entry.created_by_member_id));
}

const stampFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: LEDGER_TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** `2026-09-28T06:10:00Z` → `9월 28일 오후 3:10`. 가계부 시간대로 센다. */
export function stampLabel(iso: string): string {
  const parts = Object.fromEntries(
    stampFormat.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return `${parts.month}월 ${parts.day}일 ${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
}

/** 「준호가 9월 28일 오후 3:10에 적었어요」 */
export function wroteLine(book: BookOut, entry: BookEntryOut): string {
  return `${withJosa(writerName(book, entry), '이/가')} ${stampLabel(entry.created_at)}에 적었어요`;
}

/** 마지막으로 남이 고쳤을 때만. 「은홍이 9월 28일 오후 3:40에 고쳤어요」 */
export function editedLine(book: BookOut, entry: BookEntryOut): string | null {
  if (entry.updated_by_member_id == null) return null;
  const editor = memberName(findMember(book, entry.updated_by_member_id));
  return `${withJosa(editor, '이/가')} ${stampLabel(entry.updated_at)}에 고쳤어요`;
}

/** 저장 뒤 화면의 둘째 줄. 혼자면 말하지 않는다. */
export function othersSeeLine(book: BookOut): string | null {
  const others = otherActiveMembers(book);
  if (others.length === 0) return null;
  if (others.length === 1) return `${memberName(others[0])}도 바로 볼 수 있어요`;
  return '멤버 모두 바로 볼 수 있어요';
}

/**
 * 내 지출을 공유 가계부로 옮긴 뒤 알림. 「둘이 쓰는 돈으로 옮겼어요. 준호도 볼 수 있어요」
 *
 * 내 기록이 이제 남에게 보인다는 것을 알림에서 바로 말한다. 혼자 쓰는 가계부면 앞 문장만이다.
 */
export function movedInToast(book: BookOut): string {
  const head = `${withJosa(book.name, '으로/로')} 옮겼어요`;
  const others = otherActiveMembers(book);
  if (others.length === 0) return head;
  if (others.length === 1) return `${head}. ${memberName(others[0])}도 볼 수 있어요`;
  return `${head}. 멤버 모두 볼 수 있어요`;
}

/** 고친 뒤 알림. 누구 화면에 반영되는지까지만 말한다. */
export function editedToast(book: BookOut): string {
  const others = otherActiveMembers(book);
  if (others.length === 0) return '고쳤어요';
  if (others.length === 1) return `고쳤어요. ${memberName(others[0])} 화면에도 반영돼요`;
  return '고쳤어요. 멤버 모두에게 반영돼요';
}

/** 남이 적은 기록을 관리자가 지우려 할 때 한 번 묻는 말. */
export function deleteOthersText(book: BookOut, entry: BookEntryOut): string {
  const writer = findMember(book, entry.created_by_member_id);
  if (writer == null || writer.left || writer.name == null) {
    return '나간 멤버가 적은 기록이에요. 지우면 멤버 모두의 화면에서 사라져요';
  }
  return `${withJosa(writer.name, '이/가')} 적은 기록이에요. 지우면 ${writer.name} 화면에서도 사라져요`;
}

/** `2026-09-01` 이 들어간 달이 오늘의 달이면 「이번 달」, 아니면 「8월」. */
export function monthWord(periodStart: string, today: string): string {
  if (periodStart.slice(0, 7) === today.slice(0, 7)) return '이번 달';
  return `${Number(periodStart.slice(5, 7))}월`;
}

/**
 * 「이번 달 남은 예산 215,200원」 또는 「이번 달 같이 쓴 돈 32,000원」.
 *
 * 여행 가계부는 달이 아니라 여행 전체로 정산한다. 서버도 여행 전체를 세어 보낸다(`month`).
 * 그래서 「이번 여행에 같이 쓴 돈」 이다.
 */
export function monthLine(book: BookOut, month: BookMonthStateOut): string {
  const trip = book.kind === 'trip';
  const when = trip ? '이번 여행' : monthWord(month.period_start, toLedgerDate(new Date()));
  const remaining = parseDecimal(month.remaining);
  if (month.budget != null && remaining != null) {
    if (remaining < 0) return `${when} 예산보다 ${formatCurrency(-remaining)} 더 썼어요`;
    return `${when} 남은 예산 ${formatCurrency(remaining)}`;
  }
  const spent = formatCurrency(parseDecimalOr(month.spent, 0));
  return trip ? `${when}에 같이 쓴 돈 ${spent}` : `${when} 같이 쓴 돈 ${spent}`;
}

/**
 * 「적을 곳」 둘째 칩에 설 가계부.
 *
 * `candidates` 를 앞에서부터 본다. 부르는 쪽이 고른 것 → 마지막에 적은 곳 → 보고 있는 가계부
 * 순으로 넘긴다. 목록에 없는 id(끝났거나 나간 가계부)는 건너뛴다.
 *
 * 아무것도 없으면 **둘 이상이 쓰는 가계부를 혼자 쓰는 것보다 앞에** 세우고, 그 안에서는 최근에
 * 만든 것이 먼저다. 만들어 놓고 아무도 안 들어온 가계부가 둘째 칩을 차지하지 않게 한다.
 */
export function secondBookId(
  active: readonly BookOut[],
  candidates: readonly (string | null | undefined)[],
): string | null {
  const ids = new Set(active.map((book) => book.id));
  for (const id of candidates) {
    if (id != null && ids.has(id)) return id;
  }
  const ranked = [...active].sort((a, b) => {
    const shared = Number(b.active_member_count >= 2) - Number(a.active_member_count >= 2);
    return shared !== 0 ? shared : b.created_at.localeCompare(a.created_at);
  });
  return ranked[0]?.id ?? null;
}

/** 정산 카드 제목. 여행 가계부는 달을 나누지 않는다. */
export function settleTitle(settlement: SettlementOut): string {
  if (settlement.period === 'all') return '여행 전체 정산';
  return `${Number(settlement.period.slice(5, 7))}월 정산`;
}

/**
 * 정산 카드 한 줄. 둘이면 문장 하나, 셋 이상이면 보낼 돈 건수만 말한다.
 *
 * 끝낸 뒤 기록이 바뀌었으면 끝났다고 말하지 않는다. 다시 계산한 결과를 보여 준다.
 */
export function settleLine(book: BookOut, settlement: SettlementOut): string {
  if (settlement.done != null && !settlement.changed_after_done) {
    return `${settleTitle(settlement)} 끝`;
  }
  const transfers = settlement.transfers.filter((transfer) => Number(transfer.amount) > 0);
  if (transfers.length === 0) return '딱 맞아요';
  if (settlement.members.length === 2 && transfers.length === 1) {
    const [only] = transfers;
    const from = memberName(findMember(book, only.from_member_id));
    const to = memberName(findMember(book, only.to_member_id));
    return `${withJosa(from, '이/가')} ${to}에게 ${formatCurrency(Number(only.amount))} 보내면 반반이에요`;
  }
  return `보낼 돈 ${transfers.length}건`;
}
