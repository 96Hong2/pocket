import { useId } from 'react';

import { usePreferences, useSavePreferences } from '../../shared/api';
import { Toggle } from '../../shared/ui';

/**
 * 다음 기간으로 예산을 이어 쓸지 정하는 한 줄.
 *
 * 달마다 다른 값이 아니라 계정 설정이라 달을 옮겨도 같은 값이다.
 * 아직 못 받았으면 아무것도 그리지 않는다. 기본값으로 그려 두면 꺼져 있는 것을 켜져 있다고 말하게 된다.
 */
export function CarryoverSetting() {
  const labelId = useId();
  const preferences = usePreferences();
  const save = useSavePreferences();

  const enabled = preferences.data?.budget_auto_carryover;
  if (enabled == null) return null;

  return (
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
  );
}
