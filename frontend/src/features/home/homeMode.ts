/**
 * 홈이 어떤 얼굴로 뜰지 여기 한 곳에서 정한다.
 *
 * 조건을 카드마다 흩어 두면 "왜 이 카드가 떴지" 를 아무도 설명하지 못한다.
 * 판정에 쓰는 값은 전부 서버가 준 것이고, 화면이 날짜를 다시 세거나 금액을 더하지 않는다.
 */

import { parseDecimal, type BudgetOut, type HomeHero } from '../../shared/api';

/**
 * - firstUse  예산이 없다. '이번 달 쓴 돈' 만 보여주고 예산을 묻지 않는다.
 * - default   예산이 있다. 남은 예산·게이지·하루 가용액·남은 일수를 보여준다.
 * - recovery  며칠 비었다. 벌주지 않고 다시 이어 쓰게 돕는다.
 */
export type HomeMode = 'firstUse' | 'default' | 'recovery';

/**
 * 며칠 비면 복귀 카드를 띄울지.
 *
 * 하루 이틀 건너뛰는 것은 흔한 리듬이라 그때 카드를 띄우면 잔소리가 된다.
 * 사흘째부터 사용자가 스스로 "밀렸다" 고 느끼기 시작하므로 그 지점에서 돕는다.
 */
export const RECOVERY_AFTER_DAYS = 3;

export interface HomeViewInput {
  hasAnyTransaction: boolean;
  /** 마지막 기록 이후 며칠. 오늘 기록했으면 0, 기록이 없으면 null. */
  daysSinceLastTransaction: number | null;
  /** 예산 금액 문자열. 정하지 않았으면 null. */
  budgetAmount: string | null;
}

export interface HomeView {
  mode: HomeMode;
  /** 히어로에 남은 예산을 그릴 수 있나. 예산을 정했을 때만 true. */
  hasBudget: boolean;
  /** 예산 제안 카드를 띄울까. 기록이 하나라도 있고 예산이 없을 때만이라 첫 진입에는 뜨지 않는다. */
  showBudgetSuggestion: boolean;
  /** 첫 기록을 아직 안 한 사람에게만 부담을 더는 한 줄을 보여준다. */
  showFirstLead: boolean;
}

export function resolveHomeView(input: HomeViewInput): HomeView {
  const amount = parseDecimal(input.budgetAmount);
  const hasBudget = amount != null && amount > 0;

  const isAway =
    input.hasAnyTransaction &&
    input.daysSinceLastTransaction != null &&
    input.daysSinceLastTransaction >= RECOVERY_AFTER_DAYS;

  let mode: HomeMode = 'firstUse';
  if (isAway) mode = 'recovery';
  else if (hasBudget) mode = 'default';

  return {
    mode,
    hasBudget,
    showBudgetSuggestion: input.hasAnyTransaction && !hasBudget,
    showFirstLead: !input.hasAnyTransaction,
  };
}

/** 예산 조회 응답에서 판정에 필요한 것만 뽑는다. */
export function toHomeViewInput(budget: BudgetOut): HomeViewInput {
  return {
    hasAnyTransaction: budget.has_any_transaction,
    daysSinceLastTransaction: budget.days_since_last_transaction,
    budgetAmount: budget.budget.amount ?? null,
  };
}

/**
 * 히어로가 무엇을 크게 보여줄지.
 *
 * - remainingBudget  남은 예산과 예산 총액. 게이지와 하루 가용액이 함께 붙는다.
 * - monthSpent       이번 달 쓴 돈 하나. 예산을 정하기 전 화면이다.
 * - incomeAndSpent   이번 달 차액. 번 돈과 쓴 돈을 아래에 나란히 둔다.
 * - incomeAndBudget  남은 예산에 번 돈을 곁들인다.
 */
export type HeroLayout = 'remainingBudget' | 'monthSpent' | 'incomeAndSpent' | 'incomeAndBudget';

/**
 * 설정과 예산 유무로 히어로 모양을 정한다.
 *
 * 예산이 없을 때 무엇으로 떨어질지를 여기 한 곳에서만 정한다. 화면이 다시 판단하면
 * 같은 설정인데 자리마다 다른 값이 뜬다.
 */
export function resolveHeroLayout(hero: HomeHero | undefined, hasBudget: boolean): HeroLayout {
  switch (hero) {
    case 'income_expense':
      return 'incomeAndSpent';
    case 'income_and_budget':
      return hasBudget ? 'incomeAndBudget' : 'incomeAndSpent';
    default:
      // 아직 못 받은 경우도 여기로 온다. 설정 행이 없는 사람에게 서버가 주는 값이 이것이라
      // 임의 기본값을 고르는 것이 아니다.
      return hasBudget ? 'remainingBudget' : 'monthSpent';
  }
}
