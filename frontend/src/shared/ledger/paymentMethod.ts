/**
 * 지출을 무엇으로 냈나.
 *
 * 값의 정본은 서버(`app/domain/aggregation.py`)이고 여기는 그 값에 붙일 한국어다.
 * **안 고른 것은 값이 아니라 null 이다.** '모름' 칸을 만들면 예전에 적어 둔 기록과
 * 일부러 안 고른 기록이 한 칸에 섞여 구분되지 않는다.
 */

import type { PaymentMethod } from '../api';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'credit', label: '신용카드' },
  { value: 'debit', label: '체크카드' },
  { value: 'cash', label: '현금' },
];

/** 리포트가 쓰는 이름까지 포함한다. `none` 은 안 고르고 적은 줄이다. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  credit: '신용카드',
  debit: '체크카드',
  cash: '현금',
  none: '안 고름',
};

export function paymentMethodLabel(key: string): string {
  return PAYMENT_METHOD_LABELS[key] ?? key;
}
