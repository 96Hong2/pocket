import { useState } from 'react';

import { usePreferences } from '../../shared/api';
import { CategoryAvatar } from '../../shared/ui';

import { MonthStartSheet } from './MonthStartSheet';

/**
 * 관리 탭 하위 화면 목록 맨 위 「한 달 시작」 줄. 목록 안의 `<li>` 하나로 선다.
 *
 * 예산 자리 안에 있을 때는 예산 카드들 사이에 묻혀 설정인 줄 몰랐다. 목표 바로 위에 둔다(사용자 지시).
 * 아직 못 받았으면 그리지 않는다. 1일로 그려 두면 25일로 정한 사람에게 틀린 말을 한다.
 */
export function MonthStartSetting() {
  const preferences = usePreferences();
  const [open, setOpen] = useState(false);
  const day = preferences.data?.month_start_day;
  if (day == null) return null;

  return (
    <li>
      <button type="button" className="link-row" onClick={() => setOpen(true)}>
        <CategoryAvatar icon="58_calendar" size={44} />
        <span className="link-row__label">한 달 시작</span>
        <span className="link-row__value">매달 {day}일</span>
      </button>
      <MonthStartSheet open={open} onClose={() => setOpen(false)} where="manage" />
    </li>
  );
}
