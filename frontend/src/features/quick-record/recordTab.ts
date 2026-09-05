/**
 * 기록 방식과 기록 시트 탭 사이의 환산.
 *
 * 서버는 거래가 들어온 경로(`screenshot`)로 기억하고 시트는 탭 이름(`capture`)으로 연다.
 * 두 이름이 갈리는 자리를 여기 하나로 두어, 값이 늘면 이 파일만 고치면 되게 한다.
 */

import type { PreferencesOut } from '../../shared/api';

/** 시트를 여는 쪽이 어느 탭으로 열지 고를 수 있게 밖으로 낸다. */
export type RecordTab = 'keypad' | 'nl' | 'capture' | 'receipt';

/** 서버가 기억하는 기록 방식. 값 목록의 정본은 서버 스키마다. */
type RecordMethod = NonNullable<PreferencesOut['last_record_method']>;

/** 아직 한 번도 기록하지 않았을 때 여는 탭. 손으로 찍는 길이 제일 확실하다. */
export const DEFAULT_RECORD_TAB: RecordTab = 'keypad';

const TAB_BY_METHOD: Record<RecordMethod, RecordTab> = {
  keypad: 'keypad',
  nl: 'nl',
  screenshot: 'capture',
  receipt: 'receipt',
};

const METHOD_BY_TAB: Record<RecordTab, RecordMethod> = {
  keypad: 'keypad',
  nl: 'nl',
  capture: 'screenshot',
  receipt: 'receipt',
};

/**
 * 마지막에 쓴 방식으로 열 탭.
 *
 * 값이 아직 안 왔거나(불러오는 중·실패) 기록이 한 건도 없으면 키패드다.
 * 서버가 방식을 늘려도 시트는 열려야 하므로, 모르는 값도 키패드로 떨어뜨린다.
 */
export function resolveRecordTab(method: RecordMethod | null | undefined): RecordTab {
  const tab = method == null ? undefined : TAB_BY_METHOD[method];
  return tab ?? DEFAULT_RECORD_TAB;
}

/** 이 탭으로 저장하면 서버가 기억할 방식. */
export function recordMethodOf(tab: RecordTab): RecordMethod {
  return METHOD_BY_TAB[tab];
}
