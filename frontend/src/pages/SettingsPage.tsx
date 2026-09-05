import { IdentityNotice } from '../app/IdentityNotice';
import { HomeHeroSetting, PrivacyNotice } from '../features/settings';

/** 앱 설정. */
export default function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page__title">앱 설정</h1>
      <p className="page__lead">홈에 무엇을 먼저 보여줄지 정해요</p>

      {/* 식별키를 못 받으면 설정 조회가 시작조차 안 한다. 이 안내가 없으면 빈 화면만 남는다. */}
      <IdentityNotice />

      <HomeHeroSetting />

      <PrivacyNotice />
    </div>
  );
}
