import { IdentityNotice } from '../app/IdentityNotice';
import { NotificationSettingCard } from '../features/notifications';

/** 알림 설정. 하루 한 번, 정한 시간에 기록을 떠올리게 한다. */
export default function NotificationSettingsPage() {
  return (
    <div className="page">
      <h1 className="page__title">알림 설정</h1>
      <p className="page__lead">알림은 하나뿐이에요. 언제 받을지만 정하면 돼요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 카드가 계속 비어 있다. */}
      <IdentityNotice />

      <NotificationSettingCard />
    </div>
  );
}
