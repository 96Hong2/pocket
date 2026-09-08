/**
 * 한 건이 지출인가 수입인가.
 *
 * 이체와 환불은 여기 없다. 이체는 집계 밖이라 분류를 고를 자리가 없고, 환불은 되돌릴
 * 지출을 함께 골라야 하는데 그 자리가 아직 없다. 둘 다 검토 화면에서만 다룬다.
 *
 * 거래의 `type` 과 분류의 `kind` 가 같은 말을 쓰지만 값 집합이 다르다. 둘을 잇는 규칙을
 * 화면마다 다시 적으면 한쪽만 고쳐져, 수입에 '식비' 가 붙는 줄이 생긴다.
 */

import type { CategoryOut, TransactionType } from '../api';

export type LedgerKind = Extract<TransactionType, 'expense' | 'income'>;

export const LEDGER_KINDS: { value: LedgerKind; label: string }[] = [
  { value: 'expense', label: '지출' },
  { value: 'income', label: '수입' },
];

/** 그 종류로 고를 수 있는 분류. */
export function categoriesOfKind(kind: LedgerKind, categories: CategoryOut[]): CategoryOut[] {
  return categories.filter((category) => category.kind === kind);
}

/** 저장된 거래를 두 종류 중 하나로 읽는다. 환불은 지출을 깎는 것이라 지출로 본다. */
export function kindOf(type: TransactionType): LedgerKind {
  return type === 'income' ? 'income' : 'expense';
}

/** 그 종류에서 쓰는 말. 지출과 수입은 '어디에 썼나' 와 '어디서 들어왔나' 로 갈린다. */
export const KIND_WORDS: Record<LedgerKind, { where: string; wherePlaceholder: string }> = {
  expense: { where: '어디에서 썼나요?', wherePlaceholder: '안 적어도 괜찮아요' },
  income: { where: '어디에서 들어왔나요?', wherePlaceholder: '안 적어도 괜찮아요' },
};
