/**
 * 「내 자산 분석」 광고 잠금. 광고를 지나 본 분석의 지문을 범위마다 기기에 둔다.
 *
 * 서버에 두지 않는다. 지문은 분석 숫자를 바꾸는 값만 먹어서, 숫자가 그대로면 다음 달에도
 * 같은 값이 온다. 못 읽으면 광고를 한 번 더 보자고 할 뿐이다.
 */

import type { AssetAnalysisScope } from '../../app/router/routes';
import type { KeyValueStore } from '../../shared/toss';

export type AnalysisLock = Partial<Record<AssetAnalysisScope, string>>;

/**
 * - open     본 지문과 지금 지문이 같다. 광고 없이 연다
 * - locked   본 적이 없다
 * - stale    본 뒤에 숫자가 바뀌었다
 * - unknown  저장소나 지문을 아직 모른다
 */
export type AnalysisLockState = 'open' | 'locked' | 'stale' | 'unknown';

export const ANALYSIS_LOCK_KEY = 'asset-analysis-lock';

const SCOPES: readonly AssetAnalysisScope[] = ['all', 'stock', 'cash'];

/** 저장소 값을 읽는다. 모양이 틀리면 빈 잠금으로 본다. */
export function parseAnalysisLock(raw: string | null): AnalysisLock {
  if (raw == null || raw === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {};
  }
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return {};
  const lock: AnalysisLock = {};
  for (const scope of SCOPES) {
    const seen = (value as Record<string, unknown>)[scope];
    if (typeof seen === 'string' && seen !== '') lock[scope] = seen;
  }
  return lock;
}

export function analysisLockState(
  lock: AnalysisLock | null | undefined,
  scope: AssetAnalysisScope,
  fingerprint: string | null | undefined,
): AnalysisLockState {
  if (lock == null || fingerprint == null || fingerprint === '') return 'unknown';
  const seen = lock[scope];
  if (seen == null) return 'locked';
  return seen === fingerprint ? 'open' : 'stale';
}

export function withFingerprint(
  lock: AnalysisLock,
  scope: AssetAnalysisScope,
  fingerprint: string,
): AnalysisLock {
  return { ...lock, [scope]: fingerprint };
}

export async function readAnalysisLock(store: KeyValueStore): Promise<AnalysisLock> {
  try {
    return parseAnalysisLock(await store.get(ANALYSIS_LOCK_KEY));
  } catch {
    return {};
  }
}

export async function writeAnalysisLock(store: KeyValueStore, lock: AnalysisLock): Promise<void> {
  try {
    await store.set(ANALYSIS_LOCK_KEY, JSON.stringify(lock));
  } catch {
    /* 못 남겨도 지금 화면은 열린다. 다음에 광고를 한 번 더 볼 뿐이다. */
  }
}
