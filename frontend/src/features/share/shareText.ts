/**
 * 친구에게 보내는 한 줄을 만든다.
 *
 * 링크만 보내면 받는 사람은 무엇인지 모르고 누른다. 이 한 줄이 링크보다 먼저 읽힌다.
 *
 * **자랑은 하되 액수를 앞세우지 않는다.** 가계부는 남에게 보이기 싫은 숫자를 다루는 앱이라,
 * 보내는 사람이 문구를 보고 「이건 못 보내겠다」 고 느끼면 그 자리는 죽은 자리가 된다.
 * 그래서 예산 금액과 한 달에 쓴 돈은 **싣지 않는다.** 실은 것은 스스로 정한 목표와,
 * 그 목표에 닿았다는 사실까지다.
 *
 * 문장은 여기서만 만든다. 화면마다 조금씩 다르게 적으면 같은 앱이 자리마다 다른 말을 한다.
 */

/** 무엇을 공유하는가. 로그의 갈래 이름도 이 값을 그대로 쓴다. */
export type ShareKind = 'app' | 'goal' | 'goal_done' | 'budget' | 'closing' | 'streak';

/** 문구 끝에 늘 붙는 꼬리. 받는 사람이 무슨 앱인지 알아야 링크를 누른다. */
const TAIL = '10초 가계부';

/**
 * 목표 이름을 문장에 끼울 수 있게 다듬는다.
 *
 * 이름은 사용자가 적은 것이라 줄바꿈도 따옴표도 들어올 수 있다. 줄바꿈이 그대로 나가면
 * 링크가 둘째 줄이 아니라 셋째 줄로 밀려 미리보기에서 잘린다.
 * 너무 길면 뒤를 줄인다. 공유 시트 미리보기가 두 줄 남짓만 보여 준다.
 */
const TITLE_MAX = 24;

export function trimTitle(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  return flat.length > TITLE_MAX ? `${flat.slice(0, TITLE_MAX)}…` : flat;
}

/**
 * 진행 중인 목표.
 *
 * 모은 금액이 아니라 **진행률**을 적는다. 액수는 그 사람의 형편이 드러나는 값이고,
 * 퍼센트는 「얼마나 왔나」 만 말한다. 보내는 데 부담이 없어야 보내진다.
 */
export function goalLine(title: string, percent: number): string {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  return `「${trimTitle(title)}」 모으는 중이에요 · ${safe}%까지 왔어요 · ${TAIL}`;
}

/** 다 모은 목표. 이 앱에서 사람이 끝까지 해낸 유일한 일이라 축하를 앞에 둔다. */
export function goalDoneLine(title: string): string {
  return `「${trimTitle(title)}」 다 모았어요! · ${TAIL}`;
}

/**
 * 이번 달 예산을 정했다.
 *
 * 금액을 뺀다. 한 달 예산은 수입을 거의 그대로 드러내는 숫자다.
 * `month` 는 `2026-09` 다.
 */
export function budgetLine(month: string): string {
  return `${monthNumber(month)}월 예산을 정했어요 · 이번 달은 계획대로 · ${TAIL}`;
}

/**
 * 지난달 결산.
 *
 * 예산 안에서 마친 달이면 그것부터 말한다. 결산에서 가장 자랑할 만한 사실이고,
 * 없는데 지어내면 안 되므로 부르는 쪽이 사실 여부를 넘긴다.
 * 남긴 금액은 적지 않는다. 대신 「지켰다」 는 사실만 적는다.
 */
export function closingLine(month: string, withinBudget: boolean): string {
  const label = `${monthNumber(month)}월`;
  return withinBudget
    ? `${label}은 예산 안에서 마쳤어요 · ${TAIL}`
    : `${label} 가계부를 정리했어요 · ${TAIL}`;
}

/**
 * 이어서 적은 날.
 *
 * 금액이 하나도 없다. 얼마를 썼는지가 아니라 **꾸준히 적었다는 것**이 자랑이다.
 * `milestone` 은 7의 배수다(7 → 일주일, 14 → 2주).
 */
export function streakLine(milestone: number): string {
  const span = milestone === 7 ? '일주일' : `${milestone / 7}주`;
  return `가계부를 ${span} 내내 적었어요 · ${TAIL}`;
}

/** 앱 자체를 권한다. 숫자가 하나도 안 들어가는 유일한 문구다. */
export function appLine(): string {
  return `가계부 쓰기 싫은 사람의 가계부. 10초면 한 건 끝나요 · ${TAIL}`;
}

/** `2026-08` → `8` */
function monthNumber(month: string): number {
  return Number(month.slice(5, 7));
}
