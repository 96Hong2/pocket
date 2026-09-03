/**
 * 화면과 e2e 가 함께 쓰는 셀렉터 정본.
 *
 * 양쪽이 같은 상수를 import 하므로 사본이 생기지 않는다.
 * e2e 가 여기 없는 키를 쓰면 타입 검사에서 막힌다.
 *
 * 붙이는 기준은 하나다: 접근성 이름으로 유일하게 잡히지 않는 것에만 붙인다.
 * 버튼·링크·제목·다이얼로그는 getByRole 로 잡으므로 여기에 두지 않는다.
 * 이름 없이 숫자만 그리는 값과 게이지가 대상이다.
 */
export const TEST_IDS = {
  /** 홈의 남은 예산 금액 */
  remainingBudget: 'remaining-budget',
  /** 홈의 이번 달 쓴 돈 금액. 예산을 정하기 전 히어로가 이걸 그린다. */
  monthSpent: 'month-spent',
  /** 홈의 하루 가용액 금액 */
  dailyAllowance: 'daily-allowance',
  /** 홈의 예산 진행 게이지 */
  budgetGauge: 'budget-gauge',
  /** 홈의 광고 자리. 채울 광고가 없으면 높이가 0 이어야 한다. */
  adSlot: 'ad-slot',
} as const;

export type TestIdKey = keyof typeof TEST_IDS;
export type TestId = (typeof TEST_IDS)[TestIdKey];
