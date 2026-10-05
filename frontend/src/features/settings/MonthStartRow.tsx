import { useState } from 'react';

import { usePreferences } from '../../shared/api';
import { Card, CategoryAvatar } from '../../shared/ui';
import { MonthStartSheet } from '../budgets';

/**
 * 앱 설정의 「한 달 시작일」 줄. 관리 탭 예산 자리와 같은 시트를 연다.
 *
 * 아직 못 받았으면 그리지 않는다. 1일로 그려 두면 25일로 정한 사람에게 틀린 말을 한다.
 */
export function MonthStartRow() {
  const preferences = usePreferences();
  const [open, setOpen] = useState(false);
  const day = preferences.data?.month_start_day;
  if (day == null) return null;

  return (
    <section className="setting-block">
      <Card padding="list">
        <ul className="link-rows">
          <li>
            <button type="button" className="link-row link-row--hit" onClick={() => setOpen(true)}>
              <CategoryAvatar icon="58_calendar" size={48} />
              <span className="link-row__label">한 달 시작일</span>
              <span className="link-row__value">매달 {day}일</span>
            </button>
          </li>
        </ul>
      </Card>

      <MonthStartSheet open={open} onClose={() => setOpen(false)} where="settings" />
    </section>
  );
}
