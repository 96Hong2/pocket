import { useId } from 'react';

import {
  ApiError,
  parseDecimal,
  useBudget,
  usePreferences,
  useSavePreferences,
  type HomeHero,
} from '../../shared/api';
import { TEST_IDS } from '../../shared/testIds';
import { RetryButton, SegmentedControl, type SegmentedOption } from '../../shared/ui';

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
  const layout = resolveHeroLayout(hero, amount != null && amount > 0);

  return (
    <section className="setting-block" aria-labelledby={titleId}>
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
          {PREVIEW[layout]}
        </p>
      ) : budget.isError ? (
        <p className="setting-block__hint">
          <span>예산 상태를 못 불러와서 홈에 어떻게 보일지 말할 수 없어요.</span>{' '}
          <RetryButton variant="ghost" onRetry={() => void budget.refetch()} />
        </p>
      ) : (
        <p className="setting-block__hint">홈에 어떻게 보일지 확인하는 중이에요.</p>
      )}

      {/* 저장이 실패하면 고른 자리가 원래대로 돌아간다. 왜 돌아갔는지 여기서 말한다. */}
      {failure ? (
        <p className="setting-block__notice" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
