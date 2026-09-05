import { Link } from 'react-router';

import { ROUTES } from '../../app/router/routes';
import { Card } from '../../shared/ui';

/**
 * 설정 화면에 놓는 개인정보 안내.
 *
 * 사진을 올리는 사람이 가장 먼저 묻는 것에 한 문단으로 답하고,
 * 더 볼 사람만 방침 화면으로 들어가게 한다.
 */
export function PrivacyNotice() {
  return (
    <section className="setting-block">
      <p className="setting-note">
        캡처 원본은 정리 직후 지워져요. 저장되는 것은 날짜, 상호, 금액, 분류뿐이에요.
      </p>

      <nav aria-label="설정 하위 화면">
        <Card padding="list">
          <ul className="link-rows">
            <li>
              <Link className="link-row" to={ROUTES.privacy}>
                개인정보처리방침
              </Link>
            </li>
          </ul>
        </Card>
      </nav>
    </section>
  );
}
