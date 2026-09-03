import { parseDecimal, parseDecimalOr, type BudgetOut } from '../../shared/api';
import { formatCurrency, formatPercent } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Gauge } from '../../shared/ui';

import type { HomeView } from './homeMode';

interface HomeHeroProps {
  view: HomeView;
  budget: BudgetOut;
}

/** `2026-09-01` → `9월` */
function monthLabel(periodStart: string): string {
  const month = Number(periodStart.slice(5, 7));
  return Number.isFinite(month) && month > 0 ? `${month}월` : '이번 달';
}

/**
 * 홈 맨 위 한 덩어리.
 *
 * 숫자는 전부 서버가 준 값을 그대로 그린다. 게이지 비율도 마찬가지다.
 * `남은 예산 + 이번 달 지출` 로 예산을 되짚으면 예산에서 제외한 거래 때문에 틀린다.
 */
export function HomeHero({ view, budget }: HomeHeroProps) {
  const state = budget.budget;
  const label = `${monthLabel(state.period_start)} · ${view.hasBudget ? '남은 예산' : '이번 달 쓴 돈'}`;
  const progress = parseDecimal(state.spend_progress);
  const daily = parseDecimal(state.daily_allowance);

  return (
    <section className="home-hero" aria-label={label}>
      <span className="home-hero__label">{label}</span>

      <div className="home-hero__row">
        {view.hasBudget ? (
          <>
            <Amount
              data-testid={TEST_IDS.remainingBudget}
              className="home-hero__value"
              value={parseDecimalOr(state.remaining_budget, 0)}
              size={34}
              weight={800}
            />
            <span className="home-hero__total" data-numeric="">
              / {formatCurrency(parseDecimalOr(state.amount, 0))}
            </span>
          </>
        ) : (
          <Amount
            data-testid={TEST_IDS.monthSpent}
            className="home-hero__value"
            value={parseDecimalOr(budget.month_expense, 0)}
            size={34}
            weight={800}
          />
        )}
      </div>

      {view.showFirstLead ? (
        <p className="home-hero__lead">
          가계부 쓰러 오지 마세요.
          <br />
          10초만 쓰고 닫아도 돼요.
        </p>
      ) : null}

      {view.hasBudget && progress != null ? (
        <div className="home-hero__budget">
          <Gauge
            data-testid={TEST_IDS.budgetGauge}
            ratio={progress}
            over={state.is_over_budget}
            label="이번 달 예산 사용률"
          />
          <div className="home-hero__meta">
            <span
              className={
                state.is_over_budget
                  ? 'home-hero__percent home-hero__percent--over'
                  : 'home-hero__percent'
              }
              data-numeric=""
            >
              {formatPercent(progress)} 썼어요
            </span>
            <span className="home-hero__daily" data-numeric="">
              남은 {state.remaining_days}일 · 하루{' '}
              <Amount
                data-testid={TEST_IDS.dailyAllowance}
                value={daily ?? 0}
                size={13}
                weight={700}
              />
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
