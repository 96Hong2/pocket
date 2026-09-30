/**
 * 저녁 알림 카드를 언제 다시 보여 줄지.
 *
 * 알림은 이 앱이 사람을 다시 데려오는 유일한 장치라, 안 켠 사람에게 계속 묻는다.
 * 대신 **닫을수록 뜸해진다.** 처음 닫은 것은 「지금은 아니다」 에 가깝고, 네 번째 닫은 것은
 * 거의 대답이다. 같은 간격으로 계속 물으면 그 사람에게 이 카드는 광고가 된다.
 *
 * 날짜만 보지 않고 **그 사이에 적었는지도 본다.** 안 쓰는 사람에게 알림을 권하면
 * 「이 앱이 나를 부르려 한다」 로만 읽힌다. 쓰고 있는 사람에게는 도움으로 읽힌다.
 *
 * 기기에만 남긴다(`shared/lib/cardDismiss.ts` 와 같은 이유). 못 읽으면 한 번 더 뜰 뿐이다.
 */

import { daysBetweenDays } from '../../shared/lib/bookFirstDay';
import { readCardDismissed } from '../../shared/lib/cardDismiss';
import type { KeyValueStore } from '../../shared/toss';

/** 닫은 뒤 다시 묻기까지 며칠. n 번째로 닫았으면 n 번째 값이고, 넘치면 마지막 값을 계속 쓴다. */
export const REMIND_GAP_DAYS = [3, 7, 14, 30] as const;

/** 닫은 뒤 이만큼은 새로 적어야 다시 묻는다. */
export const REMIND_RECORDS_BETWEEN = 3;

export interface RemindNudgeState {
  /** 지금까지 몇 번 닫았나. 1 부터다. */
  closes: number;
  /** 마지막으로 닫은 날(`YYYY-MM-DD`). */
  closedOn: string;
  /**
   * 닫을 때까지 적은 건수. `null` 이면 기록 수를 안 보고 날짜만 본다.
   * 알림 설정 화면에서 끈 사람이 그렇다. 그 화면은 건수를 모른다.
   */
  recordsAtClose: number | null;
}

/** 다시 물을 때가 됐나. 한 번도 안 닫았으면 늘 참이다. */
export function isRemindDue(
  state: RemindNudgeState | null,
  today: string,
  records: number,
): boolean {
  if (state == null) return true;
  const gap = REMIND_GAP_DAYS[Math.min(state.closes, REMIND_GAP_DAYS.length) - 1];
  if (daysBetweenDays(state.closedOn, today) < gap) return false;
  return state.recordsAtClose == null || records - state.recordsAtClose >= REMIND_RECORDS_BETWEEN;
}

/**
 * 한 번 닫은 뒤의 상태.
 *
 * `longest` 는 알림 설정에서 직접 끈 사람이다. 스스로 정한 것이라 가장 긴 간격부터 센다.
 */
export function afterRemindClose(
  prev: RemindNudgeState | null,
  today: string,
  records: number | null,
  longest = false,
): RemindNudgeState {
  const closes = (prev?.closes ?? 0) + 1;
  return {
    closes: longest ? Math.max(closes, REMIND_GAP_DAYS.length) : closes,
    closedOn: today,
    recordsAtClose: records,
  };
}

/** 저장된 글을 읽는다. 모양이 틀리면 없는 것으로 본다(한 번 더 뜰 뿐이다). */
export function parseRemindNudge(raw: string | null): RemindNudgeState | null {
  if (raw == null || raw === '') return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value == null) return null;
    const { closes, closedOn, recordsAtClose } = value as Record<string, unknown>;
    if (typeof closes !== 'number' || closes < 1 || typeof closedOn !== 'string') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closedOn)) return null;
    if (recordsAtClose !== null && typeof recordsAtClose !== 'number') return null;
    return { closes, closedOn, recordsAtClose };
  } catch {
    return null;
  }
}

const KEY = 'remind-nudge';

/**
 * 저장된 상태를 읽는다.
 *
 * 새 키가 없으면 예전 두 표(`remind`, `remind-again`)를 본다. 예전에는 두 번까지만 물었고,
 * 거기서 닫은 사람을 처음 닫은 사람으로 치면 업데이트 날 바로 또 묻게 된다.
 * 닫은 횟수는 옮기되 **닫은 날은 오늘로 친다.** 언제 닫았는지는 예전 표에 없다.
 * 옮긴 값은 바로 적어 둔다. 안 적으면 열 때마다 오늘이 닫은 날이 되어 영영 안 뜬다.
 */
export async function readRemindNudge(
  store: KeyValueStore,
  today: string,
  records: number,
): Promise<RemindNudgeState | null> {
  try {
    const saved = parseRemindNudge(await store.get(KEY));
    if (saved != null) return saved;
    const legacy =
      Number(await readCardDismissed(store, 'remind', '')) +
      Number(await readCardDismissed(store, 'remind-again', ''));
    if (legacy === 0) return null;
    const moved: RemindNudgeState = { closes: legacy, closedOn: today, recordsAtClose: records };
    await store.set(KEY, JSON.stringify(moved));
    return moved;
  } catch {
    return null;
  }
}

/** 한 번 닫은 것을 적는다. 적은 뒤의 상태를 돌려준다. 저장이 막혀도 화면은 그대로 돈다. */
export async function markRemindClosed(
  store: KeyValueStore,
  today: string,
  records: number | null,
  longest = false,
): Promise<RemindNudgeState> {
  let prev: RemindNudgeState | null = null;
  try {
    prev = parseRemindNudge(await store.get(KEY));
  } catch {
    /* 못 읽으면 처음 닫은 것으로 적는다. */
  }
  const next = afterRemindClose(prev, today, records, longest);
  try {
    await store.set(KEY, JSON.stringify(next));
  } catch {
    /* 다음에 한 번 더 뜰 뿐이다. */
  }
  return next;
}
