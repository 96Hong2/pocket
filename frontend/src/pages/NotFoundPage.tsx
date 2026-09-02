import { Link } from 'react-router';

import { ROUTES } from '../app/router/routes';

/** 없는 경로. 딥링크가 어긋났을 때 하얗게 두지 않는다. */
export default function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page__title">없는 화면이에요</h1>
      <p className="page__lead">주소가 바뀌었을 수 있어요.</p>
      <Link to={ROUTES.home}>홈으로 가기</Link>
    </div>
  );
}
