/**
 * 홈이 어떤 얼굴로 뜰지 여기 한 곳에서 정한다.
 *
 * 조건을 카드마다 흩어 두면 "왜 이 카드가 떴지" 를 아무도 설명하지 못한다.
 * 판정에 쓰는 값은 전부 서버가 준 것이고, 화면이 날짜를 다시 세거나 금액을 더하지 않는다.
 */

import { parseDecimal, type BudgetOut } from '../../shared/api';

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
