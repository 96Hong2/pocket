import { IdentityNotice } from '../app/IdentityNotice';
import { AccountCard } from '../features/account';

/** 내 계정. 이메일로 기록을 지켜 두고, 연령대·성별을 (원하면) 적는다. */
export default function AccountPage() {
  return (
    <div className="page">
      <h1 className="page__title">내 계정</h1>
      <p className="page__lead">기기를 바꿔도 기록이 따라오게 해요</p>

      {/* 식별키를 못 받으면 조회가 시작조차 안 한다. 이 안내가 없으면 카드가 계속 비어 있다. */}
      <IdentityNotice />

      <AccountCard />
    </div>
  );
}
