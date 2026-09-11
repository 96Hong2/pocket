/**
 * 이 기기에서 앱을 언제 처음 열었고 마지막으로 언제 열었나.
 *
 * **왜 필요한가.** 리텐션과 이탈은 "안 돌아온 사람" 을 세야 하는데, 안 돌아온 사람은
 * 로그를 남기지 않는다. 그래서 남은 사람 쪽에 "처음 연 지 며칠째인가" 를 실어 둔다.
 * 그러면 「어제 처음 온 사람 수」와 「오늘 온 사람 중 처음 온 지 하루 된 사람 수」를
 * 나누는 것만으로 D+1 재방문율이 나온다. 코호트 질의 없이 단순 집계로 끝난다.
 *
 * **서버에 두지 않는다.** 이것은 돈에 관한 사실이 아니라 이 기기에서 앱을 연 이력이다.
 * 못 읽어도 첫 방문으로 세어질 뿐 기록·저장은 아무 영향이 없다.
 * `closingSeen.ts` · `homeAddSeen.ts` 와 같은 방식이다.
 */

import type { KeyValueStore } from '../toss';

const KEY = 'visit-log';

/** 하루를 밀리초로. 날짜 경계가 아니라 24시간 단위로 센다(시간대 문제를 만들지 않는다). */
const DAY_MS = 24 * 60 * 60 * 1000;

interface StoredVisit {
  /** 이 기기에서 처음 연 시각. */
  first: number;
  /** 직전에 연 시각. */
  last: number;
  /** 누적 실행 횟수. 이번 것을 포함한다. */
  count: number;
}

export interface VisitFacts {
  /** 이 기기에서 처음 여는가. */
  isFirstOpen: boolean;
  /** 처음 연 지 며칠째인가. 첫 실행이면 0. D+1·D+7 재방문율의 열쇠다. */
  daysSinceFirstOpen: number;
  /** 직전 실행 이후 며칠 지났나. 첫 실행이면 0. 얼마 만에 돌아왔는지 본다. */
  daysSinceLastOpen: number;
  /**
   * 몇 번째 실행인가. 값 그대로가 아니라 구간으로 남긴다.
   *
   * 그대로 남기면 실행 횟수가 곧 그 사람을 가리키는 값이 된다(217번 연 사람은 한 명이다).
   */
  openBucket: '1' | '2' | '3-5' | '6-10' | '11+';
}

const FIRST_OPEN: VisitFacts = {
  isFirstOpen: true,
  daysSinceFirstOpen: 0,
  daysSinceLastOpen: 0,
  openBucket: '1',
};

/**
 * 이번 실행을 세고 그 사실을 돌려준다.
 *
 * 읽기와 쓰기를 한 번에 하는 이유는 부르는 자리가 하나(앱을 연 순간)뿐이고,
 * 둘로 나누면 세는 것을 빠뜨릴 자리가 생기기 때문이다.
 * 저장소가 막혀 있으면 늘 첫 실행으로 답한다. 로그가 조금 틀리는 쪽이 앱이 멈추는 것보다 낫다.
 */
export async function recordVisit(store: KeyValueStore, now: number): Promise<VisitFacts> {
  const previous = await read(store);

  if (previous == null) {
    await write(store, { first: now, last: now, count: 1 });
    return FIRST_OPEN;
  }

  const count = previous.count + 1;
  await write(store, { first: previous.first, last: now, count });

  return {
    isFirstOpen: false,
    daysSinceFirstOpen: daysBetween(previous.first, now),
    daysSinceLastOpen: daysBetween(previous.last, now),
    openBucket: bucketOf(count),
  };
}

async function read(store: KeyValueStore): Promise<StoredVisit | null> {
  try {
    const raw = await store.get(KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStored(parsed) ? parsed : null;
  } catch {
    // 저장소가 막혔거나 값이 깨졌다. 첫 실행으로 본다.
    return null;
  }
}

async function write(store: KeyValueStore, value: StoredVisit): Promise<void> {
  try {
    await store.set(KEY, JSON.stringify(value));
  } catch {
    /* 못 남겨도 앱은 그대로 돈다. */
  }
}

function isStored(value: unknown): value is StoredVisit {
  if (typeof value !== 'object' || value == null) return false;
  const candidate = value as Partial<StoredVisit>;
  return (
    typeof candidate.first === 'number' &&
    typeof candidate.last === 'number' &&
    typeof candidate.count === 'number'
  );
}

/** 지난 날 수. 시계가 뒤로 간 기기가 있어 음수는 0 으로 눌러 둔다. */
function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

function bucketOf(count: number): VisitFacts['openBucket'] {
  if (count <= 1) return '1';
  if (count === 2) return '2';
  if (count <= 5) return '3-5';
  if (count <= 10) return '6-10';
  return '11+';
}
