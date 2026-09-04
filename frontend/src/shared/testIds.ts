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
  /** 홈의 남은 일수. 하루 가용액이 이 값으로 나눈 결과인지 되짚는다. */
  remainingDays: 'remaining-days',
  /** 홈의 광고 자리. 채울 광고가 없으면 높이가 0 이어야 한다. */
  adSlot: 'ad-slot',
  /** 기록 시트에서 지금 눌러 둔 금액 */
  recordAmount: 'record-amount',
  /** 금액 아래에서 다음에 무엇을 하면 되는지 알려 주는 한 줄 */
  recordHint: 'record-hint',
  /** 달력 화면 합계 띠의 이번 달 지출 */
  monthTotalExpense: 'month-total-expense',
  /** 합계 띠의 이번 달 수입 */
  monthTotalIncome: 'month-total-income',
  /** 합계 띠의 차액. 수입 - 지출이고 남은 예산과 다른 개념이다. */
  monthTotalDelta: 'month-total-delta',
  /** 달력에서 고른 날의 지출 합계 */
  dayTotal: 'day-total',
  /** 관리 탭 전체 예산 카드의 한도 금액 */
  budgetTotalAmount: 'budget-total-amount',
  /** 전체 예산 카드의 게이지 */
  budgetTotalGauge: 'budget-total-gauge',
  /** 전체 예산 카드의 사용액 */
  budgetUsed: 'budget-used',
  /** 전체 예산 카드의 남은 금액 */
  budgetLeft: 'budget-left',
  /** 전체 예산 카드 아래 한 줄. 진행률과 하루 가용액이 여기 붙는다. */
  budgetCaption: 'budget-caption',
  /** 카테고리 예산 한 줄. 어느 카테고리인지는 줄 안의 이름으로 가른다. */
  categoryBudgetRow: 'category-budget-row',
  /** 카테고리 예산 한 줄의 사용액 */
  categoryBudgetUsed: 'category-budget-used',
  /** 카테고리 예산 한 줄의 한도 */
  categoryBudgetCap: 'category-budget-cap',
  /** 카테고리 예산 합이 전체 예산보다 클 때 뜨는 안내 한 줄 */
  categoryBudgetSum: 'category-budget-sum',
  /** 줄글 검토 목록의 후보 한 줄 */
  nlCandidateRow: 'nl-candidate-row',
  /** 후보 한 줄의 금액 */
  nlCandidateAmount: 'nl-candidate-amount',
  /** 후보 한 줄의 날짜 */
  nlCandidateDate: 'nl-candidate-date',
  /** 관리 탭에서 기억한 분류 한 줄 */
  merchantRuleRow: 'merchant-rule-row',
  /** 저장 직후 피드백 한 줄 */
  feedbackHeadline: 'feedback-headline',
  /** 피드백 둘째 줄. 남은 예산 같은 숫자가 여기 붙는다. */
  feedbackDetail: 'feedback-detail',
} as const;

export type TestIdKey = keyof typeof TEST_IDS;
export type TestId = (typeof TEST_IDS)[TestIdKey];
