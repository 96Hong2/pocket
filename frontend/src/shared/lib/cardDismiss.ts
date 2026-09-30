/**
 * 홈 카드를 닫아 둔 사실을 기기에 남긴다.
 *
 * 서버에 두지 않는 이유는 돈에 관한 사실이 아니기 때문이다. 못 읽어도 카드가 한 번 더
 * 뜰 뿐 아무것도 틀어지지 않는다. `closingSeen.ts` 와 같은 방식이다.
 *
 * **닫기는 영영 안 보겠다는 뜻이 아니다.** 상황이 달라지면 다시 뜬다. 무엇이 「달라짐」인지는
 * 카드마다 다르므로 표(mark)를 함께 저장하고, 그 표가 바뀌면 닫은 것을 잊는다.
 * 예산 카드는 표가 없어 한 번 닫으면 예산을 정할 때까지 안 뜨고, 복귀 카드는 마지막으로
 * 적은 날이 표라서 다시 적고 또 며칠 비면 새로 뜬다.
 */

import type { KeyValueStore } from '../toss';

/**
 * 닫을 수 있는 카드. 키가 겹치지 않게 여기 한 곳에서 이름을 정한다.
 *
 * `remind`·`remind-again` 은 이제 새로 적지 않는다. 저녁 알림은 닫을수록 뜸해지는 간격으로
 * 바뀌었고(`features/notifications/remindCadence.ts`), 두 키는 그리로 옮길 때 한 번 읽힌다.
 *
 * `-again` 이 붙은 둘은 **두 번째 기회**다. 첫 기록 때 닫은 사람에게 다섯 번째 기록에서
 * 한 번만 더 보여 준다. 표(mark)로 가르지 않고 키를 따로 둔 이유는, 표는 같은지 다른지만
 * 보기 때문에 「1회차에서 닫았다」 와 「5회차에서 닫았다」 를 함께 기억하지 못해서다.
 */
export type DismissibleCard =
  | 'recovery'
  | 'budget-suggest'
  | 'share-app'
  | 'home-add'
  | 'home-add-again'
  | 'remind'
  | 'remind-again'
  | 'rating-ask'
  | 'books-intro';

function keyFor(card: DismissibleCard): string {
  return `card-dismissed-${card}`;
}

/**
 * 지금 이 카드를 감출까.
 *
 * `mark` 는 「이 상황」을 가리키는 값이다. 닫을 때 적어 둔 것과 다르면 상황이 바뀐 것이라
 * 다시 보여 준다. 상황을 가르지 않는 카드는 빈 문자열을 넘긴다.
 *
 * 저장소가 막혀 있으면 감추지 않는다. 카드가 한 번 더 뜨는 쪽이, 닫을 길 없이 사라지는
 * 쪽보다 덜 나쁘다.
 */
export async function readCardDismissed(
  store: KeyValueStore,
  card: DismissibleCard,
  mark: string,
): Promise<boolean> {
  try {
    return (await store.get(keyFor(card))) === mark;
  } catch {
    return false;
  }
}

/** 저장에 실패해도 조용히 넘어간다. 다음에 한 번 더 뜰 뿐이다. */
export async function markCardDismissed(
  store: KeyValueStore,
  card: DismissibleCard,
  mark: string,
): Promise<void> {
  try {
    await store.set(keyFor(card), mark);
  } catch {
    /* 저장소가 막힌 환경에서도 화면은 그대로 돈다. */
  }
}

const QUIET_KEY = 'card-quiet-day';

/**
 * 권유 카드를 닫은 날. 그날은 다른 권유를 새로 세우지 않는다.
 *
 * 카드는 한 번에 하나만 서는데, 하나를 닫으면 순서상 다음 카드가 그 자리에 바로 올라왔다.
 * 닫는 손을 「그만 좀」 으로 읽지 않고 「다음 것」 으로 읽은 셈이다. 다음 권유는 다음 날로 미룬다.
 */
export async function readQuietDay(store: KeyValueStore): Promise<string | null> {
  try {
    return await store.get(QUIET_KEY);
  } catch {
    return null;
  }
}

export async function markQuietDay(store: KeyValueStore, day: string): Promise<void> {
  try {
    await store.set(QUIET_KEY, day);
  } catch {
    /* 못 적으면 다음 카드가 오늘 한 번 더 설 뿐이다. */
  }
}
