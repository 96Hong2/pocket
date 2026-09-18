import { IdentityNotice } from '../app/IdentityNotice';
import { RecurringManageList } from '../features/recurring';

/**
 * 반복 지출.
 *
 * 구독·월세처럼 매달 같은 날 나가는 돈을 적어 두는 자리다. 여기 적어 두면 그 전날
 * 홈에서 한 번 묻고, 누르면 그 자리에서 기록이 된다.
 */
export default function RecurringPage() {
  return (
    <div className="page">
      <h1 className="page__title">반복 지출</h1>
      <p className="page__lead">매달 나가는 돈을 미리 적어 둬요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 목록이 계속 회색이다. */}
      <IdentityNotice />

      <RecurringManageList />
    </div>
  );
}
