/**
 * 마지막으로 저장한 한 건을 기기에 남긴다.
 *
 * '한 번 더' 칩이 이걸 읽는다. 서버에 물어보면 왕복이 한 번 늘고,
 * 그 사이 시트가 이미 떠 있어 칩이 뒤늦게 나타난다.
 */

import type { KeyValueStore } from '../../shared/toss';

const KEY = 'last-record';

export interface LastRecord {
  amount: number;
  categoryId: string;
  categoryName: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 저장된 값이 깨져 있으면 null 로 돌려준다. 칩이 안 뜰 뿐 기록은 그대로 된다. */
export async function readLastRecord(store: KeyValueStore): Promise<LastRecord | null> {
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

  const { amount, categoryId, categoryName } = parsed;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  if (typeof categoryId !== 'string' || categoryId === '') return null;
  if (typeof categoryName !== 'string' || categoryName === '') return null;

  return { amount, categoryId, categoryName };
}

/** 저장에 실패해도 조용히 넘어간다. 편의 기능이라 기록 자체를 막지 않는다. */
export async function writeLastRecord(store: KeyValueStore, record: LastRecord): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(record));
  } catch {
    /* 저장소가 막힌 환경에서도 기록은 계속된다. */
  }
}
