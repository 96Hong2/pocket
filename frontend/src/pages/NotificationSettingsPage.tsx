import { Placeholder } from './Placeholder';

/** 알림 설정. P1 이라 화면 자리만 잡아 둔다. */
export default function NotificationSettingsPage() {
  return (
    <div className="page">
      <h1 className="page__title">알림 설정</h1>
      <p className="page__lead">P1 화면이에요. 지금은 자리만 잡아 뒀어요</p>

      <Placeholder label="알림 항목">받을 알림과 시각을 고른다.</Placeholder>
    </div>
  );
}
