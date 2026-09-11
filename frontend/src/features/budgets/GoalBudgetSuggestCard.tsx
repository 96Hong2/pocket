import { useState } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import {
  ApiError,
  parseDecimalOr,
  useBudgetSuggestion,
  useSaveBudget,
  type MonthParams,
  type SuggestionAmountOut,
} from '../../shared/api';
import { useDebounced } from '../../shared/lib/useDebounced';
import { TEST_IDS } from '../../shared/testIds';
import { Amount, AmountField, Button, Card } from '../../shared/ui';

export interface GoalBudgetSuggestCardProps {
  /** 이 달의 예산을 제안한다. 부르는 쪽이 보고 있는 달을 그대로 넘긴다. */
  month: MonthParams;
}

/** 서버가 준 금액을 입력칸이 쓰는 숫자 문자열로. `"3000000"` 을 그대로 믿지 않는다. */
function digitsOf(value: string): string {
  return String(parseDecimalOr(value, 0));
}

/** 화면에서 고친 값이 있으면 그것, 아니면 서버가 어림한 값. */
function fieldDigits(edited: string | null, from: SuggestionAmountOut): string {
  return edited ?? digitsOf(from.amount);
}

/** 질의로 실어 보낼 값. 비운 칸은 0 으로 본다. 안 보낸 것(추정값 그대로)과 구분한다. */
function givenAmount(edited: string | null): number | undefined {
  if (edited == null) return undefined;
  return edited === '' ? 0 : Number(edited);
}

/** 한 글자 고칠 때마다 서버를 부르지 않는다. 잦아든 값만 질의로 나간다. */
const SUGGEST_DEBOUNCE_MS = 250;

/**
 * 목표에서 거꾸로 낸 생활비 제안.
 *
 * 예산이 없는 달에만, 그리고 제안할 근거가 있을 때만 뜬다. 목표가 없거나 기한이 없어
 * 한 달 몫을 나눌 수 없으면 서버가 `available: false` 로 답하고 여기는 아무것도 그리지 않는다.
 * **0원 제안을 만들어 보여주지 않는다.**
 *
 * 식(실수령 − 목표저축 − 고정비)을 그대로 보여주는 이유는 제안액이 어디서 나왔는지
 * 눌러 보기 전에 알 수 있어야 하기 때문이다. 실수령과 고정비는 그 자리에서 고칠 수 있고,
 * 고치면 **서버에 다시 물어** 제안액을 받는다. 화면이 빼기를 하지 않는다.
 *
 * 누르지 않으면 아무것도 저장되지 않는다. 조회는 예산을 만들지 않는다.
 */
export function GoalBudgetSuggestCard({ month }: GoalBudgetSuggestCardProps) {
  const [takeHome, setTakeHome] = useState<string | null>(null);
  const [fixedCosts, setFixedCosts] = useState<string | null>(null);

  // 입력칸은 위 상태를 그대로 그리고, 질의만 잦아든 값으로 나간다.
  const askedTakeHome = useDebounced(takeHome, SUGGEST_DEBOUNCE_MS);
  const askedFixedCosts = useDebounced(fixedCosts, SUGGEST_DEBOUNCE_MS);

  const suggestion = useBudgetSuggestion({
    ...month,
    takeHome: givenAmount(askedTakeHome),
    fixedCosts: givenAmount(askedFixedCosts),
  });
  const analytics = useAnalytics();
  const saveBudget = useSaveBudget(month);

  const data = suggestion.data ?? null;
  // 못 불러왔거나 제안할 근거가 없으면 자리를 비운다. 바로 아래 '예산 정하기' 가 남아 있어
  // 이 카드가 없어도 예산을 정하는 길은 그대로다.
  if (data == null || !data.available) return null;

  /*
    화면에 적힌 값과 손에 든 답이 어긋난 동안이다. 하나라도 걸리면 지금 보이는 제안액은
    고치기 전 것이라, 그대로 두면 새 실수령을 빼지 않은 옛 금액이 그대로 저장된다.
  */
  const stale =
    takeHome !== askedTakeHome ||
    fixedCosts !== askedFixedCosts ||
    suggestion.isPlaceholderData ||
    suggestion.isFetching;

  const saving = parseDecimalOr(data.goal_saving, 0);
  const suggested = parseDecimalOr(data.suggested, 0);
  const canSave = suggested > 0 && !stale && !saveBudget.isPending;
  const failure =
    saveBudget.error instanceof ApiError
      ? saveBudget.error.message
      : saveBudget.isError
        ? '예산을 정하지 못했어요.'
        : null;

  return (
    <section className="budget-suggest" aria-label="목표 기반 생활비 제안">
      <Card padding="md">
        <h3 className="budget-suggest__title">목표 기반 생활비 제안</h3>
        <p className="budget-suggest__lead">
          목표에 넣을 돈과 고정비를 먼저 떼고, 남는 만큼을 이번 달 생활비로 잡아 봤어요
        </p>

        <div className="budget-suggest__form">
          <SuggestField
            label="실수령"
            digits={fieldDigits(takeHome, data.take_home)}
            source={data.take_home}
            onChange={setTakeHome}
          />

          <div className="budget-suggest__line">
            <span className="budget-suggest__op" aria-hidden="true">
              −
            </span>
            <span className="budget-suggest__label">목표저축</span>
            <Amount
              data-testid={TEST_IDS.budgetSuggestSaving}
              value={saving}
              size={15}
              weight={700}
            />
          </div>

          <SuggestField
            label="고정비"
            operator
            digits={fieldDigits(fixedCosts, data.fixed_costs)}
            source={data.fixed_costs}
            onChange={setFixedCosts}
          />

          <div className="budget-suggest__line budget-suggest__line--total" aria-busy={stale}>
            <span className="budget-suggest__op" aria-hidden="true">
              =
            </span>
            <span className="budget-suggest__label">이번 달 생활비</span>
            {stale ? (
              <span className="budget-suggest__pending">계산 중</span>
            ) : (
              <Amount
                data-testid={TEST_IDS.budgetSuggestAmount}
                value={suggested}
                size={20}
                weight={800}
              />
            )}
          </div>
        </div>

        {/* 0원은 예산으로 저장할 수 없다. 눌러 보고 422 를 만나기 전에 이유를 알린다. */}
        {!stale && suggested === 0 ? (
          <p className="budget-suggest__note">
            지금 값으로는 생활비로 남는 돈이 없어요. 실수령이나 고정비를 고쳐 볼 수 있어요
          </p>
        ) : null}

        {failure ? (
          <p className="budget-suggest__note" role="alert">
            {failure}
          </p>
        ) : null}

        <Button
          variant="primarySmall"
          fullWidth
          disabled={!canSave}
          onClick={() =>
            saveBudget.mutate(
              { amount: suggested },
              {
                // 이 카드는 예산이 없는 달에만 뜬다. 여기서 정했으면 늘 첫 예산이다.
                onSuccess: () =>
                  analytics.log(EVENTS.budgetSaved, { first: true, from: 'goal_suggestion' }),
              },
            )
          }
        >
          이 금액으로 예산 정하기
        </Button>

        <p className="budget-suggest__foot">제안일 뿐이에요 · 목표는 언제든 바꿔도 괜찮아요</p>
      </Card>
    </section>
  );
}

interface SuggestFieldProps {
  label: string;
  digits: string;
  source: SuggestionAmountOut;
  /** 식에서 앞에 붙는 빼기 기호. 첫 줄(실수령)에는 없다. */
  operator?: boolean;
  onChange: (digits: string) => void;
}

/**
 * 식 안에서 고칠 수 있는 한 칸.
 *
 * 어림한 값이면 어디서 왔는지 한 줄로 밝힌다. 그냥 숫자만 두면 사용자가 자기가 적은
 * 값으로 읽는다.
 */
function SuggestField({ label, digits, source, operator = false, onChange }: SuggestFieldProps) {
  return (
    <div className="budget-suggest__row">
      <span className="budget-suggest__op" aria-hidden="true">
        {operator ? '−' : ''}
      </span>
      <div className="budget-suggest__field">
        <AmountField variant="compact" label={label} value={digits} onChange={onChange} />
        {source.source === 'estimated' ? (
          <p className="budget-suggest__basis">지난달 기준 · 추정값</p>
        ) : null}
      </div>
    </div>
  );
}
