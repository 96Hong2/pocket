import { parseDecimal, parseDecimalOr, type BudgetOut } from '../../shared/api';
import { formatCurrency, formatPercent, formatSignedCurrency } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, Gauge, RetryButton } from '../../shared/ui';

import type { HeroLayout, HomeView } from './homeMode';

interface HomeHeroProps {
  view: HomeView;
  budget: BudgetOut;
  /** 무엇을 크게 보여줄지. 설정과 예산 유무를 합쳐 `resolveHeroLayout` 이 정한 값이다. */
  layout: HeroLayout;
  /** 표시 설정 조회가 실패했나. 기본 화면으로 그리되 그 사실을 숨기지 않는다. */
  preferencesFailed?: boolean;
  onRetryPreferences?: () => void;
}

const LAYOUT_LABEL: Record<HeroLayout, string> = {
  remainingBudget: '남은 예산',
  monthSpent: '이번 달 쓴 돈',
  incomeAndSpent: '이번 달 차액',
  incomeAndBudget: '번 돈과 남은 예산',
};

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
export function HomeHero({
  view,
  budget,
  layout,
  preferencesFailed = false,
  onRetryPreferences,
}: HomeHeroProps) {
  const state = budget.budget;
  const label = `${monthLabel(state.period_start)} · ${LAYOUT_LABEL[layout]}`;
  const progress = parseDecimal(state.spend_progress);
  const daily = parseDecimal(state.daily_allowance);

  const withBudget = layout === 'remainingBudget' || layout === 'incomeAndBudget';
  const withIncome = layout === 'incomeAndSpent' || layout === 'incomeAndBudget';

  return (
    <section className="home-hero" aria-label={label}>
      <span className="home-hero__label">{label}</span>

      <div className="home-hero__row">
        <HeroValue layout={layout} budget={budget} />
      </div>

      {withIncome ? (
        <div className="home-hero__pair">
          <div className="home-hero__pair-item">
            <span className="home-hero__pair-label">번 돈</span>
            <Amount
              data-testid={TEST_IDS.heroIncome}
              tone="income"
              value={parseDecimalOr(budget.month_income, 0)}
            />
          </div>

          {layout === 'incomeAndSpent' ? (
            <div className="home-hero__pair-item">
              <span className="home-hero__pair-label">쓴 돈</span>
              <Amount
                data-testid={TEST_IDS.monthSpent}
                value={parseDecimalOr(budget.month_expense, 0)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {view.showFirstLead ? (
        <p className="home-hero__lead">
          가계부 쓰러 오지 마세요.
          <br />
          10초만 쓰고 닫아도 돼요.
        </p>
      ) : null}

      {withBudget && progress != null ? (
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
              남은 <span data-testid={TEST_IDS.remainingDays}>{state.remaining_days}</span>일 · 하루{' '}
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

      {/*
        고른 설정이 아니라 기본 화면을 그리는 중이라면 그 사실을 말한다.
        말없이 다른 화면을 그리면 자기가 고른 설정이 무시된 것으로 보인다.
      */}
      {preferencesFailed ? (
        <div className="home-hero__notice">
          <span className="home-hero__notice-text">
            표시 설정을 불러오지 못해 기본 화면으로 보여주고 있어요.
          </span>
          {onRetryPreferences ? <RetryButton variant="ghost" onRetry={onRetryPreferences} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** 큰 숫자 한 자리. 레이아웃마다 그리는 값과 셀렉터가 다르다. */
function HeroValue({ layout, budget }: { layout: HeroLayout; budget: BudgetOut }) {
  const state = budget.budget;

  if (layout === 'monthSpent') {
    return (
      <Amount
        data-testid={TEST_IDS.monthSpent}
        className="home-hero__value"
        value={parseDecimalOr(budget.month_expense, 0)}
        size={34}
        weight={800}
      />
    );
  }

  if (layout === 'incomeAndSpent') {
    // 차액은 음수가 될 수 있어 부호를 붙여 적는다. 달력 합계 띠와 같은 표기다.
    return (
      <span
        className="home-hero__value home-hero__value--delta"
        data-testid={TEST_IDS.heroDelta}
        data-numeric=""
      >
        {formatSignedCurrency(parseDecimalOr(budget.monthly_delta, 0))}
      </span>
    );
  }

  return (
    <>
      <Amount
        data-testid={TEST_IDS.remainingBudget}
        className="home-hero__value"
        value={parseDecimalOr(state.remaining_budget, 0)}
        size={34}
        weight={800}
      />
      {layout === 'remainingBudget' ? (
        <span className="home-hero__total" data-numeric="">
          / {formatCurrency(parseDecimalOr(state.amount, 0))}
        </span>
      ) : null}
    </>
  );
}
