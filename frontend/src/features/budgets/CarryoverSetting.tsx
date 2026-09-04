import { useId } from 'react';

import { ApiError, usePreferences, useSavePreferences } from '../../shared/api';
import { RetryButton, Toggle } from '../../shared/ui';

/**
 * 다음 기간으로 예산을 이어 쓸지 정하는 한 줄.
 *
 * 달마다 다른 값이 아니라 계정 설정이라 달을 옮겨도 같은 값이다.
 * 아직 못 받았으면 아무것도 그리지 않는다. 기본값으로 그려 두면 꺼져 있는 것을 켜져 있다고 말하게 된다.
 * 다만 **실패는 감추지 않는다.** 줄이 통째로 사라지면 그런 설정이 있다는 것조차 알 수 없다.
 */
export function CarryoverSetting() {
  const labelId = useId();
  const preferences = usePreferences();
  const save = useSavePreferences();

  if (preferences.isError) {
    return (
      <div className="budget-setting">
        <span className="budget-setting__text">이어쓰기 설정을 불러오지 못했어요</span>
        <RetryButton variant="ghost" onRetry={() => void preferences.refetch()} />
      </div>
    );
  }

  const enabled = preferences.data?.budget_auto_carryover;
  if (enabled == null) return null;

  const failure =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? '설정을 저장하지 못했어요.'
        : null;

  return (
    <>
      <div className="budget-setting">
        <span id={labelId} className="budget-setting__text">
          다음 달에도 이 예산을 이어서 쓸게요
        </span>
        <Toggle
          checked={enabled}
          disabled={save.isPending}
          ariaLabelledBy={labelId}
          onChange={(next) => save.mutate({ budget_auto_carryover: next })}
        />
      </div>

      {/* 저장이 실패하면 토글이 원래 자리로 돌아간다. 왜 돌아갔는지 여기서 말한다. */}
      {failure ? (
        <p className="budget__notice" role="alert">
          {failure}
        </p>
      ) : null}
    </>
  );
}
