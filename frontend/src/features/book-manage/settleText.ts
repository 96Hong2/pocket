/**
 * 정산 결과를 사람이 읽는 말로 바꾼다.
 *
 * 숫자는 서버(`domain/settlement.py`)가 계산해 보낸 그대로 쓴다. 여기서는 누가 누구에게
 * 얼마를 보내면 되는지 한 줄로 말하는 일만 한다. 정산 화면과 우리 집 홈의 정산 카드가
 * 같은 말을 해야 해서 순수 함수로 둔다.
 */

import { parseDecimalOr, type SettlementOut } from '../../shared/api';
import { formatCurrency } from '../../shared/lib/format';
import { withJosa } from '../../shared/lib/josa';
import { ruleSettles } from '../books';

/**
 * 정산 화면 맨 위에 무엇을 말하나.
 *
 * - `none`     각자 입금 가계부. 먼저 넣고 같이 써서 정산이 없다
 * - `alone`    그 기간에 같이 쓴 사람이 없다(혼자였다)
 * - `balanced` 다 같이 낸 만큼 썼다. 보낼 돈이 없다
 * - `pair`     둘이면 한 문장. `line` 은 같은 내용을 「준호 → 은홍 12,500원」 으로 줄인 것
 * - `many`     셋 이상이면 보낼 돈 목록
 */
export type SettleSummary =
  | { state: 'none' }
  | { state: 'alone' }
  | { state: 'balanced' }
  | { state: 'pair'; text: string; line: string }
  | { state: 'many'; lines: string[] };

/**
 * 「준호가 은홍에게 12,500원 보내면 반반이에요」. 비율로 나눴으면 「… 보내면 돼요」 다.
 * 6:4 로 나눈 돈에 「반반」 은 틀린 말이다.
 */
export function pairSentence(from: string, to: string, amount: number, ratio = false): string {
  const tail = ratio ? '보내면 돼요' : '보내면 반반이에요';
  return `${withJosa(from, '이/가')} ${to}에게 ${formatCurrency(amount)} ${tail}`;
}

/** 「서연 → 은홍 182,000원」. 셋 이상일 때 한 줄씩 쓴다. */
export function transferLine(from: string, to: string, amount: number): string {
  return `${from} → ${to} ${formatCurrency(amount)}`;
}

/** 「은홍이 낸 돈」. 이름 뒤 조사는 받침에 따라 갈린다. */
export function paidLabel(name: string): string {
  return `${withJosa(name, '이/가')} 낸 돈`;
}

/**
 * 서버가 준 정산을 한 가지 말로 줄인다.
 *
 * `nameOf` 는 멤버 id 를 화면 이름으로 바꾼다. 나간 멤버는 부르는 쪽이 「나간 멤버」 로 준다.
 */
export function settleSummary(
  settlement: SettlementOut,
  nameOf: (memberId: string) => string,
): SettleSummary {
  if (!ruleSettles(settlement.rule)) return { state: 'none' };
  if (settlement.members.length < 2) return { state: 'alone' };

  const transfers = settlement.transfers
    .map((transfer) => ({
      from: nameOf(transfer.from_member_id),
      to: nameOf(transfer.to_member_id),
      amount: parseDecimalOr(transfer.amount, 0),
    }))
    .filter((transfer) => transfer.amount > 0);

  if (transfers.length === 0) return { state: 'balanced' };
  if (settlement.members.length === 2 && transfers.length === 1) {
    const [only] = transfers;
    return {
      state: 'pair',
      text: pairSentence(only.from, only.to, only.amount, settlement.ratio),
      line: transferLine(only.from, only.to, only.amount),
    };
  }
  return {
    state: 'many',
    lines: transfers.map((transfer) => transferLine(transfer.from, transfer.to, transfer.amount)),
  };
}

/** 정산을 끝낸 뒤 맨 위 한 줄. 「9월 정산을 끝냈어요」 */
export function settledHeadline(when: string): string {
  return `${when} 정산을 끝냈어요`;
}

/**
 * 정산을 끝낸 뒤 그 아래 흐린 줄들. 계산한 금액만 남긴다.
 *
 * 「준호가 은홍에게 보냈어요」 라고 쓰지 않는다. 실제로 보냈는지는 우리가 모른다.
 * 끝낸 것은 사람이 「끝냈어요」 를 누른 것뿐이다.
 */
export function settledDetail(summary: SettleSummary): string[] {
  if (summary.state === 'pair') return [`계산한 금액: ${summary.line}`];
  if (summary.state === 'many') return ['계산한 금액', ...summary.lines];
  if (summary.state === 'balanced') return ['딱 맞아요. 보낼 돈이 없어요'];
  return [];
}
