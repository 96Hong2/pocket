import { useState } from 'react';

import { usePreferences } from '../../shared/api';

import { MonthStartSheet } from './MonthStartSheet';

/**
 * 관리 탭 예산 자리의 「한 달 시작」 줄. 예산을 짜는 곳이라 이 설정의 첫 입구다.
 *
 * 아직 못 받았으면 그리지 않는다. 1일로 그려 두면 25일로 정한 사람에게 틀린 말을 한다.
 */
export function MonthStartSetting() {
  const preferences = usePreferences();
  const [open, setOpen] = useState(false);
  const day = preferences.data?.month_start_day;
  if (day == null) return null;

  return (
    <>
      <button
        type="button"
        className="budget-setting budget-setting--link"
        onClick={() => setOpen(true)}
      >
        <span className="budget-setting__text">한 달 시작</span>
        <span className="budget-setting__value">매달 {day}일</span>
      </button>
      <MonthStartSheet open={open} onClose={() => setOpen(false)} where="manage" />
    </>
  );
}
