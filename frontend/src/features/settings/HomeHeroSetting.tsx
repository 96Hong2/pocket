import { useId } from 'react';

import { ApiError, usePreferences, useSavePreferences, type HomeHero } from '../../shared/api';
import { RetryButton, SegmentedControl, type SegmentedOption } from '../../shared/ui';

const OPTIONS: SegmentedOption<HomeHero>[] = [
  { value: 'remaining_budget', label: '남은 예산' },
  { value: 'income_expense', label: '수입·지출' },
  { value: 'income_and_budget', label: '수입·예산' },
];

/** 고른 것이 홈을 어떻게 바꾸는지. 라벨 세 개만 보고는 결과가 그려지지 않는다. */
const PREVIEW: Record<HomeHero, string> = {
  remaining_budget: '홈 맨 위에 남은 예산이 먼저 보여요.',
  income_expense: '홈 맨 위에 이번 달 차액이 먼저 보여요.',
  income_and_budget: '홈 맨 위에 번 돈과 남은 예산이 함께 보여요.',
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

      <p className="setting-block__hint">{PREVIEW[hero]}</p>

      {/* 저장이 실패하면 고른 자리가 원래대로 돌아간다. 왜 돌아갔는지 여기서 말한다. */}
      {failure ? (
        <p className="setting-block__notice" role="alert">
          {failure}
        </p>
      ) : null}
    </section>
  );
}
