import { IdentityNotice } from '../app/IdentityNotice';
import { AdSlot } from '../features/ads';
import { AddToHomeSetting } from '../features/home-add';
import { DataResetSetting, HomeHeroSetting, PrivacyNotice } from '../features/settings';

/** 앱 설정. */
export default function SettingsPage() {
  return (
    <div className="page">
      <h1 className="page__title">앱 설정</h1>
      <p className="page__lead">홈에 무엇을 먼저 보여줄지 정해요</p>

      {/* 식별키를 못 받으면 설정 조회가 시작조차 안 한다. 이 안내가 없으면 빈 화면만 남는다. */}
      <IdentityNotice />

      <HomeHeroSetting />

      <AddToHomeSetting />

      <PrivacyNotice adSlot={<AdSlot placement="settings" />} />

      {/*
        되돌릴 수 없는 자리라 화면 맨 끝, 회색 글자 한 줄이다.
        위쪽 설정을 만지다 손이 닿을 자리가 아니어야 하고, 카드로 서 있으면 설정으로 읽힌다.
      */}
      <DataResetSetting />
    </div>
  );
}
