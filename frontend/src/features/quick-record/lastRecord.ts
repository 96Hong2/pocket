/**
 * 지난번에 무엇으로 냈는지를 기기에 남긴다.
 *
 * **적는 화면에서 결제 수단을 묻지 않기 위한 값이다.** 칸을 하나 세우는 대신 지난번 값으로
 * 조용히 채워 저장하고, 저장 뒤 화면에서 무엇으로 적혔는지 보여 준다. 대부분 한 장의 카드를
 * 쓰므로 이 기본값이 거의 맞다. 매번 고르게 하면 아무도 안 골라 통계가 통째로 빈다.
 *
 * 서버 설정이 아니라 기기에 두는 이유는 시트가 뜨는 그 순간에 값이 있어야 하기 때문이다.
 * 왕복을 한 번 더 하면 저장한 뒤에야 값이 도착한다.
 */

import type { KeyValueStore } from '../../shared/toss';

import type { PaymentMethod } from '../../shared/api';

const KEY = 'last-record';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMethod(value: unknown): value is PaymentMethod {
  return value === 'credit' || value === 'debit' || value === 'cash';
}

/**
 * 지난번에 고른 결제 수단. 없거나 값이 깨져 있으면 null 이다.
 *
 * 키는 '한 번 더' 칩이 쓰던 것과 같다. 그 칩은 없앴지만 남아 있는 값 안에
 * `paymentMethod` 가 들어 있어, 키를 바꾸면 이미 쓰던 사람의 값이 한 번 사라진다.
 */
export async function readLastMethod(store: KeyValueStore): Promise<PaymentMethod | null> {
  let raw: string | null = null;
  try {
    raw = await store.get(KEY);
  } catch {
    return null;
  }
  if (raw == null || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  return isMethod(parsed.paymentMethod) ? parsed.paymentMethod : null;
}

/** 저장에 실패해도 조용히 넘어간다. 편의 기능이라 기록 자체를 막지 않는다. */
export async function writeLastMethod(
  store: KeyValueStore,
  paymentMethod: PaymentMethod | null,
): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify({ paymentMethod }));
  } catch {
    /* 저장소가 막힌 환경에서도 기록은 계속된다. */
  }
}
