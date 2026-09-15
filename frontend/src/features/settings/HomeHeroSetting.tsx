import { useId, useMemo, useState } from 'react';

import {
  ApiError,
  parseDecimal,
  useBudget,
  usePreferences,
  useSavePreferences,
  type HomeHero,
} from '../../shared/api';
import { toLedgerDate } from '../../shared/lib/format';
import { TEST_IDS } from '../../shared/testIds';
import { Button, RetryButton, SegmentedControl, type SegmentedOption } from '../../shared/ui';

import { BudgetAmountSheet } from '../budgets';
import { resolveHeroLayout, type HeroLayout } from '../home/homeMode';

const OPTIONS: SegmentedOption<HomeHero>[] = [
  { value: 'remaining_budget', label: '남은 예산' },
  { value: 'income_expense', label: '수입·지출' },
  { value: 'income_and_budget', label: '수입·예산' },
];

/**
 * 고른 것이 홈을 어떻게 바꾸는지. 라벨 세 개만 보고는 결과가 그려지지 않는다.
 *
 * **예산을 정했는지까지 봐야 한다.** 예산이 없으면 홈은 예산이 걸린 갈래를 쓰지 못하고
 * `resolveHeroLayout` 이 다른 것으로 떨어뜨린다. 여기서 그 폴백을 무시하면, 고른 즉시
 * 화면과 다른 말을 하는 안내가 된다. 예산 미설정은 예외가 아니라 새로 온 사람의 기본 상태다.
 */
const PREVIEW: Record<HeroLayout, string> = {
  remainingBudget: '홈 맨 위에 남은 예산이 먼저 보여요.',
  monthSpent: '아직 예산을 안 정해서, 홈 맨 위에 이번 달 쓴 돈이 보여요.',
  incomeAndSpent: '홈 맨 위에 이번 달 차액이 먼저 보여요.',
  incomeAndBudget: '홈 맨 위에 번 돈과 남은 예산이 함께 보여요.',
};

/**
 * 고른 것이 예산을 필요로 하는가.
 *
 * 이 둘을 고른 사람은 남은 예산을 보고 싶다고 말한 것이다. 그런데 예산이 없으면 홈은
 * 다른 것으로 떨어뜨린다. 그 사람에게 「관리 탭에 가서 예산을 정하세요」 라고 적어 두면
 * 대부분 안 간다. 여기서 바로 정하게 한다.
 */
function wantsBudget(hero: HomeHero): boolean {
  return hero === 'remaining_budget' || hero === 'income_and_budget';
}

/**
 * 홈 맨 위에 무엇을 크게 보여줄지 고르는 자리.
 *
 * 달마다 다른 값이 아니라 계정 설정이다.
 * 아직 못 받았으면 아무것도 그리지 않는다. 기본값으로 그려 두면 고르지 않은 것을 골랐다고 말하게 된다.
 * 다만 **실패는 감추지 않는다.** 덩어리가 통째로 사라지면 이런 설정이 있다는 것조차 알 수 없다.
 */
export function HomeHeroSetting() {
  const titleId = useId();
  const preferences = usePreferences();
  const budget = useBudget();
  const save = useSavePreferences();
  const [budgetOpen, setBudgetOpen] = useState(false);

  // 예산은 달마다 따로다. 이 화면에서 정하는 것은 언제나 이번 달이다.
  const thisMonth = useMemo(() => {
    const [year, month] = toLedgerDate(new Date()).slice(0, 7).split('-').map(Number);
    return { year, month };
  }, []);

  if (preferences.isError) {
    return (
      <div className="setting-fail">
        <span className="setting-fail__text">홈 표시 설정을 불러오지 못했어요</span>
        <RetryButton variant="ghost" onRetry={() => void preferences.refetch()} />
      </div>
    );
  }

  const hero = preferences.data?.home_hero;
  if (hero == null) return null;

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? '설정을 저장하지 못했어요.'
        : null;

  // 저장을 기다리는 동안 다른 것을 누르면 어느 값이 남을지 알 수 없다.
  const options = save.isPending
    ? OPTIONS.map((option) => ({ ...option, disabled: true }))
    : OPTIONS;

  // 폴백 규칙을 여기서 다시 짜지 않는다. 홈이 쓰는 그 함수를 그대로 부른다.
  //
  // **예산을 아직 모르는 것과 예산이 없는 것을 가른다.** 조회가 도는 중이거나 실패했을 때
  // `budget.data` 는 둘 다 undefined 라, 그대로 넘기면 예산을 정해 둔 사람에게
  // "아직 예산을 안 정해서" 라고 말한다. 그 문장은 홈 화면과 다른 말이고,
  // 실패로 굳으면 되돌아오지도 않는다.
  const amount = parseDecimal(budget.data?.budget.amount ?? null);
  const hasBudget = amount != null && amount > 0;
  const layout = resolveHeroLayout(hero, hasBudget);
  // 고른 것은 예산이 있어야 하는데 아직 없다. 그 자리에서 바로 열어 준다.
  const needsBudget = budget.isSuccess && wantsBudget(hero) && !hasBudget;
  /*
    예산이 없어 다른 것으로 떨어진 경우에는 **왜 그렇게 보이는지**까지 적는다.
    「차액이 먼저 보여요」 만 적으면, 남은 예산을 고른 사람은 자기가 잘못 골랐다고 읽는다.
  */
  const preview =
    needsBudget && layout === 'incomeAndSpent'
      ? '아직 예산을 안 정해서, 홈 맨 위에 이번 달 차액이 보여요.'
      : PREVIEW[layout];

  return (
    <section className="setting-block setting-block--card" aria-labelledby={titleId}>
      <h2 id={titleId} className="setting-block__title">
        홈 맨 위에 보여줄 것
      </h2>

      <SegmentedControl
        options={options}
        value={hero}
        ariaLabel="홈 표시 방식"
        onChange={(next) => save.mutate({ home_hero: next })}
      />

      {budget.isSuccess ? (
        <p className="setting-block__hint" data-testid={TEST_IDS.homeHeroPreview}>
          {preview}
        </p>
      ) : budget.isError ? (
        <p className="setting-block__hint">
          <span>예산 상태를 못 불러와서 홈에 어떻게 보일지 말할 수 없어요.</span>{' '}
          <RetryButton variant="ghost" onRetry={() => void budget.refetch()} />
        </p>
      ) : (
        <p className="setting-block__hint">홈에 어떻게 보일지 확인하는 중이에요.</p>
      )}

      {needsBudget ? (
        <Button
          className="setting-block__go"
          variant="outline"
          fullWidth
          data-testid={TEST_IDS.homeHeroBudget}
          onClick={() => setBudgetOpen(true)}
        >
          이번 달 예산 정하기
        </Button>
      ) : null}

      {/* 저장이 실패하면 고른 자리가 원래대로 돌아간다. 왜 돌아갔는지 여기서 말한다. */}
      {failure ? (
        <p className="setting-block__notice" role="alert">
          {failure}
        </p>
      ) : null}

      {/*
        관리 탭이 쓰는 그 시트를 그대로 쓴다. 같은 일을 하는 화면을 두 벌 만들면
        한쪽만 고쳐져, 같은 사람이 자리에 따라 다른 것을 본다.
      */}
      <BudgetAmountSheet
        open={budgetOpen}
        month={thisMonth}
        amount={amount}
        from="settings"
        onClose={() => setBudgetOpen(false)}
      />
    </section>
  );
}
