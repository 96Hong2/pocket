import { useState } from 'react';

import { EVENTS, useAnalytics } from '../../shared/analytics';
import { Card, CategoryAvatar } from '../../shared/ui';

import { AddToHomeSheet } from './AddToHomeSheet';

/**
 * 앱 설정의 '휴대폰 홈 화면에 추가' 줄.
 *
 * 홈 카드는 한 번 뜨고 사라진다. 그때 안 한 사람이 나중에 마음이 바뀌면 찾아올 자리가
 * 있어야 한다. 다른 설정 줄과 같은 모양이라 목록에서 튀지 않는다.
 */
export function AddToHomeSetting() {
  const analytics = useAnalytics();
  const [open, setOpen] = useState(false);

  return (
    <section className="setting-block">
      <Card padding="list">
        <ul className="link-rows">
          <li>
            <button
              type="button"
              className="link-row link-row--hit"
              onClick={() => {
                analytics.log(
                  EVENTS.homeAddResult,
                  { from: 'settings', result: 'opened' },
                  { kind: 'click' },
                );
                setOpen(true);
              }}
            >
              <CategoryAvatar icon="57_smartphone" size={48} />
              <span className="link-row__label">휴대폰 홈 화면에 추가</span>
              <span className="link-row__value" aria-hidden="true">
                방법 보기
              </span>
            </button>
          </li>
        </ul>
      </Card>

      <AddToHomeSheet open={open} onClose={() => setOpen(false)} from="settings" />
    </section>
  );
}
