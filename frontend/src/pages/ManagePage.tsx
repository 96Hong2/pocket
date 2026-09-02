import { Link } from 'react-router';

import { ROUTES } from '../app/router/routes';

import { Placeholder } from './Placeholder';

/** 관리 탭. 하위 화면으로 들어가는 입구다. */
export default function ManagePage() {
  return (
    <div className="page">
      <h1 className="page__title">관리</h1>
      <p className="page__lead">예산과 분류를 손봐요</p>

      <Placeholder label="이번 달 예산">예산 금액과 카테고리 예산을 고친다.</Placeholder>

      <nav aria-label="관리 하위 화면">
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          <li>
            <Link to={ROUTES.categories}>카테고리 관리</Link>
          </li>
          <li>
            <Link to={ROUTES.assets}>자산</Link>
          </li>
          <li>
            <Link to={ROUTES.goal}>목표</Link>
          </li>
          <li>
            <Link to={ROUTES.settings}>앱 설정</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
