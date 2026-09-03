import { Link } from 'react-router';

import { ROUTES } from '../app/router/routes';

import { Placeholder } from './Placeholder';

/** 앱 설정. */
export default function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page__title">앱 설정</h1>
      <p className="page__lead">예산 기간과 알림을 정해요</p>

      <Placeholder label="예산 기간">
        기간은 달력 월로 고정이다. 자동 이어쓰기 켜기·끄기만 둔다.
      </Placeholder>

      <nav aria-label="설정 하위 화면">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <li>
            <Link to={ROUTES.notifications}>알림 설정</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
